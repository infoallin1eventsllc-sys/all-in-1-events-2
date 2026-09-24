import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildGlowDrone, orangeGlowMaterials } from './droneModel';

/**
 * A family of airframes beyond the Mavic-class quad in droneModel.ts, built the
 * same way (primitives, shared materials, spinning prop groups with blur discs)
 * so they light and render at the same quality. They are for the fleet lab
 * (lab/fleet.html) and portfolio renders; the app itself still flies the
 * Mavic-class model everywhere.
 *
 * Local axes match droneModel.ts: +x forward, +y up, +z right.
 */

type V3 = [number, number, number];

export interface Airframe {
  group: THREE.Group;
  /** Groups that spin about their local y axis. */
  props: THREE.Group[];
  /** Blur discs, one per prop, shown while the props turn. */
  blur: THREE.Mesh[];
  /** Emissive parts the stage animates: strobes flash, show LEDs change colour. */
  strobes: THREE.Mesh[];
  show?: THREE.MeshStandardMaterial[];
  /** Named sub-parts a stage can move (a slung load, a spotlight). */
  parts: Record<string, THREE.Object3D>;
}

export interface VariantInfo {
  id: string;
  name: string;
  role: string;
  features: string[];
  build: (m: Record<string, THREE.Material>, blurTex: THREE.Texture) => Airframe;
}

/* ------------------------------------------------------------------ helpers */

const UP = new THREE.Vector3(0, 1, 0);

function kit(g: THREE.Object3D) {
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); g.add(mesh); return mesh;
  };
  /** A round tube from a to b. */
  const rod = (a: V3, b: V3, r: number, m: THREE.Material, seg = 12) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
    g.add(mesh); return mesh;
  };
  /** A flat bar (rounded box) from a to b, lying in the horizontal plane. */
  const bar = (a: V3, b: V3, h: number, w: number, m: THREE.Material, r = 0.01) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(len, h, w, 2, Math.min(r, h / 2 - 1e-4, w / 2 - 1e-4)), m);
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    mesh.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)), 'YZX');
    g.add(mesh); return mesh;
  };
  return { add, rod, bar };
}

const bladeCache = new Map<string, THREE.BufferGeometry>();
function bladeGeo(r: number, chord: number) {
  const k = `${r}:${chord}`;
  let geo = bladeCache.get(k);
  if (!geo) {
    const s = new THREE.Shape(), c = chord * r;
    s.moveTo(0.05 * r, -0.45 * c); s.quadraticCurveTo(0.45 * r, -1.1 * c, r, -0.22 * c); s.lineTo(r, 0.18 * c); s.quadraticCurveTo(0.5 * r, 0.9 * c, 0.05 * r, 0.45 * c); s.closePath();
    geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.004, 0.018 * r), bevelEnabled: false }).rotateX(-Math.PI / 2);
    bladeCache.set(k, geo);
  }
  return geo;
}

/** A propeller: n tapered blades with pitch, a hub, and a blur disc. Spins about local y. */
function makeProp(r: number, n: number, blade: THREE.Material, hub: THREE.Material, blurTex: THREE.Texture, opts: { chord?: number; pitch?: number; tint?: number; opacity?: number } = {}) {
  const p = new THREE.Group();
  const geo = bladeGeo(r, opts.chord ?? 0.13);
  for (let k = 0; k < n; k++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (k / n) * Math.PI * 2;
    const b = new THREE.Mesh(geo, blade); b.rotation.x = opts.pitch ?? 0.22; pivot.add(b); p.add(pivot);
  }
  p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05 * r + 0.004, 0.06 * r + 0.004, 0.05 * r + 0.006, 14), hub));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 48), new THREE.MeshBasicMaterial({ map: blurTex, color: opts.tint ?? 0x8c949e, transparent: true, opacity: opts.opacity ?? 0.2, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004; p.add(disc);
  return { prop: p, disc };
}

/** A brushless motor: stator can, a machined ring, a bell and cooling slots. */
function motor(g: THREE.Object3D, M: Record<string, THREE.Material>, x: number, y: number, z: number, r: number, h: number, can: THREE.Material, ring: THREE.Material = M.metal) {
  const { add } = kit(g);
  add(new THREE.CylinderGeometry(r, r * 1.1, h, 24), can, x, y + h / 2, z);
  add(new THREE.TorusGeometry(r * 0.94, r * 0.1, 8, 32), ring, x, y + h, z, Math.PI / 2);
  add(new THREE.CylinderGeometry(r * 0.42, r * 0.42, h * 0.3, 16), M.metal, x, y + h * 1.15, z);
  for (let v = 0; v < 6; v++) add(new THREE.BoxGeometry(r * 0.36, 0.004, 0.005), M.seam, x + r * 0.72 * Math.cos(v * 1.047), y + h * 0.35, z + r * 0.72 * Math.sin(v * 1.047), 0, -v * 1.047, 0);
  return y + h * 1.3;
}

/* ------------------------------------------------------------------ materials */

/** A twill carbon weave, for plates and tubes seen up close. */
function carbonTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = ((x + y) >> 1) % 2 === 0;
    const gr = on ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
    gr.addColorStop(0, on ? '#1a1d22' : '#121418'); gr.addColorStop(0.5, on ? '#343941' : '#23272d'); gr.addColorStop(1, on ? '#1a1d22' : '#121418');
    g.fillStyle = gr; g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 2); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Materials the variants add to the shared set from droneMaterials(). */
