// Control tests: the simulated autopilot's rules and the dispatcher at fleet scale. Run with `npm test`.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const V = await loadModule('../src/control/simVehicle.ts');
const C = await loadModule('../src/control/commander.ts');
const P = await loadModule('../src/control/protocol.ts');
const M = { ARM: 400, TAKEOFF: 22, LAND: 21, RTL: 20, MODE: 176, REPOSITION: 192 };
const run = (v, s) => { for (let i = 0; i < s * 20; i++) v.step(0.05); };

// --- the autopilot's rules --------------------------------------------------------------
{
  const v = new V.SimVehicle('A', { x: 0, y: 0 });
  v.prearm = () => 'PreArm: Battery 25% below arming minimum 30%';
  let a = v.handle({ cmd: M.ARM, params: [1] });
  assert.equal(a.result, 2); assert.match(a.text, /PreArm: Battery/);
  v.prearm = () => null;
  assert.equal(v.handle({ cmd: M.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: 20 } }).result, 4, 'no takeoff before arming');
  assert.equal(v.handle({ cmd: M.ARM, params: [1] }).result, 0);
  a = v.handle({ cmd: M.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: 20 } });
  assert.equal(a.result, 4); assert.match(a.text, /GUIDED/, 'ArduCopter refuses a takeoff outside GUIDED');
  assert.equal(v.handle({ cmd: M.MODE, params: [], mode: 'GUIDED' }).result, 0);
  assert.equal(v.handle({ cmd: M.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: 20 } }).result, 0);
  run(v, 12); assert.ok(Math.abs(v.z - 20) < 0.3, `climbed to 20 m: ${v.z}`); assert.equal(v.state, 'HOLD');
  assert.equal(v.handle({ cmd: M.ARM, params: [0] }).result, 2, 'no disarm in flight');
  assert.equal(v.handle({ cmd: M.REPOSITION, params: [], to: { x: 30, y: 40, altM: 25 } }).result, 0);
  run(v, 14); assert.ok(Math.hypot(v.x - 30, v.y - 40) < 0.5 && Math.abs(v.z - 25) < 0.3, `went to target: ${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`);
  assert.equal(v.handle({ cmd: M.RTL, params: [] }).result, 0);
  run(v, 40); assert.equal(v.state, 'GROUND'); assert.equal(v.armed, false, 'RTL lands and disarms'); assert.ok(Math.hypot(v.x, v.y) < 0.5, 'at home');
}
{
  const v = new V.SimVehicle('B', { x: 0, y: 0 });
  v.handle({ cmd: M.ARM, params: [1] }); run(v, 11);
  assert.equal(v.armed, false, 'disarms itself after 10 s idle on the ground');
  v.handle({ cmd: M.ARM, params: [1] }); v.handle({ cmd: M.MODE, params: [], mode: 'GUIDED' }); v.handle({ cmd: M.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: 10 } });
  run(v, 6);
  assert.equal(v.handle({ cmd: M.ARM, params: [0, P.FORCE_DISARM] }).result, 0, 'forced stop accepted');
  run(v, 3); assert.equal(v.state, 'DOWN'); assert.equal(v.handle({ cmd: M.ARM, params: [1] }).result, 2, 'a crashed aircraft will not arm');
}

