import { fromLatLon, type GeoOrigin } from './plan';

/**
 * Map tiles under the survey plan: Web Mercator (EPSG:3857) tile maths, the
 * basemap providers, and a polite tile loader.
 *
 * Tiles are addressed the slippy-map way: at zoom z the world is 2^z × 2^z tiles
 * of 256 px, x from the antimeridian eastwards, y from 85.05° N southwards. The
 * survey works in local metres (x east, y south) around the site's origin; a
 * tile's corners go through the same fromLatLon as everything else, so tiles land
 * exactly where the boundary and the flight lines are.
 *
 * Pure maths up top (scripts/tiles.test.mjs); the loader and settings store below
 * touch fetch, createImageBitmap and localStorage only when used.
 */

export const TILE_PX = 256;
export const MAX_LAT = 85.0511287798;
/** Equatorial circumference / 256: metres per pixel at zoom 0 on the equator. */
const M_PER_PX_Z0 = 156543.03392804097;

const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));

/** Global pixel position at zoom z (tile x = floor(px / 256)). */
export function lonLatToPixel(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = TILE_PX * 2 ** z, s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

export function pixelToLonLat(x: number, y: number, z: number): { lat: number; lon: number } {
  const n = TILE_PX * 2 ** z;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, lon: (x / n) * 360 - 180 };
}

/** The tile holding a point, and where in it (0–256). */
export function tileAt(lat: number, lon: number, z: number): { x: number; y: number; z: number; px: number; py: number } {
  const p = lonLatToPixel(lat, lon, z), x = Math.floor(p.x / TILE_PX), y = Math.floor(p.y / TILE_PX);
  return { x, y, z, px: p.x - x * TILE_PX, py: p.y - y * TILE_PX };
}

/** A tile's edges in degrees. */
export function tileBounds(x: number, y: number, z: number): { north: number; south: number; west: number; east: number } {
  const nw = pixelToLonLat(x * TILE_PX, y * TILE_PX, z), se = pixelToLonLat((x + 1) * TILE_PX, (y + 1) * TILE_PX, z);
  return { north: nw.lat, south: se.lat, west: nw.lon, east: se.lon };
}

/** Ground metres per tile pixel at a latitude. */
export const groundResolution = (lat: number, z: number) => (M_PER_PX_Z0 * Math.cos((clampLat(lat) * Math.PI) / 180)) / 2 ** z;

/** The zoom whose tile pixels come closest to `pxPerM` screen pixels per metre, within the provider's range. */
export function zoomForScale(lat: number, pxPerM: number, maxZoom = 19, minZoom = 1): number {
  const z = Math.round(Math.log2(M_PER_PX_Z0 * Math.cos((clampLat(lat) * Math.PI) / 180) * pxPerM));
  return Math.max(minZoom, Math.min(maxZoom, z));
}

/** Every tile touching a lat/lon box (x wrapped round the antimeridian, y clamped to the world). */
export function tilesCovering(box: { north: number; south: number; west: number; east: number }, z: number): { x: number; y: number; z: number }[] {
  const n = 2 ** z, a = tileAt(box.north, box.west, z), b = tileAt(box.south, box.east, z);
  const out: { x: number; y: number; z: number }[] = [];
  const y0 = Math.max(0, a.y), y1 = Math.min(n - 1, b.y);
  for (let y = y0; y <= y1; y++) for (let x = a.x; x <= b.x; x++) out.push({ x: ((x % n) + n) % n, y, z });
  return out;
}

/** A tile's rectangle in the site's local metres (x east, y south): north-west and south-east corners. */
export function tileRectLocal(origin: GeoOrigin, x: number, y: number, z: number): { x0: number; y0: number; x1: number; y1: number } {
  const b = tileBounds(x, y, z), nw = fromLatLon(origin, b.north, b.west), se = fromLatLon(origin, b.south, b.east);
  return { x0: nw.x, y0: nw.y, x1: se.x, y1: se.y };
}

