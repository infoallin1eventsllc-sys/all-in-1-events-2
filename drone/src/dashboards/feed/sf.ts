import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Geo, type Look, type Car } from './city';
import * as T from './textures';

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

interface Shot { dur: number; mood: Mood; fov?: number; pose: (t: number, u: number, o: { pos: THREE.Vector3; look: THREE.Vector3; roll: number }, w: SanFrancisco) => void }
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
export function sfHeight(x: number, z: number) {
  let h = 0;
  for (const g of HILLS) h += gauss(x, z, ...g);
  for (const g of MARIN) h += gauss(x, z, ...g);
  for (const g of ISLANDS) h += gauss(x, z, ...g);
  return landMask(x, z) * (4 + h);
}

// ---- Structures ---------------------------------------------------------------------
interface Tower { x: number; z: number; w: number; d: number; h: number; style: T.FacadeStyle }
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
  private banks: THREE.Sprite[] = [];
  private lights: THREE.Points;
  private lightMat: THREE.PointsMaterial;
  private facadeMats: THREE.MeshLambertMaterial[] = [];
  private irSwap: { mesh: THREE.Mesh | THREE.InstancedMesh | THREE.Points | THREE.Sprite; eo: THREE.Material; ir: THREE.Material }[] = [];
  private carMesh: THREE.InstancedMesh;
  private carLights: THREE.InstancedMesh;
  private carPaths: { pts: THREE.Vector3[]; len: number }[] = [];
  private t = 0;
  private night = false;
  private sunDisc: THREE.Sprite;
  private gndMat!: THREE.MeshLambertMaterial;
  private ggMat!: THREE.MeshLambertMaterial;
  private bbMat!: THREE.MeshLambertMaterial;
  private marine: THREE.Sprite[] = [];
  private ship!: THREE.Group;
  private boat!: THREE.Group;
  private wheel!: THREE.Group;
  private shots: Shot[] = [];
  private total = 0;
  private mood: Mood = 'DAY';
  private forcedNight = false;

  constructor(maxAniso = 8, glow: THREE.Texture) {
    const aniso = Math.min(8, maxAniso);
    this.scene.fog = this.fog;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sun.position.copy(SUN_DUSK).multiplyScalar(4000); this.sun.target.position.set(0, 0, 0);

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
          vec3 zen = pick(vec3(0.10, 0.30, 0.76), vec3(0.05, 0.10, 0.24), vec3(0.03, 0.05, 0.18));
          vec3 horC = pick(vec3(0.50, 0.66, 0.88), vec3(0.42, 0.44, 0.52), vec3(0.10, 0.12, 0.26));
          vec3 horW = pick(vec3(0.80, 0.86, 0.94), vec3(1.0, 0.52, 0.22), vec3(0.36, 0.20, 0.24));
          vec3 hor = mix(horC, horW, pow(toSun, 2.5));
          vec3 col = mix(hor, zen, pow(y, pick(vec3(0.6), vec3(0.42), vec3(0.42)).x));
          float s = max(dot(d, sunDir), 0.0);
          vec3 sunC = pick(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.6, 0.3), vec3(0.5, 0.55, 0.8));
          float glow = pick(vec3(pow(s, 300.0) * 2.0 + pow(s, 10.0) * 0.05), vec3(pow(s, 6.0) * 0.12 + pow(s, 120.0) * 1.2), vec3(pow(s, 40.0) * 0.1)).x;
          col += sunC * glow;
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
    const SIZE = 12000, SEG = 320;
    const gnd = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); gnd.rotateX(-Math.PI / 2);
    const gp = gnd.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < gp.count; i++) gp.setY(i, sfHeight(gp.getX(i), gp.getZ(i)) - 1.5);
    gnd.computeVertexNormals();
    const mapTex = new THREE.CanvasTexture(this.paintMap(SIZE, false)); mapTex.anisotropy = aniso; mapTex.colorSpace = THREE.SRGBColorSpace;
    const emit = new THREE.CanvasTexture(this.paintMap(SIZE, true)); emit.colorSpace = THREE.SRGBColorSpace;
    const gndMat = new THREE.MeshLambertMaterial({ map: mapTex, emissiveMap: emit, emissive: 0xffffff, emissiveIntensity: 0.6 });
    this.gndMat = gndMat;
    const ground = new THREE.Mesh(gnd, gndMat); this.scene.add(ground);
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
          vec3 horC = pick(vec3(0.50, 0.66, 0.88), vec3(0.42, 0.44, 0.52), vec3(0.10, 0.12, 0.26));
          vec3 horW = pick(vec3(0.80, 0.86, 0.94), vec3(1.0, 0.55, 0.25), vec3(0.36, 0.20, 0.24));
          vec3 skyHor = mix(horC, horW, pow(toSun, 2.5));
          vec3 skyZen = pick(vec3(0.10, 0.30, 0.76), vec3(0.06, 0.12, 0.26), vec3(0.03, 0.05, 0.18));
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

    // Downtown towers.
    const facades = { glass: T.facade('glass'), concrete: T.facade('concrete'), stone: T.facade('stone'), brick: T.facade('brick') };
    const G: Record<T.FacadeStyle, Geo> = { glass: new Geo(), concrete: new Geo(), stone: new Geo(), brick: new Geo() };
    const roofs = new Geo();
    const rng = mulberry(1907);
    const towers: Tower[] = [];
    const tower = (x: number, z: number, w: number, d: number, h: number, style: T.FacadeStyle) => {
      const y0 = sfHeight(x, z) - 0.5, y1 = y0 + h, g = G[style];
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      const c: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
      let u = Math.floor(rng() * 4) / 4; const v0 = Math.floor(rng() * 4) / 4;
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]); g.wall(a[0], a[1], b[0], b[1], y0, y1, u, u + len / T.FACADE_W, v0, v0 - h / T.FACADE_H); u += len / T.FACADE_W; }
      const rt = rng(); roofs.up(x0, z0, x1, z1, y1, (px, pz) => [px / 8, pz / 8], rt < 0.4 ? [0.3, 0.3, 0.32] : rt < 0.7 ? [0.5, 0.48, 0.45] : [0.62, 0.58, 0.5]);
      roofs.box(x - w * 0.2, z - d * 0.2, x + w * 0.2, z + d * 0.2, y1, y1 + 3 + rng() * 4, [0.45, 0.45, 0.47]);
      towers.push({ x, z, w, d, h, style });
    };
    // The Financial District: a grid of blocks, tallest round the foot of Market Street.
    for (let bx = -6; bx <= 2; bx++) for (let bz = -8; bz <= 3; bz++) {
      const X = bx * BLOCK, Z = bz * BLOCK;
      if (landMask(X + BLOCK / 2, Z + BLOCK / 2) < 0.9) continue;
      const cx = X + BLOCK / 2, cz = Z + BLOCK / 2;
      const core = Math.exp(-((cx - 120) ** 2 + (cz + 320) ** 2) / (420 * 420));
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = 26 + rng() * 34, d = 26 + rng() * 34;
        const px = X + STREET + w / 2 + rng() * Math.max(1, BLOCK - STREET * 2 - w), pz = Z + STREET + d / 2 + rng() * Math.max(1, BLOCK - STREET * 2 - d);
        if (Math.hypot(px - 180, pz + 260) < 45 || Math.hypot(px + 180, pz + 620) < 50) continue;   // room for the landmarks
        const floors = 6 + Math.floor(rng() * 10 + core * (30 + rng() * 40));
        const style: T.FacadeStyle = rng() < 0.45 + core * 0.3 ? 'glass' : rng() < 0.5 ? 'concrete' : rng() < 0.6 ? 'stone' : 'brick';
        tower(px, pz, w, d, floors * T.FLOOR, style);
      }
    }
    // North Beach and the hills: mid-rise fill along the streets.
    for (let bx = -20; bx <= -7; bx++) for (let bz = -13; bz <= 4; bz++) {
      const X = bx * BLOCK, Z = bz * BLOCK, cx = X + BLOCK / 2, cz = Z + BLOCK / 2;
      if (landMask(cx, cz) < 0.9 || rng() < 0.55) continue;
      const w = 22 + rng() * 26, d = 22 + rng() * 26;
      tower(X + STREET + w / 2 + rng() * (BLOCK - STREET * 2 - w), Z + STREET + d / 2 + rng() * (BLOCK - STREET * 2 - d), w, d, (4 + Math.floor(rng() * 6)) * T.FLOOR, rng() < 0.5 ? 'stone' : rng() < 0.5 ? 'concrete' : 'brick');
    }
    for (const style of Object.keys(G) as T.FacadeStyle[]) {
      const f = facades[style]; f.map.anisotropy = aniso; f.night.anisotropy = aniso;
      const mat = new THREE.MeshLambertMaterial({ map: f.map, emissiveMap: f.night, emissive: 0xffffff, emissiveIntensity: 0.75, vertexColors: true });
      this.facadeMats.push(mat);
      const mesh = new THREE.Mesh(G[style].geometry(), mat); this.scene.add(mesh);
      this.irSwap.push({ mesh, eo: mat, ir: new THREE.MeshLambertMaterial({ map: f.ir, color: 0x9a9a9a }) });
    }
    const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const roofMesh = new THREE.Mesh(roofs.geometry(), roofMat); this.scene.add(roofMesh);
    this.irSwap.push({ mesh: roofMesh, eo: roofMat, ir: new THREE.MeshLambertMaterial({ color: 0x7a7a7a }) });

    // Landmarks.
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x5f7d93, specular: 0x88aacc, shininess: 60, emissive: 0x2a3340, emissiveIntensity: 0.6 });
    const addLandmark = (mesh: THREE.Mesh, heat = 0x9a9a9a) => { this.scene.add(mesh); this.irSwap.push({ mesh, eo: mesh.material as THREE.Material, ir: new THREE.MeshLambertMaterial({ color: heat }) }); };
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
      const slab = new THREE.Mesh(new THREE.BoxGeometry(62, 237, 40).translate(0, 118.5, 0), new THREE.MeshLambertMaterial({ color: 0x3a3230, emissive: 0xffd9a0, emissiveIntensity: 0.12 }));
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

    // Victorian rows on the hills: painted ladies on every hill block, following the slope.
    const shade = (g: THREE.BufferGeometry, k: number) => { const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(k); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
    const house = mergeGeometries([
      shade(new THREE.BoxGeometry(8, 10, 12).translate(0, 5, 0), 1),
      shade(new THREE.BoxGeometry(2.6, 3, 2.2).translate(0, 5.5, 6.6), 1),                         // bay window
      shade(new THREE.ConeGeometry(6.4, 4, 4).rotateY(Math.PI / 4).scale(1, 1, 1.9).translate(0, 12, 0), 0.42),   // gabled roof, darker shingles
    ])!;
    const houseMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const PASTEL = [0xe8dcc8, 0xd9e6ea, 0xead7d0, 0xdfe5cf, 0xe6d3e0, 0xcfd6e6, 0xf0e2c6, 0xc9d7cc, 0xead9c2, 0xd5cfe6];
    const houses: { x: number; z: number; ry: number; c: number }[] = [];
    const hr = mulberry(41);
    for (let bx = -22; bx <= -6; bx++) for (let bz = -14; bz <= 5; bz++) {
      const X = bx * BLOCK, Z = bz * BLOCK;
      if (landMask(X + 55, Z + 55) < 0.95 || sfHeight(X + 55, Z + 55) < 12) continue;
      if (X > -750 && Z > -900 && Z < 400) continue;     // downtown
      for (let k = 0; k < 9; k++) {
        const s = STREET + 8 + k * 9.6;
        if (hr() < 0.85) houses.push({ x: X + s, z: Z + STREET + 7, ry: Math.PI, c: PASTEL[Math.floor(hr() * PASTEL.length)] });
        if (hr() < 0.85) houses.push({ x: X + s, z: Z + BLOCK - STREET - 7, ry: 0, c: PASTEL[Math.floor(hr() * PASTEL.length)] });
        if (hr() < 0.7) houses.push({ x: X + STREET + 7, z: Z + s, ry: Math.PI / 2, c: PASTEL[Math.floor(hr() * PASTEL.length)] });
        if (hr() < 0.7) houses.push({ x: X + BLOCK - STREET - 7, z: Z + s, ry: -Math.PI / 2, c: PASTEL[Math.floor(hr() * PASTEL.length)] });
      }
    }
    const hm = new THREE.InstancedMesh(house, houseMat, houses.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3(), col = new THREE.Color();
    houses.forEach((h, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.ry); p3.set(h.x, sfHeight(h.x, h.z) - 0.6, h.z); sc.setScalar(0.9 + hr() * 0.3); hm.setMatrixAt(i, m4.compose(p3, q, sc)); hm.setColorAt(i, col.set(h.c)); });
    this.scene.add(hm);
    this.irSwap.push({ mesh: hm, eo: houseMat, ir: new THREE.MeshLambertMaterial({ color: 0x8c8c8c }) });

    // Trees on the hills and in the Presidio and Marin.
    const treeGeo = mergeGeometries([new THREE.CylinderGeometry(0.4, 0.5, 3, 5).translate(0, 1.5, 0), new THREE.SphereGeometry(4, 7, 6).translate(0, 6, 0)])!;
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x24361e });
    const treesAt: [number, number][] = [];
    const tr = mulberry(9);
    for (let i = 0; i < 6000; i++) {
      const x = -6000 + tr() * 6500, z = -5200 + tr() * 6400;
      const inCity = x > -2600 && z > -1500 && z < 1400 && x < 600;
      if (landMask(x, z) < 0.95 || inCity || (x > -1000 && z > -1400 && z < 400)) continue;
      treesAt.push([x, z]);
    }
    const tm = new THREE.InstancedMesh(treeGeo, treeMat, treesAt.length);
    treesAt.forEach(([x, z], i) => { p3.set(x, sfHeight(x, z) - 0.5, z); sc.setScalar(1.2 + tr() * 1.6); q.identity(); tm.setMatrixAt(i, m4.compose(p3, q, sc)); });
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
    for (const h of houses) if (lr() < 0.6) { lp.push(h.x, sfHeight(h.x, h.z) + 4, h.z); lc.push(1, 0.75, 0.45); }
    // The Embarcadero's palm-lined light strip and the far shores.
    for (let z = 400; z > -1500; z -= 18) { const x = shoreX(z) - 14; lamp(x, z, 0.6); }
    for (let x = -1500; x > -3400; x -= 22) lamp(x, shoreZ(x) + 40, 0.9);
    for (let i = 0; i < 900; i++) { const x = -1700 - lr() * 3200, z = -2950 - lr() * 1800; if (landMask(x, z) > 0.95) lamp(x, z, 0.9); }
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

    // Fog: banks rolling in through the Gate and low sheets threading the towers.
    const bankTex = SanFrancisco.fogTexture();
    const fr = mulberry(3);
    const bank = (x: number, y: number, z: number, s: number, o: number, drift: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bankTex, color: 0xffffff, transparent: true, opacity: o, depthWrite: false, fog: true }));
      sp.position.set(x, y, z); sp.scale.set(s, s * 0.32, 1); sp.userData = { drift, x0: x, o };
      this.banks.push(sp); this.scene.add(sp);
    };
    for (let i = 0; i < 46; i++) bank(-4800 + fr() * 1900, 25 + fr() * 130, -1700 - fr() * 1600, 500 + fr() * 700, 0.34 + fr() * 0.26, 5 + fr() * 6);
    for (let i = 0; i < 24; i++) bank(-2800 + fr() * 1600, 30 + fr() * 80, -2100 - fr() * 1000, 400 + fr() * 500, 0.2 + fr() * 0.22, 4 + fr() * 5);
    for (let i = 0; i < 14; i++) bank(-700 + fr() * 900, 40 + fr() * 70, -900 + fr() * 1000, 200 + fr() * 220, 0.16 + fr() * 0.14, 1.5 + fr() * 2);
    for (let i = 0; i < 12; i++) bank(-2200 + fr() * 1500, 60 + fr() * 60, -1500 + fr() * 900, 260 + fr() * 300, 0.14 + fr() * 0.14, 2 + fr() * 2);

    // The marine layer: fog lying over the tower tops and the Bay by day.
    for (let i = 0; i < 34; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bankTex, color: 0xeef1f4, transparent: true, opacity: 0.16 + fr() * 0.2, depthWrite: false, fog: true }));
      sp.position.set(-400 + fr() * 1500, 130 + fr() * 90, -1100 + fr() * 1500); sp.scale.set(380 + fr() * 420, 90 + fr() * 70, 1); sp.userData = { drift: 3 + fr() * 4, x0: sp.position.x };
      this.marine.push(sp); this.scene.add(sp);
    }
    // A container ship making for the Gate, a speedboat on the Bay with its wake, the Wharf's Ferris wheel.
    this.ship = new THREE.Group();
    {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(300, 18, 42).translate(0, 9, 0), new THREE.MeshLambertMaterial({ color: 0x1f5a3a }));
      const bow = new THREE.Mesh(new THREE.ConeGeometry(21, 40, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.45, 1).translate(170, 9, 0), hull.material);
      const house = new THREE.Mesh(new THREE.BoxGeometry(22, 30, 36).translate(-120, 33, 0), new THREE.MeshLambertMaterial({ color: 0xe8e8e4 }));
      this.ship.add(hull, bow, house);
      const cr = mulberry(21), cols = [0x2a6f4e, 0xb03a2e, 0x2b4f8f, 0xc9963a, 0x7a7d82, 0x1f5a3a];
      for (let r = -3; r <= 2; r++) for (let c = 0; c < 4; c++) for (let l = 0; l < 3; l++) {
        if (cr() < 0.15) continue;
        const box = new THREE.Mesh(new THREE.BoxGeometry(38, 8, 9), new THREE.MeshLambertMaterial({ color: cols[Math.floor(cr() * cols.length)] }));
        box.position.set(-100 + r * 42, 22 + l * 8.5, -15 + c * 10); this.ship.add(box);
      }
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
      const field = new THREE.Mesh(new THREE.CircleGeometry(118, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f8a3a })); field.position.set(380, py + 0.6, 750); field.scale.z = 0.85;
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
    // Lombard Street's hedges and flower beds in 3D, so the top-down shot has something to see.
    {
      const hedges = new Geo();
      for (let i = 0; i < 8; i++) {
        const x0 = -1160 + i * 20 + 3, z0 = -1146, y = sfHeight(x0 + 7, z0 + 15);
        hedges.box(x0, z0, x0 + 14, z0 + 30, y - 1, y + 1.8, i % 2 ? [0.72, 0.28, 0.42] : [0.22, 0.45, 0.2]);
      }
      this.scene.add(new THREE.Mesh(hedges.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    }

    this.shots = SanFrancisco.shotList();
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
      { dur: 7, mood: 'DAY', fov: 30, pose: (t, u, o) => { o.pos.copy(lerp(V3(-3380, 150, -2000), V3(-3560, 135, -2320), ease(u))); o.look.copy(GG_N).setY(205); } },                    // along the cables to the north tower
      { dur: 5, mood: 'DAY', fov: 34, pose: (t, u, o) => { o.pos.set(FERRY.x + 40, 300 - u * 40, FERRY.z + 60); o.look.set(FERRY.x + 40, 0, FERRY.z + 61); o.roll = u * 0.35; } },    // straight down over the piers, slowly turning
      { dur: 8, mood: 'DAY', fov: 40, pose: (t, u, o) => { o.pos.copy(lerp(V3(760, 430, 1050), V3(640, 400, 320), u)); o.look.copy(lerp(V3(200, 140, -200), V3(120, 160, -320), u)); } },   // high over the Bay Bridge, fog on the towers
      { dur: 6, mood: 'DAY', fov: 36, pose: (t, u, o) => { o.pos.copy(lerp(V3(-760, 150, -1010), V3(-520, 160, -830), u)); o.look.copy(TRANS).setY(150); } },                            // North Beach toward the Pyramid
      { dur: 5, mood: 'DAY', fov: 36, pose: (t, u, o) => { o.pos.copy(lerp(V3(-800, 210, -1520), V3(-680, 200, -1470), u)); o.look.copy(COIT).setY(115); } },                             // Coit Tower
      { dur: 5, mood: 'DAY', fov: 34, pose: (t, u, o) => { o.pos.set(-1080 + u * 20, 230 - u * 70, -1131); o.look.set(-1080 + u * 20, 0, -1130); o.roll = 0.2; } },                     // Lombard, straight down, descending
      { dur: 7, mood: 'DAY', fov: 36, pose: (t, u, o) => { o.pos.copy(lerp(V3(760, 320, 950), V3(470, 130, 330), ease(u))); o.look.copy(FERRY).setY(30); } },                             // down the piers to the Embarcadero
      { dur: 7, mood: 'DAY', fov: 34, pose: (t, u, o) => { o.pos.copy(lerp(V3(1520, 125, -150), V3(820, 115, -60), u)); o.look.copy(lerp(V3(600, 100, -330), V3(250, 130, -350), u)); } },   // along the Bay Bridge, the city through the trusses
      { dur: 7, mood: 'DAY', fov: 34, pose: (t, u, o, w) => { const b = w.boat.position; o.pos.set(b.x + 20, 160, b.z + 30); o.look.copy(lerp(b.clone(), V3(60, 160, -420), ease(Math.max(0, (u - 0.45) / 0.55)))); } },   // the speedboat, then up to the skyline
      { dur: 7, mood: 'DAY', fov: 34, pose: (t, u, o) => { o.pos.copy(lerp(V3(60, 200, -430), V3(-40, 130, -380), u)); o.look.copy(lerp(V3(-60, 170, -500), SALES.clone().setY(170), u)); } },   // downtown canyon
      { dur: 7, mood: 'DAY', fov: 36, pose: orbit(ORACLE, 300, 200, 230, 150, 0.4, 1.9, 40) },                                                                                            // Oracle Park, descending orbit
      { dur: 6, mood: 'DAY', fov: 34, pose: (t, u, o) => { o.pos.copy(lerp(V3(-1560, 190, -1380), V3(-1360, 180, -1430), u)); o.look.copy(lerp(WHEEL.clone().setY(60), ALC.clone().setY(30), ease(Math.max(0, (u - 0.5) / 0.5)))); } },   // the Wharf, then Alcatraz
      // Golden hour
      { dur: 8, mood: 'GOLDEN', fov: 16, pose: (t, u, o, w) => { const s = w.ship.position; o.pos.set(s.x + 950, 300, s.z + 520); o.look.set(s.x - u * 120, 15, s.z); } },              // the container ship in the fog, long lens
      { dur: 8, mood: 'GOLDEN', fov: 34, pose: orbit(GG_S, 330, 300, 210, 190, 2.4, 3.9, 150) },                                                                                         // round the south tower
      { dur: 5, mood: 'GOLDEN', fov: 34, pose: (t, u, o) => { const p = lerp(GG_S, GG_MID, 0.3 + u * 0.4); o.pos.set(p.x, 240, p.z); o.look.set(p.x, 0, p.z + 1); o.roll = -0.5; } },   // straight down across the lanes
      { dur: 8, mood: 'GOLDEN', fov: 40, pose: (t, u, o) => { o.pos.copy(lerp(V3(-3400, 360, -3250), V3(-4300, 370, -3400), u)); o.look.copy(lerp(V3(-4700, 120, -3050), V3(-5400, 100, -3200), u)); } },   // the Marin coast at sunset
      // Blue hour
      { dur: 9, mood: 'BLUE', fov: 34, pose: orbit(GG_N, 400, 360, 180, 165, 0.2, 1.5, 140) },                                                                                            // the north tower floodlit
      { dur: 8, mood: 'BLUE', fov: 40, pose: (t, u, o) => { o.pos.set(-3150, 260, -2750); o.look.copy(lerp(V3(-4300, 200, -3300), V3(-200, 120, -500), ease(u))); } },                    // the headlands to the glowing city, fade out
    ];
  }

  /** Soft cloud for the fog banks. */
  private static fogTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    const r = mulberry(13);
    for (let i = 0; i < 60; i++) {
      const x = 30 + r() * 196, y = 20 + r() * 88, rad = 20 + r() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    }
    // Fade to nothing at the edges so no bank ever shows a straight side.
    const img = g.getImageData(0, 0, 256, 128), d = img.data;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const ex = 1 - Math.pow(Math.abs(x - 128) / 128, 2), ey = 1 - Math.pow(Math.abs(y - 64) / 64, 2);
      d[(y * 256 + x) * 4 + 3] *= Math.pow(Math.max(0, ex * ey), 1.6);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); return t;
  }

  /** The street map painted onto the ground: blocks, streets and the shores. Emissive pass draws the street lighting. */
  private paintMap(size: number, emissive: boolean): HTMLCanvasElement {
    const W = 3072, c = document.createElement('canvas'); c.width = c.height = W;
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
        const r = city ? 104 : 66 + h * 0.08, gg = city ? 97 : 76 + h * 0.06, b = city ? 88 : 50;
        const hash = ((i * 7 + j * 13) % 17) / 17 * 10 - 5;
        for (let jj = 0; jj < step; jj++) for (let ii = 0; ii < step; ii++) { const o = ((j + jj) * W + i + ii) * 4; d[o] = (r + hash) * m + 19 * (1 - m); d[o + 1] = (gg + hash) * m + 21 * (1 - m); d[o + 2] = (b + hash) * m + 22 * (1 - m); }
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
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c94a7a' : '#4f8a3c'; g.fillRect(px(-1160 + i * 20 + 4), pz(-1146), 12 * k, 30 * k); }
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
  private bridge(a: THREE.Vector3, b: THREE.Vector3, color: number, towerH: number, golden: boolean, glow: THREE.Texture): THREE.MeshLambertMaterial {
    const dir = b.clone().sub(a); const len = dir.length(); dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const deckY = golden ? 67 : 50, g = new Geo(), rgb: V = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 });
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
    const cable = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePts), new THREE.LineBasicMaterial({ color: golden ? 0xd85a38 : 0xa8aab0 }));
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

  /** The shot playing at this moment of the take, with the time into it. */
  shotAt(time: number): { shot: Shot; t: number; u: number; index: number } {
    let t = ((time % this.total) + this.total) % this.total;
    for (let i = 0; i < this.shots.length; i++) { const sh = this.shots[i]; if (t < sh.dur) return { shot: sh, t, u: t / sh.dur, index: i }; t -= sh.dur; }
    const last = this.shots[this.shots.length - 1]; return { shot: last, t: last.dur, u: 1, index: this.shots.length - 1 };
  }

  /** Switch the scene to the EO or IR materials and to the shot's time of day (night operations force blue hour). */
  applyLook(look: Look, mood: Mood) {
    const ir = look === 'IR_DAY' || look === 'IR_NIGHT';
    const night = look === 'NIGHT' || look === 'IR_NIGHT';
    this.night = night; this.forcedNight = night;
    if (night) mood = 'BLUE';
    this.mood = mood;
    const day = mood === 'DAY', golden = mood === 'GOLDEN', blue = mood === 'BLUE';
    for (const s of this.irSwap) (s.mesh as THREE.Mesh).material = ir ? s.ir : s.eo;
    for (const m of this.facadeMats) m.emissiveIntensity = blue ? 1.3 : golden ? 0.7 : 0;
    this.gndMat.emissiveIntensity = blue ? 0.9 : golden ? 0.55 : 0;
    this.lights.visible = !ir && !day; this.carLights.visible = !ir && !day; this.sunDisc.visible = !ir && !blue;
    for (const b of this.banks) { b.visible = !ir; (b.material as THREE.SpriteMaterial).color.set(blue ? 0x1a2030 : golden ? 0xb8aa9c : 0xf0f2f4); }
    for (const m of this.marine) m.visible = !ir && day;
    this.ggMat.emissive.set(blue ? 0xff9a3c : 0x000000); this.ggMat.emissiveIntensity = blue ? 0.5 : 0;
    this.bbMat.emissive.set(blue ? 0xdfe6ff : 0x000000); this.bbMat.emissiveIntensity = blue ? 0.35 : 0;
    this.scene.traverse(o => { if (o.name === 'night') o.visible = !ir && !day; });
    const wl = this.wheel.getObjectByName('lights'); if (wl) wl.visible = !ir && !day;
    const sunDir = blue ? SUN_NIGHT : golden ? SUN_DUSK : SUN_DAY;
    this.sky.uniforms.sunDir.value.copy(sunDir); this.sky.uniforms.mood.value = MOOD_K[mood];
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
      this.sun.color.set(0xffc48a); this.sun.intensity = 2.2; this.hemi.color.set(0x8ea8d8); this.hemi.groundColor.set(0x4a3a2c); this.hemi.intensity = 1.3;
    } else {
      this.scene.background = null; this.fog.color.set(0x9fb6cc); this.fog.density = 0.00014;
      this.sun.color.set(0xfff4e6); this.sun.intensity = 2.6; this.hemi.color.set(0xbcd4f0); this.hemi.groundColor.set(0x8a8070); this.hemi.intensity = 1.4;
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
    for (const b of [...this.banks, ...this.marine]) { b.position.x = b.userData.x0 + ((this.t * b.userData.drift) % 900); if (b.position.x > b.userData.x0 + 600) b.position.x -= 900; }
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
  pose(cam: THREE.PerspectiveCamera, time: number, zoom: number): ShotState {
    const { shot, t, u, index } = this.shotAt(time);
    const o = { pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0 };
    shot.pose(t, u, o, this);
    cam.position.copy(o.pos);
    cam.near = 2; cam.far = SF_CAMERA_FAR;
    cam.fov = (2 * Math.atan(Math.tan(((shot.fov ?? 34) * Math.PI) / 360) / Math.max(1, zoom)) * 180) / Math.PI;
    cam.updateProjectionMatrix();
    // Looking straight down needs a reference for "up": north, turned by the shot's roll.
    const down = Math.abs(o.look.y - o.pos.y) > 0.98 * o.look.distanceTo(o.pos);
    if (down) cam.up.set(Math.sin(o.roll), 0, -Math.cos(o.roll)); else cam.up.set(Math.sin(o.roll), Math.cos(o.roll), 0);
    cam.lookAt(o.look);
    cam.up.set(0, 1, 0);
    cam.updateMatrixWorld();
    const mood: Mood = this.forcedNight ? 'BLUE' : shot.mood;
    const sunDir = mood === 'BLUE' ? SUN_NIGHT : mood === 'GOLDEN' ? SUN_DUSK : SUN_DAY;
    const sd = sunDir.clone().multiplyScalar(7800).project(cam);
    const sun = sd.z > 1 || Math.abs(sd.x) > 1.3 || Math.abs(sd.y) > 1.3 ? null : new THREE.Vector2((sd.x + 1) / 2, (sd.y + 1) / 2);
    // The reel fades out over its last two seconds and in over its first.
    let fade = 1;
    if (index === this.shots.length - 1) fade = Math.min(1, (shot.dur - t) / 2);
    if (index === 0) fade = Math.min(fade, t / 1);
    return { sun, fade: Math.max(0, fade), mood };
  }
}
