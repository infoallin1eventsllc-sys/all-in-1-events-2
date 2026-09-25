// Mission protocol and mission start against a scripted autopilot (ArduPilot and PX4 behaviour).
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const mav = await loadModule('../src/link/mavlink.ts');
const mc = await loadModule('../src/link/missionClient.ts');
const plan = await loadModule('../src/survey/plan.ts');
const { SITE } = await loadModule('../src/survey/site.ts');

const ARDU = { GUIDED: 4, AUTO: 3, LOITER: 5 };
const u16 = (v, o, x) => v.setUint16(o, x, true);

/**
 * A pretend autopilot on the other end of the link. It parses what the GCS sends and
 * answers the way the real firmware does, including the awkward parts:
 *   - ArduPilot ACKs a MISSION_CLEAR_ALL (a GCS must not take that as the upload's ACK)
 *   - Copter refuses to arm in AUTO; MISSION_START needs it armed
 *   - PX4 arms in mission mode and flies the takeoff item itself
 *   - a lost MISSION_COUNT (`dropCount`) and a pre-arm failure (`prearmFail`)
 */
function autopilot({ px4 = false, dropCount = 0, prearmFail = false } = {}) {
  const parser = new mav.MavParser();
  const telem = { ...mav.EMPTY_TELEMETRY };
  const listeners = new Set();
  const st = { mode: px4 ? (4 << 16) | (3 << 24) : ARDU.LOITER, armed: false, mission: [], fence: [], expect: 0, type: 0, clears: 0, started: false, fenceOn: false, log: [] };
  const deliver = (bytes) => { for (const f of new mav.MavParser().push(bytes)) { mav.decodeInto(telem, f); listeners.forEach(l => l(f)); } };
  const out = (msgId, payload) => setTimeout(() => deliver(mav.encodeRaw(msgId, payload, 1, 1)), 1);
  const heartbeat = () => { const p = new Uint8Array(9); const v = new DataView(p.buffer); v.setUint32(0, st.mode, true); p[4] = 2; p[5] = px4 ? 12 : 3; p[6] = 1 | (st.armed ? 128 : 0); p[7] = 4; p[8] = 3; out(0, p); };
  const ack = (cmd, result) => { const p = new Uint8Array(3); u16(new DataView(p.buffer), 0, cmd); p[2] = result; out(77, p); };
  const missionAck = (result, type) => { const p = new Uint8Array(4); p[0] = 255; p[1] = 190; p[2] = result; p[3] = type; out(47, p); };
  const request = (seq, type) => { const p = new Uint8Array(5); u16(new DataView(p.buffer), 0, seq); p[2] = 255; p[3] = 190; p[4] = type; out(51, p); };
  const text = (s) => { const p = new Uint8Array(51); p[0] = 4; for (let i = 0; i < s.length; i++) p[1 + i] = s.charCodeAt(i); out(253, p); };
  heartbeat();
  const send = async (bytes) => {
    for (const f of parser.push(bytes)) {
      const p = f.payload;
      if (f.msgId === 45) { st.clears++; missionAck(0, p.getUint8(2)); }
      else if (f.msgId === 44) {
        if (dropCount-- > 0) { st.log.push('dropped COUNT'); continue; }
        st.expect = p.getUint16(0, true); st.type = p.getUint8(4); (st.type === 1 ? st.fence : st.mission).length = 0;
        request(0, st.type);
      } else if (f.msgId === 73) {
        const seq = p.getUint16(28, true), type = p.getUint8(37);
        const item = { seq, command: p.getUint16(30, true), frame: p.getUint8(34), x: p.getInt32(16, true), y: p.getInt32(20, true), z: p.getFloat32(24, true), p1: p.getFloat32(0, true), p2: p.getFloat32(4, true), p3: p.getFloat32(8, true) };
        (type === 1 ? st.fence : st.mission)[seq] = item;
        if (seq + 1 < st.expect) request(seq + 1, type); else missionAck(0, type);
      } else if (f.msgId === 76) {
        const cmd = p.getUint16(28, true), p1 = p.getFloat32(0, true), p2 = p.getFloat32(4, true), p3 = p.getFloat32(8, true);
        if (cmd === 176) { st.mode = px4 ? (p2 << 16) | (p3 << 24) : p2; ack(cmd, 0); heartbeat(); }
        else if (cmd === 400) {
          if (prearmFail) { text('PreArm: GPS not healthy'); ack(cmd, 4); }
          else if (!px4 && st.mode === ARDU.AUTO) { text('Arm: Mode not armable'); ack(cmd, 4); }
          else { st.armed = p1 === 1; ack(cmd, 0); heartbeat(); if (px4 && st.armed && st.mode === ((4 << 16) | (4 << 24))) st.started = true; }
        } else if (cmd === 300) {
          if (!st.armed) { ack(cmd, 4); continue; }
          st.mode = ARDU.AUTO; st.started = true; ack(cmd, 0); heartbeat();
        } else if (cmd === 207) { st.fenceOn = p1 === 1; ack(cmd, 0); }
        else ack(cmd, 3);
      }
    }
  };
  const io = { send, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, telemetry: () => telem, sysId: () => 1 };
  return { io, st, telem };
}