// ---- providers ------------------------------------------------------------------------

export type BasemapId = 'OSM' | 'MAPTILER_SAT' | 'MAPBOX_SAT' | 'CUSTOM';
export interface BasemapProvider { id: BasemapId; label: string; url: string; maxZoom: number; attribution: string; attributionUrl?: string; key?: 'maptiler' | 'mapbox' }

export const BASEMAPS: Record<Exclude<BasemapId, 'CUSTOM'>, BasemapProvider> = {
  OSM: { id: 'OSM', label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright' },
  MAPTILER_SAT: { id: 'MAPTILER_SAT', label: 'MapTiler satellite', url: 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key={key}', maxZoom: 20, attribution: '© MapTiler © OpenStreetMap contributors', attributionUrl: 'https://www.maptiler.com/copyright/', key: 'maptiler' },
  MAPBOX_SAT: { id: 'MAPBOX_SAT', label: 'Mapbox satellite', url: 'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token={key}', maxZoom: 22, attribution: '© Mapbox © OpenStreetMap contributors © Maxar', attributionUrl: 'https://www.mapbox.com/about/maps/', key: 'mapbox' },
};

/** Fill a tile template: {z} {x} {y}, {-y} (TMS rows), {s} (a/b/c subdomain), {key}. */
export function tileUrl(template: string, z: number, x: number, y: number, key = ''): string {
  return template.replace(/\{z\}/g, String(z)).replace(/\{x\}/g, String(x)).replace(/\{y\}/g, String(y))
    .replace(/\{-y\}/g, String(2 ** z - 1 - y)).replace(/\{s\}/g, 'abc'[(x + y) % 3]).replace(/\{key\}/g, encodeURIComponent(key));
}

// ---- settings (shared by the map and the Site panel, kept in this browser) ------------------

export interface BasemapSettings {
  on: boolean; provider: BasemapId; opacity: number;
  /** Keys the owner entered here; the build's VITE_ keys are used when these are empty. */
  maptilerKey: string; mapboxToken: string;
  customUrl: string; customAttribution: string; customMaxZoom: number;
}
const DEFAULTS: BasemapSettings = { on: true, provider: 'OSM', opacity: 0.85, maptilerKey: '', mapboxToken: '', customUrl: '', customAttribution: '', customMaxZoom: 19 };
const STORE_KEY = 'a1-survey-basemap';
const env = (k: string): string => { try { return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[k] ?? '').trim(); } catch { return ''; } };

let settings: BasemapSettings | null = null;
const listeners = new Set<() => void>();
export function basemapSettings(): BasemapSettings {
  if (!settings) {
    let saved: Partial<BasemapSettings> = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') ?? {}; } catch { /* no storage */ }
    settings = { ...DEFAULTS, ...saved };
  }
  return settings;
}
export function setBasemap(patch: Partial<BasemapSettings>) {
  settings = { ...basemapSettings(), ...patch };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* no storage */ }
  listeners.forEach(f => f());
}
export function subscribeBasemap(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** The key a provider will use: the one entered here, else the build's. */
export function providerKey(s: BasemapSettings, p: BasemapProvider): string {
  return p.key === 'maptiler' ? s.maptilerKey || env('VITE_MAPTILER_KEY') : p.key === 'mapbox' ? s.mapboxToken || env('VITE_MAPBOX_TOKEN') : '';
}
/** The active provider, or why there is none (a satellite preset without a key, an empty custom template). */
export function activeBasemap(s: BasemapSettings): { provider: BasemapProvider; key: string } | { provider: null; reason: string } {
  if (s.provider === 'CUSTOM') {
    if (!/\{z\}/.test(s.customUrl) || !/\{x\}/.test(s.customUrl) || !/\{-?y\}/.test(s.customUrl)) return { provider: null, reason: 'Custom template needs {z}, {x} and {y}' };
    return { provider: { id: 'CUSTOM', label: 'Custom', url: s.customUrl.trim(), maxZoom: s.customMaxZoom || 19, attribution: s.customAttribution.trim() || 'Custom tiles' }, key: '' };
  }
  const p = BASEMAPS[s.provider] ?? BASEMAPS.OSM, key = providerKey(s, p);
  if (p.key && !key) return { provider: null, reason: `${p.label} needs a ${p.key === 'mapbox' ? 'token' : 'key'}` };
  return { provider: p, key };
}

// ---- loading --------------------------------------------------------------------------

/**
 * Fetches tiles as blobs and decodes them to ImageBitmaps for the canvas. Polite to
 * volunteer-run servers (the OpenStreetMap tile policy): two requests at a time, the
 * browser's HTTP cache first, a session budget per server, a memory cache so a
 * redraw never refetches, and failed tiles left alone for a while.
 */
export class TileLoader {
  private cache = new Map<string, ImageBitmap>();
  private failed = new Map<string, number>();
  private pending = new Set<string>();
  private queue: string[] = [];
  private active = 0;
  private spent = new Map<string, number>();
  /** Per server: failures in a row, and a pause after too many (an unreachable or refusing server is left alone). */
  private down = new Map<string, { fails: number; until: number }>();
  stats = { loaded: 0, failed: 0, refused: 0 };
  constructor(private maxConcurrent = 2, private budgetPerHost = 400, private maxCached = 256, private retryMs = 30000) {}

  /** The tile if it is here; otherwise it is queued (once) and null comes back. */
  get(url: string): ImageBitmap | null {
    const hit = this.cache.get(url);
    if (hit) { this.cache.delete(url); this.cache.set(url, hit); return hit; } // most recently used last
    this.request(url);
    return null;
  }
  /** Only what is already here (no fetch): for drawing a coarser tile under a missing one. */
  peek(url: string): ImageBitmap | null { return this.cache.get(url) ?? null; }
  isFailed(url: string) { const t = this.failed.get(url); return t !== undefined && Date.now() - t < this.retryMs; }
  budgetLeft(url: string) { const h = host(url); return this.budgetPerHost - (this.spent.get(h) ?? 0); }

  private request(url: string) {
    if (this.pending.has(url) || this.isFailed(url)) return;
    const h = host(url), used = this.spent.get(h) ?? 0;
    if (used >= this.budgetPerHost || (this.down.get(h)?.until ?? 0) > Date.now()) { this.stats.refused++; return; }
    this.pending.add(url); this.queue.push(url); this.pump();
  }
  private pump() {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const url = this.queue.pop()!; // newest first: the view the operator is looking at now
      const h = host(url); this.spent.set(h, (this.spent.get(h) ?? 0) + 1);
      this.active++;
      fetch(url, { mode: 'cors', cache: 'force-cache', credentials: 'omit' })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
        .then(b => createImageBitmap(b))
        .then(bmp => {
          this.cache.set(url, bmp); this.stats.loaded++; this.failed.delete(url); this.down.delete(h);
          while (this.cache.size > this.maxCached) { const [k, v] = this.cache.entries().next().value!; v.close(); this.cache.delete(k); }
        })
        .catch(() => {
          this.failed.set(url, Date.now()); this.stats.failed++;
          const d = this.down.get(h) ?? { fails: 0, until: 0 }; d.fails++;
          if (d.fails >= 6) { d.until = Date.now() + 2 * this.retryMs; d.fails = 0; this.queue = this.queue.filter(u => { const keep = host(u) !== h; if (!keep) this.pending.delete(u); return keep; }); }
          this.down.set(h, d);
        })
        .finally(() => { this.active--; this.pending.delete(url); this.pump(); });
    }
  }
  /** Drop queued requests the view no longer needs. */
  prune(keep: Set<string>) { this.queue = this.queue.filter(u => { const k = keep.has(u); if (!k) this.pending.delete(u); return k; }); }
}
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** One loader for the page: tiles survive the map remounting (a new site, the plan view swapping size). */
export const basemapTiles = new TileLoader();
