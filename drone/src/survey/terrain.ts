import { toLatLon, fromLatLon, FRAME_GLOBAL_TERRAIN_ALT, SURVEY_CMD, type GeoOrigin, type Pt, type SurveyMissionItem } from './plan';
import { lonLatToPixel, tilesCovering, tileUrl, groundResolution, TILE_PX } from './tiles';
import { heightAt, SITE_DATUM_M } from './site';
import type { SurveySite } from './boundary';

/**
 * The ground under a survey: how high it is, so the aircraft can hold its height
 * above it (see TerrainFollow in plan.ts) and the checks can see what it clears.
 *
 * Real sites read the open Terrarium elevation tiles (Mapzen / AWS Terrain Tiles:
 * SRTM, 3DEP, lidar where there is some, in PNG with height = R·256 + G + B/256 − 32768 m),
 * a few tiles around the site at zoom 14–15 (5–10 m a pixel), sampled bilinearly
 * between pixel centres. The demo venue uses its own model (site.ts), no network.
 */

export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** Heights from a Terrarium tile's pixels (RGB or RGBA, row by row). */
export function decodeTerrarium(px: ArrayLike<number>, width: number, height: number, channels = 4): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, k = 0; i < out.length; i++, k += channels) out[i] = terrariumHeight(px[k], px[k + 1], px[k + 2]);
  return out;
}

/** Terrarium tiles at one zoom: heights anywhere they cover, bilinear across tile edges. */
export class ElevationGrid {
  /** Pixels per tile (256 for Terrarium; others may be 512). */
  readonly size: number;
  constructor(readonly z: number, readonly tiles: Map<string, Float32Array>, size = TILE_PX) { this.size = size; }
  private px(i: number, j: number): number {
    const n = 2 ** this.z, S = this.size, tx = Math.floor(i / S), ty = Math.floor(j / S);
    if (ty < 0 || ty >= n) return NaN;
    const t = this.tiles.get(`${((tx % n) + n) % n}/${ty}`);
    return t ? t[(j - ty * S) * S + (i - tx * S)] : NaN;
  }
  /** Height at a point, m above sea level; NaN outside the loaded tiles. */
  heightAt(lat: number, lon: number): number {
    const p = lonLatToPixel(lat, lon, this.z), k = this.size / TILE_PX;
    const u = p.x * k - 0.5, v = p.y * k - 0.5, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    const a = this.px(i, j), b = this.px(i + 1, j), c = this.px(i, j + 1), d = this.px(i + 1, j + 1);
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d)) return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    // At the edge of what loaded: the nearest pixel that did.
    const near = [[fx < 0.5 ? a : b, fx < 0.5 ? b : a], [fx < 0.5 ? c : d, fx < 0.5 ? d : c]];
    for (const v2 of fy < 0.5 ? [...near[0], ...near[1]] : [...near[1], ...near[0]]) if (Number.isFinite(v2)) return v2;
    return NaN;
  }
}

export interface Terrain {
  source: 'DEMO' | 'TERRARIUM';
  /** Ground height above sea level at a map point (site metres), NaN off the loaded area. */
  at: (p: Pt) => number;
  /** Metres between elevation samples. */
  resM: number;
  label: string;
}

/** The demo venue's own ground model. */
export function demoTerrain(): Terrain {
  return { source: 'DEMO', at: p => heightAt(p.x, p.y) + SITE_DATUM_M, resM: 1, label: 'demo venue model' };
}

export function terrainFromGrid(grid: ElevationGrid, origin: GeoOrigin): Terrain {
  return {
    source: 'TERRARIUM', at: p => { const ll = toLatLon(origin, p); return grid.heightAt(ll.lat, ll.lon); },
    resM: groundResolution(origin.lat, grid.z) * (TILE_PX / grid.size), label: `Terrarium z${grid.z} · ${grid.tiles.size} tile${grid.tiles.size === 1 ? '' : 's'}`,
  };
}

