import { useCallback, useEffect, useRef, useState } from 'react';
import { modeName } from '../link/mavlink';
import { metresPerDegree } from '../lib/geo';

/**
 * Surveillance / patrol simulation.
 *
 * A small fleet flies a shared patrol route around a protected site. Each
 * airframe publishes telemetry (attitude, power, link, payload), the route is
 * a fixed waypoint loop, and the payload can be tasked (auto-track, thermal,
 * illumination, night vision). Detections appear along the route to give the
 * operator something to investigate.
 */

export const MAP_W = 1200;
export const MAP_H = 720;
export const METERS_PER_PX = 1.6; // ≈ 1.9 km across

export type PatrolStatus = 'ON_PATROL' | 'EN_ROUTE' | 'MONITORING' | 'RTH' | 'OFFLINE';
export type SensorMode = 'RGB_4K' | 'THERMAL_WHITE_HOT' | 'THERMAL_IRONBOW' | 'NIGHT_VISION';

export interface Waypoint { id: string; label: string; x: number; y: number; altM: number; holdSec: number }

export interface PatrolDrone {
  id: string;
  model: string;
  x: number; y: number;
  headingDeg: number;
  altM: number;
  groundSpeedMps: number;
  verticalSpeedMps: number;
  status: PatrolStatus;
  targetWpIndex: number;
  /** With targetWpIndex -1: the detection this aircraft was sent to. */
  targetDetId?: string;
  holdRemainingSec: number;
  battery: number;
  voltageV: number;
  currentA: number;
  tempC: number;
  enduranceMin: number;
  signalPct: number;
  rttMs: number;
  packetLossPct: number;
  egtC: number;
  gimbalPitchDeg: number;
  zoom: number;
  sensorMode: SensorMode;
  history: { airspeed: number[]; vspeed: number[]; egt: number[]; signal: number[] };
  distanceFlownM: number;
  autopilot: boolean;
  tasks: { autoTrack: boolean; illumination: boolean; nightVision: boolean; thermalScan: boolean; survivorDetect: boolean };
}

export interface Detection {
  id: string;
  kind: 'PERSON' | 'VEHICLE' | 'HEAT_SIGNATURE' | 'UNKNOWN';
  x: number; y: number;
  confidence: number;
  firstSeenMs: number;
  byDroneId: string;
  acknowledged: boolean;
}

export interface PatrolEvent {
  id: string; ts: string; severity: 'INFO' | 'WARNING' | 'SUCCESS' | 'CRITICAL'; text: string; droneId?: string;
}

export const SITE = { x: MAP_W * 0.52, y: MAP_H * 0.5, name: 'Venue compound' };

export const WAYPOINTS: Waypoint[] = [
  { id: 'WP1', label: 'North gate', x: MAP_W * 0.30, y: MAP_H * 0.22, altM: 60, holdSec: 8 },
  { id: 'WP2', label: 'Parking east', x: MAP_W * 0.72, y: MAP_H * 0.20, altM: 70, holdSec: 6 },
  { id: 'WP3', label: 'Loading dock', x: MAP_W * 0.86, y: MAP_H * 0.56, altM: 55, holdSec: 10 },
  { id: 'WP4', label: 'South fence', x: MAP_W * 0.60, y: MAP_H * 0.86, altM: 60, holdSec: 6 },
  { id: 'WP5', label: 'West ridge', x: MAP_W * 0.18, y: MAP_H * 0.66, altM: 90, holdSec: 8 },
];

const HIST = 40;
function mkHistory(seed: number) {
  return {
    airspeed: Array.from({ length: HIST }, () => 11 + Math.sin(seed) * 2 + Math.random()),
    vspeed: Array.from({ length: HIST }, () => (Math.random() - 0.5) * 1.2),
    egt: Array.from({ length: HIST }, () => 108 + Math.random() * 6),
    signal: Array.from({ length: HIST }, () => 88 + Math.random() * 8),
  };
}

