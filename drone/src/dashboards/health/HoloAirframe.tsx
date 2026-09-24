import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildDrone, droneMaterials, radialTexture } from '../../components/hero/droneModel';
import { VARIANTS, variantMaterials } from '../../components/hero/droneVariants';
import type { Finding, FrameInfo, Level, MotorState } from '../../diagnostics/health';
import { FrameGovernor } from '../../lib/quality';

/**
 * The aircraft as a diagnostic hologram: its own airframe drawn as glowing
 * edges and vertex points over a blueprint floor, a scan line sweeping through
 * it, and at every motor a ring on the floor, a light column and an arc showing
 * the motor's output. Each motor's ring and edges take its health; a finding
 * about another part (compass, battery, frame) lights the body and gets a
 * callout. Colour is never the only signal: OK rings are solid, Watch rings are
 * dashed, Fault rings are thick and pulse, and every callout says the level.
 *
 * The airframe matches the frame the autopilot reports: the Mavic-class quad,
 * the cinema hexacopter for a hexa, the VTOL mapper for planes and VTOLs, and a
 * generic frame built from the motor layout for anything else.
 *
 * Drag to turn it; it turns slowly on its own. A frame governor keeps it smooth.
 * Reduced motion: a still angle, no sweep, no spin.
 */

const HOLO = new THREE.Color('#5ad2ff');
const STATUS: Record<Level, THREE.Color> = {
  OK: new THREE.Color('#4ade80'), WATCH: new THREE.Color('#fbbf24'), FAULT: new THREE.Color('#f87171'), UNKNOWN: new THREE.Color('#5ad2ff'),
};
const LABEL: Record<Level, string> = { OK: 'OK', WATCH: 'Watch', FAULT: 'Fault', UNKNOWN: 'No data' };

interface Props { motors: MotorState[]; frame: FrameInfo; findings: Finding[]; flying: boolean }

const LINE_VS = 'uniform float uScan; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }';
const LINE_FS = 'uniform vec3 uColor; uniform float uOpacity; uniform float uScan; uniform float uFlash; varying float vY; void main(){ float s = exp(-pow((vY - uScan) / 0.05, 2.0)); gl_FragColor = vec4(uColor * (uOpacity + s * 0.9 + uFlash), 1.0); }';
const SHELL_VS = 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const SHELL_FS = 'uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.4); gl_FragColor = vec4(uColor * f * uOpacity, 1.0); }';

type Uniforms = { uColor: { value: THREE.Color }; uOpacity: { value: number }; uScan: { value: number }; uFlash: { value: number } };

/** A generic multirotor from the motor layout, for frames without a model of their own. */
function genericFrame(motors: MotorState[]) {
  const g = new THREE.Group(), props: THREE.Group[] = [];
  const m = new THREE.MeshBasicMaterial();
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.28, 0.3, 0.14, motors.length || 8), 0, 0, 0);
  add(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 16), 0, 0.1, 0);
  const R = 0.95;
  (motors.length ? motors : Array.from({ length: 8 }, (_, i) => ({ angleDeg: i * 45 }) as MotorState)).forEach(mo => {
    const a = (mo.angleDeg * Math.PI) / 180, x = Math.cos(a) * R, z = Math.sin(a) * R;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, R - 0.25, 10), m);
    arm.position.set(x * 0.58, 0, z * 0.58); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z).normalize()); g.add(arm);
    add(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 18), x, 0.05, z);
    const p = new THREE.Group(); p.position.set(x, 0.12, z);
    for (const s of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.05), m); b.position.x = Math.cos(s) * 0.18; p.add(b); }
    g.add(p); props.push(p);
  });
  return { group: g, props, blur: [] as THREE.Mesh[] };
}