/** The box terrain is needed for: the site and home, plus room for lead-ins, turns and the fence. */
export function terrainBox(site: Pick<SurveySite, 'origin' | 'boundary' | 'home'>, marginM = 250) {
  const pts = [...site.boundary, site.home];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const nw = toLatLon(site.origin, { x: Math.min(...xs) - marginM, y: Math.min(...ys) - marginM });
  const se = toLatLon(site.origin, { x: Math.max(...xs) + marginM, y: Math.max(...ys) + marginM });
  return { north: nw.lat, south: se.lat, west: nw.lon, east: se.lon };
}

/** The finest zoom (15 down to 11) that covers the box in at most `maxTiles` tiles. */
export function terrainZoom(box: { north: number; south: number; west: number; east: number }, maxTiles = 12): number {
  for (let z = 15; z > 11; z--) if (tilesCovering(box, z).length <= maxTiles) return z;
  return 11;
}

export interface DecodedImage { data: ArrayLike<number>; width: number; height: number; channels: number }

/** Browser decode: the PNG's own bytes (no colour management, no premultiplying, which would bend the heights). */
async function decodeInBrowser(blob: Blob | ArrayBuffer): Promise<DecodedImage> {
  const bmp = await createImageBitmap(blob instanceof Blob ? blob : new Blob([blob], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const ctx = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0); bmp.close();
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height, channels: 4 };
}
async function fetchInBrowser(url: string, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(url, { mode: 'cors', cache: 'force-cache', credentials: 'omit', signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.blob();
}

/**
 * Terrain for a real site: the Terrarium tiles round it, fetched three at a time.
 * Tests pass their own fetch and PNG decoder. Throws when nothing loads.
 */
export async function loadTerrain(site: Pick<SurveySite, 'origin' | 'boundary' | 'home'>, opts: {
  url?: string; signal?: AbortSignal;
  fetchTile?: (url: string, signal?: AbortSignal) => Promise<Blob | ArrayBuffer>;
  decode?: (data: Blob | ArrayBuffer) => Promise<DecodedImage>;
} = {}): Promise<Terrain> {
  const box = terrainBox(site), z = terrainZoom(box), want = tilesCovering(box, z);
  const get = opts.fetchTile ?? fetchInBrowser, decode = opts.decode ?? decodeInBrowser;
  const tiles = new Map<string, Float32Array>(); let size = TILE_PX, lastErr = '';
  const queue = [...want];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      if (opts.signal?.aborted) return;
      try {
        const img = await decode(await get(tileUrl(opts.url ?? TERRARIUM_URL, t.z, t.x, t.y), opts.signal));
        if (img.width !== img.height) throw new Error('not a square tile');
        size = img.width; tiles.set(`${t.x}/${t.y}`, decodeTerrarium(img.data, img.width, img.height, img.channels));
      } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (opts.signal?.aborted) throw new Error('cancelled');
  if (!tiles.size) throw new Error(`no elevation tiles loaded${lastErr ? ` (${lastErr})` : ''}`);
  const t = terrainFromGrid(new ElevationGrid(z, tiles, size), site.origin);
  return tiles.size < want.length ? { ...t, label: `${t.label} of ${want.length}` } : t;
}

// ---- what the ground does -------------------------------------------------------------

/** Lowest and highest ground inside a boundary (and where), sampled on a grid. */
export function terrainRelief(t: Terrain, boundary: Pt[], cells = 40): { min: number; max: number; range: number; minAt: Pt; maxAt: Pt; known: number } {
  const xs = boundary.map(p => p.x), ys = boundary.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const step = Math.max(x1 - x0, y1 - y0) / cells || 1;
  let min = Infinity, max = -Infinity, minAt = boundary[0], maxAt = boundary[0], known = 0;
  const test = (p: Pt) => { const h = t.at(p); if (!Number.isFinite(h)) return; known++; if (h < min) { min = h; minAt = p; } if (h > max) { max = h; maxAt = p; } };
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) { const p = { x, y }; if (inside(p, boundary)) test(p); }
  boundary.forEach(test);
  return known ? { min, max, range: max - min, minAt, maxAt, known } : { min: NaN, max: NaN, range: NaN, minAt, maxAt, known };
}
const inside = (p: Pt, poly: Pt[]) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r; }
  return r;
};

