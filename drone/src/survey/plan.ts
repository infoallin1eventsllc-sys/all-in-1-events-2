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
    const xs: number[] = [];
    for (let i = 0; i < local.length; i++) {
      const p = local[i], q = local[(i + 1) % local.length];
      if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
    }
    xs.sort((m, n) => m - n);
    if (xs.length < 2) continue;
    // Concave sites produce several spans on one line; fly the outer extent (one pass, no hopping).
    const x0 = xs[0] - leadInM, x1 = xs[xs.length - 1] + leadInM;
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
  weakClusters(minCells = 3, includeUnseen = false): { cells: number; centre: Pt; extentM: number }[] {
    const seen = new Uint8Array(this.views.length);
    const out: { cells: number; centre: Pt; extentM: number }[] = [];
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
      if (n >= minCells) out.push({ cells: n, centre: { x: sx / n, y: sy / n }, extentM: Math.max(maxX - minX, maxY - minY) + this.cellM });
    }
    return out.sort((a, b) => b.cells - a.cells);
  }
}

/** Short extra capture lines through each weak patch, along the plan's line angle. */
export function gapFillLines(grid: CoverageGrid, plan: SurveyPlan, minCells = 3): FlightLine[] {
  const ang = (plan.params.lineAngleDeg * Math.PI) / 180;
  return grid.weakClusters(minCells, true).slice(0, 8).map(cl => {
    const half = cl.extentM / 2 + plan.footprint.alongM * 0.6;
    return {
      a: { x: cl.centre.x - Math.cos(ang) * half, y: cl.centre.y - Math.sin(ang) * half },
      b: { x: cl.centre.x + Math.cos(ang) * half, y: cl.centre.y + Math.sin(ang) * half },
      pass: 0 as const,
    };
  });
}

// ---- export to the aircraft and to planning tools ---------------------------

export interface GeoOrigin { lat: number; lon: number }

export function toLatLon(o: GeoOrigin, p: Pt): { lat: number; lon: number } {
  return { lat: o.lat - p.y / 111320, lon: o.lon + p.x / (111320 * Math.cos((o.lat * Math.PI) / 180)) };
}
export function fromLatLon(o: GeoOrigin, lat: number, lon: number): Pt {
  return { x: (lon - o.lon) * 111320 * Math.cos((o.lat * Math.PI) / 180), y: -(lat - o.lat) * 111320 };
}

/** MAVLink commands used by a survey mission. */
export const SURVEY_CMD = {
  NAV_WAYPOINT: 16, NAV_RETURN_TO_LAUNCH: 20, NAV_TAKEOFF: 22,
  DO_CHANGE_SPEED: 178, DO_SET_ROI_LOCATION: 195, DO_SET_ROI_NONE: 197, DO_MOUNT_CONTROL: 205, DO_SET_CAM_TRIGG_DIST: 206,
} as const;
/** MAV_FRAME_MISSION: frame for DO_ commands that carry no position. */
export const FRAME_MISSION = 2;
export const FRAME_GLOBAL_RELATIVE_ALT = 3;

export interface SurveyMissionItem { command: number; lat: number; lon: number; altRelM: number; params: [number, number, number, number]; frame: number }

/**
 * The mission the autopilot flies (ArduCopter conventions; the link adds the home item).
 *
 *   TAKEOFF → speed → gimbal pitch → for each line: waypoint at start, camera
 *   trigger on (every triggerM, one photo immediately), waypoint at end, trigger
 *   off (no photos in the turns) → RTL.
 * An orbit locks the camera on the structure with DO_SET_ROI_LOCATION instead.
 */
