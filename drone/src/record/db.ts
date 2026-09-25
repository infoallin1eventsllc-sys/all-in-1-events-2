import type { SessionRollup } from '../analytics/rollup';
import type { ServiceRecord } from '../analytics/aggregate';
import type { FlightHealth } from '../diagnostics/health';
import type { ComplianceSnapshot } from '../compliance/types';

/**
 * Flight recorder storage.
 *
 * IndexedDB, no dependencies. Five stores:
 *   sessions     one per dashboard run — what flew, when, on what link
 *   samples      periodic position/state rows, the flight path
 *   events       commands, alerts, detections, authorisations — what was done and why
 *   rollups      one small summary per closed session; never pruned (Analytics)
 *   maintenance  services and part replacements per aircraft (Analytics, Health)
 *   health       one aircraft-health report per flight (v3, Health → After landing)
 *
 * This is the local tier of the record the platform promises. A deployment with
 * the server-side time-series tier (architecture layer 08) syncs these rows up;
 * until then the browser holds them and can export them for an insurer.
 */

const DB_NAME = 'a1-drone-recorder';
const DB_VERSION = 3;

/** DEFENSE is retired; kept so sessions recorded before then still open. */
export type Vertical = 'SURVEILLANCE' | 'SURVEY' | 'LIGHT_SHOW' | 'DEFENSE';
export type LinkSource = 'SIMULATION' | 'BLUETOOTH' | 'SERIAL' | 'NETWORK';

export interface FlightSession {
  id: string;
  vertical: Vertical;
  title: string;
  source: LinkSource;
  startedAt: number;
  endedAt?: number;
  aircraft: string[];
  sampleCount: number;
  eventCount: number;
  /** Operator-entered note, e.g. the venue or client name. */
  note?: string;
  /** Demo content (src/demo/seed.ts): labelled on screen, removable in one click. */
  sample?: boolean;
  /** Hash of the last event written (src/record/chain.ts). */
  chainHead?: string;
  /** The Part 107 paperwork it started under: pilot certificate, registrations, waiver (src/compliance). */
  compliance?: ComplianceSnapshot;
}

export interface FlightSample {
  id?: number;
  sessionId: string;
  t: number;
  aircraft: string;
  lat?: number;
  lon?: number;
  altM: number;
  speedMps: number;
  headingDeg: number;
  batteryPct: number;
  /** Free-form per-vertical extras (sensor mode, track level, formation…). */
  extra?: Record<string, string | number | boolean>;
}

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';

export interface FlightEvent {
  id?: number;
  sessionId: string;
  t: number;
  severity: EventSeverity;
  /** COMMAND, ALERT, DETECTION, AUTHORISATION, SYSTEM */
  kind: string;
  text: string;
  aircraft?: string;
  /** Who was operating when this happened, e.g. "Otis · pilot in command". */
  operator?: string;
  /** Tamper-evident chain (src/record/chain.ts). */
  prev?: string;
  hash?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let gaveUp = false;
    // A failed or blocked open must not be cached forever: the next call tries again.
    const fail = (err: Error) => { gaveUp = true; if (dbPromise === p) dbPromise = null; reject(err); };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: 'id', autoIncrement: true }).createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('events')) {
        db.createObjectStore('events', { keyPath: 'id', autoIncrement: true }).createIndex('sessionId', 'sessionId');
      }
      // v2: Analytics
      if (!db.objectStoreNames.contains('rollups')) {
        db.createObjectStore('rollups', { keyPath: 'sessionId' }).createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains('maintenance')) {
        db.createObjectStore('maintenance', { keyPath: 'id', autoIncrement: true }).createIndex('aircraft', 'aircraft');
      }
      // v3: Aircraft health
      if (!db.objectStoreNames.contains('health')) {
        db.createObjectStore('health', { keyPath: 'id', autoIncrement: true }).createIndex('aircraft', 'aircraft');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (gaveUp) { db.close(); return; }                 // opened after we stopped waiting (was blocked)
      // Another tab upgrading the schema waits for every open connection to close: let it, and reopen on next use.
      db.onversionchange = () => { db.close(); if (dbPromise === p) dbPromise = null; };
      db.onclose = () => { if (dbPromise === p) dbPromise = null; };   // closed by the browser (storage cleared)
      resolve(db);
    };
    req.onerror = () => fail(req.error ?? new Error('IndexedDB open failed'));
    // An older version is open in another tab and won't close: don't hang every write behind it.
    req.onblocked = () => fail(new Error('IndexedDB upgrade blocked by another open tab'));
  });
  dbPromise = p;
  return p;
}

/**
 * Settles when the transaction does: resolves on complete (the data is committed, not merely
 * requested), rejects on error or abort. Quota errors arrive only as an abort, so without
 * onabort a full disk left every caller waiting forever.
 */
