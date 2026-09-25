import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.03, -0.018); bladeShape.bezierCurveTo(0.12, -0.05, 0.3, -0.036, R, -0.01); bladeShape.quadraticCurveTo(R + 0.006, 0.004, R - 0.01, 0.012);
  bladeShape.bezierCurveTo(0.3, 0.022, 0.12, 0.032, 0.03, 0.018); bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 24 }).rotateX(-Math.PI / 2);
  { // a little twist: pitch falls off towards the tip
    const pos = bladeGeo.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const a = 0.28 * (1 - v.x / R); const c = Math.cos(a), sn = Math.sin(a); pos.setXYZ(i, v.x, v.y * c + v.z * sn, -v.y * sn + v.z * c); }
    bladeGeo.computeVertexNormals();
  }
  const stripeGeo = new THREE.BoxGeometry(0.018, 0.009, 0.034);
  const discGeo = new THREE.CircleGeometry(R + 0.01, q(48));
  for (const [fx, fz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
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
      const b = new THREE.Mesh(bladeGeo, M.blade); b.rotation.y = k * Math.PI; prop.add(b);
      const st = new THREE.Mesh(stripeGeo, M.stripe); st.position.set(R - 0.045, 0.004, 0); b.add(st);
    }
    add(new THREE.CylinderGeometry(0.03, 0.034, 0.014, q(24)), M.graphite, 0, 0, 0, 0, 0, 0, prop);
    const cap = add(new THREE.SphereGeometry(0.02, q(16), q(10)), M.metal, 0, 0.008, 0, 0, 0, 0, prop); cap.scale.y = 0.6;
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: blurTex, color: 0x9aa4b0, transparent: true, opacity: 0.14, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004;
    prop.add(disc); g.add(prop); props.push(prop); blur.push(disc);
  }
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
