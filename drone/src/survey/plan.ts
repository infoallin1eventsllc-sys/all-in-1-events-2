import { metresPerDegree } from '../lib/geo';
import { BRAND } from '../brand';
/**
 * Survey planning: the photogrammetry maths behind the Site survey dashboard.
 *
 * Pure functions, no React, so the numbers can be unit-tested (scripts/survey.test.mjs).
 *
 * Coordinates are local metres in map convention: x east, y south, origin at the
 * site centre. Conversion to WGS84 happens only at the edges (mission upload and
 * export), from an origin that is the aircraft's home fix on a real link.
 *
 * The chain every survey tool uses:
 *   camera + altitude → ground sample distance (cm per pixel) and image footprint
 *   footprint + side overlap  → spacing between flight lines
 *   footprint + front overlap → distance between photos along a line
 *   polygon + spacing + angle → serpentine flight lines, clipped to the site
 */

export interface Pt { x: number; y: number }

// ---- cameras ---------------------------------------------------------------

export interface Camera {
  name: string;
  sensorWmm: number; sensorHmm: number; focalMm: number;
  imageWpx: number; imageHpx: number;
  /** Fastest the camera can take consecutive photos. Limits flight speed. */
  minIntervalS: number;
}

export const CAMERAS = {
  /** DJI Mavic 3 Enterprise wide camera: 4/3" mechanical shutter, the standard mapping drone. */
  MAVIC_3E: { name: 'Mavic 3 Enterprise', sensorWmm: 17.3, sensorHmm: 13.0, focalMm: 12.29, imageWpx: 5280, imageHpx: 3956, minIntervalS: 0.7 },
  /** Sony a6100 with a 16 mm lens on a Pixhawk airframe, triggered by the autopilot. */
  SONY_A6100: { name: 'Pixhawk + Sony a6100', sensorWmm: 23.5, sensorHmm: 15.6, focalMm: 16, imageWpx: 6000, imageHpx: 4000, minIntervalS: 1.0 },
  /** Sony RX100 VII at its wide end: the light 1" mapping camera on small Pixhawk and PX4 quads. */
  SONY_RX100: { name: 'Pixhawk + Sony RX100 VII', sensorWmm: 13.2, sensorHmm: 8.8, focalMm: 8.8, imageWpx: 5472, imageHpx: 3648, minIntervalS: 1.0 },
  /** Sony a7R IV with a 35 mm lens: full-frame, 61 MP, for survey-grade detail from higher up. */
  SONY_A7R4: { name: 'Pixhawk + Sony a7R IV 35 mm', sensorWmm: 35.7, sensorHmm: 23.8, focalMm: 35, imageWpx: 9504, imageHpx: 6336, minIntervalS: 1.2 },
} satisfies Record<string, Camera>;
export type CameraId = keyof typeof CAMERAS;

/** Ground sample distance: how many centimetres of ground one pixel covers. */
export function gsdCm(cam: Camera, altitudeM: number): number {
  return (cam.sensorWmm * altitudeM * 100) / (cam.focalMm * cam.imageWpx);
}

/**
 * Ground footprint of one photo. The camera is mounted landscape with its long
 * side across the flight line, which maximises line spacing (fewer lines, shorter flight).
 */
export function footprint(cam: Camera, altitudeM: number): { acrossM: number; alongM: number } {
  const g = gsdCm(cam, altitudeM) / 100;
  return { acrossM: g * cam.imageWpx, alongM: g * cam.imageHpx };
}

// ---- geometry --------------------------------------------------------------

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const rot = (p: Pt, ang: number): Pt => ({ x: p.x * Math.cos(ang) - p.y * Math.sin(ang), y: p.x * Math.sin(ang) + p.y * Math.cos(ang) });
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** A flight line, flown from `a` to `b`. `pass` 1 is the crossing pass of a double grid. */
export interface FlightLine { a: Pt; b: Pt; pass: 0 | 1 }

/** Where the horizontal line at `y` crosses a polygon: its outer extent (concave sites give several spans; one pass flies them all, no hopping). */
function spanAt(poly: Pt[], y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
  }
  return xs.length < 2 ? null : [Math.min(...xs), Math.max(...xs)];
}

/**
 * Parallel lines across a polygon at `angleDeg` (0 = east–west), `spacingM` apart,
 * clipped to the polygon and extended by `leadInM` at both ends so the first and
 * last photos of a line still overlap the boundary. Serpentine order.
 */
