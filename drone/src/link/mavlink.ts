/**
 * Minimal MAVLink v2 codec — enough to read a flight controller's telemetry
 * and send it a few commands. No dependencies.
 *
 * Frame: 0xFD | len | incompat | compat | seq | sysid | compid | msgid(3) | payload | crc16(2) [| sig(13)]
 * CRC is X.25 over everything after the magic byte, plus the message's CRC_EXTRA.
 *
 * Only the messages the dashboards use are decoded; everything else is passed
 * through as `{ id, payload }` so a caller can extend without touching this file.
 */

export interface MavFrame { seq: number; sysId: number; compId: number; msgId: number; payload: DataView; }

// CRC_EXTRA per message id (from the common dialect).
const CRC_EXTRA: Record<number, number> = {
  0: 50,    // HEARTBEAT
  1: 124,   // SYS_STATUS
  24: 24,   // GPS_RAW_INT
  30: 39,   // ATTITUDE
  33: 104,  // GLOBAL_POSITION_INT
  74: 20,   // VFR_HUD
  76: 152,  // COMMAND_LONG
  77: 143,  // COMMAND_ACK
  109: 185, // RADIO_STATUS
  147: 154, // BATTERY_STATUS
  253: 83,  // STATUSTEXT
  11: 89,   // SET_MODE
  40: 230,  // MISSION_REQUEST
  42: 28,   // MISSION_CURRENT
  44: 221,  // MISSION_COUNT
  45: 232,  // MISSION_CLEAR_ALL
  46: 11,   // MISSION_ITEM_REACHED
  47: 153,  // MISSION_ACK
  51: 196,  // MISSION_REQUEST_INT
  73: 38,   // MISSION_ITEM_INT
  86: 5,    // SET_POSITION_TARGET_GLOBAL_INT
  75: 158,  // COMMAND_INT
  158: 134, // MOUNT_STATUS (ArduPilot, legacy gimbal report)
  180: 52,  // CAMERA_FEEDBACK (ArduPilot: one per photo taken, with its position)
  112: 174, // CAMERA_TRIGGER (PX4: one per trigger pulse, no position)
  263: 133, // CAMERA_IMAGE_CAPTURED (MAVLink camera: one per image, with position and result)
  168: 1,   // WIND (ArduPilot estimate)
  242: 104, // HOME_POSITION
  162: 189, // FENCE_STATUS
  285: 137, // GIMBAL_DEVICE_ATTITUDE_STATUS
  // Health (decoded in src/diagnostics/decode.ts)
  36: 222,    // SERVO_OUTPUT_RAW
  125: 203,   // POWER_STATUS
  148: 178,   // AUTOPILOT_VERSION
  193: 71,    // EKF_STATUS_REPORT (ArduPilot)
  230: 163,   // ESTIMATOR_STATUS
  241: 90,    // VIBRATION
  291: 10,    // ESC_STATUS (PX4)
  11030: 144, // ESC_TELEMETRY_1_TO_4 (ArduPilot)
  11031: 133, // ESC_TELEMETRY_5_TO_8 (ArduPilot)
  // Parameters
  20: 214,  // PARAM_REQUEST_READ
  22: 220,  // PARAM_VALUE
  23: 168,  // PARAM_SET
  345: 209, // PARAM_ERROR (common.xml; ArduPilot master and PX4 answer an unknown name with it)
};