export interface RouteSample { d: number; p: Pt; ground: number; /** Aircraft height above sea level. */ alt: number }
export interface Clearance {
  homeGround: number;
  /** Lowest height above the ground anywhere along the route (straight climbs between waypoints, RTL level at its last height). */
  minAglM: number; minAt: Pt;
  /** The waypoint highest above the ground directly below it. */
  maxWpAglM: number; maxWpAt: Pt;
  /** Highest point above home: what an altitude fence has to allow. */
  maxRelM: number;
  lengthM: number;
  samples: RouteSample[];
  /** Some of the route is off the loaded terrain. */
  missing: boolean;
}

/**
 * What a mission clears, from the items the autopilot will fly: take-off over home, the
 * waypoints (above home, or above the terrain in the terrain frame), and RTL flown level
 * at the last height (ArduPilot keeps its height when above RTL_ALT) back to home.
 */
export function missionClearance(items: SurveyMissionItem[], origin: GeoOrigin, home: Pt, ground: (p: Pt) => number): Clearance {
  const gh = ground(home);
  type Node = { p: Pt; rel: number; terrain: boolean; wp: boolean };
  const nodes: Node[] = [];
  for (const it of items) {
    if (it.command === SURVEY_CMD.NAV_TAKEOFF) nodes.push({ p: home, rel: it.altRelM, terrain: false, wp: true });
    else if (it.command === SURVEY_CMD.NAV_WAYPOINT) {
      const p = fromLatLon(origin, it.lat, it.lon), terrain = it.frame === FRAME_GLOBAL_TERRAIN_ALT;
      nodes.push({ p, rel: terrain ? it.altRelM + ground(p) - gh : it.altRelM, terrain, wp: true });
    } else if (it.command === SURVEY_CMD.NAV_RETURN_TO_LAUNCH && nodes.length) nodes.push({ p: home, rel: nodes[nodes.length - 1].rel, terrain: false, wp: false });
  }
  const lengthM = nodes.reduce((s, n, i) => (i ? s + Math.hypot(n.p.x - nodes[i - 1].p.x, n.p.y - nodes[i - 1].p.y) : 0), 0);
  const step = Math.max(4, lengthM / 3000);
  const out: Clearance = { homeGround: gh, minAglM: Infinity, minAt: home, maxWpAglM: -Infinity, maxWpAt: home, maxRelM: -Infinity, lengthM, samples: [], missing: !Number.isFinite(gh) };
  let d = 0;
  const sample = (p: Pt, rel: number, dd: number) => {
    const g = ground(p);
    if (!Number.isFinite(g)) { out.missing = true; return; }
    const agl = rel + gh - g;
    if (agl < out.minAglM) { out.minAglM = agl; out.minAt = p; }
    out.maxRelM = Math.max(out.maxRelM, rel);
    out.samples.push({ d: dd, p, ground: g, alt: gh + rel });
  };
  nodes.forEach((n, i) => {
    if (n.wp) { const agl = n.rel + gh - ground(n.p); if (agl > out.maxWpAglM) { out.maxWpAglM = agl; out.maxWpAt = n.p; } }
    if (!i) { sample(n.p, n.rel, 0); return; }
    const a = nodes[i - 1], L = Math.hypot(n.p.x - a.p.x, n.p.y - a.p.y), k = Math.max(1, Math.ceil(L / step));
    // In the terrain frame the autopilot holds the height above ground between waypoints, not a straight line.
    const aglA = a.rel + gh - ground(a.p), aglB = n.rel + gh - ground(n.p);
    for (let j = 1; j <= k; j++) {
      const f = j / k, p = { x: a.p.x + (n.p.x - a.p.x) * f, y: a.p.y + (n.p.y - a.p.y) * f };
      const rel = n.terrain ? aglA + (aglB - aglA) * f + ground(p) - gh : a.rel + (n.rel - a.rel) * f;
      sample(p, rel, d + L * f);
    }
    d += L;
  });
  if (!Number.isFinite(out.minAglM)) out.minAglM = NaN;
  if (!Number.isFinite(out.maxWpAglM)) out.maxWpAglM = NaN;
  if (!Number.isFinite(out.maxRelM)) out.maxRelM = NaN;
  return out;
}

/** Lowest height above ground a route may come to: the plan's AGL less twice the following tolerance. */
export const aglFloor = (aglM: number, tolM: number) => Math.round(aglM - 2 * tolM);
