import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { buildDrone, buildEmber, droneMaterials, emberMaterials, radialTexture } from '../../components/hero/droneModel';
import { FrameGovernor } from '../../lib/quality';
import { release3d } from '../../lib/release3d';

/**
 * The Overview hero: a fleet of quadcopters in a dark, hazy sky, hovering with a
 * life of their own and re-forming as the visitor scrolls (scattered approach →
 * chevron → fan-out that clears the headline). Cinematic rather than technical:
 * anodised bodies under a key light and a blue rim light, LED tips that bloom,
 * propeller blur, thin light trails when the fleet moves, volumetric beams in
 * the haze, and a camera that pushes in and follows the pointer a little.
 *
 * Motion: every aircraft holds its slot in the formation the way a real
 * quadcopter holds a hover: a slow wander round the slot, a lean into each
 * correction, a settle after it, props that never stop, nav lights that
 * flash. The formation itself breathes and sways, and the camera dollies
 * and drifts. A frame governor keeps it smooth, stepping the render sharper
 * or lighter to match the machine.
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
  /** The hover wander: a target offset from the slot the aircraft eases toward, re-picked every few seconds. */
  wander: THREE.Vector3; wanderGoal: THREE.Vector3; nextPick: number;
  nav: THREE.Mesh[];
}

