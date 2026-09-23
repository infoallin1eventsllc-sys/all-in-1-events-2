import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The Overview hero: a fleet of quadcopters in a dark, hazy sky, hovering with a
 * life of their own and re-forming as the visitor scrolls (scattered approach →
 * chevron → fan-out that clears the headline). Cinematic rather than technical:
 * anodised bodies under a key light and a blue rim light, LED tips that bloom,
 * propeller blur, thin light trails when the fleet moves, volumetric beams in
 * the haze, and a camera that pushes in and follows the pointer a little.
 *
 * Reduced motion: one still frame of the chevron, nothing moves. No WebGL: the
 * page's gradient stays and the copy stands on its own.
 */

type V3 = [number, number, number];

function seeded(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

/** Three formations the fleet moves through with scroll. */
function formations(n: number): [V3[], V3[], V3[]] {
  const r = seeded(11);
  const scattered: V3[] = [], chevron: V3[] = [], fan: V3[] = [];
  for (let i = 0; i < n; i++) {
    scattered.push([(r() - 0.5) * 30, -2.5 + r() * 8, -24 + Math.pow(r(), 1.15) * 36]);
    const k = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? -1 : 1;
    chevron.push([side * k * 2.8, 0.9 + k * 0.5, 3.5 - k * 2.3]);
    const a = -0.42 + (i / (n - 1)) * (Math.PI + 0.84);           // an arc round the headline
    fan.push([Math.cos(a) * 15, 1.4 + Math.sin(a) * 5.6, -8 + ((i * 7) % 5) * 2.8]);
  }
  return [scattered, chevron, fan];
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

interface Drone {
  group: THREE.Group;
  props: THREE.Group[];
  blur: THREE.Mesh[];
  trail: THREE.Line;
  history: THREE.Vector3[];
  prev: THREE.Vector3;
  phase: number;
  stagger: number;
  ledColor: THREE.Color;
  roll: number; pitch: number; yaw: number;
}

/**
 * A Mavic-class consumer quadcopter, built from primitives: white-and-graphite
 * two-tone shell with a seam line, folding carbon arms on hinge pivots, motor
 * housings with a brushed ring and vent slits, tapered two-blade propellers with
 * a blur disc, a three-axis gimbal on the nose cradling a blue-coated lens,
 * obstacle sensors, status LEDs, landing skids and micro-screws.
 * Local axes: +x forward, +y up, +z right. About 1.3 units nose to tail.
 */
function buildDrone(mats: Record<string, THREE.Material>, blurTex: THREE.Texture): { group: THREE.Group; props: THREE.Group[]; blur: THREE.Mesh[] } {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); g.add(mesh); return mesh;
  };
  // Shell: white upper, graphite lower, a dark seam between, a tapered nose and a battery hump at the tail.
  add(new RoundedBoxGeometry(0.92, 0.2, 0.4, 5, 0.08), mats.white, 0, 0.05, 0);
  add(new RoundedBoxGeometry(0.34, 0.16, 0.32, 4, 0.06), mats.white, 0.52, 0.01, 0);
  add(new RoundedBoxGeometry(0.9, 0.12, 0.42, 4, 0.05), mats.graphite, -0.02, -0.08, 0);
  add(new THREE.BoxGeometry(0.93, 0.008, 0.415), mats.seam, 0, -0.03, 0);
  add(new RoundedBoxGeometry(0.3, 0.1, 0.3, 4, 0.04), mats.graphite, -0.36, 0.14, 0);
  add(new RoundedBoxGeometry(0.16, 0.006, 0.07, 2, 0.003), mats.logo, -0.02, 0.152, 0);             // manufacturer mark
  for (const zz of [-0.215, 0.215]) for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.05, 0.004, 0.006), mats.seam, -0.18 - k * 0.07, -0.06, zz);  // vent slits
  for (const [x, z] of [[0.3, 0.14], [0.3, -0.14], [-0.3, 0.14], [-0.3, -0.14]]) add(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 8), mats.metal, x, -0.142, z);  // micro screws
  // Obstacle-avoidance sensors: two on the nose, two underneath.
  const sensorGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.01, 12);
  for (const zz of [-0.09, 0.09]) add(sensorGeo, mats.sensor, 0.69, 0.02, zz, 0, 0, Math.PI / 2);
  for (const zz of [-0.1, 0.1]) add(sensorGeo, mats.sensor, 0.12, -0.145, zz);
  // Arms: front pair swept forward and up, rear pair back and lower, each on a hinge pivot.
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.02, -0.024); bladeShape.quadraticCurveTo(0.2, -0.05, 0.38, -0.012); bladeShape.lineTo(0.38, 0.008); bladeShape.quadraticCurveTo(0.2, 0.042, 0.02, 0.024); bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.007, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.39, 40);
  const arms: [number, number, number, number, number, number][] = [
    [0.36, 0.0, 0.17, 0.66, 0.05, 0.55], [0.36, 0.0, -0.17, 0.66, 0.05, -0.55],
    [-0.34, -0.03, 0.18, -0.62, -0.07, 0.6], [-0.34, -0.03, -0.18, -0.62, -0.07, -0.6],
  ];
  arms.forEach(([hx, hy, hz, tx, ty, tz], k) => {
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16), mats.graphite, hx, hy, hz);                           // hinge pivot
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), mats.metal, hx, hy, hz);                                // pivot pin
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, len = Math.hypot(dx, dy, dz);
    const arm = add(new RoundedBoxGeometry(len + 0.06, 0.05, 0.062, 3, 0.02), mats.carbon, (hx + tx) / 2, (hy + ty) / 2, (hz + tz) / 2);
    arm.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)), 'YZX');
    add(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 20), mats.graphite, tx, ty + 0.05, tz);                       // motor housing
    add(new THREE.TorusGeometry(0.078, 0.008, 8, 28), mats.metal, tx, ty + 0.1, tz, Math.PI / 2);                   // brushed ring
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), mats.metal, tx, ty + 0.115, tz);                          // motor bell
    for (let v = 0; v < 4; v++) add(new THREE.BoxGeometry(0.03, 0.005, 0.005), mats.seam, tx + 0.06 * Math.cos(v * 1.57), ty + 0.03, tz + 0.06 * Math.sin(v * 1.57), 0, -v * 1.57, 0);
    if (k < 2) add(new RoundedBoxGeometry(0.028, 0.13, 0.028, 2, 0.008), mats.skid, tx - 0.02, ty - 0.06, tz);   // front landing skids
    // Status LEDs on the arm tips: white-ish forward, green and red aft.
    const led = add(new THREE.SphereGeometry(0.02, 10, 8), k < 2 ? mats.ledFront : k === 2 ? mats.ledGreen : mats.ledRed, tx + (k < 2 ? 0.04 : -0.04), ty - 0.01, tz + Math.sign(tz) * 0.05);
    void led;
    // Propeller: two tapered blades with a little pitch, and a blur disc.
    const prop = new THREE.Group(); prop.position.set(tx, ty + 0.135, tz);
    const b1 = new THREE.Mesh(bladeGeo, mats.blade); b1.rotation.x = 0.22;
    const b2 = new THREE.Mesh(bladeGeo, mats.blade); b2.rotation.set(0.22, Math.PI, 0);
    prop.add(b1, b2, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.02, 12), mats.graphite));
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: blurTex, color: 0x8c949e, transparent: true, opacity: 0.2, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004; prop.add(disc);
    g.add(prop); props.push(prop); blur.push(disc);
  });
  for (const zz of [-0.12, 0.12]) add(new RoundedBoxGeometry(0.03, 0.08, 0.03, 2, 0.008), mats.skid, -0.42, -0.17, zz);   // rear skids
  // Gimbal: dampers, roll motor, an articulated arm with pivot joints, the camera body and lens, tilted slightly down.
  add(new THREE.BoxGeometry(0.1, 0.05, 0.16), mats.graphite, 0.5, -0.135, 0);
  for (const zz of [-0.05, 0.05]) add(new THREE.SphereGeometry(0.014, 8, 6), mats.rubber, 0.52, -0.165, zz);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), mats.graphite, 0.58, -0.17, 0, 0, 0, Math.PI / 2);          // roll motor
  add(new THREE.SphereGeometry(0.018, 10, 8), mats.metal, 0.61, -0.17, 0);                                          // pivot joint
  add(new RoundedBoxGeometry(0.026, 0.1, 0.026, 2, 0.008), mats.graphite, 0.61, -0.22, 0.07);                       // arm down
  add(new RoundedBoxGeometry(0.026, 0.026, 0.09, 2, 0.008), mats.graphite, 0.61, -0.265, 0.035);                    // arm across
  add(new THREE.SphereGeometry(0.016, 10, 8), mats.metal, 0.61, -0.265, 0.075);                                     // tilt joint
  const camGroup = new THREE.Group(); camGroup.position.set(0.61, -0.265, 0); camGroup.rotation.z = -0.28;          // tilted down, stabilising
  const camBody = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.1, 0.12, 3, 0.03), mats.graphite); camGroup.add(camBody);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.05, 24), mats.graphite); barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.075; camGroup.add(barrel);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 8, 28), mats.metal); ring.rotation.y = Math.PI / 2; ring.position.x = 0.1; camGroup.add(ring);       // aperture ring
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), mats.lens); lens.rotation.z = Math.PI / 2; lens.position.x = 0.098; camGroup.add(lens);
  const coat = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), mats.coating); coat.rotation.y = Math.PI / 2; coat.position.x = 0.105; camGroup.add(coat);          // blue anti-reflective glint
  g.add(camGroup);
  return { group: g, props, blur };
}

