import * as THREE from 'three';

/**
 * Sculpting helpers for the airframes: a lofted body (superellipse cross-sections
 * swept along x, with rounded ends), queries that land details on its surface,
 * and a propeller blade with a real airfoil, twist and swept tip.
 */

/**
 * One cross-section of a loft, at `x`. The section is split at height `ys`:
 * above it the shell rises to `yt`, below it falls to `yb`; `w` is the half
 * width. `n` is the superellipse exponent: 2 is an ellipse, higher is boxier.
 */
export interface Section { x: number; w: number; ys: number; yt: number; yb: number; n: number }

export interface LoftSpec { secs: Section[]; rTail: number; rNose: number }

const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** The section at x, by Catmull-Rom between the given ones (clamped at the ends). */
export function sectionAt(secs: Section[], x: number): Section {
  if (x <= secs[0].x) return secs[0];
  const last = secs.length - 1;
  if (x >= secs[last].x) return secs[last];
  let i = 0;
  while (i < last - 1 && x > secs[i + 1].x) i++;
  const a = secs[Math.max(0, i - 1)], b = secs[i], c = secs[i + 1], d = secs[Math.min(last, i + 2)];
  const t = (x - b.x) / (c.x - b.x);
  const f = (k: keyof Section) => cr(a[k], b[k], c[k], d[k], t);
  return { x, w: f('w'), ys: f('ys'), yt: f('yt'), yb: f('yb'), n: f('n') };
}

/** Section at x including the rounded ends: past the first or last section it shrinks on a quarter circle. */
function capped(spec: LoftSpec, x: number): { s: Section; f: number } {
  const { secs, rTail, rNose } = spec, x0 = secs[0].x, x1 = secs[secs.length - 1].x;
  if (x < x0) { const u = (x0 - x) / rTail; return { s: secs[0], f: u >= 1 ? 0 : Math.sqrt(1 - u * u) }; }
  if (x > x1) { const u = (x - x1) / rNose; return { s: secs[secs.length - 1], f: u >= 1 ? 0 : Math.sqrt(1 - u * u) }; }
  return { s: sectionAt(secs, x), f: 1 };
}

const spow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

/**
 * The lofted surface. `theta0..theta1` picks part of the way round (0 is the
 * right side, π/2 the top, π the left, 3π/2 the bottom), so a two-tone shell is
 * two lofts: [0, π] and [π, 2π]. `grow` pushes the surface out (for seams).
 */
