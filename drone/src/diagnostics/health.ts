import type { HealthMsg } from './decode';

/**
 * Aircraft health: turns the autopilot's own telemetry into "what is wrong,
 * with which part, and what to do about it" — live in flight and as a report
 * after landing.
 *
 * How mechanical faults show up in the numbers
 * --------------------------------------------
 * The flight controller keeps the aircraft level by giving each motor whatever
 * command it needs, so a weak corner shows up as that motor being worked harder
 * than the others for the same flight:
 *
 *   one motor high, rpm also high      a chipped, bent or loose propeller (less
 *                                      thrust per turn, so it has to spin faster)
 *   one motor high, current high       a dragging motor: worn bearings, a rubbing
 *                                      bell, a damaged winding
 *   one spin direction high            a tilted motor or twisted arm (the yaw has
 *                                      to be fought all flight), or a prop on the
 *                                      wrong way round
 *   one side high                      the load is off-centre (payload, battery)
 *   vibration / clipping               an unbalanced or damaged prop, a loose motor
 *                                      or a loose flight controller mount
 *
 * These are the same checks ArduPilot's log analysis and its in-flight
 * "Potential Thrust Loss" / "Yaw Imbalance" warnings are built on; those
 * warnings are also read directly from the autopilot's messages.
 *
 * What it cannot see: a crack that has not changed how the aircraft flies yet.
 * The post-flight report therefore always ends with a hands-on inspection list.
 */

export type Level = 'OK' | 'WATCH' | 'FAULT' | 'UNKNOWN';
export type Action = 'LAND' | 'REPLACE' | 'INSPECT' | 'CALIBRATE' | 'UPDATE' | 'MONITOR';
export type SystemId = 'PROPULSION' | 'AIRFRAME' | 'BATTERY' | 'SENSORS' | 'NAVIGATION' | 'GPS' | 'LINK' | 'POWER' | 'FIRMWARE';
export type Phase = 'NO_DATA' | 'BENCH' | 'FLYING' | 'LANDED';

export interface Finding {
  id: string;
  level: 'WATCH' | 'FAULT';
  system: SystemId;
  /** Part this points at, e.g. prop-3, motor-2, arm-1, battery, compass, firmware. */
  part?: string;
  /** Motor number (1-based) when the finding is about one corner. */
  motor?: number;
  title: string;
  detail: string;
  action: Action;
  /** Short imperative for the button / chip. */
  actionText: string;
}

export interface MotorState {
  n: number;
  angleDeg: number;          // 0 = nose, clockwise seen from above
  spin: 'CW' | 'CCW';
  outputPct: number | null;  // command, 0–100
  deviationPct: number | null; // against the average of all motors
  rpm: number | null;
  tempC: number | null;
  currentA: number | null;
  level: Level;
}

export interface SystemState { id: SystemId; label: string; level: Level; reading: string; detail: string }

export interface FrameInfo { kind: 'QUAD' | 'HEXA' | 'OCTO' | 'TRI' | 'PLANE' | 'VTOL' | 'OTHER' | 'UNKNOWN'; motors: number; label: string }

export interface HealthEvent { t: number; level: Level; text: string }

export interface VehicleState {
  armed: boolean; altRelM: number; throttlePct: number; groundspeedMps: number; rollDeg: number; pitchDeg: number;
  vehicleType: number; autopilot: number; fixType: number; satellites: number; hdop: number; radioRssi: number;
}

export interface HealthReport {
  at: number;
  phase: Phase;
  overall: Level;
  verdict: string;
  frame: FrameInfo;
  motors: MotorState[];
  systems: SystemState[];
  findings: Finding[];
  events: HealthEvent[];
  vibe: { x: number; y: number; z: number; clipDelta: number } | null;
  vibeHistory: { x: number; y: number; z: number }[];
  cellsV: number[];
  firmware: string | null;
  /** Seconds airborne in the current (or last) flight, and how many of those gave motor-balance data. */
  flightS: number;
  balanceSamples: number;
}

/** One flight's health, kept after landing (IndexedDB `health` store). */
export interface FlightHealth {
  id?: number;
  aircraft: string;
  source: 'LIVE' | 'SIMULATION';
  startedAt: number;
  endedAt: number;
  airborneS: number;
  overall: Level;
  verdict: string;
  frame: FrameInfo;
  findings: Finding[];
  motors: { n: number; meanOutputPct: number | null; deviationPct: number | null; maxTempC: number | null; rpmRatio: number | null; currentRatio: number | null }[];
  vibeMax: { x: number; y: number; z: number } | null;
  clipDelta: number;
  minCellV: number | null;
  maxCellSpreadV: number | null;
  maxBatteryTempC: number | null;
  events: HealthEvent[];
  sample?: boolean;
}

// ---------------------------------------------------------------------------
// Limits (sources in comments)
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** Single motor above the average, % of average command. */
  motorWatchPct: 8, motorFaultPct: 15,
  /** Top motor must stand out from the second by this many points to be "one motor". */
  motorIsolatePts: 6,
  /** Spin-direction imbalance, % (ArduPilot warns on sustained yaw I-term; this is the output-side equivalent). */
  yawWatchPct: 5, yawFaultPct: 10,
  /** Off-centre load, % (vector sum of per-motor deviation). */
  cgWatchPct: 7,
  /** Output at or above this % counts as saturated ("Potential Thrust Loss" in ArduPilot). */
  saturatedPct: 95, saturatedShare: 0.02,
  /** Vibration m/s², ArduPilot guidance: under 30 good, over 60 problems likely. */
  vibeWatch: 30, vibeFault: 60, clipFault: 50,
  /** ESC / motor temperature, °C. */
  escWatchC: 70, escFaultC: 85, escHotterC: 15,
  /** rpm / current ratio to the other motors that points at prop vs motor. */
  rpmHighRatio: 1.03, currentHighRatio: 1.12,
  /** Battery. */
  cellSpreadWatchV: 0.1, cellSpreadFaultV: 0.2, cellLowWatchV: 3.4, cellLowFaultV: 3.2, battWatchC: 55, battFaultC: 65,
  /** Navigation filter: ArduPilot variance (failsafe at 0.8), PX4 test ratio (fails at 1.0). */
  ekfWatch: 0.5, ekfFault: 0.8, estWatch: 0.5, estFault: 1.0,
  /** Flight controller 5 V rail. */
  vccLow: 4.7, vccFaultLow: 4.5, vccHigh: 5.5,
  /** Telemetry packets dropped, %. */
  dropWatchPct: 5, dropFaultPct: 20,
  /** Minimum samples (4 Hz outputs) before judging motor balance. */
  minBalanceSamples: 20,
} as const;

/** Oldest firmware this app recommends. Not "the latest" — the app works offline and cannot check that. */
export const MIN_FIRMWARE = { ARDUPILOT: [4, 5, 0], PX4: [1, 15, 0] } as const;

// ---------------------------------------------------------------------------
// Frames: motor positions and spin, in the autopilot's own motor numbering
// ---------------------------------------------------------------------------