function settled(t: IDBTransaction, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error(`${what} failed`));
    t.onabort = () => reject(t.error ?? new DOMException(`${what} aborted`, 'AbortError'));
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(async db => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    await settled(t, `${store} ${mode}`);
    return req.result;
  });
}

function byIndex<T>(store: string, index: string, value: IDBValidKey): Promise<T[]> {
  return open().then(async db => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).getAll(value);
    await settled(t, `${store} index read`);
    return req.result as T[];
  });
}

/** One read-write transaction over `stores`, filled by `fn`; resolves once committed. */
function write(stores: string | string[], what: string, fn: (t: IDBTransaction) => void): Promise<void> {
  return open().then(db => {
    const t = db.transaction(stores, 'readwrite');
    const done = settled(t, what);
    fn(t);
    return done;
  });
}

export const recordDb = {
  available: () => typeof indexedDB !== 'undefined',

  putSession: (s: FlightSession) => tx('sessions', 'readwrite', st => st.put(s)),
  getSession: (id: string) => tx<FlightSession | undefined>('sessions', 'readonly', st => st.get(id)),
  listSessions: async (): Promise<FlightSession[]> => {
    const all = await tx<FlightSession[]>('sessions', 'readonly', st => st.getAll());
    return all.sort((a, b) => b.startedAt - a.startedAt);
  },

  /** Batched writes — the recorder buffers and flushes, so one transaction per flush. */
  addSamples: async (rows: FlightSample[]) => {
    if (rows.length) await write('samples', 'sample write', t => { const st = t.objectStore('samples'); for (const r of rows) st.add(r); });
  },
  addEvents: async (rows: FlightEvent[]) => {
    if (rows.length) await write('events', 'event write', t => { const st = t.objectStore('events'); for (const r of rows) st.add(r); });
  },

  samplesFor: (sessionId: string) => byIndex<FlightSample>('samples', 'sessionId', sessionId).then(r => r.sort((a, b) => a.t - b.t)),
  eventsFor: (sessionId: string) => byIndex<FlightEvent>('events', 'sessionId', sessionId).then(r => r.sort((a, b) => a.t - b.t)),

  /**
   * Delete a session's record. Pruning keeps the rollup (the flight still happened
   * and still counts in Analytics); an operator deleting a record removes it too.
   */
  deleteSession: (id: string, keepRollup = false) => write(['sessions', 'samples', 'events', 'rollups'], 'delete', t => {
    t.objectStore('sessions').delete(id);
    if (!keepRollup) t.objectStore('rollups').delete(id);
    for (const store of ['samples', 'events'] as const) {
      const idx = t.objectStore(store).index('sessionId');
      const cur = idx.openKeyCursor(IDBKeyRange.only(id));
      cur.onsuccess = () => { const c = cur.result; if (c) { t.objectStore(store).delete(c.primaryKey); c.continue(); } };
    }
  }),

  /** Keep storage bounded: drop the oldest sessions beyond `keep`. */
  prune: async (keep = 50) => {
    const all = await recordDb.listSessions();
    for (const s of all.slice(keep)) await recordDb.deleteSession(s.id, true);
    return Math.max(0, all.length - keep);
  },

  // ---- Analytics ----
  putRollups: async (rows: SessionRollup[]) => {
    if (rows.length) await write('rollups', 'rollup write', t => { for (const r of rows) t.objectStore('rollups').put(r); });
  },
  listRollups: () => tx<SessionRollup[]>('rollups', 'readonly', st => st.getAll()),
  /** Remove all demo content (rollups, service entries, health reports, sample flights), leaving real records alone. */
  clearSamples: async () => {
    for (const s of (await recordDb.listSessions()).filter(x => x.sample)) await recordDb.deleteSession(s.id);
    await write(['rollups', 'maintenance', 'health'], 'clear', t => {
      for (const store of ['rollups', 'maintenance', 'health'] as const) {
        const cur = t.objectStore(store).openCursor();
        cur.onsuccess = () => { const c = cur.result; if (!c) return; if ((c.value as { sample?: boolean }).sample) c.delete(); c.continue(); };
      }
    });
  },
  addService: (r: ServiceRecord) => tx<IDBValidKey>('maintenance', 'readwrite', st => st.add(r)),
  listService: () => tx<ServiceRecord[]>('maintenance', 'readonly', st => st.getAll()),

  // ---- Aircraft health ----
  addHealth: (r: FlightHealth) => tx<IDBValidKey>('health', 'readwrite', st => st.add(r)),
  listHealth: () => tx<FlightHealth[]>('health', 'readonly', st => st.getAll()),
  deleteHealth: (id: number) => tx<undefined>('health', 'readwrite', st => st.delete(id)),
};
