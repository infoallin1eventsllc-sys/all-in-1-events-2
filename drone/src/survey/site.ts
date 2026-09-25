import { fbm } from '../dashboards/terrain';
import type { Pt } from './plan';

/**
 * The demo venue: an outdoor festival ground, in local metres (x east, y south,
 * origin at the centre). On a real link the origin becomes the aircraft's home fix
 * and the boundary is whatever the operator draws; the dashboard only needs this
 * shape of data.
 */

export interface Structure {
  id: string; label: string;
  /** Centre, size (w along x, d along y) and height, metres. */
  x: number; y: number; w: number; d: number; h: number;
  roof: string; kind: 'stage' | 'hall' | 'tent' | 'tower' | 'truck';
}

export const SITE = {
  name: 'Festival grounds',
  /** Default geographic origin while simulating (Long Beach, CA). */
  origin: { lat: 33.7701, lon: -118.1937 },
  boundary: [
    { x: -230, y: -120 }, { x: -60, y: -172 }, { x: 170, y: -150 }, { x: 242, y: -20 },
    { x: 190, y: 150 }, { x: -40, y: 166 }, { x: -222, y: 88 },
  ] as Pt[],
  home: { x: -150, y: 120 } as Pt,
  structures: [
    { id: 'stage', label: 'Main stage', x: 60, y: -70, w: 38, d: 20, h: 15, roof: '#2a2f38', kind: 'stage' },
    { id: 'hall', label: 'Exhibition hall', x: -120, y: -48, w: 72, d: 34, h: 11, roof: '#c9ccd2', kind: 'hall' },
    { id: 'foh', label: 'Front-of-house tower', x: 60, y: 8, w: 7, d: 7, h: 8, roof: '#3b4250', kind: 'tower' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `tent-${i + 1}`, label: `Vendor tent ${i + 1}`, x: -200 + i * 22, y: 52, w: 12, d: 12, h: 5, roof: '#f4f4f2', kind: 'tent' as const })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `truck-${i + 1}`, label: `Food truck ${i + 1}`, x: 118 + i * 14, y: 40, w: 3, d: 8, h: 3.4, roof: ['#d9480f', '#1c7ed6', '#f59f00', '#e8590c', '#2b8a3e'][i], kind: 'truck' as const })),
  ] as Structure[],
  parking: { x0: 96, y0: 72, x1: 214, y1: 138 },
  /** The structure an orbit inspection circles. */
  orbitTarget: 'stage',
};

/** Extent of the rendered world (terrain and imagery), metres, square. */
export const WORLD_M = 900;

/** Height of the venue floor above sea level at local (0, 0): what the survey's elevations are read against. */
export const SITE_DATUM_M = 11.4;

/** The gravel stockpile behind the stage (for the volume tool): centre, radius, height. */
export const STOCKPILE = { x: 172, y: -78, r: 17, h: 7.5 };
/** A drainage swale across the path from the gate (for the grade tool): a point on it, its direction, depth and half-width. */
export const SWALE = { x: -60, y: 55, dx: 0.53, dy: 0.85, depth: 0.6, w: 5, len: 70 };

/**
 * Ground height in metres (relative to the datum). The venue is graded almost
 * flat (a festival ground): it falls gently to the south-east, a drainage swale
 * crosses the path from the gate, and a gravel stockpile waits behind the stage.
 * Rolling land rises into hills beyond the boundary, higher to the north-west.
 */
