import { HealthSim, type SimFault } from './sim';
import type { FleetHealth } from './fleet';
import { PAD_SPACING_M, padXY } from '../lightshow/pads';
import { SimVehicle } from '../control/simVehicle';
import { MAV_CMD } from '../link/mavlink';

/**
 * A simulated light-show fleet for the fleet health view: every aircraft its own
 * HealthSim, with the spread a real show fleet has on the night. Most aircraft
 * are healthy; a few carry a fault (a chipped prop, a dragging motor, a weak
 * cell, compass interference, vibration, a twisted arm, old firmware); packs
 * come from the charging tables at different ages; props and motors have
 * different hours on them; and one or two aircraft drop off the link.
 * Seeded, so the same fleet comes back every time.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Share of the fleet carrying each fault (at least one aircraft each). */
const FAULT_MIX: [SimFault, number][] = [['CELL', 0.025], ['PROP', 0.012], ['FIRMWARE', 0.012], ['MOTOR', 0.008], ['COMPASS', 0.008], ['VIBRATION', 0.006], ['ARM', 0.004]];

export class FleetSim {
  readonly ids: string[];
  readonly faults: SimFault[];
  readonly silent: Set<number>;
  readonly hours: { props: number; motors: number }[];
  private sims: HealthSim[];
  private clock = 0;
  /** The aircraft as they fly: positions, modes, arming, answering commands (the control screen drives these). */
  readonly vehicles: SimVehicle[];
  /** What the aircraft said lately (STATUSTEXT), newest first. */
  texts: { id: string; text: string; t: number }[] = [];
  /** Launch pad spacing, metres (the show's one launch grid). */
  static readonly PAD_M = PAD_SPACING_M;

  constructor(readonly n: number, seed = 21) {
    const r = rng(seed * 7919 + n);
    this.ids = Array.from({ length: n }, (_, i) => `LS-${String(i + 1).padStart(3, '0')}`);
    this.faults = Array(n).fill('NONE');
    const free = () => { for (;;) { const i = Math.floor(r() * n); if (this.faults[i] === 'NONE') return i; } };
    for (const [f, share] of FAULT_MIX) for (let k = Math.max(1, Math.round(n * share)); k > 0; k--) this.faults[free()] = f;
    // Packs: most fresh off the charger, a few half-used ones that went back in the case by mistake.
    const wear = Array.from({ length: n }, () => (r() < 0.035 ? 0.82 + r() * 0.08 : r() * 0.1));
    this.silent = new Set<number>();
    for (let k = Math.max(1, Math.round(n * 0.004)); k > 0; k--) { let i = Math.floor(r() * n); while (this.faults[i] !== 'NONE') i = (i + 1) % n; this.silent.add(i); }
    this.hours = Array.from({ length: n }, () => ({ props: Math.round(4 + r() * 50 + (r() < 0.06 ? 8 : 0)), motors: Math.round(20 + r() * 170 + (r() < 0.04 ? 30 : 0)) }));
    this.sims = this.ids.map((_, i) => { const s = new HealthSim(seed * 1000 + i, wear[i]); s.fault = this.faults[i]; return s; });
    // Pads on the show's launch grid, centred on the origin, rows running north to south.
    this.vehicles = this.ids.map((id, i) => {
      const v = new SimVehicle(id, padXY(i, n));
      const hs = this.sims[i];
      hs.ext = { armed: false, alt: 0, speed: 0, vz: 0 };
      v.prearm = () => (hs.remainingPct < 30 ? `PreArm: Battery ${hs.remainingPct}% below arming minimum 30%` : null);
      v.onText = text => this.say(id, text);
      return v;
    });
  }

  private say(id: string, text: string) { this.texts.unshift({ id, text, t: this.clock }); if (this.texts.length > 200) this.texts.length = 200; }
  battery(i: number) { return this.sims[i].remainingPct; }

  get flying() { return this.vehicles.some(v => v.armed || v.airborne); }
  /** Seconds since the fleet took off (the first aircraft's flight clock). */
  get t() { return this.sims.find(s => s.armed)?.t ?? 0; }
  /** Quick flight for the health view: every aircraft that can arms and climbs to 30 m. */
  takeoff() {
    this.vehicles.forEach((v, i) => {
      if (this.silent.has(i)) return;
      if (v.handle({ cmd: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] }).result !== 0) return;
      v.handle({ cmd: MAV_CMD.DO_SET_MODE, params: [], mode: 'GUIDED' });
      v.handle({ cmd: MAV_CMD.TAKEOFF, params: [], to: { x: NaN, y: NaN, altM: 30 } });
    });
  }
  land() { this.vehicles.forEach(v => v.handle({ cmd: MAV_CMD.LAND, params: [] })); }

  /** Advance every aircraft `dt` seconds and hand its messages to the fleet monitor. */
  step(dt: number, fleet: FleetHealth, now: number) {
    this.clock += dt;
    for (let i = 0; i < this.sims.length; i++) {
      const id = this.ids[i];
      const v = this.vehicles[i], hs = this.sims[i];
      v.step(dt);
      // Battery failsafe, as ArduPilot's: under 20% in the air, come home.
      if (v.airborne && v.armed && hs.remainingPct < 20 && v.state !== 'RTL' && v.state !== 'LAND') { v.handle({ cmd: MAV_CMD.RETURN_TO_LAUNCH, params: [] }); this.say(id, 'Battery failsafe: returning home'); }
      hs.ext = { armed: v.armed, alt: v.z, speed: v.speed, vz: v.vz };
      if (this.silent.has(i) && this.clock > 3) continue;          // dropped off the link
      const { state, msgs } = hs.step(dt);
      fleet.setState(id, state, now, dt);
      for (const m of msgs) fleet.apply(id, m, now);
    }
  }

  /** Register every aircraft (in pad order) and its service hours with a fleet monitor. */
  seed(fleet: FleetHealth) { this.ids.forEach((id, i) => { fleet.monitor(id); fleet.setHours(id, this.hours[i].props, this.hours[i].motors); }); }
}
