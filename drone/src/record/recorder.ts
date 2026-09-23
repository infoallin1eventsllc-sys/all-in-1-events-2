import { recordDb, type FlightEvent, type FlightSample, type FlightSession, type LinkSource, type Vertical } from './db';
import { rollupSession } from '../analytics/rollup';

/**
 * The flight recorder.
 *
 * One session per dashboard run. Dashboards push samples at 1 Hz and events as
 * they happen; both are buffered and flushed in batches so recording never
 * competes with the render loop. A session that saw nothing (no events, a handful
 * of samples) is discarded on close so the list stays meaningful.
 */

const FLUSH_MS = 4000;
const MIN_KEEP_SAMPLES = 10;

let session: FlightSession | null = null;
let sampleBuf: FlightSample[] = [];
let eventBuf: FlightEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(s: FlightSession | null) => void>();
const closedListeners = new Set<() => void>();

function notify() { listeners.forEach(l => l(session ? { ...session } : null)); }

async function flush() {
  if (!session) return;
  const s = sampleBuf; const e = eventBuf;
  sampleBuf = []; eventBuf = [];
  try {
    if (s.length) await recordDb.addSamples(s);
    if (e.length) await recordDb.addEvents(e);
    if (s.length || e.length) await recordDb.putSession(session);
  } catch {
    // Storage full or blocked (private mode). Recording is best-effort; the
    // dashboards must keep flying either way.
  }
}

