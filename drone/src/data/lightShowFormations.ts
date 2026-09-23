import { ShowFormation, Vector3D, ColorRGBW } from '../types/lightShowTypes';

/**
 * The show: eight formations, each alive. `generatePoints(count, t)` returns
 * where every aircraft should be and what colour it should show at show-time
 * `t` (seconds into the cue), so a formation breathes, turns, flaps, blooms,
 * beats or bursts rather than hanging still. Aircraft keep their index from
 * frame to frame, so the fleet flows between shapes instead of scattering.
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

export const SHOW_FORMATIONS: ShowFormation[] = [
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
      const core = Math.floor(count * 0.18), stars = Math.floor(count * 0.08), arms = count - core - stars;
      const spin = t * 0.28;
      for (let i = 0; i < count; i++) {
        if (i < core) {
          const d = fib(i, core), r = 6 + 2 * Math.sin(t * 1.3 + i);
          out.push({ pos: at(rotX(rotY({ x: d.x * r, y: d.y * r * 0.45, z: d.z * r }, spin), -0.62), 0, 60, 0), color: scale(rgb(1, 0.9, 0.6, 0.6), 0.85 + 0.15 * Math.sin(t * 2 + i)) });
        } else if (i < core + arms) {
          const k = i - core, arm = k % 3, u = Math.floor(k / 3) / Math.max(1, Math.floor(arms / 3));
          const r = 9 + u * 30, ang = (arm * TAU) / 3 + u * 2.4 + spin + Math.sin(u * 9 + t) * 0.03;
          const wave = Math.sin(u * 8 + t * 0.9 + arm) * 2.2 * (1 - u * 0.3);
          out.push({ pos: at(rotX({ x: Math.cos(ang) * r, y: wave, z: Math.sin(ang) * r }, -0.62), 0, 60, 0), color: scale(hsv(0.6 + u * 0.28, 0.75, 1, 0.08), twinkle(i, t, 0.3)) });
        } else {
          const k = i - core - arms, d = fib(k, stars), r = 32 + (k % 4) * 3;
          out.push({ pos: at(rotX(rotY({ x: d.x * r, y: d.y * 16, z: d.z * r }, -spin * 0.4), -0.62), 0, 60, 0), color: scale(rgb(0.85, 0.9, 1, 0.5), 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.1 + k * 2.3))) });
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
      for (let i = 0; i < count; i++) {
        if (i < body) {
          const u = i / body, x = 0, z = -14 + u * 34, y = 60 + bob + Math.sin(u * Math.PI) * 5;
          const side = (i % 2 ? 1 : -1) * (1.2 + Math.sin(u * Math.PI) * 2.2);
          out.push({ pos: at(rotY({ x: x + side, y: y - 60, z }, face), 0, 60, 0), color: scale(rgb(1, 0.85, 0.35, 0.5), twinkle(i, t, 0.15)) });
        } else if (i < body + wings) {
          const k = i - body, side = k % 2 ? 1 : -1, j = Math.floor(k / 2), per = Math.max(1, Math.floor(wings / 2));
          const u = (j % 9) / 8, v = Math.floor(j / 9) / Math.max(1, Math.floor(per / 9) - 1); // u across the span, v along the chord
          const span = 4 + u * 40;
          const dihedral = flap * (0.1 + u * 0.28) * span + u * u * 5 * flap;
          const sweep = -6 + v * 16 - u * 10;
          const y = 60 + bob + dihedral - u * 3;
          out.push({ pos: at(rotY({ x: side * span, y: y - 60, z: sweep }, face), 0, 60, 0), color: scale(mixc(rgb(1, 0.78, 0.25, 0.3), rgb(1, 0.12, 0.02), ease(u * 1.15 - 0.1)), twinkle(i, t, 0.2)) });
        } else {
          const k = i - body - wings, u = k / tail, spread = (k % 5 - 2) * 1.6;
          const z = -14 - u * 22, y = 60 + bob - u * 9 + Math.sin(t * 3 + u * 6) * 1.5;
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
      const rungs = Math.floor(count * 0.34), strand = count - rungs, per = Math.floor(strand / 2);
      const H = 72, R = 13, turns = 2.2, spin = t * 0.5;
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
      const heart = Math.floor(count * 0.12), petals = 8, perPetal = Math.floor((count - heart) / petals);
      for (let i = 0; i < count; i++) {
        if (i < heart) {
          const d = fib(i, heart), r = 4 + 2 * open;
          out.push({ pos: at({ x: d.x * r, y: Math.abs(d.y) * r * 0.6, z: d.z * r }, 0, 52, 0), color: scale(rgb(1, 0.85, 0.3, 0.5), 0.8 + 0.2 * Math.sin(t * 3 + i)) });
        } else {
          const k = i - heart, p = Math.min(petals - 1, Math.floor(k / perPetal)), j = k - p * perPetal;
          // Each petal is drawn as ribs (its two edges, plus a midrib with a bigger fleet): u across, v base→tip.
          const ribs = perPetal >= 30 ? 3 : 2, rib = j % ribs, rows = Math.max(1, Math.ceil(perPetal / ribs) - 1);
          const v = Math.min(1, Math.floor(j / ribs) / rows), u = ribs === 2 ? (rib ? 0.86 : 0.14) : rib * 0.5;
          const ang = (p / petals) * TAU + t * 0.08, tilt = 0.15 + open * 1.25;                      // petal angle from vertical
          const len = 34, halfW = Math.sin(v * Math.PI) * 9;
          const along = v * len, across = (u - 0.5) * 2 * halfW;
          const curl = Math.sin(v * Math.PI * 0.5) * 6 * (1 - open);
          const local = { x: across, y: Math.cos(tilt) * along + curl, z: Math.sin(tilt) * along };
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
      const outline = Math.floor(count * 0.5), inner = count - outline;
      // Classic heart curve, ~±16 wide, -17..+13 tall; scaled to ~50 m across.
      const heart2 = (u: number) => { const a = u * TAU; return { x: 16 * Math.pow(Math.sin(a), 3), y: 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a) }; };
      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number, edge: number;
        if (i < outline) {
          const u = i / outline, h = heart2(u), layer = i % 2 ? 1 : -1;
          x = h.x; y = h.y; z = layer * 3.5; edge = 1;
        } else {
          const k = i - outline, u = (k * 0.618034) % 1, h = heart2(u), rr = 0.18 + 0.72 * (((k * 7) % 11) / 11);
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
      const period = 12;
      for (let i = 0; i < count; i++) {
        const shell = i % 3, cx = (shell - 1) * 30, delay = shell * 1.6;
        const u = (((t - delay) % period) + period) % period;
        const d = fib(Math.floor(i / 3), Math.ceil(count / 3));
        let pos: Vector3D, col: ColorRGBW;
        if (u < 3.5) {                                    // rise as a tight comet
          const k = ease(u / 3.5), y = 12 + k * 46;
          pos = { x: cx + d.x * 1.6, y: y + d.y * 3, z: d.z * 1.6 };
          col = scale(rgb(1, 0.95, 0.8, 0.8), 0.5 + 0.5 * k);
        } else if (u < 8.5) {                             // burst and drift down
          const k = (u - 3.5) / 5, r = 26 * (1 - Math.exp(-k * 2.6)), fall = k * k * 8;
          pos = { x: cx + d.x * r, y: 58 + d.y * r - fall, z: d.z * r };
          col = scale(mixc(mixc(rgb(1, 1, 1, 0.9), rgb(1, 0.72, 0.2), ease(k * 2)), rgb(0.9, 0.2, 0.02), ease((k - 0.5) * 2)), (1 - k * 0.8) * twinkle(i, t, 0.4));
        } else {                                          // embers gather back to the launch line
          const k = ease((u - 8.5) / 3.5), r = 26 * (1 - k);
          pos = { x: cx + d.x * r * 0.4, y: 12 + (50 - 8 - 12) * (1 - k) + d.y * r * 0.3, z: d.z * r * 0.4 };
          col = scale(rgb(0.9, 0.25, 0.05), 0.2 * (1 - k) + 0.15);
        }
        out.push({ pos, color: col });
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
      const orbit = Math.floor(count * 0.22), fill = Math.floor(count * 0.18), edge = count - orbit - fill;
      const face = Math.sin(t * 0.3) * 0.45;
      const starR = (a: number) => { const k = Math.abs(Math.cos(a * 4)); return 12 + 22 * Math.pow(k, 3); };   // 8-point star outline
      for (let i = 0; i < count; i++) {
        if (i < edge) {
          const u = i / edge, a = u * TAU, r = starR(a);
          const run = Math.exp(-Math.pow((((u - t * 0.12) % 1 + 1) % 1) * 5 - 2.5, 2) / 0.3);
          out.push({ pos: at(rotY({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 }, face), 0, 60, 0), color: mixc(rgb(1, 0.85, 0.45, 0.4), rgb(1, 1, 1, 0.9), run) });
        } else if (i < edge + fill) {
          const k = i - edge, u = k / fill, a = u * TAU * 5.3, r = starR(a) * (0.25 + 0.55 * ((k * 7) % 11) / 11);
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
];

/** Cue start times, in show seconds, from the durations. */
export const CUE_STARTS: number[] = SHOW_FORMATIONS.reduce<number[]>((acc, f, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + SHOW_FORMATIONS[i - 1].durationSeconds); void f; return acc; }, []);
export const SHOW_TOTAL_SECONDS = SHOW_FORMATIONS.reduce((s, f) => s + f.durationSeconds, 0);
