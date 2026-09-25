// The demo venue as a processor would deliver it: a DSM and an orthophoto GeoTIFF in
// UTM zone 11N (EPSG:32611, as OpenDroneMap writes), with a no-data collar outside the
// flown area. Written to public/demo/processed/ for "Load sample processed results".
//   node scripts/gen_processed_sample.mjs [--dsm-res 0.5] [--ortho-res 0.25]   (about 1.5 MB together)
import { writeFileSync, mkdirSync } from 'fs';
import { loadModule } from './bundle.mjs';
import { writeGeoTiff } from './tiff.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? parseFloat(process.argv[i + 1]) : d; };
const DSM_RES = arg('--dsm-res', 0.5), ORTHO_RES = arg('--ortho-res', 0.25), NODATA = -9999;
const site = await loadModule('../src/survey/site.ts');
const { fbm } = await loadModule('../src/dashboards/terrain.ts');
const { utmForward, utmInverse } = await loadModule('../src/survey/projection.ts');
const { fromLatLon, pointInPolygon } = await loadModule('../src/survey/plan.ts');
const { SITE, STOCKPILE: P, SWALE: S, TREES, PARKED_CARS, SITE_DATUM_M, heightAt, surfaceAt } = site;
const ZONE = 11, O = SITE.origin;

// Flown area: the boundary plus 60 m, as the lead-ins and image footprints reach.
const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
const B = SITE.boundary;
const flown = (p) => pointInPolygon(p, B) || B.some((a, i) => segDist(p, a, B[(i + 1) % B.length]) < 60);

// UTM extent covering the site's local box (boundary ± 70 m, as the demo viewer shows).
const xs = B.map(p => p.x), ys = B.map(p => p.y);
const box = { x0: Math.min(...xs) - 70, x1: Math.max(...xs) + 70, y0: Math.min(...ys) - 70, y1: Math.max(...ys) + 70 };
const toUtm = (x, y) => utmForward(ZONE, false, O.lon + x / (111320 * Math.cos((O.lat * Math.PI) / 180)), O.lat - y / 111320);
const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]].map(([x, y]) => toUtm(x, y));
const E0 = Math.floor(Math.min(...corners.map(c => c[0]))), E1 = Math.ceil(Math.max(...corners.map(c => c[0])));
const N0 = Math.floor(Math.min(...corners.map(c => c[1]))), N1 = Math.ceil(Math.max(...corners.map(c => c[1])));
const local = (E, N) => { const [lon, lat] = utmInverse(ZONE, false, E, N); return fromLatLon(O, lat, lon); };

// ---- DSM ----
const dw = Math.round((E1 - E0) / DSM_RES), dh = Math.round((N1 - N0) / DSM_RES);
const dsm = new Float32Array(dw * dh);
for (let r = 0; r < dh; r++) for (let c = 0; c < dw; c++) {
  const p = local(E0 + (c + 0.5) * DSM_RES, N1 - (r + 0.5) * DSM_RES);
  dsm[r * dw + c] = flown(p) ? Math.round((surfaceAt(p.x, p.y) + SITE_DATUM_M) * 1000) / 1000 : NODATA;
}
const geo = (res) => ({ epsg: 32600 + ZONE, tiepoint: [0, 0, 0, E0, N1, 0], scale: [res, res, 0], vertical: 5773, verticalUnits: 9001 });
const dsmTif = writeGeoTiff({ width: dw, height: dh, samples: 1, bits: 32, format: 3, data: dsm, tile: 256, compression: 8, predictor: 3, geo: geo(DSM_RES), nodata: NODATA });

