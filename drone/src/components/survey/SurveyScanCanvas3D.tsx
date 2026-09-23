import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RotateCcw } from 'lucide-react';
import { SITE, TREES, WORLD_M, heightAt, siteImagery, structureAt } from '../../survey/site';
import { GOOD_VIEWS, type CoverageGrid, type Leg, type SurveyPlan } from '../../survey/plan';
import type { Photo, SurveyAircraft, Phase } from '../../hooks/useSurveyMission';

/**
 * The survey stage: the venue being scanned, in 3D.
 *
 * Ground no photo has seen yet is drawn as a survey blueprint — a 25 m grid and
 * 2 m height contours on dark slate — and develops into the finished map as the
 * aircraft photographs it, with a warm glow on fresh ground. Under the aircraft,
 * the camera footprint sweeps with scan lines and a radar ring pulses outward.
 * The Overlap layer recolours the ground by how many photos see each point.
 *
 * All of it is a preview of coverage, not a reconstruction: the real orthomosaic
 * and 3D model are built afterwards from the photos (see Deliverables).
 *
 * The terrain is one shader: blueprint, map, overlap heat, scan effects and fog
 * are computed per pixel from a few per-vertex attributes updated ~8 Hz, so the
 * frame loop stays cheap.
 */

export type SurveyLayer = 'MODEL' | 'OVERLAP';
type View = 'OVERVIEW' | 'TOP' | 'FOLLOW';

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
const ACCENT = new THREE.Color('#fb923c');
const HOT = (k: number) => ACCENT.clone().multiplyScalar(k); // >1 = blooms
const FOG = new THREE.Color('#0b0e16');
const FOG_DENSITY = 0.00105;
const VIEWS: Record<Exclude<View, 'FOLLOW'>, { radius: number; theta: number; phi: number }> = {
  OVERVIEW: { radius: 600, theta: Math.PI * 0.62, phi: 0.92 },
  TOP: { radius: 720, theta: Math.PI / 2, phi: 0.02 },
};

