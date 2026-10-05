import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RotateCcw } from 'lucide-react';
import { PARKED_CARS, SITE, STOCKPILE, TREES, WORLD_M, heightAt, sitePhoto, structureAt } from '../../survey/site';
import { blueprintCanvas } from '../../survey/blueprint';
import { GOOD_VIEWS, type CoverageGrid, type Leg, type Pt, type SurveyPlan } from '../../survey/plan';
import { aimGimbal, buildDrone, droneMaterials, radialTexture, ROTOR_SPIN } from '../hero/droneModel';
import { FrameGovernor } from '../../lib/quality';
import { release3d } from '../../lib/release3d';
import type { Photo, SurveyAircraft, Phase } from '../../hooks/useSurveyMission';

/**
 * The survey stage: the venue in daylight with a holographic survey laid over it.
 *
 * - The aircraft's camera throws a blue scan beam onto exactly the ground it is photographing;
 *   each photo flashes the beam and its footprint.
 * - The survey boundary glows on the terrain with a node at every corner, over a faint blue fill.
 * - Flight lines glow on the ground: flown lines bright, the current one brightest up to the
 *   aircraft, the rest faint.
 * - The site's digital plan (structures with their sizes, paths, parking, a 10 m grid) lights up
 *   on the ground wherever photos have already covered it, read straight from the coverage grid.
 *   The Overlap layer recolours the same ground by how many photos see each point.
 * - Cards float over the aircraft, the latest photo and the main structures.
 *
 * Cameras: Chase (behind and above the aircraft, looking down its line), Site (orbit the venue;
 * drag and scroll) and Top-down. A preview of coverage, not a reconstruction: the orthomosaic and
 * 3D model are built from the photos after landing.
 */

export type SurveyLayer = 'MODEL' | 'OVERLAP';
type View = 'CHASE' | 'SITE' | 'TOP';

interface Props {
  plan: SurveyPlan;
  legs: Leg[];
  legIndex: number;
  aircraft: SurveyAircraft;
  photosRef: React.RefObject<Photo[]>;
  photoCount: number;
  grid: CoverageGrid;
  phase: Phase;
  layer: SurveyLayer;
  onLayerChange: (l: SurveyLayer) => void;
  coveredPct: number;
  /** Progress chip text, e.g. "62% photographed" or "20 of 36 angles". */
  progressLabel: string;
  /** Flight-line progress for the strip along the bottom. */
  lines?: { done: number; total: number; current: number | null; angles?: number };
  /** The survey boundary (the demo venue's when omitted). */
  boundary?: Pt[];
  /** Picture-in-picture: no overlay chrome. */
  compact?: boolean;
}

const SEG = 220;                       // terrain vertices per side (about 4 m apart over 900 m)
const AC_SCALE = 9;                    // aircraft drawn larger than life so it reads at 60 m
const PHOTO_CAP = 6000;
const HOLO = new THREE.Color(0.3, 0.68, 1.45);      // >1 blooms
const HOLO_DIM = new THREE.Color(0.12, 0.38, 0.95);
const HOLO_HOT = new THREE.Color(0.7, 1.4, 2.6);
const SITE_VIEW = { radius: 560, theta: Math.PI * 0.62, phi: 0.95 };
const TOP_VIEW = { radius: 700, theta: Math.PI / 2, phi: 0.02 };

const glowMat = (c: THREE.Color, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });

/** Late-afternoon sky, warm at the horizon. */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#8fb3d6'); gr.addColorStop(0.55, '#d9dfe2'); gr.addColorStop(0.8, '#efdcc4'); gr.addColorStop(1, '#f3d9b8');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Sky above, warm horizon, ground below: wrapped round a sphere for the reflections on cars and the aircraft. */
function envTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#8fb3d6'); gr.addColorStop(0.42, '#dfe4e6'); gr.addColorStop(0.5, '#efdcc4'); gr.addColorStop(0.56, '#9a8a70'); gr.addColorStop(1, '#5f5546');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** The scan beam's banding: brighter toward the ground, with scan lines. */
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d')!;
  for (let y = 0; y < 256; y++) { const t = y / 255, band = (Math.floor(y / 6) % 2) * 0.12; g.fillStyle = `rgba(255,255,255,${(0.1 + 0.32 * t + band * t).toFixed(3)})`; g.fillRect(0, y, 4, 1); }
  return new THREE.CanvasTexture(c);
}

