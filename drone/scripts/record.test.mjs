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

console.log('flight recorder: all tests passed');
