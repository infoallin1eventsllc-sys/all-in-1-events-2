import React, { useEffect, useRef, useState } from 'react';
import { FrameGovernor } from '../../lib/quality';
import { release3d } from '../../lib/release3d';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sparkles, RotateCcw } from 'lucide-react';
import { LightShowDrone } from '../../types/lightShowTypes';
import { emberFleet, type EmberFleet } from '../hero/droneModel';

/**
 * The show stage.
 *
 * This is the one surface in the product where the imagery is the point: a
 * client watching the conductor should see what the audience will see. So it
 * renders like a night sky, not like a debugger — bloomed LED halos, light
 * trails while formations move, soft reflections on the venue floor, a slow
 * idle orbit — while staying cheap enough for 500 aircraft on a laptop.
 *
 * Everything lives in GPU buffers sized once (CAPACITY); per-frame work is a
 * buffer update, never an allocation.
 */

interface LightShowCanvas3DProps {
  drones: LightShowDrone[];
  /** The fleet as of this animation frame, when the owner keeps it in a ref (React state then only refreshes the overlays). */
  live?: { current: LightShowDrone[] };
  selectedDroneId: string | null;
  onSelectDrone: (id: string | null) => void;
  showTrajectories: boolean;
  showGeofence: boolean;
  formationName: string;
  /** Hero use (Overview page): no overlays, no picking, a chosen camera, a custom height. */
  bare?: boolean;
  initialPreset?: Preset;
  heightClass?: string;
}

type Preset = 'AUDIENCE' | 'ISOMETRIC' | 'TOP_DOWN' | 'CLOSE';

const CAPACITY = 512;            // max aircraft the buffers hold
const TRAIL = 16;                // trail samples per aircraft
const SHOW_CENTRE = new THREE.Vector3(0, 52, 0);
const AIRFRAME = 0.85;            // Ember airframe scale (about 1.6 m tip to tip, props included)
const LED_DROP = 0.22 * AIRFRAME; // the show LED pod under the belly
// Level of detail: the aircraft nearest the camera are drawn with the hero build (every part, spinning blades,
// studio reflections); the rest with the light build, which at that distance looks the same.
const NEAR_CAP = 20;              // hero-detail aircraft drawn at once (about 75k triangles each, like the hero's)
const NEAR_DIST = 32;             // metres: beyond this an airframe is a few dozen pixels and the light build is enough

const PRESETS: Record<Preset, { radius: number; theta: number; phi: number }> = {
  AUDIENCE: { radius: 122, theta: -Math.PI / 2, phi: Math.PI / 2.4 },
  ISOMETRIC: { radius: 120, theta: Math.PI / 4, phi: Math.PI / 3.1 },
  TOP_DOWN: { radius: 125, theta: 0, phi: 0.06 },
  // Close-up: a few metres off one aircraft, slightly above, following it through the show.
  CLOSE: { radius: 4.4, theta: -Math.PI / 2 + 0.7, phi: Math.PI / 2.3 },
};
const MIN_RADIUS: Record<Preset, number> = { AUDIENCE: 18, ISOMETRIC: 18, TOP_DOWN: 18, CLOSE: 2.6 };

// ---- textures, drawn once -------------------------------------------------

