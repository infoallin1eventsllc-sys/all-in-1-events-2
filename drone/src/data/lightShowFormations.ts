import { ShowFormation, Vector3D, ColorRGBW } from '../types/lightShowTypes';
import { BRAND } from '../brand';

/**
 * The show: eight formations, each alive. `generatePoints(count, t)` returns
 * where every aircraft should be and what colour it should show at show-time
 * `t` (seconds into the cue), so a formation breathes, turns, flaps, blooms,
 * beats or bursts rather than hanging still. Aircraft keep their index from
 * frame to frame, so the fleet flows between shapes instead of scattering.
 * No two aircraft are ever put closer than FORMATION_SPACING_M, at 100 or 500.
 *
 * Space: metres, y up, the audience towards -z. Everything stays inside the
 * 100 × 110 × 100 m geofence with a 60 m show centre.
 */

type Pt = { pos: Vector3D; color: ColorRGBW };
const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };

function rgb(r: number, g: number, b: number, w = 0): ColorRGBW {
  return { r: Math.round(clamp01(r) * 255), g: Math.round(clamp01(g) * 255), b: Math.round(clamp01(b) * 255), w: Math.round(clamp01(w) * 255) };
}
/** Hue in turns (0..1), saturation, value → RGBW; a little white on pale colours. */
function hsv(h: number, s: number, v: number, w = 0): ColorRGBW {
  const i = Math.floor(((h % 1) + 1) % 1 * 6), f = ((h % 1) + 1) % 1 * 6 - i;
  const p = v * (1 - s), q = v * (1 - s * f), u = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i % 6];
  return rgb(r, g, b, w);
}
const mixc = (a: ColorRGBW, b: ColorRGBW, k: number): ColorRGBW => ({ r: Math.round(a.r + (b.r - a.r) * k), g: Math.round(a.g + (b.g - a.g) * k), b: Math.round(a.b + (b.b - a.b) * k), w: Math.round(a.w + (b.w - a.w) * k) });
const scale = (c: ColorRGBW, k: number): ColorRGBW => ({ r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k), w: Math.round(c.w * k) });
/** A gentle sparkle unique to each aircraft. */
const twinkle = (i: number, t: number, depth = 0.25) => 1 - depth + depth * Math.sin(t * 2.6 + i * 1.73);
/** Fibonacci sphere direction for i of n. */
function fib(i: number, n: number): Vector3D {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / n), theta = (TAU * i) / 1.6180339887;
  return { x: Math.sin(phi) * Math.cos(theta), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(theta) };
}
function rotY(p: Vector3D, a: number): Vector3D { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }; }
function rotX(p: Vector3D, a: number): Vector3D { const c = Math.cos(a), s = Math.sin(a); return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }; }
const at = (p: Vector3D, cx: number, cy: number, cz: number): Vector3D => ({ x: p.x + cx, y: p.y + cy, z: p.z + cz });

/** Closest any two aircraft sit in a formation, metres. Above the exporter's 1.5 m floor so straight-line transitions keep it too. */
export const FORMATION_SPACING_M = 2.2;
/**
 * Push apart any two aircraft closer than `min` (Gauss-Seidel sweeps over a spatial hash), so a shape
 * drawn from curves never puts two aircraft in one spot; aircraft already far enough apart do not move.
 */
export function spaced(pts: Pt[], min = FORMATION_SPACING_M, sweeps = 60): Pt[] {
  const n = pts.length; if (n < 2) return pts;
  const P = new Float64Array(n * 3);
  pts.forEach((p, i) => { P[i * 3] = p.pos.x; P[i * 3 + 1] = p.pos.y; P[i * 3 + 2] = p.pos.z; });
  const want = min * 1.03, cell = (v: number) => Math.floor(v / want);
  // Cells hashed into a fixed table (head / next chains): no allocation per sweep, cheap enough to run every frame.
  const size = 1 << Math.ceil(Math.log2(n * 2)), mask = size - 1, head = new Int32Array(size), next = new Int32Array(n);
  const hash = (x: number, y: number, z: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
  let touched = false;
  for (let s = 0; s < sweeps; s++) {
    head.fill(-1);
    for (let i = 0; i < n; i++) { const h = hash(cell(P[i * 3]), cell(P[i * 3 + 1]), cell(P[i * 3 + 2])); next[i] = head[h]; head[h] = i; }
    let moved = false;
    for (let i = 0; i < n; i++) {
      const cx = cell(P[i * 3]), cy = cell(P[i * 3 + 1]), cz = cell(P[i * 3 + 2]);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (let j = head[hash(cx + dx, cy + dy, cz + dz)]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          let ux = P[j * 3] - P[i * 3], uy = P[j * 3 + 1] - P[i * 3 + 1], uz = P[j * 3 + 2] - P[i * 3 + 2];
          const d = Math.sqrt(ux * ux + uy * uy + uz * uz);
          if (d >= min) continue;   // pushed to `want`, triggered under `min`: settles instead of chasing rounding
          if (d < 1e-6) { const a = i * 2.39996 + j * 0.618; ux = Math.cos(a); uy = 0.3 * Math.sin(a * 1.7); uz = Math.sin(a); }  // coincident: split along a fixed per-pair direction
          const len = Math.hypot(ux, uy, uz), push = (want - d) / 2 / len;
          P[i * 3] -= ux * push; P[i * 3 + 1] -= uy * push; P[i * 3 + 2] -= uz * push;
          P[j * 3] += ux * push; P[j * 3 + 1] += uy * push; P[j * 3 + 2] += uz * push;
          moved = touched = true;
        }
      }
    }
    if (!moved) break;
  }
  return touched ? pts.map((p, i) => ({ pos: { x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2] }, color: p.color })) : pts;
}