// ---- orthophoto: the demo's imagery (site.ts siteImagery), evaluated per pixel in the UTM grid ----
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const over = (c, rgb, a) => { c[0] += (rgb[0] - c[0]) * a; c[1] += (rgb[1] - c[1]) * a; c[2] += (rgb[2] - c[2]) * a; };
const treeCells = new Map();
for (const t of TREES) { const k = `${Math.floor(t.x / 10)},${Math.floor(t.y / 10)}`; (treeCells.get(k) ?? treeCells.set(k, []).get(k)).push(t); }
const paths = [[[-150, 120], [-100, 80], [-20, 30], [60, -40]], [[-20, 30], [-110, -20]], [[-20, 30], [120, 60], [150, 100]]];
const swale = [{ x: S.x - S.dx * S.len * 0.8, y: S.y - S.dy * S.len * 0.8 }, { x: S.x + S.dx * S.len * 0.8, y: S.y + S.dy * S.len * 0.8 }];
const pileStops = [[0, hex('#b9b2a4'), 1], [0.55, hex('#9a9284'), 1], [0.9, hex('#6f6a60'), 1], [1, [90, 86, 76], 0]];
const inRect = (x, y, x0, y0, w, h) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
const PK = SITE.parking;
function colourAt(x, y) {
  const h = heightAt(x, y), n = fbm(x * 0.03, y * 0.03, 3, 3), dry = Math.min(1, Math.max(0, h / 40));
  const c = [58 + n * 40 + dry * 70, 84 + n * 44 + dry * 30, 44 + n * 20 + dry * 10];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of treeCells.get(`${Math.floor(x / 10) + i},${Math.floor(y / 10) + j}`) ?? [])
    if (Math.hypot(x - t.x, y - t.y) <= t.r) over(c, [22 + t.shade * 18, 48 + t.shade * 20, 26 + t.shade * 10], 0.95);
  for (const pl of paths) for (let i = 0; i + 1 < pl.length; i++) if (segDist({ x, y }, { x: pl[i][0], y: pl[i][1] }, { x: pl[i + 1][0], y: pl[i + 1][1] }) <= 3) { over(c, [176, 160, 128], 0.9); break; }
  if (((x - 60) / 70) ** 2 + ((y + 20) / 40) ** 2 <= 1) over(c, [150, 140, 96], 0.35);
  if (segDist({ x, y }, swale[0], swale[1]) <= 3) over(c, [30, 70, 32], 0.45);
  const R = P.r * 1.08, d = Math.hypot(x - P.x, y - P.y) / R;
  if (d <= 1) {
    const t = Math.min(1, Math.hypot(x - (P.x - P.r * 0.25 * (1 - d)), y - (P.y - P.r * 0.25 * (1 - d))) / R);
    let k = 0; while (k < pileStops.length - 2 && t > pileStops[k + 1][0]) k++;
    const [t0, c0, a0] = pileStops[k], [t1, c1, a1] = pileStops[k + 1], f = (t - t0) / (t1 - t0);
    over(c, c0.map((v, i) => v + (c1[i] - v) * f), a0 + (a1 - a0) * f);
  }
  if (inRect(x, y, PK.x0, PK.y0, PK.x1 - PK.x0, PK.y1 - PK.y0)) {
    over(c, hex('#4a4d52'), 1);
    const col = Math.floor((x - PK.x0 - 4) / 2.8), row = Math.round((y - PK.y0 - 6) / 15);
    if (col >= 0 && col < 40 && row >= 0 && row < 4) {
      const sx = PK.x0 + 4 + col * 2.8, sy = PK.y0 + 6 + row * 15;
      if (inRect(x, y, sx - 0.1, sy - 0.1, 2.8, 5.2) && !inRect(x, y, sx + 0.1, sy + 0.1, 2.4, 4.8)) over(c, [230, 230, 230], 0.5);
    }
    for (const car of PARKED_CARS) if (inRect(x, y, car.x + 0.4, car.y + 0.5, 1.8, 4)) { over(c, hex(car.color), 1); break; }
  }
  for (const s of SITE.structures) {
    if (inRect(x, y, s.x - s.w / 2 + s.h * 0.35, s.y - s.d / 2 + s.h * 0.35, s.w, s.d)) over(c, [0, 0, 0], 0.35);
    if (inRect(x, y, s.x - s.w / 2, s.y - s.d / 2, s.w, s.d)) {
      over(c, hex(s.roof), 1);
      if (s.kind === 'tent') { const u = (x - s.x) / s.w, v = (y - s.y) / s.d; if (Math.abs(Math.abs(u) - Math.abs(v)) < 0.02) over(c, [0, 0, 0], 0.18); }
    }
  }
  return c;
}
const ow = Math.round((E1 - E0) / ORTHO_RES), oh = Math.round((N1 - N0) / ORTHO_RES);
const rgba = new Uint8Array(ow * oh * 4);
for (let r = 0; r < oh; r++) for (let c = 0; c < ow; c++) {
  const acc = [0, 0, 0]; let inside = false;
  for (const [a, b] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { // 2 × 2 supersampling
    const p = local(E0 + (c + a) * ORTHO_RES, N1 - (r + b) * ORTHO_RES), k = colourAt(p.x, p.y);
    acc[0] += k[0] / 4; acc[1] += k[1] / 4; acc[2] += k[2] / 4; inside ||= flown(p);
  }
  const i = (r * ow + c) * 4;
  rgba[i] = acc[0]; rgba[i + 1] = acc[1]; rgba[i + 2] = acc[2]; rgba[i + 3] = inside ? 255 : 0;
  if (!inside) rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
}
const orthoTif = writeGeoTiff({ width: ow, height: oh, samples: 4, bits: 8, format: 1, data: rgba, tile: 256, compression: 8, predictor: 2, extraSamples: [2], geo: geo(ORTHO_RES) });

const dir = new URL('../public/demo/processed/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('dsm.tif', dir), dsmTif);
writeFileSync(new URL('orthophoto.tif', dir), orthoTif);
console.log(`dsm.tif ${dw}×${dh} @ ${DSM_RES} m: ${(dsmTif.length / 1e6).toFixed(2)} MB; orthophoto.tif ${ow}×${oh} @ ${ORTHO_RES} m: ${(orthoTif.length / 1e6).toFixed(2)} MB`);