export function variantMaterials(): Record<string, THREE.Material> {
  const weave = carbonTexture();
  return {
    weave: new THREE.MeshPhysicalMaterial({ map: weave, color: 0xffffff, metalness: 0.15, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 }),   // satin: a big flat plate must not mirror the rim light
    gunmetal: new THREE.MeshPhysicalMaterial({ color: 0x3b4048, metalness: 0.5, roughness: 0.46, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8703f, metalness: 0.92, roughness: 0.3 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0xb2b7be, metalness: 0.02, roughness: 0.48, clearcoat: 0.45, clearcoatRoughness: 0.35 }),
    enterprise: new THREE.MeshPhysicalMaterial({ color: 0x2a2e34, metalness: 0.2, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6 }),
    enterpriseTop: new THREE.MeshPhysicalMaterial({ color: 0x565c65, metalness: 0.2, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    matte: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.1, roughness: 0.78 }),
    safety: new THREE.MeshPhysicalMaterial({ color: 0xd9601f, metalness: 0.05, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    tpu: new THREE.MeshStandardMaterial({ color: 0x86d42a, metalness: 0, roughness: 0.72 }),
    anodPurple: new THREE.MeshStandardMaterial({ color: 0x6a3cf0, metalness: 0.85, roughness: 0.28 }),
    anodRed: new THREE.MeshStandardMaterial({ color: 0xc8283a, metalness: 0.85, roughness: 0.3 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x14503a, metalness: 0.2, roughness: 0.55 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.3, roughness: 0.4 }),
    lipo: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.1, roughness: 0.6 }),
    label: new THREE.MeshStandardMaterial({ color: 0xe6b422, metalness: 0.1, roughness: 0.5 }),
    strap: new THREE.MeshStandardMaterial({ color: 0xb3202c, metalness: 0, roughness: 0.8 }),
    propMagenta: new THREE.MeshPhysicalMaterial({ color: 0xff3fa8, metalness: 0, roughness: 0.25, transparent: true, opacity: 0.78, side: THREE.DoubleSide, clearcoat: 1 }),
    propWhite: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.05, roughness: 0.5, side: THREE.DoubleSide }),
    germanium: new THREE.MeshPhysicalMaterial({ color: 0x2c2436, metalness: 0.85, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.6, iridescenceIOR: 1.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0f18, metalness: 0.1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2 }),
    tally: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.2, 0.15), toneMapped: false }),
    strobe: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.2), toneMapped: false, transparent: true }),
    underglow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.35, 2.2), toneMapped: false }),
    spot: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.6), toneMapped: false }),
    ledBattery: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.6), toneMapped: false }),
  };
}

/* ------------------------------------------------------------------ 1. cinema hexacopter */

/**
 * Heavy-lift cinema hexacopter: six carbon tube arms with folding joints and
 * copper-ringed motors, twin slide-in batteries, a GPS mast, a raised landing
 * gear, and a full-size cinema camera with a long lens on a three-axis gimbal.
 */
