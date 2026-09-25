import { useCallback, useMemo, useState } from 'react';
import {
  surveyMission, fencePolygon, fenceItems, fromLatLon, pointInPolygon, projectOnSegment, MAX_MISSION_ITEMS, USABLE_BATTERY_MIN,
  type SurveyPlan, type MissionAutopilot, type Pt, type ResumePoint, type FlightLine,
} from '../../survey/plan';
import type { useSurveyMission } from '../../hooks/useSurveyMission';
import type { useAircraftLink } from '../../link/useAircraftLink';
import { fenceParamCheck, rtlVsPlan, rtlAltM, FENCE_PARAMS, type ParamFix } from '../../link/paramChecks';

/**
 * Flying a survey on a real aircraft, in the order a crew does it:
 *
 *   1. Checks   the link's own gate (heartbeat, GPS, battery, radio) plus what a
 *               survey needs: a real site, the aircraft at it, a mission the
 *               autopilot can hold, legal height, wind and battery for the plan.
 *   2. Upload   geofence (site + margin, mission type 1, switched on), then the
 *               mission built for this autopilot. The dashboard registers what
 *               each item is for so the live view can follow the lines.
 *   3. Start    press and hold: arm and start the right way for the autopilot.
 *   4. Resume   after a battery return, a new mission from the point it stopped.
 */

export interface SurveyCheck { id: string; label: string; ok: boolean; detail: string; advisory?: boolean }
type Sim = ReturnType<typeof useSurveyMission>;
type Link = ReturnType<typeof useAircraftLink>;

const distToPolygon = (p: Pt, poly: Pt[]) => (pointInPolygon(p, poly) ? 0 : Math.min(...poly.map((a, i) => { const q = projectOnSegment(p, a, poly[(i + 1) % poly.length]); return Math.hypot(q.x - p.x, q.y - p.y); })));

