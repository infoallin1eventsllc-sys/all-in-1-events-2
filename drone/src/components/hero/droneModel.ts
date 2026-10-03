import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bladeGeometry, grainTexture, halfWidth, hit, lineOnShell, loftGeometry, orient, topY, type LoftSpec } from './sculpt';

/**
 * The folding camera quadcopter used wherever the console shows an aircraft in 3D
 * (the Overview hero and its studio, the survey stage, the health hologram). Sculpted in code
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

/**
 * The motion smear behind a spinning blade: a sector of the rotor disc trailing the
 * blade (on +z·hand, the side a prop turning by `hand` sweeps away from), densest at
 * the blade and fading over `arc` radians, strongest toward the tip where the blade
 * moves fastest. Alpha is in the vertex colours, so one material serves every rotor.
 * Local axes as the prop: in the x-z plane, blade along +x.
 */
export function smearGeometry(R: number, r0: number, hand: 1 | -1, arc = 2, around = 30, rings = 8): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= rings; i++) {
    const s = i / rings, r = r0 + (R - r0) * s;
    const radial = smooth(0, 0.3, s) * (1 - smooth(0.9, 1, s)) * (0.4 + 0.6 * s);
    for (let j = 0; j <= around; j++) {
      const t = j / around, phi = -0.06 + arc * t;
      pos.push(r * Math.cos(phi), 0, hand * r * Math.sin(phi));
      col.push(1, 1, 1, 0.8 * radial * Math.pow(1 - t, 1.7));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
    const a = i * (around + 1) + j, b = a + around + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/**
 * Rotor speed as drawn, radians a second. A real prop turns at 100-250 rev/s, which at
 * 60 frames a second strobes into a still or backward-turning disc; this is fast enough
 * to read as spinning, slow enough that the eye can follow each blade and its smear.
 */
export const ROTOR_SPIN = 30;


const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The fuselage, nose at +x: a compact body, tallest over the front arm roots, the chin lifting away under the nose for the gimbal. */
const BODY: LoftSpec = { rTail: 0.05, rNose: 0.055, secs: [
  { x: -0.36, w: 0.105, ys: 0.005, yt: 0.062, yb: -0.052, n: 3.0 },
  { x: -0.22, w: 0.128, ys: 0.005, yt: 0.098, yb: -0.07, n: 3.3 },
  { x: -0.04, w: 0.142, ys: 0.005, yt: 0.112, yb: -0.078, n: 3.5 },
  { x: 0.14, w: 0.150, ys: 0.010, yt: 0.116, yb: -0.076, n: 3.5 },
  { x: 0.28, w: 0.140, ys: 0.020, yt: 0.108, yb: -0.054, n: 3.3 },
  { x: 0.36, w: 0.125, ys: 0.030, yt: 0.092, yb: -0.020, n: 3.0 },
] };
/** The dorsal spine: a raised ridge down the deck that carries the front vent grille. Its lower edge is sunk into the shell. */
const SPINE: LoftSpec = { rTail: 0.05, rNose: 0.045, secs: [
  { x: -0.02, w: 0.050, ys: 0.080, yt: 0.124, yb: 0.0, n: 3.0 },
  { x: 0.14, w: 0.062, ys: 0.095, yt: 0.139, yb: 0.0, n: 3.2 },
  { x: 0.30, w: 0.055, ys: 0.088, yt: 0.125, yb: 0.0, n: 3.0 },
] };
/** An arm, along local +x from the hinge (0) into the motor pod (L is the pod's near edge): flat and wide, like a folding consumer airframe. */
const armSpec = (L: number): LoftSpec => ({ rTail: 0.014, rNose: 0.03, secs: [
  { x: 0, w: 0.044, ys: 0, yt: 0.026, yb: -0.024, n: 3.8 },
  { x: L * 0.45, w: 0.034, ys: 0, yt: 0.02, yb: -0.019, n: 3.8 },
  { x: L + 0.01, w: 0.038, ys: 0, yt: 0.022, yb: -0.02, n: 3.6 },
] });

/** Arms in prop order: front right, front left, rear left, rear right, so diagonal props turn the same way. */
const ARMS: { root: THREE.Vector3; tip: THREE.Vector3; front: boolean }[] = [
  { root: V(0.15, 0.05, 0.13), tip: V(0.64, 0.035, 0.53), front: true },
  { root: V(0.15, 0.05, -0.13), tip: V(0.64, 0.035, -0.53), front: true },
  { root: V(-0.2, -0.03, -0.11), tip: V(-0.6, -0.075, -0.58), front: false },
  { root: V(-0.2, -0.03, 0.11), tip: V(-0.6, -0.075, 0.58), front: false },
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
  root.traverse(o => { if (o !== root && !(o as THREE.Mesh).isMesh && !skipped(o) && !skip.includes(o) && o.children.length === 0) empties.push(o); });
  empties.forEach(o => o.removeFromParent());
  for (const [mat, list] of byMat) { const merged = mergeGeometries(list)!; list.forEach(g => g.dispose()); root.add(new THREE.Mesh(merged, mat)); }
}

/** The camera gimbal's three joints, outermost first: yaw (pan, about y), roll (about the lens axis, x), pitch (tilt, about z). */
export interface Gimbal { yaw: THREE.Group; roll: THREE.Group; pitch: THREE.Group }
export interface Built {
  group: THREE.Group;
  /** Groups that spin about their local y axis. */
  props: THREE.Group[];
  /** Faint blur discs, one per prop: show them while the props turn. */
  blur: THREE.Mesh[];
  /** The blades of each prop. */
  blades: THREE.Object3D[];
  /** The camera gimbal: drive it with aimGimbal, or set the joints directly. */
  gimbal: Gimbal;
}

/** The path of child indices from `root` to `o`, so the same part can be found in a clone. */
const pathTo = (root: THREE.Object3D, o: THREE.Object3D) => { const path: number[] = []; for (let p = o; p !== root; p = p.parent!) path.unshift(p.parent!.children.indexOf(p)); return path; };
const follow = <T extends THREE.Object3D>(root: THREE.Object3D, path: number[]) => path.reduce<THREE.Object3D>((o, i) => o.children[i], root) as T;

/**
 * A folding camera quadcopter in the current consumer idiom, sculpted rather than boxed:
 * - a compact, light-grey moulded body with a raised dorsal spine and a dark vent grille,
 *   panel lines, a battery bay at the tail with a grip, level LEDs and a power button;
 * - obstacle sensing all round: two large forward sensor eyes in bright bezels, a
 *   rearward pair, a downward pair, a time-of-flight window and a landing light, and
 *   cooling intakes on the flanks;
 * - flat folding arms to motor pods, outrunner motors (copper stator showing through
 *   the bell), folding black props with a cambered airfoil, twist and swept tips (the
 *   marked diagonal pair as on the real props), or the light-show prop when the
 *   materials carry a stripe paint (see makeShowRotor); front landing legs, rear feet,
 *   red/green navigation lights;
 * - a black camera head on a three-axis gimbal (pan, roll, tilt) hung under the nose,
 *   returned as `gimbal` so a view can stabilise it and point it.
 * Static parts are merged per material, so a fleet draws in few calls; pass
 * `merge: false` to keep every part as its own mesh (the health hologram outlines
 * and zones them). Local axes: +x forward, +y up, +z right. About 0.9 units nose to
 * tail, 1.9 across the props.
 */
export function buildDrone(mats: Record<string, THREE.Material>, blurTex: THREE.Texture, opts: { merge?: boolean } = {}): Built {
  if (opts.merge === false) return sculptDrone(mats, blurTex, false);
  // A fleet shares one sculpted template per material set: every aircraft after the first is a cheap copy sharing its geometry.
  let t = templates.get(mats);
  if (!t || t.blurTex !== blurTex) { t = { built: sculptDrone(mats, blurTex, true), blurTex }; templates.set(mats, t); }
  const src = t.built, group = src.group.clone(true);
  const find = <T extends THREE.Object3D>(o: THREE.Object3D) => follow<T>(group, pathTo(src.group, o));
  return {
    group,
    props: src.props.map(p => find<THREE.Group>(p)),
    blur: src.blur.map(b => find<THREE.Mesh>(b)),
    blades: src.blades.map(b => find(b)),
    gimbal: { yaw: find<THREE.Group>(src.gimbal.yaw), roll: find<THREE.Group>(src.gimbal.roll), pitch: find<THREE.Group>(src.gimbal.pitch) },
  };
}
const templates = new WeakMap<Record<string, THREE.Material>, { built: Built; blurTex: THREE.Texture }>();

/**
 * Point the camera like a real stabilised gimbal: hold the horizon whatever the
 * airframe does, look along the aircraft's heading turned by `pan`, tilted by
 * `tilt` (radians, negative is down; -π/2 is straight down), rolled by `roll`
 * (-π/2 is the vertical, portrait position). The joints stop at their mechanical
 * limits, as on the aircraft. Call after the aircraft's own transform is set.
 */
export function aimGimbal(g: Gimbal, aim: { pan?: number; tilt?: number; roll?: number }) {
  const body = g.yaw.parent;
  if (!body) return;
  body.updateWorldMatrix(true, false);
  const bodyQ = body.getWorldQuaternion(_q1);
  const fwd = _v.set(1, 0, 0).applyQuaternion(bodyQ);
  const heading = Math.atan2(-fwd.z, fwd.x);
  // Desired: turn to the heading, tilt, then roll about the lens axis (the vertical position); the joints then realise it.
  _e.set(aim.roll ?? 0, heading + (aim.pan ?? 0), aim.tilt ?? 0, 'YZX');
  const local = _q2.copy(bodyQ).invert().multiply(_q3.setFromEuler(_e));
  _e.setFromQuaternion(local, 'YXZ');
  // The direct solution is exact away from the joint limits. Near them, and in the vertical position (where
  // the tilt axis lines up with the pan axis: gimbal lock), search within the limits: the lens points where
  // it was asked first, the picture stays upright second. Seeds: the direct solution and last frame's answer;
  // if neither gets close, a coarse sweep of the whole travel finds the right basin.
  _lens.set(1, 0, 0).applyQuaternion(local); _up.set(0, 1, 0).applyQuaternion(local);
  const direct = [clampPan(_e.y), clampRoll(_e.x), clampTilt(_e.z)];
  let j = direct, err = gimbalError(j, _lens, _up);
  if (err > 1e-7) {
    const prev = g.yaw.userData.joints as number[] | undefined;
    const seeds = prev ? [direct, [...prev]] : [direct];
    let best = { j: direct, err };
    for (const sd of seeds) { const r = refine(sd, _lens, _up); if (r.err < best.err) best = r; }
    if (best.err > 0.05) {
      let g0 = best.j, ge = Infinity;
      for (let a = -LIMIT.pan; a <= LIMIT.pan + 1e-9; a += 0.13) for (let b = LIMIT.roll[0]; b <= LIMIT.roll[1] + 1e-9; b += 0.13) for (let c = LIMIT.tilt[0]; c <= LIMIT.tilt[1] + 1e-9; c += 0.13) {
        const e = gimbalError([a, b, c], _lens, _up); if (e < ge) { ge = e; g0 = [a, b, c]; }
      }
      const r = refine(g0, _lens, _up); if (r.err < best.err) best = r;
    }
    j = best.j;
  }
  g.yaw.userData.joints = j;
  g.yaw.rotation.y = j[0]; g.roll.rotation.x = j[1]; g.pitch.rotation.z = j[2];
}
/** Pattern search from a seed, within the joint limits. */
function refine(seed: number[], lens: THREE.Vector3, up: THREE.Vector3): { j: number[]; err: number } {
  const j = [...seed];
  let err = gimbalError(j, lens, up);
  for (let step = 0.08; step > 2e-4; step *= 0.5) {
    for (let pass = 0, better = true; better && pass < 16; pass++) {
      better = false;
      for (const m of MOVES) for (const sgn of [1, -1]) {
        const k0 = j[0], k1 = j[1], k2 = j[2];
        for (let k = 0; k < 3; k++) j[k] = CLAMP[k](j[k] + sgn * step * m[k]);
        const e2 = gimbalError(j, lens, up);
        if (e2 < err - 1e-12) { err = e2; better = true; } else { j[0] = k0; j[1] = k1; j[2] = k2; }
      }
    }
  }
  return { j, err };
}
const clampPan = (v: number) => THREE.MathUtils.clamp(v, -LIMIT.pan, LIMIT.pan);
const clampRoll = (v: number) => THREE.MathUtils.clamp(v, LIMIT.roll[0], LIMIT.roll[1]);
const clampTilt = (v: number) => THREE.MathUtils.clamp(v, LIMIT.tilt[0], LIMIT.tilt[1]);
const CLAMP = [clampPan, clampRoll, clampTilt];
/** Search moves: each joint alone, and pairs together (near gimbal lock pan and tilt only work as a pair). */
const MOVES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 0, -1], [1, 1, 0], [1, -1, 0], [0, 1, 1], [0, 1, -1]];
/** How far joints (pan, roll, tilt) leave the lens and the picture's up from the wanted ones (both in the airframe's frame). */
function gimbalError(j: number[], lens: THREE.Vector3, up: THREE.Vector3): number {
  _qj.setFromEuler(_ej.set(j[1], j[0], j[2], 'YXZ'));
  const l = _a.set(1, 0, 0).applyQuaternion(_qj), u = _b.set(0, 1, 0).applyQuaternion(_qj);
  return 200 * (1 - l.dot(lens)) + (1 - u.dot(up));
}
const _lens = new THREE.Vector3(), _up = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _qj = new THREE.Quaternion(), _ej = new THREE.Euler();
/** Mechanical travel of a folding-drone gimbal, radians: tilt -135° to 80°, roll -135° to 45°, pan ±30°. */
export const LIMIT = { tilt: [-2.356, 1.396] as const, roll: [-2.356, 0.785] as const, pan: 0.524 };
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();