/** progress: scroll progress 0..1 from a parent that pins the hero; without it the hero reads the page scroll itself. */
/** look: 'classic' is the hero as shipped; 'ember' is a sample aircraft (lab/hero.html), not used by the app. */
export const DroneHero: React.FC<{ className?: string; progress?: { current: number }; look?: 'classic' | 'ember' }> = ({ className = '', progress, look = 'classic' }) => {
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
    const gov = new FrameGovernor('hero');
    renderer.setPixelRatio(gov.pixelRatio(2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.Fog(0x05070c, 16, 58);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture; room.dispose();
    scene.environmentIntensity = 0.55;
    const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 1500);

    // Backdrop: deep navy glow falling to black, outside the fog.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), new THREE.ShaderMaterial({
      fog: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = distance((vUv - 0.5) * vec2(1.0, 0.78) + 0.5, vec2(0.54, 0.56)); vec3 c = mix(vec3(0.014, 0.024, 0.06), vec3(0.0016, 0.002, 0.0038), smoothstep(0.02, 0.3, d)); gl_FragColor = vec4(c, 1.0); }',
    }));
    back.position.z = -90; scene.add(back);

    // Lighting: warm key from the front-left and above, cool rim from behind, faint sky fill.
    scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x06080c, 0.55));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.35); key.position.set(-9, 14, 12); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbe6ff, 0.45); fill.position.set(10, 3, 14); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8fc0ff, 2.2); rim.position.set(2, 9, -16); scene.add(rim);
    const under = new THREE.DirectionalLight(0x3d6fd6, 0.5); under.position.set(0, -10, 4); scene.add(under);
    // A specular highlight that moves across the bodies as the camera drifts: a small, sharp kicker.
    const kicker = new THREE.PointLight(0xffffff, 9, 30, 1.8); kicker.position.set(4, 8, 10); scene.add(kicker);

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
    const mats = look === 'ember' ? emberMaterials() : droneMaterials();
    const blurTex = radialTexture();
    const n = phone ? 7 : 12;
    const [K0, K1, K2] = formations(n);
    const drones: Drone[] = [];
    const rnd = seeded(7);
    for (let i = 0; i < n; i++) {
      const ledColor = look === 'ember' ? new THREE.Color(0.3, 0.65, 2.2) : new THREE.Color(0.45, 0.8, 1.6);
      const { group, props, blur } = look === 'ember' ? buildEmber(mats, blurTex) : buildDrone(mats, blurTex);
      group.position.set(...(reduced ? K1[i] : K0[i]));
      group.scale.setScalar(1.35);
      scene.add(group);
      const pts = 16;
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts * 3), 3));
      tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pts * 3), 3));
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      trail.frustumCulled = false; scene.add(trail);
      const nav = group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).material === mats.ledGreen || (c as THREE.Mesh).material === mats.ledRed)).map(m => { m.material = (m.material as THREE.Material).clone(); return m; });
      drones.push({ group, props, blur, trail, history: Array.from({ length: pts }, () => group.position.clone()), prev: group.position.clone(), phase: rnd() * Math.PI * 2, stagger: i / n, ledColor, roll: 0, pitch: 0, yaw: 0, wander: new THREE.Vector3(), wanderGoal: new THREE.Vector3(), nextPick: rnd() * 3, nav });
    }

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    // Shallow depth of field, focused on whichever aircraft is nearest; skipped on phones.
    const bokeh = phone ? null : new BokehPass(scene, cam, { focus: 12, aperture: 0.0001, maxblur: 0.0018 });
    if (bokeh) composer.addPass(bokeh);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), phone ? 0.3 : 0.34, 0.5, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // Edge anti-aliasing after tone mapping: crisp arms and blades at every pixel ratio.
    const smaa = new SMAAPass(); composer.addPass(smaa);

    let spread = 1, sized = false;
    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      // Before layout settles the box can be 0 tall: that would build zero-size render targets and an
      // infinite aspect. Wait for the ResizeObserver to report a real size.
      if (!w || !h) return;
      sized = true;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      spread = Math.min(1, Math.max(0.38, cam.aspect / 1.55));      // portrait screens: pull the fleet in so it stays in frame
      renderer.setSize(w, h, false); composer.setSize(w, h);
      if (reduced) composer.render();   // no frame loop with reduced motion: resizing clears the canvas, so redraw the still
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);

    // Scroll drives the choreography; the pointer nudges the camera.
    let target = 0, p = reduced ? 0.5 : 0, px = 0, py = 0, mx = 0, my = 0;
    const onScroll = () => { const h = el.offsetHeight || 1; target = Math.min(1, Math.max(0, (window.scrollY - el.offsetTop + 40) / (h * 0.55))); };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width - 0.5) * 2; my = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    const onLeave = () => { mx = 0; my = 0; };
    if (!progress) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
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
      // The formation breathes and sways as one: a slow swell in scale, a lean of the whole fleet.
      const swell = 1 + Math.sin(t * 0.23) * 0.035, sway = Math.sin(t * 0.17) * 0.35;
      x = x * swell + sway * (y * 0.12); z = z * swell;
      // Hover: a wander round the slot, plus the fine bob a real aircraft never loses.
      x = x * spread + d.wander.x; y += d.wander.y; z += d.wander.z;
      y += Math.sin(t * 0.9 + d.phase) * 0.06 + Math.sin(t * 1.7 + d.phase * 2) * 0.02;
      d.group.position.set(x, y, z);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      const t = now / 1000;
      if (progress) target = progress.current;
      p += (target - p) * (1 - Math.exp(-dt * 2.6));
      px += (mx - px) * (1 - Math.exp(-dt * 2)); py += (my - py) * (1 - Math.exp(-dt * 2));
      cam.position.set(px * 0.9 + Math.sin(t * 0.11) * 0.3, 6.2 - py * 0.6 + Math.sin(t * 0.17) * 0.15, 18.5 - p * 3.2);
      cam.lookAt(0, 0.9 + p * 0.3, 0);
      let nearest = 1e9;
      beams.forEach((b, k) => { b.rotation.z = [0.55, 0.42, -0.35][k] + Math.sin(t * 0.08 + k) * 0.05; });
      kicker.position.set(4 + px * 3, 8 - py * 2, 10);
      drones.forEach((d, i) => {
        d.prev.copy(d.group.position);
        // Every few seconds the aircraft picks a new spot a little off its slot and eases there: station-keeping.
        if (t > d.nextPick) { d.wanderGoal.set((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.7); d.nextPick = t + 2.5 + rnd() * 4; }
        d.wander.lerp(d.wanderGoal, 1 - Math.exp(-dt * 0.9));
        place(d, i, p, t);
        vel.subVectors(d.group.position, d.prev).divideScalar(Math.max(dt, 1e-3));
        // Bank into the turn: roll with sideways speed, pitch with fore-aft speed, yaw a little toward the heading.
        const roll = THREE.MathUtils.clamp(-vel.x * 0.16, -0.55, 0.55) + Math.sin(t * 0.8 + d.phase) * 0.03;
        const pitch = THREE.MathUtils.clamp(vel.z * 0.12, -0.45, 0.45) + Math.sin(t * 1.1 + d.phase) * 0.02;
        const yaw = vel.length() > 0.8 ? Math.atan2(vel.x, -vel.z) * 0.35 : d.yaw;
        d.roll += (roll - d.roll) * (1 - Math.exp(-dt * 3)); d.pitch += (pitch - d.pitch) * (1 - Math.exp(-dt * 3)); d.yaw += (yaw - d.yaw) * (1 - Math.exp(-dt * 1.5));
        d.group.rotation.set(d.pitch - 0.08, d.yaw - Math.PI * 0.5 + 0.55 + Math.sin(d.phase) * 0.3, d.roll, 'YXZ');
        nearest = Math.min(nearest, d.group.position.distanceTo(cam.position));
        const spin = dt * (62 + vel.length() * 6);
        d.props.forEach((pr, k) => { pr.rotation.y += spin * (k % 2 ? -1 : 1); });
        // Nav lights: the aviation flash, once a second, offset per aircraft.
        const flash = ((t * 1.0 + d.phase) % 1) < 0.12 ? 1 : 0.18;
        d.nav.forEach(m => { const mat = m.material as THREE.MeshBasicMaterial; mat.opacity = flash; mat.transparent = true; });
        // Light trail: recent positions, fading, brighter the faster the aircraft moves.
        d.history.pop(); d.history.unshift(d.group.position.clone());
        const pos = d.trail.geometry.getAttribute('position') as THREE.BufferAttribute, col = d.trail.geometry.getAttribute('color') as THREE.BufferAttribute;
        const strength = THREE.MathUtils.clamp((vel.length() - 1.2) / 10, 0, 1) * 0.5;
        let broken = false;
        d.history.forEach((h, k) => {
          pos.setXYZ(k, h.x, h.y - 0.05, h.z);
          if (k > 0 && h.distanceTo(d.history[k - 1]) > 0.9) broken = true;        // a slow frame: no long straight streak
          const f = broken ? 0 : strength * (1 - k / d.history.length) * 0.8;
          col.setXYZ(k, d.ledColor.r * f, d.ledColor.g * f, d.ledColor.b * f);
        });
        pos.needsUpdate = true; col.needsUpdate = true;
      });
      if (bokeh) { bokeh.enabled = gov.level === 0; (bokeh.uniforms as { focus: { value: number } }).focus.value += (nearest - (bokeh.uniforms as { focus: { value: number } }).focus.value) * 0.1; }
      bloom.enabled = gov.level < 2; smaa.enabled = gov.level < 2;
      if (sized) composer.render();
      if (gov.tick(dt * 1000)) { renderer.setPixelRatio(gov.pixelRatio(2)); size(); }
      raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      drones.forEach((d, i) => { place(d, i, 0.5, 0); d.group.rotation.y = -Math.PI * 0.5 + 0.55; d.props.forEach(pr => { pr.rotation.y = i; }); d.blur.forEach(b => { b.visible = false; }); });
      cam.position.set(0, 6.2, 18); cam.lookAt(0, 1.0, 0); if (sized) composer.render();
    } else {
      raf = requestAnimationFrame(frame);
    }
    const onVis = () => { if (!document.hidden && visible && !raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener('scroll', onScroll); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      // Materials not in the scene at unmount (the other look's set) go too.
      release3d(scene, renderer, composer, [...Object.values(mats), blurTex, pmrem]);
      renderer.domElement.remove();
      void tmp;
    };
  }, []);

  return <div ref={ref} aria-hidden className={`absolute inset-0 ${className}`}>{!ok && <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_58%_38%,#131c34_0%,#05070c_100%)]" />}</div>;
};
