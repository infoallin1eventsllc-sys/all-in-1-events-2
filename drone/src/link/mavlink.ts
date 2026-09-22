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
}

export const EMPTY_TELEMETRY: Telemetry = {
  heartbeatMs: 0, vehicleType: 0, autopilot: 0, baseMode: 0, customMode: 0, systemStatus: 0, armed: false,
  lat: 0, lon: 0, altMslM: 0, altRelM: 0, vxMps: 0, vyMps: 0, vzMps: 0, headingDeg: 0,
  rollDeg: 0, pitchDeg: 0, yawDeg: 0, airspeedMps: 0, groundspeedMps: 0, climbMps: 0, throttlePct: 0,
  batteryPct: -1, voltageV: 0, currentA: 0, fixType: 0, satellites: 0, hdop: 99,
  radioRssi: 0, radioNoise: 0, radioRemRssi: 0, statusText: '', msgsPerSec: 0, missionCurrent: 0, lastAck: null,
};

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

function frame(msgId: number, payload: Uint8Array): Uint8Array {
  // Trim trailing zeros (v2), keep at least one byte.
  let len = payload.length; while (len > 1 && payload[len - 1] === 0) len--;
  const out = new Uint8Array(12 + len);
  out[0] = 0xfd; out[1] = len; out[2] = 0; out[3] = 0; out[4] = seq = (seq + 1) & 0xff; out[5] = GCS_SYS; out[6] = GCS_COMP;
  out[7] = msgId & 0xff; out[8] = (msgId >> 8) & 0xff; out[9] = (msgId >> 16) & 0xff;
  out.set(payload.subarray(0, len), 10);
  let crc = x25(out, 1, 10 + len); crc = x25Byte(crc, CRC_EXTRA[msgId] ?? 0);
  out[10 + len] = crc & 0xff; out[11 + len] = crc >> 8;
  return out;
}

/** GCS heartbeat — most autopilots want to see one before they'll stream. */
export function encodeHeartbeat(): Uint8Array {
  const p = new Uint8Array(9); const v = new DataView(p.buffer);
  v.setUint32(0, 0, true); p[4] = 6 /* MAV_TYPE_GCS */; p[5] = 8 /* MAV_AUTOPILOT_INVALID */; p[6] = 0; p[7] = 4 /* ACTIVE */; p[8] = 3;
  return frame(0, p);
}

export const MAV_CMD = {
  NAV_WAYPOINT: 16, RETURN_TO_LAUNCH: 20, LAND: 21, TAKEOFF: 22, DO_SET_MODE: 176, COMPONENT_ARM_DISARM: 400, SET_MESSAGE_INTERVAL: 511, REQUEST_MESSAGE: 512,
} as const;
export const MAV_RESULT = { ACCEPTED: 0, TEMPORARILY_REJECTED: 1, DENIED: 2, UNSUPPORTED: 3, FAILED: 4, IN_PROGRESS: 5 } as const;
/** ArduCopter custom modes (the reference autopilot for this platform). */
export const COPTER_MODE = { STABILIZE: 0, ALT_HOLD: 2, AUTO: 3, GUIDED: 4, LOITER: 5, RTL: 6, LAND: 9, POSHOLD: 16 } as const;
const MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 6;
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
export function encodeArm(arm: boolean, force = false): Uint8Array {
  return encodeCommandLong(MAV_CMD.COMPONENT_ARM_DISARM, [arm ? 1 : 0, force ? 21196 : 0]);
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

export interface MissionItem { lat: number; lon: number; altRelM: number; holdS?: number; command?: number; }

export function encodeMissionCount(count: number, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(5); const v = new DataView(p.buffer);
  v.setUint16(0, count, true); p[2] = targetSys; p[3] = targetComp; p[4] = 0;
  return frame(44, p);
}
export function encodeMissionClearAll(targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(3); p[0] = targetSys; p[1] = targetComp; p[2] = 0;
  return frame(45, p);
}
/** MISSION_ITEM_INT; seq 0 is the home item ArduPilot expects, so callers offset by one. */
export function encodeMissionItemInt(seq: number, item: MissionItem, current = 0, targetSys = 1, targetComp = 1): Uint8Array {
  const p = new Uint8Array(38); const v = new DataView(p.buffer);
  v.setFloat32(0, item.holdS ?? 0, true); v.setFloat32(4, 0, true); v.setFloat32(8, 0, true); v.setFloat32(12, NaN, true);
  v.setInt32(16, Math.round(item.lat * 1e7), true); v.setInt32(20, Math.round(item.lon * 1e7), true); v.setFloat32(24, item.altRelM, true);
  v.setUint16(28, seq, true); v.setUint16(30, item.command ?? MAV_CMD.NAV_WAYPOINT, true);
  p[32] = targetSys; p[33] = targetComp; p[34] = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT; p[35] = current; p[36] = 1; p[37] = 0;
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
export function encodeSetInterval(msgId: number, hz: number): Uint8Array {
  return encodeCommandLong(MAV_CMD.SET_MESSAGE_INTERVAL, [msgId, hz > 0 ? 1e6 / hz : -1]);
}

export const FLIGHT_MODE_NAMES: Record<number, string> = { 0: 'Stabilize', 2: 'Alt hold', 3: 'Auto', 4: 'Guided', 5: 'Loiter', 6: 'RTL', 9: 'Land', 16: 'Position hold' };
export const FIX_NAMES: Record<number, string> = { 0: 'No GPS', 1: 'No fix', 2: '2D', 3: '3D', 4: 'DGPS', 5: 'RTK float', 6: 'RTK fixed' };
