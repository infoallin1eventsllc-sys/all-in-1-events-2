import { crsFromEpsg, type Crs } from './projection';

/**
 * A GeoTIFF reader for processed survey results: DSMs and orthophotos from
 * OpenDroneMap / WebODM, Pix4D, DroneDeploy and Metashape.
 *
 * Reads lazily from a Blob (a picked file or a download), one block row of
 * tiles or strips at a time, so a 20k × 20k orthophoto never sits in memory
 * whole: it reads the smallest internal overview that is still big enough
 * (COGs and ODM's --cog outputs carry them), otherwise decimates on the fly.
 *
 *   TIFF and BigTIFF, either byte order, strips or tiles, chunky or planar
 *   compression none, LZW, Deflate, PackBits, and JPEG (browser decoder)
 *   predictor horizontal (2) and floating point (3)
 *   samples 8/16/32-bit integer, 32/64-bit float
 *   georeferencing ModelTiepoint + ModelPixelScale, or ModelTransformation;
 *   PixelIsArea / PixelIsPoint; GeoKeys for EPSG:4326, UTM 326zz / 327zz, 3857
 *   (and GDAL's user-defined "WGS 84 + UTM zone" key form); vertical units and datum
 *   no-data from GDAL_NODATA, plus NaN
 */

export interface ByteSource { size: number; read(offset: number, length: number): Promise<Uint8Array> }
export const blobSource = (b: Blob): ByteSource => ({ size: b.size, read: async (o, l) => new Uint8Array(await b.slice(o, o + l).arrayBuffer()) });
export const bufferSource = (u: ArrayBuffer | Uint8Array): ByteSource => {
  const a = u instanceof Uint8Array ? u : new Uint8Array(u);
  return { size: a.length, read: async (o, l) => a.subarray(o, Math.min(a.length, o + l)) };
};

/** Pixel (area convention: pixel (c, r) spans [c, c+1) × [r, r+1)) to CRS: X = a·c + b·r + c0, Y = d·c + e·r + f0. */
export type Affine = [number, number, number, number, number, number];
export const applyAffine = (t: Affine, c: number, r: number): [number, number] => [t[0] * c + t[1] * r + t[2], t[3] * c + t[4] * r + t[5]];
export function invertAffine(t: Affine): Affine {
  const [a, b, c, d, e, f] = t, det = a * e - b * d;
  if (!det) throw new Error('The georeferencing is degenerate (zero pixel size).');
  return [e / det, -b / det, (b * f - e * c) / det, -d / det, a / det, (d * c - a * f) / det];
}

export interface GeoInfo {
  crs: Crs;
  /** Pixel → CRS for the full-resolution image. */
  affine: Affine;
  /** Height units → metres, and what the heights are measured from. */
  zToM: number;
  vertical: string;
  nodata: number | null;
}

export interface TiffImage {
  width: number; height: number;
  samples: number; bits: number; format: 1 | 2 | 3; // uint, int, float
  photometric: number; planar: number; compression: number; predictor: number;
  tileW: number; tileH: number; tiled: boolean;
  offsets: number[]; counts: number[];
  jpegTables?: Uint8Array;
  extraSamples: number[];
  /** Reduced-resolution copy of the main image (an overview). */
  overview: boolean; mask: boolean;
  tags: Map<number, number[] | string>;
}

export interface GeoTiff { src: ByteSource; images: TiffImage[]; main: TiffImage; geo: GeoInfo | Error; little: boolean }

// ---- structure -------------------------------------------------------------------

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

