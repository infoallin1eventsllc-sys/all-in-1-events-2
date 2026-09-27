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
const WALL = 2.1, INNER = 1.5, T = 0.18;
const DETAIL = 2.2;             // zoom at which every room shows its devices
const PIN_TYPES = new Set(["light", "fan", "thermostat", "lock", "garage", "water_valve", "water_heater", "leak", "contact"]);

function kindOf(r) {
  const k = `${r.id} ${r.name}`.toLowerCase();
  if (/garage/.test(k)) return "garage";
  if (/kitchen/.test(k)) return "kitchen";
  if (/bed|primary|nursery|guest/.test(k)) return "bedroom";
  if (/living|family|great|den/.test(k)) return "living";
  if (/utility|laundry|mud/.test(k)) return "utility";
  if (/hall|entry|foyer/.test(k)) return "hallway";
  if (/office|study/.test(k)) return "office";
  if (/dining/.test(k)) return "dining";
  return "room";
}
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
const FLOOR_F = `uniform vec3 uColor; uniform float uK; uniform vec2 uSize; varying vec2 vP;
  void main(){
    vec2 p = vP * uSize;
    vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
    float grid = 1.0 - min(min(g.x, g.y), 1.0);
    float d = distance(vP, vec2(0.5));
    gl_FragColor = vec4(uColor * (uK * smoothstep(0.75, 0.0, d) + grid * 0.05), 1.0);
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

// Where two rooms share a wall: the overlap along it.
function shared(a, b, side) {
  const [ax, ay, aw, ad] = a.plan, [bx, by, bw, bd] = b.plan;
  const span = (lo1, hi1, lo2, hi2) => { const lo = Math.max(lo1, lo2), hi = Math.min(hi1, hi2); return hi - lo > 0.01 ? [lo, hi] : null; };
  if (side === "n" && by + bd === ay) return span(ax, ax + aw, bx, bx + bw);
  if (side === "s" && by === ay + ad) return span(ax, ax + aw, bx, bx + bw);
  if (side === "w" && bx + bw === ax) return span(ay, ay + ad, by, by + bd);
  if (side === "e" && bx === ax + aw) return span(ay, ay + ad, by, by + bd);
  return null;
}

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
    const sig = data.rooms.filter((r) => r.plan).map((r) => `${r.id}:${r.plan.join(",")}`).join("|");
    if (sig !== h.built) build(h, data);
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
  h.wrap.remove(); h.tagLayer.remove(); h.bar.remove();
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
    const hit = ray.intersectObjects([...h.rooms.values()].map((r) => r.pick))[0];
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
    fly(h, r.center.clone().add(dir.multiplyScalar(r.size * 2.2 + 1.0)), r.center.clone().setY(0.18));
  };
  h.setSpin = (on) => { h.spin = on; kick(h); };
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

// ---------- the model ----------
function build(h, data) {
  const planned = data.rooms.filter((r) => r.plan);
  if (h.house) {
    h.scene.remove(h.house);
    h.house.traverse((o) => { o.geometry?.dispose(); if (o.material && !o.material.userData.shared) o.material.dispose?.(); });
  }
  const minX = Math.min(...planned.map((r) => r.plan[0])), minY = Math.min(...planned.map((r) => r.plan[1]));
  const maxX = Math.max(...planned.map((r) => r.plan[0] + r.plan[2])), maxY = Math.max(...planned.map((r) => r.plan[1] + r.plan[3]));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const W2 = (px) => (px - cx) * U, D2 = (py) => (py - cy) * U;
  const HOLO = new THREE.Color("#5ad2ff");
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const house = new THREE.Group();
  const points = [];
  h.rooms.clear();

  for (const r of planned) {
    const [x, y, w, d] = r.plan;
    const edgeU = { uColor: { value: HOLO.clone() }, uOpacity: { value: 0.34 }, uScan: h.scan, uFlash: { value: 0 } };
    const rimU = { uColor: { value: HOLO.clone() }, uOpacity: { value: 0.2 } };
    const edgeM = new THREE.ShaderMaterial({ uniforms: edgeU, vertexShader: EDGE_V, fragmentShader: EDGE_F, ...additive });
    const rimM = new THREE.ShaderMaterial({ uniforms: rimU, vertexShader: RIM_V, fragmentShader: RIM_F, ...additive, side: THREE.DoubleSide });
    edgeM.userData.shared = rimM.userData.shared = false;
    const group = new THREE.Group();
    house.add(group);
    const solid = (geo, px, py, pz, dust = 1) => {
      const m = new THREE.Mesh(geo, rimM);
      m.position.set(px, py, pz);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), edgeM));
      group.add(m);
      if (dust > 0) {
        m.updateMatrixWorld(true);
        geo.computeBoundingBox();
        const b = geo.boundingBox, v = new THREE.Vector3();
        const n = Math.round(8 * dust + 30 * dust * (b.max.x - b.min.x) * (b.max.z - b.min.z) / (U * U) / 10);
        for (let i = 0; i < n; i++) {
          v.set(THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random()), b.max.y, THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random())).applyMatrix4(m.matrixWorld);
          points.push(v.x, v.y, v.z);
        }
      }
      return m;
    };
    const box = (bx, by, bw, bd, bh, bz = 0, dust = 1) => solid(new THREE.BoxGeometry(bw * U, bh * U, bd * U), W2(bx + bw / 2), (bz + bh / 2) * U, D2(by + bd / 2), dust);
    const cyl = (px, py, rad, ch, cz = 0) => solid(new THREE.CylinderGeometry(rad * U, rad * U, ch * U, 18), W2(px), (cz + ch / 2) * U, D2(py), 0.6);
    const plant = (px, py, s = 1) => { cyl(px, py, 0.22 * s, 0.45 * s); solid(new THREE.IcosahedronGeometry(0.42 * s * U, 1), W2(px), (0.8 * s) * U, D2(py), 0.8); };

    // Walls: north and west belong to this room; south and east only on the outside.
    const others = planned.filter((o) => o !== r);
    for (const side of ["n", "w", "s", "e"]) {
      const hit = others.map((o) => shared(r, o, side)).find(Boolean);
      if ((side === "s" || side === "e") && hit) continue;
      const door = hit && hit[1] - hit[0] > 1.4 ? (hit[0] + hit[1]) / 2 : null;
      const hgt = hit ? INNER : WALL;
      const horiz = side === "n" || side === "s";
      const fixed = side === "n" ? y : side === "s" ? y + d : side === "w" ? x : x + w;
      const from = horiz ? x : y, to = horiz ? x + w : y + d;
      for (const [a, b] of door ? [[from, door - 0.55], [door + 0.55, to]] : [[from, to]]) {
        if (b - a < 0.05) continue;
        const len = b - a, mid = (a + b) / 2;
        solid(new THREE.BoxGeometry(horiz ? len * U : T * U, hgt * U, horiz ? T * U : len * U), horiz ? W2(mid) : W2(fixed), (hgt / 2) * U, horiz ? D2(fixed) : D2(mid), 0.5);
      }
      if (door) solid(new THREE.BoxGeometry(horiz ? 1.1 * U : T * U, 0.12 * U, horiz ? T * U : 1.1 * U), horiz ? W2(door) : W2(fixed), 1.2 * U, horiz ? D2(fixed) : D2(door), 0);
      if (!hit) {
        const wl = horiz ? w : d, out = side === "n" || side === "w" ? -0.02 : 0.02;
        const count = Math.max(1, Math.floor(wl / 2.6));
        for (let k = 1; k <= count; k++) {
          const at = (horiz ? x : y) + (wl * k) / (count + 1);
          solid(new THREE.BoxGeometry(horiz ? 1.2 * U : 0.02, 0.9 * U, horiz ? 0.02 : 1.2 * U), horiz ? W2(at) : W2(fixed + out), 1.25 * U, horiz ? D2(fixed + out) : D2(at), 0);
        }
      }
    }

    // Furniture, the same layout as the drawn model (web/map.js).
    const kind = kindOf(r);
    if (kind === "kitchen") {
      box(x + 0.3, y + 0.3, 1.0, 0.9, 1.95);
      box(x + 1.4, y + 0.3, w - 1.7, 0.85, 0.88);
      box(x + 1.35, y + 0.25, w - 1.6, 0.95, 0.08, 0.88, 0.3);
      box(x + 1.4, y + 0.3, w - 1.7, 0.45, 0.55, 1.4, 0.5);
      const iw = Math.max(1.6, w * 0.42), ix = x + (w - iw) / 2 + 0.3, iy = y + d * 0.47;
      box(ix, iy, iw, 1.05, 0.88);
      box(ix - 0.08, iy - 0.08, iw + 0.16, 1.46, 0.08, 0.88, 0.3);
      for (let k = 0; k < 3; k++) cyl(ix + 0.46 + (k * (iw - 0.9)) / 2, iy + 1.76, 0.2, 0.66);
      plant(x + w - 0.6, y + d - 0.6, 0.9);
    } else if (kind === "living") {
      box(x + 1.2, y + 2.2, w - 2.4, d - 4.4, 0.02, 0, 0.4);
      box(x + w * 0.24, y + 0.3, w * 0.52, 0.5, 0.45);
      box(x + w * 0.29, y + 0.45, w * 0.42, 0.08, 0.95, 0.55, 0.3);
      box(x + 0.35, y + 2.4, 0.3, d - 5.2, 0.95);
      box(x + 0.65, y + 2.4, 1.0, d - 5.2, 0.45);
      box(x + w * 0.36, y + d * 0.4, w * 0.28, 1.1, 0.38);
      box(x + 1.4, y + d - 3.1, w - 2.6, 1.1, 0.45);
      box(x + 1.4, y + d - 2.0, w - 2.6, 0.32, 0.95);
      plant(x + w - 0.8, y + 0.6, 1.15);
      plant(x + 0.6, y + d - 0.8, 0.9);
    } else if (kind === "bedroom") {
      const bw = Math.min(3.2, w * 0.4), bd = Math.min(3.8, d - 0.8), bx = x + (w - bw) / 2;
      box(bx - 0.8, y + 1.2, bw + 1.6, bd, 0.02, 0, 0.4);
      if (w > 9) { box(x + 0.7, y + 0.3, 2.0, 0.75, 0.75); box(x + 1.35, y + 1.3, 0.6, 0.6, 0.5); box(x + w - 3.1, y + 0.3, 2.6, 0.75, 1.85); plant(x + w - 0.8, y + d - 0.8); }
      box(bx - 1.0, y + 0.3, 0.72, 0.6, 0.55);
      box(bx + bw + 0.28, y + 0.3, 0.72, 0.6, 0.55);
      box(bx, y + 0.25, bw, 0.25, 1.25);
      box(bx, y + 0.5, bw, bd - 0.25, 0.42);
      box(bx + 0.08, y + 0.55, bw - 0.16, bd - 0.4, 0.2, 0.42);
      box(bx + 0.3, y + 0.7, bw / 2 - 0.4, 0.6, 0.16, 0.62, 0.4);
      box(bx + bw / 2 + 0.1, y + 0.7, bw / 2 - 0.4, 0.6, 0.16, 0.62, 0.4);
    } else if (kind === "garage") {
      const cl = Math.min(4.4, d - 2), cw = 2.2, gx = x + (w - cw) / 2 + 0.4, gy = y + 1.1;
      for (const [wx, wy] of [[gx - 0.12, gy + 0.55], [gx - 0.12, gy + cl - 1.35], [gx + cw - 0.18, gy + 0.55], [gx + cw - 0.18, gy + cl - 1.35]]) box(wx, wy, 0.3, 0.8, 0.42, 0, 0.3);
      box(gx, gy, cw, cl, 0.55, 0.2);
      box(gx + 0.18, gy + cl * 0.3, cw - 0.36, cl * 0.42, 0.5, 0.75);
      box(x + 0.3, y + d - 2.9, 0.75, 2.4, 0.9);
      box(x + w - 0.95, y + d - 1.3, 0.6, 0.85, 1.1);
    } else if (kind === "utility") {
      box(x + 0.3, y + 0.5, 0.95, 0.95, 1.0);
      box(x + 0.3, y + 1.55, 0.95, 0.95, 1.0);
      cyl(x + w - 0.9, y + 0.9, 0.5, 1.7);
    } else if (kind === "hallway") {
      box(x + 0.9, y + 0.8, w - 1.8, d - 1.6, 0.02, 0, 0.4);
      box(x + w - 2.3, y + 0.3, 1.5, 0.42, 0.8);
      plant(x + 0.6, y + 0.6, 0.9);
    } else if (kind === "office") {
      box(x + 0.4, y + 0.3, Math.min(2.4, w - 1), 0.8, 0.75);
      plant(x + w - 0.8, y + 0.6);
    } else if (kind === "dining") {
      const tw = Math.min(3, w - 2);
      box(x + (w - tw) / 2, y + d / 2 - 0.6, tw, 1.2, 0.75);
    }

    // The floor glows warm where lights are on, red on an alert.
    const floorU = { uColor: { value: HOLO.clone() }, uK: { value: 0.03 }, uSize: { value: new THREE.Vector2(w, d) } };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w * U, d * U), new THREE.ShaderMaterial({ uniforms: floorU, vertexShader: FLOOR_V, fragmentShader: FLOOR_F, ...additive }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W2(x + w / 2), 0.002, D2(y + d / 2));
    house.add(floor);
    // A column of light under the fixture when the room is lit.
    const beamU = { uColor: { value: new THREE.Color("#ffd27a") }, uK: { value: 0 } };
    const rad = Math.min(w, d) * 0.3 * U;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.35, rad, WALL * U, 40, 1, true), new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: BEAM_V, fragmentShader: BEAM_F, ...additive, side: THREE.DoubleSide }));
    beam.position.set(W2(x + w / 2), (WALL / 2) * U, D2(y + d / 2));
    house.add(beam);
    // An invisible volume for tapping the room.
    const pick = new THREE.Mesh(new THREE.BoxGeometry(w * U, WALL * U, d * U), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(W2(x + w / 2), (WALL / 2) * U, D2(y + d / 2));
    pick.userData.room = r.id;
    house.add(pick);
    h.rooms.set(r.id, { id: r.id, name: r.name, plan: r.plan, edgeU, rimU, floorU, beamU, pick, center: new THREE.Vector3(W2(x + w / 2), 0, D2(y + d / 2)), size: Math.max(w, d) * U, W2, D2 });
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

  // The projection floor and its ring.
  const span = Math.hypot(maxX - minX, maxY - minY) * U;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 2.6, span * 2.6), new THREE.ShaderMaterial({
    ...additive,
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: GROUND_F,
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.004;
  house.add(ground);
  const ringMat = new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Group();
  const rr = span * 0.56;
  for (let i = 0; i < 24; i++) ring.add(new THREE.Mesh(new THREE.RingGeometry(rr, rr * 1.025, 8, 1, (i / 24) * Math.PI * 2, (Math.PI * 2 / 24) * 0.6), ringMat));
  ring.rotation.x = -Math.PI / 2;
  house.add(ring);
  const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry((maxX - minX) * U * 1.2, (maxY - minY) * U * 1.2), new THREE.ShaderMaterial({
    ...additive, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vUv; void main(){ float r = distance(vUv, vec2(0.5)); gl_FragColor = vec4(vec3(0.2, 0.6, 1.0) * 0.035 * smoothstep(0.5, 0.1, r), 1.0); }",
  }));
  scanPlane.rotation.x = -Math.PI / 2;
  scanPlane.visible = false;
  house.add(scanPlane);

  h.scene.add(house);
  Object.assign(h, { house, ring, scanPlane, built: planned.map((r) => `${r.id}:${r.plan.join(",")}`).join("|") });
  // Camera distance that fits the whole house in view.
  h.fitCenter = new THREE.Vector3(0, 0, 0.05);
  h.fitDist = span * 1.55;
  h.controls.minDistance = span * 0.18;
  h.controls.maxDistance = span * 3.2;
  const v = viewFor(h, "iso");
  h.camera.position.copy(v.pos);
  h.controls.target.copy(v.target);
  h.controls.update();
  h.view = "iso";
  // Room tags need rebuilding for the new rooms.
  for (const t of h.tags.values()) t.remove();
  h.tags.clear();
}

// ---------- tags: real buttons over the canvas ----------
function renderTags(h) {
  const data = h.data;
  if (!data) return;
  const planned = data.rooms.filter((r) => r.plan);
  const devicesIn = (id) => data.devices.filter((d) => d.room === id);
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
    t.setAttribute("aria-label", `${r.name}${text ? `, ${text}` : ""}`);
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
    const [x, y, w, d] = r.plan;
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
      h.devTags.push({ el, at: new THREE.Vector3(room.W2(x + k * w), (0.95 + (i % 2) * 0.5) * U, room.D2(y + 0.6 + k * (d - 1.2))) });
    });
  }
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
  const top = WALL * U + 0.05;
  if (h.scanT >= 0) {
    h.scanT += dt / 1.6;
    h.scan.value = Math.min(1, h.scanT) * top;
    h.scanPlane.position.y = h.scan.value;
    h.scanPlane.visible = true;
    if (h.scanT >= 1) { h.scanT = -1; h.scan.value = -10; h.scanPlane.visible = false; }
    animating = true;
  }

  const data = h.data, selected = h.selected;
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
    const dim = selected && selected !== r.id;
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
    return r ? { t, p: project(new THREE.Vector3(r.center.x, WALL * U + 0.1, r.center.z)), w: t.offsetWidth || 80, hgt: t.offsetHeight || 24 } : null;
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