function mkDrone(i: number, model: string, status: PatrolStatus, wp: number, battery: number): PatrolDrone {
  const w = WAYPOINTS[wp];
  return {
    id: `T-${80 - i * 10}M`,
    model,
    x: w.x + (Math.random() - 0.5) * 80, y: w.y + (Math.random() - 0.5) * 80,
    headingDeg: Math.random() * 360, altM: w.altM, groundSpeedMps: 11.8, verticalSpeedMps: 0,
    status, targetWpIndex: (wp + 1) % WAYPOINTS.length, holdRemainingSec: 0,
    battery, voltageV: 22.8, currentA: 18.7, tempC: 34.2, enduranceMin: Math.round(battery * 2.05),
    signalPct: 96, rttMs: 58, packetLossPct: 0.1, egtC: 114,
    gimbalPitchDeg: -35, zoom: 1, sensorMode: 'RGB_4K',
    history: mkHistory(i), distanceFlownM: 3200 + i * 900, autopilot: true,
    tasks: { autoTrack: false, illumination: false, nightVision: false, thermalScan: false, survivorDetect: false },
  };
}

let detSeq = 0;

/** Subset of MAVLink telemetry the patrol model consumes (see src/link/mavlink.ts). */
export interface LiveTelemetry {
  lat: number; lon: number; altRelM: number; headingDeg: number; groundspeedMps: number; climbMps: number;
  batteryPct: number; voltageV: number; currentA: number; armed: boolean; customMode: number; autopilot: number;
  radioRssi: number; satellites: number; msgsPerSec: number;
}