function skyTexture(): THREE.CanvasTexture {
  // Dusk: deep navy overhead, a warm band on the horizon (the AERION haze), dark below.
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

  // Anti-aliased line every step units along v.
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
    bp += photo * 0.045;                                   // a ghost of the site, so it reads

    vec3 col;
    if (uMode < 0.5) {
      vec3 mapped = photo * shade * 1.05;
      col = mix(bp, mapped, smoothstep(0.0, 1.0, vCov));
    } else {
      // Heat tint over the photo so the site stays readable under the overlap colours.
      vec3 tinted = mix(photo * shade * 0.8, vHeat * shade, 0.62);
      col = mix(bp, tinted, vInside * 0.94);
    }
    col *= mix(0.62, 1.0, vInside);                        // the venue stands out from the land around it

    col += uAccent * vFlash * vFlash * 1.1;                // freshly photographed ground glows, then settles to the photo

    if (uAcOn > 0.5) {
      // Camera footprint in the flight direction, with moving scan lines.
      vec2 d = vWorld.xz - uFpC;
      vec2 u = vec2(dot(d, uFpDir), dot(d, vec2(-uFpDir.y, uFpDir.x)));
      vec2 q = abs(u) - uFpHalf; float m = max(q.x, q.y);
      float inside = step(m, 0.0);
      float edge = 1.0 - smoothstep(0.0, 1.6, abs(m));
      float scan = pow(0.5 + 0.5 * sin(u.x * 0.55 - uTime * 7.0), 6.0);
      col += uAccent * (edge * mix(0.8, 2.6, uCapturing) + inside * (0.05 + scan * 0.22 * uCapturing + uShutter * 0.9));
      // Radar ring pulsing out from under the aircraft.
      float r = length(vWorld.xz - uAc); float R = mod(uTime * 45.0, 180.0);
      col += uAccent * (1.0 - smoothstep(0.0, 2.2, abs(r - R))) * (1.0 - R / 180.0) * 1.4 * uCapturing;
    }

    float dist = length(vWorld - cameraPosition);
    float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;

export const SurveyScanCanvas3D: React.FC<Props> = (props) => {
  const { layer, onLayerChange, coveredPct, progressLabel, compact, lines, phase } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('OVERVIEW');
  const propsRef = useRef(props); propsRef.current = props;
  const viewRef = useRef<View>(view); viewRef.current = view;
  const goal = useRef({ ...VIEWS.OVERVIEW, target: new THREE.Vector3(0, 0, 0) });
  const now = useRef({ ...VIEWS.OVERVIEW, target: new THREE.Vector3(0, 0, 0) });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastInput = useRef(performance.now());

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const w = host.clientWidth || 900, h = host.clientHeight || 520;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.innerHTML = ''; host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG, FOG_DENSITY);
    const camera = new THREE.PerspectiveCamera(38, w / h, 1, 5000);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })));
    // Faint stars in the upper sky.
    {
      const n = 700, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 0.8); sp.set([2200 * Math.sin(ph) * Math.cos(th), 2200 * Math.cos(ph), 2200 * Math.sin(ph) * Math.sin(th)], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaab8d6, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false })));
    }
    scene.add(new THREE.HemisphereLight(0x9fb4dc, 0x2a2118, 1.4));
    const sun = new THREE.DirectionalLight(0xffc48a, 2.8); sun.position.set(-500, 260, -180); scene.add(sun); // low warm sun from the west
    const fill = new THREE.DirectionalLight(0x6d8bd8, 0.5); fill.position.set(400, 300, 300); scene.add(fill);

    // ---- terrain ------------------------------------------------------------
    const geo = new THREE.PlaneGeometry(WORLD_M, WORLD_M, SEG, SEG);
    geo.rotateX(-Math.PI / 2); // plane now in XZ; world z = map y (south)
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
    // Soften the boundary edge of the "inside" mask so the venue doesn't end in stair-steps.
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
        if (v > 0 && lastViews[i] === 0) aFlash[i] = 1; // first photo only; overlap passes don't re-light it
        lastViews[i] = v;
        if (aFlash[i] > 0) aFlash[i] = Math.max(0, aFlash[i] - dt * 1.4);
        // Coverage eases in, so developed ground fades up rather than popping.
        aCov[i] += ((v > 0 ? 1 : 0) - aCov[i]) * Math.min(1, dt * 5);
        if (mode === 'OVERLAP') { heat(v, col); aHeat[i * 3] = col.r; aHeat[i * 3 + 1] = col.g; aHeat[i * 3 + 2] = col.b; }
      }
      geo.attributes.aCov.needsUpdate = true; geo.attributes.aFlash.needsUpdate = true;
      if (mode === 'OVERLAP') geo.attributes.aHeat.needsUpdate = true;
      uniforms.uMode.value = mode === 'OVERLAP' ? 1 : 0;
      lastLayer = mode;
    };

    // ---- venue structures: blueprint outlines until photographed, then solid ----
    const structs: { mat: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial; roof: THREE.Color; x: number; y: number }[] = [];
    const blueprint = new THREE.Color('#1c2536'), edgeBlue = new THREE.Color('#5b8def');
    const addStructure = (geom: THREE.BufferGeometry, x: number, y: number, z: number, roof: THREE.Color, rotY = 0) => {
      const mat = new THREE.MeshStandardMaterial({ color: blueprint.clone(), roughness: 0.75, metalness: 0.05 });
      const mesh = new THREE.Mesh(geom, mat); mesh.position.set(x, y, z); mesh.rotation.y = rotY; scene.add(mesh);
      const edge = new THREE.LineBasicMaterial({ color: edgeBlue.clone().multiplyScalar(1.6), transparent: true, opacity: 0.85 });
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), edge); e.position.copy(mesh.position); e.rotation.y = rotY; scene.add(e);
      structs.push({ mat, edge, roof, x, y: z });
    };
    for (const st of SITE.structures) {
      const roof = new THREE.Color(st.roof);
      const gy = heightAt(st.x, st.y);
      if (st.kind === 'tent') addStructure(new THREE.ConeGeometry(st.w * 0.72, st.h, 4, 1), st.x, gy + st.h / 2, st.y, roof, Math.PI / 4);
      else addStructure(new THREE.BoxGeometry(st.w, st.h, st.d), st.x, gy + st.h / 2, st.y, roof);
      if (st.kind === 'stage') {
        // Roof slab on four truss legs, overhanging the deck.
        addStructure(new THREE.BoxGeometry(st.w + 6, 1.2, st.d + 4), st.x, gy + st.h + 3.6, st.y, roof);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addStructure(new THREE.BoxGeometry(0.9, st.h + 3, 0.9), st.x + dx * (st.w / 2 + 2), gy + (st.h + 3) / 2, st.y + dz * (st.d / 2 + 1.5), new THREE.Color('#6b7280'));
      }
    }
    // Trees: instanced, with a little colour variety.
    const treeGeo = new THREE.ConeGeometry(1, 2.6, 7); treeGeo.translate(0, 1.3, 0);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), TREES.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
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
    const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bpts), new THREE.LineDashedMaterial({ color: HOT(1.9), dashSize: 9, gapSize: 5 }));
    boundary.computeLineDistances(); scene.add(boundary);
    const glow = glowSprite();
    const pylonMat = new THREE.LineBasicMaterial({ color: HOT(1.2), transparent: true, opacity: 0.8 });
    for (const c of SITE.boundary) {
      const gy = heightAt(c.x, c.y);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x, gy, c.y), new THREE.Vector3(c.x, gy + 16, c.y)]), pylonMat));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: HOT(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(c.x, gy + 16, c.y); s.scale.setScalar(7); scene.add(s);
    }

    // Home pad: lit ring.
    const hy = heightAt(SITE.home.x, SITE.home.y) + 0.3;
    const pad = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(SITE.home.x, hy, SITE.home.y); scene.add(pad);
    const padFill = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    padFill.rotation.x = -Math.PI / 2; padFill.position.set(SITE.home.x, hy + 0.05, SITE.home.y); scene.add(padFill);

    // ---- flight path: planned lines faint, flown lines glowing ------------------
    const pathPlanned = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc8d4ec, transparent: true, opacity: 0.16, depthWrite: false }));
    const pathFlown = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: HOT(2.2) }));
    scene.add(pathPlanned, pathFlown);
    let pathKey = '';
    const rebuildPath = (legs: Leg[], idx: number, prog: number, alt: number, acx: number, acy: number) => {
      const key = `${legs.length}:${idx}:${alt}:${Math.round(prog / 6)}`;
      if (key === pathKey) return; pathKey = key;
      const flown: THREE.Vector3[] = [], planned: THREE.Vector3[] = [];
      legs.forEach((g, i) => {
        if (!g.capture) return; // transits aren't mapped lines
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
    scene.add(new THREE.Points(phGeo, new THREE.PointsMaterial({ size: 5, map: glow, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    let shown = 0;

    // ---- aircraft -------------------------------------------------------------------
    const ac = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.35, metalness: 0.2 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6, metalness: 0.3 });
    ac.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 1.3), shell));
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell); hump.scale.set(1, 0.55, 1.45); hump.position.y = 0.12; ac.add(hump);
    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), carbon); gimbal.position.set(0, -0.24, -0.5); ac.add(gimbal);
    const rotors: THREE.Mesh[] = [];
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.25, 8), carbon);
      arm.rotation.z = Math.PI / 2; arm.rotation.y = Math.atan2(-dz, dx); arm.position.set(dx * 0.5, 0.02, dz * 0.5); ac.add(arm);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 12), carbon); motor.position.set(dx * 0.95, 0.08, dz * 0.95); ac.add(motor);
      const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
      rotor.rotation.x = -Math.PI / 2; rotor.position.set(dx * 0.95, 0.17, dz * 0.95); ac.add(rotor); rotors.push(rotor);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), carbon); leg.position.set(dx * 0.32, -0.3, dz * 0.4); ac.add(leg);
    }
    // Navigation lights: red port, green starboard, white strobe on top.
    const lamp = (c: THREE.Color, x: number, y: number, z: number) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); s.scale.setScalar(0.45); ac.add(s); return s; };
    lamp(new THREE.Color(3, 0.2, 0.15), -1.05, 0.1, -0.95); lamp(new THREE.Color(0.2, 3, 0.4), 1.05, 0.1, -0.95);
    const strobe = lamp(new THREE.Color(4, 4, 4), 0, 0.35, 0.2);
    ac.scale.setScalar(AC_SCALE); scene.add(ac);

    // Per-frame overlays reuse fixed buffers: no allocation in the render loop.
    const buf = (points: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3).setUsage(THREE.DynamicDrawUsage)); return g; };
    const setPts = (obj: THREE.Object3D & { geometry: THREE.BufferGeometry }, pts: THREE.Vector3[]) => {
      const attr = obj.geometry.attributes.position as THREE.BufferAttribute;
      pts.forEach((v, i) => attr.setXYZ(i, v.x, v.y, v.z)); attr.needsUpdate = true; obj.geometry.computeBoundingSphere();
    };
    const tetherLine = new THREE.Line(buf(2), new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 1.2, gapSize: 1.6 }));
    scene.add(tetherLine);
    // Scan cone: translucent pyramid from the camera to the footprint, brighter at the apex.
    const coneGeo = buf(12);
    const coneCol = new Float32Array(12 * 3);
    const c0 = ACCENT.clone().multiplyScalar(0.55), c1 = ACCENT.clone().multiplyScalar(0.06);
    for (let f = 0; f < 4; f++) coneCol.set([c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b], f * 9);
    coneGeo.setAttribute('color', new THREE.BufferAttribute(coneCol, 3));
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const coneEdges = new THREE.LineSegments(buf(8), new THREE.LineBasicMaterial({ color: HOT(1.4), transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(cone, coneEdges);
    let lastPhotoCount = 0, shutter = 0;

    // ---- post: bloom on the bright bits only ------------------------------------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.45, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

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

      paintAcc += dt;
      if (paintAcc > 0.12 || P.layer !== lastLayer) { paintTerrain(P.grid, P.layer, Math.min(0.5, paintAcc)); paintAcc = 0; }

      // Structures: blueprint until the ground under them is photographed, then their real colours.
      for (const s of structs) {
        const v = P.grid.viewsAt({ x: s.x, y: s.y });
        if (P.layer === 'OVERLAP') heat(v, col); else if (v > 0) col.copy(s.roof); else col.copy(blueprint);
        s.mat.color.lerp(col, 0.12);
        s.edge.opacity += ((v > 0 && P.layer === 'MODEL' ? 0.12 : 0.85) - s.edge.opacity) * 0.1;
      }

      // Aircraft
      ac.position.set(a.x, acY, a.y);
      ac.rotation.y = -(a.headingDeg * Math.PI) / 180;
      for (const r of rotors) r.rotation.z += dt * (flying ? 45 : 0);
      (strobe.material as THREE.SpriteMaterial).opacity = flying && (t % 1200) < 90 ? 1 : 0;
      setPts(tetherLine, [new THREE.Vector3(a.x, acY - 2, a.y), new THREE.Vector3(a.x, groundY, a.y)]); tetherLine.computeLineDistances();
      tetherLine.visible = flying;

      // Camera footprint (shader) + scan cone (geometry)
      const hRad = ((a.headingDeg - 90) * Math.PI) / 180; // compass → map angle
      const k = Math.max(0.2, a.altM / pl.params.altitudeM);
      const hx = (pl.footprint.alongM * k) / 2, hz = (pl.footprint.acrossM * k) / 2;
      let cx = a.x, cy = a.y;
      if (pl.params.pattern === 'ORBIT') { cx = pl.params.orbit.center.x; cy = pl.params.orbit.center.y; }
      else if (pl.gimbalPitchDeg > -85) { const off = a.altM * Math.tan(((90 + pl.gimbalPitchDeg) * Math.PI) / 180); cx += Math.cos(hRad) * off; cy += Math.sin(hRad) * off; }
      const ca = Math.cos(hRad), sa = Math.sin(hRad);
      uniforms.uAcOn.value = flying ? 1 : 0;
      uniforms.uAc.value.set(a.x, a.y); uniforms.uFpC.value.set(cx, cy); uniforms.uFpDir.value.set(ca, sa); uniforms.uFpHalf.value.set(hx, hz);
      uniforms.uCapturing.value += ((capturing ? 1 : 0.25) - uniforms.uCapturing.value) * 0.08;
      if (P.photoCount > lastPhotoCount) shutter = 1;
      lastPhotoCount = P.photoCount;
      shutter = Math.max(0, shutter - dt * 3.5);
      uniforms.uShutter.value = shutter;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = cx + u * hx * ca - v * hz * sa, y = cy + u * hx * sa + v * hz * ca; return new THREE.Vector3(x, heightAt(x, y) + 0.5, y); });
      const apex = new THREE.Vector3(a.x, acY - 1.8, a.y);
      setPts(cone, [0, 1, 2, 3].flatMap(i => [apex, corners[i], corners[(i + 1) % 4]]));
      setPts(coneEdges, corners.flatMap(c => [apex, c]));
      cone.visible = coneEdges.visible = flying;
      (cone.material as THREE.MeshBasicMaterial).opacity = capturing ? Math.min(1, 0.75 + shutter * 0.5) : 0.3;

      // Photos
      const photos = P.photosRef.current ?? [];
      if (photos.length < shown) shown = 0; // survey reset
      if (shown < photos.length) {
        for (; shown < Math.min(photos.length, PHOTO_CAP); shown++) {
          const ph = photos[shown];
          phPos[shown * 3] = ph.x; phPos[shown * 3 + 1] = heightAt(ph.x, ph.y) + ph.altM; phPos[shown * 3 + 2] = ph.y;
          if (ph.ok) phCol.set([1.6, 1.25, 0.9], shown * 3); else phCol.set([2.2, 0.25, 0.2], shown * 3);
        }
        phGeo.attributes.position.needsUpdate = true; phGeo.attributes.color.needsUpdate = true;
      }
      phGeo.setDrawRange(0, shown);

      rebuildPath(P.legs, P.legIndex, P.legProgressM, pl.params.altitudeM, a.x, a.y);

      // Camera: ease to the goal; a slow drift in Overview when nobody is touching it.
      const g = goal.current, o = now.current;
      if (viewRef.current === 'FOLLOW') { g.target.set(a.x, acY * 0.5, a.y); g.radius = Math.min(g.radius, 260); }
      else if (viewRef.current === 'OVERVIEW' && !drag.current && performance.now() - lastInput.current > 8000) g.theta += dt * 0.025;
      o.radius += (g.radius - o.radius) * 0.07; o.theta += (g.theta - o.theta) * 0.08; o.phi += (g.phi - o.phi) * 0.07;
      o.target.lerp(g.target, 0.08);
      camera.position.set(o.target.x + o.radius * Math.sin(o.phi) * Math.cos(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * Math.sin(o.phi) * Math.sin(o.theta));
      camera.lookAt(tmpV.copy(o.target));

      // Screen-space labels
      place(tagRef.current, a.x, acY + 9, a.y);
      place(homeRef.current, SITE.home.x, hy + 6, SITE.home.y);

      composer.render();
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); composer.setSize(cw, ch); bloom.setSize(cw, ch);
    });
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse(obj => {
        const m = obj as THREE.Mesh; m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
      });
      ortho.dispose(); glow.dispose(); composer.dispose(); renderer.dispose();
    };
  }, []);

  const applyView = (v: View) => {
    setView(v); lastInput.current = performance.now();
    if (v === 'FOLLOW') { goal.current.radius = 220; goal.current.phi = 1.05; return; }
    goal.current = { ...VIEWS[v], target: new THREE.Vector3(0, 0, 0) };
  };
  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; lastInput.current = performance.now(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY };
    lastInput.current = performance.now();
    goal.current.theta += dx * 0.005; goal.current.phi = Math.max(0.02, Math.min(1.45, goal.current.phi - dy * 0.005));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => { lastInput.current = performance.now(); goal.current.radius = Math.max(90, Math.min(1100, goal.current.radius * (1 + e.deltaY * 0.001))); };

  const a = props.aircraft;
  const chip = 'rounded-lg bg-black/55 backdrop-blur';
  const flying = a.altM > 0.3;
  const stageLabel = structureAt(SITE.orbitTarget)?.label;
  return (
    <div id="survey-stage" className="relative w-full h-full bg-imagery select-none overflow-hidden">
      <div ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing" role="img" aria-label={`3D view of ${SITE.name}, ${coveredPct.toFixed(0)}% photographed`} />

      {/* Labels that follow the scene */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={tagRef} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <div className={`-translate-x-1/2 -translate-y-full whitespace-nowrap ${compact ? 'hidden' : ''}`}>
            <div className="rounded-md border border-[#fb923c]/50 bg-black/70 px-2 py-1 text-[10px] leading-tight text-white shadow-[0_0_18px_rgba(251,146,60,0.35)]">
              <div className="font-semibold tracking-wide">MAP-1 {phase === 'CAPTURING' && <span className="ml-1 text-[#fdba74]">● REC</span>}</div>
              <div className="num text-white/70">{flying ? `${a.altM.toFixed(0)} m · ${a.speedMps.toFixed(1)} m/s · ${a.battery.toFixed(0)}%` : 'On the pad'}</div>
            </div>
            <div className="mx-auto h-3 w-px bg-[#fb923c]/70" />
          </div>
        </div>
        <div ref={homeRef} className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <span className={`-translate-x-1/2 -translate-y-full inline-block rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#111827] ${compact ? 'hidden' : ''}`}>HOME</span>
        </div>
      </div>

      {!compact && <>
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <span className={`${chip} px-2.5 py-1 text-[12px] font-medium text-white hidden sm:inline`}>{SITE.name}</span>
        <span className={`${chip} px-2.5 py-1 text-[11px] text-white/80 num`}>{progressLabel}</span>
        {props.plan.params.pattern === 'ORBIT' && stageLabel && <span className={`${chip} px-2.5 py-1 text-[11px] text-[#fdba74] hidden md:inline`}>Target · {stageLabel}</span>}
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div role="group" aria-label="Layer" className={`inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
          {([['MODEL', 'Map', 'The venue as the finished map will show it'], ['OVERLAP', 'Overlap', 'How many photos see each point: green is enough for a reliable model']] as [SurveyLayer, string, string][]).map(([id, label, title]) => (
            <button key={id} type="button" title={title} aria-pressed={layer === id} onClick={() => onLayerChange(id)}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${layer === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Camera" className={`hidden sm:inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
          {([['OVERVIEW', 'Overview'], ['TOP', 'Top-down'], ['FOLLOW', 'Follow']] as [View, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => applyView(id)}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${view === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => applyView(view)}
          className={`inline-flex items-center justify-center w-7 h-7 text-white/65 hover:text-white transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${chip}`}><RotateCcw /></button>
      </div>

      {/* Flight-line progress strip */}
      {lines && lines.total > 0 && (
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-2.5 px-3 py-1.5 ${chip} pointer-events-none`}>
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
        <div className={`absolute bottom-3 left-3 flex items-center gap-3 px-2.5 py-1.5 text-[11px] text-white/80 ${chip} pointer-events-none max-sm:gap-2 max-sm:text-[10px]`}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#2eb85c]" />{GOOD_VIEWS}+ photos</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f29e1f]" />2–{GOOD_VIEWS - 1}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#e63333]" />1</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1a1d24] border border-white/20" />not yet</span>
        </div>
      ) : (
        <div className="hidden xl:block absolute bottom-3 left-3 text-[10px] text-white/40 pointer-events-none max-w-[240px] leading-snug">Coverage preview — the finished map and 3D model are built from the photos after landing</div>
      )}
      </>}
    </div>
  );
};