export function gridLines(poly: Pt[], spacingM: number, angleDeg: number, leadInM: number, pass: 0 | 1 = 0): FlightLine[] {
  const ang = (angleDeg * Math.PI) / 180;
  const local = poly.map(p => rot(p, -ang));
  const ys = local.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const lines: FlightLine[] = [];
  // Start half a spacing in: that line's footprint (wider than the spacing) still reaches the edge.
  for (let y = minY + spacingM / 2; y < maxY; y += spacingM) {
    const span = spanAt(local, y);
    if (!span) continue;
    const x0 = span[0] - leadInM, x1 = span[1] + leadInM;
    const fwd = lines.length % 2 === 0;
    const a = rot({ x: fwd ? x0 : x1, y }, ang), b = rot({ x: fwd ? x1 : x0, y }, ang);
    lines.push({ a, b, pass });
  }
  return lines;
}

// ---- plans -----------------------------------------------------------------

export type Pattern = 'GRID' | 'DOUBLE_GRID' | 'ORBIT';

export interface SurveyParams {
  pattern: Pattern;
  altitudeM: number;
  /** 0–1. Consecutive photos along a line. */
  frontOverlap: number;
  /** 0–1. Neighbouring lines. */
  sideOverlap: number;
  speedMps: number;
  /** Direction of the flight lines, degrees from east. */
  lineAngleDeg: number;
  camera: CameraId;
  /** Orbit target (structure) for ORBIT. */
  orbit: { center: Pt; radiusM: number };
}

export interface SurveyPlan {
  params: SurveyParams;
  gsdCm: number;
  footprint: { acrossM: number; alongM: number };
  spacingM: number;
  /** Distance between photos along a capture leg. */
  triggerM: number;
  /** Flight speed after the camera-interval limit. */
  speedMps: number;
  speedLimited: boolean;
  gimbalPitchDeg: number;
  lines: FlightLine[];
  /** Legs from home and back; `capture` legs take photos. */
  legs: Leg[];
  lengthM: number;
  photosEst: number;
  durationS: number;
  areaM2: number;
  batteries: number;
}

export interface Leg { a: Pt; b: Pt; capture: boolean; line: number }

/** Usable flight minutes on one battery after the 25 % landing reserve. */
export const USABLE_BATTERY_MIN = 21;
const CLIMB_MPS = 5;
const TURN_S = 6;
export const ORBIT_PHOTOS = 36;

export function planSurvey(poly: Pt[], home: Pt, params: SurveyParams): SurveyPlan {
  const cam = CAMERAS[params.camera];
  const fp = footprint(cam, params.altitudeM);
  const spacingM = fp.acrossM * (1 - params.sideOverlap);
  let triggerM = fp.alongM * (1 - params.frontOverlap);
  let lines: FlightLine[] = [];
  let gimbal = -90;

  if (params.pattern === 'ORBIT') {
    // One circle around the structure, camera locked on it, a photo every 10°.
    const { center, radiusM } = params.orbit;
    const n = ORBIT_PHOTOS;
    const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: center.x + radiusM * Math.cos((i / n) * Math.PI * 2), y: center.y + radiusM * Math.sin((i / n) * Math.PI * 2) }));
    lines = pts.slice(0, -1).map((p, i) => ({ a: p, b: pts[i + 1], pass: 0 as const }));
    triggerM = (2 * Math.PI * radiusM) / n;
    gimbal = -Math.round((Math.atan2(params.altitudeM, radiusM) * 180) / Math.PI);
  } else {
    const lead = fp.alongM * 0.6;
    lines = gridLines(poly, spacingM, params.lineAngleDeg, lead, 0);
    if (params.pattern === 'DOUBLE_GRID') {
      lines = lines.concat(gridLines(poly, spacingM, params.lineAngleDeg + 90, lead, 1));
      gimbal = -65; // oblique so facades are seen, not just roofs
    }
  }

  // The camera must be able to keep up: interval = trigger distance / speed.
  const maxSpeed = triggerM / cam.minIntervalS;
  const speedMps = Math.min(params.speedMps, maxSpeed);

  const legs: Leg[] = [];
  let at = home;
  lines.forEach((l, i) => {
    if (dist(at, l.a) > 0.5) legs.push({ a: at, b: l.a, capture: false, line: i });
    legs.push({ a: l.a, b: l.b, capture: true, line: i });
    at = l.b;
  });
  legs.push({ a: at, b: home, capture: false, line: -1 });

  const lengthM = legs.reduce((s, g) => s + dist(g.a, g.b), 0);
  const photosEst = params.pattern === 'ORBIT'
    ? ORBIT_PHOTOS
    : lines.reduce((s, l) => s + Math.floor(dist(l.a, l.b) / triggerM) + 1, 0);
  const turns = params.pattern === 'ORBIT' ? 1 : Math.max(0, lines.length - 1);
  const durationS = lengthM / speedMps + turns * TURN_S + (2 * params.altitudeM) / CLIMB_MPS;

  return {
    params, gsdCm: gsdCm(cam, params.altitudeM), footprint: fp, spacingM, triggerM, speedMps, speedLimited: speedMps < params.speedMps - 0.01,
    gimbalPitchDeg: gimbal, lines, legs, lengthM, photosEst, durationS,
    areaM2: polygonArea(poly), batteries: Math.max(1, Math.ceil(durationS / 60 / USABLE_BATTERY_MIN)),
  };
}

