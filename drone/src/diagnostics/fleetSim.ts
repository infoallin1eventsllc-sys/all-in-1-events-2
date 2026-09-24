import { HealthSim, type SimFault } from './sim';
import type { FleetHealth } from './fleet';

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
  }

  get flying() { return this.sims.some(s => s.armed); }
  /** Seconds since the fleet took off (the first aircraft's flight clock). */
  get t() { return this.sims.find(s => s.armed)?.t ?? 0; }
  takeoff() { this.sims.forEach((s, i) => { if (!this.silent.has(i)) s.takeoff(); }); }
  land() { this.sims.forEach(s => s.land()); }

  /** Advance every aircraft `dt` seconds and hand its messages to the fleet monitor. */
  step(dt: number, fleet: FleetHealth, now: number) {
    this.clock += dt;
    for (let i = 0; i < this.sims.length; i++) {
      const id = this.ids[i];
      if (this.silent.has(i) && this.clock > 3) continue;          // dropped off the link
      const { state, msgs } = this.sims[i].step(dt);
      fleet.setState(id, state, now, dt);
      for (const m of msgs) fleet.apply(id, m, now);
    }
  }

  /** Register every aircraft (in pad order) and its service hours with a fleet monitor. */
  seed(fleet: FleetHealth) { this.ids.forEach((id, i) => { fleet.monitor(id); fleet.setHours(id, this.hours[i].props, this.hours[i].motors); }); }
}