// --- the dispatcher at 500 -------------------------------------------------------------------
function fleet(n, { silent = [], loss = 0, prearmFail = [] } = {}) {
  const vs = new Map(); for (let i = 0; i < n; i++) { const v = new V.SimVehicle(`D${i}`, { x: i, y: 0 }); if (prearmFail.includes(i)) v.prearm = () => 'PreArm: GPS not locked'; vs.set(v.id, v); }
  let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const pending = [];
  const com = new C.Commander({ autopilot: () => 'ARDUPILOT', send: (id, step) => { if (silent.includes(id) || rnd() < loss) return; pending.push({ id, step }); }, verify: (id, step) => P.stepDone(step, vs.get(id)) });
  const pump = now => { while (pending.length) { const { id, step } = pending.shift(); const a = vs.get(id).handle(step); if (rnd() >= loss) com.ack(id, step.cmd, a.result, now, a.text); } };
  return { vs, com, pump };
}
{
  const { vs, com, pump } = fleet(500, { silent: ['D7', 'D300'], loss: 0.02, prearmFail: [3, 250] });
  let now = 0;
  const ids = [...vs.keys()];
  const arm = com.dispatch({ k: 'ARM' }, ids, now, { hold: new Map([['D9', 'grounded: propeller on motor 3 is damaged']]) });
  let sentPerTick = 0;
  for (let i = 0; i < 400 && !arm.done; i++) { now += 50; com.tick(now); pump(now); }
  const k = C.counts(arm);
  assert.equal(arm.done, true, 'the batch finishes');
  assert.equal(k.HELD, 1); assert.equal(arm.targets.get('D9').reason, 'grounded: propeller on motor 3 is damaged');
  assert.equal(k.NO_RESPONSE, 2, 'the silent aircraft end as no response'); assert.match(arm.targets.get('D7').reason, /no answer after 3 tries/);
  assert.equal(k.REJECTED, 2); assert.equal(arm.targets.get('D3').reason, 'PreArm: GPS not locked');
  assert.equal(k.ACCEPTED, 495, `lost packets retried: ${JSON.stringify(k)}`);
  assert.ok(now <= 8000, `500 aircraft armed, silent ones timed out, in ${now} ms at 200 commands/s`);
  // Takeoff: two steps each (GUIDED, then TAKEOFF), staggered by row of 50.
  const armed = ids.filter(id => vs.get(id).armed);
  const firstSend = new Map();
  const orig = com['transport'].send; com['transport'].send = (id, step) => { if (!firstSend.has(id)) firstSend.set(id, now); orig(id, step); };
  const to = com.dispatch({ k: 'TAKEOFF', altM: 25 }, armed, now, { delayS: id => Math.floor(Number(id.slice(1)) / 50) * 1.0 });
  const t0 = now;
  for (let i = 0; i < 800 && !to.done; i++) { now += 50; com.tick(now); pump(now); for (const v of vs.values()) v.step(0.05); }
  assert.equal(C.counts(to).ACCEPTED, armed.length, `every armed aircraft took off: ${JSON.stringify(C.counts(to))}`);
  assert.ok(firstSend.get('D0') - t0 < 200 && firstSend.get('D499') - t0 >= 9000, `rows launch a second apart: D0 +${firstSend.get('D0') - t0} ms, D499 +${firstSend.get('D499') - t0} ms`);
  assert.equal(vs.get('D0').mode, 'GUIDED');
  assert.ok(vs.get('D499').armed && vs.get('D499').z > 1, 'the last row is armed and flying, not disarmed by the 10 s idle timer');
  // A newer command replaces an older one still waiting.
  const a = com.dispatch({ k: 'HOLD' }, ['D1'], now, { delayS: () => 5 });
  const b = com.dispatch({ k: 'LAND' }, ['D1'], now);
  for (let i = 0; i < 40; i++) { now += 50; com.tick(now); pump(now); }
  assert.equal(b.targets.get('D1').status, 'ACCEPTED'); assert.equal(a.targets.get('D1').status, 'HELD'); assert.equal(a.targets.get('D1').reason, 'replaced by a newer command');
}
{
  // Steps for PX4: no GUIDED, the takeoff goes straight in.
  assert.deepEqual(P.stepsFor({ k: 'TAKEOFF', altM: 10 }, 'PX4').map(s => s.cmd), [400, 22]);
  assert.deepEqual(P.stepsFor({ k: 'TAKEOFF', altM: 10 }, 'ARDUPILOT').map(s => s.cmd), [176, 400, 22]);
  const o = { lat: 37.8, lon: -122.4 }, p = P.toLatLon(o, 100, 50), back = P.toLocal(o, p.lat, p.lon);
  assert.ok(Math.abs(back.x - 100) < 0.01 && Math.abs(back.y - 50) < 0.01, 'local metres round-trip through lat/lon');
}
console.log('control: all tests passed');