/**
 * The two props sculptDrone can fit, each building into a prop group: its turning blade set (returned as
 * `set`) and its blur disc (returned as `disc`, hidden until a view spins the props).
 * - foldingRotor: the aircraft's own folding props: black blades on pivot bosses off a centre bar, a lock cap
 *   (silver, with marks on the blades, on one diagonal pair as on the real props), and a smear trailing each
 *   blade while it turns (children of the disc, so a view shows and hides them together).
 * - showRotor: the light-show fleet's prop (Ember's), chosen when the material set carries the stripe paint
 *   (the hero's): longer glossy blades straight off a hub with a silver cap, white tip stripes, a faint disc.
 */
interface Rotor { build(prop: THREE.Group, hand: 1 | -1, marked: boolean): { set: THREE.Group; disc: THREE.Mesh } }
type RotorKit = { M: Record<string, THREE.Material>; blurTex: THREE.Texture; add: (geo: THREE.BufferGeometry, m: THREE.Material, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number, parent?: THREE.Object3D) => THREE.Mesh };
const perHand = (f: (hand: 1 | -1) => THREE.BufferGeometry) => ({ [1]: f(1), [-1]: f(-1) }) as Record<number, THREE.BufferGeometry>;
function blurDisc(prop: THREE.Group, geo: THREE.BufferGeometry, blurTex: THREE.Texture, color: number, opacity: number) {
  const disc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: blurTex, color, transparent: true, opacity, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.006; disc.visible = false; prop.add(disc);
  return disc;
}
function makeFoldingRotor({ M, blurTex, add }: RotorKit): Rotor {
  const blade = perHand(h => bladeGeometry(PROP_R, 0.042, h, 22, 9)), smear = perHand(h => smearGeometry(PROP_R, 0.05, h));
  const discGeo = new THREE.CircleGeometry(PROP_R + 0.012, 64);
  return { build(prop, hand, marked) {
    add(new THREE.CylinderGeometry(0.018, 0.021, 0.012, 24), marked ? M.metal : M.graphite, 0, 0.008, 0, 0, 0, 0, prop);    // lock cap
    const cap = add(new THREE.SphereGeometry(0.016, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), marked ? M.metal : M.graphite, 0, 0.014, 0, 0, 0, 0, prop); cap.scale.y = 0.45;
    const set = new THREE.Group(); prop.add(set);
    add(new RoundedBoxGeometry(0.11, 0.008, 0.03, 2, 0.004), M.blade, 0, 0.001, 0, 0, 0, 0, set);
    for (let b = 0; b < 2; b++) {
      const arm = new THREE.Group(); arm.rotation.y = b * Math.PI; set.add(arm);
      add(blade[hand], M.blade, 0, 0.002, 0, 0, 0, 0, arm);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 20), M.graphite, 0.045, 0.004, 0, 0, 0, 0, arm);    // pivot boss
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 10), M.metal, 0.045, 0.0105, 0, 0, 0, 0, arm);      // pivot screw
      if (marked) add(new THREE.BoxGeometry(0.03, 0.0012, 0.004), M.mark, 0.085, 0.012, 0, 0, 0, 0, arm);
    }
    const disc = blurDisc(prop, discGeo, blurTex, 0x8c949e, 0.12);
    for (let b = 0; b < 2; b++) { const s = new THREE.Mesh(smear[hand], M.smear); s.rotation.set(Math.PI / 2, b * Math.PI, 0); s.position.z = 0.0005; s.renderOrder = 1; disc.add(s); }
    return { set, disc };
  } };
}
const SHOW_R = 0.4;
function makeShowRotor({ M, blurTex, add }: RotorKit): Rotor {
  const band = { from: 0.8, to: 0.87, inflate: 0.0006 };
  const blade = perHand(h => bladeGeometry(SHOW_R, 0.03, h, 22, 9)), stripe = perHand(h => bladeGeometry(SHOW_R, 0.03, h, 3, 9, band));
  const discGeo = new THREE.CircleGeometry(SHOW_R + 0.01, 48);
  return { build(prop, hand) {
    const set = new THREE.Group(); prop.add(set);
    for (let b = 0; b < 2; b++) {
      const arm = new THREE.Group(); arm.rotation.y = b * Math.PI; set.add(arm);
      add(blade[hand], M.blade, 0, 0.004, 0, 0, 0, 0, arm);
      add(stripe[hand], M.stripe, 0, 0.004, 0, 0, 0, 0, arm);
    }
    add(new THREE.CylinderGeometry(0.03, 0.034, 0.014, 24), M.graphite, 0, 0.004, 0, 0, 0, 0, prop);              // hub
    const cap = add(new THREE.SphereGeometry(0.02, 16, 10), M.metal, 0, 0.012, 0, 0, 0, 0, prop); cap.scale.y = 0.6;
    return { set, disc: blurDisc(prop, discGeo, blurTex, 0x9aa4b0, 0.1) };
  } };
}