// --- upload: every item arrives, in order, with the right frames and mission type ---
{
  const base = { pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E', orbit: { center: { x: 60, y: -70 }, radiusM: 45 } };
  const p = plan.planSurvey(SITE.boundary, SITE.home, base);
  const items = plan.missionItems(p, SITE.origin, { home: SITE.home });
  const { io, st } = autopilot();
  const all = [{ lat: SITE.origin.lat, lon: SITE.origin.lon, altRelM: 0 }, ...items];
  let progress = 0;
  await mc.uploadItems(io, all, { firstCurrent: 1, onProgress: q => { progress = q.sent; }, timeoutMs: 400 });
  assert.equal(st.clears, 0, 'no MISSION_CLEAR_ALL: its ACK would be mistaken for the upload finishing');
  assert.equal(st.mission.length, all.length, 'every item stored');
  assert.equal(progress, all.length, 'progress reaches the total');
  assert.equal(st.mission[1].command, 22, 'item 1 is the takeoff');
  assert.equal(st.mission[1].frame, 6, 'takeoff in GLOBAL_RELATIVE_ALT_INT');
  assert.ok(st.mission[1].x !== 0, 'takeoff carries home position (PX4 validates it)');
  assert.equal(st.mission.find(i => i.command === 206).frame, 2, 'DO_ commands in MAV_FRAME_MISSION');
  assert.equal(st.mission.find(i => i.command === 205).z, 2, 'mount control param7 = MAVLink targeting');
  assert.equal(st.mission[st.mission.length - 1].command, 20, 'ends with RTL');
}

// --- a lost MISSION_COUNT is resent ---
{
  const { io, st } = autopilot({ dropCount: 1 });
  await mc.uploadItems(io, [{ lat: 1, lon: 2, altRelM: 3 }, { lat: 1, lon: 2, altRelM: 3 }], { timeoutMs: 60 });
  assert.equal(st.mission.length, 2, 'upload completes after a resent COUNT');
  assert.deepEqual(st.log, ['dropped COUNT']);
}

// --- no answer at all fails with a readable reason ---
{
  const { io } = autopilot({ dropCount: 99 });
  await assert.rejects(mc.uploadItems(io, [{ lat: 1, lon: 2, altRelM: 3 }], { timeoutMs: 30, retries: 2 }), /did not answer/);
}

// --- geofence: mission type 1, vertex items ---
{
  const { io, st } = autopilot();
  const base = { pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E', orbit: { center: { x: 60, y: -70 }, radiusM: 45 } };
  const p = plan.planSurvey(SITE.boundary, SITE.home, base);
  const fence = plan.fenceItems(plan.fencePolygon(p, SITE.boundary, SITE.home), SITE.origin);
  await mc.uploadItems(io, fence, { missionType: mc.MISSION_TYPE.FENCE, timeoutMs: 400 });
  assert.equal(st.fence.length, fence.length, 'fence stored as mission type 1');
  assert.equal(st.mission.length, 0, 'the mission itself is untouched');
  assert.ok(st.fence.every(v => v.command === 5001 && v.p1 === fence.length && v.frame === 5), 'inclusion vertices, count in param1, GLOBAL_INT frame');
}

// --- ArduPilot start: GUIDED → arm → MISSION_START → AUTO ---
{
  const { io, st, telem } = autopilot();
  const r = await mc.startMission(io, 'ARDUPILOT');
  assert.ok(r.ok, `ArduPilot start: ${r.error}`);
  assert.ok(st.armed && st.started, 'armed and the mission started');
  assert.equal(mav.modeName(telem), 'AUTO', 'ends in AUTO');
}

// --- PX4 start: mission mode → arm ---
{
  const { io, st, telem } = autopilot({ px4: true });
  const r = await mc.startMission(io, 'PX4');
  assert.ok(r.ok, `PX4 start: ${r.error}`);
  assert.ok(st.armed && st.started, 'PX4 armed in mission mode');
  assert.equal(mav.modeName(telem), 'AUTO');
}

// --- a pre-arm failure reports the autopilot's reason ---
{
  const { io } = autopilot({ prearmFail: true });
  const r = await mc.startMission(io, 'ARDUPILOT');
  assert.ok(!r.ok && /did not arm/.test(r.error), 'refused');
  assert.ok(r.detail?.some(s => /GPS not healthy/.test(s)), `the autopilot's words are shown: ${JSON.stringify(r.detail)}`);
}

// --- photo reports: several between UI updates are all kept; sources are not double-counted ---
{
  const t = { ...mav.EMPTY_TELEMETRY, lat: 33.77, lon: -118.19, altRelM: 60 };
  const fb = (i) => { const p = new Uint8Array(47); const v = new DataView(p.buffer); v.setInt32(8, 337700000 + i, true); v.setInt32(12, -1181900000, true); v.setFloat32(20, 60, true); v.setUint16(40, i, true); return new mav.MavParser().push(mav.encodeRaw(180, p, 1, 1))[0]; };
  const trig = (i) => { const p = new Uint8Array(12); new DataView(p.buffer).setUint32(8, i, true); return new mav.MavParser().push(mav.encodeRaw(112, p, 1, 1))[0]; };
  for (let i = 1; i <= 3; i++) mav.decodeInto(t, fb(i));
  mav.decodeInto(t, trig(9));
  assert.equal(t.photosReported, 3, 'three CAMERA_FEEDBACKs, the stray CAMERA_TRIGGER ignored');
  assert.equal(t.photoSource, 'FEEDBACK');
  assert.deepEqual(t.photoLog.map(p => p.n), [1, 2, 3], 'each photo logged');
  const cap = new Uint8Array(60); const cv = new DataView(cap.buffer); cv.setInt32(12, 337701234, true); cv.setInt32(16, -1181905678, true); cv.setInt32(24, 61500, true); cv.setInt32(44, 7, true); cv.setInt8(49, 1);
  const t2 = { ...mav.EMPTY_TELEMETRY };
  mav.decodeInto(t2, new mav.MavParser().push(mav.encodeRaw(263, cap, 1, 100))[0]);
  assert.equal(t2.photoSource, 'CAMERA'); assert.ok(Math.abs(t2.photoLog[0].lat - 33.7701234) < 1e-9 && Math.abs(t2.photoLog[0].altRelM - 61.5) < 1e-9, 'CAMERA_IMAGE_CAPTURED position decoded');
}

console.log('mission: all tests passed');
