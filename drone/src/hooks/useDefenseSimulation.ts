import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Counter-UAS (defense) simulation.
 *
 * Models a protected asset, a ring of RF / radar / EO-IR sensors, and hostile
 * drone tracks approaching the asset. Effectors (RF jamming, GNSS denial,
 * protocol takeover) degrade a track until it is neutralized. Everything here
 * runs client-side so the dashboard can be exercised without hardware; the
 * shapes mirror what a real sensor fusion feed would publish.
 */

export const MAP_W = 1200;
export const MAP_H = 720;
export const METERS_PER_PX = 2.2; // map scale: 1200px ≈ 2.6 km

export type ThreatClass = 'DJI_OCUSYNC' | 'FPV_ANALOG' | 'WIFI_UAS' | 'FIXED_WING' | 'UNKNOWN';
export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ThreatStatus = 'TRACKING' | 'DISRUPTING' | 'NEUTRALIZED' | 'LOST';
export type EffectorType = 'RF_JAM' | 'GNSS_DENY' | 'PROTOCOL_TAKEOVER';

export interface Threat {
  id: string;
  classification: ThreatClass;
  protocol: string;
  freqMHz: number;
  rssiDbm: number;
  x: number; y: number;          // map px
  vx: number; vy: number;        // px / s
  altitudeM: number;
  speedMps: number;
  level: ThreatLevel;
  status: ThreatStatus;
  priority: boolean;
  firstSeenMs: number;
  disruptProgress: number;       // 0..1 while DISRUPTING
  trail: { x: number; y: number }[];
  confidence: number;            // 0..1 classifier confidence
}

export interface Sensor {
  id: string;
  type: 'RF' | 'RADAR' | 'EO_IR' | 'ACOUSTIC';
  x: number; y: number;
  rangePx: number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  bearingDeg: number;  // orientation for directional sensors
  fovDeg: number;      // 360 for omni
}

export interface DisruptionState {
  autoEngage: boolean;
  effector: EffectorType;
  powerPct: number;
  bands: { b24: boolean; b58: boolean; gnss: boolean };
  targetId: string | null;
  sweepActive: boolean;
  pulseUntilMs: number;
}

export interface DefenseEvent {
  id: string;
  ts: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  text: string;
  threatId?: string;
}

export interface DefenseMetrics {
  activeTracks: number;
  criticalTracks: number;
  neutralizedToday: number;
  sensorsOnline: number;
  sensorsTotal: number;
  engageRingM: number;
  closestRangeM: number;
  spectrum24: number[];  // 32 bins, dBm-ish 0..100
  spectrum58: number[];
}

export const ASSET = { x: MAP_W * 0.5, y: MAP_H * 0.55, name: 'Venue perimeter' };
export const ENGAGE_RING_PX = 260;   // ≈ 570 m
export const WARN_RING_PX = 420;     // ≈ 920 m

const CLASS_META: Record<ThreatClass, { protocol: string; freq: () => number; speed: () => number; level: ThreatLevel }> = {
  DJI_OCUSYNC: { protocol: 'OcuSync 3 / O3', freq: () => (Math.random() < 0.5 ? 2437 : 5805), speed: () => 12 + Math.random() * 8, level: 'HIGH' },
  FPV_ANALOG:  { protocol: 'Analog 5.8 GHz video', freq: () => 5740 + Math.floor(Math.random() * 8) * 20, speed: () => 25 + Math.random() * 15, level: 'CRITICAL' },
  WIFI_UAS:    { protocol: '802.11 Wi-Fi control', freq: () => 2412 + Math.floor(Math.random() * 11) * 5, speed: () => 6 + Math.random() * 6, level: 'MEDIUM' },
  FIXED_WING:  { protocol: 'ELRS 900 MHz', freq: () => 915, speed: () => 18 + Math.random() * 10, level: 'HIGH' },
  UNKNOWN:     { protocol: 'Unclassified emitter', freq: () => 2400 + Math.random() * 80, speed: () => 5 + Math.random() * 10, level: 'LOW' },
};