function sculptDrone(mats: Record<string, THREE.Material>, blurTex: THREE.Texture, merge: boolean): Built {
  const M = mats;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); parent.add(mesh); return mesh;
  };
  const along = (o: THREE.Object3D, p: THREE.Vector3, n: THREE.Vector3) => { orient(o, p, n); g.add(o); return o; };

  // --- Body: one moulded shell, the spine on the deck, a seam at the chassis line.
  add(loftGeometry(BODY, { along: 44, around: 48 }), M.white);
  add(loftGeometry(SPINE, { theta0: 0, theta1: Math.PI, along: 24, around: 24, cap: 7 }), M.white);
  for (const c of [0, Math.PI]) add(loftGeometry(BODY, { theta0: c - 0.012, theta1: c + 0.012, along: 44, around: 2, grow: 0.0008 }), M.graphite);
  // Dark vent grille across the front of the spine, between the sensor eyes.
  for (let k = 0; k < 7; k++) {
    const x = 0.215 + k * 0.013, y = topY(SPINE, x, 0);
    add(new THREE.BoxGeometry(0.0065, 0.004, 0.084 - Math.abs(k - 3) * 0.004), M.graphite, x, y + 0.0005, 0);
  }
  { const pts: THREE.Vector3[] = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const x = 0.254 + Math.cos(a) * 0.058, z = Math.sin(a) * 0.05; pts.push(V(x, topY(SPINE, x, z) + 0.0006, z)); } add(lineOnShell(pts, 0.0016, true), M.seam); }
  // Panel lines: where the spine meets the deck, and across the tail where the battery bay begins.
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 18; k++) { const x = -0.04 + (0.38 * k) / 18; let z = 0; while (z < 0.12 && topY(SPINE, x, z) > topY(BODY, x, z)) z += 0.002; pts.push(V(x, topY(BODY, x, s * z) + 0.0008, s * z)); }
    add(lineOnShell(pts, 0.0014), M.seam);
  }
  { const pts: THREE.Vector3[] = []; const w = halfWidth(BODY, -0.2) * 0.97; for (let k = 0; k <= 20; k++) { const z = -w + (2 * w * k) / 20; pts.push(V(-0.2, topY(BODY, -0.2, z) + 0.0008, z)); } add(lineOnShell(pts, 0.0014), M.seam); }
  // Battery grip across the tail, level LEDs and the power button on its end.
  for (let k = 0; k < 6; k++) { const x = -0.33 + k * 0.016; add(new THREE.BoxGeometry(0.006, 0.004, 0.13), M.graphite, x, topY(BODY, x, 0) + 0.001, 0); }
  for (let k = 0; k < 4; k++) { const { p, n } = hit(BODY, V(-1, 0.03, -0.05 + k * 0.02), V(1, 0, 0)); along(new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 12).rotateZ(Math.PI / 2), M.battLed), p, n); }
  { const { p, n } = hit(BODY, V(-1, 0.03, 0.06), V(1, 0, 0)); along(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 20).rotateZ(Math.PI / 2), M.graphite), p, n); }

  // --- Obstacle sensing.
  const eye = (p: THREE.Vector3, n: THREE.Vector3, r: number) => {
    const e = new THREE.Group();
    add(new THREE.CylinderGeometry(r * 1.32, r * 1.45, r * 0.9, 32).rotateZ(-Math.PI / 2), M.white, -r * 0.2, 0, 0, 0, 0, 0, e);      // the boss moulded into the shell
    add(new THREE.TorusGeometry(r * 1.12, r * 0.13, 10, 36).rotateY(Math.PI / 2), M.metal, r * 0.26, 0, 0, 0, 0, 0, e);           // bright bezel
    add(new THREE.CylinderGeometry(r * 1.05, r * 1.05, r * 0.2, 32).rotateZ(-Math.PI / 2), M.graphite, r * 0.22, 0, 0, 0, 0, 0, e);
    const glass = add(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), M.sensor, r * 0.28, 0, 0, 0, 0, 0, e); glass.scale.x = 0.55;
    add(new THREE.CircleGeometry(r * 0.32, 20).rotateY(Math.PI / 2), M.coating, r * 0.84, 0, 0, 0, 0, 0, e);
    return along(e, p, n);
  };
  for (const z of [-0.07, 0.07]) { const h = hit(BODY, V(1, 0.07, z), V(-1, 0, 0)); eye(h.p, h.n, 0.029); }          // forward eyes, upper corners of the nose
  for (const z of [-0.055, 0.055]) { const h = hit(BODY, V(-1, 0.04, z), V(1, 0, 0)); eye(h.p, h.n, 0.016); }           // rearward pair
  for (const z of [-0.04, 0.04]) { const h = hit(BODY, V(0.22, -1, z), V(0, 1, 0)); eye(h.p, h.n, 0.012); }             // downward pair
  { // time-of-flight window, and the downward landing light
    const h = hit(BODY, V(0.08, -1, 0), V(0, 1, 0));
    along(new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.024, 0.044, 2, 0.006), M.sensor), h.p, h.n);
    const l = hit(BODY, V(-0.06, -1, 0), V(0, 1, 0));
    along(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 24).rotateZ(Math.PI / 2), M.lamp), l.p, l.n);
    along(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0016, 6, 28).rotateY(Math.PI / 2), M.metal), l.p, l.n);
  }
  // Cooling intakes on the flanks, under the front arm roots: a dark recess with slats.
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    const h = hit(BODY, V(0.02 + k * 0.02, -0.03, s), V(0, 0, -s));
    along(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.026, 0.016), M.seam), h.p, h.n);
    along(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.0045), M.graphite), h.p.clone().addScaledVector(h.n, 0.0012), h.n).rotateY(0.5 * s);
  }
  for (const [x, z] of [[0.2, 0.09], [0.2, -0.09], [-0.25, 0.08], [-0.25, -0.08]]) {
    const h = hit(BODY, V(x, -1, z), V(0, 1, 0));
    along(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.003, 12).rotateZ(Math.PI / 2), M.metal), h.p, h.n);
  }

  // --- Arms, motors, legs and props.
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [], blades: THREE.Object3D[] = [];
  const podGeo = new THREE.LatheGeometry([[0, -0.028], [0.04, -0.028], [0.054, -0.023], [0.06, -0.01], [0.061, 0.008], [0.058, 0.018], [0.05, 0.023], [0, 0.023]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const rotor = (M.stripe ? makeShowRotor : makeFoldingRotor)({ M, blurTex, add });
  ARMS.forEach(({ root, tip, front }, k) => {
    const dir = tip.clone().sub(root), L = dir.length() - 0.05; dir.normalize();
    const up = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize(), side = new THREE.Vector3().crossVectors(dir, up);
    const arm = new THREE.Group(); arm.position.copy(root); arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, side)); g.add(arm);
    add(loftGeometry(armSpec(L), { along: 16, around: 24, cap: 5 }), M.white, 0, 0, 0, 0, 0, 0, arm);
    // Fold hinge: a dark knuckle with a pin cap where the arm meets the body.
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.046, 20), M.graphite, root.x, root.y, root.z);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 20), M.metal, root.x, root.y + 0.024, root.z);
    // Motor pod and the stator base it carries.
    add(podGeo, M.white, tip.x, tip.y, tip.z);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.003, 28), M.seam, tip.x, tip.y + 0.0235, tip.z);
    add(new THREE.CylinderGeometry(0.047, 0.049, 0.008, 28), M.graphite, tip.x, tip.y + 0.028, tip.z);
    const outward = V(dir.x, 0, dir.z).normalize(), yaw = -Math.atan2(outward.z, outward.x);
    if (front) {
      // Landing leg: a tall moulded fin under the pod (the antennas live in these), a lamp at its front.
      const leg = new THREE.Shape();
      leg.moveTo(-0.042, 0); leg.lineTo(0.034, 0); leg.quadraticCurveTo(0.03, -0.07, 0.016, -0.124); leg.quadraticCurveTo(0.008, -0.137, -0.006, -0.13); leg.quadraticCurveTo(-0.03, -0.07, -0.042, 0);
      add(new THREE.ExtrudeGeometry(leg, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3, curveSegments: 16 }).translate(0, 0, -0.006), M.white, tip.x, tip.y - 0.022, tip.z, 0, yaw, 0);
      add(new THREE.SphereGeometry(0.0075, 12, 8), M.rubber, tip.x + outward.x * 0.004, tip.y - 0.022 - 0.129, tip.z + outward.z * 0.004);
      add(new THREE.SphereGeometry(0.0085, 14, 10), M.ledFront, tip.x + 0.048, tip.y - 0.01, tip.z);
    } else {
      // Rear: a rubber foot under the pod and the navigation light on its outer flank (red port, green starboard).
      add(new RoundedBoxGeometry(0.046, 0.012, 0.028, 2, 0.005), M.rubber, tip.x, tip.y - 0.04, tip.z, 0, yaw, 0);
      add(new THREE.SphereGeometry(0.0095, 14, 10), tip.z > 0 ? M.ledGreen : M.ledRed, tip.x - 0.028, tip.y - 0.014, tip.z + Math.sign(tip.z) * 0.043);
    }

    // The rotating parts: the bell (copper stator showing between its spokes), then the prop and its blur disc.
    const hand = k % 2 ? -1 : 1;
    const prop = new THREE.Group(); prop.position.set(tip.x, tip.y + 0.074, tip.z);
    add(new THREE.CylinderGeometry(0.041, 0.041, 0.032, 20), M.copper, 0, -0.025, 0, 0, 0, 0, prop);
    for (let r = 0; r < 9; r++) { const a = (r / 9) * Math.PI * 2; add(new THREE.BoxGeometry(0.021, 0.032, 0.006), M.bell, Math.cos(a) * 0.046, -0.025, Math.sin(a) * 0.046, 0, -a + Math.PI / 2, 0, prop); }
    add(new THREE.CylinderGeometry(0.049, 0.049, 0.007, 28), M.bell, 0, -0.043, 0, 0, 0, 0, prop);
    add(new THREE.CylinderGeometry(0.044, 0.049, 0.009, 28), M.bell, 0, -0.008, 0, 0, 0, 0, prop);
    const { set, disc } = rotor.build(prop, hand, k === 1 || k === 3);
    g.add(prop); props.push(prop); blur.push(disc); blades.push(set);
  });

  // --- Gimbal under the nose, in the compact-drone idiom: a dark yaw arm down behind the camera to the
  //     roll motor, a cradle from it under the head and up both flanks (pitch motor on one, a bearing
  //     cap on the other), and a black camera head with cooling fins and a square hood round a big lens.
  const yawJ = new THREE.Group(); yawJ.position.set(0.385, -0.004, 0); yawJ.scale.setScalar(1.3); g.add(yawJ);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 28), M.graphite, -0.005, 0.006, 0, 0, 0, 0, yawJ);                  // mount plate on the chin
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 28), M.gimbalArm, 0, -0.006, 0, 0, 0, 0, yawJ);                     // yaw motor
  add(new THREE.TorusGeometry(0.02, 0.0012, 8, 28), M.metal, 0, -0.014, 0, Math.PI / 2, 0, 0, yawJ);
  add(new RoundedBoxGeometry(0.02, 0.036, 0.026, 3, 0.008), M.gimbalArm, 0.006, -0.026, 0, 0, 0, 0, yawJ);              // yaw arm down the back
  add(new THREE.CylinderGeometry(0.017, 0.017, 0.016, 28), M.gimbalArm, 0.014, -0.044, 0, 0, 0, Math.PI / 2, yawJ);     // roll motor
  add(new THREE.CylinderGeometry(0.0115, 0.0115, 0.002, 20), M.graphite, 0.005, -0.044, 0, 0, 0, Math.PI / 2, yawJ);
  const rollJ = new THREE.Group(); rollJ.position.set(0.058, -0.044, 0); yawJ.add(rollJ);
  add(new RoundedBoxGeometry(0.014, 0.034, 0.024, 2, 0.006), M.gimbalArm, -0.04, -0.016, 0, 0, 0, 0.35, rollJ);          // cradle: down from the roll motor,
  add(new RoundedBoxGeometry(0.046, 0.009, 0.024, 2, 0.004), M.gimbalArm, -0.012, -0.034, 0, 0, 0, 0, rollJ);           // forward under the head,
  add(new RoundedBoxGeometry(0.022, 0.009, 0.098, 2, 0.004), M.gimbalArm, 0.002, -0.036, 0, 0, 0, 0, rollJ);            // across,
  for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.02, 0.04, 0.008, 2, 0.0035), M.gimbalArm, 0.002, -0.017, s * 0.045, 0, 0, 0, rollJ);   // and up each flank
  add(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 28), M.gimbalArm, 0, 0, -0.045, Math.PI / 2, 0, 0, rollJ);        // pitch motor
  add(new THREE.CylinderGeometry(0.0115, 0.0115, 0.002, 24), M.graphite, 0, 0, -0.0515, Math.PI / 2, 0, 0, rollJ);
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.01, 24), M.gimbalArm, 0, 0, 0.044, Math.PI / 2, 0, 0, rollJ);          // bearing cap
  const pitchJ = new THREE.Group(); rollJ.add(pitchJ);
  add(new RoundedBoxGeometry(0.058, 0.056, 0.07, 4, 0.012), M.camHead, 0, 0, 0, 0, 0, 0, pitchJ);
  for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(0.03, 0.004, 0.0034), M.hood, -0.011, 0.0285, -0.024 + k * 0.008, 0, 0, 0, pitchJ);   // cooling fins over the back
  add(new RoundedBoxGeometry(0.012, 0.052, 0.058, 3, 0.01), M.hood, 0.031, 0, 0, 0, 0, 0, pitchJ);                     // square hood round the lens
  add(new RoundedBoxGeometry(0.002, 0.043, 0.049, 2, 0.008), M.camHead, 0.0372, 0, 0, 0, 0, 0, pitchJ);                // its dark face
  add(new THREE.CylinderGeometry(0.0212, 0.0218, 0.006, 40), M.camHead, 0.0395, 0, 0, 0, 0, -Math.PI / 2, pitchJ);       // lens barrel, proud of the face
  add(new THREE.TorusGeometry(0.0201, 0.0011, 8, 48), M.metal, 0.0425, 0, 0, 0, Math.PI / 2, 0, pitchJ);               // thin silver ring
  add(new THREE.CylinderGeometry(0.0192, 0.0192, 0.002, 40), M.seam, 0.0422, 0, 0, 0, 0, -Math.PI / 2, pitchJ);
  const glass = add(new THREE.SphereGeometry(0.0172, 36, 16, 0, Math.PI * 2, 0, 0.85).rotateZ(-Math.PI / 2), M.lens, 0.0438 - 0.0172 * Math.cos(0.85), 0, 0, 0, 0, 0, pitchJ); glass.scale.x = 0.7;
  add(new THREE.TorusGeometry(0.0125, 0.0008, 6, 36), M.coating, 0.0439, 0, 0, 0, Math.PI / 2, 0, pitchJ);             // coating rings deep in the glass
  add(new THREE.CircleGeometry(0.0055, 24).rotateY(Math.PI / 2), M.coatingDeep, 0.0444, 0, 0, 0, 0, 0, pitchJ);
  for (const [y, w] of [[-0.0168, 0.0042], [-0.0196, 0.0048]]) add(new THREE.BoxGeometry(0.0004, 0.0016, w), M.mark, 0.0383, y, 0.0192, 0, 0, 0, pitchJ);   // printed spec in the hood's corner
  const gimbal = { yaw: yawJ, roll: rollJ, pitch: pitchJ };
  pitchJ.rotation.z = -0.25;

  if (merge) {
    mergeByMaterial(g, [...props, yawJ]);
    mergeByMaterial(yawJ, [rollJ]); mergeByMaterial(rollJ, [pitchJ]); mergeByMaterial(pitchJ);
    props.forEach((p, i) => { mergeByMaterial(p, [blur[i], blades[i]]); mergeByMaterial(blades[i]); });
  }
  return { group: g, props, blur, blades, gimbal };
}