export async function openGeoTiff(src: ByteSource): Promise<GeoTiff> {
  const head = await src.read(0, 16);
  const little = head[0] === 0x49 && head[1] === 0x49;
  if (!little && !(head[0] === 0x4d && head[1] === 0x4d)) throw new Error('Not a TIFF file.');
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const magic = hv.getUint16(2, little), big = magic === 43;
  if (magic !== 42 && !big) throw new Error('Not a TIFF file.');
  const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, little));
  let ifd = big ? u64(hv, 8) : hv.getUint32(4, little);
  const images: TiffImage[] = [];
  for (let guard = 0; ifd && guard < 64; guard++) {
    const nb = await src.read(ifd, big ? 8 : 2);
    const nv = new DataView(nb.buffer, nb.byteOffset, nb.byteLength);
    const count = big ? u64(nv, 0) : nv.getUint16(0, little), es = big ? 20 : 12, base = ifd + (big ? 8 : 2);
    const eb = await src.read(base, count * es + (big ? 8 : 4));
    const ev = new DataView(eb.buffer, eb.byteOffset, eb.byteLength);
    const tags = new Map<number, number[] | string>();
    for (let i = 0; i < count; i++) {
      const o = i * es, tag = ev.getUint16(o, little), type = ev.getUint16(o + 2, little);
      const n = big ? u64(ev, o + 4) : ev.getUint32(o + 4, little), sz = (TYPE_SIZE[type] ?? 1) * n;
      let data: DataView;
      if (sz <= (big ? 8 : 4)) data = new DataView(eb.buffer, eb.byteOffset + o + (big ? 12 : 8), sz);
      else { const at = big ? u64(ev, o + 12) : ev.getUint32(o + 8, little); const b = await src.read(at, sz); data = new DataView(b.buffer, b.byteOffset, b.byteLength); }
      tags.set(tag, readValues(data, type, n, little));
    }
    images.push(toImage(tags));
    ifd = big ? u64(ev, count * es) : ev.getUint32(count * es, little);
  }
  const main = images.find(i => !i.overview && !i.mask);
  if (!main) throw new Error('The TIFF has no full-resolution image.');
  let geo: GeoInfo | Error;
  try { geo = geoInfo(main); } catch (e) { geo = e as Error; }
  return { src, images, main, geo, little };
}

function readValues(v: DataView, type: number, n: number, le: boolean): number[] | string {
  if (type === 2) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(i)); return s; }
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    switch (type) {
      case 1: case 7: out[i] = v.getUint8(i); break;
      case 6: out[i] = v.getInt8(i); break;
      case 3: out[i] = v.getUint16(i * 2, le); break;
      case 8: out[i] = v.getInt16(i * 2, le); break;
      case 4: out[i] = v.getUint32(i * 4, le); break;
      case 9: out[i] = v.getInt32(i * 4, le); break;
      case 5: out[i] = v.getUint32(i * 8, le) / v.getUint32(i * 8 + 4, le); break;
      case 10: out[i] = v.getInt32(i * 8, le) / v.getInt32(i * 8 + 4, le); break;
      case 11: out[i] = v.getFloat32(i * 4, le); break;
      case 12: out[i] = v.getFloat64(i * 8, le); break;
      case 16: case 18: out[i] = Number(v.getBigUint64(i * 8, le)); break;
      case 17: out[i] = Number(v.getBigInt64(i * 8, le)); break;
      default: out[i] = 0;
    }
  }
  return out;
}

function toImage(tags: Map<number, number[] | string>): TiffImage {
  const num = (t: number, d = 0) => { const v = tags.get(t); return Array.isArray(v) ? v[0] : d; };
  const arr = (t: number) => { const v = tags.get(t); return Array.isArray(v) ? v : []; };
  const width = num(256), height = num(257), tiled = tags.has(322);
  const subfile = num(254);
  const jt = arr(347);
  return {
    width, height, samples: num(277, 1), bits: num(258, 1), format: (num(339, 1) as 1 | 2 | 3),
    photometric: num(262, 1), planar: num(284, 1), compression: num(259, 1), predictor: num(317, 1),
    tiled, tileW: tiled ? num(322) : width, tileH: tiled ? num(323) : Math.min(height, num(278, height) || height),
    offsets: arr(tiled ? 324 : 273), counts: arr(tiled ? 325 : 279),
    jpegTables: jt.length ? Uint8Array.from(jt) : undefined, extraSamples: arr(338),
    overview: (subfile & 1) === 1, mask: (subfile & 4) === 4, tags,
  };
}

// ---- georeferencing ---------------------------------------------------------------