function buildHex(M: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const g = new THREE.Group(); const { add, rod } = kit(g);
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  // Centre: two hex carbon plates on standoffs, a gunmetal canopy, batteries on top.
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.018, 6), M.weave, 0, 0.06, 0, 0, Math.PI / 6);
  add(new THREE.CylinderGeometry(0.34, 0.34, 0.018, 6), M.weave, 0, -0.06, 0, 0, Math.PI / 6);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), M.metal, Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28); }
  const canopy = add(new THREE.SphereGeometry(0.3, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.gunmetal, 0, 0.07, 0); canopy.scale.set(1, 0.42, 0.9);
  add(new THREE.TorusGeometry(0.3, 0.01, 8, 48), M.copper, 0, 0.075, 0, Math.PI / 2).scale.set(1, 0.9, 1);
  for (const zz of [-0.09, 0.09]) {
    add(new RoundedBoxGeometry(0.4, 0.1, 0.15, 3, 0.025), M.graphite, -0.02, 0.2, zz);
    for (let d = 0; d < 4; d++) add(new THREE.SphereGeometry(0.008, 8, 6), M.ledBattery, -0.2, 0.2, zz + (zz > 0 ? 0.076 : -0.076), 0, 0, 0).position.x = -0.16 + d * 0.025;
  }
  rod([-0.12, 0.24, 0], [-0.12, 0.52, 0], 0.008, M.metal);
  add(new THREE.CylinderGeometry(0.07, 0.075, 0.03, 28), M.white, -0.12, 0.53, 0);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), M.seam, -0.12, 0.547, 0);
  // Arms: six carbon tubes, a folding joint a third of the way out, motors and big props at the tips.
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + k * Math.PI / 3, cx = Math.cos(a), cz = Math.sin(a);
    const root: V3 = [cx * 0.3, 0, cz * 0.3], tip: V3 = [cx * 1.02, 0.1, cz * 1.02];
    rod(root, tip, 0.03, M.carbon, 16);
    add(new RoundedBoxGeometry(0.1, 0.07, 0.08, 2, 0.015), M.gunmetal, cx * 0.33, 0, cz * 0.33, 0, -a, 0);
    add(new THREE.CylinderGeometry(0.042, 0.042, 0.09, 18), M.gunmetal, cx * 0.52, 0.03, cz * 0.52, Math.PI / 2, -a + Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.044, 0.044, 0.02, 18), M.copper, cx * 0.52, 0.03, cz * 0.52, Math.PI / 2, -a + Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.04, 20), M.gunmetal, tip[0], tip[1] - 0.005, tip[2]);
    const top = motor(g, M, tip[0], tip[1] + 0.015, tip[2], 0.085, 0.085, M.graphite, M.copper);
    const { prop, disc } = makeProp(0.46, 2, M.blade, M.graphite, blurTex, { chord: 0.12 });
    prop.position.set(tip[0], top + 0.01, tip[2]); g.add(prop); props.push(prop); blur.push(disc);
    const front = cx > 0.1;
    add(new THREE.SphereGeometry(0.022, 10, 8), front ? M.ledFront : cz > 0 ? M.ledGreen : M.ledRed, tip[0] + cx * 0.06, tip[1] - 0.02, tip[2] + cz * 0.06);
  }
  // Landing gear: two splayed legs a side with a skid, cross-braced.
  for (const s of [-1, 1]) {
    for (const x of [-0.2, 0.2]) rod([x, -0.07, s * 0.2], [x * 1.1, -0.62, s * 0.48], 0.018, M.carbon);
    rod([-0.46, -0.62, s * 0.48], [0.46, -0.62, s * 0.48], 0.02, M.carbon);
    for (const x of [-0.46, 0.46]) add(new THREE.SphereGeometry(0.026, 12, 8), M.rubber, x, -0.62, s * 0.48);
    rod([-0.21, -0.32, s * 0.33], [0.21, -0.32, s * 0.33], 0.01, M.metal);
  }
  // Gimbal: yaw motor, a yoke either side, a cinema camera with a long lens, matte box and tally.
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 24), M.gunmetal, 0.06, -0.1, 0);
  add(new THREE.TorusGeometry(0.07, 0.006, 8, 28), M.copper, 0.06, -0.13, 0, Math.PI / 2);
  rod([0.06, -0.13, 0], [0.06, -0.19, 0], 0.02, M.gunmetal);
  add(new RoundedBoxGeometry(0.06, 0.02, 0.3, 2, 0.008), M.gunmetal, 0.06, -0.2, 0);
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(0.05, 0.2, 0.02, 2, 0.008), M.gunmetal, 0.06, -0.3, s * 0.14);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), M.gunmetal, 0.06, -0.37, s * 0.14, Math.PI / 2);
    add(new THREE.TorusGeometry(0.045, 0.005, 8, 24), M.copper, 0.06, -0.37, s * 0.155);
  }
  const cam = new THREE.Group(); cam.position.set(0.06, -0.37, 0); cam.rotation.z = -0.12; g.add(cam);
  const ck = kit(cam);
  ck.add(new RoundedBoxGeometry(0.3, 0.18, 0.2, 3, 0.02), M.graphite, 0.02, 0, 0);
  ck.add(new RoundedBoxGeometry(0.12, 0.05, 0.1, 2, 0.01), M.gunmetal, -0.05, 0.11, 0);
  for (let v = 0; v < 5; v++) ck.add(new THREE.BoxGeometry(0.004, 0.1, 0.004), M.seam, -0.08 + v * 0.03, 0, 0.101);
  ck.add(new THREE.SphereGeometry(0.01, 10, 8), M.tally, 0.13, 0.09, 0.07);
  ck.add(new RoundedBoxGeometry(0.1, 0.07, 0.012, 2, 0.004), M.glass, -0.04, 0.02, -0.105);
  const lensLen = 0.3;
  ck.add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 32), M.metal, 0.18, 0, 0, 0, 0, Math.PI / 2);
  ck.add(new THREE.CylinderGeometry(0.07, 0.072, lensLen, 32), M.graphite, 0.18 + lensLen / 2, 0, 0, 0, 0, Math.PI / 2);
  for (const f of [0.25, 0.5, 0.72]) ck.add(new THREE.CylinderGeometry(0.076, 0.076, 0.03, 32), M.rubber, 0.18 + lensLen * f, 0, 0, 0, 0, Math.PI / 2);
  for (const f of [0.38, 0.62]) ck.add(new THREE.TorusGeometry(0.075, 0.003, 6, 32), M.metal, 0.18 + lensLen * f, 0, 0, 0, Math.PI / 2);
  ck.add(new THREE.CylinderGeometry(0.058, 0.058, 0.01, 32), M.lens, 0.18 + lensLen + 0.005, 0, 0, 0, 0, Math.PI / 2);
  ck.add(new THREE.CircleGeometry(0.045, 32), M.coating, 0.18 + lensLen + 0.011, 0, 0, 0, Math.PI / 2);
  // Matte box: four flags round the front of the lens.
  const mb = 0.18 + lensLen + 0.04;
  for (const [y, z, w, h] of [[0.1, 0, 0.012, 0.22], [-0.1, 0, 0.012, 0.22], [0, 0.1, 0.2, 0.012], [0, -0.1, 0.2, 0.012]] as const)
    ck.add(new RoundedBoxGeometry(0.08, w, h, 1, 0.004), M.graphite, mb, y, z);
  return { group: g, props, blur, strobes: [], parts: { camera: cam } };
}

/* ------------------------------------------------------------------ 2. FPV freestyle */

/**
 * Freestyle FPV quad: a stretched-X carbon frame with a visible weave, purple
 * anodised standoffs, a flight-controller stack, neon TPU mounts, a strapped
 * LiPo, an action camera up top, tri-blade translucent props, lollipop
 * antennas and an underglow strip.
 */