function x25(bytes: Uint8Array, start: number, end: number, seed = 0xffff): number {
  let crc = seed;
  for (let i = start; i < end; i++) {
    let tmp = bytes[i] ^ (crc & 0xff);
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  }
  return crc;
}
function x25Byte(crc: number, b: number): number {
  let tmp = b ^ (crc & 0xff);
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

/** Streaming parser: feed bytes in any chunking, get whole frames out. */
export class MavParser {
  private buf = new Uint8Array(0);
  badCrc = 0;

  push(chunk: Uint8Array): MavFrame[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf); merged.set(chunk, this.buf.length);
    this.buf = merged;
    const out: MavFrame[] = [];
    let i = 0;
    while (i < this.buf.length) {
      if (this.buf[i] !== 0xfd) { i++; continue; }
      if (i + 10 > this.buf.length) break;                 // need header
      const len = this.buf[i + 1];
      const incompat = this.buf[i + 2];
      if (incompat & ~0x01) { this.badCrc++; i++; continue; } // only the signing flag exists: a false start
      const sigLen = incompat & 0x01 ? 13 : 0;
      const total = 10 + len + 2 + sigLen;
      if (i + total > this.buf.length) break;               // wait for the rest
      const msgId = this.buf[i + 7] | (this.buf[i + 8] << 8) | (this.buf[i + 9] << 16);
      const crcRead = this.buf[i + 10 + len] | (this.buf[i + 11 + len] << 8);
      const extra = CRC_EXTRA[msgId];
      let ok = true;
      if (extra !== undefined) {
        let crc = x25(this.buf, i + 1, i + 10 + len);
        crc = x25Byte(crc, extra);
        ok = crc === crcRead;
      } else {
        // No CRC_EXTRA, so no CRC check: a stray 0xFD after line noise could claim up to 280 bytes of
        // real frames. Trust an unknown frame only when the next frame starts right after it.
        if (i + total === this.buf.length) break;           // wait for the next byte to decide
        ok = this.buf[i + total] === 0xfd;
      }
      if (ok) {
        const payload = new Uint8Array(255); // v2 trims trailing zeros; re-pad so field offsets are stable
        payload.set(this.buf.subarray(i + 10, i + 10 + len));
        out.push({ seq: this.buf[i + 4], sysId: this.buf[i + 5], compId: this.buf[i + 6], msgId, payload: new DataView(payload.buffer) });
        i += total;
      } else { this.badCrc++; i++; }
    }
    this.buf = this.buf.subarray(i);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Decoded telemetry
// ---------------------------------------------------------------------------

export interface Telemetry {
  heartbeatMs: number;
  vehicleType: number; autopilot: number; baseMode: number; customMode: number; systemStatus: number;
  armed: boolean;
  lat: number; lon: number; altMslM: number; altRelM: number; vxMps: number; vyMps: number; vzMps: number; headingDeg: number;
  rollDeg: number; pitchDeg: number; yawDeg: number;
  airspeedMps: number; groundspeedMps: number; climbMps: number; throttlePct: number;
  batteryPct: number; voltageV: number; currentA: number;
  fixType: number; satellites: number; hdop: number;
  radioRssi: number; radioNoise: number; radioRemRssi: number;
  statusText: string;
  msgsPerSec: number;
  missionCurrent: number;
  lastAck: { command: number; result: number; atMs: number } | null;
  /** Gimbal pointing reported by the aircraft (NaN until a gimbal reports). */
  gimbalPitchDeg: number; gimbalYawDeg: number;
  /** Last photo the autopilot reports taking, and how many it has reported. */
  lastPhoto: { idx: number; lat: number; lon: number; altRelM: number; atMs: number } | null;
  photosReported: number;
  /**
   * Every reported photo, newest last (the last 64). Readers keep their own count
   * and take the ones past it, so several photos arriving between two UI updates
   * are never lost. `ok` false: the camera reported a failed capture. `idx`: the
   * image index the message carries (the camera's or autopilot's own count).
   */
  photoLog: { n: number; lat: number; lon: number; altRelM: number; atMs: number; ok: boolean; idx: number }[];
  /** Which message the photos come from. The first source heard is kept, so a camera and the autopilot reporting the same photo are not counted twice. */
  photoSource: 'NONE' | 'FEEDBACK' | 'TRIGGER' | 'CAMERA';
  /** Wind estimate (ArduPilot WIND); speed −1 until reported. Direction the wind comes from, degrees. */
  windMps: number; windFromDeg: number;
  /** Home the autopilot will return to (HOME_POSITION), null until reported. */
  home: { lat: number; lon: number; altMslM: number } | null;
  /** Geofence breached right now (FENCE_STATUS). */
  fenceBreached: boolean;
  /** AUTOPILOT_VERSION.flight_sw_version (major << 24 | minor << 16 | patch << 8 | type), 0 until reported. */
  swVersion: number;
}

export const EMPTY_TELEMETRY: Telemetry = {
  heartbeatMs: 0, vehicleType: 0, autopilot: 0, baseMode: 0, customMode: 0, systemStatus: 0, armed: false,
  lat: 0, lon: 0, altMslM: 0, altRelM: 0, vxMps: 0, vyMps: 0, vzMps: 0, headingDeg: 0,
  rollDeg: 0, pitchDeg: 0, yawDeg: 0, airspeedMps: 0, groundspeedMps: 0, climbMps: 0, throttlePct: 0,
  batteryPct: -1, voltageV: 0, currentA: 0, fixType: 0, satellites: 0, hdop: 99,
  radioRssi: 0, radioNoise: 0, radioRemRssi: 0, statusText: '', msgsPerSec: 0, missionCurrent: 0, lastAck: null,
  gimbalPitchDeg: NaN, gimbalYawDeg: NaN, lastPhoto: null, photosReported: 0,
  photoLog: [], photoSource: 'NONE', windMps: -1, windFromDeg: 0, home: null, fenceBreached: false, swVersion: 0,
};

function logPhoto(t: Telemetry, source: Telemetry['photoSource'], lat: number, lon: number, altRelM: number, ok: boolean, idx: number) {
  if (t.photoSource === 'NONE') t.photoSource = source;
  if (t.photoSource !== source) return;
  t.photosReported++;
  t.lastPhoto = { idx, lat, lon, altRelM, atMs: Date.now() };
  // Replace the array rather than push: snapshots copied with {...t} must not share a growing list.
  t.photoLog = [...t.photoLog.slice(-63), { n: t.photosReported, lat, lon, altRelM, atMs: Date.now(), ok, idx }];
}

const R2D = 180 / Math.PI;

/** Apply one frame to a telemetry snapshot. Returns the same object mutated. */
export function decodeInto(t: Telemetry, f: MavFrame): Telemetry {
  const p = f.payload;
  switch (f.msgId) {
    case 0: // HEARTBEAT
      t.customMode = p.getUint32(0, true); t.vehicleType = p.getUint8(4); t.autopilot = p.getUint8(5);
      t.baseMode = p.getUint8(6); t.systemStatus = p.getUint8(7); t.armed = (t.baseMode & 128) !== 0; t.heartbeatMs = Date.now();
      break;
    case 1: // SYS_STATUS
      t.voltageV = p.getUint16(14, true) / 1000; t.currentA = p.getInt16(16, true) / 100; t.batteryPct = p.getInt8(30);
      break;
    case 24: // GPS_RAW_INT
      t.fixType = p.getUint8(28); t.satellites = p.getUint8(29); { const h = p.getUint16(20, true); t.hdop = h === 65535 ? 99 : h / 100; }
      break;
    case 30: // ATTITUDE
      t.rollDeg = p.getFloat32(4, true) * R2D; t.pitchDeg = p.getFloat32(8, true) * R2D; t.yawDeg = (p.getFloat32(12, true) * R2D + 360) % 360;
      break;
    case 33: // GLOBAL_POSITION_INT
      t.lat = p.getInt32(4, true) / 1e7; t.lon = p.getInt32(8, true) / 1e7; t.altMslM = p.getInt32(12, true) / 1000; t.altRelM = p.getInt32(16, true) / 1000;
      t.vxMps = p.getInt16(20, true) / 100; t.vyMps = p.getInt16(22, true) / 100; t.vzMps = p.getInt16(24, true) / 100;
      { const h = p.getUint16(26, true); if (h !== 65535) t.headingDeg = h / 100; }
      break;
    case 74: // VFR_HUD
      t.airspeedMps = p.getFloat32(0, true); t.groundspeedMps = p.getFloat32(4, true); t.climbMps = p.getFloat32(12, true); t.throttlePct = p.getUint16(18, true);
      break;
    case 109: // RADIO_STATUS
      t.radioRssi = p.getUint8(4); t.radioRemRssi = p.getUint8(5); t.radioNoise = p.getUint8(7);
      break;
    case 147: // BATTERY_STATUS
      { const pct = p.getInt8(35); if (pct >= 0) t.batteryPct = pct; }
      break;
    case 42: // MISSION_CURRENT
      t.missionCurrent = p.getUint16(0, true);
      break;
    case 77: // COMMAND_ACK
      t.lastAck = { command: p.getUint16(0, true), result: p.getUint8(2), atMs: Date.now() };
      break;
    case 285: { // GIMBAL_DEVICE_ATTITUDE_STATUS: quaternion w,x,y,z at 4..19
      const w = p.getFloat32(4, true), x = p.getFloat32(8, true), y = p.getFloat32(12, true), z = p.getFloat32(16, true);
      if (Number.isFinite(w)) {
        t.gimbalPitchDeg = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * R2D;
        t.gimbalYawDeg = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * R2D;
      }
      break;
    }
    case 158: // MOUNT_STATUS: pitch, roll, yaw in centidegrees
      t.gimbalPitchDeg = p.getInt32(0, true) / 100; t.gimbalYawDeg = p.getInt32(8, true) / 100;
      break;
    case 180: // CAMERA_FEEDBACK (ArduPilot): where the aircraft was when the shutter fired
      logPhoto(t, 'FEEDBACK', p.getInt32(8, true) / 1e7, p.getInt32(12, true) / 1e7, p.getFloat32(20, true), true, p.getUint16(40, true));
      break;
    case 112: // CAMERA_TRIGGER (PX4): a trigger pulse; the position is the aircraft's latest
      logPhoto(t, 'TRIGGER', t.lat, t.lon, t.altRelM, true, p.getUint32(8, true));
      break;
    case 263: // CAMERA_IMAGE_CAPTURED (MAVLink camera): position in 1e7 degrees, altitude in mm, and a result
      logPhoto(t, 'CAMERA', p.getInt32(12, true) / 1e7, p.getInt32(16, true) / 1e7, p.getInt32(24, true) / 1000, p.getInt8(49) === 1, p.getInt32(44, true));
      break;
    case 168: // WIND: direction the wind comes from, speed
      t.windFromDeg = (p.getFloat32(0, true) + 360) % 360; t.windMps = p.getFloat32(4, true);
      break;
    case 242: // HOME_POSITION
      t.home = { lat: p.getInt32(0, true) / 1e7, lon: p.getInt32(4, true) / 1e7, altMslM: p.getInt32(8, true) / 1000 };
      break;
    case 148: // AUTOPILOT_VERSION: capabilities u64, uid u64, flight_sw_version u32 at 16
      t.swVersion = p.getUint32(16, true);
      break;
    case 162: // FENCE_STATUS: breach_time u32, breach_count u16, breach_status u8 at 6, breach_type u8 at 7
      t.fenceBreached = p.getUint8(6) !== 0;
      break;
    case 253: { // STATUSTEXT
      let s = ''; for (let i = 1; i < 51; i++) { const c = p.getUint8(i); if (!c) break; s += String.fromCharCode(c); }
      t.statusText = s; break;
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

let seq = 0;
const GCS_SYS = 255, GCS_COMP = 190;

function frame(msgId: number, payload: Uint8Array, sys = GCS_SYS, comp = GCS_COMP): Uint8Array {
  // Trim trailing zeros (v2), keep at least one byte.
  let len = payload.length; while (len > 1 && payload[len - 1] === 0) len--;
  const out = new Uint8Array(12 + len);
  out[0] = 0xfd; out[1] = len; out[2] = 0; out[3] = 0; out[4] = seq = (seq + 1) & 0xff; out[5] = sys; out[6] = comp;
  out[7] = msgId & 0xff; out[8] = (msgId >> 8) & 0xff; out[9] = (msgId >> 16) & 0xff;
  out.set(payload.subarray(0, len), 10);
  let crc = x25(out, 1, 10 + len); crc = x25Byte(crc, CRC_EXTRA[msgId] ?? 0);
  out[10 + len] = crc & 0xff; out[11 + len] = crc >> 8;
  return out;
}

/** Any message, framed as if from `sys`/`comp` (tests use it to play the autopilot's side). */
export function encodeRaw(msgId: number, payload: Uint8Array, sys = GCS_SYS, comp = GCS_COMP): Uint8Array { return frame(msgId, payload, sys, comp); }

/** GCS heartbeat — most autopilots want to see one before they'll stream. */
export function encodeHeartbeat(): Uint8Array {
  const p = new Uint8Array(9); const v = new DataView(p.buffer);
  v.setUint32(0, 0, true); p[4] = 6 /* MAV_TYPE_GCS */; p[5] = 8 /* MAV_AUTOPILOT_INVALID */; p[6] = 0; p[7] = 4 /* ACTIVE */; p[8] = 3;
  return frame(0, p);
}

export const MAV_CMD = {
  NAV_WAYPOINT: 16, RETURN_TO_LAUNCH: 20, LAND: 21, TAKEOFF: 22, DO_SET_MODE: 176, COMPONENT_ARM_DISARM: 400, SET_MESSAGE_INTERVAL: 511, REQUEST_MESSAGE: 512,
  DO_SET_RELAY: 181, DO_REPOSITION: 192, DO_MOUNT_CONTROL: 205, SET_CAMERA_ZOOM: 531, SET_CAMERA_SOURCE: 534,
  DO_GIMBAL_MANAGER_PITCHYAW: 1000, IMAGE_START_CAPTURE: 2000, MISSION_START: 300, DO_FENCE_ENABLE: 207,
} as const;
export const MAV_RESULT = { ACCEPTED: 0, TEMPORARILY_REJECTED: 1, DENIED: 2, UNSUPPORTED: 3, FAILED: 4, IN_PROGRESS: 5 } as const;
/** ArduCopter custom modes (the reference autopilot for this platform). */
export const COPTER_MODE = { STABILIZE: 0, ALT_HOLD: 2, AUTO: 3, GUIDED: 4, LOITER: 5, RTL: 6, LAND: 9, POSHOLD: 16 } as const;
const MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 6, MAV_FRAME_GLOBAL_INT = 5;
const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1;

/** COMMAND_LONG to system 1 / autopilot component. */
export function encodeCommandLong(cmd: number, params: number[] = [], targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(33); const v = new DataView(p.buffer);
  for (let i = 0; i < 7; i++) v.setFloat32(i * 4, params[i] ?? 0, true);
  v.setUint16(28, cmd, true); p[30] = targetSys; p[31] = targetComp; p[32] = 0;
  return frame(76, p);
}

/** Change flight mode (ArduPilot custom mode numbers; PX4 uses its own — see README). */
export function encodeSetMode(customMode: number): Uint8Array {
  return encodeCommandLong(MAV_CMD.DO_SET_MODE, [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, customMode]);
}
export function encodeArm(arm: boolean, force = false, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.COMPONENT_ARM_DISARM, [arm ? 1 : 0, force ? 21196 : 0], targetSys);
}
export function encodeTakeoff(altM: number): Uint8Array {
  return encodeCommandLong(MAV_CMD.TAKEOFF, [0, 0, 0, NaN, NaN, NaN, altM]);
}

/** Fly to a position in GUIDED mode: SET_POSITION_TARGET_GLOBAL_INT, position only. */
export function encodeGotoGlobal(lat: number, lon: number, altRelM: number, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(53); const v = new DataView(p.buffer);
  v.setUint32(0, 0, true);
  v.setInt32(4, Math.round(lat * 1e7), true); v.setInt32(8, Math.round(lon * 1e7), true); v.setFloat32(12, altRelM, true);
  for (let i = 16; i < 48; i += 4) v.setFloat32(i, 0, true);
  v.setUint16(48, 0b0000_1111_1111_1000, true); // ignore velocity, acceleration, yaw, yaw rate
  p[50] = targetSys; p[51] = targetComp; p[52] = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT;
  return frame(86, p);
}

// ---- Mission protocol ------------------------------------------------------

/**
 * One mission item. Waypoints need only lat/lon/alt (and an optional hold); DO_
 * commands pass `params` (param1–4) and `frame` 2 (MAV_FRAME_MISSION).
 */
export interface MissionItem { lat: number; lon: number; altRelM: number; holdS?: number; command?: number; params?: [number, number, number, number]; frame?: number }

/** `missionType`: 0 mission, 1 geofence, 2 rally points. */
export function encodeMissionCount(count: number, targetSys = 1, targetComp = 1, missionType = 0): Uint8Array {
  const p = new Uint8Array(5); const v = new DataView(p.buffer);
  v.setUint16(0, count, true); p[2] = targetSys; p[3] = targetComp; p[4] = missionType;
  return frame(44, p);
}
export function encodeMissionClearAll(targetSys = 1, targetComp = 1, missionType = 0): Uint8Array {
  const p = new Uint8Array(3); p[0] = targetSys; p[1] = targetComp; p[2] = missionType;
  return frame(45, p);
}
/** Mission items carry the plain frame numbers; on the wire MISSION_ITEM_INT uses the _INT variants. */
const INT_FRAME: Record<number, number> = { 0: 5 /* GLOBAL → GLOBAL_INT */, 3: 6 /* GLOBAL_RELATIVE_ALT → _INT */, 10: 11 /* GLOBAL_TERRAIN_ALT → _INT */ };
/** MISSION_ITEM_INT; seq 0 is the home item ArduPilot expects, so callers offset by one. */
export function encodeMissionItemInt(seq: number, item: MissionItem, current = 0, targetSys = 1, targetComp = 1, missionType = 0): Uint8Array {
  const p = new Uint8Array(38); const v = new DataView(p.buffer);
  const pr = item.params;
  v.setFloat32(0, pr ? pr[0] : item.holdS ?? 0, true); v.setFloat32(4, pr ? pr[1] : 0, true); v.setFloat32(8, pr ? pr[2] : 0, true); v.setFloat32(12, pr ? pr[3] : NaN, true);
  v.setInt32(16, Math.round(item.lat * 1e7), true); v.setInt32(20, Math.round(item.lon * 1e7), true); v.setFloat32(24, item.altRelM, true);
  v.setUint16(28, seq, true); v.setUint16(30, item.command ?? MAV_CMD.NAV_WAYPOINT, true);
  p[32] = targetSys; p[33] = targetComp; p[34] = item.frame === undefined ? MAV_FRAME_GLOBAL_RELATIVE_ALT_INT : INT_FRAME[item.frame] ?? item.frame; p[35] = current; p[36] = 1; p[37] = missionType;
  return frame(73, p);
}
export function encodeMissionAck(type = 0, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(4); p[0] = targetSys; p[1] = targetComp; p[2] = type; p[3] = 0;
  return frame(47, p);
}
/** Decode the sequence number the autopilot is asking for (MISSION_REQUEST / _INT). */
export function decodeMissionRequestSeq(f: MavFrame): number | null {
  return f.msgId === 40 || f.msgId === 51 ? f.payload.getUint16(0, true) : null;
}
/** Decode MISSION_ACK type (0 = accepted). */
export function decodeMissionAck(f: MavFrame): number | null {
  return f.msgId === 47 ? f.payload.getUint8(2) : null;
}

/** Ask the autopilot to stream a message at a rate. */
export function encodeSetInterval(msgId: number, hz: number, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.SET_MESSAGE_INTERVAL, [msgId, hz > 0 ? 1e6 / hz : -1], targetSys);
}

export const FIX_NAMES: Record<number, string> = { 0: 'No GPS', 1: 'No fix', 2: '2D', 3: '3D', 4: 'DGPS', 5: 'RTK float', 6: 'RTK fixed' };

// ---------------------------------------------------------------------------
// Autopilots: ArduPilot and PX4 speak the same MAVLink but number flight modes
// differently and treat takeoff altitude and mission item 0 differently.
// ---------------------------------------------------------------------------

/**
 * A heartbeat from an aircraft's autopilot (component 1). Not a camera or gimbal, not a SiK radio
 * or companion computer (MAV_AUTOPILOT_INVALID = 8), not another ground station (MAV_TYPE_GCS = 6).
 */
export function isVehicleHeartbeat(f: MavFrame): boolean {
  return f.msgId === 0 && f.compId === 1 && f.payload.getUint8(5) !== 8 && f.payload.getUint8(4) !== 6;
}

export type Autopilot = 'ARDUPILOT' | 'PX4' | 'UNKNOWN';
/** HEARTBEAT.autopilot: MAV_AUTOPILOT_ARDUPILOTMEGA = 3, MAV_AUTOPILOT_PX4 = 12. */
export const autopilotOf = (t: Pick<Telemetry, 'autopilot'>): Autopilot => (t.autopilot === 12 ? 'PX4' : t.autopilot === 3 ? 'ARDUPILOT' : 'UNKNOWN');

/** Flight modes the dashboards use, independent of autopilot. */
export type FlightMode = 'STABILIZE' | 'ALT_HOLD' | 'POSITION' | 'GUIDED' | 'AUTO' | 'LOITER' | 'RTL' | 'LAND' | 'TAKEOFF' | 'MANUAL' | 'OTHER';

/**
 * ArduPilot numbers custom_mode per firmware, and the firmware shows in HEARTBEAT.type
 * (pymavlink's AP_MAV_TYPE_MODE_MAP): GUIDED is 4 on Copter but 15 on Plane and Rover,
 * and Copter's RTL (6) is Plane's FBWB. Unknown (0, no heartbeat yet) keeps Copter, the reference.
 */
export type ArduFirmware = 'COPTER' | 'PLANE' | 'ROVER' | null;
const COPTER_TYPES = [0, 2, 3, 4, 13, 14, 15, 29, 35, 43], PLANE_TYPES = [1, 19, 20, 21, 22, 23, 24, 25], VTOL_TYPES = [19, 20, 21, 22, 23, 24, 25], ROVER_TYPES = [10, 11];
/** null: an ArduPilot firmware whose modes the dashboards do not drive (Sub, Tracker, Blimp...), so nothing is sent. */
export const arduFirmware = (vehicleType = 0): ArduFirmware =>
  COPTER_TYPES.includes(vehicleType) ? 'COPTER' : PLANE_TYPES.includes(vehicleType) ? 'PLANE' : ROVER_TYPES.includes(vehicleType) ? 'ROVER' : null;
const ARDU_MODE: Record<'COPTER' | 'PLANE' | 'ROVER', Partial<Record<FlightMode, number>>> = {
  COPTER: { STABILIZE: 0, ALT_HOLD: 2, AUTO: 3, GUIDED: 4, LOITER: 5, RTL: 6, LAND: 9, POSITION: 16 },
  PLANE: { MANUAL: 0, STABILIZE: 2, AUTO: 10, RTL: 11, LOITER: 12, TAKEOFF: 13, GUIDED: 15 },
  ROVER: { MANUAL: 0, LOITER: 5, AUTO: 10, RTL: 11, GUIDED: 15 },
};
/** QuadPlane: its VTOL modes land and hold (QLAND, QLOITER); a fixed wing has neither. */
const VTOL_EXTRA: Partial<Record<FlightMode, number>> = { LAND: 20, POSITION: 19 };
const invert = (m: Partial<Record<FlightMode, number>>): Record<number, FlightMode> => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k as FlightMode]));
const ARDU_NAME: Record<'COPTER' | 'PLANE' | 'ROVER', Record<number, FlightMode>> = {
  COPTER: invert(ARDU_MODE.COPTER), ROVER: invert(ARDU_MODE.ROVER),
  PLANE: { ...invert(ARDU_MODE.PLANE), ...invert(VTOL_EXTRA), 21: 'RTL' /* QRTL */ },
};
/** PX4 custom_mode = main_mode << 16 | sub_mode << 24. AUTO sub-modes: 2 takeoff, 3 loiter, 4 mission, 5 RTL, 6 land. */
const PX4_MODE: Partial<Record<FlightMode, [number, number]>> = {
  MANUAL: [1, 0], ALT_HOLD: [2, 0], POSITION: [3, 0], STABILIZE: [7, 0],
  TAKEOFF: [4, 2], LOITER: [4, 3], AUTO: [4, 4], RTL: [4, 5], LAND: [4, 6],
  // PX4 has no GUIDED; a reposition command flies there and holds, which is the same idea.
  GUIDED: [4, 3],
};

