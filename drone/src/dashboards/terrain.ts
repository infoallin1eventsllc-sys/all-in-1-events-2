/**
 * Deterministic value noise for procedural ground: the survey venue's terrain and imagery
 * (survey/site.ts) are built from it, so every load draws the same hills.
 */

// Deterministic 2D value noise (no deps).
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t: number) { return t * t * (3 - 2 * t); }
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractional Brownian motion over the value noise; `octaves` trades detail for speed. */
export function fbm(x: number, y: number, seed: number, octaves = 5) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq, seed + i * 7);
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}
