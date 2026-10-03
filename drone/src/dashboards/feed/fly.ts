import * as THREE from 'three';

/**
 * A continuous FPV take: one unbroken flight along a route, the way an FPV
 * pilot films a city. The camera looks down the path a little ahead of the
 * aircraft, banks into turns in proportion to how hard it is turning, carries
 * a touch of airframe vibration, and never pitches so far up or down that the
 * horizon leaves the frame. Speed follows the route's own weights (slow for a
 * reveal, fast down a canyon) with a smooth start from a hover and, if asked,
 * a smooth stop.
 *
 * `clearance` answers how tall a building on a given footprint may stand
 * without the route passing through it, so the worlds can lower (or leave out)
 * the few buildings a corner would clip.
 */

export type P3 = [number, number, number];

export interface FlySpec {
  /** Waypoints in world metres: x east, y up, z south. */
  points: P3[];
  /** Relative speed at each waypoint (default 1): lower for a reveal, higher down a canyon. */
  speed?: number[];
  /** Seconds for the whole take. */
  dur: number;
  /** Seconds of acceleration from a hover at the start, and of slowing at the end (0: still at speed on the cut). */
  easeIn?: number;
  easeOut?: number;
  /** Lens, degrees of vertical field of view (FPV cameras are wide). */
  fov?: number;
  /** How far down the path the camera looks, metres. */
  lookAhead?: number;
  /** Stretches where the camera turns to hold a subject: from/to as waypoint indices (fractions allowed), the subject, how strongly (0..1). */
  holds?: { from: number; to: number; at: P3; weight?: number }[];
  /** How much of the coordinated-turn bank to fly (0..1), and the most it will bank (radians). */
  bank?: number;
  maxBank?: number;
}

export interface FlyPose { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; roll: number; fov: number }