const VERTICAL: Record<number, string> = { 5773: 'EGM96 geoid (≈ mean sea level)', 3855: 'EGM2008 geoid (≈ mean sea level)', 5703: 'NAVD88', 5714: 'mean sea level', 4979: 'WGS 84 ellipsoid', 4326: 'WGS 84 ellipsoid' };
const UNIT_M: Record<number, number> = { 9001: 1, 9002: 0.3048, 9003: 1200 / 3937 };

export function geoInfo(img: TiffImage): GeoInfo {
  const t = img.tags;
  const dir = (t.get(34735) as number[] | undefined) ?? [];
  const dbl = (t.get(34736) as number[] | undefined) ?? [];
  const keys = new Map<number, number>();
  for (let i = 4; i + 3 < dir.length && i < 4 + dir[3] * 4; i += 4) {
    const [id, loc, , off] = dir.slice(i, i + 4);
    keys.set(id, loc === 0 ? off : loc === 34736 ? dbl[off] : NaN);
  }
  if (!dir.length && !t.has(33922) && !t.has(34264)) throw new Error('This TIFF has no georeferencing. Export a GeoTIFF from the processing software.');
  // GTModelType 1 projected, 2 geographic. ProjectedCSType 3072, GeographicType 2048, ProjectionGeoKey 3074.
  const model = keys.get(1024), pcs = keys.get(3072), gcs = keys.get(2048), proj = keys.get(3074);
  let epsg = 0;
  if (model === 2) epsg = gcs && gcs !== 32767 ? gcs : 0;
  else if (pcs && pcs !== 32767) epsg = pcs;
  else if (proj && (gcs === 4326 || gcs === undefined)) {
    // User-defined PCS on WGS 84 with a UTM projection code (16001–16060 north, 16101–16160 south).
    if (proj > 16000 && proj <= 16060) epsg = 32600 + (proj - 16000);
    else if (proj > 16100 && proj <= 16160) epsg = 32700 + (proj - 16100);
  }
  if (!epsg) throw new Error(`The file's coordinate system is ${model === 2 ? 'a geographic system' : 'a projected system'} without a supported EPSG code${pcs === 32767 || gcs === 32767 ? ' (user-defined)' : ''}. Export in WGS 84, UTM or Web Mercator.`);
  const crs = crsFromEpsg(epsg);
  if (crs instanceof Error) throw crs;
  const linear = keys.get(3076);
  if (model !== 2 && linear && linear !== 9001) throw new Error(`The file's horizontal units are not metres (unit code ${linear}). Export in metres.`);

  let affine: Affine;
  const mt = t.get(34264) as number[] | undefined, tp = t.get(33922) as number[] | undefined, sc = t.get(33550) as number[] | undefined;
  if (mt && mt.length >= 16) affine = [mt[0], mt[1], mt[3], mt[4], mt[5], mt[7]];
  else if (tp && tp.length >= 6 && sc && sc.length >= 2) {
    const [I, J, , X, Y] = tp;
    affine = [sc[0], 0, X - I * sc[0], 0, -sc[1], Y + J * sc[1]];
  } else throw new Error('The GeoTIFF has GeoKeys but no tie point or transformation.');
  // PixelIsPoint (GTRasterType 2): the tie point is a pixel's centre; shift to the area convention.
  if (keys.get(1025) === 2) affine = [affine[0], affine[1], affine[2] - 0.5 * (affine[0] + affine[1]), affine[3], affine[4], affine[5] - 0.5 * (affine[3] + affine[4])];

  const vcs = keys.get(4096), vu = keys.get(4099);
  const zToM = vu && UNIT_M[vu] ? UNIT_M[vu] : 1;
  const vertical = vcs && vcs !== 32767 ? VERTICAL[vcs] ?? `vertical datum EPSG:${vcs}` : 'vertical datum not stated in the file (processors write heights above sea level or the ellipsoid)';
  const nd = t.get(42113);
  const nodata = typeof nd === 'string' && nd.replace(/\0/g, '').trim() !== '' ? parseFloat(nd) : null;
  return { crs, affine, zToM, vertical, nodata: nodata !== null && Number.isFinite(nodata) ? nodata : null };
}

