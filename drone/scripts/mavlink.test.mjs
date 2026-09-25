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
{
  // ArduPilot numbers modes per firmware, read from HEARTBEAT.type (pymavlink AP_MAV_TYPE_MODE_MAP).
  const d = fx.decode, e = fx.encode;
  const hbMode = k => m.modeName(m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(d[k].frame)));
  for (const k of ['heartbeat_plane_guided', 'heartbeat_plane_rtl', 'heartbeat_quadplane_qland', 'heartbeat_rover_guided']) assert.equal(hbMode(k), d[k].mode, k);
  // Copter's GUIDED (4) is Plane's ACRO: not read as Guided on a plane.
  assert.equal(m.modeName({ autopilot: 3, customMode: 4, vehicleType: 1 }), 'OTHER');
  assert.equal(m.modeName({ autopilot: 3, customMode: 4 }), 'GUIDED', 'no type yet: Copter numbering');
  const same = (bytes, ref, name) => assert.equal(Buffer.from(bytes.subarray(10, 10 + bytes[1])).toString('hex'), ref.payload, name);
  same(m.encodeFlightMode('ARDUPILOT', 'GUIDED', 1, 1), e.plane_mode_guided, 'plane GUIDED is 15');
  same(m.encodeFlightMode('ARDUPILOT', 'GUIDED', 1, 20), e.plane_mode_guided, 'quadplane GUIDED is 15');
  same(m.encodeFlightMode('ARDUPILOT', 'RTL', 1, 10), e.rover_mode_rtl, 'rover RTL is 11');
  same(m.encodeFlightMode('ARDUPILOT', 'LAND', 1, 20), e.quadplane_mode_qland, 'quadplane lands in QLAND');
  same(m.encodeFlightMode('ARDUPILOT', 'GUIDED', 1, 2), e.ardu_mode_guided, 'quad GUIDED is 4');
  assert.equal(m.encodeFlightMode('ARDUPILOT', 'LAND', 1, 1), null, 'a fixed wing has no land mode: nothing sent');
  assert.equal(m.encodeFlightMode('ARDUPILOT', 'GUIDED', 1, 12), null, 'ArduSub: refused, not sent with Copter numbers');
  // Stream requests are addressed to the system they are for.
  same(m.encodeSetInterval(33, 5, 2), e.set_interval_sys2, 'SET_MESSAGE_INTERVAL to system 2');
  // PX4 go-to: AMSL in MAV_FRAME_GLOBAL_INT, from the same home AMSL the takeoff uses; ArduPilot keeps relative.
  const tel = { altMslM: 125, altRelM: 20 };
  same(m.encodeRepositionFor('PX4', 33.774894, -118.409, 40, tel), e.px4_reposition_amsl, 'PX4 reposition AMSL');
  same(m.encodeRepositionFor('ARDUPILOT', 33.774894, -118.409, 40, tel), e.reposition, 'ArduPilot reposition relative');
}
{
  // FENCE_STATUS: breach_status is byte 6; byte 7 is breach_type, which stays set after the breach clears.
  const d = fx.decode;
  for (const k of ['fence_breached', 'fence_clear_after_breach']) {
    const t = m.decodeInto({ ...m.EMPTY_TELEMETRY, fenceBreached: !d[k].breached }, decodeOne(d[k].frame));
    assert.equal(t.fenceBreached, d[k].breached, k);
  }
  const r = decodeOne(d.radio_status_sik.frame);
  assert.equal(r.sysId, 51); assert.equal(r.compId, 68);
  // Only an autopilot's heartbeat makes a vehicle: not the radio, not a ground station.
  assert.equal(m.isVehicleHeartbeat(r), false);
  assert.equal(m.isVehicleHeartbeat(decodeOne(d.heartbeat_copter_guided_sys2.frame)), true);
  assert.equal(m.isVehicleHeartbeat(decodeOne(d.heartbeat_plane_guided.frame)), true);
  assert.equal(m.isVehicleHeartbeat(new m.MavParser().push(m.encodeHeartbeat())[0]), false, 'our own GCS heartbeat');
  const radioHb = new Uint8Array(9); radioHb[4] = 18; radioHb[5] = 8; // an onboard controller, MAV_AUTOPILOT_INVALID
  assert.equal(m.isVehicleHeartbeat(new m.MavParser().push(m.encodeRaw(0, radioHb, 51, 1))[0]), false);
  const t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, r);
  assert.equal(t.radioRssi, 180); assert.equal(t.radioRemRssi, 172); assert.equal(t.radioNoise, 40);
}
{
  // Parser resync: a stray 0xFD naming an unknown message (no CRC_EXTRA, so no CRC check) must not swallow the real frames after it.
  const hb = m.encodeHeartbeat(), cmd = m.encodeCommandLong(m.MAV_CMD.RETURN_TO_LAUNCH);
  const noise = Uint8Array.from([0xfd, 60, 0, 0, 7, 1, 1, 0x39, 0x30, 0x00]);  // "len 60", msg id 12345 (unknown)
  const pp = new m.MavParser();
  const got = pp.push(Uint8Array.from([...noise, ...hb, ...cmd, ...hb, ...cmd, ...hb]));
  assert.deepEqual(got.map(f => f.msgId), [0, 76, 0, 76, 0], `real frames recovered after a false start: ${got.map(f => f.msgId)}`);
  // A genuine unknown message is still passed through when the next frame follows it...
  const unk = m.encodeRaw(12345, Uint8Array.from([1, 2, 3, 4]), 1, 1);
  const p2 = new m.MavParser();
  assert.deepEqual(p2.push(Uint8Array.from([...unk, ...hb])).map(f => f.msgId), [12345, 0]);
  // ...and at the end of the buffer it waits for the next byte to decide, then is delivered.
  const p3 = new m.MavParser();
  assert.equal(p3.push(unk).length, 0);
  assert.deepEqual(p3.push(hb).map(f => f.msgId), [12345, 0]);
  // Unknown incompatibility flags (only signing exists) mark a false start.
  const p4 = new m.MavParser(), bad = Uint8Array.from(hb); bad[2] = 0x80;
  assert.deepEqual(p4.push(Uint8Array.from([...bad, ...hb])).map(f => f.msgId), [0]);
}
{
  // BLE writes: two frames sent at once go out whole, one after the other, never interleaved.
  const { chunkedWriter } = await (await import('./bundle.mjs')).loadModule('../src/link/writeQueue.ts');
  const wire = [];
  let fail = false;
  const write = chunkedWriter(async part => { await new Promise(r => setTimeout(r, Math.random() * 3)); if (fail) throw new Error('gatt'); wire.push(...part); }, 20);
  const a = m.encodeCommandLong(m.MAV_CMD.RETURN_TO_LAUNCH), b = m.encodeHeartbeat(), c = m.encodeTakePhoto();
  await Promise.all([write(a), write(b), write(c)]);
  assert.deepEqual(new m.MavParser().push(Uint8Array.from(wire)).map(f => f.msgId), [76, 0, 76], 'frames arrive whole and in order');
  fail = true; await assert.rejects(write(a)); fail = false;
  wire.length = 0; await write(b);
  assert.equal(new m.MavParser().push(Uint8Array.from(wire)).length, 1, 'a failed write does not stall the next');
}
{
  // Parameters, against pymavlink: ArduPilot casts integers to the float field, PX4 copies their bytes.
  for (const [k, ref] of Object.entries(fx.param)) {
    const f = decodeOne(ref.frame);
    if (ref.error !== undefined) { assert.deepEqual(m.decodeParamError(f), { name: ref.name, error: ref.error }, k); continue; }
    const pv = m.decodeParamValue(f, ref.enc);
    assert.equal(pv.name, ref.name, `${k}: name`); assert.equal(pv.type, ref.type, `${k}: type`); assert.equal(pv.value, ref.value, `${k}: value`);
  }
  // Read as a cast, PX4's GF_ACTION 2 is a denormal near zero: the encoding matters.
  assert.ok(m.decodeParamValue(decodeOne(fx.param.px4_gf_action.frame), 'CAST').value < 1e-40);
  assert.equal(m.paramEncodingOf('PX4'), 'BYTEWISE'); assert.equal(m.paramEncodingOf('ARDUPILOT'), 'CAST'); assert.equal(m.paramEncodingOf('UNKNOWN'), 'CAST');
  const e = fx.encode;
  const same = (bytes, ref, name) => { const fr = new m.MavParser().push(bytes)[0]; assert.ok(fr, `${name}: parses`); assert.equal(fr.msgId, ref.msgId, name); assert.equal(Buffer.from(bytes.subarray(10, 10 + bytes[1])).toString('hex'), ref.payload, name); };
  same(m.encodeParamRequestRead('FENCE_RADIUS'), e.param_read_radius, 'PARAM_REQUEST_READ');
  same(m.encodeParamRequestRead('FENCE_ALT_MAX_TP'), e.param_read_16_chars, 'PARAM_REQUEST_READ, 16-char id without NUL');
  same(m.encodeParamSet('FENCE_RADIUS', 450, m.MAV_PARAM_TYPE.REAL32, 'CAST'), e.param_set_ap_radius, 'ArduPilot PARAM_SET float');
  same(m.encodeParamSet('FENCE_TYPE', 5, m.MAV_PARAM_TYPE.INT8, 'CAST'), e.param_set_ap_type, 'ArduPilot PARAM_SET INT8 as a cast float');
  same(m.encodeParamSet('GF_ACTION', 3, m.MAV_PARAM_TYPE.INT32, 'BYTEWISE'), e.param_set_px4_action, 'PX4 PARAM_SET INT32 bytewise');
  same(m.encodeParamSet('GF_MAX_HOR_DIST', 450, m.MAV_PARAM_TYPE.REAL32, 'BYTEWISE'), e.param_set_px4_dist, 'PX4 PARAM_SET float');
  same(m.encodeFenceEnable(true, m.FENCE_TYPE.POLYGON), e.fence_enable_polygon, 'DO_FENCE_ENABLE polygon only');
  assert.throws(() => m.encodeParamRequestRead('SEVENTEEN_CHARS_X'), /Bad parameter name/);
  assert.equal(m.paramStored(299.6, m.MAV_PARAM_TYPE.INT16), 300); assert.equal(m.paramStored(0.1, m.MAV_PARAM_TYPE.REAL32), Math.fround(0.1));
  // AUTOPILOT_VERSION's flight_sw_version lands in telemetry (the fence check needs 4.6+ for the polygon-only enable).
  assert.equal(m.decodeInto({ ...m.EMPTY_TELEMETRY }, decodeOne(fx.health.autopilot_version.frame)).swVersion, (4 << 24) | (5 << 16) | (7 << 8) | 255);
}
{
  // Parameter pre-flight and the survey's fence check.
  const c = await (await import('./bundle.mjs')).loadModule('../src/link/paramChecks.ts');
  const P = o => Object.fromEntries(Object.entries(o).map(([name, value]) => [name, value === null ? null : { name, value, type: 9, count: 0, index: 0 }]));
  const v46 = (4 << 24) | (6 << 16), v45 = (4 << 24) | (5 << 16);
  const copter = P({ FENCE_ENABLE: 0, FENCE_TYPE: 7, FENCE_RADIUS: 300, FENCE_ALT_MAX: 100, FENCE_AUTOENABLE: 0, FENCE_ACTION: 1, BATT_FS_LOW_ACT: 0, RTL_ALT_M: null, RTL_ALT: 1500 });
  const big = { reachM: 412, altM: 70, polygon: true };
  // 4.6+, FENCE_ENABLE 0: the dashboard enables the polygon only, so the default circle never switches on.
  let r = c.fenceParamCheck('ARDUPILOT', copter, { ...big, swVersion: v46 });
  assert.equal(r.ok, true, r.detail); assert.deepEqual(r.fixes, []);
  // 4.5 enables every type in FENCE_TYPE: the 300 m circle would stop a survey reaching 412 m. Red, fix raises the radius only.
  r = c.fenceParamCheck('ARDUPILOT', copter, { ...big, swVersion: v45 });
  assert.equal(r.ok, false); assert.equal(r.advisory, false); assert.deepEqual(r.fixes, [{ name: 'FENCE_RADIUS', value: 420 }]); assert.match(r.detail, /circle 300 m < 420 m/);
  // FENCE_ENABLE 1 (or not read) switches them on whatever the firmware; a high survey needs FENCE_ALT_MAX raised too.
  r = c.fenceParamCheck('ARDUPILOT', { ...copter, ...P({ FENCE_ENABLE: 1 }) }, { reachM: 412, altM: 110, polygon: true, swVersion: v46 });
  assert.deepEqual(r.fixes, [{ name: 'FENCE_RADIUS', value: 420 }, { name: 'FENCE_ALT_MAX', value: 110 }]);
  r = c.fenceParamCheck('ARDUPILOT', { ...copter, ...P({ FENCE_ENABLE: null }) }, { ...big, swVersion: v46 });
  assert.equal(r.ok, false, 'FENCE_ENABLE not read counts as on');
  // A circle beyond FENCE_RADIUS's range: drop the circle from FENCE_TYPE instead.
  r = c.fenceParamCheck('ARDUPILOT', { ...copter, ...P({ FENCE_ENABLE: 1 }) }, { reachM: 12000, altM: 70, polygon: true, swVersion: v46 });
  assert.deepEqual(r.fixes, [{ name: 'FENCE_TYPE', value: 5 }]);
  // No polygon in FENCE_TYPE: amber, fixable by adding it.
  r = c.fenceParamCheck('ARDUPILOT', { ...copter, ...P({ FENCE_TYPE: 3 }) }, { ...big, swVersion: v46 });
  assert.equal(r.ok, false); assert.equal(r.advisory, true); assert.deepEqual(r.fixes, [{ name: 'FENCE_TYPE', value: 7 }]);
  // Still reading: holds the upload. Never answered: amber with the numbers to check, never a guess.
  r = c.fenceParamCheck('ARDUPILOT', {}, { ...big, swVersion: v46 });
  assert.equal(r.advisory, false); assert.match(r.detail, /FENCE_TYPE reading…/);
  r = c.fenceParamCheck('ARDUPILOT', P({ FENCE_TYPE: 7 }), { ...big, swVersion: v46 });
  assert.equal(r.ok, false); assert.equal(r.advisory, false, 'FENCE_ENABLE and the limits not answered yet');
  r = c.fenceParamCheck('ARDUPILOT', P({ FENCE_TYPE: null }), { ...big, swVersion: v46 });
  assert.equal(r.advisory, true); assert.match(r.detail, /not read: needs FENCE_RADIUS ≥ 420 m, FENCE_ALT_MAX ≥ 70 m/);
  r = c.fenceParamCheck('ARDUPILOT', P({ FENCE_TYPE: 7, FENCE_ENABLE: 1, FENCE_RADIUS: null, FENCE_ALT_MAX: 120 }), { ...big, swVersion: v46 });
  assert.equal(r.advisory, true); assert.match(r.detail, /not read/);
  assert.equal(c.fenceParamCheck('PX4', P({ GF_ACTION: 2 }), { ...big, swVersion: 0 }).advisory, false);
  assert.equal(c.fenceParamCheck('PX4', P({ GF_ACTION: 2, GF_MAX_HOR_DIST: null, GF_MAX_VER_DIST: 0 }), { ...big, swVersion: 0 }).advisory, true);
  // FENCE_ALT_MAX_TP 0: the limit is above sea level.
  r = c.fenceParamCheck('ARDUPILOT', { ...copter, ...P({ FENCE_ENABLE: 1, FENCE_RADIUS: 500, FENCE_ALT_MAX_TP: 0 }) }, { ...big, swVersion: v46, homeAmslM: 105 });
  assert.deepEqual(r.fixes, [{ name: 'FENCE_ALT_MAX', value: 180 }]);
  // PX4: limits apply when > 0; GF_ACTION 0 acts on nothing.
  const px4 = P({ GF_ACTION: 2, GF_MAX_HOR_DIST: 150, GF_MAX_VER_DIST: 0, COM_LOW_BAT_ACT: 0, RTL_RETURN_ALT: 60 });
  r = c.fenceParamCheck('PX4', px4, { ...big, swVersion: 0 });
  assert.equal(r.ok, false); assert.equal(r.advisory, false); assert.deepEqual(r.fixes, [{ name: 'GF_MAX_HOR_DIST', value: 420 }]);
  assert.equal(c.fenceParamCheck('PX4', { ...px4, ...P({ GF_ACTION: 0 }) }, { ...big, swVersion: 0 }).ok, true);
  assert.equal(c.fenceParamCheck('PX4', { ...px4, ...P({ GF_MAX_HOR_DIST: 0 }) }, { ...big, swVersion: 0 }).ok, true);
  // Link pre-flight: battery failsafe, fence action, return altitude. RTL_ALT is centimetres, RTL_ALT_M metres.
  const pf = Object.fromEntries(c.paramPreflight('ARDUPILOT', copter).map(x => [x.id, x]));
  assert.equal(pf['batt-fs'].ok, false); assert.match(pf['batt-fs'].detail, /warn only/);
  assert.equal(pf['fence-act'].ok, true); assert.equal(pf['rtl-alt'].detail, 'RTL_ALT 15 m');
  assert.ok(Object.values(pf).every(x => x.advisory));
  assert.equal(c.rtlAltM('ARDUPILOT', P({ RTL_ALT_M: 30, RTL_ALT: null })), 30);
  assert.equal(c.rtlAltM('ARDUPILOT', P({ RTL_ALT_M: null, RTL_ALT: null })), null);
  const px = Object.fromEntries(c.paramPreflight('PX4', px4).map(x => [x.id, x]));
  assert.equal(px['batt-fs'].ok, false); assert.equal(px['fence-act'].ok, false, 'hold is not a return'); assert.equal(px['rtl-alt'].ok, true);
  assert.match(c.paramPreflight('PX4', P({ GF_ACTION: null }))[0].detail, /COM_LOW_BAT_ACT reading…/);
  assert.match(c.paramPreflight('PX4', P({ GF_ACTION: null }))[1].detail, /GF_ACTION not read/);
  assert.equal(c.rtlVsPlan('ARDUPILOT', copter, 60).ok, false); assert.equal(c.rtlVsPlan('PX4', px4, 60).ok, true);
  assert.equal(c.fenceMaskHonoured(v46), true); assert.equal(c.fenceMaskHonoured(v45), false); assert.equal(c.fenceMaskHonoured(0), false);
}
console.log('mavlink codec: all tests passed');
