// Processed results: GeoTIFF reading and georeferencing, projections, the DSM surface,
// no-data, and the shipped sample measured against the demo model it was made from.
import assert from 'assert';
import { readFileSync } from 'fs';
import { loadModule } from './bundle.mjs';
import { writeGeoTiff, lzwEncode } from './tiff.mjs';
const tif = await loadModule('../src/survey/geotiff.ts');
const pj = await loadModule('../src/survey/projection.ts');
const pr = await loadModule('../src/survey/processed.ts');
const ms = await loadModule('../src/survey/measure.ts');
const site = await loadModule('../src/survey/site.ts');
const { demoMeasurements } = await loadModule('../src/survey/demoMeasurements.ts');
const plan = await loadModule('../src/survey/plan.ts');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}±${tol}, got ${a}`);
const open = (bytes) => tif.openGeoTiff(tif.bufferSource(bytes));

// --- projections ---------------------------------------------------------------
{
  // CN Tower, Toronto: UTM 17T 630084 4833438 (the usual worked example).
  const [E, N] = pj.utmForward(17, false, -(79 + 23 / 60 + 13.7 / 3600), 43 + 38 / 60 + 33.24 / 3600);
  near(E, 630084, 1, 'CN Tower easting'); near(N, 4833438, 1, 'CN Tower northing');
  // On the central meridian the northing is k0 × the meridian arc: 4 984 944.378 m to 45° on WGS84.
  near(pj.utmForward(31, false, 3, 45)[1], 0.9996 * 4984944.378, 0.001, 'meridian arc to 45°');
  near(pj.utmForward(31, true, 3, 0)[1], 10000000, 1e-6, 'southern false northing at the equator');
  let worst = 0;
  for (let lat = -79.5; lat <= 83.5; lat += 7.3) for (let d = -3.4; d <= 3.4; d += 0.85) {
    const zone = 1 + Math.floor(((lat * 7 + 180) % 360) / 6), lon = zone * 6 - 183 + d, south = lat < 0;
    const [x, y] = pj.utmForward(zone, south, lon, lat), [lon2, lat2] = pj.utmInverse(zone, south, x, y);
    worst = Math.max(worst, Math.hypot((lon2 - lon) * 111320 * Math.cos((lat * Math.PI) / 180), (lat2 - lat) * 110574));
  }
  assert.ok(worst < 0.001, `UTM round trip within 1 mm everywhere in a zone (worst ${(worst * 1000).toFixed(3)} mm)`);
  const wm = pj.crsFromEpsg(3857), [mx, my] = wm.forward(-118.1937, 33.7701), [ml, mt] = wm.inverse(mx, my);
  near(ml, -118.1937, 1e-9, 'Web Mercator lon round trip'); near(mt, 33.7701, 1e-9, 'Web Mercator lat round trip');
  near(mx, -13157262.5, 0.1, 'Web Mercator x'); // A·λ = 6378137 × −118.1937°
  assert.equal(pj.crsFromEpsg(32611).name, 'WGS 84 / UTM zone 11N (EPSG:32611)');
  assert.ok(pj.crsFromEpsg(27700) instanceof Error && /EPSG:27700 is not supported/.test(pj.crsFromEpsg(27700).message), 'other systems refused with a clear message');
}

// --- LZW --------------------------------------------------------------------------
{
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const data = Uint8Array.from({ length: 60000 }, (_, i) => (rnd() < 0.7 ? i % 7 : Math.floor(rnd() * 256))); // enough codes to clear the table
  assert.deepEqual(tif.lzwDecode(lzwEncode(data), data.length), data, 'LZW round trip across table resets');
}

// --- a WGS84 DSM: float32, strips, Deflate, floating-point predictor, no-data ----------------
{
  const w = 20, h = 10, z = Float32Array.from({ length: w * h }, (_, i) => 100 + (i % w) * 0.5 - Math.floor(i / w) * 0.25);
  z[3 * w + 4] = -9999; z[5 * w + 5] = NaN;
  const bytes = writeGeoTiff({ width: w, height: h, samples: 1, bits: 32, format: 3, data: z, tile: 0, compression: 8, predictor: 3, geo: { epsg: 4326, geographic: true, tiepoint: [0, 0, 0, -118.2, 33.78, 0], scale: [1e-5, 1e-5, 0], vertical: 5773 }, nodata: -9999 });
  const g = await open(bytes);
  assert.ok(!(g.geo instanceof Error), 'georeferenced');
  assert.equal(g.geo.crs.epsg, 4326); assert.equal(g.geo.nodata, -9999); assert.match(g.geo.vertical, /EGM96/);
  assert.deepEqual(g.geo.affine, [1e-5, 0, -118.2, 0, -1e-5, 33.78]);
  assert.equal(tif.rasterKind(g.main), 'DSM');
  const { data } = await tif.readRaster(g, { width: w, height: h, samples: [0] });
  for (let i = 0; i < z.length; i++) assert.ok(Object.is(data[i], z[i]) || data[i] === z[i], `pixel ${i}`);
  near(tif.pixelSizeM(g, g.geo), 1.0, 0.1, 'pixel size in metres (1e-5° ≈ 1 m)');
  // As a DEM: no-data and NaN are holes, filled for sampling but not covered.
  const dem = await pr.loadDem(tif.bufferSource(bytes));
  assert.equal(dem.valid[3 * w + 4], 0); assert.equal(dem.valid[5 * w + 5], 0); assert.equal(dem.valid[0], 1);
  near(dem.validPct, 99, 1e-9, '198 of 200 pixels have data');
  assert.ok(Number.isFinite(dem.z[3 * w + 4]) && dem.z[3 * w + 4] > 99 && dem.z[3 * w + 4] < 111, 'hole filled from its neighbours');
}

// --- a UTM DSM: big-endian, tiles, LZW, int16 with the horizontal predictor, PixelIsPoint ------
{
  const w = 40, h = 30, z = Int16Array.from({ length: w * h }, (_, i) => 250 + (i % w) - Math.floor(i / w) * 2);
  const bytes = writeGeoTiff({ width: w, height: h, samples: 1, bits: 16, format: 2, data: z, tile: 16, compression: 5, predictor: 2, big: true, geo: { epsg: 32611, tiepoint: [0, 0, 0, 389000, 3737500, 0], scale: [0.5, 0.5, 0], pixelIsPoint: true } });
  const g = await open(bytes);
  assert.equal(g.little, false); assert.equal(g.geo.crs.epsg, 32611);
  assert.deepEqual(g.geo.affine, [0.5, 0, 389000 - 0.25, 0, -0.5, 3737500 + 0.25], 'PixelIsPoint: tie point is a pixel centre');
  const { data } = await tif.readRaster(g, { width: w, height: h, samples: [0] });
  assert.deepEqual(Array.from(data), Array.from(z), 'tiled int16 read back exactly (partial edge tiles too)');
  // Decimated read: nearest pixel of each output cell.
  const { data: d4 } = await tif.readRaster(g, { width: 10, height: 6, samples: [0] });
  assert.equal(d4[0], z[2 * w + 2]); assert.equal(d4[6 * 10 - 1], z[27 * w + 38]);
}

// --- ModelTransformation, GDAL's user-defined UTM form, and refusals ---------------------------
{
  const z = new Float32Array(16).fill(5);
  const rot = await open(writeGeoTiff({ width: 4, height: 4, bits: 32, format: 3, data: z, geo: { epsg: 32633, transform: [0.8, 0.6, 0, 500000, 0.6, -0.8, 0, 4000000, 0, 0, 0, 0, 0, 0, 0, 1] } }));
  assert.deepEqual(rot.geo.affine, [0.8, 0.6, 500000, 0.6, -0.8, 4000000], 'rotated grid from ModelTransformation');
  const ud = await open(writeGeoTiff({ width: 4, height: 4, bits: 32, format: 3, data: z, geo: { projection: 16111, tiepoint: [0, 0, 0, 500000, 6000000, 0], scale: [1, 1, 0] } }));
  assert.equal(ud.geo.crs.epsg, 32711, 'user-defined PCS with the UTM 11S projection code');
  const bng = await open(writeGeoTiff({ width: 4, height: 4, bits: 32, format: 3, data: z, geo: { epsg: 27700, tiepoint: [0, 0, 0, 0, 0, 0], scale: [1, 1, 0] } }));
  assert.ok(bng.geo instanceof Error && /EPSG:27700/.test(bng.geo.message), 'British National Grid refused');
  await assert.rejects(pr.loadDem(tif.bufferSource(writeGeoTiff({ width: 4, height: 4, bits: 32, format: 3, data: z }))), /no georeferencing/);
  await assert.rejects(pr.loadDem(tif.bufferSource(writeGeoTiff({ width: 4, height: 4, bits: 32, format: 3, data: new Float32Array(16).fill(-9999), nodata: -9999, geo: { epsg: 4326, geographic: true, tiepoint: [0, 0, 0, 0, 0, 0], scale: [1e-5, 1e-5, 0] } }))), /no elevation data/);
  await assert.rejects(tif.openGeoTiff(tif.bufferSource(new TextEncoder().encode('hello world, not a tiff'))), /Not a TIFF/);
}

// --- an RGBA orthophoto with an overview: the overview is read when it is big enough ------------
{
  const w = 64, h = 48, px = (W, H, k) => Uint8Array.from({ length: W * H * 4 }, (_, i) => (i % 4 === 3 ? 255 : (Math.floor(i / 4) * k + (i % 4) * 60) % 256));
  const bytes = writeGeoTiff({ width: w, height: h, samples: 4, bits: 8, data: px(w, h, 1), tile: 16, compression: 8, predictor: 2, extraSamples: [2], geo: { epsg: 3857, tiepoint: [0, 0, 0, -13157458, 3998000, 0], scale: [0.3, 0.3, 0] }, overviews: [{ width: 32, height: 24, data: px(32, 24, 7) }] });
  const g = await open(bytes);
  assert.equal(g.images.length, 2); assert.equal(tif.rasterKind(g.main), 'ORTHO'); assert.equal(g.geo.crs.epsg, 3857);
  const small = await tif.readRaster(g, { width: 16, height: 12, samples: [0, 1, 2, 3], u8: true });
  assert.equal(small.level.width, 32, 'reads the overview for a small output');
  const full = await tif.readRaster(g, { width: 64, height: 48, samples: [0, 1, 2, 3], u8: true });
  assert.equal(full.level.width, 64); assert.deepEqual(Array.from(full.data.slice(0, 8)), [0, 60, 120, 255, 1, 61, 121, 255]);
  near(tif.pixelSizeM(g, g.geo), 0.3 * Math.cos((33.77 * Math.PI) / 180), 0.005, 'Web Mercator pixel on the ground');
  const o = await pr.loadOrtho(tif.bufferSource(bytes));
  assert.equal(o.w, 64); assert.equal(o.rgba.length, 64 * 48 * 4);
}

// --- the surface: a plane in UTM is sampled exactly (bilinear), holes are reported -----------------
{
  const origin = { lat: 33.7701, lon: -118.1937 }, [Ec, Nc] = pj.utmForward(11, false, origin.lon, origin.lat);
  const w = 200, h = 160, res = 0.5, E0 = Math.round(Ec) - 50, N1 = Math.round(Nc) + 40;
  const plane = (E, N) => 42 + 0.03 * (E - E0) - 0.02 * (N1 - N);
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) z[r * w + c] = plane(E0 + (c + 0.5) * res, N1 - (r + 0.5) * res);
  for (let r = 70; r < 90; r++) for (let c = 90; c < 110; c++) z[r * w + c] = -9999; // a 10 × 10 m hole
  const bytes = writeGeoTiff({ width: w, height: h, bits: 32, format: 3, data: z, tile: 64, compression: 8, geo: { epsg: 32611, tiepoint: [0, 0, 0, E0, N1, 0], scale: [res, res, 0] }, nodata: -9999 });
  const p = await pr.loadProcessed({ dsm: tif.bufferSource(bytes), name: 'plane' }, origin);
  assert.equal(p.offSite, false); assert.deepEqual(p.origin, origin);
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const x = -40 + (k * 37) % 80, y = -30 + (k * 53) % 60;
    if (!p.covered(x, y)) continue;
    const ll = plan.toLatLon(origin, { x, y }), [E, N] = pj.utmForward(11, false, ll.lon, ll.lat);
    worst = Math.max(worst, Math.abs(p.surface(x, y) - plane(E, N)));
  }
  assert.ok(worst < 0.002, `surface = the plane at any local point (worst ${worst.toFixed(4)} m)`);
  // The hole: centre of pixels 90–110 × 70–90 in local metres.
  const ll = pj.utmInverse(11, false, E0 + 50, N1 - 40), hc = plan.fromLatLon(origin, ll[1], ll[0]);
  assert.equal(p.covered(hc.x, hc.y), false, 'no data in the hole');
  assert.ok(Math.abs(p.surface(hc.x, hc.y) - 42) < 3, 'the hole is filled with a plausible height');
  const line = [{ x: hc.x - 20, y: hc.y }, { x: hc.x + 20, y: hc.y }];
  near(pr.gapShare(p, line, 'LINE'), 10 / 40, 0.06, 'a line across the hole: a quarter has no data');
  assert.equal(pr.gapShare(p, [{ x: hc.x - 30, y: hc.y - 25 }, { x: hc.x - 30, y: hc.y + 5 }], 'LINE'), 0, 'a line beside it: none');
  assert.ok(p.grid.cols <= pr.MESH_MAX && p.grid.rows <= pr.MESH_MAX, 'display mesh within the cap');
  assert.ok(p.grid.z.some(Number.isNaN), 'display mesh leaves the hole open');
  // Measure on it: a 4 × 4 m pad levelled to the plane's value at its centre balances.
  const pad = [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }];
  const a = ms.measureArea(pad, p.surface, { kind: 'DESIGN', level: p.surface(12, 12) }, 0.25);
  near(a.netM3, 0, 0.01, 'pad on a plane balances'); assert.ok(a.cutM3 > 0.05, 'and has cut on one side');
  // Results far from the site are measured round their own centre.
  const far = await pr.loadProcessed({ dsm: tif.bufferSource(bytes), name: 'far' }, { lat: 34.5, lon: -118.19 });
  assert.equal(far.offSite, true); near(far.origin.lat, origin.lat, 0.001, 'origin moves to the results');
}

// --- display caps on a big DSM: 3000 × 2000 measures at full resolution, draws at ≤ 768 a side -------
{
  const w = 3000, h = 2000, z = new Float32Array(w * h).fill(10);
  const bytes = writeGeoTiff({ width: w, height: h, bits: 32, format: 3, data: z, tile: 256, compression: 8, geo: { epsg: 32611, tiepoint: [0, 0, 0, 389000, 3737500, 0], scale: [0.05, 0.05, 0] } });
  const p = await pr.loadProcessed({ dsm: tif.bufferSource(bytes), name: 'big' }, { lat: 33.7701, lon: -118.1937 });
  assert.equal(p.dem.w, 3000, 'measured at full resolution'); near(p.dem.resM, 0.05, 1e-4, '5 cm (on the ground: UTM scale ≈ 0.9997 here)');
  assert.ok(p.grid.cols <= pr.MESH_MAX && p.grid.rows <= pr.MESH_MAX, `mesh ${p.grid.cols}×${p.grid.rows}`);
}

// --- the shipped sample measures like the demo model it was made from ----------------------------------
{
  const dir = new URL('../public/demo/processed/', import.meta.url);
  const dsm = readFileSync(new URL('dsm.tif', dir)), ortho = readFileSync(new URL('orthophoto.tif', dir));
  assert.ok(dsm.length + ortho.length < 3e6, `sample under 3 MB (${((dsm.length + ortho.length) / 1e6).toFixed(2)} MB)`);
  const p = await pr.loadProcessed({ dsm: tif.bufferSource(dsm), ortho: tif.bufferSource(ortho), name: 'sample' }, site.SITE.origin);
  assert.equal(p.offSite, false); assert.equal(p.dem.crs.epsg, 32611); assert.ok(p.ortho && p.orthoUv, 'orthophoto loaded');
  assert.ok(p.dem.validPct > 60 && p.dem.validPct < 100, `no-data collar outside the flown area (${p.dem.validPct.toFixed(0)} % data)`);
  const D = site.SITE_DATUM_M, demo = (x, y) => site.surfaceAt(x, y) + D;
  const notes = pr.rebaseNotes(demoMeasurements(), D); // levels move into the file's datum
  for (const a of notes) {
    assert.equal(pr.gapShare(p, a.pts, a.kind), 0, `${a.name}: all on data`);
    if (a.kind === 'AREA') {
      const cell = Math.max(0.5, Math.sqrt(plan.polygonArea(a.pts)) / 220);
      const s = ms.measureArea(a.pts, p.surface, a.base, cell), m = ms.measureArea(a.pts, demo, a.base, cell);
      const tol = Math.max(3, 0.03 * Math.max(m.cutM3, m.fillM3));
      near(s.cutM3, m.cutM3, tol, `${a.name} cut`); near(s.fillM3, m.fillM3, tol, `${a.name} fill`);
      near(s.elevMax, m.elevMax, 0.15, `${a.name} highest`); near(s.surfaceM2, m.surfaceM2, 0.01 * m.surfaceM2, `${a.name} surface area`);
    } else if (a.kind === 'LINE') {
      const s = ms.measureLine(a.pts, p.surface, 0.5), m = ms.measureLine(a.pts, demo, 0.5);
      near(s.surfaceM, m.surfaceM, 0.002 * m.surfaceM, `${a.name} length`);
      near(s.gradeMaxPct, m.gradeMaxPct, 0.4, `${a.name} steepest grade`);
      assert.equal(s.segments.filter(g => Math.abs(g.gradePct) > 5).length, m.segments.filter(g => Math.abs(g.gradePct) > 5).length, `${a.name}: same segments over 5 %`);
    }
  }
  near(p.surface(0, 0), demo(0, 0), 0.05, 'venue centre elevation');
}
console.log('processed: all tests passed');