export function heightAt(x: number, y: number): number {
  const r = Math.hypot(x, y);
  const flat = Math.min(1, Math.max(0, (r - 230) / 170)); // 0 inside the venue, 1 far out
  const roll = fbm(x * 0.006 + 40, y * 0.006 + 40, 11, 4) * 14 - 6;
  const ridge = Math.max(0, (-(x + y) - 260) / 240) * 38;
  const hills = (fbm(x * 0.004 + 3, y * 0.004 - 7, 29, 5) - 0.35) * 70;
  // Venue floor: a 0.7 % fall to the south-east, fine unevenness, the swale and the stockpile.
  const fall = -0.006 * x - 0.004 * y;
  const along = (x - SWALE.x) * SWALE.dx + (y - SWALE.y) * SWALE.dy, across = (x - SWALE.x) * SWALE.dy - (y - SWALE.y) * SWALE.dx;
  const swale = -SWALE.depth * Math.exp(-((across / SWALE.w) ** 2)) * Math.max(0, 1 - (along / SWALE.len) ** 2);
  const d = Math.hypot(x - STOCKPILE.x, y - STOCKPILE.y) / STOCKPILE.r;
  const pile = d < 1 ? STOCKPILE.h * Math.pow(1 - d * d, 1.5) * (0.92 + 0.16 * fbm(x * 0.3, y * 0.3, 17, 2)) : 0;
  const floor = fall + swale + pile + (fbm(x * 0.02, y * 0.02, 5, 2) - 0.5) * 0.8;
  return flat * (Math.max(0, hills) + ridge + roll) + (1 - flat) * floor;
}

/**
 * The surface a finished survey measures (a DSM): the ground, plus the roofs of
 * structures standing on it. Heights relative to the datum.
 */
export function surfaceAt(x: number, y: number): number {
  const g = heightAt(x, y);
  for (const s of SITE.structures) if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(y - s.y) <= s.d / 2) return heightAt(s.x, s.y) + s.h;
  return g;
}

export function structureAt(id: string): Structure | undefined { return SITE.structures.find(s => s.id === id); }

/** Tree lines along the west and south edges (seeded, so the map and the 3D view agree). */
export const TREES: { x: number; y: number; r: number; shade: number }[] = (() => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 260 }, () => {
    const t = rnd();
    const x = t < 0.5 ? -300 + rnd() * 60 : -260 + rnd() * 520;
    const y = t < 0.5 ? -200 + rnd() * 400 : 185 + rnd() * 50;
    return { x, y, r: 3 + rnd() * 4, shade: rnd() };
  });
})();

/** Cars in the parking lot (seeded), shared by the map imagery and the 3D stage. */
export const PARKED_CARS: { x: number; y: number; color: string }[] = (() => {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = ['#d7dbe0', '#1f2937', '#9ca3af', '#7f1d1d', '#1e3a8a', '#f3f4f6', '#374151'];
  const out: { x: number; y: number; color: string }[] = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 40; col++) {
    const x = SITE.parking.x0 + 4 + col * 2.8, y = SITE.parking.y0 + 6 + row * 15;
    if (rnd() < 0.72) out.push({ x, y, color: cols[Math.floor(rnd() * cols.length)] });
  }
  return out;
})();

/**
 * A procedural orthophoto of the venue: what the finished map will look like.
 * Drawn once to a canvas covering WORLD_M × WORLD_M, centred on the origin.
 */
