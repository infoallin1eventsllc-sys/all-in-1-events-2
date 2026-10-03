// Flight recorder: the summary an insurer reads must be arithmetically right.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const m = await loadModule('../src/record/recorder.ts');

const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const session = { id: 's1', vertical: 'SURVEILLANCE', title: 't', source: 'SERIAL', startedAt: t0, endedAt: t0 + 60_000, aircraft: ['A', 'B'], sampleCount: 4, eventCount: 3 };

// Two aircraft. A moves 0.001° of latitude (~111.32 m); B has no GPS, so distance
// falls back to speed × time (5 m/s for 2 s = 10 m).
const samples = [
  { sessionId: 's1', t: t0, aircraft: 'A', lat: 33.0, lon: -118.0, altM: 10, speedMps: 4, headingDeg: 90, batteryPct: 90 },
  { sessionId: 's1', t: t0 + 1000, aircraft: 'A', lat: 33.001, lon: -118.0, altM: 55, speedMps: 12, headingDeg: 90, batteryPct: 88 },
  { sessionId: 's1', t: t0, aircraft: 'B', altM: 20, speedMps: 5, headingDeg: 0, batteryPct: 40 },
  { sessionId: 's1', t: t0 + 2000, aircraft: 'B', altM: 25, speedMps: 5, headingDeg: 0, batteryPct: 17 },
];
const events = [
  { sessionId: 's1', t: t0, severity: 'INFO', kind: 'SYSTEM', text: 'start' },
  { sessionId: 's1', t: t0 + 500, severity: 'CRITICAL', kind: 'COMMAND', text: 'return to launch' },
  { sessionId: 's1', t: t0 + 900, severity: 'WARNING', kind: 'PATROL', text: 'battery low' },
];

const s = m.summarise(session, samples, events);
assert.equal(s.durationS, 60, 'duration from session bounds');
assert.equal(s.maxAltM, 55);
assert.equal(s.maxSpeedMps, 12);
assert.equal(s.minBatteryPct, 17, 'lowest battery across the whole fleet');
assert.equal(s.criticalEvents, 1);
assert.equal(s.warningEvents, 1);
assert.equal(s.commands, 1);
// 111.32 m of GPS movement + 10 m dead-reckoned.
assert.ok(Math.abs(s.distanceM - 121.32) < 1.5, `distance ${s.distanceM} should be ~121 m`);

// A session with a single sample per aircraft has travelled nowhere.
const still = m.summarise(session, [samples[0], samples[2]], []);
assert.equal(still.distanceM, 0);
assert.equal(still.criticalEvents, 0);


// Tamper-evident chain: intact verifies; an edit, a deletion or a reorder is caught at the right entry.
const c = await loadModule('../src/record/chain.ts');
const mk = () => [0, 1, 2, 3, 4].map(i => ({ id: i + 1, sessionId: 's9', t: t0 + i * 1000, severity: 'INFO', kind: i === 2 ? 'COMMAND' : 'SYSTEM', text: `entry ${i}`, operator: 'Pilot A · pilot in command' }));
const chain = mk(); const head = await c.stamp(chain);
assert.equal(head, chain[4].hash); assert.match(head, /^[0-9a-f]{64}$/);
assert.deepEqual(await c.verify(chain), { status: 'VERIFIED', checked: 5 });
assert.deepEqual(await c.verify([...chain].reverse()), { status: 'VERIFIED', checked: 5 }, 'display order does not matter; storage order does');
const edited = chain.map(e => ({ ...e })); edited[2].text = 'entry 2 (edited)';
assert.equal((await c.verify(edited)).brokenAt, 2);
const byWho = chain.map(e => ({ ...e })); byWho[1].operator = 'Someone else';
assert.equal((await c.verify(byWho)).brokenAt, 1);
const deleted = chain.filter((_, i) => i !== 3);
assert.equal((await c.verify(deleted)).brokenAt, 3);
const swapped = chain.map(e => ({ ...e })); [swapped[1].id, swapped[2].id] = [swapped[2].id, swapped[1].id];
assert.equal((await c.verify(swapped)).status, 'BROKEN');
assert.equal((await c.verify(mk())).status, 'UNSIGNED');
// Continuing a chain across flushes gives the same result as stamping all at once.
const a = mk(), b = mk(); const h1 = await c.stamp(a.slice(0, 2)); await c.stamp(a.slice(2), h1); await c.stamp(b);
assert.deepEqual(a.map(e => e.hash), b.map(e => e.hash));