/** Radial sprite: hot core, soft skirt. Used for halos and floor glow. */
function makeGlowSprite(coreStop: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(coreStop, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Night sky: near-black zenith to a deep blue horizon band. Mapped on an inverted sphere. */
function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#02030a');
  g.addColorStop(0.45, '#05081a');
  g.addColorStop(0.62, '#0b1330');
  g.addColorStop(0.7, '#141c3a');
  g.addColorStop(1, '#05070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** The venue floor: dark ground, launch pad grid, audience area, radial fade to black. */
function makeGroundTexture(): THREE.CanvasTexture {
  const S = 1024; const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#070a12'; ctx.fillRect(0, 0, S, S);
  // Audience area in front of the pad (towards -z, which is the bottom of the texture).
  ctx.fillStyle = 'rgba(70,60,45,0.16)'; ctx.fillRect(S * 0.22, S * 0.66, S * 0.56, S * 0.22);
  ctx.strokeStyle = 'rgba(160,140,110,0.14)'; ctx.lineWidth = 2; ctx.strokeRect(S * 0.22, S * 0.66, S * 0.56, S * 0.22);
  // Stage / show line
  ctx.strokeStyle = 'rgba(120,140,190,0.22)'; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(S * 0.15, S * 0.62); ctx.lineTo(S * 0.85, S * 0.62); ctx.stroke(); ctx.setLineDash([]);
  // Launch pad grid — a 20 × 20 cell block centred on the pad.
  const cell = S / 100 * 3.5, half = 10; // 3.5 m cells in a 400 m texture
  ctx.strokeStyle = 'rgba(120,150,200,0.10)'; ctx.lineWidth = 1;
  for (let i = -half; i <= half; i++) {
    const p = S / 2 + i * cell;
    ctx.beginPath(); ctx.moveTo(p, S / 2 - half * cell); ctx.lineTo(p, S / 2 + half * cell); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S / 2 - half * cell, p); ctx.lineTo(S / 2 + half * cell, p); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,150,200,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(S / 2 - half * cell, S / 2 - half * cell, 2 * half * cell, 2 * half * cell);
  // Radial fade so the floor dissolves into night instead of ending at an edge.
  const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5);
  v.addColorStop(0, 'rgba(2,3,8,0)'); v.addColorStop(1, 'rgba(2,3,8,1)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export const LightShowCanvas3D: React.FC<LightShowCanvas3DProps> = ({
  drones, live, selectedDroneId, onSelectDrone, showTrajectories, showGeofence, formationName, bare = false, initialPreset = 'AUDIENCE', heightClass,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [glow, setGlow] = useState(true);

  // Everything the render loop touches lives in refs so React renders never rebuild the scene.
  const scene = useRef<{
    renderer: THREE.WebGLRenderer; composer: EffectComposer; bloom: UnrealBloomPass; camera: THREE.PerspectiveCamera;
    cores: THREE.InstancedMesh; fleet: EmberFleet; near: EmberFleet; halos: THREE.Points; floorGlow: THREE.Points; trails: THREE.LineSegments; targets: THREE.LineSegments; fence: THREE.LineSegments;
    history: Float32Array; historyHead: number;
  } | null>(null);
  const dronesRef = useRef(drones); dronesRef.current = drones;
  const liveRef = useRef(live); liveRef.current = live;
  const flagsRef = useRef({ selectedDroneId, showTrajectories, showGeofence, glow });
  flagsRef.current = { selectedDroneId, showTrajectories, showGeofence, glow };

  // Camera orbit: the target we ease towards, and where we are now.
  const orbitGoal = useRef({ ...PRESETS[initialPreset] });
  const orbitNow = useRef({ ...PRESETS[initialPreset] });
  // What the camera looks at: the show centre, or (close-up) the aircraft it follows.
  const presetRef = useRef<Preset>(initialPreset); presetRef.current = preset;
  const followId = useRef<string | null>(null);
  const lookAt = useRef(SHOW_CENTRE.clone());
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const lastInteraction = useRef(0);

  // ---- build the scene once ----------------------------------------------
  useEffect(() => {
    const container = containerRef.current; if (!container) return;
    const w = container.clientWidth || 800, h = container.clientHeight || 520;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gov = new FrameGovernor('show');
    renderer.setPixelRatio(gov.pixelRatio(2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = ''; container.appendChild(renderer.domElement);

    const s = new THREE.Scene();
    s.fog = new THREE.FogExp2(0x05070f, 0.0016);
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 2000);

    // Sky dome + stars
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 24), new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
    s.add(sky);
    const starN = 1400, starPos = new Float32Array(starN * 3), starCol = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      // Upper hemisphere only, denser near the zenith.
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u, phi = Math.acos(1 - v * 0.85);
      starPos[i * 3] = 850 * Math.sin(phi) * Math.cos(theta); starPos[i * 3 + 1] = 850 * Math.cos(phi); starPos[i * 3 + 2] = 850 * Math.sin(phi) * Math.sin(theta);
      const b = 0.35 + Math.random() * 0.65; const warm = Math.random() < 0.2;
      starCol[i * 3] = b; starCol[i * 3 + 1] = b * (warm ? 0.9 : 0.97); starCol[i * 3 + 2] = b * (warm ? 0.75 : 1);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3)); starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    s.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true, opacity: 0.6, sizeAttenuation: false, fog: false, depthWrite: false })));

    // Venue floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ map: makeGroundTexture() }));
    floor.rotation.x = -Math.PI / 2; s.add(floor);

    // Stage beams: four searchlights on the show line, sweeping slowly through the haze.
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { tint: { value: new THREE.Color(0.55, 0.65, 1.0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 tint; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (1.0 - vUv.y) * 0.028 * smoothstep(0.0, 0.08, vUv.y); gl_FragColor = vec4(tint * a, 1.0); }',
    });
    const beams: THREE.Mesh[] = [];
    for (const x of [-70, -30, 30, 70]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(4, 0.6, 150, 16, 1, true).translate(0, 75, 0), beamMat);
      b.position.set(x, 0, -70); s.add(b); beams.push(b);
    }

    // Geofence: a quiet volume, only when asked for.
    const fence = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(100, 110, 100)), new THREE.LineBasicMaterial({ color: 0x6b8fe8, transparent: true, opacity: 0.09 }));
    fence.position.set(0, 55, 0); fence.visible = false; s.add(fence);

    // Aircraft cores
    // Cores are brighter than white (unclamped) so they still bloom when the close-up raises the bloom threshold above the paint.
    const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: false }), CAPACITY);
    cores.count = 0; cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage); s.add(cores);
    // The aircraft themselves: an Ember airframe per drone, the light build far away and the hero build up close.
    const fleet = emberFleet(CAPACITY, 'lite'); s.add(fleet.group);
    const near = emberFleet(NEAR_CAP, 'full'); s.add(near.group);
    // Lit like the hero: a studio environment for the reflections in the paint, glass and metal (the sky and floor
    // are unlit, so only the airframes see it), a cool moon as the key, a blue rim from behind the formation, and a
    // faint fill from the audience side so the noses don't go black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    s.environment = pmrem.fromScene(room, 0.04).texture; room.dispose(); pmrem.dispose();
    s.environmentIntensity = 0.42;
    s.add(new THREE.HemisphereLight(0x8a9cc8, 0x0b0d14, 0.7));
    const moon = new THREE.DirectionalLight(0xc8d4ff, 1.5); moon.position.set(-60, 140, -90); s.add(moon);
    const rim = new THREE.DirectionalLight(0x8fc0ff, 1.8); rim.position.set(30, 90, 160); s.add(rim);
    const fill = new THREE.DirectionalLight(0xdbe6ff, 0.35); fill.position.set(20, 30, -140); s.add(fill);

    // LED halos — the thing bloom grabs.
    const halo = makeGlowSprite(0.18), soft = makeGlowSprite(0.05);
    const mkPoints = (size: number, opacity: number, map: THREE.Texture) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      return new THREE.Points(g, new THREE.PointsMaterial({ size, map, transparent: true, opacity, blending: THREE.AdditiveBlending, vertexColors: true, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    };
    // The glow is light in the air round each drone: it shows through the airframes rather than being hidden by them.
    const halos = mkPoints(3.4, 1, halo); (halos.material as THREE.PointsMaterial).depthTest = false; s.add(halos);
    const floorGlow = mkPoints(54, 0.06, soft); s.add(floorGlow);

    // Trails: TRAIL-1 segments per aircraft, colour fades with age.
    const segs = CAPACITY * (TRAIL - 1);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segs * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setDrawRange(0, 0);
    const trails = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.add(trails);

    // Target lines (where each aircraft is heading), one buffer for the whole fleet.
    const tgtGeo = new THREE.BufferGeometry();
    tgtGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAPACITY * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tgtGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAPACITY * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tgtGeo.setDrawRange(0, 0);
    const targets = new THREE.LineSegments(tgtGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.07, depthWrite: false }));
    s.add(targets);

    // Post: bloom on the lights only (threshold keeps the floor and sky dark).
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(s, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.65, 0.22);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // Edge anti-aliasing after tone mapping, as on the hero: clean arms and blades at any pixel ratio.
    const smaa = new SMAAPass(); composer.addPass(smaa);

    // These buffers start empty, so their bounding volumes sit at the origin: never cull them, or zooming in on the
    // formation (the ground origin out of view) would switch every light off.
    for (const o of [cores, halos, floorGlow, trails, targets]) o.frustumCulled = false;
    scene.current = { renderer, composer, bloom, camera, cores, fleet, near, halos, floorGlow, trails, targets, fence, history: new Float32Array(CAPACITY * TRAIL * 3), historyHead: 0 };

    // ---- render loop --------------------------------------------------------
    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);   // noses toward the audience
    const tilt = new THREE.Quaternion(), axis = new THREE.Vector3(), frame4 = new THREE.Matrix4(), at = new THREE.Vector3(), scl = new THREE.Vector3(AIRFRAME, AIRFRAME, AIRFRAME);
    const spinM = new THREE.Matrix4(), rotorM = new THREE.Matrix4();
    const dist2 = new Float32Array(CAPACITY), isNear = new Uint8Array(CAPACITY), cand: number[] = [];
    const byDist = (a: number, b: number) => dist2[a] - dist2[b];
    let raf = 0, last = performance.now(), frame = 0, spin = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const st = scene.current; if (!st) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now; frame++;
      const list = liveRef.current?.current ?? dronesRef.current; const n = Math.min(list.length, CAPACITY);
      const { selectedDroneId, showTrajectories, showGeofence, glow } = flagsRef.current;

      // Camera: ease to the goal; idle orbit after 6 s without input (a slow drift round the aircraft in close-up).
      const g = orbitGoal.current, o = orbitNow.current, close = presetRef.current === 'CLOSE';
      if (!dragging.current && now - lastInteraction.current > 6000) g.theta += (close ? 0.09 : 0.035) * dt;
      const ease = 1 - Math.exp(-dt * 4.8);   // time-based, so the camera settles as fast on a slow machine as a fast one
      o.radius += (g.radius - o.radius) * ease; o.theta += (g.theta - o.theta) * (1 - Math.exp(-dt * 6.3)); o.phi += (g.phi - o.phi) * ease;
      // Close-up follows the selected aircraft, or one near the front of the formation if none is selected.
      let focus: LightShowDrone | undefined;
      if (close && n) {
        const want = selectedDroneId ?? followId.current;
        focus = want ? list.find(d => d.id === want) : undefined;
        if (!focus) {
          // The aircraft furthest out towards the camera, so no neighbour stands between it and the lens.
          const cx = Math.cos(o.theta), cz = Math.sin(o.theta);
          focus = list[0];
          for (const d of list) if (d.position.x * cx + d.position.z * cz > focus.position.x * cx + focus.position.z * cz) focus = d;
          followId.current = focus.id;
        }
      }
      const la = lookAt.current;
      if (focus) la.lerp(at.set(focus.position.x, focus.position.y, focus.position.z), 1 - Math.exp(-dt * 7.5)); else la.lerp(SHOW_CENTRE, ease);
      camera.position.set(
        la.x + o.radius * Math.sin(o.phi) * Math.cos(o.theta),
        Math.max(0.8, la.y + o.radius * Math.cos(o.phi)),
        la.z + o.radius * Math.sin(o.phi) * Math.sin(o.theta),
      );
      camera.lookAt(la);

      // Which aircraft get the hero build: the nearest NEAR_CAP within NEAR_DIST of the camera.
      cand.length = 0;
      for (let i = 0; i < n; i++) {
        const p = list[i].position, dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z;
        dist2[i] = dx * dx + dy * dy + dz * dz; isNear[i] = 0;
        if (dist2[i] < NEAR_DIST * NEAR_DIST) cand.push(i);
      }
      const cap = gov.level >= 2 ? 6 : gov.level === 1 ? 12 : NEAR_CAP;   // fewer on a device that is struggling
      if (cand.length > cap) { cand.sort(byDist); cand.length = cap; }
      for (const i of cand) isNear[i] = 1;
      spin += dt * 62;
      let nf = 0, nn = 0;
      beams.forEach((b, k) => { b.rotation.z = (k < 2 ? 0.35 : -0.35) + Math.sin(now / 1000 * 0.21 + k * 1.9) * 0.22; b.rotation.x = -0.25 + Math.sin(now / 1000 * 0.13 + k) * 0.18; });

      // Aircraft buffers
      const hp = st.halos.geometry.attributes.position.array as Float32Array, hc = st.halos.geometry.attributes.color.array as Float32Array;
      const fp = st.floorGlow.geometry.attributes.position.array as Float32Array, fc = st.floorGlow.geometry.attributes.color.array as Float32Array;
      const tp = st.targets.geometry.attributes.position.array as Float32Array, tc = st.targets.geometry.attributes.color.array as Float32Array;
      const sampleTrail = frame % 3 === 0; // ~20 Hz trail sampling
      if (sampleTrail) st.historyHead = (st.historyHead + 1) % TRAIL;
      let tgtCount = 0;
      for (let i = 0; i < n; i++) {
        const d = list[i]; const p = d.position;
        // RGBW → RGB with the white channel lifting all three; lights are pure emitters.
        const r = Math.min(1, (d.color.r + d.color.w * 0.45) / 255), gch = Math.min(1, (d.color.g + d.color.w * 0.45) / 255), b = Math.min(1, (d.color.b + d.color.w * 0.45) / 255);
        const lit = r + gch + b > 0.05;
        const sel = d.id === selectedDroneId;
        // Airframe: level in a hover, tilted into its direction of travel when moving.
        const vx = d.velocity?.x ?? 0, vz = d.velocity?.z ?? 0, vh = Math.hypot(vx, vz);
        if (vh > 0.05) tilt.setFromAxisAngle(axis.set(vz / vh, 0, -vx / vh), Math.min(0.3, vh * 0.035)); else tilt.identity();
        frame4.compose(at.set(p.x, p.y, p.z), tilt.multiply(yaw), scl);
        col.setRGB(lit ? r : 0.05, lit ? gch : 0.06, lit ? b : 0.08);
        if (isNear[i]) {
          for (const part of st.near.parts) part.setMatrixAt(nn, frame4);
          st.near.glow.setColorAt(nn, col);
          // Props: each rotor on its motor, spinning, neighbours counter-rotating.
          for (let k = 0; k < 4; k++) {
            rotorM.multiplyMatrices(frame4, spinM.makeRotationY((spin + i * 1.7 + k) * (k % 2 ? -1 : 1)).setPosition(st.near.rotorAt[k]));
            for (const rt of st.near.rotors) rt.setMatrixAt(nn * 4 + k, rotorM);
          }
          nn++;
        } else {
          for (const part of st.fleet.parts) part.setMatrixAt(nf, frame4);
          st.fleet.glow.setColorAt(nf, col);
          nf++;
        }
        // The show LED: a small dome under the belly.
        dummy.position.set(p.x, p.y - LED_DROP, p.z); const sc = sel ? 0.42 : 0.3; dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
        st.cores.setMatrixAt(i, dummy.matrix);
        col.setRGB(lit ? r : 0.06, lit ? gch : 0.07, lit ? b : 0.09); st.cores.setColorAt(i, col);
        hp[i * 3] = p.x; hp[i * 3 + 1] = p.y - LED_DROP; hp[i * 3 + 2] = p.z;
        // The halo is how a light reads from the crowd; up close it would bury the airframe, so it fades in with distance
        // and the LED itself (with bloom) carries the glow, as on the hero.
        const hk = (sel ? 1.6 : 1) * Math.min(1, Math.max(0, (Math.sqrt(dist2[i]) - 7) / 30));
        hc[i * 3] = r * hk; hc[i * 3 + 1] = gch * hk; hc[i * 3 + 2] = b * hk;
        // Floor glow fades with altitude — a light 100 m up barely touches the ground.
        const k = Math.max(0, 1 - p.y / 90) * (close ? 0.3 : 0.9);
        fp[i * 3] = p.x; fp[i * 3 + 1] = 0.3; fp[i * 3 + 2] = p.z;
        fc[i * 3] = r * k; fc[i * 3 + 1] = gch * k; fc[i * 3 + 2] = b * k;
        // Trail history ring
        if (sampleTrail) { const hidx = (i * TRAIL + st.historyHead) * 3; st.history[hidx] = p.x; st.history[hidx + 1] = p.y; st.history[hidx + 2] = p.z; }
        // Target line
        if (showTrajectories) {
          const dx = d.targetPosition.x - p.x, dy = d.targetPosition.y - p.y, dz = d.targetPosition.z - p.z;
          if (dx * dx + dy * dy + dz * dz > 1) {
            const o6 = tgtCount * 6;
            tp[o6] = p.x; tp[o6 + 1] = p.y; tp[o6 + 2] = p.z; tp[o6 + 3] = d.targetPosition.x; tp[o6 + 4] = d.targetPosition.y; tp[o6 + 5] = d.targetPosition.z;
            tc[o6] = r; tc[o6 + 1] = gch; tc[o6 + 2] = b; tc[o6 + 3] = 0; tc[o6 + 4] = 0; tc[o6 + 5] = 0;
            tgtCount++;
          }
        }
      }
      st.cores.count = n; st.cores.instanceMatrix.needsUpdate = true; if (st.cores.instanceColor) st.cores.instanceColor.needsUpdate = true;
      for (const part of st.fleet.parts) { part.count = nf; part.instanceMatrix.needsUpdate = true; }
      for (const part of st.near.parts) { part.count = nn; part.instanceMatrix.needsUpdate = true; }
      for (const rt of st.near.rotors) { rt.count = nn * 4; rt.instanceMatrix.needsUpdate = true; }
      for (const gm of [st.fleet.glow, st.near.glow]) if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
      st.halos.geometry.setDrawRange(0, n); st.halos.geometry.attributes.position.needsUpdate = true; st.halos.geometry.attributes.color.needsUpdate = true;
      st.floorGlow.geometry.setDrawRange(0, n); st.floorGlow.geometry.attributes.position.needsUpdate = true; st.floorGlow.geometry.attributes.color.needsUpdate = true;
      st.targets.geometry.setDrawRange(0, tgtCount * 2); st.targets.geometry.attributes.position.needsUpdate = true; st.targets.geometry.attributes.color.needsUpdate = true;
      st.targets.visible = showTrajectories && tgtCount > 0;
      st.fence.visible = showGeofence;

      // Trails: rebuild segments from the ring (oldest → newest), fading in.
      if (sampleTrail) {
        const lp = st.trails.geometry.attributes.position.array as Float32Array, lc = st.trails.geometry.attributes.color.array as Float32Array;
        let seg = 0;
        for (let i = 0; i < n; i++) {
          const d = list[i];
          const r = Math.min(1, (d.color.r + d.color.w * 0.45) / 255), gch = Math.min(1, (d.color.g + d.color.w * 0.45) / 255), b = Math.min(1, (d.color.b + d.color.w * 0.45) / 255);
          for (let k = 0; k < TRAIL - 1; k++) {
            const a = (st.historyHead + 1 + k) % TRAIL, bIdx = (st.historyHead + 2 + k) % TRAIL;
            const ai = (i * TRAIL + a) * 3, bi = (i * TRAIL + bIdx) * 3;
            const o6 = seg * 6;
            lp[o6] = st.history[ai]; lp[o6 + 1] = st.history[ai + 1]; lp[o6 + 2] = st.history[ai + 2];
            lp[o6 + 3] = st.history[bi]; lp[o6 + 4] = st.history[bi + 1]; lp[o6 + 5] = st.history[bi + 2];
            const f0 = (k / (TRAIL - 1)) ** 2 * 0.38, f1 = ((k + 1) / (TRAIL - 1)) ** 2 * 0.38;
            lc[o6] = r * f0; lc[o6 + 1] = gch * f0; lc[o6 + 2] = b * f0; lc[o6 + 3] = r * f1; lc[o6 + 4] = gch * f1; lc[o6 + 5] = b * f1;
            seg++;
          }
        }
        st.trails.geometry.setDrawRange(0, seg * 2);
        st.trails.geometry.attributes.position.needsUpdate = true; st.trails.geometry.attributes.color.needsUpdate = true;
      }

      (st.trails.material as THREE.LineBasicMaterial).opacity = close ? 0.35 : 0.85;
      // Bloom is tuned for lights seen from the crowd (a low threshold, so every LED blooms). Close in, the airframes
      // fill the frame and their white paint would bloom too, so the threshold rises and only the lamps glow, as on the hero.
      const zc = THREE.MathUtils.clamp((o.radius - 6) / 34, 0, 1);
      st.bloom.threshold = 1.6 - 1.38 * zc; st.bloom.strength = 0.45 + 0.45 * zc; st.bloom.radius = 0.2 + 0.45 * zc;
      st.bloom.enabled = glow;
      if (glow && gov.level < 2) st.composer.render(); else st.renderer.render(s, camera);
      if (gov.tick(dt * 1000)) { renderer.setPixelRatio(gov.pixelRatio(2)); const cw = container.clientWidth, ch = container.clientHeight; if (cw && ch) { camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); composer.setSize(cw, ch); bloom.setSize(cw, ch); } }
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth, ch = container.clientHeight; if (!cw || !ch) return;
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
      renderer.setSize(cw, ch); composer.setSize(cw, ch); bloom.setSize(cw, ch);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      release3d(s, renderer, composer); scene.current = null;
    };
  }, []);

  // Seed the trail ring so a fresh fleet doesn't draw lines from the origin.
  useEffect(() => {
    const st = scene.current; if (!st) return;
    const n = Math.min(drones.length, CAPACITY);
    for (let i = 0; i < n; i++) for (let k = 0; k < TRAIL; k++) { const o = (i * TRAIL + k) * 3; st.history[o] = drones[i].position.x; st.history[o + 1] = drones[i].position.y; st.history[o + 2] = drones[i].position.z; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drones.length]);

  // ---- interaction ---------------------------------------------------------
  const moved = useRef(0);   // pixels dragged since the pointer went down: a drag to orbit is not a click
  const onPointerDown = (e: React.PointerEvent) => { dragging.current = true; moved.current = 0; lastPointer.current = { x: e.clientX, y: e.clientY }; lastInteraction.current = performance.now(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x, dy = e.clientY - lastPointer.current.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    lastPointer.current = { x: e.clientX, y: e.clientY }; lastInteraction.current = performance.now();
    const g = orbitGoal.current; g.theta -= dx * 0.006; g.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, g.phi - dy * 0.006));
  };
  const onPointerUp = () => { dragging.current = false; lastInteraction.current = performance.now(); };
  // Wheel zooms the stage, not the page (React's wheel handler is passive, so this is a native listener).
  useEffect(() => {
    const el = containerRef.current; if (!el || bare) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); lastInteraction.current = performance.now(); const g = orbitGoal.current; g.radius = Math.max(MIN_RADIUS[presetRef.current], Math.min(320, g.radius * Math.exp(e.deltaY * 0.0012))); };   // proportional zoom: as fine at 5 m as at 100 m
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [bare]);
  const applyPreset = (p: Preset) => {
    setPreset(p); presetRef.current = p; lastInteraction.current = performance.now();
    // Keep the current bearing in close-up so the camera swings in rather than jumping round the formation.
    orbitGoal.current = p === 'CLOSE' ? { ...PRESETS.CLOSE, theta: orbitNow.current.theta } : { ...PRESETS[p] };
    if (p === 'CLOSE') followId.current = null;
  };
  const onClick = (e: React.MouseEvent) => {
    // Pick the nearest aircraft to the click in screen space; a miss clears the selection. A drag to orbit is not a click.
    if (moved.current > 4) return;
    const st = scene.current; const el = containerRef.current; if (!st || !el) return;
    const rect = el.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1, ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(); let best: string | null = null, bestD = 0.035;
    for (const d of drones) {
      v.set(d.position.x, d.position.y, d.position.z).project(st.camera);
      if (v.z > 1) continue;                 // behind the camera
      const dd = Math.hypot(v.x - nx, v.y - ny);
      if (dd < bestD) { bestD = dd; best = d.id; }
    }
    onSelectDrone(best);
  };

  const litCount = drones.reduce((c, d) => c + (d.color.r + d.color.g + d.color.b + d.color.w > 12 ? 1 : 0), 0);

  return (
    <div id={bare ? undefined : 'light-show-canvas-container'} className={`relative w-full ${heightClass ?? 'h-[520px] lg:h-[620px]'} bg-imagery select-none overflow-hidden`}>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClick={bare ? undefined : onClick}
        className={`w-full h-full ${bare ? '' : 'cursor-grab active:cursor-grabbing'}`}
        role="img" aria-label={`Three-dimensional view of the ${formationName} formation with ${drones.length} aircraft`}
      />

      {!bare && <>
      {/* What you're looking at */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <span className="rounded-lg bg-black/55 backdrop-blur px-2.5 py-1 text-[12px] font-medium text-white">{formationName}</span>
        <span className="rounded-lg bg-black/55 backdrop-blur px-2.5 py-1 text-[11px] text-white/75 num">{drones.length} aircraft · {litCount} lit</span>
      </div>

      {/* View controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div role="group" aria-label="Camera" className="inline-flex items-center gap-0.5 rounded-lg bg-black/55 backdrop-blur p-0.5">
          {([['AUDIENCE', 'Audience', 'From the crowd, facing the show'], ['ISOMETRIC', 'Isometric', 'Three-quarter view'], ['TOP_DOWN', 'Top-down', 'Plan view of the formation'], ['CLOSE', 'Close-up', 'Follow one aircraft up close; click another to switch']] as [Preset, string, string][]).map(([id, label, title]) => (
            <button key={id} type="button" title={title} aria-pressed={preset === id} onClick={() => applyPreset(id)}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${preset === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={glow} aria-label={glow ? 'Glow on' : 'Glow off'} title="Glow" onClick={() => setGlow(v => !v)}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg bg-black/55 backdrop-blur transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${glow ? 'text-white' : 'text-white/45 hover:text-white/80'}`}>
          <Sparkles />
        </button>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => applyPreset(preset)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-black/55 backdrop-blur text-white/65 hover:text-white transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5">
          <RotateCcw />
        </button>
      </div>

      <div className="absolute bottom-3 left-3 text-[11px] text-white/45 pointer-events-none">{preset === 'CLOSE' ? 'Close-up · drag to orbit · click an aircraft to follow it' : 'Drag to orbit · scroll to zoom · click an aircraft to select it'}</div>
      </>}
    </div>
  );
};
