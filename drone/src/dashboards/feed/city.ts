import * as THREE from 'three';
import * as T from './textures';

/**
 * The city the patrol camera flies over: 100 m blocks on a 5 × 5 pattern that
 * repeats every 500 m, so an aircraft can patrol forever without reaching an
 * edge. Streets are four lanes with crosswalks and traffic lights; blocks are
 * offices and apartments, parks, surface car parks and one event plaza with a
 * stage and a crowd. Cars follow each other and stop at red lights; people walk
 * the sidewalks.
 *
 * Everything is built for world x, z in [-500, 1000); cameras stay in [0, 500),
 * so whatever they can see (fog closes in by ~450 m) always exists. Moving things
 * are simulated once on the 500 m torus and drawn at all nine repeats.
 *
 * Each surface carries two materials: EO (colour, lit by the sun or the city at
 * night) and IR (thermal: brightness is apparent temperature).
 */

export const B = 100, NB = 5, P = B * NB;
const E0 = -5, E1 = 9;                      // block indices built, inclusive
const ROAD = 7, WALK = 11;                  // half road width; sidewalk inner edge (block-local)
const mod = (a: number, n: number) => ((a % n) + n) % n;
export const wrap = (a: number) => mod(a, P);

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Kind = 'build' | 'park' | 'parking' | 'event';
function blockKind(i: number, j: number): Kind {
  const a = mod(i, NB), b = mod(j, NB);
  if (a === 2 && b === 2) return 'event';
  if ((a === 0 && b === 3) || (a === 4 && b === 1)) return 'park';
  if ((a === 1 && b === 1) || (a === 3 && b === 4)) return 'parking';
  return 'build';
}
/** Centre of the event plaza (in the 0..500 tile): where the patrol starts. */
export const EVENT_CENTER = { x: 2 * B + 50, z: 2 * B + 50 };

// ---- Geometry builder ----------------------------------------------------------
type V = [number, number, number];
class Geo {
  p: number[] = []; n: number[] = []; uv: number[] = []; c: number[] = []; idx: number[] = [];
  quad(o: V, e1: V, e2: V, uv: number[], col: number | V = 1) {
    const b = this.p.length / 3;
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    const pts: V[] = [o, [o[0] + e1[0], o[1] + e1[1], o[2] + e1[2]], [o[0] + e1[0] + e2[0], o[1] + e1[1] + e2[1], o[2] + e1[2] + e2[2]], [o[0] + e2[0], o[1] + e2[1], o[2] + e2[2]]];
    const cc: V = typeof col === 'number' ? [col, col, col] : col;
    for (const q of pts) { this.p.push(q[0], q[1], q[2]); this.n.push(nx / l, ny / l, nz / l); this.c.push(cc[0], cc[1], cc[2]); }
    this.uv.push(...uv);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  tri(a: V, b: V, c: V, col = 1) {
    const i = this.p.length / 3;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx / l, ny / l, nz / l); this.c.push(col, col, col); }
    this.uv.push(0, 0, 1, 0, 0.5, 1);
    this.idx.push(i, i + 1, i + 2);
  }
  /** Horizontal rectangle facing up. */
  up(x0: number, z0: number, x1: number, z1: number, y: number, uvf: (x: number, z: number) => [number, number], col: number | V = 1) {
    this.quad([x0, y, z0], [0, 0, z1 - z0], [x1 - x0, 0, 0], [...uvf(x0, z0), ...uvf(x0, z1), ...uvf(x1, z1), ...uvf(x1, z0)], col);
  }
  /** Vertical wall from A to B; outward is to the left walking A→B seen from above (A→B→C→D order below). */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number, col: number | V = 1) {
    this.quad([ax, y0, az], [bx - ax, 0, bz - az], [0, y1 - y0, 0], [u0, v0, u1, v0, u1, v1, u0, v1], col);
  }
  box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, col: number | V = 1, top = true) {
    const c: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
    for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; this.wall(a[0], a[1], b[0], b[1], y0, y1, 0, 1, 0, 1, col); }
    if (top) this.up(x0, z0, x1, z1, y1, (x, z) => [x / 8, z / 8], col);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    return g;
  }
}

// ---- Materials and looks -----------------------------------------------------------
export type Look = 'DAY' | 'NIGHT' | 'IR_DAY' | 'IR_NIGHT';

interface Surface {
  mesh: THREE.Mesh;
  eo: THREE.Material;
  ir: THREE.MeshLambertMaterial;
  heat: [number, number];                  // day, night (for instanced: a multiplier on the per-instance heat)
  eoCol?: THREE.InstancedBufferAttribute;
  irCol?: THREE.InstancedBufferAttribute;
  night?: boolean;                         // light sources: only drawn at night in EO
  emissive?: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;
}

