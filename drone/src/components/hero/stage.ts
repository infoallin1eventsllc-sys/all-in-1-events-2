import * as THREE from 'three';
import { aimGimbal, buildDrone, droneMaterials, radialTexture, type Built } from './droneModel';

/**
 * The aircraft on a photographer's set: soft-box lighting, a soft shadow on a
 * seamless floor, the aircraft landed or hovering, its gimbal camera holding the
 * horizon while the airframe moves and sweeping, looking straight down or turning
 * to the vertical position on request. Used by the Overview's "The aircraft"
 * section and by lab/studio.html for product stills.
 *
 * The canvas is transparent: the page behind it is the backdrop, so the set
 * follows the light and dark themes.
 */

export type StageAir = 'landed' | 'hover';
export type StageCam = 'look' | 'down' | 'portrait';

/** A studio as an environment map: an overhead soft box, two tall strips, a rim light behind, a pale floor bouncing light back up. */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0.32, 0.33, 0.35);
  const box = (w: number, h: number, at: [number, number, number], k: number, tint = new THREE.Color(1, 1, 1)) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...at); m.lookAt(0, 0, 0); s.add(m); return m;
  };
  box(7, 5, [0.5, 7, 1], 5.5);                                   // overhead soft box
  box(1.6, 7, [-6.5, 1.5, 2.5], 3.2, new THREE.Color(1, 0.98, 0.95));   // warm strip, front left
  box(1.6, 7, [6.5, 1.5, 1.5], 2.4, new THREE.Color(0.94, 0.97, 1));    // cool strip, right
  box(8, 2.2, [0, 2.5, -7], 3.6);                                // rim light behind
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.86, 0.88) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.5; s.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.035).texture;
  pmrem.dispose();
  s.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  return tex;
}

/** A soft round shadow, dark at the centre: the contact shadow a product photographer gets under the subject. */
function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.32)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const ease = (cur: number, to: number, dt: number, rate: number) => cur + (to - cur) * (1 - Math.exp(-dt * rate));

export class AircraftStage {
  readonly renderer: THREE.WebGLRenderer;
  air: StageAir = 'landed';
  cam: StageCam = 'look';
  /** Camera orbit, radians: azimuth about the aircraft, elevation above the floor. */
  az = -0.62; el = 0.24;
  /** Stills only: move in (zoom > 1) on a point of the aircraft (focus, in its own frame). */
  zoom = 1; focus = new THREE.Vector3();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  private built: Built;
  private body = new THREE.Group();
  private mats = droneMaterials();
  private blur = radialTexture();
  private env: THREE.Texture;
  private blob: THREE.Mesh;
  private ground: THREE.Mesh;
  private groundY: number;
  private t = 0; private last = 0; private raf = 0; private running = false;
  private lift = 0; private spin = 0;
  private aim = { pan: 0.3, tilt: -0.15, roll: 0 };
  private idleUntil = 0;