/**
 * `spaced` for a formation in motion: each step starts from the last step's corrections
 * (fading with a one-second time constant), so the fix-up is small, cheap enough for
 * every animation frame, and continuous in time. The sim and the exporter step one of
 * these through a cue; the first step is exactly `spaced`.
 */
export class Spacer {
  private off: Float64Array | null = null;
  next(raw: Pt[], dtS = 0): Pt[] {
    const n = raw.length, o = this.off && this.off.length === n * 3 ? this.off : null, k = Math.exp(-dtS);
    const out = spaced(o ? raw.map((p, i) => ({ pos: { x: p.pos.x + o[i * 3] * k, y: p.pos.y + o[i * 3 + 1] * k, z: p.pos.z + o[i * 3 + 2] * k }, color: p.color })) : raw);
    const off = (this.off = o ?? new Float64Array(n * 3));
    out.forEach((p, i) => { off[i * 3] = p.pos.x - raw[i].pos.x; off[i * 3 + 1] = p.pos.y - raw[i].pos.y; off[i * 3 + 2] = p.pos.z - raw[i].pos.z; });
    return out;
  }
  reset() { this.off = null; }
}


// ---- Dot font, so words and numbers can be flown (and exported without a browser) ----
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'], X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'], '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'], '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'], ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
const glyphCache = new Map<string, Vector3D[]>();
/**
 * Points in metres (x along the reading direction, y up, z away from the audience,
 * centred) spelling `text` in `cellM` cells, `count` of them. Each lit cell holds
 * sub × sub lights at least 2.1 m apart, alternately 0.5 m in front and behind so
 * neighbours clear 2.2 m; a fleet bigger than one layer of those extrudes the letters
 * away from the crowd in 2.4 m layers, so they read the same, only brighter.
 */
function textPoints(text: string, count: number, cellM: number): Vector3D[] {
  const key = `${text}|${count}|${cellM}`;
  const hit = glyphCache.get(key); if (hit) return hit;
  const chars = text.toUpperCase().split('').filter(c => FONT[c]);
  const cells: { x: number; y: number }[] = [];
  const width = chars.length * 6 - 1;
  chars.forEach((c, ci) => FONT[c].forEach((row, r) => row.split('').forEach((bit, col) => { if (bit === '1') cells.push({ x: ci * 6 + col - width / 2 + 0.5, y: 3 - r }); })));
  if (!cells.length) return [];
  const sub = Math.max(1, Math.floor(cellM / 2.1)), layer: Vector3D[] = [];
  for (const c of cells) for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
    const gx = Math.round((c.x - 0.5) * sub) + a, gy = Math.round((c.y - 0.5) * sub) + b;
    layer.push({ x: (c.x - 0.5 + (a + 0.5) / sub) * cellM, y: (c.y - 0.5 + (b + 0.5) / sub) * cellM, z: ((gx + gy) & 1 ? 0.5 : -0.5) });
  }
  const out: Vector3D[] = [];
  for (let L = 0; out.length < count; L++) {
    const want = Math.min(layer.length, count - out.length);   // full layers first, so the front face is always whole
    for (let k = 0; k < want; k++) { const p = layer[Math.floor((k * layer.length) / want)]; out.push({ x: p.x, y: p.y, z: p.z + L * 2.4 }); }
  }
  glyphCache.set(key, out);
  return out;
}
/** The words flown by the "name in lights" cue; the conductor can change them. */
export const showText = { value: BRAND.showText };

