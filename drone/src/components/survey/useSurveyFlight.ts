import { useCallback, useMemo, useState } from 'react';
import {
  surveyMission, fencePolygon, fenceItems, fromLatLon, pointInPolygon, projectOnSegment, MAX_MISSION_ITEMS, USABLE_BATTERY_MIN,
  type SurveyPlan, type MissionAutopilot, type Pt, type ResumePoint, type FlightLine,
} from '../../survey/plan';
import type { useSurveyMission } from '../../hooks/useSurveyMission';
import type { useAircraftLink } from '../../link/useAircraftLink';
import { useSurveyComplianceChecks } from '../../compliance/useCompliance';

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
  // Part 107 paperwork for this pilot, aircraft and site (src/compliance/rules.ts surveyChecks).
  const complianceChecks = useSurveyComplianceChecks(site.name, plan.params.altitudeM, link.primarySysId || undefined);
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
    ...complianceChecks,
  ];
  // ArduPilot's fence enable switches on every type in FENCE_TYPE (Copter default 7: max altitude 100 m and a 300 m
  // circle round home, besides this polygon). The link reads no parameters, so this is the crew's check, with the plan's numbers.
  if (useFence && ap === 'ARDUPILOT') {
    const reachM = Math.ceil(Math.max(...fence.map(p => Math.hypot(p.x - site.home.x, p.y - site.home.y))) / 10) * 10;
    const altM = Math.ceil((plan.params.altitudeM + 10) / 10) * 10;
    checks.push({ id: 'fence-types', label: 'Autopilot fence: FENCE_TYPE 4 (polygon only), or circle and altitude big enough', ok: reachM <= 300 && altM <= 100,
      detail: `needs FENCE_RADIUS ≥ ${reachM} m, FENCE_ALT_MAX ≥ ${altM} m (defaults 300, 100)`, advisory: true });
  }
  const gateOk = link.live && checks.every(c => c.ok || c.advisory);

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
    checks, gateOk, fence: useFence ? (up.kind === 'REFLY' && up.fencePoly) || fence : null, useFence, setUseFence, mission, count,
    upload: up, uploaded, armable, start, onGround,
    uploadMission: () => upload(null),
    /** The interrupted point, or the one last uploaded (a resume that has not flown yet can be sent again). */
    resumePoint: sim.liveResume ?? (up.kind === 'RESUME' && !up.flown && !sim.liveStarted ? up.resume : null),
    uploadResume: () => { const r = sim.liveResume ?? (up.kind === 'RESUME' && !up.flown && !sim.liveStarted ? up.resume : null); if (r) void upload(r); },
    uploadRefly: () => { const lines = sim.gapLines(); if (lines.length) void upload(null, lines); }, begin,
  };
}
