// Analytics: rollups condense a flight correctly, and the aggregates add up.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const R = await loadModule('../src/analytics/rollup.ts');
const A = await loadModule('../src/analytics/aggregate.ts');
const S = await loadModule('../src/analytics/sample.ts');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}±${tol}, got ${a}`);

// --- one aircraft: 10 min airborne at 1 Hz, 30% used, a swap, then 10% more ------
const t0 = Date.UTC(2026, 8, 1, 10);
const rows = [];
for (let i = 0; i <= 600; i++) rows.push({ sessionId: 's', t: t0 + i * 1000, aircraft: 'A', altM: i === 0 ? 0 : 60, speedMps: 10, headingDeg: 0, batteryPct: 100 - i * 0.05, extra: { vibrationG: i === 300 ? 0.71 : 0.4 } });
// swap: back to 100, fly 120 s more using 10 points
for (let i = 1; i <= 120; i++) rows.push({ sessionId: 's', t: t0 + (600 + i) * 1000, aircraft: 'A', altM: 60, speedMps: 10, headingDeg: 0, batteryPct: i === 1 ? 100 : 100 - (i - 1) * (10 / 119), extra: {} });
// a 30 s gap in telemetry is not counted as flight time beyond the 5 s cap
rows.push({ sessionId: 's', t: t0 + 750 * 1000, aircraft: 'A', altM: 60, speedMps: 10, headingDeg: 0, batteryPct: 90 });
const a = R.rollupAircraft('A', rows);
near(a.airborneS, 600 + 120 + 5, 1, 'airborne seconds (gap capped at 5 s)');
near(a.batteryUsedPct, 30 + 10, 0.2, 'battery used across both packs');
assert.equal(a.packs, 2, 'a rise of 30+ points is a swap');
near(a.drainPctPerMin, 40 / ((725) / 60), 0.05, 'drain per airborne minute');
near(a.distanceM, 725 * 10, 5, 'dead-reckoned distance without GPS');
assert.equal(a.maxVibrationG, 0.71);
// Ground-only telemetry is not flight time.
const ground = R.rollupAircraft('G', [0, 1, 2].map(i => ({ t: t0 + i * 1000, altM: 0.3, speedMps: 0, batteryPct: 99, headingDeg: 0 })));
assert.equal(ground.airborneS, 0); assert.equal(ground.drainPctPerMin, 0);

// --- a session --------------------------------------------------------------------
const session = { id: 'survey-x', vertical: 'SURVEY', title: 'Survey · Test', source: 'BLUETOOTH', startedAt: t0, endedAt: t0 + 800_000, aircraft: ['A'], sampleCount: rows.length, eventCount: 4 };
rows.forEach((r, i) => { r.extra = { ...r.extra, photos: i, rejected: Math.floor(i / 100), coveredPct: Math.min(100, i / 6) }; });
const events = [
  { sessionId: 's', t: t0 + 1, severity: 'INFO', kind: 'SYSTEM', text: 'start' },
  { sessionId: 's', t: t0 + 2, severity: 'WARNING', kind: 'SURVEY', text: 'Gust to 12 m/s — photos may blur' },
  { sessionId: 's', t: t0 + 3, severity: 'CRITICAL', kind: 'COMMAND', text: 'Return home' },
  { sessionId: 's', t: t0 + 4, severity: 'WARNING', kind: 'SURVEY', text: 'Gust to 13 m/s — photos may blur' },
];
const r = R.rollupSession(session, rows, events);
assert.equal(r.durationS, 800);
assert.deepEqual(r.events, { total: 4, critical: 1, warning: 2, commands: 1 });
assert.equal(r.notable[0].severity, 'CRITICAL', 'criticals first');
assert.equal(r.notable.length, 3, 'info events are not notable');
assert.equal(r.highlights.photos, rows.length - 1); assert.equal(r.highlights.coveredPct, 100);

// --- aggregates ---------------------------------------------------------------------
const now = Date.UTC(2026, 8, 22, 12);
const hist = S.sampleHistory(now);
assert.ok(hist.length > 90, `three months of sample history (${hist.length})`);
assert.ok(hist.every(h => h.sample && h.startedAt <= now), 'every sample rollup is flagged and in the past');
assert.deepEqual(S.sampleHistory(now).map(h => h.sessionId), hist.map(h => h.sessionId), 'deterministic');

const f = { days: 30, product: 'ALL', source: 'ALL', now };
const inP = A.filterRollups(hist, f);
assert.ok(inP.every(x => x.startedAt >= A.periodStart(30, now)), 'period filter');
const tot = A.totals(inP);
near(tot.flightHours, inP.reduce((s, x) => s + A.flightHours(x), 0), 1e-9, 'totals = sum of rollups');
assert.equal(tot.flights, inP.length);
assert.ok(tot.aircraft >= 44, 'show drones + patrol + survey aircraft');
const days = A.daily(inP, 30, now);
assert.equal(days.length, 30, 'one bin per day, empty days included');
near(days.reduce((s, d) => s + d.hours, 0), tot.flightHours, 1e-6, 'daily bins add up to the total');
near(days.reduce((s, d) => s + Object.values(d.byProduct).reduce((a, b) => a + b, 0), 0), tot.flightHours, 1e-6, 'per-product split adds up');
const weeks = A.bucket(A.daily(A.filterRollups(hist, { ...f, days: 91 }), 91, now), 7);
assert.equal(weeks.length, 13);
// The previous 30 days are fully covered, so the comparison is fair.
assert.ok(A.filterRollups(hist, f, 30, now - 30 * 86400000).length > 20, 'previous period has data');
// A few minutes of flying gives no rate at all rather than an alarming one.
assert.equal(A.totals([r]).alertsPer10h, null);
const prod = A.byProduct(inP);
near(prod.reduce((s, p) => s + p.share, 0), 1, 1e-9, 'shares sum to 1');
assert.deepEqual(prod.map(p => p.vertical), ['LIGHT_SHOW', 'SURVEY', 'SURVEILLANCE'], 'fixed product order');
assert.ok(A.filterRollups(hist, { ...f, source: 'SIM' }).every(x => x.source === 'SIMULATION'));
assert.ok(A.filterRollups(hist, { ...f, source: 'REAL' }).every(x => x.source !== 'SIMULATION'));
// Opening a dashboard without flying is a record, not a flight.
const visit = { ...hist[hist.length - 1], sessionId: 'visit', aircraft: [{ ...hist[hist.length - 1].aircraft[0], airborneS: 0 }] };
assert.equal(A.filterRollups([...hist, visit], f).includes(visit), false, 'zero-airborne sessions are not flights');
assert.equal(A.delta(12, 10), 20); assert.equal(A.delta(5, 0), null);

// Fleet health finds what the sample history hides.
const fl = A.sortFleet(A.fleet(hist, S.sampleService(now)));
const t60 = fl.find(x => x.id === 'T-60M');
assert.ok(t60.drainDriftPct > A.BATTERY_DRIFT_PCT, `T-60M battery drift ${t60.drainDriftPct?.toFixed(0)}%`);
assert.ok(['BATTERY', 'SERVICE_DUE'].includes(t60.health), 'T-60M flagged');
assert.equal(fl[0].health === 'OK', false, 'problems sort first');
const map1 = fl.find(x => x.id === 'MAP-1');
assert.ok(map1.lastService && map1.hoursSinceService < map1.hours, 'hours since service reset at the service date');
// Logging a service clears "service due".
const due = fl.find(x => x.health === 'SERVICE_DUE');
if (due) {
  const after = A.fleet(hist, [...S.sampleService(now), { aircraft: due.id, t: now, note: 'serviced' }]).find(x => x.id === due.id);
  assert.equal(after.hoursSinceService, 0); assert.notEqual(after.health, 'SERVICE_DUE');
}

// Alerts group by pattern, not by the numbers in them.
assert.equal(A.alertPattern('Gust to 12 m/s — photos may blur'), A.alertPattern('Gust to 13 m/s — photos may blur'));
assert.equal(A.alertPattern('T-60M: battery 20%'), A.alertPattern('T-70M: battery 19%'));
const top = A.topAlerts([r]);
assert.equal(top[0].severity, 'CRITICAL'); assert.equal(top.find(x => x.pattern.startsWith('Gust')).count, 2);
assert.ok(A.incidents(hist).length >= 1 && A.incidents(hist).every(x => x.severity === 'CRITICAL'));

console.log('analytics: all tests passed');
