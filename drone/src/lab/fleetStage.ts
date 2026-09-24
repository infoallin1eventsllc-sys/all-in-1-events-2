import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { droneMaterials, radialTexture } from '../components/hero/droneModel';
import { VARIANTS, variantMaterials, type Airframe } from '../components/hero/droneVariants';

/**
 * Fleet lab: one airframe from droneVariants.ts in a cinematic shot, lit and
 * graded exactly like the Overview hero (same sky, haze, beams, key, rim and
 * kicker lights, ACES, depth of field, bloom, SMAA).
 *
 *   lab/fleet.html?v=cinema             plays the shot in real time
 *   lab/fleet.html?v=vtol&capture&w=..  waits for window.__shot(t), which renders
 *                                       the shot at time t and returns a PNG
 *
 * Every motion is a function of t, so captured frames are exact and a clip
 * encoded from them plays smoothly whatever the render speed.
 */

type V3 = [number, number, number];

interface Shot {
  size: number;                       // hero airframe's widest horizontal extent, world units
  yaw: number;                        // hero heading
  orbit: [number, number];            // camera azimuth from, to (radians about the target)
  dist: number; lift: number; fov: number;
  target: V3;
  companions: { at: V3; size: number; yaw: number }[];
  still: number;                      // time of the still frame
  aperture: number;
}

const SHOTS: Record<string, Shot> = {
  cinema: { size: 3.6, yaw: -0.62, orbit: [-0.62, -0.18], dist: 6.6, lift: 1.1, fov: 32, target: [0, -0.2, 0], still: 3.4, aperture: 0.00022,
    companions: [{ at: [-6.5, 1.4, -10], size: 3.4, yaw: -0.3 }, { at: [8, -0.4, -15], size: 3.4, yaw: -0.9 }] },
  fpv: { size: 2.4, yaw: -0.5, orbit: [-0.35, 0.25], dist: 5.0, lift: 1.9, fov: 34, target: [0, 0, 0], still: 1.6, aperture: 0.00026,
    companions: [{ at: [3.6, -1.3, -6.5], size: 2.2, yaw: -0.9 }] },
  enterprise: { size: 3.8, yaw: -0.75, orbit: [0.3, -0.08], dist: 7.8, lift: -0.2, fov: 32, target: [0, -0.1, 0], still: 3.0, aperture: 0.0002,
    companions: [{ at: [-7.5, 1.8, -12], size: 3.6, yaw: -0.4 }] },
  show: { size: 2.3, yaw: -0.5, orbit: [-0.28, 0.12], dist: 5.6, lift: -1.55, fov: 36, target: [0, 0.2, 0], still: 2.2, aperture: 0.00028, companions: [] },
  vtol: { size: 4.4, yaw: 0, orbit: [0.62, 0.3], dist: 8.0, lift: 3.1, fov: 32, target: [-0.4, 0, 0], still: 3.2, aperture: 0.0002,
    companions: [{ at: [-5.2, 0.7, -4.2], size: 4.4, yaw: 0 }, { at: [-10.4, 1.4, -8.4], size: 4.4, yaw: 0 }] },
  orange: { size: 3.6, yaw: -Math.PI / 2, orbit: [-0.1, 0.1], dist: 6.2, lift: 1.25, fov: 32, target: [0, -0.1, 0], still: 3.0, aperture: 0.00012, companions: [] },
  cargo: { size: 3.9, yaw: -0.6, orbit: [-0.42, -0.02], dist: 8.8, lift: 0.5, fov: 32, target: [0, -0.9, 0], still: 3.0, aperture: 0.0002,
    companions: [{ at: [8.5, 1.6, -15], size: 3.6, yaw: -0.8 }] },
};
const DURATION = 6;

const q = new URLSearchParams(location.search);
const id = SHOTS[q.get('v') ?? ''] ? q.get('v')! : 'cinema';
const shot = SHOTS[id];
const capture = q.has('capture');
const W = Number(q.get('w') ?? (capture ? 1280 : innerWidth)), H = Number(q.get('h') ?? (capture ? 720 : innerHeight));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(capture ? 1 : Math.min(2, devicePixelRatio));
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.Fog(0x05070c, 14, 52);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const cam = new THREE.PerspectiveCamera(shot.fov, W / H, 0.1, 1500);
scene.add(cam);

