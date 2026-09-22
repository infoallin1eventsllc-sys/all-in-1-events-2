import type { FlightEvent, FlightSample, FlightSession, LinkSource, Vertical } from '../record/db';

/**
 * Flight rollups: the long-term memory behind Analytics.
 *
 * The recorder keeps full telemetry for the last 50 sessions and then prunes it;
 * that is the right size for evidence, the wrong size for trends. When a session
 * closes, it is condensed into one small rollup (a few hundred bytes per aircraft)
 * that is never pruned. Analytics reads only rollups, so a year of flying loads
 * instantly and survives the raw data being cleared.
 *
 * Pure functions: tested in scripts/analytics.test.mjs.
 */

export interface AircraftRollup {
  id: string;
  /** Seconds above 1 m. */
  airborneS: number;
  distanceM: number;
  maxAltM: number;
  maxSpeedMps: number;
  /** Sum of every battery drop, in percentage points (a swap does not reset it). */
  batteryUsedPct: number;
  /** Battery packs flown: one, plus one per swap (a rise of 30 points or more). */
  packs: number;
  minBatteryPct: number;
  /** Battery percentage used per airborne minute. Rising over weeks = an ageing pack. */
  drainPctPerMin: number;
  maxVibrationG?: number;
}

export interface NotableEvent { t: number; severity: 'WARNING' | 'CRITICAL'; kind: string; text: string; aircraft?: string }

export interface SessionRollup {
  sessionId: string;
  vertical: Vertical;
  title: string;
  source: LinkSource;
  startedAt: number;
  endedAt: number;
  durationS: number;
  aircraft: AircraftRollup[];
  events: { total: number; critical: number; warning: number; commands: number };
  /** Warnings and criticals, criticals first, capped. */
  notable: NotableEvent[];
  /** Per-product numbers: photos and coverage for surveys, deviation for shows, detections for patrols. */
  highlights: Record<string, number>;
  /** Generated sample history, not a real recording. */
  sample?: boolean;
}

const MAX_GAP_S = 5;       // a gap longer than this in the samples is not flight time
const AIRBORNE_M = 1;
const SWAP_RISE = 30;
const NOTABLE_CAP = 25;

function metresBetween(a: FlightSample, b: FlightSample): number {
  if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
    const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot((b.lat - a.lat) * mPerDegLat, (b.lon - a.lon) * mPerDegLon);
  }
  return b.speedMps * Math.min(MAX_GAP_S, Math.max(0, (b.t - a.t) / 1000));
}

export function rollupAircraft(id: string, rows: FlightSample[]): AircraftRollup {
  const list = [...rows].sort((a, b) => a.t - b.t);
  let airborneS = 0, distanceM = 0, used = 0, packs = list.length ? 1 : 0, maxVib: number | undefined;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const v = r.extra?.vibrationG;
    if (typeof v === 'number') maxVib = Math.max(maxVib ?? 0, v);
    if (i === 0) continue;
    const a = list[i - 1];
    const dt = Math.min(MAX_GAP_S, Math.max(0, (r.t - a.t) / 1000));
    if (a.altM > AIRBORNE_M || r.altM > AIRBORNE_M) { airborneS += dt; distanceM += metresBetween(a, r); }
    const d = a.batteryPct - r.batteryPct;
    if (d > 0) used += d; else if (-d >= SWAP_RISE) packs++;
  }
  return {
    id, airborneS, distanceM,
    maxAltM: list.reduce((m, r) => Math.max(m, r.altM), 0),
    maxSpeedMps: list.reduce((m, r) => Math.max(m, r.speedMps), 0),
    batteryUsedPct: used, packs,
    minBatteryPct: list.reduce((m, r) => Math.min(m, r.batteryPct), 100),
    drainPctPerMin: airborneS >= 60 ? used / (airborneS / 60) : 0,
    ...(maxVib != null ? { maxVibrationG: maxVib } : {}),
  };
}

export function rollupSession(s: FlightSession, samples: FlightSample[], events: FlightEvent[]): SessionRollup {
  const byAircraft = new Map<string, FlightSample[]>();
  for (const r of samples) { const l = byAircraft.get(r.aircraft) ?? []; l.push(r); byAircraft.set(r.aircraft, l); }
  const aircraft = [...byAircraft.entries()].map(([id, rows]) => rollupAircraft(id, rows));

  const notable: NotableEvent[] = events
    .filter(e => e.severity === 'CRITICAL' || e.severity === 'WARNING')
    .sort((a, b) => (a.severity === b.severity ? a.t - b.t : a.severity === 'CRITICAL' ? -1 : 1))
    .slice(0, NOTABLE_CAP)
    .map(e => ({ t: e.t, severity: e.severity as 'WARNING' | 'CRITICAL', kind: e.kind, text: e.text, ...(e.aircraft ? { aircraft: e.aircraft } : {}) }));

  const highlights: Record<string, number> = {};
  const extras = (k: string) => samples.map(r => r.extra?.[k]).filter((v): v is number => typeof v === 'number');
  if (s.vertical === 'SURVEY') {
    const photos = extras('photos'), rejected = extras('rejected'), cov = extras('coveredPct');
    if (photos.length) highlights.photos = Math.max(...photos);
    if (rejected.length) highlights.rejected = Math.max(...rejected);
    if (cov.length) highlights.coveredPct = Math.max(...cov);
  } else if (s.vertical === 'LIGHT_SHOW') {
    const dev = extras('deviationM'), sync = extras('syncMs');
    if (dev.length) highlights.maxDeviationM = Math.max(...dev);
    if (sync.length) highlights.avgSyncMs = sync.reduce((a, b) => a + b, 0) / sync.length;
  } else if (s.vertical === 'SURVEILLANCE') {
    highlights.detections = events.filter(e => /detected/i.test(e.text)).length;
  }

  const endedAt = s.endedAt ?? (samples.length ? samples[samples.length - 1].t : s.startedAt);
  return {
    sessionId: s.id, vertical: s.vertical, title: s.title, source: s.source, startedAt: s.startedAt, endedAt,
    durationS: Math.max(0, (endedAt - s.startedAt) / 1000),
    aircraft,
    events: {
      total: events.length,
      critical: events.filter(e => e.severity === 'CRITICAL').length,
      warning: events.filter(e => e.severity === 'WARNING').length,
      commands: events.filter(e => e.kind === 'COMMAND').length,
    },
    notable, highlights,
  };
}
