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
// DO_ commands carry param1-4 and MAV_FRAME_MISSION (survey camera trigger every 15.8 m, one photo now)
const ct = p.push(m.encodeMissionItemInt(3, { lat: 0, lon: 0, altRelM: 0, command: 206, params: [15.8, 0, 1, 0], frame: 2 }))[0];
assert.equal(ct.payload.getUint16(30, true), 206); assert.equal(ct.payload.getUint8(34), 2);
assert.ok(Math.abs(ct.payload.getFloat32(0, true) - 15.8) < 1e-5); assert.equal(ct.payload.getFloat32(8, true), 1); assert.equal(ct.payload.getFloat32(12, true), 0);
// Waypoints keep frame 6 and yaw NaN (unchanged)
assert.equal(mi.payload.getUint8(34), 6); assert.ok(Number.isNaN(mi.payload.getFloat32(12, true)));
const mc = p.push(m.encodeMissionCount(6))[0]; assert.equal(mc.msgId, 44); assert.equal(mc.payload.getUint16(0, true), 6);
// Mode + arm
const md = p.push(m.encodeSetMode(m.COPTER_MODE.GUIDED))[0]; assert.equal(md.payload.getUint16(28, true), 176); assert.equal(md.payload.getFloat32(4, true), 4);
const ar = p.push(m.encodeArm(true))[0]; assert.equal(ar.payload.getUint16(28, true), 400); assert.equal(ar.payload.getFloat32(0, true), 1);
assert.equal(p.badCrc, before + 1);

// --- interop with pymavlink (the official implementation), fixtures from scripts/gen_mavlink_fixtures.py ---
const fs = await import('fs');
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/mavlink.json', import.meta.url), 'utf8'));
const hex = h => Uint8Array.from(h.match(/../g).map(b => parseInt(b, 16)));
const decodeOne = h => { const pp = new m.MavParser(); const fr = pp.push(hex(h)); assert.equal(pp.badCrc, 0, 'pymavlink frame passes our CRC'); assert.equal(fr.length, 1); return fr[0]; };
{
  const d = fx.decode;
  let t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d.gimbal_attitude.frame));
  assert.ok(Math.abs(t.gimbalPitchDeg - d.gimbal_attitude.pitch) < 0.01 && Math.abs(t.gimbalYawDeg - d.gimbal_attitude.yaw) < 0.01, `gimbal attitude ${t.gimbalPitchDeg}/${t.gimbalYawDeg}`);
  t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d.camera_feedback.frame));
  assert.equal(t.lastPhoto.idx, 42); assert.ok(Math.abs(t.lastPhoto.lat - d.camera_feedback.lat) < 1e-7 && Math.abs(t.lastPhoto.lon - d.camera_feedback.lon) < 1e-7); assert.equal(t.lastPhoto.altRelM, 60.25); assert.equal(t.photosReported, 1);
  t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d.mount_status.frame));
  assert.equal(t.gimbalPitchDeg, -30); assert.equal(t.gimbalYawDeg, 45);
  t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d.heartbeat_px4_mission.frame));
  assert.equal(m.autopilotOf(t), 'PX4'); assert.equal(m.modeName(t), 'AUTO');
  assert.equal(m.modeName(m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d.heartbeat_px4_rtl.frame))), 'RTL');
  t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d.heartbeat_ardupilot_guided.frame));
  assert.equal(m.autopilotOf(t), 'ARDUPILOT'); assert.equal(m.modeName(t), 'GUIDED');
}
{
  // Our encoders produce the same payload bytes as pymavlink for the same command.
  const e = fx.encode;
  const same = (bytes, ref, name) => {
    const fr = new m.MavParser().push(bytes)[0];
    assert.ok(fr, `${name}: our frame parses with a valid CRC`);
    assert.equal(fr.msgId, ref.msgId, `${name}: message id`);
    const ours = Buffer.from(bytes.subarray(10, 10 + bytes[1])).toString('hex');
    assert.equal(ours, ref.payload, `${name}: payload bytes match pymavlink`);
  };
  same(m.encodeGimbalPitchYaw(-30), e.gimbal_pitchyaw, 'gimbal pitch/yaw');
  same(m.encodeMountControl(-30), e.mount_control, 'mount control');
  same(m.encodeCameraZoom(50), e.zoom, 'zoom');
  same(m.encodeCameraSource('IR'), e.source_ir, 'camera source');
  same(m.encodeRelay(0, true), e.relay_on, 'relay');
  same(m.encodeTakePhoto(), e.photo, 'photo');
  same(m.encodeFlightMode('PX4', 'AUTO'), e.px4_mode_mission, 'PX4 mission mode');
  same(m.encodeFlightMode('ARDUPILOT', 'GUIDED'), e.ardu_mode_guided, 'ArduPilot guided');
  same(m.encodeReposition(33.774894, -118.409, 40), e.reposition, 'reposition (COMMAND_INT)');
  // PX4 takeoff altitude is AMSL: 105 m field elevation + 30 m climb.
  const to = new m.MavParser().push(m.encodeTakeoffFor('PX4', 30, { altMslM: 105, altRelM: 0 }))[0];
  assert.equal(to.payload.getFloat32(24, true), 135);
  const ta = new m.MavParser().push(m.encodeTakeoffFor('ARDUPILOT', 30, { altMslM: 105, altRelM: 0 }))[0];
  assert.equal(ta.payload.getFloat32(24, true), 30, 'ArduPilot takeoff altitude is relative');
  assert.equal(m.encodeFlightMode('PX4', 'OTHER'), null);
}
console.log('mavlink codec: all tests passed');