export const recorder = {
  current: () => (session ? { ...session } : null),

  subscribe(fn: (s: FlightSession | null) => void) {
    listeners.add(fn); fn(session ? { ...session } : null);
    return () => { listeners.delete(fn); };
  },

  async start(vertical: Vertical, title: string, source: LinkSource) {
    if (session) await recorder.stop();
    if (!recordDb.available()) return null;
    session = {
      id: `${vertical.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      vertical, title, source, startedAt: Date.now(), aircraft: [], sampleCount: 0, eventCount: 0,
    };
    try { await recordDb.putSession(session); } catch { session = null; return null; }
    timer = setInterval(flush, FLUSH_MS);
    notify();
    recorder.event('SYSTEM', 'INFO', `Recording started · ${title} · ${source.toLowerCase()} link`);
    return session.id;
  },

  /** Called by a dashboard's 1 Hz tick, once per aircraft. */
  sample(row: Omit<FlightSample, 'sessionId'>) {
    if (!session) return;
    sampleBuf.push({ ...row, sessionId: session.id });
    session.sampleCount++;
    if (row.aircraft && !session.aircraft.includes(row.aircraft)) session.aircraft.push(row.aircraft);
  },

  event(kind: string, severity: FlightEvent['severity'], text: string, aircraft?: string) {
    if (!session) return;
    eventBuf.push({ sessionId: session.id, t: Date.now(), severity, kind, text, aircraft });
    session.eventCount++;
  },

  /** The link changed under us (simulation → Bluetooth, say). Recorded, not restarted. */
  setSource(source: LinkSource) {
    if (!session || session.source === source) return;
    recorder.event('SYSTEM', 'INFO', `Link changed to ${source.toLowerCase()}`);
    session.source = source;
    notify();
  },

  setNote(note: string) {
    if (!session) return;
    session.note = note;
    recordDb.putSession(session).catch(() => {});
    notify();
  },

  async stop() {
    if (!session) return;
    const closing = session;
    recorder.event('SYSTEM', 'INFO', 'Recording stopped');
    if (timer) { clearInterval(timer); timer = null; }
    closing.endedAt = Date.now();
    await flush();
    try {
      await recordDb.putSession(closing);
      // A session nobody did anything in is noise, not evidence.
      const [rows, evs] = await Promise.all([recordDb.samplesFor(closing.id), recordDb.eventsFor(closing.id)]);
      const empty = !rows.some(r => r.altM > 1) && !evs.some(e => e.kind !== 'SYSTEM');
      // A simulation someone glanced at for under a minute is not a flight. Live sessions are always kept.
      const glance = closing.source === 'SIMULATION' && closing.endedAt - closing.startedAt < 60_000;
      if ((closing.eventCount <= 2 && closing.sampleCount < MIN_KEEP_SAMPLES) || empty || glance) {
        await recordDb.deleteSession(closing.id);
      } else {
        // Condense the flight for Analytics before the raw rows can be pruned.
        const [samples, events] = await Promise.all([recordDb.samplesFor(closing.id), recordDb.eventsFor(closing.id)]);
        await recordDb.putRollups([rollupSession(closing, samples, events)]);
        await recordDb.prune();
      }
    } catch { /* best effort */ }
    session = null;
    notify();
    closedListeners.forEach(l => l());
  },

  /**
   * Sessions left open by a reload or a closed tab never reached stop(). Close
   * them from their last recorded row, and drop the empty ones (someone opened a
   * dashboard and left), so Records only lists flights.
   */
  async recoverOrphans() {
    if (!recordDb.available()) return 0;
    let fixed = 0;
    try {
      for (const s of await recordDb.listSessions()) {
        if (s.endedAt || s.id === session?.id) continue;
        const [samples, events] = await Promise.all([recordDb.samplesFor(s.id), recordDb.eventsFor(s.id)]);
        const airborne = samples.some(r => r.altM > 1);
        const acted = events.some(e => e.kind !== 'SYSTEM');
        const end = Math.max(s.startedAt, ...samples.map(r => r.t), ...events.map(e => e.t));
        if ((!airborne && !acted) || (s.source === 'SIMULATION' && end - s.startedAt < 60_000)) { await recordDb.deleteSession(s.id); fixed++; continue; }
        s.endedAt = end;
        s.sampleCount = samples.length; s.eventCount = events.length;
        await recordDb.putSession(s);
        await recordDb.putRollups([rollupSession(s, samples, events)]);
        fixed++;
      }
    } catch { /* best effort */ }
    return fixed;
  },

  /** Fires after a session is closed and its rollup is stored. */
  onClosed(fn: () => void) { closedListeners.add(fn); return () => { closedListeners.delete(fn); }; },
};

// A closed tab should not lose the last few seconds.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flush(); });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function download(name: string, body: BlobPart, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function exportSessionCsv(s: FlightSession) {
  const [samples, events] = await Promise.all([recordDb.samplesFor(s.id), recordDb.eventsFor(s.id)]);
  const rows: string[] = [];
  rows.push(['record', 'time_utc', 'aircraft', 'lat', 'lon', 'alt_m', 'speed_mps', 'heading_deg', 'battery_pct', 'detail'].map(csvCell).join(','));
  for (const r of samples) {
    rows.push(['SAMPLE', new Date(r.t).toISOString(), r.aircraft, r.lat ?? '', r.lon ?? '', r.altM.toFixed(1), r.speedMps.toFixed(1), r.headingDeg.toFixed(0), r.batteryPct.toFixed(0),
      r.extra ? Object.entries(r.extra).map(([k, v]) => `${k}=${v}`).join(' ') : ''].map(csvCell).join(','));
  }
  for (const e of events) {
    rows.push([`EVENT/${e.kind}`, new Date(e.t).toISOString(), e.aircraft ?? '', '', '', '', '', '', '', `${e.severity}: ${e.text}`].map(csvCell).join(','));
  }
  download(`${s.id}.csv`, rows.join('\n'), 'text/csv');
}

export async function exportSessionJson(s: FlightSession) {
  const [samples, events] = await Promise.all([recordDb.samplesFor(s.id), recordDb.eventsFor(s.id)]);
  download(`${s.id}.json`, JSON.stringify({ session: s, samples, events }, null, 2), 'application/json');
}

// ---------------------------------------------------------------------------
// Derived summary for the report
// ---------------------------------------------------------------------------

export interface SessionSummary {
  durationS: number;
  aircraft: string[];
  maxAltM: number;
  maxSpeedMps: number;
  minBatteryPct: number;
  distanceM: number;
  criticalEvents: number;
  warningEvents: number;
  commands: number;
}

export function summarise(s: FlightSession, samples: FlightSample[], events: FlightEvent[]): SessionSummary {
  const perAircraft = new Map<string, FlightSample[]>();
  for (const r of samples) {
    const list = perAircraft.get(r.aircraft) ?? [];
    list.push(r); perAircraft.set(r.aircraft, list);
  }
  let distanceM = 0;
  for (const list of perAircraft.values()) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
        // Equirectangular is accurate enough over a patrol-sized area.
        const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos((a.lat * Math.PI) / 180);
        distanceM += Math.hypot((b.lat - a.lat) * mPerDegLat, (b.lon - a.lon) * mPerDegLon);
      } else {
        distanceM += b.speedMps * Math.max(0, (b.t - a.t) / 1000);
      }
    }
  }
  return {
    durationS: ((s.endedAt ?? Date.now()) - s.startedAt) / 1000,
    aircraft: s.aircraft,
    maxAltM: samples.reduce((m, r) => Math.max(m, r.altM), 0),
    maxSpeedMps: samples.reduce((m, r) => Math.max(m, r.speedMps), 0),
    minBatteryPct: samples.reduce((m, r) => Math.min(m, r.batteryPct), 100),
    distanceM,
    criticalEvents: events.filter(e => e.severity === 'CRITICAL').length,
    warningEvents: events.filter(e => e.severity === 'WARNING').length,
    commands: events.filter(e => e.kind === 'COMMAND').length,
  };
}