export function loftGeometry(spec: LoftSpec, opts: { along?: number; around?: number; cap?: number; theta0?: number; theta1?: number; grow?: number } = {}): THREE.BufferGeometry {
  const { along = 56, around = 48, cap = 10, theta0 = 0, theta1 = Math.PI * 2, grow = 0 } = opts;
  const { secs, rTail, rNose } = spec, x0 = secs[0].x, x1 = secs[secs.length - 1].x;
  const xs: number[] = [];
  for (let k = 0; k < cap; k++) xs.push(x0 - rTail * Math.cos((k / cap) * Math.PI / 2));
  for (let k = 0; k <= along; k++) xs.push(x0 + ((x1 - x0) * k) / along);
  for (let k = 1; k <= cap; k++) xs.push(x1 + rNose * Math.sin((k / cap) * Math.PI / 2));
  const ring = around + 1, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  xs.forEach((x, i) => {
    const { s, f } = capped(spec, x);
    const w = s.w * f + grow * Math.min(1, f * 4), ht = (s.yt - s.ys) * f + grow * Math.min(1, f * 4), hb = (s.ys - s.yb) * f + grow * Math.min(1, f * 4);
    const e = 2 / s.n;
    for (let j = 0; j < ring; j++) {
      const th = theta0 + ((theta1 - theta0) * j) / around, c = Math.cos(th), sn = Math.sin(th);
      pos.push(x, s.ys + (sn >= 0 ? ht : hb) * spow(sn, e), w * spow(c, e));
      uv.push(i / (xs.length - 1), j / around);
    }
  });
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < around; j++) {
    const a = i * ring + j, b = a + ring, c = a + 1, d = b + 1;
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Implicit value of the loft at a point: below 0 inside, 0 on the surface. */
function field(spec: LoftSpec, x: number, y: number, z: number): number {
  const { s, f } = capped(spec, x);
  if (f <= 1e-4) return 1;
  const w = s.w * f, h = (y >= s.ys ? s.yt - s.ys : s.ys - s.yb) * f;
  return Math.pow(Math.abs(z) / w, s.n) + Math.pow(Math.abs(y - s.ys) / h, s.n) - 1;
}

/**
 * Where a ray from `from` along `dir` first meets the loft, and the outward
 * normal there. Used to set sensors, vents and panel lines onto the shell.
 */
export function hit(spec: LoftSpec, from: THREE.Vector3, dir: THREE.Vector3): { p: THREE.Vector3; n: THREE.Vector3 } {
  const d = dir.clone().normalize(), p = from.clone();
  let lo = 0, hi = 0, step = 0.004;
  for (let t = 0; t < 3; t += step) { if (field(spec, p.x + d.x * t, p.y + d.y * t, p.z + d.z * t) < 0) { hi = t; lo = Math.max(0, t - step); break; } }
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (field(spec, p.x + d.x * m, p.y + d.y * m, p.z + d.z * m) < 0) hi = m; else lo = m; }
  const at = p.addScaledVector(d, (lo + hi) / 2), e = 0.0015;
  const n = new THREE.Vector3(
    field(spec, at.x + e, at.y, at.z) - field(spec, at.x - e, at.y, at.z),
    field(spec, at.x, at.y + e, at.z) - field(spec, at.x, at.y - e, at.z),
    field(spec, at.x, at.y, at.z + e) - field(spec, at.x, at.y, at.z - e),
  ).normalize();
  return { p: at, n };
}

/** Half width of the loft at x, rounded ends included. */
export function halfWidth(spec: LoftSpec, x: number): number { const { s, f } = capped(spec, x); return s.w * f; }

function surfaceY(spec: LoftSpec, x: number, z: number, top: boolean): number {
  const { s, f } = capped(spec, x), w = s.w * f;
  if (w <= 1e-6 || Math.abs(z) >= w) return s.ys;
  const h = (top ? s.yt - s.ys : s.ys - s.yb) * f;
  const k = Math.pow(1 - Math.pow(Math.abs(z) / w, s.n), 1 / s.n);
  return top ? s.ys + h * k : s.ys - h * k;
}
/** Top-surface height of the loft at (x, z). */
export function topY(spec: LoftSpec, x: number, z: number): number { return surfaceY(spec, x, z, true); }
/** Underside height of the loft at (x, z). */
export function bottomY(spec: LoftSpec, x: number, z: number): number { return surfaceY(spec, x, z, false); }

/** Turn `o` so its local +x points along `n` (and its +y stays as near world up as it can), and put it at `p`. */
export function orient(o: THREE.Object3D, p: THREE.Vector3, n: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)): THREE.Object3D {
  const x = n.clone().normalize();
  let z = new THREE.Vector3().crossVectors(x, up);
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(1, 0, 0));
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  o.position.copy(p);
  return o;
}

/** A thin tube through points on the shell, lifted a hair off it: a panel line or seam. */
export function lineOnShell(points: THREE.Vector3[], r: number, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), r, 4, closed);
}

