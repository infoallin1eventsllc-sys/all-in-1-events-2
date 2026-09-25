import type { MavFrame } from '../link/mavlink';

/**
 * Health messages the autopilot sends, decoded into plain values.
 *
 * Every field offset below is the MAVLink v2 wire layout (fields sorted by size),
 * checked byte for byte against pymavlink in scripts/diagnostics.test.mjs.
 *
 *   36    SERVO_OUTPUT_RAW       what each motor / servo is being told to do (µs)
 *   241   VIBRATION              accelerometer vibration and clipping counts
 *   11030 ESC_TELEMETRY_1_TO_4   ArduPilot: rpm, current, voltage, temperature per ESC
 *   11031 ESC_TELEMETRY_5_TO_8
 *   291   ESC_STATUS             PX4: rpm, voltage, current per ESC
 *   147   BATTERY_STATUS         cell voltages, temperature, fault bits
 *   1     SYS_STATUS             which sensors are present / enabled / healthy
 *   193   EKF_STATUS_REPORT      ArduPilot navigation filter variances
 *   230   ESTIMATOR_STATUS       PX4 navigation filter test ratios
 *   125   POWER_STATUS           flight controller supply rails
 *   148   AUTOPILOT_VERSION      firmware version (asked for on connect)
 *   253   STATUSTEXT             the autopilot's own warnings, with severity
 */

export type HealthMsg =
  | { k: 'OUTPUTS'; us: number[] }
  | { k: 'VIBE'; x: number; y: number; z: number; clip: [number, number, number] }
  | { k: 'ESC'; first: number; rpm: number[]; currentA: number[]; voltageV: number[]; tempC: (number | null)[] }
  | { k: 'BATTERY'; /** Battery monitor instance; several packs or monitors report separately. */ id?: number; cellsV: number[]; packV: number | null; tempC: number | null; currentA: number | null; remainingPct: number | null; faults: number }
  | { k: 'SENSORS'; present: number; enabled: number; health: number; dropRatePct: number; packV: number | null; currentA: number | null }
  | { k: 'NAV'; source: 'EKF' | 'ESTIMATOR'; velocity: number; posHoriz: number; posVert: number; compass: number; flags: number }
  | { k: 'POWER'; vccV: number; servoV: number; flags: number }
  | { k: 'VERSION'; major: number; minor: number; patch: number; type: number; board: number; git: string }
  | { k: 'TEXT'; severity: number; text: string };

/** Message ids to ask the autopilot to stream, with a rate in Hz. */
export const HEALTH_STREAMS: [number, number][] = [[36, 4], [241, 2], [11030, 2], [291, 2], [147, 1], [193, 1], [230, 1], [125, 1]];

const NO_CELL = 0xffff;