export function modeName(t: Pick<Telemetry, 'autopilot' | 'customMode'> & Partial<Pick<Telemetry, 'vehicleType'>>): FlightMode {
  if (autopilotOf(t) === 'PX4') {
    const main = (t.customMode >> 16) & 0xff, sub = (t.customMode >>> 24) & 0xff;
    if (main === 4) return ({ 2: 'TAKEOFF', 3: 'LOITER', 4: 'AUTO', 5: 'RTL', 6: 'LAND' } as Record<number, FlightMode>)[sub] ?? 'OTHER';
    return ({ 1: 'MANUAL', 2: 'ALT_HOLD', 3: 'POSITION', 6: 'GUIDED', 7: 'STABILIZE' } as Record<number, FlightMode>)[main] ?? 'OTHER';
  }
  const fw = arduFirmware(t.vehicleType);
  return (fw && ARDU_NAME[fw][t.customMode]) || 'OTHER';
}

export const MODE_LABEL: Record<FlightMode, string> = {
  STABILIZE: 'Stabilize', ALT_HOLD: 'Alt hold', POSITION: 'Position hold', GUIDED: 'Guided', AUTO: 'Auto', LOITER: 'Loiter',
  RTL: 'RTL', LAND: 'Land', TAKEOFF: 'Takeoff', MANUAL: 'Manual', OTHER: 'Other',
};

