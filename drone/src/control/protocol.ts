import { MAV_CMD, MAV_RESULT, encodeCommandLong, encodeFlightMode, encodeReposition, encodeTakeoffFor, type Autopilot, type FlightMode, type Telemetry } from '../link/mavlink';

/**
 * The control vocabulary, shared by one aircraft and a fleet of 500.
 *
 * Each command becomes one or more MAVLink steps. A step waits for that
 * aircraft's COMMAND_ACK before the next is sent: ArduCopter only takes off in
 * GUIDED, and refuses the takeoff if the mode change has not landed first (found
 * flying real ArduCopter SITL). The simulated aircraft answer the same command
 * numbers, so the dispatcher runs the same logic in the demo as on a real link.
 *
 * Positions are local metres (x east, y north) from the fleet origin; a live
 * link turns them into latitude and longitude as it sends.
 */

export type Cmd =
  | { k: 'ARM' }
  | { k: 'DISARM' }
  | { k: 'TAKEOFF'; altM: number }
  | { k: 'HOLD' }
  | { k: 'GOTO'; x: number; y: number; altM: number }
  | { k: 'RTL' }
  | { k: 'LAND' }
  | { k: 'KILL' }
  | { k: 'MODE'; mode: FlightMode };

export interface Step { cmd: number; params: number[]; mode?: FlightMode; to?: { x: number; y: number; altM: number } }

export const FORCE_DISARM = 21196;   // MAVLink magic number: disarm even in flight

export const CMD_LABEL: Record<Cmd['k'], string> = {
  ARM: 'Arm', DISARM: 'Disarm', TAKEOFF: 'Take off', HOLD: 'Hold position', GOTO: 'Go to', RTL: 'Return home', LAND: 'Land', KILL: 'Stop motors', MODE: 'Set mode',
};

export function describe(c: Cmd): string {
  switch (c.k) {
    case 'TAKEOFF': return `Take off to ${c.altM} m`;
    case 'GOTO': return `Move to ${c.altM} m`;
    case 'MODE': return `Mode ${c.mode.toLowerCase().replace('_', ' ')}`;
    default: return CMD_LABEL[c.k];
  }
}

/** The MAVLink steps for a command on this autopilot. */
export function stepsFor(c: Cmd, ap: Autopilot): Step[] {
  switch (c.k) {
    case 'ARM': return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }];
    case 'DISARM': return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [0] }];
    case 'KILL': return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [0, FORCE_DISARM] }];
    // Each aircraft arms itself just before its own takeoff: a staggered launch of 500 takes longer
    // than the 10 s ArduCopter waits before disarming an armed aircraft that has not taken off.
    case 'TAKEOFF': return ap === 'PX4'
      ? [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }, { cmd: MAV_CMD.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: c.altM } }]
      : [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: 'GUIDED' }, { cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }, { cmd: MAV_CMD.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: c.altM } }];
    case 'HOLD': return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: 'LOITER' }];
    case 'GOTO': return [{ cmd: MAV_CMD.DO_REPOSITION, params: [], to: { x: c.x, y: c.y, altM: c.altM } }];
    case 'RTL': return [{ cmd: MAV_CMD.RETURN_TO_LAUNCH, params: [] }];
    case 'LAND': return [{ cmd: MAV_CMD.LAND, params: [] }];
    case 'MODE': return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: c.mode }];
  }
}

/** Local metres to latitude / longitude around an origin (flat-earth, fine over a show site). */
export function toLatLon(origin: { lat: number; lon: number }, x: number, y: number) {
  return { lat: origin.lat + y / 111320, lon: origin.lon + x / (111320 * Math.cos((origin.lat * Math.PI) / 180)) };
}
export function toLocal(origin: { lat: number; lon: number }, lat: number, lon: number) {
  return { x: (lon - origin.lon) * 111320 * Math.cos((origin.lat * Math.PI) / 180), y: (lat - origin.lat) * 111320 };
}

/** One step as bytes for a real aircraft. */
export function encodeStep(s: Step, ap: Autopilot, sys: number, t: Pick<Telemetry, 'altMslM' | 'altRelM' | 'lat' | 'lon'>, origin: { lat: number; lon: number }): Uint8Array | null {
  if (s.cmd === MAV_CMD.DO_SET_MODE) return encodeFlightMode(ap, s.mode!, sys);
  if (s.cmd === MAV_CMD.TAKEOFF) return encodeTakeoffFor(ap, s.to!.altM, t, sys);
  if (s.cmd === MAV_CMD.DO_REPOSITION) {
    const p = Number.isNaN(s.to!.x) ? { lat: t.lat, lon: t.lon } : toLatLon(origin, s.to!.x, s.to!.y);
    return encodeReposition(p.lat, p.lon, s.to!.altM, sys);
  }
  return encodeCommandLong(s.cmd, s.params, sys);
}

/** Whether a vehicle's state shows a step done (see Transport.verify). */
export function stepDone(s: Step, v: { armed: boolean; airborne: boolean; mode: string }): boolean {
  switch (s.cmd) {
    case MAV_CMD.COMPONENT_ARM_DISARM: return s.params[0] >= 1 ? v.armed : !v.armed;
    case MAV_CMD.TAKEOFF: return v.airborne;
    case MAV_CMD.DO_SET_MODE: return v.mode === s.mode;
    case MAV_CMD.LAND: return v.mode === 'LAND' || !v.airborne;
    case MAV_CMD.RETURN_TO_LAUNCH: return v.mode === 'RTL' || v.mode === 'LAND' || !v.airborne;
    default: return false;
  }
}

export const RESULT_NAME: Record<number, string> = {
  [MAV_RESULT.ACCEPTED]: 'accepted', [MAV_RESULT.TEMPORARILY_REJECTED]: 'busy, try again', [MAV_RESULT.DENIED]: 'refused',
  [MAV_RESULT.UNSUPPORTED]: 'not supported', [MAV_RESULT.FAILED]: 'failed', [MAV_RESULT.IN_PROGRESS]: 'in progress',
};
