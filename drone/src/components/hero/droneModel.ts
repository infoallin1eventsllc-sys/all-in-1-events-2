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