/**
 * DO_SET_MODE for the given autopilot (ArduPilot numbering when unknown), numbered for the
 * vehicle's HEARTBEAT.type. Null when this vehicle has no such mode: nothing is sent.
 */
export function encodeFlightMode(ap: Autopilot, mode: FlightMode, targetSys = 1, vehicleType = 0): Uint8Array | null {
  if (ap === 'PX4') {
    const m = PX4_MODE[mode]; if (!m) return null;
    return encodeCommandLong(MAV_CMD.DO_SET_MODE, [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, m[0], m[1]], targetSys);
  }
  const fw = arduFirmware(vehicleType); if (!fw) return null;
  const m = ARDU_MODE[fw][mode] ?? (VTOL_TYPES.includes(vehicleType) ? VTOL_EXTRA[mode] : undefined); if (m === undefined) return null;
  return encodeCommandLong(MAV_CMD.DO_SET_MODE, [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, m], targetSys);
}

/** COMMAND_INT: like COMMAND_LONG but with lat/lon as integers (no float32 rounding of positions). */
export function encodeCommandInt(cmd: number, params: [number, number, number, number], latE7: number, lonE7: number, z: number, frameId = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(35); const v = new DataView(p.buffer);
  params.forEach((x, i) => v.setFloat32(i * 4, x, true));
  v.setInt32(16, latE7, true); v.setInt32(20, lonE7, true); v.setFloat32(24, z, true);
  v.setUint16(28, cmd, true); p[30] = targetSys; p[31] = targetComp; p[32] = frameId; p[33] = 0; p[34] = 0;
  return frame(75, p);
}

