// MAVLink codec tests: framing, CRC, split chunks, mission/goto encoders. Run with `npm test`.
import { readFileSync } from 'fs';
import { transformSync } from 'esbuild';
import assert from 'assert';
const src = readFileSync(new URL('../src/link/mavlink.ts', import.meta.url), 'utf8');
const js = transformSync(src, { loader: 'ts', format: 'esm' }).code;
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const p = new m.MavParser();
// Heartbeat round trip across a split chunk
const hb = m.encodeHeartbeat();
let frames = [...p.push(hb.subarray(0, 5)), ...p.push(hb.subarray(5))];
assert.equal(frames.length, 1); assert.equal(frames[0].msgId, 0); assert.equal(frames[0].sysId, 255); assert.equal(p.badCrc, 0);
// COMMAND_LONG RTL to sys 1
const f2 = p.push(m.encodeCommandLong(m.MAV_CMD.RETURN_TO_LAUNCH))[0];
assert.equal(f2.msgId, 76); assert.equal(f2.payload.getUint16(28, true), 20); assert.equal(f2.payload.getUint8(30), 1);
// Corrupt byte is rejected
const bad = Uint8Array.from(hb); bad[6] ^= 0x55; const before = p.badCrc;
assert.equal(p.push(bad).length, 0); assert.ok(p.badCrc > before);
// Decode a synthetic GLOBAL_POSITION_INT (we build the payload and frame it through the encoder path)
const gp = new Uint8Array(28); const v = new DataView(gp.buffer);
v.setUint32(0, 1000, true); v.setInt32(4, 337748940, true); v.setInt32(8, -1184090000, true); v.setInt32(12, 105000, true); v.setInt32(16, 50000, true);
v.setInt16(20, 300, true); v.setInt16(22, 0, true); v.setInt16(24, -50, true); v.setUint16(26, 9000, true);
// Frame it by borrowing the goto encoder's frame() through a public encoder: encodeGotoGlobal uses msg 86; instead test decodeInto with a hand frame
const t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, { seq: 0, sysId: 1, compId: 1, msgId: 33, payload: (() => { const b = new Uint8Array(255); b.set(gp); return new DataView(b.buffer); })() });
assert.ok(Math.abs(t.lat - 33.774894) < 1e-6); assert.equal(t.altRelM, 50); assert.equal(t.headingDeg, 90); assert.equal(t.vxMps, 3);
// Goto encodes position + frame 6 + position-only mask
const g = p.push(m.encodeGotoGlobal(33.774894, -118.409, 40))[0];
assert.equal(g.msgId, 86); assert.equal(g.payload.getInt32(4, true), 337748940); assert.equal(g.payload.getUint8(52), 6); assert.equal(g.payload.getUint16(48, true), 0x0ff8);
// Mission item int
const mi = p.push(m.encodeMissionItemInt(1, { lat: 33.77, lon: -118.4, altRelM: 60, holdS: 8 }, 1))[0];
assert.equal(mi.msgId, 73); assert.equal(mi.payload.getUint16(28, true), 1); assert.equal(mi.payload.getUint16(30, true), 16);
assert.equal(mi.payload.getFloat32(0, true), 8); assert.equal(mi.payload.getFloat32(24, true), 60); assert.equal(mi.payload.getUint8(35), 1);
const mc = p.push(m.encodeMissionCount(6))[0]; assert.equal(mc.msgId, 44); assert.equal(mc.payload.getUint16(0, true), 6);
// Mode + arm
const md = p.push(m.encodeSetMode(m.COPTER_MODE.GUIDED))[0]; assert.equal(md.payload.getUint16(28, true), 176); assert.equal(md.payload.getFloat32(4, true), 4);
const ar = p.push(m.encodeArm(true))[0]; assert.equal(ar.payload.getUint16(28, true), 400); assert.equal(ar.payload.getFloat32(0, true), 1);
assert.equal(p.badCrc, before + 1);
console.log('mavlink codec: all tests passed');
