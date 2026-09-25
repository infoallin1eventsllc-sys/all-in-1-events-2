import type { HealthMsg } from './decode';
import type { VehicleState } from './health';

/**
 * A simulated quadcopter for the health screen, with faults you can switch on.
 *
 * It emits the same health messages a real ArduCopter sends (as decoded values),
 * so the simulation exercises exactly the analysis a real aircraft goes through.
 * Each fault is modelled the way it shows up in real telemetry — see health.ts.
 */

export type SimFault = 'NONE' | 'PROP' | 'MOTOR' | 'ARM' | 'VIBRATION' | 'CELL' | 'COMPASS' | 'FIRMWARE';

export const SIM_FAULTS: { id: SimFault; label: string; detail: string }[] = [
  { id: 'NONE', label: 'Healthy aircraft', detail: 'Nothing wrong' },
  { id: 'PROP', label: 'Chipped propeller', detail: 'Motor 3 prop has lost a tip' },
  { id: 'MOTOR', label: 'Worn motor bearing', detail: 'Motor 2 drags and runs hot' },
  { id: 'ARM', label: 'Twisted arm', detail: 'Clockwise motors tilted a few degrees' },
  { id: 'VIBRATION', label: 'Loose motor / unbalanced prop', detail: 'Vibration and accelerometer clipping' },
  { id: 'CELL', label: 'Weak battery cell', detail: 'Cell 3 sags under load' },
  { id: 'COMPASS', label: 'Compass interference', detail: 'Power wire too close to the GPS mast' },
  { id: 'FIRMWARE', label: 'Old firmware', detail: 'ArduCopter 4.3.7' },
];

// Seeded so tests are repeatable.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SENSORS_ALL = 0x1 | 0x2 | 0x4 | 0x8 | 0x20 | 0x8000 | 0x10000 | 0x200000 | 0x1000000 | 0x2000000 | 0x10000000;
/** Flight profile, seconds: climb, work, descend. */
export const SIM_FLIGHT_S = 120;
const SPIN = ['CCW', 'CCW', 'CW', 'CW'] as const; // quad X, ArduPilot numbering

export class HealthSim {
  fault: SimFault = 'NONE';
  armed = false;
  t = 0;            // seconds since arming
  private clock = 0; // seconds since start
  private acc = 0;
  private clip = 0;
  private cellWear = 0;
  private rand: () => number;
  private sentVersion = false;
  alt = 0; speed = 0; roll = 0; pitch = 0;
  /**
   * When set, the aircraft flies whatever it is told (armed, height, speed and climb
   * from a flight simulation driven by the control screen) instead of its own
   * two-minute test flight. Packs then last about ten minutes of flying.
   */
  ext: { armed: boolean; alt: number; speed: number; vz: number } | null = null;
  /** Charge left, % (the BATTERY_STATUS it reports). */
  get remainingPct() { return Math.max(0, Math.round(96 - this.cellWear * 70)); }

  /** `wear` 0–1 starts the pack part-used (fleet simulations fly packs of different ages and charge). */
  constructor(seed = 7, wear = 0) { this.rand = rng(seed); this.cellWear = wear; }

  takeoff() { if (!this.armed) { this.armed = true; this.t = 0; } }
  land() { if (this.armed && this.t < SIM_FLIGHT_S - 14) this.t = SIM_FLIGHT_S - 14; }
  /** Fresh battery and a new version report (e.g. after changing the fault). */
  swapBattery() { this.cellWear = 0; this.sentVersion = false; }

  private noise(a: number) { return (this.rand() * 2 - 1) * a; }