/** Every photo position the plan will take, in order. */
export function capturePoints(plan: SurveyPlan): { p: Pt; headingRad: number; line: number }[] {
  const out: { p: Pt; headingRad: number; line: number }[] = [];
  for (const g of plan.legs) {
    if (!g.capture) continue;
    const len = dist(g.a, g.b), h = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x);
    if (plan.params.pattern === 'ORBIT') { out.push({ p: g.a, headingRad: h, line: g.line }); continue; }
    for (let s = 0; s <= len + 1e-6; s += plan.triggerM) out.push({ p: { x: g.a.x + Math.cos(h) * s, y: g.a.y + Math.sin(h) * s }, headingRad: h, line: g.line });
  }
  return out;
}

// ---- coverage --------------------------------------------------------------

/** Views per point needed for a reliable reconstruction (the usual quality-report threshold). */
export const GOOD_VIEWS = 5;

/** A connected weak patch: its cells, centre, largest side and bounding box (cell edges). */
export interface WeakCluster { cells: number; centre: Pt; extentM: number; box: { minX: number; maxX: number; minY: number; maxY: number } }

/**
 * How many photos see each patch of ground inside the site. This is what a
 * photogrammetry quality report shows after processing; computing it during the
 * flight lets the operator re-fly weak patches before leaving the venue.
 */
export class CoverageGrid {
  readonly cellM: number; readonly cols: number; readonly rows: number;
  readonly minX: number; readonly minY: number;
  readonly views: Uint16Array; readonly inside: Uint8Array;
  readonly insideCount: number;
  version = 0;

  constructor(poly: Pt[], cellM = 5) {
    this.cellM = cellM;
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    this.minX = Math.min(...xs) - cellM; this.minY = Math.min(...ys) - cellM;
    this.cols = Math.ceil((Math.max(...xs) + cellM - this.minX) / cellM);
    this.rows = Math.ceil((Math.max(...ys) + cellM - this.minY) / cellM);
    this.views = new Uint16Array(this.cols * this.rows);
    this.inside = new Uint8Array(this.cols * this.rows);
    let n = 0;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (pointInPolygon(this.cellCentre(c, r), poly)) { this.inside[r * this.cols + c] = 1; n++; }
    }
    this.insideCount = n;
  }

  cellCentre(c: number, r: number): Pt { return { x: this.minX + (c + 0.5) * this.cellM, y: this.minY + (r + 0.5) * this.cellM }; }

  /** Count views at a map point (0 outside the grid). */
  viewsAt(p: Pt): number {
    const c = Math.floor((p.x - this.minX) / this.cellM), r = Math.floor((p.y - this.minY) / this.cellM);
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows ? this.views[r * this.cols + c] : 0;
  }

  /** Add one photo: a rectangle `acrossM` × `alongM` centred on `p`, long side across `headingRad`. */
  addFootprint(p: Pt, headingRad: number, acrossM: number, alongM: number) {
    const ca = Math.cos(headingRad), sa = Math.sin(headingRad);
    const hx = alongM / 2, hy = acrossM / 2;
    const ext = Math.abs(hx * ca) + Math.abs(hy * sa), eyt = Math.abs(hx * sa) + Math.abs(hy * ca);
    const c0 = Math.max(0, Math.floor((p.x - ext - this.minX) / this.cellM)), c1 = Math.min(this.cols - 1, Math.floor((p.x + ext - this.minX) / this.cellM));
    const r0 = Math.max(0, Math.floor((p.y - eyt - this.minY) / this.cellM)), r1 = Math.min(this.rows - 1, Math.floor((p.y + eyt - this.minY) / this.cellM));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const q = this.cellCentre(c, r);
      const dx = q.x - p.x, dy = q.y - p.y;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca; // along, across
      if (Math.abs(u) <= hx && Math.abs(v) <= hy) this.views[r * this.cols + c]++;
    }
    this.version++;
  }

  reset() { this.views.fill(0); this.version++; }

  stats() {
    let covered = 0, good = 0, marginal = 0;
    for (let i = 0; i < this.views.length; i++) {
      if (!this.inside[i]) continue;
      const v = this.views[i];
      if (v > 0) covered++;
      if (v >= GOOD_VIEWS) good++; else if (v > 0) marginal++;
    }
    const n = this.insideCount || 1;
    return { covered, good, marginal, gaps: this.insideCount - covered, coveredPct: (covered / n) * 100, goodPct: (good / n) * 100, marginalPct: (marginal / n) * 100 };
  }

  /**
   * Weak patches: connected cells inside the site with fewer than GOOD_VIEWS views.
   * During a flight, cells no photo has touched yet are not weak — the plan has
   * not reached them — so `includeUnseen` is only set once capture is finished.
   */
  weakClusters(minCells = 3, includeUnseen = false): WeakCluster[] {
    const seen = new Uint8Array(this.views.length);
    const out: WeakCluster[] = [];
    const weak = (i: number) => this.inside[i] === 1 && this.views[i] < GOOD_VIEWS && (includeUnseen || this.views[i] > 0);
    for (let i = 0; i < this.views.length; i++) {
      if (seen[i] || !weak(i)) continue;
      const stack = [i]; seen[i] = 1;
      let n = 0, sx = 0, sy = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      while (stack.length) {
        const k = stack.pop()!; const c = k % this.cols, r = (k - c) / this.cols;
        const q = this.cellCentre(c, r); n++; sx += q.x; sy += q.y;
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue;
          const j = rr * this.cols + cc; if (!seen[j] && weak(j)) { seen[j] = 1; stack.push(j); }
        }
      }
      const h = this.cellM / 2;
      if (n >= minCells) out.push({ cells: n, centre: { x: sx / n, y: sy / n }, extentM: Math.max(maxX - minX, maxY - minY) + this.cellM, box: { minX: minX - h, maxX: maxX + h, minY: minY - h, maxY: maxY + h } });
    }
    return out.sort((a, b) => b.cells - a.cells);
  }
}