const INITIAL_SENSORS: Sensor[] = [
  { id: 'RF-N', type: 'RF', x: MAP_W * 0.5, y: MAP_H * 0.16, rangePx: 380, status: 'ONLINE', bearingDeg: 0, fovDeg: 360 },
  { id: 'RF-SW', type: 'RF', x: MAP_W * 0.2, y: MAP_H * 0.8, rangePx: 360, status: 'ONLINE', bearingDeg: 0, fovDeg: 360 },
  { id: 'RF-SE', type: 'RF', x: MAP_W * 0.82, y: MAP_H * 0.78, rangePx: 360, status: 'ONLINE', bearingDeg: 0, fovDeg: 360 },
  { id: 'RADAR-1', type: 'RADAR', x: ASSET.x, y: ASSET.y, rangePx: 470, status: 'ONLINE', bearingDeg: 0, fovDeg: 360 },
  { id: 'EO/IR-1', type: 'EO_IR', x: ASSET.x + 30, y: ASSET.y - 30, rangePx: 320, status: 'ONLINE', bearingDeg: 320, fovDeg: 60 },
  { id: 'ACU-1', type: 'ACOUSTIC', x: MAP_W * 0.36, y: MAP_H * 0.42, rangePx: 160, status: 'DEGRADED', bearingDeg: 0, fovDeg: 360 },
];

let seq = 0;
function newThreat(cls?: ThreatClass): Threat {
  const classes: ThreatClass[] = ['DJI_OCUSYNC', 'FPV_ANALOG', 'WIFI_UAS', 'FIXED_WING', 'UNKNOWN'];
  const c = cls ?? classes[Math.floor(Math.random() * classes.length)];
  const meta = CLASS_META[c];
  // Spawn on a random edge, headed roughly toward the asset.
  const edge = Math.floor(Math.random() * 4);
  const x = edge === 0 ? 20 : edge === 1 ? MAP_W - 20 : Math.random() * MAP_W;
  const y = edge === 2 ? 20 : edge === 3 ? MAP_H - 20 : Math.random() * MAP_H;
  const speed = meta.speed();
  const ang = Math.atan2(ASSET.y - y, ASSET.x - x) + (Math.random() - 0.5) * 0.5;
  const pxPerSec = speed / METERS_PER_PX;
  seq += 1;
  return {
    id: `TRK-${String(seq).padStart(3, '0')}`,
    classification: c,
    protocol: meta.protocol,
    freqMHz: meta.freq(),
    rssiDbm: -92 + Math.random() * 6,
    x, y,
    vx: Math.cos(ang) * pxPerSec,
    vy: Math.sin(ang) * pxPerSec,
    altitudeM: 40 + Math.random() * 110,
    speedMps: speed,
    level: meta.level,
    status: 'TRACKING',
    priority: false,
    firstSeenMs: Date.now(),
    disruptProgress: 0,
    trail: [],
    confidence: c === 'UNKNOWN' ? 0.35 + Math.random() * 0.2 : 0.78 + Math.random() * 0.2,
  };
}

function rangeM(t: { x: number; y: number }) {
  return Math.hypot(t.x - ASSET.x, t.y - ASSET.y) * METERS_PER_PX;
}