/** DO_REPOSITION: fly to a point and hold (PX4's go-to; ArduPilot 4.1+ accepts it too). Param2 bit 1 = switch mode. */
export function encodeReposition(lat: number, lon: number, altRelM: number, targetSys = 1): Uint8Array {
  return encodeCommandInt(MAV_CMD.DO_REPOSITION, [-1, 1, 0, NaN], Math.round(lat * 1e7), Math.round(lon * 1e7), altRelM, MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, targetSys);
}
/**
 * DO_REPOSITION for this autopilot. PX4 reads z as AMSL whatever the frame: mavlink_receiver.cpp
 * (handle_message_command_int) looks at the frame only to scale x/y and copies z to param7 as is,
 * and navigator_main.cpp (VEHICLE_CMD_DO_REPOSITION) sets the setpoint's AMSL alt from param7.
 * A height above home would put it into the ground wherever the field is above sea level: send
 * home AMSL + height, like takeoff does, in MAV_FRAME_GLOBAL_INT to say what it is (QGC does too).
 */
export function encodeRepositionFor(ap: Autopilot, lat: number, lon: number, altRelM: number, t: Pick<Telemetry, 'altMslM' | 'altRelM'>, targetSys = 1): Uint8Array {
  if (ap !== 'PX4') return encodeReposition(lat, lon, altRelM, targetSys);
  const amsl = t.altMslM ? t.altMslM - t.altRelM + altRelM : NaN; // NaN: PX4 keeps its current altitude
  return encodeCommandInt(MAV_CMD.DO_REPOSITION, [-1, 1, 0, NaN], Math.round(lat * 1e7), Math.round(lon * 1e7), amsl, MAV_FRAME_GLOBAL_INT, targetSys);
}

