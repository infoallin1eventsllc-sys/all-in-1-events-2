// The house as a hologram: Haven's floor plan and furniture drawn in the
// Drone Command "Aircraft Health" style (rim-lit solids, glowing edges, a
// scan band, surface dust, a grid-and-rings projection floor, bloom).
//
// It follows the live house: lit rooms glow warm with a column of light,
// rooms with a leak, water off or the garage open pulse red, an unlocked
// door or open window shows amber. Every change sends one scan sweep up
// the model. Nothing moves on its own otherwise, except the explorer's
// optional auto-orbit, so an idle panel renders nothing and costs nothing.
//
// Orbit from any angle (drag), pinch or scroll to zoom, two fingers or
// right-drag to move. Room tags are real buttons (class map-room), so the
// hologram is usable from the keyboard and by screen readers.
//
// If WebGL isn't available, createHologram() calls fallback() and the panel
// keeps the drawn house model (web/map.js).

import { normalizeHome, sharedStretches, pointInPoly } from "./building.js";

let THREE = null;
let loading = null;
const loadThree = () => (loading ||= import("./vendor/three.js").then((m) => (THREE = m)));

let webglOk = null;
export function hologramSupported() {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement("canvas");
    webglOk = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { webglOk = false; }
  return webglOk;
}

// ---------- the model's vocabulary ----------
const U = 0.3;                  // world units per plan unit
const T = 0.18;                  // wall thickness (heights come from the home's style)
const DETAIL = 2.2;             // zoom at which every room shows its devices
const PIN_TYPES = new Set(["light", "fan", "thermostat", "lock", "garage", "water_valve", "water_heater", "leak", "contact"]);

const isAlert = (d) => (d.type === "leak" && d.state.wet) || (d.type === "water_valve" && !d.state.open) || (d.type === "garage" && d.state.door !== "closed");
const isWatch = (d) => (d.type === "lock" && !d.state.locked) || (d.type === "contact" && d.state.open);
function levelOf(devices) {
  if (devices.some(isAlert)) return "FAULT";
  if (devices.some(isWatch)) return "WATCH";
  if (devices.some((d) => d.type === "light" && d.state.on)) return "LIT";
  return "OK";
}
const litLevel = (devices) => Math.max(0, ...devices.filter((d) => d.type === "light" && d.state.on).map((d) => (d.state.brightness ?? 100) / 100));

