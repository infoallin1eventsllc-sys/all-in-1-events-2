import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RotateCcw } from 'lucide-react';
import { PARKED_CARS, SITE, TREES, WORLD_M, heightAt, siteImagery, structureAt } from '../../survey/site';
import { GOOD_VIEWS, type CoverageGrid, type Leg, type SurveyPlan } from '../../survey/plan';
import { buildDrone, droneMaterials, radialTexture } from '../hero/droneModel';
import { FrameGovernor } from '../../lib/quality';
import { release3d } from '../../lib/release3d';
import type { Photo, SurveyAircraft, Phase } from '../../hooks/useSurveyMission';

/**
 * The survey stage: the venue constructing itself as the aircraft photographs it.
 *
 * Ground no photo has seen yet is a survey blueprint (a 25 m grid and 2 m
 * contours on dark slate). Each photo the aircraft takes drops from the camera
 * onto the ground as a tile of the finished map and clicks into the mosaic;
 * fresh ground throws a burst of light; buildings, tents, trucks and parked cars
 * rise out of the blueprint the moment they are photographed. Under the
 * aircraft the camera footprint sweeps with scan lines and a radar ring pulses.
 * The Overlap layer recolours the ground by how many photos see each point.
 *
 * Cinematic mode films the survey: a director cuts between chase, crane, orbit,
 * top-down and wide shots with shallow depth of field, grain and letterbox.
 * Golden-hour sun, god rays, drifting dust and a Mavic-class aircraft that banks
 * through its turns, with its shadow on the ground.
 *
 * All of it is a preview of coverage, not a reconstruction: the real orthomosaic
 * and 3D model are built afterwards from the photos (see Deliverables).
 */

export type SurveyLayer = 'MODEL' | 'OVERLAP';
type View = 'CINEMATIC' | 'OVERVIEW' | 'TOP' | 'FOLLOW';

interface Props {
  plan: SurveyPlan;
  legs: Leg[];
  legIndex: number;
  legProgressM: number;
  aircraft: SurveyAircraft;
  photosRef: React.RefObject<Photo[]>;
  photoCount: number;
  grid: CoverageGrid;
  gridVersion: number;
  phase: Phase;
  layer: SurveyLayer;
  onLayerChange: (l: SurveyLayer) => void;
  coveredPct: number;
  /** Progress chip text, e.g. "62% photographed" or "20 of 36 angles". */
  progressLabel: string;
  /** Flight-line progress for the strip along the bottom. */
  lines?: { done: number; total: number; current: number | null; angles?: number };
  /** Picture-in-picture: no overlay chrome. */
  compact?: boolean;
}

