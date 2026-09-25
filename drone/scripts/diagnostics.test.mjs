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

// --- 1b. battery and power edge cases (wire layout as pymavlink 2.4.49 packs it: BATTERY_STATUS '<iih10HhBBBbiB4HBI', SYS_STATUS '<IIIHHhHHHHHHb') ---
{
  const battery = ({ id = 0, cells = [], temp = 2500, current = 1000, remaining = 80, faults = 0 }) => {
    const b = new DataView(new ArrayBuffer(54));
    b.setInt16(8, temp, true);
    for (let i = 0; i < 10; i++) b.setUint16(10 + i * 2, cells[i] ?? 0xffff, true);
    b.setInt16(30, current, true); b.setUint8(32, id); b.setInt8(35, remaining); b.setUint32(50, faults, true);
    return { msgId: 147, payload: b };
  };
  let d = dec.decodeHealth(battery({ id: 2, cells: [4100, 4090, 4110, 4100] }));
  assert.equal(d.id, 2, 'battery id (byte 32) is kept, so monitors do not mix'); assert.deepEqual(d.cellsV, [4.1, 4.09, 4.11, 4.1]); close(d.packV, 16.4, 1e-9);
  // A 14S (~58 V) pack with no cell readings: one entry, the pack.
  d = dec.decodeHealth(battery({ cells: [58800] })); assert.deepEqual(d.cellsV, []); assert.equal(d.packV, 58.8);
  // A 24S pack over 65.534 V: 65534 in cell 0, the rest carried into cell 1. Not two cells.
  d = dec.decodeHealth(battery({ cells: [65534, 34266] })); assert.deepEqual(d.cellsV, [], 'split pack voltage is not cells'); close(d.packV, 99.8, 1e-9);
  // SYS_STATUS voltage_battery UINT16_MAX: not sent, not 65.5 V.
  const sys = new DataView(new ArrayBuffer(43)); sys.setUint16(14, 0xffff, true); sys.setInt16(16, -1, true);
  d = dec.decodeHealth({ msgId: 1, payload: sys }); assert.equal(d.packV, null); assert.equal(d.currentA, null);
  sys.setUint16(14, 15600, true); assert.equal(dec.decodeHealth({ msgId: 1, payload: sys }).packV, 15.6);

  // Two monitors on one aircraft (the flight pack and, say, a second pack or a servo rail): the instruments show the primary, the checks see both.
  const mon = new H.HealthMonitor(); const st = { armed: false, altRelM: 0, throttlePct: 0, groundspeedMps: 0, rollDeg: 0, pitchDeg: 0, vehicleType: 2, autopilot: 3, fixType: 3, satellites: 17, hdop: 0.7, radioRssi: 0 };
  mon.setState(st, 1000);
  for (let k = 0; k < 4; k++) {
    mon.apply(dec.decodeHealth(battery({ id: 0, cells: [4100, 4100, 4100, 4100], remaining: 80 })), 1000 + k);
    mon.apply(dec.decodeHealth(battery({ id: 1, cells: [4150, 3900], remaining: -1 })), 1000 + k);
  }
  const r = mon.report(1100);
  assert.equal(r.battery.remainingPct, 80, 'the primary pack\'s charge, not flickering to "unknown"'); assert.deepEqual(r.cellsV, [4.1, 4.1, 4.1, 4.1]);
  assert.ok(r.findings.some(f => f.id === 'cell-spread' && f.level === 'FAULT'), 'the second pack\'s 250 mV spread is still caught');
  const m2 = new H.HealthMonitor(); m2.setState(st, 1000); m2.apply(dec.decodeHealth({ msgId: 1, payload: (sys.setUint16(14, 0xffff, true), sys) }), 1000);
  assert.equal(m2.report(1100).systems.find(x => x.id === 'BATTERY').reading, 'Not reported by this aircraft');
}

