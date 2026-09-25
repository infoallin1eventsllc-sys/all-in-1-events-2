import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Geo, type Look, type Car } from './city';
import * as T from './textures';
import { FlyRoute, spiral, type P3 } from './fly';

/**
 * San Francisco for the patrol feed: an aerial tour cut like a 4K drone film.
 *
 * Eighteen shots on hard cuts, four to nine seconds each, in the order such a
 * film runs: clean daylight first (a push along the Golden Gate's cables, a
 * top-down over the piers, the skyline with marine fog lying over the tower
 * tops, North Beach and Coit Tower, Lombard Street's switchbacks, the Bay
 * Bridge with the city behind its trusses, a speedboat's wake, the downtown
 * canyons, Oracle Park, the Wharf), then golden hour at the Gate (a container
 * ship in the fog, an orbit of the south tower, straight down over the lanes,
 * the Marin coast at sunset), then blue hour (the bridge floodlit orange, light
 * trails, the city glowing) and a fade to black before it goes round again.
 *
 * Coordinates are metres, x east and z south, with the Ferry Building near the
 * origin; distances across the Bay are compressed. The thermal and night-vision
 * sensor stages run on the same scene through `applyLook`, and when the console
 * is in night operations every shot plays at blue hour.
 *
 * The same city also carries an FPV fly-through (the 'FLY' reel): one unbroken
 * take skimming the Bay to the Ferry Building, straight up its clock tower, down
 * Market Street, north through the Financial District's canyons, round the
 * Transamerica Pyramid and up in a climbing orbit of the Salesforce Tower that
 * ends on the Bay Bridge. Buildings the take would clip are built lower.
 */

type V = [number, number, number];
const SUN_DAY = new THREE.Vector3(0.5, 0.68, 0.55).normalize();      // mid-morning, from the south-east
const SUN_DUSK = new THREE.Vector3(-0.86, 0.11, -0.36).normalize();   // sunset, west-north-west
const SUN_NIGHT = new THREE.Vector3(-0.4, 0.5, 0.2).normalize();      // the moon
export const SF_CAMERA_FAR = 9000;
/** Time of day for a shot: clean daylight, golden hour, blue hour. */
export type Mood = 'DAY' | 'GOLDEN' | 'BLUE';
const MOOD_K: Record<Mood, number> = { DAY: 0, GOLDEN: 1, BLUE: 2 };
/** What the engine needs from a shot: the sun on screen for the flare, the fade to black, the mood for the grade. */
export interface ShotState { sun: THREE.Vector2 | null; fade: number; mood: Mood }

interface Shot { dur: number; mood: Mood; fov?: number; pose: (_t: number, u: number, o: { pos: THREE.Vector3; look: THREE.Vector3; roll: number; up?: THREE.Vector3 }, w: SanFrancisco) => void }
/** Which edit plays: the eighteen-shot aerial tour or the continuous FPV fly-through. */
export type Reel = 'TOUR' | 'FLY';

/** The fly-through's route, in world metres. */
export function flySpec() {
  const SALES: [number, number] = [180, -260];
  const pre: P3[] = [
    [1100, 7, -60], [700, 7, -40], [470, 12, -12], [398, 60, 0], [362, 112, 6], [250, 62, 26], [-40, 42, 60], [-280, 40, 100],
    [-335, 46, 40], [-330, 60, -200], [-330, 78, -450], [-300, 92, -548], [-120, 100, -560], [-110, 120, -690], [-220, 148, -730], [-250, 190, -500], [-150, 215, -330],
  ];
  const orbit = spiral(SALES[0], SALES[1], 118, 150, 235, 470, -2.93, 1.0, 12);
  const post: P3[] = [[40, 490, -470], [120, 505, -620]];
  const points = [...pre, ...orbit, ...post];
  const speed = [0.55, 1.3, 1.25, 0.85, 0.55, 1.05, 1.4, 1.45, 1.25, 1.35, 1.35, 1.2, 1.15, 1.05, 1.0, 1.1, 1.05, ...orbit.map(() => 0.95), 0.8, 0.65];
  return {
    points, speed, dur: 66, easeIn: 2.5, fov: 76, lookAhead: 50, bank: 0.75, maxBank: 0.62,
    holds: [
      { from: 12.5, to: 14.5, at: [-180, 110, -620] as P3, weight: 0.55 },
      { from: pre.length + 1, to: pre.length + orbit.length - 1, at: [SALES[0], 315, SALES[1]] as P3, weight: 0.72 },
      { from: pre.length + orbit.length - 0.5, to: points.length - 1, at: [1250, 60, -300] as P3, weight: 0.8 },
    ],
  };
}
let FLY: FlyRoute | null = null;
const flyRoute = () => (FLY ??= new FlyRoute(flySpec()));
const ease = (u: number) => u * u * (3 - 2 * u);

