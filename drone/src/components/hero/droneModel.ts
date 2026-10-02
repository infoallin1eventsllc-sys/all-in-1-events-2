import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bladeGeometry, grainTexture, halfWidth, hit, lineOnShell, loftGeometry, orient, topY, type LoftSpec } from './sculpt';

/**
 * The Mavic 3-class quadcopter used wherever the console shows an aircraft in 3D
 * (the Overview hero, the survey stage, the health hologram). Sculpted in code
 * (sculpt.ts) so it ships with the app; a purchased glTF of a specific airframe
 * could replace `buildDrone`.
 */

export function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}


const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The fuselage, nose at +x: widest at the front arm hinges, the deck falling away to a rounded nose. */
const BODY: LoftSpec = { rTail: 0.055, rNose: 0.08, secs: [
  { x: -0.40, w: 0.155, ys: -0.005, yt: 0.085, yb: -0.078, n: 3.0 },
  { x: -0.26, w: 0.175, ys: -0.005, yt: 0.112, yb: -0.090, n: 3.3 },
  { x: -0.08, w: 0.195, ys: 0.000, yt: 0.122, yb: -0.096, n: 3.4 },
  { x: 0.10, w: 0.208, ys: 0.004, yt: 0.116, yb: -0.096, n: 3.3 },
  { x: 0.28, w: 0.188, ys: 0.006, yt: 0.092, yb: -0.090, n: 3.0 },
  { x: 0.44, w: 0.150, ys: 0.004, yt: 0.064, yb: -0.078, n: 2.7 },
  { x: 0.54, w: 0.112, ys: 0.000, yt: 0.042, yb: -0.064, n: 2.5 },
] };
/** The battery: a raised pack along the rear deck, its lower edge sunk into the shell. */
const BATTERY: LoftSpec = { rTail: 0.035, rNose: 0.04, secs: [
  { x: -0.39, w: 0.125, ys: 0.050, yt: 0.105, yb: 0.0, n: 3.6 },
  { x: -0.24, w: 0.140, ys: 0.080, yt: 0.135, yb: 0.0, n: 3.8 },
  { x: -0.07, w: 0.145, ys: 0.085, yt: 0.140, yb: 0.0, n: 3.8 },
  { x: 0.02, w: 0.135, ys: 0.080, yt: 0.130, yb: 0.0, n: 3.6 },
] };
/** An arm, along local +x from the hinge (0) to the motor pod (L). */
const armSpec = (L: number): LoftSpec => ({ rTail: 0.016, rNose: 0.03, secs: [
  { x: 0, w: 0.042, ys: 0, yt: 0.03, yb: -0.026, n: 3.4 },
  { x: L * 0.45, w: 0.032, ys: 0, yt: 0.024, yb: -0.021, n: 3.4 },
  { x: L - 0.05, w: 0.036, ys: 0, yt: 0.025, yb: -0.022, n: 3.2 },
] });

/** Arms in prop order: front right, front left, rear left, rear right, so diagonal props turn the same way. */
const ARMS: { root: THREE.Vector3; tip: THREE.Vector3; front: boolean }[] = [
  { root: V(0.2, 0.035, 0.175), tip: V(0.64, 0.035, 0.53), front: true },
  { root: V(0.2, 0.035, -0.175), tip: V(0.64, 0.035, -0.53), front: true },
  { root: V(-0.24, -0.05, -0.16), tip: V(-0.6, -0.04, -0.58), front: false },
  { root: V(-0.24, -0.05, 0.16), tip: V(-0.6, -0.04, 0.58), front: false },
];
const PROP_R = 0.37;

/** Bake every mesh under `root` (but not under `skip`) into one mesh per material, in root's frame. */
function mergeByMaterial(root: THREE.Object3D, skip: THREE.Object3D[] = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), rel = new THREE.Matrix4();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>(), done: THREE.Mesh[] = [];
  const skipped = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (skip.includes(p)) return true; return false; };
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skipped(m)) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const mat = m.material as THREE.Material;
    (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g);
    done.push(m);
  });
  for (const m of done) { m.geometry.dispose(); m.removeFromParent(); }
  // Groups left empty by the bake go too.
  const empties: THREE.Object3D[] = [];
  root.traverse(o => { if (o !== root && !(o as THREE.Mesh).isMesh && !skip.includes(o) && o.children.length === 0) empties.push(o); });
  empties.forEach(o => o.removeFromParent());
  for (const [mat, list] of byMat) { const merged = mergeGeometries(list)!; list.forEach(g => g.dispose()); root.add(new THREE.Mesh(merged, mat)); }
}

/**
 * A Mavic 3-class folding quadcopter, sculpted rather than boxed:
 * - a lofted two-tone fuselage (pale upper shell, graphite chassis, a seam
 *   between) with a raised battery, grip ribs, battery LEDs and a power button;
 * - obstacle sensing all round: stereo pairs front and rear, fisheye windows on
 *   top and the flanks, a downward pair, a time-of-flight window and a landing
 *   light underneath; cooling intakes on the flanks and an exhaust at the tail;
 * - hinged arms that flow into the motor pods, outrunner motors with the copper
 *   stator visible through the bell, folding low-noise props (cambered airfoil,
 *   twist, swept tips, pivot screws, the marked pair as on the real aircraft);
 * - front landing legs, rear pads, navigation lights (red port, green
 *   starboard) and front arm lamps;
 * - a three-axis gimbal on dampers with a main camera and a tele lens.
 * Static parts are merged per material, so a fleet draws in few calls; pass
 * `merge: false` to keep every part as its own mesh (the health hologram
 * outlines and zones them). Local axes: +x forward, +y up, +z right. About 1.1
 * units nose to tail, 1.9 across the props.
 */
