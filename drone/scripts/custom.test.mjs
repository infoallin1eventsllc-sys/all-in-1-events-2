// Custom builds: MAVLink 1 frames, INAV / Betaflight and other MAVLink firmware, and ArduPilot planes, QuadPlanes
// and rovers, each getting the commands its firmware actually takes. Run with `npm test`.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const m = await loadModule('../src/link/mavlink.ts');
const mc = await loadModule('../src/link/missionClient.ts');
const P = await loadModule('../src/control/protocol.ts');

// --- MAVLink 1 framing (older firmware, Betaflight builds, some radios) ------------------------------
function x25(bytes, extra) {
  let crc = 0xffff;
  const add = b => { let t = b ^ (crc & 0xff); t = (t ^ (t << 4)) & 0xff; crc = ((crc >> 8) ^ (t << 8) ^ (t << 3) ^ (t >> 4)) & 0xffff; };
  for (const b of bytes) add(b); add(extra);
  return crc;
}
/** A MAVLink 1 frame: 0xFE len seq sys comp msgid payload crc. */
function v1(msgId, payload, extra, sys = 1, comp = 1) {
  const head = [payload.length, 7, sys, comp, msgId];
  const crc = x25([...head, ...payload], extra);
  return Uint8Array.from([0xfe, ...head, ...payload, crc & 0xff, crc >> 8]);
}
/** HEARTBEAT payload: custom_mode, type, autopilot, base_mode, system_status, mavlink_version. */
const hbPayload = (custom, type, autopilot, base) => { const p = new Uint8Array(9); new DataView(p.buffer).setUint32(0, custom, true); p[4] = type; p[5] = autopilot; p[6] = base; p[7] = 4; p[8] = 3; return p; };
{
  const parser = new m.MavParser();
  // Two v1 heartbeats and a v2 one in the same stream, split mid-frame: all three come out, nothing counted bad.
  const a = v1(0, hbPayload(16, 2, 0, 1 | 128), 50), b = m.encodeHeartbeat(), c = v1(0, hbPayload(0, 2, 0, 64), 50);
  const all = Uint8Array.from([...a, ...b, ...c]);
  const frames = [...parser.push(all.subarray(0, 7)), ...parser.push(all.subarray(7, 30)), ...parser.push(all.subarray(30))];
  assert.deepEqual(frames.map(f => [f.msgId, !!f.v1]), [[0, true], [0, false], [0, true]]);
  assert.equal(parser.badCrc, 0);
  const t = m.decodeInto({ ...m.EMPTY_TELEMETRY }, frames[0]);
  assert.equal(t.mavVersion, 1); assert.equal(t.armed, true);
  // A corrupted v1 frame is rejected and the parser recovers on the next one.
  const bad = Uint8Array.from(a); bad[8] ^= 0xff;
  assert.equal(new m.MavParser().push(Uint8Array.from([...bad, ...a])).length, 1);
}

