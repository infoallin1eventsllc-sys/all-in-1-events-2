import * as THREE from 'three';
import { City, P, wrap, EVENT_CENTER, type Look } from './city';
import { SanFrancisco } from './sf';
import { glowTex } from './textures';
import type { PatrolDrone } from '../../hooks/useSurveillanceSimulation';

/**
 * One WebGL renderer shared by every patrol feed on the page (the selected
 * aircraft plus the thumbnails): the city is built once, each feed is a camera
 * placed at its aircraft's position, heading, altitude, gimbal pitch and zoom.
 * Each frame is rendered to an offscreen target, passed through a sensor stage
 * (EO colour, white-hot or ironbow thermal, image-intensified night vision) and
 * copied onto the feed's own 2D canvas.
 */

export interface Lock { id: string; kind: 'PERSON' | 'VEHICLE'; x: number; y: number; w: number; h: number; tempC: number }
export interface View {
  canvas: HTMLCanvasElement;
  compact: boolean;
  get: () => { drone: PatrolDrone; night: boolean };
  onLock?: (l: Lock | null) => void;
  /** Real footage: the sensor stage runs on this video's frames instead of the 3D city. */
  video?: HTMLVideoElement;
  /** Which rendered world: the venue's city (default) or the San Francisco dusk take. */
  world?: 'CITY' | 'SF';
}
export type World = NonNullable<View['world']>;

export const FEED_W = 1280, FEED_H = 720, THUMB_W = 320, THUMB_H = 180;
const SUN = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();
/** Quality steps, dropped automatically when the device can't keep up: main feed size, thumbnail interval. */
const LEVELS = [{ w: 1280, h: 720, thumbEvery: 4 }, { w: 960, h: 540, thumbEvery: 6 }, { w: 768, h: 432, thumbEvery: 10 }];