export function buildDrone(mats: Record<string, THREE.Material>, blurTex: THREE.Texture, opts: { merge?: boolean } = {}): Built {
  if (opts.merge === false) return sculptDrone(mats, blurTex, false);
  // A fleet shares one sculpted template per material set: every aircraft after the first is a cheap copy sharing its geometry.
  let t = templates.get(mats);
  if (!t || t.blurTex !== blurTex) { t = { built: sculptDrone(mats, blurTex, true), blurTex }; templates.set(mats, t); }
  const group = t.built.group.clone(true);
  const props = t.built.props.map(p => group.children[t!.built.group.children.indexOf(p)] as THREE.Group);
  const blur = t.built.blur.map((b, i) => props[i].children[t!.built.props[i].children.indexOf(b)] as THREE.Mesh);
  return { group, props, blur };
}
type Built = { group: THREE.Group; props: THREE.Group[]; blur: THREE.Mesh[] };
const templates = new WeakMap<Record<string, THREE.Material>, { built: Built; blurTex: THREE.Texture }>();

function sculptDrone(mats: Record<string, THREE.Material>, blurTex: THREE.Texture, merge: boolean): Built {
  const M = mats;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); parent.add(mesh); return mesh;
  };
  const along = (o: THREE.Object3D, p: THREE.Vector3, n: THREE.Vector3) => { orient(o, p, n); g.add(o); return o; };

  // --- Fuselage: pale shell over a graphite chassis, a dark seam where they meet, the battery on the deck.
  add(loftGeometry(BODY, { theta0: 0, theta1: Math.PI, along: 44, around: 40 }), M.white);
  add(loftGeometry(BODY, { theta0: Math.PI, theta1: Math.PI * 2, along: 44, around: 40 }), M.graphite);
  for (const c of [0, Math.PI]) add(loftGeometry(BODY, { theta0: c - 0.05, theta1: c + 0.05, along: 44, around: 2, grow: 0.0015 }), M.seam);
  add(loftGeometry(BATTERY, { theta0: 0, theta1: Math.PI, along: 28, around: 28, cap: 7 }), M.graphite);
  // The battery's outline where it meets the shell, and grip ribs across its tail.
  const halfWidthWhereMeets = (x: number) => { let z = 0; while (z < 0.2 && topY(BATTERY, x, z) > topY(BODY, x, z)) z += 0.002; return z; };
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) { const x = -0.42 + (0.47 * k) / 16; const z = s * (halfWidthWhereMeets(x)); pts.push(V(x, topY(BODY, x, z) + 0.001, z)); }
    add(lineOnShell(pts, 0.0018), M.seam);
  }
  for (let k = 0; k < 6; k++) {
    const x = -0.405 + k * 0.016, y = topY(BATTERY, x, 0);
    add(new THREE.BoxGeometry(0.006, 0.005, 0.18), M.rubber, x, y + 0.0015, 0);
  }
  // Battery level LEDs and the power button on the battery's tail.
  for (let k = 0; k < 4; k++) { const { p, n } = hit(BATTERY, V(-1, 0.095, -0.06 + k * 0.022), V(1, 0, 0)); along(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 12).rotateZ(Math.PI / 2), M.battLed), p, n); }
  { const { p, n } = hit(BATTERY, V(-1, 0.095, 0.055), V(1, 0, 0)); along(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 20).rotateZ(Math.PI / 2), M.metal), p, n); }
  // Panel lines across the deck.
  for (const x of [0.06, 0.34]) {
    const pts: THREE.Vector3[] = [];
    const w = halfWidth(BODY, x) * 0.96;
    for (let k = 0; k <= 20; k++) { const z = -w + (2 * w * k) / 20; pts.push(V(x, topY(BODY, x, z) + 0.0008, z)); }
    add(lineOnShell(pts, 0.0014), M.seam);
  }

  // --- Obstacle sensing.
  const stereo = (p: THREE.Vector3, n: THREE.Vector3) => {
    const s = new THREE.Group();
    add(new RoundedBoxGeometry(0.01, 0.026, 0.034, 2, 0.008), M.sensor, 0, 0, 0, 0, 0, 0, s);
    add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 24), M.lens, 0.004, 0, 0, 0, 0, Math.PI / 2, s);
    add(new THREE.TorusGeometry(0.0092, 0.001, 6, 28), M.bezel, 0.0062, 0, 0, 0, Math.PI / 2, 0, s);
    add(new THREE.CircleGeometry(0.003, 16), M.coating, 0.0074, 0, 0, 0, Math.PI / 2, 0, s);
    return along(s, p, n);
  };
  for (const z of [-0.07, 0.07]) { const h = hit(BODY, V(1, 0.004, z), V(-1, 0, 0)); stereo(h.p, h.n); }        // forward stereo pair, one camera each side
  for (const z of [-0.06, 0.06]) { const h = hit(BODY, V(-1, 0.028, z), V(1, 0, 0)); stereo(h.p, h.n); }        // rearward pair, under the battery
  const dome = (p: THREE.Vector3, n: THREE.Vector3, r: number) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), M.sensor);
    d.scale.set(r * 0.45, r, r); along(d, p, n);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.0012, 6, 28).rotateY(Math.PI / 2), M.seam); along(ring, p, n);
  };
  for (const z of [-0.045, 0.045]) { const h = hit(BODY, V(0.36, 1, z), V(0, -1, 0)); dome(h.p, h.n, 0.013); }    // upward fisheyes
  for (const s of [-1, 1]) { const h = hit(BODY, V(0.33, 0.02, s), V(0, 0, -s)); dome(h.p, h.n, 0.012); }      // lateral fisheyes
  for (const z of [-0.045, 0.045]) { const h = hit(BODY, V(0.2, -1, z), V(0, 1, 0)); dome(h.p, h.n, 0.012); }     // downward pair
  { // time-of-flight window, and the downward landing light
    const h = hit(BODY, V(0.07, -1, 0), V(0, 1, 0));
    along(new THREE.Mesh(new RoundedBoxGeometry(0.008, 0.028, 0.05, 3, 0.006), M.sensor), h.p, h.n);
    const l = hit(BODY, V(-0.2, -1, 0), V(0, 1, 0));
    along(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 24).rotateZ(Math.PI / 2), M.lamp), l.p, l.n);
    along(new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0018, 6, 28).rotateY(Math.PI / 2), M.metal), l.p, l.n);
  }
  // Cooling intakes on the flanks: a dark recess with angled slats. Exhaust grille at the tail.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const x = 0.2 + k * 0.022, h = hit(BODY, V(x, -0.035, s), V(0, 0, -s));
      along(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.016), M.seam), h.p, h.n);
      const slat = along(new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.03, 0.005), M.graphite), h.p.clone().addScaledVector(h.n, 0.001), h.n);
      slat.rotateY(0.5 * s);
    }
  }
  for (let k = 0; k < 6; k++) { const h = hit(BODY, V(-1, -0.045, -0.05 + k * 0.02), V(1, 0, 0)); along(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.01), M.seam), h.p, h.n); }
  // Screws on the chassis.
  for (const [x, z] of [[0.28, 0.12], [0.28, -0.12], [-0.3, 0.12], [-0.3, -0.12], [0.0, 0.14], [0.0, -0.14]]) {
    const h = hit(BODY, V(x, -1, z), V(0, 1, 0));
    along(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 12).rotateZ(Math.PI / 2), M.metal), h.p, h.n);
  }

  // --- Arms, motors, legs and props.
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  const blades = { [1]: bladeGeometry(PROP_R, 0.042, 1, 22, 9), [-1]: bladeGeometry(PROP_R, 0.042, -1, 22, 9) } as Record<number, THREE.BufferGeometry>;
  const podGeo = new THREE.LatheGeometry([[0, -0.03], [0.04, -0.03], [0.056, -0.025], [0.062, -0.012], [0.064, 0.008], [0.061, 0.019], [0.053, 0.024], [0, 0.024]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const discGeo = new THREE.CircleGeometry(PROP_R + 0.01, 48);
  ARMS.forEach(({ root, tip, front }, k) => {
    const dir = tip.clone().sub(root), L = dir.length() - 0.05; dir.normalize();
    // The arm: a tapered two-tone beam from a hinge on the body to the motor pod.
    const up = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize(), side = new THREE.Vector3().crossVectors(dir, up);
    const arm = new THREE.Group(); arm.position.copy(root); arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, side)); g.add(arm);
    const spec = armSpec(L);
    add(loftGeometry(spec, { theta0: 0, theta1: Math.PI, along: 16, around: 18, cap: 5 }), M.white, 0, 0, 0, 0, 0, 0, arm);
    add(loftGeometry(spec, { theta0: Math.PI, theta1: Math.PI * 2, along: 16, around: 18, cap: 5 }), M.graphite, 0, 0, 0, 0, 0, 0, arm);
    // Fold hinge: a graphite knuckle with a steel pin cap, seated on the body.
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 20), M.graphite, root.x, root.y, root.z);
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 24), M.metal, root.x, root.y + 0.026, root.z);
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 6), M.seam, root.x, root.y + 0.0285, root.z);
    // Motor pod, and the stator base it carries.
    add(podGeo, M.white, tip.x, tip.y, tip.z);
    add(new THREE.CylinderGeometry(0.054, 0.054, 0.003, 28), M.seam, tip.x, tip.y + 0.0245, tip.z);
    add(new THREE.CylinderGeometry(0.05, 0.052, 0.008, 28), M.graphite, tip.x, tip.y + 0.029, tip.z);
    const outward = V(dir.x, 0, dir.z).normalize(), yaw = -Math.atan2(outward.z, outward.x);
    if (front) {
      // Landing leg under the pod (the antennas live in these), a lamp at its front, a rubber foot.
      const leg = new THREE.Shape();
      leg.moveTo(-0.03, 0); leg.lineTo(0.026, 0); leg.quadraticCurveTo(0.02, -0.06, 0.01, -0.108); leg.quadraticCurveTo(0.003, -0.118, -0.005, -0.11); leg.quadraticCurveTo(-0.02, -0.05, -0.03, 0);
      const legGeo = new THREE.ExtrudeGeometry(leg, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 16 }).translate(0, 0, -0.005);
      add(legGeo, M.skid, tip.x, tip.y - 0.024, tip.z, 0, yaw, 0);
      add(new THREE.SphereGeometry(0.009, 12, 8), M.rubber, tip.x + outward.x * 0.002, tip.y - 0.024 - 0.111, tip.z + outward.z * 0.002);
      add(new THREE.SphereGeometry(0.009, 14, 10), M.ledFront, tip.x + 0.05, tip.y - 0.012, tip.z);
    } else {
      // Rear: a rubber pad under the pod and the navigation light on its outer flank (red port, green starboard).
      add(new RoundedBoxGeometry(0.05, 0.012, 0.03, 2, 0.005), M.rubber, tip.x, tip.y - 0.034, tip.z, 0, yaw, 0);
      add(new THREE.SphereGeometry(0.0105, 14, 10), tip.z > 0 ? M.ledGreen : M.ledRed, tip.x - 0.03, tip.y - 0.016, tip.z + Math.sign(tip.z) * 0.045);
    }

    // The rotating parts: the bell (copper stator showing between its spokes), mount plate, two folding blades.
    const hand = k % 2 ? -1 : 1;
    const prop = new THREE.Group(); prop.position.set(tip.x, tip.y + 0.078, tip.z);
    add(new THREE.CylinderGeometry(0.044, 0.044, 0.034, 20), M.copper, 0, -0.026, 0, 0, 0, 0, prop);
    for (let r = 0; r < 9; r++) { const a = (r / 9) * Math.PI * 2; add(new THREE.BoxGeometry(0.0125, 0.034, 0.005), M.bell, Math.cos(a) * 0.0495, -0.026, Math.sin(a) * 0.0495, 0, -a + Math.PI / 2, 0, prop); }
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.007, 28), M.bell, 0, -0.045, 0, 0, 0, 0, prop);
    add(new THREE.CylinderGeometry(0.047, 0.052, 0.009, 28), M.bell, 0, -0.0085, 0, 0, 0, 0, prop);
    for (let r = 0; r < 3; r++) { const a = (r / 3) * Math.PI * 2 + 0.5; add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8), M.metal, Math.cos(a) * 0.037, -0.0035, Math.sin(a) * 0.037, 0, 0, 0, prop); }
    add(new RoundedBoxGeometry(0.11, 0.008, 0.03, 2, 0.004), M.blade, 0, 0.001, 0, 0, 0, 0, prop);
    const marked = k === 1 || k === 3;                                  // one diagonal pair carries the marks, as on the real props
    for (let b = 0; b < 2; b++) {
      const blade = new THREE.Group(); blade.rotation.y = b * Math.PI; prop.add(blade);
      add(blades[hand], M.blade, 0, 0.002, 0, 0, 0, 0, blade);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 20), M.graphite, 0.045, 0.004, 0, 0, 0, 0, blade);        // pivot boss
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 10), M.metal, 0.045, 0.0105, 0, 0, 0, 0, blade);          // pivot screw
      if (marked) add(new THREE.BoxGeometry(0.03, 0.0012, 0.004), M.mark, 0.085, 0.012, 0, 0, 0, 0, blade);
    }
    add(new THREE.CylinderGeometry(0.018, 0.021, 0.012, 24), marked ? M.metal : M.graphite, 0, 0.008, 0, 0, 0, 0, prop);    // lock cap
    const cap = add(new THREE.SphereGeometry(0.016, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), marked ? M.metal : M.graphite, 0, 0.014, 0, 0, 0, 0, prop); cap.scale.y = 0.45;
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: blurTex, color: 0x8c949e, transparent: true, opacity: 0.2, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.006; prop.add(disc);
    g.add(prop); props.push(prop); blur.push(disc);
  });

  // --- Gimbal under the nose: damper plate, yaw motor, a bracket to the roll motor, the pitch yoke, the camera head.
  add(new RoundedBoxGeometry(0.09, 0.01, 0.12, 2, 0.004), M.graphite, 0.47, -0.094, 0);
  for (const [dx, dz] of [[-0.03, -0.045], [-0.03, 0.045], [0.03, -0.045], [0.03, 0.045]]) add(new THREE.SphereGeometry(0.0105, 14, 10), M.rubber, 0.47 + dx, -0.083, dz);
  add(new THREE.CylinderGeometry(0.026, 0.026, 0.028, 32), M.graphite, 0.49, -0.114, 0);
  add(new THREE.TorusGeometry(0.026, 0.0018, 8, 32), M.metal, 0.49, -0.1, 0, Math.PI / 2);
  add(new RoundedBoxGeometry(0.026, 0.07, 0.03, 2, 0.01), M.graphite, 0.49, -0.155, 0);
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.026, 32), M.graphite, 0.5, -0.19, 0, 0, 0, Math.PI / 2);          // roll motor
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.002, 24), M.metal, 0.487, -0.19, 0, 0, 0, Math.PI / 2);
  add(new RoundedBoxGeometry(0.06, 0.02, 0.012, 2, 0.005), M.graphite, 0.53, -0.19, -0.05);                       // pitch yoke
  add(new RoundedBoxGeometry(0.012, 0.02, 0.05, 2, 0.005), M.graphite, 0.505, -0.19, -0.03);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 28), M.graphite, 0.56, -0.19, -0.05, Math.PI / 2);             // pitch motor
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.002, 20), M.metal, 0.56, -0.19, -0.059, Math.PI / 2);
  const head = new THREE.Group(); head.position.set(0.56, -0.19, 0.0); head.rotation.z = -0.22; g.add(head);         // nose a little down
  add(new RoundedBoxGeometry(0.072, 0.066, 0.084, 3, 0.016), M.graphite, 0, 0, 0, 0, 0, 0, head);
  add(new RoundedBoxGeometry(0.004, 0.06, 0.078, 2, 0.002), M.seam, 0.006, 0, 0, 0, 0, 0, head);
  const lens = (x: number, y: number, z: number, r: number) => {
    add(new THREE.CylinderGeometry(r * 1.18, r * 1.25, 0.016, 32), M.graphite, x, y, z, 0, 0, -Math.PI / 2, head);
    add(new THREE.TorusGeometry(r * 1.1, r * 0.07, 8, 32), M.bezel, x + 0.008, y, z, 0, Math.PI / 2, 0, head);
    const glass = add(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, 0.75).rotateZ(-Math.PI / 2), M.lens, x + 0.008 - r * Math.cos(0.75), y, z, 0, 0, 0, head); glass.scale.x = 0.7;
    add(new THREE.TorusGeometry(r * 0.55, r * 0.05, 6, 28), M.coating, x + 0.009, y, z, 0, Math.PI / 2, 0, head);
  };
  lens(0.036, -0.004, 0.012, 0.024);                                                                                 // main camera
  lens(0.036, 0.02, -0.024, 0.01);                                                                                   // tele

  if (merge) {
    mergeByMaterial(g, props);
    for (const p of props) mergeByMaterial(p, blur);
  }
  return { group: g, props, blur };
}