// The hero's backdrop, carried by the camera so it stays behind every angle.
const back = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), new THREE.ShaderMaterial({
  fog: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec2 vUv; void main(){ float d = distance((vUv - 0.5) * vec2(1.0, 0.78) + 0.5, vec2(0.54, 0.56)); vec3 c = mix(vec3(0.014, 0.024, 0.06), vec3(0.0016, 0.002, 0.0038), smoothstep(0.02, 0.3, d)); gl_FragColor = vec4(c, 1.0); }',
}));
back.position.z = -300; cam.add(back);

// The hero's lighting rig.
scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x06080c, 0.55));
const key = new THREE.DirectionalLight(0xfff1e0, 1.35); key.position.set(-9, 14, 12); scene.add(key);
const fill = new THREE.DirectionalLight(0xdbe6ff, 0.45); fill.position.set(10, 3, 14); scene.add(fill);
const rim = new THREE.DirectionalLight(0x8fc0ff, 2.2); rim.position.set(2, 9, -16); scene.add(rim);
const under = new THREE.DirectionalLight(0x3d6fd6, 0.5); under.position.set(0, -10, 4); scene.add(under);
const kicker = new THREE.PointLight(0xffffff, 9, 30, 1.8); scene.add(kicker);

// Volumetric beams in the haze.
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { tint: { value: new THREE.Color(0.32, 0.5, 1.0) }, k: { value: 0.055 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 tint; uniform float k; varying vec2 vUv; void main(){ float x = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x); float y = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y); gl_FragColor = vec4(tint * x * y * k * (0.6 + 0.4 * vUv.x), 1.0); }',
});
const beams = ([[-14, -22, 0.55, 9], [-6, -30, 0.42, 6], [12, -34, -0.35, 7], [22, -26, -0.5, 8]] as const).map(([x, z, rz, w]) => {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 70), beamMat); b.position.set(x, 14, z); b.rotation.z = rz; scene.add(b); return { b, rz };
});

// Haze motes: faint specks drifting in the air, so depth and motion read.
const dot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const MOTES = 1400, BOX = { x: 44, y: 22, z: 50 };
const moteBase = new Float32Array(MOTES * 3), moteVel = new Float32Array(MOTES * 3);
const rand = (() => { let a = 99; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const flow = id === 'vtol' ? -7.5 : id === 'fpv' ? -1.2 : 0;           // the air streams past the fast ones
for (let i = 0; i < MOTES; i++) {
  moteBase.set([(rand() - 0.5) * BOX.x, (rand() - 0.4) * BOX.y, (rand() - 0.7) * BOX.z], i * 3);
  moteVel.set([flow + (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.2], i * 3);
}
const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: dot, size: 0.07, sizeAttenuation: true, color: 0x9fb6e8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
motes.frustumCulled = false; scene.add(motes);
const wrap = (v: number, span: number) => ((v % span) + span * 1.5) % span - span / 2;

// Airframes.
const M = { ...droneMaterials(), ...variantMaterials() };
const blurTex = radialTexture();
const variant = VARIANTS.find(v => v.id === id)!;

interface Craft { holder: THREE.Group; air: Airframe; phase: number; nav: THREE.Mesh[]; beam?: THREE.Mesh }

function place(size: number, yaw: number, at: V3, phase: number): Craft {
  const air = variant.build(M, blurTex);
  const box = new THREE.Box3().setFromObject(air.group), dims = box.getSize(new THREE.Vector3());
  const s = size / Math.max(dims.x, dims.z);
  air.group.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  air.group.position.set(-c.x, -c.y * (id === 'cargo' ? 0 : 1), -c.z);
  const holder = new THREE.Group(); holder.add(air.group); holder.position.set(...at); holder.rotation.y = yaw; scene.add(holder);
  // Own copies of the flashing materials, so each aircraft keeps its own beat.
  const nav: THREE.Mesh[] = [];
  air.group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.material === M.ledGreen || m.material === M.ledRed || m.material === M.strobe) { m.material = (m.material as THREE.Material).clone(); (m.material as THREE.MeshBasicMaterial).transparent = true; nav.push(m); }
  });
  if (air.show) air.show = air.show.map(mat => { const c2 = mat.clone(); air.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.material === mat) m.material = c2; }); return c2; });
  const craft: Craft = { holder, air, phase, nav };
  if (air.parts.spot) craft.beam = searchBeam(air.parts.spot);
  return craft;
}

