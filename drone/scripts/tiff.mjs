// A small GeoTIFF writer (classic TIFF, either byte order, strips or tiles, Deflate or LZW,
// predictors 2 and 3, internal overviews) for test fixtures and the demo's processed sample.
import { deflateSync } from 'zlib';

const TYPE = { SHORT: 3, LONG: 4, DOUBLE: 12, ASCII: 2 };
const SIZE = { 2: 1, 3: 2, 4: 4, 12: 8 };

/** TIFF LZW encoder (MSB-first, 9–12 bit codes, early change): for fixtures. */
export function lzwEncode(input) {
  const out = []; let cur = 0, nb = 0, width = 9;
  const put = (code) => { for (let i = width - 1; i >= 0; i--) { cur = (cur << 1) | ((code >> i) & 1); if (++nb === 8) { out.push(cur); cur = 0; nb = 0; } } };
  const dict = new Map(); let next = 258;
  // As libtiff: widen once the next free code passes the width's maximum; clear at 4094.
  const grow = () => { next++; if (next === 4094) { put(256); dict.clear(); next = 258; width = 9; } else if (next > (1 << width) - 1) width++; };
  put(256);
  if (input.length) {
    let w = input[0];
    for (let i = 1; i < input.length; i++) {
      const key = w * 256 + input[i];
      if (dict.has(key)) { w = dict.get(key); continue; }
      put(w); dict.set(key, next); grow(); w = input[i];
    }
    put(w); grow();
  }
  put(257);
  if (nb) out.push(cur << (8 - nb));
  return Uint8Array.from(out);
}

function encodeBlock(vals, bw, bh, spp, bits, format, predictor, le, compression) {
  const bps = bits / 8, buf = new Uint8Array(bw * bh * spp * bps), dv = new DataView(buf.buffer);
  if (predictor === 3) {
    const wc = bw * spp, t = new DataView(new ArrayBuffer(bps));
    for (let r = 0; r < bh; r++) {
      const row = buf.subarray(r * wc * bps, (r + 1) * wc * bps);
      for (let k = 0; k < wc; k++) {
        if (bps === 4) t.setFloat32(0, vals[r * wc + k], false); else t.setFloat64(0, vals[r * wc + k], false);
        for (let b = 0; b < bps; b++) row[b * wc + k] = t.getUint8(b);
      }
      for (let i = row.length - 1; i >= spp; i--) row[i] = (row[i] - row[i - spp]) & 255;
    }
  } else {
    const v = Float64Array.from(vals);
    if (predictor === 2) { const row = bw * spp; for (let r = 0; r < bh; r++) for (let i = row - 1; i >= spp; i--) v[r * row + i] -= v[r * row + i - spp]; }
    for (let i = 0; i < v.length; i++) {
      const o = i * bps, x = v[i];
      if (format === 3) { if (bps === 4) dv.setFloat32(o, x, le); else dv.setFloat64(o, x, le); }
      else if (bps === 1) dv.setUint8(o, ((x % 256) + 256) % 256);
      else if (bps === 2) dv.setUint16(o, ((x % 65536) + 65536) % 65536, le);
      else dv.setUint32(o, ((x % 2 ** 32) + 2 ** 32) % 2 ** 32, le);
    }
  }
  return compression === 8 ? deflateSync(buf, { level: 9 }) : compression === 5 ? lzwEncode(buf) : buf;
}

/** Cut an image (interleaved samples) into blocks of bw × bh, padding partial ones. */
function blocksOf(img, tile) {
  const { width: W, height: H, samples: spp, data } = img;
  const bw = tile || W, bh = tile || Math.min(H, img.rowsPerStrip || 64);
  const across = Math.ceil(W / bw), down = Math.ceil(H / bh), out = [];
  for (let br = 0; br < down; br++) for (let bc = 0; bc < across; bc++) {
    const h = tile ? bh : Math.min(bh, H - br * bh), v = new Float64Array(bw * h * spp);
    for (let r = 0; r < h; r++) for (let c = 0; c < bw; c++) {
      const R = br * bh + r, C = bc * bw + c;
      for (let s = 0; s < spp; s++) v[(r * bw + c) * spp + s] = R < H && C < W ? data[(R * W + C) * spp + s] : 0;
    }
    out.push({ v, bw, bh: h });
  }
  return { out, bw, bh };
}

/**
 * opts: { width, height, samples, bits, format (1 uint, 2 int, 3 float), data, tile (0 = strips),
 *         compression (1, 5, 8), predictor, big (big-endian), photometric, extraSamples,
 *         geo: { epsg, geographic, tiepoint, scale, transform, pixelIsPoint, vertical, verticalUnits, projection, gcs },
 *         nodata, overviews: [{ width, height, data }] }
 */