/** Materials for one fleet; share the record across aircraft. */
export function droneMaterials(): Record<string, THREE.Material> {
  const grain = grainTexture();
  const mats: Record<string, THREE.Material> = {
    white: new THREE.MeshPhysicalMaterial({ color: 0xc2c7cd, metalness: 0, roughness: 0.95, roughnessMap: grain, bumpMap: grain, bumpScale: 0.04, clearcoat: 0.1, clearcoatRoughness: 0.4 }),
    graphite: new THREE.MeshPhysicalMaterial({ color: 0x2a2e34, metalness: 0.05, roughness: 1, roughnessMap: grain, bumpMap: grain, bumpScale: 0.04, clearcoat: 0.08, clearcoatRoughness: 0.5 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.35, roughness: 0.42 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.1, roughness: 0.85 }),
    logo: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.4, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc3c8cf, metalness: 0.95, roughness: 0.28 }),
    skid: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.1, roughness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0, roughness: 0.95 }),
    sensor: new THREE.MeshPhysicalMaterial({ color: 0x07090d, metalness: 0.1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x060c18, metalness: 0.05, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4 }),
    coating: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.3, 0.75), transparent: true, opacity: 0.4, toneMapped: false }),
    blade: new THREE.MeshPhysicalMaterial({ color: 0x16181b, metalness: 0, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
    bell: new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.75, roughness: 0.3 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x6e4222, metalness: 1, roughness: 0.5 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.85, roughness: 0.35 }),
    mark: new THREE.MeshStandardMaterial({ color: 0xd9dce1, metalness: 0.3, roughness: 0.45 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.3, 1.2), toneMapped: false }),
    battLed: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.9, 0.6), toneMapped: false }),
    ledFront: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.9, 2.4), toneMapped: false }),
    ledGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.7), toneMapped: false }),
    ledRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.25, 0.2), toneMapped: false }),
  };
  return mats;
}

