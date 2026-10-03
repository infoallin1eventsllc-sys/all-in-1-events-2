export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface ColorRGBW {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  w: number; // 0-255 warm white
}

export interface LightShowDrone {
  id: string;
  droneIndex: number;
  position: Vector3D;
  targetPosition: Vector3D;
  homePosition: Vector3D;
  velocity: Vector3D;
  color: ColorRGBW;
  targetColor: ColorRGBW;
  battery: number; // 0-100%
  gpsSatellites: number; // e.g. 18-24 RTK
  syncOffsetMs: number; // clock offset from conductor master clock (target < 2ms)
  status: 'LAUNCH_PAD' | 'ARMED' | 'CLIMBING' | 'IN_FORMATION' | 'TRANSITIONING' | 'RTH' | 'LANDED' | 'EMERGENCY_ABORT';
  deviationMeters: number; // distance from planned trajectory (tolerance < 0.8m)
  hasCommsSync: boolean;
}

export interface ShowFormation {
  id: string;
  name: string;
  description: string;
  durationSeconds: number;
  paletteName: string;
  /** Positions and colours for `count` aircraft at `t` seconds into the cue; formations are alive. */
  generatePoints: (count: number, t?: number) => { pos: Vector3D; color: ColorRGBW }[];
  /** Seconds into the cue where the shape changes outright (a new number, say) rather than moving: the exporter flies a matched transition there. */
  cuts?: number[];
  /** The shape before spacing, for stepping through a cue with a Spacer. */
  shape?: (count: number, t?: number) => { pos: Vector3D; color: ColorRGBW }[];
}

export interface ShowTimelineCue {
  id: string;
  timeSeconds: number;
  formationId: string;
  transitionDurationSec: number;
  label: string;
}

export interface ShowConductorState {
  /** ABORTING: lights out, descending; ABORTED: every aircraft down (rewind resets). */
  status: 'PRE_FLIGHT' | 'ARMED' | 'RUNNING' | 'PAUSED' | 'ABORTING' | 'ABORTED' | 'SHOW_COMPLETE';
  currentTimeSec: number;
  totalDurationSec: number;
  activeFormationIndex: number;
  syncClockSource: 'GPS_1PPS' | 'PTP_IEEE_1588' | 'GROUND_RADIO_BROADCAST';
  clockJitterMs: number;
  broadcastPacketLossPct: number;
  allDronesSynced: boolean;
  minSeparationObservedMeters: number;
}

export interface SafetyValidationReport {
  trajectoriesDeconflicted: boolean;
  minSeparationMeters: number;
  criticalIntersectionsCount: number;
  geofenceViolationDetected: boolean;
  maxVelocityMps: number;
  maxAccelerationMps2: number;
  batteryReserveMarginPct: number;
}