// ---------- shaders (adapted from Drone Command: Aircraft Health) ----------
const EDGE_V = "varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }";
const EDGE_F = "uniform vec3 uColor; uniform float uOpacity; uniform float uScan; uniform float uFlash; varying float vY; void main(){ float s = exp(-pow((vY - uScan) / 0.035, 2.0)); gl_FragColor = vec4(uColor * (uOpacity + s * 0.9 + uFlash), 1.0); }";
const RIM_V = "varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }";
const RIM_F = "uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.4); gl_FragColor = vec4(uColor * f * uOpacity, 1.0); }";
const FLOOR_V = "varying vec2 vP; void main(){ vP = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const FLOOR_F = `uniform vec3 uColor; uniform float uK; uniform float uUnit; uniform vec2 uC; uniform float uR; varying vec2 vP;
  void main(){
    vec2 p = vP / uUnit;
    vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
    float grid = 1.0 - min(min(g.x, g.y), 1.0);
    float d = distance(vP, uC) / uR;
    gl_FragColor = vec4(uColor * (uK * smoothstep(1.2, 0.0, d) + grid * 0.05), 1.0);
  }`;
const BEAM_V = "varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const BEAM_F = "uniform vec3 uColor; uniform float uK; varying float vH; void main(){ gl_FragColor = vec4(uColor * uK * pow(vH, 1.6), 1.0); }";
const GROUND_F = `varying vec2 vP; void main(){
    vec2 g = abs(fract(vP * 2.5 - 0.5) - 0.5) / fwidth(vP * 2.5);
    float grid = 1.0 - min(min(g.x, g.y), 1.0);
    float r = length(vP);
    float rings = 1.0 - min(abs(fract(r * 1.25 - 0.5) - 0.5) / fwidth(r * 1.25), 1.0);
    float fade = smoothstep(6.5, 1.2, r);
    gl_FragColor = vec4(vec3(0.2, 0.62, 0.95) * (grid * 0.1 + rings * 0.2) * fade, 1.0); }`;

/**
 * Mount a hologram in `container` (kept across redraws).
 * opts: { onSelect(id), onExpand(), explorer: bool, fallback() }
 * Returns a controller: update({ rooms, devices, selected }), focusRoom(id), reset(), setView(name), zoomBy(k).
 */
export function createHologram(container, opts = {}) {
  const h = {
    container, opts, ready: false, failed: false, data: null, built: "", selected: null,
    rooms: new Map(), tags: new Map(), devTags: [], dirty: true, raf: 0, visible: true,
    still: false, scanT: -1, flight: null, lastTouch: 0, spin: false,
    floorFilter: null, autoFloor: null, showRoof: true, home: null,
  };
  container.classList.add("holo");
  const wrap = document.createElement("div");
  wrap.className = "holo-canvas";
  wrap.setAttribute("aria-hidden", "true");
  const tagLayer = document.createElement("div");
  tagLayer.className = "holo-tags";
  container.append(wrap, tagLayer);
  h.wrap = wrap;
  h.tagLayer = tagLayer;
  h.note = document.createElement("p");
  h.note.className = "holo-note";
  h.note.textContent = "Layout estimated from the room list";
  h.note.hidden = true;
  container.append(h.note);
  buildBar(h);

  const motionOff = () => h.still || matchMedia("(prefers-reduced-motion: reduce)").matches || safeGet("haven.holoMotion") === "still";
  h.motionOff = motionOff;

  loadThree().then(() => {
    try { init(h); } catch (err) { fail(h, err); return; }
    h.ready = true;
    if (h.data) h.update(h.data);
  }).catch((err) => fail(h, err));

  h.update = (data) => {
    const prev = h.data;
    h.data = data;
    h.selected = data.selected ?? null;
    if (!h.ready) { renderTags(h); return; }
    h.sig = JSON.stringify({ b: data.building || null, r: data.rooms.map((r) => [r.id, r.name, r.plan, r.shape, r.floor, r.kind]) });
    if (h.sig !== h.built) build(h, data);
    // Looking at a room on a lower floor hides the floors above it.
    const selRoom = h.selected && h.rooms.get(h.selected);
    h.autoFloor = selRoom ? selRoom.floor : null;
    // A change in the house sends one scan sweep up the model.
    const snap = JSON.stringify(data.devices.map((d) => [d.id, d.state]));
    if (prev && h.snap && snap !== h.snap && !motionOff()) h.scanT = 0;
    h.snap = snap;
    renderTags(h);
    kick(h);
  };
  return h;
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }

function fail(h, err) {
  h.failed = true;
  console.warn("Hologram unavailable, using the drawn model:", err?.message || err);
  h.container.classList.remove("holo");
  h.wrap.remove(); h.tagLayer.remove(); h.bar.remove(); h.note.remove();
  h.opts.fallback?.();
}

// ---------- zoom bar (same controls as the drawn model) ----------
function buildBar(h) {
  const bar = document.createElement("div");
  bar.className = "map-zoom holo-zoom";
  const button = (label, html, fn, cls) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `map-zoom-btn ${cls}`;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = html;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  h.zoomOutBtn = button("Zoom out", "<span aria-hidden=\"true\">−</span>", () => h.zoomBy(1 / 1.5), "zout");
  h.level = document.createElement("output");
  h.level.className = "map-zoom-level";
  h.zoomInBtn = button("Zoom in", "<span aria-hidden=\"true\">+</span>", () => h.zoomBy(1.5), "zin");
  const fit = button("Show the whole house", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/></svg>`, () => h.reset(), "fit");
  bar.append(h.zoomOutBtn, h.level, h.zoomInBtn, fit);
  if (h.opts.onExpand) bar.append(button("Open the house full screen", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-5.3 5.3-1.4-1.4L17.6 5H14V3ZM3 14h2v3.6l5.3-5.3 1.4 1.4L6.4 19H10v2H3v-7Z"/></svg>`, h.opts.onExpand, "expand"));
  h.container.append(bar);
  h.bar = bar;
  h.zoomBy = () => {};
  h.reset = () => {};
  h.focusRoom = () => {};
  h.setView = () => {};
}

// ---------- renderer, scene, controls ----------
function init(h) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  h.wrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050a13");
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
  scene.add(camera);
  // The Drone Command vignette, carried with the camera.
  const vignette = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vUv; void main(){ float d = distance((vUv - 0.5) * vec2(1.3, 1.0), vec2(0.0, 0.03)); vec3 c = mix(vec3(0.03, 0.09, 0.19), vec3(0.012, 0.024, 0.05), smoothstep(0.0, 0.42, d)); gl_FragColor = vec4(c, 1.0); }",
  }));
  vignette.position.z = -40;
  camera.add(vignette);

  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.35, 0.28);
  composer.addPass(bloom);
  composer.addPass(new THREE.OutputPass());

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI * 0.58;
  controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.autoRotateSpeed = 0.55;
  // One finger up and down still scrolls the page, except full screen.
  renderer.domElement.style.touchAction = h.opts.explorer ? "none" : "pan-y";
  controls.addEventListener("change", () => kick(h));
  controls.addEventListener("start", () => { h.lastTouch = performance.now(); h.flight = null; h.container.classList.add("holo-active"); });
  controls.addEventListener("end", () => { h.lastTouch = performance.now(); h.container.classList.remove("holo-active"); });

  Object.assign(h, { renderer, scene, camera, composer, bloom, controls, scan: { value: -10 } });

  // Tap versus drag: a tap barely moves and picks a room.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || !e.isPrimary || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) { down = null; return; }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...h.rooms.values()].filter((r) => r.group.visible).map((r) => r.pick))[0];
    if (hit) h.opts.onSelect?.(hit.object.userData.room);
  });
  // Keys: + − 0 zoom, arrows orbit.
  h.container.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".map-zoom")) return;
    const orbit = (dx, dy) => { rotate(h, dx, dy); };
    const keys = { "+": () => h.zoomBy(1.5), "=": () => h.zoomBy(1.5), "-": () => h.zoomBy(1 / 1.5), "0": () => h.reset(), ArrowLeft: () => orbit(-0.25, 0), ArrowRight: () => orbit(0.25, 0), ArrowUp: () => orbit(0, -0.15), ArrowDown: () => orbit(0, 0.15) };
    if (!keys[e.key] || e.target.matches?.("input, textarea, select")) return;
    e.preventDefault();
    keys[e.key]();
  });
  // The plain wheel zooms only in the full-screen explorer, so it never traps page scrolling.
  controls.enableZoom = true;
  renderer.domElement.addEventListener("wheel", (e) => { if (!h.opts.explorer && !e.ctrlKey) e.stopImmediatePropagation(); }, { capture: true });

  const resize = () => {
    const w = h.wrap.clientWidth || 1, hh = h.wrap.clientHeight || 1;
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    renderer.setSize(w, hh, false);
    composer.setSize(w, hh);
    bloom.setSize(w, hh);
    kick(h);
  };
  new ResizeObserver(resize).observe(h.wrap);
  resize();
  new IntersectionObserver(([e]) => { h.visible = e.isIntersecting; if (h.visible) kick(h); }).observe(h.container);
  h.container.classList.add("holo-ready");
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(h); });

  h.zoomBy = (k) => {
    const from = h.flight ? h.flight.p1 : camera.position;
    const target = h.flight ? h.flight.t1 : controls.target;
    const off = from.clone().sub(target).multiplyScalar(1 / k);
    const len = THREE.MathUtils.clamp(off.length(), controls.minDistance, controls.maxDistance);
    fly(h, target.clone().add(off.setLength(len)), target.clone(), 380);
  };
  h.reset = () => h.setView("iso");
  h.setView = (name) => {
    const v = viewFor(h, name);
    fly(h, v.pos, v.target);
    h.view = name;
  };
  h.focusRoom = (id) => {
    const r = h.rooms.get(id);
    if (!r) return;
    const dir = camera.position.clone().sub(controls.target).normalize();
    dir.y = Math.max(dir.y, 0.55);
    dir.normalize();
    fly(h, r.center.clone().add(dir.multiplyScalar(r.size * 2.2 + 1.0)), r.center.clone().setY(r.y0 + 0.18));
  };
  h.setSpin = (on) => { h.spin = on; kick(h); };
  // Show one floor (and what's below it), or every floor with null.
  h.setFloor = (id) => { h.floorFilter = id; renderTags(h); kick(h); };
  h.setRoof = (on) => { h.showRoof = on; kick(h); };
}

function rotate(h, dAz, dPol) {
  const off = h.camera.position.clone().sub(h.controls.target);
  const s = new THREE.Spherical().setFromVector3(off);
  s.theta += dAz;
  s.phi = THREE.MathUtils.clamp(s.phi + dPol, h.controls.minPolarAngle, h.controls.maxPolarAngle);
  h.camera.position.copy(h.controls.target).add(new THREE.Vector3().setFromSpherical(s));
  h.controls.update();
  kick(h);
}

function viewFor(h, name) {
  const d = h.fitDist || 10, c = h.fitCenter || new THREE.Vector3();
  const at = (x, y, z) => new THREE.Vector3(c.x + x * d, y * d, c.z + z * d);
  const V = {
    iso: { pos: at(0.53, 0.47, 0.66), target: c.clone().setY(0.08) },
    top: { pos: at(0.0001, 1.0, 0.001), target: c.clone() },
    front: { pos: at(0, 0.17, 1), target: c.clone().setY(0.25) },
    side: { pos: at(1, 0.17, 0), target: c.clone().setY(0.25) },
  };
  return V[name] || V.iso;
}