// --- who flies the aircraft, and what it can take --------------------------------------------------
{
  const hb = (autopilot, type, base = 1, custom = 0) => ({ ...m.EMPTY_TELEMETRY, heartbeatMs: Date.now(), autopilot, vehicleType: type, baseMode: base, customMode: custom });
  assert.equal(m.autopilotOf({ autopilot: 0 }), 'UNKNOWN', 'no heartbeat yet');
  assert.equal(m.autopilotOf(hb(0, 2)), 'GENERIC', 'INAV / Betaflight send MAV_AUTOPILOT_GENERIC');
  assert.equal(m.autopilotOf(hb(3, 1)), 'ARDUPILOT'); assert.equal(m.autopilotOf(hb(12, 2)), 'PX4');
  assert.equal(m.vehicleKind(2), 'COPTER'); assert.equal(m.vehicleKind(1), 'PLANE'); assert.equal(m.vehicleKind(20), 'VTOL');
  assert.equal(m.vehicleKind(10), 'ROVER'); assert.equal(m.vehicleKind(11), 'ROVER'); assert.equal(m.vehicleKind(0), 'OTHER');
  // INAV reports its modes in ArduPilot's numbers with the custom-mode flag: read as such.
  assert.equal(m.modeName(hb(0, 2, 1 | 128, 3)), 'AUTO'); assert.equal(m.modeName(hb(0, 1, 1, 11)), 'RTL');
  // Betaflight's custom mode is its own, without the flag: not mistaken for ArduPilot's.
  assert.equal(m.modeName(hb(0, 2, 64 | 128, 3)), 'MANUAL'); assert.equal(m.modeName(hb(0, 2, 64, 3)), 'OTHER');
  assert.equal(m.modeName(hb(3, 10, 1, 4)), 'HOLD', 'ArduRover Hold');

  const g = m.capabilitiesOf('GENERIC', 'COPTER');
  assert.equal(g.TELEMETRY.level, 'yes'); assert.equal(g.ARM.level, 'no'); assert.equal(g.GOTO.level, 'partial'); assert.equal(g.MISSION.level, 'partial');
  assert.equal(g.SURVEY.level, 'no'); assert.equal(g.PARAMS.level, 'no'); assert.match(g.ARM.note, /radio/);
  const copter = m.capabilitiesOf('ARDUPILOT', 'COPTER');
  assert.ok(Object.values(copter).every(c => c.level === 'yes'), 'a multirotor on ArduPilot takes everything');
  assert.ok(Object.entries(m.capabilitiesOf('PX4', 'COPTER')).every(([f, c]) => c.level === 'yes' || f === 'AVOID'), 'and on PX4');
  assert.equal(m.capabilitiesOf('PX4', 'COPTER').AVOID.level, 'partial', 'PX4 collision prevention: Position mode only');
  assert.equal(m.capabilitiesOf('ARDUPILOT', 'PLANE').AVOID.level, 'no'); assert.equal(m.capabilitiesOf('ARDUPILOT', 'VTOL').AVOID.level, 'no');
  assert.equal(m.capabilitiesOf('ARDUPILOT', 'ROVER').AVOID.level, 'yes'); assert.equal(m.capabilitiesOf('GENERIC', 'COPTER').AVOID.level, 'no');
  assert.equal(m.capabilitiesOf('ARDUPILOT', 'ROVER').TAKEOFF.level, 'no'); assert.equal(m.capabilitiesOf('ARDUPILOT', 'ROVER').SURVEY.level, 'no');
  assert.equal(m.capabilitiesOf('ARDUPILOT', 'PLANE').TAKEOFF.level, 'partial');
  assert.equal(m.capabilitiesOf('ARDUPILOT', 'VTOL').LAND.level, 'yes');
  assert.ok(Object.values(m.capabilitiesOf('UNKNOWN', 'COPTER')).every(c => c.level === 'no'));

  // Modes: none are sent to INAV / Betaflight (the radio changes them); ArduRover's Hold is 4.
  assert.equal(m.encodeFlightMode('GENERIC', 'RTL', 1, 2), null);
  const hold = new m.MavParser().push(m.encodeFlightMode('ARDUPILOT', 'HOLD', 1, 10))[0];
  assert.equal(hold.payload.getFloat32(4, true), 4);
  assert.equal(m.encodeFlightMode('ARDUPILOT', 'HOLD', 1, 2), null, 'a copter has no Hold mode');

  // INAV's go-to: COMMAND_INT DO_REPOSITION in MAV_FRAME_GLOBAL, z the height above home.
  const go = new m.MavParser().push(m.encodeRepositionFor('GENERIC', 33.77, -118.19, 40, { altMslM: 0, altRelM: 0 }, 1))[0];
  assert.equal(go.msgId, 75); assert.equal(go.payload.getUint16(28, true), 192); assert.equal(go.payload.getUint8(32), 0);
  assert.equal(go.payload.getInt32(16, true), 337700000); assert.equal(go.payload.getFloat32(24, true), 40);
  // MISSION_ITEM (float positions) for INAV's upload, GLOBAL_RELATIVE_ALT.
  const it = new m.MavParser().push(m.encodeMissionItem(2, { lat: 33.77, lon: -118.19, altRelM: 55, frame: 3 }, 0, 1, 1, 0))[0];
  assert.equal(it.msgId, 39); assert.equal(it.payload.getUint16(28, true), 2); assert.equal(it.payload.getUint16(30, true), 16);
  assert.equal(it.payload.getUint8(34), 3); assert.ok(Math.abs(it.payload.getFloat32(16, true) - 33.77) < 1e-4); assert.equal(it.payload.getFloat32(24, true), 55);
}

