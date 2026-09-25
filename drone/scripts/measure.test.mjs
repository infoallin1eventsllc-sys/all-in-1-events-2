// Survey measurements: grades, lengths, areas and cut/fill volumes against known shapes.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const m = await loadModule('../src/survey/measure.ts');
const site = await loadModule('../src/survey/site.ts');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}±${tol}, got ${a}`);

// --- lines on a 5 % plane ---
{
  const plane = (x) => 0.05 * x;
  const L = m.measureLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], (x, y) => plane(x), 1);
  near(L.segments[0].gradePct, 5, 1e-9, 'uphill segment'); near(L.segments[1].gradePct, 0, 1e-9, 'contour segment');
  near(L.horizontalM, 150, 1e-9, 'horizontal length');
  near(L.surfaceM, 100 * Math.hypot(1, 0.05) + 50, 1e-6, 'surface length follows the slope');
  near(L.gradeAvgPct, 5 * 100 / 150, 1e-9, 'length-weighted average grade');
  assert.equal(L.gradeMaxPct, 5); assert.equal(L.gradeMinPct, 0);
  near(L.profile[L.profile.length - 1].d, 150, 1e-9, 'profile runs the whole line'); near(L.elevMax, 5, 1e-9, 'highest point');
  assert.deepEqual(L.vertexD, [0, 100, 150]);
}

// --- volumes ---
{
  // A paraboloid mound, R 20 m, H 6 m, on flat ground: V = π R² H / 2.
  const R = 20, H = 6;
  const mound = (x, y) => { const d2 = (x * x + y * y) / (R * R); return d2 < 1 ? H * (1 - d2) : 0; };
  const ring = Array.from({ length: 48 }, (_, i) => ({ x: 26 * Math.cos(i / 48 * Math.PI * 2), y: 26 * Math.sin(i / 48 * Math.PI * 2) }));
  const a = m.measureArea(ring, mound, { kind: 'PLANE' }, 0.25);
  near(a.cutM3, Math.PI * R * R * H / 2, 25, 'mound volume (π R² H / 2 ≈ 3770 m³)');
  near(a.fillM3, 0, 1, 'nothing below the base'); near(a.elevMax, H, 0.05, 'top of the mound');
  // The same mound on a 3 % slope: the fitted base plane takes the slope out.
  const sloped = (x, y) => mound(x, y) + 0.03 * x;
  const b = m.measureArea(ring, sloped, { kind: 'PLANE' }, 0.25);
  near(b.cutM3, a.cutM3, 25, 'fitted base: the slope is not counted as stockpile');
  const low = m.measureArea(ring, sloped, { kind: 'LOWEST' }, 0.25);
  assert.ok(low.cutM3 > a.cutM3 + 1000, 'lowest-point base counts the wedge of slope too');
  // Levelling a 20 × 20 m pad on a 5 % slope to 0.5 m: 50 m³ cut, 50 m³ fill.
  const pad = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const lv = m.measureArea(pad, (x) => 0.05 * x, { kind: 'DESIGN', level: 0.5 }, 0.25);
  near(lv.cutM3, 50, 0.5, 'cut to level'); near(lv.fillM3, 50, 0.5, 'fill to level'); near(lv.netM3, 0, 0.5, 'balanced');
  near(lv.horizontalM2, 400, 1e-9, 'horizontal area'); near(lv.surfaceM2, 400 * Math.hypot(1, 0.05), 0.5, 'surface area');
}

// --- the demo venue carries what the demo annotations measure ---
{
  const P = site.STOCKPILE;
  const ring = Array.from({ length: 36 }, (_, i) => ({ x: P.x + (P.r + 4) * Math.cos(i / 36 * Math.PI * 2), y: P.y + (P.r + 4) * Math.sin(i / 36 * Math.PI * 2) }));
  const v = m.measureArea(ring, site.surfaceAt, { kind: 'PLANE' }, 0.5);
  const analytic = Math.PI * P.r * P.r * P.h / 2.5;
  assert.ok(Math.abs(v.cutM3 - analytic) / analytic < 0.15, `stockpile ≈ π r² h / 2.5 = ${analytic.toFixed(0)} m³, got ${v.cutM3.toFixed(0)}`);
  const S = site.SWALE;
  const route = m.measureLine([{ x: S.x - S.dy * 7, y: S.y + S.dx * 7 }, { x: S.x, y: S.y }, { x: S.x + S.dy * 7, y: S.y - S.dx * 7 }], site.surfaceAt, 0.5);
  assert.ok(route.gradeMaxPct > 5, `the swale crossing is steeper than an accessible route allows (5 %): ${route.gradeMaxPct.toFixed(1)} %`);
}
console.log('measure: all tests passed');