function fly(h, pos, target, ms = 850) {
  if (h.motionOff()) {
    h.camera.position.copy(pos);
    h.controls.target.copy(target);
    h.controls.update();
    h.flight = null;
  } else {
    h.flight = { p0: h.camera.position.clone(), t0: h.controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
  }
  kick(h);
}

// ---------- the model: any home (web/building.js describes it) ----------
function build(h, data) {
  if (h.house) {
    h.scene.remove(h.house);
    h.house.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }
  const home = normalizeHome({ building: data.building, rooms: data.rooms });
  const style = home.style;
  h.home = home;
  if (home.warnings.length) console.info(`Haven home description: ${home.warnings.join(" ")}`);
  const [bx0, by0, bw0, bd0] = home.bounds;
  const cx = bx0 + bw0 / 2, cy = by0 + bd0 / 2;
  const W2 = (px) => (px - cx) * U, D2 = (py) => (py - cy) * U;
  const HOLO = new THREE.Color("#5ad2ff");
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const house = new THREE.Group();
  const points = [];
  const floorOf = new Map(home.floors.map((f) => [f.id, f]));
  const byFloor = new Map(home.floors.map((f) => [f.id, []]));   // objects to hide with a floor
  h.rooms.clear();

  const makeMats = (edgeOpacity = 0.34, rimOpacity = 0.2) => {
    const edgeU = { uColor: { value: HOLO.clone() }, uOpacity: { value: edgeOpacity }, uScan: h.scan, uFlash: { value: 0 } };
    const rimU = { uColor: { value: HOLO.clone() }, uOpacity: { value: rimOpacity } };
    return {
      edgeU, rimU,
      edgeM: new THREE.ShaderMaterial({ uniforms: edgeU, vertexShader: EDGE_V, fragmentShader: EDGE_F, ...additive }),
      rimM: new THREE.ShaderMaterial({ uniforms: rimU, vertexShader: RIM_V, fragmentShader: RIM_F, ...additive, side: THREE.DoubleSide }),
    };
  };
  // A solid in hologram: rim-lit faces, bright edges, a dusting of points on top.
  const solidIn = (group, mats, geo, px, py, pz, dust = 1, rotY = 0) => {
    const m = new THREE.Mesh(geo, mats.rimM);
    m.position.set(px, py, pz);
    m.rotation.y = rotY;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), mats.edgeM));
    group.add(m);
    if (dust > 0) {
      m.updateMatrixWorld(true);
      geo.computeBoundingBox();
      const b = geo.boundingBox, v = new THREE.Vector3();
      const n = Math.round(8 * dust + 30 * dust * (b.max.x - b.min.x) * (b.max.z - b.min.z) / (U * U) / 10);
      for (let i = 0; i < Math.min(n, 400); i++) {
        v.set(THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random()), b.max.y, THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random())).applyMatrix4(m.matrixWorld);
        points.push(v.x, v.y, v.z);
      }
    }
    return m;
  };
  const lines = (group, mats, pts) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.LineSegments(g, mats.edgeM);
    group.add(l);
    return l;
  };
  // Custom solids from triangles (roofs): non-indexed, so edges come out crisp.
  const tris = (list) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(list.flat(2), 3));
    g.computeVertexNormals();
    return g;
  };
  const shapeOf = (poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(W2(x), -D2(y))));

  // ---------- rooms ----------
  for (const r of home.rooms) {
    const f = floorOf.get(r.floor);
    const y0 = f.elev * U, wallH = f.wall;
    const mats = makeMats();
    const group = new THREE.Group();
    house.add(group);
    byFloor.get(r.floor).push(group);
    const solid = (geo, px, py, pz, dust = 1, rotY = 0) => solidIn(group, mats, geo, px, py, pz, dust, rotY);
    const [x, y, w, d] = r.bbox;
    const inside = (px, py) => r.poly.length === 4 || pointInPoly([px, py], r.poly);
    const box = (bx, by, bw, bd, bh, bz = 0, dust = 1) => {
      if (!inside(bx + bw / 2, by + bd / 2)) return null;
      return solid(new THREE.BoxGeometry(bw * U, bh * U, bd * U), W2(bx + bw / 2), y0 + (bz + bh / 2) * U, D2(by + bd / 2), dust);
    };
    const cyl = (px, py, rad, ch, cz = 0, radTop = rad) => inside(px, py) ? solid(new THREE.CylinderGeometry(radTop * U, rad * U, ch * U, 18), W2(px), y0 + (cz + ch / 2) * U, D2(py), 0.6) : null;
    const plant = (px, py, s = 1) => { if (cyl(px, py, 0.22 * s, 0.45 * s)) solid(new THREE.IcosahedronGeometry(0.42 * s * U, 1), W2(px), y0 + 0.8 * s * U, D2(py), 0.8); };

    // Walls along every edge of the outline: shared stretches are inner walls
    // with a doorway (drawn once, by the room whose id sorts first); the rest
    // are outside walls with the style's windows.
    const others = home.rooms.filter((o) => o !== r && o.floor === r.floor);
    const stretches = sharedStretches(r, others);
    const n = r.poly.length;
    for (let i = 0; i < n; i++) {
      const p = r.poly[i], q = r.poly[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const rot = -Math.atan2(dy, dx);
      const at = (t) => [p[0] + dx * t, p[1] + dy * t];
      // Split the edge into shared and outside pieces.
      const pieces = [];
      let t = 0;
      for (const s of stretches[i]) {
        if (s.lo > t + 1e-6) pieces.push({ a: t, b: s.lo, other: null });
        pieces.push({ a: Math.max(t, s.lo), b: s.hi, other: s.other });
        t = Math.max(t, s.hi);
      }
      if (t < 1 - 1e-6) pieces.push({ a: t, b: 1, other: null });
      for (const pc of pieces) {
        const pl = (pc.b - pc.a) * len;
        if (pl < 0.05) continue;
        if (pc.other && pc.other < r.id) continue;          // the other room draws this wall
        const hgt = pc.other ? wallH * 0.72 : wallH;
        const seg = (ta, tb, hh = hgt, z = 0) => {
          const [sx, sy] = at((ta + tb) / 2), sl = (tb - ta) * len;
          if (sl < 0.05) return;
          solid(new THREE.BoxGeometry(sl * U, hh * U, T * U), W2(sx), y0 + (z + hh / 2) * U, D2(sy), 0.5, rot);
        };
        if (pc.other) {
          // An inner wall, with a doorway in the middle if there's room for one.
          if (pl > 1.4) {
            const mid = (pc.a + pc.b) / 2, half = 0.55 / len;
            seg(pc.a, mid - half);
            seg(mid + half, pc.b);
            seg(mid - half, mid + half, 0.12, 1.15);
          } else seg(pc.a, pc.b);
          continue;
        }
        seg(pc.a, pc.b);
        // Windows in the style of the house.
        const win = style.window, count = Math.floor(pl / win.every);
        for (let k = 1; k <= count; k++) {
          const tc = pc.a + ((pc.b - pc.a) * k) / (count + 1);
          const [wx, wy] = at(tc);
          const ww = Math.min(win.w, pl / (count + 1) * 0.8);
          solid(new THREE.BoxGeometry(ww * U, win.h * U, T * 1.35 * U), W2(wx), y0 + (win.sill + win.h / 2) * U, D2(wy), 0, rot);
          if (style.shutters) for (const side of [-1, 1]) {
            const [sx, sy] = [wx + (dx / len) * side * (ww / 2 + 0.2), wy + (dy / len) * side * (ww / 2 + 0.2)];
            solid(new THREE.BoxGeometry(0.3 * U, win.h * U, T * 1.6 * U), W2(sx), y0 + (win.sill + win.h / 2) * U, D2(sy), 0, rot);
          }
          if (style.arches) {
            // A half-round arch over the window.
            const pts = [], R = ww / 2, top = win.sill + win.h;
            for (let a = 0; a < 12; a++) {
              for (const s of [a, a + 1]) {
                const ang = (s / 12) * Math.PI;
                const ox = Math.cos(ang) * R, oz = Math.sin(ang) * R * 0.8;
                pts.push(new THREE.Vector3(W2(wx + (dx / len) * ox), y0 + (top + oz) * U, D2(wy + (dy / len) * ox)));
              }
            }
            lines(group, mats, pts);
          }
        }
        if (style.clerestory && pl > 2.5) {
          const [wx, wy] = at((pc.a + pc.b) / 2);
          solid(new THREE.BoxGeometry((pl - 1) * U, 0.3 * U, T * 1.35 * U), W2(wx), y0 + (wallH - 0.3) * U, D2(wy), 0, rot);
        }
      }
    }

    // Furniture for what the room is.
    const kind = r.kind;
    if (kind === "kitchen") {
      box(x + 0.3, y + 0.3, 1.0, 0.9, 1.95);
      box(x + 1.4, y + 0.3, w - 1.7, 0.85, 0.88);
      box(x + 1.35, y + 0.25, w - 1.6, 0.95, 0.08, 0.88, 0.3);
      box(x + 1.4, y + 0.3, w - 1.7, 0.45, 0.55, 1.4, 0.5);
      if (w > 4 && d > 3.8) {
        const iw = Math.max(1.4, w * 0.42), ix = x + (w - iw) / 2 + 0.3, iy = y + d * 0.47;
        box(ix, iy, iw, 1.05, 0.88);
        box(ix - 0.08, iy - 0.08, iw + 0.16, 1.46, 0.08, 0.88, 0.3);
        for (let k = 0; k < 3; k++) cyl(ix + 0.46 + (k * (iw - 0.9)) / 2, iy + 1.76, 0.2, 0.66);
      }
      plant(x + w - 0.6, y + d - 0.6, 0.9);
    } else if (kind === "living") {
      box(x + 1.2, y + 2.2, Math.max(1, w - 2.4), Math.max(1, d - 4.4), 0.02, 0, 0.4);
      box(x + w * 0.24, y + 0.3, w * 0.52, 0.5, 0.45);
      box(x + w * 0.29, y + 0.45, w * 0.42, 0.08, 0.95, 0.55, 0.3);
      if (d > 5.5) { box(x + 0.35, y + 2.4, 0.3, d - 5.2, 0.95); box(x + 0.65, y + 2.4, 1.0, d - 5.2, 0.45); }
      box(x + w * 0.36, y + d * 0.4, w * 0.28, 1.1, 0.38);
      box(x + 1.4, y + d - 3.1, w - 2.6, 1.1, 0.45);
      box(x + 1.4, y + d - 2.0, w - 2.6, 0.32, 0.95);
      plant(x + w - 0.8, y + 0.6, 1.15);
      plant(x + 0.6, y + d - 0.8, 0.9);
    } else if (kind === "bedroom") {
      const single = w < 5.5 || d < 4;
      const bw = single ? 1.5 : Math.min(3.2, w * 0.4), bd = Math.min(single ? 3 : 3.8, d - 0.8), bx = x + (w - bw) / 2;
      box(bx - 0.8, y + 1.2, bw + 1.6, bd, 0.02, 0, 0.4);
      if (w > 9) { box(x + 0.7, y + 0.3, 2.0, 0.75, 0.75); box(x + 1.35, y + 1.3, 0.6, 0.6, 0.5); box(x + w - 3.1, y + 0.3, 2.6, 0.75, 1.85); plant(x + w - 0.8, y + d - 0.8); }
      box(bx - 1.0, y + 0.3, 0.72, 0.6, 0.55);
      if (!single) box(bx + bw + 0.28, y + 0.3, 0.72, 0.6, 0.55);
      box(bx, y + 0.25, bw, 0.25, 1.25);
      box(bx, y + 0.5, bw, bd - 0.25, 0.42);
      box(bx + 0.08, y + 0.55, bw - 0.16, bd - 0.4, 0.2, 0.42);
      box(bx + 0.3, y + 0.7, single ? bw - 0.6 : bw / 2 - 0.4, 0.6, 0.16, 0.62, 0.4);
      if (!single) box(bx + bw / 2 + 0.1, y + 0.7, bw / 2 - 0.4, 0.6, 0.16, 0.62, 0.4);
    } else if (kind === "garage") {
      const cars = w >= 9 ? 2 : 1;
      for (let c = 0; c < cars; c++) {
        const cl = Math.min(4.4, d - 2), cw = 2.2, gx = x + (w / cars) * c + (w / cars - cw) / 2 + 0.2, gy = y + 1.1;
        for (const [wx, wy] of [[gx - 0.12, gy + 0.55], [gx - 0.12, gy + cl - 1.35], [gx + cw - 0.18, gy + 0.55], [gx + cw - 0.18, gy + cl - 1.35]]) box(wx, wy, 0.3, 0.8, 0.42, 0, 0.3);
        box(gx, gy, cw, cl, 0.55, 0.2);
        box(gx + 0.18, gy + cl * 0.3, cw - 0.36, cl * 0.42, 0.5, 0.75);
      }
      box(x + 0.3, y + d - 2.9, 0.75, 2.4, 0.9);
    } else if (kind === "utility") {
      box(x + 0.3, y + 0.4, 0.95, 0.95, 1.0);
      if (d > 2.5) box(x + 0.3, y + 1.45, 0.95, 0.95, 1.0);
      cyl(x + w - 0.7, y + 0.8, 0.45, 1.7);
    } else if (kind === "hallway") {
      box(x + 0.5, y + 0.5, Math.max(0.6, w - 1), Math.max(0.6, d - 1), 0.02, 0, 0.4);
      if (w > 3) box(x + w - 2, y + 0.3, 1.4, 0.42, 0.8);
    } else if (kind === "bath") {
      box(x + 0.2, y + 0.2, Math.min(2.4, w - 0.6), 1.0, 0.55);          // tub
      box(x + w - 1.3, y + d - 0.8, 1.0, 0.55, 0.85);                      // vanity
      cyl(x + w - 0.5, y + 0.6, 0.25, 0.45);                               // toilet
    } else if (kind === "office") {
      box(x + 0.4, y + 0.3, Math.min(2.4, w - 1), 0.8, 0.75);
      box(x + 1.0, y + 1.4, 0.6, 0.6, 0.5);
      box(x + w - 0.6, y + 0.3, 0.4, Math.min(2.6, d - 0.6), 1.8);        // shelves
      plant(x + 0.5, y + d - 0.6);
    } else if (kind === "dining") {
      const tw = Math.max(1.4, Math.min(3, w - 2)), tx = x + (w - tw) / 2, ty = y + d / 2 - 0.6;
      box(tx, ty, tw, 1.2, 0.75);
      for (let k = 0; k < 3; k++) for (const cy2 of [ty - 0.6, ty + 1.4]) box(tx + 0.2 + (k * (tw - 0.8)) / 2, cy2, 0.4, 0.4, 0.5, 0, 0.3);
    } else if (kind === "closet") {
      box(x + 0.15, y + 0.15, w - 0.3, 0.5, 1.9, 0, 0.4);
      if (d > 2) box(x + 0.15, y + d - 0.65, w - 0.3, 0.5, 1.9, 0, 0.4);
    } else if (kind === "gym") {
      box(x + 0.6, y + d / 2 - 0.3, 2, 0.6, 0.45);
      box(x + w - 1.2, y + 0.4, 0.8, 1.6, 1.8);
    }

    // Stairs up from a hall or landing when there's a floor above.
    const above = home.floors.find((ff) => ff.level === f.level + 1);
    if (above && kind === "hallway" && !home.rooms.some((o) => o.floor === r.floor && o.kind === "hallway" && o.id < r.id)) {
      const steps = 10, run = Math.min(d - 0.6, 4.2), rise = (f.wall + 0.3) / steps, sw = Math.min(1.1, w - 0.4);
      for (let s = 0; s < steps; s++) box(x + 0.2, y + 0.3 + (run / steps) * s, sw, run / steps, rise, rise * s, 0.1);
    }

    // The floor: its outline in light, a faint grid, a warm glow where lights are on.
    const shape = shapeOf(r.poly);
    const [ccx, ccy] = pointInPoly([x + w / 2, y + d / 2], r.poly) ? [x + w / 2, y + d / 2] : r.poly.reduce((s, pt) => [s[0] + pt[0] / r.poly.length, s[1] + pt[1] / r.poly.length], [0, 0]);
    const floorU = { uColor: { value: HOLO.clone() }, uK: { value: 0.03 }, uUnit: { value: U }, uC: { value: new THREE.Vector2(W2(ccx), -D2(ccy)) }, uR: { value: Math.max(w, d) * U * 0.62 } };
    const floorGeo = new THREE.ShapeGeometry(shape);
    const floor = new THREE.Mesh(floorGeo, new THREE.ShaderMaterial({ uniforms: floorU, vertexShader: FLOOR_V, fragmentShader: FLOOR_F, ...additive, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = y0 + 0.002;
    floor.add(new THREE.LineSegments(new THREE.EdgesGeometry(floorGeo), mats.edgeM));
    house.add(floor);
    byFloor.get(r.floor).push(floor);
    // A column of light under the fixture when the room is lit.
    const beamU = { uColor: { value: new THREE.Color("#ffd27a") }, uK: { value: 0 } };
    const rad = Math.min(w, d) * 0.3 * U;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.35, rad, wallH * U, 40, 1, true), new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: BEAM_V, fragmentShader: BEAM_F, ...additive, side: THREE.DoubleSide }));
    beam.position.set(W2(ccx), y0 + (wallH / 2) * U, D2(ccy));
    house.add(beam);
    byFloor.get(r.floor).push(beam);
    // An invisible volume in the room's own outline, for tapping it.
    const pick = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: wallH * U, bevelEnabled: false }), new THREE.MeshBasicMaterial({ visible: false }));
    pick.rotation.x = -Math.PI / 2;
    pick.position.y = y0;
    pick.userData.room = r.id;
    house.add(pick);
    h.rooms.set(r.id, { id: r.id, name: r.name, floor: r.floor, poly: r.poly, bbox: r.bbox, edgeU: mats.edgeU, rimU: mats.rimU, floorU, beamU, pick, group, floorMesh: floor, beam, y0, wallH, center: new THREE.Vector3(W2(ccx), y0, D2(ccy)), size: Math.max(w, d) * U, W2, D2 });
  }

  // ---------- the shell: roofs, porches, chimney, outdoor features ----------
  const shell = makeMats(0.3, 0.12);
  const roofMats = makeMats(0.3, 0.1);
  const roofGroup = new THREE.Group();
  const shellGroup = new THREE.Group();
  house.add(roofGroup, shellGroup);
  const shellByElev = [];
  const floorsUp = [...home.floors].sort((a, b) => a.level - b.level);
  for (let i = 0; i < floorsUp.length; i++) {
    const f = floorsUp[i], next = floorsUp[i + 1];
    if (!f.bbox || f.level < 0) continue;
    const [fx, fy, fw, fd] = f.bbox;
    const covered = next?.bbox ? (Math.max(0, Math.min(fx + fw, next.bbox[0] + next.bbox[2]) - Math.max(fx, next.bbox[0])) * Math.max(0, Math.min(fy + fd, next.bbox[1] + next.bbox[3]) - Math.max(fy, next.bbox[1]))) / (fw * fd) : 0;
    if (covered > 0.9) continue;
    const top = (f.elev + f.wall) * U;
    const type = style.roof === "none" ? null : next ? (style.roof === "gable" || style.roof === "hip" ? "hip" : style.roof) : style.roof;
    const pitch = next ? style.pitch * 0.55 : style.pitch;
    const g = new THREE.Group();
    roofGroup.add(g);
    shellByElev.push({ elev: f.elev, obj: g, roof: true });
    buildRoof(g, roofMats, type, pitch, style, [fx, fy, fw, fd], top, { W2, D2, tris, solidIn, chimney: style.chimney && !next });
  }
  // Porches: the style's, on the ground floor's front (south) and sides.
  const groundF = home.floors.find((f) => f.level === 0) || home.floors[0];
  const porch = (px, py, pw, pd, sides) => {
    const g = new THREE.Group();
    shellGroup.add(g);
    shellByElev.push({ elev: 0, obj: g });
    const s = (geo, ax, ay, az, dust = 0.4) => solidIn(g, shell, geo, ax, ay, az, dust);
    s(new THREE.BoxGeometry(pw * U, 0.12 * U, pd * U), W2(px + pw / 2), 0.06 * U, D2(py + pd / 2));
    const postH = groundF.wall * 0.92, kind = style.porch?.posts || "square";
    const post = (ax, ay) => {
      if (kind === "round") s(new THREE.CylinderGeometry(0.1 * U, 0.1 * U, postH * U, 12), W2(ax), (postH / 2) * U, D2(ay), 0);
      else if (kind === "tapered") s(new THREE.CylinderGeometry(0.1 * U, 0.2 * U, postH * U, 4), W2(ax), (postH / 2) * U, D2(ay), 0);
      else s(new THREE.BoxGeometry(0.2 * U, postH * U, 0.2 * U), W2(ax), (postH / 2) * U, D2(ay), 0);
    };
    const outer = sides;
    if (outer === "s") for (let k = 0, n2 = Math.max(2, Math.round(pw / 2.4)); k <= n2; k++) post(px + 0.15 + ((pw - 0.3) * k) / n2, py + pd - 0.15);
    if (outer === "e") for (let k = 0, n2 = Math.max(2, Math.round(pd / 2.4)); k <= n2; k++) post(px + pw - 0.15, py + 0.15 + ((pd - 0.3) * k) / n2);
    // A shed roof from the wall down to the posts.
    const hi = groundF.wall * U, lo = postH * U;
    const X0 = W2(px), X1 = W2(px + pw), Z0 = D2(py), Z1 = D2(py + pd);
    const q = outer === "s"
      ? [[X0, hi, Z0], [X1, hi, Z0], [X1, lo, Z1 + 0.1 * U], [X0, lo, Z1 + 0.1 * U]]
      : [[X0, hi, Z0], [X0, hi, Z1], [X1 + 0.1 * U, lo, Z1], [X1 + 0.1 * U, lo, Z0]];
    const m = new THREE.Mesh(tris([[q[0], q[1], q[2]], [q[0], q[2], q[3]]]), roofMats.rimM);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), roofMats.edgeM));
    g.add(m);
  };
  if (style.porch && groundF?.bbox) {
    const [gx, gy, gw, gd] = groundF.bbox, dep = style.porch.depth;
    for (const side of style.porch.sides) {
      if (side === "s") { const pw = gw * (style.porch.partial || 1); porch(gx, gy + gd, pw, dep, "s"); }
      if (side === "e") porch(gx + gw, gy, dep, gd + (style.porch.sides.includes("s") ? dep : 0), "e");
    }
  }
  for (const fe of home.features) {
    const [fx, fy, fw, fd] = fe.plan;
    if (fe.type === "porch") { porch(fx, fy, fw, fd, "s"); continue; }
    const g = new THREE.Group();
    shellGroup.add(g);
    shellByElev.push({ elev: 0, obj: g });
    const s = (geo, ax, ay, az, dust = 0.3) => solidIn(g, shell, geo, ax, ay, az, dust);
    if (fe.type === "deck") {
      s(new THREE.BoxGeometry(fw * U, 0.25 * U, fd * U), W2(fx + fw / 2), 0.125 * U, D2(fy + fd / 2));
      for (let k = 0, n2 = Math.max(2, Math.round((fw + fd) / 1.5)); k <= n2; k++) {
        const t2 = k / n2, onX = t2 < fw / (fw + fd);
        const ax = onX ? fx + fw * (t2 / (fw / (fw + fd))) : fx + fw, ay = onX ? fy + fd : fy + fd * (1 - (t2 - fw / (fw + fd)) / (fd / (fw + fd)));
        s(new THREE.BoxGeometry(0.1 * U, 0.9 * U, 0.1 * U), W2(ax), 0.7 * U, D2(ay), 0);
      }
    } else if (fe.type === "pool") {
      s(new THREE.BoxGeometry(fw * U, 0.1 * U, fd * U), W2(fx + fw / 2), 0.05 * U, D2(fy + fd / 2), 0);
      const water = new THREE.Mesh(new THREE.PlaneGeometry((fw - 0.2) * U, (fd - 0.2) * U), new THREE.MeshBasicMaterial({ color: "#1fa8ff", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(W2(fx + fw / 2), 0.08 * U, D2(fy + fd / 2));
      g.add(water);
    } else {
      // Patio or driveway: a slab outline on the ground.
      s(new THREE.BoxGeometry(fw * U, 0.04 * U, fd * U), W2(fx + fw / 2), 0.02 * U, D2(fy + fd / 2), fe.type === "patio" ? 0.3 : 0);
    }
  }

  // Light dust over every surface.
  const dotTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d"), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.35, "rgba(255,255,255,0.5)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  house.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: dotTex, color: HOLO, size: 0.022, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));

  // The projection floor and its ring, sized to the house.
  const span = Math.hypot(bw0, bd0) * U;
  const lowest = Math.min(0, ...home.floors.map((f) => f.elev)) * U;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 2.6, span * 2.6), new THREE.ShaderMaterial({
    ...additive,
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: GROUND_F,
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = lowest - 0.004;
  house.add(ground);
  const ringMat = new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Group();
  const rr = span * 0.56;
  for (let i = 0; i < 24; i++) ring.add(new THREE.Mesh(new THREE.RingGeometry(rr, rr * 1.025, 8, 1, (i / 24) * Math.PI * 2, (Math.PI * 2 / 24) * 0.6), ringMat));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = lowest;
  house.add(ring);
  const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(bw0 * U * 1.2, bd0 * U * 1.2), new THREE.ShaderMaterial({
    ...additive, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vUv; void main(){ float r = distance(vUv, vec2(0.5)); gl_FragColor = vec4(vec3(0.2, 0.6, 1.0) * 0.035 * smoothstep(0.5, 0.1, r), 1.0); }",
  }));
  scanPlane.rotation.x = -Math.PI / 2;
  scanPlane.visible = false;
  house.add(scanPlane);

  h.scene.add(house);
  const topY = Math.max(...home.floors.map((f) => (f.elev + f.wall) * U)) + (style.roof !== "flat" && style.roof !== "none" ? style.pitch * Math.min(bw0, bd0) * 0.5 * U : 0.1);
  Object.assign(h, { house, ring, scanPlane, roofGroup, roofMats, shellGroup, shellByElev, byFloor, topY, lowest, built: h.sig });
  h.fitCenter = new THREE.Vector3(0, (lowest + topY) * 0.25, 0.05);
  h.fitDist = span * 1.55 + (topY - lowest) * 0.6;
  h.controls.minDistance = span * 0.16;
  h.controls.maxDistance = span * 3.4;
  const v = viewFor(h, "iso");
  h.camera.position.copy(v.pos);
  h.controls.target.copy(v.target);
  h.controls.update();
  h.view = "iso";
  h.container.dataset.style = home.styleId;
  h.container.dataset.floors = String(home.floors.length);
  h.note.hidden = !home.approximate;
  // Room tags need rebuilding for the new rooms.
  for (const t2 of h.tags.values()) t2.remove();
  h.tags.clear();
  h.opts.onBuilt?.(home);
}

