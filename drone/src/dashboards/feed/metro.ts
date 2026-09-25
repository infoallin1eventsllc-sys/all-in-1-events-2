import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Geo, type Look, type Car } from './city';
import * as T from './textures';
import { FlyRoute, type FlySpec } from './fly';
import type { Mood, ShotState } from './sf';

/**
 * A city for the patrol feed's FPV fly-throughs (New York and Los Angeles; San
 * Francisco has its own world in sf.ts). One class builds any of them from a
 * spec: the street grid with lane-marked roads and sidewalks, blocks filled with
 * buildings in the feed's four facade styles (podiums, shafts and setbacks, lit
 * windows after dark), parks, palms, rooftop water tanks, the low-rise sprawl
 * beyond, water and far hills, traffic with head and tail lights, the city's
 * landmarks, and one continuous FPV take through it all (fly.ts). Any building
 * the take would clip is lowered, so the flight threads the city cleanly.
 *
 * It answers the engine the way the San Francisco world does (scene, cars,
 * update, setDetail, solidOnly, shotAt, applyLook, pose), so the sensor stage,
 * grade, flare, thermal and night vision all run on it unchanged.
 *
 * Coordinates are metres: x east, y up, z south.
 */

type V = [number, number, number];
const MOOD_K: Record<Mood, number> = { DAY: 0, GOLDEN: 1, BLUE: 2 };
export const METRO_CAMERA_FAR = 16000;

