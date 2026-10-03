import { toLatLon, fromLatLon, pointInPolygon, type GeoOrigin, type Pt } from './plan';
import type { Annotation, Surface } from './measure';
import { surfaceAt, SITE_DATUM_M } from './site';
import { openGeoTiff, readRaster, rasterKind, pixelSizeM, applyAffine, invertAffine, blobSource, type Affine, type ByteSource, type GeoInfo, type GeoTiff, type JpegDecoder } from './geotiff';
import type { Crs } from './projection';

/**
 * Processed survey results (a DSM and an orthophoto from any processor) turned
 * into what the results viewer measures and draws, in the survey site's local
 * metres (x east, y south, round the site origin; see plan.ts).
 *
 *   measure  the DSM at up to MEASURE_MAX_PX pixels (full resolution for any
 *            normal site; bigger files read their closest overview), bilinear,
 *            holes filled from the surrounding data and reported per measurement
 *   draw     a mesh of at most MESH_MAX vertices a side and an orthophoto texture
 *            of at most ORTHO_MAX pixels a side, so the 3D view stays responsive
 *
 * Heights stay in the file's own vertical datum (usually above sea level), in metres.
 */

export const MEASURE_MAX_PX = 25e6;
export const MESH_MAX = 768;
export const ORTHO_MAX = 4096;
/** Results further than this from the site are measured round their own centre. */
export const SAME_SITE_M = 5000;

export interface Dem {
  w: number; h: number;
  /** Elevation in metres, holes filled; `valid` marks the pixels that had data. */
  z: Float32Array; valid: Uint8Array;
  crs: Crs; affine: Affine;
  vertical: string;
  fileW: number; fileH: number; fileResM: number; resM: number;
  validPct: number;
}

export interface Ortho { w: number; h: number; rgba: Uint8ClampedArray; crs: Crs; affine: Affine; fileW: number; fileH: number; fileResM: number }

export interface ProcessedResults {
  id: string; name: string;
  origin: GeoOrigin;
  /** The results are not over the survey site: measured round their own centre. */
  offSite: boolean;
  dem: Dem; ortho: Ortho | null;
  /** Local-metre extent of the DSM. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  surface: Surface;
  covered: (x: number, y: number) => boolean;
  /** Display mesh: vertex heights (NaN where the DSM has no data), on a regular local grid. */
  grid: { x0: number; y0: number; cellM: number; cols: number; rows: number; z: Float32Array };
  /** Texture coordinate of the orthophoto at a local point (v up, as three.js textures). */
  orthoUv: ((x: number, y: number) => [number, number]) | null;
}

/** What the results viewer runs on: the demo model or processed results. */
export interface ResultsModel {
  id: string; kind: 'DEMO' | 'PROCESSED'; name: string;
  origin: GeoOrigin;
  surface: Surface;
  /** Added to surface heights to show an elevation. */
  zOffset: number;
  /** What elevations are measured from, for labels and exports. */
  datum: string;
  processed?: ProcessedResults;
}

export function demoModel(origin: GeoOrigin): ResultsModel {
  return { id: 'demo', kind: 'DEMO', name: 'Demo site model', origin, surface: surfaceAt, zOffset: SITE_DATUM_M, datum: `above sea level (site datum ${SITE_DATUM_M} m)` };
}
export function processedModel(p: ProcessedResults): ResultsModel {
  return { id: p.id, kind: 'PROCESSED', name: p.name, origin: p.origin, surface: p.surface, zOffset: 0, datum: p.dem.vertical, processed: p };
}

/** Level-to-a-height bases are stored in surface units: move them when the source's offset changes. */
export function rebaseNotes(notes: Annotation[], dz: number): Annotation[] {
  if (!dz) return notes;
  return notes.map(a => (a.base?.kind === 'DESIGN' && a.base.level !== undefined ? { ...a, base: { ...a.base, level: a.base.level + dz } } : a));
}

