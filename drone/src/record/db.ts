import type { SessionRollup } from '../analytics/rollup';
import type { ServiceRecord } from '../analytics/aggregate';

/**
 * Flight recorder storage.
 *
 * IndexedDB, no dependencies. Five stores:
 *   sessions     one per dashboard run — what flew, when, on what link
 *   samples      periodic position/state rows, the flight path
 *   events       commands, alerts, detections, authorisations — what was done and why
 *   rollups      one small summary per closed session; never pruned (Analytics)
 *   maintenance  services logged per aircraft (Analytics → Fleet health)
 *
 * This is the local tier of the record the platform promises. A deployment with
 * the server-side time-series tier (architecture layer 08) syncs these rows up;
 * until then the browser holds them and can export them for an insurer.
 */

const DB_NAME = 'a1-drone-recorder';
const DB_VERSION = 2;

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
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`${store} request failed`));
  }));
}

function byIndex<T>(store: string, index: string, value: IDBValidKey): Promise<T[]> {
  return open().then(db => new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error(`${store} index read failed`));
  }));
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
  addSamples: (rows: FlightSample[]) => open().then(db => new Promise<void>((resolve, reject) => {
    if (rows.length === 0) return resolve();
    const t = db.transaction('samples', 'readwrite');
    const st = t.objectStore('samples');
    for (const r of rows) st.add(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('sample write failed'));
  })),
  addEvents: (rows: FlightEvent[]) => open().then(db => new Promise<void>((resolve, reject) => {
    if (rows.length === 0) return resolve();
    const t = db.transaction('events', 'readwrite');
    const st = t.objectStore('events');
    for (const r of rows) st.add(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('event write failed'));
  })),

  samplesFor: (sessionId: string) => byIndex<FlightSample>('samples', 'sessionId', sessionId).then(r => r.sort((a, b) => a.t - b.t)),
  eventsFor: (sessionId: string) => byIndex<FlightEvent>('events', 'sessionId', sessionId).then(r => r.sort((a, b) => a.t - b.t)),

  /**
   * Delete a session's record. Pruning keeps the rollup (the flight still happened
   * and still counts in Analytics); an operator deleting a record removes it too.
   */
  deleteSession: async (id: string, keepRollup = false) => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['sessions', 'samples', 'events', 'rollups'], 'readwrite');
      t.objectStore('sessions').delete(id);
      if (!keepRollup) t.objectStore('rollups').delete(id);
      for (const store of ['samples', 'events'] as const) {
        const idx = t.objectStore(store).index('sessionId');
        const cur = idx.openKeyCursor(IDBKeyRange.only(id));
        cur.onsuccess = () => { const c = cur.result; if (c) { t.objectStore(store).delete(c.primaryKey); c.continue(); } };
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error('delete failed'));
    });
  },

  /** Keep storage bounded: drop the oldest sessions beyond `keep`. */
  prune: async (keep = 50) => {
    const all = await recordDb.listSessions();
    for (const s of all.slice(keep)) await recordDb.deleteSession(s.id, true);
    return Math.max(0, all.length - keep);
  },

  // ---- Analytics ----
  putRollups: (rows: SessionRollup[]) => open().then(db => new Promise<void>((resolve, reject) => {
    if (rows.length === 0) return resolve();
    const t = db.transaction('rollups', 'readwrite');
    for (const r of rows) t.objectStore('rollups').put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('rollup write failed'));
  })),
  listRollups: () => tx<SessionRollup[]>('rollups', 'readonly', st => st.getAll()),
  /** Remove generated sample history (rollups and service entries), leaving real records alone. */
  clearSamples: async () => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['rollups', 'maintenance'], 'readwrite');
      for (const store of ['rollups', 'maintenance'] as const) {
        const cur = t.objectStore(store).openCursor();
        cur.onsuccess = () => { const c = cur.result; if (!c) return; if ((c.value as { sample?: boolean }).sample) c.delete(); c.continue(); };
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error('clear failed'));
    });
  },
  addService: (r: ServiceRecord) => tx<IDBValidKey>('maintenance', 'readwrite', st => st.add(r)),
  listService: () => tx<ServiceRecord[]>('maintenance', 'readonly', st => st.getAll()),
};