// ---- decoding ---------------------------------------------------------------------

export type JpegDecoder = (jpeg: Uint8Array, w: number, h: number) => Promise<Uint8ClampedArray>;
/** The browser's JPEG decoder: RGBA pixels of one tile. */
export const browserJpeg: JpegDecoder = async (jpeg, w, h) => {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new Error('JPEG-compressed GeoTIFFs need a browser to decode.');
  const bmp = await createImageBitmap(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0); bmp.close();
  return g.getImageData(0, 0, w, h).data;
};

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** TIFF LZW (MSB-first codes, 9–12 bits, early change). */
export function lzwDecode(input: Uint8Array, expected = 0): Uint8Array {
  let out = new Uint8Array(Math.max(expected, input.length * 3));
  let op = 0;
  const put = (b: number) => { if (op >= out.length) { const n = new Uint8Array(out.length * 2); n.set(out); out = n; } out[op++] = b; };
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; len[i] = 1; }
  let next = 258, width = 9, bitPos = 0, old = -1;
  const stack = new Uint8Array(4096);
  const emit = (code: number) => { let k = len[code], c = code; for (let i = k - 1; i >= 0; i--) { stack[i] = suffix[c]; c = prefix[c]; } for (let i = 0; i < k; i++) put(stack[i]); };
  while (bitPos + width <= input.length * 8) {
    let code = 0;
    for (let i = 0; i < width; i++) { const bp = bitPos + i; code = (code << 1) | ((input[bp >> 3] >> (7 - (bp & 7))) & 1); }
    bitPos += width;
    if (code === 257) break;
    if (code === 256) { next = 258; width = 9; old = -1; continue; }
    if (old === -1) { emit(code); old = code; continue; }
    if (code < next) {
      emit(code);
      if (next < 4096) { prefix[next] = old; suffix[next] = first[code]; first[next] = first[old]; len[next] = len[old] + 1; next++; }
    } else {
      if (next < 4096) { prefix[next] = old; suffix[next] = first[old]; first[next] = first[old]; len[next] = len[old] + 1; next++; }
      emit(code);
    }
    old = code;
    if (next + 1 >= 1 << width && width < 12) width++;
  }
  return out.subarray(0, op);
}

function packbits(input: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected); let i = 0, o = 0;
  while (i < input.length && o < expected) {
    const n = (input[i++] << 24) >> 24;
    if (n >= 0) { for (let k = 0; k <= n; k++) out[o++] = input[i++]; }
    else if (n !== -128) { const b = input[i++]; for (let k = 0; k < 1 - n; k++) out[o++] = b; }
  }
  return out;
}