const SEG = 180;              // terrain resolution (5 m per vertex over 900 m)
const PHOTO_CAP = 6000;
const AC_SCALE = 6;           // aircraft drawn larger than life so it reads at 60 m
const TILES = 40;             // photo tiles in flight at once
const BURST = 900;            // burst particles
const ACCENT = new THREE.Color('#fb923c');
const HOT = (k: number) => ACCENT.clone().multiplyScalar(k); // >1 = blooms
const FOG = new THREE.Color('#0b0e16');
const FOG_DENSITY = 0.00105;
const VIEWS: Record<Exclude<View, 'FOLLOW' | 'CINEMATIC'>, { radius: number; theta: number; phi: number }> = {
  OVERVIEW: { radius: 600, theta: Math.PI * 0.62, phi: 0.92 },
  TOP: { radius: 720, theta: Math.PI / 2, phi: 0.02 },
};
const easeOut = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const backOut = (u: number) => { const x = Math.min(1, Math.max(0, u)), c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

function skyTexture(): THREE.CanvasTexture {
  // Dusk: deep navy overhead, a warm band on the horizon, dark below.
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#03050b'); gr.addColorStop(0.3, '#07101f'); gr.addColorStop(0.43, '#101a30');
  gr.addColorStop(0.485, '#3a2415'); gr.addColorStop(0.5, '#51301a'); gr.addColorStop(0.52, '#1a1414'); gr.addColorStop(1, '#05060a');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Heat ramp for the overlap layer. Status colours: this is a quality status. */
function heat(v: number, out: THREE.Color) {
  const S = THREE.SRGBColorSpace; // specify as displayed; three converts to linear
  if (v === 0) return out.setRGB(0.07, 0.08, 0.1, S);
  if (v >= GOOD_VIEWS) return out.setRGB(0.16, 0.56, 0.3, S).multiplyScalar(0.85 + Math.min(1, (v - GOOD_VIEWS) / 10) * 0.2);
  if (v >= 2) return out.setRGB(0.86, 0.55, 0.12, S);
  return out.setRGB(0.82, 0.18, 0.18, S);
}

const TERRAIN_VS = /* glsl */ `
  attribute float aCov; attribute float aFlash; attribute float aShade; attribute float aInside; attribute vec3 aHeat;
  varying vec2 vUv; varying vec3 vWorld; varying float vCov; varying float vFlash; varying float vShade; varying float vInside; varying vec3 vHeat;
  void main() {
    vUv = uv; vCov = aCov; vFlash = aFlash; vShade = aShade; vInside = aInside; vHeat = aHeat;
    vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const TERRAIN_FS = /* glsl */ `
  uniform sampler2D uMap; uniform float uMode; uniform float uTime; uniform vec3 uAccent;
  uniform vec3 uFogColor; uniform float uFogDensity;
  uniform float uAcOn; uniform vec2 uAc; uniform vec2 uFpC; uniform vec2 uFpDir; uniform vec2 uFpHalf; uniform float uShutter; uniform float uCapturing;
  varying vec2 vUv; varying vec3 vWorld; varying float vCov; varying float vFlash; varying float vShade; varying float vInside; varying vec3 vHeat;

  float lines(float v, float step, float px) {
    float x = v / step; float d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-4);
    return 1.0 - clamp(d / px, 0.0, 1.0);
  }

  void main() {
    vec3 photo = texture2D(uMap, vUv).rgb;
    float shade = 0.55 + vShade * 0.7;

    // Blueprint: what no photo has seen yet.
    vec3 bp = vec3(0.016, 0.024, 0.04) * shade;
    float grid = max(lines(vWorld.x, 25.0, 1.0), lines(vWorld.z, 25.0, 1.0));
    float major = max(lines(vWorld.x, 100.0, 1.2), lines(vWorld.z, 100.0, 1.2));
    float contour = lines(vWorld.y, 2.0, 1.0);
    bp += vec3(0.035, 0.07, 0.13) * grid * mix(0.35, 1.0, vInside) + vec3(0.05, 0.1, 0.19) * major * vInside;
    bp += vec3(0.09, 0.055, 0.02) * contour * 0.9;
    bp += photo * 0.045;

    vec3 col;
    if (uMode < 0.5) {
      vec3 mapped = photo * shade * 1.05;
      col = mix(bp, mapped, smoothstep(0.0, 1.0, vCov));
    } else {
      vec3 tinted = mix(photo * shade * 0.8, vHeat * shade, 0.62);
      col = mix(bp, tinted, vInside * 0.94);
    }
    col *= mix(0.62, 1.0, vInside);
    col += uAccent * vFlash * vFlash * 1.1;

    if (uAcOn > 0.5) {
      vec2 d = vWorld.xz - uFpC;
      vec2 u = vec2(dot(d, uFpDir), dot(d, vec2(-uFpDir.y, uFpDir.x)));
      vec2 q = abs(u) - uFpHalf; float m = max(q.x, q.y);
      float inside = step(m, 0.0);
      float edge = 1.0 - smoothstep(0.0, 1.6, abs(m));
      float scan = pow(0.5 + 0.5 * sin(u.x * 0.55 - uTime * 7.0), 6.0);
      col += uAccent * (edge * mix(0.6, 1.6, uCapturing) + inside * (0.04 + scan * 0.16 * uCapturing + uShutter * 0.35));
      float r = length(vWorld.xz - uAc); float R = mod(uTime * 45.0, 180.0);
      col += uAccent * (1.0 - smoothstep(0.0, 2.2, abs(r - R))) * (1.0 - R / 180.0) * 0.9 * uCapturing;
    }

    float dist = length(vWorld - cameraPosition);
    float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;

/** Final grade: vignette, film grain, a touch of warmth. */
const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uGrain: { value: 0.05 }, uVignette: { value: 0.55 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVignette; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = vUv - 0.5; float v = 1.0 - dot(q * vec2(1.0, 0.8), q * vec2(1.0, 0.8)) * 1.3;
      c.rgb *= mix(1.0, v, uVignette); c.rgb += (hash(floor(vUv * vec2(1600.0, 900.0)) + fract(uTime * 5.7)) - 0.5) * uGrain * c.rgb;
      c.rgb *= vec3(1.02, 1.0, 0.97); gl_FragColor = c; }`,
};

/** The director's shots, each a camera pose over its own time. */
type Pose = { pos: THREE.Vector3; look: THREE.Vector3 };
interface ShotCtx { ac: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3; groundY: number; stage: THREE.Vector3; flying: boolean }
const SHOTS: { name: string; dur: number; needsFlight: boolean; pose: (t: number, u: number, c: ShotCtx, out: Pose) => void }[] = [
  { name: 'chase', dur: 8, needsFlight: true, pose: (t, u, c, o) => { o.pos.copy(c.ac).addScaledVector(c.fwd, -72).addScaledVector(c.right, Math.sin(t * 0.35) * 16).add(new THREE.Vector3(0, 44 + u * 8, 0)); o.look.copy(c.ac).addScaledVector(c.fwd, 40).setY(c.ac.y - 42); } },
  { name: 'crane', dur: 7, needsFlight: true, pose: (t, u, c, o) => { o.pos.copy(c.ac).addScaledVector(c.fwd, 70).addScaledVector(c.right, 80 - u * 30).setY(c.groundY + 28 + easeOut(u) * 70); o.look.copy(c.ac).setY(c.ac.y - 20 - u * 20); void t; } },
  { name: 'orbit', dur: 9, needsFlight: true, pose: (t, u, c, o) => { const a = t * 0.32; o.pos.set(c.ac.x + Math.cos(a) * 66, c.ac.y + 40 + Math.sin(u * Math.PI) * 12, c.ac.z + Math.sin(a) * 66); o.look.copy(c.ac).setY(c.ac.y - 24); } },
  { name: 'top', dur: 6, needsFlight: true, pose: (t, u, c, o) => { o.pos.copy(c.ac).add(new THREE.Vector3(Math.sin(t * 0.2) * 8, 150 - u * 40, 0.5)); o.look.copy(c.ac).setY(c.groundY); } },
  { name: 'wide', dur: 8, needsFlight: false, pose: (t, u, c, o) => { const a = 2.1 + t * 0.04; o.pos.set(Math.cos(a) * 520, 250 - u * 30, Math.sin(a) * 520); o.look.set(c.ac.x * 0.4, 20, c.ac.z * 0.4); } },
  { name: 'stage', dur: 8, needsFlight: false, pose: (t, u, c, o) => { const a = -0.6 + t * 0.22; o.pos.set(c.stage.x + Math.cos(a) * 120, c.stage.y + 34 + u * 12, c.stage.z + Math.sin(a) * 120); o.look.copy(c.stage).setY(c.stage.y + 8); } },
];

export const SurveyScanCanvas3D: React.FC<Props> = (props) => {
  const { layer, onLayerChange, coveredPct, progressLabel, compact, lines, phase } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLSpanElement>(null);
  const [view, setView] = useState<View>(compact ? 'OVERVIEW' : 'CINEMATIC');
  const propsRef = useRef(props); propsRef.current = props;
  const viewRef = useRef<View>(view); viewRef.current = view;
  const goal = useRef({ ...VIEWS.OVERVIEW, target: new THREE.Vector3(0, 0, 0) });
  const now = useRef({ ...VIEWS.OVERVIEW, target: new THREE.Vector3(0, 0, 0) });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastInput = useRef(performance.now());
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const w = host.clientWidth || 900, h = host.clientHeight || 520;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gov = new FrameGovernor('survey');
    renderer.setPixelRatio(gov.pixelRatio(2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.innerHTML = ''; host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG, FOG_DENSITY);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture; room.dispose();
    scene.environmentIntensity = 0.35;
    const camera = new THREE.PerspectiveCamera(38, w / h, 1, 5000);
    camRef.current = camera;
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })));
    {
      const n = 700, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 0.8); sp.set([2200 * Math.sin(ph) * Math.cos(th), 2200 * Math.cos(ph), 2200 * Math.sin(ph) * Math.sin(th)], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaab8d6, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false })));
    }
    scene.add(new THREE.HemisphereLight(0x9fb4dc, 0x2a2118, 1.0));
    const sun = new THREE.DirectionalLight(0xffc48a, 1.7); sun.position.set(-500, 260, -180); scene.add(sun); // low warm sun from the west
    const fill = new THREE.DirectionalLight(0x6d8bd8, 0.5); fill.position.set(400, 300, 300); scene.add(fill);

    // God rays from the low sun: additive slabs leaning in from the west.
    const rayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false,
      uniforms: { tint: { value: new THREE.Color(1.0, 0.62, 0.3) } },
      vertexShader: 'varying vec2 vUv; varying float vFace; void main(){ vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vFace = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 tint; varying vec2 vUv; varying float vFace; void main(){ float y = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y); gl_FragColor = vec4(tint * y * pow(vFace, 2.0) * 0.03, 1.0); }',
    });
    const rays: THREE.Mesh[] = [];
    const sunDir = sun.position.clone().normalize();
    for (const [x, z, r] of [[-300, -220, 42], [-240, 40, 30], [-320, 200, 50], [-150, -100, 24]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.4, 760, 18, 1, true), rayMat);
      m.position.set(x, 230, z); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir); scene.add(m); rays.push(m);
    }

    // ---- terrain ------------------------------------------------------------
    const geo = new THREE.PlaneGeometry(WORLD_M, WORLD_M, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    for (let i = 0; i < n; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const L = new THREE.Vector3(-0.8, 0.45, -0.3).normalize();
    const aShade = new Float32Array(n), aInside = new Float32Array(n), aCov = new Float32Array(n), aFlash = new Float32Array(n), aHeat = new Float32Array(n * 3);
    const grid0 = propsRef.current.grid;
    for (let i = 0; i < n; i++) {
      aShade[i] = Math.max(0, nrm.getX(i) * L.x + nrm.getY(i) * L.y + nrm.getZ(i) * L.z);
      const gc = Math.floor((pos.getX(i) - grid0.minX) / grid0.cellM), gr = Math.floor((pos.getZ(i) - grid0.minY) / grid0.cellM);
      aInside[i] = gc >= 0 && gr >= 0 && gc < grid0.cols && gr < grid0.rows && grid0.inside[gr * grid0.cols + gc] === 1 ? 1 : 0;
    }
    const soft = new Float32Array(n); const row = SEG + 1;
    for (let i = 0; i < n; i++) { let s = 0, k = 0; for (const o of [0, -1, 1, -row, row]) { const j = i + o; if (j >= 0 && j < n) { s += aInside[j]; k++; } } soft[i] = s / k; }
    geo.setAttribute('aShade', new THREE.BufferAttribute(aShade, 1));
    geo.setAttribute('aInside', new THREE.BufferAttribute(soft, 1));
    geo.setAttribute('aCov', new THREE.BufferAttribute(aCov, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFlash', new THREE.BufferAttribute(aFlash, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aHeat', new THREE.BufferAttribute(aHeat, 3).setUsage(THREE.DynamicDrawUsage));
    const ortho = new THREE.CanvasTexture(siteImagery(2048)); ortho.colorSpace = THREE.SRGBColorSpace; ortho.anisotropy = 8;
    const uniforms = {
      uMap: { value: ortho }, uMode: { value: 0 }, uTime: { value: 0 }, uAccent: { value: ACCENT.clone() },
      uFogColor: { value: FOG.clone() }, uFogDensity: { value: FOG_DENSITY },
      uAcOn: { value: 0 }, uAc: { value: new THREE.Vector2() }, uFpC: { value: new THREE.Vector2() }, uFpDir: { value: new THREE.Vector2(1, 0) },
      uFpHalf: { value: new THREE.Vector2(30, 40) }, uShutter: { value: 0 }, uCapturing: { value: 0 },
    };
    const terrainMat = new THREE.ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, uniforms });
    scene.add(new THREE.Mesh(geo, terrainMat));

    const lastViews = new Uint16Array(n);
    const col = new THREE.Color();
    let lastLayer: SurveyLayer | null = null;
    const paintTerrain = (grid: CoverageGrid, mode: SurveyLayer, dt: number) => {
      for (let i = 0; i < n; i++) {
        const v = grid.viewsAt({ x: pos.getX(i), y: pos.getZ(i) });
        if (v > 0 && lastViews[i] === 0) aFlash[i] = 1;
        lastViews[i] = v;
        if (aFlash[i] > 0) aFlash[i] = Math.max(0, aFlash[i] - dt * 1.4);
        aCov[i] += ((v > 0 ? 1 : 0) - aCov[i]) * Math.min(1, dt * 5);
        if (mode === 'OVERLAP') { heat(v, col); aHeat[i * 3] = col.r; aHeat[i * 3 + 1] = col.g; aHeat[i * 3 + 2] = col.b; }
      }
      geo.attributes.aCov.needsUpdate = true; geo.attributes.aFlash.needsUpdate = true;
      if (mode === 'OVERLAP') geo.attributes.aHeat.needsUpdate = true;
      uniforms.uMode.value = mode === 'OVERLAP' ? 1 : 0;
      lastLayer = mode;
    };

    // ---- venue: blueprint outlines that rise into solid buildings when photographed ----
    const glow = glowSprite();
    const blueprint = new THREE.Color('#1c2536'), edgeBlue = new THREE.Color('#5b8def');
    interface Struct { root: THREE.Group; mats: { m: THREE.MeshStandardMaterial; solid: THREE.Color }[]; edges: THREE.LineBasicMaterial[]; x: number; y: number; build: number; lights: THREE.Object3D[] }
    const structs: Struct[] = [];
    const structMat = (solid: THREE.Color, st: Struct, rough = 0.75) => { const m = new THREE.MeshStandardMaterial({ color: blueprint.clone(), roughness: rough, metalness: 0.08 }); st.mats.push({ m, solid }); return m; };
    const withEdges = (st: Struct, mesh: THREE.Mesh) => {
      const edge = new THREE.LineBasicMaterial({ color: edgeBlue.clone().multiplyScalar(1.6), transparent: true, opacity: 0.85 });
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), edge); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale);
      st.root.add(e); st.edges.push(edge);
    };
    const part = (st: Struct, geom: THREE.BufferGeometry, color: THREE.Color, x: number, y: number, z: number, rough = 0.75, edges = true, ry = 0) => {
      const mesh = new THREE.Mesh(geom, structMat(color, st, rough)); mesh.position.set(x, y, z); mesh.rotation.y = ry; st.root.add(mesh); if (edges) withEdges(st, mesh); return mesh;
    };
    for (const s of SITE.structures) {
      const roof = new THREE.Color(s.roof), gy = heightAt(s.x, s.y);
      const st: Struct = { root: new THREE.Group(), mats: [], edges: [], x: s.x, y: s.y, build: 0, lights: [] };
      st.root.position.set(s.x, gy, s.y); st.root.scale.y = 0.03; scene.add(st.root);
      if (s.kind === 'tent') {
        part(st, new THREE.ConeGeometry(s.w * 0.72, s.h * 0.55, 4, 1).translate(0, s.h * 0.725, 0), roof, 0, 0, 0, 0.9, true, Math.PI / 4);
        part(st, new THREE.BoxGeometry(s.w * 0.9, s.h * 0.45, s.d * 0.9).translate(0, s.h * 0.225, 0), roof.clone().multiplyScalar(0.85), 0, 0, 0, 0.9, true);
        part(st, new THREE.CylinderGeometry(0.12, 0.12, s.h + 1.5).translate(0, (s.h + 1.5) / 2, 0), new THREE.Color('#8a8f98'), 0, 0, 0, 0.5, false);
      } else if (s.kind === 'truck') {
        part(st, new THREE.BoxGeometry(s.w, s.h, s.d * 0.7).translate(0, s.h / 2, -s.d * 0.15), roof, 0, 0, 0);
        part(st, new THREE.BoxGeometry(s.w, s.h * 0.7, s.d * 0.3).translate(0, s.h * 0.35, s.d * 0.35), new THREE.Color('#d9dde3'), 0, 0, 0, 0.5);
        part(st, new THREE.BoxGeometry(s.w * 0.9, 0.3, s.d * 0.5).translate(0, s.h + 0.15, -s.d * 0.15), new THREE.Color('#9aa0a8'), 0, 0, 0, 0.5, false);
      } else if (s.kind === 'hall') {
        part(st, new THREE.BoxGeometry(s.w, s.h, s.d).translate(0, s.h / 2, 0), roof.clone().multiplyScalar(0.8), 0, 0, 0);
        const arch = new THREE.CylinderGeometry(s.d / 2, s.d / 2, s.w, 28, 1).rotateZ(Math.PI / 2).scale(1, 0.45, 1).translate(0, s.h, 0);
        part(st, arch, roof, 0, 0, 0, 0.55, false);
        for (let k = -2; k <= 2; k++) part(st, new THREE.BoxGeometry(4, s.h * 0.7, 0.2).translate(0, s.h * 0.4, 0), new THREE.Color('#3b6fd6'), k * 12, 0, s.d / 2 + 0.1, 0.2, false);   // glazing
      } else if (s.kind === 'tower') {
        part(st, new THREE.BoxGeometry(s.w, s.h * 0.35, s.d).translate(0, s.h * 0.825, 0), roof, 0, 0, 0);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(st, new THREE.BoxGeometry(0.35, s.h * 0.65, 0.35).translate(0, s.h * 0.325, 0), new THREE.Color('#6b7280'), dx * s.w * 0.42, 0, dz * s.d * 0.42, 0.5, false);
      } else {
        // Stage: deck, roof slab on truss legs, truss round the roof, an LED wall, and show lights that sweep.
        part(st, new THREE.BoxGeometry(s.w, s.h, s.d).translate(0, s.h / 2, 0), roof, 0, 0, 0);
        part(st, new THREE.BoxGeometry(s.w + 6, 1.2, s.d + 4).translate(0, s.h + 3.6, 0), roof, 0, 0, 0);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(st, new THREE.BoxGeometry(0.9, s.h + 3, 0.9).translate(0, (s.h + 3) / 2, 0), new THREE.Color('#6b7280'), dx * (s.w / 2 + 2), 0, dz * (s.d / 2 + 1.5), 0.5, false);
        for (const [dx, dz, len, rot] of [[0, -1, s.w + 6, 0], [0, 1, s.w + 6, 0], [-1, 0, s.d + 4, Math.PI / 2], [1, 0, s.d + 4, Math.PI / 2]] as number[][]) part(st, new THREE.BoxGeometry(len, 0.5, 0.5).translate(0, s.h + 4.5, 0), new THREE.Color('#9aa0a8'), dx * (s.w / 2 + 3), 0, dz * (s.d / 2 + 2), 0.4, false, rot);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w - 6, s.h - 1, 0.6).translate(0, s.h + (s.h - 1) / 2 + 0.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.34, 1.1) }));
        wall.position.set(0, 0, -s.d / 2 + 0.5); st.root.add(wall); st.lights.push(wall);
        for (let k = 0; k < 6; k++) {
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.8) }));
          head.position.set(-s.w / 2 + 3 + k * ((s.w - 6) / 5), s.h + 3, 0); st.root.add(head); st.lights.push(head);
          const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, s.h + 3, 14, 1, true).translate(0, -(s.h + 3) / 2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.55, 0.2), transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          beam.position.copy(head.position); beam.userData.k = k; st.root.add(beam); st.lights.push(beam);
        }
      }
      structs.push(st);
    }
    // Parked cars: rise into the lot as it is photographed.
    const carGeo = new THREE.BoxGeometry(1.8, 1.3, 4).translate(0, 0.65, 0);
    const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), PARKED_CARS.length);
    const carBuild = new Float32Array(PARKED_CARS.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    PARKED_CARS.forEach((c, i) => { p3.set(c.x + 1.3, heightAt(c.x + 1.3, c.y + 2.5), c.y + 2.5); sc.set(1, 0.02, 1); cars.setMatrixAt(i, m4.compose(p3, q, sc)); cars.setColorAt(i, col.set(c.color)); });
    scene.add(cars);
    // Light poles with warm lamps along the paths.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 });
    for (const [px, py] of [[-120, 105], [-60, 60], [0, 25], [40, -10], [90, 55], [140, 90], [-80, -10], [20, -95]]) {
      const gy = heightAt(px, py);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 9, 8).translate(0, 4.5, 0), poleMat); pole.position.set(px, gy, py); scene.add(pole);
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.2, 1.5, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      lamp.position.set(px, gy + 9, py); lamp.scale.setScalar(4); scene.add(lamp);
      const pool = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(0.5, 0.35, 0.18), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.position.set(px, gy + 0.6, py); pool.scale.setScalar(22); scene.add(pool);
    }
    // Trees: instanced, with a little colour variety.
    const treeGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6).translate(0, 0.35, 0),
      new THREE.ConeGeometry(1.0, 1.3, 9).translate(0, 1.15, 0),
      new THREE.ConeGeometry(0.78, 1.2, 9).translate(0, 1.85, 0),
      new THREE.ConeGeometry(0.5, 1.0, 9).translate(0, 2.45, 0),
    ])!;
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), TREES.length);
    TREES.forEach((t, i) => {
      p3.set(t.x, heightAt(t.x, t.y), t.y); sc.set(t.r, t.r * 1.7, t.r); trees.setMatrixAt(i, m4.compose(p3, q, sc));
      trees.setColorAt(i, col.setRGB(0.05 + t.shade * 0.04, 0.13 + t.shade * 0.07, 0.07 + t.shade * 0.03, THREE.SRGBColorSpace));
    });
    scene.add(trees);

    // Boundary: a glowing line draped on the ground, with light pylons at the corners.
    const bpts: THREE.Vector3[] = [];
    SITE.boundary.forEach((a, i) => {
      const b = SITE.boundary[(i + 1) % SITE.boundary.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
      for (let k = 0; k < steps; k++) { const x = a.x + ((b.x - a.x) * k) / steps, y = a.y + ((b.y - a.y) * k) / steps; bpts.push(new THREE.Vector3(x, heightAt(x, y) + 0.7, y)); }
    });
    bpts.push(bpts[0].clone());
    const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bpts), new THREE.LineDashedMaterial({ color: HOT(1.35), dashSize: 9, gapSize: 5 }));
    boundary.computeLineDistances(); scene.add(boundary);
    const pylonMat = new THREE.LineBasicMaterial({ color: HOT(1.2), transparent: true, opacity: 0.8 });
    for (const c of SITE.boundary) {
      const gy = heightAt(c.x, c.y);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x, gy, c.y), new THREE.Vector3(c.x, gy + 16, c.y)]), pylonMat));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: HOT(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(c.x, gy + 16, c.y); s.scale.setScalar(7); scene.add(s);
    }

    // Home pad: lit ring.
    const hy = heightAt(SITE.home.x, SITE.home.y) + 0.3;
    const pad = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.25, 1.25), side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(SITE.home.x, hy, SITE.home.y); scene.add(pad);
    const padFill = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    padFill.rotation.x = -Math.PI / 2; padFill.position.set(SITE.home.x, hy + 0.05, SITE.home.y); scene.add(padFill);

    // Dust in the evening air, drifting on the wind; catches the light near the camera.
    const dustN = 1400, dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) dustPos.set([(Math.random() - 0.5) * 700, 1 + Math.random() * 90, (Math.random() - 0.5) * 700], i * 3);
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
    scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glow, color: new THREE.Color(1.0, 0.8, 0.55), size: 1.6, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));

    // ---- flight path: planned lines faint, flown lines glowing ------------------
    const pathPlanned = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc8d4ec, transparent: true, opacity: 0.16, depthWrite: false }));
    const pathFlown = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: HOT(1.05), transparent: true, opacity: 0.9 }));
    scene.add(pathPlanned, pathFlown);
    let pathKey = '';
    const rebuildPath = (legs: Leg[], idx: number, prog: number, alt: number, acx: number, acy: number) => {
      const key = `${legs.length}:${idx}:${alt}:${Math.round(prog / 6)}`;
      if (key === pathKey) return; pathKey = key;
      const flown: THREE.Vector3[] = [], planned: THREE.Vector3[] = [];
      legs.forEach((g, i) => {
        if (!g.capture) return;
        planned.push(new THREE.Vector3(g.a.x, alt, g.a.y), new THREE.Vector3(g.b.x, alt, g.b.y));
        if (i < idx) flown.push(new THREE.Vector3(g.a.x, alt, g.a.y), new THREE.Vector3(g.b.x, alt, g.b.y));
        else if (i === idx) flown.push(new THREE.Vector3(g.a.x, alt, g.a.y), new THREE.Vector3(acx, alt, acy));
      });
      pathFlown.geometry.dispose(); pathFlown.geometry = new THREE.BufferGeometry().setFromPoints(flown);
      pathPlanned.geometry.dispose(); pathPlanned.geometry = new THREE.BufferGeometry().setFromPoints(planned);
    };

    // ---- photo points: small glowing beads along the flown lines ------------------
    const phPos = new Float32Array(PHOTO_CAP * 3), phCol = new Float32Array(PHOTO_CAP * 3);
    const phGeo = new THREE.BufferGeometry();
    phGeo.setAttribute('position', new THREE.BufferAttribute(phPos, 3)); phGeo.setAttribute('color', new THREE.BufferAttribute(phCol, 3)); phGeo.setDrawRange(0, 0);
    scene.add(new THREE.Points(phGeo, new THREE.PointsMaterial({ size: 3.2, map: glow, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    let shown = 0;

    // ---- photo tiles: each photo drops from the camera and clicks into the mosaic ----
    interface Tile { mesh: THREE.Mesh; edge: THREE.LineLoop; t: number; active: boolean; from: THREE.Vector3; to: THREE.Vector3 }
    const tiles: Tile[] = [];
    for (let i = 0; i < TILES; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: ortho, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      const edge = new THREE.LineLoop(eg, new THREE.LineBasicMaterial({ color: HOT(1.3), transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = edge.visible = false; scene.add(mesh, edge);
      tiles.push({ mesh, edge, t: 0, active: false, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
    let nextTile = 0;
    const dropTile = (corners: THREE.Vector3[], from: THREE.Vector3) => {
      const tl = tiles[nextTile]; nextTile = (nextTile + 1) % TILES;
      const cx = corners.reduce((s, c) => s + c.x, 0) / 4, cz = corners.reduce((s, c) => s + c.z, 0) / 4, cy = heightAt(cx, cz) + 0.6;
      const p = tl.mesh.geometry.attributes.position as THREE.BufferAttribute, uv = tl.mesh.geometry.attributes.uv as THREE.BufferAttribute, ep = tl.edge.geometry.attributes.position as THREE.BufferAttribute;
      corners.forEach((c, i) => { p.setXYZ(i, c.x - cx, 0, c.z - cz); ep.setXYZ(i, c.x - cx, 0, c.z - cz); uv.setXY(i, (c.x + WORLD_M / 2) / WORLD_M, (WORLD_M / 2 - c.z) / WORLD_M); });
      p.needsUpdate = uv.needsUpdate = ep.needsUpdate = true; tl.mesh.geometry.computeBoundingSphere(); tl.edge.geometry.computeBoundingSphere();
      tl.from.copy(from); tl.to.set(cx, cy, cz); tl.t = 0; tl.active = true; tl.mesh.visible = tl.edge.visible = true;
    };
    const stepTiles = (dt: number) => {
      for (const tl of tiles) {
        if (!tl.active) continue;
        tl.t += dt;
        const u = easeOut(tl.t / 0.75), settle = Math.max(0, tl.t - 1.1);
        tl.mesh.position.lerpVectors(tl.from, tl.to, u); tl.edge.position.copy(tl.mesh.position);
        const s = 0.35 + 0.65 * u; tl.mesh.scale.set(s, 1, s); tl.edge.scale.copy(tl.mesh.scale);
        tl.mesh.rotation.x = tl.edge.rotation.x = (1 - u) * 0.7;
        const fade = Math.max(0, 1 - settle / 0.9);
        (tl.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, u * 1.5) * fade;
        (tl.edge.material as THREE.LineBasicMaterial).opacity = (0.4 + 0.6 * (1 - u)) * fade;
        if (fade <= 0) { tl.active = false; tl.mesh.visible = tl.edge.visible = false; }
      }
    };

    // ---- bursts: fresh ground throws light upward on every shutter ----------------
    const bPos = new Float32Array(BURST * 3), bCol = new Float32Array(BURST * 3), bVel = new Float32Array(BURST * 3), bLife = new Float32Array(BURST);
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage)); bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3).setUsage(THREE.DynamicDrawUsage));
    scene.add(new THREE.Points(bGeo, new THREE.PointsMaterial({ size: 2.6, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
    let nextBurst = 0;
    const burst = (cx: number, cz: number, hx: number, hz: number, ca: number, sa: number) => {
      for (let k = 0; k < 36; k++) {
        const i = nextBurst; nextBurst = (nextBurst + 1) % BURST;
        const u = (Math.random() - 0.5) * 2 * hx, v = (Math.random() - 0.5) * 2 * hz;
        const x = cx + u * ca - v * sa, z = cz + u * sa + v * ca;
        bPos.set([x, heightAt(x, z) + 0.5, z], i * 3); bVel.set([(Math.random() - 0.5) * 3, 8 + Math.random() * 12, (Math.random() - 0.5) * 3], i * 3); bLife[i] = 1;
      }
    };
    const stepBurst = (dt: number) => {
      for (let i = 0; i < BURST; i++) {
        if (bLife[i] <= 0) { bCol[i * 3] = bCol[i * 3 + 1] = bCol[i * 3 + 2] = 0; continue; }
        bLife[i] -= dt * 0.9; bVel[i * 3 + 1] -= 6 * dt;
        bPos[i * 3] += bVel[i * 3] * dt; bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt; bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
        const k = Math.max(0, bLife[i]) * 2.2; bCol[i * 3] = ACCENT.r * k; bCol[i * 3 + 1] = ACCENT.g * k; bCol[i * 3 + 2] = ACCENT.b * k;
      }
      bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
    };

    // ---- aircraft: the Mavic-class model, banking through turns, shadow on the ground ----
    const mats = droneMaterials();
    const { group: acModel, props: acProps } = buildDrone(mats, radialTexture());
    const ac = new THREE.Group(); ac.add(acModel);
    const lamp = (c: THREE.Color, x: number, y: number, z: number) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); s.scale.setScalar(0.3); ac.add(s); return s; };
    lamp(new THREE.Color(3, 0.2, 0.15), -0.62, -0.07, 0.6); lamp(new THREE.Color(0.2, 3, 0.4), -0.62, -0.07, -0.6);
    const strobe = lamp(new THREE.Color(4, 4, 4), -0.36, 0.22, 0);
    ac.scale.setScalar(AC_SCALE); scene.add(ac);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    let prevHeading = 0, roll = 0, pitch = 0;

    const buf = (points: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3).setUsage(THREE.DynamicDrawUsage)); return g; };
    const setPts = (obj: THREE.Object3D & { geometry: THREE.BufferGeometry }, pts: THREE.Vector3[]) => {
      const attr = obj.geometry.attributes.position as THREE.BufferAttribute;
      pts.forEach((v, i) => attr.setXYZ(i, v.x, v.y, v.z)); attr.needsUpdate = true; obj.geometry.computeBoundingSphere();
    };
    const tetherLine = new THREE.Line(buf(2), new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 1.2, gapSize: 1.6 }));
    scene.add(tetherLine);
    // Scan volume: translucent pyramid from the camera to the footprint, brighter at the apex.
    const coneGeo = buf(12);
    const coneCol = new Float32Array(12 * 3);
    const c0 = ACCENT.clone().multiplyScalar(0.24), c1 = ACCENT.clone().multiplyScalar(0.03);
    for (let f = 0; f < 4; f++) coneCol.set([c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b], f * 9);
    coneGeo.setAttribute('color', new THREE.BufferAttribute(coneCol, 3));
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const coneEdges = new THREE.LineSegments(buf(8), new THREE.LineBasicMaterial({ color: HOT(1.4), transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(cone, coneEdges);
    let lastPhotoCount = 0, shutter = 0;

    // ---- post: bloom on the bright bits, depth of field in the filmed views, then the grade ----
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bokeh = new BokehPass(scene, camera, { focus: 200, aperture: 0.00004, maxblur: 0.006 });
    composer.addPass(bokeh);
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.5, 0.95);
    composer.addPass(bloom);
    const grade = new ShaderPass(GRADE);
    composer.addPass(grade);
    composer.addPass(new OutputPass());

    // ---- director ---------------------------------------------------------------------
    const dir = { shot: 4, t: 0, fade: 0, wasFlying: false };
    const pose: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    const ctx: ShotCtx = { ac: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), groundY: 0, stage: new THREE.Vector3(), flying: false };
    const stageS = structureAt(SITE.orbitTarget)!; ctx.stage.set(stageS.x, heightAt(stageS.x, stageS.y) + stageS.h, stageS.y);
    const nextShot = (flying: boolean) => {
      let k = dir.shot;
      for (let tries = 0; tries < SHOTS.length; tries++) { k = (k + 1) % SHOTS.length; if (flying || !SHOTS[k].needsFlight) break; }
      dir.shot = k; dir.t = 0; dir.fade = 1;
    };

    // ---- loop -----------------------------------------------------------------
    let raf = 0, lastT = performance.now(), paintAcc = 1;
    const tmpV = new THREE.Vector3(), proj = new THREE.Vector3();
    const place = (el: HTMLDivElement | null, x: number, y: number, z: number) => {
      if (!el) return;
      proj.set(x, y, z).project(camera);
      const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
      el.style.opacity = vis ? '1' : '0';
      el.style.transform = `translate(${((proj.x + 1) / 2) * host.clientWidth}px, ${((1 - proj.y) / 2) * host.clientHeight}px)`;
    };
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
      const P = propsRef.current;
      const a = P.aircraft; const pl = P.plan;
      const groundY = heightAt(a.x, a.y);
      const acY = groundY + Math.max(0.6, a.altM);
      const flying = a.altM > 0.3;
      const capturing = P.phase === 'CAPTURING';
      uniforms.uTime.value = t / 1000;
      grade.uniforms.uTime.value = t / 1000;

      paintAcc += dt;
      const repaint = paintAcc > 0.12 || P.layer !== lastLayer;
      if (repaint) { paintTerrain(P.grid, P.layer, Math.min(0.5, paintAcc)); paintAcc = 0; }

      // Structures rise out of the blueprint when the ground under them is photographed.
      for (const s of structs) {
        const v = P.grid.viewsAt({ x: s.x, y: s.y });
        if (v > 0 && s.build < 1) s.build = Math.min(1, s.build + dt * 1.6);
        if (v === 0 && s.build > 0 && P.photoCount === 0) s.build = 0;   // survey reset
        s.root.scale.y = Math.max(0.03, backOut(s.build));
        for (const { m, solid } of s.mats) { if (P.layer === 'OVERLAP') heat(v, col); else if (v > 0) col.copy(solid); else col.copy(blueprint); m.color.lerp(col, 0.12); }
        for (const e of s.edges) e.opacity += ((v > 0 && P.layer === 'MODEL' ? 0.1 : 0.85) - e.opacity) * 0.1;
        for (const l of s.lights) { l.visible = s.build > 0.6; if (l.userData.k != null) l.rotation.set(Math.sin(t / 1000 * 0.7 + l.userData.k) * 0.35, 0, Math.cos(t / 1000 * 0.5 + l.userData.k * 1.3) * 0.3); }
      }
      if (repaint) {
        let dirty = false;
        PARKED_CARS.forEach((c, i) => {
          const seen = P.grid.viewsAt({ x: c.x + 1.3, y: c.y + 2.5 }) > 0;
          const was = carBuild[i];
          if (P.photoCount === 0) carBuild[i] = 0;
          else if (seen && carBuild[i] < 1) carBuild[i] = Math.min(1, carBuild[i] + 0.2);
          if (carBuild[i] === was) return;
          p3.set(c.x + 1.3, heightAt(c.x + 1.3, c.y + 2.5), c.y + 2.5); sc.set(1, Math.max(0.02, backOut(carBuild[i])), 1);
          cars.setMatrixAt(i, m4.compose(p3, q, sc)); dirty = true;
        });
        if (dirty) cars.instanceMatrix.needsUpdate = true;
      }

      // Aircraft
      const hRad = ((a.headingDeg - 90) * Math.PI) / 180; // compass → map angle
      let dh = a.headingDeg - prevHeading; dh = ((dh + 540) % 360) - 180; prevHeading = a.headingDeg;
      const rate = dt > 0 ? (dh * Math.PI) / 180 / dt : 0;
      roll += (THREE.MathUtils.clamp(-rate * 0.55, -0.5, 0.5) - roll) * Math.min(1, dt * 4);
      pitch += ((flying && a.speedMps > 1.5 ? -0.14 : 0) - pitch) * Math.min(1, dt * 3);
      ac.position.set(a.x, acY, a.y);
      ac.rotation.set(pitch, Math.PI / 2 - hRad, roll, 'YXZ');
      for (const pr of acProps) pr.rotation.y += dt * (flying ? 58 : 0) * ((acProps.indexOf(pr) % 2) ? -1 : 1);
      (strobe.material as THREE.SpriteMaterial).opacity = flying && (t % 1200) < 90 ? 1 : 0;
      shadow.position.set(a.x, groundY + 0.35, a.y); const sh = 3.5 + a.altM * 0.06; shadow.scale.set(sh, sh, 1);
      (shadow.material as THREE.MeshBasicMaterial).opacity = flying ? 0.42 * Math.max(0, 1 - a.altM / 140) : 0;
      setPts(tetherLine, [new THREE.Vector3(a.x, acY - 2, a.y), new THREE.Vector3(a.x, groundY, a.y)]); tetherLine.computeLineDistances();
      tetherLine.visible = flying;

      // Camera footprint (shader) + scan volume (geometry) + tiles and bursts on each photo
      const k = Math.max(0.2, a.altM / pl.params.altitudeM);
      const hx = (pl.footprint.alongM * k) / 2, hz = (pl.footprint.acrossM * k) / 2;
      let cx = a.x, cy = a.y;
      if (pl.params.pattern === 'ORBIT') { cx = pl.params.orbit.center.x; cy = pl.params.orbit.center.y; }
      else if (pl.gimbalPitchDeg > -85) { const off = a.altM * Math.tan(((90 + pl.gimbalPitchDeg) * Math.PI) / 180); cx += Math.cos(hRad) * off; cy += Math.sin(hRad) * off; }
      const ca = Math.cos(hRad), sa = Math.sin(hRad);
      uniforms.uAcOn.value = flying ? 1 : 0;
      uniforms.uAc.value.set(a.x, a.y); uniforms.uFpC.value.set(cx, cy); uniforms.uFpDir.value.set(ca, sa); uniforms.uFpHalf.value.set(hx, hz);
      uniforms.uCapturing.value += ((capturing ? 1 : 0.25) - uniforms.uCapturing.value) * 0.08;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = cx + u * hx * ca - v * hz * sa, y = cy + u * hx * sa + v * hz * ca; return new THREE.Vector3(x, heightAt(x, y) + 0.5, y); });
      const apex = new THREE.Vector3(a.x, acY - 1.8, a.y);
      if (P.photoCount > lastPhotoCount) { shutter = 1; dropTile(corners, apex); burst(cx, cy, hx, hz, ca, sa); }
      if (P.photoCount < lastPhotoCount) for (const tl of tiles) { tl.active = false; tl.mesh.visible = tl.edge.visible = false; }
      lastPhotoCount = P.photoCount;
      shutter = Math.max(0, shutter - dt * 3.5);
      uniforms.uShutter.value = shutter;
      setPts(cone, [0, 1, 2, 3].flatMap(i => [apex, corners[i], corners[(i + 1) % 4]]));
      setPts(coneEdges, corners.flatMap(c => [apex, c]));
      cone.visible = coneEdges.visible = flying;
      (cone.material as THREE.MeshBasicMaterial).opacity = capturing ? Math.min(1, 0.4 + shutter * 0.4) : 0.18;
      stepTiles(dt); stepBurst(dt);

      // Dust drifts on the wind and wraps round the world.
      for (let i = 0; i < dustN; i++) { const o = i * 3; dustPos[o] += (0.9 + Math.sin(i) * 0.3) * dt * 4; dustPos[o + 1] += Math.sin(t / 1000 * 0.6 + i) * dt * 0.8; dustPos[o + 2] += 0.5 * dt * 4; if (dustPos[o] > 350) dustPos[o] = -350; if (dustPos[o + 2] > 350) dustPos[o + 2] = -350; }
      dustGeo.attributes.position.needsUpdate = true;
      rays.forEach((r, i) => { r.position.x = [-300, -240, -320, -150][i] + Math.sin(t / 1000 * 0.07 + i * 1.7) * 18; });

      // Photos
      const photos = P.photosRef.current ?? [];
      if (photos.length < shown) shown = 0;
      if (shown < photos.length) {
        for (; shown < Math.min(photos.length, PHOTO_CAP); shown++) {
          const ph = photos[shown];
          phPos[shown * 3] = ph.x; phPos[shown * 3 + 1] = heightAt(ph.x, ph.y) + ph.altM; phPos[shown * 3 + 2] = ph.y;
          if (ph.ok) phCol.set([1.05, 0.8, 0.55], shown * 3); else phCol.set([2.2, 0.25, 0.2], shown * 3);
        }
        phGeo.attributes.position.needsUpdate = true; phGeo.attributes.color.needsUpdate = true;
      }
      phGeo.setDrawRange(0, shown);

      rebuildPath(P.legs, P.legIndex, P.legProgressM, pl.params.altitudeM, a.x, a.y);

      // Camera
      const vw = viewRef.current;
      if (vw === 'CINEMATIC') {
        ctx.ac.set(a.x, acY, a.y); ctx.fwd.set(ca, 0, sa); ctx.right.set(-sa, 0, ca); ctx.groundY = groundY; ctx.flying = flying;
        dir.t += dt;
        if (flying && !dir.wasFlying) { dir.shot = -1; nextShot(true); }   // lift-off: cut to the chase
        dir.wasFlying = flying;
        const shot = SHOTS[dir.shot];
        if (dir.t > shot.dur || (shot.needsFlight && !flying)) nextShot(flying);
        SHOTS[dir.shot].pose(dir.t, Math.min(1, dir.t / SHOTS[dir.shot].dur), ctx, pose);
        camera.position.copy(pose.pos); camera.lookAt(pose.look);
        dir.fade = Math.max(0, dir.fade - dt * 2.4);
        if (fadeRef.current) fadeRef.current.style.opacity = String(Math.min(1, dir.fade * 1.4));
        if (shotRef.current) shotRef.current.textContent = SHOTS[dir.shot].name;
        // Keep the orbit camera in step, so a drag takes over from where the film left off.
        const g = goal.current, o = now.current; o.target.set(0, 0, 0); g.target.set(0, 0, 0);
        const rel = tmpV.copy(camera.position); o.radius = g.radius = Math.max(90, rel.length()); o.phi = g.phi = Math.acos(THREE.MathUtils.clamp(rel.y / o.radius, -1, 1)); o.theta = g.theta = Math.atan2(rel.z, rel.x);
      } else {
        const g = goal.current, o = now.current;
        if (vw === 'FOLLOW') { g.target.set(a.x, acY * 0.5, a.y); g.radius = Math.min(g.radius, 260); }
        else if (vw === 'OVERVIEW' && !drag.current && performance.now() - lastInput.current > 8000) g.theta += dt * 0.025;
        o.radius += (g.radius - o.radius) * 0.07; o.theta += (g.theta - o.theta) * 0.08; o.phi += (g.phi - o.phi) * 0.07;
        o.target.lerp(g.target, 0.08);
        camera.position.set(o.target.x + o.radius * Math.sin(o.phi) * Math.cos(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * Math.sin(o.phi) * Math.sin(o.theta));
        camera.lookAt(tmpV.copy(o.target));
        if (fadeRef.current) fadeRef.current.style.opacity = '0';
      }
      // Depth of field only when the film or the follow camera is close to the aircraft.
      const filmed = vw === 'CINEMATIC' || vw === 'FOLLOW';
      bokeh.enabled = filmed && gov.level === 0;
      bloom.enabled = gov.level < 2;
      const bu = bokeh.uniforms as { focus: { value: number }; aperture: { value: number } };
      bu.focus.value += (camera.position.distanceTo(ac.position) - bu.focus.value) * 0.15;
      bu.aperture.value = vw === 'CINEMATIC' ? 0.00005 : 0.00002;
      grade.uniforms.uGrain.value = filmed ? 0.06 : 0.025; grade.uniforms.uVignette.value = filmed ? 0.6 : 0.4;

      place(tagRef.current, a.x, acY + 9, a.y);
      place(homeRef.current, SITE.home.x, hy + 6, SITE.home.y);

      composer.render();
      if (gov.tick(dt * 1000)) { renderer.setPixelRatio(gov.pixelRatio(2)); const cw = host.clientWidth, ch = host.clientHeight; if (cw && ch) { camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); composer.setSize(cw, ch); bloom.setSize(cw, ch); } }
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); composer.setSize(cw, ch); bloom.setSize(cw, ch);
    });
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      release3d(scene, renderer, composer, [ortho, glow, pmrem]);
    };
  }, []);

  const applyView = (v: View) => {
    setView(v); lastInput.current = performance.now();
    if (v === 'FOLLOW') { goal.current.radius = 220; goal.current.phi = 1.05; return; }
    if (v === 'CINEMATIC') return;
    goal.current = { ...VIEWS[v], target: new THREE.Vector3(0, 0, 0) };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }; lastInput.current = performance.now(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (viewRef.current === 'CINEMATIC') { setView('OVERVIEW'); viewRef.current = 'OVERVIEW'; }   // a touch hands the camera to the operator, from where the film was
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY };
    lastInput.current = performance.now();
    goal.current.theta += dx * 0.005; goal.current.phi = Math.max(0.02, Math.min(1.45, goal.current.phi - dy * 0.005));
  };
  const onPointerUp = () => { drag.current = null; };
  // Wheel zooms the scene, not the page (React's wheel handler is passive, so this is a native listener).
  useEffect(() => {
    const el = hostRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); lastInput.current = performance.now(); if (viewRef.current === 'CINEMATIC') { setView('OVERVIEW'); viewRef.current = 'OVERVIEW'; } goal.current.radius = Math.max(90, Math.min(1100, goal.current.radius * (1 + e.deltaY * 0.001))); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const a = props.aircraft;
  const chip = 'rounded-lg bg-black/55 backdrop-blur';
  const flying = a.altM > 0.3;
  const stageLabel = structureAt(SITE.orbitTarget)?.label;
  const film = view === 'CINEMATIC';
  return (
    <div id="survey-stage" className="relative w-full h-full bg-imagery select-none overflow-hidden">
      <div ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className="w-full h-full cursor-grab active:cursor-grabbing" role="img" aria-label={`3D view of ${SITE.name}, ${coveredPct.toFixed(0)}% photographed`} />

      {/* Film: letterbox and the cut between shots */}
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-black transition-none" style={{ opacity: 0 }} />
      <div className={`pointer-events-none absolute inset-x-0 top-0 bg-black transition-[height] duration-700 ease-in-out ${film && !compact ? 'h-[7%]' : 'h-0'}`} />
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-black transition-[height] duration-700 ease-in-out ${film && !compact ? 'h-[7%]' : 'h-0'}`} />

      {/* Labels that follow the scene */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={tagRef} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <div className={`-translate-x-1/2 -translate-y-full whitespace-nowrap ${compact || film ? 'hidden' : ''}`}>
            <div className="rounded-md border border-[#fb923c]/50 bg-black/70 px-2 py-1 text-[10px] leading-tight text-white shadow-[0_0_18px_rgba(251,146,60,0.35)]">
              <div className="font-semibold tracking-wide">MAP-1 {phase === 'CAPTURING' && <span className="ml-1 text-[#fdba74]">● REC</span>}</div>
              <div className="num text-white/70">{flying ? `${a.altM.toFixed(0)} m · ${a.speedMps.toFixed(1)} m/s · ${a.battery.toFixed(0)}%` : 'On the pad'}</div>
            </div>
            <div className="mx-auto h-3 w-px bg-[#fb923c]/70" />
          </div>
        </div>
        <div ref={homeRef} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <span className={`-translate-x-1/2 -translate-y-full inline-block rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#111827] ${compact || film ? 'hidden' : ''}`}>HOME</span>
        </div>
      </div>

      {!compact && <>
      <div className={`absolute left-3 flex items-center gap-2 pointer-events-none transition-[top] duration-700 ${film ? 'top-[calc(7%+10px)]' : 'top-3'}`}>
        <span className={`${chip} px-2.5 py-1 text-[12px] font-medium text-white hidden sm:inline`}>{SITE.name}</span>
        <span className={`${chip} px-2.5 py-1 text-[11px] text-white/80 num`}>{progressLabel}</span>
        {props.plan.params.pattern === 'ORBIT' && stageLabel && <span className={`${chip} px-2.5 py-1 text-[11px] text-[#fdba74] hidden md:inline`}>Target · {stageLabel}</span>}
        {film && <span className={`${chip} hidden md:inline px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60`}><span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse align-middle" />Film · <span ref={shotRef} /></span>}
      </div>

      <div className={`absolute right-3 flex items-center gap-1.5 transition-[top] duration-700 ${film ? 'top-[calc(7%+10px)]' : 'top-3'}`}>
        <div role="group" aria-label="Layer" className={`inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
          {([['MODEL', 'Map', 'The venue as the finished map will show it'], ['OVERLAP', 'Overlap', 'How many photos see each point: green is enough for a reliable model']] as [SurveyLayer, string, string][]).map(([id, label, title]) => (
            <button key={id} type="button" title={title} aria-pressed={layer === id} onClick={() => onLayerChange(id)}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${layer === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Camera" className={`hidden sm:inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
          {([['CINEMATIC', 'Film'], ['OVERVIEW', 'Overview'], ['TOP', 'Top-down'], ['FOLLOW', 'Follow']] as [View, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => applyView(id)} title={id === 'CINEMATIC' ? 'A director films the survey: chase, crane, orbit, top-down and wide shots' : undefined}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${view === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => applyView(view)}
          className={`inline-flex items-center justify-center w-7 h-7 text-white/65 hover:text-white transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${chip}`}><RotateCcw /></button>
      </div>

      {lines && lines.total > 0 && (
        <div className={`absolute left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-2.5 px-3 py-1.5 ${chip} pointer-events-none transition-[bottom] duration-700 ${film ? 'bottom-[calc(7%+10px)]' : 'bottom-3'}`}>
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/60 num whitespace-nowrap">
            {lines.angles != null ? `${lines.angles} / ${lines.total} angles` : lines.current ? `Line ${lines.current} / ${lines.total}` : `${lines.done} / ${lines.total} lines`}
          </span>
          <div className="flex items-center gap-[3px]">
            {Array.from({ length: lines.total }, (_, i) => {
              const done = lines.angles != null ? i < lines.angles : i < lines.done;
              const cur = lines.angles == null && lines.current === i + 1;
              return <span key={i} className={`h-2 rounded-full ${lines.total > 24 ? 'w-1' : 'w-3'} ${cur ? 'bg-white animate-pulse shadow-[0_0_8px_rgba(251,146,60,0.9)]' : done ? 'bg-[#fb923c] shadow-[0_0_6px_rgba(251,146,60,0.6)]' : 'bg-white/15'}`} />;
            })}
          </div>
        </div>
      )}

      {layer === 'OVERLAP' ? (
        <div className={`absolute left-3 flex items-center gap-3 px-2.5 py-1.5 text-[11px] text-white/80 ${chip} pointer-events-none max-sm:gap-2 max-sm:text-[10px] ${film ? 'bottom-[calc(7%+10px)]' : 'bottom-3'}`}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#2eb85c]" />{GOOD_VIEWS}+ photos</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f29e1f]" />2–{GOOD_VIEWS - 1}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#e63333]" />1</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1a1d24] border border-white/20" />not yet</span>
        </div>
      ) : (
        <div className={`hidden xl:block absolute left-3 text-[10px] text-white/40 pointer-events-none max-w-[240px] leading-snug ${film ? 'bottom-[calc(7%+10px)]' : 'bottom-3'}`}>Coverage preview — the finished map and 3D model are built from the photos after landing{film ? ' · drag to take the camera' : ''}</div>
      )}
      </>}
    </div>
  );
};
