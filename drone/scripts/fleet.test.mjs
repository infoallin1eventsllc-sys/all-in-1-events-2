// Fleet health tests: per-aircraft routing, the simulated show fleet, fleet analytics and the go / hold. Run with `npm test`.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const F = await loadModule('../src/diagnostics/fleet.ts');
const FS = await loadModule('../src/diagnostics/fleetSim.ts');
const S = await loadModule('../src/diagnostics/sim.ts');

// --- pads ---------------------------------------------------------------------------
assert.equal(F.padLabel(0, 20), 'A01'); assert.equal(F.padLabel(25, 20), 'B06'); assert.equal(F.padLabel(26 * 20, 20), 'AA01');
assert.equal(F.gridCols(100), 13); assert.equal(F.gridCols(500), 29);

// --- routing: two aircraft on one monitor never mix ---------------------------------------
{
  const fleet = new F.FleetHealth();
  const bad = new S.HealthSim(5), good = new S.HealthSim(6); bad.fault = 'PROP';
  let t = 1e6;
  for (const s of [bad, good]) s.takeoff();
  for (let i = 0; i < 4 * 125; i++) {
    t += 250;
    for (const [id, s] of [['A', bad], ['B', good]]) { const { state, msgs } = s.step(0.25); fleet.setState(id, state, t, 0.25); msgs.forEach(m => fleet.apply(id, m, t)); }
    if (i === 280) {
      const [a, b] = fleet.summary(t);
      assert.equal(a.overall, 'FAULT', 'A has the chipped prop'); assert.equal(a.top.part, 'prop-3');
      assert.equal(b.overall, 'OK', `B stays healthy: ${b.findings.map(f => f.id)}`);
      assert.equal(F.groupKey(a.top), 'prop', 'grouped by the part it blames');
    }
  }
}

// --- the simulated show fleet ---------------------------------------------------------------
for (const n of [100, 250, 500]) {
  const fleet = new F.FleetHealth(); const sim = new FS.FleetSim(n); sim.seed(fleet);
  assert.equal(fleet.size(), n);
  let now = 1e6;
  for (let i = 0; i < 16; i++) { now += 250; sim.step(0.25, fleet, now); }
  now += 6000;                                                             // the silent ones go stale
  for (let i = 0; i < 4; i++) { now += 250; sim.step(0.25, fleet, now); }
  const bench = F.fleetStats(fleet.summary(now));
  assert.equal(bench.counts.READY + bench.counts.WATCH + bench.counts.GROUNDED + bench.counts.SILENT, n);
  assert.ok(bench.counts.SILENT >= 1, 'an aircraft off the link is counted, not hidden');
  assert.ok(bench.battery.below >= 1, `worn packs caught before the show (${n})`);
  assert.equal(bench.go, false); assert.match(F.goSentence(bench), /^Hold: .*[Ss]wap \d+ packs? under 40%/);
  assert.ok(bench.gates.find(g => g.id === 'battery').pads.length === bench.battery.below);
  assert.ok(bench.firmware.length >= 2, 'mixed firmware found');
  sim.takeoff();
  for (let i = 0; i < 4 * 80; i++) { now += 250; sim.step(0.25, fleet, now); }
  const air = F.fleetStats(fleet.summary(now));
  const keys = air.issues.map(g => g.key);
  for (const k of ['prop', 'motor', 'cell-spread', 'vibe', 'fw-old']) assert.ok(keys.includes(k), `${n}: ${k} across the fleet (${keys})`);
  assert.ok(air.counts.GROUNDED >= Math.round(n * 0.012), `${n}: chipped props grounded`);
  const healthy = fleet.summary(now).filter(a => sim.faults[sim.ids.indexOf(a.id)] === 'NONE' && a.overall !== 'UNKNOWN' && a.batteryPct >= 40);
  const falseAlarms = healthy.filter(a => a.overall !== 'OK');
  assert.ok(falseAlarms.length === 0, `${n}: no false alarms on healthy aircraft: ${falseAlarms.map(a => `${a.id} ${a.findings.map(f => f.id)}`)}`);
  assert.equal(air.bySystem.length, 9);
}

// --- a clean fleet is a go -----------------------------------------------------------------------
{
  const mk = (i, over = {}) => ({ id: `X${i}`, pad: F.padLabel(i, 10), overall: 'OK', phase: 'BENCH', verdict: 'Fit to fly', top: null, findings: [], batteryPct: 95, minCellV: 4.1, cellSpreadV: 0.01, vibe: 2, motorDev: 1, escMaxC: 31, navMax: 0.1, sats: 17, dropPct: 0.2, margin: 0.1, marginWorst: 'Vibration', firmware: 'ArduPilot 4.5.7', flightS: 0, systems: { GPS: 'OK' }, propHours: 10, motorHours: 40, ...over });
  const ok = F.fleetStats(Array.from({ length: 20 }, (_, i) => mk(i)));
  assert.equal(ok.go, true); assert.equal(F.goSentence(ok), 'Go: all 20 aircraft are ready.');
  const due = F.fleetStats([mk(0, { propHours: 55 }), mk(1, { motorHours: 210 }), mk(2)]);
  assert.deepEqual(due.service.propsDue, ['A01']); assert.deepEqual(due.service.motorsDue, ['A02']);

  // Gates pass on what an aircraft reports, never on what it does not: no charge reading or no GPS report holds the show.
  const noPack = F.fleetStats([...Array.from({ length: 5 }, (_, i) => mk(i)), mk(5, { batteryPct: null })]);
  const bg = noPack.gates.find(g => g.id === 'battery');
  assert.equal(bg.ok, false, 'an aircraft with no battery reading fails the battery gate'); assert.deepEqual(bg.pads, ['A06']); assert.match(bg.detail, /1 not reporting a charge/);
  assert.equal(noPack.go, false); assert.match(F.goSentence(noPack), /battery reading from 1 aircraft/);
  const noGps = F.fleetStats([mk(0), mk(1, { systems: { GPS: 'UNKNOWN' } }), mk(2, { systems: {} })]);
  const gg = noGps.gates.find(g => g.id === 'gps');
  assert.equal(gg.ok, false, 'no GPS report (fix type 0) is not a 3D fix'); assert.deepEqual(gg.pads, ['A02', 'A03']);
  assert.equal(F.fleetStats([mk(0, { systems: { GPS: 'WATCH' } })]).gates.find(g => g.id === 'gps').ok, true, 'a weak but 3D fix passes');
}

// --- one launch grid: fleet health, the light show sim and the exported package put aircraft n on the same pad ------
{
  const P = await loadModule('../src/lightshow/pads.ts');
  for (const n of [100, 500]) {
    const sim = new FS.FleetSim(n);
    sim.vehicles.forEach((v, i) => { const p = P.padXY(i, n); assert.ok(Math.abs(v.x - p.x) < 1e-9 && Math.abs(v.y - p.y) < 1e-9, `pad ${i} of ${n}`); });
    assert.equal(FS.FleetSim.PAD_M, P.PAD_SPACING_M);
  }
  assert.equal(F.gridCols(100), P.padCols(100)); assert.equal(F.padLabel(30, 13), P.padLabel(30, 13));
}

console.log('fleet: all tests passed');