export const DroneHero: React.FC<{ className?: string }> = ({ className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phone = window.innerWidth < 640;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch (e) { console.warn('Hero: WebGL unavailable', e); setOk(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.6));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.Fog(0x05070c, 16, 58);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 120);

    // Backdrop: deep navy glow falling to black, outside the fog.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), new THREE.ShaderMaterial({
      fog: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = distance((vUv - 0.5) * vec2(1.0, 0.78) + 0.5, vec2(0.54, 0.56)); vec3 c = mix(vec3(0.014, 0.024, 0.06), vec3(0.0016, 0.002, 0.0038), smoothstep(0.02, 0.3, d)); gl_FragColor = vec4(c, 1.0); }',
    }));
    back.position.z = -90; scene.add(back);

    // Lighting: warm key from the front-left and above, cool rim from behind, faint sky fill.
    scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x06080c, 0.55));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.7); key.position.set(-9, 14, 12); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbe6ff, 0.55); fill.position.set(10, 3, 14); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8fc0ff, 2.4); rim.position.set(2, 9, -16); scene.add(rim);
    const under = new THREE.DirectionalLight(0x3d6fd6, 0.6); under.position.set(0, -10, 4); scene.add(under);

    // Volumetric beams: soft additive slabs cutting through the haze.
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { tint: { value: new THREE.Color(0.32, 0.5, 1.0) }, k: { value: 0.055 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 tint; uniform float k; varying vec2 vUv; void main(){ float x = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x); float y = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y); gl_FragColor = vec4(tint * x * y * k * (0.6 + 0.4 * vUv.x), 1.0); }',
    });
    const beams: THREE.Mesh[] = [];
    for (const [x, z, rz, w] of [[-14, -22, 0.55, 9], [-6, -30, 0.42, 6], [12, -34, -0.35, 7]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 70), beamMat);
      b.position.set(x, 14, z); b.rotation.z = rz; scene.add(b); beams.push(b);
    }

    // Materials: anodised metal, dark glass, LEDs bright enough to bloom.
    const mats: Record<string, THREE.Material> = {
      white: new THREE.MeshPhysicalMaterial({ color: 0xcfd3d7, metalness: 0.02, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
      graphite: new THREE.MeshPhysicalMaterial({ color: 0x2c3036, metalness: 0.15, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
      carbon: new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.35, roughness: 0.42 }),
      seam: new THREE.MeshStandardMaterial({ color: 0x0c0e11, metalness: 0.2, roughness: 0.8 }),
      logo: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.4, roughness: 0.5 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.95, roughness: 0.32 }),
      skid: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.1, roughness: 0.85 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0, roughness: 0.95 }),
      sensor: new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: 0.1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
      lens: new THREE.MeshPhysicalMaterial({ color: 0x08111f, metalness: 0.05, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 }),
      coating: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.55, 1.4), transparent: true, opacity: 0.55, toneMapped: false }),
      blade: new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide }),
      ledFront: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.9, 2.4), toneMapped: false }),
      ledGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.7), toneMapped: false }),
      ledRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.25, 0.2), toneMapped: false }),
    };
    const blurTex = radialTexture();
    const n = phone ? 7 : 12;
    const [K0, K1, K2] = formations(n);
    const drones: Drone[] = [];
    const rnd = seeded(7);
    for (let i = 0; i < n; i++) {
      const ledColor = new THREE.Color(0.45, 0.8, 1.6);
      const { group, props, blur } = buildDrone(mats, blurTex);
      group.position.set(...(reduced ? K1[i] : K0[i]));
      group.scale.setScalar(1.35);
      scene.add(group);
      const pts = 16;
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts * 3), 3));
      tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pts * 3), 3));
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      trail.frustumCulled = false; scene.add(trail);
      drones.push({ group, props, blur, trail, history: Array.from({ length: pts }, () => group.position.clone()), prev: group.position.clone(), phase: rnd() * Math.PI * 2, stagger: i / n, ledColor, roll: 0, pitch: 0, yaw: 0 });
    }

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    // Shallow depth of field, focused on whichever aircraft is nearest; skipped on phones.
    const bokeh = phone ? null : new BokehPass(scene, cam, { focus: 12, aperture: 0.00012, maxblur: 0.0022 });
    if (bokeh) composer.addPass(bokeh);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), phone ? 0.4 : 0.45, 0.55, 0.98);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      renderer.setSize(w, h, false); composer.setSize(w, h);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);

    // Scroll drives the choreography; the pointer nudges the camera.
    let target = 0, p = reduced ? 0.5 : 0, px = 0, py = 0, mx = 0, my = 0;
    const onScroll = () => { const h = el.offsetHeight || 1; target = Math.min(1, Math.max(0, (window.scrollY - el.offsetTop + 40) / (h * 0.55))); };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width - 0.5) * 2; my = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    const onLeave = () => { mx = 0; my = 0; };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave);

    let visible = true, raf = 0, last = performance.now();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); } });
    io.observe(el);

    const tmp = new THREE.Vector3(), vel = new THREE.Vector3();
    const place = (d: Drone, i: number, pp: number, t: number) => {
      // Stagger so the leaders move first, then each half of the journey eased.
      const u = Math.min(1, Math.max(0, (pp - d.stagger * 0.16) / 0.84));
      const a = K0[i], b = K1[i], c = K2[i];
      let x: number, y: number, z: number;
      if (u < 0.5) { const s = smooth(u / 0.5); x = a[0] + (b[0] - a[0]) * s; y = a[1] + (b[1] - a[1]) * s; z = a[2] + (b[2] - a[2]) * s; }
      else { const s = smooth((u - 0.5) / 0.5); x = b[0] + (c[0] - b[0]) * s; y = b[1] + (c[1] - b[1]) * s; z = b[2] + (c[2] - b[2]) * s; }
      // Idle hover: a slow bob and a lean, unique to each aircraft.
      y += Math.sin(t * 0.9 + d.phase) * 0.09 + Math.sin(t * 1.7 + d.phase * 2) * 0.03;
      x += Math.sin(t * 0.5 + d.phase) * 0.06;
      d.group.position.set(x, y, z);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      p += (target - p) * (1 - Math.exp(-dt * 2.6));
      px += (mx - px) * (1 - Math.exp(-dt * 2)); py += (my - py) * (1 - Math.exp(-dt * 2));
      cam.position.set(px * 0.9 + Math.sin(t * 0.11) * 0.3, 6.2 - py * 0.6 + Math.sin(t * 0.17) * 0.15, 18.5 - p * 3.2);
      cam.lookAt(0, 0.9 + p * 0.3, 0);
      let nearest = 1e9;
      beams.forEach((b, k) => { b.rotation.z = [0.55, 0.42, -0.35][k] + Math.sin(t * 0.08 + k) * 0.05; });
      drones.forEach((d, i) => {
        d.prev.copy(d.group.position);
        place(d, i, p, t);
        vel.subVectors(d.group.position, d.prev).divideScalar(Math.max(dt, 1e-3));
        // Bank into the turn: roll with sideways speed, pitch with fore-aft speed, yaw a little toward the heading.
        const roll = THREE.MathUtils.clamp(-vel.x * 0.09, -0.55, 0.55) + Math.sin(t * 0.8 + d.phase) * 0.035;
        const pitch = THREE.MathUtils.clamp(vel.z * 0.07, -0.45, 0.45) + Math.sin(t * 1.1 + d.phase) * 0.025;
        const yaw = vel.length() > 0.8 ? Math.atan2(vel.x, -vel.z) * 0.35 : d.yaw;
        d.roll += (roll - d.roll) * (1 - Math.exp(-dt * 3)); d.pitch += (pitch - d.pitch) * (1 - Math.exp(-dt * 3)); d.yaw += (yaw - d.yaw) * (1 - Math.exp(-dt * 1.5));
        d.group.rotation.set(d.pitch - 0.08, d.yaw - Math.PI * 0.5 + 0.55 + Math.sin(d.phase) * 0.3, d.roll, 'YXZ');
        nearest = Math.min(nearest, d.group.position.distanceTo(cam.position));
        const spin = dt * 62;
        d.props.forEach((pr, k) => { pr.rotation.y += spin * (k % 2 ? -1 : 1); });
        // Light trail: recent positions, fading, brighter the faster the aircraft moves.
        d.history.pop(); d.history.unshift(d.group.position.clone());
        const pos = d.trail.geometry.getAttribute('position') as THREE.BufferAttribute, col = d.trail.geometry.getAttribute('color') as THREE.BufferAttribute;
        const strength = THREE.MathUtils.clamp((vel.length() - 1.2) / 10, 0, 1);
        d.history.forEach((h, k) => { pos.setXYZ(k, h.x, h.y - 0.05, h.z); const f = strength * (1 - k / d.history.length) * 0.8; col.setXYZ(k, d.ledColor.r * f, d.ledColor.g * f, d.ledColor.b * f); });
        pos.needsUpdate = true; col.needsUpdate = true;
      });
      if (bokeh) (bokeh.uniforms as { focus: { value: number } }).focus.value += (nearest - (bokeh.uniforms as { focus: { value: number } }).focus.value) * 0.1;
      composer.render();
      raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      drones.forEach((d, i) => { place(d, i, 0.5, 0); d.group.rotation.y = -Math.PI * 0.5 + 0.55; d.props.forEach(pr => { pr.rotation.y = i; }); d.blur.forEach(b => { b.visible = false; }); });
      cam.position.set(0, 6.2, 18); cam.lookAt(0, 1.0, 0); composer.render();
    } else {
      raf = requestAnimationFrame(frame);
    }
    const onVis = () => { if (!document.hidden && visible && !raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener('scroll', onScroll); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      Object.values(mats).forEach(m => m.dispose()); blurTex.dispose(); pmrem.dispose(); composer.dispose(); renderer.dispose();
      renderer.domElement.remove();
      void tmp;
    };
  }, []);

  return <div ref={ref} aria-hidden className={`absolute inset-0 ${className}`}>{!ok && <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_58%_38%,#131c34_0%,#05070c_100%)]" />}</div>;
};
