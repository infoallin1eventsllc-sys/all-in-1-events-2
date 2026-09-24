import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The Mavic-class quadcopter used wherever the console shows an aircraft in 3D
 * (the Overview hero, the survey stage). Built from primitives so it ships with
 * the app; a purchased glTF of a specific airframe could replace `buildDrone`.
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
 * A Mavic-class consumer quadcopter, built from primitives: white-and-graphite
 * two-tone shell with a seam line, folding carbon arms on hinge pivots, motor
 * housings with a brushed ring and vent slits, tapered two-blade propellers with
 * a blur disc, a three-axis gimbal on the nose cradling a blue-coated lens,
 * obstacle sensors, status LEDs, landing skids and micro-screws.
 * Local axes: +x forward, +y up, +z right. About 1.3 units nose to tail.
 */
export function buildDrone(mats: Record<string, THREE.Material>, blurTex: THREE.Texture): { group: THREE.Group; props: THREE.Group[]; blur: THREE.Mesh[] } {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); g.add(mesh); return mesh;
  };
  // Shell: white upper, graphite lower, a dark seam between, a tapered nose and a battery hump at the tail.
  add(new RoundedBoxGeometry(0.92, 0.2, 0.4, 5, 0.08), mats.white, 0, 0.05, 0);
  add(new RoundedBoxGeometry(0.34, 0.16, 0.32, 4, 0.06), mats.white, 0.52, 0.01, 0);
  add(new RoundedBoxGeometry(0.9, 0.12, 0.42, 4, 0.05), mats.graphite, -0.02, -0.08, 0);
  add(new THREE.BoxGeometry(0.93, 0.008, 0.415), mats.seam, 0, -0.03, 0);
  add(new RoundedBoxGeometry(0.3, 0.1, 0.3, 4, 0.04), mats.graphite, -0.36, 0.14, 0);
  add(new RoundedBoxGeometry(0.16, 0.006, 0.07, 2, 0.003), mats.logo, -0.02, 0.152, 0);             // manufacturer mark
  for (const zz of [-0.215, 0.215]) for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.05, 0.004, 0.006), mats.seam, -0.18 - k * 0.07, -0.06, zz);  // vent slits
  for (const [x, z] of [[0.3, 0.14], [0.3, -0.14], [-0.3, 0.14], [-0.3, -0.14]]) add(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 8), mats.metal, x, -0.142, z);  // micro screws
  // Obstacle-avoidance sensors: two on the nose, two underneath.
  const sensorGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.01, 12);
  for (const zz of [-0.09, 0.09]) add(sensorGeo, mats.sensor, 0.69, 0.02, zz, 0, 0, Math.PI / 2);
  for (const zz of [-0.1, 0.1]) add(sensorGeo, mats.sensor, 0.12, -0.145, zz);
  // Arms: front pair swept forward and up, rear pair back and lower, each on a hinge pivot.
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.02, -0.024); bladeShape.quadraticCurveTo(0.2, -0.05, 0.38, -0.012); bladeShape.lineTo(0.38, 0.008); bladeShape.quadraticCurveTo(0.2, 0.042, 0.02, 0.024); bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.007, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.39, 40);
  const arms: [number, number, number, number, number, number][] = [
    [0.36, 0.0, 0.17, 0.66, 0.05, 0.55], [0.36, 0.0, -0.17, 0.66, 0.05, -0.55],
    [-0.34, -0.03, 0.18, -0.62, -0.07, 0.6], [-0.34, -0.03, -0.18, -0.62, -0.07, -0.6],
  ];
  arms.forEach(([hx, hy, hz, tx, ty, tz], k) => {
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16), mats.graphite, hx, hy, hz);                           // hinge pivot
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), mats.metal, hx, hy, hz);                                // pivot pin
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, len = Math.hypot(dx, dy, dz);
    const arm = add(new RoundedBoxGeometry(len + 0.06, 0.05, 0.062, 3, 0.02), mats.carbon, (hx + tx) / 2, (hy + ty) / 2, (hz + tz) / 2);
    arm.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)), 'YZX');
    add(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 20), mats.graphite, tx, ty + 0.05, tz);                       // motor housing
    add(new THREE.TorusGeometry(0.078, 0.008, 8, 28), mats.metal, tx, ty + 0.1, tz, Math.PI / 2);                   // brushed ring
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), mats.metal, tx, ty + 0.115, tz);                          // motor bell
    for (let v = 0; v < 4; v++) add(new THREE.BoxGeometry(0.03, 0.005, 0.005), mats.seam, tx + 0.06 * Math.cos(v * 1.57), ty + 0.03, tz + 0.06 * Math.sin(v * 1.57), 0, -v * 1.57, 0);
    if (k < 2) add(new RoundedBoxGeometry(0.028, 0.13, 0.028, 2, 0.008), mats.skid, tx - 0.02, ty - 0.06, tz);   // front landing skids
    // Status LEDs on the arm tips: white-ish forward, green and red aft.
    const led = add(new THREE.SphereGeometry(0.02, 10, 8), k < 2 ? mats.ledFront : k === 2 ? mats.ledGreen : mats.ledRed, tx + (k < 2 ? 0.04 : -0.04), ty - 0.01, tz + Math.sign(tz) * 0.05);
    void led;
    // Propeller: two tapered blades with a little pitch, and a blur disc.
    const prop = new THREE.Group(); prop.position.set(tx, ty + 0.135, tz);
    const b1 = new THREE.Mesh(bladeGeo, mats.blade); b1.rotation.x = 0.22;
    const b2 = new THREE.Mesh(bladeGeo, mats.blade); b2.rotation.set(0.22, Math.PI, 0);
    prop.add(b1, b2, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.02, 12), mats.graphite));
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: blurTex, color: 0x8c949e, transparent: true, opacity: 0.2, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004; prop.add(disc);
    g.add(prop); props.push(prop); blur.push(disc);
  });
  for (const zz of [-0.12, 0.12]) add(new RoundedBoxGeometry(0.03, 0.08, 0.03, 2, 0.008), mats.skid, -0.42, -0.17, zz);   // rear skids
  // Gimbal: dampers, roll motor, an articulated arm with pivot joints, the camera body and lens, tilted slightly down.
  add(new THREE.BoxGeometry(0.1, 0.05, 0.16), mats.graphite, 0.5, -0.135, 0);
  for (const zz of [-0.05, 0.05]) add(new THREE.SphereGeometry(0.014, 8, 6), mats.rubber, 0.52, -0.165, zz);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), mats.graphite, 0.58, -0.17, 0, 0, 0, Math.PI / 2);          // roll motor
  add(new THREE.SphereGeometry(0.018, 10, 8), mats.metal, 0.61, -0.17, 0);                                          // pivot joint
  add(new RoundedBoxGeometry(0.026, 0.1, 0.026, 2, 0.008), mats.graphite, 0.61, -0.22, 0.07);                       // arm down
  add(new RoundedBoxGeometry(0.026, 0.026, 0.09, 2, 0.008), mats.graphite, 0.61, -0.265, 0.035);                    // arm across
  add(new THREE.SphereGeometry(0.016, 10, 8), mats.metal, 0.61, -0.265, 0.075);                                     // tilt joint
  const camGroup = new THREE.Group(); camGroup.position.set(0.61, -0.265, 0); camGroup.rotation.z = -0.28;          // tilted down, stabilising
  const camBody = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.1, 0.12, 3, 0.03), mats.graphite); camGroup.add(camBody);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.05, 24), mats.graphite); barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.075; camGroup.add(barrel);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 8, 28), mats.metal); ring.rotation.y = Math.PI / 2; ring.position.x = 0.1; camGroup.add(ring);       // aperture ring
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), mats.lens); lens.rotation.z = Math.PI / 2; lens.position.x = 0.098; camGroup.add(lens);
  const coat = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), mats.coating); coat.rotation.y = Math.PI / 2; coat.position.x = 0.105; camGroup.add(coat);          // blue anti-reflective glint
  g.add(camGroup);
  return { group: g, props, blur };
}