/** A soft additive cone from the searchlight's lens, brightest at the lens, fading into the haze. */
function searchBeam(spot: THREE.Object3D) {
  const len = 5, geo = new THREE.ConeGeometry(0.95, len, 48, 1, true).rotateZ(Math.PI / 2).translate(len / 2 + 0.085, 0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { tint: { value: new THREE.Color(1.0, 0.94, 0.82) }, k: { value: 0.15 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 tint; uniform float k; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float face = abs(dot(normalize(vN), normalize(vV))); float along = pow(vUv.y, 2.6); gl_FragColor = vec4(tint * k * along * pow(face, 3.0), 1.0); }',
  });
  const cone = new THREE.Mesh(geo, mat); spot.add(cone); return cone;
}

const crafts: Craft[] = [place(shot.size, shot.yaw, [0, 0, 0], 0.4)];
shot.companions.forEach((c, i) => crafts.push(place(c.size, c.yaw, c.at, 1.7 + i * 2.1)));

// The light show: a formation behind the hero, colour sweeping through it in waves.
if (id === 'show') {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
    const x = (c - 4) * 2.3 + (r % 2) * 1.15, y = -1.4 + r * 2.1, z = -9 - Math.abs(c - 4) * 0.8 - r * 1.2;
    crafts.push(place(1.3, -0.5 + (rand() - 0.5) * 0.4, [x, y, z], rand() * 6));
  }
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const bokeh = new BokehPass(scene, cam, { focus: shot.dist, aperture: shot.aperture, maxblur: 0.004 });
composer.addPass(bokeh);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.34, 0.5, 1.0));
composer.addPass(new OutputPass());
composer.addPass(new SMAAPass());
composer.setSize(W, H);

const smooth = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
const showColor = (h: number, out: THREE.Color) => out.setHSL(h, 1, 0.55);
const tmpC = new THREE.Color();