function buildFpv(M: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const g = new THREE.Group(); const { add, rod, bar } = kit(g);
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  const motors: V3[] = [[0.36, 0, 0.3], [0.36, 0, -0.3], [-0.36, 0, 0.3], [-0.36, 0, -0.3]];
  // Frame: bottom plate, four arms, top plate on standoffs.
  add(new RoundedBoxGeometry(0.4, 0.022, 0.17, 2, 0.01), M.weave, 0, 0, 0);
  for (const m of motors) bar([m[0] * 0.2, 0, m[2] * 0.2], [m[0], 0, m[2]], 0.024, 0.075, M.weave, 0.011);
  add(new RoundedBoxGeometry(0.3, 0.018, 0.14, 2, 0.008), M.weave, 0, 0.13, 0);
  for (const [x, z] of [[0.12, 0.055], [0.12, -0.055], [-0.12, 0.055], [-0.12, -0.055]]) add(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 10), M.anodPurple, x, 0.065, z);
  // Stack: two boards with chips and a capacitor.
  for (const y of [0.04, 0.085]) {
    add(new THREE.BoxGeometry(0.11, 0.006, 0.11), M.pcb, -0.01, y, 0);
    add(new THREE.BoxGeometry(0.03, 0.006, 0.03), M.chip, -0.01, y + 0.006, 0);
    add(new THREE.BoxGeometry(0.014, 0.005, 0.02), M.chip, 0.025, y + 0.006, 0.03);
  }
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), M.chip, -0.13, 0.03, 0.09, Math.PI / 2);
  // FPV camera between the plates, tilted up, in neon side mounts.
  const fcam = new THREE.Group(); fcam.position.set(0.16, 0.065, 0); fcam.rotation.z = 0.45; g.add(fcam);
  const fk = kit(fcam);
  fk.add(new RoundedBoxGeometry(0.06, 0.06, 0.06, 2, 0.01), M.chip, 0, 0, 0);
  fk.add(new THREE.CylinderGeometry(0.022, 0.024, 0.03, 20), M.graphite, 0.04, 0, 0, 0, 0, Math.PI / 2);
  fk.add(new THREE.CircleGeometry(0.016, 20), M.coating, 0.056, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.08, 0.1, 0.012, 2, 0.005), M.tpu, 0.16, 0.065, s * 0.045);
  // Battery on top: sleeve, label band, red strap, lead and connector.
  add(new RoundedBoxGeometry(0.26, 0.1, 0.13, 3, 0.02), M.lipo, -0.06, 0.19, 0);
  add(new RoundedBoxGeometry(0.1, 0.102, 0.132, 2, 0.02), M.label, -0.06, 0.19, 0);
  add(new RoundedBoxGeometry(0.03, 0.106, 0.136, 2, 0.01), M.strap, -0.1, 0.19, 0);
  add(new RoundedBoxGeometry(0.03, 0.106, 0.136, 2, 0.01), M.strap, 0.02, 0.19, 0);
  add(new RoundedBoxGeometry(0.03, 0.022, 0.03, 2, 0.006), M.label, -0.21, 0.16, 0.03);
  rod([-0.19, 0.17, 0.02], [-0.21, 0.16, 0.03], 0.006, M.anodRed); rod([-0.19, 0.17, 0.035], [-0.21, 0.16, 0.035], 0.006, M.chip);
  // Action camera on a neon wedge at the front of the top plate.
  add(new RoundedBoxGeometry(0.07, 0.05, 0.06, 2, 0.01), M.tpu, 0.11, 0.165, 0);
  const acam = new THREE.Group(); acam.position.set(0.13, 0.225, 0); acam.rotation.z = 0.32; g.add(acam);
  const ak = kit(acam);
  ak.add(new RoundedBoxGeometry(0.1, 0.075, 0.06, 3, 0.012), M.chip, 0, 0, 0);
  ak.add(new RoundedBoxGeometry(0.02, 0.05, 0.05, 2, 0.008), M.graphite, 0.055, 0.005, 0);
  ak.add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 20), M.lens, 0.068, 0.01, 0.008, 0, 0, Math.PI / 2);
  ak.add(new THREE.CircleGeometry(0.012, 20), M.coating, 0.074, 0.01, 0.008, 0, Math.PI / 2);
  ak.add(new THREE.SphereGeometry(0.006, 8, 6), M.tally, 0.02, 0.04, 0.02);
  // Antennas: neon mounts at the rear, stalks angled up and back, lollipop tips.
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(0.05, 0.03, 0.03, 2, 0.008), M.tpu, -0.17, 0.145, s * 0.045);
    rod([-0.17, 0.155, s * 0.045], [-0.27, 0.3, s * 0.09], 0.006, M.chip);
    const tip = add(new THREE.SphereGeometry(0.022, 16, 10), M.tpu, -0.275, 0.31, s * 0.092); tip.scale.set(1, 0.5, 1);
  }
  // Motors with anodised bells, tri-blade translucent props, a guard bumper on each arm end.
  motors.forEach((m, k) => {
    const top = motor(g, M, m[0], 0.012, m[2], 0.05, 0.045, M.graphite, k < 2 ? M.anodPurple : M.anodRed);
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 20), k < 2 ? M.anodPurple : M.anodRed, m[0], 0.05, m[2]);
    const { prop, disc } = makeProp(0.2, 3, M.propMagenta, M.metal, blurTex, { chord: 0.2, pitch: 0.3, tint: 0xff6ab8, opacity: 0.16 });
    prop.position.set(m[0], top, m[2]); g.add(prop); props.push(prop); blur.push(disc);
    add(new RoundedBoxGeometry(0.05, 0.03, 0.05, 2, 0.012), M.tpu, m[0] * 1.14, -0.012, m[2] * 1.14);
  });
  // Underglow: a bright strip under each arm that blooms.
  for (const m of motors) bar([m[0] * 0.3, -0.018, m[2] * 0.3], [m[0] * 0.85, -0.018, m[2] * 0.85], 0.008, 0.02, M.underglow, 0.003);
  return { group: g, props, blur, strobes: [], parts: {} };
}

/* ------------------------------------------------------------------ 3. enterprise security */

/**
 * Enterprise inspection and security quad: a big weather-sealed airframe with
 * folding arms, dual RTK antennas, an anti-collision strobe, a quick-release
 * tri-sensor payload (zoom, wide and thermal behind germanium glass, plus a
 * laser rangefinder) and a searchlight on the second gimbal port.
 */