// Roofs by type over a footprint [x, y, w, d] at height `top` (world units).
function buildRoof(g, mats, type, pitch, style, [x, y, w, d], top, { W2, D2, tris, solidIn, chimney }) {
  if (!type) return;
  const o = style.overhang;
  const X0 = W2(x - o), X1 = W2(x + w + o), Z0 = D2(y - o), Z1 = D2(y + d + o);
  const add = (geo) => {
    const m = new THREE.Mesh(geo, mats.rimM);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), mats.edgeM));
    g.add(m);
    return m;
  };
  if (type === "flat") {
    solidIn(g, mats, new THREE.BoxGeometry(X1 - X0, 0.1 * U, Z1 - Z0), (X0 + X1) / 2, top + 0.05 * U, (Z0 + Z1) / 2, 0);
    const p = (style.parapet || 0) * U;
    if (p > 0) {
      const th = 0.12 * U, cxm = (X0 + X1) / 2, czm = (Z0 + Z1) / 2;
      solidIn(g, mats, new THREE.BoxGeometry(X1 - X0, p, th), cxm, top + p / 2, Z0, 0);
      solidIn(g, mats, new THREE.BoxGeometry(X1 - X0, p, th), cxm, top + p / 2, Z1, 0);
      solidIn(g, mats, new THREE.BoxGeometry(th, p, Z1 - Z0), X0, top + p / 2, czm, 0);
      solidIn(g, mats, new THREE.BoxGeometry(th, p, Z1 - Z0), X1, top + p / 2, czm, 0);
    }
    return;
  }
  const along = (X1 - X0) >= (Z1 - Z0);             // ridge runs along the longer side
  const span = along ? Z1 - Z0 : X1 - X0;
  const rise = pitch * span * 0.5;
  if (type === "shed") {
    // One slope rising from the front to the back, with side walls.
    const r2 = pitch * (Z1 - Z0);
    const A = [X0, top, Z1], B = [X1, top, Z1], C = [X1, top + r2, Z0], D = [X0, top + r2, Z0], E = [X1, top, Z0], F = [X0, top, Z0];
    add(tris([[A, B, C], [A, C, D], [B, E, C], [A, D, F], [F, E, C], [F, C, D]]));
    return;
  }
  const midZ = (Z0 + Z1) / 2, midX = (X0 + X1) / 2;
  let faces;
  if (type === "gable") {
    faces = along
      ? (() => { const R0 = [X0, top + rise, midZ], R1 = [X1, top + rise, midZ], a = [X0, top, Z0], b = [X1, top, Z0], c = [X1, top, Z1], e = [X0, top, Z1];
        return [[a, b, R1], [a, R1, R0], [e, R0, R1], [e, R1, c], [a, R0, e], [b, c, R1]]; })()
      : (() => { const R0 = [midX, top + rise, Z0], R1 = [midX, top + rise, Z1], a = [X0, top, Z0], b = [X1, top, Z0], c = [X1, top, Z1], e = [X0, top, Z1];
        return [[a, R0, R1], [a, R1, e], [b, c, R1], [b, R1, R0], [a, b, R0], [e, R1, c]]; })();
  } else {
    // Hip: four slopes; the ridge is shorter by the span at each end.
    const inset = span * 0.5;
    faces = along
      ? (() => { const R0 = [Math.min(midX, X0 + inset), top + rise, midZ], R1 = [Math.max(midX, X1 - inset), top + rise, midZ], a = [X0, top, Z0], b = [X1, top, Z0], c = [X1, top, Z1], e = [X0, top, Z1];
        return [[a, b, R1], [a, R1, R0], [e, R0, R1], [e, R1, c], [a, R0, e], [b, c, R1]]; })()
      : (() => { const R0 = [midX, top + rise, Math.min(midZ, Z0 + inset)], R1 = [midX, top + rise, Math.max(midZ, Z1 - inset)], a = [X0, top, Z0], b = [X1, top, Z0], c = [X1, top, Z1], e = [X0, top, Z1];
        return [[a, R0, R1], [a, R1, e], [b, c, R1], [b, R1, R0], [a, b, R0], [e, R1, c]]; })();
  }
  add(tris(faces));
  if (chimney) {
    const chX = along ? X0 + (X1 - X0) * 0.22 : midX + (X1 - X0) * 0.18, chZ = along ? midZ - span * 0.12 : Z0 + (Z1 - Z0) * 0.22;
    const hgt = rise + 0.7 * U;
    solidIn(g, mats, new THREE.BoxGeometry(0.7 * U, hgt, 0.7 * U), chX, top + hgt / 2, chZ, 0);
  }
}

