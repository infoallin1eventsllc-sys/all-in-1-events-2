import { pointInPolygon, polygonArea, type Pt } from './plan';

/**
 * Measurements on a finished survey's surface model: what a crew reads off the
 * processed map. Pure functions over a height function, so they are testable
 * (scripts/measure.test.mjs) and the same maths runs on any surface.
 *
 *   Line   surface and horizontal length, the grade of every segment, and a
 *          cross-section (elevation against distance) — road and ramp checks.
 *   Area   horizontal and surface area, highest and lowest point, and the volume
 *          above (cut) and below (fill) a base: stockpiles, levelling a pad.
 */

export type Surface = (x: number, y: number) => number;

// ---- lines ----------------------------------------------------------------------

export interface LineSegment { from: Pt; to: Pt; horizM: number; riseM: number; gradePct: number }
export interface LineMeasure {
  horizontalM: number; surfaceM: number;
  segments: LineSegment[];
  /** Length-weighted mean of the segments' grade (unsigned), and the steepest / gentlest segment. */
  gradeAvgPct: number; gradeMaxPct: number; gradeMinPct: number;
  elevMin: number; elevMax: number;
  /** Elevation every `stepM` along the line: distance from the start, elevation. */
  profile: { d: number; z: number }[];
  /** Distance along the line at each vertex. */
  vertexD: number[];
}

export function measureLine(pts: Pt[], surf: Surface, stepM = 1): LineMeasure {
  const segments: LineSegment[] = [], profile: { d: number; z: number }[] = [], vertexD = [0];
  let horizontalM = 0, surfaceM = 0, d = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / stepM));
    let prevZ = surf(a.x, a.y);
    if (i === 0) profile.push({ d: 0, z: prevZ });
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = surf(x, y);
      surfaceM += Math.hypot(L / n, z - prevZ); prevZ = z;
      profile.push({ d: d + L * t, z });
    }
    const rise = surf(b.x, b.y) - surf(a.x, a.y);
    segments.push({ from: a, to: b, horizM: L, riseM: rise, gradePct: L > 0 ? (rise / L) * 100 : 0 });
    horizontalM += L; d += L; vertexD.push(d);
  }
  const abs = segments.map(s => Math.abs(s.gradePct));
  const zs = profile.map(p => p.z);
  return {
    horizontalM, surfaceM, segments, profile, vertexD,
    gradeAvgPct: horizontalM ? segments.reduce((s, g) => s + Math.abs(g.gradePct) * g.horizM, 0) / horizontalM : 0,
    gradeMaxPct: abs.length ? Math.max(...abs) : 0, gradeMinPct: abs.length ? Math.min(...abs) : 0,
    elevMin: Math.min(...zs), elevMax: Math.max(...zs),
  };
}

// ---- areas and volumes ----------------------------------------------------------------

/**
 * What the volume is measured against:
 *   PLANE   a plane fitted through the boundary's ground (least squares): a stockpile on sloping ground
 *   LOWEST  level with the lowest point on the boundary
 *   DESIGN  a level the crew sets: how much to cut and fill to level a pad
 */
export type BaseKind = 'PLANE' | 'LOWEST' | 'DESIGN';

export interface AreaMeasure {
  horizontalM2: number; surfaceM2: number;
  elevMin: number; elevMax: number;
  /** m³ of material above the base (to remove) and below it (to bring in); net = cut − fill. */
  cutM3: number; fillM3: number; netM3: number;
  /** The base as a function, and its value at the centroid (for DESIGN, the level). */
  base: (x: number, y: number) => number; baseAtCentre: number;
  /** Height above (+) or below (−) the base on a grid: for the cut/fill heatmap. NaN outside. */
  grid: { x0: number; y0: number; cellM: number; cols: number; rows: number; dz: Float32Array };
}

/** Least-squares plane z = a + b·x + c·y through the samples. */
function fitPlane(s: { x: number; y: number; z: number }[]): (x: number, y: number) => number {
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (const p of s) { n++; sx += p.x; sy += p.y; sz += p.z; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sxz += p.x * p.z; syz += p.y * p.z; }
  const mx = sx / n, my = sy / n, mz = sz / n;
  const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my, cxz = sxz / n - mx * mz, cyz = syz / n - my * mz;
  const det = cxx * cyy - cxy * cxy;
  const b = det ? (cxz * cyy - cyz * cxy) / det : 0, c = det ? (cyz * cxx - cxz * cxy) / det : 0;
  return (x, y) => mz + b * (x - mx) + c * (y - my);
}

/** Ground samples every `stepM` along a closed boundary. */
export function perimeterSamples(poly: Pt[], surf: Surface, stepM = 1) {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepM));
    for (let k = 0; k < n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; out.push({ x, y, z: surf(x, y) }); }
  }
  return out;
}

export function measureArea(poly: Pt[], surf: Surface, base: { kind: BaseKind; level?: number }, cellM = 0.5): AreaMeasure {
  const per = perimeterSamples(poly, surf, Math.max(0.5, cellM));
  const baseFn = base.kind === 'PLANE' ? fitPlane(per)
    : base.kind === 'LOWEST' ? (() => { const z = Math.min(...per.map(p => p.z)); return () => z; })()
    : (() => { const z = base.level ?? 0; return () => z; })();
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const cols = Math.max(1, Math.ceil((Math.max(...xs) - x0) / cellM)), rows = Math.max(1, Math.ceil((Math.max(...ys) - y0) / cellM));
  const dz = new Float32Array(cols * rows).fill(NaN);
  let cut = 0, fill = 0, surfA = 0, zMin = Infinity, zMax = -Infinity, area = 0;
  const A = cellM * cellM, h = cellM / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = x0 + (c + 0.5) * cellM, y = y0 + (r + 0.5) * cellM;
    if (!pointInPolygon({ x, y }, poly)) continue;
    const z = surf(x, y), d = z - baseFn(x, y);
    dz[r * cols + c] = d; area += A;
    if (d > 0) cut += d * A; else fill -= d * A;
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    const gx = (surf(x + h, y) - surf(x - h, y)) / cellM, gy = (surf(x, y + h) - surf(x, y - h)) / cellM;
    surfA += A * Math.sqrt(1 + gx * gx + gy * gy);
  }
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length, cy = ys.reduce((s, v) => s + v, 0) / ys.length;
  return {
    horizontalM2: polygonArea(poly), surfaceM2: surfA * (polygonArea(poly) / (area || 1)),
    elevMin: zMin, elevMax: zMax, cutM3: cut, fillM3: fill, netM3: cut - fill,
    base: baseFn, baseAtCentre: baseFn(cx, cy), grid: { x0, y0, cellM, cols, rows, dz },
  };
}

// ---- annotations ------------------------------------------------------------------------

export type AnnotationKind = 'LINE' | 'AREA' | 'POINT';
export interface Annotation {
  id: string; name: string; kind: AnnotationKind; pts: Pt[]; visible: boolean;
  /** AREA: the volume base, and a density for tonnage (t/m³). */
  base?: { kind: BaseKind; level?: number }; density?: number;
  /** LINE: a grade limit to check against (%), e.g. 5 for an accessible route. */
  limitPct?: number;
}

/** Common bulk densities, t/m³ (loose, as stockpiled). */
export const DENSITIES: { label: string; t: number }[] = [
  { label: 'Gravel', t: 1.6 }, { label: 'Sand', t: 1.55 }, { label: 'Crushed rock', t: 1.7 }, { label: 'Topsoil', t: 1.3 }, { label: 'Mulch', t: 0.45 }, { label: 'Rock (in place)', t: 2.6 },
];