  /**
   * Advance `dt` seconds; returns the vehicle state and the messages sent in
   * that time (outputs 4 Hz, vibration and ESC 2 Hz, the rest 1 Hz).
   */
  step(dt: number): { state: VehicleState; msgs: HealthMsg[] } {
    const msgs: HealthMsg[] = [];
    this.clock += dt; this.acc += dt;
    if (this.ext) {
      const e = this.ext;
      if (e.armed && !this.armed) this.t = 0;
      this.armed = e.armed; this.alt = e.alt; this.speed = e.speed;
      if (this.armed) { this.t += dt; this.cellWear += dt / (SIM_FLIGHT_S * 5); }
      this.pitch = -Math.min(12, this.speed * 1.4) + this.noise(0.8);
      this.roll = this.noise(this.speed > 3 ? 3 : 1.2);
    } else if (this.armed) {
      this.t += dt;
      const T = this.t;
      if (T < 10) { this.alt = Math.min(30, T * 3); this.speed = 0.5; }
      else if (T < SIM_FLIGHT_S - 14) {
        this.alt = 30;
        // Work: slow survey passes, hovers for photos, a few faster transits.
        const leg = Math.floor((T - 10) / 12) % 4;
        this.speed = leg === 3 ? 9 : leg === 1 ? 0.3 : 4;
      } else if (T < SIM_FLIGHT_S) { this.alt = Math.max(0, 30 - (T - (SIM_FLIGHT_S - 14)) * 2.4); this.speed = 0.4; }
      else { this.alt = 0; this.speed = 0; this.armed = false; }
      this.pitch = this.speed > 6 ? -11 + this.noise(1.5) : -this.speed * 0.9 + this.noise(0.8);
      this.roll = this.noise(this.speed > 6 ? 4 : 1.5);
      this.cellWear += dt / SIM_FLIGHT_S;
    } else { this.alt = 0; this.speed = 0; this.pitch = 0; this.roll = 0; }

    const flying = this.armed && this.alt > 0.5;
    const state: VehicleState = {
      armed: this.armed, altRelM: this.alt, throttlePct: this.armed ? 48 : 0, groundspeedMps: this.speed, rollDeg: this.roll, pitchDeg: this.pitch,
      vehicleType: 2, autopilot: 3, fixType: 3, satellites: 17, hdop: 0.7, radioRssi: 0,
    };

    // Emit at 4 Hz steps.
    while (this.acc >= 0.25) {
      this.acc -= 0.25;
      const tick = Math.round(this.clock * 4);
      const f = this.fault;

      // Motor command: hover ~48%, more to climb, less to descend; transit tilts load onto the rear motors.
      const T = this.t;
      const climb = this.ext ? (this.ext.vz > 0.5 ? 'UP' : this.ext.vz < -0.5 ? 'DOWN' : 'LEVEL') : T < 10 ? 'UP' : T >= SIM_FLIGHT_S - 14 ? 'DOWN' : 'LEVEL';
      const base = this.armed ? (flying ? (climb === 'UP' ? 60 : climb === 'DOWN' ? 40 : 48) : 22) : 0;
      const fwd = this.speed > 6 ? 3.5 : this.speed * 0.3;
      const mult = [1, 1, 1, 1];
      if (f === 'PROP') { mult[2] = 1.25; mult[0] = mult[1] = mult[3] = 0.98; }
      if (f === 'MOTOR') { mult[1] = 1.12; mult[0] = mult[2] = mult[3] = 0.99; }
      if (f === 'ARM') SPIN.forEach((s, i) => { mult[i] = s === 'CW' ? 1.045 : 0.955; });
      const outPct = [0, 1, 2, 3].map(i => {
        if (!this.armed) return 0;
        const tilt = i === 0 || i === 2 ? -fwd : fwd; // motors 1 and 3 are the front pair
        return Math.max(0, Math.min(100, (base + tilt) * mult[i] + this.noise(1.2)));
      });
      const us = [...outPct.map(p => (this.armed ? Math.round(1000 + p * 10) : 1000)), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      // Each motor's current goes with the square of its command; the battery supplies all of them plus the avionics.
      const escA = outPct.map((p, i) => (this.armed ? Math.round((0.3 + (p / 100) ** 2 * 24) * (f === 'MOTOR' && i === 1 ? 1.3 : 1) * 100) / 100 : 0));
      const packA = this.armed ? escA.reduce((s, a) => s + a, 0) + 0.8 : 0.4;
      msgs.push({ k: 'OUTPUTS', us });

      if (tick % 2 === 0) {
        // Vibration (m/s²) and clipping.
        let v = flying ? 11 + this.noise(3) : this.armed ? 6 : 0.4;
        let vz = flying ? 16 + this.noise(4) : this.armed ? 8 : 0.5;
        if (flying && f === 'PROP') { vz += 12 + this.noise(4); v += 4; }
        if (flying && f === 'VIBRATION') { vz = 48 + this.noise(14); v = 34 + this.noise(9); if (vz > 58) this.clip += 1 + Math.floor(this.rand() * 4); }
        msgs.push({ k: 'VIBE', x: Math.abs(v), y: Math.abs(v * 0.9 + this.noise(2)), z: Math.abs(vz), clip: [this.clip, 0, 0] });

        // ESC telemetry: rpm, current, temperature.
        const rpmMult = [1, 1, 1, 1], hot = [0, 0, 0, 0];
        if (f === 'PROP') rpmMult[2] = 1.09;            // spins faster: less thrust per turn
        if (f === 'MOTOR') { rpmMult[1] = 0.985; hot[1] = 21; }
        msgs.push({
          k: 'ESC', first: 0,
          // Speed follows the thrust actually needed, not the extra command: a weak prop
          // needs more turns for the same thrust, a dragging motor needs more current for the same turns.
          rpm: outPct.map((p, i) => (this.armed ? Math.round((1800 + (f === 'ARM' ? p : p / mult[i]) * 98) * rpmMult[i] + this.noise(40)) : 0)),
          currentA: escA,
          voltageV: outPct.map(() => 15.6),
          tempC: outPct.map((p, i) => Math.round(31 + (flying ? Math.min(1, this.t / 60) * (p * 0.28) : 0) + hot[i] * (flying ? Math.min(1, this.t / 40) : 0))),
        });
      }

      if (tick % 4 === 0) {
        // Battery: 4S, sags under load, one weak cell if asked.
        const load = flying ? 1 : this.armed ? 0.4 : 0;
        const rest = 4.17 - this.cellWear * 0.42;
        const cells = [0, 1, 2, 3].map(i => {
          let c = rest - load * 0.13 + this.noise(0.006);
          if (f === 'CELL' && i === 2) c -= 0.05 + load * 0.2;
          return Math.round(c * 1000) / 1000;
        });
        const current = Math.round((packA + this.noise(0.6)) * 10) / 10;
        msgs.push({ k: 'BATTERY', cellsV: cells, packV: cells.reduce((s, v) => s + v, 0), tempC: 27 + this.cellWear * 13, currentA: current, remainingPct: Math.max(0, Math.round(96 - this.cellWear * 70)), faults: 0 });
        msgs.push({ k: 'SENSORS', present: SENSORS_ALL, enabled: SENSORS_ALL, health: SENSORS_ALL, dropRatePct: 0.4, packV: cells.reduce((s, v) => s + v, 0), currentA: current });
        // A power lead near the compass: the disturbance follows the current in it.
        const comp = f === 'COMPASS' && this.armed ? 0.06 + 0.5 * (current / 23) + Math.abs(this.noise(0.06)) : 0.06 + Math.abs(this.noise(0.05));
        msgs.push({ k: 'NAV', source: 'EKF', velocity: 0.08 + Math.abs(this.noise(0.05)), posHoriz: 0.07 + Math.abs(this.noise(0.05)), posVert: 0.05 + Math.abs(this.noise(0.03)), compass: comp, flags: 0x1ff });
        msgs.push({ k: 'POWER', vccV: 5.12 + this.noise(0.02), servoV: 0, flags: 1 });
        if (!this.sentVersion) {
          this.sentVersion = true;
          msgs.push(f === 'FIRMWARE'
            ? { k: 'VERSION', major: 4, minor: 3, patch: 7, type: 255, board: 0x8c0000, git: '4b1f1c2e' }
            : { k: 'VERSION', major: 4, minor: 5, patch: 7, type: 255, board: 0x8c0000, git: '2a3dc4b7' });
        }
      }
    }
    return { state, msgs };
  }
}