export const HoloAirframe: React.FC<Props> = ({ motors, frame, findings, flying }) => {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const data = useRef({ motors, findings, flying });
  data.current = { motors, findings, flying };
  const [ok, setOk] = useState(true);
  const shape = `${frame.kind}:${motors.map(m => m.angleDeg).join(',')}`;

  useEffect(() => {
    const el = host.current, lab = labels.current;
    if (!el || !lab) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { setOk(false); return; }
    const gov = new FrameGovernor('health');
    renderer.setPixelRatio(gov.pixelRatio(2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050a13');
    const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
    scene.add(cam);
    // Backdrop: a deep blue bloom behind the aircraft.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShaderMaterial({
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = distance((vUv - 0.5) * vec2(1.3, 1.0), vec2(0.0, 0.03)); vec3 c = mix(vec3(0.03, 0.09, 0.19), vec3(0.012, 0.024, 0.05), smoothstep(0.0, 0.42, d)); gl_FragColor = vec4(c, 1.0); }',
    }));
    back.position.z = -20; cam.add(back);

    // --- the airframe, normalised to 2.4 units across --------------------------------
    const placeholder = { ...droneMaterials(), ...variantMaterials() };
    const blurTex = radialTexture();
    const pick = frame.kind === 'QUAD' ? null : frame.kind === 'HEXA' ? 'cinema' : frame.kind === 'PLANE' || frame.kind === 'VTOL' ? 'vtol' : 'generic';
    const air = pick === null ? buildDrone(placeholder, blurTex) : pick === 'generic' ? genericFrame(motors) : VARIANTS.find(v => v.id === pick)!.build(placeholder, blurTex);
    Object.values(placeholder).forEach(m => m.dispose());
    air.blur.forEach(b => { b.visible = false; });
    const model = air.group;
    const box0 = new THREE.Box3().setFromObject(model), dim = box0.getSize(new THREE.Vector3());
    const k = 2.4 / Math.max(dim.x, dim.z);
    model.scale.setScalar(k);
    const c0 = box0.getCenter(new THREE.Vector3()).multiplyScalar(k);
    model.position.set(-c0.x, -c0.y, -c0.z);
    const turntable = new THREE.Group(); turntable.add(model); scene.add(turntable);
    turntable.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const floorY = box.min.y - 0.18;

    // Rotor centres and the motor each one belongs to (nearest by bearing from the nose).
    const rotors = air.props.map(p => p.getWorldPosition(new THREE.Vector3()));
    const propR = air.props.map(p => { const b = new THREE.Box3().setFromObject(p); const s = b.getSize(new THREE.Vector3()); return Math.max(0.12, Math.max(s.x, s.z) / 2); });
    const motorOf = (i: number) => {
      const mo = data.current.motors;
      if (!mo.length) return -1;
      const bearing = (Math.atan2(rotors[i].z, rotors[i].x) * 180) / Math.PI;
      let best = -1, bd = 1e9;
      mo.forEach((m, j) => { const d = Math.abs(((m.angleDeg - bearing + 540) % 360) - 180); if (d < bd) { bd = d; best = j; } });
      return bd < 40 ? best : -1;
    };
    const rotorMotor = rotors.map((_, i) => motorOf(i));

    // Materials: one per zone (the body, then each rotor), so each can take its own state.
    const zoneU: Uniforms[] = [], shellU: { uColor: { value: THREE.Color }; uOpacity: { value: number } }[] = [];
    const lineMats: THREE.ShaderMaterial[] = [], shellMats: THREE.ShaderMaterial[] = [];
    const scan = { value: 0 };
    for (let z = 0; z <= rotors.length; z++) {
      const u: Uniforms = { uColor: { value: HOLO.clone() }, uOpacity: { value: 0.34 }, uScan: scan, uFlash: { value: 0 } };
      zoneU.push(u);
      lineMats.push(new THREE.ShaderMaterial({ uniforms: u, vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const su = { uColor: { value: HOLO.clone() }, uOpacity: { value: 0.16 } };
      shellU.push(su);
      shellMats.push(new THREE.ShaderMaterial({ uniforms: su, vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    }
    const inProp = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) { const i = air.props.indexOf(p as THREE.Group); if (i >= 0) return i; } return -1; };
    const nodes: number[] = [];
    const meshes: THREE.Mesh[] = [];
    model.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) meshes.push(o as THREE.Mesh); });
    const wp = new THREE.Vector3();
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const center = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      let zone = inProp(m);
      if (zone < 0) {
        let bd = 1e9;
        rotors.forEach((r, i) => { const d = Math.hypot(center.x - r.x, center.z - r.z); if (d < bd) { bd = d; zone = i; } });
        if (bd > propR[zone] * 0.6) zone = -1;
      }
      const zi = zone + 1;
      m.material = shellMats[zi];
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 24), lineMats[zi]));
      if (inProp(m) < 0) {
        const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
        const step = Math.max(1, Math.floor(pos.count / 40));
        for (let v = 0; v < pos.count; v += step) { wp.fromBufferAttribute(pos, v).applyMatrix4(m.matrixWorld); nodes.push(wp.x, wp.y, wp.z); }
      }
    }
    // Vertex nodes: the plexus points, in the turntable's space.
    const inv = new THREE.Matrix4().copy(turntable.matrixWorld).invert();
    const nodeGeo = new THREE.BufferGeometry(); nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodes, 3)); nodeGeo.applyMatrix4(inv);
    const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!; const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
    const nodePts = new THREE.Points(nodeGeo, new THREE.PointsMaterial({ map: dotTex, color: HOLO, size: 0.028, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    turntable.add(nodePts);

    // --- the floor: blueprint grid and range rings -----------------------------------------
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vP; void main(){
        vec2 g = abs(fract(vP * 2.5 - 0.5) - 0.5) / fwidth(vP * 2.5);
        float grid = 1.0 - min(min(g.x, g.y), 1.0);
        float r = length(vP);
        float rings = 1.0 - min(abs(fract(r * 1.25 - 0.5) - 0.5) / fwidth(r * 1.25), 1.0);
        float fade = smoothstep(4.2, 0.6, r);
        gl_FragColor = vec4(vec3(0.2, 0.62, 0.95) * (grid * 0.12 + rings * 0.22) * fade, 1.0); }`,
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; turntable.add(floor);

    // --- per rotor: floor ring (style by level), light column, output arc -------------------
    const ringGroup: { ring: THREE.Group; col: THREE.Mesh; arc: THREE.Mesh; track: THREE.Mesh; mat: THREE.MeshBasicMaterial; colMat: THREE.ShaderMaterial; level: Level; out: number }[] = [];
    const ringStyle = (level: Level, r: number) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: STATUS[level], transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      if (level === 'WATCH') {
        const n = 16;
        for (let s = 0; s < n; s++) g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 6, 1, (s / n) * Math.PI * 2, (Math.PI * 2 / n) * 0.55), mat));
      } else {
        const w = level === 'FAULT' ? 0.2 : 0.09;
        g.add(new THREE.Mesh(new THREE.RingGeometry(r * (1 - w), r, 64), mat));
        g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.45, r * 0.5, 48), mat));
      }
      g.rotation.x = -Math.PI / 2;
      return { g, mat };
    };
    const inv2 = inv;
    rotors.forEach((rw, i) => {
      const r = propR[i] * 1.05;
      const local = rw.clone().applyMatrix4(inv2);
      const { g, mat } = ringStyle('UNKNOWN', r);
      g.position.set(local.x, floorY + 0.005, local.z); turntable.add(g);
      const h = local.y - floorY;
      const colMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: STATUS.UNKNOWN.clone() }, uK: { value: 0.18 } },
        vertexShader: 'varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uK; varying float vH; void main(){ gl_FragColor = vec4(uColor * uK * pow(1.0 - vH, 1.6), 1.0); }',
      });
      const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.95, h, 40, 1, true), colMat);
      col.position.set(local.x, floorY + h / 2, local.z); turntable.add(col);
      const trackMat = new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const track = new THREE.Mesh(new THREE.RingGeometry(r * 1.12, r * 1.17, 64), trackMat); track.rotation.x = -Math.PI / 2; track.position.set(local.x, local.y + 0.02, local.z); turntable.add(track);
      const arc = new THREE.Mesh(new THREE.RingGeometry(r * 1.1, r * 1.19, 64, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      arc.rotation.x = -Math.PI / 2; arc.position.copy(track.position); turntable.add(arc);
      ringGroup.push({ ring: g, col, arc, track, mat, colMat, level: 'UNKNOWN', out: -1 });
    });

    // The scan plane: a faint sheet riding with the sweep line.
    const scanSheet = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float r = distance(vUv, vec2(0.5)); gl_FragColor = vec4(vec3(0.2, 0.6, 1.0) * 0.03 * smoothstep(0.5, 0.1, r), 1.0); }',
    }));
    scanSheet.rotation.x = -Math.PI / 2; turntable.add(scanSheet);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.32, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      renderer.setSize(w, h, false); composer.setSize(w, h);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);

    // Drag to turn; it resumes its own slow turn after a pause.
    let yaw = -0.7, pitch = 0.46, dragging = false, lx = 0, ly = 0, idleAt = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => { if (!dragging) return; yaw += (e.clientX - lx) * 0.008; pitch = Math.min(1.1, Math.max(0.12, pitch + (e.clientY - ly) * 0.005)); lx = e.clientX; ly = e.clientY; idleAt = performance.now(); };
    const up = () => { dragging = false; idleAt = performance.now(); };
    renderer.domElement.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);

    // Callouts: one per rotor plus one for a body finding.
    lab.innerHTML = '';
    const tags = rotors.map(() => { const d = document.createElement('div'); d.className = 'holo-tag'; lab.appendChild(d); return d; });
    const bodyTag = document.createElement('div'); bodyTag.className = 'holo-tag holo-tag-body'; lab.appendChild(bodyTag);

    const BODY_PARTS: Record<string, string> = { compass: 'Compass', gps: 'GPS', battery: 'Battery', 'fc-mount': 'Flight controller mount', frame: 'Frame', arms: 'Arms', payload: 'Payload balance', esc: 'ESCs', 'power-module': 'Power module', firmware: 'Firmware', radio: 'Telemetry radio', barometer: 'Barometer', props: 'Propellers' };
    const proj = new THREE.Vector3();
    let visible = true, raf = 0, last = performance.now(), t = 0;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frameFn); } });
    io.observe(el);

    function applyState() {
      const { motors: mo, findings: fs } = data.current;
      rotors.forEach((_, i) => {
        const j = rotorMotor[i];
        const m = j >= 0 ? mo[j] : undefined;
        const level: Level = m ? m.level : 'UNKNOWN';
        const rg = ringGroup[i];
        if (rg.level !== level) {
          turntable.remove(rg.ring);
          rg.ring.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.geometry.dispose(); });
          rg.mat.dispose();
          const r = propR[i] * 1.05, { g, mat } = ringStyle(level, r);
          g.position.copy(rg.ring.position); turntable.add(g); rg.ring = g; rg.mat = mat; rg.level = level;
          rg.colMat.uniforms.uColor.value.copy(STATUS[level]);
          const u = zoneU[i + 1]; u.uColor.value.copy(level === 'WATCH' || level === 'FAULT' ? STATUS[level] : HOLO);
          shellU[i + 1].uColor.value.copy(u.uColor.value);
          (rg.arc.material as THREE.MeshBasicMaterial).color.copy(level === 'WATCH' || level === 'FAULT' ? STATUS[level] : HOLO);
        }
        const out = m?.outputPct ?? 0;
        if (Math.abs(rg.out - out) > 0.5) {
          rg.out = out;
          const r = propR[i] * 1.05;
          rg.arc.geometry.dispose();
          rg.arc.geometry = new THREE.RingGeometry(r * 1.1, r * 1.19, 64, 1, Math.PI / 2, Math.max(0.001, (out / 100) * Math.PI * 2));
        }
        const d = m?.deviationPct;
        tags[i].innerHTML = m ? `<b>M${m.n}</b> <span>${m.outputPct != null ? Math.round(m.outputPct) + '%' : '—'}</span>${d != null ? ` <span>${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>` : ''}${level === 'WATCH' || level === 'FAULT' ? ` <em data-l="${level}">${LABEL[level]}</em>` : ''}` : '';
        tags[i].dataset.level = level;
      });
      const body = fs.find(f => !f.motor && f.part && BODY_PARTS[f.part]);
      const bu = zoneU[0];
      bu.uColor.value.copy(body ? STATUS[body.level] : HOLO); shellU[0].uColor.value.copy(bu.uColor.value);
      bodyTag.innerHTML = body ? `<b>${BODY_PARTS[body.part!]}</b> <em data-l="${body.level}">${LABEL[body.level]}</em>` : '';
      bodyTag.style.display = body ? '' : 'none';
      bodyTag.dataset.level = body?.level ?? 'OK';
    }

    function frameFn(now: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      applyState();
      const { flying } = data.current;
      if (!reduced && !dragging && now - idleAt > 2500) yaw += dt * 0.16;
      const D = 5.1 * Math.max(1, 1.35 / cam.aspect);                 // narrow screens: step back so the whole airframe fits
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * D, Math.sin(pitch) * D + 0.1, Math.cos(yaw) * Math.cos(pitch) * D);
      cam.lookAt(0, -0.05, 0);
      // Scan line sweeps bottom to top and back.
      const span = box.max.y - floorY;
      const sweep = reduced ? -10 : floorY + (0.5 - 0.5 * Math.cos(t * 0.9)) * (span + 0.1);
      scan.value = sweep; scanSheet.position.y = sweep; scanSheet.visible = !reduced;
      // Rotors spin with their output when the aircraft is armed; parked rotors (VTOL cruise) stay still.
      air.props.forEach((p, i) => {
        const j = rotorMotor[i], out = j >= 0 ? data.current.motors[j]?.outputPct ?? 0 : 0;
        if (!reduced && p.userData.parked !== true && out > 1) p.rotation.y += dt * (8 + out * 0.5) * (i % 2 ? -1 : 1);
      });
      // Levels breathe: faults pulse fast, watches slowly.
      ringGroup.forEach((rg, i) => {
        const pulse = reduced ? 1 : rg.level === 'FAULT' ? 0.55 + 0.45 * Math.sin(t * 7) : rg.level === 'WATCH' ? 0.75 + 0.25 * Math.sin(t * 2.4) : 0.85;
        rg.mat.opacity = 0.42 * pulse;
        rg.colMat.uniforms.uK.value = (rg.level === 'FAULT' ? 0.13 : 0.06) * pulse * (flying ? 1 : 0.7);
        zoneU[i + 1].uFlash.value = rg.level === 'FAULT' ? 0.35 * pulse : 0;
        if (!reduced && rg.ring.children.length > 2) rg.ring.rotation.z += dt * 0.3;   // dashed watch ring turns slowly
      });
      zoneU[0].uFlash.value = bodyTag.dataset.level === 'FAULT' ? 0.25 * (0.55 + 0.45 * Math.sin(t * 7)) : 0;
      // Callouts follow their rotor on screen.
      const w = el!.clientWidth, h = el!.clientHeight;
      air.props.forEach((p, i) => {
        p.getWorldPosition(proj); proj.y += 0.18; proj.project(cam);
        const x = (proj.x * 0.5 + 0.5) * w, y = (-proj.y * 0.5 + 0.5) * h;
        tags[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      });
      proj.set(0, box.max.y + 0.15, 0).applyMatrix4(turntable.matrixWorld).project(cam);
      bodyTag.style.transform = `translate(${((proj.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-proj.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
      bloom.enabled = gov.level < 2;
      composer.render();
      if (gov.tick(dt * 1000)) { renderer.setPixelRatio(gov.pixelRatio(2)); size(); }
      raf = reduced ? window.setTimeout(() => requestAnimationFrame(frameFn), 400) as unknown as number : requestAnimationFrame(frameFn);
    }
    raf = requestAnimationFrame(frameFn);
    const onVis = () => { if (!document.hidden && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frameFn); } };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf); clearTimeout(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.domElement.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) mat.dispose(); });
      blurTex.dispose(); dotTex.dispose(); composer.dispose(); renderer.dispose();
      renderer.domElement.remove(); lab.innerHTML = '';
    };
  }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0">
      <div ref={host} aria-hidden className="absolute inset-0" />
      <div ref={labels} aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden" />
      {!ok && <div className="absolute inset-0 grid place-items-center text-[13px] text-[#7f93ad]">3D view needs WebGL. The motor table below has the same readings.</div>}
    </div>
  );
};