  constructor(private host: HTMLElement, private opts: { reduced?: boolean; pixelRatio?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(opts.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y';

    this.env = studioEnvironment(this.renderer);
    this.scene.environment = this.env; this.scene.environmentIntensity = 0.75;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd5d9df, 0.55));
    const key = new THREE.DirectionalLight(0xfffaf2, 1.8); key.position.set(1.6, 5, 2.6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.radius = 14; key.shadow.blurSamples = 20;
    Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 12 });
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe9efff, 0.6); fill.position.set(-4, 1.8, 2); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(-1.5, 2.6, -4.5); this.scene.add(rim);

    this.built = buildDrone(this.mats, this.blur);
    this.built.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !this.built.blur.includes(m); m.receiveShadow = false; } });
    this.body.add(this.built.group); this.scene.add(this.body);
    this.groundY = new THREE.Box3().setFromObject(this.built.group).min.y;

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.16 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = this.groundY; this.ground.receiveShadow = true; this.scene.add(this.ground);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.7), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = this.groundY + 0.001; this.scene.add(this.blob);
    this.applyProps(0);
    this.pose(0);
  }

  /** Fit the canvas to its box; call on resize. */
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (!this.running) this.draw();
  }

  /** A drag from the visitor: turn the set, and hold off the slow turntable for a few seconds. */
  orbit(dx: number, dy: number) {
    this.az -= dx * 0.008; this.el = THREE.MathUtils.clamp(this.el + dy * 0.005, 0.02, 1.15);
    this.idleUntil = this.t + 4;
    if (!this.running) this.draw();
  }

  set(air: StageAir, cam: StageCam) { this.air = air; this.cam = cam; if (!this.running) { this.settle(); this.draw(); } }

  start() { if (this.running || this.opts.reduced) { this.draw(); return; } this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  /** Jump straight to the end of any transition (reduced motion, stills). */
  settle() {
    this.lift = this.air === 'hover' ? 1 : 0; this.spin = this.air === 'hover' ? 1 : 0;
    const a = this.target(this.t); this.aim = { ...a };
    this.applyProps(0);
    this.pose(this.t);
  }

  /** Render one frame at time t with the camera at (az, el): for product stills. */
  still(t: number) { this.t = t; this.settle(); this.draw(); }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now; this.t += dt;
    if (this.t > this.idleUntil) this.az -= dt * 0.11;                         // slow turntable
    this.lift = ease(this.lift, this.air === 'hover' ? 1 : 0, dt, 1.6);
    this.spin = ease(this.spin, this.air === 'hover' || this.lift > 0.02 ? 1 : 0, dt, this.air === 'hover' ? 3 : 1.2);
    const a = this.target(this.t);
    this.aim.pan = ease(this.aim.pan, a.pan, dt, 2.5); this.aim.tilt = ease(this.aim.tilt, a.tilt, dt, 2.5); this.aim.roll = ease(this.aim.roll, a.roll, dt, 2.2);
    this.applyProps(dt);
    this.pose(this.t);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Where the camera should point for the chosen move. */
  private target(t: number) {
    const still = !!this.opts.reduced;
    if (this.cam === 'down') return { pan: 0, tilt: -Math.PI / 2, roll: 0 };
    if (this.cam === 'portrait') return { pan: still ? 0.25 : Math.sin(t * 0.35) * 0.3, tilt: 0, roll: -Math.PI / 2 };
    return still ? { pan: 0.35, tilt: -0.18, roll: 0 } : { pan: Math.sin(t * 0.42) * 0.38, tilt: -0.14 + Math.sin(t * 0.29 + 1) * 0.2, roll: 0 };   // inside the ±30° pan travel
  }

  private applyProps(dt: number) {
    const fast = this.spin > 0.3;
    this.built.props.forEach((p, k) => { p.rotation.y += dt * 70 * this.spin * (k % 2 ? -1 : 1); });
    this.built.blur.forEach(b => { b.visible = fast; });          // the blades keep turning under a faint blur disc
  }

  /** The airframe's own motion, then the gimbal holding the camera against it. */
  private pose(t: number) {
    const h = this.lift, still = !!this.opts.reduced;
    const y = h * (0.36 + (still ? 0 : Math.sin(t * 1.3) * 0.025));
    const roll = still ? h * 0.08 : h * (Math.sin(t * 0.7) * 0.15 + Math.sin(t * 1.9) * 0.025);
    const pitch = still ? -h * 0.05 : h * (Math.sin(t * 0.53 + 1.2) * 0.08 - 0.03);
    this.body.position.y = y;
    this.body.rotation.set(roll, Math.sin(t * 0.21) * 0.1 * h, pitch, 'YXZ');
    aimGimbal(this.built.gimbal, this.aim);
    // The contact shadow spreads and fades as the aircraft lifts away from the floor.
    this.blob.scale.setScalar(1 + h * 0.5); (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.9 - h * 0.55;
    // Camera on its orbit, framing the whole span whatever the canvas shape.
    const f = THREE.MathUtils.degToRad(this.camera.fov / 2), hf = Math.atan(Math.tan(f) * this.camera.aspect);
    const dist = (Math.max(1.12 / Math.tan(hf), 0.62 / Math.tan(f)) + 0.6) / this.zoom;
    const ty = this.groundY + 0.2 + y * 0.6 + this.focus.y, tx = this.focus.x, tz = this.focus.z;
    this.camera.position.set(tx + Math.cos(this.el) * Math.cos(this.az) * dist, ty + Math.sin(this.el) * dist, tz + Math.cos(this.el) * Math.sin(this.az) * dist);
    this.camera.lookAt(tx, ty, tz);
  }

  draw() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.stop();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    Object.values(this.mats).forEach(m => m.dispose());
    this.built.blur.forEach(b => (b.material as THREE.Material).dispose());
    [this.env, this.blur, (this.blob.material as THREE.MeshBasicMaterial).map].forEach(t => t?.dispose());
    (this.blob.material as THREE.Material).dispose(); (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
