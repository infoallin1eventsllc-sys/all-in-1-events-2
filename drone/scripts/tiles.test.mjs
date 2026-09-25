// Map tiles: Web Mercator maths (lat/lon ↔ tile/pixel ↔ the site's local metres) and the basemap providers.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const t = await loadModule('../src/survey/tiles.ts');
const m = await loadModule('../src/survey/plan.ts');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}±${tol}, got ${a}`);

// --- lat/lon ↔ global pixel ------------------------------------------------
near(t.lonLatToPixel(0, 0, 0).x, 128, 1e-9, 'null island x at z0'); near(t.lonLatToPixel(0, 0, 0).y, 128, 1e-9, 'null island y at z0');
near(t.lonLatToPixel(t.MAX_LAT, -180, 3).y, 0, 1e-6, 'the top of the world is y 0'); near(t.lonLatToPixel(-t.MAX_LAT, 180, 3).x, 2048, 1e-9, 'x wraps at 256·2^z');
// Well-known slippy-map tiles (as OpenStreetMap numbers them).
assert.deepEqual((({ x, y }) => ({ x, y }))(t.tileAt(51.5074, -0.1278, 10)), { x: 511, y: 340 }, 'London z10');
assert.deepEqual((({ x, y }) => ({ x, y }))(t.tileAt(-33.8688, 151.2093, 10)), { x: 942, y: 614 }, 'Sydney z10 (southern hemisphere: y below the middle)');
assert.deepEqual((({ x, y }) => ({ x, y }))(t.tileAt(-22.9519, -43.2105, 15)), { x: 12450, y: 18531 }, 'Rio z15 (south and west; the OSM wiki formula gives the same)');
for (const [lat, lon] of [[33.7701, -118.1937], [-33.8688, 151.2093], [-54.8019, -68.303], [64.1466, -21.9426]]) {
  for (const z of [3, 12, 17, 20]) {
    const p = t.lonLatToPixel(lat, lon, z), q = t.pixelToLonLat(p.x, p.y, z);
    near(q.lat, lat, 1e-9, `round trip lat ${lat} z${z}`); near(q.lon, lon, 1e-9, `round trip lon ${lon} z${z}`);
    const tile = t.tileAt(lat, lon, z), b = t.tileBounds(tile.x, tile.y, z);
    assert.ok(b.south <= lat && lat <= b.north && b.west <= lon && lon <= b.east, `the tile at ${lat},${lon} z${z} contains it`);
    assert.ok(tile.px >= 0 && tile.px < 256 && tile.py >= 0 && tile.py < 256, 'pixel within the tile');
  }
}
// Mercator stretches rows towards the poles: a southern tile's north edge is nearer the equator, and the rows get taller in degrees nearer it.
{ const b1 = t.tileBounds(942, 614, 10), b2 = t.tileBounds(942, 615, 10);
  assert.ok(b1.north > b1.south && b2.north === b1.south, 'southern rows run north to south');
  assert.ok(b1.north - b1.south > b2.north - b2.south, 'rows shrink in degrees going south (towards the pole)'); }

// --- scale and zoom --------------------------------------------------------
near(t.groundResolution(0, 0), 156543.034, 1e-3, 'z0 at the equator');
near(t.groundResolution(60, 1), 156543.034 / 4, 1e-3, 'cos(60°) halves it, z1 halves it again');
near(t.groundResolution(-60, 1), t.groundResolution(60, 1), 1e-9, 'symmetric north and south');
assert.equal(t.zoomForScale(-33.87, 1 / t.groundResolution(-33.87, 17)), 17, 'one tile pixel per screen pixel');
assert.equal(t.zoomForScale(-33.87, 1.9 / t.groundResolution(-33.87, 17)), 18, 'a sharper screen picks the next zoom');
assert.equal(t.zoomForScale(-33.87, 64 / t.groundResolution(-33.87, 17), 19), 19, 'clamped to the provider');
{ const box = { north: -33.86, south: -33.88, west: 151.20, east: 151.22 };
  const tiles = t.tilesCovering(box, 15);
  const a = t.tileAt(box.north, box.west, 15), b = t.tileAt(box.south, box.east, 15);
  assert.equal(tiles.length, (b.x - a.x + 1) * (b.y - a.y + 1), 'every tile in the box');
  assert.ok(tiles.every(q => q.z === 15)); }
assert.deepEqual(t.tilesCovering({ north: 1, south: -1, west: 179.9, east: 180.1 }, 2).map(q => q.x), [3, 0, 3, 0], 'x wraps across the antimeridian');

// --- the local frame against the ellipsoid ------------------------------------
// Vincenty's inverse on WGS84 (independent of the series in plan.ts): 1 km north and 1 km east must measure 1 km.
function vincenty(lat1, lon1, lat2, lon2) {
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), r = Math.PI / 180;
  const L = (lon2 - lon1) * r, U1 = Math.atan((1 - f) * Math.tan(lat1 * r)), U2 = Math.atan((1 - f) * Math.tan(lat2 * r));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let l = L, lp, sS, cS, S, sA, c2A, c2M;
  do {
    const sl = Math.sin(l), cl = Math.cos(l);
    sS = Math.hypot(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl); cS = sU1 * sU2 + cU1 * cU2 * cl; S = Math.atan2(sS, cS);
    sA = (cU1 * cU2 * sl) / sS; c2A = 1 - sA * sA; c2M = c2A ? cS - (2 * sU1 * sU2) / c2A : 0;
    const C = (f / 16) * c2A * (4 + f * (4 - 3 * c2A)); lp = l;
    l = L + (1 - C) * f * sA * (S + C * sS * (c2M + C * cS * (-1 + 2 * c2M * c2M)));
  } while (Math.abs(l - lp) > 1e-13);
  const u2 = (c2A * (a * a - b * b)) / (b * b), A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sS * (c2M + (B / 4) * (cS * (-1 + 2 * c2M * c2M) - (B / 6) * c2M * (-3 + 4 * sS * sS) * (-3 + 4 * c2M * c2M)));
  return b * A * (S - dS);
}
for (const lat of [33.8, 60, -33.8, 0.5]) {
  const o = { lat, lon: 10 }, n = m.toLatLon(o, { x: 0, y: -1000 }), e = m.toLatLon(o, { x: 1000, y: 0 });
  near(vincenty(o.lat, o.lon, n.lat, n.lon), 1000, 0.5, `1 km north at ${lat}° (0.05 %)`);
  near(vincenty(o.lat, o.lon, e.lat, e.lon), 1000, 0.5, `1 km east at ${lat}° (0.05 %)`);
  const back = m.fromLatLon(o, n.lat, e.lon); near(back.x, 1000, 1e-6, 'round trip x'); near(back.y, -1000, 1e-6, 'round trip y');
}
// The old flat 111 320 m per degree was 4 m short over a kilometre north at 33.8°: now within centimetres.
{ const o = { lat: 33.8, lon: -118 }, n = m.toLatLon(o, { x: 0, y: -1000 }); assert.ok(Math.abs(vincenty(o.lat, o.lon, n.lat, n.lon) - 1000) < 0.05, 'within 5 cm per km'); }

// --- tiles in the site's local metres ---------------------------------------
// Place a tile, then find a point inside it by its pixel: the local position (fromLatLon, as the plan uses) must match.
for (const origin of [{ lat: 33.7701, lon: -118.1937 }, { lat: -33.8688, lon: 151.2093 }, { lat: -45.0312, lon: 168.6626 }]) {
  for (const z of [15, 18]) {
    const p = { x: 137.4, y: -212.9 }, ll = m.toLatLon(origin, p), tile = t.tileAt(ll.lat, ll.lon, z);
    const r = t.tileRectLocal(origin, tile.x, tile.y, z);
    assert.ok(r.x1 > r.x0 && r.y1 > r.y0, 'x east, y south: north-west corner first');
    // Across one tile the local frame and Mercator agree to well under a metre (and a pixel).
    const tol = Math.max(0.3, t.groundResolution(origin.lat, z) * 0.5);
    near(r.x0 + (tile.px / 256) * (r.x1 - r.x0), p.x, tol, `local x from the pixel (${origin.lat}, z${z})`);
    near(r.y0 + (tile.py / 256) * (r.y1 - r.y0), p.y, tol, `local y from the pixel (${origin.lat}, z${z})`);
    near(r.x1 - r.x0, 256 * t.groundResolution(ll.lat, z), 0.02 * (r.x1 - r.x0), 'tile width = 256 × ground resolution');
    // Neighbours share their edges exactly.
    const e = t.tileRectLocal(origin, tile.x + 1, tile.y, z), s = t.tileRectLocal(origin, tile.x, tile.y + 1, z);
    near(e.x0, r.x1, 1e-6, 'east neighbour abuts'); near(s.y0, r.y1, 1e-6, 'south neighbour abuts');
  }
}

// --- providers --------------------------------------------------------------
assert.equal(t.tileUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 12, 654, 1583), 'https://tile.openstreetmap.org/12/654/1583.png');
assert.equal(t.tileUrl('https://{s}.example/{z}/{x}/{-y}.png?k={key}', 3, 1, 2, 'a b&c'), 'https://a.example/3/1/5.png?k=a%20b%26c', 'TMS rows, subdomain, encoded key');
const S = { on: true, provider: 'OSM', opacity: 1, maptilerKey: '', mapboxToken: '', customUrl: '', customAttribution: '', customMaxZoom: 19 };
{ const a = t.activeBasemap(S); assert.equal(a.provider.id, 'OSM'); assert.match(a.provider.attribution, /© OpenStreetMap contributors/); assert.equal(a.provider.maxZoom, 19); }
assert.match(t.activeBasemap({ ...S, provider: 'MAPTILER_SAT' }).reason, /needs a key/, 'satellite without a key');
{ const a = t.activeBasemap({ ...S, provider: 'MAPTILER_SAT', maptilerKey: 'abc' }); assert.equal(a.key, 'abc'); assert.match(t.tileUrl(a.provider.url, 1, 0, 0, a.key), /satellite.*key=abc/); }
{ const a = t.activeBasemap({ ...S, provider: 'MAPBOX_SAT', mapboxToken: 'pk.x' }); assert.match(t.tileUrl(a.provider.url, 1, 0, 0, a.key), /mapbox\.satellite\/1\/0\/0.*access_token=pk\.x/); assert.match(a.provider.attribution, /Mapbox.*OpenStreetMap/); }
assert.match(t.activeBasemap({ ...S, provider: 'CUSTOM', customUrl: 'https://x/{z}/{x}.png' }).reason, /\{y\}/, 'custom template needs {y}');
{ const a = t.activeBasemap({ ...S, provider: 'CUSTOM', customUrl: 'http://127.0.0.1:1/{z}/{x}/{y}.png', customAttribution: '© Test' }); assert.equal(a.provider.attribution, '© Test'); }

console.log('map tiles: all tests passed');
