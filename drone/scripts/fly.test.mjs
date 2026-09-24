// FPV fly-through tests: the take's timing, banking, pitch limits, holds and the clearance that
// keeps buildings out of the route, and each city's route clear of its landmarks. Run with `npm test`.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const F = await loadModule('../src/dashboards/feed/fly.ts');
const NY = await loadModule('../src/dashboards/feed/ny.ts');
const LA = await loadModule('../src/dashboards/feed/la.ts');
const SF = await loadModule('../src/dashboards/feed/sf.ts');

// --- timing: the take covers the whole route in exactly its duration, never backing up ------------
{
  const r = new F.FlyRoute({ points: [[0, 10, 0], [0, 10, -400], [300, 60, -700]], dur: 20, easeIn: 2 });
  assert.equal(r.dist(0), 0);
  assert.ok(Math.abs(r.dist(20) - r.length) < 1, `ends at the end: ${r.dist(20)} of ${r.length}`);
  let prev = -1; for (let t = 0; t <= 20; t += 0.05) { const s = r.dist(t); assert.ok(s >= prev - 1e-6, 'never goes backwards'); prev = s; }
  assert.ok(r.dist(1) < r.dist(10) - r.dist(9), 'eases in from a hover');
}

// --- speed weights: a slow stretch takes longer than a fast one of the same length ----------------------
{
  const r = new F.FlyRoute({ points: [[0, 50, 0], [0, 50, -500], [0, 50, -1000]], speed: [0.5, 0.5, 2], dur: 30 });
  const half = r.sOf(1);
  let tHalf = 0; while (r.dist(tHalf) < half) tHalf += 0.05;
  assert.ok(tHalf > 18, `the slow first half takes most of the take (${tHalf.toFixed(1)} s)`);
}

// --- bank: a right turn rolls right, a left turn left; a straight run stays level (bar vibration) ---------
{
  const right = new F.FlyRoute({ points: [[0, 50, 0], [0, 50, -300], [150, 50, -450], [450, 50, -450]], dur: 20 });   // north, then east: a right turn
  const left = new F.FlyRoute({ points: [[0, 50, 0], [0, 50, -300], [-150, 50, -450], [-450, 50, -450]], dur: 20 });
  const tTurn = 10;
  assert.ok(right.pose(tTurn).roll > 0.1, `rolls right into a right turn (${right.pose(tTurn).roll.toFixed(2)})`);
  assert.ok(left.pose(tTurn).roll < -0.1, `rolls left into a left turn (${left.pose(tTurn).roll.toFixed(2)})`);
  const straight = new F.FlyRoute({ points: [[0, 50, 0], [0, 50, -500], [0, 50, -1000]], dur: 20 });
  assert.ok(Math.abs(straight.pose(10).roll) < 0.03, 'level on a straight');
}

// --- pitch: a vertical climb keeps the horizon in frame -------------------------------------------------
{
  const r = new F.FlyRoute({ points: [[0, 10, 0], [0, 12, -100], [0, 300, -110], [0, 310, -400]], dur: 20 });
  for (let t = 0; t <= 20; t += 0.5) {
    const p = r.pose(t), d = p.look.clone().sub(p.pos).normalize();
    assert.ok(Math.asin(d.y) < 0.31 && Math.asin(d.y) > -0.63, `pitch stays within limits at ${t} s`);
  }
}

// --- holds: the camera turns to its subject for the stretch asked ---------------------------------------
{
  const pts = [[0, 50, 0], [0, 50, -300], [0, 50, -600], [0, 50, -900]];
  const free = new F.FlyRoute({ points: pts, dur: 20 });
  const held = new F.FlyRoute({ points: pts, dur: 20, holds: [{ from: 1, to: 2.5, at: [400, 50, -450], weight: 1 }] });
  const look = r => { const p = r.pose(10); return p.look.clone().sub(p.pos).normalize(); };
  assert.ok(look(free).x < 0.05, 'looks down the path without a hold');
  assert.ok(look(held).x > 0.5, 'turns east to the subject during the hold');
}

// --- clearance: a building on the route is capped below it; one off the route is untouched ----------------
{
  const r = new F.FlyRoute({ points: [[0, 40, 0], [0, 40, -500]], dur: 20 });
  assert.ok(r.clearance(-20, -300, 20, -260) <= 31, 'a lot under the route stands below it');
  assert.equal(r.clearance(100, -300, 140, -260), Infinity, 'a lot away from the route is free');
}

// --- each city's take stays clear of its landmarks -----------------------------------------------------
const clearOf = (name, spec, marks) => {
  const r = new F.FlyRoute(spec.route);
  for (let s = 0; s <= r.length; s += 2) {
    const p = r.curve.getPointAt(Math.min(1, s / r.length));
    for (const [x, z, rad, top] of marks) {
      const d = Math.hypot(p.x - x, p.z - z);
      assert.ok(d > rad || p.y > top, `${name}: passes ${d.toFixed(0)} m from a landmark at ${x},${z} at ${p.y.toFixed(0)} m`);
    }
  }
};
{
  const ny = NY.newYorkSpec();
  // ESB (setback shaft, mast), Chrysler, 432 Park, One WTC, the Brooklyn Bridge towers.
  clearOf('New York', ny, [[130, -600, 34, 450], [390, -1000, 30, 320], [390, -1320, 22, 430], [-390, 1320, 44, 545], [1270, 1480, 30, 90], [1780, 1480, 30, 90]]);
  const la = LA.losAngelesSpec();
  clearOf('Los Angeles', la, [[65, -195, 38, 312], [-195, 65, 36, 340], [195, 65, 38, 266], [-195, -325, 28, 235], [455, -195, 26, 150], [-325, -455, 55, 45]]);
  const sf = SF.flySpec();
  clearOf('San Francisco', { route: sf }, [[180, -260, 30, 345], [-180, -620, 26, 255], [-60, -480, 40, 240], [330, 10, 10, 75]]);
  for (const spec of [ny, la]) assert.equal(spec.route.points.length, spec.route.speed.length, `${spec.name}: a speed for every waypoint`);
  assert.equal(sf.points.length, sf.speed.length, 'San Francisco: a speed for every waypoint');
}

console.log('fly-through: all tests passed');