export function decodeHealth(f: MavFrame): HealthMsg | null {
  const p = f.payload;
  switch (f.msgId) {
    case 36: {
      const us: number[] = [];
      for (let i = 0; i < 8; i++) us.push(p.getUint16(4 + i * 2, true));
      for (let i = 0; i < 8; i++) us.push(p.getUint16(21 + i * 2, true)); // servo9..16 (extension, zero if absent)
      const port = p.getUint8(20);
      if (port !== 0) return null; // outputs 9–16 on AUX port messages are not motors
      return { k: 'OUTPUTS', us };
    }
    case 241:
      return { k: 'VIBE', x: p.getFloat32(8, true), y: p.getFloat32(12, true), z: p.getFloat32(16, true), clip: [p.getUint32(20, true), p.getUint32(24, true), p.getUint32(28, true)] };
    case 11030: case 11031: {
      const rpm: number[] = [], currentA: number[] = [], voltageV: number[] = [], tempC: (number | null)[] = [];
      for (let i = 0; i < 4; i++) {
        voltageV.push(p.getUint16(i * 2, true) / 100);
        currentA.push(p.getUint16(8 + i * 2, true) / 100);
        rpm.push(p.getUint16(24 + i * 2, true));
        tempC.push(p.getUint8(40 + i));
      }
      return { k: 'ESC', first: f.msgId === 11030 ? 0 : 4, rpm, currentA, voltageV, tempC };
    }
    case 291: {
      const rpm: number[] = [], currentA: number[] = [], voltageV: number[] = [];
      for (let i = 0; i < 4; i++) {
        rpm.push(p.getInt32(8 + i * 4, true));
        voltageV.push(p.getFloat32(24 + i * 4, true));
        currentA.push(p.getFloat32(40 + i * 4, true));
      }
      return { k: 'ESC', first: p.getUint8(56), rpm, currentA, voltageV, tempC: [null, null, null, null] };
    }
    case 147: {
      const main: number[] = [];
      for (let i = 0; i < 10; i++) main.push(p.getUint16(10 + i * 2, true));
      const raw = main.slice();
      for (let i = 0; i < 4; i++) { const v = p.getUint16(41 + i * 2, true); if (v !== 0) raw.push(v); } // voltages_ext: 0 = unused
      const used = raw.filter(v => v !== NO_CELL && v !== 0);
      let cellsV: number[] = [], packV: number | null = null;
      if (main[0] === NO_CELL - 1) {
        // No cell readings and a pack over 65.534 V: cell 0 holds 65534 and the rest carries into cell 1, 2, … (MAVLink BATTERY_STATUS.voltages).
        let mv = 0; for (const v of main) { if (v === NO_CELL || v === 0) break; mv += v; }
        packV = mv / 1000;
      } else if (used.length === 1 && used[0] > 5000) packV = used[0] / 1000; // one entry is the pack, not a cell ("if cells are unknown, fill cell 0 with the total")
      else { cellsV = used.map(v => v / 1000); packV = cellsV.length ? cellsV.reduce((s, v) => s + v, 0) : null; }
      const t = p.getInt16(8, true), c = p.getInt16(30, true), rem = p.getInt8(35);
      return {
        k: 'BATTERY', id: p.getUint8(32), cellsV, packV,
        tempC: t === 0x7fff ? null : t / 100, currentA: c === -1 ? null : c / 100, remainingPct: rem < 0 ? null : rem,
        faults: p.getUint32(50, true),
      };
    }
    case 1: {
      const c = p.getInt16(16, true), mv = p.getUint16(14, true);
      return { k: 'SENSORS', present: p.getUint32(0, true), enabled: p.getUint32(4, true), health: p.getUint32(8, true), dropRatePct: p.getUint16(18, true) / 100, packV: mv === NO_CELL ? null : mv / 1000, currentA: c === -1 ? null : c / 100 }; // UINT16_MAX: voltage not sent
    }
    case 193:
      return { k: 'NAV', source: 'EKF', velocity: p.getFloat32(0, true), posHoriz: p.getFloat32(4, true), posVert: p.getFloat32(8, true), compass: p.getFloat32(12, true), flags: p.getUint16(20, true) };
    case 230:
      return { k: 'NAV', source: 'ESTIMATOR', velocity: p.getFloat32(8, true), posHoriz: p.getFloat32(12, true), posVert: p.getFloat32(16, true), compass: p.getFloat32(20, true), flags: p.getUint16(40, true) };
    case 125:
      return { k: 'POWER', vccV: p.getUint16(0, true) / 1000, servoV: p.getUint16(2, true) / 1000, flags: p.getUint16(4, true) };
    case 148: {
      const v = p.getUint32(16, true);
      let git = '';
      for (let i = 0; i < 8; i++) { const c = p.getUint8(36 + i); if (!c) break; git += String.fromCharCode(c); }
      return { k: 'VERSION', major: (v >>> 24) & 0xff, minor: (v >>> 16) & 0xff, patch: (v >>> 8) & 0xff, type: v & 0xff, board: p.getUint32(28, true), git };
    }
    case 253: {
      let s = ''; for (let i = 1; i < 51; i++) { const c = p.getUint8(i); if (!c) break; s += String.fromCharCode(c); }
      return { k: 'TEXT', severity: p.getUint8(0), text: s };
    }
  }
  return null;
}