/** One block (tile or strip) as numbers, sample-interleaved: w × h × spp. */
async function decodeBlock(g: GeoTiff, img: TiffImage, index: number, bw: number, bh: number, spp: number, jpeg: JpegDecoder): Promise<ArrayLike<number>> {
  const off = img.offsets[index], cnt = img.counts[index], bps = img.bits / 8;
  if (!cnt) return new Float32Array(bw * bh * spp).fill(NaN); // sparse (empty) block
  let raw = await g.src.read(off, cnt);
  if (img.compression === 7 || img.compression === 6) {
    // JPEG: splice the shared tables in front of the block's own stream.
    let jpg = raw;
    if (img.jpegTables && img.jpegTables.length > 4) { const t = img.jpegTables; jpg = new Uint8Array(t.length - 2 + raw.length - 2); jpg.set(t.subarray(0, t.length - 2)); jpg.set(raw.subarray(2), t.length - 2); }
    const rgba = await jpeg(jpg, bw, bh);
    if (spp === 4) return rgba;
    const out = new Uint8Array(bw * bh * spp);
    for (let i = 0; i < bw * bh; i++) for (let s = 0; s < spp; s++) out[i * spp + s] = rgba[i * 4 + s];
    return out;
  }
  const expected = bw * bh * spp * bps;
  if (img.compression === 5) raw = lzwDecode(raw, expected);
  else if (img.compression === 8 || img.compression === 32946) raw = await inflate(raw);
  else if (img.compression === 32773) raw = packbits(raw, expected);
  else if (img.compression !== 1) throw new Error(`TIFF compression ${img.compression} is not supported (use Deflate, LZW, JPEG or none).`);
  else raw = raw.slice(); // predictors undo in place: never on the source's own bytes
  if (raw.length < expected) { const p = new Uint8Array(expected); p.set(raw); raw = p; }
  const n = bw * bh * spp, fmt = img.format, le = g.little;
  if (img.predictor === 3) {
    // Floating-point predictor: bytes differenced along the row, then split into planes, most significant first.
    const rowB = bw * spp * bps, tmp = new Uint8Array(rowB), dv = new DataView(new ArrayBuffer(bps));
    const out = new Float64Array(n);
    for (let r = 0; r < bh; r++) {
      const row = raw.subarray(r * rowB, (r + 1) * rowB);
      for (let i = spp; i < rowB; i++) row[i] = (row[i] + row[i - spp]) & 255;
      tmp.set(row);
      const wc = bw * spp;
      for (let k = 0; k < wc; k++) {
        for (let b = 0; b < bps; b++) dv.setUint8(b, tmp[b * wc + k]);
        out[r * wc + k] = bps === 4 ? dv.getFloat32(0, false) : dv.getFloat64(0, false);
      }
    }
    return out;
  }
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let out: Float64Array | Uint8Array;
  if (bps === 1 && fmt !== 2) out = raw.subarray(0, n);
  else {
    out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * bps;
      out[i] = fmt === 3 ? (bps === 4 ? dv.getFloat32(o, le) : dv.getFloat64(o, le))
        : fmt === 2 ? (bps === 1 ? dv.getInt8(o) : bps === 2 ? dv.getInt16(o, le) : dv.getInt32(o, le))
        : (bps === 2 ? dv.getUint16(o, le) : dv.getUint32(o, le));
    }
  }
  if (img.predictor === 2) {
    const mod = fmt === 3 ? 0 : 2 ** img.bits, signed = fmt === 2;
    const row = bw * spp; const o = out as { [i: number]: number };
    for (let r = 0; r < bh; r++) for (let i = spp; i < row; i++) {
      let v = o[r * row + i] + o[r * row + i - spp];
      if (mod) { v = ((v % mod) + mod) % mod; if (signed && v >= mod / 2) v -= mod; }
      o[r * row + i] = v;
    }
  }
  return out;
}

export interface ReadOptions {
  /** Output size: the image is decimated (nearest) to this. */
  width: number; height: number;
  /** Which samples to return, e.g. [0] for a DSM or [0, 1, 2, 3] for RGBA. */
  samples: number[];
  jpeg?: JpegDecoder;
  onProgress?: (f: number) => void;
  /** Return 8-bit pixels (16-bit images scaled down) instead of Float32: a quarter of the memory for imagery. */
  u8?: boolean;
}

/**
 * The best image to read for an output size: the smallest overview at least as
 * big, else the full image (decimated while reading).
 */
export function pickLevel(g: GeoTiff, width: number): TiffImage {
  const levels = g.images.filter(i => !i.mask && (i === g.main || i.overview) && i.samples === g.main.samples).sort((a, b) => a.width - b.width);
  return levels.find(i => i.width >= width) ?? g.main;
}

/**
 * Read the whole raster at (width × height), one block row at a time: pixel
 * values as Float32 (sample-interleaved). Memory is the output plus one block row.
 */