// --- 1c. which output drives which motor --------------------------------------------
{
  const flyOutputs = (vehicleType, us) => {
    const mon = new H.HealthMonitor(); const out = []; mon.onFlightEnd = r => out.push(r);
    const st = armed => ({ armed, altRelM: armed ? 10 : 0, throttlePct: armed ? 50 : 0, groundspeedMps: 1, rollDeg: 0, pitchDeg: 0, vehicleType, autopilot: 3, fixType: 3, satellites: 17, hdop: 0.7, radioRssi: 0 });
    let t = 1000;
    for (let i = 0; i < 40; i++) { t += 250; mon.setState(st(true), t); mon.apply({ k: 'OUTPUTS', us: [...us, ...Array(16 - us.length).fill(0)] }, t); }
    const mid = mon.report(t);
    t += 250; mon.setState(st(false), t);
    return { mid, flight: out[0] };
  };
  // QuadPlane: outputs 1–4 fly the wing (ailerons, elevator, rudder all over the place), lift motors 1–4 on outputs 5–8.
  assert.deepEqual(H.frameOf(20).channels, [4, 5, 6, 7]); assert.deepEqual(H.frameOf(22).channels, [4, 5, 6, 7]);
  let r = flyOutputs(20, [1100, 1900, 1500, 1250, 1500, 1510, 1495, 1505]);
  assert.ok(r.flight, 'a flight is recorded'); assert.equal(r.flight.findings.length, 0, `wing servos are not motors: ${r.flight.findings.map(f => f.id)}`);
  assert.ok(r.mid.motors.every(mm => mm.outputPct > 45 && mm.outputPct < 55), 'motor outputs read from 5–8');
  r = flyOutputs(20, [1500, 1500, 1500, 1500, 1500, 1500, 1720, 1500]);
  assert.equal(r.flight.findings[0].motor, 3, 'lift motor 3 (output 7) working hard is found');
  // Tricopter: motors on outputs 1, 2 and 4; output 3 is unused (and the yaw servo is on 7).
  assert.deepEqual(H.frameOf(15).channels, [0, 1, 3]);
  r = flyOutputs(15, [1500, 1510, 1000, 1495, 0, 0, 1800]);   // output 3 idles at 1000: read as a motor it would look dead
  assert.equal(r.flight.findings.length, 0, `tricopter tail motor read from output 4: ${r.flight.findings.map(f => f.id)}`);
  // Tailsitters, tilt-rotors, anything else: which output is which motor varies, so balance is not analysed rather than guessed.
  for (const vt of [19, 21, 4, 3]) {
    r = flyOutputs(vt, [1100, 1900, 1500, 1250, 1500, 1510, 1495, 1505]);
    assert.equal(H.frameOf(vt).balance, false); assert.equal(r.flight.findings.length, 0, `no invented faults for type ${vt}`);
    assert.match(r.mid.systems.find(x => x.id === 'PROPULSION').reading, /Not analysed/);
  }
}

// --- 1d. autopilot text: a pre-arm refusal is a pre-arm refusal ---------------------------------
{
  const mon = new H.HealthMonitor(); mon.setState({ armed: false, altRelM: 0, throttlePct: 0, groundspeedMps: 0, rollDeg: 0, pitchDeg: 0, vehicleType: 2, autopilot: 3, fixType: 3, satellites: 17, hdop: 0.7, radioRssi: 0 }, 1000);
  mon.apply({ k: 'TEXT', severity: 4, text: 'PreArm: Internal errors 0x100000 l:0 CrashDump data' }, 1000);
  mon.apply({ k: 'TEXT', severity: 4, text: 'PreArm: Motors: ESC error' }, 1000);
  let ids = mon.report(1100).findings.map(f => f.id);
  assert.ok(!ids.includes('crash') && !ids.includes('esc-fail'), `pre-arm text is not a crash or an ESC failure: ${ids}`);
  assert.ok(ids.filter(id => id.startsWith('prearm-')).length === 2 && mon.report(1100).overall === 'WATCH');
  mon.apply({ k: 'TEXT', severity: 2, text: 'Crash: Disarming: AngErr=31>30, Accel<3.0' }, 1000);
  ids = mon.report(1100).findings.map(f => f.id);
  assert.ok(ids.includes('crash'), 'a real crash message still is one');
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
  // The disturbance follows the motor current: a power lead near the compass, told apart from the surroundings.
  const m = r.flight.findings.find(x => x.id === 'mag-current');
  assert.ok(m, `compass follows current: ${r.flight.findings.map(x => x.id)}`); assert.equal(m.part, 'compass'); assert.equal(m.action, 'INSPECT');
  assert.ok(r.mid.mag && r.mid.mag.r > 0.7, `strong correlation in flight: ${r.mid.mag && r.mid.mag.r}`);
}
{
  // A healthy aircraft: the compass does not follow the current, and the margin trace stays under the watch line.
  const r = fly('NONE');
  assert.ok(!r.flight.findings.some(x => x.id === 'mag-current'));
  assert.ok(r.mid.mag && r.mid.mag.r != null && r.mid.mag.r < 0.4, `no correlation: ${r.mid.mag && r.mid.mag.r}`);
  assert.ok(r.mid.stress.history.length > 30, 'a margin sample each second');
  assert.ok(r.mid.stress.now < 0.5, `healthy margin under watch: ${r.mid.stress.now} (${r.mid.stress.worst})`);
  assert.ok(r.mid.battery && r.mid.battery.currentA > 10, 'pack current reported'); assert.equal(r.mid.nav.source, 'EKF');
}
{
  // The margin trace names the tightest reading: a chipped prop puts motor 3 over the fault line.
  const r = fly('PROP');
  assert.ok(r.mid.stress.now >= 1, `prop fault at the limit: ${r.mid.stress.now}`); assert.match(r.mid.stress.worst, /Motor 3/);
}
{
  // Correlation needs the current to vary: a steady current says nothing either way.
  assert.equal(H.magCorrelation([[20, 0.1], [20.2, 0.5], [20.1, 0.2], [20, 0.3], [20.3, 0.1]]).r, null);
  const c = H.magCorrelation([[5, 0.1], [10, 0.2], [20, 0.4], [30, 0.6], [40, 0.8]]);
  close(c.r, 1, 1e-9, 'perfect correlation'); assert.ok(c.hi > c.lo);
  close(H.toMargin(30, 30, 60), 0.5, 1e-9, 'watch line at 0.5'); close(H.toMargin(60, 30, 60), 1, 1e-9, 'fault line at 1');
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