/**
 * NAV_TAKEOFF. ArduPilot reads param7 as altitude above home; PX4 reads it as
 * altitude above sea level, so for PX4 the caller passes the current AMSL + climb.
 */
export function encodeTakeoffFor(ap: Autopilot, altM: number, t: Pick<Telemetry, 'altMslM' | 'altRelM'>, targetSys = 1): Uint8Array {
  if (ap === 'PX4') {
    const amsl = t.altMslM ? t.altMslM - t.altRelM + altM : NaN; // NaN: PX4 uses its default takeoff height
    return encodeCommandLong(MAV_CMD.TAKEOFF, [-1, 0, 0, NaN, NaN, NaN, amsl], targetSys);
  }
  return encodeCommandLong(MAV_CMD.TAKEOFF, [0, 0, 0, NaN, NaN, NaN, altM], targetSys);
}

// ---------------------------------------------------------------------------
// Payload: gimbal, camera, relay. All go to the autopilot, which forwards to
// its gimbal/camera driver (ArduPilot MNTx / CAMx, PX4 gimbal v2 and camera).
// ---------------------------------------------------------------------------

/** Gimbal protocol v2: pitch and yaw in degrees (NaN leaves an axis alone). Param5 flags 0, param7 gimbal 0 = all. */
export function encodeGimbalPitchYaw(pitchDeg: number, yawDeg = NaN, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW, [pitchDeg, yawDeg, NaN, NaN, 0, 0, 0], targetSys);
}
/** Legacy gimbal command, for autopilots that answer UNSUPPORTED to the v2 command. Param7 = MAV_MOUNT_MODE_MAVLINK_TARGETING. */
export function encodeMountControl(pitchDeg: number, yawDeg = 0, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.DO_MOUNT_CONTROL, [pitchDeg, 0, yawDeg, 0, 0, 0, 2], targetSys);
}
/** Zoom as a percentage of the camera's range (ZOOM_TYPE_RANGE = 2). */
export function encodeCameraZoom(percent: number, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.SET_CAMERA_ZOOM, [2, Math.max(0, Math.min(100, percent))], targetSys);
}
/** Main image source: 1 = colour (RGB), 2 = thermal (IR). Param1 device 0 = all cameras. */
export function encodeCameraSource(source: 'RGB' | 'IR', targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.SET_CAMERA_SOURCE, [0, source === 'IR' ? 2 : 1, 0], targetSys);
}
/** Relay on/off (spotlight, drop, beacon). */
export function encodeRelay(instance: number, on: boolean, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.DO_SET_RELAY, [instance, on ? 1 : 0], targetSys);
}
/** One still photo. Param3 = 1 image, param2 interval 0. */
export function encodeTakePhoto(targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.IMAGE_START_CAPTURE, [0, 0, 1, 0], targetSys);
}