/** A plane curve reparametrised by arc length: `at(s)` (s 0..1 along it) → the curve's own parameter, and its length. */
function byLength(curve: (u: number) => { x: number; y: number }, N = 2048) {
  const acc = new Float64Array(N + 1); let prev = curve(0);
  for (let k = 1; k <= N; k++) { const p = curve(k / N); acc[k] = acc[k - 1] + Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
  const length = acc[N];
  const at = (s: number) => {
    const target = (((s % 1) + 1) % 1) * length; let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] <= target) lo = mid; else hi = mid; }
    return (lo + (target - acc[lo]) / Math.max(1e-9, acc[lo + 1] - acc[lo])) / N;
  };
  return { at, length };
}
// Classic heart curve, ~±16 wide, -17..+13 tall.
const heart2 = (u: number) => { const a = u * TAU; return { x: 16 * Math.pow(Math.sin(a), 3), y: 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a) }; };
const HEART = byLength(heart2);
// 8-point star outline, radius by angle.
const starR = (a: number) => { const k = Math.abs(Math.cos(a * 4)); return 12 + 22 * Math.pow(k, 3); };
const STAR = byLength(u => ({ x: Math.cos(u * TAU) * starR(u * TAU), y: Math.sin(u * TAU) * starR(u * TAU) }));
// A galaxy arm in its own plane: radius 9 → 39 m while it winds 2.4 rad.
const ARM = byLength(u => ({ x: Math.cos(u * 2.4) * (9 + u * 30), y: Math.sin(u * 2.4) * (9 + u * 30) }));

/*
 * Every shape is drawn so that a bigger fleet gets more room, not the same lines
 * packed tighter: lines become bands of lanes, outlines gain layers, words extrude,
 * points go where the curve is, by length, not by parameter. The spacing pass
 * below then only has small corrections left to make.
 */