// ---- The recorder against storage: a small in-memory IndexedDB that behaves like a browser's
// where it matters here (requests succeed first, the transaction commits or aborts afterwards,
// and a full disk shows up only as an abort).
const idb = (() => {
  const stores = new Map(), later = f => setTimeout(f, 0);
  const schema = { sessions: ['id', { startedAt: 'startedAt' }], samples: [null, { sessionId: 'sessionId' }], events: [null, { sessionId: 'sessionId' }], rollups: ['sessionId', {}], maintenance: [null, {}], health: [null, {}] };
  for (const [name, [keyPath, indexes]] of Object.entries(schema)) stores.set(name, { rows: new Map(), keyPath, indexes, seq: 0 });
  const state = { failWrites: false };
  const transaction = (_names, mode) => {
    const t = { error: null }; let pending = 0, done = false; const ops = [];
    const finish = () => later(() => {
      if (done) return; done = true;
      if (mode === 'readwrite' && state.failWrites && ops.length) { t.error = new DOMException('The quota has been exceeded.', 'QuotaExceededError'); t.onabort?.(); return; }
      ops.forEach(f => f()); t.oncomplete?.();
    });
    const req = fn => { const r = {}; pending++; later(() => { r.result = fn(); r.onsuccess?.(); if (--pending === 0) finish(); }); return r; };
    later(() => { if (pending === 0) finish(); });
    t.objectStore = name => {
      const s = stores.get(name);
      const write = v => req(() => { const k = s.keyPath ? v[s.keyPath] : ++s.seq; ops.push(() => s.rows.set(k, s.keyPath ? v : { ...v, id: k })); return k; });
      const where = (ix, val) => [...s.rows.entries()].filter(([, v]) => v[s.indexes[ix]] === val);
      return {
        put: write, add: write, get: k => req(() => s.rows.get(k)), getAll: () => req(() => [...s.rows.values()]),
        delete: k => req(() => { ops.push(() => s.rows.delete(k)); }),
        index: ix => ({
          getAll: val => req(() => where(ix, val).map(([, v]) => v)),
          openKeyCursor: range => {
            const keys = where(ix, range.only).map(([k]) => k); let i = 0; const r = {}; pending++;
            const step = () => later(() => { r.result = i < keys.length ? { primaryKey: keys[i], continue: () => { i++; step(); } } : null; const more = !!r.result; r.onsuccess?.(); if (!more && --pending === 0) finish(); });
            step(); return r;
          },
        }),
      };
    };
    return t;
  };
  const db = { transaction, close() {}, objectStoreNames: { contains: () => true } };
  return { state, stores, open() { const r = {}; later(() => { r.result = db; r.onsuccess?.(); }); return r; } };
})();
globalThis.indexedDB = idb; globalThis.IDBKeyRange = { only: v => ({ only: v }) };
const { recorder } = m;
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: still waiting after ${ms} ms`)), ms))]);
const fly = () => { for (let i = 0; i < 12; i++) recorder.sample({ t: Date.now() + i, aircraft: 'A', altM: 30, speedMps: 5, headingDeg: 0, batteryPct: 80 }); recorder.event('COMMAND', 'INFO', 'take off', 'A'); };

// A normal flight is stored, closed and chained.
const id1 = await recorder.start('SURVEILLANCE', 'Patrol', 'SERIAL');
fly();
await within(recorder.stop(), 2000, 'stop');
const s1 = idb.stores.get('sessions').rows.get(id1);
assert.ok(s1?.endedAt, 'session closed');
const ev1 = [...idb.stores.get('events').rows.values()].filter(e => e.sessionId === id1);
assert.equal(ev1.length, 3, 'started, command, stopped');
assert.deepEqual(await c.verify(ev1), { status: 'VERIFIED', checked: 3 });
assert.equal(s1.chainHead, ev1.at(-1).hash);

// Storage full: writes abort. The recorder must not hang (it used to wait forever for an abort it never handled).
const id2 = await recorder.start('SURVEILLANCE', 'Patrol', 'SERIAL');
idb.state.failWrites = true;
fly();
await within(recorder.stop(), 2000, 'stop with a full disk');
await within(recorder.start('SURVEILLANCE', 'Next', 'SERIAL'), 2000, 'start after a full disk');
idb.state.failWrites = false;
assert.notEqual(recorder.current()?.id, id2, 'a new session could start');
await recorder.stop();

// Quick tab switches: start/stop/stop/start issued back to back end with exactly the last session open.
const closed = []; const offClosed = recorder.onClosed(sid => closed.push(sid));
const pA = recorder.start('SURVEILLANCE', 'A', 'SERIAL'); const pS1 = recorder.stop(); const pS2 = recorder.stop(); const pB = recorder.start('SURVEY', 'B', 'SERIAL');
const [idA, , , idB] = await within(Promise.all([pA, pS1, pS2, pB]), 3000, 'switching');
assert.equal(recorder.current()?.id, idB, 'the last started session is the open one');
assert.deepEqual(closed, [idA], 'the first session closed exactly once');
await recorder.stop(); offClosed();
assert.equal(recorder.current(), null);

console.log('flight recorder: all tests passed');
