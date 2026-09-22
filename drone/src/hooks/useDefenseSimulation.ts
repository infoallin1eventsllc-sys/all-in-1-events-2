import { useCallback, useEffect, useRef, useState } from 'react';
import { recorder } from '../record/recorder';

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

export type ThreatClass = 'DJI_OCUSYNC' | 'FPV_ANALOG' | 'WIFI_UAS' | 'FIXED_WING' | 'UNKNOWN' | 'REMOTE_ID';
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
  /** Set on tracks fed by a real sensor; the simulation never moves or auto-engages these. */
  live?: { source: 'REMOTE_ID'; uasId: string; uaType: string; operatorId?: string; lastSeenMs: number; lat: number; lon: number };
  /** Pilot position from Remote ID System messages, map px + WGS84. */
  operator?: { x: number; y: number; lat: number; lon: number };
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
  REMOTE_ID:   { protocol: 'Remote ID broadcast', freq: () => 2402, speed: () => 0, level: 'LOW' },
};

export interface RemoteIdState { url: string; status: 'OFF' | 'CONNECTING' | 'ON' | 'ERROR'; error: string; tracks: number; lastMessageMs: number }
export interface Venue { lat: number; lon: number }

/** WGS84 → map px around the protected asset. */
function toMap(venue: Venue, lat: number, lon: number) {
  const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos((venue.lat * Math.PI) / 180);
  return { x: ASSET.x + ((lon - venue.lon) * mPerDegLon) / METERS_PER_PX, y: ASSET.y - ((lat - venue.lat) * mPerDegLat) / METERS_PER_PX };
}

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
  // Real sensor: Remote ID receiver (hardware/companion-pi/remoteid) over WebSocket.
  const [remoteId, setRemoteId] = useState<RemoteIdState>({ url: (() => { try { return localStorage.getItem('a1-remoteid-url') || 'ws://192.168.1.60:8765'; } catch { return 'ws://192.168.1.60:8765'; } })(), status: 'OFF', error: '', tracks: 0, lastMessageMs: 0 });
  const [venue, setVenueState] = useState<Venue | null>(() => { try { const v = localStorage.getItem('a1-venue'); return v ? JSON.parse(v) : null; } catch { return null; } });
  const venueRef = useRef<Venue | null>(venue);
  useEffect(() => { venueRef.current = venue; }, [venue]);
  const wsRef = useRef<WebSocket | null>(null);
  /**
   * Effectors (jam / GNSS deny / takeover) are unlawful for anyone but a few US federal
   * agencies. They stay hidden until an authorized integrator enables them; the product
   * posture is detect → locate the operator → alert.
   */
  /**
   * Authorisation is deliberately weak to grant and easy to lose: it lives in
   * sessionStorage (gone when the tab closes), expires on its own, and is written
   * into the flight record when it changes. A persisted boolean in localStorage
   * would have meant one careless click authorised every future session on that
   * machine — the wrong default for a control that is a federal crime to misuse.
   */
  const [effectorAuth, setEffectorAuth] = useState<{ until: number; operator: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem('a1-effector-auth');
      const parsed = raw ? JSON.parse(raw) as { until: number; operator: string } : null;
      return parsed && parsed.until > Date.now() ? parsed : null;
    } catch { return null; }
  });
  const effectorsAuthorized = !!effectorAuth && effectorAuth.until > Date.now();
  // Expire it in place so the UI locks itself without a reload.
  useEffect(() => {
    if (!effectorAuth) return;
    const ms = effectorAuth.until - Date.now();
    if (ms <= 0) { setEffectorAuth(null); return; }
    const t = setTimeout(() => setEffectorAuth(null), ms);
    return () => clearTimeout(t);
  }, [effectorAuth]);

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
  const effectorsRef = useRef(effectorsAuthorized);
  useEffect(() => { effectorsRef.current = effectorsAuthorized; }, [effectorsAuthorized]);
  const refuse = useCallback(() => {
    log('CRITICAL', 'Effector command refused: not authorized. Posture is detect and alert; notify law enforcement.');
    recorder.event('AUTHORISATION', 'CRITICAL', 'Effector command refused — not authorised');
  }, [log]);

  const disruptTarget = useCallback((id: string) => {
    if (!effectorsRef.current) { refuse(); return; }
    setDisruption(d => ({ ...d, targetId: id }));
    setThreats(prev => prev.map(t => (t.id === id && t.status === 'TRACKING' ? { ...t, status: 'DISRUPTING', disruptProgress: 0 } : t)));
    const t = threatsRef.current.find(x => x.id === id);
    log('WARNING', `Effector ${disruptionRef.current.effector.replace('_', ' ')} engaged on ${id}${t ? ` (${t.protocol})` : ''}`, id);
  }, [log, refuse]);

  const disruptAll = useCallback(() => {
    if (!effectorsRef.current) { refuse(); return; }
    setThreats(prev => prev.map(t => (t.status === 'TRACKING' ? { ...t, status: 'DISRUPTING', disruptProgress: 0 } : t)));
    setDisruption(d => ({ ...d, sweepActive: true }));
    log('CRITICAL', 'Area denial: all active tracks engaged, omni sweep on');
  }, [log, refuse]);

  const cancelDisruption = useCallback(() => {
    setThreats(prev => prev.map(t => (t.status === 'DISRUPTING' ? { ...t, status: 'TRACKING', disruptProgress: 0 } : t)));
    setDisruption(d => ({ ...d, targetId: null, sweepActive: false }));
    log('INFO', 'All effectors stood down');
  }, [log]);

  const pulseBurst = useCallback(() => {
    if (!effectorsRef.current) { refuse(); return; }
    setDisruption(d => ({ ...d, pulseUntilMs: Date.now() + 1500 }));
    // A burst knocks RSSI down on every track inside the engage ring for a moment.
    setThreats(prev => prev.map(t => (rangeM(t) < ENGAGE_RING_PX * METERS_PER_PX ? { ...t, rssiDbm: t.rssiDbm - 12 } : t)));
    log('WARNING', '1.5 s wideband pulse burst emitted (engage ring)');
  }, [log, refuse]);

  const toggleSweep = useCallback(() => {
    if (!effectorsRef.current) { refuse(); return; }
    setDisruption(d => { log('INFO', d.sweepActive ? 'Sector sweep off' : 'Sector sweep on: 360° rotating beam'); return { ...d, sweepActive: !d.sweepActive }; });
  }, [log, refuse]);

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

  const setVenue = useCallback((v: Venue | null) => {
    setVenueState(v);
    try { if (v) localStorage.setItem('a1-venue', JSON.stringify(v)); else localStorage.removeItem('a1-venue'); } catch { /* ignore */ }
    if (v) log('INFO', `Venue position set to ${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`);
  }, [log]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) { log('WARNING', 'Geolocation not available in this browser'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => setVenue({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => log('WARNING', `Could not read location: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [setVenue, log]);

  const AUTH_HOURS = 4;
  /** `operator` identifies who accepted responsibility; it goes in the record. */
  const authorizeEffectors = useCallback((operator: string) => {
    const auth = { until: Date.now() + AUTH_HOURS * 3600_000, operator };
    setEffectorAuth(auth);
    try { sessionStorage.setItem('a1-effector-auth', JSON.stringify(auth)); } catch { /* ignore */ }
    log('CRITICAL', `Effector integration enabled by ${operator}. Expires in ${AUTH_HOURS} h or when this tab closes. Every effector command is logged.`);
    recorder.event('AUTHORISATION', 'CRITICAL', `Effectors authorised by ${operator} until ${new Date(auth.until).toISOString()}`);
  }, [log]);

  const revokeEffectors = useCallback(() => {
    setEffectorAuth(null);
    try { sessionStorage.removeItem('a1-effector-auth'); } catch { /* ignore */ }
    log('INFO', 'Effectors disabled. Detect-and-alert posture.');
    recorder.event('AUTHORISATION', 'INFO', 'Effector authorisation revoked');
    setDisruption(d => ({ ...d, autoEngage: false, sweepActive: false, targetId: null }));
    setThreats(prev => prev.map(t => (t.status === 'DISRUPTING' ? { ...t, status: 'TRACKING', disruptProgress: 0 } : t)));
  }, [log]);

  const notifySecurity = useCallback((id?: string) => {
    const t = id ? threatsRef.current.find(x => x.id === id) : null;
    const where = t?.operator ? ` · operator at ${t.operator.lat.toFixed(5)}, ${t.operator.lon.toFixed(5)}` : '';
    log('CRITICAL', `Security notified${t ? `: ${t.id} ${t.protocol} at ${rangeM(t).toFixed(0)} m, ${t.altitudeM.toFixed(0)} m AGL${where}` : ' of all active tracks'}`, id);
    // Integration point: SMS / radio dispatch / venue PA. The log is the audit record.
  }, [log]);

  const exportTrackLog = useCallback(() => {
    const rows = [['time', 'track', 'class', 'protocol', 'status', 'level', 'range_m', 'alt_m', 'speed_mps', 'rssi_dbm', 'uas_id', 'operator_lat', 'operator_lon', 'operator_id']];
    for (const t of threatsRef.current) rows.push([new Date(t.firstSeenMs).toISOString(), t.id, t.classification, t.protocol, t.status, t.level, rangeM(t).toFixed(0), t.altitudeM.toFixed(0), t.speedMps.toFixed(1), t.rssiDbm.toFixed(0), t.live?.uasId ?? '', t.operator?.lat.toFixed(6) ?? '', t.operator?.lon.toFixed(6) ?? '', t.live?.operatorId ?? '']);
    for (const e of [...events].reverse()) rows.push([e.ts, e.threatId ?? '', 'EVENT', e.severity, e.text, '', '', '', '', '', '', '', '', '']);
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `airspace-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }, [events]);

  /** Upsert a Remote ID track from the receiver's JSON. */
  const ingestRemoteId = useCallback((rec: { addr: string; rssi: number; basic_id?: { uas_id?: string; ua_type?: string }; location?: { lat: number; lon: number; height_m?: number | null; geo_alt_m?: number | null; speed_mps?: number | null; direction_deg?: number | null; status?: string }; system?: { operator_lat?: number; operator_lon?: number }; operator_id?: { operator_id?: string } }) => {
    const loc = rec.location; if (!loc || !loc.lat) return;
    let v = venueRef.current;
    if (!v) { v = { lat: loc.lat, lon: loc.lon }; venueRef.current = v; setVenueState(v); log('WARNING', 'Venue position not set — using the first Remote ID fix as the map origin. Set the venue in Sensors.'); }
    const uas = rec.basic_id?.uas_id || rec.addr.replace(/:/g, '').slice(-6);
    const id = `RID-${uas.slice(-6).toUpperCase()}`;
    const pos = toMap(v, loc.lat, loc.lon);
    const op = rec.system?.operator_lat && rec.system.operator_lon ? { ...toMap(v, rec.system.operator_lat, rec.system.operator_lon), lat: rec.system.operator_lat, lon: rec.system.operator_lon } : undefined;
    const now = Date.now();
    setThreats(prev => {
      const existing = prev.find(t => t.id === id);
      const r = Math.hypot(pos.x - ASSET.x, pos.y - ASSET.y) * METERS_PER_PX;
      const level: ThreatLevel = r < ENGAGE_RING_PX * METERS_PER_PX ? 'HIGH' : r < WARN_RING_PX * METERS_PER_PX ? 'MEDIUM' : 'LOW';
      const hd = ((loc.direction_deg ?? 0) - 90) * Math.PI / 180;
      const spd = (loc.speed_mps ?? 0) / METERS_PER_PX;
      const base: Threat = existing ?? {
        id, classification: 'REMOTE_ID', protocol: `Remote ID · ${rec.basic_id?.ua_type ?? 'aircraft'}`, freqMHz: 2402, rssiDbm: rec.rssi, x: pos.x, y: pos.y, vx: 0, vy: 0,
        altitudeM: 0, speedMps: 0, level, status: 'TRACKING', priority: false, firstSeenMs: now, disruptProgress: 0, trail: [], confidence: 1,
      };
      if (!existing) log('WARNING', `Remote ID: ${id} (${rec.basic_id?.ua_type ?? 'aircraft'}) ${uas} at ${r.toFixed(0)} m${op ? ' · operator located' : ''}`, id);
      const next: Threat = {
        ...base, x: pos.x, y: pos.y, vx: Math.cos(hd) * spd, vy: Math.sin(hd) * spd, rssiDbm: rec.rssi,
        altitudeM: loc.height_m ?? loc.geo_alt_m ?? base.altitudeM, speedMps: loc.speed_mps ?? base.speedMps, level: base.priority ? base.level : level,
        status: loc.status === 'ground' ? 'LOST' : base.status === 'LOST' ? 'TRACKING' : base.status,
        trail: base.trail.length === 0 || Math.hypot(pos.x - base.trail[base.trail.length - 1].x, pos.y - base.trail[base.trail.length - 1].y) > 4 ? [...base.trail.slice(-45), { x: pos.x, y: pos.y }] : base.trail,
        live: { source: 'REMOTE_ID', uasId: uas, uaType: rec.basic_id?.ua_type ?? 'aircraft', operatorId: rec.operator_id?.operator_id, lastSeenMs: now, lat: loc.lat, lon: loc.lon },
        operator: op ?? base.operator,
      };
      return existing ? prev.map(t => (t.id === id ? next : t)) : [...prev, next];
    });
  }, [log]);

  const connectRemoteId = useCallback((url: string) => {
    try { localStorage.setItem('a1-remoteid-url', url); } catch { /* ignore */ }
    wsRef.current?.close();
    setRemoteId(r => ({ ...r, url, status: 'CONNECTING', error: '' }));
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) { setRemoteId(r => ({ ...r, status: 'ERROR', error: e instanceof Error ? e.message : String(e) })); return; }
    wsRef.current = ws;
    ws.onopen = () => { setRemoteId(r => ({ ...r, status: 'ON', error: '' })); log('SUCCESS', `Remote ID receiver connected: ${url}`); };
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(ev.data);
        if (m.event === 'track') { ingestRemoteId(m.track); setRemoteId(r => ({ ...r, lastMessageMs: Date.now(), tracks: threatsRef.current.filter(t => t.live).length + 1 })); }
        if (m.event === 'lost') setThreats(prev => prev.map(t => (t.live && t.id.endsWith(String(m.addr).replace(/:/g, '').slice(-6).toUpperCase()) ? { ...t, status: 'LOST' } : t)));
      } catch { /* ignore malformed */ }
    };
    ws.onerror = () => setRemoteId(r => ({ ...r, status: 'ERROR', error: `Could not reach ${url}. Is a1-remoteid running, and wss:// if this page is https?` }));
    ws.onclose = () => { setRemoteId(r => (r.status === 'ERROR' ? r : { ...r, status: 'OFF' })); if (wsRef.current === ws) wsRef.current = null; };
  }, [ingestRemoteId, log]);

  const disconnectRemoteId = useCallback(() => { wsRef.current?.close(); wsRef.current = null; setRemoteId(r => ({ ...r, status: 'OFF' })); }, []);
  useEffect(() => () => { wsRef.current?.close(); }, []);

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

          if (t.live) {
            // Real track: position comes from the receiver. Drop it after 60 s of silence.
            if (now - t.live.lastSeenMs > 60000) continue;
            if (now - t.live.lastSeenMs > 30000 && t.status === 'TRACKING') t.status = 'LOST';
            next.push(t); continue;
          }

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
            if (d.autoEngage && effectorsRef.current && r < ENGAGE_RING_PX * METERS_PER_PX && (t.level === 'HIGH' || t.level === 'CRITICAL') && bandOk(t)) {
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
    // Real sensor + posture
    remoteId, connectRemoteId, disconnectRemoteId, venue, setVenue, useMyLocation,
    effectorsAuthorized, effectorAuth, authorizeEffectors, revokeEffectors, notifySecurity, exportTrackLog,
  };
}