const lambert = (o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial(o);

function irMat(map?: THREE.Texture, vertexColors = false) {
  return new THREE.MeshLambertMaterial({ map: map ?? null, vertexColors });
}

// ---- Moving things ------------------------------------------------------------------
export interface Car {
  axis: 0 | 1; road: number; dir: 1 | -1; off: number;  // lane
  s: number; v: number; vmax: number; len: number;
  sx: number; sy: number; sz: number;                  // model scale (base car is 4.5 m long)
  x: number; z: number; dx: number; dz: number;        // world pose, derived
  eo: V; heat: number; id: number;
}
export interface Walker {
  bi: number; bj: number; s: number; dir: 1 | -1; speed: number; lat: number; pause: number;
  x: number; z: number; dx: number; dz: number;
  eo: V; id: number;
}

const CAR_COLORS: [V, number][] = [
  [[0.78, 0.78, 0.78], 25], [[0.02, 0.02, 0.022], 20], [[0.14, 0.145, 0.15], 18], [[0.42, 0.43, 0.45], 15],
  [[0.03, 0.07, 0.2], 8], [[0.42, 0.03, 0.03], 8], [[0.1, 0.16, 0.08], 3], [[0.5, 0.42, 0.3], 3],
];
function pickColor(r: number): V {
  let acc = 0; const tot = CAR_COLORS.reduce((a, c) => a + c[1], 0);
  for (const [c, w] of CAR_COLORS) { acc += w / tot; if (r < acc) return c; }
  return CAR_COLORS[0][0];
}
const CLOTHES: V[] = [[0.02, 0.02, 0.025], [0.05, 0.06, 0.1], [0.5, 0.5, 0.48], [0.35, 0.03, 0.03], [0.04, 0.12, 0.3], [0.6, 0.45, 0.05], [0.1, 0.25, 0.1], [0.7, 0.7, 0.68], [0.25, 0.1, 0.3]];

/** Traffic lights: each axis green 13 s, amber 3 s, 1 s all-red. */
function lightFor(axis: 0 | 1, ix: number, iz: number, t: number): 'G' | 'Y' | 'R' {
  const tt = mod(t + mod(ix * 3 + iz * 7, 5) * 6.8, 34);
  if (axis === 0) return tt < 13 ? 'G' : tt < 16 ? 'Y' : 'R';
  return tt < 17 ? 'R' : tt < 30 ? 'G' : tt < 33 ? 'Y' : 'R';
}

// ---- Model geometry ---------------------------------------------------------------
function carGeometry(): THREE.BufferGeometry {
  const g = new Geo();
  const glass = 0.08, tyre: V = [0.03, 0.03, 0.03];
  g.box(-2.25, -0.9, 2.25, 0.9, 0.32, 0.95);                 // body (x = length, z = width)
  // Cabin: sloped glass front and back, painted roof.
  const yb = 0.95, yt = 1.45, fb = 1.1, ft = 0.45, bb = -1.25, bt = -0.95, wb = 0.84, wt = 0.72;
  g.quad([fb, yb, wb], [0, 0, -2 * wb], [ft - fb, yt - yb, 0], [0, 0, 1, 0, 1, 1, 0, 1], glass);     // windscreen
  g.quad([bb, yb, -wb], [0, 0, 2 * wb], [bt - bb, yt - yb, 0], [0, 0, 1, 0, 1, 1, 0, 1], glass);     // rear window
  g.quad([bb, yb, wb], [fb - bb, 0, 0], [0, yt - yb, 0], [0, 0, 1, 0, 1, 1, 0, 1], glass);           // side
  g.quad([fb, yb, -wb], [bb - fb, 0, 0], [0, yt - yb, 0], [0, 0, 1, 0, 1, 1, 0, 1], glass);          // side
  g.up(bt, -wt, ft, wt, yt, () => [0, 0]);                                                           // roof
  for (const x of [-1.45, 1.45]) for (const z of [-0.92, 0.72]) g.box(x - 0.34, z, x + 0.34, z + 0.2, 0, 0.66, tyre, false);
  return g.geometry();
}

function personGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.2, 0.17, 1.4, 6, 1).translate(0, 0.72, 0);
  const shoulders = new THREE.BoxGeometry(0.28, 0.2, 0.48).translate(0, 1.32, 0);
  const head = new THREE.SphereGeometry(0.12, 6, 4).translate(0, 1.58, 0);
  const paint = (g: THREE.BufferGeometry, c: number) => { const n = g.getAttribute('position').count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(c), 3)); return g.toNonIndexed(); };
  return mergeGeos([paint(body, 1), paint(shoulders, 1), paint(head, 0.12)]);
}

function treeGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const r = mulberry(5);
  for (let i = 0; i < p.count; i++) { const k = 0.82 + r() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  g.computeVertexNormals();
  const n = p.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  return g;
}

function lampGeometry(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(-0.1, -0.1, 0.1, 0.1, 0, 8.2);
  g.box(0, -0.05, 2.0, 0.05, 8.0, 8.12);
  g.box(1.55, -0.18, 2.3, 0.18, 7.85, 8.05);
  return g.geometry();
}

function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const arrs = list.map(g => g.getAttribute(name).array as Float32Array);
    const len = arrs.reduce((a, b) => a + b.length, 0);
    const buf = new Float32Array(len); let o = 0;
    for (const a of arrs) { buf.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(buf, 3));
  }
  return out;
}

// Rotation about Y taking local +x to (dx, dz), then scale, then translate — written straight into an instance matrix.
function setMat(a: ArrayLike<number> & { [i: number]: number }, k: number, x: number, y: number, z: number, dx: number, dz: number, sx: number, sy: number, sz: number) {
  const o = k * 16, c = dx, s = -dz;
  a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

/** Instanced mesh with an EO colour attribute and an IR heat attribute. */
function instanced(geo: THREE.BufferGeometry, cap: number, eo: THREE.Material, ir: THREE.MeshLambertMaterial, dynamic: boolean) {
  const m = new THREE.InstancedMesh(geo, eo, cap);
  m.count = 0;
  m.frustumCulled = false;
  const eoCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  const irCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  if (dynamic) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); eoCol.setUsage(THREE.DynamicDrawUsage); irCol.setUsage(THREE.DynamicDrawUsage); }
  m.instanceColor = eoCol;
  void ir;
  return { m, eoCol, irCol };
}

