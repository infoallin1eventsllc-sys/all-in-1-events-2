import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  planSurvey, gapFillLines, CoverageGrid, fromLatLon, projectOnSegment, polygonArea, CAMERAS,
  type SurveyParams, type SurveyPlan, type Leg, type Pt, type GeoOrigin, type ItemRole, type ResumePoint, type FlightLine,
} from '../survey/plan';
import { DEMO_SITE, type SurveySite } from '../survey/boundary';
import { modeName, type Telemetry } from '../link/mavlink';

/**
 * Site survey mission: one mapping aircraft flying a planned capture pattern.
 *
 * The aircraft follows the plan's legs, triggers the camera by distance on
 * capture legs (exactly what DO_SET_CAM_TRIGG_DIST makes a real autopilot do),
 * and every accepted photo adds its ground footprint to the coverage grid.
 * Gusts raise vibration and blur photos; a low battery flies home, swaps, and
 * resumes from where it left the line — the way real multi-battery surveys run.
 *
 * On a real link the aircraft's position comes from telemetry and the phase,
 * line and progress come from the mission item the autopilot is flying
 * (MISSION_CURRENT, mapped back onto the plan by the item roles the dashboard
 * registers after upload). Photos come from whatever the aircraft reports:
 * ArduPilot's CAMERA_FEEDBACK, PX4's CAMERA_TRIGGER or a MAVLink camera's
 * CAMERA_IMAGE_CAPTURED; with none of those they are estimated by distance
 * flown while the camera trigger is on, and marked as estimated.
 */

export type Phase = 'READY' | 'TAKEOFF' | 'TRANSIT' | 'CAPTURING' | 'PAUSED' | 'RETURNING' | 'LANDING' | 'SWAP' | 'HELD' | 'COMPLETE';

export interface SurveyAircraft {
  x: number; y: number; altM: number; headingDeg: number; speedMps: number;
  battery: number; voltageV: number; currentA: number; tempC: number;
  /** RMS vibration from the accelerometer, g. Above 0.6 g photos start to blur. */
  vibrationG: number;
  windMps: number;
  signalPct: number;
  history: { vibration: number[]; wind: number[]; speed: number[] };
}

export interface Photo { id: number; x: number; y: number; altM: number; headingDeg: number; pitchDeg: number; t: number; line: number; ok: boolean; reason?: 'Blur' | 'Exposure' | 'Capture failed'; /** Position estimated (no photo report from the aircraft); use the image's own EXIF. */ est?: boolean; /** Image index the aircraft reported (names the file in the export). */ idx?: number }

/** Live telemetry the survey reads (a subset of the link's). */
export type LiveTelemetry = Pick<Telemetry, 'lat' | 'lon' | 'altRelM' | 'headingDeg' | 'groundspeedMps' | 'batteryPct' | 'voltageV' | 'currentA' | 'armed' | 'customMode' | 'autopilot' | 'radioRssi' | 'photoLog' | 'photoSource' | 'missionCurrent' | 'home' | 'windMps'>;

export interface SurveyEvent { id: string; ts: string; severity: 'INFO' | 'WARNING' | 'SUCCESS' | 'CRITICAL'; text: string }

export const DEFAULT_PARAMS: SurveyParams = {
  pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E',
  orbit: { center: DEMO_SITE.orbitCenter, radiusM: 45 },
};

const SITE_KEY = 'a1-survey-site';
function savedSite(): SurveySite | null {
  try { const j = JSON.parse(localStorage.getItem(SITE_KEY) ?? 'null'); return j && Array.isArray(j.boundary) && j.boundary.length >= 3 ? j : null; } catch { return null; }
}
/** Coverage cells: 5 m, coarser on very large sites so the grid stays small. */
const cellFor = (boundary: Pt[]) => Math.max(5, Math.ceil(Math.sqrt(polygonArea(boundary)) / 200));

const RESERVE_PCT = 27;
const SWAP_S = 45;
const HIST = 40;
const CLIMB = 5, DESCEND = 3;

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

function freshAircraft(home: Pt): SurveyAircraft {
  return {
    x: home.x, y: home.y, altM: 0, headingDeg: 90, speedMps: 0,
    battery: 100, voltageV: 17.2, currentA: 0.6, tempC: 29, vibrationG: 0.02, windMps: 5.2, signalPct: 99,
    history: { vibration: Array(HIST).fill(0.02), wind: Array.from({ length: HIST }, () => 5 + Math.random()), speed: Array(HIST).fill(0) },
  };
}