type Geo = [number, 'CW' | 'CCW'][];
/** ArduPilot / PX4 X frames: angle from the nose, clockwise; motor 1 first. */
const GEOMETRY: Record<string, Geo> = {
  QUAD: [[45, 'CCW'], [-135, 'CCW'], [-45, 'CW'], [135, 'CW']],
  HEXA: [[90, 'CW'], [-90, 'CCW'], [-30, 'CW'], [150, 'CCW'], [30, 'CCW'], [-150, 'CW']],
  OCTO: [[22.5, 'CW'], [-157.5, 'CW'], [67.5, 'CCW'], [157.5, 'CCW'], [-22.5, 'CCW'], [-112.5, 'CCW'], [-67.5, 'CW'], [112.5, 'CW']],
  TRI: [[60, 'CCW'], [-60, 'CCW'], [180, 'CW']],
};

export function frameOf(vehicleType: number): FrameInfo {
  switch (vehicleType) {
    case 2: return { kind: 'QUAD', motors: 4, label: 'Quadcopter (X)' };
    case 13: return { kind: 'HEXA', motors: 6, label: 'Hexacopter (X)' };
    case 14: return { kind: 'OCTO', motors: 8, label: 'Octocopter (X)' };
    case 15: return { kind: 'TRI', motors: 3, label: 'Tricopter' };
    case 1: return { kind: 'PLANE', motors: 1, label: 'Fixed wing' };
    case 19: case 20: case 21: case 22: return { kind: 'VTOL', motors: 4, label: 'VTOL' };
    case 0: return { kind: 'UNKNOWN', motors: 4, label: 'Waiting for the aircraft' };
    default: return { kind: 'OTHER', motors: 4, label: 'Other vehicle' };
  }
}

export function motorLayout(frame: FrameInfo): { n: number; angleDeg: number; spin: 'CW' | 'CCW' }[] {
  const g = GEOMETRY[frame.kind] ?? (frame.kind === 'VTOL' || frame.kind === 'OTHER' || frame.kind === 'UNKNOWN' ? GEOMETRY.QUAD : null);
  if (g) return g.map(([angleDeg, spin], i) => ({ n: i + 1, angleDeg, spin }));
  return Array.from({ length: frame.motors }, (_, i) => ({ n: i + 1, angleDeg: 0, spin: 'CW' as const }));
}

// ---------------------------------------------------------------------------
// Motor balance analysis (pure; tested in scripts/diagnostics.test.mjs)
// ---------------------------------------------------------------------------

export interface BalanceInput {
  frame: FrameInfo;
  /** Mean output per motor, % of range. */
  outputPct: number[];
  rpm?: (number | null)[];
  currentA?: (number | null)[];
  /** Share of samples each motor spent saturated. */
  saturatedShare?: number[];
}