/** Materials for one fleet; share the record across aircraft. */
export function droneMaterials(): Record<string, THREE.Material> {
  const mats: Record<string, THREE.Material> = {
    white: new THREE.MeshPhysicalMaterial({ color: 0xb9bec4, metalness: 0.02, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.45 }),
    graphite: new THREE.MeshPhysicalMaterial({ color: 0x2c3036, metalness: 0.15, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.35, roughness: 0.42 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x0c0e11, metalness: 0.2, roughness: 0.8 }),
    logo: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.4, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.95, roughness: 0.32 }),
    skid: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.1, roughness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0, roughness: 0.95 }),
    sensor: new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: 0.1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x08111f, metalness: 0.05, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 }),
    coating: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.55, 1.4), transparent: true, opacity: 0.55, toneMapped: false }),
    blade: new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide }),
    ledFront: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.9, 2.4), toneMapped: false }),
    ledGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.7), toneMapped: false }),
    ledRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.25, 0.2), toneMapped: false }),
  };
  return mats;
}

/** Perforated grille for the arm side panels: dark with rows of orange-lit holes. */
function meshTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c1522'; g.fillRect(0, 0, 128, 32);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
    const cx = 4 + x * 8 + (y % 2) * 4, cy = 4 + y * 8;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 3.2); gr.addColorStop(0, '#ffb35a'); gr.addColorStop(0.6, '#c9561a'); gr.addColorStop(1, 'rgba(12,21,34,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 3.2, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
}