/** Twill carbon weave for Ember's side panels and arm undersides: satin, so it reads as texture, not glare. */
function carbonTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#15171b'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const along = (x + y) % 2 === 0;
    const gr = along ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
    gr.addColorStop(0, '#1b1e23'); gr.addColorStop(0.5, '#2e3239'); gr.addColorStop(1, '#1b1e23');
    g.fillStyle = gr; g.fillRect(x * 8 + 0.5, y * 8 + 0.5, 7, 7);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.anisotropy = 4; return t;
}

/**
 * Materials for Ember (buildEmber): gloss white paint, satin carbon, black
 * composite props with white tip stripes, dark glass, gunmetal, and a blue LED
 * light. Same keys the hero reads (white, graphite, blade, ledFront ...), so it
 * drops into the hero as a sample look.
 */
export function emberMaterials(): Record<string, THREE.Material> {
  const m = droneMaterials();
  const blue = new THREE.Color(0.25, 0.62, 2.6);
  m.white = new THREE.MeshPhysicalMaterial({ color: 0xc6cacf, metalness: 0, roughness: 0.5, specularIntensity: 0.32, clearcoat: 0.22, clearcoatRoughness: 0.35 });
  m.graphite = new THREE.MeshPhysicalMaterial({ color: 0x1c1f24, metalness: 0.1, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  m.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTexture(), metalness: 0.15, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  m.glass = new THREE.MeshPhysicalMaterial({ color: 0x07090d, metalness: 0.2, roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 0.9 });
  m.gunmetal = new THREE.MeshStandardMaterial({ color: 0x3c4148, metalness: 0.8, roughness: 0.38 });
  m.blade = new THREE.MeshPhysicalMaterial({ color: 0x121417, metalness: 0.05, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  m.stripe = new THREE.MeshStandardMaterial({ color: 0xc6cacf, roughness: 0.5, side: THREE.DoubleSide });
  m.glow = new THREE.MeshBasicMaterial({ color: blue, toneMapped: false });
  m.ledFront = m.glow;
  return m;
}

/** Low-detail build for fleets (the light show): fewer curve and ring segments, no motor fins or screws. Set only while emberFleet builds. */
let LITE = false;

/** A plan-view outline (x forward, y = right) extruded upward: local y from 0 to about depth + 2 * bevel. */
function slab(shape: THREE.Shape, depth: number, bevel: number, segs = 5): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: LITE ? Math.min(segs, 2) : segs, curveSegments: LITE ? 8 : 40 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, bevel, 0);
  return geo;
}

/** Ember's fuselage outline: a rounded arrowhead, widest just ahead of centre, a squared tail. Scaled about the origin. */
function emberOutline(k = 1, dx = 0): THREE.Shape {
  const p = (x: number, y: number): [number, number] => [x * k + dx, y * k];
  const s = new THREE.Shape();
  s.moveTo(...p(0.54, 0));
  s.quadraticCurveTo(...p(0.47, 0.15), ...p(0.22, 0.215));
  s.quadraticCurveTo(...p(0, 0.25), ...p(-0.3, 0.2));
  s.quadraticCurveTo(...p(-0.47, 0.18), ...p(-0.47, 0.09));
  s.lineTo(...p(-0.47, -0.09));
  s.quadraticCurveTo(...p(-0.47, -0.18), ...p(-0.3, -0.2));
  s.quadraticCurveTo(...p(0, -0.25), ...p(0.22, -0.215));
  s.quadraticCurveTo(...p(0.47, -0.15), ...p(0.54, 0));
  return s;
}

/**
 * Ember, an original quad for the hero sample, finished like a production
 * aircraft: a gloss-white arrowhead shell over a carbon belly with a panel seam
 * between them, a raised dorsal hump with a sensor window, carbon side panels
 * and cooling slots, a gimballed camera with a blue-coated lens under the nose
 * and a blue LED bar beneath it, hinged arms (white over carbon) out to white
 * motor housings with finned motors, folding black props with white tip stripes,
 * a landing leg with a rubber foot under each motor, and red and green
 * navigation lights at the back. Local axes as buildDrone: +x forward, +y up, +z right.
 */
export function buildEmber(M: Record<string, THREE.Material>, blurTex: THREE.Texture): { group: THREE.Group; props: THREE.Group[]; blur: THREE.Mesh[] } {
  const g = new THREE.Group();
  const q = (n: number) => (LITE ? Math.max(5, Math.round(n / 3)) : n);
  const UP = new THREE.Vector3(0, 1, 0);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  const rod = (m: THREE.Material, r0: number, r1: number, a: THREE.Vector3, b: THREE.Vector3, parent: THREE.Object3D = g) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), q(14)), m);
    o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); parent.add(o); return o;
  };

  // Fuselage: carbon belly, white shell, a thin dark seam where they meet.
  add(slab(emberOutline(0.94), 0.05, 0.03), M.carbon, 0, -0.14, 0);
  add(slab(emberOutline(0.965), 0.004, 0.004, 1), M.seam, 0, -0.066, 0);
  add(slab(emberOutline(1), 0.06, 0.05, 6), M.white, 0, -0.062, 0);
  // Dorsal hump: a long rounded ridge, with a small dark sensor window on its brow.
  const hump = add(new THREE.SphereGeometry(1, q(48), q(24), 0, Math.PI * 2, 0, Math.PI / 2), M.white, -0.06, 0.07, 0); hump.scale.set(0.34, 0.075, 0.15);
  const win = add(new THREE.SphereGeometry(1, q(32), q(16), 0, Math.PI * 2, 0, Math.PI / 2), M.glass, 0.19, 0.108, 0, 0, 0, -0.5); win.scale.set(0.05, 0.02, 0.05);
  // Forward obstacle sensors: a pair of dark glass pills set into the nose.
  for (const s of [-1, 1]) { const pill = add(new THREE.CapsuleGeometry(0.014, 0.03, 6, 16), M.glass, 0.562, 0.02, s * 0.06, Math.PI / 2, s * 0.35, 0); pill.scale.set(0.6, 1, 1); }
  // Carbon side panels on the flanks, cooling slots across the tail deck.
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.04, 0.006), M.carbon, -0.02, 0.018, s * 0.293, 0, s * 0.05, 0);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.009, 0.004, 0.13 - k * 0.012), M.seam, -0.3 - k * 0.032, 0.0985, 0);
  // Gimbal under the nose: yoke, camera housing, lens in a blue-coated ring.
  add(new THREE.CylinderGeometry(0.03, 0.036, 0.04, q(20)), M.graphite, 0.4, -0.15, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.08, 0.012), M.graphite, 0.42, -0.2, s * 0.058);
  const cam = add(new THREE.SphereGeometry(0.058, q(32), q(24)), M.white, 0.43, -0.215, 0); cam.scale.set(1.05, 0.92, 0.95);
  add(new THREE.CylinderGeometry(0.036, 0.04, 0.03, q(32)), M.graphite, 0.482, -0.215, 0, 0, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(0.028, 0.004, q(10), q(32)), M.coating, 0.498, -0.215, 0, 0, Math.PI / 2, 0);
  add(new THREE.CylinderGeometry(0.026, 0.026, 0.006, q(32)), M.lens, 0.497, -0.215, 0, 0, 0, Math.PI / 2);
  // LED bar under the chin: a dark housing with a row of blue lamps.
  add(new RoundedBoxGeometry(0.05, 0.03, 0.24, 3, 0.01), M.graphite, 0.4, -0.285, 0);
  for (let k = 0; k < 6; k++) add(new THREE.SphereGeometry(0.009, q(12), q(8)), M.glow, 0.426, -0.287, -0.1 + k * 0.04);
  // Navigation lights at the back corners, a status lamp on the tail.
  add(new THREE.SphereGeometry(0.012, q(12), q(8)), M.ledRed, -0.47, -0.03, -0.1);
  add(new THREE.SphereGeometry(0.012, q(12), q(8)), M.ledGreen, -0.47, -0.03, 0.1);
  add(new THREE.BoxGeometry(0.004, 0.012, 0.05), M.glow, -0.478, 0.0, 0);
  // Screws on the belly plate.
  if (!LITE) for (const [x, z] of [[0.25, 0.14], [0.25, -0.14], [-0.3, 0.13], [-0.3, -0.13]]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.004, q(10)), M.metal, x, -0.142, z);

  // Arms, motors, legs and props.
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  const R = 0.4;
  // Low-noise blades: cambered airfoil, twist, swept tip (sculpt.ts), one pair per turning direction.
  const bladeGeos = { [1]: bladeGeometry(R, 0.03, 1, LITE ? 10 : 22, LITE ? 5 : 9), [-1]: bladeGeometry(R, 0.03, -1, LITE ? 10 : 22, LITE ? 5 : 9) } as Record<number, THREE.BufferGeometry>;
  const stripe = { from: 0.8, to: 0.87, inflate: 0.0006 };
  const stripeGeos = { [1]: bladeGeometry(R, 0.03, 1, 3, LITE ? 5 : 9, stripe), [-1]: bladeGeometry(R, 0.03, -1, 3, LITE ? 5 : 9, stripe) } as Record<number, THREE.BufferGeometry>;
  const discGeo = new THREE.CircleGeometry(R + 0.01, q(48));
  [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(([fx, fz], pk) => {
    const root = new THREE.Vector3(fx * 0.14, -0.03, fz * 0.17);
    const tip = new THREE.Vector3(fx * 0.52, 0.0, fz * 0.58);
    const d = tip.clone().sub(root), L = Math.hypot(d.x, d.z);
    const arm = new THREE.Group(); arm.position.copy(root); arm.rotation.set(0, Math.atan2(-d.z, d.x), Math.atan2(d.y, L)); g.add(arm);
    const taper = new THREE.Shape();
    taper.moveTo(0, -0.055); taper.quadraticCurveTo(L * 0.5, -0.04, L, -0.034); taper.lineTo(L, 0.034); taper.quadraticCurveTo(L * 0.5, 0.04, 0, 0.055); taper.closePath();
    add(slab(taper, 0.022, 0.016, 4), M.white, 0, -0.004, 0, 0, 0, 0, arm);
    add(slab(taper, 0.012, 0.01, 2), M.carbon, 0, -0.034, 0, 0, 0, 0, arm);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.07, q(18)), M.gunmetal, 0.05, 0.0, 0, 0, 0, 0, arm);       // fold hinge
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.004, q(18)), M.metal, 0.05, 0.037, 0, 0, 0, 0, arm);
    // Motor: white housing flaring into the arm, dark band, finned gunmetal bell, hub.
    add(new THREE.CylinderGeometry(0.066, 0.078, 0.07, q(36)), M.white, tip.x, tip.y, tip.z);
    add(new THREE.CylinderGeometry(0.067, 0.067, 0.008, q(36)), M.graphite, tip.x, tip.y + 0.038, tip.z);
    add(new THREE.CylinderGeometry(0.056, 0.06, 0.05, q(36)), M.gunmetal, tip.x, tip.y + 0.066, tip.z);
    for (let k = 0; k < (LITE ? 0 : 12); k++) { const a = (k / 12) * Math.PI * 2; add(new THREE.BoxGeometry(0.004, 0.036, 0.012), M.graphite, tip.x + Math.cos(a) * 0.058, tip.y + 0.066, tip.z + Math.sin(a) * 0.058, 0, -a, 0); }
    add(new THREE.TorusGeometry(0.057, 0.004, q(8), q(36)), M.stripe, tip.x, tip.y + 0.09, tip.z, Math.PI / 2);
    // Landing leg under the motor, splayed a little outward, with a rubber foot.
    const foot = new THREE.Vector3(tip.x + fx * 0.025, -0.27, tip.z + fz * 0.03);
    rod(M.graphite, 0.026, 0.015, new THREE.Vector3(tip.x, tip.y - 0.03, tip.z), foot);
    const f = add(new THREE.SphereGeometry(0.021, q(16), q(10)), M.rubber, foot.x, foot.y, foot.z); f.scale.set(1, 0.7, 1);
    // Front motors carry a small white-blue lamp under the housing.
    if (fx > 0) add(new THREE.SphereGeometry(0.01, q(10), q(8)), M.glow, tip.x, tip.y - 0.038, tip.z);
    // Folding two-blade prop: black composite, white tip stripes, a hub and clamp.
    const prop = new THREE.Group(); prop.position.set(tip.x, tip.y + 0.105, tip.z);
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(bladeGeos[pk % 2 ? -1 : 1], M.blade); b.rotation.y = k * Math.PI; prop.add(b);
      b.add(new THREE.Mesh(stripeGeos[pk % 2 ? -1 : 1], M.stripe));
    }
    add(new THREE.CylinderGeometry(0.03, 0.034, 0.014, q(24)), M.graphite, 0, 0, 0, 0, 0, 0, prop);
    const cap = add(new THREE.SphereGeometry(0.02, q(16), q(10)), M.metal, 0, 0.008, 0, 0, 0, 0, prop); cap.scale.y = 0.6;
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: blurTex, color: 0x9aa4b0, transparent: true, opacity: 0.14, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004;
    prop.add(disc); g.add(prop); props.push(prop); blur.push(disc);
  });
  return { group: g, props, blur };
}

