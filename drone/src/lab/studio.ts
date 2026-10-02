import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildDrone, buildEmber, droneMaterials, emberMaterials, radialTexture } from '../components/hero/droneModel';

/**
 * Airframe studio: one aircraft close up under the Overview hero's lights, for
 * judging detail. Query: m (classic | ember), az / el (camera azimuth and
 * elevation, radians), d (distance), spin (prop speed, rad/s; 0 shows the blades).
 * window.__ready is set once the frame is drawn; window.__stats then holds the
 * build time, mesh count and triangles by material.
 */
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const look = q.get('m') === 'ember' ? 'ember' : 'classic';
const az = num('az', -0.65), el = num('el', 0.28), dist = num('d', 2.6), spin = num('spin', 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x06080c, 0.55));
const key = new THREE.DirectionalLight(0xfff1e0, 1.35); key.position.set(-9, 14, 12); scene.add(key);
const fill = new THREE.DirectionalLight(0xdbe6ff, 0.45); fill.position.set(10, 3, 14); scene.add(fill);
const rim = new THREE.DirectionalLight(0x8fc0ff, 2.2); rim.position.set(2, 9, -16); scene.add(rim);
const under = new THREE.DirectionalLight(0x3d6fd6, 0.5); under.position.set(0, -10, 4); scene.add(under);

const mats = look === 'ember' ? emberMaterials() : droneMaterials();
const t0 = performance.now();
const { group, props, blur } = look === 'ember' ? buildEmber(mats, radialTexture()) : buildDrone(mats, radialTexture());
const buildMs = performance.now() - t0;
scene.add(group);
const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
cam.position.set(c.x + dist * Math.cos(el) * Math.cos(az), c.y + dist * Math.sin(el), c.z + dist * Math.cos(el) * Math.sin(az));
cam.lookAt(c);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.5, 1.0));
composer.addPass(new OutputPass());
composer.addPass(new SMAAPass());

const fast = spin > 20;
for (const b of blur) b.visible = fast;
props.forEach((p, i) => { p.rotation.y = i * 0.7; });
let last = performance.now(), frames = 0;
const tick = (t: number) => {
  const dt = Math.max(0, Math.min(0.05, (t - last) / 1000)); last = t;
  props.forEach((p, i) => { p.rotation.y += dt * spin * (i % 2 ? -1 : 1); });
  composer.render();
  if (++frames === 3) {
    let meshes = 0, tris = 0; const byMat: Record<string, number> = {};
    const names = new Map(Object.entries(mats).map(([k, v]) => [v, k]));
    group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; tris += n; const k = names.get(m.material as THREE.Material) ?? 'other'; byMat[k] = (byMat[k] ?? 0) + Math.round(n); } });
    Object.assign(window, { __ready: true, __stats: { buildMs: Math.round(buildMs), meshes, tris: Math.round(tris), byMat } });
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