const SHAPES: ShowFormation[] = [
  {
    id: 'SPHERICAL_CELESTIAL',
    name: 'Aurora Sphere',
    description: 'A breathing sphere with aurora bands sweeping over it, turning slowly, every light twinkling.',
    durationSeconds: 22,
    paletteName: 'Aurora teal to violet',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const R = 24 + 3.5 * Math.sin(t * 0.55);
      for (let i = 0; i < count; i++) {
        const d = rotY(fib(i, count), t * 0.22);
        const band = d.y * 1.2 + Math.sin(d.x * 2.2 + t * 1.1) * 0.35;
        const hue = 0.42 + 0.22 * (0.5 + 0.5 * Math.sin(band * 2.4 - t * 0.7));   // teal → violet, moving
        out.push({ pos: at({ x: d.x * R, y: d.y * R, z: d.z * R }, 0, 60, 0), color: scale(hsv(hue, 0.85, 1, 0.12), twinkle(i, t)) });
      }
      return out;
    },
  },
  {
    id: 'SPIRAL_GALAXY',
    name: 'Spiral Galaxy',
    description: 'A three-arm galaxy turning on its axis: a white-gold core, arms that fade from blue to magenta, and a scatter of stars above and below the disc.',
    durationSeconds: 24,
    paletteName: 'Core gold, arms blue to magenta',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const core = Math.min(Math.floor(count * 0.18), 24), stars = Math.floor(count * 0.08), arms = count - core - stars;
      const perArm = Math.max(1, Math.ceil(arms / 3)), lanes = Math.max(1, Math.ceil(perArm / 26)), perLane = Math.ceil(perArm / lanes);
      const spin = t * 0.28;
      for (let i = 0; i < count; i++) {
        if (i < core) {
          const d = fib(i, core), r = 6 + 2 * Math.sin(t * 1.3 + i);   // the core turns with the arms (rotY turns the other way to the arms' angle)
          out.push({ pos: at(rotX(rotY({ x: d.x * r, y: d.y * r * 0.45, z: d.z * r }, -spin), -0.62), 0, 60, 0), color: scale(rgb(1, 0.9, 0.6, 0.6), 0.85 + 0.15 * Math.sin(t * 2 + i)) });
        } else if (i < core + arms) {
          // An arm is one lane of lights, or a band of lanes 1.8 m apart (alternately above and below the disc) for a big fleet.
          const k = i - core, arm = k % 3, j = Math.floor(k / 3), lane = j % lanes, u = ARM.at(Math.floor(j / lanes) / perLane);
          const r = 9 + u * 30 + lane * 1.8, ang = (arm * TAU) / 3 + u * 2.4 + spin + Math.sin(u * 9 + t) * 0.03;
          const wave = Math.sin(u * 8 + t * 0.9 + arm) * 2.2 * (1 - u * 0.3) + (lanes > 1 ? (lane % 2 ? 1.2 : -1.2) : 0);
          out.push({ pos: at(rotX({ x: Math.cos(ang) * r, y: wave, z: Math.sin(ang) * r }, -0.62), 0, 60, 0), color: scale(hsv(0.6 + u * 0.28, 0.75, 1, 0.08), twinkle(i, t, 0.3)) });
        } else {
          // The stars turn with the disc: a scatter drifting at another rate would fly through the arms.
          const k = i - core - arms, d = fib(k, stars), r = 32 + (k % 4) * 3;
          out.push({ pos: at(rotX(rotY({ x: d.x * r, y: d.y * 16, z: d.z * r }, -spin), -0.62), 0, 60, 0), color: scale(rgb(0.85, 0.9, 1, 0.5), 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.1 + k * 2.3))) });
        }
      }
      return out;
    },
  },
  {
    id: 'FLYING_BIRD',
    name: 'Rising Phoenix',
    description: 'A phoenix with wings that beat, gold at the body burning to red at the feather tips, embers trailing behind the tail.',
    durationSeconds: 24,
    paletteName: 'Gold to ember red',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const flap = Math.sin(t * 0.95);                     // wing beat, paced to what the aircraft can fly
      const bob = Math.sin(t * 0.95 - 0.9) * 2.0;          // the body lifts on the downstroke
      const face = 0.62;                                   // three-quarter to the crowd
      const body = Math.floor(count * 0.16), tail = Math.floor(count * 0.16), wings = count - body - tail;
      // Bigger fleets: the body becomes a ring of lines, the wings a denser grid with a little thickness, the tail more lanes.
      const lines = Math.max(2, Math.ceil(body / 14)), ring = lines > 2 ? (lines * 2.4) / TAU : 0;
      const per = Math.max(1, Math.floor(wings / 2)), cols = Math.max(9, Math.round(Math.sqrt((per * 40) / 16))), dense = cols > 9;
      const rows = dense ? Math.max(1, Math.ceil(per / cols) - 1) : Math.max(1, Math.floor(per / 9) - 1);
      const tLanes = tail <= 45 ? 5 : Math.ceil(tail / 9), tPitch = tLanes === 5 ? 1.6 : 2.2;
      for (let i = 0; i < count; i++) {
        if (i < body) {
          const u = i / body, z = -14 + u * 34, y = 60 + bob + Math.sin(u * Math.PI) * 5;
          const rr = Math.max(ring, 1.2 + Math.sin(u * Math.PI) * 2.2), a = ((i % lines) / lines) * TAU + Math.PI;
          out.push({ pos: at(rotY({ x: Math.cos(a) * rr, y: y - 60 + Math.sin(a) * rr, z }, face), 0, 60, 0), color: scale(rgb(1, 0.85, 0.35, 0.5), twinkle(i, t, 0.15)) });
        } else if (i < body + wings) {
          const k = i - body, side = k % 2 ? 1 : -1, j = Math.floor(k / 2), col = j % cols, row = Math.floor(j / cols);
          const u = col / (cols - 1), v = row / rows; // u across the span, v along the chord
          const span = 4 + u * 40;
          const dihedral = flap * (0.1 + u * 0.28) * span + u * u * 5 * flap;
          const sweep = -6 + v * 16 - u * 10;
          const y = 60 + bob + dihedral - u * 3 + (dense ? ((col + row) % 2 ? 0.9 : -0.9) : 0);
          out.push({ pos: at(rotY({ x: side * span, y: y - 60, z: sweep }, face), 0, 60, 0), color: scale(mixc(rgb(1, 0.78, 0.25, 0.3), rgb(1, 0.12, 0.02), ease(u * 1.15 - 0.1)), twinkle(i, t, 0.2)) });
        } else {
          const k = i - body - wings, u = k / tail, spread = (k % tLanes - (tLanes - 1) / 2) * tPitch;
          const z = -16.5 - u * 22, y = 60 + bob - u * 9 + Math.sin(t * 3 + u * 6) * 1.5;
          const ember = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4 + k * 1.3));
          out.push({ pos: at(rotY({ x: spread * (1 + u * 1.5), y: y - 60, z }, face), 0, 60, 0), color: scale(mixc(rgb(1, 0.4, 0.05), rgb(0.6, 0.02, 0), u), ember) });
        }
      }
      return out;
    },
  },
  {
    id: 'DOUBLE_HELIX',
    name: 'Double Helix',
    description: 'Two strands turning about each other with rungs between them, a pulse of light climbing the ladder.',
    durationSeconds: 20,
    paletteName: 'Cyan and magenta, white pulse',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      // Rungs stop at 30 (their middles stack on the axis 2.5 m apart); the strands wind more turns, not tighter, as the fleet grows.
      const rungs = Math.min(Math.floor(count * 0.34), 90), strand = count - rungs, per = Math.floor(strand / 2);
      const H = 72, R = 13, spin = t * 0.5;
      const turns = Math.max(2.2, Math.sqrt(Math.max(0, (per * 2.5) ** 2 - H * H)) / (TAU * R));
      for (let i = 0; i < count; i++) {
        if (i < strand) {
          const s = i % 2, u = Math.floor(i / 2) / Math.max(1, per - 1);
          const a = u * TAU * turns + spin + s * Math.PI, y = 24 + u * H;
          const pulse = Math.exp(-Math.pow(((u - ((t * 0.18) % 1.3)) * 6), 2));
          out.push({ pos: { x: Math.cos(a) * R, y, z: Math.sin(a) * R }, color: mixc(s ? rgb(0.1, 0.9, 1) : rgb(1, 0.2, 0.75), rgb(1, 1, 1, 0.6), pulse) });
        } else {
          const k = i - strand, rung = Math.floor(k / 3), along = ((k % 3) + 1) / 4, u = rung / Math.max(1, Math.floor(rungs / 3) - 1);
          const a = u * TAU * turns + spin, y = 24 + u * H;
          const x0 = Math.cos(a) * R, z0 = Math.sin(a) * R, x1 = -x0, z1 = -z0;
          const pulse = Math.exp(-Math.pow(((u - ((t * 0.18) % 1.3)) * 6), 2));
          out.push({ pos: { x: x0 + (x1 - x0) * along, y, z: z0 + (z1 - z0) * along }, color: scale(mixc(rgb(0.7, 0.75, 1, 0.2), rgb(1, 1, 1, 0.7), pulse), 0.75) });
        }
      }
      return out;
    },
  },
  {
    id: 'LOTUS_BLOOM',
    name: 'Lotus Bloom',
    description: 'A lotus that opens from a bud to full bloom and closes again, petals pink at the base and white at the tips, a golden heart.',
    durationSeconds: 24,
    paletteName: 'Rose, white and gold',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const open = 0.25 + 0.7 * ease(0.5 + 0.5 * Math.sin(t * 0.42 - 1.2));   // 0 closed bud … 1 open
      const heart = Math.min(Math.floor(count * 0.12), 20), petals = 8, perPetal = Math.floor((count - heart) / petals);
      // Each petal is drawn as ribs (its two edges, more between them for a bigger fleet): u across, v base→tip.
      // Ribs never meet: the petal keeps a width at its base and tip, and the petals rise from a ring round the heart wide enough for all of them.
      const ribs = Math.max(2, Math.ceil(perPetal / 14)), rows = Math.max(1, Math.ceil(perPetal / ribs) - 1);
      const minW = ribs === 2 ? 1.6 : 1.15 * (ribs - 1), baseW = (ribs === 2 ? 1.44 : 2) * minW, root = Math.max(4.5, (petals * (baseW + 2.3)) / TAU);
      for (let i = 0; i < count; i++) {
        if (i < heart) {
          const hy = (i + 0.5) / heart, hr = Math.sqrt(1 - hy * hy), ha = i * 2.39996, r = 4 + 2 * open;   // a dome: Fibonacci over the upper half only
          out.push({ pos: at({ x: Math.cos(ha) * hr * r, y: hy * r * 0.6, z: Math.sin(ha) * hr * r }, 0, 52, 0), color: scale(rgb(1, 0.85, 0.3, 0.5), 0.8 + 0.2 * Math.sin(t * 3 + i)) });
        } else {
          const k = i - heart, p = Math.min(petals - 1, Math.floor(k / perPetal)), j = k - p * perPetal;
          const rib = j % ribs, v = Math.min(1, Math.floor(j / ribs) / rows), u = ribs === 2 ? (rib ? 0.86 : 0.14) : rib / (ribs - 1);
          const ang = (p / petals) * TAU + t * 0.08, tilt = 0.15 + open * 1.25;                      // petal angle from vertical
          const len = 34, along = v * len;
          // As wide as the petal wants, but never into its neighbour's edge at this radius (a bud's petals are narrow until they open).
          const halfW = Math.max(minW, Math.min(minW + Math.sin(v * Math.PI) * 9, (root + Math.sin(tilt) * along) * 0.37 - 1.1)), across = (u - 0.5) * 2 * halfW;
          const curl = Math.sin(v * Math.PI * 0.5) * 6 * (1 - open);
          const local = { x: across, y: Math.cos(tilt) * along + curl, z: root + Math.sin(tilt) * along };
          const pos = rotY(local, ang);
          out.push({ pos: at(pos, 0, 50, 0), color: scale(mixc(rgb(1, 0.25, 0.55), rgb(1, 0.95, 0.98, 0.6), ease(v)), twinkle(i, t, 0.15)) });
        }
      }
      return out;
    },
  },
  {
    id: 'HEARTBEAT',
    name: 'Heartbeat',
    description: 'A heart that beats, red deepening to rose at the edges, with a shimmer running over it on every pulse.',
    durationSeconds: 20,
    paletteName: 'Red and rose',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const beat = (t * 1.05) % 1, pulse = Math.exp(-Math.pow((beat - 0.1) * 9, 2)) + 0.6 * Math.exp(-Math.pow((beat - 0.35) * 9, 2));
      const S = 1.55 * (1 + pulse * 0.1), sway = Math.sin(t * 0.4) * 0.3;
      const outline = Math.floor(count * 0.5), fill = count - outline;
      // The outline is spaced by length round the curve, in as many layers as it takes to keep them apart; the fill is a sunflower inside it.
      const layers = Math.max(2, Math.ceil((outline * 2.4) / (HEART.length * 1.55))), perLayer = Math.ceil(outline / layers);
      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number, edge: number;
        if (i < outline) {
          const layer = i % layers, h = heart2(HEART.at((Math.floor(i / layers) + layer / layers) / perLayer));
          x = h.x; y = h.y; z = layers === 2 ? (layer ? 3.5 : -3.5) : (layer - (layers - 1) / 2) * 2.4; edge = 1;
        } else {
          const k = i - outline, kk = Math.floor(k / 3), nn = Math.max(1, Math.ceil(fill / 3)), rr = 0.9 * Math.sqrt((kk + 0.5) / nn), h = heart2(HEART.at((kk * 0.381966) % 1));
          x = h.x * rr; y = h.y * rr + 1; z = (k % 3 - 1) * 4.5; edge = rr;
        }
        const p = rotY({ x: x * S, y: y * S, z }, sway);
        const shimmer = Math.exp(-Math.pow(((y + 17) / 30 - beat) * 6, 2)) * 0.85;
        out.push({ pos: at(p, 0, 62, 0), color: mixc(mixc(rgb(0.85, 0.02, 0.06), rgb(1, 0.3, 0.45, 0.25), edge), rgb(1, 1, 1, 0.7), shimmer) });
      }
      return out;
    },
  },
  {
    id: 'FIREWORKS',
    name: 'Fireworks',
    description: 'Three shells rise, hang for a heartbeat and burst into spheres of gold, then fade to embers and gather for the next.',
    durationSeconds: 24,
    paletteName: 'White, gold, ember',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const period = 12, R1 = 13.5;                     // shells 30 m apart never touch at full burst
      const N = Math.ceil(count / 3), rc = Math.max(1.6, 1.5 * Math.cbrt(N));   // a comet is a ball sized for its aircraft
      for (let i = 0; i < count; i++) {
        const shell = i % 3, cx = (shell - 1) * 30, delay = shell * 1.6;
        const u = (((t - delay) % period) + period) % period;
        const j = Math.floor(i / 3), d = fib(j, N), rj = rc * Math.cbrt(((j * 0.618034 + 0.5) % 1) * 0.9 + 0.1);   // depth in the ball, independent of direction
        let r: number, y: number, col: ColorRGBW;
        if (u < 3.5) {                                    // rise as a tight comet
          const k = ease(u / 3.5); r = rj; y = 12 + k * 46;
          col = scale(rgb(1, 0.95, 0.8, 0.8), 0.5 + 0.5 * k);
        } else if (u < 8.5) {                             // burst and drift down
          const k = (u - 3.5) / 5; r = rj + (R1 - rj) * (1 - Math.exp(-k * 2.6)) / (1 - Math.exp(-2.6)); y = 58 - k * k * 8;
          col = scale(mixc(mixc(rgb(1, 1, 1, 0.9), rgb(1, 0.72, 0.2), ease(k * 2)), rgb(0.9, 0.2, 0.02), ease((k - 0.5) * 2)), (1 - k * 0.8) * twinkle(i, t, 0.4));
        } else {                                          // embers gather back into the next comet on the launch line
          const k = ease((u - 8.5) / 3.5); r = R1 + (rj - R1) * k; y = 50 + (12 - 50) * k;
          col = scale(rgb(0.9, 0.25, 0.05), 0.2 * (1 - k) + 0.15);
        }
        out.push({ pos: { x: cx + d.x * r, y: y + d.y * r, z: d.z * r }, color: col });
      }
      return out;
    },
  },
  {
    id: 'MERIDIAN_LOGO',
    name: 'Meridian Star',
    description: 'The eight-point Meridian star turning to face the crowd, a shimmer running round its edge, ringed by a slow orbit of white lights.',
    durationSeconds: 22,
    paletteName: 'White and gold',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      // A small fleet spends every light on the outline: at 100, splitting off the orbit and the fill
      // left under four lights per edge and the star did not read. The extras come in from 200.
      const extras = count >= 200, orbit = extras ? Math.floor(count * 0.22) : 0, fill = extras ? Math.floor(count * 0.18) : 0, edge = count - orbit - fill;
      const face = Math.sin(t * 0.3) * 0.45;
      // Edge lights spaced by length round the outline (not by angle, which bunches them at the tips), in layers for a big fleet.
      const layers = Math.max(1, Math.ceil((edge * 2.4) / STAR.length)), perLayer = Math.ceil(edge / layers);
      for (let i = 0; i < count; i++) {
        if (i < edge) {
          const layer = i % layers, s = (Math.floor(i / layers) + layer / layers) / perLayer, a = STAR.at(s) * TAU, r = starR(a);
          const run = Math.exp(-Math.pow((((s - t * 0.12) % 1 + 1) % 1) * 5 - 2.5, 2) / 0.3);
          out.push({ pos: at(rotY({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: layers === 1 ? 0 : (layer - (layers - 1) / 2) * 2.4 }, face), 0, 60, 0), color: mixc(rgb(1, 0.85, 0.45, 0.4), rgb(1, 1, 1, 0.9), run) });
        } else if (i < edge + fill) {
          const k = i - edge, a = k * 2.39996, r = starR(a) * (0.2 + 0.6 * Math.sqrt((k + 0.5) / fill));   // sunflower inside the star
          out.push({ pos: at(rotY({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 }, face), 0, 60, 0), color: scale(rgb(1, 0.8, 0.45, 0.2), 0.22 + 0.16 * Math.sin(t * 2.2 + k)) });
        } else {
          const k = i - edge - fill, u = k / orbit, a = u * TAU + t * 0.35, tiltA = 0.35;
          const p = rotX({ x: Math.cos(a) * 42, y: 0, z: Math.sin(a) * 42 }, tiltA);
          out.push({ pos: at(p, 0, 60, 0), color: scale(rgb(0.9, 0.95, 1, 0.8), 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(a * 3 - t * 2))) });
        }
      }
      return out;
    },
  },
  {
    id: 'WEDDING_RINGS',
    name: 'Wedding Rings',
    description: 'Two rings, gold and rose gold, linked and turning slowly together, a diamond flash chasing round each.',
    durationSeconds: 22,
    paletteName: 'Gold and rose gold',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const per = Math.floor(count / 2), R = 19, spin = t * 0.22;
      // Three strands round the tube, more (and a fatter tube) when a strand would get crowded.
      const strands = Math.max(3, Math.ceil((per * 2.4) / (TAU * R))), tube = strands === 3 ? 1.6 : (strands * 2.4) / TAU;
      for (let i = 0; i < count; i++) {
        const ring = i < per ? 0 : 1, k = ring ? i - per : i, n = ring ? count - per : per;
        const u = (k / n) * TAU, ring2 = (k % strands) * (TAU / strands);
        const local = { x: Math.cos(u) * (R + Math.cos(ring2) * tube), y: Math.sin(u) * (R + Math.cos(ring2) * tube), z: Math.sin(ring2) * tube };
        // Ring 0 stands in the x-y plane; ring 1 is turned 62° about the vertical and shifted, so they link.
        const p = ring ? at(rotY(local, 1.08), 9.5, 0, 0) : at(local, -9.5, 0, 0);
        const flash = Math.exp(-Math.pow((((u / TAU - t * 0.25 - ring * 0.5) % 1 + 1) % 1) * 5 - 2.5, 2) / 0.12);
        const base = ring ? rgb(1, 0.62, 0.55, 0.3) : rgb(1, 0.8, 0.3, 0.4);
        out.push({ pos: at(rotY(p, spin), 0, 60, 0), color: mixc(scale(base, twinkle(i, t, 0.12)), rgb(1, 1, 1, 1), flash) });
      }
      return out;
    },
  },
  {
    id: 'COUNTDOWN',
    name: 'Countdown',
    description: 'Five, four, three, two, one, each number flipping into the next, then the fleet bursts outward in gold.',
    durationSeconds: 22,
    paletteName: 'White, then gold',
    cuts: [3.2, 6.4, 9.6, 12.8, 16],   // each new number, then the burst: new shapes, not the last one moving
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const step = 3.2, idx = Math.floor(t / step);
      if (idx < 5) {
        const digit = String(5 - idx), pts = textPoints(digit, count, 6.4), u = (t - idx * step) / step;
        const flip = (1 - ease(Math.min(1, u * 2.5))) * 1.4;   // each number arrives with a turn
        const glow = 0.55 + 0.45 * ease(Math.min(1, u * 3));
        pts.forEach((p, i) => {
          const local = { x: -p.x, y: p.y, z: p.z };   // x runs left on screen from the crowd
          out.push({ pos: at(rotY(local, flip), 0, 60, 0), color: scale(mixc(rgb(1, 1, 1, 0.9), rgb(1, 0.85, 0.35, 0.4), u), glow * twinkle(i, t, 0.1)) });
        });
      } else {
        const u = Math.min(1, (t - 5 * step) / 4), r0 = Math.max(6, 0.75 * Math.sqrt(count)), r = r0 + (40 - r0) * (1 - Math.exp(-u * 3));
        for (let i = 0; i < count; i++) {
          const d = fib(i, count);
          out.push({ pos: at({ x: d.x * r, y: d.y * r * 0.8, z: d.z * r }, 0, 60, 0), color: scale(mixc(rgb(1, 0.95, 0.75, 0.9), rgb(1, 0.7, 0.15, 0.3), u), (0.7 + 0.3 * Math.sin(t * 5 + i)) * (1 - u * 0.35)) });
        }
      }
      return out;
    },
  },
  {
    id: 'NAME_IN_LIGHTS',
    name: 'Name in Lights',
    description: 'Any words, spelt out across the sky in a colour wave, with a gentle ripple running through the letters.',
    durationSeconds: 22,
    paletteName: 'Rainbow wave',
    generatePoints: (count, t = 0) => {
      const out: Pt[] = [];
      const text = showText.value.trim() || BRAND.showText;
      const cell = Math.min(5.2, 96 / Math.max(6, text.length * 6));   // long names shrink to fit the stage
      const pts = textPoints(text, count, cell);
      pts.forEach((p, i) => {
        const cx = p.x / cell, ripple = Math.sin(cx * 0.35 - t * 1.6) * 1.6;
        out.push({ pos: { x: -p.x, y: 60 + p.y * 1.1 + ripple, z: p.z + Math.sin(cx * 0.2 + t * 0.6) * 2.5 }, color: scale(hsv(p.x / 140 + t * 0.06, 0.8, 1, 0.15), twinkle(i, t, 0.18)) });
      });
      while (out.length < count) out.push(out[out.length % Math.max(1, pts.length)] ?? { pos: { x: 0, y: 60, z: 0 }, color: rgb(0, 0, 0) });
      return out;
    },
  },
];