function frame(t: number) {
  crafts.forEach((c, i) => {
    const p = c.phase, h = c.holder;
    // Hover: station-keeping wander plus the fine bob, and the lean that goes with it.
    const ox = Math.sin(t * 0.53 + p) * 0.09 + Math.sin(t * 1.31 + p * 2) * 0.025;
    const oy = Math.sin(t * 0.9 + p) * 0.07 + Math.sin(t * 1.7 + p) * 0.02;
    const oz = Math.sin(t * 0.41 + p * 3) * 0.08;
    const vx = Math.cos(t * 0.53 + p) * 0.048 + Math.cos(t * 1.31 + p * 2) * 0.033, vz = Math.cos(t * 0.41 + p * 3) * 0.033;
    const base = i === 0 ? [0, 0, 0] : id === 'show' ? null : shot.companions[i - 1]?.at;
    const at = base ?? [h.userData.x ?? (h.userData.x = h.position.x), h.userData.y ?? (h.userData.y = h.position.y), h.userData.z ?? (h.userData.z = h.position.z)];
    let roll = -vx * 2.2, pitch = vz * 2.2, yawAdd = 0, px = at[0] + ox, py = at[1] + oy, pz = at[2] + oz;
    if (id === 'fpv') {
      // A carving line with a quick roll flip in the middle of the clip.
      const cx = Math.sin(t * 0.55 + p) * 1.1, cz = Math.sin(t * 0.8 + p) * 0.5;
      px += cx; pz += cz; py += Math.sin(t * 0.7 + p) * 0.25;
      roll = -Math.cos(t * 0.55 + p) * 0.22 - Math.PI * 2 * smooth((t - 2.9 - i * 0.6) / 0.7);
      pitch = -0.16 + Math.cos(t * 0.8 + p) * 0.06; yawAdd = Math.sin(t * 0.55 + p) * 0.35;
    }
    if (id === 'vtol') { roll = Math.sin(t * 0.45 + p) * 0.06; pitch = 0.035 + Math.sin(t * 0.6 + p) * 0.015; py += Math.sin(t * 0.5 + p) * 0.12; }
    h.position.set(px, py, pz);
    h.rotation.set(0, 0, 0);
    h.rotateY((i === 0 ? shot.yaw : (shot.companions[i - 1]?.yaw ?? h.userData.yaw ?? (h.userData.yaw = h.rotation.y))) + yawAdd);
    h.rotateZ(pitch); h.rotateX(roll);
    // Props: fast and never in step; parked lift rotors stay still in cruise.
    c.air.props.forEach((pr, k) => {
      const parked = pr.userData.parked === true;
      pr.rotation.y = parked ? 0 : t * (51 + k * 3.7 + i) * (k % 2 ? -1 : 1) + k;
      c.air.blur[k].visible = !parked;
    });
    // Nav lights and strobes: the aviation beat, offset per aircraft.
    const flash = ((t * 1.0 + p) % 1) < 0.1;
    c.nav.forEach(m => { (m.material as THREE.MeshBasicMaterial).opacity = flash ? 1 : m.material === M.strobe ? 0.04 : 0.2; });
    if (c.air.show) {
      const hue = 0.8 + 0.34 * Math.sin(t * 0.7 - h.position.x * 0.22 + h.position.y * 0.15);
      showColor(((hue % 1) + 1) % 1, tmpC);
      c.air.show.forEach(mat => mat.emissive.copy(tmpC));
    }
    if (c.air.parts.sling) { c.air.parts.sling.rotation.set(Math.sin(t * 1.05 + p) * 0.05, 0, Math.sin(t * 0.82 + p) * 0.07 - vx * 0.4); }
    if (c.air.parts.payload) c.air.parts.payload.rotation.z = -0.3 + Math.sin(t * 0.5 + p) * 0.08;
    if (c.air.parts.spot) { c.air.parts.spot.rotation.z = -0.62 + Math.sin(t * 0.42 + p) * 0.07; c.air.parts.spot.rotation.y = Math.sin(t * 0.33 + p) * 0.12; }
  });

  const u = smooth(t / DURATION);
  // Camera: a slow orbit round the target with a gentle push-in and a breath of drift.
  const az = shot.orbit[0] + (shot.orbit[1] - shot.orbit[0]) * u, d = shot.dist * (1 - 0.07 * u);
  const tg = new THREE.Vector3(...shot.target);
  if (id === 'fpv') tg.add(crafts[0].holder.position);           // the fast one: the camera keeps it framed
  cam.position.set(tg.x + Math.sin(az) * d, tg.y + shot.lift + Math.sin(t * 0.37) * 0.06, tg.z + Math.cos(az) * d);
  cam.lookAt(tg.x, tg.y + Math.sin(t * 0.23) * 0.03, tg.z);
  // The kicker follows the camera's side of the subject but keeps the hero's distance (about 14), so highlights stay small and sharp.
  kicker.position.copy(cam.position).sub(tg).setLength(14).add(tg).add(new THREE.Vector3(3, 5, 1));
  beams.forEach(({ b, rz }, k) => { b.rotation.z = rz + Math.sin(t * 0.08 + k) * 0.05; });

  const pos = moteGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < MOTES; i++) {
    pos.setXYZ(i, wrap(moteBase[i * 3] + moteVel[i * 3] * t, BOX.x), moteBase[i * 3 + 1] + moteVel[i * 3 + 1] * t, moteBase[i * 3 + 2] + moteVel[i * 3 + 2] * t);
  }
  pos.needsUpdate = true;

  (bokeh.uniforms as { focus: { value: number } }).focus.value = cam.position.distanceTo(crafts[0].holder.position);
  composer.render();
}

declare global { interface Window { __shot?: (t: number) => string; __still?: number; __duration?: number; __ready?: boolean } }

if (capture) {
  window.__shot = (t: number) => { frame(t); return renderer.domElement.toDataURL('image/png'); };
  window.__still = shot.still; window.__duration = DURATION; window.__ready = true;
  (window as unknown as { __mats: typeof M }).__mats = M;          // lets a capture script isolate a material while tuning
} else {
  const t0 = performance.now();
  const loop = (now: number) => { frame(((now - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
}