/**
 * Materials for the orange racer (buildGlowDrone): candy-orange clearcoat, deep
 * navy gloss, dark glass, gunmetal, steel-blue props, and a cyan light that
 * blooms. Same keys the hero reads (white, graphite, blade, ledFront ...), so it
 * drops into the hero as a sample look.
 */
export function orangeGlowMaterials(): Record<string, THREE.Material> {
  const m = droneMaterials();
  const cyan = new THREE.Color(0.35, 1.55, 2.9);
  m.white = new THREE.MeshPhysicalMaterial({ color: 0xf07318, metalness: 0.05, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  m.graphite = new THREE.MeshPhysicalMaterial({ color: 0x0c1830, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  m.glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1c36, metalness: 0.3, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 });
  m.gunmetal = new THREE.MeshStandardMaterial({ color: 0x626a74, metalness: 0.85, roughness: 0.32 });
  m.blade = new THREE.MeshPhysicalMaterial({ color: 0x7196b8, metalness: 0.55, roughness: 0.28, clearcoat: 0.8, side: THREE.DoubleSide });
  m.glow = new THREE.MeshBasicMaterial({ color: cyan, toneMapped: false });
  m.tube = new THREE.MeshPhysicalMaterial({ color: 0x19c4ff, emissive: new THREE.Color(0x0a8fd8), emissiveIntensity: 1.6, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.85 });
  m.grille = new THREE.MeshStandardMaterial({ map: meshTexture(), metalness: 0.4, roughness: 0.45 });
  m.ledFront = m.glow; m.ledGreen = m.glow; m.ledRed = m.glow;
  return m;
}

/**
 * The orange racer from the reference image: a sculpted orange shell like a
 * helmet with a dark glass canopy and two antennas; a big glowing cyan eye in a
 * dark bezel on the nose with round sensors either side; four thick curved arms,
 * orange over navy, with perforated grilles down their sides; orange motor pods
 * with gunmetal bands, glowing cyan rings and cyan hoses underneath; long
 * steel-blue two-blade props. Local axes as buildDrone: +x forward, +y up, +z right.
 */
export function buildGlowDrone(M: Record<string, THREE.Material>, blurTex: THREE.Texture): { group: THREE.Group; props: THREE.Group[]; blur: THREE.Mesh[] } {
  const g = new THREE.Group();
  const UP = new THREE.Vector3(0, 1, 0);
  const ell = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, seg = 40) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const along = (o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => { o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); g.add(o); return o; };

  // Fuselage: navy belly, orange helmet shell with a raised spine, a bulging nose.
  ell(M.graphite, -0.02, -0.1, 0, 0.44, 0.16, 0.27);
  ell(M.white, 0, 0.02, 0, 0.46, 0.25, 0.29);
  ell(M.white, 0.04, 0.12, 0, 0.36, 0.17, 0.16);
  ell(M.white, 0.34, -0.05, 0, 0.21, 0.19, 0.2);
  for (const s of [-1, 1]) {
    ell(M.white, 0.3, -0.1, s * 0.13, 0.16, 0.13, 0.08);                        // cheeks sweeping down
    const panel = add(new THREE.CapsuleGeometry(0.05, 0.36, 8, 16), M.graphite, -0.04, -0.03, s * 0.275, 0, 0, Math.PI / 2); panel.scale.set(1, 1, 0.55);  // dark side panel
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.06, 0.008, 0.012), M.gunmetal, -0.14 + k * 0.08, -0.05, s * 0.302);            // intake slats
    // Round sensors either side of the eye, and the machinery under the chin.
    add(new THREE.CylinderGeometry(0.048, 0.052, 0.05, 28), M.gunmetal, 0.43, -0.13, s * 0.15, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 24), M.glass, 0.457, -0.13, s * 0.15, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 12), M.gunmetal, 0.3, -0.21, s * 0.08, 0, 0, Math.PI / 2.6);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), M.graphite, 0.24, -0.2, s * 0.12);
  }
  // Canopy of dark glass on top, two antennas behind it.
  ell(M.glass, 0.02, 0.19, 0, 0.22, 0.1, 0.13);
  ell(M.glass, 0.18, 0.13, 0, 0.12, 0.06, 0.09);
  for (const s of [-1, 1]) along(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.2, 8), M.graphite), new THREE.Vector3(-0.04, 0.26, s * 0.05), new THREE.Vector3(-0.1, 0.45, s * 0.065));
  // The eye: dark bezel, glowing cyan lens, a hot core.
  add(new THREE.TorusGeometry(0.078, 0.024, 16, 40), M.graphite, 0.52, -0.1, 0, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.068, 0.068, 0.02, 40), M.glow, 0.525, -0.1, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(0.03, 20, 14), M.glow, 0.54, -0.1, 0);

  // Arms: thick and curved, orange over navy, a perforated grille down the outer side, out to the motor pods.
  const props: THREE.Group[] = [], blur: THREE.Mesh[] = [];
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.03, -0.028); bladeShape.quadraticCurveTo(0.26, -0.06, 0.5, -0.016); bladeShape.lineTo(0.5, 0.01); bladeShape.quadraticCurveTo(0.26, 0.045, 0.03, 0.028); bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.51, 48);
  for (const [fx, fz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const root = new THREE.Vector3(fx * 0.12, 0.02, fz * 0.22);
    const tip = new THREE.Vector3(fx * 0.58, 0.07, fz * 0.74);
    const mid = root.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.05, 0));       // the arm arches up a little
    const curve = new THREE.QuadraticBezierCurve3(root, mid, tip);
    const top = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.066, 18), M.white); top.scale.y = 1; g.add(top);
    const under = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(root.clone().add(new THREE.Vector3(0, -0.035, 0)), mid.clone().add(new THREE.Vector3(0, -0.04, 0)), tip.clone().add(new THREE.Vector3(0, -0.035, 0))), 24, 0.06, 18), M.graphite); g.add(under);
    // Grille: a thin curved strip along the arm's outer flank.
    const out = new THREE.Vector3(-(tip.z - root.z), 0, tip.x - root.x).normalize().multiplyScalar(fz * fx > 0 ? 0.062 : -0.062);
    if ((out.x * fx + out.z * fz) < 0) out.multiplyScalar(-1);
    const gr = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(root.clone().lerp(tip, 0.18).add(out), mid.clone().add(out).add(new THREE.Vector3(0, -0.02, 0)), root.clone().lerp(tip, 0.82).add(out)), 16, 0.03, 10), M.grille);
    gr.scale.set(1, 1, 1); g.add(gr);
    // Motor pod: orange housing and dome, gunmetal band, navy base, cyan ring and hoses underneath.
    add(new THREE.CylinderGeometry(0.105, 0.1, 0.09, 32), M.white, tip.x, tip.y, tip.z);
    const dome = add(new THREE.SphereGeometry(0.105, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.white, tip.x, tip.y + 0.045, tip.z); dome.scale.y = 0.45;
    add(new THREE.TorusGeometry(0.105, 0.012, 10, 40), M.gunmetal, tip.x, tip.y + 0.005, tip.z, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.095, 0.085, 0.07, 32), M.graphite, tip.x, tip.y - 0.075, tip.z);
    add(new THREE.TorusGeometry(0.082, 0.02, 12, 40), M.glow, tip.x, tip.y - 0.115, tip.z, Math.PI / 2);
    const hose = add(new THREE.TorusGeometry(0.13, 0.018, 10, 32, Math.PI), M.tube, tip.x, tip.y - 0.06, tip.z, 0, Math.atan2(tip.x - root.x, tip.z - root.z), Math.PI);
    void hose;
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 16), M.gunmetal, tip.x, tip.y + 0.085, tip.z);
    const prop = new THREE.Group(); prop.position.set(tip.x, tip.y + 0.115, tip.z);
    const b1 = new THREE.Mesh(bladeGeo, M.blade); b1.rotation.x = 0.2;
    const b2 = new THREE.Mesh(bladeGeo, M.blade); b2.rotation.set(0.2, Math.PI, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 10), M.white); cap.scale.y = 0.7;
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: blurTex, color: 0x7fa6c8, transparent: true, opacity: 0.18, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004;
    prop.add(b1, b2, cap, disc); g.add(prop); props.push(prop); blur.push(disc);
  }
  return { group: g, props, blur };
}
