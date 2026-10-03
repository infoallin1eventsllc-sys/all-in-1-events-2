import { recordDb, type FlightEvent, type FlightSample, type FlightSession, type LinkSource, type Vertical } from './db';
import { rollupSession } from '../analytics/rollup';
import { stamp, GENESIS } from './chain';
import { currentSnapshot } from '../compliance/store';
import { metresPerDegree } from '../lib/geo';

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
/** Unflushed rows held while storage is failing; beyond this the oldest go (samples are 1 Hz per aircraft). */
const MAX_BUF_SAMPLES = 3600, MAX_BUF_EVENTS = 2000;

let session: FlightSession | null = null;
/** Who is at the controls; stamped on every event (set by the operator menu). */
let operator = '';
let sampleBuf: FlightSample[] = [];
let eventBuf: FlightEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let droppedEvents = 0;
const listeners = new Set<(s: FlightSession | null) => void>();
const closedListeners = new Set<(sessionId: string) => void>();

function notify() { listeners.forEach(l => l(session ? { ...session } : null)); }

/** Flushes run one at a time: the event chain must be stamped in order. */
let flushing: Promise<void> = Promise.resolve();
function flush(target: FlightSession | null = session): Promise<void> {
  const run = () => doFlush(target);
  flushing = flushing.then(run, run);
  return flushing;
}

async function doFlush(target: FlightSession | null) {
  if (!target) return;
  const s = sampleBuf; const e = eventBuf;
  sampleBuf = []; eventBuf = [];
  if (droppedEvents && e.length) {
    e.unshift({ sessionId: target.id, t: e[0].t, severity: 'WARNING', kind: 'SYSTEM', text: `${droppedEvents} earlier events were not recorded: storage was unavailable` });
    droppedEvents = 0;
  }
  // Storage full or blocked (private mode): recording is best-effort, the dashboards must keep
  // flying either way. Samples are expendable; events are kept for the next flush (bounded).
  try { if (s.length) await recordDb.addSamples(s); } catch { /* dropped */ }
  if (e.length) {
    try {
      const head = await stamp(e, target.chainHead ?? GENESIS);
      await recordDb.addEvents(e);
      target.chainHead = head;             // only once stored: a failed write must not leave the head on unsaved events
    } catch {
      if (session === target) { eventBuf = [...e, ...eventBuf]; capEvents(); }
      return;
    }
  }
  try { if (s.length || e.length) await recordDb.putSession(target); } catch { /* next flush retries */ }
}

function capEvents() {
  const over = eventBuf.length - MAX_BUF_EVENTS;
  if (over > 0) { eventBuf.splice(0, over); droppedEvents += over; }
}

/**
 * start/stop run one after another, never interleaved: a quick switch between tabs used to run a
 * second stop() on a session already closing, which then cleared the session the next start() made.
 */
let lifecycle: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = lifecycle.then(fn, fn);
  lifecycle = p.catch(() => {});
  return p;
}

async function startNow(vertical: Vertical, title: string, source: LinkSource) {
  if (session) await stopNow();
  if (!recordDb.available()) return null;
  const s: FlightSession = {
    id: `${vertical.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    vertical, title, source, startedAt: Date.now(), aircraft: [], sampleCount: 0, eventCount: 0,
  };
  // Numbers only (certificate, registrations, waiver), as they stood at the start: the record must not change when the paperwork does.
  const papers = currentSnapshot(vertical, operator.split(' · ')[0]);
  if (papers) s.compliance = papers;
  session = s;
  try { await recordDb.putSession(s); } catch { if (session === s) session = null; return null; }
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void flush(); }, FLUSH_MS);
  notify();
  recorder.event('SYSTEM', 'INFO', `Recording started · ${title} · ${source.toLowerCase()} link`);
  return s.id;
}

async function stopNow() {
  if (!session) return;
  const closing = session;
  recorder.event('SYSTEM', 'INFO', 'Recording stopped');
  // No longer the live session: rows arriving while it closes are not written into it.
  session = null;
  if (timer) { clearInterval(timer); timer = null; }
  closing.endedAt = Date.now();
  await flush(closing);
  eventBuf = []; sampleBuf = []; droppedEvents = 0;   // anything that still could not be stored belongs to the closed session
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
  notify();
  closedListeners.forEach(l => l(closing.id));
}

export const recorder = {
  current: () => (session ? { ...session } : null),

  subscribe(fn: (s: FlightSession | null) => void) {
    listeners.add(fn); fn(session ? { ...session } : null);
    return () => { listeners.delete(fn); };
  },

  start: (vertical: Vertical, title: string, source: LinkSource) => serial(() => startNow(vertical, title, source)),

  /** Called by a dashboard's 1 Hz tick, once per aircraft. */
  sample(row: Omit<FlightSample, 'sessionId'>) {
    if (!session) return;
    sampleBuf.push({ ...row, sessionId: session.id });
    if (sampleBuf.length > MAX_BUF_SAMPLES) sampleBuf.splice(0, sampleBuf.length - MAX_BUF_SAMPLES);
    session.sampleCount++;
    if (row.aircraft && !session.aircraft.includes(row.aircraft)) session.aircraft.push(row.aircraft);
  },

  event(kind: string, severity: FlightEvent['severity'], text: string, aircraft?: string) {
    if (!session) return;
    eventBuf.push({ sessionId: session.id, t: Date.now(), severity, kind, text, aircraft, ...(operator ? { operator } : {}) });
    capEvents();
    session.eventCount++;
  },

  setOperator(label: string) {
    if (label === operator) return;
    const was = operator; operator = label;
    if (session && was) recorder.event('SYSTEM', 'INFO', `Operator changed to ${label}`);
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

  /** Close the session. Safe to call twice: the second call finds nothing open. */
  stop: () => serial(stopNow),

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
  onClosed(fn: (sessionId: string) => void) { closedListeners.add(fn); return () => { closedListeners.delete(fn); }; },
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
  rows.push(['record', 'time_utc', 'aircraft', 'lat', 'lon', 'alt_m', 'speed_mps', 'heading_deg', 'battery_pct', 'detail', 'operator', 'sha256'].map(csvCell).join(','));
  for (const r of samples) {
    rows.push(['SAMPLE', new Date(r.t).toISOString(), r.aircraft, r.lat ?? '', r.lon ?? '', r.altM.toFixed(1), r.speedMps.toFixed(1), r.headingDeg.toFixed(0), r.batteryPct.toFixed(0),
      r.extra ? Object.entries(r.extra).map(([k, v]) => `${k}=${v}`).join(' ') : ''].map(csvCell).join(','));
  }
  for (const e of events) {
    rows.push([`EVENT/${e.kind}`, new Date(e.t).toISOString(), e.aircraft ?? '', '', '', '', '', '', '', `${e.severity}: ${e.text}`, e.operator ?? '', e.hash ?? ''].map(csvCell).join(','));
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
        const { lat: mPerDegLat, lon: mPerDegLon } = metresPerDegree(a.lat);
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