const OVERLAY_VS = /* glsl */ `varying vec2 vXY; void main(){ vXY = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/** The plan (red: linework, green: survey area) revealed by the coverage mask (red: covered, green: views/10). */
const BLUEPRINT_FS = /* glsl */ `
uniform sampler2D uPlan; uniform sampler2D uMask; uniform vec4 uGrid; uniform float uWorld; uniform vec3 uHolo; uniform float uBase; uniform float uFill;
varying vec2 vXY;
void main(){
  vec4 p = texture2D(uPlan, vec2((vXY.x + uWorld * 0.5) / uWorld, 1.0 - (vXY.y + uWorld * 0.5) / uWorld));
  vec2 m = (vXY - uGrid.xy) / uGrid.zw;
  float inG = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
  float cov = smoothstep(0.08, 0.7, texture2D(uMask, m).r * inG);
  vec3 c = uHolo * (p.r * mix(uBase, 1.0, cov) * 1.3 + p.g * uFill * (0.6 + 0.6 * cov));
  gl_FragColor = vec4(c, 1.0);
}`;
/** The Overlap layer: red one photo, amber two to four, green GOOD_VIEWS or more, over the survey area. */
const OVERLAP_FS = /* glsl */ `
uniform sampler2D uPlan; uniform sampler2D uMask; uniform vec4 uGrid; uniform float uWorld; uniform float uGood;
varying vec2 vXY;
void main(){
  float inside = texture2D(uPlan, vec2((vXY.x + uWorld * 0.5) / uWorld, 1.0 - (vXY.y + uWorld * 0.5) / uWorld)).g;
  vec2 m = (vXY - uGrid.xy) / uGrid.zw;
  float inG = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
  float v = texture2D(uMask, m).g * 10.0 * inG;
  vec3 c = v < 0.5 ? vec3(0.1, 0.12, 0.16) : v < 1.5 ? vec3(0.9, 0.2, 0.2) : v < uGood - 0.5 ? vec3(0.95, 0.62, 0.12) : vec3(0.18, 0.72, 0.36);
  gl_FragColor = vec4(c, (v < 0.5 ? 0.35 : 0.55) * inside);
}`;

export const SurveyHoloStage: React.FC<Props> = (props) => {
  const { layer, onLayerChange, coveredPct, progressLabel, compact, lines, phase } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const acCard = useRef<HTMLDivElement>(null);
  const photoCard = useRef<HTMLDivElement>(null);
  const homeTag = useRef<HTMLDivElement>(null);
  const siteCards = useRef<(HTMLDivElement | null)[]>([]);
  const [view, setView] = useState<View>(compact ? 'SITE' : 'CHASE');
  const propsRef = useRef(props); propsRef.current = props;
  const viewRef = useRef<View>(view); viewRef.current = view;
  const goal = useRef({ ...SITE_VIEW, target: new THREE.Vector3() });
  const now = useRef({ ...SITE_VIEW, target: new THREE.Vector3() });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const lastInput = useRef(performance.now());

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const w = host.clientWidth || 900, h = host.clientHeight || 520;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gov = new FrameGovernor('survey');
    renderer.setPixelRatio(gov.pixelRatio(2)); renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.innerHTML = ''; host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sky = skyTexture(); scene.background = sky;
    scene.fog = new THREE.Fog(0xe8dccb, 320, 1300);
    const camera = new THREE.PerspectiveCamera(46, w / h, 1, 4000);
    scene.add(new THREE.HemisphereLight(0xcfe0f2, 0x8a7a60, 0.9));
    const sun = new THREE.DirectionalLight(0xffe2bc, 2.6); sun.position.set(-260, 220, -140); sun.castShadow = true;
    // Shadow detail by screen: 4096 only on a large stage on a capable machine; the governor lowers it under load.
    const small = compact || w < 700, dpr = window.devicePixelRatio || 1;
    const shadowSize = small ? 1024 : dpr <= 1 ? 2048 : 4096;
    sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 900 }); scene.add(sun);
    const pmrem = new THREE.PMREMGenerator(renderer);
    // A light alone renders nothing into an environment map: give PMREM a sky to see.
    const envSky = envTexture(), envScene = new THREE.Scene(), envBall = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: envSky, side: THREE.BackSide }));
    envScene.add(envBall);
    const envTex = pmrem.fromScene(envScene, 0.04).texture; scene.environment = envTex; scene.environmentIntensity = 0.5;
    envBall.geometry.dispose(); (envBall.material as THREE.Material).dispose(); envSky.dispose();

    // ---- the venue in daylight ----------------------------------------------------------
    const photoTex = new THREE.CanvasTexture(sitePhoto(small || dpr <= 1 ? 2048 : 4096)); photoTex.colorSpace = THREE.SRGBColorSpace; photoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const G = new THREE.PlaneGeometry(WORLD_M, WORLD_M, SEG, SEG).rotateX(-Math.PI / 2);
    { const a = G.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setY(i, heightAt(a.getX(i), a.getZ(i))); G.computeVertexNormals(); }
    const ground = new THREE.Mesh(G, new THREE.MeshStandardMaterial({ map: photoTex, roughness: 1, metalness: 0 })); ground.receiveShadow = true; scene.add(ground);
    const at = (x: number, y: number, up = 0) => new THREE.Vector3(x, heightAt(x, y) + up, y);
    const wall = new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.85 });
    for (const s of SITE.structures) {
      const gy = heightAt(s.x, s.y);
      let m: THREE.Mesh;
      if (s.kind === 'tent') { m = new THREE.Mesh(new THREE.ConeGeometry(s.w * 0.72, s.h, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.8 })); m.position.set(s.x, gy + s.h / 2, s.y); }
      else if (s.kind === 'hall') {
        const r = s.d / 2, arch = new THREE.Shape(); arch.moveTo(-r, 0); arch.absarc(0, 0, r, Math.PI, 0, true); arch.lineTo(-r, 0);
        m = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: s.w, bevelEnabled: false, curveSegments: 36 }).translate(0, 0, -s.w / 2).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe2e5, roughness: 0.6, metalness: 0.1 }));
        m.position.set(s.x, gy, s.y); m.scale.y = s.h / r;
      } else { const roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.roof), roughness: 0.7 }); m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), [wall, wall, roof, wall, wall, wall]); m.position.set(s.x, gy + s.h / 2, s.y); }
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
    const m4 = new THREE.Matrix4();
    // Tree crowns: a lumpy sphere (each vertex pushed in or out by a few lobes), turned and sized per tree.
    const crownGeo = new THREE.IcosahedronGeometry(1, 3);
    { const a = crownGeo.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).normalize(); const k = 0.82 + 0.12 * Math.sin(v.x * 5.1 + v.y * 3.3) + 0.09 * Math.sin(v.z * 6.7 - v.x * 2.9) + 0.06 * Math.sin(v.y * 9.1 + v.z * 4.4); a.setXYZ(i, v.x * k, v.y * k * 0.92, v.z * k); }
      crownGeo.computeVertexNormals(); }
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), TREES.length); crowns.castShadow = true; crowns.receiveShadow = true;
    TREES.forEach((t, i) => { const p = at(t.x, t.y); crowns.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, p.y + t.r * 1.45, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.shade * 6.28), new THREE.Vector3(t.r, t.r * (1.05 + t.shade * 0.3), t.r))); crowns.setColorAt(i, new THREE.Color().setHSL(0.23 + t.shade * 0.04, 0.38, 0.16 + t.shade * 0.08)); });
    scene.add(crowns);
    const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.4, 4.3), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), PARKED_CARS.length); cars.castShadow = true;
    PARKED_CARS.forEach((c, i) => { const p = at(c.x + 1.3, c.y + 2.5, 0.7); cars.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); cars.setColorAt(i, new THREE.Color(c.color)); });
    scene.add(cars);

    // ---- holographic overlay: the plan revealed by coverage, or the overlap heat ------------
    let planTex = new THREE.CanvasTexture(blueprintCanvas(propsRef.current.boundary ?? SITE.boundary, w < 700 ? 2048 : 4096)); planTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    let maskTex = new THREE.DataTexture(new Uint8Array(4), 1, 1); let maskGrid: CoverageGrid | null = null, maskVersion = -1, maskAcc = 1;
    const shared = { uPlan: { value: planTex }, uMask: { value: maskTex as THREE.Texture }, uGrid: { value: new THREE.Vector4(0, 0, 1, 1) }, uWorld: { value: WORLD_M } };
    const blueprintMat = new THREE.ShaderMaterial({ uniforms: { ...shared, uHolo: { value: HOLO }, uBase: { value: 0.1 }, uFill: { value: 0.05 } }, vertexShader: OVERLAY_VS, fragmentShader: BLUEPRINT_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const overlapMat = new THREE.ShaderMaterial({ uniforms: { ...shared, uGood: { value: GOOD_VIEWS } }, vertexShader: OVERLAY_VS, fragmentShader: OVERLAP_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const overlay = new THREE.Mesh(G, blueprintMat); overlay.position.y = 0.25; overlay.renderOrder = 1; scene.add(overlay);
    const updateMask = (grid: CoverageGrid) => {
      if (grid !== maskGrid) {
        maskTex.dispose();
        maskTex = new THREE.DataTexture(new Uint8Array(grid.cols * grid.rows * 4), grid.cols, grid.rows, THREE.RGBAFormat);
        maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter; maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
        shared.uMask.value = maskTex; shared.uGrid.value.set(grid.minX, grid.minY, grid.cols * grid.cellM, grid.rows * grid.cellM);
        maskGrid = grid; maskVersion = -1;
      }
      if (grid.version === maskVersion) return;
      const d = maskTex.image.data as Uint8Array;
      for (let i = 0; i < grid.views.length; i++) { const v = grid.views[i]; d[i * 4] = v > 0 ? 255 : 0; d[i * 4 + 1] = Math.min(10, v) * 25.5; d[i * 4 + 3] = 255; }
      maskTex.needsUpdate = true; maskVersion = grid.version;
    };

    // ---- boundary: a glowing edge with a node at every corner ------------------------------
    const drape = (pts: Pt[], step: number, up: number) => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)); for (let k = 0; k < n; k++) { const t = k / n; out.push(at(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, up)); } }
      const l = pts[pts.length - 1]; out.push(at(l.x, l.y, up)); return out;
    };
    const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), Math.max(8, pts.length * 2), r, 6), mat);
    const edgeMats = { core: glowMat(HOLO), halo: glowMat(HOLO_DIM, 0.25), node: glowMat(new THREE.Color(1.2, 2, 3)), ring: glowMat(HOLO, 0.8) };
    const nodeGeo = new THREE.SphereGeometry(1.6, 16, 12), ringGeo = new THREE.RingGeometry(3, 3.6, 40).rotateX(-Math.PI / 2);
    const edge = new THREE.Group(); scene.add(edge);
    let boundaryKey = '', boundaryArr: Pt[] | null = null;
    const buildBoundary = (b: Pt[]) => {
      if (b === boundaryArr) return; boundaryArr = b;
      const key = b.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';'); if (key === boundaryKey) return; boundaryKey = key;
      edge.children.slice().forEach(o => { const m = o as THREE.Mesh; if (m.geometry !== nodeGeo && m.geometry !== ringGeo) m.geometry.dispose(); edge.remove(o); });
      if (b.length < 3) return;
      const ring = drape([...b, b[0]], 2, 0.6);
      edge.add(tube(ring, 0.45, edgeMats.core), tube(ring, 1.6, edgeMats.halo));
      for (const p of b) { const v = at(p.x, p.y, 0.8); const n = new THREE.Mesh(nodeGeo, edgeMats.node); n.position.copy(v); const r = new THREE.Mesh(ringGeo, edgeMats.ring); r.position.copy(v); edge.add(n, r); }
      const old = planTex; planTex = new THREE.CanvasTexture(blueprintCanvas(b, w < 700 ? 2048 : 4096)); planTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); shared.uPlan.value = planTex; old.dispose();
    };
    // The plan's lettering needs Inter; redraw once the face has loaded.
    let alive = true;
    document.fonts?.load('600 40px Inter').then(() => { if (!alive) return; boundaryKey = ''; boundaryArr = null; buildBoundary(propsRef.current.boundary ?? SITE.boundary); }).catch(() => undefined);

    // ---- flight lines on the ground ----------------------------------------------------------
    const lineMats = { flown: glowMat(HOLO, 0.9), cur: glowMat(HOLO_HOT), ahead: glowMat(HOLO, 0.35), todo: glowMat(HOLO_DIM, 0.28) };
    const linesGroup = new THREE.Group(); scene.add(linesGroup);
    const curGroup = new THREE.Group(); scene.add(curGroup);
    let linesKey = '', linesLegs: Leg[] | null = null, curKey = '';
    const clear = (g: THREE.Group) => { g.children.slice().forEach(o => { (o as THREE.Mesh).geometry.dispose(); g.remove(o); }); };
    const buildLines = (legs: Leg[], idx: number, ax: number, ay: number) => {
      // Every re-plan makes new legs (an orbit radius keeps their count): compare the array, not its length.
      if (legs !== linesLegs || String(idx) !== linesKey) {
        linesLegs = legs; linesKey = String(idx); clear(linesGroup); curKey = '';
        legs.forEach((g, i) => { if (!g.capture || i === idx) return; linesGroup.add(tube(drape([g.a, g.b], 3, 0.5), i < idx ? 0.28 : 0.15, i < idx ? lineMats.flown : lineMats.todo)); });
      }
      const cur = legs[idx];
      const key = cur && cur.capture ? `${idx}:${Math.round(ax / 4)}:${Math.round(ay / 4)}` : 'none';
      if (key === curKey) return; curKey = key; clear(curGroup);
      if (!cur || !cur.capture) return;
      const here = { x: ax, y: ay };
      if (Math.hypot(here.x - cur.a.x, here.y - cur.a.y) > 1) curGroup.add(tube(drape([cur.a, here], 3, 0.5), 0.45, lineMats.cur));
      if (Math.hypot(cur.b.x - here.x, cur.b.y - here.y) > 1) curGroup.add(tube(drape([here, cur.b], 3, 0.5), 0.18, lineMats.ahead));
    };

    // ---- photos: a small light at every photo station -------------------------------------------
    const bead = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!; const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
    const phPos = new Float32Array(PHOTO_CAP * 3), phCol = new Float32Array(PHOTO_CAP * 3);
    const phGeo = new THREE.BufferGeometry(); phGeo.setAttribute('position', new THREE.BufferAttribute(phPos, 3)); phGeo.setAttribute('color', new THREE.BufferAttribute(phCol, 3)); phGeo.setDrawRange(0, 0);
    const beads = new THREE.Points(phGeo, new THREE.PointsMaterial({ size: 3, map: bead, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    beads.frustumCulled = false;   // the bounding sphere is taken once, while every point is still at the origin
    scene.add(beads);
    let shown = 0;

    // ---- aircraft and its scan beam ----------------------------------------------------------------
    const { group: acModel, props: acProps, blur: acBlur, gimbal: acGimbal } = buildDrone(droneMaterials(), radialTexture());
    acModel.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = !(m.material as THREE.Material).transparent; });
    const ac = new THREE.Group(); ac.add(acModel); ac.scale.setScalar(AC_SCALE); scene.add(ac);
    let camTilt = -0.35, prevHeading = 0, roll = 0, pitch = 0;
    const beamTex = beamTexture();
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3).setUsage(THREE.DynamicDrawUsage));
    beamGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.5, 0, 0, 1, 1, 1, 0.5, 0, 0, 1, 1, 1, 0.5, 0, 0, 1, 1, 1, 0.5, 0, 0, 1, 1, 1]), 2));
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(0.35, 0.8, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.frustumCulled = false; scene.add(beam);
    const dyn = (n: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)); return g; };
    const beamEdges = new THREE.LineSegments(dyn(8), new THREE.LineBasicMaterial({ color: HOLO, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const footLine = new THREE.LineLoop(dyn(4), new THREE.LineBasicMaterial({ color: HOLO_HOT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const footFill = new THREE.Mesh(dyn(6), glowMat(new THREE.Color(0.2, 0.5, 1.1), 0.3));
    for (const o of [beamEdges, footLine, footFill]) { o.frustumCulled = false; scene.add(o); }
    const setPts = (g: THREE.BufferGeometry, pts: THREE.Vector3[]) => { const a = g.attributes.position as THREE.BufferAttribute; pts.forEach((v, i) => a.setXYZ(i, v.x, v.y, v.z)); a.needsUpdate = true; };
    let lastPhotoCount = 0, shutter = 0;

    // ---- post: bloom for the light, then output ------------------------------------------------------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.5, 0.9); composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---- loop ------------------------------------------------------------------------------------------
    const proj = new THREE.Vector3(), tmp = new THREE.Vector3(), chasePos = new THREE.Vector3(), chaseLook = new THREE.Vector3(), chaseDir = new THREE.Vector3(1, 0, 0); let chaseInit = false, chaseAir = 0;
    const place = (el: HTMLDivElement | null, x: number, y: number, z: number, show = true) => {
      if (!el) return;
      proj.set(x, y, z).project(camera);
      const vis = show && proj.z < 1 && Math.abs(proj.x) < 1.02 && Math.abs(proj.y) < 1.02;
      el.style.opacity = vis ? '1' : '0';
      el.style.transform = `translate(${((proj.x + 1) / 2) * host.clientWidth}px, ${((1 - proj.y) / 2) * host.clientHeight}px)`;
    };
    const cardAnchors = (['stage', 'hall'] as const).map(id => { const s = structureAt(id)!; return at(s.x, s.y, s.h); }).concat([at(STOCKPILE.x, STOCKPILE.y, STOCKPILE.h)]);
    // The aircraft arrives at 10 Hz. Draw it where it is now: carry it on from the last two fixes, then ease,
    // so the aircraft, the chase camera and the bank are smooth at any refresh rate.
    const fix = { x: NaN, y: NaN, t: 0, vx: 0, vy: 0 }, disp = { x: 0, y: 0, alt: 0, hdg: 0, init: false };
    let raf = 0, lastT = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.max(0, Math.min(0.1, (t - lastT) / 1000)); lastT = t;
      const P = propsRef.current, src = P.aircraft, pl = P.plan;
      if (src.x !== fix.x || src.y !== fix.y) {
        const since = (t - fix.t) / 1000;
        if (Number.isFinite(fix.x) && since > 0 && since < 0.5) { fix.vx = (src.x - fix.x) / since; fix.vy = (src.y - fix.y) / since; } else { fix.vx = fix.vy = 0; }
        fix.x = src.x; fix.y = src.y; fix.t = t;
      } else if (t - fix.t > 200) { fix.vx = fix.vy = 0; }
      const ahead = Math.min(0.1, (t - fix.t) / 1000), px = src.x + fix.vx * ahead, py = src.y + fix.vy * ahead;
      if (!disp.init || reduced || Math.hypot(px - disp.x, py - disp.y) > 60) { disp.x = px; disp.y = py; disp.alt = src.altM; disp.hdg = src.headingDeg; disp.init = true; }
      else {
        const e = 1 - Math.exp(-dt * 14);
        disp.x += (px - disp.x) * e; disp.y += (py - disp.y) * e; disp.alt += (src.altM - disp.alt) * e;
        disp.hdg += ((((src.headingDeg - disp.hdg) % 360) + 540) % 360 - 180) * (1 - Math.exp(-dt * 6));
      }
      const a = { ...src, x: disp.x, y: disp.y, altM: disp.alt, headingDeg: disp.hdg };
      const groundY = heightAt(a.x, a.y), acY = groundY + Math.max(0.6, a.altM), flying = a.altM > 0.3, capturing = P.phase === 'CAPTURING';

      buildBoundary(P.boundary ?? SITE.boundary);
      maskAcc += dt; if (maskAcc > 0.15 || P.grid !== maskGrid) { updateMask(P.grid); maskAcc = 0; }
      const wantMat = P.layer === 'OVERLAP' ? overlapMat : blueprintMat; if (overlay.material !== wantMat) overlay.material = wantMat;
      buildLines(P.legs, P.legIndex, a.x, a.y);

      // Aircraft: banks through turns, noses down at speed; gimbal straight down while photographing.
      const hRad = ((a.headingDeg - 90) * Math.PI) / 180;
      let dh = a.headingDeg - prevHeading; dh = ((dh + 540) % 360) - 180; prevHeading = a.headingDeg;
      const rate = dt > 0 ? (dh * Math.PI) / 180 / dt : 0;
      roll += (THREE.MathUtils.clamp(-rate * 0.55, -0.5, 0.5) - roll) * Math.min(1, dt * 4);
      pitch += ((flying && a.speedMps > 1.5 ? -0.14 : 0) - pitch) * Math.min(1, dt * 3);
      ac.position.set(a.x, acY, a.y); ac.rotation.set(pitch, Math.PI / 2 - hRad, roll, 'YXZ');
      acProps.forEach((pr, k) => { pr.rotation.y += dt * (flying ? ROTOR_SPIN : 0) * (k % 2 ? -1 : 1); });
      acBlur.forEach(b => { b.visible = flying; });
      camTilt += ((capturing ? -Math.PI / 2 : -0.35) - camTilt) * Math.min(1, dt * 2.5);
      aimGimbal(acGimbal, { tilt: camTilt });

      // The camera's footprint, and the beam from the camera to it.
      const k = Math.max(0.2, a.altM / pl.params.altitudeM);
      const hx = (pl.footprint.alongM * k) / 2, hz = (pl.footprint.acrossM * k) / 2;
      let cx = a.x, cy = a.y;
      if (pl.params.pattern === 'ORBIT') { cx = pl.params.orbit.center.x; cy = pl.params.orbit.center.y; }
      else if (pl.gimbalPitchDeg > -85) { const off = a.altM * Math.tan(((90 + pl.gimbalPitchDeg) * Math.PI) / 180); cx += Math.cos(hRad) * off; cy += Math.sin(hRad) * off; }
      const ca = Math.cos(hRad), sa = Math.sin(hRad);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = cx + u * hx * ca - v * hz * sa, y = cy + u * hx * sa + v * hz * ca; return new THREE.Vector3(x, heightAt(x, y) + 0.6, y); });
      const apex = tmp.set(a.x, acY - 0.12 * AC_SCALE, a.y).addScaledVector(new THREE.Vector3(ca, 0, sa), 0.4 * AC_SCALE).clone();
      if (P.photoCount > lastPhotoCount) shutter = 1;
      lastPhotoCount = P.photoCount; shutter = Math.max(0, shutter - dt * 3);
      setPts(beamGeo, [0, 1, 2, 3].flatMap(i => [apex, corners[i], corners[(i + 1) % 4]]));
      setPts(beamEdges.geometry, corners.flatMap(c => [apex, c]));
      setPts(footLine.geometry, corners);
      setPts(footFill.geometry, [corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
      beam.visible = beamEdges.visible = footLine.visible = footFill.visible = flying;
      beamMat.opacity = capturing ? 0.75 + shutter * 0.5 : 0.25;
      (footFill.material as THREE.MeshBasicMaterial).opacity = (capturing ? 0.22 : 0.08) + shutter * 0.35;

      // Photo stations.
      const photos = P.photosRef.current ?? [];
      if (photos.length < shown) shown = 0;
      for (; shown < Math.min(photos.length, PHOTO_CAP); shown++) {
        const ph = photos[shown];
        phPos.set([ph.x, heightAt(ph.x, ph.y) + ph.altM, ph.y], shown * 3);
        phCol.set(ph.ok ? [0.5, 1.1, 2.2] : [2.4, 0.4, 0.3], shown * 3);
        phGeo.attributes.position.needsUpdate = phGeo.attributes.color.needsUpdate = true;
      }
      phGeo.setDrawRange(0, shown);

      // Camera.
      const vw = viewRef.current, fwd = tmp.set(ca, 0, sa).clone();
      if (vw === 'CHASE') {
        // The camera rides with the aircraft (so it never falls behind at simulation speed); only its
        // bearing eases round, so turns at the end of a line swing the view rather than snap it.
        if (!chaseInit || reduced) { chaseDir.copy(fwd); chaseInit = true; }
        chaseDir.lerp(fwd, 1 - Math.exp(-dt * 1.4)).normalize();
        const cs = new THREE.Vector3(-chaseDir.z, 0, chaseDir.x), air = flying ? 1 : 0;
        chaseAir += (air - chaseAir) * (1 - Math.exp(-dt * 0.8));
        const ref = new THREE.Vector3(a.x, Math.max(acY, groundY + 30 * chaseAir), a.y);
        chasePos.copy(ref).addScaledVector(chaseDir, -58 - 70 * (1 - chaseAir)).addScaledVector(cs, -34 - 40 * (1 - chaseAir)).add(new THREE.Vector3(0, 24 + 40 * (1 - chaseAir), 0));
        chaseLook.copy(ref).addScaledVector(chaseDir, 30 + 60 * (1 - chaseAir)).addScaledVector(cs, 6).add(new THREE.Vector3(0, -36 * chaseAir, 0));
        camera.position.copy(chasePos); camera.lookAt(chaseLook);
        // Keep the orbit in step so a drag takes over from here.
        const g = goal.current, o = now.current; o.target.set(0, 0, 0); g.target.set(0, 0, 0);
        o.radius = g.radius = Math.max(120, chasePos.length()); o.phi = g.phi = Math.acos(THREE.MathUtils.clamp(chasePos.y / o.radius, -1, 1)); o.theta = g.theta = Math.atan2(chasePos.z, chasePos.x);
      } else {
        chaseInit = false;
        const g = goal.current, o = now.current;
        if (vw === 'SITE' && !reduced && !drag.current && performance.now() - lastInput.current > 8000) g.theta += dt * 0.025;
        const e = 1 - Math.exp(-dt * 4.5);
        o.radius += (g.radius - o.radius) * e; o.theta += (g.theta - o.theta) * e; o.phi += (g.phi - o.phi) * e; o.target.lerp(g.target, e);
        camera.position.set(o.target.x + o.radius * Math.sin(o.phi) * Math.cos(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * Math.sin(o.phi) * Math.sin(o.theta));
        camera.lookAt(o.target);
      }

      // Cards (none on a phone-sized stage: the scene is too small to carry them). Their sizes are read
      // before this frame writes any style, so the browser is not made to lay out the page mid-frame.
      const cardEls = [acCard.current, photoCard.current, ...siteCards.current, homeTag.current];
      const rects = cardEls.map(el => (el?.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null);
      const roomy = host.clientWidth >= 640;
      place(acCard.current, a.x, acY + 0.3 * AC_SCALE, a.y, roomy);
      const far = corners[1].clone().lerp(corners[2], 0.5);
      place(photoCard.current, far.x, far.y, far.z, roomy && flying && capturing && P.photoCount > 0);
      place(homeTag.current, SITE.home.x, heightAt(SITE.home.x, SITE.home.y) + 2, SITE.home.y, roomy && (!flying || vw !== 'CHASE'));
      cardAnchors.forEach((v, i) => place(siteCards.current[i], v.x, v.y, v.z, roomy && vw !== 'CHASE'));
      const shownRects: DOMRect[] = [];
      cardEls.forEach((el, i) => {
        const r = rects[i]; if (!el || !r || el.style.opacity === '0') return;
        if (shownRects.some(q => r.left < q.right + 6 && r.right > q.left - 6 && r.top < q.bottom + 4 && r.bottom > q.top - 4)) { el.style.opacity = '0'; return; }
        shownRects.push(r);
      });

      bloom.enabled = gov.level < 2;
      composer.render();
      if (gov.tick(dt * 1000)) {
        renderer.setPixelRatio(gov.pixelRatio(2)); composer.setPixelRatio(gov.pixelRatio(2));
        const want = gov.level >= 1 ? Math.min(shadowSize, 1024) : shadowSize;
        if (sun.shadow.mapSize.x !== want) { sun.shadow.mapSize.set(want, want); sun.shadow.map?.dispose(); sun.shadow.map = null; }
        const cw = host.clientWidth, ch = host.clientHeight; if (cw && ch) { camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); composer.setSize(cw, ch); } }
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); composer.setSize(cw, ch);
    });
    ro.observe(host);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      release3d(scene, renderer, composer, [photoTex, planTex, maskTex, sky, envTex, pmrem, bead, beamTex, nodeGeo, ringGeo, blueprintMat, overlapMat, ...Object.values(edgeMats), ...Object.values(lineMats)]);
    };
  }, []);

  const applyView = (v: View) => {
    setView(v); lastInput.current = performance.now();
    if (v === 'CHASE') return;
    goal.current = { ...(v === 'TOP' ? TOP_VIEW : SITE_VIEW), target: new THREE.Vector3() };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 }; lastInput.current = performance.now(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY, moved: drag.current.moved + Math.abs(dx) + Math.abs(dy) };
    lastInput.current = performance.now();
    if (drag.current.moved < 6) return;   // a tap is not a drag
    if (viewRef.current === 'CHASE') { setView('SITE'); viewRef.current = 'SITE'; }   // a drag hands the camera to the operator, from where the chase was
    goal.current.theta += dx * 0.005; goal.current.phi = Math.max(0.02, Math.min(1.42, goal.current.phi - dy * 0.005));
  };
  const onPointerUp = () => { drag.current = null; };
  // Wheel zooms the scene, not the page (React's wheel handler is passive, so this is a native listener).
  useEffect(() => {
    const el = hostRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); lastInput.current = performance.now(); if (viewRef.current === 'CHASE') { setView('SITE'); viewRef.current = 'SITE'; } goal.current.radius = Math.max(120, Math.min(1100, goal.current.radius * (1 + e.deltaY * 0.001))); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const a = props.aircraft;
  const flying = a.altM > 0.3;
  const chip = 'rounded-lg bg-white/85 text-[#0f1720] shadow-[0_1px_2px_rgba(15,23,32,0.08)] ring-1 ring-[#0f1720]/10';
  const card = 'relative -translate-x-1/2 -translate-y-full mb-10 flex items-center gap-2 whitespace-nowrap rounded-[10px] bg-white/90 py-1.5 pl-1.5 pr-2.5 text-[11.5px] leading-tight text-[#0f1720] shadow-[0_6px_22px_rgba(10,40,80,0.18),0_0_0_1px_rgba(80,160,255,0.45)]';
  const icon = 'grid place-items-center w-6 h-6 rounded-md bg-gradient-to-b from-[#4aa8ff] to-[#1f6fe0] text-white text-[11px] font-bold';
  const stem = 'absolute left-1/2 top-full h-10 w-[1.5px] bg-gradient-to-b from-[#5fb4ff] to-transparent';
  const stageS = structureAt('stage'), hallS = structureAt('hall');
  const siteInfo: [string, string, string][] = [
    ['▲', stageS?.label ?? 'Main stage', stageS ? `${stageS.w} × ${stageS.d} m · ${stageS.h} m high` : ''],
    ['◼', hallS?.label ?? 'Exhibition hall', hallS ? `${hallS.w} × ${hallS.d} m · ${hallS.h} m high` : ''],
    ['◉', 'Gravel stockpile', 'volume after landing'],
  ];
  const lineNo = lines?.current, total = lines?.total ?? 0;
  return (
    <div id="survey-stage" className="relative w-full h-full bg-[#d9dfe2] select-none overflow-hidden">
      <div ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-pan-y" role="img" aria-label={`3D view of ${SITE.name}, ${coveredPct.toFixed(0)}% photographed`} />

      {/* Cards that float over the scene */}
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${compact ? 'hidden' : ''}`} aria-hidden="true">
        <div ref={acCard} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <div className={card}><span className={icon}>➚</span><div>{flying ? `Aircraft · ${lineNo ? `line ${lineNo} of ${total}` : PHASE_WORD[phase] ?? 'flying'}` : 'Aircraft · on the pad'}
            <div className="text-[10.5px] text-[#5b6676] num">{flying ? `${a.altM.toFixed(0)} m · ${a.speedMps.toFixed(1)} m/s · battery ${a.battery.toFixed(0)}%` : `battery ${a.battery.toFixed(0)}% · ready`}</div></div><span className={stem} /></div>
        </div>
        <div ref={photoCard} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <div className={`${card} mb-6`}><span className={icon}>✦</span><div>Photo {props.photoCount}<div className="text-[10.5px] text-[#5b6676] num">{lineNo ? `line ${lineNo} · ` : ''}{props.plan.gsdCm.toFixed(1)} cm/px</div></div><span className={`${stem} h-6`} /></div>
        </div>
        <div ref={homeTag} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <span className="-translate-x-1/2 -translate-y-full inline-block rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#0f1720] ring-1 ring-[#5fb4ff]/60">Home</span>
        </div>
        {siteInfo.map(([ic, t, sub], i) => (
          <div key={t} ref={el => { siteCards.current[i] = el; }} className="absolute left-0 top-0" style={{ opacity: 0 }}>
            <div className={card}><span className={icon}>{ic}</span><div>{t}<div className="text-[10.5px] text-[#5b6676] num">{sub}</div></div><span className={stem} /></div>
          </div>
        ))}
      </div>

      {!compact && <>
        <div className="absolute left-3 top-3 hidden sm:flex items-center gap-2 pointer-events-none">{/* a phone shows the progress above the stage */}
          <span className={`${chip} px-2.5 py-1 text-[12px] font-medium`}>{SITE.name}</span>
          <span className={`${chip} px-2.5 py-1 text-[11px] num`}>{progressLabel}</span>
          {props.plan.params.pattern === 'ORBIT' && stageS && <span className={`${chip} px-2.5 py-1 text-[11px] hidden md:inline`}>Target · {stageS.label}</span>}
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <div role="group" aria-label="Layer" className={`inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
            {([['MODEL', 'Blueprint', 'The site plan lights up where the photos have covered it'], ['OVERLAP', 'Overlap', `How many photos see each point: green is ${GOOD_VIEWS} or more, enough for a reliable model`]] as [SurveyLayer, string, string][]).map(([id, label, title]) => (
              <button key={id} type="button" title={title} aria-pressed={layer === id} onClick={() => onLayerChange(id)}
                className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${layer === id ? 'bg-[#0f1720] text-white' : 'text-[#4d5866] hover:text-[#0f1720]'}`}>{label}</button>
            ))}
          </div>
          <div role="group" aria-label="Camera" className={`inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
            {([['CHASE', 'Chase', 'Behind the aircraft, looking down its line'], ['SITE', 'Site', 'The whole venue; drag to turn, scroll to zoom'], ['TOP', 'Top-down', 'Straight down on the venue']] as [View, string, string][]).map(([id, label, title]) => (
              <button key={id} type="button" title={title} aria-label={label} aria-pressed={view === id} onClick={() => applyView(id)}
                className={`h-6 px-2 max-sm:px-1.5 rounded-md text-[11px] font-medium transition-colors ${view === id ? 'bg-[#0f1720] text-white' : 'text-[#4d5866] hover:text-[#0f1720]'}`}>{id === 'TOP' ? <><span className="sm:hidden">Top</span><span className="max-sm:hidden">{label}</span></> : label}</button>
            ))}
          </div>
          <button type="button" aria-label="Reset view" title="Reset view" onClick={() => applyView(view)}
            className={`inline-flex items-center justify-center w-7 h-7 text-[#4d5866] hover:text-[#0f1720] transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${chip}`}><RotateCcw /></button>
        </div>

        {lines && lines.total > 0 && (
          <div className={`absolute left-3 bottom-3 hidden sm:flex items-center gap-2.5 px-3 py-1.5 ${chip} pointer-events-none`}>
            <div className="flex items-center gap-[3px]">
              {Array.from({ length: lines.total }, (_, i) => {
                const done = lines.angles != null ? i < lines.angles : i < lines.done;
                const cur = lines.angles == null && lines.current === i + 1;
                return <span key={i} className={`h-1 rounded-full ${lines.total > 24 ? 'w-1.5' : 'w-4'} ${cur ? 'bg-[#5fb4ff] shadow-[0_0_6px_#5fb4ff]' : done ? 'bg-[#1f6fe0]' : 'bg-[#cdd5df]'}`} />;
              })}
            </div>
            <span className="text-[11px] text-[#4d5866] num whitespace-nowrap">
              {lines.angles != null ? `${lines.angles} of ${lines.total} angles` : lines.current ? `Line ${lines.current} of ${lines.total}` : `${lines.done} of ${lines.total} lines`}
            </span>
          </div>
        )}

        {layer === 'OVERLAP' ? (
          <div className={`absolute left-3 bottom-3 sm:bottom-12 flex items-center gap-3 px-2.5 py-1.5 text-[11px] ${chip} pointer-events-none max-sm:gap-2 max-sm:text-[10px]`}>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#2eb85c]" />{GOOD_VIEWS}+ photos</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f29e1f]" />2–{GOOD_VIEWS - 1}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#e63333]" />1</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1a1d24]" />not yet</span>
          </div>
        ) : null}
      </>}
    </div>
  );
};

const PHASE_WORD: Partial<Record<Phase, string>> = { TAKEOFF: 'taking off', TRANSIT: 'to the next line', RETURNING: 'returning home', LANDING: 'landing', PAUSED: 'holding', HELD: 'holding', SWAP: 'battery swap' };