/** Linear interpolation through a table of (s, value) pairs. */
function table(t: [number, number][], s: number): number {
  if (s <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (s <= t[i][0]) { const [a, va] = t[i - 1], [b, vb] = t[i]; return va + ((vb - va) * (s - a)) / (b - a); }
  return t[t.length - 1][1];
}

/**
 * A low-noise folding prop blade, root at r0 and tip at R along +x: chord
 * widest a third of the way out, a swept and rounded tip, a cambered airfoil
 * thick at the root and thin at the tip, and twist that falls from about 24° to
 * 7°. `hand` +1 leads with -z (for a prop turning +y); -1 is the mirror image.
 * `band` builds only the span from..to, swollen by `inflate`: a painted stripe that wraps the blade.
 */
export function bladeGeometry(R: number, r0: number, hand: 1 | -1, span = 30, chordN = 12, band?: { from: number; to: number; inflate: number }): THREE.BufferGeometry {
  const L = R - r0;
  const chord: [number, number][] = [[0, 0.12], [0.12, 0.17], [0.32, 0.2], [0.58, 0.18], [0.8, 0.14], [0.92, 0.1], [0.975, 0.06], [1, 0.0]];   // fraction of R
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const around = chordN * 2;
  const s0 = band ? band.from : 0, s1 = band ? band.to : 1, grow = band ? band.inflate : 0;
  for (let i = 0; i <= span; i++) {
    const s = s0 + ((s1 - s0) * i) / span, r = r0 + L * s;
    const c = table(chord, s) * R + grow * 2;
    const sweep = (0.01 + 0.07 * Math.pow(s, 2.4)) * L;            // the tip trails back
    const tw = 0.42 - 0.3 * s;                                       // twist, radians
    const th = c * (0.13 - 0.07 * s);                                // thickness: 13% of chord at the root, 6% at the tip
    const lift = 0.025 * L * s * s;                                  // coning: the blades flex up under load
    for (let j = 0; j <= around; j++) {
      // round the profile: LE (u=0) along the top to TE (u=1), then back along the bottom
      const top = j <= chordN, u = top ? j / chordN : 2 - j / chordN;
      const half = 2.5 * th * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4) + grow;
      const camber = 0.045 * c * Math.sin(Math.PI * u);
      const zc = -c / 2 + c * u + sweep;                              // LE at -z
      const yc = camber + (top ? half : -half);
      // pitch: rotate about the radial axis so the leading edge rides high
      const y = yc * Math.cos(tw) - zc * Math.sin(tw) + lift, z = yc * Math.sin(tw) + zc * Math.cos(tw);
      pos.push(r, y, z * hand);
      uv.push(s, j / around);
    }
  }
  const ring = around + 1;
  for (let i = 0; i < span; i++) for (let j = 0; j < around; j++) {
    const a = i * ring + j, b = a + ring, c = a + 1, d = b + 1;
    if (hand > 0) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d);
  }
  // Close the root with a fan (a band is open at both ends).
  const centre = pos.length / 3;
  if (band) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < ring; j++) { cx += pos[j * 3]; cy += pos[j * 3 + 1]; cz += pos[j * 3 + 2]; }
  pos.push(cx / ring, cy / ring, cz / ring); uv.push(0, 0.5);
  for (let j = 0; j < around; j++) { if (hand > 0) idx.push(centre, j + 1, j); else idx.push(centre, j, j + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Fine plastic grain for the shell's roughness and bump: moulded plastic is never optically smooth. */
let grainTex: THREE.Texture | null = null;
export function grainTexture(): THREE.Texture {
  if (grainTex) return grainTex;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Two octaves of value noise, tileable.
  const lattice = (k: number) => { const a = new Float32Array(k * k); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const l1 = lattice(32), l2 = lattice(128);
  const sample = (a: Float32Array, k: number, x: number, y: number) => {
    const fx = (x / N) * k, fy = (y / N) * k, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const at = (i: number, j: number) => a[((j % k) * k) + (i % k)];
    const s = (t: number) => t * t * (3 - 2 * t);
    return (at(ix, iy) * (1 - s(tx)) + at(ix + 1, iy) * s(tx)) * (1 - s(ty)) + (at(ix, iy + 1) * (1 - s(tx)) + at(ix + 1, iy + 1) * s(tx)) * s(ty);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 0.55 * sample(l1, 32, x, y) + 0.45 * sample(l2, 128, x, y);
    const b = Math.round(160 + (v - 0.5) * 44), o = (y * N + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 7); t.anisotropy = 4;
  grainTex = t;
  return t;
}