/** A helix of waypoints round a point: for the climbing orbit that ends a take. */
export function spiral(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, a0: number, turns: number, n = 10): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + turns * Math.PI * 2 * u, r = r0 + (r1 - r0) * u;
    out.push([cx + Math.cos(a) * r, y0 + (y1 - y0) * u, cz + Math.sin(a) * r]);
  }
  return out;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class FlyRoute {
  readonly spec: FlySpec;
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  private sAt: Float64Array;          // distance along the route at each time step
  private steps = 2400;
  private wS: number[] = [];          // route distance of each waypoint
  private samples: THREE.Vector3[] = [];
  private cells = new Map<string, THREE.Vector3[]>();

  constructor(spec: FlySpec) {
    this.spec = spec;
    this.curve = new THREE.CatmullRomCurve3(spec.points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const per = 60, lens = this.curve.getLengths((spec.points.length - 1) * per);
    this.length = lens[lens.length - 1];
    for (let i = 0; i < spec.points.length; i++) this.wS.push(lens[i * per]);

    // The speed profile: route weights, eased in from a hover and (optionally) out. Solve for the
    // cruise speed that covers the route in exactly `dur` seconds, then tabulate distance by time.
    const run = (v: number) => {
      const out = new Float64Array(this.steps + 1), dt = spec.dur / this.steps;
      let s = 0;
      for (let k = 0; k <= this.steps; k++) {
        out[k] = Math.min(s, this.length);
        const t = k * dt;
        const ramp = Math.min(spec.easeIn ? smooth(0, spec.easeIn, t) * 0.92 + 0.08 : 1, spec.easeOut ? smooth(0, spec.easeOut, spec.dur - t) * 0.9 + 0.1 : 1);
        s += v * this.weight(s) * ramp * dt;
      }
      return out;
    };
    let lo = 0, hi = (this.length / spec.dur) * 8;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const r = run(mid); if (r[this.steps] < this.length) lo = mid; else hi = mid; }
    this.sAt = run(hi);

    // Samples every 3 m for clearance queries, hashed into 50 m cells.
    for (let s = 0; s <= this.length; s += 3) {
      const p = this.curve.getPointAt(Math.min(1, s / this.length));
      this.samples.push(p);
      const key = `${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`;
      (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push(p);
    }
  }

  /** The route's relative speed at distance s, interpolated between waypoints. */
  private weight(s: number) {
    const w = this.spec.speed;
    if (!w) return 1;
    for (let i = 0; i + 1 < this.wS.length; i++) {
      if (s <= this.wS[i + 1]) { const u = (s - this.wS[i]) / Math.max(1e-6, this.wS[i + 1] - this.wS[i]); return (w[i] ?? 1) + ((w[i + 1] ?? 1) - (w[i] ?? 1)) * smooth(0, 1, u); }
    }
    return w[w.length - 1] ?? 1;
  }

  /** Distance along the route at time t. */
  dist(t: number) {
    const k = Math.min(this.steps, Math.max(0, (t / this.spec.dur) * this.steps));
    const i = Math.floor(k), f = k - i;
    return i >= this.steps ? this.sAt[this.steps] : this.sAt[i] + (this.sAt[i + 1] - this.sAt[i]) * f;
  }

  /** Route distance of a (fractional) waypoint index. */
  sOf(idx: number) { const i = Math.max(0, Math.min(this.wS.length - 1, Math.floor(idx))), f = idx - i; return i + 1 < this.wS.length ? this.wS[i] + (this.wS[i + 1] - this.wS[i]) * f : this.wS[i]; }

  private at(s: number) { return this.curve.getPointAt(Math.min(1, Math.max(0, s / this.length))); }
  private heading(s: number) { const a = this.at(s - 6), b = this.at(s + 6); return Math.atan2(b.x - a.x, -(b.z - a.z)); }

  /** Where the camera is, where it looks and how it is rolled at time t of the take. */
  pose(t: number, out?: FlyPose): FlyPose {
    const o = out ?? { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(), roll: 0, fov: 0 };
    const sp = this.spec, s = this.dist(t);
    o.pos.copy(this.at(s));
    // Look down the path; limit the pitch so a climb or dive keeps the horizon in frame.
    const ahead = this.at(Math.min(this.length, s + (sp.lookAhead ?? 45)));
    const dir = ahead.sub(o.pos);
    if (dir.lengthSq() < 1e-4) dir.copy(this.at(s).sub(this.at(s - 5)));
    dir.normalize();
    const flat = Math.hypot(dir.x, dir.z) || 1e-6;
    const pitch = THREE.MathUtils.clamp(Math.atan2(dir.y, flat), -0.62, 0.3);
    dir.set((dir.x / flat) * Math.cos(pitch), Math.sin(pitch), (dir.z / flat) * Math.cos(pitch));
    // Holds: turn toward a subject for a stretch of the route.
    for (const h of sp.holds ?? []) {
      const a = this.sOf(h.from), b = this.sOf(h.to), ramp = Math.min(120, (b - a) / 3);
      const w = Math.min(smooth(a, a + ramp, s), 1 - smooth(b - ramp, b, s)) * (h.weight ?? 1);
      if (w > 0) { const toward = new THREE.Vector3(...h.at).sub(o.pos).normalize(); dir.lerp(toward, w).normalize(); }
    }
    o.look.copy(o.pos).addScaledVector(dir, 100);
    // Bank into the turn: turn rate from the change of heading, at the speed we are flying.
    const dt = 0.25, s2 = this.dist(Math.min(sp.dur, t + dt)), s1 = this.dist(Math.max(0, t - dt));
    let dh = this.heading(s2) - this.heading(s1); dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const rate = dh / (2 * dt), speed = (s2 - s1) / (2 * dt);
    // A quad turns by banking: the coordinated-turn angle atan(v·ω/g), scaled (a pilot rarely flies it full).
    const vib = 0.006 * Math.sin(t * 23.1) + 0.004 * Math.sin(t * 37.7 + 1.3) + 0.003 * Math.sin(t * 5.3);
    o.roll = THREE.MathUtils.clamp(Math.atan((speed * rate) / 9.81) * (sp.bank ?? 0.7), -(sp.maxBank ?? 0.6), sp.maxBank ?? 0.6) + vib;
    // Up: world up, rolled about the line of sight (a right turn, positive rate, rolls right).
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up0 = new THREE.Vector3().crossVectors(right, dir).normalize();
    o.up.copy(up0).multiplyScalar(Math.cos(o.roll)).addScaledVector(right, Math.sin(o.roll)).normalize();
    o.fov = sp.fov ?? 74;
    return o;
  }

  /**
   * The tallest a building on this footprint may stand without the route passing
   * through it (Infinity when the route never comes near). Keeps `margin` metres clear.
   */
  clearance(x0: number, z0: number, x1: number, z1: number, margin = 9): number {
    let best = Infinity;
    const cx0 = Math.floor((x0 - margin) / 50), cx1 = Math.floor((x1 + margin) / 50), cz0 = Math.floor((z0 - margin) / 50), cz1 = Math.floor((z1 + margin) / 50);
    for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) {
      for (const p of this.cells.get(`${i},${j}`) ?? []) {
        if (p.x > x0 - margin && p.x < x1 + margin && p.z > z0 - margin && p.z < z1 + margin) best = Math.min(best, p.y - margin);
      }
    }
    return best;
  }
}