// ---------- tags: real buttons over the canvas ----------
function renderTags(h) {
  const data = h.data;
  if (!data) return;
  // Once built, the drawn rooms (including any laid out automatically); before, the ones with a plan.
  const planned = h.home ? h.home.rooms : data.rooms.filter((r) => r.plan || r.shape);
  const devicesIn = (id) => data.devices.filter((d) => d.room === id);
  const floors = h.home?.floors || [];
  const shown = visibleFloors(h);
  for (const r of planned) {
    let t = h.tags.get(r.id);
    if (!t) {
      t = document.createElement("button");
      t.type = "button";
      t.dataset.room = r.id;
      t.addEventListener("click", () => h.opts.onSelect?.(r.id));
      h.tagLayer.append(t);
      h.tags.set(r.id, t);
    }
    const ds = devicesIn(r.id), lv = levelOf(ds);
    const lights = ds.filter((d) => d.type === "light" && d.state.on).length;
    const note = lv === "FAULT" ? (ds.find(isAlert)?.type === "garage" ? "Door open" : ds.some((d) => d.type === "leak" && d.state.wet) ? "Leak" : "Water off")
      : lv === "WATCH" ? "Unlocked or open" : lights ? `${lights} light${lights === 1 ? "" : "s"} on` : "";
    const th = ds.find((d) => d.type === "thermostat");
    const extra = th ? `${Math.round(th.state.current)}°` : "";
    const text = [note, extra].filter(Boolean).join(" · ");
    t.className = `holo-tag map-room${lv === "FAULT" ? " alert" : ""}${lights ? " lit" : ""}${h.selected === r.id ? " selected" : ""}`;
    t.dataset.level = lv;
    t.setAttribute("aria-pressed", String(h.selected === r.id));
    const fname = floors.length > 1 ? floors.find((f) => f.id === r.floor)?.name : "";
    t.setAttribute("aria-label", [r.name, fname, text].filter(Boolean).join(", "));
    t.hidden = Boolean(shown && !shown.has(r.floor));
    t.innerHTML = `<b>${r.name.replace(/ Room$/, "")}</b>${text ? `<span>${text}</span>` : ""}`;
  }
  // Device tags: the selected room's, or every room's once zoomed in close.
  h.devTags.splice(0).forEach((d) => d.el.remove());
  if (!h.ready) return;
  const detail = h.container.classList.contains("detail");
  for (const r of planned) {
    if (h.selected ? h.selected !== r.id : !detail) continue;
    const room = h.rooms.get(r.id);
    if (!room) continue;
    const ds = devicesIn(r.id).filter((d) => PIN_TYPES.has(d.type));
    if (shown && !shown.has(room.floor)) continue;
    const [x, y, w, d] = room.bbox;
    ds.forEach((dev, i) => {
      const el = document.createElement("div");
      el.className = "holo-tag dev";
      el.dataset.pin = dev.id;
      el.dataset.level = isAlert(dev) ? "FAULT" : isWatch(dev) ? "WATCH" : (dev.type === "light" || dev.type === "fan") && dev.state.on ? "LIT" : "OK";
      el.setAttribute("aria-hidden", "true");
      const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const short = dev.name.replace(new RegExp(`^${esc(r.name)} `), "").replace(new RegExp(`^${esc(r.name.replace(/ Room$/, ""))} `), "") || dev.name;
      el.innerHTML = h.selected === r.id ? `<b>${short}</b><span>${h.opts.describe?.(dev) ?? ""}</span>` : `<b>${short}</b>`;
      h.tagLayer.append(el);
      const k = (i + 1) / (ds.length + 1);
      h.devTags.push({ el, at: new THREE.Vector3(room.W2(x + k * w), room.y0 + (0.95 + (i % 2) * 0.5) * U, room.D2(y + 0.6 + k * (d - 1.2))) });
    });
  }
}

