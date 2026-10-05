import { MAV_CMD, MAV_RESULT, encodeCommandLong, encodeFlightMode, encodeRepositionFor, encodeTakeoffFor, capabilitiesOf, FEATURE_LABEL, type Autopilot, type FlightMode, type Telemetry, type VehicleKind, type Feature } from '../link/mavlink';
import { metresPerDegree } from '../lib/geo';

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

/** `unsupported`: this aircraft can't take the command; nothing is sent and the reason is shown as its refusal. */
export interface Step { cmd: number; params: number[]; mode?: FlightMode; to?: { x: number; y: number; altM: number }; unsupported?: string }

export const FORCE_DISARM = 21196;   // MAVLink magic number: disarm even in flight

export const CMD_LABEL: Record<Cmd['k'], string> = {
  ARM: 'Arm', DISARM: 'Disarm', TAKEOFF: 'Take off', HOLD: 'Hold position', GOTO: 'Go to', RTL: 'Return home', LAND: 'Land', KILL: 'Stop motors', MODE: 'Set mode',
};

/**
 * Who may send it (operator roles): 'abort' commands bring aircraft down or stop them where they are,
 * and a visual observer may send those; everything else, stopping motors included, is the pilot's.
 */
export function commandRole(c: Cmd): 'fly' | 'abort' {
  return c.k === 'LAND' || c.k === 'RTL' || c.k === 'HOLD' || c.k === 'DISARM' ? 'abort' : 'fly';
}

export function describe(c: Cmd): string {
  switch (c.k) {
    case 'TAKEOFF': return `Take off to ${c.altM} m`;
    case 'GOTO': return `Move to ${c.altM} m`;
    case 'MODE': return `Mode ${c.mode.toLowerCase().replace('_', ' ')}`;
    default: return CMD_LABEL[c.k];
  }
}

const FEATURE_OF: Record<Cmd['k'], Feature> = { ARM: 'ARM', DISARM: 'ARM', KILL: 'ARM', TAKEOFF: 'TAKEOFF', HOLD: 'HOLD', GOTO: 'GOTO', RTL: 'RTL', LAND: 'LAND', MODE: 'MODES' };

/**
 * The MAVLink steps for a command on this autopilot and airframe (multirotor unless said). The airframe
 * matters for ArduPilot: a fixed wing takes off in Takeoff mode and lands through its mission's landing
 * sequence, a QuadPlane lands and holds in its VTOL modes, a rover holds instead of landing.
 */
export function stepsFor(c: Cmd, ap: Autopilot, kind: VehicleKind = 'COPTER'): Step[] {
  const cap = capabilitiesOf(ap, kind)[FEATURE_OF[c.k]];
  if (cap.level === 'no') return [{ cmd: 0, params: [], unsupported: `${FEATURE_LABEL[FEATURE_OF[c.k]]}: ${cap.note}` }];
  const ardu = ap === 'ARDUPILOT';
  switch (c.k) {
    case 'ARM': return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }];
    case 'DISARM': return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [0] }];
    case 'KILL': return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [0, FORCE_DISARM] }];
    // Each aircraft arms itself just before its own takeoff: a staggered launch of 500 takes longer
    // than the 10 s ArduCopter waits before disarming an armed aircraft that has not taken off.
    case 'TAKEOFF':
      if (ap === 'PX4') return [{ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }, { cmd: MAV_CMD.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: c.altM } }];
      // ArduPlane fixed wing: Takeoff mode, then arm; it climbs to its TKOFF_ALT.
      if (ardu && kind === 'PLANE') return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: 'TAKEOFF' }, { cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }];
      return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: 'GUIDED' }, { cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }, { cmd: MAV_CMD.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: c.altM } }];
    case 'HOLD': return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: ardu && kind === 'VTOL' ? 'POSITION' : ardu && kind === 'ROVER' ? 'HOLD' : 'LOITER' }];
    case 'GOTO': return [{ cmd: MAV_CMD.DO_REPOSITION, params: [], to: { x: c.x, y: c.y, altM: c.altM } }];
    case 'RTL': return [{ cmd: MAV_CMD.RETURN_TO_LAUNCH, params: [] }];
    case 'LAND':
      if (ardu && kind === 'VTOL') return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: 'LAND' }];
      // A rover does not land: it stops. ArduRover's Hold mode; PX4's rover holds in its loiter (Hold) mode.
      if (kind === 'ROVER') return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: ardu ? 'HOLD' : 'LOITER' }];
      if (ardu && kind === 'PLANE') return [{ cmd: MAV_CMD.DO_LAND_START, params: [] }];
      return [{ cmd: MAV_CMD.LAND, params: [] }];
    case 'MODE': return [{ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: c.mode }];
  }
}

/** Local metres to latitude / longitude around an origin (flat-earth, fine over a show site). */
export function toLatLon(origin: { lat: number; lon: number }, x: number, y: number) {
  const k = metresPerDegree(origin.lat);
  return { lat: origin.lat + y / k.lat, lon: origin.lon + x / k.lon };
}
export function toLocal(origin: { lat: number; lon: number }, lat: number, lon: number) {
  const k = metresPerDegree(origin.lat);
  return { x: (lon - origin.lon) * k.lon, y: (lat - origin.lat) * k.lat };
}

/** One step as bytes for a real aircraft. */
export function encodeStep(s: Step, ap: Autopilot, sys: number, t: Pick<Telemetry, 'altMslM' | 'altRelM' | 'lat' | 'lon'> & Partial<Pick<Telemetry, 'vehicleType'>>, origin: { lat: number; lon: number }): Uint8Array | null {
  if (s.cmd === MAV_CMD.DO_SET_MODE) return encodeFlightMode(ap, s.mode!, sys, t.vehicleType);
  if (s.cmd === MAV_CMD.TAKEOFF) return encodeTakeoffFor(ap, s.to!.altM, t, sys);
  if (s.cmd === MAV_CMD.DO_REPOSITION) {
    const p = Number.isNaN(s.to!.x) ? { lat: t.lat, lon: t.lon } : toLatLon(origin, s.to!.x, s.to!.y);
    return encodeRepositionFor(ap, p.lat, p.lon, s.to!.altM, t, sys);
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
    case MAV_CMD.DO_LAND_START: return v.mode === 'AUTO' || !v.airborne;
    case MAV_CMD.RETURN_TO_LAUNCH: return v.mode === 'RTL' || v.mode === 'LAND' || !v.airborne;
    default: return false;
  }
}

export const RESULT_NAME: Record<number, string> = {
  [MAV_RESULT.ACCEPTED]: 'accepted', [MAV_RESULT.TEMPORARILY_REJECTED]: 'busy, try again', [MAV_RESULT.DENIED]: 'refused',
  [MAV_RESULT.UNSUPPORTED]: 'not supported', [MAV_RESULT.FAILED]: 'failed', [MAV_RESULT.IN_PROGRESS]: 'in progress',
};