// --- fleet commands by airframe ------------------------------------------------------------------
{
  const cmds = (c, ap, kind) => P.stepsFor(c, ap, kind).map(s => s.unsupported ? 'X' : s.mode ? `${s.cmd}:${s.mode}` : s.cmd);
  // Multirotor (unchanged): GUIDED, arm, takeoff; land in place; hold in Loiter.
  assert.deepEqual(cmds({ k: 'TAKEOFF', altM: 30 }, 'ARDUPILOT'), ['176:GUIDED', 400, 22]);
  assert.deepEqual(cmds({ k: 'LAND' }, 'ARDUPILOT', 'COPTER'), [21]);
  // ArduPlane fixed wing: Takeoff mode then arm; land through the mission's landing sequence; hold by circling.
  assert.deepEqual(cmds({ k: 'TAKEOFF', altM: 30 }, 'ARDUPILOT', 'PLANE'), ['176:TAKEOFF', 400]);
  assert.deepEqual(cmds({ k: 'LAND' }, 'ARDUPILOT', 'PLANE'), [189]);
  assert.deepEqual(cmds({ k: 'HOLD' }, 'ARDUPILOT', 'PLANE'), ['176:LOITER']);
  // QuadPlane: vertical takeoff in Guided, QLAND, QLOITER.
  assert.deepEqual(cmds({ k: 'TAKEOFF', altM: 30 }, 'ARDUPILOT', 'VTOL'), ['176:GUIDED', 400, 22]);
  assert.deepEqual(cmds({ k: 'LAND' }, 'ARDUPILOT', 'VTOL'), ['176:LAND']);
  assert.deepEqual(cmds({ k: 'HOLD' }, 'ARDUPILOT', 'VTOL'), ['176:POSITION']);
  const vl = new m.MavParser().push(P.encodeStep(P.stepsFor({ k: 'LAND' }, 'ARDUPILOT', 'VTOL')[0], 'ARDUPILOT', 1, { altMslM: 0, altRelM: 0, lat: 0, lon: 0, vehicleType: 20 }, { lat: 0, lon: 0 }))[0];
  assert.equal(vl.payload.getFloat32(4, true), 20, 'QLAND is mode 20');
  // Rover / boat: no takeoff; land and hold both stop it.
  assert.deepEqual(cmds({ k: 'TAKEOFF', altM: 30 }, 'ARDUPILOT', 'ROVER'), ['X']);
  assert.deepEqual(cmds({ k: 'LAND' }, 'ARDUPILOT', 'ROVER'), ['176:HOLD']);
  // INAV / Betaflight: arm, takeoff, land, RTL and modes are the radio's; go-to is sent.
  for (const k of ['ARM', 'TAKEOFF', 'LAND', 'RTL', 'HOLD']) {
    const s = P.stepsFor({ k, altM: 20 }, 'GENERIC', 'COPTER');
    assert.equal(s.length, 1); assert.match(s[0].unsupported, /radio/, k);
  }
  assert.deepEqual(cmds({ k: 'GOTO', x: 10, y: 0, altM: 30 }, 'GENERIC', 'COPTER'), [192]);
}

// --- INAV's mission upload: MISSION_REQUEST answered with MISSION_ITEM, over MAVLink 1 -------------------
{
  const got = [];
  const listeners = new Set();
  const parser = new m.MavParser();
  // INAV asks with MISSION_REQUEST (40), v1, and takes only MISSION_ITEM (39) in GLOBAL_RELATIVE_ALT.
  const out = (msgId, payload, extra) => setTimeout(() => { for (const f of new m.MavParser().push(v1(msgId, payload, extra))) listeners.forEach(l => l(f)); }, 1);
  let expect = 0;
  const io = {
    sysId: () => 1, telemetry: () => m.EMPTY_TELEMETRY,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    send: async bytes => {
      for (const f of parser.push(bytes)) {
        if (f.msgId === 44) { expect = f.payload.getUint16(0, true); out(40, Uint8Array.from([0, 0, 255, 190]), 230); }
        else if (f.msgId === 73) throw new Error('INAV ignores MISSION_ITEM_INT');
        else if (f.msgId === 39) {
          const seq = f.payload.getUint16(28, true), frame = f.payload.getUint8(34);
          got.push({ seq, cmd: f.payload.getUint16(30, true), frame, alt: f.payload.getFloat32(24, true) });
          if (frame !== 3) { out(47, Uint8Array.from([255, 190, 2]), 153); continue; }
          if (seq + 1 < expect) out(40, Uint8Array.from([(seq + 1) & 0xff, 0, 255, 190]), 230);
          else out(47, Uint8Array.from([255, 190, 0]), 153);
        }
      }
    },
  };
  const items = [{ lat: 33.77, lon: -118.19, altRelM: 60, frame: 3 }, { lat: 33.771, lon: -118.19, altRelM: 70, frame: 3 }, { lat: 33.771, lon: -118.191, altRelM: 55, frame: 3 }];
  await mc.uploadItems(io, items, { legacy: true, timeoutMs: 500 });
  assert.deepEqual(got.map(g => [g.seq, g.cmd, g.frame, g.alt]), [[0, 16, 3, 60], [1, 16, 3, 70], [2, 16, 3, 55]]);
}