export function missionItems(plan: SurveyPlan, origin: GeoOrigin): SurveyMissionItem[] {
  const alt = plan.params.altitudeM;
  const cmd = (command: number, params: [number, number, number, number], z = 0): SurveyMissionItem => ({ command, lat: 0, lon: 0, altRelM: z, params, frame: FRAME_MISSION });
  const wp = (p: Pt): SurveyMissionItem => ({ command: SURVEY_CMD.NAV_WAYPOINT, ...toLatLon(origin, p), altRelM: alt, params: [0, 0, 0, NaN], frame: FRAME_GLOBAL_RELATIVE_ALT });
  const items: SurveyMissionItem[] = [
    { command: SURVEY_CMD.NAV_TAKEOFF, lat: 0, lon: 0, altRelM: alt, params: [0, 0, 0, NaN], frame: FRAME_GLOBAL_RELATIVE_ALT },
    cmd(SURVEY_CMD.DO_CHANGE_SPEED, [1, Math.round(plan.speedMps * 10) / 10, -1, 0]),
    // DO_MOUNT_CONTROL: param1 pitch, param7 (z) mount mode 2 = MAVLink targeting.
    cmd(SURVEY_CMD.DO_MOUNT_CONTROL, [plan.gimbalPitchDeg, 0, 0, 0], 2),
  ];
  const trig = Math.round(plan.triggerM * 10) / 10;
  if (plan.params.pattern === 'ORBIT') {
    const c = toLatLon(origin, plan.params.orbit.center);
    items.push({ command: SURVEY_CMD.DO_SET_ROI_LOCATION, ...c, altRelM: 0, params: [0, 0, 0, 0], frame: FRAME_GLOBAL_RELATIVE_ALT });
    items.push(wp(plan.lines[0].a), cmd(SURVEY_CMD.DO_SET_CAM_TRIGG_DIST, [trig, 0, 1, 0]));
    for (const l of plan.lines) items.push(wp(l.b));
    items.push(cmd(SURVEY_CMD.DO_SET_CAM_TRIGG_DIST, [0, 0, 0, 0]), cmd(SURVEY_CMD.DO_SET_ROI_NONE, [0, 0, 0, 0]));
  } else {
    for (const l of plan.lines) {
      items.push(wp(l.a), cmd(SURVEY_CMD.DO_SET_CAM_TRIGG_DIST, [trig, 0, 1, 0]), wp(l.b), cmd(SURVEY_CMD.DO_SET_CAM_TRIGG_DIST, [0, 0, 0, 0]));
    }
  }
  items.push({ command: SURVEY_CMD.NAV_RETURN_TO_LAUNCH, lat: 0, lon: 0, altRelM: 0, params: [0, 0, 0, 0], frame: FRAME_MISSION });
  return items;
}

/** QGroundControl .plan (JSON), which QGC opens directly. */
export function qgcPlan(plan: SurveyPlan, origin: GeoOrigin, home: Pt): object {
  const h = toLatLon(origin, home);
  const items = missionItems(plan, origin).map((it, i) => ({
    type: 'SimpleItem', autoContinue: true, command: it.command, doJumpId: i + 1, frame: it.frame === FRAME_MISSION ? FRAME_MISSION : FRAME_GLOBAL_RELATIVE_ALT,
    params: [...it.params.map(v => (Number.isNaN(v) ? null : v)), it.lat ? +it.lat.toFixed(7) : 0, it.lon ? +it.lon.toFixed(7) : 0, it.altRelM],
    ...(it.frame === FRAME_MISSION ? {} : { Altitude: it.altRelM, AltitudeMode: 1, AMSLAltAboveTerrain: null }),
  }));
  return {
    fileType: 'Plan', version: 1, groundStation: 'All in 1 Drone Command',
    geoFence: { circles: [], polygons: [], version: 2 },
    rallyPoints: { points: [], version: 2 },
    mission: { version: 2, firmwareType: 3, vehicleType: 2, cruiseSpeed: +plan.speedMps.toFixed(1), hoverSpeed: 5, plannedHomePosition: [+h.lat.toFixed(7), +h.lon.toFixed(7), 0], items },
  };
}

/** Mission Planner / QGC "WPL 110" text. Row 0 is home. */
export function wplText(plan: SurveyPlan, origin: GeoOrigin, home: Pt): string {
  const h = toLatLon(origin, home);
  const f = (v: number) => (Number.isNaN(v) ? 0 : v);
  const rows = [`0\t1\t0\t16\t0\t0\t0\t0\t${h.lat.toFixed(7)}\t${h.lon.toFixed(7)}\t0\t1`];
  missionItems(plan, origin).forEach((it, i) => {
    rows.push([i + 1, 0, it.frame, it.command, ...it.params.map(f), it.lat.toFixed(7), it.lon.toFixed(7), it.altRelM, 1].join('\t'));
  });
  return `QGC WPL 110\n${rows.join('\n')}\n`;
}