/** Share of a measurement's points with no DSM data under them (0–1): a line's samples, or an area's interior. */
export function gapShare(p: ProcessedResults, pts: Pt[], kind: 'LINE' | 'AREA' | 'POINT'): number {
  const s: Pt[] = [];
  if (kind === 'POINT') s.push(pts[0]);
  else if (kind === 'LINE') for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))); for (let k = 0; k < n; k++) s.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }); }
  else {
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const st = Math.max(0.5, Math.max(x1 - x0, y1 - y0) / 60);
    for (let y = y0 + st / 2; y < y1; y += st) for (let x = x0 + st / 2; x < x1; x += st) if (pointInPolygon({ x, y }, pts)) s.push({ x, y });
  }
  return s.length ? s.filter(q => !p.covered(q.x, q.y)).length / s.length : 0;
}

// ---- reading -------------------------------------------------------------------------

export interface LoadOptions { onProgress?: (label: string, f: number) => void; jpeg?: JpegDecoder }

function geoOf(g: GeoTiff, what: string): GeoInfo {
  if (g.geo instanceof Error) throw new Error(`${what}: ${g.geo.message}`);
  return g.geo;
}

/** Output size that keeps the aspect and stays within a pixel budget and a side cap. */
function fitSize(w: number, h: number, maxPx: number, maxSide: number) {
  const k = Math.min(1, Math.sqrt(maxPx / (w * h)), maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export async function loadDem(src: ByteSource, o: LoadOptions = {}): Promise<Dem> {
  const g = await openGeoTiff(src), geo = geoOf(g, 'DSM');
  const { w, h } = fitSize(g.main.width, g.main.height, MEASURE_MAX_PX, 1e9);
  const { data } = await readRaster(g, { width: w, height: h, samples: [0], jpeg: o.jpeg, onProgress: f => o.onProgress?.('Reading the DSM', f) });
  const valid = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    // No-data: the declared value, NaN, and the float extremes GDAL writes when none is declared.
    if (Number.isFinite(v) && v !== geo.nodata && Math.abs(v) < 1e6) { data[i] = v * geo.zToM; valid[i] = 1; n++; }
  }
  if (!n) throw new Error('The DSM has no elevation data (every pixel is no-data).');
  fillHoles(data, valid, w, h);
  const kx = g.main.width / w, ky = g.main.height / h, A = geo.affine;
  const affine: Affine = [A[0] * kx, A[1] * ky, A[2], A[3] * kx, A[4] * ky, A[5]];
  const fileResM = pixelSizeM(g, geo);
  return { w, h, z: data, valid, crs: geo.crs, affine, vertical: geo.vertical, fileW: g.main.width, fileH: g.main.height, fileResM, resM: fileResM * Math.max(kx, ky), validPct: (n / (w * h)) * 100 };
}

export async function loadOrtho(src: ByteSource, o: LoadOptions = {}): Promise<Ortho> {
  const g = await openGeoTiff(src), geo = geoOf(g, 'Orthophoto');
  const m = g.main;
  const { w, h } = fitSize(m.width, m.height, 16e6, ORTHO_MAX);
  // RGBA from RGB(A) or grey(+alpha); a missing alpha reads as opaque.
  const smp = m.samples >= 3 ? [0, 1, 2, m.samples >= 4 ? 3 : 99] : [0, 0, 0, m.samples === 2 ? 1 : 99];
  const { data } = await readRaster(g, { width: w, height: h, samples: smp, u8: true, jpeg: o.jpeg, onProgress: f => o.onProgress?.('Reading the orthophoto', f) });
  if (geo.nodata !== null) for (let i = 0; i < data.length; i += 4) if (data[i] === geo.nodata && data[i + 1] === geo.nodata && data[i + 2] === geo.nodata) data[i + 3] = 0;
  return { w, h, rgba: data, crs: geo.crs, affine: geo.affine, fileW: m.width, fileH: m.height, fileResM: pixelSizeM(g, geo) };
}

/** Sort picked GeoTIFFs into the DSM and the orthophoto (a DTM is used only if no DSM is given). */
export async function classifyFiles(files: Blob[]): Promise<{ dsm?: Blob; ortho?: Blob; problems: string[] }> {
  let dsm: Blob | undefined, dtm: Blob | undefined, ortho: Blob | undefined; const problems: string[] = [];
  for (const f of files) {
    const name = (f as File).name ?? 'file';
    try {
      const g = await openGeoTiff(blobSource(f)), k = rasterKind(g.main);
      if (k === 'DSM') { if (/dtm/i.test(name)) dtm = f; else dsm = f; }
      else if (k === 'ORTHO') ortho = f;
      else problems.push(`${name}: neither an elevation model nor an 8-bit colour image.`);
    } catch (e) { problems.push(`${name}: ${(e as Error).message}`); }
  }
  return { dsm: dsm ?? dtm, ortho, problems };
}

// ---- building ---------------------------------------------------------------------------

/**
 * Push-pull hole filling: average the data down a pyramid, then fill every hole
 * from the level above. Measurements that touch filled pixels say so (gapShare).
 */
export function fillHoles(z: Float32Array, valid: Uint8Array, w: number, h: number) {
  const levels: { w: number; h: number; v: Float32Array; ok: Uint8Array }[] = [{ w, h, v: z, ok: valid }];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const L = levels[levels.length - 1], nw = Math.ceil(L.w / 2), nh = Math.ceil(L.h / 2);
    const v = new Float32Array(nw * nh), ok = new Uint8Array(nw * nh);
    for (let r = 0; r < nh; r++) for (let c = 0; c < nw; c++) {
      let s = 0, k = 0;
      for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
        const rr = 2 * r + dr, cc = 2 * c + dc; if (rr >= L.h || cc >= L.w) continue;
        const i = rr * L.w + cc; if (L.ok[i]) { s += L.v[i]; k++; }
      }
      if (k) { v[r * nw + c] = s / k; ok[r * nw + c] = 1; }
    }
    levels.push({ w: nw, h: nh, v, ok });
  }
  for (let li = levels.length - 2; li >= 0; li--) {
    const L = levels[li], U = levels[li + 1];
    for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) {
      const i = r * L.w + c; if (L.ok[i]) continue;
      L.v[i] = U.v[(r >> 1) * U.w + (c >> 1)];
      if (li > 0) L.ok[i] = 1; // level 0 keeps its mask: that is the data coverage
    }
  }
}

