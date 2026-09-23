import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  planSurvey, gapFillLines, CoverageGrid, fromLatLon, toLatLon, CAMERAS,
  type SurveyParams, type SurveyPlan, type Leg, type Pt, type GeoOrigin,
} from '../survey/plan';
import { SITE, structureAt } from '../survey/site';
import { modeName } from '../link/mavlink';

/**
 * Site survey mission: one mapping aircraft flying a planned capture pattern.
 *
 * The aircraft follows the plan's legs, triggers the camera by distance on
 * capture legs (exactly what DO_SET_CAM_TRIGG_DIST makes a real autopilot do),
 * and every accepted photo adds its ground footprint to the coverage grid.
 * Gusts raise vibration and blur photos; a low battery flies home, swaps, and
 * resumes from where it left the line — the way real multi-battery surveys run.
 *
 * On a real link the aircraft's position comes from telemetry. Photos come from
 * the autopilot's CAMERA_FEEDBACK when the camera reports them, otherwise they
 * are estimated from distance flown in AUTO at survey height.
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

export interface Photo { id: number; x: number; y: number; altM: number; headingDeg: number; pitchDeg: number; t: number; line: number; ok: boolean; reason?: 'Blur' | 'Exposure' }

export interface SurveyEvent { id: string; ts: string; severity: 'INFO' | 'WARNING' | 'SUCCESS' | 'CRITICAL'; text: string }

export const DEFAULT_PARAMS: SurveyParams = {
  pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E',
  orbit: { center: { x: structureAt(SITE.orbitTarget)!.x, y: structureAt(SITE.orbitTarget)!.y }, radiusM: 45 },
};

const RESERVE_PCT = 27;
const SWAP_S = 45;
const HIST = 40;
const CLIMB = 5, DESCEND = 3;

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

function freshAircraft(): SurveyAircraft {
  return {
    x: SITE.home.x, y: SITE.home.y, altM: 0, headingDeg: 90, speedMps: 0,
    battery: 100, voltageV: 17.2, currentA: 0.6, tempC: 29, vibrationG: 0.02, windMps: 5.2, signalPct: 99,
    history: { vibration: Array(HIST).fill(0.02), wind: Array.from({ length: HIST }, () => 5 + Math.random()), speed: Array(HIST).fill(0) },
  };
}

export function useSurveyMission() {
  const [params, setParamsState] = useState<SurveyParams>(DEFAULT_PARAMS);
  const plan = useMemo(() => planSurvey(SITE.boundary, SITE.home, params), [params]);

  // ---- mutable flight state (the 10 Hz loop works on refs, React gets snapshots) ----
  const planRef = useRef<SurveyPlan>(plan);
  const gridRef = useRef(new CoverageGrid(SITE.boundary, 5));
  const legsRef = useRef<Leg[]>(plan.legs);
  const legRef = useRef({ index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false });
  const acRef = useRef<SurveyAircraft>(freshAircraft());
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
  const liveRef = useRef<{ origin: GeoOrigin; lastPos: Pt | null; since: number; reported: number; feedback: boolean } | null>(null);

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
      acRef.current = freshAircraft();
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
    resumeRef.current = { index: L.index, progressM: L.progressM, at: { x: acRef.current.x, y: acRef.current.y } };
    go('RETURNING'); log('WARNING', reason);
  }, [go, log]);

  /** Short extra capture lines over every weak patch, flown on the current battery. */
  const reflyGaps = useCallback(() => {
    if (phaseRef.current !== 'COMPLETE' || planRef.current.params.pattern === 'ORBIT') return 0;
    const fill = gapFillLines(gridRef.current, planRef.current);
    if (!fill.length) { log('SUCCESS', 'No weak patches — coverage is good everywhere'); return 0; }
    const legs: Leg[] = []; let at = SITE.home;
    fill.forEach((l, i) => { legs.push({ a: at, b: l.a, capture: false, line: 1000 + i }, { a: l.a, b: l.b, capture: true, line: 1000 + i }); at = l.b; });
    legs.push({ a: at, b: SITE.home, capture: false, line: -1 });
    legsRef.current = legs; refly.current = true;
    legRef.current = { index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false };
    if (acRef.current.battery < 50) { acRef.current = { ...acRef.current, battery: 100 }; batteries.current++; }
    go('TAKEOFF'); log('INFO', `Re-flying ${fill.length} weak patch${fill.length > 1 ? 'es' : ''}`);
    return fill.length;
  }, [go, log]);

  const reset = useCallback(() => {
    gridRef.current.reset(); photosRef.current = []; acRef.current = freshAircraft();
    legsRef.current = plan.legs; legRef.current = { index: 0, progressM: 0, sinceTriggerM: 0, onCapture: false };
    resumeRef.current = null; detourRef.current = null; flightS.current = 0; batteries.current = 1;
    go('READY'); log('INFO', 'Survey cleared');
  }, [plan, go, log]);

  // ---- photos ----------------------------------------------------------------
  const takePhoto = useCallback((headingRad: number, line: number, sim: boolean) => {
    const ac = acRef.current, P = planRef.current;
    const vib = ac.vibrationG, wind = ac.windMps;
    let ok = true, reason: Photo['reason'];
    if (sim) {
      const pBlur = 0.003 + Math.max(0, vib - 0.6) * 0.7 + Math.max(0, wind - 9) * 0.03;
      if (Math.random() < pBlur) { ok = false; reason = 'Blur'; } else if (Math.random() < 0.003) { ok = false; reason = 'Exposure'; }
    }
    const photo: Photo = { id: photosRef.current.length + 1, x: ac.x, y: ac.y, altM: ac.altM, headingDeg: (headingRad * 180) / Math.PI, pitchDeg: P.gimbalPitchDeg, t: Date.now(), line, ok, reason };
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

  // ---- real aircraft --------------------------------------------------------
  /**
   * Replace the simulated aircraft with telemetry. The first fix is taken as the
   * home point, and the site is placed so home lands on SITE.home.
   */
  const applyLive = useCallback((t: {
    lat: number; lon: number; altRelM: number; headingDeg: number; groundspeedMps: number; batteryPct: number; voltageV: number; currentA: number;
    armed: boolean; customMode: number; autopilot: number; radioRssi: number;
    photosReported: number; lastPhoto: { lat: number; lon: number; altRelM: number } | null;
  }) => {
    if (!t.lat) return;
    if (!liveRef.current) {
      const origin = toLatLon({ lat: t.lat, lon: t.lon }, { x: -SITE.home.x, y: -SITE.home.y });
      liveRef.current = { origin, lastPos: null, since: 0, reported: t.photosReported, feedback: false };
    }
    const L = liveRef.current;
    const p = fromLatLon(L.origin, t.lat, t.lon);
    const ac = acRef.current;
    acRef.current = {
      ...ac, x: p.x, y: p.y, altM: Math.max(0, t.altRelM), headingDeg: t.headingDeg, speedMps: t.groundspeedMps,
      battery: t.batteryPct >= 0 ? t.batteryPct : ac.battery, voltageV: t.voltageV || ac.voltageV, currentA: t.currentA || ac.currentA,
      signalPct: t.radioRssi ? Math.round((t.radioRssi / 254) * 100) : ac.signalPct,
    };
    const hRad = ((t.headingDeg - 90) * Math.PI) / 180;
    if (t.photosReported > L.reported && t.lastPhoto) {
      // The autopilot reports every photo it takes (CAMERA_FEEDBACK): use its exact position.
      L.feedback = true; L.reported = t.photosReported;
      const at = fromLatLon(L.origin, t.lastPhoto.lat, t.lastPhoto.lon);
      const save = acRef.current; acRef.current = { ...save, x: at.x, y: at.y, altM: t.lastPhoto.altRelM };
      takePhoto(hRad, -1, false); acRef.current = save;
    } else if (!L.feedback) {
      // No feedback from this camera: estimate by distance flown in AUTO at survey height,
      // which is what the trigger-distance command makes the autopilot do.
      const P = planRef.current;
      const surveying = t.armed && modeName(t) === 'AUTO' && t.altRelM > P.params.altitudeM * 0.7;
      if (surveying && L.lastPos) {
        L.since += dist(L.lastPos, p);
        if (L.since >= P.triggerM) { L.since = 0; takePhoto(hRad, -1, false); }
      }
    }
    L.lastPos = p;
  }, [takePhoto]);
  const releaseLive = useCallback(() => { liveRef.current = null; }, []);
  const origin: GeoOrigin = liveRef.current?.origin ?? SITE.origin;

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
          // Battery reserve: go home, swap, resume.
          if (ac.battery <= RESERVE_PCT && phaseRef.current !== 'LANDING') {
            const L = legRef.current;
            resumeRef.current = { index: L.index, progressM: L.progressM, at: { x: ac.x, y: ac.y } };
            go('RETURNING'); log('WARNING', `Battery ${ac.battery.toFixed(0)}% — returning to swap, will resume from this point`);
          }
        } else if (ph === 'RETURNING') {
          ac.speedMps += (12 - ac.speedMps) * Math.min(1, 0.3 * k);
          if (moveAlong(SITE.home, ac.speedMps)) go('LANDING');
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
        }

        // Power, vibration, link.
        const airborne = ac.altM > 0.2;
        const climbing = ph === 'TAKEOFF';
        ac.currentA = airborne ? 15 + ac.speedMps * 0.55 + ac.windMps * 0.35 + (climbing ? 6 : 0) + (Math.random() - 0.5) * 0.6 : 0.6;
        if (airborne) ac.battery = Math.max(0, ac.battery - (ac.currentA / 22) * (100 / (28 * 60)) * dt);
        ac.voltageV = 13.2 + (ac.battery / 100) * 3.9 - (airborne ? ac.currentA * 0.012 : 0);
        ac.tempC += ((airborne ? 38 + ac.currentA * 0.2 : 29) - ac.tempC) * 0.01 * k;
        ac.vibrationG = airborne ? Math.max(0.05, 0.26 + ac.speedMps * 0.018 + ac.windMps * 0.016 + (gust ? 0.16 : 0) + (Math.random() - 0.5) * 0.06) : 0.02;
        const range = dist(ac, SITE.home);
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
    camera: CAMERAS[(active ? planRef.current : plan).params.camera],
    start, pause, returnHome, reflyGaps, reset, applyLive, releaseLive,
    isRefly: refly.current,
  };
}