export interface BalanceResult { deviationPct: number[]; rpmRatio: (number | null)[]; currentRatio: (number | null)[]; findings: Finding[] }

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const round1 = (v: number) => Math.round(v * 10) / 10;
const SIDE = (deg: number) => {
  const names = ['the nose', 'the front-right', 'the right', 'the rear-right', 'the tail', 'the rear-left', 'the left', 'the front-left'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
};

export function analyzeBalance(inp: BalanceInput): BalanceResult {
  const layout = motorLayout(inp.frame);
  const n = Math.min(layout.length, inp.outputPct.length);
  const out = inp.outputPct.slice(0, n);
  const avg = mean(out);
  const dev = out.map(o => (avg > 0 ? ((o - avg) / avg) * 100 : 0));
  const ratio = (xs?: (number | null)[]) => {
    const vals = (xs ?? []).slice(0, n);
    const ok = vals.filter((v): v is number => v != null && v > 0);
    if (ok.length < n) return vals.map(() => null);
    const m = mean(ok);
    return vals.map(v => (v != null && m > 0 ? v / m : null));
  };
  const rpmRatio = ratio(inp.rpm), currentRatio = ratio(inp.currentA);
  const findings: Finding[] = [];
  if (n < 3 || avg <= 0) return { deviationPct: dev, rpmRatio, currentRatio, findings };

  // Saturation first: a motor at full power has no margin left.
  (inp.saturatedShare ?? []).slice(0, n).forEach((s, i) => {
    if (s >= LIMITS.saturatedShare) findings.push({
      id: `sat-${i + 1}`, level: 'FAULT', system: 'PROPULSION', part: `prop-${i + 1}`, motor: i + 1,
      title: `Motor ${i + 1} ran out of power`,
      detail: `It was at full command for ${Math.round(s * 100)}% of the flight, so the aircraft had no margin left at that corner. Check its propeller and motor before flying again.`,
      action: 'LAND', actionText: 'Land and inspect',
    });
  });

  const order = dev.map((d, i) => [d, i] as const).sort((a, b) => b[0] - a[0]);
  const [topDev, top] = order[0], secondDev = order[1][0];
  const isolated = topDev - secondDev >= LIMITS.motorIsolatePts;

  if (isolated && topDev >= LIMITS.motorWatchPct) {
    const m = top + 1, level = topDev >= LIMITS.motorFaultPct ? 'FAULT' : 'WATCH';
    const rr = rpmRatio[top], cr = currentRatio[top];
    let part = `prop-${m}`, title = `Motor ${m} or its propeller`, detail: string, action: Action = 'INSPECT', actionText = `Inspect prop and motor ${m}`;
    const pct = `${round1(topDev)}%`;
    if (rr != null && rr >= LIMITS.rpmHighRatio) {
      title = `Propeller on motor ${m} is damaged or loose`;
      detail = `Motor ${m} works ${pct} harder than average and spins ${round1((rr - 1) * 100)}% faster, so the prop is making less thrust per turn: chipped, bent, cracked or slipping on the shaft.`;
      action = 'REPLACE'; actionText = `Replace prop ${m}`;
    } else if (cr != null && cr >= LIMITS.currentHighRatio) {
      part = `motor-${m}`;
      title = `Motor ${m} is dragging`;
      detail = `Motor ${m} works ${pct} harder than average and draws ${round1((cr - 1) * 100)}% more current without spinning faster: worn bearings, a rubbing bell or a damaged winding.`;
      action = 'REPLACE'; actionText = `Replace motor ${m}`;
    } else {
      detail = `Motor ${m} works ${pct} harder than the others to hold the aircraft level. Spin it by hand: roughness or grinding means the motor; a chip, crack or bend means the propeller.${rr == null ? ' This aircraft does not report motor rpm, so the two cannot be told apart from the air.' : ''}`;
    }
    findings.push({ id: `motor-${m}`, level, system: 'PROPULSION', part, motor: m, title, detail, action, actionText });
  } else {
    // Spin-direction imbalance: twisted arm / tilted motor.
    const cw = layout.slice(0, n).map((l, i) => (l.spin === 'CW' ? out[i] : null)).filter((v): v is number => v != null);
    const ccw = layout.slice(0, n).map((l, i) => (l.spin === 'CCW' ? out[i] : null)).filter((v): v is number => v != null);
    const yaw = cw.length && ccw.length ? ((mean(cw) - mean(ccw)) / avg) * 100 : 0;
    if (Math.abs(yaw) >= LIMITS.yawWatchPct) {
      const harder = yaw > 0 ? 'clockwise' : 'counter-clockwise';
      findings.push({
        id: 'yaw', level: Math.abs(yaw) >= LIMITS.yawFaultPct ? 'FAULT' : 'WATCH', system: 'AIRFRAME', part: 'arms',
        title: 'Twisted arm or tilted motor',
        detail: `The ${harder} motors work ${round1(Math.abs(yaw))}% harder than the others all flight, which is the aircraft fighting a constant yaw. Usually an arm twisted in its clamp or a motor no longer square to the arm; also check every prop is the right way up.`,
        action: 'INSPECT', actionText: 'Check arms are square',
      });
    } else {
      // Off-centre load: deviation vector.
      let vx = 0, vy = 0;
      layout.slice(0, n).forEach((l, i) => { const a = (l.angleDeg * Math.PI) / 180; vx += Math.sin(a) * dev[i]; vy += Math.cos(a) * dev[i]; });
      const mag = (Math.hypot(vx, vy) * 2) / n, dir = (Math.atan2(vx, vy) * 180) / Math.PI;
      if (mag >= LIMITS.cgWatchPct) findings.push({
        id: 'cg', level: 'WATCH', system: 'AIRFRAME', part: 'payload',
        title: 'Load sits off-centre',
        detail: `The motors toward ${SIDE(dir)} work about ${round1(mag)}% harder. Move the battery or payload back to the centre of gravity; if nothing moved, look for a bent arm on that side.`,
        action: 'INSPECT', actionText: 'Re-centre the load',
      });
    }
  }
  return { deviationPct: dev, rpmRatio, currentRatio, findings };
}

// ---------------------------------------------------------------------------
// Autopilot messages → findings
// ---------------------------------------------------------------------------

export const SENSOR_BITS: [number, string, 'FAULT' | 'WATCH', Action][] = [
  [0x1, 'Gyroscope', 'FAULT', 'INSPECT'], [0x2, 'Accelerometer', 'FAULT', 'CALIBRATE'], [0x4, 'Compass', 'FAULT', 'CALIBRATE'],
  [0x8, 'Barometer', 'FAULT', 'INSPECT'], [0x10, 'Airspeed sensor', 'FAULT', 'INSPECT'], [0x20, 'GPS', 'FAULT', 'INSPECT'],
  [0x40, 'Optical flow', 'WATCH', 'INSPECT'], [0x100, 'Rangefinder', 'WATCH', 'INSPECT'],
  [0x8000, 'Motor outputs', 'FAULT', 'INSPECT'], [0x10000, 'RC receiver', 'FAULT', 'INSPECT'],
  [0x20000, 'Second gyroscope', 'FAULT', 'INSPECT'], [0x40000, 'Second accelerometer', 'FAULT', 'CALIBRATE'], [0x80000, 'Second compass', 'WATCH', 'CALIBRATE'],
  [0x100000, 'Geofence', 'WATCH', 'MONITOR'], [0x200000, 'Attitude estimate (AHRS)', 'FAULT', 'INSPECT'], [0x400000, 'Terrain data', 'WATCH', 'MONITOR'],
  [0x1000000, 'Logging', 'WATCH', 'INSPECT'], [0x2000000, 'Battery monitor', 'FAULT', 'INSPECT'], [0x4000000, 'Proximity sensor', 'WATCH', 'INSPECT'],
  [0x10000000, 'Pre-arm checks', 'WATCH', 'INSPECT'], [0x40000000, 'Propulsion', 'FAULT', 'INSPECT'],
];

const BATTERY_FAULTS: [number, string][] = [
  [1, 'deep discharge'], [2, 'voltage spikes'], [4, 'a failed cell'], [8, 'over-current'], [16, 'over-temperature'], [32, 'under-temperature'],
  [64, 'incompatible voltage'], [128, 'incompatible firmware'], [256, 'wrong cell configuration'],
];

interface TextRule { re: RegExp; make: (m: RegExpMatchArray) => Omit<Finding, 'id'> & { id: string } }
const TEXT_RULES: TextRule[] = [
  { re: /Potential Thrust Loss \((\d+)\)/i, make: m => ({ id: `sat-${m[1]}`, level: 'FAULT', system: 'PROPULSION', part: `prop-${m[1]}`, motor: +m[1], title: `Motor ${m[1]} ran out of power`, detail: `The autopilot reported motor ${m[1]} at full power while still losing height or attitude ("Potential Thrust Loss"). A damaged prop, a failing motor or ESC, or too much weight.`, action: 'LAND', actionText: 'Land and inspect' }) },
  { re: /Yaw Imbalance/i, make: () => ({ id: 'yaw-ap', level: 'WATCH', system: 'AIRFRAME', part: 'arms', title: 'Autopilot reports a yaw imbalance', detail: 'It is holding a constant yaw correction: a motor is tilted, an arm is twisted, or a prop is the wrong way up.', action: 'INSPECT', actionText: 'Check arms are square' }) },
  { re: /Vibration compensation/i, make: () => ({ id: 'vibe-comp', level: 'FAULT', system: 'AIRFRAME', part: 'props', title: 'Vibration too high to hold altitude normally', detail: 'The autopilot switched to vibration compensation. Balance or replace the propellers, tighten the motors and check the flight controller mount.', action: 'LAND', actionText: 'Land and inspect' }) },
  { re: /Crash/i, make: () => ({ id: 'crash', level: 'FAULT', system: 'AIRFRAME', part: 'frame', title: 'Crash detected', detail: 'Inspect every arm, propeller, motor and the flight controller mount before the next flight, even if it looks fine.', action: 'INSPECT', actionText: 'Full inspection' }) },
  { re: /(Motor|ESC)\s*\d*\s*(fail|failure|error|desync)/i, make: m => ({ id: 'esc-fail', level: 'FAULT', system: 'PROPULSION', part: 'esc', title: 'Motor or ESC failure reported', detail: `The autopilot said: "${m.input}".`, action: 'LAND', actionText: 'Land now' }) },
  { re: /(EKF|estimator|navigation).*(variance|fail|lane|error)/i, make: m => ({ id: 'nav-text', level: 'WATCH', system: 'NAVIGATION', part: 'gps', title: 'Navigation filter warning', detail: `The autopilot said: "${m.input}". Usually GPS or compass interference.`, action: 'MONITOR', actionText: 'Watch position hold' }) },
  { re: /GPS Glitch/i, make: () => ({ id: 'gps-glitch', level: 'WATCH', system: 'GPS', part: 'gps', title: 'GPS glitch', detail: 'Position jumped. Fly away from tall metal and buildings; if it repeats in open sky, check the GPS antenna and cable.', action: 'MONITOR', actionText: 'Watch position hold' }) },
  { re: /(compass|mag).*(inconsistent|interference|variance|not calibrated|unhealthy)/i, make: m => ({ id: 'compass-text', level: 'WATCH', system: 'SENSORS', part: 'compass', title: 'Compass problem', detail: `The autopilot said: "${m.input}". Recalibrate away from metal and keep power wires away from the GPS mast.`, action: 'CALIBRATE', actionText: 'Calibrate compass' }) },
  { re: /PreArm:\s*(.*)/i, make: m => ({ id: `prearm-${m[1].slice(0, 24)}`, level: 'WATCH', system: 'SENSORS', title: `Will not arm: ${m[1]}`, detail: 'The autopilot refuses to arm until this is fixed.', action: 'INSPECT', actionText: 'Fix before flight' }) },
];

const sevLevel = (s: number): Level => (s <= 3 ? 'FAULT' : s === 4 ? 'WATCH' : 'OK');

// ---------------------------------------------------------------------------
// The monitor
// ---------------------------------------------------------------------------

interface FlightAcc {
  startedAt: number; airborneS: number;
  outSum: number[]; outN: number; satN: number[]; outAll: number[]; allN: number;
  rpmSum: number[]; rpmN: number[]; curSum: number[]; curN: number[]; maxTemp: (number | null)[];
  vibeMax: { x: number; y: number; z: number } | null; clipStart: number | null; clipNow: number;
  minCell: number | null; maxSpread: number | null; maxBattTemp: number | null;
  latched: Map<string, Finding>;
}

const EMA = (prev: number | null, v: number, k: number) => (prev == null ? v : prev + (v - prev) * k);

export class HealthMonitor {
  private state: VehicleState | null = null;
  private stateAt = 0;
  private frame: FrameInfo = frameOf(0);
  private out: (number | null)[] = [];   // live EMA of motor output %
  private rpm: (number | null)[] = [];
  private cur: (number | null)[] = [];
  private temp: (number | null)[] = [];
  private escAt = 0;
  private vibe: { x: number; y: number; z: number } | null = null;
  private clip = 0;
  private vibeHist: { x: number; y: number; z: number }[] = [];
  private cells: number[] = [];
  private batt: Extract<HealthMsg, { k: 'BATTERY' }> | null = null;
  private sensors: Extract<HealthMsg, { k: 'SENSORS' }> | null = null;
  private nav: Extract<HealthMsg, { k: 'NAV' }> | null = null;
  private power: Extract<HealthMsg, { k: 'POWER' }> | null = null;
  private version: Extract<HealthMsg, { k: 'VERSION' }> | null = null;
  private events: HealthEvent[] = [];
  private flight: FlightAcc | null = null;
  private lastFlight: FlightAcc | null = null;
  private lastTick = 0;
  private everFlew = false;
  private benchLatched = new Map<string, { f: Finding; at: number }>();

  /** Called with every completed flight (at disarm). */
  onFlightEnd: ((r: FlightHealth) => void) | null = null;
  aircraft = 'Aircraft 1';
  source: 'LIVE' | 'SIMULATION' = 'LIVE';

  reset() {
    Object.assign(this, new HealthMonitor(), { onFlightEnd: this.onFlightEnd, aircraft: this.aircraft, source: this.source });
  }

  private airborne() { const s = this.state; return !!s && s.armed && (s.altRelM > 1 || s.throttlePct > 20); }

  /** `dtS` overrides the elapsed time (the simulation runs faster than the wall clock). */
  setState(s: VehicleState, t: number, dtS?: number) {
    const was = this.state?.armed ?? false;
    const dt = dtS ?? (this.lastTick ? Math.min(2, (t - this.lastTick) / 1000) : 0);
    this.lastTick = t;
    if (s.vehicleType && s.vehicleType !== this.state?.vehicleType) this.frame = frameOf(s.vehicleType);
    this.state = s; this.stateAt = t;
    if (s.armed && !was) this.startFlight(t);
    if (this.flight && this.airborne()) { this.flight.airborneS += dt; this.everFlew = true; }
    if (!s.armed && was && this.flight) this.endFlight(t);
  }

  private startFlight(t: number) {
    const n = 8;
    this.flight = {
      startedAt: t, airborneS: 0, outSum: Array(n).fill(0), outN: 0, satN: Array(n).fill(0), outAll: Array(n).fill(0), allN: 0,
      rpmSum: Array(n).fill(0), rpmN: Array(n).fill(0), curSum: Array(n).fill(0), curN: Array(n).fill(0), maxTemp: Array(n).fill(null),
      vibeMax: null, clipStart: null, clipNow: 0, minCell: null, maxSpread: null, maxBattTemp: null, latched: new Map(),
    };
    this.pushEvent(t, 'OK', 'Armed: flight health recording started');
  }

  private endFlight(t: number) {
    const f = this.flight!; this.flight = null; this.lastFlight = f;
    this.pushEvent(t, 'OK', 'Disarmed: post-flight report ready');
    if (f.airborneS < 5) return; // a spin-up on the ground is not a flight
    const report = this.flightReport(f, t);
    this.onFlightEnd?.(report);
  }

  private pushEvent(t: number, level: Level, text: string) {
    this.events.unshift({ t, level, text });
    if (this.events.length > 60) this.events.length = 60;
  }

  apply(m: HealthMsg, t: number) {
    const f = this.flight, air = this.airborne();
    switch (m.k) {
      case 'OUTPUTS': {
        const n = this.frame.kind === 'PLANE' ? 0 : this.frame.motors;
        const pct = m.us.slice(0, n).map(u => (u >= 900 && u <= 2200 ? Math.max(0, Math.min(100, (u - 1000) / 10)) : null));
        pct.forEach((p, i) => { this.out[i] = p == null ? null : EMA(this.out[i] ?? null, p, 0.12); });
        this.out.length = n;
        if (f && air && pct.every(p => p != null)) {
          const s = this.state!;
          f.allN++; pct.forEach((p, i) => { f.outAll[i] += p!; if (p! >= LIMITS.saturatedPct) f.satN[i]++; });
          // Balance only from steady flight: hovering or cruising gently, not manoeuvring.
          if (Math.abs(s.rollDeg) < 12 && Math.abs(s.pitchDeg) < 12 && s.groundspeedMps < 6) { f.outN++; pct.forEach((p, i) => { f.outSum[i] += p!; }); }
        }
        break;
      }
      case 'VIBE': {
        this.vibe = { x: m.x, y: m.y, z: m.z };
        const clip = m.clip[0] + m.clip[1] + m.clip[2]; this.clip = clip;
        this.vibeHist.push(this.vibe); if (this.vibeHist.length > 120) this.vibeHist.shift();
        if (f) {
          if (f.clipStart == null) f.clipStart = clip;
          f.clipNow = clip;
          if (air) f.vibeMax = { x: Math.max(f.vibeMax?.x ?? 0, m.x), y: Math.max(f.vibeMax?.y ?? 0, m.y), z: Math.max(f.vibeMax?.z ?? 0, m.z) };
        }
        break;
      }
      case 'ESC': {
        this.escAt = t;
        for (let i = 0; i < 4; i++) {
          const k = m.first + i; if (k >= 8) continue;
          this.rpm[k] = m.rpm[i]; this.cur[k] = m.currentA[i]; this.temp[k] = m.tempC[i];
          if (f && air) {
            if (m.rpm[i] > 0) { f.rpmSum[k] += m.rpm[i]; f.rpmN[k]++; }
            if (m.currentA[i] > 0) { f.curSum[k] += m.currentA[i]; f.curN[k]++; }
            const tc = m.tempC[i]; if (tc != null && tc > 0) f.maxTemp[k] = Math.max(f.maxTemp[k] ?? 0, tc);
          }
        }
        break;
      }
      case 'BATTERY': {
        this.batt = m; this.cells = m.cellsV;
        if (f && m.cellsV.length) {
          const lo = Math.min(...m.cellsV), hi = Math.max(...m.cellsV);
          f.minCell = Math.min(f.minCell ?? 9, lo); f.maxSpread = Math.max(f.maxSpread ?? 0, hi - lo);
        }
        if (f && m.tempC != null) f.maxBattTemp = Math.max(f.maxBattTemp ?? -99, m.tempC);
        break;
      }
      case 'SENSORS': this.sensors = m; break;
      case 'NAV': this.nav = m; break;
      case 'POWER': this.power = m; break;
      case 'VERSION': this.version = m; break;
      case 'TEXT': {
        const level = sevLevel(m.severity);
        this.pushEvent(t, level, m.text);
        for (const r of TEXT_RULES) {
          const mm = m.text.match(r.re); if (!mm) continue;
          const fnd = r.make(mm);
          if (f) f.latched.set(fnd.id, fnd); else this.benchLatched.set(fnd.id, { f: fnd, at: t });
          break;
        }
        break;
      }
    }
  }

  // ---- reports --------------------------------------------------------------

  private balanceFrom(acc: FlightAcc | null): { input: BalanceInput; samples: number } | null {
    const n = this.frame.kind === 'PLANE' ? 0 : this.frame.motors;
    if (!n) return null;
    if (acc) {
      const useSteady = acc.outN >= LIMITS.minBalanceSamples;
      const N = useSteady ? acc.outN : acc.allN;
      if (N < LIMITS.minBalanceSamples) return null;
      const sums = useSteady ? acc.outSum : acc.outAll;
      return {
        samples: N,
        input: {
          frame: this.frame, outputPct: sums.slice(0, n).map(s => s / N),
          rpm: acc.rpmN.slice(0, n).map((c, i) => (c ? acc.rpmSum[i] / c : null)),
          currentA: acc.curN.slice(0, n).map((c, i) => (c ? acc.curSum[i] / c : null)),
          saturatedShare: acc.satN.slice(0, n).map(s => (acc.allN ? s / acc.allN : 0)),
        },
      };
    }
    return null;
  }

  private findingsFor(acc: FlightAcc | null, live: boolean, t: number): { findings: Finding[]; balance: BalanceResult | null; samples: number } {
    const out: Finding[] = [];
    const bal = this.balanceFrom(acc);
    const balance = bal ? analyzeBalance(bal.input) : null;
    if (balance) out.push(...balance.findings);

    // ESC temperature and missing rpm
    const n = this.frame.kind === 'PLANE' ? 0 : this.frame.motors;
    const temps = live ? this.temp.slice(0, n) : (acc?.maxTemp ?? []).slice(0, n);
    const known = temps.filter((v): v is number => v != null && v > 0);
    if (known.length) {
      const med = [...known].sort((a, b) => a - b)[Math.floor(known.length / 2)];
      temps.forEach((tc, i) => {
        if (tc == null || tc <= 0) return;
        if (tc >= LIMITS.escWatchC) out.push({ id: `hot-${i + 1}`, level: tc >= LIMITS.escFaultC ? 'FAULT' : 'WATCH', system: 'PROPULSION', part: `motor-${i + 1}`, motor: i + 1, title: `Motor ${i + 1} / ESC running hot`, detail: `${Math.round(tc)} °C. Let it cool; if it runs hot again, check the motor bearings and that nothing blocks the ESC's airflow.`, action: tc >= LIMITS.escFaultC ? 'LAND' : 'MONITOR', actionText: tc >= LIMITS.escFaultC ? 'Land and let it cool' : 'Watch temperature' });
        else if (known.length >= 3 && tc - med >= LIMITS.escHotterC) out.push({ id: `hotter-${i + 1}`, level: 'WATCH', system: 'PROPULSION', part: `motor-${i + 1}`, motor: i + 1, title: `Motor ${i + 1} runs hotter than the rest`, detail: `${Math.round(tc)} °C against ${Math.round(med)} °C for the others. Early sign of a dragging motor or a damaged prop.`, action: 'INSPECT', actionText: `Inspect motor ${i + 1}` });
      });
    }
    if (live && this.airborne() && t - this.escAt < 3000) {
      const rpmNow = this.rpm.slice(0, n);
      if (rpmNow.some(r => r != null && r > 0)) rpmNow.forEach((r, i) => {
        if ((r ?? 0) === 0 && (this.out[i] ?? 0) > 20) out.push({ id: `norpm-${i + 1}`, level: 'FAULT', system: 'PROPULSION', part: `motor-${i + 1}`, motor: i + 1, title: `Motor ${i + 1} reports no rpm`, detail: 'The ESC stopped reporting speed while the motor is being driven. A stalled motor, a failing ESC or a loose telemetry wire.', action: 'LAND', actionText: 'Land now' });
      });
    }

    // Vibration
    const vib = live ? this.vibe : acc?.vibeMax ?? null;
    const clipDelta = acc && acc.clipStart != null ? acc.clipNow - acc.clipStart : 0;
    if (vib) {
      const worst = Math.max(vib.x, vib.y, vib.z);
      const axis = worst === vib.z ? 'vertical' : 'side-to-side';
      if (worst >= LIMITS.vibeWatch) out.push({ id: 'vibe', level: worst >= LIMITS.vibeFault ? 'FAULT' : 'WATCH', system: 'AIRFRAME', part: 'props', title: worst >= LIMITS.vibeFault ? 'Vibration is too high' : 'Vibration is higher than it should be', detail: `${Math.round(worst)} m/s² peak, mostly ${axis} (good is under ${LIMITS.vibeWatch}). Balance or replace the propellers, check every motor is tight on its arm, and that the flight controller's foam or mount has not worked loose.`, action: worst >= LIMITS.vibeFault ? 'REPLACE' : 'INSPECT', actionText: worst >= LIMITS.vibeFault ? 'Replace / balance props' : 'Check props and mounts' });
    }
    if (clipDelta > 0) out.push({ id: 'clip', level: clipDelta >= LIMITS.clipFault ? 'FAULT' : 'WATCH', system: 'AIRFRAME', part: 'fc-mount', title: 'Accelerometer hit its limit', detail: `${clipDelta} clipping events this flight (should be zero). The flight controller is being shaken past what it can measure: soften its mount and fix the vibration source.`, action: 'INSPECT', actionText: 'Check FC mount' });

    // Battery
    const b = this.batt;
    const cells = live ? (b?.cellsV ?? []) : [];
    const spread = live ? (cells.length ? Math.max(...cells) - Math.min(...cells) : null) : acc?.maxSpread ?? null;
    const lowCell = live ? (cells.length ? Math.min(...cells) : null) : acc?.minCell ?? null;
    const bt = live ? b?.tempC ?? null : acc?.maxBattTemp ?? null;
    if (spread != null && spread >= LIMITS.cellSpreadWatchV) out.push({ id: 'cell-spread', level: spread >= LIMITS.cellSpreadFaultV ? 'FAULT' : 'WATCH', system: 'BATTERY', part: 'battery', title: 'Battery cells are out of balance', detail: `${(spread * 1000).toFixed(0)} mV between the highest and lowest cell (keep under ${LIMITS.cellSpreadWatchV * 1000}). Balance-charge it; if the gap comes back, retire the pack.`, action: spread >= LIMITS.cellSpreadFaultV ? 'REPLACE' : 'INSPECT', actionText: spread >= LIMITS.cellSpreadFaultV ? 'Retire this pack' : 'Balance-charge' });
    if (lowCell != null && lowCell > 0 && lowCell < LIMITS.cellLowWatchV) out.push({ id: 'cell-low', level: lowCell < LIMITS.cellLowFaultV ? 'FAULT' : 'WATCH', system: 'BATTERY', part: 'battery', title: 'A cell dropped too low under load', detail: `Lowest cell ${lowCell.toFixed(2)} V. The pack is worn, too small for this load, or was flown too long.`, action: lowCell < LIMITS.cellLowFaultV ? (live ? 'LAND' : 'REPLACE') : 'MONITOR', actionText: lowCell < LIMITS.cellLowFaultV ? (live ? 'Land now' : 'Retire this pack') : 'Shorten flights' });
    if (bt != null && bt >= LIMITS.battWatchC) out.push({ id: 'batt-hot', level: bt >= LIMITS.battFaultC ? 'FAULT' : 'WATCH', system: 'BATTERY', part: 'battery', title: 'Battery is hot', detail: `${Math.round(bt)} °C. Let it cool before charging; a pack that keeps running hot has high internal resistance.`, action: 'MONITOR', actionText: 'Cool before charging' });
    if (b && b.faults) {
      const names = BATTERY_FAULTS.filter(([bit]) => b.faults & bit).map(([, n]) => n);
      out.push({ id: 'batt-fault', level: 'FAULT', system: 'BATTERY', part: 'battery', title: 'Battery reports a fault', detail: `The smart battery flags ${names.join(', ') || `code ${b.faults}`}.`, action: 'REPLACE', actionText: 'Swap the pack' });
    }

    // Sensors
    const s = this.sensors;
    if (s) for (const [bit, name, level, action] of SENSOR_BITS) {
      if ((s.present & bit) && (s.enabled & bit) && !(s.health & bit)) out.push({ id: `sensor-${bit}`, level, system: bit === 0x20 ? 'GPS' : 'SENSORS', part: name.toLowerCase(), title: `${name} unhealthy`, detail: `The autopilot marks its ${name.toLowerCase()} as present and enabled but not healthy.${action === 'CALIBRATE' ? ' Recalibrate it; if that does not clear it, check the wiring.' : ' Check its wiring and mounting.'}`, action, actionText: action === 'CALIBRATE' ? `Calibrate ${name.toLowerCase()}` : `Check ${name.toLowerCase()}` });
    }
    if (s && s.dropRatePct >= LIMITS.dropWatchPct) out.push({ id: 'drop', level: s.dropRatePct >= LIMITS.dropFaultPct ? 'FAULT' : 'WATCH', system: 'LINK', part: 'radio', title: 'Telemetry link dropping packets', detail: `${s.dropRatePct.toFixed(0)}% of packets lost. Check the antennas' orientation and connectors, and keep line of sight.`, action: 'INSPECT', actionText: 'Check antennas' });

    // Navigation filter
    const nv = this.nav;
    if (nv) {
      const [w, fl] = nv.source === 'EKF' ? [LIMITS.ekfWatch, LIMITS.ekfFault] : [LIMITS.estWatch, LIMITS.estFault];
      const parts: [number, string, string, Action][] = [[nv.compass, 'Compass', 'compass', 'CALIBRATE'], [nv.posHoriz, 'Horizontal position', 'gps', 'MONITOR'], [nv.velocity, 'Velocity', 'gps', 'MONITOR'], [nv.posVert, 'Height', 'barometer', 'MONITOR']];
      for (const [v, label, part, action] of parts) if (v >= w) out.push({ id: `nav-${part}-${label}`, level: v >= fl ? 'FAULT' : 'WATCH', system: 'NAVIGATION', part, title: `${label} estimate disagrees with the sensors`, detail: `${nv.source === 'EKF' ? 'EKF variance' : 'Estimator test ratio'} ${v.toFixed(2)} (limit ${fl}). ${label === 'Compass' ? 'Magnetic interference or a compass that needs calibrating.' : label === 'Height' ? 'Barometer disturbed by prop wash or sunlight; cover it with foam.' : 'GPS multipath or a glitch.'}`, action, actionText: action === 'CALIBRATE' ? 'Calibrate compass' : 'Watch position hold' });
    }

    // Power rail
    const pw = this.power;
    if (pw && pw.vccV > 0) {
      if (pw.vccV < LIMITS.vccLow || pw.vccV > LIMITS.vccHigh) out.push({ id: 'vcc', level: pw.vccV < LIMITS.vccFaultLow ? 'FAULT' : 'WATCH', system: 'POWER', part: 'power-module', title: 'Flight controller supply out of range', detail: `${pw.vccV.toFixed(2)} V on the 5 V rail. Check the power module or BEC and its plug.`, action: 'INSPECT', actionText: 'Check power module' });
      if (pw.flags & (8 | 16)) out.push({ id: 'overcurrent', level: 'FAULT', system: 'POWER', part: 'power-module', title: 'Peripheral over-current', detail: 'Something powered from the flight controller is drawing too much: a servo, a camera or a short.', action: 'INSPECT', actionText: 'Find the short' });
    }

    // GPS (from the heartbeat-level telemetry)
    const st = this.state;
    if (st && st.fixType > 0 && st.fixType < 3) out.push({ id: 'gps-fix', level: 'FAULT', system: 'GPS', part: 'gps', title: 'No 3D GPS fix', detail: `Fix type ${st.fixType}, ${st.satellites} satellites. Do not fly position-holding modes.`, action: 'MONITOR', actionText: 'Wait for GPS' });
    else if (st && st.fixType >= 3 && (st.satellites < 10 || st.hdop >= 2)) out.push({ id: 'gps-weak', level: 'WATCH', system: 'GPS', part: 'gps', title: 'Weak GPS', detail: `${st.satellites} satellites, HDOP ${st.hdop.toFixed(1)}.`, action: 'MONITOR', actionText: 'Wait for more satellites' });

    // Firmware
    const v = this.version;
    if (v && st) {
      const ap = st.autopilot === 12 ? 'PX4' : 'ARDUPILOT';
      const min = MIN_FIRMWARE[ap];
      const older = v.major < min[0] || (v.major === min[0] && (v.minor < min[1] || (v.minor === min[1] && v.patch < min[2])));
      if (older) out.push({ id: 'fw-old', level: 'WATCH', system: 'FIRMWARE', part: 'firmware', title: 'Firmware is out of date', detail: `${fwName(st.autopilot, v)} is older than ${min.join('.')}, the oldest this app recommends. Newer releases fix motor, EKF and failsafe bugs. Update with Mission Planner or QGroundControl, then redo the compass and accelerometer calibration.`, action: 'UPDATE', actionText: 'Update firmware' });
      if (v.type !== 255 && v.type !== 0) out.push({ id: 'fw-beta', level: 'WATCH', system: 'FIRMWARE', part: 'firmware', title: 'Test build of the firmware', detail: `${fwName(st.autopilot, v)} is a ${v.type < 128 ? 'alpha' : v.type < 192 ? 'beta' : 'release-candidate'} build. Use an official release for paid work.`, action: 'UPDATE', actionText: 'Install a stable release' });
    }

    // Latched autopilot warnings
    if (acc) for (const lf of acc.latched.values()) out.push(lf);
    if (live && !acc) for (const [id, e] of this.benchLatched) { if (t - e.at < 40_000) out.push(e.f); else this.benchLatched.delete(id); }

    // One finding per id, faults first.
    const byId = new Map<string, Finding>();
    for (const x of out) { const prev = byId.get(x.id); if (!prev || (prev.level === 'WATCH' && x.level === 'FAULT')) byId.set(x.id, x); }
    const findings = [...byId.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'FAULT' ? -1 : 1));
    return { findings, balance, samples: bal?.samples ?? 0 };
  }

  report(t: number = Date.now()): HealthReport {
    const st = this.state;
    const stale = !st || t - this.stateAt > 5000;
    const phase: Phase = stale ? 'NO_DATA' : this.airborne() ? 'FLYING' : !this.everFlew ? 'BENCH' : this.flight ? 'FLYING' : 'LANDED';
    const acc = this.flight ?? (phase === 'LANDED' ? this.lastFlight : null);
    // In the air: live readings plus this flight so far. After landing: the flight's own diagnosis.
    const { findings, balance, samples } = stale ? { findings: [], balance: null, samples: 0 }
      : phase === 'LANDED' ? this.findingsFor(this.lastFlight, false, t) : this.findingsFor(this.flight, true, t);
    const layout = motorLayout(this.frame);
    const n = this.frame.kind === 'PLANE' ? 0 : this.frame.motors;
    // Live deviation from the live averages when there's no flight balance yet.
    const liveOut = this.out.slice(0, n);
    const liveAvg = mean(liveOut.filter((v): v is number => v != null));
    const motors: MotorState[] = layout.slice(0, n).map((l, i) => {
      const fnd = findings.find(f => f.motor === l.n);
      const o = liveOut[i] ?? null;
      const dev = balance ? balance.deviationPct[i] : o != null && liveAvg > 5 ? ((o - liveAvg) / liveAvg) * 100 : null;
      return {
        ...l, outputPct: o, deviationPct: dev, rpm: this.rpm[i] ?? null, tempC: this.temp[i] ?? null, currentA: this.cur[i] ?? null,
        level: stale ? 'UNKNOWN' : fnd ? fnd.level : o == null ? 'UNKNOWN' : 'OK',
      };
    });
    const overall: Level = stale ? 'UNKNOWN' : findings.some(f => f.level === 'FAULT') ? 'FAULT' : findings.length ? 'WATCH' : 'OK';
    const top = findings[0];
    const verdict = stale ? 'No aircraft data'
      : overall === 'FAULT' ? (phase === 'FLYING' ? `Land as soon as it is safe: ${lc(top.title)}` : `Ground it: ${lc(top.title)}`)
      : overall === 'WATCH' ? `Fly with care: ${findings.length === 1 ? lc(top.title) : `${findings.length} things to watch`}`
      : phase === 'FLYING' ? 'All systems normal' : 'Fit to fly';
    const clipDelta = acc && acc.clipStart != null ? acc.clipNow - acc.clipStart : 0;
    return {
      at: t, phase, overall, verdict, frame: this.frame, motors, findings,
      systems: stale ? [] : this.systems(findings),
      events: this.events.slice(0, 30),
      vibe: this.vibe ? { ...this.vibe, clipDelta } : null,
      vibeHistory: this.vibeHist.slice(-60),
      cellsV: this.cells,
      firmware: this.version && st ? fwName(st.autopilot, this.version) : null,
      flightS: acc?.airborneS ?? 0, balanceSamples: samples,
    };
  }

  private systems(findings: Finding[]): SystemState[] {
    const lvl = (id: SystemId, known: boolean): Level => {
      const fs = findings.filter(f => f.system === id);
      return fs.some(f => f.level === 'FAULT') ? 'FAULT' : fs.length ? 'WATCH' : known ? 'OK' : 'UNKNOWN';
    };
    const st = this.state!;
    const n = this.frame.kind === 'PLANE' ? 0 : this.frame.motors;
    const outs = this.out.slice(0, n).filter((v): v is number => v != null);
    const rpmKnown = this.rpm.slice(0, n).some(r => r != null && r > 0);
    const temps = this.temp.slice(0, n).filter((v): v is number => v != null && v > 0);
    const nr = 'Not reported by this aircraft';
    const b = this.batt, cells = this.cells;
    const s = this.sensors;
    const sensorNames = s ? SENSOR_BITS.filter(([bit]) => (s.present & bit) && (s.enabled & bit)).map(([, nm]) => nm) : [];
    return [
      { id: 'PROPULSION', label: 'Motors and propellers', level: lvl('PROPULSION', outs.length > 0),
        reading: outs.length ? `${n} motors · ${Math.round(Math.min(...outs))}–${Math.round(Math.max(...outs))}% output` : nr,
        detail: [rpmKnown ? 'rpm from ESC telemetry' : 'no rpm telemetry', temps.length ? `hottest ${Math.round(Math.max(...temps))} °C` : null].filter(Boolean).join(' · ') },
      { id: 'AIRFRAME', label: 'Frame and vibration', level: lvl('AIRFRAME', !!this.vibe),
        reading: this.vibe ? `${Math.round(Math.max(this.vibe.x, this.vibe.y, this.vibe.z))} m/s² vibration` : nr,
        detail: this.vibe ? `clipping ${this.clip}` : 'arms, mounts and balance' },
      { id: 'BATTERY', label: 'Battery', level: lvl('BATTERY', !!b),
        reading: cells.length ? `${cells.length} cells · ${Math.min(...cells).toFixed(2)}–${Math.max(...cells).toFixed(2)} V` : b?.packV ? `${b.packV.toFixed(1)} V pack` : s ? `${s.packV.toFixed(1)} V pack` : nr,
        detail: [b?.tempC != null ? `${Math.round(b.tempC)} °C` : null, b?.remainingPct != null ? `${b.remainingPct}% left` : null, cells.length ? null : 'no per-cell voltages'].filter(Boolean).join(' · ') },
      { id: 'SENSORS', label: 'Sensors', level: lvl('SENSORS', !!s),
        reading: s ? `${sensorNames.length} sensors checked` : nr, detail: s ? sensorNames.slice(0, 4).join(', ') : '' },
      { id: 'NAVIGATION', label: 'Navigation filter', level: lvl('NAVIGATION', !!this.nav),
        reading: this.nav ? `${this.nav.source === 'EKF' ? 'variance' : 'test ratio'} ${Math.max(this.nav.velocity, this.nav.posHoriz, this.nav.posVert, this.nav.compass).toFixed(2)}` : nr,
        detail: this.nav ? `compass ${this.nav.compass.toFixed(2)} · position ${this.nav.posHoriz.toFixed(2)}` : '' },
      { id: 'GPS', label: 'GPS', level: lvl('GPS', st.fixType > 0),
        reading: st.fixType > 0 ? `${['No GPS', 'No fix', '2D fix', '3D fix', 'DGPS', 'RTK float', 'RTK fixed'][st.fixType] ?? 'Fix'} · ${st.satellites} sats` : nr,
        detail: st.fixType > 0 ? `HDOP ${st.hdop.toFixed(1)}` : '' },
      { id: 'LINK', label: 'Telemetry link', level: lvl('LINK', !!s),
        reading: s ? `${s.dropRatePct.toFixed(1)}% packets dropped` : nr, detail: st.radioRssi ? `RSSI ${st.radioRssi}` : '' },
      { id: 'POWER', label: 'Flight controller power', level: lvl('POWER', !!this.power && this.power.vccV > 0),
        reading: this.power && this.power.vccV > 0 ? `${this.power.vccV.toFixed(2)} V` : nr, detail: this.power?.servoV ? `servo rail ${this.power.servoV.toFixed(1)} V` : '' },
      { id: 'FIRMWARE', label: 'Firmware', level: lvl('FIRMWARE', !!this.version),
        reading: this.version ? fwName(st.autopilot, this.version) : 'Asked for; not reported yet', detail: this.version?.git ? `build ${this.version.git}` : '' },
    ];
  }

  private flightReport(acc: FlightAcc, t: number): FlightHealth {
    const { findings, balance } = this.findingsFor(acc, false, t);
    const n = this.frame.kind === 'PLANE' ? 0 : this.frame.motors;
    const bal = this.balanceFrom(acc);
    const overall: Level = findings.some(f => f.level === 'FAULT') ? 'FAULT' : findings.length ? 'WATCH' : 'OK';
    return {
      aircraft: this.aircraft, source: this.source, startedAt: acc.startedAt, endedAt: t, airborneS: Math.round(acc.airborneS),
      overall, verdict: overall === 'FAULT' ? `Ground it: ${lc(findings[0].title)}` : overall === 'WATCH' ? `Fly with care: ${findings.length === 1 ? lc(findings[0].title) : `${findings.length} things to watch`}` : 'Fit to fly',
      frame: this.frame, findings,
      motors: Array.from({ length: n }, (_, i) => ({
        n: i + 1,
        meanOutputPct: bal ? round1(bal.input.outputPct[i]) : null,
        deviationPct: balance ? round1(balance.deviationPct[i]) : null,
        maxTempC: acc.maxTemp[i],
        rpmRatio: balance?.rpmRatio[i] != null ? Math.round(balance.rpmRatio[i]! * 1000) / 1000 : null,
        currentRatio: balance?.currentRatio[i] != null ? Math.round(balance.currentRatio[i]! * 1000) / 1000 : null,
      })),
      vibeMax: acc.vibeMax, clipDelta: acc.clipStart != null ? acc.clipNow - acc.clipStart : 0,
      minCellV: acc.minCell, maxCellSpreadV: acc.maxSpread, maxBatteryTempC: acc.maxBattTemp,
      events: this.events.filter(e => e.t >= acc.startedAt && e.level !== 'OK').slice(0, 20),
    };
  }
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function fwName(autopilot: number, v: { major: number; minor: number; patch: number; type: number }) {
  const name = autopilot === 12 ? 'PX4' : 'ArduPilot';
  const tag = v.type === 255 ? '' : v.type === 0 ? ' dev' : v.type < 128 ? ' alpha' : v.type < 192 ? ' beta' : ' rc';
  return `${name} ${v.major}.${v.minor}.${v.patch}${tag}`;
}

// ---------------------------------------------------------------------------
// Across flights: is it getting worse? Parts life.
// ---------------------------------------------------------------------------

/** Per motor, deviation over the last flights (oldest first) and whether it is climbing. */
export function motorTrend(reports: FlightHealth[], lastN = 8) {
  const rs = [...reports].sort((a, b) => a.startedAt - b.startedAt).slice(-lastN);
  const n = Math.max(0, ...rs.map(r => r.motors.length));
  return Array.from({ length: n }, (_, i) => {
    const series = rs.map(r => r.motors[i]?.deviationPct ?? null);
    const vals = series.filter((v): v is number => v != null);
    const last3 = vals.slice(-3);
    const rising = last3.length === 3 && last3[0] < last3[1] && last3[1] < last3[2] && last3[2] >= LIMITS.motorWatchPct / 2 && last3[2] - last3[0] >= 3;
    return { n: i + 1, series, rising, latest: vals.length ? vals[vals.length - 1] : null };
  });
}

/** Starting service intervals. Set your manufacturer's where they differ. */
export const PARTS: { id: string; label: string; hours: number | null; note: string }[] = [
  { id: 'props', label: 'Propellers', hours: 50, note: 'and after any strike, chip or crack' },
  { id: 'motors', label: 'Motor bearings', hours: 200, note: 'spin each by hand: any roughness, replace' },
  { id: 'frame', label: 'Arms and frame', hours: 25, note: 'check for cracks, twisted arms, loose screws' },
  { id: 'fc-mount', label: 'Flight controller mount', hours: 100, note: 'foam or dampers harden and stop isolating' },
  { id: 'firmware', label: 'Firmware', hours: null, note: 'update between jobs, never on site' },
];

export interface PartReplacement { part: string; t: number }

/** Hours flown since each part was last replaced (or since records began). */
export function partsLife(reports: FlightHealth[], replaced: PartReplacement[], now = Date.now()) {
  return PARTS.map(p => {
    // A whole set replaced resets its clock; one prop or motor swapped does not age the rest less.
    const last = replaced.filter(r => r.part === p.id).reduce((m, r) => Math.max(m, r.t), 0);
    const hours = reports.filter(r => r.startedAt > last && r.endedAt <= now).reduce((s, r) => s + r.airborneS, 0) / 3600;
    const due = p.hours != null && hours >= p.hours, soon = p.hours != null && !due && hours >= p.hours * 0.8;
    return { id: p.id, label: p.label, note: p.note, interval: p.hours, hours, since: last || null, level: (due ? 'FAULT' : soon ? 'WATCH' : 'OK') as Level };
  });
}