let imageryCache: HTMLCanvasElement | null = null;
export function siteImagery(size = 1024): HTMLCanvasElement {
  if (imageryCache && imageryCache.width === size) return imageryCache;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size / WORLD_M; // px per metre
  const X = (x: number) => (x + WORLD_M / 2) * s, Y = (y: number) => (y + WORLD_M / 2) * s;

  // Ground: grass that dries to straw on the hills, per-pixel noise at low res then upscaled.
  const g = 256, img = ctx.createImageData(g, g);
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const x = (i / g) * WORLD_M - WORLD_M / 2, y = (j / g) * WORLD_M - WORLD_M / 2;
    const h = heightAt(x, y), n = fbm(x * 0.03, y * 0.03, 3, 3), dry = Math.min(1, Math.max(0, h / 40));
    const k = (j * g + i) * 4;
    img.data[k] = 58 + n * 40 + dry * 70; img.data[k + 1] = 84 + n * 44 + dry * 30; img.data[k + 2] = 44 + n * 20 + dry * 10; img.data[k + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = g; tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, size, size);

  // Tree lines.
  for (const t of TREES) {
    ctx.fillStyle = `rgba(${22 + t.shade * 18},${48 + t.shade * 20},${26 + t.shade * 10},0.95)`;
    ctx.beginPath(); ctx.arc(X(t.x), Y(t.y), t.r * s, 0, Math.PI * 2); ctx.fill();
  }

  // Worn gravel paths linking entrance, stage, hall and parking.
  ctx.strokeStyle = 'rgba(176,160,128,0.9)'; ctx.lineCap = 'round'; ctx.lineWidth = 6 * s;
  const path = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); };
  path([[-150, 120], [-100, 80], [-20, 30], [60, -40]]);
  path([[-20, 30], [-110, -20]]);
  path([[-20, 30], [120, 60], [150, 100]]);
  // Crowd field in front of the stage: trampled grass.
  ctx.fillStyle = 'rgba(150,140,96,0.35)'; ctx.beginPath(); ctx.ellipse(X(60), Y(-20), 70 * s, 40 * s, 0, 0, Math.PI * 2); ctx.fill();

  // The swale: a damper strip of greener grass along its bed.
  ctx.save(); ctx.strokeStyle = 'rgba(30,70,32,0.45)'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(X(SWALE.x - SWALE.dx * SWALE.len * 0.8), Y(SWALE.y - SWALE.dy * SWALE.len * 0.8)); ctx.lineTo(X(SWALE.x + SWALE.dx * SWALE.len * 0.8), Y(SWALE.y + SWALE.dy * SWALE.len * 0.8)); ctx.stroke(); ctx.restore();
  // The stockpile: gravel, lit from the north-west, with its toe spilling onto the grass.
  { const P0 = STOCKPILE; const g2 = ctx.createRadialGradient(X(P0.x - P0.r * 0.25), Y(P0.y - P0.r * 0.25), 0, X(P0.x), Y(P0.y), P0.r * s * 1.08);
    g2.addColorStop(0, '#b9b2a4'); g2.addColorStop(0.55, '#9a9284'); g2.addColorStop(0.9, '#6f6a60'); g2.addColorStop(1, 'rgba(90,86,76,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(X(P0.x), Y(P0.y), P0.r * s * 1.08, 0, Math.PI * 2); ctx.fill(); }

  // Parking lot with cars.
  const P = SITE.parking;
  ctx.fillStyle = '#4a4d52'; ctx.fillRect(X(P.x0), Y(P.y0), (P.x1 - P.x0) * s, (P.y1 - P.y0) * s);
  ctx.strokeStyle = 'rgba(230,230,230,0.5)'; ctx.lineWidth = Math.max(1, 0.2 * s);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 40; col++) ctx.strokeRect(X(P.x0 + 4 + col * 2.8), Y(P.y0 + 6 + row * 15), 2.6 * s, 5 * s);
  for (const car of PARKED_CARS) { ctx.fillStyle = car.color; ctx.fillRect(X(car.x + 0.4), Y(car.y + 0.5), 1.8 * s, 4 * s); }

  // Structures (roofs), with a soft shadow to the south-east.
  for (const st of SITE.structures) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(X(st.x - st.w / 2 + st.h * 0.35), Y(st.y - st.d / 2 + st.h * 0.35), st.w * s, st.d * s);
    ctx.fillStyle = st.roof; ctx.fillRect(X(st.x - st.w / 2), Y(st.y - st.d / 2), st.w * s, st.d * s);
    if (st.kind === 'tent') { ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(X(st.x - st.w / 2), Y(st.y - st.d / 2)); ctx.lineTo(X(st.x + st.w / 2), Y(st.y + st.d / 2)); ctx.moveTo(X(st.x + st.w / 2), Y(st.y - st.d / 2)); ctx.lineTo(X(st.x - st.w / 2), Y(st.y + st.d / 2)); ctx.stroke(); }
  }

  imageryCache = c;
  return c;
}