export function useDefenseSimulation() {
  const [threats, setThreats] = useState<Threat[]>(() => [newThreat('DJI_OCUSYNC'), newThreat('FPV_ANALOG')]);
  const [sensors, setSensors] = useState<Sensor[]>(INITIAL_SENSORS);
  const [disruption, setDisruption] = useState<DisruptionState>({
    autoEngage: true, effector: 'RF_JAM', powerPct: 80,
    bands: { b24: true, b58: true, gnss: false }, targetId: null, sweepActive: false, pulseUntilMs: 0,
  });
  const [events, setEvents] = useState<DefenseEvent[]>([]);
  const [selectedThreatId, setSelectedThreatId] = useState<string | null>(null);
  const [neutralized, setNeutralized] = useState(7);
  const [spectrum, setSpectrum] = useState<{ s24: number[]; s58: number[] }>({ s24: new Array(32).fill(8), s58: new Array(32).fill(8) });
  const [paused, setPaused] = useState(false);

  const threatsRef = useRef(threats);
  const disruptionRef = useRef(disruption);
  const pausedRef = useRef(paused);
  useEffect(() => { threatsRef.current = threats; }, [threats]);
  useEffect(() => { disruptionRef.current = disruption; }, [disruption]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const log = useCallback((severity: DefenseEvent['severity'], text: string, threatId?: string) => {
    setEvents(prev => [{ id: `EV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, ts: new Date().toLocaleTimeString([], { hour12: false }), severity, text, threatId }, ...prev].slice(0, 60));
  }, []);

  // ---- Operator actions -------------------------------------------------
  const disruptTarget = useCallback((id: string) => {
    setDisruption(d => ({ ...d, targetId: id }));
    setThreats(prev => prev.map(t => (t.id === id && t.status === 'TRACKING' ? { ...t, status: 'DISRUPTING', disruptProgress: 0 } : t)));
    const t = threatsRef.current.find(x => x.id === id);
    log('WARNING', `Effector ${disruptionRef.current.effector.replace('_', ' ')} engaged on ${id}${t ? ` (${t.protocol})` : ''}`, id);
  }, [log]);

  const disruptAll = useCallback(() => {
    setThreats(prev => prev.map(t => (t.status === 'TRACKING' ? { ...t, status: 'DISRUPTING', disruptProgress: 0 } : t)));
    setDisruption(d => ({ ...d, sweepActive: true }));
    log('CRITICAL', 'Area denial: all active tracks engaged, omni sweep on');
  }, [log]);

  const cancelDisruption = useCallback(() => {
    setThreats(prev => prev.map(t => (t.status === 'DISRUPTING' ? { ...t, status: 'TRACKING', disruptProgress: 0 } : t)));
    setDisruption(d => ({ ...d, targetId: null, sweepActive: false }));
    log('INFO', 'All effectors stood down');
  }, [log]);

  const pulseBurst = useCallback(() => {
    setDisruption(d => ({ ...d, pulseUntilMs: Date.now() + 1500 }));
    // A burst knocks RSSI down on every track inside the engage ring for a moment.
    setThreats(prev => prev.map(t => (rangeM(t) < ENGAGE_RING_PX * METERS_PER_PX ? { ...t, rssiDbm: t.rssiDbm - 12 } : t)));
    log('WARNING', '1.5 s wideband pulse burst emitted (engage ring)');
  }, [log]);

  const toggleSweep = useCallback(() => {
    setDisruption(d => { log('INFO', d.sweepActive ? 'Sector sweep off' : 'Sector sweep on: 360° rotating beam'); return { ...d, sweepActive: !d.sweepActive }; });
  }, [log]);

  const setPriority = useCallback((id: string) => {
    setThreats(prev => prev.map(t => ({ ...t, priority: t.id === id ? !t.priority : t.priority })));
  }, []);

  const setAutoEngage = useCallback((on: boolean) => {
    setDisruption(d => ({ ...d, autoEngage: on }));
    log('INFO', on ? 'Auto-engage on: HIGH/CRITICAL tracks inside engage ring are disrupted automatically' : 'Auto-engage off: manual authorisation required');
  }, [log]);

  const setEffector = useCallback((e: EffectorType) => setDisruption(d => ({ ...d, effector: e })), []);
  const setPower = useCallback((p: number) => setDisruption(d => ({ ...d, powerPct: p })), []);
  const toggleBand = useCallback((b: keyof DisruptionState['bands']) => setDisruption(d => ({ ...d, bands: { ...d.bands, [b]: !d.bands[b] } })), []);

  const injectThreat = useCallback((cls?: ThreatClass) => {
    const t = newThreat(cls);
    setThreats(prev => [...prev, t]);
    log('WARNING', `New emitter ${t.id}: ${t.protocol} @ ${t.freqMHz} MHz, ${rangeM(t).toFixed(0)} m`, t.id);
  }, [log]);

  const toggleSensor = useCallback((id: string) => {
    setSensors(prev => prev.map(s => (s.id === id ? { ...s, status: s.status === 'OFFLINE' ? 'ONLINE' : 'OFFLINE' } : s)));
  }, []);

  // ---- 20 Hz simulation tick -------------------------------------------
  useEffect(() => {
    const dt = 0.05;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const d = disruptionRef.current;
      const now = Date.now();
      const effectorRate = (d.powerPct / 100) * (d.effector === 'PROTOCOL_TAKEOVER' ? 0.22 : d.effector === 'GNSS_DENY' ? 0.14 : 0.18);
      const bandOk = (t: Threat) => (t.freqMHz < 3000 ? d.bands.b24 : t.freqMHz < 6000 ? d.bands.b58 : d.bands.gnss) || d.effector === 'GNSS_DENY' && d.bands.gnss;

      setThreats(prev => {
        const next: Threat[] = [];
        for (const t0 of prev) {
          const t = { ...t0 };
          const r = rangeM(t);

          if (t.status === 'TRACKING') {
            // Slight weave; converge on the asset.
            const ang = Math.atan2(ASSET.y - t.y, ASSET.x - t.x);
            const cur = Math.atan2(t.vy, t.vx);
            const blended = cur + ((((ang - cur) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.03 + Math.sin(now / 900 + t.firstSeenMs) * 0.02;
            const spd = t.speedMps / METERS_PER_PX;
            t.vx = Math.cos(blended) * spd; t.vy = Math.sin(blended) * spd;
            t.x += t.vx * dt; t.y += t.vy * dt;
            t.rssiDbm = -40 - (r / 1400) * 55 + (Math.random() - 0.5) * 2;
            t.confidence = Math.min(0.99, t.confidence + 0.002);
            // Escalate as it closes.
            if (r < ENGAGE_RING_PX * METERS_PER_PX && t.level !== 'CRITICAL' && t.classification !== 'UNKNOWN') t.level = 'CRITICAL';
            else if (r < WARN_RING_PX * METERS_PER_PX && t.level === 'LOW') t.level = 'MEDIUM';
            if (d.autoEngage && r < ENGAGE_RING_PX * METERS_PER_PX && (t.level === 'HIGH' || t.level === 'CRITICAL') && bandOk(t)) {
              t.status = 'DISRUPTING'; t.disruptProgress = 0;
              log('WARNING', `Auto-engage: ${t.id} inside ${(ENGAGE_RING_PX * METERS_PER_PX).toFixed(0)} m ring`, t.id);
            }
            if (r < 60) { // reached the asset — mark lost/breach
              t.status = 'LOST';
              log('CRITICAL', `${t.id} breached the protected perimeter`, t.id);
            }
          } else if (t.status === 'DISRUPTING') {
            const inSweep = d.sweepActive || d.targetId === t.id || d.targetId === null;
            const rate = inSweep && bandOk(t) ? effectorRate : effectorRate * 0.25;
            t.disruptProgress = Math.min(1, t.disruptProgress + rate * dt * (now < d.pulseUntilMs ? 3 : 1));
            // Link degrades: it slows and drifts, RSSI collapses.
            const slow = 1 - t.disruptProgress * 0.85;
            t.x += t.vx * dt * slow + (Math.random() - 0.5) * 0.6; t.y += t.vy * dt * slow + (Math.random() - 0.5) * 0.6;
            t.rssiDbm = -40 - (r / 1400) * 55 - t.disruptProgress * 30;
            t.altitudeM = Math.max(0, t.altitudeM - t.disruptProgress * 0.9);
            if (t.disruptProgress >= 1) {
              t.status = 'NEUTRALIZED';
              setNeutralized(n => n + 1);
              log('SUCCESS', `${t.id} neutralized (${d.effector === 'PROTOCOL_TAKEOVER' ? 'forced land' : d.effector === 'GNSS_DENY' ? 'GNSS denied, drifting' : 'link severed, failsafe RTH'})`, t.id);
            }
          } else if (t.status === 'NEUTRALIZED') {
            // Failsafe RTH: reverse away from asset, then drop off the board.
            const ang = Math.atan2(t.y - ASSET.y, t.x - ASSET.x);
            t.x += Math.cos(ang) * 2.2; t.y += Math.sin(ang) * 2.2;
            t.altitudeM = Math.max(0, t.altitudeM - 0.3);
            t.rssiDbm = Math.max(-110, t.rssiDbm - 0.15);
            if (t.x < -40 || t.x > MAP_W + 40 || t.y < -40 || t.y > MAP_H + 40 || now - t.firstSeenMs > 90000 && t.altitudeM === 0) continue;
          } else if (t.status === 'LOST') {
            if (now - t.firstSeenMs > 120000) continue;
          }

          if (t.trail.length === 0 || Math.hypot(t.x - t.trail[t.trail.length - 1].x, t.y - t.trail[t.trail.length - 1].y) > 4) {
            t.trail = [...t.trail.slice(-45), { x: t.x, y: t.y }];
          }
          next.push(t);
        }
        // Keep the board populated so the operator always has something to work.
        if (next.filter(t => t.status === 'TRACKING' || t.status === 'DISRUPTING').length < 2 && Math.random() < 0.02) {
          const t = newThreat();
          next.push(t);
          log('WARNING', `New emitter ${t.id}: ${t.protocol} @ ${t.freqMHz} MHz`, t.id);
        }
        return next;
      });

      // Spectrum: baseline noise + peaks where active tracks transmit.
      setSpectrum(() => {
        const active = threatsRef.current.filter(t => t.status !== 'NEUTRALIZED' && t.status !== 'LOST');
        const mk = (lo: number, hi: number) => Array.from({ length: 32 }, (_, i) => {
          const f = lo + ((i + 0.5) / 32) * (hi - lo);
          let v = 6 + Math.random() * 6;
          for (const t of active) {
            const w = t.classification === 'FPV_ANALOG' ? 12 : 22;
            const dist = Math.abs(t.freqMHz - f);
            if (dist < w) v += (1 - dist / w) * (100 + t.rssiDbm) * 0.9 * (t.status === 'DISRUPTING' ? 0.4 : 1);
          }
          if (d.sweepActive || now < d.pulseUntilMs) v += 25 + Math.random() * 20; // our own emission floor
          return Math.min(100, v);
        });
        return { s24: mk(2400, 2500), s58: mk(5725, 5875) };
      });
    }, 50);
    return () => clearInterval(timer);
  }, [log]);

  const active = threats.filter(t => t.status === 'TRACKING' || t.status === 'DISRUPTING');
  const metrics: DefenseMetrics = {
    activeTracks: active.length,
    criticalTracks: active.filter(t => t.level === 'CRITICAL').length,
    neutralizedToday: neutralized,
    sensorsOnline: sensors.filter(s => s.status === 'ONLINE').length,
    sensorsTotal: sensors.length,
    engageRingM: ENGAGE_RING_PX * METERS_PER_PX,
    closestRangeM: active.length ? Math.min(...active.map(rangeM)) : Infinity,
    spectrum24: spectrum.s24,
    spectrum58: spectrum.s58,
  };

  return {
    threats, sensors, disruption, events, metrics,
    selectedThreatId, setSelectedThreatId,
    paused, setPaused,
    disruptTarget, disruptAll, cancelDisruption, pulseBurst, toggleSweep, setPriority,
    setAutoEngage, setEffector, setPower, toggleBand, injectThreat, toggleSensor,
    rangeM,
  };
}
