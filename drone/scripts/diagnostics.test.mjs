// Aircraft health tests: decoders against pymavlink, fault analysis, simulated faults end to end. Run with `npm test`.
import { readFileSync } from 'fs';
import { transformSync } from 'esbuild';
import assert from 'assert';
const load = async rel => {
  const js = transformSync(readFileSync(new URL(rel, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' }).code;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
};
const mav = await load('../src/link/mavlink.ts');
const dec = await load('../src/diagnostics/decode.ts');
const H = await load('../src/diagnostics/health.ts');
const S = await load('../src/diagnostics/sim.ts');

const close = (a, b, eps = 1e-3, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} ${a} ≈ ${b}`);

// --- 1. decoders, byte for byte against pymavlink --------------------------------
const fx = JSON.parse(readFileSync(new URL('./fixtures/mavlink.json', import.meta.url), 'utf8')).health;
const hex = h => Uint8Array.from(h.match(/../g).map(b => parseInt(b, 16)));
const one = h => { const p = new mav.MavParser(); const fr = p.push(hex(h)); assert.equal(p.badCrc, 0, 'pymavlink frame passes our CRC'); assert.equal(fr.length, 1); return dec.decodeHealth(fr[0]); };
{
  let d = one(fx.servo_output_raw.frame);
  assert.equal(d.k, 'OUTPUTS'); assert.deepEqual(d.us.slice(0, 4), fx.servo_output_raw.us); assert.equal(d.us[8], 1000, 'servo9 from the extension');
  d = one(fx.vibration.frame);
  assert.equal(d.x, 12.5); assert.equal(d.y, 11.25); assert.equal(d.z, 31.5); assert.deepEqual(d.clip, [3, 0, 7]);
  d = one(fx.esc_1_to_4.frame);
  assert.equal(d.first, 0); assert.deepEqual(d.rpm, fx.esc_1_to_4.rpm); assert.deepEqual(d.tempC, fx.esc_1_to_4.tempC);
  d.currentA.forEach((c, i) => close(c, fx.esc_1_to_4.currentA[i], 1e-6, 'esc current')); d.voltageV.forEach((c, i) => close(c, fx.esc_1_to_4.voltageV[i], 1e-6, 'esc voltage'));
  d = one(fx.px4_esc_status.frame);
  assert.equal(d.first, 0); assert.deepEqual(d.rpm, fx.px4_esc_status.rpm); assert.deepEqual(d.currentA, fx.px4_esc_status.currentA); assert.deepEqual(d.tempC, [null, null, null, null]);
  d = one(fx.battery_cells.frame);
  assert.deepEqual(d.cellsV, fx.battery_cells.cells); assert.equal(d.tempC, 31.5); assert.equal(d.currentA, 21.5); assert.equal(d.remainingPct, 64); assert.equal(d.faults, 4);
  d = one(fx.battery_pack_only.frame);
  assert.deepEqual(d.cellsV, [], 'a single entry is the pack, not a cell'); assert.equal(d.packV, 15.6); assert.equal(d.tempC, null); assert.equal(d.currentA, null); assert.equal(d.remainingPct, null);
  d = one(fx.sys_status.frame);
  assert.equal(d.present, fx.sys_status.present); assert.equal(d.health, fx.sys_status.health); assert.equal(d.dropRatePct, 2.5);
  d = one(fx.ekf_status.frame);
  assert.equal(d.source, 'EKF'); close(d.compass, 0.61, 1e-6); close(d.posHoriz, 0.25, 1e-6); assert.equal(d.flags, 0x1ff);
  d = one(fx.estimator_status.frame);
  assert.equal(d.source, 'ESTIMATOR'); close(d.compass, 0.9, 1e-6); close(d.velocity, 0.2, 1e-6);
  d = one(fx.power_status.frame);
  assert.equal(d.vccV, 5.12); assert.equal(d.flags, 9);
  d = one(fx.autopilot_version.frame);
  assert.deepEqual([d.major, d.minor, d.patch, d.type, d.git], [4, 5, 7, 255, '2a3dc4b7']);
  d = one(fx.statustext.frame);
  assert.equal(d.severity, 2); assert.equal(d.text, fx.statustext.text);
}

// --- 2. motor balance: which part is it? ------------------------------------------
const QUAD = H.frameOf(2);
{
  const ok = H.analyzeBalance({ frame: QUAD, outputPct: [48, 49, 47.5, 48.5] });
  assert.equal(ok.findings.length, 0, 'a balanced quad is clean');

  // Motor 3 works 21% harder and spins faster: propeller.
  const prop = H.analyzeBalance({ frame: QUAD, outputPct: [47, 47, 58, 47], rpm: [6400, 6400, 6950, 6400], currentA: [8, 8, 11.5, 8] });
  assert.equal(prop.findings.length, 1); const pf = prop.findings[0];
  assert.equal(pf.motor, 3); assert.equal(pf.part, 'prop-3'); assert.equal(pf.action, 'REPLACE'); assert.equal(pf.level, 'FAULT');

  // Motor 2 works harder, same rpm, much more current: motor.
  const mot = H.analyzeBalance({ frame: QUAD, outputPct: [47.5, 53, 47.5, 47.5], rpm: [6400, 6380, 6400, 6410], currentA: [8, 10.6, 8, 8] });
  assert.equal(mot.findings[0].part, 'motor-2'); assert.equal(mot.findings[0].level, 'WATCH');

  // No ESC telemetry: says it can't tell prop from motor, asks for a hands-on check.
  const blind = H.analyzeBalance({ frame: QUAD, outputPct: [47, 47, 58, 47] });
  assert.equal(blind.findings[0].action, 'INSPECT'); assert.match(blind.findings[0].detail, /does not report motor rpm/);

  // Both clockwise motors (3, 4) high: twisted arm, not one motor.
  const arm = H.analyzeBalance({ frame: QUAD, outputPct: [46, 46, 50.5, 50.5] });
  assert.equal(arm.findings.length, 1); assert.equal(arm.findings[0].id, 'yaw'); assert.match(arm.findings[0].detail, /clockwise motors/);

  // Both front motors (1 and 3) high, spins balanced: off-centre load toward the nose.
  const cg = H.analyzeBalance({ frame: QUAD, outputPct: [52, 45, 52, 45] });
  assert.equal(cg.findings[0].id, 'cg'); assert.match(cg.findings[0].detail, /the nose/);

  // Saturation always reported.
  const sat = H.analyzeBalance({ frame: QUAD, outputPct: [60, 60, 60, 60], saturatedShare: [0, 0, 0.05, 0] });
  assert.equal(sat.findings[0].id, 'sat-3'); assert.equal(sat.findings[0].action, 'LAND');

  // Hexacopter geometry is used (six motors, one weak).
  const hexa = H.analyzeBalance({ frame: H.frameOf(13), outputPct: [45, 45, 45, 45, 55, 45] });
  assert.equal(hexa.findings[0].motor, 5);
}

// --- 3. monitor + simulated faults, full flights ------------------------------------
function fly(fault, { seconds = S.SIM_FLIGHT_S + 5, texts = [] } = {}) {
  const sim = new S.HealthSim(11); sim.fault = fault;
  const mon = new H.HealthMonitor(); mon.source = 'SIMULATION'; mon.aircraft = 'SIM-1';
  const reports = []; mon.onFlightEnd = r => reports.push(r);
  let t = 1_000_000, mid = null;
  // a few seconds on the bench, then fly
  for (let i = 0; i < 20; i++) { t += 250; const { state, msgs } = sim.step(0.25); mon.setState(state, t); msgs.forEach(m => mon.apply(m, t)); }
  const bench = mon.report(t);
  sim.takeoff();
  for (let s = 0; s < seconds * 4; s++) {
    t += 250; const { state, msgs } = sim.step(0.25); mon.setState(state, t); msgs.forEach(m => mon.apply(m, t));
    if (s === 240) texts.forEach(txt => mon.apply({ k: 'TEXT', severity: 2, text: txt }, t));
    if (s === 280) mid = mon.report(t);
  }
  return { bench, mid, after: mon.report(t), flight: reports[0], reports };
}
{
  const r = fly('NONE');
  assert.equal(r.bench.phase, 'BENCH'); assert.equal(r.bench.overall, 'OK', `bench clean: ${r.bench.findings.map(f => f.title)}`);
  assert.equal(r.mid.phase, 'FLYING'); assert.equal(r.mid.overall, 'OK', `healthy flight: ${r.mid.findings.map(f => f.title)}`); assert.equal(r.mid.verdict, 'All systems normal');
  assert.ok(r.flight, 'a report is written at disarm'); assert.equal(r.flight.overall, 'OK', `healthy report: ${r.flight.findings.map(f => f.title)}`);
  assert.ok(r.flight.airborneS > 100 && r.flight.airborneS <= 121, `airborne ${r.flight.airborneS}`);
  assert.equal(r.after.phase, 'LANDED'); assert.equal(r.after.verdict, 'Fit to fly');
  assert.equal(r.after.firmware, 'ArduPilot 4.5.7');
  assert.equal(r.mid.systems.length, 9); assert.ok(r.mid.systems.every(s => s.level === 'OK'), `all systems OK: ${r.mid.systems.filter(s => s.level !== 'OK').map(s => s.id)}`);
  assert.ok(r.flight.motors.every(m => Math.abs(m.deviationPct) < 4), 'healthy motors within 4%');
}
{
  const r = fly('PROP');
  const f = r.flight.findings.find(x => x.motor === 3);
  assert.ok(f, `prop fault found: ${r.flight.findings.map(x => x.id)}`); assert.equal(f.part, 'prop-3'); assert.equal(f.action, 'REPLACE');
  assert.equal(r.flight.overall, 'FAULT'); assert.match(r.flight.verdict, /^Ground it: propeller on motor 3/);
  assert.equal(r.mid.overall, 'FAULT', 'seen in flight too'); assert.match(r.mid.verdict, /^Land as soon as it is safe/);
  assert.equal(r.mid.motors[2].level, 'FAULT'); assert.equal(r.mid.motors[0].level, 'OK');
}
{
  const r = fly('MOTOR');
  const f = r.flight.findings.find(x => x.id === 'motor-2');
  assert.ok(f, `motor fault found: ${r.flight.findings.map(x => x.id)}`); assert.equal(f.part, 'motor-2');
  assert.ok(r.flight.findings.some(x => x.id === 'hotter-2'), 'and it runs hotter');
}
{
  const r = fly('ARM');
  assert.deepEqual(r.flight.findings.map(x => x.id), ['yaw']);
}
{
  const r = fly('VIBRATION');
  const ids = r.flight.findings.map(x => x.id);
  assert.ok(ids.includes('vibe') && ids.includes('clip'), `vibration + clipping: ${ids}`);
  assert.equal(r.flight.findings.find(x => x.id === 'vibe').level, 'FAULT');
}
{
  const r = fly('CELL');
  const f = r.flight.findings.find(x => x.id === 'cell-spread');
  assert.ok(f, `cell spread: ${r.flight.findings.map(x => x.id)}`); assert.equal(f.level, 'FAULT'); assert.ok(r.flight.maxCellSpreadV >= 0.2);
}
{
  const r = fly('COMPASS');
  assert.ok(r.mid.findings.some(x => x.system === 'NAVIGATION' && x.action === 'CALIBRATE'), `compass variance: ${r.mid.findings.map(x => x.id)}`);
}
{
  const r = fly('FIRMWARE');
  const f = r.bench.findings.find(x => x.id === 'fw-old');
  assert.ok(f, 'old firmware flagged on the bench'); assert.equal(f.action, 'UPDATE'); assert.match(f.detail, /ArduPilot 4\.3\.7 is older than 4\.5\.0/);
}
{
  // The autopilot's own warning is latched for the flight and lands in the report.
  const r = fly('NONE', { texts: ['Potential Thrust Loss (2)'] });
  assert.ok(r.mid.findings.some(x => x.id === 'sat-2' && x.action === 'LAND'));
  assert.ok(r.flight.findings.some(x => x.id === 'sat-2')); assert.ok(r.flight.events.some(e => /Thrust Loss/.test(e.text)));
}
{
  // Spinning up on the ground is not a flight.
  const sim = new S.HealthSim(3); const mon = new H.HealthMonitor(); const out = []; mon.onFlightEnd = r => out.push(r);
  let t = 0; sim.takeoff();
  for (let i = 0; i < 8; i++) { t += 250; const { state, msgs } = sim.step(0.25); mon.setState({ ...state, altRelM: 0, throttlePct: 10 }, t); msgs.forEach(m => mon.apply(m, t)); }
  mon.setState({ ...sim.step(0.25).state, armed: false }, t + 250);
  assert.equal(out.length, 0);
}
{
  // Stale data is not "fit to fly".
  const mon = new H.HealthMonitor();
  assert.equal(mon.report(10_000).overall, 'UNKNOWN'); assert.equal(mon.report(10_000).verdict, 'No aircraft data');
}

// --- 4. across flights ---------------------------------------------------------------
{
  const mk = (i, dev3) => ({ aircraft: 'A', source: 'SIMULATION', startedAt: i * 1000, endedAt: i * 1000 + 900, airborneS: 1800, overall: 'OK', verdict: '', frame: QUAD, findings: [],
    motors: [1, 2, 3, 4].map(n => ({ n, meanOutputPct: 48, deviationPct: n === 3 ? dev3 : -dev3 / 3, maxTempC: null, rpmRatio: null, currentRatio: null })), vibeMax: null, clipDelta: 0, minCellV: null, maxCellSpreadV: null, maxBatteryTempC: null, events: [] });
  const trend = H.motorTrend([mk(1, 0.5), mk(2, 1.2), mk(3, 3.1), mk(4, 5.2), mk(5, 7.4)]);
  assert.equal(trend[2].rising, true, 'motor 3 getting worse'); assert.equal(trend[0].rising, false);
  assert.equal(H.motorTrend([mk(1, 1), mk(2, 0.5), mk(3, 1.2)])[2].rising, false, 'noise is not a trend');

  // Parts life: 30 × 0.5 h flights = 15 h; props replaced after flight 20 → 5 h on the props.
  const reports = Array.from({ length: 30 }, (_, i) => mk(i + 1, 0));
  const life = H.partsLife(reports, [{ part: 'props', t: 20_500 }, { part: 'prop-3', t: 25_500 }], 1e9);
  const props = life.find(p => p.id === 'props'), frame = life.find(p => p.id === 'frame');
  close(props.hours, 5, 1e-9, 'prop hours since set replaced'); assert.equal(props.level, 'OK');
  close(frame.hours, 15, 1e-9); assert.equal(frame.level, 'OK');
  assert.equal(H.partsLife(Array.from({ length: 60 }, (_, i) => mk(i + 1, 0)), [], 1e9).find(p => p.id === 'frame').level, 'FAULT', '30 h on the frame is past its 25 h check');
}

console.log('diagnostics: all tests passed');