/**
 * Short extra capture lines over each weak patch, along the plan's line angle: as many
 * as the patch is wide in line spacings, each clipped to the site with the plan's own
 * lead-in, so they overshoot the boundary no further than the plan's lines do.
 * Fly them inside a fence built with them (fencePolygon of the plan plus these lines).
 */
export function gapFillLines(grid: CoverageGrid, plan: SurveyPlan, poly: Pt[], minCells = 3): FlightLine[] {
  const ang = (plan.params.lineAngleDeg * Math.PI) / 180, lead = plan.footprint.alongM * 0.6;
  const local = poly.map(p => rot(p, -ang));
  const out: FlightLine[] = [];
  for (const cl of grid.weakClusters(minCells, true).slice(0, 8)) {
    // The patch's box in the line frame (u along the lines, v across).
    const { minX, maxX, minY, maxY } = cl.box;
    const q = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }].map(p => rot(p, -ang));
    const u0 = Math.min(...q.map(p => p.x)), u1 = Math.max(...q.map(p => p.x)), v0 = Math.min(...q.map(p => p.y)), v1 = Math.max(...q.map(p => p.y));
    const n = Math.max(1, Math.ceil((v1 - v0) / plan.spacingM));
    for (let k = 0; k < n; k++) {
      const v = v0 + ((k + 0.5) * (v1 - v0)) / n;
      const span = spanAt(local, v); if (!span) continue;
      const x0 = Math.max(u0 - lead, span[0] - lead), x1 = Math.min(u1 + lead, span[1] + lead);
      if (x1 - x0 < 1) continue;
      const fwd = k % 2 === 0; // serpentine within a patch
      out.push({ a: rot({ x: fwd ? x0 : x1, y: v }, ang), b: rot({ x: fwd ? x1 : x0, y: v }, ang), pass: 0 });
    }
  }
  return out;
}

// ---- export to the aircraft and to planning tools ---------------------------

export interface GeoOrigin { lat: number; lon: number }

export { metresPerDegree } from '../lib/geo';
/** Local metres (x east, y south) round an origin: equirectangular with the ellipsoid's scale at the origin. */
export function toLatLon(o: GeoOrigin, p: Pt): { lat: number; lon: number } {
  const k = metresPerDegree(o.lat);
  return { lat: o.lat - p.y / k.lat, lon: o.lon + p.x / k.lon };
}
export function fromLatLon(o: GeoOrigin, lat: number, lon: number): Pt {
  const k = metresPerDegree(o.lat);
  return { x: (lon - o.lon) * k.lon, y: -(lat - o.lat) * k.lat };
}

