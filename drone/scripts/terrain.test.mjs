// Terrain: Terrarium decoding, bilinear sampling across tiles, terrain-following missions and the height checks.
import assert from 'assert';
import { encode, decode } from 'fast-png';
import { loadModule } from './bundle.mjs';
const T = await loadModule('../src/survey/terrain.ts');
const m = await loadModule('../src/survey/plan.ts');
const tl = await loadModule('../src/survey/tiles.ts');
const { SITE, heightAt, SITE_DATUM_M } = await loadModule('../src/survey/site.ts');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}±${tol}, got ${a}`);

// --- Terrarium --------------------------------------------------------------
assert.equal(T.terrariumHeight(128, 0, 0), 0, 'sea level is 128,0,0');
assert.equal(T.terrariumHeight(0, 0, 0), -32768);
near(T.terrariumHeight(131, 57, 128), 825.5, 1e-9, 'R·256 + G + B/256 − 32768');
const toRgb = h => { const v = h + 32768; return [Math.floor(v / 256), Math.floor(v) % 256, Math.floor((v - Math.floor(v)) * 256)]; };
for (const h of [-431.2, 0, 11.4, 825.5, 4808.7, 8848.86]) near(T.terrariumHeight(...toRgb(h)), h, 1 / 256, `encode/decode ${h} m`);

// A synthetic tile through a real PNG: RGB, 256 × 256, heights from a function of the pixel.
const tilePng = (z, x, y, fn, channels = 3) => {
  const data = new Uint8Array(256 * 256 * channels);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const ll = tl.pixelToLonLat(x * 256 + i + 0.5, y * 256 + j + 0.5, z), o = (j * 256 + i) * channels;
    data.set(toRgb(fn(ll.lat, ll.lon)), o); if (channels === 4) data[o + 3] = 255;
  }
  return encode({ width: 256, height: 256, data, channels, depth: 8 });
};
{
  const png = tilePng(15, 100, 200, () => 123.25);
  const img = decode(png);
  assert.equal(img.width, 256); assert.equal(img.channels, 3);
  const h = T.decodeTerrarium(img.data, img.width, img.height, img.channels);
  assert.equal(h.length, 65536); assert.ok(h.every(v => v === 123.25), 'every pixel decodes to the height it was given');
  const rgba = decode(tilePng(15, 100, 200, () => -12.5, 4));
  assert.ok(T.decodeTerrarium(rgba.data, 256, 256, rgba.channels).every(v => v === -12.5), 'RGBA too');
}

// loadTerrain over a southern-hemisphere site with a mocked fetch: a plane tilted north–south and east–west.
{
  const origin = { lat: -41.2865, lon: 174.7762 };
  const k = m.metresPerDegree(origin.lat), plane = (lat, lon) => 200 + (lat - origin.lat) * k.lat * 0.05 + (lon - origin.lon) * k.lon * 0.02;
  const site = { origin, home: { x: 0, y: 0 }, boundary: [{ x: -300, y: -200 }, { x: 300, y: -200 }, { x: 300, y: 200 }, { x: -300, y: 200 }] };
  const box = T.terrainBox(site), z = T.terrainZoom(box);
  assert.ok(z >= 14 && z <= 15, `a 600 m site reads zoom 14–15, got ${z}`);
  const fetched = [];
  const terrain = await T.loadTerrain(site, {
    fetchTile: async url => { const [, zz, x, y] = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/).map(Number); fetched.push(url); return tilePng(zz, x, y, plane); },
    decode: async buf => decode(new Uint8Array(buf)),
  });
  assert.equal(fetched.length, tl.tilesCovering(box, z).length, 'each tile once');
  assert.ok(fetched.every(u => u.startsWith('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/')));
  assert.equal(terrain.source, 'TERRARIUM'); assert.ok(terrain.resM > 3 && terrain.resM < 10, `~5 m pixels, got ${terrain.resM}`);
  // Bilinear on a plane is exact (up to the 1/256 m encoding), across tile edges too.
  for (const p of [{ x: 0, y: 0 }, { x: 250, y: -180 }, { x: -299, y: 199 }, { x: 123.4, y: 56.7 }]) {
    const ll = m.toLatLon(origin, p);
    near(terrain.at(p), plane(ll.lat, ll.lon), 0.02, `plane at ${p.x},${p.y}`);
  }
  // North (−y) is higher by 5 %: 100 m north is 5 m up.
  near(terrain.at({ x: 0, y: -100 }) - terrain.at({ x: 0, y: 0 }), 5, 0.05, 'slope north');
  near(terrain.at({ x: 100, y: 0 }) - terrain.at({ x: 0, y: 0 }), 2, 0.05, 'slope east');
  const R = T.terrainRelief(terrain, site.boundary);
  near(R.range, 0.05 * 400 + 0.02 * 600, 1, 'relief across the site');
  // Half the tiles failing still gives terrain, and says so; none loading throws.
  let n = 0;
  const partial = await T.loadTerrain(site, { fetchTile: async url => { if (n++ % 2) throw new Error('503'); const [, zz, x, y] = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/).map(Number); return tilePng(zz, x, y, plane); }, decode: async buf => decode(new Uint8Array(buf)) });
  assert.ok(fetched.length > 1, 'the site spans tiles'); assert.match(partial.label, / of \d+$/, 'partial load is labelled');
  await assert.rejects(T.loadTerrain(site, { fetchTile: async () => { throw new Error('offline'); } }), /no elevation tiles loaded \(offline\)/);
}

// --- terrain following on a synthetic ridge ------------------------------------
// A 600 × 400 m field with a 40 m ridge running north–south through it; lines run east–west, across the ridge.
const ridge = p => 100 + 40 * Math.exp(-((p.x / 70) ** 2));
const field = [{ x: -300, y: -200 }, { x: 300, y: -200 }, { x: 300, y: 200 }, { x: -300, y: 200 }];
const home = { x: -320, y: 180 };
const params = { pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E', orbit: { center: { x: 0, y: 0 }, radiusM: 45 } };
const plan = m.planSurvey(field, home, params);
const origin = { lat: -41.2865, lon: 174.7762 };
const tol = m.followTolerance(60);
assert.equal(tol, 6, '10 % of 60 m'); assert.equal(m.followTolerance(20), 3, 'at least 3 m');

// Splits: none on flat or evenly sloping ground, several over the ridge, and they hold the tolerance.
assert.deepEqual(m.terrainSplits({ x: -300, y: 0 }, { x: 300, y: 0 }, () => 50, 3), [], 'flat: no extra waypoints');
assert.deepEqual(m.terrainSplits({ x: -300, y: 0 }, { x: 300, y: 0 }, p => 50 + p.x * 0.1, 3), [], 'even slope: the straight climb follows it');
{
  const a = { x: -300, y: 0 }, b = { x: 300, y: 0 }, sp = m.terrainSplits(a, b, ridge, tol);
  assert.ok(sp.length >= 2 && sp.length <= 8, `a few waypoints over the ridge, got ${sp.length}`);
  assert.ok(sp.every((p, i) => i === 0 || p.x > sp[i - 1].x), 'in order along the line');
  const pts = [a, ...sp, b];
  for (let x = -300; x <= 300; x += 1) {
    const k = pts.findIndex((p, i) => i > 0 && p.x >= x), p0 = pts[k - 1], p1 = pts[k];
    const lin = ridge(p0) + (ridge(p1) - ridge(p0)) * (x - p0.x) / (p1.x - p0.x);
    assert.ok(Math.abs(lin - ridge({ x, y: 0 })) <= tol + 0.2, `ground within ${tol} m of the climb at x=${x}`);
  }
}

const flat = m.surveyMission(plan, origin, { autopilot: 'ARDUPILOT', home });
const follow = { mode: 'PLANNED', ground: ridge };
const fol = m.surveyMission(plan, origin, { autopilot: 'ARDUPILOT', home, follow });
const wps = r => r.items.map((it, i) => ({ it, role: r.roles[i], p: m.fromLatLon(origin, it.lat, it.lon) })).filter(w => w.it.command === m.SURVEY_CMD.NAV_WAYPOINT);
// Every waypoint: planned AGL + (ground there − ground at home).
for (const w of wps(fol)) near(w.it.altRelM, 60 + ridge(w.p) - ridge(home), 0.051, `waypoint height over the ground at ${w.p.x.toFixed(0)}`);
assert.ok(wps(fol).every(w => w.it.frame === m.FRAME_GLOBAL_RELATIVE_ALT), 'planned heights stay above home');
const perLine = r => { const c = new Map(); for (const w of wps(r)) if (w.role.kind === 'LINE_END') c.set(w.role.line, (c.get(w.role.line) ?? 0) + 1); return c; };
assert.ok([...perLine(flat).values()].every(v => v === 1), 'flat plan: one waypoint per line end');
assert.ok([...perLine(fol).values()].every(v => v >= 3), 'following: extra waypoints on every line across the ridge');
assert.equal(fol.items.filter(i => i.command === m.SURVEY_CMD.DO_SET_CAM_TRIGG_DIST && i.params[0] > 0).map(i => i.params[0]).join(), flat.items.filter(i => i.command === m.SURVEY_CMD.DO_SET_CAM_TRIGG_DIST && i.params[0] > 0).map(i => i.params[0]).join(), 'photo spacing unchanged');
assert.equal(fol.roles.length, fol.items.length);
assert.equal(fol.roles[fol.roles.length - 1].kind, 'RTL'); assert.equal(fol.roles[fol.roles.length - 2].kind, 'RTL', 'the way home ends over home before RTL');
near(fol.items[fol.items.length - 2].altRelM, 60, 0.05, 'over home at the planned height');
// The live view reads extra waypoints as the line they are on: every line still starts, captures and ends in order.
{ const lines = fol.roles.filter(r => r.kind === 'LINE_START' || r.kind === 'LINE_END').map(r => r.line); assert.ok(lines.every((l, i) => i === 0 || l >= lines[i - 1]), 'roles stay in line order'); }

// What it clears: following holds AGL within the tolerance; flying level over the ridge does not.
const cf = T.missionClearance(fol.items, origin, home, ridge), cl = T.missionClearance(flat.items, origin, home, ridge);
assert.ok(cf.minAglM >= 60 - tol - 0.3, `following: lowest ${cf.minAglM.toFixed(1)} m above ground`);
assert.ok(cf.samples.every(s => s.alt - s.ground <= 60 + tol + 0.3), 'following: never more than the tolerance above AGL either');
assert.ok(cf.minAglM >= T.aglFloor(60, tol), 'passes the floor check');
near(cl.minAglM, 20, 1, 'level flight clears the 40 m ridge by only 20 m');
assert.ok(cl.minAglM < T.aglFloor(60, tol), 'and fails the floor check');
near(cf.maxRelM, 60 + 40, 1, 'an altitude fence has to allow the ridge');
// The fence still holds every waypoint.
{ const fence = m.fencePolygon(plan, field, home, 30); assert.ok(wps(fol).every(w => m.pointInPolygon(w.p, fence)), 'every terrain waypoint inside the fence'); }

// ArduPilot terrain frame: AGL sent as is, no extra waypoints (the autopilot follows its own data).
{
  const ap = m.surveyMission(plan, origin, { autopilot: 'ARDUPILOT', home, follow: { ...follow, mode: 'AUTOPILOT' } });
  assert.ok(wps(ap).every(w => w.it.frame === m.FRAME_GLOBAL_TERRAIN_ALT && w.it.altRelM === 60), 'frame 10 at the planned AGL');
  assert.equal(wps(ap).length, wps(flat).length + 1, 'only the waypoint over home added');
  assert.equal(ap.items[0].frame, m.FRAME_GLOBAL_RELATIVE_ALT, 'take-off stays relative to home');
  const c = T.missionClearance(ap.items, origin, home, ridge);
  near(c.minAglM, 60, 0.5, 'terrain frame: AGL held along the lines'); near(c.maxWpAglM, 60, 1e-6);
  // PX4 has no terrain frame in missions: the same request gets planned heights.
  const px = m.surveyMission(plan, origin, { autopilot: 'PX4', home, follow: { ...follow, mode: 'AUTOPILOT' } });
  assert.ok(wps(px).every(w => w.it.frame === m.FRAME_GLOBAL_RELATIVE_ALT), 'PX4: relative frame');
  assert.equal(wps(px).length, wps(fol).length, 'PX4: split like the planned method');
}

// --- 120 m (400 ft) above the ground below, not above home ---------------------------------
{
  // Home on the ridge top at 110 m: level flight is 110 m above home but 150 m above the valley floor.
  const top = { x: 0, y: 180 };
  const p110 = m.planSurvey(field, top, { ...params, altitudeM: 110 });
  const lvl = T.missionClearance(m.surveyMission(p110, origin, { home: top }).items, origin, top, ridge);
  assert.ok(Math.max(...m.surveyMission(p110, origin, { home: top }).items.map(i => i.altRelM)) <= 120, 'every height ≤ 120 m above home…');
  assert.ok(lvl.maxWpAglM > 120, `…but ${lvl.maxWpAglM.toFixed(0)} m above the valley: fails`);
  near(lvl.maxWpAglM, 110 + 40, 1.5, 'waypoint over the valley');
  const f110 = T.missionClearance(m.surveyMission(p110, origin, { home: top, follow }).items, origin, top, ridge);
  assert.ok(f110.maxWpAglM <= 120 && f110.maxWpAglM >= 109.9, `following: ${f110.maxWpAglM.toFixed(1)} m, passes`);
  // Following uphill from a valley home: heights above home pass 120 m while the ground below stays 60 m under.
  const low = { x: -290, y: 180 }, up = T.missionClearance(m.surveyMission(m.planSurvey(field, low, { ...params, altitudeM: 90 }), origin, { home: low, follow }).items, origin, low, ridge);
  assert.ok(up.maxRelM > 120 && up.maxWpAglM <= 90.1, 'over 120 m above home, 90 m above the ground: legal');
}

// --- the demo venue: its own ground, no network ------------------------------------------
{
  const d = T.demoTerrain();
  near(d.at(SITE.home), heightAt(SITE.home.x, SITE.home.y) + SITE_DATUM_M, 1e-9, 'demo ground from site.ts');
  const dp = m.planSurvey(SITE.boundary, SITE.home, params);
  const r = m.surveyMission(dp, SITE.origin, { home: SITE.home, follow: { mode: 'PLANNED', ground: d.at } });
  const c = T.missionClearance(r.items, SITE.origin, SITE.home, d.at);
  assert.ok(!c.missing && c.minAglM > 50 && c.maxWpAglM < 70, `demo: ${c.minAglM.toFixed(1)}–${c.maxWpAglM.toFixed(1)} m above ground`);
  const R = T.terrainRelief(d, SITE.boundary);
  assert.ok(R.range > 5 && R.range < 20, `the venue floor plus the stockpile, got ${R.range.toFixed(1)} m`);
  // Orbit: the camera aims at the structure's foot (its ground relative to home).
  const orb = m.surveyMission(m.planSurvey(SITE.boundary, SITE.home, { ...params, pattern: 'ORBIT', altitudeM: 40, orbit: { center: { x: 60, y: -70 }, radiusM: 45 } }), SITE.origin, { home: SITE.home, follow: { mode: 'PLANNED', ground: d.at } });
  const roi = orb.items.find(i => i.command === m.SURVEY_CMD.DO_SET_ROI_LOCATION);
  near(roi.altRelM, d.at({ x: 60, y: -70 }) - d.at(SITE.home), 0.06, 'ROI at the ground under the structure');
}

console.log('terrain: all tests passed');