function buildEnterprise(M: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const g = new THREE.Group(); const { add, rod } = kit(g);
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [], strobes: THREE.Mesh[] = [];
  // Body: dark shell, lighter top panel, front intake grill, side battery doors.
  add(new RoundedBoxGeometry(0.86, 0.22, 0.52, 5, 0.08), M.enterprise, 0, 0.02, 0);
  add(new RoundedBoxGeometry(0.64, 0.05, 0.38, 4, 0.02), M.enterpriseTop, -0.02, 0.13, 0);
  add(new RoundedBoxGeometry(0.26, 0.14, 0.4, 4, 0.05), M.enterprise, 0.4, 0.0, 0);
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.005, 0.01, 0.26), M.seam, 0.535, 0.05 - k * 0.016, 0);
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(0.44, 0.13, 0.012, 2, 0.005), M.enterpriseTop, -0.08, 0.02, s * 0.262);
    add(new RoundedBoxGeometry(0.05, 0.03, 0.01, 2, 0.004), M.seam, 0.1, 0.02, s * 0.27);
    for (let d = 0; d < 4; d++) add(new THREE.SphereGeometry(0.007, 8, 6), M.ledBattery, -0.2 + d * 0.022, -0.03, s * 0.269);
  }
  for (const zz of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12), M.sensor, 0.535, 0.02, zz, 0, 0, Math.PI / 2);
  // RTK masts and the anti-collision strobe.
  for (const s of [-1, 1]) {
    rod([-0.08, 0.15, s * 0.14], [-0.08, 0.38, s * 0.2], 0.01, M.graphite);
    add(new THREE.CylinderGeometry(0.06, 0.065, 0.028, 28), M.enterpriseTop, -0.08, 0.39, s * 0.2);
  }
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 20), M.enterprise, -0.3, 0.165, 0);
  const strobe = add(new THREE.SphereGeometry(0.03, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.strobe, -0.3, 0.175, 0); strobes.push(strobe);
  // Arms: thick tubes with a folding clamp, motors and long folding props.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const root: V3 = [sx * 0.3, 0.02, sz * 0.2], tip: V3 = [sx * 0.86, 0.08, sz * 0.86];
    rod(root, tip, 0.04, M.carbon, 18);
    add(new THREE.CylinderGeometry(0.058, 0.058, 0.1, 20), M.enterpriseTop, sx * 0.4, 0.03, sz * 0.36, Math.PI / 2, Math.atan2(sz * 0.66, sx * 0.56) * -1 + Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.07, 0.06, 0.05, 20), M.enterprise, tip[0], tip[1], tip[2]);
    const top = motor(g, M, tip[0], tip[1] + 0.025, tip[2], 0.1, 0.1, M.enterprise, M.metal);
    const { prop, disc } = makeProp(0.52, 2, M.blade, M.enterprise, blurTex, { chord: 0.11 });
    prop.position.set(tip[0], top + 0.01, tip[2]); g.add(prop); props.push(prop); blur.push(disc);
    add(new THREE.SphereGeometry(0.024, 10, 8), sx > 0 ? M.ledFront : sz > 0 ? M.ledGreen : M.ledRed, tip[0] + sx * 0.05, tip[1] - 0.03, tip[2] + sz * 0.05);
  }
  // Landing gear: tall bent legs with skids.
  for (const s of [-1, 1]) {
    for (const x of [-0.22, 0.2]) { rod([x, -0.08, s * 0.2], [x, -0.36, s * 0.34], 0.02, M.carbon); rod([x, -0.36, s * 0.34], [x, -0.62, s * 0.38], 0.02, M.carbon); }
    rod([-0.5, -0.62, s * 0.38], [0.48, -0.62, s * 0.38], 0.022, M.enterprise);
    for (const x of [-0.5, 0.48]) add(new THREE.SphereGeometry(0.028, 12, 8), M.rubber, x, -0.62, s * 0.38);
  }
  // Tri-sensor payload on the forward gimbal port.
  add(new RoundedBoxGeometry(0.14, 0.03, 0.16, 2, 0.01), M.enterpriseTop, 0.36, -0.105, 0);
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 20), M.enterprise, 0.36, -0.14, 0);
  const pay = new THREE.Group(); pay.position.set(0.38, -0.27, 0); pay.rotation.z = -0.3; g.add(pay);
  const pk = kit(pay);
  for (const s of [-1, 1]) pk.add(new RoundedBoxGeometry(0.1, 0.16, 0.02, 2, 0.008), M.enterprise, -0.02, 0.06, s * 0.13);
  pk.add(new RoundedBoxGeometry(0.2, 0.16, 0.22, 4, 0.035), M.enterprise, 0, 0, 0);
  pk.add(new RoundedBoxGeometry(0.02, 0.14, 0.2, 2, 0.008), M.enterpriseTop, 0.1, 0, 0);
  const lensAt = (y: number, z: number, r: number, m: THREE.Material) => {
    pk.add(new THREE.CylinderGeometry(r + 0.006, r + 0.006, 0.02, 28), M.metal, 0.112, y, z, 0, 0, Math.PI / 2);
    pk.add(new THREE.CylinderGeometry(r, r, 0.012, 28), m, 0.12, y, z, 0, 0, Math.PI / 2);
  };
  lensAt(0.015, -0.05, 0.045, M.lens);
  pk.add(new THREE.CircleGeometry(0.03, 28), M.coating, 0.127, 0.015, -0.05, 0, Math.PI / 2);
  lensAt(0.04, 0.055, 0.022, M.lens);
  lensAt(-0.03, 0.055, 0.032, M.germanium);
  pk.add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 16), M.sensor, 0.115, -0.055, -0.05, 0, 0, Math.PI / 2);
  // Searchlight on the rear gimbal port: a finned housing and a hot lens face.
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 20), M.enterprise, 0.02, -0.12, 0);
  const spot = new THREE.Group(); spot.position.set(0.02, -0.2, 0); spot.rotation.z = -0.62; g.add(spot);
  const sk = kit(spot);
  sk.add(new THREE.CylinderGeometry(0.075, 0.065, 0.12, 28), M.enterprise, 0.02, 0, 0, 0, 0, Math.PI / 2);
  for (let f = 0; f < 5; f++) sk.add(new THREE.TorusGeometry(0.074, 0.006, 6, 28), M.enterpriseTop, -0.02 + f * 0.015, 0, 0, 0, Math.PI / 2);
  sk.add(new THREE.CircleGeometry(0.066, 32), M.spot, 0.082, 0, 0, 0, Math.PI / 2);
  sk.add(new THREE.TorusGeometry(0.07, 0.006, 8, 32), M.metal, 0.08, 0, 0, 0, Math.PI / 2);
  return { group: g, props, blur, strobes, parts: { payload: pay, spot } };
}