export async function readRaster(g: GeoTiff, o: ReadOptions & { u8: true }): Promise<{ data: Uint8ClampedArray; level: TiffImage }>;
export async function readRaster(g: GeoTiff, o: ReadOptions): Promise<{ data: Float32Array; level: TiffImage }>;
export async function readRaster(g: GeoTiff, o: ReadOptions): Promise<{ data: Float32Array | Uint8ClampedArray; level: TiffImage }> {
  const img = pickLevel(g, o.width), jpeg = o.jpeg ?? browserJpeg;
  const { width: W, height: H, samples } = o, ns = samples.length;
  const planar = img.planar === 2, spp = planar ? 1 : img.samples;
  const across = Math.ceil(img.width / img.tileW), down = Math.ceil(img.height / img.tileH);
  const colOf = new Int32Array(W); for (let i = 0; i < W; i++) colOf[i] = Math.min(img.width - 1, Math.floor(((i + 0.5) * img.width) / W));
  const out = o.u8 ? new Uint8ClampedArray(W * H * ns) : new Float32Array(W * H * ns).fill(NaN);
  const k8 = o.u8 && img.bits === 16 ? 1 / 257 : 1;
  // Output columns per block column: colOf is monotonic, so each block column owns a contiguous run.
  const runs = new Map<number, [number, number]>();
  for (let i = 0; i < W; i++) { const bc = Math.floor(colOf[i] / img.tileW), r = runs.get(bc); if (r) r[1] = i + 1; else runs.set(bc, [i, i + 1]); }
  let j = 0;
  for (let br = 0; br < down && j < H; br++) {
    const r0 = br * img.tileH, r1 = Math.min(img.height, r0 + img.tileH);
    const rows: number[] = [];
    for (; j < H; j++) { const r = Math.min(img.height - 1, Math.floor(((j + 0.5) * img.height) / H)); if (r >= r1) break; rows.push(j); }
    if (!rows.length) continue;
    const bh = img.tiled ? img.tileH : r1 - r0;
    for (const [bc, [i0, i1]] of runs) {
      const bw = img.tileW;
      const blocks: ArrayLike<number>[] = [];
      for (let s = 0; s < ns; s++) {
        if (planar) { if (samples[s] < img.samples) blocks[s] = await decodeBlock(g, img, samples[s] * across * down + br * across + bc, bw, bh, 1, jpeg); }
        else if (s === 0) blocks[0] = await decodeBlock(g, img, br * across + bc, bw, bh, spp, jpeg);
      }
      for (const jj of rows) {
        const r = Math.min(img.height - 1, Math.floor(((jj + 0.5) * img.height) / H)) - r0;
        for (let i = i0; i < i1; i++) {
          const cc = colOf[i] - bc * img.tileW, k = (jj * W + i) * ns;
          for (let s = 0; s < ns; s++) {
            const smp = samples[s];
            if (smp >= img.samples) { out[k + s] = 255; continue; } // missing alpha: opaque
            out[k + s] = (planar ? blocks[s][r * bw + cc] : blocks[0][(r * bw + cc) * spp + smp]) * k8;
          }
        }
      }
    }
    o.onProgress?.(j / H);
    await new Promise(res => setTimeout(res, 0)); // let the page breathe between block rows
  }
  return { data: out, level: img };
}

/** Pixel size of the full image in metres (x, y), at the image centre. */
export function pixelSizeM(g: GeoTiff, geo: GeoInfo): number {
  // One pixel step along a row and down a column, measured on the ground at the image centre.
  const c = g.main.width / 2, r = g.main.height / 2;
  const ll = (dc: number, dr: number) => geo.crs.inverse(...applyAffine(geo.affine, c + dc, r + dr));
  const [lon0, lat0] = ll(0, 0), kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = geo.crs.epsg === 4326 ? geo.crs.metresPerUnit(lat0) : 110574 + 1110 * Math.sin((lat0 * Math.PI) / 180) ** 2;
  const d = (dc: number, dr: number) => { const [lon, lat] = ll(dc, dr); return Math.hypot((lon - lon0) * kx, (lat - lat0) * ky); };
  return (d(1, 0) + d(0, 1)) / 2;
}

/** Is this raster an elevation model (one float or integer band) or an image (RGB / RGBA / grey 8-bit)? */
export function rasterKind(img: TiffImage): 'DSM' | 'ORTHO' | 'UNKNOWN' {
  const colour = img.samples >= 3 && (img.photometric === 2 || img.photometric === 6);
  if (colour && img.bits <= 16) return 'ORTHO';
  if (img.format === 3 || (img.samples <= 2 && img.bits >= 16)) return 'DSM';
  if (img.samples <= 2 && img.bits === 8) return 'ORTHO';
  return 'UNKNOWN';
}