/** A smooth map over a box, tabulated on a grid and bilinearly interpolated (exact outside the box). */
function tabulate(b: { x0: number; y0: number; x1: number; y1: number }, fn: (x: number, y: number) => [number, number], n = 96) {
  const sx = (b.x1 - b.x0) / n, sy = (b.y1 - b.y0) / n, U = new Float64Array((n + 1) * (n + 1)), V = new Float64Array(U.length);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const [u, v] = fn(b.x0 + i * sx, b.y0 + j * sy); U[j * (n + 1) + i] = u; V[j * (n + 1) + i] = v; }
  return (x: number, y: number): [number, number] => {
    const fi = (x - b.x0) / sx, fj = (y - b.y0) / sy;
    if (!(fi >= 0 && fj >= 0 && fi <= n && fj <= n)) return fn(x, y);
    const i = Math.min(n - 1, Math.floor(fi)), j = Math.min(n - 1, Math.floor(fj)), tx = fi - i, ty = fj - j, k = j * (n + 1) + i;
    const lerp = (A: Float64Array) => (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + n + 1] * (1 - tx) + A[k + n + 2] * tx) * ty;
    return [lerp(U), lerp(V)];
  };
}

export function buildProcessed(dem: Dem, ortho: Ortho | null, siteOrigin: GeoOrigin, name: string): ProcessedResults {
  // Where the DSM is: its outline (corners and edge points) in WGS84.
  const ring: { lat: number; lon: number }[] = [];
  for (let k = 0; k < 16; k++) {
    const t = k / 4, side = Math.floor(t), f = t - side;
    const [c, r] = side === 0 ? [f * dem.w, 0] : side === 1 ? [dem.w, f * dem.h] : side === 2 ? [(1 - f) * dem.w, dem.h] : [0, (1 - f) * dem.h];
    const [lon, lat] = dem.crs.inverse(...applyAffine(dem.affine, c, r)); ring.push({ lat, lon });
  }
  const centre = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
  const c0 = fromLatLon(siteOrigin, centre.lat, centre.lon);
  const offSite = Math.hypot(c0.x, c0.y) > SAME_SITE_M;
  const origin = offSite ? centre : siteOrigin;
  const loc = ring.map(p => fromLatLon(origin, p.lat, p.lon));
  const bounds = { x0: Math.min(...loc.map(p => p.x)), y0: Math.min(...loc.map(p => p.y)), x1: Math.max(...loc.map(p => p.x)), y1: Math.max(...loc.map(p => p.y)) };

  // Local metres → DSM pixel (area convention), through WGS84 and the file's projection.
  const inv = invertAffine(dem.affine);
  const toPix = tabulate(bounds, (x, y) => { const ll = toLatLon(origin, { x, y }); const [X, Y] = dem.crs.forward(ll.lon, ll.lat); return applyAffine(inv, X, Y); });
  const { w, h, z, valid } = dem;
  const surface: Surface = (x, y) => {
    const [u, v] = toPix(x, y);
    const px = Math.max(0, Math.min(w - 1, u - 0.5)), py = Math.max(0, Math.min(h - 1, v - 0.5));
    const i = Math.min(w - 2, Math.floor(px)), j = Math.min(h - 2, Math.floor(py));
    if (w < 2 || h < 2) return z[0];
    const tx = px - i, ty = py - j, k = j * w + i;
    return (z[k] * (1 - tx) + z[k + 1] * tx) * (1 - ty) + (z[k + w] * (1 - tx) + z[k + w + 1] * tx) * ty;
  };
  const covered = (x: number, y: number) => {
    const [u, v] = toPix(x, y), c = Math.floor(u), r = Math.floor(v);
    return c >= 0 && r >= 0 && c < w && r < h && valid[r * w + c] === 1;
  };

  // Display mesh: no finer than the DSM, no more than MESH_MAX vertices a side.
  const W = bounds.x1 - bounds.x0, D = bounds.y1 - bounds.y0;
  const cellM = Math.max(dem.resM, Math.max(W, D) / (MESH_MAX - 1));
  const cols = Math.max(2, Math.ceil(W / cellM) + 1), rows = Math.max(2, Math.ceil(D / cellM) + 1);
  const gz = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = bounds.x0 + c * cellM, y = bounds.y0 + r * cellM;
    gz[r * cols + c] = covered(x, y) ? surface(x, y) : NaN;
  }

  let orthoUv: ProcessedResults['orthoUv'] = null;
  if (ortho) {
    const oi = invertAffine(ortho.affine);
    orthoUv = tabulate(bounds, (x, y) => {
      const ll = toLatLon(origin, { x, y }); const [c, r] = applyAffine(oi, ...ortho.crs.forward(ll.lon, ll.lat));
      return [c / ortho.fileW, 1 - r / ortho.fileH];
    });
  }
  return {
    id: `p-${name}-${dem.fileW}x${dem.fileH}-${ortho ? ortho.fileW : 0}-${Date.now().toString(36)}`, name, origin, offSite, dem, ortho, bounds,
    surface, covered, grid: { x0: bounds.x0, y0: bounds.y0, cellM, cols, rows, z: gz }, orthoUv,
  };
}

/** Read the DSM (and orthophoto, if given) and build the results, in the site's frame. */
export async function loadProcessed(files: { dsm: ByteSource; ortho?: ByteSource | null; name: string }, siteOrigin: GeoOrigin, o: LoadOptions = {}): Promise<ProcessedResults> {
  const dem = await loadDem(files.dsm, o);
  const ortho = files.ortho ? await loadOrtho(files.ortho, o) : null;
  o.onProgress?.('Building the model', 1);
  return buildProcessed(dem, ortho, siteOrigin, files.name);
}