/* ------------------------------------------------------------------ 4. light-show drone */

/**
 * Light-show drone: a small, light quad with ducted guards, a GPS puck and a
 * big frosted RGB dome underneath. The dome's material is its own so a show
 * can colour every aircraft separately.
 */
function buildShow(M: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const g = new THREE.Group(); const { add, bar } = kit(g);
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  add(new RoundedBoxGeometry(0.32, 0.1, 0.32, 4, 0.04), M.gloss, 0, 0.02, 0);
  add(new RoundedBoxGeometry(0.2, 0.03, 0.2, 3, 0.012), M.graphite, 0, 0.08, 0);
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.02, 24), M.white, 0, 0.1, 0);
  const tips: V3[] = [[0.34, 0, 0.34], [0.34, 0, -0.34], [-0.34, 0, 0.34], [-0.34, 0, -0.34]];
  tips.forEach(t => {
    bar([t[0] * 0.3, 0.01, t[2] * 0.3], [t[0], 0.01, t[2]], 0.03, 0.045, M.gloss, 0.012);
    const top = motor(g, M, t[0], 0.02, t[2], 0.04, 0.035, M.graphite);
    const { prop, disc } = makeProp(0.19, 2, M.propWhite, M.graphite, blurTex, { chord: 0.15, tint: 0xc8ccd2, opacity: 0.18 });
    prop.position.set(t[0], top, t[2]); g.add(prop); props.push(prop); blur.push(disc);
    // Duct guard: a ring round the prop, tied to the arm by two spokes.
    add(new THREE.TorusGeometry(0.215, 0.012, 10, 56), M.gloss, t[0], top, t[2], Math.PI / 2);
    add(new THREE.TorusGeometry(0.215, 0.008, 8, 56), M.gloss, t[0], top - 0.03, t[2], Math.PI / 2);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) add(new THREE.BoxGeometry(0.006, 0.035, 0.012), M.gloss, t[0] + Math.cos(a) * 0.215, top - 0.015, t[2] + Math.sin(a) * 0.215);
  });
  // The show light: a frosted dome and a hot core. A standard material so bloom and the colour both carry.
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(1, 0.2, 0.8), emissiveIntensity: 1.7, roughness: 0.4, transparent: true, opacity: 0.94 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1, 0.2, 0.8), emissiveIntensity: 2.2, toneMapped: false });
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 32), M.graphite, 0, -0.04, 0);
  add(new THREE.SphereGeometry(0.15, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), domeMat, 0, -0.05, 0);
  add(new THREE.SphereGeometry(0.06, 20, 12), coreMat, 0, -0.1, 0);
  return { group: g, props, blur, strobes: [], show: [domeMat, coreMat], parts: {} };
}

/* ------------------------------------------------------------------ 5. VTOL fixed wing */

/** A tapered, swept wing panel from an airfoil section. side +1 builds the right wing, -1 the left. */
function wingPanel(side: 1 | -1, span: number, chord: number, taper: number, sweep: number, dihedral: number) {
  const s = new THREE.Shape(), n = 24, t = 0.12;
  const yt = (x: number) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
  for (let i = 0; i <= n; i++) { const x = 1 - i / n; const p = [chord * (0.25 - x), chord * yt(x) * 1.0]; if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]); }
  for (let i = 1; i <= n; i++) { const x = i / n; s.lineTo(chord * (0.25 - x), -chord * yt(x) * 0.55); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, steps: 6, curveSegments: 4 });
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const f = pos.getZ(i) / span, k = 1 - taper * f;
    pos.setX(i, pos.getX(i) * k - sweep * f);
    pos.setY(i, pos.getY(i) * k + dihedral * f);
    pos.setZ(i, side * pos.getZ(i));
  }
  if (side < 0) flipWinding(geo);                                 // mirrored: keep the faces pointing out
  geo.computeVertexNormals();
  return geo;
}
function flipWinding(geo: THREE.BufferGeometry) {
  const idx = geo.index;
  if (idx) { const a = idx.array as Uint16Array | Uint32Array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } idx.needsUpdate = true; return; }
  for (const name of Object.keys(geo.attributes)) {
    const at = geo.getAttribute(name) as THREE.BufferAttribute;
    for (let i = 0; i + 2 < at.count; i += 3) for (let c = 0; c < at.itemSize; c++) {
      const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t);
    }
    at.needsUpdate = true;
  }
}

/**
 * VTOL fixed-wing mapping drone: a laminar fuselage, tapered swept wings with
 * winglets, twin booms carrying four lift rotors (parked fore-and-aft in
 * cruise), a twin-fin tail, a rear pusher prop, a nadir survey camera window,
 * a pitot tube and wingtip nav lights.
 */