/** Materials for one fleet; share the record across aircraft. */
export function droneMaterials(): Record<string, THREE.Material> {
  const grain = grainTexture();
  const mats: Record<string, THREE.Material> = {
    // Moulded light-grey polycarbonate: satin, a fine grain in the roughness, a faint sheen of clear coat.
    white: new THREE.MeshPhysicalMaterial({ color: 0xb2b6ba, metalness: 0, roughness: 0.92, roughnessMap: grain, bumpMap: grain, bumpScale: 0.03, clearcoat: 0.08, clearcoatRoughness: 0.45, specularIntensity: 0.6 }),
    graphite: new THREE.MeshPhysicalMaterial({ color: 0x2b2e33, metalness: 0.05, roughness: 1, roughnessMap: grain, bumpMap: grain, bumpScale: 0.03, clearcoat: 0.06, clearcoatRoughness: 0.5 }),
    camHead: new THREE.MeshPhysicalMaterial({ color: 0x15171a, metalness: 0.1, roughness: 0.75, roughnessMap: grain, clearcoat: 0.25, clearcoatRoughness: 0.3 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.35, roughness: 0.42 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.1, roughness: 0.85 }),
    logo: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.4, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xd0d4d9, metalness: 1, roughness: 0.22 }),
    skid: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.1, roughness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0, roughness: 0.95 }),
    sensor: new THREE.MeshPhysicalMaterial({ color: 0x050608, metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x04070d, metalness: 0.1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.6, iridescence: 0.6, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420] }),
    coating: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.24, 0.3, 0.62), transparent: true, opacity: 0.45, toneMapped: false }),
    coatingDeep: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.42, 0.34), transparent: true, opacity: 0.5, toneMapped: false }),
    // The camera cradle and the hood round the lens: dark grey satin, a step lighter than the head.
    gimbalArm: new THREE.MeshPhysicalMaterial({ color: 0x3a3d42, metalness: 0.05, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    hood: new THREE.MeshPhysicalMaterial({ color: 0x2c2f34, metalness: 0.1, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    // Blade smears: a dark smoke on a light set; a view on a dark backdrop lightens the colour.
    smear: new THREE.MeshBasicMaterial({ color: 0x4c525a, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    blade: new THREE.MeshPhysicalMaterial({ color: 0x16181b, metalness: 0, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
    bell: new THREE.MeshStandardMaterial({ color: 0x24272c, metalness: 0.75, roughness: 0.32 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x5a3a20, metalness: 1, roughness: 0.55 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.85, roughness: 0.35 }),
    mark: new THREE.MeshStandardMaterial({ color: 0xd9dce1, metalness: 0.3, roughness: 0.45 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.25, 0.55), toneMapped: false }),
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
  Object.assign(m, showPropMaterials());
  m.glow = new THREE.MeshBasicMaterial({ color: blue, toneMapped: false });
  m.ledFront = m.glow;
  return m;
}

/** The light-show prop finish: glossy black composite blades that catch the light, white tip stripes. */
export function showPropMaterials(): { blade: THREE.Material; stripe: THREE.Material } {
  return {
    blade: new THREE.MeshPhysicalMaterial({ color: 0x121417, metalness: 0.05, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xc6cacf, roughness: 0.5, side: THREE.DoubleSide }),
  };
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