export function writeGeoTiff(o) {
  const le = !o.big, spp = o.samples ?? 1, bits = o.bits ?? 8, format = o.format ?? 1, comp = o.compression ?? 8, pred = o.predictor ?? 1;
  const photometric = o.photometric ?? (spp >= 3 ? 2 : 1);
  const images = [{ ...o, samples: spp }, ...(o.overviews ?? []).map(v => ({ ...v, samples: spp, overview: true }))];
  const chunks = []; let at = 8; const add = (b) => { const off = at; chunks.push(b); at += b.length; if (at % 2) { chunks.push(new Uint8Array(1)); at++; } return off; };
  const ifdOffsets = [], ifds = [];
  for (const img of images) {
    const { out, bw, bh } = blocksOf(img, o.tile ?? 0);
    const offs = [], counts = [];
    for (const b of out) { const enc = encodeBlock(b.v, b.bw, b.bh, spp, bits, format, pred, le, comp); offs.push(add(enc)); counts.push(enc.length); }
    const tags = [
      [254, TYPE.LONG, [img.overview ? 1 : 0]], [256, TYPE.LONG, [img.width]], [257, TYPE.LONG, [img.height]],
      [258, TYPE.SHORT, Array(spp).fill(bits)], [259, TYPE.SHORT, [comp]], [262, TYPE.SHORT, [photometric]],
      [277, TYPE.SHORT, [spp]], [284, TYPE.SHORT, [1]], [339, TYPE.SHORT, Array(spp).fill(format)],
    ];
    if (pred !== 1) tags.push([317, TYPE.SHORT, [pred]]);
    if (o.extraSamples) tags.push([338, TYPE.SHORT, o.extraSamples]);
    if (o.tile) tags.push([322, TYPE.LONG, [bw]], [323, TYPE.LONG, [bh]], [324, TYPE.LONG, offs], [325, TYPE.LONG, counts]);
    else tags.push([273, TYPE.LONG, offs], [278, TYPE.LONG, [bh]], [279, TYPE.LONG, counts]);
    if (!img.overview && o.geo) {
      const g = o.geo, keys = [];
      keys.push([1024, g.geographic ? 2 : 1], [1025, g.pixelIsPoint ? 2 : 1]);
      if (g.geographic) keys.push([2048, g.epsg]);
      else if (g.projection) keys.push([2048, g.gcs ?? 4326], [3072, 32767], [3074, g.projection], [3076, 9001]);
      else keys.push([3072, g.epsg], [3076, 9001]);
      if (g.vertical) keys.push([4096, g.vertical]);
      if (g.verticalUnits) keys.push([4099, g.verticalUnits]);
      keys.sort((a, b) => a[0] - b[0]);
      tags.push([34735, TYPE.SHORT, [1, 1, 0, keys.length, ...keys.flatMap(([k, v]) => [k, 0, 1, v])]]);
      if (g.transform) tags.push([34264, TYPE.DOUBLE, g.transform]);
      else tags.push([33550, TYPE.DOUBLE, g.scale], [33922, TYPE.DOUBLE, g.tiepoint]);
    }
    if (!img.overview && o.nodata !== undefined) tags.push([42113, TYPE.ASCII, `${o.nodata}\0`]);
    tags.sort((a, b) => a[0] - b[0]);
    ifds.push(tags);
  }
  // IFDs after the data; out-of-line values after each IFD.
  for (let k = 0; k < ifds.length; k++) {
    const tags = ifds[k], n = tags.length, size = 2 + n * 12 + 4;
    const extra = tags.map(([, t, v]) => (typeof v === 'string' ? v.length : v.length) * SIZE[t]);
    const ifdAt = at, body = new Uint8Array(size + extra.reduce((s, e) => s + (e > 4 ? e + (e % 2) : 0), 0)), dv = new DataView(body.buffer);
    dv.setUint16(0, n, le);
    let x = size;
    tags.forEach(([tag, t, v], i) => {
      const e = 2 + i * 12, len = typeof v === 'string' ? v.length : v.length, bytes = extra[i];
      dv.setUint16(e, tag, le); dv.setUint16(e + 2, t, le); dv.setUint32(e + 4, len, le);
      const w = (view, off) => { for (let j = 0; j < len; j++) { const val = typeof v === 'string' ? v.charCodeAt(j) : v[j];
        if (t === TYPE.ASCII) view.setUint8(off + j, val); else if (t === TYPE.SHORT) view.setUint16(off + j * 2, val, le); else if (t === TYPE.LONG) view.setUint32(off + j * 4, val, le); else view.setFloat64(off + j * 8, val, le); } };
      if (bytes <= 4) w(dv, e + 8); else { dv.setUint32(e + 8, ifdAt + x, le); w(dv, x); x += bytes + (bytes % 2); }
    });
    ifdOffsets.push({ at: ifdAt, next: 2 + n * 12, dv });
    add(body);
  }
  ifdOffsets.forEach((f, i) => f.dv.setUint32(f.next, ifdOffsets[i + 1]?.at ?? 0, le));
  const head = new Uint8Array(8), hv = new DataView(head.buffer);
  head[0] = head[1] = le ? 0x49 : 0x4d; hv.setUint16(2, 42, le); hv.setUint32(4, ifdOffsets[0].at, le);
  const all = new Uint8Array(at); all.set(head); let p = 8; for (const c of chunks) { all.set(c, p); p += c.length; }
  return all;
}