/**
 * A fleet of Ember airframes for the light show, baked into one instanced mesh
 * per material so hundreds of aircraft draw in a handful of calls.
 *
 * 'lite' is the far build: fewer curve and ring segments, no fins, screws or
 * blades (at a distance a spinning prop is its blur disc). 'full' is the hero
 * build, every part, for the aircraft near the camera; its blades, stripes,
 * hubs and caps come back as `rotors`, instanced four per aircraft, so each
 * prop can spin: place rotor k of aircraft i at aircraft matrix × translate(rotorAt[k])
 * × rotateY(angle). The belly LED bar, the front lamps and the tail light take
 * each aircraft's show colour through `glow` (set its instance colours); nav
 * lights stay red and green.
 */
export interface EmberFleet { group: THREE.Group; parts: THREE.InstancedMesh[]; glow: THREE.InstancedMesh; rotors: THREE.InstancedMesh[]; rotorAt: THREE.Vector3[] }
export function emberFleet(capacity: number, detail: 'lite' | 'full' = 'lite'): EmberFleet {
  LITE = detail === 'lite';
  const M = emberMaterials(), blurTex = radialTexture();
  const { group: model, props } = buildEmber(M, blurTex);
  LITE = false;
  model.updateMatrixWorld(true);
  const blur = new THREE.MeshBasicMaterial({ map: blurTex, color: 0x9aa4b0, transparent: true, opacity: detail === 'full' ? 0.1 : 0.14, depthWrite: false });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false });   // brighter than the paint ever gets, so the lamps alone bloom
  const bake = (m: THREE.Mesh, frame: THREE.Matrix4) => {
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(frame);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  };
  const push = (b: Map<THREE.Material, THREE.BufferGeometry[]>, mat: THREE.Material, g: THREE.BufferGeometry) => (b.get(mat) ?? b.set(mat, []).get(mat)!).push(g);
  const body = new Map<THREE.Material, THREE.BufferGeometry[]>(), rotor = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const inProp = (o: THREE.Object3D) => { for (let p = o.parent; p; p = p.parent) if (props.includes(p as THREE.Group)) return p as THREE.Group; return null; };
  const toProp = new THREE.Matrix4(), rel = new THREE.Matrix4();
  model.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let mat = m.material as THREE.Material;
    const isBlur = (mat as THREE.MeshBasicMaterial).map === blurTex;
    const prop = inProp(m);
    if (prop && !isBlur) {
      // A spinning part: baked in its prop's own frame, so the rotor instance supplies position and spin.
      if (detail === 'lite') return;
      rel.copy(toProp.copy(prop.matrixWorld).invert()).multiply(m.matrixWorld);
      push(rotor, mat, bake(m, rel));
      return;
    }
    if (detail === 'lite' && (mat === M.blade || mat === M.stripe)) return;
    if (isBlur) mat = blur;
    else if (mat === M.glow) mat = glow;
    push(body, mat, bake(m, m.matrixWorld));
  });
  const group = new THREE.Group(), parts: THREE.InstancedMesh[] = [], rotors: THREE.InstancedMesh[] = [];
  const instanced = (list: THREE.BufferGeometry[], mat: THREE.Material, n: number) => {
    const im = new THREE.InstancedMesh(mergeGeometries(list)!, mat, n);
    list.forEach(g => g.dispose());
    im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im); return im;
  };
  let glowMesh: THREE.InstancedMesh | null = null;
  for (const [mat, list] of body) {
    const im = instanced(list, mat, capacity);
    if (mat === blur) im.renderOrder = 2;
    if (mat === glow) { glowMesh = im; im.setColorAt(0, new THREE.Color()); }
    parts.push(im);
  }
  for (const [mat, list] of rotor) rotors.push(instanced(list, mat, capacity * 4));
  // The unbaked build is no longer needed.
  model.traverse(o => { (o as THREE.Mesh).geometry?.dispose(); });
  return { group, parts, glow: glowMesh!, rotors, rotorAt: props.map(p => p.position.clone()) };
}