export function useSurveyMission() {
  const [site, setSiteState] = useState<SurveySite>(() => savedSite() ?? DEMO_SITE);
  const siteRef = useRef(site); siteRef.current = site;
  const [params, setParamsState] = useState<SurveyParams>(() => ({ ...DEFAULT_PARAMS, orbit: { ...DEFAULT_PARAMS.orbit, center: site.orbitCenter } }));
  const plan = useMemo(() => planSurvey(site.boundary, site.home, params), [site, params]);

  // ---- mutable flight state (the 10 Hz loop works on refs, React gets snapshots) ----
  const planRef = useRef<SurveyPlan>(plan);
  const gridRef = useRef(new CoverageGrid(site.boundary, cellFor(site.boundary)));
  const legsRef = useRef<Leg[]>(plan.legs);
  const legRef = useRef({ index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false });
  const acRef = useRef<SurveyAircraft>(freshAircraft(site.home));
  const phaseRef = useRef<Phase>('READY');
  const pausedFrom = useRef<Phase>('CAPTURING');
  const photosRef = useRef<Photo[]>([]);
  const resumeRef = useRef<{ index: number; progressM: number; at: Pt } | null>(null);
  const detourRef = useRef<Pt | null>(null);
  const swapLeft = useRef(0);
  const gustLeft = useRef(0);
  const flightS = useRef(0);
  const batteries = useRef(1);
  const refly = useRef(false);
  const liveRef = useRef<{ lastPos: Pt | null; since: number; reported: number; lastMs: number } | null>(null);
  /** The mission on the aircraft: what each item is for, and where MISSION_CURRENT's numbering starts. */
  const liveMission = useRef<{ roles: ItemRole[]; seqOffset: number; kind: 'NEW' | 'RESUME' | 'REFLY'; lines: FlightLine[]; lastLine: number; lastAt: Pt | null; finished: boolean; started: boolean } | null>(null);
  const [liveResume, setLiveResume] = useState<ResumePoint | null>(null);

  const [phase, setPhase] = useState<Phase>('READY');
  const [snap, setSnap] = useState(() => ({ ac: acRef.current, photos: 0, rejected: 0, version: 0, legIndex: 0, flightS: 0, batteries: 1 }));
  const [events, setEvents] = useState<SurveyEvent[]>([]);
  const [simSpeed, setSimSpeed] = useState(4);
  const simSpeedRef = useRef(simSpeed); simSpeedRef.current = simSpeed;

  const log = useCallback((severity: SurveyEvent['severity'], text: string) => {
    setEvents(prev => [{ id: `SV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, ts: new Date().toLocaleTimeString([], { hour12: false }), severity, text }, ...prev].slice(0, 80));
  }, []);
  const go = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p); }, []);

  // A new plan while on the ground replaces the flight and clears the coverage.
  useEffect(() => {
    if (phaseRef.current !== 'READY' && phaseRef.current !== 'COMPLETE') return;
    planRef.current = plan;
    legsRef.current = plan.legs;
    legRef.current = { index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false };
  }, [plan]);

  /** Plan changes only before a flight; a finished survey is cleared explicitly with reset(). */
  const setParams = useCallback((next: Partial<SurveyParams>) => {
    if (phaseRef.current !== 'READY') return;
    setParamsState(p => (Object.entries(next).every(([k, v]) => JSON.stringify(p[k as keyof SurveyParams]) === JSON.stringify(v)) ? p : { ...p, ...next }));
  }, []);

  // ---- operator actions ----------------------------------------------------
  const start = useCallback(() => {
    const ph = phaseRef.current;
    if (ph === 'READY' || ph === 'COMPLETE') {
      if (ph === 'COMPLETE') { gridRef.current.reset(); photosRef.current = []; }
      planRef.current = plan; legsRef.current = plan.legs; refly.current = false;
      legRef.current = { index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false };
      acRef.current = freshAircraft(siteRef.current.home);
      flightS.current = 0; batteries.current = 1; resumeRef.current = null; detourRef.current = null;
      go('TAKEOFF');
      const p = plan;
      log('INFO', `Survey started: ${p.lines.length} ${p.params.pattern === 'ORBIT' ? 'orbit segments' : 'lines'}, ~${p.photosEst} photos at ${p.gsdCm.toFixed(1)} cm/px`);
    } else if (ph === 'HELD') {
      if (acRef.current.battery < 50) { acRef.current = { ...acRef.current, battery: 100 }; batteries.current++; log('INFO', 'Fresh battery fitted before resuming'); }
      detourRef.current = resumeRef.current?.at ?? null;
      go('TAKEOFF'); log('INFO', 'Resuming survey from where it stopped');
    }
  }, [plan, go, log]);

  const pause = useCallback(() => {
    const ph = phaseRef.current;
    if (ph === 'CAPTURING' || ph === 'TRANSIT') { pausedFrom.current = ph; go('PAUSED'); log('WARNING', 'Paused — aircraft holding position'); }
    else if (ph === 'PAUSED') { go(pausedFrom.current); log('INFO', 'Resumed'); }
  }, [go, log]);

  /** Fly home now; the survey can be resumed from the same point. */
  const returnHome = useCallback((reason = 'Return home commanded by the operator') => {
    const ph = phaseRef.current;
    if (ph === 'READY' || ph === 'COMPLETE' || ph === 'HELD' || ph === 'SWAP' || ph === 'LANDING' || ph === 'RETURNING') return;
    const L = legRef.current;
    resumeRef.current ??= { index: L.index, progressM: L.progressM, at: { x: acRef.current.x, y: acRef.current.y } }; // mid-detour, the earlier point stands
    go('RETURNING'); log('WARNING', reason);
  }, [go, log]);

  /** Short extra capture lines over every weak patch, flown on the current battery. */
  const reflyGaps = useCallback(() => {
    if (phaseRef.current !== 'COMPLETE' || planRef.current.params.pattern === 'ORBIT') return 0;
    const fill = gapFillLines(gridRef.current, planRef.current, siteRef.current.boundary);
    if (!fill.length) { log('SUCCESS', 'No weak patches — coverage is good everywhere'); return 0; }
    const home = siteRef.current.home;
    const legs: Leg[] = []; let at = home;
    fill.forEach((l, i) => { legs.push({ a: at, b: l.a, capture: false, line: 1000 + i }, { a: l.a, b: l.b, capture: true, line: 1000 + i }); at = l.b; });
    legs.push({ a: at, b: home, capture: false, line: -1 });
    legsRef.current = legs; refly.current = true;
    legRef.current = { index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false };
    if (acRef.current.battery < 50) { acRef.current = { ...acRef.current, battery: 100 }; batteries.current++; }
    go('TAKEOFF'); log('INFO', `Re-flying the weak patches: ${fill.length} pass${fill.length > 1 ? 'es' : ''}`);
    return fill.length;
  }, [go, log]);

  const reset = useCallback(() => {
    gridRef.current.reset(); photosRef.current = []; acRef.current = freshAircraft(siteRef.current.home);
    liveMission.current = null; setLiveResume(null);
    legsRef.current = plan.legs; legRef.current = { index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false };
    resumeRef.current = null; detourRef.current = null; flightS.current = 0; batteries.current = 1;
    go('READY'); log('INFO', 'Survey cleared');
  }, [plan, go, log]);

  // ---- photos ----------------------------------------------------------------
  const takePhoto = useCallback((headingRad: number, line: number, sim: boolean, report?: { idx: number; failed: boolean }) => {
    const ac = acRef.current, P = planRef.current;
    const vib = ac.vibrationG, wind = ac.windMps;
    // A capture the camera reports as failed took no image: it covers nothing.
    let ok = !report?.failed, reason: Photo['reason'] = ok ? undefined : 'Capture failed';
    if (sim) {
      const pBlur = 0.003 + Math.max(0, vib - 0.6) * 0.7 + Math.max(0, wind - 9) * 0.03;
      if (Math.random() < pBlur) { ok = false; reason = 'Blur'; } else if (Math.random() < 0.003) { ok = false; reason = 'Exposure'; }
    }
    const photo: Photo = { id: photosRef.current.length + 1, x: ac.x, y: ac.y, altM: ac.altM, headingDeg: (headingRad * 180) / Math.PI, pitchDeg: P.gimbalPitchDeg, t: Date.now(), line, ok, reason, ...(report ? { idx: report.idx } : {}) };
    photosRef.current.push(photo);
    if (!ok) return;
    const scale = Math.max(0.3, ac.altM / P.params.altitudeM);
    let across = P.footprint.acrossM * scale, along = P.footprint.alongM * scale;
    let cx = ac.x, cy = ac.y;
    if (P.params.pattern === 'ORBIT') {
      // Camera locked on the structure: the footprint sits on it, enlarged by the slant range.
      const c = P.params.orbit.center; const slant = Math.hypot(P.params.orbit.radiusM, ac.altM) / Math.max(1, ac.altM);
      cx = c.x; cy = c.y; across *= slant * 0.8; along *= slant * 0.8;
    } else if (P.gimbalPitchDeg > -85) {
      // Oblique: the image centre lands ahead of the aircraft and stretches.
      const off = ac.altM * Math.tan(((90 + P.gimbalPitchDeg) * Math.PI) / 180);
      cx += Math.cos(headingRad) * off; cy += Math.sin(headingRad) * off; along *= 1.22;
    }
    gridRef.current.addFootprint({ x: cx, y: cy }, headingRad, across, along);
  }, []);

  // ---- sites ------------------------------------------------------------------
  /** Survey a different site. Only on the ground: clears the capture and re-plans. */
  const setSite = useCallback((next: SurveySite) => {
    const ph = phaseRef.current;
    if (ph !== 'READY' && ph !== 'COMPLETE' && ph !== 'HELD') return false;
    siteRef.current = next; setSiteState(next);
    gridRef.current = new CoverageGrid(next.boundary, cellFor(next.boundary));
    photosRef.current = []; acRef.current = freshAircraft(next.home);
    liveMission.current = null; setLiveResume(null); resumeRef.current = null;
    setParamsState(p => ({ ...p, orbit: { ...p.orbit, center: next.orbitCenter } }));
    try { if (next.kind === 'IMPORTED' || next.kind === 'WALKED') localStorage.setItem(SITE_KEY, JSON.stringify(next)); else localStorage.removeItem(SITE_KEY); } catch { /* storage unavailable */ }
    go('READY'); log('INFO', `Site: ${next.name}`);
    return true;
  }, [go, log]);

  // ---- real aircraft --------------------------------------------------------
  /**
   * After a mission upload the dashboard registers what each item is for, so
   * MISSION_CURRENT reads as "capturing line 4" rather than "item 17".
   */
  const setLiveMission = useCallback((roles: ItemRole[], seqOffset: number, kind: 'NEW' | 'RESUME' | 'REFLY' = 'NEW', lines?: FlightLine[], from?: ResumePoint | null) => {
    // A resume starts at its point, so one cut short before its first line resumes from there again.
    liveMission.current = { roles, seqOffset, kind, lines: lines ?? planRef.current.lines, lastLine: from?.line ?? -1, lastAt: from?.at ?? null, finished: false, started: false };
    refly.current = kind === 'REFLY';
    // The resume point outlives the upload (a re-upload needs it); the mission starting spends it.
    if (kind === 'NEW') { setLiveResume(null); gridRef.current.reset(); photosRef.current = []; flightS.current = 0; batteries.current = 1; }
    log('INFO', kind === 'RESUME' ? 'Resume mission on the aircraft' : kind === 'REFLY' ? `Weak-patch mission on the aircraft: ${lines?.length ?? 0} passes` : `Mission on the aircraft: ${roles.length} items`);
  }, [log]);
  /** Extra passes over the weak patches of a finished capture (for a live re-fly mission). */
  const gapLines = useCallback(() => gapFillLines(gridRef.current, planRef.current, siteRef.current.boundary), []);

  /** Legs of the plan by line, so the map and 3D view can show a live flight's progress. */
  const legOfLine = useMemo(() => {
    const capture = new Map<number, number>(), transit = new Map<number, number>();
    plan.legs.forEach((g, i) => { if (g.line < 0) return; (g.capture ? capture : transit).set(g.line, i); });
    return { capture, transit };
  }, [plan]);

  /** Replace the simulated aircraft with telemetry, in the site's own coordinates. */
  const applyLive = useCallback((t: LiveTelemetry) => {
    if (!t.lat) return;
    const S = siteRef.current, now = Date.now();
    if (!liveRef.current) liveRef.current = { lastPos: null, since: 0, reported: t.photoLog.length ? t.photoLog[t.photoLog.length - 1].n : 0, lastMs: now };
    const L = liveRef.current;
    const dtS = Math.min(1, (now - L.lastMs) / 1000); L.lastMs = now;
    // Home: the autopilot's own home point once it reports one. Moving it re-plans (on the ground only).
    const homeLL = t.home ?? (!t.armed ? { lat: t.lat, lon: t.lon } : null);
    if (homeLL && S.kind !== 'DEMO' && phaseRef.current === 'READY') {
      const h = fromLatLon(S.origin, homeLL.lat, homeLL.lon);
      if (dist(h, S.home) > 1) { const next = { ...S, home: h }; siteRef.current = next; setSiteState(next); }
    }
    const p = fromLatLon(S.origin, t.lat, t.lon);
    const ac = acRef.current;
    acRef.current = {
      ...ac, x: p.x, y: p.y, altM: Math.max(0, t.altRelM), headingDeg: t.headingDeg, speedMps: t.groundspeedMps,
      battery: t.batteryPct >= 0 ? t.batteryPct : ac.battery, voltageV: t.voltageV || ac.voltageV, currentA: t.currentA || ac.currentA,
      windMps: t.windMps >= 0 ? t.windMps : ac.windMps,
      signalPct: t.radioRssi ? Math.round((t.radioRssi / 254) * 100) : ac.signalPct,
    };
    if (t.armed && t.altRelM > 0.2) flightS.current += dtS;
    const hRad = ((t.headingDeg - 90) * Math.PI) / 180;
    const P = planRef.current;

    // ---- phase and progress from the mission item being flown ----
    const M = liveMission.current;
    const mode = modeName(t);
    const idx = M ? t.missionCurrent - M.seqOffset : -1;
    const role = M && idx >= 0 && idx < M.roles.length ? M.roles[idx] : null;
    const wasFlying = !['READY', 'COMPLETE', 'HELD'].includes(phaseRef.current);
    if (M && t.armed && mode === 'AUTO' && role) {
      // Flying the mission: an old resume point is spent (a new interruption records a fresh one).
      if (!M.started) { M.started = true; if (M.kind !== 'NEW') batteries.current++; }
      if (liveResume) setLiveResume(null);
    }
    // Past the last line's end the survey is flown, whatever mode takes it home (PX4 flies a mission RTL item in its RTL mode).
    if (M?.started && t.armed && !M.finished && idx > M.roles.map(r => r.kind).lastIndexOf('LINE_END')) { M.finished = true; if (liveResume) setLiveResume(null); }
    const interrupted = () => {
      // Left the mission before its end (battery failsafe, RTL, a landing): remember where, to resume from there.
      if (M?.started && !M.finished && M.lastLine >= 0 && !liveResume) {
        if (M.kind === 'REFLY') return; // a short re-fly is simply flown again
        const r = { line: M.lastLine, at: M.lastAt ?? M.lines[M.lastLine].a };
        setLiveResume(r); log('WARNING', `Survey interrupted on line ${r.line + 1}; it can resume from that point`);
      }
    };
    let ph: Phase = phaseRef.current;
    if (!t.armed) {
      // A resume or re-fly stays pending until it flies: READY would re-track home, re-plan and offer a NEW upload that
      // wipes the capture. An unfinished re-fly lands back in COMPLETE, to be flown again.
      ph = M?.finished || M?.kind === 'REFLY' ? 'COMPLETE' : liveResume || M?.kind === 'RESUME' || (M && M.lastLine >= 0) || wasFlying ? 'HELD' : 'READY';
      if (ph === 'HELD') interrupted();
    } else if (mode === 'AUTO' && role) {
      if (role.kind === 'TAKEOFF' || (role.kind === 'SETUP' && idx < 4)) ph = 'TAKEOFF';
      else if (role.kind === 'LINE_START') { ph = 'TRANSIT'; M!.lastLine = role.line; M!.lastAt = M!.lines[role.line]?.a ?? null; }
      else if (role.kind === 'LINE_END' || role.kind === 'TRIGGER_ON') {
        ph = 'CAPTURING'; M!.lastLine = role.line;
        const l = M!.lines[role.line]; if (l) M!.lastAt = projectOnSegment(p, l.a, l.b);
      } else if (role.kind === 'RTL') ph = 'RETURNING';
      else ph = 'TRANSIT';
    } else if (mode === 'RTL' || mode === 'LAND') {
      ph = mode === 'LAND' || dist(p, S.home) < 5 ? 'LANDING' : 'RETURNING';
      interrupted();
    } else if (mode === 'TAKEOFF') ph = 'TAKEOFF';
    // A hold only counts as a pause when it interrupts the mission in the air (Guided is also how ArduPilot arms for a start).
    else if ((mode === 'LOITER' || mode === 'POSITION' || mode === 'GUIDED') && t.altRelM > 2 && ['TRANSIT', 'CAPTURING', 'PAUSED'].includes(phaseRef.current)) ph = 'PAUSED';
    if (ph !== phaseRef.current) {
      go(ph);
      const say: Partial<Record<Phase, string>> = { TAKEOFF: 'Taking off', RETURNING: 'Returning home', LANDING: 'Landing', PAUSED: 'Holding position', COMPLETE: 'Survey complete: landed', HELD: 'Landed with the survey unfinished' };
      if (ph === 'CAPTURING' && M) log('INFO', M.kind === 'REFLY' ? `Re-fly pass ${M.lastLine + 1} of ${M.lines.length}` : P.params.pattern === 'ORBIT' ? 'Orbit: capturing' : `Line ${M.lastLine + 1} of ${P.lines.length}`);
      else if (ph === 'COMPLETE' && M?.kind === 'REFLY' && !M.finished) log('WARNING', 'Landed with the re-fly unfinished; re-fly the weak patches again');
      else if (say[ph]) log(ph === 'COMPLETE' ? 'SUCCESS' : ph === 'RETURNING' && !M?.finished ? 'WARNING' : 'INFO', say[ph]!);
    }
    // Where on the plan: drives the flown/remaining path on the map and the 3D view.
    if (role && role.line >= 0 && M?.kind !== 'REFLY') {
      const ci = legOfLine.capture.get(role.line), ti = legOfLine.transit.get(role.line);
      const onLine = role.kind === 'LINE_END' || role.kind === 'TRIGGER_ON' || role.kind === 'TRIGGER_OFF';
      const li = onLine ? ci : ti ?? ci;
      if (li !== undefined) { const g = P.legs[li]; legRef.current = { ...legRef.current, index: li, progressM: onLine ? dist(g.a, projectOnSegment(p, g.a, g.b)) : 0, onCapture: onLine }; }
    } else if (role?.kind === 'RTL') legRef.current = { ...legRef.current, index: P.legs.length - 1, progressM: 0, onCapture: false };

    // ---- photos ----
    const fresh = t.photoLog.filter(ph => ph.n > L.reported);
    if (fresh.length) {
      for (const f of fresh) {
        const at = fromLatLon(S.origin, f.lat, f.lon);
        const save = acRef.current; acRef.current = { ...save, x: at.x, y: at.y, altM: f.altRelM || save.altM };
        takePhoto(hRad, M?.lastLine ?? -1, false, { idx: f.idx, failed: !f.ok });
        acRef.current = save;
      }
      L.reported = fresh[fresh.length - 1].n;
    } else if (t.photoSource === 'NONE' && mode === 'AUTO' && (role?.kind === 'LINE_END' || role?.kind === 'TRIGGER_ON') && L.lastPos) {
      // Nothing reports photos on this aircraft: estimate them by distance flown with the trigger on: on a line, in Auto
      // (SmartRTL or Brake leave the phase as it was, and the way home takes no photos).
      L.since += dist(L.lastPos, p);
      if (L.since >= P.triggerM) { L.since = 0; takePhoto(hRad, M?.lastLine ?? -1, false); photosRef.current[photosRef.current.length - 1].est = true; }
    }
    L.lastPos = p;
  }, [takePhoto, go, log, legOfLine, liveResume]);
  const releaseLive = useCallback(() => { liveRef.current = null; }, []);
  const origin: GeoOrigin = site.origin;

  // ---- the 10 Hz loop -------------------------------------------------------
  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      const live = !!liveRef.current;
      const k = live ? 1 : simSpeedRef.current;
      const dt = 0.1 * k;
      const ph = phaseRef.current;
      const P = planRef.current;
      let ac = acRef.current;
      const flying = ph !== 'READY' && ph !== 'COMPLETE' && ph !== 'HELD' && ph !== 'SWAP';

      if (!live) {
        ac = { ...ac };
        // Weather: a steady breeze with the occasional gust.
        // ~one gust every three minutes of flight (the rate is per simulated second, whatever the speed-up).
        if (flying && gustLeft.current <= 0 && Math.random() < 0.0005 * k) {
          gustLeft.current = 15 + Math.random() * 10;
          log('WARNING', `Gust to ${(ac.windMps + 7).toFixed(0)} m/s — photos on this stretch may blur`);
        }
        const gust = gustLeft.current > 0;
        if (gust) gustLeft.current -= dt;
        const targetWind = 5 + Math.sin(Date.now() / 20000) * 1.2 + (gust ? 7 : 0);
        ac.windMps += (targetWind - ac.windMps) * Math.min(1, 0.08 * k) + (Math.random() - 0.5) * 0.2;

        const moveAlong = (to: Pt, speed: number): boolean => {
          const d = dist(ac, to); const step = speed * dt;
          if (d > 0.5) { const h = Math.atan2(to.y - ac.y, to.x - ac.x); ac.x += Math.cos(h) * Math.min(step, d); ac.y += Math.sin(h) * Math.min(step, d); turnTo(h); }
          return d <= step + 0.5;
        };
        const turnTo = (h: number) => {
          const want = (h * 180) / Math.PI + 90;
          const diff = ((want - ac.headingDeg + 540) % 360) - 180;
          ac.headingDeg = (ac.headingDeg + diff * Math.min(1, 0.25 * k) + 360) % 360;
        };
        // Battery reserve: go home, swap, resume. On the leg home there is nothing left to resume: just land.
        const reserve = () => {
          const L = legRef.current;
          if (!detourRef.current && legsRef.current[L.index]?.line === -1) {
            if (phaseRef.current === 'PAUSED') { go('RETURNING'); log('WARNING', `Battery ${ac.battery.toFixed(0)}% — flying home`); }
            return;
          }
          // Still flying back to an earlier resume point: that point stands.
          resumeRef.current ??= { index: L.index, progressM: L.progressM, at: { x: ac.x, y: ac.y } };
          go('RETURNING'); log('WARNING', `Battery ${ac.battery.toFixed(0)}% — returning to swap, will resume from this point`);
        };

        if (ph === 'TAKEOFF') {
          ac.speedMps = 0; ac.altM = Math.min(P.params.altitudeM, ac.altM + CLIMB * dt);
          if (ac.altM >= P.params.altitudeM - 0.1) {
            if (detourRef.current) { go('TRANSIT'); } else { const leg = legsRef.current[legRef.current.index]; go(leg?.capture ? 'CAPTURING' : 'TRANSIT'); }
            if (!resumeRef.current && !refly.current && legRef.current.index === 0) log('INFO', `At ${P.params.altitudeM} m, heading to line 1`);
          }
        } else if (ph === 'TRANSIT' || ph === 'CAPTURING') {
          ac.speedMps += (P.speedMps - ac.speedMps) * Math.min(1, 0.3 * k);
          if (detourRef.current) {
            // Flying back to where a battery return interrupted the plan.
            if (moveAlong(detourRef.current, ac.speedMps)) {
              detourRef.current = null;
              if (resumeRef.current) { legRef.current = { ...legRef.current, index: resumeRef.current.index, progressM: resumeRef.current.progressM, onCapture: false }; resumeRef.current = null; }
              log('INFO', 'Back on the line — capture resumed');
            }
          } else {
            let remaining = ac.speedMps * dt;
            const L = legRef.current;
            while (remaining > 0 && L.index < legsRef.current.length) {
              const leg = legsRef.current[L.index];
              const len = dist(leg.a, leg.b);
              const h = Math.atan2(leg.b.y - leg.a.y, leg.b.x - leg.a.x);
              if (leg.capture && !L.onCapture) {
                L.onCapture = true; L.sinceTriggerM = 0;
                if (phaseRef.current !== 'CAPTURING') go('CAPTURING');
                const prev = legsRef.current[L.index - 1];
                if (!prev?.capture || L.progressM === 0) { takePhoto(h, leg.line, true); }
                if (leg.line < 1000 && !prev?.capture && L.progressM === 0 && P.params.pattern !== 'ORBIT') log('INFO', `Line ${leg.line + 1} of ${P.lines.length}`);
              }
              const step = Math.min(remaining, len - L.progressM);
              L.progressM += step; remaining -= step;
              if (leg.capture) {
                L.sinceTriggerM += step;
                while (L.sinceTriggerM >= P.triggerM) { L.sinceTriggerM -= P.triggerM; ac.x = leg.a.x + Math.cos(h) * (L.progressM - L.sinceTriggerM); ac.y = leg.a.y + Math.sin(h) * (L.progressM - L.sinceTriggerM); takePhoto(h, leg.line, true); }
              }
              ac.x = leg.a.x + Math.cos(h) * L.progressM; ac.y = leg.a.y + Math.sin(h) * L.progressM;
              turnTo(h);
              if (L.progressM >= len - 1e-6) {
                const next = legsRef.current[L.index + 1];
                L.index++; L.progressM = 0;
                if (!next?.capture) { L.onCapture = false; if (next && phaseRef.current !== 'TRANSIT') go('TRANSIT'); }
              }
            }
            if (L.index >= legsRef.current.length) { go('LANDING'); log('SUCCESS', refly.current ? 'Weak patches re-flown — landing' : 'All lines captured — landing'); }
          }
          if (ac.battery <= RESERVE_PCT && phaseRef.current !== 'LANDING') reserve();
        } else if (ph === 'RETURNING') {
          ac.speedMps += (12 - ac.speedMps) * Math.min(1, 0.3 * k);
          if (moveAlong(siteRef.current.home, ac.speedMps)) go('LANDING');
        } else if (ph === 'LANDING') {
          ac.speedMps = 0; ac.altM = Math.max(0, ac.altM - DESCEND * dt);
          if (ac.altM <= 0) {
            if (resumeRef.current) {
              if (ac.battery <= RESERVE_PCT + 3) { go('SWAP'); swapLeft.current = SWAP_S; log('INFO', 'Landed — swapping battery'); }
              else { go('HELD'); log('INFO', 'Landed — survey held, press Resume to continue'); }
            } else { go('COMPLETE'); const pc = photosRef.current; log('SUCCESS', `Capture complete: ${pc.filter(p => p.ok).length} photos, ${pc.filter(p => !p.ok).length} rejected`); }
          }
        } else if (ph === 'SWAP') {
          swapLeft.current -= dt;
          if (swapLeft.current <= 0) { ac.battery = 100; batteries.current++; detourRef.current = resumeRef.current?.at ?? null; go('TAKEOFF'); log('INFO', `Battery ${batteries.current} fitted — taking off to resume`); }
        } else if (ph === 'PAUSED') {
          ac.speedMps = Math.max(0, ac.speedMps - 3 * dt);
          ac.headingDeg = (ac.headingDeg + 0.4 * k) % 360;
          if (ac.battery <= RESERVE_PCT) reserve(); // a hold burns the battery too
        }

        // Power, vibration, link.
        const airborne = ac.altM > 0.2;
        const climbing = ph === 'TAKEOFF';
        ac.currentA = airborne ? 15 + ac.speedMps * 0.55 + ac.windMps * 0.35 + (climbing ? 6 : 0) + (Math.random() - 0.5) * 0.6 : 0.6;
        if (airborne) ac.battery = Math.max(0, ac.battery - (ac.currentA / 22) * (100 / (28 * 60)) * dt);
        ac.voltageV = 13.2 + (ac.battery / 100) * 3.9 - (airborne ? ac.currentA * 0.012 : 0);
        ac.tempC += ((airborne ? 38 + ac.currentA * 0.2 : 29) - ac.tempC) * 0.01 * k;
        ac.vibrationG = airborne ? Math.max(0.05, 0.26 + ac.speedMps * 0.018 + ac.windMps * 0.016 + (gust ? 0.16 : 0) + (Math.random() - 0.5) * 0.06) : 0.02;
        const range = dist(ac, siteRef.current.home);
        ac.signalPct = Math.max(40, Math.min(99, 99 - range / 18 + (Math.random() - 0.5) * 2));
        if (airborne) flightS.current += dt;
        acRef.current = ac;
      }

      // Publish to React at 10 Hz; histories at 2 Hz.
      if (tick % 5 === 0) {
        const a = acRef.current;
        acRef.current = { ...a, history: {
          vibration: [...a.history.vibration.slice(1), a.vibrationG],
          wind: [...a.history.wind.slice(1), a.windMps],
          speed: [...a.history.speed.slice(1), a.speedMps],
        } };
      }
      const pc = photosRef.current;
      setSnap({ ac: acRef.current, photos: pc.length, rejected: pc.reduce((n, p) => n + (p.ok ? 0 : 1), 0), version: gridRef.current.version, legIndex: legRef.current.index, flightS: flightS.current, batteries: batteries.current });
    }, 100);
    return () => clearInterval(timer);
  }, [go, log, takePhoto]);

  // ---- derived -------------------------------------------------------------
  const stats = useMemo(() => gridRef.current.stats(), [snap.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // An orbit photographs one structure, not the site: site-wide weak patches don't apply.
  const weakPatches = useMemo(() => (planRef.current.params.pattern === 'ORBIT' ? 0 : phase === 'COMPLETE' ? gridRef.current.weakClusters(3, true).length : gridRef.current.weakClusters(3, false).length), [snap.version, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const legs = legsRef.current;
  const L = legRef.current;
  const remainingM = legs.slice(L.index).reduce((s, g, i) => s + dist(g.a, g.b) - (i === 0 ? L.progressM : 0), 0) + (detourRef.current ? dist(snap.ac, detourRef.current) : 0);
  const active = phase !== 'READY' && phase !== 'COMPLETE';
  const remainingS = phase === 'READY' ? plan.durationS : phase === 'COMPLETE' ? 0 : remainingM / planRef.current.speedMps + snap.ac.altM / DESCEND + (phase === 'SWAP' ? swapLeft.current : 0);
  const currentLeg = legs[Math.min(L.index, legs.length - 1)];
  const currentLine = currentLeg && currentLeg.line >= 0 && currentLeg.line < 1000 ? currentLeg.line + 1 : null;
  const linesDone = active || phase === 'COMPLETE'
    ? (phase === 'COMPLETE' && !refly.current ? planRef.current.lines.length : legs.slice(0, L.index).filter(g => g.capture && g.line < 1000).length)
    : 0;

  return {
    params, setParams, plan: active ? planRef.current : plan, phase,
    aircraft: snap.ac, photosRef, photoCount: snap.photos, rejected: snap.rejected,
    grid: gridRef.current, gridVersion: snap.version, stats, weakPatches,
    legs, legIndex: L.index, legProgressM: L.progressM, currentLine, linesDone,
    flightS: snap.flightS, remainingS, batteriesUsed: snap.batteries,
    simSpeed, setSimSpeed, events, live: !!liveRef.current, origin,
    site, setSite, setLiveMission, liveResume, gapLines, liveStarted: !!liveMission.current?.started,
    camera: CAMERAS[(active ? planRef.current : plan).params.camera],
    start, pause, returnHome, reflyGaps, reset, applyLive, releaseLive,
    isRefly: refly.current,
  };
}