function buildVtol(M: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const g = new THREE.Group(); const { add, rod } = kit(g);
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [], strobes: THREE.Mesh[] = [];
  // Fuselage: a lathe profile laid along x.
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 28; i++) {
    const u = i / 28, y = 0.95 - u * 1.85;                                // nose at +0.95, tail at -0.9
    const r = u < 0.28 ? 0.13 * Math.sin((u / 0.28) * Math.PI / 2) ** 0.6 : 0.13 - (u - 0.28) / 0.72 * 0.095;
    prof.push(new THREE.Vector2(Math.max(0.002, r), y));
  }
  const fus = new THREE.LatheGeometry(prof.reverse(), 40).rotateZ(-Math.PI / 2);
  const body = add(fus, M.gloss, 0, 0, 0); body.scale.set(1, 0.85, 0.9);
  add(new RoundedBoxGeometry(0.26, 0.04, 0.12, 3, 0.018), M.graphite, 0.42, 0.1, 0);                          // canopy fairing
  add(new RoundedBoxGeometry(0.16, 0.03, 0.09, 3, 0.012), M.glass, 0.26, -0.105, 0);                          // nadir camera window
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), M.lens, 0.26, -0.12, 0);
  rod([0.93, -0.01, 0.0], [1.12, -0.01, 0.0], 0.006, M.metal);                                              // pitot
  add(new THREE.TorusGeometry(0.105, 0.006, 8, 40), M.safety, 0.02, 0, 0, 0, Math.PI / 2).scale.set(1, 0.85, 0.9);
  // Wings with winglets.
  const span = 1.25, chord = 0.36;
  for (const s of [1, -1] as const) {
    const w = add(wingPanel(s, span, chord, 0.45, 0.14, 0.07), M.gloss, 0.12, 0.07, s * 0.08);
    void w;
    const tipX = 0.12 - 0.14, tipZ = s * (0.08 + span), tipY = 0.07 + 0.07;
    add(new RoundedBoxGeometry(0.12, 0.08, 0.01, 2, 0.004), M.gloss, tipX - 0.02, tipY + 0.035, tipZ, 0, 0, 0.35);
    add(new THREE.SphereGeometry(0.018, 10, 8), s > 0 ? M.ledGreen : M.ledRed, tipX + 0.05, tipY, tipZ);
  }
  // Booms with four lift rotors, parked along the boom in cruise.
  for (const s of [1, -1]) {
    const z = s * 0.55;
    rod([0.78, 0.01, z], [-1.0, 0.01, z], 0.028, M.gloss, 16);
    add(new THREE.SphereGeometry(0.028, 12, 8), M.gloss, 0.78, 0.01, z);
    for (const x of [0.72, -0.72]) {
      const top = motor(g, M, x, 0.035, z, 0.045, 0.04, M.graphite);
      const { prop, disc } = makeProp(0.3, 2, M.blade, M.graphite, blurTex, { chord: 0.11 });
      prop.position.set(x, top, z); prop.userData.parked = true; g.add(prop); props.push(prop); blur.push(disc);
    }
    // Tail fin at the boom end.
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.24, 0); fin.lineTo(0.12, 0.26); fin.lineTo(0.02, 0.26); fin.closePath();
    add(new THREE.ExtrudeGeometry(fin, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }), M.gloss, -1.0, 0.02, z - 0.007);
  }
  add(new RoundedBoxGeometry(0.15, 0.018, 1.14, 2, 0.008), M.gloss, -0.9, 0.27, 0);                         // stabiliser across the fins
  const tailStrobe = add(new THREE.SphereGeometry(0.016, 10, 8), M.strobe, -0.83, 0.285, 0); strobes.push(tailStrobe);
  // Pusher: a motor on the tail cone and a prop spinning about x.
  add(new THREE.CylinderGeometry(0.03, 0.045, 0.08, 20), M.graphite, -0.94, 0, 0, 0, 0, Math.PI / 2);
  const pusherMount = new THREE.Group(); pusherMount.position.set(-1.0, 0, 0); pusherMount.rotation.z = Math.PI / 2; g.add(pusherMount);
  const { prop: pusher, disc: pusherDisc } = makeProp(0.24, 2, M.blade, M.graphite, blurTex, { chord: 0.13, opacity: 0.24 });
  pusherMount.add(pusher); props.push(pusher); blur.push(pusherDisc);
  return { group: g, props, blur, strobes, parts: { pusher } };
}

/* ------------------------------------------------------------------ 6. heavy-lift cargo X8 */

/**
 * Heavy-lift cargo X8: coaxial motor pairs on four thick arms (eight props,
 * top and bottom turning against each other), a matte body with safety-orange
 * panels, a parachute canister, tall splayed legs and a winch carrying a
 * slung cargo pod on a tether.
 */
