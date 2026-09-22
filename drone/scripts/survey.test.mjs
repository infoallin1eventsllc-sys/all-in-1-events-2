// Survey planning: photogrammetry maths, flight lines, coverage and mission export.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const m = await loadModule('../src/survey/plan.ts');
const { SITE } = await loadModule('../src/survey/site.ts');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}±${tol}, got ${a}`);

// --- camera maths ----------------------------------------------------------
// Mavic 3 Enterprise at 60 m: DJI publishes ~1.6 cm/px (GSD = H / 37.5 cm).
const cam = m.CAMERAS.MAVIC_3E;
near(m.gsdCm(cam, 60), 1.6, 0.02, 'Mavic 3E GSD at 60 m');
near(m.gsdCm(cam, 120), 3.2, 0.04, 'GSD scales linearly with altitude');
const fp = m.footprint(cam, 60);
near(fp.acrossM, 84.5, 0.5, 'footprint across'); near(fp.alongM, 63.3, 0.5, 'footprint along');

// --- geometry --------------------------------------------------------------
const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
assert.equal(m.polygonArea(square), 10000);
assert.ok(m.pointInPolygon({ x: 50, y: 50 }, square) && !m.pointInPolygon({ x: 150, y: 50 }, square));
const lines = m.gridLines(square, 20, 0, 5);
assert.equal(lines.length, 5, 'five lines 20 m apart across 100 m');
near(lines[0].a.y, 10, 1e-9, 'first line half a spacing in');
assert.ok(lines[0].a.x < lines[0].b.x && lines[1].a.x > lines[1].b.x, 'serpentine: alternate direction');
near(lines[0].a.x, -5, 1e-9, 'lead-in before the boundary'); near(lines[0].b.x, 105, 1e-9, 'lead-out after');
const rotated = m.gridLines(square, 20, 90, 0);
near(rotated[0].a.x, 90, 1e-6, 'lines at 90° run north–south'); // rot(-90°) maps the square's x range onto y

// --- plans over the real site ---------------------------------------------
const base = { pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E', orbit: { center: { x: 60, y: -70 }, radiusM: 45 } };
const grid = m.planSurvey(SITE.boundary, SITE.home, base);
near(grid.spacingM, 25.3, 0.3, 'line spacing = across × (1 − side)');
near(grid.triggerM, 15.8, 0.3, 'photo spacing = along × (1 − front)');
assert.ok(grid.areaM2 > 120000 && grid.areaM2 < 180000, `site is ~15 ha, got ${grid.areaM2}`);
assert.ok(grid.lines.length >= 11 && grid.lines.length <= 16, `grid lines ${grid.lines.length}`);
assert.equal(grid.legs[0].a, SITE.home, 'plan starts at home');
assert.deepEqual(grid.legs[grid.legs.length - 1].b, SITE.home, 'plan ends at home');
assert.ok(grid.durationS / 60 < m.USABLE_BATTERY_MIN && grid.batteries === 1, `a map fits one battery (${(grid.durationS / 60).toFixed(1)} min)`);
assert.ok(!grid.speedLimited, 'camera keeps up at 10 m/s');
assert.equal(grid.gimbalPitchDeg, -90, 'map is nadir');

const dbl = m.planSurvey(SITE.boundary, SITE.home, { ...base, pattern: 'DOUBLE_GRID' });
assert.ok(dbl.lines.some(l => l.pass === 1) && dbl.lines.length > grid.lines.length * 1.5, 'double grid adds a crossing pass');
assert.ok(dbl.batteries >= 2, 'a 3D model needs a battery swap');
assert.equal(dbl.gimbalPitchDeg, -65);

const orbit = m.planSurvey(SITE.boundary, SITE.home, { ...base, pattern: 'ORBIT', altitudeM: 40 });
assert.equal(orbit.photosEst, m.ORBIT_PHOTOS);
assert.equal(orbit.lines.length, m.ORBIT_PHOTOS, 'one segment per 10°');
near(orbit.gimbalPitchDeg, -41, 1, 'camera tilted at the structure (atan alt/radius)');

// Slow cameras cap the speed.
const slow = m.planSurvey(SITE.boundary, SITE.home, { ...base, camera: 'SONY_A6100', altitudeM: 40, frontOverlap: 0.85, speedMps: 15 });
assert.ok(slow.speedLimited && slow.speedMps <= slow.triggerM / m.CAMERAS.SONY_A6100.minIntervalS + 1e-9, 'speed limited by camera interval');

// --- coverage: flying every planned photo covers the site -------------------
const cov = new m.CoverageGrid(SITE.boundary, 5);
const shots = m.capturePoints(grid);
near(shots.length, grid.photosEst, grid.lines.length, 'capture points match the estimate');
for (const s of shots) cov.addFootprint(s.p, s.headingRad, grid.footprint.acrossM, grid.footprint.alongM);
const st = cov.stats();
assert.ok(st.coveredPct > 99.5, `every cell seen at least once (${st.coveredPct.toFixed(2)}%)`);
assert.ok(st.goodPct > 97, `≥${m.GOOD_VIEWS} views almost everywhere (${st.goodPct.toFixed(2)}%)`);

// Dropping a run of photos opens a weak patch, and gap-fill lines go through it.
const cov2 = new m.CoverageGrid(SITE.boundary, 5);
const mid = Math.floor(shots.length / 2);
const hole = shots[mid].p;
// One line's photos lost is absorbed by overlap (still ~9 views): no weak patch.
const cov1 = new m.CoverageGrid(SITE.boundary, 5);
shots.forEach((s, i) => { if (Math.abs(i - mid) > 5) cov1.addFootprint(s.p, s.headingRad, grid.footprint.acrossM, grid.footprint.alongM); });
assert.ok(cov1.viewsAt(hole) >= m.GOOD_VIEWS, `overlap absorbs one lost run (${cov1.viewsAt(hole)} views)`);
// Every photo within 50 m lost (a gust across several lines) opens a real hole.
shots.forEach(s => { if (Math.hypot(s.p.x - hole.x, s.p.y - hole.y) > 50) cov2.addFootprint(s.p, s.headingRad, grid.footprint.acrossM, grid.footprint.alongM); });
assert.ok(cov2.viewsAt(hole) < m.GOOD_VIEWS, 'the hole is weak');
assert.equal(cov2.weakClusters(3, false).some(c => Math.hypot(c.centre.x - hole.x, c.centre.y - hole.y) < 20 && c.cells > 40), false, 'mid-flight, unseen cells are not called weak');
const weak = cov2.weakClusters(3, true);
assert.ok(weak.some(c => Math.hypot(c.centre.x - hole.x, c.centre.y - hole.y) < 25), 'after capture, the hole is a weak patch');
const fill = m.gapFillLines(cov2, grid);
assert.ok(fill.length >= 1, 'gap-fill produces lines');
assert.ok(fill.some(l => { const t = ((hole.x - l.a.x) * (l.b.x - l.a.x) + (hole.y - l.a.y) * (l.b.y - l.a.y)) / ((l.b.x - l.a.x) ** 2 + (l.b.y - l.a.y) ** 2); const px = l.a.x + t * (l.b.x - l.a.x), py = l.a.y + t * (l.b.y - l.a.y); return t >= 0 && t <= 1 && Math.hypot(px - hole.x, py - hole.y) < grid.footprint.acrossM / 2; }), 'a fill line passes over the hole');

// --- mission -----------------------------------------------------------------
const items = m.missionItems(grid, SITE.origin);
const C = m.SURVEY_CMD;
assert.equal(items[0].command, C.NAV_TAKEOFF, 'AUTO from the ground starts with a takeoff');
assert.equal(items[0].altRelM, 60);
assert.equal(items[items.length - 1].command, C.NAV_RETURN_TO_LAUNCH, 'ends with RTL');
const trig = items.filter(i => i.command === C.DO_SET_CAM_TRIGG_DIST);
assert.equal(trig.length, grid.lines.length * 2, 'camera on and off for every line (no photos in turns)');
near(trig[0].params[0], grid.triggerM, 0.06, 'trigger distance'); assert.equal(trig[0].params[2], 1, 'first photo immediately');
assert.equal(trig[1].params[0], 0, 'trigger off at line end');
assert.ok(trig.every(i => i.frame === m.FRAME_MISSION), 'DO commands use MAV_FRAME_MISSION');
const wps = items.filter(i => i.command === C.NAV_WAYPOINT);
assert.equal(wps.length, grid.lines.length * 2);
const back = m.fromLatLon(SITE.origin, wps[0].lat, wps[0].lon);
near(back.x, grid.lines[0].a.x, 0.01, 'lat/lon round-trip x'); near(back.y, grid.lines[0].a.y, 0.01, 'lat/lon round-trip y');
assert.ok(wps[0].lat > SITE.origin.lat === (grid.lines[0].a.y < 0), 'y is south: negative y is north of the origin');

const orbItems = m.missionItems(orbit, SITE.origin);
assert.ok(orbItems.some(i => i.command === C.DO_SET_ROI_LOCATION) && orbItems.some(i => i.command === C.DO_SET_ROI_NONE), 'orbit locks the camera on the structure');

// QGC plan + WPL
const plan = m.qgcPlan(grid, SITE.origin, SITE.home);
assert.equal(plan.fileType, 'Plan'); assert.equal(plan.mission.firmwareType, 3); assert.equal(plan.mission.items.length, items.length);
assert.ok(plan.mission.items.every(i => i.type === 'SimpleItem' && i.params.length === 7), 'QGC SimpleItems with seven params');
JSON.parse(JSON.stringify(plan));
const wpl = m.wplText(grid, SITE.origin, SITE.home).trim().split('\n');
assert.equal(wpl[0], 'QGC WPL 110'); assert.equal(wpl.length, items.length + 2, 'header + home + items');
assert.ok(wpl.slice(1).every(r => r.split('\t').length === 12), 'twelve tab-separated columns');

console.log('survey planning: all tests passed');

// --- package ----------------------------------------------------------------
{
  const x = await loadModule('../src/survey/exportSurvey.ts');
  const photos = shots.slice(0, 20).map((s, i) => ({ id: i + 1, x: s.p.x, y: s.p.y, altM: 60, headingDeg: 0, pitchDeg: -90, t: 0, line: s.line, ok: i !== 3, reason: i === 3 ? 'Blur' : undefined }));
  const files = x.buildSurveyFiles(grid, photos, cov, SITE.origin, m.CAMERAS.MAVIC_3E);
  const byName = Object.fromEntries(files.map(f => [f.name, new TextDecoder().decode(f.data)]));
  for (const n of ['mission.plan', 'mission.waypoints', 'geotags.csv', 'geo.txt', 'coverage.csv', 'manifest.json', 'README.txt']) assert.ok(byName[n], `package has ${n}`);
  assert.equal(byName['geotags.csv'].trim().split('\n').length, 21, 'header + one row per photo');
  assert.equal(byName['geo.txt'].trim().split('\n').length, 20, 'geo.txt: EPSG line + accepted photos only');
  assert.ok(byName['geo.txt'].startsWith('EPSG:4326\nDJI_0001.JPG -118.'), 'ODM order is lon lat alt');
  assert.ok(byName['geotags.csv'].split('\n')[1].split(',')[4] === '90.0', 'map heading east → compass 90°');
  const mf = JSON.parse(byName['manifest.json']);
  assert.equal(mf.photos.rejected, 1); assert.equal(mf.groundSampleDistanceCm, 1.6);
  JSON.parse(byName['mission.plan']);
}
console.log('survey package: all tests passed');