/** MAVLink commands used by a survey mission. */
export const SURVEY_CMD = {
  NAV_WAYPOINT: 16, NAV_RETURN_TO_LAUNCH: 20, NAV_TAKEOFF: 22,
  DO_CHANGE_SPEED: 178, DO_SET_ROI_LOCATION: 195, DO_SET_ROI_NONE: 197, DO_MOUNT_CONTROL: 205, DO_SET_CAM_TRIGG_DIST: 206,
  DO_GIMBAL_MANAGER_PITCHYAW: 1000, NAV_FENCE_POLYGON_VERTEX_INCLUSION: 5001,
} as const;
/** MAV_FRAME_MISSION: frame for DO_ commands that carry no position. */
export const FRAME_MISSION = 2;
export const FRAME_GLOBAL = 0;
export const FRAME_GLOBAL_RELATIVE_ALT = 3;
/** MAV_FRAME_GLOBAL_TERRAIN_ALT: height above the autopilot's own terrain data (ArduPilot with TERRAIN_ENABLE). */
export const FRAME_GLOBAL_TERRAIN_ALT = 10;
/** The most mission items the smallest common flight controllers hold (ArduPilot on F4 boards stores about 700). */
export const MAX_MISSION_ITEMS = 700;

export interface SurveyMissionItem { command: number; lat: number; lon: number; altRelM: number; params: [number, number, number, number]; frame: number }
/** What each item is for, so live MISSION_CURRENT maps back onto the plan. `line` is the plan line (or orbit segment), −1 for none.
 *  Terrain-following waypoints take the role of the item they lead to (mid-line ones LINE_END, the way home RTL). */
export interface ItemRole { kind: 'TAKEOFF' | 'SETUP' | 'LINE_START' | 'LINE_END' | 'TRIGGER_ON' | 'TRIGGER_OFF' | 'RTL'; line: number }
/** Where to pick a survey up again: a line and a point on it (map metres). */
export interface ResumePoint { line: number; at: Pt }

export type MissionAutopilot = 'ARDUPILOT' | 'PX4' | 'UNKNOWN';

// ---- terrain following -----------------------------------------------------------

/**
 * Holding the planned height above ground over land that is not flat. PLANNED sets
 * each waypoint's height above home to AGL + (ground there − ground at home) and adds
 * waypoints wherever the ground between two of them strays from a straight line by
 * more than the tolerance (the autopilot climbs linearly between waypoints). AUTOPILOT
 * sends the AGL in MAV_FRAME_GLOBAL_TERRAIN_ALT and lets ArduPilot follow its own
 * terrain data (TERRAIN_ENABLE and tiles on the SD card); PX4 missions have no terrain frame.
 */
export interface TerrainFollow {
  mode: 'PLANNED' | 'AUTOPILOT';
  /** Ground height at a map point (any fixed datum), NaN where unknown. */
  ground: (p: Pt) => number;
  /** Largest allowed departure from the planned AGL, m. Default followTolerance(AGL). */
  tolM?: number;
}
/** 3 m, or 10 % of the height when that is more. */
export const followTolerance = (aglM: number) => Math.max(3, aglM * 0.1);

/**
 * Points to add between a and b so the ground under a straight climb or descent between
 * them stays within tolM of a straight line: Douglas–Peucker on the ground profile,
 * sampled every stepM. The aircraft's height above ground then departs from the plan
 * by at most tolM (between samples, by what the ground does in stepM). In order a → b.
 */
export function terrainSplits(a: Pt, b: Pt, ground: (p: Pt) => number, tolM: number, stepM = 4): Pt[] {
  const len = dist(a, b), n = Math.max(1, Math.ceil(len / stepM));
  const at = (k: number): Pt => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  const g = Array.from({ length: n + 1 }, (_, k) => ground(at(k)));
  if (!Number.isFinite(g[0]) || !Number.isFinite(g[n])) return [];
  const keep: number[] = [];
  const dp = (i0: number, i1: number) => {
    let worst = -1, dev = tolM;
    for (let k = i0 + 1; k < i1; k++) {
      if (!Number.isFinite(g[k])) continue;
      const d = Math.abs(g[k] - (g[i0] + ((g[i1] - g[i0]) * (k - i0)) / (i1 - i0)));
      if (d > dev) { dev = d; worst = k; }
    }
    if (worst < 0) return;
    dp(i0, worst); keep.push(worst); dp(worst, i1);
  };
  dp(0, n);
  return keep.map(at);
}