function buildCargo(M: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const g = new THREE.Group(); const { add, rod } = kit(g);
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [], strobes: THREE.Mesh[] = [];
  add(new RoundedBoxGeometry(0.74, 0.24, 0.62, 5, 0.08), M.matte, 0, 0, 0);
  add(new RoundedBoxGeometry(0.5, 0.06, 0.42, 4, 0.025), M.safety, -0.02, 0.13, 0);
  for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.4, 0.1, 0.01, 2, 0.004), M.safety, 0, 0, s * 0.312);
  add(new RoundedBoxGeometry(0.1, 0.12, 0.44, 3, 0.03), M.matte, 0.36, -0.02, 0);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), M.lens, 0.41, 0.0, 0, 0, 0, Math.PI / 2);
  // Parachute canister, GPS, strobe.
  add(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 28), M.matte, -0.2, 0.24, 0);
  add(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 28), M.safety, -0.2, 0.33, 0);
  add(new THREE.CylinderGeometry(0.06, 0.065, 0.025, 24), M.white, 0.14, 0.18, 0);
  strobes.push(add(new THREE.SphereGeometry(0.026, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.strobe, 0.14, 0.195, 0.12));
  // Arms and coaxial pairs.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tip: V3 = [sx * 0.95, 0.02, sz * 0.95];
    rod([sx * 0.28, 0.02, sz * 0.24], tip, 0.05, M.carbon, 18);
    add(new THREE.CylinderGeometry(0.056, 0.056, 0.06, 18), M.safety, sx * 0.8, 0.02, sz * 0.8, Math.PI / 2, -Math.atan2(sz, sx) + Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 22), M.matte, tip[0], tip[1], tip[2]);
    const top = motor(g, M, tip[0], tip[1] + 0.04, tip[2], 0.1, 0.09, M.matte);
    const up = makeProp(0.58, 2, M.blade, M.matte, blurTex, { chord: 0.12 });
    up.prop.position.set(tip[0], top + 0.01, tip[2]); g.add(up.prop); props.push(up.prop); blur.push(up.disc);
    // Lower motor: the same unit mounted upside down.
    const low = new THREE.Group(); low.position.set(tip[0], tip[1] - 0.04, tip[2]); low.rotation.x = Math.PI; g.add(low);
    const lTop = motor(low, M, 0, 0, 0, 0.1, 0.09, M.matte);
    const dn = makeProp(0.58, 2, M.blade, M.matte, blurTex, { chord: 0.12 });
    dn.prop.position.set(0, lTop + 0.01, 0); low.add(dn.prop); props.push(dn.prop); blur.push(dn.disc);
    add(new THREE.SphereGeometry(0.024, 10, 8), sx > 0 ? M.ledFront : sz > 0 ? M.ledGreen : M.ledRed, tip[0] + sx * 0.08, tip[1], tip[2] + sz * 0.08);
  }
  // Tall splayed legs with foot pads.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    rod([sx * 0.26, -0.1, sz * 0.22], [sx * 0.5, -0.92, sz * 0.44], 0.024, M.carbon);
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 20), M.rubber, sx * 0.5, -0.93, sz * 0.44);
    rod([sx * 0.38, -0.5, sz * 0.33], [sx * 0.38, -0.5, -sz * 0.33], 0.01, M.metal);
  }
  // Winch, tether and slung pod.
  add(new RoundedBoxGeometry(0.2, 0.08, 0.18, 3, 0.02), M.matte, 0, -0.16, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 20), M.safety, 0, -0.22, 0, Math.PI / 2);
  const sling = new THREE.Group(); sling.position.set(0, -0.26, 0); g.add(sling);
  const sk = kit(sling);
  const L = 1.05;
  sk.rod([0, 0, 0], [0, -L, 0], 0.005, M.chip, 6);
  sk.add(new THREE.TorusGeometry(0.03, 0.008, 8, 20, Math.PI * 1.5), M.metal, 0, -L - 0.03, 0, 0, 0, Math.PI / 4);
  for (const [x, z] of [[0.18, 0.14], [0.18, -0.14], [-0.18, 0.14], [-0.18, -0.14]]) sk.rod([0, -L - 0.05, 0], [x, -L - 0.2, z], 0.003, M.chip, 4);
  sk.add(new RoundedBoxGeometry(0.46, 0.28, 0.34, 4, 0.04), M.white, 0, -L - 0.35, 0);
  for (const s of [-1, 1]) sk.add(new RoundedBoxGeometry(0.47, 0.05, 0.345, 2, 0.02), M.safety, 0, -L - 0.35 + s * 0.08, 0);
  sk.add(new RoundedBoxGeometry(0.2, 0.02, 0.03, 2, 0.008), M.matte, 0, -L - 0.2, 0);
  return { group: g, props, blur, strobes, parts: { sling } };
}

/* ------------------------------------------------------------------ registry */

/** The orange glow look of the Mavic-class airframe (droneModel.ts), as a lab variant. Its own materials, whatever the shared set is. */
function buildOrange(_m: Record<string, THREE.Material>, blurTex: THREE.Texture): Airframe {
  const d = buildGlowDrone(orangeGlowMaterials(), blurTex);
  return { group: d.group, props: d.props, blur: d.blur, strobes: [], parts: {} };
}

export const VARIANTS: VariantInfo[] = [
  { id: 'cinema', name: 'Cinema heavy-lift hexacopter', role: 'Aerial cinematography', features: ['Six folding carbon arms', 'Full-size cinema camera and long lens', 'Three-axis gimbal with matte box', 'Twin hot-swap batteries, GPS mast'], build: buildHex },
  { id: 'fpv', name: 'Freestyle FPV quad', role: 'Fast chase shots and fly-throughs', features: ['Stretched-X carbon frame', 'Action camera on a neon mount', 'Tri-blade translucent props', 'Underglow and lollipop antennas'], build: buildFpv },
  { id: 'enterprise', name: 'Enterprise security quad', role: 'Night patrol and inspection', features: ['Zoom, wide and thermal sensors', 'Searchlight on a second gimbal', 'Dual RTK antennas, strobe', 'Weather-sealed folding airframe'], build: buildEnterprise },
  { id: 'show', name: 'Light-show drone', role: 'Choreographed night-sky shows', features: ['Frosted RGB light dome', 'Ducted prop guards', 'Light enough to fly hundreds', 'Per-aircraft colour'], build: buildShow },
  { id: 'vtol', name: 'VTOL fixed-wing mapper', role: 'Large-site survey and mapping', features: ['Vertical take-off, wing-borne cruise', 'Four lift rotors, rear pusher', 'Nadir survey camera', 'Twin booms and twin fins'], build: buildVtol },
  { id: 'orange', name: 'Orange racer', role: 'Sample for the hero, from a reference image', features: ['Sculpted orange shell, dark glass canopy', 'Glowing cyan eye on the nose', 'Curved orange-over-navy arms with grilles', 'Cyan-lit motor pods, steel-blue props'], build: buildOrange },
  { id: 'cargo', name: 'Heavy-lift cargo X8', role: 'Equipment delivery on site', features: ['Eight props on coaxial pairs', 'Winch with a slung cargo pod', 'Parachute canister', 'Tall splayed landing gear'], build: buildCargo },
];