// ---------------------------------------------------------------------------
// Parameters: PARAM_REQUEST_READ (20), PARAM_VALUE (22), PARAM_SET (23).
//
// The value travels in a float32 whatever the parameter's type, and the two
// autopilots put an integer there differently:
//   ArduPilot  C cast: an INT8 FENCE_TYPE of 7 is sent as 7.0f, type INT8
//              (libraries/GCS_MAVLink/GCS_Param.cpp: send_parameter_value takes cast_to_float).
//   PX4        bytewise: an INT32 GF_ACTION of 3 is the int32's four bytes in the float field
//              (a denormal if read as a float), type INT32. PARAM_SET must carry the parameter's
//              own type or it is refused as a type mismatch (src/modules/mavlink/mavlink_parameters.cpp:
//              send_param memcpy, the PARAM_SET type check; mavlink_main.cpp advertises
//              MAV_PROTOCOL_CAPABILITY_PARAM_ENCODE_BYTEWISE).
// param_id is char[16], NUL-terminated only when shorter than 16 (FENCE_ALT_MAX_TP fills it).
// ---------------------------------------------------------------------------

export const MAV_PARAM_TYPE = { UINT8: 1, INT8: 2, UINT16: 3, INT16: 4, UINT32: 5, INT32: 6, UINT64: 7, INT64: 8, REAL32: 9, REAL64: 10 } as const;
export type ParamEncoding = 'CAST' | 'BYTEWISE';
/** PX4 encodes bytewise; ArduPilot (and anything unknown: C cast is the common default) casts. */
export const paramEncodingOf = (ap: Autopilot): ParamEncoding => (ap === 'PX4' ? 'BYTEWISE' : 'CAST');
export interface ParamValue { name: string; value: number; type: number; count: number; index: number }

