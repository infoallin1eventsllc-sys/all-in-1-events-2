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

console.log('flight recorder: all tests passed');