/** Every formation, spaced so no two aircraft come closer than FORMATION_SPACING_M at any moment of the cue. */
export const SHOW_FORMATIONS: ShowFormation[] = SHAPES.map(f => ({ ...f, shape: f.generatePoints, generatePoints: (count, t = 0) => spaced(f.generatePoints(count, t)) }));

/** A formation at `t`, stepped through a Spacer when playing a cue in order (same result as generatePoints on the first step). */
export function formationPoints(f: ShowFormation, count: number, t: number, spacer?: Spacer, dtS = 0) {
  return spacer && f.shape ? spacer.next(f.shape(count, t), dtS) : f.generatePoints(count, t);
}

/** The cue playing at show time `t`: a fresh search, so seeking backwards lands on the right cue. */
export const cueAt = (t: number) => { let c = 0; while (c + 1 < CUE_STARTS.length && t >= CUE_STARTS[c + 1]) c++; return c; };

/** Cue start times, in show seconds, from the durations. */
export const CUE_STARTS: number[] = SHOW_FORMATIONS.reduce<number[]>((acc, f, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + SHOW_FORMATIONS[i - 1].durationSeconds); void f; return acc; }, []);
export const SHOW_TOTAL_SECONDS = SHOW_FORMATIONS.reduce((s, f) => s + f.durationSeconds, 0);