const POST_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
precision highp float;
uniform sampler2D tDiffuse; uniform vec2 uvScale; uniform vec2 texel; uniform vec2 res;
uniform int mode; uniform float time; uniform float gain; uniform float display;
uniform float grade; uniform vec2 sunPos; uniform float flare; uniform float warm; uniform float fade;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 ironbow(float t) {
  vec3 c0 = vec3(0.0), c1 = vec3(0.26, 0.0, 0.42), c2 = vec3(0.8, 0.08, 0.14), c3 = vec3(1.0, 0.52, 0.0), c4 = vec3(1.0, 0.9, 0.22), c5 = vec3(1.0);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  if (t < 0.9) return mix(c3, c4, (t - 0.75) / 0.15);
  return mix(c4, c5, (t - 0.9) / 0.1);
}
vec3 tex(vec2 uv) { return texture2D(tDiffuse, clamp(uv, texel * 0.5, uvScale - texel * 0.5)).rgb; }
void main() {
  vec2 uv = vUv * uvScale;
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q * vec2(1.0, 0.7), q * vec2(1.0, 0.7)) * 1.1;
  float n = hash(floor(vUv * res) + fract(time * 7.13) * vec2(97.0, 31.0)) - 0.5;
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  vec3 col;
  if (mode <= 1) {
    vec3 c = tex(uv) * gain;
    vec3 bl = (tex(uv + dx) + tex(uv - dx) + tex(uv + dy) + tex(uv - dy)) * 0.25 * gain;
    c = max(c + (c - bl) * 0.45, 0.0);           // the camera's own sharpening
    c = display > 0.5 ? clamp(c, 0.0, 1.0) : pow(aces(c), vec3(1.0 / 2.2));
    float l = lum(c);
    c = mix(vec3(l), c, mode == 0 ? 1.08 : 0.75);
    if (grade > 0.5) {
      // The film grade. By day: natural, a little contrast, clean blacks. Golden hour: teal shadows, warm
      // highlights. Blue hour: saturated indigo shadows against the orange floodlights.
      float g = clamp(warm, 0.0, 1.0), b = clamp(-warm, 0.0, 1.0);
      c = mix(c, c * vec3(0.82, 1.0, 1.18), (1.0 - l) * 0.55 * g + (1.0 - l) * 0.35 * b);
      c = mix(c, c * vec3(1.14, 1.0, 0.84), l * 0.5 * g);
      c = mix(c, c * vec3(0.9, 0.95, 1.25), (1.0 - l) * 0.4 * b);
      c = mix(vec3(l), c, 1.0 + 0.25 * b);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35 + 0.2 * g);
      c = c * 0.98 + 0.012 * g;
      // Lens flare when the sun is in frame and not behind a tower: an anamorphic streak, a halo and a ghost.
      if (flare > 0.0) {
        vec2 d = (vUv - sunPos) * vec2(1.0, 0.5625);
        float vis = smoothstep(0.35, 0.75, lum(tex(clamp(sunPos, 0.02, 0.98) * uvScale))) * flare;
        float streak = exp(-abs(d.y) * 110.0) * exp(-abs(d.x) * 5.5);
        float halo = exp(-length(d) * 7.0);
        vec2 gd = (vUv - (1.0 - sunPos)) * vec2(1.0, 0.5625);
        float ghost = exp(-length(gd) * 28.0) * 0.6 + exp(-length(gd * 0.5) * 30.0) * 0.25;
        c += vis * (streak * 0.3 * vec3(1.0, 0.72, 0.5) + halo * 0.22 * vec3(1.0, 0.8, 0.6) + ghost * 0.3 * vec3(0.45, 0.75, 1.0));
      }
      c += n * (0.012 + 0.02 * g);
      col = c * mix(1.0, vig, 0.35 + 0.35 * g) * fade;
    } else {
      c += n * (mode == 0 ? 0.014 : 0.06);
      col = c * mix(1.0, vig, 0.55);
    }
  } else if (mode <= 3) {
    float h = lum(tex(uv)) * 0.4 + (lum(tex(uv + dx)) + lum(tex(uv - dx)) + lum(tex(uv + dy)) + lum(tex(uv - dy))) * 0.15;
    h = clamp((h - 0.1) / 0.82, 0.0, 1.0);        // automatic gain: the scene spans the palette
    h += n * 0.035 + (hash(vec2(floor(vUv.x * res.x), 7.0)) - 0.5) * 0.014;
    h = clamp(h, 0.0, 1.0);
    col = mode == 2 ? vec3(pow(h, 1.05)) : ironbow(pow(h, 1.25));
    col *= mix(1.0, vig, 0.3);
  } else {
    float l = lum(tex(uv)) * gain, b = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; b += lum(tex(uv + vec2(cos(a), sin(a)) * texel * 4.0)); }
    l += max(b / 8.0 * gain - 0.5, 0.0) * 0.9;     // halo round bright lights
    float v = 1.0 - exp(-l * 1.7) + n * 0.2;
    float tube = smoothstep(0.86, 0.64, length(q * vec2(1.55, 0.95)));
    col = vec3(0.24, 1.0, 0.4) * v * tube + vec3(0.01, 0.035, 0.015);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private city: City;
  private cam = new THREE.PerspectiveCamera(40, 16 / 9, 1, 900);
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  private spot = new THREE.SpotLight(0xfff4e0, 0, 0, 0.13, 0.55, 2);
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fog = new THREE.Fog(0xffffff, 200, 460);
  private views = new Set<View>();
  private pos = new Map<string, { x: number; z: number }>();
  private locks = new WeakMap<View, { kind: 'PERSON' | 'VEHICLE'; idx: number }>();
  private snow: HTMLCanvasElement;
  private videoTex = new WeakMap<HTMLVideoElement, THREE.VideoTexture>();
  private sf: SanFrancisco | null = null;
  private sfSeen = false;
  private raf = 0; private last = 0; private frame = 0;
  private level = 0; private slow = 1 / 60; private settled = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(FEED_W, FEED_H, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.city = new City(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.city.group, this.hemi, this.sun, this.sun.target, this.spot, this.spot.target);
    this.scene.fog = this.fog;
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -190; sc.right = 190; sc.top = 190; sc.bottom = -190; sc.near = 1; sc.far = 1000; sc.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.25;
    this.rt = new THREE.WebGLRenderTarget(FEED_W, FEED_H, { samples: 4, type: THREE.HalfFloatType });
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture }, uvScale: { value: new THREE.Vector2(1, 1) }, texel: { value: new THREE.Vector2(1 / FEED_W, 1 / FEED_H) },
        res: { value: new THREE.Vector2(FEED_W, FEED_H) }, mode: { value: 0 }, time: { value: 0 }, gain: { value: 1 }, display: { value: 0 },
        grade: { value: 0 }, sunPos: { value: new THREE.Vector2(-10, -10) }, flare: { value: 0 }, warm: { value: 0 }, fade: { value: 1 },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.snow = document.createElement('canvas'); this.snow.width = 160; this.snow.height = 90;
  }

  add(v: View) {
    this.views.add(v);
    const id = v.get().drone.id;
    if (!this.pos.has(id)) {
      // Start short of the event plaza, facing it, so the stage and crowd are in the first frames.
      const d = v.get().drone, h = (d.headingDeg * Math.PI) / 180, seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
      const back = 120 + (seed % 5) * 30, side = ((seed % 3) - 1) * 60;
      this.pos.set(id, { x: wrap(EVENT_CENTER.x - Math.sin(h) * back + Math.cos(h) * side), z: wrap(EVENT_CENTER.z + Math.cos(h) * back + Math.sin(h) * side) });
    }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    return () => { this.views.delete(v); };
  }

  private tick = (now: number) => {
    if (!this.views.size) { this.raf = 0; return; }
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.frame++;
    // Adapt: step quality down when frames run long, back up when there's headroom.
    this.slow = this.slow * 0.95 + dt * 0.05; this.settled++;
    if (this.slow > 1 / 32 && this.level < LEVELS.length - 1 && this.settled > 90) { this.level++; this.settled = 0; }
    else if (this.slow < 1 / 56 && this.level > 0 && this.settled > 600) { this.level--; this.settled = 0; }
    this.city.update(dt);
    this.sfSeen = false;
    for (const v of this.views) if (v.world === 'SF' && !v.video) { this.sfWorld().update(dt); break; }
    const moved = new Set<string>();
    for (const v of this.views) {
      const d = v.get().drone;
      if (moved.has(d.id)) continue; moved.add(d.id);
      const p = this.pos.get(d.id)!, h = (d.headingDeg * Math.PI) / 180;
      p.x = wrap(p.x + Math.sin(h) * d.groundSpeedMps * dt);
      p.z = wrap(p.z - Math.cos(h) * d.groundSpeedMps * dt);
    }
    let k = 0;
    for (const v of this.views) {
      k++;
      if (v.compact && (this.frame + k) % LEVELS[this.level].thumbEvery) continue;   // thumbnails at a lower rate
      const { drone } = v.get();
      if (drone.status === 'OFFLINE') this.drawSnow(v);
      else if (v.video) this.renderVideo(v, now / 1000);
      else if (v.world === 'SF') this.renderSF(v, now / 1000, dt);
      else this.render(v, now / 1000);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private drawSnow(v: View) {
    const g = this.snow.getContext('2d')!, img = g.createImageData(160, 90), px = img.data;
    for (let i = 0; i < px.length; i += 4) { const c = 12 + Math.random() * 44; px[i] = px[i + 1] = px[i + 2] = c; px[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const ctx = v.canvas.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.snow, 0, 0, v.canvas.width, v.canvas.height);
    v.onLock?.(null);
  }

  private render(v: View, time: number) {
    const { drone: d, night } = v.get();
    const p = this.pos.get(d.id)!;
    const q = LEVELS[this.level], w = v.compact ? THUMB_W : q.w, h = v.compact ? THUMB_H : q.h;
    const thermal = d.sensorMode === 'THERMAL_WHITE_HOT' || d.sensorMode === 'THERMAL_IRONBOW';
    const nv = d.sensorMode === 'NIGHT_VISION';
    const look: Look = thermal ? (night ? 'IR_NIGHT' : 'IR_DAY') : night ? 'NIGHT' : 'DAY';

    // Camera: the gimbal's pitch and the airframe's heading, with a little stabiliser residual.
    const shake = 0.0016;
    const hd = (d.headingDeg * Math.PI) / 180 + Math.sin(time * 2.3 + p.x) * shake;
    const pitch = (Math.min(89, Math.max(4, -d.gimbalPitchDeg)) * Math.PI) / 180 + Math.sin(time * 3.1) * shake;
    const alt = Math.max(3, d.altM);
    const cam = this.cam;
    cam.near = 1; cam.far = 900;
    cam.position.set(p.x, alt, p.z);
    cam.fov = (2 * Math.atan(Math.tan((20 * Math.PI) / 180) / Math.max(1, d.zoom)) * 180) / Math.PI;
    cam.updateProjectionMatrix();
    cam.lookAt(p.x + Math.sin(hd) * Math.cos(pitch), alt - Math.sin(pitch), p.z - Math.cos(hd) * Math.cos(pitch));
    cam.updateMatrixWorld();

    // Shadows follow what the camera is looking at.
    const reach = Math.min(170, alt / Math.tan(pitch));
    const tx = Math.round(p.x + Math.sin(hd) * reach), tz = Math.round(p.z - Math.cos(hd) * reach);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + SUN.x * 450, SUN.y * 450, tz + SUN.z * 450);
    this.sun.target.updateMatrixWorld();

    this.city.applyLook(look);
    const bg = new THREE.Color();
    if (look === 'DAY') {
      this.hemi.color.set(0xdde8f4); this.hemi.groundColor.set(0x8b8272); this.hemi.intensity = 1.7;
      this.sun.color.set(0xfff0da); this.sun.intensity = 3.4;
      bg.set(0xb4c1ce); this.fog.near = 190; this.fog.far = 470;
    } else if (look === 'NIGHT') {
      this.hemi.color.set(0x2a3a5c); this.hemi.groundColor.set(0x0c0c10); this.hemi.intensity = 0.6;
      this.sun.color.set(0x9fb3ff); this.sun.intensity = 0.3;
      bg.set(0x0b0f18); this.fog.near = 120; this.fog.far = 440;
    } else {
      this.hemi.color.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace); this.hemi.groundColor.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace);
      this.hemi.intensity = look === 'IR_DAY' ? Math.PI * 0.55 : Math.PI * 0.9;
      this.sun.color.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace); this.sun.intensity = look === 'IR_DAY' ? Math.PI * 0.4 : 0;
      bg.setRGB(0.26, 0.26, 0.26, THREE.LinearSRGBColorSpace); this.fog.near = 200; this.fog.far = 540;
    }
    this.fog.color.copy(bg); this.scene.background = bg;

    // Spotlight task: a beam from the aircraft to the reticle.
    const spotOn = d.tasks.illumination && night && !thermal;
    this.spot.intensity = spotOn ? 4.5e4 : 0;
    this.spot.position.copy(cam.position);
    this.spot.target.position.set(cam.position.x + Math.sin(hd) * reach, 0, cam.position.z - Math.cos(hd) * reach);
    this.spot.target.updateMatrixWorld();

    this.rt.viewport.set(0, 0, w, h);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, cam);

    const u = this.post.uniforms;
    u.uvScale.value.set(w / FEED_W, h / FEED_H);
    u.res.value.set(w, h);
    u.time.value = time;
    u.mode.value = thermal ? (d.sensorMode === 'THERMAL_WHITE_HOT' ? 2 : 3) : nv ? 4 : night ? 1 : 0;
    u.gain.value = nv ? (night ? 4.2 : 1.1) : night ? 2.2 : 1;
    u.grade.value = 0; u.flare.value = 0; u.fade.value = 1;
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.postScene, this.postCam);

    const ctx = v.canvas.getContext('2d');
    if (ctx) ctx.drawImage(this.renderer.domElement, 0, FEED_H - h, w, h, 0, 0, v.canvas.width, v.canvas.height);

    if (v.onLock) v.onLock(d.tasks.autoTrack || d.tasks.survivorDetect || thermal ? this.lock(v, p) : null);
  }

  private sfWorld() {
    if (!this.sf) this.sf = new SanFrancisco(this.renderer.capabilities.getMaxAnisotropy(), glowTex());
    return this.sf;
  }

  /** The San Francisco take through the sensor stage, with the feature grade on the EO picture. */
  private renderSF(v: View, time: number, dt: number) {
    const sf = this.sfWorld();
    const { drone: d, night } = v.get();
    const q = LEVELS[this.level], w = v.compact ? THUMB_W : q.w, h = v.compact ? THUMB_H : q.h;
    const thermal = d.sensorMode === 'THERMAL_WHITE_HOT' || d.sensorMode === 'THERMAL_IRONBOW';
    const nv = d.sensorMode === 'NIGHT_VISION';
    const look: Look = thermal ? (night ? 'IR_NIGHT' : 'IR_DAY') : night ? 'NIGHT' : 'DAY';
    // Each aircraft plays the reel from its own point in it.
    const seed = [...d.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const at = time + (seed % 7) * 41;
    sf.applyLook(look, sf.shotAt(at).shot.mood);
    const { sun, fade, mood } = sf.pose(this.cam, at, d.zoom);
    this.sfSeen = true; void dt;
    this.rt.viewport.set(0, 0, w, h);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(sf.scene, this.cam);
    const u = this.post.uniforms;
    u.uvScale.value.set(w / FEED_W, h / FEED_H);
    u.res.value.set(w, h);
    u.time.value = time;
    u.mode.value = thermal ? (d.sensorMode === 'THERMAL_WHITE_HOT' ? 2 : 3) : nv ? 4 : night ? 1 : 0;
    u.gain.value = nv ? (night ? 3.2 : 1.1) : night ? 1.35 : 1.05;
    u.grade.value = thermal || nv ? 0 : 1;
    u.warm.value = mood === 'GOLDEN' ? 1 : mood === 'BLUE' ? -1 : 0;
    u.flare.value = sun && mood === 'GOLDEN' ? 1 : 0;
    u.fade.value = thermal || nv ? 1 : fade;
    if (sun) u.sunPos.value.copy(sun); else u.sunPos.value.set(-10, -10);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.postScene, this.postCam);
    const ctx = v.canvas.getContext('2d');
    if (ctx) ctx.drawImage(this.renderer.domElement, 0, FEED_H - h, w, h, 0, 0, v.canvas.width, v.canvas.height);
    if (v.onLock) v.onLock(d.tasks.autoTrack || d.tasks.survivorDetect || thermal ? this.lock(v, { x: this.cam.position.x, z: this.cam.position.z }, sf) : null);
  }

  /** Real footage through the same sensor stage: EO passthrough, thermal palettes, night vision. */
  private renderVideo(v: View, time: number) {
    const video = v.video!;
    if (video.readyState < 2 || !video.videoWidth) return;
    let tex = this.videoTex.get(video);
    if (!tex) { tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.NoColorSpace; this.videoTex.set(video, tex); }
    const { drone: d, night } = v.get();
    const thermal = d.sensorMode === 'THERMAL_WHITE_HOT' || d.sensorMode === 'THERMAL_IRONBOW';
    const nv = d.sensorMode === 'NIGHT_VISION';
    const q = LEVELS[this.level], w = v.compact ? THUMB_W : q.w, h = v.compact ? THUMB_H : q.h;
    const u = this.post.uniforms;
    u.tDiffuse.value = tex;
    u.uvScale.value.set(1, 1);
    u.texel.value.set(1 / video.videoWidth, 1 / video.videoHeight);
    u.res.value.set(w, h);
    u.time.value = time;
    u.display.value = 1;
    u.mode.value = thermal ? (d.sensorMode === 'THERMAL_WHITE_HOT' ? 2 : 3) : nv ? 4 : night ? 1 : 0;
    u.gain.value = nv ? 1.6 : 1;
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.postScene, this.postCam);
    u.tDiffuse.value = this.rt.texture; u.display.value = 0; u.texel.value.set(1 / FEED_W, 1 / FEED_H);
    const ctx = v.canvas.getContext('2d');
    if (ctx) ctx.drawImage(this.renderer.domElement, 0, FEED_H - h, w, h, 0, 0, v.canvas.width, v.canvas.height);
    v.onLock?.(null);
  }

  // ---- Target lock: follow one person or vehicle until it leaves the frame ----
  private v3 = new THREE.Vector3();
  private project(x: number, y: number, z: number) { return this.v3.set(x, y, z).project(this.cam); }

  private near(x: number, px: number, wrapped: boolean) { if (!wrapped) return x; let d = x - px; d -= Math.round(d / P) * P; return px + d; }

  private screen(kind: 'PERSON' | 'VEHICLE', idx: number, p: { x: number; z: number }, world: City | SanFrancisco) {
    const o = kind === 'PERSON' ? world.walkers[idx] : world.cars[idx];
    if (!o) return null;
    const wrapped = world === this.city;
    const x = this.near(o.x, p.x, wrapped), z = this.near(o.z, p.z, wrapped);
    const c = this.project(x, 1, z);
    if (c.z > 1 || Math.abs(c.x) > 0.96 || Math.abs(c.y) > 0.96) return null;
    const cx = c.x, cy = c.y;
    let x0 = 1, y0 = 1, x1 = -1, y1 = -1;
    const car = kind === 'VEHICLE' ? (o as typeof this.city.cars[number]) : null;
    const hl = car ? car.len / 2 : 0.32, hw = car ? 0.95 * car.sz : 0.32, ht = car ? 1.5 * car.sy : 1.8;
    const ax = car ? car.dx : 1, az = car ? car.dz : 0;
    for (const a of [-hl, hl]) for (const b of [-hw, hw]) for (const y of [0.1, ht]) {
      const q = this.project(x + ax * a - az * b, y, z + az * a + ax * b);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    return { cx, cy, x0, y0, x1, y1 };
  }

  private lock(v: View, p: { x: number; z: number }, world: City | SanFrancisco = this.city): Lock | null {
    let cur = this.locks.get(v);
    let s = cur ? this.screen(cur.kind, cur.idx, p, world) : null;
    const wrapped = world === this.city;
    if (!s || this.frame % 90 === 0) {
      // (Re)acquire: the person or moving vehicle nearest the reticle.
      let best: { kind: 'PERSON' | 'VEHICLE'; idx: number; d: number } | null = null;
      const consider = (kind: 'PERSON' | 'VEHICLE', idx: number, weight: number) => {
        const o = kind === 'PERSON' ? world.walkers[idx] : world.cars[idx];
        const c = this.project(this.near(o.x, p.x, wrapped), 1, this.near(o.z, p.z, wrapped));
        if (c.z > 1 || Math.abs(c.x) > 0.7 || Math.abs(c.y) > 0.7) return;
        const d = Math.hypot(c.x, c.y) * weight;
        if (!best || d < best.d) best = { kind, idx, d };
      };
      if (!s) {
        (world.walkers as { x: number; z: number }[]).forEach((_, i) => consider('PERSON', i, 1));
        world.cars.forEach((c, i) => { if (c.v > 1) consider('VEHICLE', i, 1.4); });
        if (best) { const b = best as { kind: 'PERSON' | 'VEHICLE'; idx: number }; cur = { kind: b.kind, idx: b.idx }; this.locks.set(v, cur); s = this.screen(cur.kind, cur.idx, p, world); }
      }
    }
    if (!s || !cur) { this.locks.delete(v); return null; }
    const W = v.canvas.width, H = v.canvas.height;
    const obj = (cur.kind === 'PERSON' ? world.walkers[cur.idx] : world.cars[cur.idx]) as { id: number };
    return {
      id: `${cur.kind === 'PERSON' ? 'TGT' : 'VEH'}-${String((obj.id % 90) + 10)}`,
      kind: cur.kind,
      x: ((s.x0 + 1) / 2) * W, y: ((1 - s.y1) / 2) * H, w: ((s.x1 - s.x0) / 2) * W, h: ((s.y1 - s.y0) / 2) * H,
      tempC: cur.kind === 'PERSON' ? 36.1 + (obj.id % 13) / 10 : 41 + (obj.id % 17),
    };
  }
}

let engine: Engine | null | undefined;
/** The shared feed engine, or null where WebGL is unavailable. */
export function feedEngine(): Engine | null {
  if (engine !== undefined) return engine;
  try { engine = new Engine(); } catch (e) { console.warn('Patrol feed: WebGL unavailable', e); engine = null; }
  return engine;
}