// --- obstacle sensing: DISTANCE_SENSOR and OBSTACLE_DISTANCE, and the avoidance pre-flight ---------------
{
  const pc = await loadModule('../src/link/paramChecks.ts');
  const ds = (cm, orient, min = 20, max = 1200) => { const p = new Uint8Array(39); const v = new DataView(p.buffer); v.setUint16(4, min, true); v.setUint16(6, max, true); v.setUint16(8, cm, true); p[10] = 0; p[12] = orient; return p; };
  const frame = (id, payload) => new m.MavParser().push(m.encodeRaw(id, payload, 1, 1))[0];
  const t = { ...m.EMPTY_TELEMETRY };
  m.decodeInto(t, frame(132, ds(420, 0)));                 // 4.2 m ahead
  m.decodeInto(t, frame(132, ds(310, 2)));                 // 3.1 m right
  m.decodeInto(t, frame(132, ds(150, 25)));                // the ground below: not an obstacle
  let o = m.nearestObstacle(t);
  assert.deepEqual(o, { m: 3.1, bearingDeg: 90 }); assert.equal(m.obstacleText(o), '3.1 m right');
  assert.ok(m.proximityLive(t));
  m.decodeInto(t, frame(132, ds(2000, 2)));                // out of range: that direction is clear again
  assert.deepEqual(m.nearestObstacle(t), { m: 4.2, bearingDeg: 0 });
  assert.equal(m.nearestObstacle(t, Date.now() + 5000), null, 'stale readings are dropped');
  // A 360° lidar: 72 sectors of 5°, offset 0; one return at sector 54 (270°, left) at 2.5 m.
  const od = new Uint8Array(167); const dv = new DataView(od.buffer);
  for (let i = 0; i < 72; i++) dv.setUint16(8 + i * 2, 1301, true);          // max + 1: nothing there
  dv.setUint16(8 + 54 * 2, 250, true); dv.setUint16(152, 1300, true); dv.setUint16(154, 20, true); od[157] = 5;
  m.decodeInto(t, frame(330, od));
  o = m.nearestObstacle(t); assert.equal(o.m, 2.5); assert.equal(o.bearingDeg, 270); assert.equal(m.obstacleText(o), '2.5 m left');
  // Pre-flight: says plainly when the drone won't stop for obstacles; amber, never holds the gate.
  const P = o2 => Object.fromEntries(Object.entries(o2).map(([k, x]) => [k, x === null ? null : { name: k, value: x, type: 9, count: 0, index: 0 }]));
  const none = pc.avoidCheck('ARDUPILOT', P({ PRX1_TYPE: 0, AVOID_ENABLE: 3 }), false);
  assert.equal(none.ok, false); assert.equal(none.advisory, true); assert.match(none.detail, /will not stop/);
  const off = pc.avoidCheck('ARDUPILOT', P({ PRX1_TYPE: 4, AVOID_ENABLE: 1 }), true);
  assert.equal(off.ok, false); assert.match(off.detail, /AVOID_ENABLE 1/);
  const on = pc.avoidCheck('ARDUPILOT', P({ PRX1_TYPE: 4, AVOID_ENABLE: 3, AVOID_MARGIN: 2, OA_TYPE: 1 }), true);
  assert.equal(on.ok, true); assert.match(on.detail, /stops 2 m away; steers round/);
  assert.match(pc.avoidCheck('ARDUPILOT', P({ PRX1_TYPE: null, PRX_TYPE: 5, AVOID_ENABLE: 3 }), true).detail, /stops 2 m away/, 'PRX_TYPE on firmware before 4.3');
  assert.equal(pc.avoidCheck('PX4', P({ CP_DIST: -1 }), true).ok, false);
  assert.match(pc.avoidCheck('PX4', P({ CP_DIST: 3 }), true).detail, /3 m away, Position mode only/);
  assert.equal(pc.avoidCheck('PX4', P({ CP_DIST: 3 }), false).ok, false, 'no sensor reporting');
}

console.log('custom builds: all tests passed');