export function useSurveillanceSimulation() {
  const [drones, setDrones] = useState<PatrolDrone[]>(() => [
    mkDrone(0, 'UAV-MAVIC3', 'ON_PATROL', 0, 84.2),
    mkDrone(1, 'UAV-MAVIC3', 'EN_ROUTE', 2, 71),
    mkDrone(2, 'UAV-M30T', 'MONITORING', 3, 63),
    { ...mkDrone(3, 'UAV-M30T', 'OFFLINE', 4, 12), x: SITE.x + 60, y: SITE.y + 40, altM: 0, groundSpeedMps: 0, signalPct: 0, rttMs: 0 },
  ]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [events, setEvents] = useState<PatrolEvent[]>([]);
  const [selectedDroneId, setSelectedDroneId] = useState<string>('T-80M');
  const [missionElapsedSec, setMissionElapsedSec] = useState(25 * 60 + 1);
  const [uplinkGbps, setUplinkGbps] = useState(2.2);
  // Night protocol: AUTO follows the local clock (19:00–06:00), or force DAY / NIGHT.
  const [nightMode, setNightMode] = useState<'AUTO' | 'DAY' | 'NIGHT'>('AUTO');
  const clockHour = new Date().getHours();
  const isNight = nightMode === 'NIGHT' || (nightMode === 'AUTO' && (clockHour >= 19 || clockHour < 6));

  const dronesRef = useRef(drones);
  useEffect(() => { dronesRef.current = drones; }, [drones]);
  // Aircraft driven by a real link are skipped by the simulation tick.
  const liveRef = useRef<Set<string>>(new Set());
  const originRef = useRef<{ lat: number; lon: number } | null>(null);

  const log = useCallback((severity: PatrolEvent['severity'], text: string, droneId?: string) => {
    setEvents(prev => [{ id: `EV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, ts: new Date().toLocaleTimeString([], { hour12: false }), severity, text, droneId }, ...prev].slice(0, 60));
  }, []);

  // ---- Operator actions -------------------------------------------------
  const patch = useCallback((id: string, fn: (d: PatrolDrone) => PatrolDrone) => {
    setDrones(prev => prev.map(d => (d.id === id ? fn(d) : d)));
  }, []);

  const toggleTask = useCallback((id: string, task: keyof PatrolDrone['tasks']) => {
    patch(id, d => {
      const on = !d.tasks[task];
      const tasks = { ...d.tasks, [task]: on };
      let sensorMode = d.sensorMode;
      if (task === 'thermalScan') sensorMode = on ? 'THERMAL_WHITE_HOT' : 'RGB_4K';
      if (task === 'nightVision') sensorMode = on ? 'NIGHT_VISION' : d.tasks.thermalScan ? 'THERMAL_WHITE_HOT' : 'RGB_4K';
      return { ...d, tasks, sensorMode };
    });
    // Logged here, not in the updater: React may run an updater twice (StrictMode), which logged it twice.
    const cur = dronesRef.current.find(d => d.id === id);
    if (cur) log('INFO', `${id}: ${task.replace(/([A-Z])/g, ' $1').toLowerCase()} ${cur.tasks[task] ? 'off' : 'on'}`, id);
  }, [patch, log]);

  const setAutopilot = useCallback((id: string, on: boolean) => {
    patch(id, d => ({ ...d, autopilot: on, status: on ? 'EN_ROUTE' : 'MONITORING' }));
    log(on ? 'INFO' : 'WARNING', `${id}: ${on ? 'autopilot resumed on patrol route' : 'manual hold — operator has the stick'}`, id);
  }, [patch, log]);

  const goToWaypoint = useCallback((id: string, wpIndex: number) => {
    patch(id, d => ({ ...d, targetWpIndex: wpIndex, targetDetId: undefined, status: 'EN_ROUTE', holdRemainingSec: 0, autopilot: true }));
    log('INFO', `${id}: rerouted to ${WAYPOINTS[wpIndex].id} ${WAYPOINTS[wpIndex].label}`, id);
  }, [patch, log]);

  const returnHome = useCallback((id: string) => {
    patch(id, d => ({ ...d, status: 'RTH', autopilot: true }));
    log('WARNING', `${id}: return-to-home commanded`, id);
  }, [patch, log]);

  const setGimbal = useCallback((id: string, pitchDelta: number) => {
    patch(id, d => ({ ...d, gimbalPitchDeg: Math.max(-90, Math.min(15, d.gimbalPitchDeg + pitchDelta)) }));
  }, [patch]);

  const setZoom = useCallback((id: string, zoom: number) => patch(id, d => ({ ...d, zoom })), [patch]);

  /**
   * Replace one aircraft's simulated state with real telemetry. The first GPS fix
   * becomes the map origin at the site marker; later fixes are offsets in metres.
   */
  const applyLiveTelemetry = useCallback((id: string, t: LiveTelemetry) => {
    liveRef.current.add(id);
    if (t.lat !== 0 && !originRef.current) originRef.current = { lat: t.lat, lon: t.lon };
    patch(id, d => {
      let x = d.x, y = d.y;
      if (originRef.current && t.lat !== 0) {
        const { lat: mPerDegLat, lon: mPerDegLon } = metresPerDegree(originRef.current.lat);
        x = SITE.x + ((t.lon - originRef.current.lon) * mPerDegLon) / METERS_PER_PX;
        y = SITE.y - ((t.lat - originRef.current.lat) * mPerDegLat) / METERS_PER_PX;
      }
      const status: PatrolStatus = !t.armed ? 'OFFLINE' : modeName(t) === 'RTL' ? 'RTH' : t.groundspeedMps < 1 ? 'MONITORING' : 'EN_ROUTE';
      const battery = t.batteryPct >= 0 ? t.batteryPct : d.battery;
      return {
        ...d, x, y, status,
        altM: Math.max(0, t.altRelM), headingDeg: t.headingDeg, groundSpeedMps: t.groundspeedMps, verticalSpeedMps: t.climbMps,
        battery, voltageV: t.voltageV || d.voltageV, currentA: t.currentA || d.currentA,
        enduranceMin: Math.max(0, Math.round((battery / 100) * 190 / (Math.max(1, t.currentA || d.currentA) / 18))),
        signalPct: t.radioRssi ? Math.round((t.radioRssi / 254) * 100) : d.signalPct,
        rttMs: t.msgsPerSec ? Math.max(20, Math.round(1000 / t.msgsPerSec)) : d.rttMs,
        packetLossPct: 0,
        history: {
          airspeed: [...d.history.airspeed.slice(1), t.groundspeedMps],
          vspeed: [...d.history.vspeed.slice(1), t.climbMps],
          egt: d.history.egt,
          signal: [...d.history.signal.slice(1), t.radioRssi ? (t.radioRssi / 254) * 100 : d.signalPct],
        },
      };
    });
  }, [patch]);

  /** Map pixel → WGS84 using the live origin; null until a real fix has been seen. */
  const pointLatLon = useCallback((x: number, y: number): { lat: number; lon: number } | null => {
    const o = originRef.current; if (!o) return null;
    const { lat: mPerDegLat, lon: mPerDegLon } = metresPerDegree(o.lat);
    return { lat: o.lat - ((y - SITE.y) * METERS_PER_PX) / mPerDegLat, lon: o.lon + ((x - SITE.x) * METERS_PER_PX) / mPerDegLon };
  }, []);
  const waypointLatLon = useCallback((index: number) => { const w = WAYPOINTS[index]; return w ? pointLatLon(w.x, w.y) : null; }, [pointLatLon]);

  /**
   * Hand an aircraft back to the simulation (link dropped or disconnected). The map origin stays:
   * the next fix may come from an aircraft already in the air, far from the site marker.
   */
  const releaseLive = useCallback((id: string) => { liveRef.current.delete(id); }, []);

  const acknowledgeDetection = useCallback((id: string) => {
    setDetections(prev => prev.map(d => (d.id === id ? { ...d, acknowledged: true } : d)));
  }, []);

  const dispatchToDetection = useCallback((droneId: string, detId: string) => {
    const det = detections.find(d => d.id === detId);
    if (!det) return;
    patch(droneId, d => ({ ...d, status: 'EN_ROUTE', autopilot: true, tasks: { ...d.tasks, autoTrack: true }, targetWpIndex: -1, targetDetId: detId }));
    setDetections(prev => prev.map(d => (d.id === detId ? { ...d, acknowledged: true } : d)));
    log('WARNING', `${droneId} dispatched to ${det.kind.toLowerCase().replace('_', ' ')} ${det.id}`, droneId);
  }, [detections, patch, log]);

  // Night protocol: on entering night, every airborne payload switches to thermal so moving
  // heat signatures stay visible; on day it returns to RGB. Operators can still override per drone.
  const isNightRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isNightRef.current === isNight) return;
    const firstRun = isNightRef.current === null;
    isNightRef.current = isNight;
    if (firstRun && !isNight) return; // daylight at load: nothing to switch
    setDrones(prev => prev.map(d => d.status === 'OFFLINE' ? d : ({
      ...d,
      tasks: { ...d.tasks, thermalScan: isNight, nightVision: false },
      sensorMode: isNight ? 'THERMAL_WHITE_HOT' : 'RGB_4K',
    })));
    log(isNight ? 'WARNING' : 'INFO', isNight ? 'Night protocol: thermal imaging on all airborne payloads' : 'Daylight: payloads back to RGB');
  }, [isNight, log]);

  const setSensorMode = useCallback((id: string, mode: SensorMode) => {
    patch(id, d => ({ ...d, sensorMode: mode, tasks: { ...d.tasks, thermalScan: mode.startsWith('THERMAL'), nightVision: mode === 'NIGHT_VISION' } }));
  }, [patch]);

  // ---- 10 Hz tick ---------------------------------------------------------
  const detectionsRef = useRef(detections);
  useEffect(() => { detectionsRef.current = detections; }, [detections]);

  useEffect(() => {
    const dt = 0.1;
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setMissionElapsedSec(s => s + dt);
      if (tick % 10 === 0) setUplinkGbps(v => Math.max(1.4, Math.min(2.6, v + (Math.random() - 0.5) * 0.15)));

      setDrones(prev => prev.map(d0 => {
        if (liveRef.current.has(d0.id)) return d0; // real aircraft: telemetry comes from the link
        if (d0.status === 'OFFLINE') return d0;
        const d = { ...d0, tasks: { ...d0.tasks }, history: { ...d0.history } };
        const now = Date.now();

        // Target: waypoint, detection (if dispatched with autoTrack and targetWpIndex -1), or home.
        let tx = SITE.x, ty = SITE.y, talt = 30;
        if (d.status === 'RTH') { tx = SITE.x; ty = SITE.y; talt = 30; }
        else if (d.targetWpIndex === -1) {
          const det = d.targetDetId ? detectionsRef.current.find(x => x.id === d.targetDetId) : undefined;  // the one it was sent to
          if (det) { tx = det.x; ty = det.y; talt = 45; } else { d.targetWpIndex = 0; d.targetDetId = undefined; }
        }
        if (d.targetWpIndex >= 0 && d.status !== 'RTH') {
          const wp = WAYPOINTS[d.targetWpIndex]; tx = wp.x; ty = wp.y; talt = wp.altM;
        }

        const dist = Math.hypot(tx - d.x, ty - d.y);
        const arrived = dist < 14;
        const cruise = d.autopilot ? 11.8 : 0;

        if (d.status === 'MONITORING' || (!d.autopilot)) {
          // Hover: slow orbit around current point.
          d.headingDeg = (d.headingDeg + 0.6) % 360;
          d.groundSpeedMps = Math.max(0, d.groundSpeedMps - 2 * dt);
          d.verticalSpeedMps = (talt - d.altM) * 0.1;
        } else if (arrived) {
          if (d.status === 'RTH') {
            d.altM = Math.max(0, d.altM - 1.2 * dt * 10);
            d.groundSpeedMps = 0; d.verticalSpeedMps = -1.2;
            if (d.altM <= 0.1) { d.status = 'OFFLINE'; d.altM = 0; d.verticalSpeedMps = 0; d.signalPct = 0; }
          } else if (d.targetWpIndex === -1) {
            d.status = 'MONITORING';
          } else {
            const wp = WAYPOINTS[d.targetWpIndex];
            if (d.holdRemainingSec <= 0 && d.status !== 'ON_PATROL') { d.holdRemainingSec = wp.holdSec; d.status = 'ON_PATROL'; }
            d.holdRemainingSec -= dt;
            d.groundSpeedMps = Math.max(0, d.groundSpeedMps - 3 * dt);
            d.headingDeg = (d.headingDeg + 1.2) % 360;
            if (d.holdRemainingSec <= 0) { d.targetWpIndex = (d.targetWpIndex + 1) % WAYPOINTS.length; d.status = 'EN_ROUTE'; }
          }
        } else {
          const ang = Math.atan2(ty - d.y, tx - d.x);
          const want = (ang * 180) / Math.PI + 90;
          const diff = ((want - d.headingDeg + 540) % 360) - 180;
          d.headingDeg = (d.headingDeg + diff * 0.15 + 360) % 360;
          d.groundSpeedMps = Math.min(cruise + Math.sin(now / 700) * 0.4, d.groundSpeedMps + 2.5 * dt);
          const step = (d.groundSpeedMps / METERS_PER_PX) * dt;
          d.x += Math.cos(ang) * Math.min(step, dist); d.y += Math.sin(ang) * Math.min(step, dist);
          d.distanceFlownM += d.groundSpeedMps * dt;
          d.verticalSpeedMps = (talt - d.altM) * 0.15;
          if (d.status !== 'RTH') d.status = 'EN_ROUTE';
        }
        d.altM += d.verticalSpeedMps * dt;

        // Power model: current tracks speed + payload load.
        const payloadLoad = (d.tasks.illumination ? 3.2 : 0) + (d.tasks.thermalScan ? 1.1 : 0) + (d.tasks.nightVision ? 0.6 : 0);
        d.currentA = 12 + d.groundSpeedMps * 0.55 + payloadLoad + (Math.random() - 0.5) * 0.4;
        d.battery = Math.max(0, d.battery - (d.currentA / 3600) * dt * 4.2);
        d.voltageV = 19.2 + (d.battery / 100) * 4.2;
        d.enduranceMin = Math.max(0, Math.round((d.battery / 100) * 190 / (d.currentA / 18)));
        d.tempC = Math.min(48, d.tempC + (d.currentA - 18) * 0.002 + (Math.random() - 0.5) * 0.05);
        d.egtC = 105 + d.currentA * 0.5 + (Math.random() - 0.5) * 2;

        // Link degrades with range from site.
        const siteRange = Math.hypot(d.x - SITE.x, d.y - SITE.y) * METERS_PER_PX;
        d.signalPct = Math.max(30, Math.min(99, 100 - siteRange / 45 + (Math.random() - 0.5) * 2));
        d.rttMs = Math.round(48 + siteRange / 60 + Math.random() * 8);
        d.packetLossPct = Math.max(0, (siteRange / 1400) + (Math.random() - 0.4) * 0.2);

        if (tick % 5 === 0) {
          d.history = {
            airspeed: [...d.history.airspeed.slice(1), d.groundSpeedMps + 0.6],
            vspeed: [...d.history.vspeed.slice(1), d.verticalSpeedMps],
            egt: [...d.history.egt.slice(1), d.egtC],
            signal: [...d.history.signal.slice(1), d.signalPct],
          };
        }
        return d;
      }));

      // Occasionally the payload finds something along the route.
      if (tick % 10 === 0 && Math.random() < 0.06 && detectionsRef.current.filter(x => !x.acknowledged).length < 3) {
        const flyers = dronesRef.current.filter(d => d.status !== 'OFFLINE');
        if (flyers.length) {
          const by = flyers[Math.floor(Math.random() * flyers.length)];
          const kinds: Detection['kind'][] = ['PERSON', 'VEHICLE', 'HEAT_SIGNATURE', 'UNKNOWN'];
          const kind = by.tasks.thermalScan ? 'HEAT_SIGNATURE' : kinds[Math.floor(Math.random() * 3)];
          detSeq += 1;
          const det: Detection = {
            id: `DET-${String(detSeq).padStart(2, '0')}`, kind,
            x: by.x + (Math.random() - 0.5) * 140, y: by.y + (Math.random() - 0.5) * 140,
            confidence: 0.6 + Math.random() * 0.35, firstSeenMs: Date.now(), byDroneId: by.id, acknowledged: false,
          };
          setDetections(prev => [det, ...prev].slice(0, 12));
          log(kind === 'PERSON' ? 'WARNING' : 'INFO', `${by.id} detected ${kind.toLowerCase().replace('_', ' ')} (${(det.confidence * 100).toFixed(0)}%)`, by.id);
        }
      }
    }, 100);
    return () => clearInterval(timer);
  }, [log]);

  // Battery warning from committed state, not from inside the tick's updater (which React may run twice).
  const battPrev = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    for (const d of drones) {
      const was = battPrev.current.get(d.id);
      if (was != null && was >= 20 && d.battery < 20 && !liveRef.current.has(d.id)) log('WARNING', `${d.id}: battery 20% — RTH recommended`, d.id);
      battPrev.current.set(d.id, d.battery);
    }
  }, [drones, log]);

  const selected = drones.find(d => d.id === selectedDroneId) ?? drones[0];

  // Route progress for the selected airframe: fraction of the loop completed, by leg.
  const routeProgress = (() => {
    if (!selected || selected.targetWpIndex < 0) return { legIndex: 0, legFraction: 0, distanceKm: 0, bearingDeg: 0, etaSec: 0 };
    const to = WAYPOINTS[selected.targetWpIndex];
    const from = WAYPOINTS[(selected.targetWpIndex + WAYPOINTS.length - 1) % WAYPOINTS.length];
    const legLen = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const remain = Math.hypot(to.x - selected.x, to.y - selected.y);
    const legFraction = Math.max(0, Math.min(1, 1 - remain / legLen));
    const bearing = ((Math.atan2(to.x - selected.x, -(to.y - selected.y)) * 180) / Math.PI + 360) % 360;
    return {
      legIndex: (selected.targetWpIndex + WAYPOINTS.length - 1) % WAYPOINTS.length,
      legFraction,
      distanceKm: (selected.distanceFlownM / 1000),
      bearingDeg: bearing,
      etaSec: selected.groundSpeedMps > 0.5 ? (remain * METERS_PER_PX) / selected.groundSpeedMps : 0,
    };
  })();

  return {
    drones, detections, events, selected, selectedDroneId, setSelectedDroneId,
    missionElapsedSec, uplinkGbps, routeProgress,
    isNight, nightMode, setNightMode, setSensorMode,
    toggleTask, setAutopilot, goToWaypoint, returnHome, setGimbal, setZoom, acknowledgeDetection, dispatchToDetection,
    applyLiveTelemetry, releaseLive, waypointLatLon, pointLatLon,
  };
}