// ---- The city ------------------------------------------------------------------------
export class City {
  group = new THREE.Group();
  cars: Car[] = [];
  walkers: Walker[] = [];
  private surfaces: Surface[] = [];
  private lanes: Car[][] = [];
  private t = 0;
  private carMesh!: ReturnType<typeof instanced>;
  private walkMesh!: ReturnType<typeof instanced>;
  private heads!: THREE.InstancedMesh;
  private tails!: THREE.InstancedMesh;
  private facadeMats: (THREE.MeshLambertMaterial | THREE.MeshPhongMaterial)[] = [];

  constructor(maxAniso = 8) {
    const aniso = Math.min(16, maxAniso);
    const tx = {
      lane: T.laneTex(), xwalk: T.crosswalkTex(), junction: T.junctionTex(), walk: T.sidewalkTex(), pavers: T.paversTex(),
      roof: T.roofTex(), grass: T.grassTex(), parking: T.parkingTex(), park: T.parkTex(), plaza: T.plazaTex(), glow: T.glowTex(), screen: T.screenTex(),
    };
    for (const t of Object.values(tx)) t.anisotropy = aniso;
    const facades = { glass: T.facade('glass'), brick: T.facade('brick'), concrete: T.facade('concrete'), stone: T.facade('stone') };
    for (const f of Object.values(facades)) { f.map.anisotropy = aniso; f.night.anisotropy = aniso; f.ir.anisotropy = aniso; }

    // --- Static geometry, one merged mesh per material ---
    const G = {
      lane: new Geo(), xwalk: new Geo(), junction: new Geo(), walk: new Geo(), pavers: new Geo(), roof: new Geo(), units: new Geo(),
      parking: new Geo(), park: new Geo(), plaza: new Geo(), grass: new Geo(), stage: new Geo(), screen: new Geo(), tent: new Geo(),
      glass: new Geo(), brick: new Geo(), concrete: new Geo(), stone: new Geo(),
    };
    type F = 'glass' | 'brick' | 'concrete' | 'stone';
    const trees: { x: number; z: number; r: number; c: V }[] = [];
    const lamps: { x: number; z: number; dx: number; dz: number }[] = [];
    const parked: { x: number; z: number; dx: number; dz: number; c: V; warm: boolean; big: boolean }[] = [];
    const crowd: { x: number; z: number; dx: number; dz: number; c: V }[] = [];
    const stageGlows: { x: number; z: number; r: number; c: V }[] = [];

    const building = (x0: number, z0: number, x1: number, z1: number, y0: number, floors: number, style: F, rng: () => number) => {
      // Snap the footprint to whole bays so windows meet cleanly at the corners.
      const w = Math.max(T.BAY * 2, Math.floor((x1 - x0) / T.BAY) * T.BAY), d = Math.max(T.BAY * 2, Math.floor((z1 - z0) / T.BAY) * T.BAY);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      x0 = cx - w / 2; x1 = cx + w / 2; z0 = cz - d / 2; z1 = cz + d / 2;
      const h = floors * T.FLOOR, y1 = y0 + h;
      const g = G[style];
      const c: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
      let u = Math.floor(rng() * 4) / 4;
      const v0 = Math.floor(rng() * 4) / 4, v1 = v0 - h / T.FACADE_H;
      for (let k = 0; k < 4; k++) {
        const a = c[k], b = c[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        g.wall(a[0], a[1], b[0], b[1], y0, y1, u, u + len / T.FACADE_W, v0, v1);
        u += len / T.FACADE_W;
      }
      // Roof, parapet and rooftop plant.
      const rt = rng(), roofTint: V = rt < 0.3 ? [1.1, 1.1, 1.08] : rt < 0.55 ? [0.36, 0.36, 0.37] : rt < 0.8 ? [0.72, 0.71, 0.68] : [0.62, 0.55, 0.45];
      G.roof.up(x0, z0, x1, z1, y1, (x, z) => [x / 8, z / 8], roofTint);
      G.units.box(x0, z0, x1, z0 + 0.35, y1, y1 + 0.9, 0.8); G.units.box(x0, z1 - 0.35, x1, z1, y1, y1 + 0.9, 0.8);
      G.units.box(x0, z0, x0 + 0.35, z1, y1, y1 + 0.9, 0.8); G.units.box(x1 - 0.35, z0, x1, z1, y1, y1 + 0.9, 0.8);
      const nu = 1 + Math.floor(rng() * 4);
      for (let k = 0; k < nu; k++) {
        const uw = 2 + rng() * 4, ud = 2 + rng() * 3, uh = 1.2 + rng() * 1.6;
        const ux = x0 + 2 + rng() * Math.max(0.1, w - uw - 4), uz = z0 + 2 + rng() * Math.max(0.1, d - ud - 4);
        G.units.box(ux, uz, ux + uw, uz + ud, y1, y1 + uh, 0.9 + rng() * 0.3);
      }
      if (floors >= 9) { const pw = Math.min(w, d) * 0.35; G.units.box(cx - pw / 2, cz - pw / 2, cx + pw / 2, cz + pw / 2, y1, y1 + 4.2, 0.75); }
    };

    for (let i = E0; i <= E1; i++) for (let j = E0; j <= E1; j++) {
      const X = i * B, Z = j * B, kind = blockKind(i, j);
      const rng = mulberry(mod(i, NB) * 131 + mod(j, NB) * 977 + 7);
      // Junction at the block's north-west corner, then the roads along its north and west edges.
      G.junction.up(X - ROAD, Z - ROAD, X + ROAD, Z + ROAD, 0, (x, z) => [(x - X + ROAD) / 14, (z - Z + ROAD) / 14]);
      const a0 = X + ROAD, a1 = X + B - ROAD, xl = T.XWALK_LEN;
      G.xwalk.up(a0, Z - ROAD, a0 + xl, Z + ROAD, 0, (x, z) => [(x - a0) / xl, (Z + ROAD - z) / 14]);
      G.lane.up(a0 + xl, Z - ROAD, a1 - xl, Z + ROAD, 0, (x, z) => [(x - a0 - xl) / T.ROAD_TILE, (z - Z + ROAD) / 14]);
      G.xwalk.up(a1 - xl, Z - ROAD, a1, Z + ROAD, 0, (x, z) => [(a1 - x) / xl, (z - Z + ROAD) / 14]);
      const b0 = Z + ROAD, b1 = Z + B - ROAD;
      G.xwalk.up(X - ROAD, b0, X + ROAD, b0 + xl, 0, (x, z) => [(z - b0) / xl, (x - X + ROAD) / 14]);
      G.lane.up(X - ROAD, b0 + xl, X + ROAD, b1 - xl, 0, (x, z) => [(z - b0 - xl) / T.ROAD_TILE, (x - X + ROAD) / 14]);
      G.xwalk.up(X - ROAD, b1 - xl, X + ROAD, b1, 0, (x, z) => [(b1 - z) / xl, (X + ROAD - x) / 14]);

      // Sidewalk ring, raised 15 cm with a curb face.
      const s0 = ROAD, s1 = B - ROAD, w0 = WALK, w1 = B - WALK, y = 0.15;
      const wuv = (x: number, z: number): [number, number] => [x / 4, z / 4];
      G.walk.up(X + s0, Z + s0, X + s1, Z + w0, y, wuv); G.walk.up(X + s0, Z + w1, X + s1, Z + s1, y, wuv);
      G.walk.up(X + s0, Z + w0, X + w0, Z + w1, y, wuv); G.walk.up(X + w1, Z + w0, X + s1, Z + w1, y, wuv);
      const cc: [number, number][] = [[X + s0, Z + s0], [X + s0, Z + s1], [X + s1, Z + s1], [X + s1, Z + s0]];
      for (let k = 0; k < 4; k++) { const a = cc[k], b = cc[(k + 1) % 4]; G.walk.wall(a[0], a[1], b[0], b[1], 0, y, 0, 20, 0, 0.04); }

      // Street lamps every 30 m, arm over the road.
      for (const p of [22, 50, 78]) {
        lamps.push({ x: X + p, z: Z + 7.8, dx: 0, dz: -1 }, { x: X + p, z: Z + B - 7.8, dx: 0, dz: 1 });
        lamps.push({ x: X + 7.8, z: Z + p + 11, dx: -1, dz: 0 }, { x: X + B - 7.8, z: Z + p - 11, dx: 1, dz: 0 });
      }
      // Street trees on most blocks.
      if (kind !== 'parking' && rng() < 0.75) {
        const tr = mulberry(mod(i, NB) * 17 + mod(j, NB) * 31 + 3);
        for (let p = 17; p <= 83; p += 11) {
          for (const [x, z] of [[X + p, Z + 8.6], [X + p, Z + B - 8.6], [X + 8.6, Z + p], [X + B - 8.6, Z + p]] as [number, number][]) {
            if (tr() < 0.82) trees.push({ x: x + (tr() - 0.5), z: z + (tr() - 0.5) * 0.4, r: 2.2 + tr() * 1.2, c: [0.05 + tr() * 0.04, 0.1 + tr() * 0.06, 0.03 + tr() * 0.02] });
          }
        }
      }

      const lx = X + WALK, lz = Z + WALK, L = T.LOT;
      if (kind === 'park') {
        G.park.up(lx, lz, lx + L, lz + L, y, (x, z) => [(x - lx) / L, (z - lz) / L]);
        const tr = mulberry(mod(i, NB) * 7 + mod(j, NB) * 11 + 1);
        for (let gx = 3; gx < L - 2; gx += 7.5) for (let gz = 3; gz < L - 2; gz += 7.5) {
          const x = gx + (tr() - 0.5) * 5, z = gz + (tr() - 0.5) * 5;
          if (tr() < 0.72 && !T.PARK.onPath(x, z)) trees.push({ x: lx + x, z: lz + z, r: 2.4 + tr() * 2.2, c: [0.04 + tr() * 0.05, 0.09 + tr() * 0.07, 0.025 + tr() * 0.02] });
        }
      } else if (kind === 'parking') {
        G.parking.up(lx, lz, lx + L, lz + L, y, (x, z) => [(x - lx) / L, (z - lz) / L]);
        const pr = mulberry(mod(i, NB) * 5 + mod(j, NB) * 3 + 9);
        T.PARKING_ROWS.forEach(([z0, z1], r) => {
          for (let x = 3; x + T.STALL_W <= L - 3 + 0.01; x += T.STALL_W) {
            if (pr() > 0.74) continue;
            const f = r % 2 === 0 ? 1 : -1;
            parked.push({ x: lx + x + T.STALL_W / 2, z: lz + (z0 + z1) / 2 + (pr() - 0.5) * 0.3, dx: (pr() - 0.5) * 0.06, dz: f, c: pickColor(pr()), warm: pr() < 0.16, big: pr() < 0.2 });
          }
        });
        // A car park still gets its lamps.
        for (const [x, z] of [[20, 26], [58, 26], [20, 56], [58, 56]]) lamps.push({ x: lx + x, z: lz + z, dx: 1, dz: 0 });
      } else if (kind === 'event') {
        G.plaza.up(lx, lz, lx + L, lz + L, y, (x, z) => [(x - lx) / L, (z - lz) / L]);
        const cx = lx + L / 2;
        // Stage: deck, roof on four posts, two LED walls.
        G.stage.box(cx - 13, lz + 5, cx + 13, lz + 18, y, 1.6, 0.35);
        G.stage.box(cx - 14, lz + 4, cx + 14, lz + 19, 10.2, 10.8, 0.12);
        for (const [px, pz] of [[-13.5, 4.5], [13.5, 4.5], [-13.5, 18.5], [13.5, 18.5]]) G.stage.box(cx + px - 0.3, lz + pz - 0.3, cx + px + 0.3, lz + pz + 0.3, 1.6, 10.2, 0.2);
        for (const sx of [-19, 19]) G.screen.quad([cx + sx - 3.5, 3, lz + 15.25], [7, 0, 0], [0, 4.2, 0], [0, 1, 1, 1, 1, 0, 0, 0]);
        for (const sx of [-19, 19]) G.stage.box(cx + sx - 3.6, lz + 14.6, cx + sx + 3.6, lz + 15.2, 0.15, 7.4, 0.15);
        // Crowd fanned out in front of the stage.
        const cr = mulberry(99);
        let placed = 0, guard = 0;
        while (placed < 320 && guard++ < 6000) {
          const z = 22 + Math.pow(cr(), 1.35) * 34, half = 24 - (z - 22) * 0.3;
          const x = (cr() * 2 - 1) * half;
          if (cr() > 1.05 - (z - 22) / 60) continue;
          const face = Math.atan2(-(z - 8), -x) + (cr() - 0.5) * 0.8;
          crowd.push({ x: cx + x, z: lz + z, dx: Math.cos(face), dz: Math.sin(face), c: CLOTHES[Math.floor(cr() * CLOTHES.length)] });
          placed++;
        }
        // Food tents along the far side.
        for (let k = 0; k < 9; k++) {
          const tx0 = lx + 6 + k * 7.6, tz0 = lz + 66;
          G.tent.box(tx0, tz0, tx0 + 5.2, tz0 + 5.2, y, 2.4, 1, false);
          const A: V = [tx0, 2.4, tz0], Bv: V = [tx0, 2.4, tz0 + 5.2], C: V = [tx0 + 5.2, 2.4, tz0 + 5.2], D: V = [tx0 + 5.2, 2.4, tz0], apex: V = [tx0 + 2.6, 3.9, tz0 + 2.6];
          G.tent.tri(A, Bv, apex, 0.9); G.tent.tri(Bv, C, apex, 0.97); G.tent.tri(C, D, apex, 0.9); G.tent.tri(D, A, apex, 0.84);
        }
        for (const [x, z, c] of [[-10, 26, [0.5, 0.2, 1]], [10, 26, [0.2, 0.6, 1]], [0, 34, [1, 0.3, 0.7]], [-16, 40, [0.3, 0.5, 1]], [16, 40, [0.7, 0.3, 1]]] as [number, number, V][]) stageGlows.push({ x: cx + x, z: lz + z, r: 18, c });
      } else {
        G.pavers.up(lx, lz, lx + L, lz + L, y, (x, z) => [x / 4, z / 4]);
        const r = rng();
        const tallStyle = (): F => (rng() < 0.7 ? 'glass' : 'concrete');
        const lowStyle = (): F => { const q = rng(); return q < 0.45 ? 'brick' : q < 0.75 ? 'stone' : 'concrete'; };
        if (r < 0.25) {
          const pf = 2 + Math.floor(rng() * 2);
          building(lx + 1, lz + 1, lx + L - 1, lz + L - 1, y, pf, rng() < 0.5 ? 'stone' : 'concrete', rng);
          building(lx + 15, lz + 15, lx + L - 15, lz + L - 15, y + pf * T.FLOOR, 5 + Math.floor(rng() * 5), 'glass', rng);
        } else if (r < 0.55) {
          const alongX = rng() < 0.5;
          for (const [p0, p1] of [[0, 36], [42, 78]]) {
            const f = 3 + Math.floor(Math.pow(rng(), 1.6) * 8), inset = rng() * 2;
            const st = f >= 8 ? tallStyle() : lowStyle();
            if (alongX) building(lx + p0 + inset, lz + 1 + inset, lx + p1 - inset, lz + L - 1 - inset, y, f, st, rng);
            else building(lx + 1 + inset, lz + p0 + inset, lx + L - 1 - inset, lz + p1 - inset, y, f, st, rng);
          }
        } else {
          for (const [p0, q0] of [[0, 0], [42, 0], [0, 42], [42, 42]]) {
            if (rng() < 0.16) {
              // A pocket park instead: lawn and a few trees.
              G.grass.up(lx + p0 + 2, lz + q0 + 2, lx + p0 + 34, lz + q0 + 34, y + 0.02, (x, z) => [x / 8, z / 8]);
              for (let n = 0; n < 7; n++) trees.push({ x: lx + p0 + 6 + rng() * 24, z: lz + q0 + 6 + rng() * 24, r: 2.4 + rng() * 1.8, c: [0.05 + rng() * 0.04, 0.1 + rng() * 0.06, 0.03 + rng() * 0.02] });
              continue;
            }
            const f = 2 + Math.floor(Math.pow(rng(), 1.7) * 8), inset = rng() * 2.5;
            building(lx + p0 + inset, lz + q0 + inset, lx + p0 + 36 - inset, lz + q0 + 36 - inset, y, f, f >= 8 ? tallStyle() : lowStyle(), rng);
          }
        }
      }
    }

    // --- Static meshes and their two materials ---
    const addStatic = (geo: Geo, eo: THREE.Material, ir: THREE.MeshLambertMaterial, heat: [number, number], cast = false) => {
      const mesh = new THREE.Mesh(geo.geometry(), eo);
      mesh.receiveShadow = true; mesh.castShadow = cast; mesh.frustumCulled = false;
      this.group.add(mesh);
      this.surfaces.push({ mesh, eo, ir, heat, emissive: (eo as THREE.MeshLambertMaterial).emissiveMap ? (eo as THREE.MeshLambertMaterial) : undefined });
      return mesh;
    };
    addStatic(G.lane, lambert({ map: tx.lane }), irMat(), [0.64, 0.36]);
    addStatic(G.xwalk, lambert({ map: tx.xwalk }), irMat(), [0.64, 0.36]);
    addStatic(G.junction, lambert({ map: tx.junction }), irMat(), [0.66, 0.37]);
    addStatic(G.walk, lambert({ map: tx.walk }), irMat(), [0.55, 0.3]);
    addStatic(G.pavers, lambert({ map: tx.pavers }), irMat(), [0.52, 0.28]);
    addStatic(G.plaza, lambert({ map: tx.plaza }), irMat(), [0.52, 0.28]);
    addStatic(G.parking, lambert({ map: tx.parking }), irMat(), [0.62, 0.34]);
    addStatic(G.park, lambert({ map: tx.park }), irMat(), [0.3, 0.14]);
    addStatic(G.grass, lambert({ map: tx.grass }), irMat(), [0.3, 0.14]);
    addStatic(G.roof, lambert({ map: tx.roof, vertexColors: true }), irMat(), [0.7, 0.18], true);
    addStatic(G.units, lambert({ color: 0x9a9c9e, vertexColors: true }), irMat(undefined, true), [0.62, 0.56], true);
    addStatic(G.stage, lambert({ color: 0x3a3d44, vertexColors: true }), irMat(undefined, true), [0.5, 0.46], true);
    addStatic(G.tent, lambert({ color: 0xf2f2ee, vertexColors: true }), irMat(undefined, true), [0.56, 0.42], true);
    addStatic(G.screen, new THREE.MeshBasicMaterial({ map: tx.screen }), irMat(), [0.66, 0.66]);
    for (const st of ['glass', 'brick', 'concrete', 'stone'] as F[]) {
      const f = facades[st];
      const eo = st === 'glass'
        ? new THREE.MeshPhongMaterial({ map: f.map, emissiveMap: f.night, emissive: 0x000000, specular: 0x4a5560, shininess: 60 })
        : lambert({ map: f.map, emissiveMap: f.night, emissive: 0x000000 });
      this.facadeMats.push(eo);
      addStatic(G[st], eo, irMat(f.ir), [0.78, 0.46], true);
    }

    // --- Static instanced: trees, lamps, parked cars, crowd, light pools ---
    const treeGeo = treeGeometry();
    const canopy = instanced(treeGeo, trees.length, lambert({ vertexColors: true }), irMat(undefined, true), false);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 5).translate(0, 0.5, 0);
    trunkGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(trunkGeo.getAttribute('position').count * 3).fill(1), 3));
    const trunks = instanced(trunkGeo, trees.length, lambert({ vertexColors: true }), irMat(undefined, true), false);
    trees.forEach((t, k) => {
      const ht = 3.2 + t.r * 0.6;
      setMat(canopy.m.instanceMatrix.array, k, t.x, ht + t.r * 0.55, t.z, Math.cos(k), Math.sin(k), t.r, t.r * 0.82, t.r);
      canopy.eoCol.setXYZ(k, ...t.c); canopy.irCol.setXYZ(k, 0.32, 0.32, 0.32);
      setMat(trunks.m.instanceMatrix.array, k, t.x, 0.15, t.z, 1, 0, 1, ht + 0.3, 1);
      trunks.eoCol.setXYZ(k, 0.09, 0.07, 0.05); trunks.irCol.setXYZ(k, 0.36, 0.36, 0.36);
    });
    canopy.m.count = trunks.m.count = trees.length;
    this.addInstanced(canopy, [1, 0.62], true);
    this.addInstanced(trunks, [1, 0.62], true);

    const lampI = instanced(lampGeometry(), lamps.length, lambert({ color: 0x3b3f44 }), irMat(), false);
    lamps.forEach((l, k) => { setMat(lampI.m.instanceMatrix.array, k, l.x, 0.15, l.z, l.dx, l.dz, 1, 1, 1); lampI.eoCol.setXYZ(k, 1, 1, 1); lampI.irCol.setXYZ(k, 0.42, 0.42, 0.42); });
    lampI.m.count = lamps.length;
    this.addInstanced(lampI, [1, 0.9], true);

    const carGeo = carGeometry();
    const parkedI = instanced(carGeo, parked.length, lambert({ vertexColors: true }), irMat(undefined, true), false);
    parked.forEach((c, k) => {
      const l = Math.hypot(c.dx, c.dz);
      const s = c.big ? 1.1 : 1;
      setMat(parkedI.m.instanceMatrix.array, k, c.x, 0.15, c.z, c.dx / l, c.dz / l, s, c.big ? 1.15 : 1, s);
      parkedI.eoCol.setXYZ(k, ...c.c);
      const h = c.warm ? 0.78 : 0.4; parkedI.irCol.setXYZ(k, h, h, h);
    });
    parkedI.m.count = parked.length;
    this.addInstanced(parkedI, [1, 0.72], true);

    const personGeo = personGeometry();
    const crowdI = instanced(personGeo, crowd.length, lambert({ vertexColors: true }), irMat(undefined, true), false);
    crowd.forEach((p, k) => { setMat(crowdI.m.instanceMatrix.array, k, p.x, 0.15, p.z, p.dx, p.dz, 1, 0.92 + ((k * 37) % 13) / 60, 1); crowdI.eoCol.setXYZ(k, ...p.c); crowdI.irCol.setXYZ(k, 1.25, 1.25, 1.25); });
    crowdI.m.count = crowd.length;
    this.addInstanced(crowdI, [1, 1], true);

    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const glowMat = (opacity: number) => new THREE.MeshBasicMaterial({ map: tx.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, vertexColors: false });
    const pools = new THREE.InstancedMesh(plane, glowMat(0.5), lamps.length * 2 + stageGlows.length);
    pools.frustumCulled = false;
    const pc = new THREE.InstancedBufferAttribute(new Float32Array(pools.count * 3), 3);
    let k = 0;
    for (const l of lamps) {
      setMat(pools.instanceMatrix.array, k, l.x + l.dx * 1.9, 0.3, l.z + l.dz * 1.9, 1, 0, 16, 1, 16); pc.setXYZ(k++, 1, 0.72, 0.42);
      setMat(pools.instanceMatrix.array, k, l.x + l.dx * 1.9, 7.8, l.z + l.dz * 1.9, 1, 0, 2.2, 1, 2.2); pc.setXYZ(k++, 1, 0.9, 0.7);
    }
    for (const g of stageGlows) { setMat(pools.instanceMatrix.array, k, g.x, 0.35, g.z, 1, 0, g.r, 1, g.r); pc.setXYZ(k++, ...g.c); }
    pools.instanceColor = pc;
    this.group.add(pools);
    this.surfaces.push({ mesh: pools, eo: pools.material as THREE.Material, ir: irMat(), heat: [0, 0], night: true });

    // --- Traffic ---
    const tr = mulberry(4242);
    let id = 0;
    for (const axis of [0, 1] as const) for (let road = 0; road < NB; road++) for (const dir of [1, -1] as const) for (const off of [1.75, 5.25]) {
      const lane: Car[] = [];
      let s = tr() * 20;
      while (s < P - 12) {
        const q = tr();
        const kind = q < 0.05 ? 'bus' : q < 0.13 ? 'van' : q < 0.4 ? 'suv' : 'car';
        const [len, sx, sy, sz] = kind === 'bus' ? [12, 2.67, 2.1, 1.42] : kind === 'van' ? [6.2, 1.38, 1.55, 1.15] : kind === 'suv' ? [4.9, 1.09, 1.18, 1.08] : [4.5, 1, 1, 1];
        const eo: V = kind === 'bus' ? (tr() < 0.5 ? [0.75, 0.75, 0.72] : [0.08, 0.2, 0.45]) : pickColor(tr());
        lane.push({ axis, road, dir, off, s, v: 8, vmax: kind === 'bus' ? 9 : 11 + tr() * 3.5, len, sx, sy, sz, x: 0, z: 0, dx: 1, dz: 0, eo, heat: 0.85 + tr() * 0.2, id: id++ });
        s += len + 12 + tr() * 36;
      }
      this.lanes.push(lane);
      this.cars.push(...lane);
    }
    this.carMesh = instanced(carGeo, this.cars.length * 9, lambert({ vertexColors: true }), irMat(undefined, true), true);
    this.addInstanced(this.carMesh, [1, 1], true);
    const glowDyn = (op: number) => { const m = new THREE.InstancedMesh(plane, glowMat(op), this.cars.length * 9); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; this.group.add(m); return m; };
    this.heads = glowDyn(0.55); this.tails = glowDyn(0.8);
    (this.heads.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.85, 0.6);
    (this.tails.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.06, 0.03);
    this.surfaces.push({ mesh: this.heads, eo: this.heads.material as THREE.Material, ir: irMat(), heat: [0, 0], night: true });
    this.surfaces.push({ mesh: this.tails, eo: this.tails.material as THREE.Material, ir: irMat(), heat: [0, 0], night: true });

    // --- People on the sidewalks ---
    const wr = mulberry(777);
    for (let bi = 0; bi < NB; bi++) for (let bj = 0; bj < NB; bj++) {
      const n = blockKind(bi, bj) === 'event' ? 34 : blockKind(bi, bj) === 'parking' ? 8 : 18;
      for (let q = 0; q < n; q++) {
        this.walkers.push({ bi, bj, s: wr() * 328, dir: wr() < 0.5 ? 1 : -1, speed: 1.0 + wr() * 0.6, lat: (wr() - 0.5) * 2.6, pause: 0, x: 0, z: 0, dx: 1, dz: 0, eo: CLOTHES[Math.floor(wr() * CLOTHES.length)], id: id++ });
      }
    }
    this.walkMesh = instanced(personGeo, this.walkers.length * 9, lambert({ vertexColors: true }), irMat(undefined, true), true);
    this.addInstanced(this.walkMesh, [1, 1], true);

    this.update(0);
  }

  private addInstanced(i: ReturnType<typeof instanced>, heat: [number, number], cast: boolean) {
    i.m.castShadow = cast; i.m.receiveShadow = true;
    this.group.add(i.m);
    const ir = irMat(undefined, true);
    this.surfaces.push({ mesh: i.m, eo: i.m.material as THREE.Material, ir, heat, eoCol: i.eoCol, irCol: i.irCol });
  }

  /** Switch every surface to the EO or IR material for one render. */
  applyLook(look: Look) {
    const ir = look === 'IR_DAY' || look === 'IR_NIGHT';
    const night = look === 'NIGHT' || look === 'IR_NIGHT';
    for (const sf of this.surfaces) {
      if (sf.night) { sf.mesh.visible = night && !ir; continue; }
      if (ir) {
        const h = sf.heat[night ? 1 : 0];
        sf.ir.color.setScalar(h);
        sf.mesh.material = sf.ir;
        if (sf.irCol) (sf.mesh as THREE.InstancedMesh).instanceColor = sf.irCol;
      } else {
        sf.mesh.material = sf.eo;
        if (sf.eoCol) (sf.mesh as THREE.InstancedMesh).instanceColor = sf.eoCol;
      }
    }
    for (const m of this.facadeMats) { m.emissive.setScalar(night && !ir ? 1 : 0); m.emissiveIntensity = 1.25; }
  }

  /** Advance traffic and people, then lay out every repeat of them. */
  update(dt: number) {
    this.t += dt;
    const t = this.t;
    for (const lane of this.lanes) {
      lane.sort((a, b) => a.s - b.s);
      const n = lane.length;
      for (let q = 0; q < n; q++) {
        const c = lane[q], lead = lane[(q + 1) % n];
        let gap = n > 1 ? mod(lead.s - c.s, P) - (lead.len + c.len) / 2 : 1e9;
        // Next stop line ahead (12 m before each junction centre).
        const m = (Math.floor((c.s + c.len / 2 + 12.3) / B) + 1) * B, stop = m - 12 - (c.s + c.len / 2);
        if (stop > -0.3 && stop < 70) {
          const k = mod(Math.round(m / B), NB);
          const along = c.dir > 0 ? k : mod(NB - k, NB);
          const [ix, iz] = c.axis === 0 ? [along, c.road] : [c.road, along];
          const light = lightFor(c.axis, ix, iz, t);
          if (light === 'R' || (light === 'Y' && stop > (c.v * c.v) / 9 + 1)) gap = Math.min(gap, stop);
        }
        const safe = Math.sqrt(Math.max(0, 2 * 4.2 * (gap - 1.8)));
        c.v = Math.max(0, Math.min(c.v + 2.4 * dt, c.vmax, safe));
      }
      for (const c of lane) {
        c.s = mod(c.s + c.v * dt, P);
        const a = c.dir > 0 ? c.s : P - c.s;
        if (c.axis === 0) { c.x = a; c.z = c.road * B + c.dir * c.off; c.dx = c.dir; c.dz = 0; }
        else { c.z = a; c.x = c.road * B - c.dir * c.off; c.dx = 0; c.dz = c.dir; }
      }
    }
    const L = 82;
    for (const w of this.walkers) {
      if (w.pause > 0) w.pause -= dt;
      else { w.s = mod(w.s + w.dir * w.speed * dt, 4 * L); if (Math.random() < dt * 0.02) w.pause = 2 + Math.random() * 6; }
      const side = Math.floor(w.s / L), u = w.s - side * L;
      let x: number, z: number, dx: number, dz: number;
      if (side === 0) { x = 9 + u; z = 9 + w.lat; dx = 1; dz = 0; }
      else if (side === 1) { x = 91 - w.lat; z = 9 + u; dx = 0; dz = 1; }
      else if (side === 2) { x = 91 - u; z = 91 - w.lat; dx = -1; dz = 0; }
      else { x = 9 + w.lat; z = 91 - u; dx = 0; dz = -1; }
      w.x = w.bi * B + x; w.z = w.bj * B + z; w.dx = dx * w.dir; w.dz = dz * w.dir;
    }
    this.layout();
  }

  private layout() {
    const cm = this.carMesh, ca = cm.m.instanceMatrix.array, ha = this.heads.instanceMatrix.array, ta = this.tails.instanceMatrix.array;
    let k = 0;
    for (const c of this.cars) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const x = c.x + ox * P, z = c.z + oz * P;
      setMat(ca, k, x, 0, z, c.dx, c.dz, c.sx, c.sy, c.sz);
      cm.eoCol.setXYZ(k, c.eo[0], c.eo[1], c.eo[2]);
      const h = c.v > 0.5 ? c.heat : c.heat * 0.9; cm.irCol.setXYZ(k, h, h, h);
      const hl = c.len / 2;
      setMat(ha, k, x + c.dx * (hl + 5.5), 0.25, z + c.dz * (hl + 5.5), c.dx, c.dz, 11, 1, 5);
      setMat(ta, k, x - c.dx * (hl + 0.5), 0.3, z - c.dz * (hl + 0.5), c.dx, c.dz, c.v < 0.5 ? 2.6 : 1.6, 1, 2.4);
      k++;
    }
    cm.m.count = this.heads.count = this.tails.count = k;
    cm.m.instanceMatrix.needsUpdate = true; cm.eoCol.needsUpdate = true; cm.irCol.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true; this.tails.instanceMatrix.needsUpdate = true;

    const wm = this.walkMesh, wa = wm.m.instanceMatrix.array;
    k = 0;
    for (const w of this.walkers) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      setMat(wa, k, w.x + ox * P, 0.15, w.z + oz * P, w.dx, w.dz, 1, 1, 1);
      wm.eoCol.setXYZ(k, w.eo[0], w.eo[1], w.eo[2]); wm.irCol.setXYZ(k, 1.25, 1.25, 1.25);
      k++;
    }
    wm.m.count = k;
    wm.m.instanceMatrix.needsUpdate = true; wm.eoCol.needsUpdate = true; wm.irCol.needsUpdate = true;
  }
}