/**
 * The mission the autopilot flies, with what each item is for.
 *
 *   TAKEOFF (at home) → speed → gimbal pitch → for each line: waypoint at its start,
 *   camera trigger on (every triggerM, one photo straight away), waypoint at its end,
 *   trigger off (no photos in the turns) → RTL.
 * An orbit locks the camera on the structure with DO_SET_ROI_LOCATION instead.
 *
 * Autopilot differences handled here:
 *   gimbal   ArduPilot takes DO_MOUNT_CONTROL on every version; PX4 1.13+ flies the
 *            gimbal-v2 DO_GIMBAL_MANAGER_PITCHYAW (mount control is deprecated there).
 *   takeoff  carries home's position: ArduCopter ignores it, PX4 validates it.
 *   terrain  `follow` (see TerrainFollow): planned heights and extra waypoints on both, or
 *            ArduPilot's terrain frame; either way the way home ends at a waypoint over home.
 * `from` resumes a survey interrupted by a battery swap: the same setup, then the
 * interrupted line from where it stopped, then the rest.
 */
export function surveyMission(plan: SurveyPlan, origin: GeoOrigin, opts: { autopilot?: MissionAutopilot; home?: Pt; from?: ResumePoint | null; follow?: TerrainFollow | null } = {}): { items: SurveyMissionItem[]; roles: ItemRole[] } {
  const alt = plan.params.altitudeM;
  const px4 = opts.autopilot === 'PX4';
  const items: SurveyMissionItem[] = [], roles: ItemRole[] = [];
  const put = (it: SurveyMissionItem, role: ItemRole) => { items.push(it); roles.push(role); };
  const cmd = (command: number, params: [number, number, number, number], z = 0): SurveyMissionItem => ({ command, lat: 0, lon: 0, altRelM: z, params, frame: FRAME_MISSION });
  // Terrain: PX4 has no terrain frame in missions, so it always gets the planned heights.
  const F = opts.follow ?? null, homeP = opts.home ?? { x: 0, y: 0 };
  const byAutopilot = F?.mode === 'AUTOPILOT' && !px4, planned = !!F && !byAutopilot;
  const gHome = F ? F.ground(homeP) : NaN;
  const G = (p: Pt) => { const v = F!.ground(p); return Number.isFinite(v) ? v : gHome; };
  const tol = F?.tolM ?? followTolerance(alt);
  const altAt = (p: Pt) => (planned && Number.isFinite(gHome) ? Math.round((alt + G(p) - gHome) * 10) / 10 : alt);
  const wp = (p: Pt): SurveyMissionItem => ({ command: SURVEY_CMD.NAV_WAYPOINT, ...toLatLon(origin, p), altRelM: altAt(p), params: [0, 0, 0, NaN], frame: byAutopilot ? FRAME_GLOBAL_TERRAIN_ALT : FRAME_GLOBAL_RELATIVE_ALT });
  // Extra waypoints where the ground between two strays; they share the role of the item they lead to
  // (on a line they read as "capturing line i", on the way to one as "heading for line i").
  let at: Pt = homeP;
  const via = (to: Pt, role: ItemRole) => { if (planned && Number.isFinite(gHome)) for (const q of terrainSplits(at, to, G, tol)) put(wp(q), role); at = to; };
  const setup = (it: SurveyMissionItem) => put(it, { kind: 'SETUP', line: -1 });
  const home = opts.home ? toLatLon(origin, opts.home) : { lat: 0, lon: 0 };
  put({ command: SURVEY_CMD.NAV_TAKEOFF, ...home, altRelM: alt, params: [0, 0, 0, NaN], frame: FRAME_GLOBAL_RELATIVE_ALT }, { kind: 'TAKEOFF', line: -1 });
  setup(cmd(SURVEY_CMD.DO_CHANGE_SPEED, [1, Math.round(plan.speedMps * 10) / 10, -1, 0]));
  // Gimbal pitch. Mount control: param1 pitch, param7 (z) mount mode 2 = MAVLink targeting.
  // Gimbal v2: param1 pitch, param2 yaw (0 = straight ahead), rates unset, flags 0 (yaw follows the aircraft), gimbal 0 = all.
  setup(px4 ? cmd(SURVEY_CMD.DO_GIMBAL_MANAGER_PITCHYAW, [plan.gimbalPitchDeg, 0, NaN, NaN], 0) : cmd(SURVEY_CMD.DO_MOUNT_CONTROL, [plan.gimbalPitchDeg, 0, 0, 0], 2));
  const trig = Math.round(plan.triggerM * 10) / 10;
  const on = (line: number) => put(cmd(SURVEY_CMD.DO_SET_CAM_TRIGG_DIST, [trig, 0, 1, 0]), { kind: 'TRIGGER_ON', line });
  const off = (line: number) => put(cmd(SURVEY_CMD.DO_SET_CAM_TRIGG_DIST, [0, 0, 0, 0]), { kind: 'TRIGGER_OFF', line });
  const first = opts.from ? Math.max(0, Math.min(plan.lines.length - 1, opts.from.line)) : 0;
  if (plan.params.pattern === 'ORBIT') {
    const c = toLatLon(origin, plan.params.orbit.center);
    // The camera looks at the structure's foot: its ground, relative to home, when the terrain is known.
    const roiAlt = F && Number.isFinite(gHome) ? Math.round((G(plan.params.orbit.center) - gHome) * 10) / 10 : 0;
    setup({ command: SURVEY_CMD.DO_SET_ROI_LOCATION, ...c, altRelM: roiAlt, params: [0, 0, 0, 0], frame: FRAME_GLOBAL_RELATIVE_ALT });
    via(plan.lines[first].a, { kind: 'LINE_START', line: first });
    put(wp(plan.lines[first].a), { kind: 'LINE_START', line: first }); on(first);
    for (let i = first; i < plan.lines.length; i++) { via(plan.lines[i].b, { kind: 'LINE_END', line: i }); put(wp(plan.lines[i].b), { kind: 'LINE_END', line: i }); }
    off(plan.lines.length - 1);
    setup(cmd(SURVEY_CMD.DO_SET_ROI_NONE, [0, 0, 0, 0]));
  } else {
    for (let i = first; i < plan.lines.length; i++) {
      const l = plan.lines[i];
      const start = i === first && opts.from ? projectOnSegment(opts.from.at, l.a, l.b) : l.a;
      via(start, { kind: 'LINE_START', line: i });
      put(wp(start), { kind: 'LINE_START', line: i }); on(i);
      via(l.b, { kind: 'LINE_END', line: i });
      put(wp(l.b), { kind: 'LINE_END', line: i }); off(i);
    }
  }
  // Following terrain, the way home follows it too, to a waypoint over home: RTL alone would fly back level
  // at whatever height the last line ended (below home's ground, after a valley).
  if (F && Number.isFinite(gHome)) { via(homeP, { kind: 'RTL', line: -1 }); put(wp(homeP), { kind: 'RTL', line: -1 }); }
  put({ command: SURVEY_CMD.NAV_RETURN_TO_LAUNCH, lat: 0, lon: 0, altRelM: 0, params: [0, 0, 0, 0], frame: FRAME_MISSION }, { kind: 'RTL', line: -1 });
  return { items, roles };
}