// ---- Lie of the land -----------------------------------------------------------
const HILLS: [number, number, number, number][] = [
  [-800, -750, 380, 95],     // Nob Hill
  [-1150, -1200, 320, 85],   // Russian Hill
  [-450, -1250, 180, 78],    // Telegraph Hill
  [-2100, -900, 700, 110],   // Pacific Heights
  [-3000, 900, 800, 270],    // Twin Peaks
  [-400, 1500, 500, 80],     // Potrero
  [-1800, 300, 500, 70],
];
const MARIN: [number, number, number, number][] = [[-3400, -4000, 1300, 200], [-4700, -3500, 1000, 170], [-2500, -4400, 900, 150], [-5600, -4200, 1200, 190]];
const ISLANDS: [number, number, number, number][] = [[-900, -2600, 150, 26], [-1900, -4000, 520, 90], [2000, -430, 260, 90]]; // Alcatraz, Angel Island, Yerba Buena
const gauss = (x: number, z: number, cx: number, cz: number, r: number, h: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** East shore of the peninsula (the Embarcadero) at this z. */
const shoreX = (z: number) => 350 + 0.18 * z;
/** North shore (the Marina and the Wharf) at this x. */
const shoreZ = (x: number) => -1450 + 0.1 * x;
function landMask(x: number, z: number) {
  const city = sstep(-40, 80, Math.min(shoreX(z) - x, z - shoreZ(x)));
  const marin = sstep(0, 220, -2900 - z) * sstep(-1800, -2600, x);
  let isl = 0;
  for (const [cx, cz, r, h] of ISLANDS) isl = Math.max(isl, sstep(0.25, 0.6, gauss(x, z, cx, cz, r, h) / h));
  return Math.max(city, marin, isl);
}
const vhash = (x: number, z: number) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = vhash(ix, iz), b = vhash(ix + 1, iz), c = vhash(ix, iz + 1), d = vhash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
/** Ridges and gullies on the open hills: ridged noise, three octaves, folded so the crests are sharp. */
function relief(x: number, z: number) {
  let r = 0, amp = 1, f = 1 / 520;
  for (let o = 0; o < 3; o++) { r += amp * (1 - Math.abs(vnoise(x * f + 7.3, z * f + 2.1) * 2 - 1)); amp *= 0.5; f *= 2.1; }
  return r / 1.75;
}
export function sfHeight(x: number, z: number) {
  let h = 0;
  for (const g of HILLS) h += gauss(x, z, ...g);
  for (const g of MARIN) h += gauss(x, z, ...g);
  for (const g of ISLANDS) h += gauss(x, z, ...g);
  // The city sits on the smooth hills; outside the street grid the land is rougher, more so the higher it is.
  const open = 1 - sstep(-2900, -2500, x) * sstep(-1700, -1400, z) * (1 - sstep(400, 700, z)) * (1 - sstep(400, 700, x));
  const shore = landMask(x, z);
  h += open * relief(x, z) * (4 + h * 0.06) * shore * shore;
  return landMask(x, z) * (4 + h);
}

// ---- Structures ---------------------------------------------------------------------
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BLOCK = 110, STREET = 14;

export class SanFrancisco {
  scene = new THREE.Scene();
  cars: Car[] = [];
  walkers: never[] = [];
  private sun = new THREE.DirectionalLight(0xffc48a, 2.2);
  private hemi = new THREE.HemisphereLight(0x8ea8d8, 0x4a3a2c, 1.3);
  private fog = new THREE.FogExp2(0x8a7d78, 0.00042);
  private sky: THREE.ShaderMaterial;
  private water: THREE.ShaderMaterial;
  private fogLayer!: THREE.ShaderMaterial;
  private env: Partial<Record<Mood, THREE.Texture>> = {};
  private renderer: THREE.WebGLRenderer | null;
  private lights: THREE.Points;
  private lightMat: THREE.PointsMaterial;
  private facadeMats: THREE.MeshStandardMaterial[] = [];
  private houseFront!: THREE.MeshStandardMaterial;
  private bayMat!: THREE.MeshStandardMaterial;
  private irSwap: { mesh: THREE.Mesh | THREE.InstancedMesh | THREE.Points | THREE.Sprite; eo: THREE.Material; ir: THREE.Material }[] = [];
  private carMesh: THREE.InstancedMesh;
  private carLights: THREE.InstancedMesh;
  private carPaths: { pts: THREE.Vector3[]; len: number }[] = [];
  private t = 0;
  private sunDisc: THREE.Sprite;
  private gndMat!: THREE.MeshLambertMaterial;
  private ggMat!: THREE.MeshStandardMaterial;
  private bbMat!: THREE.MeshStandardMaterial;
  private ship!: THREE.Group;
  private boat!: THREE.Group;
  private wheel!: THREE.Group;
  private shots: Shot[] = [];
  private flyShots: Shot[] = [];
  private total = 0;
  private mood: Mood = 'DAY';
  private forcedNight = false;

  constructor(maxAniso = 8, glow: THREE.Texture, renderer: THREE.WebGLRenderer | null = null) {
    const aniso = Math.min(8, maxAniso);
    this.renderer = renderer;
    this.scene.fog = this.fog;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sun.position.copy(SUN_DUSK).multiplyScalar(4000); this.sun.target.position.set(0, 0, 0);
    // Sun shadows over the area each shot looks at (placed per frame in pose()).
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shCam = this.sun.shadow.camera as THREE.OrthographicCamera;
    shCam.left = -520; shCam.right = 520; shCam.top = 520; shCam.bottom = -520; shCam.near = 50; shCam.far = 7000; shCam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 1.2;

    // Sky: a dome graded from the warm west to the deep blue zenith, with the sun in it.
    this.sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: SUN_DAY.clone() }, mood: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 sunDir; uniform float mood; varying vec3 vDir;
        float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec3 pick(vec3 a, vec3 b, vec3 c){ return mix(mix(a, b, clamp(mood, 0.0, 1.0)), c, clamp(mood - 1.0, 0.0, 1.0)); }
        void main(){
          vec3 d = normalize(vDir); float y = clamp(d.y, 0.0, 1.0);
          float toSun = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          vec3 zen = pick(vec3(0.10, 0.30, 0.76), vec3(0.05, 0.10, 0.24), vec3(0.025, 0.035, 0.10));
          vec3 horC = pick(vec3(0.50, 0.66, 0.88), vec3(0.42, 0.44, 0.52), vec3(0.09, 0.10, 0.17));
          vec3 horW = pick(vec3(0.80, 0.86, 0.94), vec3(1.0, 0.52, 0.22), vec3(0.30, 0.18, 0.20));
          vec3 hor = mix(horC, horW, pow(toSun, 2.5));
          vec3 col = mix(hor, zen, pow(y, pick(vec3(0.6), vec3(0.42), vec3(0.42)).x));
          float s = max(dot(d, sunDir), 0.0);
          vec3 sunC = pick(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.6, 0.3), vec3(0.5, 0.55, 0.8));
          float glow = pick(vec3(pow(s, 300.0) * 2.0 + pow(s, 10.0) * 0.05), vec3(pow(s, 6.0) * 0.12 + pow(s, 120.0) * 1.2), vec3(pow(s, 40.0) * 0.1)).x;
          col += sunC * glow;
          // Thin cirrus high in the day sky, streaked with the wind.
          float day = 1.0 - clamp(mood, 0.0, 1.0);
          vec2 cp = vec2(d.x / max(d.y, 0.08), d.z / max(d.y, 0.08));
          float cir = 0.0; { vec2 p = cp * 0.9 + vec2(11.0, 3.0); float amp = 0.5; for (int i = 0; i < 4; i++) { cir += amp * (hash(floor(p * vec2(6.0, 1.3))) ); p = p * 2.1 + 3.7; amp *= 0.5; } }
          cir = smoothstep(0.62, 0.9, cir) * smoothstep(0.03, 0.25, d.y) * (1.0 - smoothstep(0.5, 0.9, d.y));
          col = mix(col, vec3(0.92, 0.94, 0.97), cir * 0.55 * day);
          float b = clamp(mood - 1.0, 0.0, 1.0);
          float star = step(0.9985, hash(floor(d.xz * 900.0 / max(d.y, 0.05)))) * y * b;
          col += star * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(8500, 40, 20), this.sky));
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.0, 0.7, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunDisc.scale.setScalar(520); this.scene.add(this.sunDisc);

    // Ground: a heightfield of the peninsula, Marin and the islands, painted from a map canvas.
    const SIZE = 12000, SEG = 440;
    const gnd = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); gnd.rotateX(-Math.PI / 2);
    const gp = gnd.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < gp.count; i++) gp.setY(i, sfHeight(gp.getX(i), gp.getZ(i)) - 1.5);
    gnd.computeVertexNormals();
    const mapTex = new THREE.CanvasTexture(this.paintMap(SIZE, false)); mapTex.anisotropy = aniso; mapTex.colorSpace = THREE.SRGBColorSpace;
    const emit = new THREE.CanvasTexture(this.paintMap(SIZE, true)); emit.colorSpace = THREE.SRGBColorSpace;
    const gndMat = new THREE.MeshLambertMaterial({ map: mapTex, emissiveMap: emit, emissive: 0xffffff, emissiveIntensity: 0.6 });
    this.gndMat = gndMat;
    const ground = new THREE.Mesh(gnd, gndMat); ground.receiveShadow = true; this.scene.add(ground);
    this.irSwap.push({ mesh: ground, eo: gndMat, ir: new THREE.MeshLambertMaterial({ color: 0x8a8a8a }) });

    // Water: the Bay and the ocean, reflecting the sky with the sun's glitter on it.
    this.water = new THREE.ShaderMaterial({
      fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), sunDir: { value: SUN_DAY.clone() }, time: { value: 0 }, mood: { value: 0 } },
      vertexShader: `#include <fog_pars_vertex>
        varying vec3 vWorld;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
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
          vec3 horC = pick(vec3(0.50, 0.66, 0.88), vec3(0.42, 0.44, 0.52), vec3(0.09, 0.10, 0.17));
          vec3 horW = pick(vec3(0.80, 0.86, 0.94), vec3(1.0, 0.55, 0.25), vec3(0.30, 0.18, 0.20));
          vec3 skyHor = mix(horC, horW, pow(toSun, 2.5));
          vec3 skyZen = pick(vec3(0.10, 0.30, 0.76), vec3(0.06, 0.12, 0.26), vec3(0.025, 0.035, 0.10));
          vec3 sky = mix(skyHor, skyZen, clamp(R.y * 2.5, 0.0, 1.0));
          vec3 deep = pick(vec3(0.05, 0.19, 0.34), vec3(0.04, 0.1, 0.13), vec3(0.01, 0.02, 0.05));
          float glit = pow(max(dot(R, sunDir), 0.0), 300.0) * (0.4 + 0.6 * hash(floor(vWorld.xz * 0.5) + floor(time * 6.0)));
          vec3 col = mix(deep, sky, 0.45 + 0.55 * fres) + pick(vec3(1.0, 0.98, 0.9), vec3(1.0, 0.7, 0.4), vec3(0.5, 0.6, 0.8)) * glit * 2.2;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.2, SIZE * 1.2), this.water); water.rotation.x = -Math.PI / 2; water.position.y = 0.4;
    this.scene.add(water);
    this.irSwap.push({ mesh: water, eo: this.water, ir: new THREE.MeshLambertMaterial({ color: 0x3a3a3a }) });

    // ---- The city fabric: every block built out to the street, as San Francisco is. ----
    // Downtown and SoMa: office and loft buildings filling each block, the tallest round the
    // foot of Market Street with podiums and setbacks. The hills: attached row houses, two to
    // four floors, flat roofs, bay windows, in the city's muted plaster colours.
    const facades = { glass: T.facade('glass'), concrete: T.facade('concrete'), stone: T.facade('stone'), brick: T.facade('brick') };
    const G: Record<T.FacadeStyle, Geo> = { glass: new Geo(), concrete: new Geo(), stone: new Geo(), brick: new Geo() };
    const roofs = new Geo();
    const rng = mulberry(1907);
    const MARGIN = 10;                                   // half street plus sidewalk
    const CORE = { x: 120, z: -320 };
    const inDowntown = (x: number, z: number) => x > -720 && x < 330 && z > -900 && z < 380;
    const inSoma = (x: number, z: number) => x > -1500 && x < 330 && z >= 380 && z < 1300 && !(Math.hypot(x - 380, z - 750) < 190) && !(Math.hypot(x - 430, z - 1150) < 130);
    // Market Street: the wide diagonal from the Ferry Building south-west across the grid; nothing is built on it.
    const MK_A = { x: 340, z: -10 }, MK_D = (() => { const dx = -3000 - 340, dz = 580 + 10, l = Math.hypot(dx, dz); return { x: dx / l, z: dz / l }; })();
    const marketDist = (x: number, z: number) => { const ux = x - MK_A.x, uz = z - MK_A.z; const t = ux * MK_D.x + uz * MK_D.z; if (t < 0) return 1e9; return Math.abs(ux * MK_D.z - uz * MK_D.x); };
    const clearOfLandmarks = (x: number, z: number, r: number) => Math.hypot(x - 180, z + 260) > 40 + r && Math.hypot(x + 180, z + 620) > 44 + r && Math.hypot(x + 60, z + 480) > 38 + r && Math.hypot(x - 330, z - 10) > 30 + r;
    /** One box of a building: four textured walls and a roof, with a tint. */
    const mass = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, style: T.FacadeStyle, tint: V) => {
      const g = G[style], c: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
      let u = Math.floor(rng() * 4) / 4; const v0 = Math.floor(rng() * 4) / 4;
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]); g.wall(a[0], a[1], b[0], b[1], y0, y1, u, u + len / T.FACADE_W, v0, v0 - (y1 - y0) / T.FACADE_H, tint); u += len / T.FACADE_W; }
      const rt = rng(), rc: V = rt < 0.45 ? [0.34, 0.34, 0.35] : rt < 0.8 ? [0.52, 0.5, 0.47] : [0.64, 0.62, 0.58];
      roofs.up(x0, z0, x1, z1, y1, (px, pz) => [px / 8, pz / 8], rc);
      // Parapet and rooftop plant.
      const pw = 0.5; roofs.box(x0, z0, x1, z0 + pw, y1, y1 + 1.1, 0.7); roofs.box(x0, z1 - pw, x1, z1, y1, y1 + 1.1, 0.7); roofs.box(x0, z0, x0 + pw, z1, y1, y1 + 1.1, 0.7); roofs.box(x1 - pw, z0, x1, z1, y1, y1 + 1.1, 0.7);
      const w = x1 - x0, d = z1 - z0, n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) { const uw = 2 + rng() * Math.min(8, w * 0.3), ud = 2 + rng() * Math.min(6, d * 0.3); const ux = x0 + 2 + rng() * Math.max(0.1, w - uw - 4), uz = z0 + 2 + rng() * Math.max(0.1, d - ud - 4); roofs.box(ux, uz, ux + uw, uz + ud, y1, y1 + 1.5 + rng() * 2.5, 0.8 + rng() * 0.25); }
    };
    /** A building on a lot: podium, shaft and crown when it is tall. */
    const building = (x0: number, z0: number, x1: number, z1: number, floors: number, style: T.FacadeStyle) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let y0 = Infinity; for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1], [cx, cz]]) y0 = Math.min(y0, sfHeight(px, pz)); y0 -= 1.5;
      // Keep the fly-through's route clear: a building it would clip stands lower, or not at all.
      const cap = flyRoute().clearance(x0, z0, x1, z1);
      if (cap < y0 + 2 * T.FLOOR) return;
      floors = Math.min(floors, Math.floor((cap - y0) / T.FLOOR));
      const tone = 0.86 + rng() * 0.22, tint: V = [tone, tone * (0.98 + rng() * 0.04), tone * (0.96 + rng() * 0.06)];
      const H = floors * T.FLOOR, w = x1 - x0, d = z1 - z0;
      if (floors < 18 || Math.min(w, d) < 30) { mass(x0, z0, x1, z1, y0, y0 + H, style, tint); return; }
      const pod = (4 + Math.floor(rng() * 5)) * T.FLOOR, i1 = Math.min(w, d) * (0.1 + rng() * 0.08);
      mass(x0, z0, x1, z1, y0, y0 + pod, rng() < 0.5 ? 'stone' : style, tint);
      const shaftTop = y0 + (floors > 34 ? H * 0.82 : H);
      mass(x0 + i1, z0 + i1, x1 - i1, z1 - i1, y0 + pod, shaftTop, style, tint);
      if (floors > 34) { const i2 = i1 + Math.min(w, d) * 0.1; mass(x0 + i2, z0 + i2, x1 - i2, z1 - i2, shaftTop, y0 + H, style, tint); }
    };
    for (let bx = -14; bx <= 3; bx++) for (let bz = -9; bz <= 11; bz++) {
      const X = bx * BLOCK, Z = bz * BLOCK, cx = X + BLOCK / 2, cz = Z + BLOCK / 2;
      const down = inDowntown(cx, cz), soma = inSoma(cx, cz);
      if ((!down && !soma) || landMask(cx, cz) < 0.95 || landMask(X + MARGIN, Z + MARGIN) < 0.9 || landMask(X + BLOCK - MARGIN, Z + BLOCK - MARGIN) < 0.9) continue;
      const core = Math.exp(-((cx - CORE.x) ** 2 + (cz - CORE.z) ** 2) / (430 * 430));
      // Split the block into two to four lots.
      const sx = 0.35 + rng() * 0.3, sz = 0.35 + rng() * 0.3, L = BLOCK - 2 * MARGIN, bx0 = X + MARGIN, bz0 = Z + MARGIN;
      const xs = rng() < 0.25 ? [0, 1] : [0, sx, 1], zs = rng() < 0.25 ? [0, 1] : [0, sz, 1];
      for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
        const x0 = bx0 + xs[i] * L + 0.6, x1 = bx0 + xs[i + 1] * L - 0.6, z0 = bz0 + zs[j] * L + 0.6, z1 = bz0 + zs[j + 1] * L - 0.6;
        const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
        if (!clearOfLandmarks(lx, lz, Math.max(x1 - x0, z1 - z0) / 2) || marketDist(lx, lz) < 22 + Math.max(x1 - x0, z1 - z0) / 2) continue;
        const floors = down ? 7 + Math.floor(rng() * 8 + core * (18 + rng() * 42)) : 4 + Math.floor(rng() * 6);
        const style: T.FacadeStyle = down ? (rng() < 0.4 + core * 0.35 ? 'glass' : rng() < 0.55 ? 'stone' : 'concrete') : (rng() < 0.45 ? 'brick' : rng() < 0.6 ? 'concrete' : 'stone');
        building(x0, z0, x1, z1, floors, style);
      }
    }
    for (const style of Object.keys(G) as T.FacadeStyle[]) {
      const f = facades[style]; f.map.anisotropy = aniso; f.night.anisotropy = aniso;
      const glass = style === 'glass';
      const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.night, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: glass ? 0.22 : 0.82, metalness: glass ? 0.55 : 0.02, envMapIntensity: glass ? 1.2 : 0.5 });
      this.facadeMats.push(mat);
      const mesh = new THREE.Mesh(G[style].geometry(), mat); mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
      this.irSwap.push({ mesh, eo: mat, ir: new THREE.MeshLambertMaterial({ map: f.ir, color: 0x9a9a9a }) });
    }
    const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const roofMesh = new THREE.Mesh(roofs.geometry(), roofMat); roofMesh.castShadow = roofMesh.receiveShadow = true; this.scene.add(roofMesh);
    this.irSwap.push({ mesh: roofMesh, eo: roofMat, ir: new THREE.MeshLambertMaterial({ color: 0x7a7a7a }) });

    // Landmarks.
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x8aa2b4, roughness: 0.12, metalness: 0.75, envMapIntensity: 1.4 });
    const addLandmark = (mesh: THREE.Mesh, heat = 0x9a9a9a) => { mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh); this.irSwap.push({ mesh, eo: mesh.material as THREE.Material, ir: new THREE.MeshLambertMaterial({ color: heat }) }); };
    {
      // Salesforce Tower: 326 m, a tapered rounded shaft with a lit crown.
      const y0 = sfHeight(180, -260);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(20, 27, 326, 28).translate(0, 163, 0).scale(1, 1, 0.82), glassMat);
      shaft.position.set(180, y0, -260); addLandmark(shaft);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(19, 20, 14, 28).translate(0, 333, 0).scale(1, 1, 0.82), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.3, 1.6), transparent: true, opacity: 0.85 }));
      crown.position.copy(shaft.position); addLandmark(crown, 0x606060);
      // Transamerica Pyramid: a 260 m four-sided spire with its two wings.
      const y1 = sfHeight(-180, -620);
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(30, 230, 4).translate(0, 115, 0).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xd9d4c8 }));
      pyr.position.set(-180, y1, -620); addLandmark(pyr, 0xb0b0b0);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 4).translate(0, 250, 0).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xe8e4dc, emissive: 0xffe0b0, emissiveIntensity: 0.3 }));
      spire.position.copy(pyr.position); addLandmark(spire, 0xc0c0c0);
      for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 150, 12).translate(s * 18, 75, 10), new THREE.MeshLambertMaterial({ color: 0xcdc8bc })); wing.position.copy(pyr.position); addLandmark(wing, 0xa8a8a8); }
      // 555 California: the dark granite slab.
      const y2 = sfHeight(-60, -480);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(62, 237, 40).translate(0, 118.5, 0), new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: 0.7, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0.03 }));
      slab.position.set(-60, y2, -480); addLandmark(slab, 0x808080);
      // Coit Tower on Telegraph Hill.
      const y3 = sfHeight(-450, -1250);
      const coit = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 64, 16).translate(0, 32, 0), new THREE.MeshLambertMaterial({ color: 0xe6e0d2, emissive: 0xffe6c0, emissiveIntensity: 0.25 }));
      coit.position.set(-450, y3, -1250); addLandmark(coit, 0xb0b0b0);
      // Ferry Building clock tower.
      const y4 = sfHeight(330, 10);
      const ferry = new THREE.Mesh(new THREE.BoxGeometry(12, 72, 12).translate(0, 36, 0), new THREE.MeshLambertMaterial({ color: 0xd8d0be, emissive: 0xffe0b0, emissiveIntensity: 0.3 }));
      ferry.position.set(330, y4, 10); addLandmark(ferry, 0xb0b0b0);
      const hall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 200).translate(0, 7, 0), new THREE.MeshLambertMaterial({ color: 0xcfc6b4 }));
      hall.position.set(335, y4, 10); addLandmark(hall, 0xa0a0a0);
      // Alcatraz: the cellhouse and its lighthouse.
      const y5 = sfHeight(-900, -2600);
      const cell = new THREE.Mesh(new THREE.BoxGeometry(110, 18, 40).translate(0, 9, 0), new THREE.MeshLambertMaterial({ color: 0x9a948a, emissive: 0xffe6c0, emissiveIntensity: 0.15 }));
      cell.position.set(-900, y5, -2600); addLandmark(cell, 0x909090);
      const lh = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 26, 10).translate(0, 13, 0), new THREE.MeshLambertMaterial({ color: 0xe0dcd0 }));
      lh.position.set(-880, y5 + 18, -2585); addLandmark(lh, 0xb0b0b0);
    }

    // Row houses on the hills: attached, two to four floors, flat roofs behind a cornice,
    // a bay window on every front, built out to the sidewalk round each block.
    const front = SanFrancisco.rowhouseTextures(), bay = SanFrancisco.bayTextures();
    for (const t of [front.map, front.night, bay.map, bay.night]) t.anisotropy = aniso;
    const plaster = new THREE.MeshStandardMaterial({ color: 0xd6d2ca, roughness: 0.92 });
    const roofTop = new THREE.MeshStandardMaterial({ map: SanFrancisco.flatRoofTexture(), roughness: 0.97 });
    this.houseFront = new THREE.MeshStandardMaterial({ map: front.map, emissiveMap: front.night, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.75 });
    this.bayMat = new THREE.MeshStandardMaterial({ map: bay.map, emissiveMap: bay.night, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
    const houseGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, -0.5);      // front face at z = 0, looking +z
    const bayGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5);
    const PALETTE = [0xece6da, 0xd9d6cf, 0xe6dcc2, 0xc7d0d4, 0xb9c6c9, 0xd2c3a8, 0xbfa88f, 0xb8bfb0, 0xe0d2bf, 0xa9a59a, 0xd7c9c3, 0x9fb0b8, 0xc9b79c, 0xb5c2b3, 0x8f8f88, 0xd8b9a4, 0x7f8a94];
    const lots: { x: number; z: number; ry: number; w: number; d: number; h: number; base: number; c: number; bay: boolean }[] = [];
    const hr = mulberry(41), LOT = 7.6;
    for (let bx = -24; bx <= 2; bx++) for (let bz = -14; bz <= 12; bz++) {
      const X = bx * BLOCK, Z = bz * BLOCK, cx = X + BLOCK / 2, cz = Z + BLOCK / 2;
      if (inDowntown(cx, cz) || inSoma(cx, cz) || landMask(cx, cz) < 0.5) continue;
      if (Math.hypot(cx + 450, cz + 1250) < 120 || Math.hypot(cx - 380, cz - 750) < 220 || Math.hypot(cx - 430, cz - 1150) < 160) continue;   // Pioneer Park round Coit Tower, the ballpark, the arena
      if (cx < -2650 && cz < -900) continue;                                                                                                  // the Presidio: trees
      const a0 = X + MARGIN, a1 = X + BLOCK - MARGIN, b0 = Z + MARGIN, b1 = Z + BLOCK - MARGIN;
      const street = (sx: number, sz: number, dx: number, dz: number, len: number, ry: number) => {
        const n = Math.floor(len / LOT);
        for (let k = 0; k < n; k++) {
          if (hr() < 0.04) continue;                                                  // a gap: a driveway or a garden
          const px = sx + dx * (k + 0.5) * LOT, pz = sz + dz * (k + 0.5) * LOT;
          if (landMask(px, pz) < 0.97 || landMask(px + dz * 20, pz - dx * 20) < 0.97 || marketDist(px, pz) < 30) continue;
          if (px > -1175 && px < -985 && pz > -1162 && pz < -1103) continue;      // Lombard's block: the switchbacks and their beds
          const d = 17 + hr() * 7, floors = hr() < 0.18 ? 2 : hr() < 0.7 ? 3 : 4;
          let base = Infinity; for (const [ox, oz] of [[0, 0], [dz * 3.5, -dx * 3.5], [-dz * 3.5, dx * 3.5]]) base = Math.min(base, sfHeight(px + ox, pz + oz));
          lots.push({ x: px, z: pz, ry, w: LOT - 0.05, d, h: floors * 3.3 + 1.4 + (sfHeight(px, pz) - base), base: base - 0.6, c: PALETTE[Math.floor(hr() * PALETTE.length)], bay: hr() < 0.85 });
        }
      };
      street(a0, b0, 1, 0, a1 - a0, Math.PI);            // north side, facing north (-z)
      street(a0, b1, 1, 0, a1 - a0, 0);                  // south side, facing south
      street(a0, b0 + 18, 0, 1, b1 - b0 - 36, -Math.PI / 2);   // west side, facing west
      street(a1, b0 + 18, 0, 1, b1 - b0 - 36, Math.PI / 2);    // east side, facing east
    }
    const houses = new THREE.InstancedMesh(houseGeo, [plaster, plaster, roofTop, plaster, this.houseFront, plaster], lots.length);
    const bays = new THREE.InstancedMesh(bayGeo, [this.bayMat, this.bayMat, roofTop, plaster, this.bayMat, plaster], lots.filter(l => l.bay).length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let bi = 0;
    lots.forEach((l, i) => {
      q.setFromAxisAngle(up, l.ry);
      p3.set(l.x, l.base, l.z); sc.set(l.w, l.h, l.d); houses.setMatrixAt(i, m4.compose(p3, q, sc)); houses.setColorAt(i, col.set(l.c));
      if (l.bay) {
        const fz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        p3.set(l.x, l.base + l.h * 0.36, l.z).addScaledVector(fz, 0); sc.set(l.w * 0.62, l.h * 0.5, 1.0);
        bays.setMatrixAt(bi, m4.compose(p3, q, sc)); bays.setColorAt(bi, col.set(l.c)); bi++;
      }
    });
    // Cornices: a white ledge across the top of every front, throwing its own shadow line.
    const cornices = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 }), lots.length);
    lots.forEach((l, i) => { q.setFromAxisAngle(up, l.ry); p3.set(l.x, l.base + l.h - 0.9, l.z); sc.set(l.w + 0.3, 0.9, 0.9); cornices.setMatrixAt(i, m4.compose(p3, q, sc)); });
    for (const m of [houses, bays, cornices]) { m.castShadow = m.receiveShadow = true; this.scene.add(m); this.irSwap.push({ mesh: m, eo: m.material as unknown as THREE.Material, ir: new THREE.MeshLambertMaterial({ color: 0x8c8c8c }) }); }

    // Trees on the hills and in the Presidio and Marin.
    const treeGeo = new THREE.IcosahedronGeometry(1, 1).scale(4, 2.2, 4).translate(0, 1.2, 0);     // low rounded scrub and cypress clumps
    const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const treesAt: [number, number][] = [];
    const tr = mulberry(9);
    for (let i = 0; i < 6000; i++) {
      const x = -6000 + tr() * 6500, z = -5200 + tr() * 6400;
      const inCity = x > -2600 && z > -1500 && z < 1400 && x < 600;
      if (landMask(x, z) < 0.95 || inCity || (x > -1000 && z > -1400 && z < 400)) continue;
      treesAt.push([x, z]);
    }
    const tm = new THREE.InstancedMesh(treeGeo, treeMat, treesAt.length); tm.castShadow = true;
    treesAt.forEach(([x, z], i) => { p3.set(x, sfHeight(x, z) - 1.2, z); const k = 0.6 + tr() * 1.3; sc.set(k * (0.7 + tr() * 0.8), k * (0.5 + tr() * 0.7), k * (0.7 + tr() * 0.8)); q.setFromAxisAngle(up, tr() * 6.28); tm.setMatrixAt(i, m4.compose(p3, q, sc)); tm.setColorAt(i, col.setRGB(0.24 + tr() * 0.1, 0.3 + tr() * 0.1, 0.16 + tr() * 0.06, THREE.SRGBColorSpace)); });
    this.scene.add(tm);
    this.irSwap.push({ mesh: tm, eo: treeMat, ir: new THREE.MeshLambertMaterial({ color: 0x5a5a5a }) });

    // Golden Gate Bridge and the Bay Bridge.
    this.ggMat = this.bridge(new THREE.Vector3(-3250, 0, -1780), new THREE.Vector3(-3900, 0, -2900), 0xc4442a, 227, true, glow);
    this.bbMat = this.bridge(new THREE.Vector3(330, 0, -150), new THREE.Vector3(2100, 0, -420), 0x8e9096, 160, false, glow);

    // Cable-car wires up California and Powell.
    const wires: THREE.Vector3[] = [], poles = new Geo();
    const wire = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 40);
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
        wires.push(new THREE.Vector3(x0, sfHeight(x0, z0) + 6, z0), new THREE.Vector3(x1, sfHeight(x1, z1) + 6, z1));
        poles.box(x0 - 0.3, z0 - 0.3, x0 + 0.3, z0 + 0.3, sfHeight(x0, z0) - 1, sfHeight(x0, z0) + 6.5, [0.2, 0.2, 0.22]);
      }
    };
    wire(-1400, -450, 320, -450); wire(-1400, -455, 320, -455); wire(-350, -1300, -350, 100); wire(-355, -1300, -355, 100);
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), new THREE.LineBasicMaterial({ color: 0x0c0c0e, transparent: true, opacity: 0.8 })));
    this.scene.add(new THREE.Mesh(poles.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));

    // City lights: street lamps along every street and warm windows in the rows, on as dusk sets in.
    const lp: number[] = [], lc: number[] = [];
    const lr = mulberry(5);
    const lamp = (x: number, z: number, warm: number) => { lp.push(x, sfHeight(x, z) + 5, z); lc.push(1.0 * warm, 0.62 * warm + 0.2 * (1 - warm), 0.3 * warm + 0.5 * (1 - warm)); };
    for (let bx = -24; bx <= 3; bx++) for (let bz = -14; bz <= 8; bz++) {
      const X = bx * BLOCK, Z = bz * BLOCK;
      for (let s = 0; s < BLOCK; s += 27) {
        for (const [x, z] of [[X + s, Z + 5], [X + 5, Z + s]] as [number, number][]) if (landMask(x, z) > 0.95 && lr() < 0.8) lamp(x + (lr() - 0.5) * 3, z + (lr() - 0.5) * 3, 0.85 + lr() * 0.15);
      }
    }
    // The Embarcadero's palm-lined light strip and the far shores.
    for (let z = 400; z > -1500; z -= 18) { const x = shoreX(z) - 14; lamp(x, z, 0.6); }
    for (let x = -1500; x > -3400; x -= 22) lamp(x, shoreZ(x) + 40, 0.9);
    for (let i = 0; i < 260; i++) { const x = -2300 - lr() * 900, z = -2960 - lr() * 260; if (landMask(x, z) > 0.95 && sfHeight(x, z) < 40) lamp(x, z, 0.9); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    this.lightMat = new THREE.PointsMaterial({ map: glow, size: 9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9 });
    this.lights = new THREE.Points(lg, this.lightMat); this.scene.add(this.lights);

    // Traffic: along the Embarcadero, over the Bay Bridge and down Market Street, as moving lights.
    const carGeo = new THREE.BoxGeometry(1.9, 1.4, 4.4).translate(0, 0.7, 0);
    const carMat = new THREE.MeshLambertMaterial({ color: 0x9a9aa0 });
    const CARS = 150;
    this.carMesh = new THREE.InstancedMesh(carGeo, carMat, CARS); this.scene.add(this.carMesh);
    this.irSwap.push({ mesh: this.carMesh, eo: carMat, ir: new THREE.MeshLambertMaterial({ color: 0xe0e0e0 }) });
    this.carLights = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), CARS * 2);
    this.scene.add(this.carLights);
    const road = (pts: [number, number][]) => { const v = pts.map(([x, z]) => new THREE.Vector3(x, sfHeight(x, z) + 0.2, z)); let len = 0; for (let i = 1; i < v.length; i++) len += v[i].distanceTo(v[i - 1]); this.carPaths.push({ pts: v, len }); };
    road([[shoreX(400) - 28, 400], [shoreX(0) - 28, 0], [shoreX(-600) - 28, -600], [shoreX(-1200) - 28, -1200], [shoreX(-1450) - 28, -1450]]);
    road([[shoreX(-1450) - 22, -1450], [shoreX(-1200) - 22, -1200], [shoreX(-600) - 22, -600], [shoreX(0) - 22, 0], [shoreX(400) - 22, 400]]);
    road([[300, -20], [-1400, 280]]); road([[-1400, 284], [300, -16]]);
    road([[-1400, -448], [320, -448]]); road([[-2600, -1000], [-2600, 400]]);
    const cr = mulberry(77);
    for (let i = 0; i < CARS; i++) {
      const p = this.carPaths[Math.floor(cr() * this.carPaths.length)];
      const car: Car = { axis: 0, road: this.carPaths.indexOf(p), dir: 1, off: 0, s: cr() * p.len, v: 9 + cr() * 8, vmax: 17, len: 4.4, sx: 1, sy: 1, sz: 1, x: 0, z: 0, dx: 1, dz: 0, eo: [0.6, 0.6, 0.62], heat: 1, id: i + 1 };
      this.cars.push(car);
    }

    // Fog: a volume of horizontal slices. The bank rolls in through the Gate below the deck and
    // over the headlands; by day a thin marine layer lies broken over the downtown tower tops.
    this.fogLayer = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, mood: { value: 0 }, sunDir: { value: SUN_DAY.clone() }, slice: { value: 0 }, fogCol: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float time; uniform float mood; uniform vec3 sunDir; uniform vec3 fogCol; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
        float band(float y, float lo, float hi, float soft){ return smoothstep(lo, lo + soft, y) * (1.0 - smoothstep(hi - soft, hi, y)); }
        // The lie of the land under the fog (the same hills as sfHeight, without the fine relief).
        float ground(vec2 p){
          float gh = 0.0;
          gh += 95.0 * exp(-((p.x - (-800.0)) * (p.x - (-800.0)) + (p.y - (-750.0)) * (p.y - (-750.0))) / (380.0 * 380.0));
          gh += 85.0 * exp(-((p.x - (-1150.0)) * (p.x - (-1150.0)) + (p.y - (-1200.0)) * (p.y - (-1200.0))) / (320.0 * 320.0));
          gh += 78.0 * exp(-((p.x - (-450.0)) * (p.x - (-450.0)) + (p.y - (-1250.0)) * (p.y - (-1250.0))) / (180.0 * 180.0));
          gh += 110.0 * exp(-((p.x - (-2100.0)) * (p.x - (-2100.0)) + (p.y - (-900.0)) * (p.y - (-900.0))) / (700.0 * 700.0));
          gh += 270.0 * exp(-((p.x - (-3000.0)) * (p.x - (-3000.0)) + (p.y - (900.0)) * (p.y - (900.0))) / (800.0 * 800.0));
          gh += 80.0 * exp(-((p.x - (-400.0)) * (p.x - (-400.0)) + (p.y - (1500.0)) * (p.y - (1500.0))) / (500.0 * 500.0));
          gh += 70.0 * exp(-((p.x - (-1800.0)) * (p.x - (-1800.0)) + (p.y - (300.0)) * (p.y - (300.0))) / (500.0 * 500.0));
          gh += 200.0 * exp(-((p.x - (-3400.0)) * (p.x - (-3400.0)) + (p.y - (-4000.0)) * (p.y - (-4000.0))) / (1300.0 * 1300.0));
          gh += 170.0 * exp(-((p.x - (-4700.0)) * (p.x - (-4700.0)) + (p.y - (-3500.0)) * (p.y - (-3500.0))) / (1000.0 * 1000.0));
          gh += 150.0 * exp(-((p.x - (-2500.0)) * (p.x - (-2500.0)) + (p.y - (-4400.0)) * (p.y - (-4400.0))) / (900.0 * 900.0));
          gh += 190.0 * exp(-((p.x - (-5600.0)) * (p.x - (-5600.0)) + (p.y - (-4200.0)) * (p.y - (-4200.0))) / (1200.0 * 1200.0));
          gh += 26.0 * exp(-((p.x - (-900.0)) * (p.x - (-900.0)) + (p.y - (-2600.0)) * (p.y - (-2600.0))) / (150.0 * 150.0));
          gh += 90.0 * exp(-((p.x - (-1900.0)) * (p.x - (-1900.0)) + (p.y - (-4000.0)) * (p.y - (-4000.0))) / (520.0 * 520.0));
          gh += 90.0 * exp(-((p.x - (2000.0)) * (p.x - (2000.0)) + (p.y - (-430.0)) * (p.y - (-430.0))) / (260.0 * 260.0));
          float city = smoothstep(-40.0, 80.0, min(350.0 + 0.18 * p.y - p.x, p.y - (-1450.0 + 0.1 * p.x)));
          float marin = smoothstep(0.0, 220.0, -2900.0 - p.y) * smoothstep(-1800.0, -2600.0, p.x);
          float land = max(city, marin);
          return land * (4.0 + gh);
        }
        void main(){
          vec2 wind = vec2(time * 6.0, time * 1.5);
          float y = vW.y;
          // The Gate bank: west of the city, thickest over the strait, spilling east into the Bay.
          float gate = smoothstep(-1500.0, -2800.0, vW.x) * smoothstep(-1300.0, -2000.0, vW.z) * smoothstep(-3900.0, -3100.0, vW.z);
          gate *= band(y, 8.0, 150.0 - 60.0 * smoothstep(-3000.0, -1800.0, vW.x), 40.0);
          // The marine layer over downtown, by day only.
          float marine = smoothstep(-700.0, -300.0, vW.x) * smoothstep(900.0, 400.0, vW.x) * smoothstep(-1300.0, -700.0, vW.z) * smoothstep(900.0, 300.0, vW.z);
          marine *= band(y, 140.0, 215.0, 25.0) * step(mood, 0.5);
          float n = fbm((vW.xz + wind) * 0.0032 + y * 0.004);
          float d = gate * smoothstep(0.38, 0.72, n) + marine * smoothstep(0.52, 0.8, n) * 0.8;
          // Distance softens every slice into the haze; up close it thins so the camera passes through.
          float dist = length(vW - cameraPosition);
          d *= smoothstep(20.0, 160.0, dist);
          d *= smoothstep(0.0, 45.0, y - ground(vW.xz));                // fog lies on the land, never cut by it
          float a = clamp(d * 0.22, 0.0, 0.5);
          // Lit from the sun on top, cooler in the body.
          float top = smoothstep(0.45, 0.85, n);
          float bright = mood < 0.5 ? 1.9 : (mood < 1.5 ? 1.2 : 0.55);
          vec3 lit = fogCol * bright * (0.85 + 0.35 * top * clamp(sunDir.y * 2.0 + 0.3, 0.0, 1.0));
          gl_FragColor = vec4(lit, a);
          #include <colorspace_fragment>
        }`,
    });
    for (let k = 0; k < 11; k++) {
      const yk = 12 + k * 19;
      const m = this.fogLayer.clone(); m.uniforms = this.fogLayer.uniforms;      // one set of uniforms for every slice
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(7000, 6000).rotateX(-Math.PI / 2), m);
      slab.position.set(-2400, yk, -1400); slab.renderOrder = 10 + k; slab.name = 'fog'; this.scene.add(slab);
    }

    // A container ship making for the Gate, a speedboat on the Bay with its wake, the Wharf's Ferris wheel.
    this.ship = new THREE.Group();
    {
      // Hull: a plan-view outline (fine bow, square stern) extruded, with a dark boot top and a red underbody line.
      const outline = new THREE.Shape();
      outline.moveTo(-150, -21); outline.lineTo(110, -21); outline.quadraticCurveTo(160, -16, 178, 0); outline.quadraticCurveTo(160, 16, 110, 21); outline.lineTo(-150, 21); outline.lineTo(-150, -21);
      const hullGeo = new THREE.ExtrudeGeometry(outline, { depth: 18, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 0, 0);
      const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.6, metalness: 0.2 }));
      const boot = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 2.2, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(1.004, 1, 1.02), new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.8 }));
      boot.position.y = -1;
      const deckTop = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.6, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(0.99, 1, 0.94), new THREE.MeshStandardMaterial({ color: 0x9a3b30, roughness: 0.9 }));
      deckTop.position.y = 18;
      const house = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 38).translate(-122, 33, 0), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6, emissive: 0xffe0b0, emissiveIntensity: 0.15 }));
      const bridgeWing = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 48).translate(-122, 46, 0), house.material);
      const funnel = new THREE.Mesh(new THREE.BoxGeometry(9, 14, 7).translate(-140, 30, 0), new THREE.MeshStandardMaterial({ color: 0x2a6f4e, roughness: 0.7 }));
      const bowWave = new THREE.Mesh(new THREE.PlaneGeometry(60, 30).rotateX(-Math.PI / 2).translate(165, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      const wakeS = new THREE.Mesh(new THREE.PlaneGeometry(420, 60).rotateX(-Math.PI / 2).translate(-350, 0.4, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
      this.ship.add(hull, boot, deckTop, house, bridgeWing, funnel, bowWave, wakeS);
      for (const m of [hull, house, bridgeWing, funnel]) m.castShadow = m.receiveShadow = true;
      const cr = mulberry(21), cols = [0x2a6f4e, 0xb03a2e, 0x2b4f8f, 0xc9963a, 0x7a7d82, 0x1f5a3a, 0xd8d8d4, 0x8a4a2a];
      const boxG = new THREE.BoxGeometry(12, 2.6, 2.4), boxM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.15 });
      const stacks = new THREE.InstancedMesh(boxG, boxM, 7 * 20 * 6);
      const m4s = new THREE.Matrix4(), qs = new THREE.Quaternion(), ss = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), cs = new THREE.Color();
      let n = 0;
      for (let bay = 0; bay < 20; bay++) for (let row = 0; row < 7; row++) {
        const tiers = 2 + Math.floor(cr() * 5);
        for (let t = 0; t < tiers; t++) { ps.set(-100 + bay * 12.4, 19.5 + t * 2.7, -15 + row * 5); stacks.setMatrixAt(n, m4s.compose(ps, qs, ss)); stacks.setColorAt(n, cs.set(cols[Math.floor(cr() * cols.length)])); n++; }
      }
      stacks.count = n; stacks.castShadow = stacks.receiveShadow = true; this.ship.add(stacks);
      this.scene.add(this.ship);
    }
    this.boat = new THREE.Group();
    {
      const hullB = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 3).translate(0, 1, 0), new THREE.MeshLambertMaterial({ color: 0xf2f2f0 }));
      const wakeC = document.createElement('canvas'); wakeC.width = 128; wakeC.height = 32; const wg = wakeC.getContext('2d')!;
      const gr = wg.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)');
      wg.fillStyle = gr; wg.beginPath(); wg.moveTo(0, 16); wg.lineTo(128, 2); wg.lineTo(128, 30); wg.closePath(); wg.fill();
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(140, 22).rotateX(-Math.PI / 2).translate(-72, 0.6, 0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wakeC), transparent: true, depthWrite: false }));
      this.boat.add(hullB, wake); this.scene.add(this.boat);
    }
    this.wheel = new THREE.Group();
    {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(30, 1.1, 8, 48), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
      const spokes: THREE.Vector3[] = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; spokes.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 30, Math.sin(a) * 30, 0)); }
      this.wheel.add(rim, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), new THREE.LineBasicMaterial({ color: 0xdddddd })));
      const lp: number[] = [], lc: number[] = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; lp.push(Math.cos(a) * 30, Math.sin(a) * 30, 0); lc.push(1, 0.8, 0.5); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
      const rimLights = new THREE.Points(lg, new THREE.PointsMaterial({ map: glow, size: 8, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      rimLights.name = 'lights'; this.wheel.add(rimLights);
      const wy = sfHeight(-1250, -1590); this.wheel.position.set(-1250, wy + 34, -1590); this.wheel.rotation.y = 0.4;
      const legs = new THREE.Mesh(new THREE.ConeGeometry(4, 34, 4).translate(0, 17, 0), new THREE.MeshLambertMaterial({ color: 0xcfcfcf })); legs.position.set(-1250, wy, -1590);
      this.scene.add(this.wheel, legs);
    }
    // Oracle Park on the south waterfront and the Chase Center beyond it.
    {
      const py = sfHeight(380, 750);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(150, 156, 30, 48, 1, true).translate(0, 15, 0), new THREE.MeshLambertMaterial({ color: 0xb59a7c, side: THREE.DoubleSide }));
      bowl.position.set(380, py, 750); bowl.scale.z = 0.85;
      const field = new THREE.Mesh(new THREE.CircleGeometry(118, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f5e2a, roughness: 0.95 })); field.position.set(380, py + 0.6, 750); field.scale.z = 0.85;
      const seats = new THREE.Mesh(new THREE.RingGeometry(118, 150, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4a6a48, side: THREE.DoubleSide })); seats.position.set(380, py + 22, 750); seats.scale.z = 0.85;
      const diamond = new THREE.Mesh(new THREE.PlaneGeometry(52, 52).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xb08a5a })); diamond.position.set(380, py + 1.0, 780);
      this.scene.add(bowl, field, seats, diamond);
      for (const [dx, dz] of [[-150, -110], [150, -110], [-150, 110], [150, 110]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 48, 8).translate(0, 24, 0), new THREE.MeshLambertMaterial({ color: 0x9a9a9a })); pole.position.set(380 + dx, py, 750 + dz * 0.85); this.scene.add(pole);
        const lampS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.8, 1.8, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lampS.position.set(380 + dx, py + 50, 750 + dz * 0.85); lampS.scale.setScalar(14); lampS.name = 'night'; this.scene.add(lampS);
      }
      const ay = sfHeight(430, 1150);
      const arena = new THREE.Mesh(new THREE.CylinderGeometry(92, 98, 34, 40).translate(0, 17, 0), new THREE.MeshLambertMaterial({ color: 0xd9d6cf })); arena.position.set(430, ay, 1150); arena.scale.z = 0.8;
      const roof = new THREE.Mesh(new THREE.CircleGeometry(90, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf4f4f2 })); roof.position.set(430, ay + 34.2, 1150); roof.scale.z = 0.8;
      this.scene.add(arena, roof);
    }

    // Lombard Street: the brick switchbacks down Russian Hill, hedged and planted, with cars picking their way down.
    {
      const road = new Geo(), beds = new Geo();
      const pts: [number, number][] = [];
      for (let i = 0; i <= 8; i++) pts.push([-1160 + i * 20, i % 2 ? -1112 : -1150]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = 12;
        for (let k = 0; k < n; k++) {
          const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
          const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * 3.2, nz = dx / l * 3.2;
          const y0 = sfHeight(x0, z0) + 0.3, y1 = sfHeight(x1, z1) + 0.3;
          road.quad([x0 - nx, y0, z0 - nz], [x1 - x0, y1 - y0, z1 - z0], [nx * 2, 0, nz * 2], [0, 0, 1, 0, 1, 1, 0, 1], [0.26, 0.13, 0.09]);
        }
      }
      for (let i = 0; i < 8; i++) {
        const x0 = -1160 + i * 20 + 5, z0 = -1144, y = sfHeight(x0 + 4, z0 + 13);
        beds.box(x0, z0, x0 + 9, z0 + 26, y - 1.5, y + 1.1, [0.09, 0.19, 0.08]);
        for (let k = 0; k < 5; k++) { const fx = x0 + 1 + (k * 1.7) % 7, fz = z0 + 2 + k * 4.6; beds.box(fx, fz, fx + 1.4, fz + 1.4, y + 1.1, y + 1.5, i % 2 ? [0.55, 0.22, 0.36] : [0.6, 0.42, 0.55]); }
      }
      const roadMesh = new THREE.Mesh(road.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })); roadMesh.receiveShadow = true;
      const bedMesh = new THREE.Mesh(beds.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); bedMesh.castShadow = bedMesh.receiveShadow = true;
      this.scene.add(roadMesh, bedMesh);
      this.carPaths.push({ pts: pts.map(([x, z]) => new THREE.Vector3(x, sfHeight(x, z) + 0.9, z)), len: pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0) });
    }

    // Parked cars and street trees along the hill streets: what a drone sees from above a neighbourhood.
    {
      const pr = mulberry(23);
      const carColors = [0xe8e8e6, 0xd0d2d6, 0x2a2b2e, 0x8a8d92, 0x9b2c2c, 0x2c4a8a, 0x5a5e63, 0xf2f2f0, 0x3a3a3c, 0xb8bcc2];
      const spots: { x: number; z: number; ry: number; c: number }[] = [], treesXZ: [number, number][] = [];
      for (let bx = -24; bx <= 2; bx++) for (let bz = -14; bz <= 12; bz++) {
        const X = bx * BLOCK, Z = bz * BLOCK, cx = X + BLOCK / 2, cz = Z + BLOCK / 2;
        if (inDowntown(cx, cz) || landMask(cx, cz) < 0.5) continue;
        if (Math.hypot(cx - 380, cz - 750) < 220 || Math.hypot(cx - 430, cz - 1150) < 160 || Math.hypot(cx + 450, cz + 1250) < 120) continue;
        for (let s = 6; s < BLOCK - 6; s += 8) {
          for (const [x, z, ry] of [[X + s, Z + 8.5, Math.PI / 2], [X + s, Z + BLOCK - 8.5, Math.PI / 2], [X + 8.5, Z + s, 0], [X + BLOCK - 8.5, Z + s, 0]] as [number, number, number][]) {
            if (landMask(x, z) < 0.97 || marketDist(x, z) < 20) continue;
            if (pr() < 0.42) spots.push({ x, z, ry, c: carColors[Math.floor(pr() * carColors.length)] });
          }
        }
        for (let s = 14; s < BLOCK - 10; s += 22) {
          for (const [x, z] of [[X + s, Z + 11.2], [X + s, Z + BLOCK - 11.2], [X + 11.2, Z + s], [X + BLOCK - 11.2, Z + s]] as [number, number][]) {
            if (landMask(x, z) < 0.97 || marketDist(x, z) < 20 || pr() > 0.45) continue;
            treesXZ.push([x, z]);
          }
        }
      }
      const carG = new THREE.BoxGeometry(4.4, 1.45, 1.8).translate(0, 0.72, 0);
      const carM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4 });
      const parked = new THREE.InstancedMesh(carG, carM, spots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      spots.forEach((c, i) => { q.setFromAxisAngle(up, c.ry); p3.set(c.x, sfHeight(c.x, c.z) - 0.2, c.z); parked.setMatrixAt(i, m4.compose(p3, q, sc)); parked.setColorAt(i, col.set(c.c)); });
      parked.castShadow = true; this.scene.add(parked);
      this.irSwap.push({ mesh: parked, eo: carM, ir: new THREE.MeshLambertMaterial({ color: 0xb0b0b0 }) });
      const stG = mergeGeometries([new THREE.CylinderGeometry(0.18, 0.22, 3.2, 5).translate(0, 1.6, 0).toNonIndexed(), new THREE.IcosahedronGeometry(2.6, 1).scale(1, 0.9, 1).translate(0, 4.6, 0)])!;
      const stM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
      const st = new THREE.InstancedMesh(stG, stM, treesXZ.length);
      treesXZ.forEach(([x, z], i) => { p3.set(x, sfHeight(x, z) - 0.3, z); sc.setScalar(0.8 + pr() * 0.5); q.setFromAxisAngle(up, pr() * 6.28); st.setMatrixAt(i, m4.compose(p3, q, sc)); st.setColorAt(i, col.setRGB(0.18 + pr() * 0.1, 0.3 + pr() * 0.12, 0.12 + pr() * 0.06, THREE.SRGBColorSpace)); });
      st.castShadow = true; this.scene.add(st);
      this.irSwap.push({ mesh: st, eo: stM, ir: new THREE.MeshLambertMaterial({ color: 0x5a5a5a }) });
    }

    this.shots = SanFrancisco.shotList();
    const fly = flyRoute();
    this.flyShots = [{ dur: fly.spec.dur, mood: 'DAY', fov: fly.spec.fov, pose: (t, _u, o) => { const p = fly.pose(t); o.pos.copy(p.pos); o.look.copy(p.look); o.up = p.up.clone(); } }];
    this.total = this.shots.reduce((a, sh) => a + sh.dur, 0);

  }

  /** The edit: each shot's length, time of day and camera move. Landmarks are in world metres. */
  private static shotList(): Shot[] {
    const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const GG_S = V3(-3432, 0, -2094), GG_N = V3(-3718, 0, -2586), GG_MID = V3(-3575, 0, -2340);
    const SALES = V3(180, 0, -260), TRANS = V3(-180, 0, -620), COIT = V3(-450, 0, -1250), FERRY = V3(330, 0, 10), ORACLE = V3(380, 0, 750), WHEEL = V3(-1250, 0, -1590), ALC = V3(-900, 0, -2600);
    const lerp = (a: THREE.Vector3, b: THREE.Vector3, u: number) => a.clone().lerp(b, u);
    const orbit = (c: THREE.Vector3, r0: number, r1: number, h0: number, h1: number, a0: number, a1: number, lookH: number) =>
      (t: number, u: number, o: { pos: THREE.Vector3; look: THREE.Vector3 }) => { const a = a0 + (a1 - a0) * u, r = r0 + (r1 - r0) * u; o.pos.set(c.x + Math.cos(a) * r, h0 + (h1 - h0) * u, c.z + Math.sin(a) * r); o.look.set(c.x, lookH, c.z); void t; };
    return [
      // Daylight
      { dur: 7, mood: 'DAY', fov: 34, pose: (_t, u, o) => { o.pos.copy(lerp(V3(-3230, 120, -2030), V3(-3420, 110, -2330), ease(u))); o.look.copy(GG_N).setY(190); } },                    // along the cables to the north tower
      { dur: 5, mood: 'DAY', fov: 36, pose: (_t, u, o) => { o.pos.set(SALES.x - 60 + u * 30, 620 - u * 60, SALES.z - 40); o.look.set(SALES.x - 60 + u * 30, 0, SALES.z - 39); o.roll = 0.3 + u * 0.25; } },    // straight down on the Salesforce Tower and its shadow, slowly turning
      { dur: 8, mood: 'DAY', fov: 40, pose: (_t, u, o) => { o.pos.copy(lerp(V3(760, 430, 1050), V3(640, 400, 320), u)); o.look.copy(lerp(V3(200, 140, -200), V3(120, 160, -320), u)); } },   // high over the Bay Bridge, fog on the towers
      { dur: 6, mood: 'DAY', fov: 36, pose: (_t, u, o) => { o.pos.copy(lerp(V3(-760, 150, -1010), V3(-520, 160, -830), u)); o.look.copy(TRANS).setY(150); } },                            // North Beach toward the Pyramid
      { dur: 5, mood: 'DAY', fov: 36, pose: (_t, u, o) => { o.pos.copy(lerp(V3(-800, 210, -1520), V3(-680, 200, -1470), u)); o.look.copy(COIT).setY(115); } },                             // Coit Tower
      { dur: 5, mood: 'DAY', fov: 40, pose: (_t, u, o) => { o.pos.set(-1080 + u * 20, 330 - u * 80, -1131); o.look.set(-1080 + u * 20, 0, -1130); o.roll = 0.2; } },                     // Lombard, straight down, descending
      { dur: 7, mood: 'DAY', fov: 36, pose: (_t, u, o) => { o.pos.copy(lerp(V3(760, 320, 950), V3(470, 130, 330), ease(u))); o.look.copy(FERRY).setY(30); } },                             // down the piers to the Embarcadero
      { dur: 7, mood: 'DAY', fov: 34, pose: (_t, u, o) => { o.pos.copy(lerp(V3(1520, 125, -150), V3(820, 115, -60), u)); o.look.copy(lerp(V3(600, 100, -330), V3(250, 130, -350), u)); } },   // along the Bay Bridge, the city through the trusses
      { dur: 7, mood: 'DAY', fov: 34, pose: (_t, u, o, w) => { const b = w.boat.position; o.pos.set(b.x + 20, 160, b.z + 30); o.look.copy(lerp(b.clone(), V3(60, 160, -420), ease(Math.max(0, (u - 0.45) / 0.55)))); } },   // the speedboat, then up to the skyline
      { dur: 7, mood: 'DAY', fov: 36, pose: (_t, u, o) => { o.pos.copy(lerp(V3(-420, 150, 125), V3(-140, 115, 75), ease(u))); o.look.copy(FERRY).setY(40); } },   // down Market Street to the Ferry Building
      { dur: 7, mood: 'DAY', fov: 36, pose: orbit(ORACLE, 300, 200, 230, 150, 0.4, 1.9, 40) },                                                                                            // Oracle Park, descending orbit
      { dur: 6, mood: 'DAY', fov: 34, pose: (_t, u, o) => { o.pos.copy(lerp(V3(-1560, 190, -1380), V3(-1360, 180, -1430), u)); o.look.copy(lerp(WHEEL.clone().setY(60), ALC.clone().setY(30), ease(Math.max(0, (u - 0.5) / 0.5)))); } },   // the Wharf, then Alcatraz
      // Golden hour
      { dur: 8, mood: 'GOLDEN', fov: 16, pose: (_t, u, o, w) => { const s = w.ship.position; o.pos.set(s.x + 950, 300, s.z + 520); o.look.set(s.x - u * 120, 15, s.z); } },              // the container ship in the fog, long lens
      { dur: 8, mood: 'GOLDEN', fov: 34, pose: orbit(GG_S, 330, 300, 210, 190, 2.4, 3.9, 150) },                                                                                         // round the south tower
      { dur: 5, mood: 'GOLDEN', fov: 34, pose: (_t, u, o) => { const p = lerp(GG_S, GG_MID, 0.3 + u * 0.4); o.pos.set(p.x, 240, p.z); o.look.set(p.x, 0, p.z + 1); o.roll = -0.5; } },   // straight down across the lanes
      { dur: 8, mood: 'GOLDEN', fov: 42, pose: (_t, u, o) => { o.pos.copy(lerp(V3(-4200, 420, -3350), V3(-4900, 440, -3450), u)); o.look.copy(lerp(V3(-5600, 30, -2500), V3(-6300, 20, -2600), u)); } },   // over the headlands to the ocean and the sunset   // along the headlands' cliffs to the sunset
      // Blue hour
      { dur: 9, mood: 'BLUE', fov: 34, pose: orbit(GG_N, 400, 360, 180, 165, 0.2, 1.5, 140) },                                                                                            // the north tower floodlit
      { dur: 8, mood: 'BLUE', fov: 40, pose: (_t, u, o) => { o.pos.set(-3150, 260, -2750); o.look.copy(lerp(V3(-4300, 200, -3300), V3(-200, 120, -500), ease(u))); } },                    // the headlands to the glowing city, fade out
    ];
  }

  /** The front of a row house: three floors of paired sash windows over a garage, a cornice at the top. Tinted per house. */
  private static rowhouseTextures() {
    const W = 256, H = 384;
    const mk = (night: boolean) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
      const r = mulberry(night ? 17 : 5);
      g.fillStyle = night ? '#000' : '#f4f1ea'; g.fillRect(0, 0, W, H);
      if (!night) {
        g.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 1);         // siding lines
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, 26); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 26, W, 4);   // cornice and its shadow
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 30, W, 3);
      }
      const floors = 3, fh = (H - 30 - 90) / floors;
      for (let f = 0; f < floors; f++) for (const x of [34, 150]) {
        const y = 30 + f * fh + fh * 0.18, w = 72, h = fh * 0.62;
        if (night) { if (r() < 0.5) { g.fillStyle = r() < 0.7 ? 'rgba(255,196,120,0.95)' : 'rgba(210,225,255,0.9)'; g.fillRect(x, y, w, h); } continue; }
        g.fillStyle = '#ffffff'; g.fillRect(x - 5, y - 5, w + 10, h + 12);                                  // trim
        const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#46545e'); gr.addColorStop(1, '#1c2329');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = '#f2f2f2'; g.fillRect(x, y + h * 0.48, w, 3); g.fillRect(x + w / 2 - 1.5, y, 3, h);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, y + 3, w * 0.4, h * 0.4);                 // sky in the glass
      }
      // Ground floor: garage door and the entry stair.
      if (!night) {
        g.fillStyle = '#d9d6cf'; g.fillRect(0, H - 90, W, 90);
        g.fillStyle = '#6f6a62'; g.fillRect(24, H - 76, 120, 76); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = H - 76; y < H; y += 12) g.fillRect(24, y, 120, 2);
        g.fillStyle = '#4a3a2e'; g.fillRect(178, H - 80, 44, 80); g.fillStyle = '#ffffff'; g.fillRect(172, H - 86, 56, 6);
      } else if (r() < 0.6) { g.fillStyle = 'rgba(255,200,130,0.8)'; g.fillRect(186, H - 76, 28, 20); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    return { map: mk(false), night: mk(true) };
  }

  /** A bay window: three tall panes framed in white. */
  private static bayTextures() {
    const mk = (night: boolean) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d')!;
      g.fillStyle = night ? '#000' : '#f6f4ee'; g.fillRect(0, 0, 128, 128);
      for (let f = 0; f < 2; f++) {
        const y = 10 + f * 60, h = 44;
        if (night) { g.fillStyle = f ? 'rgba(255,190,110,0.9)' : 'rgba(255,214,150,0.85)'; g.fillRect(10, y, 108, h); continue; }
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#55646e'); gr.addColorStop(1, '#1d242a');
        g.fillStyle = gr; g.fillRect(10, y, 108, h);
        g.fillStyle = '#ffffff'; g.fillRect(44, y, 4, h); g.fillRect(80, y, 4, h); g.fillRect(10, y + h * 0.45, 108, 3);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    return { map: mk(false), night: mk(true) };
  }

  /** A flat tar-and-gravel roof with its parapet edge and a skylight. */
  private static flatRoofTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d')!;
    const r = mulberry(8);
    g.fillStyle = '#8a8884'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { const v = 110 + r() * 60; g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(r() * 128, r() * 128, 1.5, 1.5); }
    g.fillStyle = '#d8d6d0'; g.fillRect(0, 0, 128, 6); g.fillRect(0, 122, 128, 6); g.fillRect(0, 0, 6, 128); g.fillRect(122, 0, 6, 128);
    g.fillStyle = '#9fb2bc'; g.fillRect(52, 40, 22, 30);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }



  /** The street map painted onto the ground: blocks, streets and the shores. Emissive pass draws the street lighting. */
  private paintMap(size: number, emissive: boolean): HTMLCanvasElement {
    const W = 4096, c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d')!, k = W / size, ox = W / 2, oz = W / 2;
    const px = (x: number) => ox + x * k, pz = (z: number) => oz + z * k;
    g.fillStyle = emissive ? '#000' : '#131516'; g.fillRect(0, 0, W, W);
    if (!emissive) {
      // Land: warm grey where the city is, scrub green on the far hills.
      const img = g.getImageData(0, 0, W, W), d = img.data, step = 4;
      for (let j = 0; j < W; j += step) for (let i = 0; i < W; i += step) {
        const x = (i - ox) / k, z = (j - oz) / k, m = landMask(x, z);
        if (m < 0.05) continue;
        const h = sfHeight(x, z);
        const city = x > -2700 && z > -1600 && z < 600 && x < 400;
        const scrub = city ? 0 : vnoise(x / 140 + 3.1, z / 140 + 9.7), rock = city ? 0 : Math.max(0, vnoise(x / 60, z / 60) - 0.72) * 3;
        const r = city ? 104 : 104 + h * 0.05 - scrub * 34 + rock * 40, gg = city ? 97 : 98 + h * 0.03 - scrub * 26 + rock * 36, b = city ? 88 : 62 - scrub * 22 + rock * 34;
        const hash = ((i * 7 + j * 13) % 17) / 17 * 10 - 5;
        for (let jj = 0; jj < step; jj++) for (let ii = 0; ii < step; ii++) { const o = ((j + jj) * W + i + ii) * 4; d[o] = (r + hash) * m + 30 * (1 - m); d[o + 1] = (gg + hash) * m + 48 * (1 - m); d[o + 2] = (b + hash) * m + 62 * (1 - m); }
      }
      g.putImageData(img, 0, 0);
    }
    // Streets on the grid across the city, drawn as the lit strips they are at dusk.
    g.lineWidth = emissive ? Math.max(1, 3 * k) : Math.max(1, STREET * k);
    g.strokeStyle = emissive ? 'rgba(255,170,90,0.7)' : '#26272b';
    if (emissive) g.setLineDash([2.5 * k, 22 * k]);
    for (let bx = -26; bx <= 4; bx++) { const x = px(bx * BLOCK); g.beginPath(); g.moveTo(x, pz(-1700)); g.lineTo(x, pz(1900)); g.stroke(); }
    for (let bz = -16; bz <= 16; bz++) { const z = pz(bz * BLOCK); g.beginPath(); g.moveTo(px(-2900), z); g.lineTo(px(400), z); g.stroke(); }
    // Market Street cuts the grid; the Embarcadero follows the shore.
    g.lineWidth = emissive ? Math.max(1, 3 * k) : Math.max(1.5, 26 * k); g.strokeStyle = emissive ? 'rgba(255,190,110,0.8)' : '#2b2c30';
    g.beginPath(); g.moveTo(px(340), pz(-10)); g.lineTo(px(-3000), pz(580)); g.stroke();
    g.beginPath(); g.moveTo(px(shoreX(450) - 26), pz(450)); for (let z = 450; z >= -1450; z -= 50) g.lineTo(px(shoreX(z) - 26), pz(z)); g.stroke();
    g.beginPath(); g.moveTo(px(-1500), pz(shoreZ(-1500) + 40)); g.lineTo(px(-3400), pz(shoreZ(-3400) + 40)); g.stroke();
    // Lombard Street's switchbacks down Russian Hill, with the flower beds between them.
    if (!emissive) {
      g.setLineDash([]); g.lineWidth = Math.max(1, 7 * k); g.strokeStyle = '#7d7f84';
      g.beginPath(); g.moveTo(px(-1160), pz(-1150));
      for (let i = 0; i <= 8; i++) g.lineTo(px(-1160 + i * 20), pz(i % 2 ? -1112 : -1150));
      g.stroke();
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#6d4a58' : '#3d5a36'; g.fillRect(px(-1160 + i * 20 + 5), pz(-1144), 9 * k, 26 * k); }
    }
    // Piers along the Embarcadero.
    if (!emissive) { g.fillStyle = '#4a4a4c'; for (let z = 300; z > -1400; z -= 130) { const x = shoreX(z); g.save(); g.translate(px(x), pz(z)); g.rotate(-0.18); g.fillRect(0, -9 * k, 120 * k, 18 * k); g.restore(); } }
    return c;
  }

  /** The road surface of a bridge deck: six lanes with dashed white lines, repeated along the span. */
  private static deckTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d')!;
    g.fillStyle = '#3c3d42'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#e8d84a'; g.fillRect(0, 31, 128, 2);
    g.fillStyle = '#d9d9d9'; for (const y of [10, 20, 43, 53]) for (let x = 0; x < 128; x += 24) g.fillRect(x, y, 12, 1.5);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 62, 128, 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** A suspension bridge from A to B: towers, cables, suspenders and the deck, with its lights. */
  private bridge(a: THREE.Vector3, b: THREE.Vector3, color: number, towerH: number, golden: boolean, glow: THREE.Texture): THREE.MeshStandardMaterial {
    const dir = b.clone().sub(a); const len = dir.length(); dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const deckY = golden ? 67 : 50, g = new Geo(), rgb: V = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, metalness: 0.2 });
    const group = new THREE.Group(); this.scene.add(group);
    // Deck: a box along the span.
    const deckTex = SanFrancisco.deckTexture(); deckTex.wrapS = THREE.RepeatWrapping; deckTex.repeat.set(len / 40, 1);
    const deckGeo = new THREE.BoxGeometry(len, 4, 26);
    const deck = new THREE.Mesh(deckGeo, [new THREE.MeshLambertMaterial({ color: 0x3a3b3f }), new THREE.MeshLambertMaterial({ color: 0x3a3b3f }), new THREE.MeshLambertMaterial({ map: deckTex }), new THREE.MeshLambertMaterial({ color: 0x2a2b2f }), new THREE.MeshLambertMaterial({ color: 0x3a3b3f }), new THREE.MeshLambertMaterial({ color: 0x3a3b3f })]);
    deck.position.copy(a).lerp(b, 0.5).setY(deckY); deck.rotation.y = -Math.atan2(dir.z, dir.x); group.add(deck);
    for (const side of [-1, 1]) { const rp = [a.clone().addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), side * 6), b.clone().addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), side * 6)]; if (side > 0) rp.reverse(); this.carPaths.push({ pts: rp.map(v => v.setY(deckY + 2.2)), len }); }
    const towers = golden ? [0.28, 0.72] : [0.2, 0.42, 0.64, 0.86];
    const cablePts: THREE.Vector3[] = [], hang: THREE.Vector3[] = [];
    for (const t of towers) {
      const c = a.clone().lerp(b, t);
      for (const s of [-1, 1]) {
        const p = c.clone().addScaledVector(side, s * 11);
        g.box(p.x - 3.5, p.z - 3.5, p.x + 3.5, p.z + 3.5, 0, towerH, rgb);
      }
      for (const y of [deckY + 18, deckY + 60, towerH - 12, towerH - 45]) { const p = c.clone(); g.box(p.x - 12, p.z - 2, p.x + 12, p.z + 2, y, y + 5, rgb); }
    }
    // Main cables between the tower tops, hanging as parabolas; suspenders every 30 m.
    const spans = [0, ...towers, 1];
    for (let i = 0; i + 1 < spans.length; i++) {
      const t0 = spans[i], t1 = spans[i + 1];
      const y0 = i === 0 ? deckY + 2 : towerH, y1 = i + 2 === spans.length ? deckY + 2 : towerH;
      const sag = i === 0 || i + 2 === spans.length ? 0 : (towerH - deckY - 6);
      const n = Math.ceil(((t1 - t0) * len) / 30);
      for (const s of [-1, 1]) {
        for (let k = 0; k <= n; k++) {
          const u = k / n, t = t0 + (t1 - t0) * u;
          const y = y0 + (y1 - y0) * u - sag * 4 * u * (1 - u);
          const p = a.clone().lerp(b, t).addScaledVector(side, s * 11).setY(y);
          if (k > 0) cablePts.push(cablePts[cablePts.length - 1].clone(), p); else cablePts.push(p, p.clone());
          if (k > 0 && k < n) hang.push(p.clone(), p.clone().setY(deckY + 2));
        }
      }
    }
    // Main cables as tubes, so they read at any distance; the suspenders stay as lines.
    const cableGroup = new THREE.Group();
    for (let i = 0; i + 1 < cablePts.length; i += 2) {
      const a2 = cablePts[i], b2 = cablePts[i + 1];
      if (a2.distanceTo(b2) < 0.01) continue;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(golden ? 0.95 : 0.6, golden ? 0.95 : 0.6, a2.distanceTo(b2), 6, 1), new THREE.MeshStandardMaterial({ color: golden ? 0xd85a38 : 0xa8aab0, roughness: 0.5, metalness: 0.3 }));
      seg.position.copy(a2).lerp(b2, 0.5); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b2.clone().sub(a2).normalize()); cableGroup.add(seg);
    }
    const cable = cableGroup;
    const susp = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hang), new THREE.LineBasicMaterial({ color: golden ? 0xb84a2e : 0x8a8c92, transparent: true, opacity: 0.7 }));
    group.add(cable, susp);
    const towersMesh = new THREE.Mesh(g.geometry(), mat); group.add(towersMesh);
    this.irSwap.push({ mesh: towersMesh, eo: mat, ir: new THREE.MeshLambertMaterial({ color: 0x7a7a7a }) });
    this.irSwap.push({ mesh: deck, eo: deck.material as unknown as THREE.Material, ir: new THREE.MeshLambertMaterial({ color: 0x6a6a6a }) });
    // Deck lights and the red beacons on the towers.
    const lp: number[] = [], lc: number[] = [];
    for (let k = 0; k <= len / 24; k++) { const p = a.clone().lerp(b, (k * 24) / len); for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * 13); lp.push(q.x, deckY + 5, q.z); lc.push(1, 0.72, 0.4); } }
    for (const t of towers) { const c = a.clone().lerp(b, t); lp.push(c.x, towerH + 2, c.z); lc.push(1, 0.15, 0.1); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    const pts = new THREE.Points(lg, new THREE.PointsMaterial({ map: glow, size: 10, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    group.add(pts); this.irSwap.push({ mesh: pts, eo: pts.material, ir: new THREE.PointsMaterial({ size: 0, transparent: true, opacity: 0 }) });
    return mat;
  }

  private detail = -1;
  /** Trade detail for speed: fewer fog slices and a smaller shadow map as the level rises. */
  setDetail(level: number) {
    if (level === this.detail) return; this.detail = level;
    let k = 0;
    this.scene.traverse(o => { if (o.name === 'fog') { o.userData.slice = k++; } });
    this.scene.traverse(o => { if (o.name === 'fog') o.userData.off = level === 0 ? false : level === 1 ? o.userData.slice % 2 === 1 : o.userData.slice % 3 !== 0; });
    const size = level === 0 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
  }
  private hidden: THREE.Object3D[] = [];
  /** Hide everything that is not solid geometry (fog, sprites, points, lines) for a depth prepass, and restore. */
  solidOnly(on: boolean) {
    if (on) {
      this.hidden = [];
      this.scene.traverse(o => { if (o.visible && (o.name === 'fog' || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).transparent)) { o.visible = false; this.hidden.push(o); } });
    } else { for (const o of this.hidden) o.visible = true; this.hidden = []; }
  }

  /** The sky as an environment for reflections, one per time of day, made on first use. */
  private envFor(mood: Mood): THREE.Texture | null {
    if (!this.renderer) return null;
    if (!this.env[mood]) {
      const sky = this.sky.clone();
      sky.uniforms = THREE.UniformsUtils.clone(this.sky.uniforms);
      sky.uniforms.mood.value = MOOD_K[mood];
      sky.uniforms.sunDir.value = (mood === 'BLUE' ? SUN_NIGHT : mood === 'GOLDEN' ? SUN_DUSK : SUN_DAY).clone();
      const s = new THREE.Scene();
      s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky));
      // The city below the horizon: a dark warm ground so glass does not mirror sky downward.
      const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: mood === 'BLUE' ? 0x06070b : mood === 'GOLDEN' ? 0x2a2420 : 0x3a3a38 }));
      ground.position.y = -2; s.add(ground);
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env[mood] = pm.fromScene(s, 0, 0.5, 400).texture;
      pm.dispose();
    }
    return this.env[mood] ?? null;
  }

  /** The shot playing at this moment of the take, with the time into it. */
  shotAt(time: number, reel: Reel = 'TOUR'): { shot: Shot; t: number; u: number; index: number } {
    if (reel === 'FLY') {
      const sh = this.flyShots[0], dbgT = (globalThis as { __flyT?: number }).__flyT;
      const t = typeof dbgT === 'number' ? Math.min(sh.dur, dbgT) : ((time % sh.dur) + sh.dur) % sh.dur;
      return { shot: sh, t, u: t / sh.dur, index: 0 };
    }
    const dbg = (globalThis as { __sfShot?: number }).__sfShot;
    if (typeof dbg === 'number' && this.shots[dbg]) { const sh = this.shots[dbg]; return { shot: sh, t: sh.dur * 0.55, u: 0.55, index: dbg }; }
    let t = ((time % this.total) + this.total) % this.total;
    for (let i = 0; i < this.shots.length; i++) { const sh = this.shots[i]; if (t < sh.dur) return { shot: sh, t, u: t / sh.dur, index: i }; t -= sh.dur; }
    const last = this.shots[this.shots.length - 1]; return { shot: last, t: last.dur, u: 1, index: this.shots.length - 1 };
  }

  /** Switch the scene to the EO or IR materials and to the shot's time of day (night operations force blue hour). */
  applyLook(look: Look, mood: Mood) {
    const ir = look === 'IR_DAY' || look === 'IR_NIGHT';
    const night = look === 'NIGHT' || look === 'IR_NIGHT';
    this.forcedNight = night;
    if (night) mood = 'BLUE';
    this.mood = mood;
    const day = mood === 'DAY', golden = mood === 'GOLDEN', blue = mood === 'BLUE';
    for (const s of this.irSwap) (s.mesh as THREE.Mesh).material = ir ? s.ir : s.eo;
    for (const m of this.facadeMats) m.emissiveIntensity = blue ? 1.3 : golden ? 0.35 : 0;
    this.houseFront.emissiveIntensity = this.bayMat.emissiveIntensity = blue ? 1.1 : golden ? 0.25 : 0;
    if (!ir) this.scene.environment = this.envFor(mood); else this.scene.environment = null;
    this.gndMat.emissiveIntensity = blue ? 0.9 : golden ? 0.55 : 0;
    this.lights.visible = !ir && !day; this.carLights.visible = !ir && !day; this.sunDisc.visible = !ir && !blue;
    this.scene.traverse(o => { if (o.name === 'fog') o.visible = !ir && !o.userData.off; });
    this.fogLayer.uniforms.mood.value = MOOD_K[mood];
    this.fogLayer.uniforms.fogCol.value.set(blue ? 0x28324a : golden ? 0xd9c3ae : 0xeef1f4);
    this.ggMat.emissive.set(blue ? 0xff9a3c : 0x000000); this.ggMat.emissiveIntensity = blue ? 0.5 : 0;
    this.bbMat.emissive.set(blue ? 0xdfe6ff : 0x000000); this.bbMat.emissiveIntensity = blue ? 0.35 : 0;
    this.scene.traverse(o => { if (o.name === 'night') o.visible = !ir && !day; });
    const wl = this.wheel.getObjectByName('lights'); if (wl) wl.visible = !ir && !day;
    const sunDir = blue ? SUN_NIGHT : golden ? SUN_DUSK : SUN_DAY;
    this.sky.uniforms.sunDir.value.copy(sunDir); this.sky.uniforms.mood.value = MOOD_K[mood];
    this.fogLayer.uniforms.sunDir.value.copy(sunDir);
    this.water.uniforms.sunDir.value.copy(sunDir); this.water.uniforms.mood.value = MOOD_K[mood];
    this.sun.position.copy(sunDir).multiplyScalar(4000);
    if (ir) {
      this.scene.background = new THREE.Color(0.1, 0.1, 0.1); this.fog.color.setRGB(0.22, 0.22, 0.22); this.fog.density = 0.0003;
      this.sun.color.setRGB(1, 1, 1); this.sun.intensity = 1.2; this.hemi.color.setRGB(1, 1, 1); this.hemi.groundColor.setRGB(1, 1, 1); this.hemi.intensity = night ? 2.2 : 1.6;
    } else if (blue) {
      this.scene.background = null; this.fog.color.setRGB(0.06, 0.07, 0.14); this.fog.density = 0.00028;
      this.sun.color.set(0x6a7fc0); this.sun.intensity = 0.3; this.hemi.color.set(0x1e2a4c); this.hemi.groundColor.set(0x0e0c12); this.hemi.intensity = 0.75;
    } else if (golden) {
      this.scene.background = null; this.fog.color.set(0x8a7d78); this.fog.density = 0.00042;
      this.sun.color.set(0xffc48a); this.sun.intensity = 2.8; this.hemi.color.set(0x8ea8d8); this.hemi.groundColor.set(0x4a3a2c); this.hemi.intensity = 0.8;
    } else {
      this.scene.background = null; this.fog.color.set(0xa9bfd4); this.fog.density = 0.00013;
      this.sun.color.set(0xfff4e6); this.sun.intensity = 2.3; this.hemi.color.set(0xbcd4f0); this.hemi.groundColor.set(0x8a8070); this.hemi.intensity = 0.75;
    }
    this.lightMat.opacity = blue ? 1 : 0.85; this.lightMat.size = blue ? 11 : 8;
    this.sunDisc.position.copy(sunDir).multiplyScalar(7800);
    this.sunDisc.scale.setScalar(day ? 160 : 520);
    (this.sunDisc.material as THREE.SpriteMaterial).color.set(day ? 0xffffff : 0xffb070);
  }

  /** Advance traffic, water and fog. */
  update(dt: number) {
    this.t += dt;
    this.water.uniforms.time.value = this.t;
    this.fogLayer.uniforms.time.value = this.t;
    // The container ship crosses the strait into the Bay; the speedboat runs out toward Alcatraz; the wheel turns.
    { const u = (this.t * 6) % 1700; this.ship.position.set(-4100 + u * 0.88, 0.5, -2650 + u * 0.35); this.ship.rotation.y = -Math.atan2(0.35, 0.88); }
    { const u = (this.t * 14) % 1500, a = new THREE.Vector3(250, 0.4, -600), b = new THREE.Vector3(-650, 0.4, -1950); this.boat.position.copy(a).lerp(b, u / 1500); this.boat.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); }
    this.wheel.rotation.z = this.t * 0.08;
    const trails = this.mood === 'BLUE';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.cars.forEach((c, i) => {
      const path = this.carPaths[c.road];
      c.s = (c.s + c.v * dt) % path.len;
      let d = c.s, k = 0;
      while (k + 1 < path.pts.length - 1 && d > path.pts[k].distanceTo(path.pts[k + 1])) { d -= path.pts[k].distanceTo(path.pts[k + 1]); k++; }
      const a = path.pts[k], b = path.pts[k + 1], seg = a.distanceTo(b) || 1;
      p.lerpVectors(a, b, d / seg); c.x = p.x; c.z = p.z; c.dx = (b.x - a.x) / seg; c.dz = (b.z - a.z) / seg;
      q.setFromAxisAngle(up, Math.atan2(c.dx, c.dz));
      this.carMesh.setMatrixAt(i, m4.compose(p, q, s));
      // Headlights ahead, tail lights behind.
      const head = p.clone().add(new THREE.Vector3(c.dx * 2.6, 0.8, c.dz * 2.6)), tail = p.clone().add(new THREE.Vector3(-c.dx * 2.4, 0.8, -c.dz * 2.4));
      this.carLights.setMatrixAt(i * 2, m4.compose(head, q, s.set(trails ? 4 : 5, trails ? 1.2 : 3, trails ? 26 : 1)));
      this.carLights.setMatrixAt(i * 2 + 1, m4.compose(tail, q, s.set(trails ? 3 : 3.5, trails ? 1 : 2, trails ? 26 : 1)));
      this.carLights.setColorAt(i * 2, new THREE.Color(1.5, 1.4, 1.2)); this.carLights.setColorAt(i * 2 + 1, new THREE.Color(1.6, 0.15, 0.1));
      s.set(1, 1, 1);
    });
    this.carMesh.instanceMatrix.needsUpdate = true; this.carLights.instanceMatrix.needsUpdate = true;
    if (this.carLights.instanceColor) this.carLights.instanceColor.needsUpdate = true;
  }

  /**
   * Place the camera for this moment of the edit. Returns the sun's place on
   * screen for the flare, the fade to black at the end of the reel, and the mood.
   */
  pose(cam: THREE.PerspectiveCamera, time: number, zoom: number, reel: Reel = 'TOUR'): ShotState {
    const { shot, t, u, index } = this.shotAt(time, reel);
    const shots = reel === 'FLY' ? this.flyShots : this.shots;
    const o: { pos: THREE.Vector3; look: THREE.Vector3; roll: number; up?: THREE.Vector3 } = { pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0 };
    shot.pose(t, u, o, this);
    cam.position.copy(o.pos);
    cam.near = 2; cam.far = SF_CAMERA_FAR;
    cam.fov = (2 * Math.atan(Math.tan(((shot.fov ?? 34) * Math.PI) / 360) / Math.max(1, zoom)) * 180) / Math.PI;
    cam.updateProjectionMatrix();
    // Looking straight down needs a reference for "up": north, turned by the shot's roll.
    const down = Math.abs(o.look.y - o.pos.y) > 0.98 * o.look.distanceTo(o.pos);
    if (o.up) cam.up.copy(o.up); else if (down) cam.up.set(Math.sin(o.roll), 0, -Math.cos(o.roll)); else cam.up.set(Math.sin(o.roll), Math.cos(o.roll), 0);
    cam.lookAt(o.look);
    cam.up.set(0, 1, 0);
    cam.updateMatrixWorld();
    // Shadows cover the ground the shot is looking at: where the line of sight meets the city, or the look point.
    const dirV = o.look.clone().sub(o.pos).normalize();
    const tHit = dirV.y < -0.05 ? Math.min(o.pos.y / -dirV.y, 900) : 350;
    const focus = o.pos.clone().addScaledVector(dirV, tHit).setY(0);
    const sd0 = (this.forcedNight || shot.mood === 'BLUE' ? SUN_NIGHT : shot.mood === 'GOLDEN' ? SUN_DUSK : SUN_DAY);
    this.sun.target.position.copy(focus); this.sun.position.copy(focus).addScaledVector(sd0, 3000);
    this.sun.target.updateMatrixWorld();
    const mood: Mood = this.forcedNight ? 'BLUE' : shot.mood;
    const sunDir = mood === 'BLUE' ? SUN_NIGHT : mood === 'GOLDEN' ? SUN_DUSK : SUN_DAY;
    const sd = sunDir.clone().multiplyScalar(7800).project(cam);
    const sun = sd.z > 1 || Math.abs(sd.x) > 1.3 || Math.abs(sd.y) > 1.3 ? null : new THREE.Vector2((sd.x + 1) / 2, (sd.y + 1) / 2);
    // The reel fades out over its last two seconds and in over its first.
    let fade = 1;
    if (index === shots.length - 1) fade = Math.min(1, (shot.dur - t) / 2);
    if (index === 0) fade = Math.min(fade, t / 1);
    return { sun, fade: Math.max(0, fade), mood };
  }
}