const isIntType = (type: number) => type >= 1 && type <= 8;
function writeParamId(p: Uint8Array, at: number, name: string) {
  if (name.length > 16 || !/^[\x20-\x7e]*$/.test(name)) throw new Error(`Bad parameter name ${JSON.stringify(name)}`);
  for (let i = 0; i < name.length; i++) p[at + i] = name.charCodeAt(i); // shorter names stay NUL-padded
}
function readParamId(v: DataView, at: number): string {
  let s = ''; for (let i = 0; i < 16; i++) { const c = v.getUint8(at + i); if (!c) break; s += String.fromCharCode(c); }
  return s;
}
/** Bytewise puts the integer's own bytes in the float field (little endian, widened to 4). */
function writeParamValue(v: DataView, at: number, value: number, type: number, enc: ParamEncoding) {
  if (enc === 'BYTEWISE' && isIntType(type)) {
    const n = Math.round(value), unsigned = type === MAV_PARAM_TYPE.UINT8 || type === MAV_PARAM_TYPE.UINT16 || type === MAV_PARAM_TYPE.UINT32;
    if (unsigned) v.setUint32(at, n >>> 0, true); else v.setInt32(at, n | 0, true);
  } else v.setFloat32(at, isIntType(type) ? Math.round(value) : value, true);
}
function readParamValue(v: DataView, at: number, type: number, enc: ParamEncoding): number {
  if (enc !== 'BYTEWISE' || !isIntType(type)) return v.getFloat32(at, true);
  switch (type) {
    case MAV_PARAM_TYPE.UINT8: return v.getUint8(at);
    case MAV_PARAM_TYPE.INT8: return v.getInt8(at);
    case MAV_PARAM_TYPE.UINT16: return v.getUint16(at, true);
    case MAV_PARAM_TYPE.INT16: return v.getInt16(at, true);
    case MAV_PARAM_TYPE.UINT32: return v.getUint32(at, true);
    default: return v.getInt32(at, true); // INT32; 64-bit types do not fit the field and arrive truncated
  }
}

/** Ask for one parameter by name (param_index −1). */
export function encodeParamRequestRead(name: string, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(20); const v = new DataView(p.buffer);
  v.setInt16(0, -1, true); p[2] = targetSys; p[3] = targetComp; writeParamId(p, 4, name);
  return frame(20, p);
}
/** Set one parameter; the autopilot answers with a PARAM_VALUE carrying what it now holds. */
export function encodeParamSet(name: string, value: number, type: number, enc: ParamEncoding, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(23); const v = new DataView(p.buffer);
  writeParamValue(v, 0, value, type, enc); p[4] = targetSys; p[5] = targetComp; writeParamId(p, 6, name); p[22] = type;
  return frame(23, p);
}
export function decodeParamValue(f: MavFrame, enc: ParamEncoding): ParamValue | null {
  if (f.msgId !== 22) return null;
  const v = f.payload, type = v.getUint8(24);
  return { name: readParamId(v, 8), value: readParamValue(v, 0, type, enc), type, count: v.getUint16(4, true), index: v.getUint16(6, true) };
}
/** PARAM_ERROR: the named parameter and MAV_PARAM_ERROR (1 does not exist, 2 out of range, 3 denied, 5 read only, 7 type mismatch). */
export function decodeParamError(f: MavFrame): { name: string; error: number } | null {
  return f.msgId === 345 ? { name: readParamId(f.payload, 4), error: f.payload.getUint8(20) } : null;
}
export const PARAM_ERROR_TEXT: Record<number, string> = { 1: 'does not exist', 2: 'value out of range', 3: 'permission denied', 4: 'component not found', 5: 'read only', 6: 'type unsupported', 7: 'type mismatch', 8: 'read failed' };
/** The value as the autopilot will hold it: what the PARAM_VALUE echo of a set must show. */
export function paramStored(value: number, type: number): number { return isIntType(type) ? Math.round(value) : Math.fround(value); }

export const FENCE_TYPE = { ALT_MAX: 1, CIRCLE: 2, POLYGON: 4, ALT_MIN: 8 } as const;
/**
 * DO_FENCE_ENABLE. `types` (param2) is a FENCE_TYPE bitmask, 0 = all. ArduPilot 4.6 and later enable only those
 * types (and only ones also in its FENCE_TYPE parameter); 4.5 and earlier ignore param2 and enable every type in
 * FENCE_TYPE (libraries/GCS_MAVLink/GCS_Fence.cpp, handle_command_do_fence_enable: Copter-4.5 vs Copter-4.6.0 and master).
 */
export function encodeFenceEnable(on: boolean, types = 0, targetSys = 1): Uint8Array {
  return encodeCommandLong(MAV_CMD.DO_FENCE_ENABLE, [on ? 1 : 0, types], targetSys);
}