/** The mission items only (ArduCopter conventions unless told otherwise; the link adds ArduPilot's home item). */
export function missionItems(plan: SurveyPlan, origin: GeoOrigin, opts: Parameters<typeof surveyMission>[2] = {}): SurveyMissionItem[] {
  return surveyMission(plan, origin, opts).items;
}

/** The closest point on segment a–b to p. */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// ---- geofence ------------------------------------------------------------------

/** Convex hull (monotone chain), counter-clockwise in map axes. */
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * The inclusion fence for a survey: the hull of the site, home and every point the
 * plan flies (lead-ins overshoot the boundary), pushed out by `marginM` so turns and
 * wind drift stay inside. Each hull edge moves out by the margin and the corners are
 * rounded, so the fence stays convex and never comes closer than the margin.
 */
export function fencePolygon(plan: SurveyPlan, boundary: Pt[], home: Pt, marginM = 30): Pt[] {
  const pts = [...boundary, home];
  for (const l of plan.lines) pts.push(l.a, l.b);
  if (plan.params.pattern === 'ORBIT') { const { center, radiusM } = plan.params.orbit; for (let k = 0; k < 16; k++) pts.push({ x: center.x + radiusM * Math.cos(k * Math.PI / 8), y: center.y + radiusM * Math.sin(k * Math.PI / 8) }); }
  const hull = convexHull(pts);
  const n = hull.length, out: Pt[] = [];
  // Hull winding in these axes: outward normal of edge a→b is (dy, −dx) for counter-clockwise.
  const area2 = hull.reduce((s, a, i) => { const b = hull[(i + 1) % n]; return s + a.x * b.y - b.x * a.y; }, 0);
  const sgn = area2 > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const prev = hull[(i + n - 1) % n], a = hull[i], next = hull[(i + 1) % n];
    const nrm = (u: Pt, v: Pt) => { const dx = v.x - u.x, dy = v.y - u.y, L = Math.hypot(dx, dy) || 1; return { x: sgn * dy / L, y: -sgn * dx / L }; };
    const n1 = nrm(prev, a), n2 = nrm(a, next);
    // Round the corner from one edge's normal to the next in steps of ≤ 30°, at the radius that
    // keeps every chord (and the edges between corners) at least the margin away from the hull.
    const a1 = Math.atan2(n1.y, n1.x);
    let turn = Math.atan2(n2.y, n2.x) - a1; while (turn > Math.PI) turn -= 2 * Math.PI; while (turn < -Math.PI) turn += 2 * Math.PI;
    const k = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 6))), step = turn / k, r = marginM / Math.cos(Math.abs(step) / 2);
    for (let j = 0; j <= k; j++) { const t = a1 + step * j; out.push({ x: a.x + Math.cos(t) * r, y: a.y + Math.sin(t) * r }); }
  }
  return out;
}