export function useSurveyFlight(sim: Sim, link: Link, plan: SurveyPlan) {
  const site = sim.site;
  const ap: MissionAutopilot = link.autopilot === 'PX4' ? 'PX4' : 'ARDUPILOT';
  const [useFence, setUseFence] = useState(true);
  const fence = useMemo(() => fencePolygon(plan, site.boundary, site.home, 30), [plan, site]);
  const mission = useMemo(() => surveyMission(plan, site.origin, { autopilot: ap, home: site.home }), [plan, site, ap]);
  const key = `${JSON.stringify(plan.params)}|${site.origin.lat.toFixed(7)},${site.origin.lon.toFixed(7)}|${site.home.x.toFixed(0)},${site.home.y.toFixed(0)}|${site.boundary.length}|${ap}|${useFence}`;

  const [up, setUp] = useState<{ state: 'IDLE' | 'UPLOADING' | 'READY' | 'FAILED'; key: string; msg: string; fence: 'OFF' | 'ON' | 'UNCONFIRMED' | 'FAILED'; resume: ResumePoint | null; kind: 'NEW' | 'RESUME' | 'REFLY'; flown: boolean; fencePoly?: Pt[] }>({ state: 'IDLE', key: '', msg: '', fence: 'OFF', resume: null, kind: 'NEW', flown: false });
  const [start, setStart] = useState<{ state: 'IDLE' | 'STARTING' | 'FAILED'; msg: string[] }>({ state: 'IDLE', msg: [] });

  // ---- checks ----
  const t = link.telemetry;
  const here = t.lat ? fromLatLon(site.origin, t.lat, t.lon) : null;
  const away = here ? distToPolygon(here, site.boundary) : Infinity;
  const count = mission.items.length + (ap === 'PX4' ? 0 : 1);
  const minutes = plan.durationS / 60;
  const needPct = Math.min(100, Math.round(25 + (minutes / USABLE_BATTERY_MIN) * 75));
  const checks: SurveyCheck[] = [
    ...link.preflight.checks,
    { id: 'site', label: 'Survey site is your real boundary', ok: site.kind !== 'DEMO', detail: site.kind === 'DEMO' ? 'import or walk it (Site tab)' : site.kind === 'BENCH' ? 'demo shape · bench test' : site.name },
    { id: 'near', label: 'Aircraft at the site (within 500 m)', ok: away <= 500, detail: Number.isFinite(away) ? (away === 0 ? 'inside the boundary' : `${Math.round(away)} m away`) : 'no position' },
    { id: 'size', label: `Mission fits the autopilot (${MAX_MISSION_ITEMS} items)`, ok: count <= MAX_MISSION_ITEMS, detail: `${count} items` },
    { id: 'height', label: 'Height within 120 m (400 ft)', ok: plan.params.altitudeM <= 120, detail: `${plan.params.altitudeM} m` },
    { id: 'wind', label: 'Wind under 10 m/s', ok: t.windMps < 0 || t.windMps < 10, detail: t.windMps < 0 ? 'not reported' : `${t.windMps.toFixed(1)} m/s`, advisory: true },
    plan.batteries > 1
      ? { id: 'batt-plan', label: `${plan.batteries} batteries: returns to swap, then resumes`, ok: t.batteryPct < 0 || t.batteryPct >= 90, detail: t.batteryPct >= 0 ? `${t.batteryPct}% now; start on a full pack` : 'no %', advisory: true }
      : { id: 'batt-plan', label: `Battery covers the ${minutes.toFixed(0)}-min flight`, ok: t.batteryPct < 0 || t.batteryPct >= needPct, detail: t.batteryPct >= 0 ? `${t.batteryPct}% of ${needPct}% needed` : 'no %', advisory: true },
  ];
  // The autopilot's own fences, read from its parameters. ArduCopter's defaults (FENCE_TYPE 7: max altitude 100 m, a 300 m
  // circle round home, polygons; libraries/AC_Fence/AC_Fence.cpp) would stop a big or high survey part way, and PX4's
  // GF_MAX_HOR_DIST / GF_MAX_VER_DIST do the same when set. The circle is round the autopilot's home, so reach is
  // measured from where it reports home (the planned home until it does), to this plan's fence and the last one
  // uploaded (a re-fly's can reach a little past the plan's).
  const homePt = t.home ? fromLatLon(site.origin, t.home.lat, t.home.lon) : site.home;
  const reachM = Math.max(...[...fence, ...(up.fencePoly ?? [])].map(p => Math.hypot(p.x - homePt.x, p.y - homePt.y)));
  const rtl = rtlAltM(ap, link.params);
  // PX4's return climbs to RTL_RETURN_ALT before coming home, and its vertical limit applies then too; ArduCopter's return keeps under FENCE_ALT_MAX by itself.
  const topM = Math.max(plan.params.altitudeM, ap === 'PX4' && rtl !== null ? rtl : 0) + 10;
  const fenceCheck = link.live ? fenceParamCheck(ap, link.params, { reachM, altM: topM, polygon: useFence, swVersion: t.swVersion, homeAmslM: t.home?.altMslM }) : null;
  if (link.live) checks.push(rtlVsPlan(ap, link.params, plan.params.altitudeM));
  if (fenceCheck) { const { fixes: _f, ...c } = fenceCheck; checks.push(c); }
  const gateOk = link.live && checks.every(c => c.ok || c.advisory);

  // Pilot only (the link's setParam refuses anyone else): the smallest change that clears the fence check, then read back.
  const [fix, setFix] = useState<{ state: 'IDLE' | 'FIXING' | 'FAILED' | 'DONE'; msg: string }>({ state: 'IDLE', msg: '' });
  const fenceFixes: ParamFix[] = fenceCheck?.fixes ?? [];
  const fixFence = useCallback(async () => {
    setFix({ state: 'FIXING', msg: '' });
    const done: string[] = [];
    try {
      for (const f of fenceFixes) { const r = await link.setParam(f.name, f.value); done.push(`${r.name} ${r.value}`); }
      setFix({ state: 'DONE', msg: done.join(', ') });
    } catch (e) {
      setFix({ state: 'FAILED', msg: [e instanceof Error ? e.message : String(e), done.length ? `(set: ${done.join(', ')})` : ''].filter(Boolean).join(' ') });
    }
    // Read back what the check uses (not the names this firmware never answered: each would cost the full retry time).
    await link.readParams(FENCE_PARAMS[ap].filter(n => link.params[n] !== null));
  }, [fenceFixes, link, ap]);

  // ---- actions ----
  const upload = useCallback(async (from: ResumePoint | null = null, reflyLines: FlightLine[] | null = null) => {
    const kind = reflyLines ? 'REFLY' as const : from ? 'RESUME' as const : 'NEW' as const;
    const m = reflyLines ? surveyMission({ ...plan, lines: reflyLines }, site.origin, { autopilot: ap, home: site.home })
      : from ? surveyMission(plan, site.origin, { autopilot: ap, home: site.home, from }) : mission;
    // Re-fly passes can reach a little past the plan's own lead-ins: fence them in too.
    const fencePoly = reflyLines ? fencePolygon({ ...plan, lines: [...plan.lines, ...reflyLines] }, site.boundary, site.home, 30) : fence;
    setStart({ state: 'IDLE', msg: [] });
    setUp({ state: 'UPLOADING', key, msg: '', fence: 'OFF', resume: from, kind, flown: false, fencePoly });
    let fenceState: 'OFF' | 'ON' | 'UNCONFIRMED' | 'FAILED' = 'OFF';
    try {
      if (useFence) {
        try { fenceState = (await link.uploadFence(fenceItems(fencePoly, site.origin))).enabled ? 'ON' : 'UNCONFIRMED'; }
        catch { fenceState = 'FAILED'; }
      }
      await link.uploadMission(m.items, false);
      sim.setLiveMission(m.roles, link.missionSeqOffset, kind, reflyLines ?? undefined, from);
      setUp({ state: 'READY', key, msg: `${m.items.length} items on the aircraft`, fence: fenceState, resume: from, kind, flown: false, fencePoly });
    } catch (e) {
      setUp({ state: 'FAILED', key, msg: e instanceof Error ? e.message : String(e), fence: fenceState, resume: from, kind, flown: false, fencePoly });
    }
  }, [plan, site, ap, mission, key, useFence, fence, link, sim]);

  const begin = useCallback(async () => {
    setStart({ state: 'STARTING', msg: [] });
    let r: Awaited<ReturnType<Link['startMission']>>;
    try { r = await link.startMission(); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    setStart(r.ok ? { state: 'IDLE', msg: [] } : { state: 'FAILED', msg: [r.error ?? 'Start refused', ...(r.detail ?? [])] });
    // A mission that started has been used: after it lands the crew uploads the next one (fly again, resume or re-fly).
    if (r.ok) setUp(u => ({ ...u, flown: true }));
  }, [link]);

  const uploaded = up.state === 'READY' && up.key === key;
  /** Uploaded and not yet flown: ready for Start. Telemetry showing the mission flying counts too (a start can report a
   *  failure, say a late heartbeat, and still have started it): that mission is used, next comes a resume or re-fly. */
  const armable = uploaded && !up.flown && !sim.liveStarted;
  const onGround = !t.armed || t.altRelM < 1;
  return {
    checks, gateOk, fenceFixes, fixFence, fix, fence: useFence ? (up.kind === 'REFLY' && up.fencePoly) || fence : null, useFence, setUseFence, mission, count,
    upload: up, uploaded, armable, start, onGround,
    uploadMission: () => upload(null),
    /** The interrupted point, or the one last uploaded (a resume that has not flown yet can be sent again). */
    resumePoint: sim.liveResume ?? (up.kind === 'RESUME' && !up.flown && !sim.liveStarted ? up.resume : null),
    uploadResume: () => { const r = sim.liveResume ?? (up.kind === 'RESUME' && !up.flown && !sim.liveStarted ? up.resume : null); if (r) void upload(r); },
    uploadRefly: () => { const lines = sim.gapLines(); if (lines.length) void upload(null, lines); }, begin,
  };
}
