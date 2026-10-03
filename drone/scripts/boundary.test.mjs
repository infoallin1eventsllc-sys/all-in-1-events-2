// Boundary editing on the map: insert, delete and move corners, the checks on the result, and undo history.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const b = await loadModule('../src/survey/boundary.ts');
const m = await loadModule('../src/survey/plan.ts');

const near = (a, c, tol, msg) => assert.ok(Math.abs(a - c) <= tol, `${msg}: expected ${c}±${tol}, got ${a}`);

const site = b.siteFromRing('Field', [{ lat: -33.87, lon: 151.20 }, { lat: -33.87, lon: 151.203 }, { lat: -33.872, lon: 151.203 }, { lat: -33.872, lon: 151.20 }], 'IMPORTED');
const sq = site.boundary;
assert.equal(sq.length, 4);

// Insert: on edge i at its midpoint, as corner i + 1; the last edge closes the ring.
{
  const r = b.insertCorner(sq, 1);
  assert.equal(r.length, 5); assert.deepEqual(r[2], { x: (sq[1].x + sq[2].x) / 2, y: (sq[1].y + sq[2].y) / 2 });
  assert.deepEqual([r[0], r[1], r[3], r[4]], [sq[0], sq[1], sq[2], sq[3]], 'others untouched, in order');
  const last = b.insertCorner(sq, 3);
  assert.deepEqual(last[4], { x: (sq[3].x + sq[0].x) / 2, y: (sq[3].y + sq[0].y) / 2 }, 'closing edge');
  assert.deepEqual(b.insertCorner(sq, 0, { x: 1, y: 2 })[1], { x: 1, y: 2 }, 'at a given point');
  near(m.polygonArea(r), m.polygonArea(sq), 1e-6, 'a midpoint corner changes nothing');
  assert.deepEqual(b.edgeMidpoints(sq)[1], r[2], 'the + handles are those midpoints');
  assert.equal(sq.length, 4, 'pure: the input is not changed');
}
// Delete: never below three corners.
{
  const r = b.deleteCorner(sq, 2);
  assert.equal(r.length, 3); assert.deepEqual(r, [sq[0], sq[1], sq[3]]);
  assert.equal(b.deleteCorner(r, 0), null, 'three corners stay');
  assert.equal(b.checkLocal(site.origin, r).errors.length, 0, 'a triangle is fine');
}
// Move, and the check: dragging a corner across the far edge makes a bow-tie.
{
  const moved = b.moveCorner(sq, 1, { x: sq[1].x + 10, y: sq[1].y - 10 });
  assert.equal(b.checkLocal(site.origin, moved).errors.length, 0);
  assert.deepEqual(moved[0], sq[0]); assert.notDeepEqual(moved[1], sq[1]);
  const bow = b.moveCorner(sq, 1, { x: sq[0].x + 0.3 * (sq[1].x - sq[0].x), y: sq[3].y + 50 }); // the north-east corner dragged past the south edge
  const c = b.checkLocal(site.origin, bow);
  assert.ok(c.errors.some(e => /crosses itself/.test(e)), 'self-intersection refused');
  assert.ok(c.crossing.length >= 1, 'and the crossing edges named');
  for (const [i, j] of c.crossing) assert.ok(i !== j && Math.abs(i - j) > 1, 'non-adjacent edges');
  // Collapsing a corner onto its neighbour leaves too small an area on a thin site.
  const thin = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 12 }, { x: 0, y: 12 }];
  assert.ok(b.checkLocal(site.origin, b.moveCorner(thin, 2, { x: 40, y: 5 })).errors.some(e => /smaller than 20/.test(e)), 'too small refused');
  // The same check as an import: local metres through the site's own origin.
  assert.deepEqual(b.checkLocal(site.origin, sq).errors, b.checkBoundary([{ lat: -33.87, lon: 151.20 }, { lat: -33.87, lon: 151.203 }, { lat: -33.872, lon: 151.203 }, { lat: -33.872, lon: 151.20 }]).errors);
}
// The edited site keeps its origin, home and orbit centre (so the view, plan frame and live home stay put).
{
  const home = { x: 12, y: -8 }, s2 = b.withBoundary({ ...site, home }, b.insertCorner(sq, 0));
  assert.deepEqual(s2.origin, site.origin); assert.deepEqual(s2.home, home); assert.equal(s2.boundary.length, 5); assert.equal(s2.kind, 'IMPORTED');
  const plan = m.planSurvey(s2.boundary, s2.home, { pattern: 'GRID', altitudeM: 60, frontOverlap: 0.75, sideOverlap: 0.7, speedMps: 10, lineAngleDeg: 0, camera: 'MAVIC_3E', orbit: { center: { x: 0, y: 0 }, radiusM: 45 } });
  const fence = m.fencePolygon(plan, s2.boundary, s2.home, 30);
  assert.ok(s2.boundary.every(p => m.pointInPolygon(p, fence)), 'the fence re-computes round the new outline');
}
// Undo history: push, undo, redo, and a run of nudges folded into one step.
{
  let h = b.emptyHistory(), cur = sq;
  const edit = (next, key) => { h = b.historyPush(h, cur, key); cur = next; };
  edit(b.insertCorner(cur, 0));
  edit(b.moveCorner(cur, 1, { x: 5, y: 5 }));
  for (let k = 0; k < 5; k++) edit(b.moveCorner(cur, 2, { x: cur[2].x + 1, y: cur[2].y }), 'nudge:2');
  assert.equal(h.past.length, 3, 'insert, drag, then five nudges as one');
  let u = b.historyUndo(h, cur); h = u.h; cur = u.boundary;
  assert.equal(cur[2].x, sq[1].x, 'undo takes back all five nudges'); assert.equal(h.future.length, 1);
  u = b.historyUndo(h, cur); h = u.h; cur = u.boundary; u = b.historyUndo(h, cur); h = u.h; cur = u.boundary;
  assert.deepEqual(cur, sq, 'back to the start'); assert.equal(b.historyUndo(h, cur), null, 'nothing more to undo');
  u = b.historyRedo(h, cur); h = u.h; cur = u.boundary; assert.equal(cur.length, 5, 'redo the insert');
  edit(b.deleteCorner(cur, 0));
  assert.equal(h.future.length, 0, 'a new edit drops the redo branch');
  assert.equal(b.historyRedo(h, cur), null);
  // A nudge after an undo starts a new step even for the same corner.
  h = b.historyPush(b.emptyHistory(), sq, 'nudge:1'); const hu = b.historyUndo(h, sq).h;
  assert.equal(b.historyPush(hu, sq, 'nudge:1').past.length, 1, 'new step after undo');
}
console.log('boundary editing: all tests passed');