export function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const gauss = (x: number, z: number, cx: number, cz: number, r: number, h: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const vhash = (x: number, z: number) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
export function vnoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = vhash(ix, iz), b = vhash(ix + 1, iz), c = vhash(ix, iz + 1), d = vhash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** What the engine drives: the San Francisco world and every Metro answer to this. */
export interface Aerial {
  scene: THREE.Scene;
  cars: Car[];
  walkers: never[];
  update(dt: number): void;
  setDetail(level: number): void;
  solidOnly(on: boolean): void;
  shotAt(time: number, reel?: 'TOUR' | 'FLY'): { shot: { mood: Mood } };
  applyLook(look: Look, mood: Mood): void;
  pose(cam: THREE.PerspectiveCamera, time: number, zoom: number, reel?: 'TOUR' | 'FLY'): ShotState;
}

/** A lot's building: how many floors, which facade, and its massing. */
export interface Lot { floors: number; style: T.FacadeStyle; form?: 'tower' | 'setback' | 'block' }

/** What a spec's landmark builder is handed. */
export interface MetroCtx {
  scene: THREE.Scene;
  glow: THREE.Texture;
  rng: () => number;
  route: FlyRoute;
  /** Add a solid landmark: casts and takes shadows, and gets a thermal stand-in. */
  add<M extends THREE.Mesh>(mesh: M, heat?: number): M;
  /** Shown only at dusk and after dark, in the visible band. */
  night(o: THREE.Object3D): void;
  /** A glowing point (aviation light, crown light, lamp): night only unless `always`. */
  lamp(x: number, y: number, z: number, size: number, color: V, always?: boolean): void;
  /** A textured building mass in the city's own facades. */
  mass(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, style: T.FacadeStyle, tint?: V): void;
  /** Emissive strength by time of day [day, golden hour, blue hour]. */
  glowBy(m: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, k: [number, number, number]): void;
  glass(color?: number, rough?: number): THREE.MeshStandardMaterial;
  metal(color?: number, rough?: number): THREE.MeshStandardMaterial;
}

export interface MetroSpec {
  name: string;
  seed: number;
  /** The take's time of day (night operations force blue hour). */
  mood: Mood;
  sun: Record<Mood, THREE.Vector3>;
  haze: Record<Mood, { color: number; density: number }>;
  /** Street grid: street centre lines at x = i·px (running north-south, width wx) and z = j·pz (east-west, width wz). */
  grid: { px: number; pz: number; wx: number; wz: number };
  /** The built blocks, as grid indices (block i spans x i·px .. (i+1)·px). */
  blocks: { i0: number; i1: number; j0: number; j1: number };
  /** 1 on land, 0 on water, smooth across the shore. */
  land: (x: number, z: number) => number;
  /** Terrain height away from the city (hills, mountains); 0 in the city. */
  height?: (x: number, z: number) => number;
  /** What a block is. */
  block: (i: number, j: number, cx: number, cz: number) => 'built' | 'park' | 'plaza' | 'none';
  /** The building on a lot centred here (null: leave it open). */
  lot: (cx: number, cz: number, r: () => number) => Lot | null;
  /** Circles kept free for landmarks: [x, z, radius]. */
  clear: [number, number, number][];
  /** Ground kept free of the sprawl (freeway corridors, rivers of rail). */
  keepOut?: (x: number, z: number) => boolean;
  landmarks: (c: MetroCtx) => void;
  /** Traffic: grid streets that carry it (x = const lines by index, z = const lines by index), and extra paths (e.g. freeways) with lanes each way. */
  traffic: { avenues: number[]; streets: number[]; paths?: { pts: V[]; lanes: number; width: number }[]; cars: number };
  carColors: [number, number][];
  /** Street trees: palms (Los Angeles) or leafy (New York), every so many metres; 0 for none. */
  trees?: { kind: 'palm' | 'leafy'; every: number };
  waterTanks?: boolean;
  /** Low-rise sprawl beyond the built blocks, drawn as instanced houses on a painted grid. */
  sprawl?: { x0: number; x1: number; z0: number; z1: number; pitch: number; floors: [number, number]; palette: number[] }[];
  paint: { land: string; park: string; hill?: string; street: string };
  size: number;
  route: FlySpec;
}

export class Metro implements Aerial {
  scene = new THREE.Scene();
  cars: Car[] = [];
  walkers: never[] = [];
  readonly spec: MetroSpec;
  readonly route: FlyRoute;
  private sun = new THREE.DirectionalLight(0xffc48a, 2.2);
  private hemi = new THREE.HemisphereLight(0x8ea8d8, 0x4a3a2c, 1.3);
  private fog = new THREE.FogExp2(0x8a7d78, 0.0003);
  private sky: THREE.ShaderMaterial;
  private water: THREE.ShaderMaterial;
  private env: Partial<Record<Mood, THREE.Texture>> = {};
  private renderer: THREE.WebGLRenderer | null;
  private lights!: THREE.Points;
  private lightMat!: THREE.PointsMaterial;
  private glows: { m: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial; k: [number, number, number] }[] = [];
  private irSwap: { mesh: THREE.Mesh | THREE.InstancedMesh; eo: THREE.Material | THREE.Material[]; ir: THREE.Material }[] = [];
  private nightOnly: THREE.Object3D[] = [];
  private carMesh!: THREE.InstancedMesh;
  private carLights!: THREE.InstancedMesh;
  private carPaths: { pts: THREE.Vector3[]; len: number }[] = [];
  private sunDisc: THREE.Sprite;
  private gndMat: THREE.MeshLambertMaterial;
  private t = 0;
  private mood: Mood = 'DAY';
  private forcedNight = false;
  private dur: number;

  constructor(spec: MetroSpec, maxAniso = 8, glow: THREE.Texture, renderer: THREE.WebGLRenderer | null = null) {
    this.spec = spec;
    this.renderer = renderer;
    this.route = new FlyRoute(spec.route);
    this.dur = spec.route.dur;
    const aniso = Math.min(8, maxAniso);
    const rng = mulberry(spec.seed);
    const H = (x: number, z: number) => { const l = spec.land(x, z); return l * (spec.height?.(x, z) ?? 0) + (1 - l) * -9; };
    const { px, pz, wx, wz } = spec.grid, { i0, i1, j0, j1 } = spec.blocks;
    const X0 = i0 * px, X1 = (i1 + 1) * px, Z0 = j0 * pz, Z1 = (j1 + 1) * pz;

    this.scene.fog = this.fog;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shCam = this.sun.shadow.camera as THREE.OrthographicCamera;
    shCam.left = -600; shCam.right = 600; shCam.top = 600; shCam.bottom = -600; shCam.near = 50; shCam.far = 8000; shCam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 1.2;

    // Sky: a dome graded from the horizon under the sun to a deep zenith, with the sun in it.
    this.sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: spec.sun.DAY.clone() }, mood: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 sunDir; uniform float mood; varying vec3 vDir;
        float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec3 pick(vec3 a, vec3 b, vec3 c){ return mix(mix(a, b, clamp(mood, 0.0, 1.0)), c, clamp(mood - 1.0, 0.0, 1.0)); }
        void main(){
          vec3 d = normalize(vDir); float y = clamp(d.y, 0.0, 1.0);
          float toSun = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          vec3 zen = pick(vec3(0.12, 0.32, 0.74), vec3(0.08, 0.13, 0.28), vec3(0.025, 0.035, 0.10));
          vec3 horC = pick(vec3(0.56, 0.7, 0.88), vec3(0.52, 0.48, 0.55), vec3(0.09, 0.10, 0.17));
          vec3 horW = pick(vec3(0.84, 0.88, 0.94), vec3(1.0, 0.56, 0.25), vec3(0.30, 0.18, 0.20));
          vec3 hor = mix(horC, horW, pow(toSun, 2.5));
          vec3 col = mix(hor, zen, pow(y, 0.5));
          float s = max(dot(d, sunDir), 0.0);
          vec3 sunC = pick(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.62, 0.3), vec3(0.5, 0.55, 0.8));
          float glow = pick(vec3(pow(s, 300.0) * 2.0 + pow(s, 10.0) * 0.06), vec3(pow(s, 6.0) * 0.14 + pow(s, 120.0) * 1.2), vec3(pow(s, 40.0) * 0.1)).x;
          col += sunC * glow;
          float day = 1.0 - clamp(mood, 0.0, 1.0);
          vec2 cp = vec2(d.x / max(d.y, 0.08), d.z / max(d.y, 0.08));
          float cir = 0.0; { vec2 p = cp * 0.9 + vec2(11.0, 3.0); float amp = 0.5; for (int i = 0; i < 4; i++) { cir += amp * hash(floor(p * vec2(6.0, 1.3))); p = p * 2.1 + 3.7; amp *= 0.5; } }
          cir = smoothstep(0.62, 0.9, cir) * smoothstep(0.03, 0.25, d.y) * (1.0 - smoothstep(0.5, 0.9, d.y));
          col = mix(col, vec3(0.92, 0.94, 0.97), cir * 0.5 * day);
          float b = clamp(mood - 1.0, 0.0, 1.0);
          col += step(0.9985, hash(floor(d.xz * 900.0 / max(d.y, 0.05)))) * y * b * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(15000, 40, 20), this.sky));
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.0, 0.7, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunDisc.scale.setScalar(900); this.scene.add(this.sunDisc);

    // Ground: a heightfield (the shore dropping under the water, hills beyond the city), painted from a map.
    const SIZE = spec.size, SEG = 360;
    const gnd = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); gnd.rotateX(-Math.PI / 2);
    const gp = gnd.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < gp.count; i++) gp.setY(i, H(gp.getX(i), gp.getZ(i)) - 0.4);
    gnd.computeVertexNormals();
    const mapTex = new THREE.CanvasTexture(this.paintMap(SIZE, H)); mapTex.anisotropy = aniso; mapTex.colorSpace = THREE.SRGBColorSpace;
    this.gndMat = new THREE.MeshLambertMaterial({ map: mapTex });
    const ground = new THREE.Mesh(gnd, this.gndMat); ground.receiveShadow = true; this.scene.add(ground);
    this.irSwap.push({ mesh: ground, eo: this.gndMat, ir: new THREE.MeshLambertMaterial({ color: 0x8a8a8a }) });

    // Water: reflecting the sky, with the sun's glitter on it.
    this.water = new THREE.ShaderMaterial({
      fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), sunDir: { value: spec.sun.DAY.clone() }, time: { value: 0 }, mood: { value: 0 } },
      vertexShader: `#include <fog_pars_vertex>
        varying vec3 vWorld;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `#include <fog_pars_fragment>
        uniform vec3 sunDir; uniform float time; uniform float mood; varying vec3 vWorld;
        float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec3 pick(vec3 a, vec3 b, vec3 c){ return mix(mix(a, b, clamp(mood, 0.0, 1.0)), c, clamp(mood - 1.0, 0.0, 1.0)); }
        void main(){
          vec3 V = normalize(cameraPosition - vWorld);
          float a = sin(vWorld.x * 0.09 + time * 1.3) + sin(vWorld.z * 0.11 - time * 1.0) + sin((vWorld.x - vWorld.z) * 0.05 + time * 0.7);
          float b = cos(vWorld.z * 0.08 + time * 1.1) + cos((vWorld.x + vWorld.z) * 0.06 - time * 0.8);
          vec3 N = normalize(vec3(a * 0.012, 1.0, b * 0.012));
          vec3 R = reflect(-V, N);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          float toSun = max(dot(normalize(vec3(R.x, 0.0, R.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          vec3 skyHor = mix(pick(vec3(0.5, 0.66, 0.88), vec3(0.42, 0.44, 0.52), vec3(0.09, 0.1, 0.17)), pick(vec3(0.8, 0.86, 0.94), vec3(1.0, 0.55, 0.25), vec3(0.3, 0.18, 0.2)), pow(toSun, 2.5));
          vec3 sky = mix(skyHor, pick(vec3(0.1, 0.3, 0.76), vec3(0.06, 0.12, 0.26), vec3(0.025, 0.035, 0.1)), clamp(R.y * 2.5, 0.0, 1.0));
          vec3 deep = pick(vec3(0.05, 0.16, 0.26), vec3(0.04, 0.09, 0.12), vec3(0.01, 0.02, 0.05));
          float glit = pow(max(dot(R, sunDir), 0.0), 300.0) * (0.4 + 0.6 * hash(floor(vWorld.xz * 0.5) + floor(time * 6.0)));
          vec3 col = mix(deep, sky, 0.4 + 0.55 * fres) + pick(vec3(1.0, 0.98, 0.9), vec3(1.0, 0.7, 0.4), vec3(0.5, 0.6, 0.8)) * glit * 2.2;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.3, SIZE * 1.3), this.water); water.rotation.x = -Math.PI / 2; water.position.y = -0.8;
    this.scene.add(water);
    this.irSwap.push({ mesh: water, eo: this.water, ir: new THREE.MeshLambertMaterial({ color: 0x3a3a3a }) });

    // ---- Streets: lane-marked roadway on every grid line through the built blocks ----
    const lane = T.laneTex(), walk = T.sidewalkTex(), grass = T.grassTex();
    for (const t of [lane, walk, grass]) t.anisotropy = aniso;
    const roadG = new Geo(), walkG = new Geo(), grassG = new Geo();
    // What each block is, once: roads run only where a street borders something built.
    const kinds = new Map<string, 'built' | 'park' | 'plaza' | 'none'>();
    const kindAt = (i: number, j: number) => {
      if (i < i0 || i > i1 || j < j0 || j > j1) return 'none';
      const key = `${i},${j}`;
      let k = kinds.get(key);
      if (!k) { const cx = (i + 0.5) * px, cz = (j + 0.5) * pz; k = spec.land(cx, cz) < 0.9 ? 'none' : spec.block(i, j, cx, cz); kinds.set(key, k); }
      return k;
    };
    const paved = (k: string) => k === 'built' || k === 'plaza';
    /** Runs of road along a grid line: [from, to] in metres along it. */
    const runs = (ns: boolean, line: number) => {
      const out: [number, number][] = [];
      const n0 = ns ? j0 : i0, n1 = ns ? j1 : i1, pitch = ns ? pz : px;
      let start: number | null = null;
      for (let k = n0; k <= n1 + 1; k++) {
        const on = k <= n1 && (ns ? paved(kindAt(line - 1, k)) || paved(kindAt(line, k)) : paved(kindAt(k, line - 1)) || paved(kindAt(k, line)));
        if (on && start === null) start = k * pitch;
        if (!on && start !== null) { out.push([start, k * pitch]); start = null; }
      }
      return out;
    };
    const nsRuns = new Map<number, [number, number][]>(), ewRuns = new Map<number, [number, number][]>();
    for (let i = i0; i <= i1 + 1; i++) {          // north-south
      const x = i * px; nsRuns.set(i, runs(true, i));
      for (const [a, b] of nsRuns.get(i)!) roadG.quad([x - wx / 2, 0.06, b], [0, 0, a - b], [wx, 0, 0], [b / T.ROAD_TILE, 0, a / T.ROAD_TILE, 0, a / T.ROAD_TILE, 1, b / T.ROAD_TILE, 1], 1);
    }
    for (let j = j0; j <= j1 + 1; j++) {          // east-west
      const z = j * pz; ewRuns.set(j, runs(false, j));
      for (const [a, b] of ewRuns.get(j)!) roadG.quad([a, 0.05, z - wz / 2], [b - a, 0, 0], [0, 0, wz], [a / T.ROAD_TILE, 0, b / T.ROAD_TILE, 0, b / T.ROAD_TILE, 1, a / T.ROAD_TILE, 1], 1);
    }

    // ---- Buildings: every built block split into lots, each lot a building in the city's facades ----
    const facades = { glass: T.facade('glass'), concrete: T.facade('concrete'), stone: T.facade('stone'), brick: T.facade('brick') };
    const G: Record<T.FacadeStyle, Geo> = { glass: new Geo(), concrete: new Geo(), stone: new Geo(), brick: new Geo() };
    const roofs = new Geo();
    const tanks: THREE.Vector3[] = [], treesAt: [number, number][] = [], lampsAt: [number, number, number][] = [];
    const mass = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, style: T.FacadeStyle, tint: V = [1, 1, 1]) => {
      const g = G[style], c: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
      let u = Math.floor(rng() * 4) / 4; const v0 = Math.floor(rng() * 4) / 4;
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]); g.wall(a[0], a[1], b[0], b[1], y0, y1, u, u + len / T.FACADE_W, v0, v0 - (y1 - y0) / T.FACADE_H, tint); u += len / T.FACADE_W; }
      const rt = rng(), rc: V = rt < 0.45 ? [0.34, 0.34, 0.35] : rt < 0.8 ? [0.52, 0.5, 0.47] : [0.64, 0.62, 0.58];
      roofs.up(x0, z0, x1, z1, y1, (qx, qz) => [qx / 8, qz / 8], rc);
      const pw = 0.5; roofs.box(x0, z0, x1, z0 + pw, y1, y1 + 1.1, 0.7); roofs.box(x0, z1 - pw, x1, z1, y1, y1 + 1.1, 0.7); roofs.box(x0, z0, x0 + pw, z1, y1, y1 + 1.1, 0.7); roofs.box(x1 - pw, z0, x1, z1, y1, y1 + 1.1, 0.7);
      const w = x1 - x0, d = z1 - z0, n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) { const uw = 2 + rng() * Math.min(8, w * 0.3), ud = 2 + rng() * Math.min(6, d * 0.3); const ux = x0 + 2 + rng() * Math.max(0.1, w - uw - 4), uz = z0 + 2 + rng() * Math.max(0.1, d - ud - 4); roofs.box(ux, uz, ux + uw, uz + ud, y1, y1 + 1.5 + rng() * 2.5, 0.8 + rng() * 0.25); }
    };
    const building = (x0: number, z0: number, x1: number, z1: number, lot: Lot, cap: number) => {
      const tone = 0.86 + rng() * 0.22, tint: V = [tone, tone * (0.98 + rng() * 0.04), tone * (0.96 + rng() * 0.06)];
      let top = Math.min(lot.floors * T.FLOOR, cap);
      top = Math.max(T.FLOOR * 2, Math.floor(top / T.FLOOR) * T.FLOOR);
      const y0 = -1, w = x1 - x0, d = z1 - z0, style = lot.style;
      const floors = top / T.FLOOR;
      if (lot.form === 'setback' && floors > 14) {
        // Pre-war massing: a street wall, then two or three setbacks to a tower.
        let a = 0, y = y0, h = top;
        const steps = floors > 40 ? 3 : 2;
        for (let s = 0; s <= steps; s++) {
          const yTop = s === steps ? y0 + h : y0 + h * (0.35 + 0.5 * (s / steps)) * (0.9 + rng() * 0.1);
          mass(x0 + a, z0 + a, x1 - a, z1 - a, y, yTop, style, tint);
          y = yTop; a += Math.min(w, d) * (0.08 + rng() * 0.05);
          if (Math.min(w, d) - 2 * a < 10) break;
        }
        if (floors > 30 && rng() < 0.6) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; roofs.box(cx - 1, cz - 1, cx + 1, cz + 1, y, y + 12 + rng() * 25, 0.5); }
        return;
      }
      if (floors < 18 || Math.min(w, d) < 30 || lot.form === 'block') {
        mass(x0, z0, x1, z1, y0, y0 + top, style, tint);
        if (spec.waterTanks && floors >= 5 && floors <= 22 && rng() < 0.45) tanks.push(new THREE.Vector3(x0 + 4 + rng() * (w - 8), y0 + top + 1.1, z0 + 4 + rng() * (d - 8)));
        return;
      }
      const pod = (4 + Math.floor(rng() * 5)) * T.FLOOR, i1 = Math.min(w, d) * (0.1 + rng() * 0.08);
      mass(x0, z0, x1, z1, y0, y0 + pod, rng() < 0.5 ? 'stone' : style, tint);
      const shaftTop = y0 + (floors > 34 ? top * 0.84 : top);
      mass(x0 + i1, z0 + i1, x1 - i1, z1 - i1, y0 + pod, shaftTop, style, tint);
      if (floors > 34) { const i2 = i1 + Math.min(w, d) * 0.1; mass(x0 + i2, z0 + i2, x1 - i2, z1 - i2, shaftTop, y0 + top, style, tint); }
      if (floors > 45 && rng() < 0.5) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const sh = 20 + rng() * 30; roofs.box(cx - 0.8, cz - 0.8, cx + 0.8, cz + 0.8, y0 + top, y0 + top + sh, 0.55); lampsAt.push([cx, y0 + top + sh + 1, cz]); }
    };
    const clear = (x: number, z: number, r: number) => spec.clear.every(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) > cr + r);
    const SW = 4.5;                                   // sidewalk
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const bx0 = i * px + wx / 2, bx1 = (i + 1) * px - wx / 2, bz0 = j * pz + wz / 2, bz1 = (j + 1) * pz - wz / 2;
      const kind = kindAt(i, j);
      if (kind === 'none') continue;
      if (kind === 'park') {
        // Grass runs on across the street gaps to neighbouring park blocks (no road runs there).
        const g0 = kindAt(i - 1, j) === 'park' ? i * px : bx0, g1 = kindAt(i + 1, j) === 'park' ? (i + 1) * px : bx1;
        const h0 = kindAt(i, j - 1) === 'park' ? j * pz : bz0, h1 = kindAt(i, j + 1) === 'park' ? (j + 1) * pz : bz1;
        grassG.up(g0, h0, g1, h1, 0.1, (qx, qz) => [qx / 12, qz / 12], 1);
        for (let k = 0; k < ((bx1 - bx0) * (bz1 - bz0)) / 260; k++) { const tx = bx0 + 6 + rng() * (bx1 - bx0 - 12), tz = bz0 + 6 + rng() * (bz1 - bz0 - 12); if (this.route.clearance(tx - 4, tz - 4, tx + 4, tz + 4, 3) > 11) treesAt.push([tx, tz]); }
        continue;
      }
      walkG.up(bx0, bz0, bx1, bz1, 0.14, (qx, qz) => [qx / 4, qz / 4], 1);
      // Street trees along the kerb.
      if (spec.trees) {
        for (let s = 8; s < bx1 - bx0 - 4; s += spec.trees.every) for (const tz of [bz0 + 1.6, bz1 - 1.6]) if (rng() < 0.85) treesAt.push([bx0 + s, tz]);
        for (let s = 8; s < bz1 - bz0 - 4; s += spec.trees.every) for (const tx of [bx0 + 1.6, bx1 - 1.6]) if (rng() < 0.85) treesAt.push([tx, bz0 + s]);
      }
      for (let s = 10; s < bx1 - bx0; s += 30) { lampsAt.push([bx0 + s, 7, bz0 + 1]); lampsAt.push([bx0 + s, 7, bz1 - 1]); }
      if (kind === 'plaza') continue;
      // Split into lots: along the long side into two to four, across into one or two.
      const lx0 = bx0 + SW, lx1 = bx1 - SW, lz0 = bz0 + SW, lz1 = bz1 - SW;
      const W = lx1 - lx0, D = lz1 - lz0, longX = W >= D;
      const nL = Math.max(1, Math.min(4, Math.round((longX ? W : D) / (45 + rng() * 25)))), nS = (longX ? D : W) > 70 && rng() < 0.6 ? 2 : 1;
      const cutsL = [0]; for (let k = 1; k < nL; k++) cutsL.push((k + (rng() - 0.5) * 0.4) / nL); cutsL.push(1);
      const cutsS = nS === 2 ? [0, 0.4 + rng() * 0.2, 1] : [0, 1];
      for (let a = 0; a + 1 < cutsL.length; a++) for (let b = 0; b + 1 < cutsS.length; b++) {
        const [u0, u1, v0, v1] = [cutsL[a], cutsL[a + 1], cutsS[b], cutsS[b + 1]];
        const x0 = longX ? lx0 + u0 * W + 0.6 : lx0 + v0 * W + 0.6, x1 = longX ? lx0 + u1 * W - 0.6 : lx0 + v1 * W - 0.6;
        const z0 = longX ? lz0 + v0 * D + 0.6 : lz0 + u0 * D + 0.6, z1 = longX ? lz0 + v1 * D - 0.6 : lz0 + u1 * D - 0.6;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (!clear(mx, mz, Math.max(x1 - x0, z1 - z0) / 2)) continue;
        const lot = spec.lot(mx, mz, rng);
        if (!lot) continue;
        const cap = this.route.clearance(x0, z0, x1, z1);
        if (cap < 8) continue;                        // the take passes low here: leave a forecourt
        building(x0, z0, x1, z1, lot, cap);
      }
    }

    // Rooftop water tanks: timber barrels on steel legs, New York's roofline.
    if (tanks.length) {
      const tankG = mergeGeometries([new THREE.CylinderGeometry(2.6, 2.6, 5, 14).translate(0, 3.6, 0).toNonIndexed(), new THREE.ConeGeometry(2.9, 1.8, 14).translate(0, 7, 0).toNonIndexed(), new THREE.CylinderGeometry(2.2, 2.2, 1.1, 8).translate(0, 0.55, 0).toNonIndexed()])!;
      const tankM = new THREE.MeshStandardMaterial({ color: 0x6f5642, roughness: 0.9 });
      const tm = new THREE.InstancedMesh(tankG, tankM, tanks.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
      tanks.forEach((p, i) => { sc.setScalar(0.8 + rng() * 0.5); tm.setMatrixAt(i, m4.compose(p, q, sc)); });
      tm.castShadow = tm.receiveShadow = true; this.scene.add(tm);
      this.irSwap.push({ mesh: tm, eo: tankM, ir: new THREE.MeshLambertMaterial({ color: 0x9a9a9a }) });
    }

    // ---- Trees: palms along the kerbs, or leafy street trees and the parks' canopy ----
    if (treesAt.length) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      if (spec.trees?.kind === 'palm') {
        const fronds: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 9; k++) {
          const f = new THREE.BoxGeometry(0.5, 0.08, 4.2).translate(0, 0, 2.1).rotateX(0.55 + (k % 2) * 0.2).rotateY((k / 9) * Math.PI * 2).toNonIndexed();
          fronds.push(f);
        }
        const trunkG = new THREE.CylinderGeometry(0.22, 0.34, 1, 6).translate(0, 0.5, 0);
        const crownG = mergeGeometries(fronds)!;
        const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1 }), crownM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
        const trunks = new THREE.InstancedMesh(trunkG, trunkM, treesAt.length), crowns = new THREE.InstancedMesh(crownG, crownM, treesAt.length);
        treesAt.forEach(([x, z], i) => {
          const h = 14 + rng() * 12;
          p3.set(x, 0, z); q.setFromAxisAngle(up, rng() * 6.28); sc.set(1, h, 1); trunks.setMatrixAt(i, m4.compose(p3, q, sc));
          p3.set(x, h, z); sc.setScalar(0.9 + rng() * 0.3); crowns.setMatrixAt(i, m4.compose(p3, q, sc)); crowns.setColorAt(i, col.setRGB(0.16 + rng() * 0.06, 0.26 + rng() * 0.08, 0.1, THREE.SRGBColorSpace));
        });
        for (const m of [trunks, crowns]) { m.castShadow = true; this.scene.add(m); this.irSwap.push({ mesh: m, eo: m.material as THREE.Material, ir: new THREE.MeshLambertMaterial({ color: 0x5a5a5a }) }); }
      } else {
        const tG = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.28, 3.4, 5).translate(0, 1.7, 0).toNonIndexed(), new THREE.IcosahedronGeometry(3.4, 1).scale(1, 0.9, 1).translate(0, 5.6, 0).toNonIndexed()])!;
        const tM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
        const st = new THREE.InstancedMesh(tG, tM, treesAt.length);
        treesAt.forEach(([x, z], i) => { p3.set(x, 0, z); sc.setScalar(0.75 + rng() * 0.6); q.setFromAxisAngle(up, rng() * 6.28); st.setMatrixAt(i, m4.compose(p3, q, sc)); st.setColorAt(i, col.setRGB(0.17 + rng() * 0.1, 0.28 + rng() * 0.12, 0.11 + rng() * 0.06, THREE.SRGBColorSpace)); });
        st.castShadow = true; this.scene.add(st);
        this.irSwap.push({ mesh: st, eo: tM, ir: new THREE.MeshLambertMaterial({ color: 0x5a5a5a }) });
      }
    }

    // ---- Sprawl: low-rise houses and shops on a painted grid, out to the haze ----
    for (const sp of spec.sprawl ?? []) {
      const spots: { x: number; z: number; w: number; d: number; h: number; c: number }[] = [];
      for (let x = sp.x0; x < sp.x1; x += sp.pitch) for (let z = sp.z0; z < sp.z1; z += sp.pitch) {
        if (x > X0 - 60 && x < X1 + 60 && z > Z0 - 60 && z < Z1 + 60) continue;
        const qx = x + sp.pitch / 2, qz = z + sp.pitch / 2;
        if (spec.land(qx, qz) < 0.95 || (spec.height?.(qx, qz) ?? 0) > 25 || rng() < 0.12) continue;
        if (!clear(qx, qz, sp.pitch) || spec.keepOut?.(qx, qz)) continue;
        const w = sp.pitch * (0.45 + rng() * 0.35), d = sp.pitch * (0.45 + rng() * 0.35), fl = sp.floors[0] + Math.floor(rng() * (sp.floors[1] - sp.floors[0] + 1));
        spots.push({ x: qx, z: qz, w, d, h: fl * 3.3 + 0.6, c: sp.palette[Math.floor(rng() * sp.palette.length)] });
        if (spec.trees?.kind === 'palm' && rng() < 0.18) treesAt.push([qx + sp.pitch * 0.45, qz]);
      }
      const hG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const f = T.facade('stone'); f.map.anisotropy = aniso;
      const hM = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.night, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
      this.glows.push({ m: hM, k: [0, 0.25, 1.1] });
      const roofM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
      const houses = new THREE.InstancedMesh(hG, [hM, hM, roofM, hM, hM, hM], spots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
      spots.forEach((s, i) => { p3.set(s.x, (spec.height?.(s.x, s.z) ?? 0) - 0.5, s.z); sc.set(s.w, s.h, s.d); houses.setMatrixAt(i, m4.compose(p3, q, sc)); houses.setColorAt(i, col.set(s.c)); });
      houses.castShadow = houses.receiveShadow = true; this.scene.add(houses);
      this.irSwap.push({ mesh: houses, eo: [hM, hM, roofM, hM, hM, hM], ir: new THREE.MeshLambertMaterial({ color: 0x8c8c8c }) });
    }

    // ---- Landmarks ----
    const ctx: MetroCtx = {
      scene: this.scene, glow, rng, route: this.route,
      add: (mesh, heat = 0x9a9a9a) => { mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh); this.irSwap.push({ mesh, eo: mesh.material as THREE.Material, ir: new THREE.MeshLambertMaterial({ color: heat }) }); return mesh; },
      night: o => { this.nightOnly.push(o); this.scene.add(o); },
      lamp: (x, y, z, size, c, always) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(...c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); s.scale.setScalar(size); this.scene.add(s); if (!always) this.nightOnly.push(s); },
      mass: (x0, z0, x1, z1, y0, y1, style, tint) => mass(x0, z0, x1, z1, y0, y1, style, tint),
      glowBy: (m, k) => { this.glows.push({ m, k }); },
      glass: (color = 0x8aa2b4, rough = 0.12) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.75, envMapIntensity: 1.4 }),
      metal: (color = 0xd8dadc, rough = 0.25) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 1, envMapIntensity: 1.3 }),
    };
    spec.landmarks(ctx);

    // Bake the city's facades (lots and landmark shafts together), roofs and street surfaces.
    for (const style of Object.keys(G) as T.FacadeStyle[]) {
      const f = facades[style]; f.map.anisotropy = aniso; f.night.anisotropy = aniso;
      const glass = style === 'glass';
      const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.night, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: glass ? 0.22 : 0.82, metalness: glass ? 0.55 : 0.02, envMapIntensity: glass ? 1.2 : 0.5 });
      this.glows.push({ m: mat, k: [0, 0.35, 1.3] });
      const mesh = new THREE.Mesh(G[style].geometry(), mat); mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
      this.irSwap.push({ mesh, eo: mat, ir: new THREE.MeshLambertMaterial({ map: f.ir, color: 0x9a9a9a }) });
    }
    const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const roofMesh = new THREE.Mesh(roofs.geometry(), roofMat); roofMesh.castShadow = roofMesh.receiveShadow = true; this.scene.add(roofMesh);
    this.irSwap.push({ mesh: roofMesh, eo: roofMat, ir: new THREE.MeshLambertMaterial({ color: 0x7a7a7a }) });
    const surf = (g: Geo, map: THREE.Texture, rough: number, heat: number) => {
      const m = new THREE.MeshStandardMaterial({ map, roughness: rough });
      const mesh = new THREE.Mesh(g.geometry(), m); mesh.receiveShadow = true; this.scene.add(mesh);
      this.irSwap.push({ mesh, eo: m, ir: new THREE.MeshLambertMaterial({ color: heat }) });
    };
    surf(roadG, lane, 0.92, 0x9a9a9a); surf(walkG, walk, 0.95, 0x8a8a8a); surf(grassG, grass, 1, 0x5a5a5a);

    // ---- City lights: street lamps and aviation lights, on from dusk ----
    const lp: number[] = [], lc: number[] = [];
    for (const [x, y, z] of lampsAt) { lp.push(x, y, z); if (y > 30) lc.push(1.8, 0.2, 0.15); else lc.push(1.0, 0.7, 0.42); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    this.lightMat = new THREE.PointsMaterial({ map: glow, size: 7, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9 });
    this.lights = new THREE.Points(lg, this.lightMat); this.scene.add(this.lights);

    // ---- Traffic: along the chosen avenues and streets, both ways, and any freeways ----
    const path = (pts: THREE.Vector3[]) => { let len = 0; for (let k = 1; k < pts.length; k++) len += pts[k].distanceTo(pts[k - 1]); this.carPaths.push({ pts, len }); };
    for (const i of spec.traffic.avenues) for (const [r0, r1] of nsRuns.get(i) ?? []) { if (r1 - r0 < 3 * pz) continue; const x = i * px; for (const s of [-1, 1]) { const o = s * wx * 0.22; const a = new THREE.Vector3(x + o, 0.1, r1), b = new THREE.Vector3(x + o, 0.1, r0); path(s > 0 ? [a, b] : [b, a]); } }
    for (const j of spec.traffic.streets) for (const [r0, r1] of ewRuns.get(j) ?? []) { if (r1 - r0 < 2 * px) continue; const z = j * pz; for (const s of [-1, 1]) { const o = s * wz * 0.22; const a = new THREE.Vector3(r0, 0.1, z + o), b = new THREE.Vector3(r1, 0.1, z + o); path(s > 0 ? [b, a] : [a, b]); } }
    for (const fw of spec.traffic.paths ?? []) {
      const base = fw.pts.map(p => new THREE.Vector3(...p));
      for (const s of [-1, 1]) for (let l = 0; l < fw.lanes; l++) {
        const off = s * (2.2 + l * 3.6);
        const pts = base.map((p, k) => { const a = base[Math.max(0, k - 1)], b = base[Math.min(base.length - 1, k + 1)]; const d = new THREE.Vector3().subVectors(b, a).setY(0).normalize(); return p.clone().add(new THREE.Vector3(-d.z * off, 0.1, d.x * off)); });
        path(s > 0 ? pts : pts.reverse());
      }
    }
    const body = mergeGeometries([new THREE.BoxGeometry(1.85, 0.8, 4.5).translate(0, 0.62, 0).toNonIndexed(), new THREE.BoxGeometry(1.6, 0.6, 2.3).translate(0, 1.3, -0.2).toNonIndexed()])!;
    const carM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.45 });
    const N = spec.traffic.cars;
    this.carMesh = new THREE.InstancedMesh(body, carM, N); this.carMesh.castShadow = true; this.scene.add(this.carMesh);
    this.irSwap.push({ mesh: this.carMesh, eo: carM, ir: new THREE.MeshLambertMaterial({ color: 0xe0e0e0 }) });
    this.carLights = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), N * 2);
    this.scene.add(this.carLights);
    const wsum = spec.carColors.reduce((a, c) => a + c[1], 0), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const k = Math.floor(rng() * this.carPaths.length), p = this.carPaths[k];
      let r = rng() * wsum, c = spec.carColors[0][0]; for (const [cc, w] of spec.carColors) { if ((r -= w) <= 0) { c = cc; break; } }
      this.carMesh.setColorAt(i, col.set(c));
      this.cars.push({ axis: 0, road: k, dir: 1, off: 0, s: rng() * p.len, v: (p.pts[0].y > 3 ? 22 : 9) + rng() * 7, vmax: 30, len: 4.5, sx: 1, sy: 1, sz: 1, x: 0, z: 0, dx: 1, dz: 0, eo: [0.6, 0.6, 0.62], heat: 1, id: i + 1 });
    }
  }

  /** The ground map: land, parks and water, hills shaded by height, and the painted street grid of the sprawl. */
  private paintMap(size: number, H: (x: number, z: number) => number): HTMLCanvasElement {
    const spec = this.spec, R = 1024, c = document.createElement('canvas'); c.width = c.height = R;
    const g = c.getContext('2d')!;
    const img = g.createImageData(R, R), d = img.data;
    const land = new THREE.Color(spec.paint.land), hill = new THREE.Color(spec.paint.hill ?? spec.paint.land), water = new THREE.Color(0x1d2c38), tmp = new THREE.Color();
    for (let py = 0; py < R; py++) for (let pxl = 0; pxl < R; pxl++) {
      const x = (pxl / R - 0.5) * size, z = (py / R - 0.5) * size;
      const l = spec.land(x, z), h = spec.height?.(x, z) ?? 0;
      tmp.copy(land).lerp(hill, sstep(8, 120, h)).multiplyScalar(0.92 + vnoise(x / 90, z / 90) * 0.16).lerp(water, 1 - l);
      const k = (py * R + pxl) * 4; d[k] = tmp.r * 255; d[k + 1] = tmp.g * 255; d[k + 2] = tmp.b * 255; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (v: number) => (v / size + 0.5) * R;
    g.strokeStyle = spec.paint.street; g.lineWidth = Math.max(1, (14 / size) * R);
    for (const sp of spec.sprawl ?? []) {
      g.beginPath();
      for (let x = sp.x0; x <= sp.x1; x += sp.pitch * 2) { g.moveTo(toPx(x), toPx(sp.z0)); g.lineTo(toPx(x), toPx(sp.z1)); }
      for (let z = sp.z0; z <= sp.z1; z += sp.pitch * 2) { g.moveTo(toPx(sp.x0), toPx(z)); g.lineTo(toPx(sp.x1), toPx(z)); }
      g.stroke();
    }
    void H;
    return c;
  }

  private detail = -1;
  setDetail(level: number) {
    if (level === this.detail) return; this.detail = level;
    const size = level === 0 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
  }
  private hidden: THREE.Object3D[] = [];
  solidOnly(on: boolean) {
    if (on) {
      this.hidden = [];
      this.scene.traverse(o => { if (o.visible && ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Mesh).material && !Array.isArray((o as THREE.Mesh).material) && ((o as THREE.Mesh).material as THREE.Material).transparent)) { o.visible = false; this.hidden.push(o); } });
    } else { for (const o of this.hidden) o.visible = true; this.hidden = []; }
  }

  private envFor(mood: Mood): THREE.Texture | null {
    if (!this.renderer) return null;
    if (!this.env[mood]) {
      const sky = this.sky.clone();
      sky.uniforms = THREE.UniformsUtils.clone(this.sky.uniforms);
      sky.uniforms.mood.value = MOOD_K[mood];
      sky.uniforms.sunDir.value = this.spec.sun[mood].clone();
      const s = new THREE.Scene();
      s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky));
      const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: mood === 'BLUE' ? 0x06070b : mood === 'GOLDEN' ? 0x2a2420 : 0x3a3a38 }));
      ground.position.y = -2; s.add(ground);
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env[mood] = pm.fromScene(s, 0, 0.5, 400).texture;
      pm.dispose();
    }
    return this.env[mood] ?? null;
  }

  /** The take is one shot: the whole flight, then a beat of black before it goes round again. */
  shotAt(time: number): { shot: { dur: number; mood: Mood; fov: number }; t: number; u: number; index: number } {
    const total = this.dur + 1;
    const dbg = (globalThis as { __flyT?: number }).__flyT;
    const t = typeof dbg === 'number' ? Math.min(this.dur, dbg) : ((time % total) + total) % total;
    return { shot: { dur: this.dur, mood: this.spec.mood, fov: this.spec.route.fov ?? 74 }, t, u: t / this.dur, index: 0 };
  }

  applyLook(look: Look, mood: Mood) {
    const ir = look === 'IR_DAY' || look === 'IR_NIGHT';
    const night = look === 'NIGHT' || look === 'IR_NIGHT';
    this.forcedNight = night;
    if (night) mood = 'BLUE';
    this.mood = mood;
    const day = mood === 'DAY', golden = mood === 'GOLDEN', blue = mood === 'BLUE';
    for (const s of this.irSwap) (s.mesh as THREE.Mesh).material = ir ? s.ir : s.eo;
    for (const g of this.glows) g.m.emissiveIntensity = g.k[MOOD_K[mood]];
    this.scene.environment = ir ? null : this.envFor(mood);
    this.lights.visible = !ir && !day; this.carLights.visible = !ir && !day; this.sunDisc.visible = !ir && !blue;
    for (const o of this.nightOnly) o.visible = !ir && !day;
    const sunDir = this.spec.sun[mood];
    this.sky.uniforms.sunDir.value.copy(sunDir); this.sky.uniforms.mood.value = MOOD_K[mood];
    this.water.uniforms.sunDir.value.copy(sunDir); this.water.uniforms.mood.value = MOOD_K[mood];
    const hz = this.spec.haze[mood];
    if (ir) {
      this.scene.background = new THREE.Color(0.1, 0.1, 0.1); this.fog.color.setRGB(0.22, 0.22, 0.22); this.fog.density = 0.00022;
      this.sun.color.setRGB(1, 1, 1); this.sun.intensity = 1.2; this.hemi.color.setRGB(1, 1, 1); this.hemi.groundColor.setRGB(1, 1, 1); this.hemi.intensity = night ? 2.2 : 1.6;
    } else if (blue) {
      this.scene.background = null; this.fog.color.set(hz.color); this.fog.density = hz.density;
      this.sun.color.set(0x6a7fc0); this.sun.intensity = 0.3; this.hemi.color.set(0x1e2a4c); this.hemi.groundColor.set(0x0e0c12); this.hemi.intensity = 0.75;
    } else if (golden) {
      this.scene.background = null; this.fog.color.set(hz.color); this.fog.density = hz.density;
      this.sun.color.set(0xffc48a); this.sun.intensity = 2.8; this.hemi.color.set(0x8ea8d8); this.hemi.groundColor.set(0x4a3a2c); this.hemi.intensity = 0.85;
    } else {
      this.scene.background = null; this.fog.color.set(hz.color); this.fog.density = hz.density;
      this.sun.color.set(0xfff4e6); this.sun.intensity = 2.3; this.hemi.color.set(0xbcd4f0); this.hemi.groundColor.set(0x8a8070); this.hemi.intensity = 0.8;
    }
    this.lightMat.opacity = blue ? 1 : 0.85; this.lightMat.size = blue ? 9 : 7;
    this.sunDisc.position.copy(sunDir).multiplyScalar(14000);
    this.sunDisc.scale.setScalar(day ? 300 : 900);
    (this.sunDisc.material as THREE.SpriteMaterial).color.set(day ? 0xffffff : 0xffb070);
  }

  update(dt: number) {
    this.t += dt;
    this.water.uniforms.time.value = this.t;
    const trails = this.mood === 'BLUE';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const head = new THREE.Vector3(), tail = new THREE.Vector3(), hc = new THREE.Color(1.5, 1.4, 1.2), tc = new THREE.Color(1.6, 0.15, 0.1);
    this.cars.forEach((c, i) => {
      const path = this.carPaths[c.road];
      c.s = (c.s + c.v * dt) % path.len;
      let d = c.s, k = 0;
      while (k + 1 < path.pts.length - 1 && d > path.pts[k].distanceTo(path.pts[k + 1])) { d -= path.pts[k].distanceTo(path.pts[k + 1]); k++; }
      const a = path.pts[k], b = path.pts[k + 1], seg = a.distanceTo(b) || 1;
      p.lerpVectors(a, b, Math.min(1, d / seg)); c.x = p.x; c.z = p.z; c.dx = (b.x - a.x) / seg; c.dz = (b.z - a.z) / seg;
      q.setFromAxisAngle(up, Math.atan2(c.dx, c.dz));
      this.carMesh.setMatrixAt(i, m4.compose(p, q, s));
      head.copy(p).add(new THREE.Vector3(c.dx * 2.6, 0.8, c.dz * 2.6)); tail.copy(p).add(new THREE.Vector3(-c.dx * 2.4, 0.8, -c.dz * 2.4));
      this.carLights.setMatrixAt(i * 2, m4.compose(head, q, s.set(trails ? 4 : 5, trails ? 1.2 : 3, trails ? 26 : 1)));
      this.carLights.setMatrixAt(i * 2 + 1, m4.compose(tail, q, s.set(trails ? 3 : 3.5, trails ? 1 : 2, trails ? 26 : 1)));
      this.carLights.setColorAt(i * 2, hc); this.carLights.setColorAt(i * 2 + 1, tc);
      s.set(1, 1, 1);
    });
    this.carMesh.instanceMatrix.needsUpdate = true; this.carLights.instanceMatrix.needsUpdate = true;
    if (this.carLights.instanceColor) this.carLights.instanceColor.needsUpdate = true;
  }

  private fp = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(), roll: 0, fov: 74 };
  pose(cam: THREE.PerspectiveCamera, time: number, zoom: number): ShotState {
    const { t } = this.shotAt(time);
    const o = this.route.pose(Math.min(t, this.dur), this.fp);
    cam.position.copy(o.pos);
    cam.near = 1.5; cam.far = METRO_CAMERA_FAR;
    cam.fov = (2 * Math.atan(Math.tan((o.fov * Math.PI) / 360) / Math.max(1, zoom)) * 180) / Math.PI;
    cam.updateProjectionMatrix();
    cam.up.copy(o.up); cam.lookAt(o.look); cam.up.set(0, 1, 0);
    cam.updateMatrixWorld();
    // Shadows over the ground ahead.
    const dirV = o.look.clone().sub(o.pos).normalize();
    const tHit = dirV.y < -0.05 ? Math.min(o.pos.y / -dirV.y, 700) : 300;
    const focus = o.pos.clone().addScaledVector(dirV, tHit).setY(0);
    const mood: Mood = this.forcedNight ? 'BLUE' : this.spec.mood;
    const sunDir = this.spec.sun[mood];
    this.sun.target.position.copy(focus); this.sun.position.copy(focus).addScaledVector(sunDir, 3500); this.sun.target.updateMatrixWorld();
    const sd = sunDir.clone().multiplyScalar(14000).project(cam);
    const sun = sd.z > 1 || Math.abs(sd.x) > 1.3 || Math.abs(sd.y) > 1.3 ? null : new THREE.Vector2((sd.x + 1) / 2, (sd.y + 1) / 2);
    // Fade up from black over the first second, down over the last, black for the beat between takes.
    const fade = t >= this.dur ? 0 : Math.max(0, Math.min(1, t / 0.8, (this.dur - t) / 1.4));
    return { sun, fade, mood };
  }
}