// Which floors are on show: all (null), or the chosen floor and those below it.
function visibleFloors(h) {
  const id = h.floorFilter ?? h.autoFloor;
  if (!id || !h.home) return null;
  const f = h.home.floors.find((x) => x.id === id);
  if (!f) return null;
  return new Set(h.home.floors.filter((x) => x.level <= f.level).map((x) => x.id));
}

// ---------- frame loop: renders only while something changes ----------
function kick(h) {
  h.dirty = true;
  if (!h.raf && h.ready) h.raf = requestAnimationFrame((t) => frame(h, t));
}

const tmp = { v: null };
function frame(h, now) {
  h.raf = 0;
  if (!h.visible || document.hidden || !h.house) return;
  const dt = Math.min(0.05, (now - (h.prev || now)) / 1000);
  h.prev = now;
  let animating = false;
  const still = h.motionOff();

  if (h.flight) {
    const f = h.flight, k = Math.min(1, (now - f.start) / f.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    h.camera.position.lerpVectors(f.p0, f.p1, e);
    h.controls.target.lerpVectors(f.t0, f.t1, e);
    if (k >= 1) h.flight = null;
    animating = true;
  }
  h.controls.autoRotate = h.spin && !still && !h.flight && now - h.lastTouch > 2500;
  if (h.controls.update(dt)) animating = true;
  if (h.controls.autoRotate) animating = true;

  // One scan sweep after a change in the house.
  const top = h.topY + 0.05;
  if (h.scanT >= 0) {
    h.scanT += dt / 1.6;
    h.scan.value = h.lowest + Math.min(1, h.scanT) * (top - h.lowest);
    h.scanPlane.position.y = h.scan.value;
    h.scanPlane.visible = true;
    if (h.scanT >= 1) { h.scanT = -1; h.scan.value = -10; h.scanPlane.visible = false; }
    animating = true;
  }

  const data = h.data, selected = h.selected;
  // Floors: the ones above the one in view are hidden; the roof fades whenever you look inside.
  const shown = visibleFloors(h);
  const focusElev = shown ? Math.max(...h.home.floors.filter((f) => shown.has(f.id)).map((f) => f.elev)) : Infinity;
  for (const [fid, objs] of h.byFloor) for (const o of objs) o.visible = !shown || shown.has(fid);
  for (const s of h.shellByElev) s.obj.visible = (s.elev <= focusElev) && (!s.roof || (h.showRoof && !shown));
  const inside = Boolean(selected) || h.container.classList.contains("detail");
  h.roofMats.edgeU.uOpacity.value = inside ? 0.08 : 0.3;
  h.roofMats.rimU.uOpacity.value = inside ? 0.03 : 0.1;
  const HOLO_C = [0.353, 0.824, 1.0], LIT = [1.0, 0.824, 0.478], RED = [0.973, 0.443, 0.443], AMBER = [0.984, 0.749, 0.141];
  for (const r of h.rooms.values()) {
    const ds = data.devices.filter((d) => d.room === r.id);
    const lv = levelOf(ds), lit = litLevel(ds);
    if (lv === "FAULT" && !still) animating = true;
    const pulse = still ? 1 : lv === "FAULT" ? 0.55 + 0.45 * Math.sin(now / 1000 * 7) : 1;
    const c = lv === "FAULT" ? RED : lv === "WATCH" ? AMBER : HOLO_C;
    r.edgeU.uColor.value.setRGB(...c);
    r.rimU.uColor.value.setRGB(...c);
    r.edgeU.uFlash.value = lv === "FAULT" ? 0.35 * pulse : 0;
    const f = h.home.floors.find((x) => x.id === r.floor);
    const dim = (selected && selected !== r.id) || (shown && f.elev < focusElev);
    r.edgeU.uOpacity.value = dim ? 0.16 : 0.34;
    r.rimU.uOpacity.value = dim ? 0.1 : 0.2;
    r.floorU.uColor.value.setRGB(...(lv === "FAULT" ? RED : lit ? LIT : HOLO_C));
    r.floorU.uK.value = lv === "FAULT" ? 0.16 * pulse : lit ? 0.05 + lit * 0.1 : 0.03;
    r.beamU.uK.value = lit ? 0.018 + lit * 0.03 : 0;
  }

  // Zoom level, for the bar and for "detail" (device tags everywhere).
  const dist = h.camera.position.distanceTo(h.controls.target);
  const zoom = h.fitDist / Math.max(0.001, dist);
  const wasDetail = h.container.classList.contains("detail");
  h.container.dataset.zoom = zoom.toFixed(2);
  h.container.classList.toggle("zoomed", zoom > 1.05);
  h.container.classList.toggle("detail", zoom >= DETAIL);
  h.level.textContent = `${Math.round(zoom * 100)}%`;
  h.zoomOutBtn.disabled = dist >= h.controls.maxDistance - 0.01;
  h.zoomInBtn.disabled = dist <= h.controls.minDistance + 0.01;
  if (wasDetail !== h.container.classList.contains("detail")) renderTags(h);

  // Tags follow their rooms and devices.
  const W = h.wrap.clientWidth, H = h.wrap.clientHeight;
  tmp.v ||= new THREE.Vector3();
  const project = (v) => {
    tmp.v.copy(v).project(h.camera);
    return { off: tmp.v.z > 1 || Math.abs(tmp.v.x) > 1.1 || Math.abs(tmp.v.y) > 1.1, x: (tmp.v.x * 0.5 + 0.5) * W, y: (-tmp.v.y * 0.5 + 0.5) * H };
  };
  const put = (el, p) => {
    el.classList.toggle("off", p.off);
    if (!p.off) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, calc(-100% - 14px))`;
  };
  // Room tags are buttons: step them apart so no two overlap (and each stays a full target).
  const placed = [];
  const roomTags = [...h.tags].map(([id, t]) => {
    const r = h.rooms.get(id);
    return r && !t.hidden ? { t, p: project(new THREE.Vector3(r.center.x, r.y0 + r.wallH * U + 0.1, r.center.z)), w: t.offsetWidth || 80, hgt: t.offsetHeight || 24 } : null;
  }).filter(Boolean).sort((a, b) => a.p.y - b.p.y);
  for (const g of roomTags) {
    if (!g.p.off) {
      const hits = () => placed.some((q) => Math.abs(q.p.x - g.p.x) < (q.w + g.w) / 2 + 4 && Math.abs(q.p.y - g.p.y) < (q.hgt + g.hgt) / 2 + 4);
      for (let k = 0; k < 24 && hits(); k++) g.p.y += 6;
      placed.push(g);
    }
    put(g.t, g.p);
  }
  for (const d of h.devTags) put(d.el, project(d.at));

  h.composer.render();
  h.container.dataset.view = `${h.camera.position.x.toFixed(2)},${h.camera.position.y.toFixed(2)},${h.camera.position.z.toFixed(2)}`;
  h.dirty = false;
  if (animating && !h.raf) h.raf = requestAnimationFrame((t) => frame(h, t));
}