/** Fence vertices as MAVLink mission items (upload with mission type 1). */
export function fenceItems(poly: Pt[], origin: GeoOrigin): SurveyMissionItem[] {
  return poly.map(p => ({ command: SURVEY_CMD.NAV_FENCE_POLYGON_VERTEX_INCLUSION, ...toLatLon(origin, p), altRelM: 0, params: [poly.length, 0, 0, 0], frame: FRAME_GLOBAL }));
}

/** QGroundControl .plan (JSON), which QGC opens directly. */
export function qgcPlan(plan: SurveyPlan, origin: GeoOrigin, home: Pt, opts: { boundary?: Pt[]; autopilot?: MissionAutopilot; follow?: TerrainFollow | null } = {}): object {
  const h = toLatLon(origin, home);
  const fence = opts.boundary ? fencePolygon(plan, opts.boundary, home).map(p => { const ll = toLatLon(origin, p); return [+ll.lat.toFixed(7), +ll.lon.toFixed(7)]; }) : null;
  // The same items the aircraft is sent, terrain following included; QGC's AltitudeMode 4 is the terrain frame.
  const items = missionItems(plan, origin, { autopilot: opts.autopilot, home, follow: opts.follow }).map((it, i) => ({
    type: 'SimpleItem', autoContinue: true, command: it.command, doJumpId: i + 1, frame: it.frame === FRAME_MISSION || it.frame === FRAME_GLOBAL_TERRAIN_ALT ? it.frame : FRAME_GLOBAL_RELATIVE_ALT,
    params: [...it.params.map(v => (Number.isNaN(v) ? null : v)), it.lat ? +it.lat.toFixed(7) : 0, it.lon ? +it.lon.toFixed(7) : 0, it.altRelM],
    ...(it.frame === FRAME_MISSION ? {} : { Altitude: it.altRelM, AltitudeMode: it.frame === FRAME_GLOBAL_TERRAIN_ALT ? 4 : 1, AMSLAltAboveTerrain: null }),
  }));
  return {
    fileType: 'Plan', version: 1, groundStation: BRAND.name,
    geoFence: { circles: [], polygons: fence ? [{ inclusion: true, polygon: fence, version: 1 }] : [], version: 2 },
    rallyPoints: { points: [], version: 2 },
    mission: { version: 2, firmwareType: opts.autopilot === 'PX4' ? 12 : 3, vehicleType: 2, cruiseSpeed: +plan.speedMps.toFixed(1), hoverSpeed: 5, plannedHomePosition: [+h.lat.toFixed(7), +h.lon.toFixed(7), 0], items },
  };
}

/** Mission Planner / QGC "WPL 110" text. Row 0 is home. */
export function wplText(plan: SurveyPlan, origin: GeoOrigin, home: Pt, opts: { autopilot?: MissionAutopilot; follow?: TerrainFollow | null } = {}): string {
  const h = toLatLon(origin, home);
  const f = (v: number) => (Number.isNaN(v) ? 0 : v);
  const rows = [`0\t1\t0\t16\t0\t0\t0\t0\t${h.lat.toFixed(7)}\t${h.lon.toFixed(7)}\t0\t1`];
  missionItems(plan, origin, { home, autopilot: opts.autopilot, follow: opts.follow }).forEach((it, i) => {
    rows.push([i + 1, 0, it.frame, it.command, ...it.params.map(f), it.lat.toFixed(7), it.lon.toFixed(7), it.altRelM, 1].join('\t'));
  });
  return `QGC WPL 110\n${rows.join('\n')}\n`;
}
