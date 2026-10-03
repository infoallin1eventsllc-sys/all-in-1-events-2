import * as THREE from 'three';
import { Geo } from './city';
import * as T from './textures';
import { Metro, gauss, sstep, vnoise, type MetroCtx, type MetroSpec } from './metro';
import { spiral, type P3 } from './fly';

/**
 * Los Angeles for the patrol feed: downtown at golden hour, flown in one FPV take.
 *
 * The take: skimming the Harbor Freeway's northbound traffic, a climb at the
 * edge of downtown that brings the skyline up on the right, a bank into the
 * towers along Fifth, north up Flower between the Wilshire Grand and the Aon
 * Center, past California Plaza toward the Disney Hall's steel sails, east along
 * Temple, south beside City Hall's tower, and a climbing orbit of the US Bank
 * Tower's crown that turns at the end into the sunset over the basin.
 *
 * Downtown's grid is squared to the axes (blocks of 130 m, north is -z). The
 * Harbor Freeway (110) runs north-south west of downtown, the Hollywood Freeway
 * (101) east-west to its north; the basin's houses and palms run out to the
 * haze, with the hills and the San Gabriel Mountains behind.
 */

type V = [number, number, number];
const BLK = 130;
const WILSHIRE: [number, number] = [-195, 65], USBANK: [number, number] = [65, -195], AON: [number, number] = [195, 65];
const CALPLAZA: [number, number] = [-195, -325], CITYHALL: [number, number] = [455, -195], DISNEY: [number, number] = [-325, -455];
const F110 = -910, F101 = -1000, Y110 = 9, Y101 = 16;

function height(x: number, z: number) {
  let h = 0;
  for (let k = 0; k < 8; k++) h += gauss(x, z, -8000 + k * 2400, -7200 - (k % 2) * 500, 2300, 1300 + (k % 3) * 260);          // the San Gabriels
  for (let k = 0; k < 6; k++) h += gauss(x, z, -9000 + k * 1400, -4200 + (k % 2) * 300, 1000, 300 + (k % 3) * 70);             // the Hollywood Hills
  h += gauss(x, z, -700, -2600, 600, 110) + gauss(x, z, 1000, -3000, 800, 150) + gauss(x, z, -2300, -3200, 700, 190);           // Elysian Park, Mount Washington
  let r = 0, amp = 1, f = 1 / 600;
  for (let o = 0; o < 3; o++) { r += amp * (1 - Math.abs(vnoise(x * f + 3.1, z * f + 8.7) * 2 - 1)); amp *= 0.5; f *= 2.1; }
  h += (r / 1.75) * sstep(15, 300, h) * h * 0.3;
  return h * sstep(1400, 2200, Math.hypot(x, z + 300));
}

/** A strip of road deck along a polyline: lane-marked top, a slab edge, parapets, and columns down to the ground. */
function deck(road: Geo, slab: Geo, cols: THREE.Vector3[], pts: V[], width: number) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), nx = (-dz / l) * width / 2, nz = (dx / l) * width / 2;
    const u0 = k === 0 ? 0 : 0, len = Math.hypot(dx, by - ay, dz);
    road.quad([ax - nx, ay, az - nz], [dx, by - ay, dz], [nx * 2, 0, nz * 2], [u0, 0, u0 + len / T.ROAD_TILE, 0, u0 + len / T.ROAD_TILE, 1, u0, 1], 1);
    road.quad([ax - nx, ay - 1.8, az - nz], [nx * 2, 0, nz * 2], [dx, by - ay, dz], [0, 0, 0, 1, 1, 1, 1, 0], 0.35);                // underside
    for (const s of [-1, 1]) {
      const ox = s * nx, oz = s * nz;
      slab.wall(ax + ox, az + oz, bx + ox, bz + oz, ay - 1.8, ay + 1.1, 0, 1, 0, 1, 0.72);
      slab.wall(bx + ox, bz + oz, ax + ox, az + oz, ay - 1.8, ay + 1.1, 0, 1, 0, 1, 0.72);
    }
    for (let s = 0; s < l; s += 42) cols.push(new THREE.Vector3(ax + (dx * s) / l, ay + (by - ay) * (s / l), az + (dz * s) / l));
  }
}

function landmarks(c: MetroCtx) {
  // Freeways: the Harbor (110) north-south, the Hollywood (101) east-west above it, and two flyover ramps between them.
  {
    const road = new Geo(), slab = new Geo(), cols: THREE.Vector3[] = [];
    for (const off of [-9.5, 9.5]) {
      deck(road, slab, cols, [[F110 + off, Y110, 3600], [F110 + off, Y110, -1800]], 16);
      deck(road, slab, cols, [[-4400, Y101, F101 + off], [4400, Y101, F101 + off]], 16);
    }
    const ramp = (pts: V[]) => { const cv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))); deck(road, slab, cols, cv.getPoints(40).map(p => [p.x, p.y, p.z] as V), 9); };
    ramp([[F110 + 18, Y110, -560], [F110 + 30, 14, -800], [F110 + 140, 23, -930], [F110 + 330, Y101, F101 + 15], [F110 + 560, Y101, F101 + 15]]);
    ramp([[F110 - 18, Y110, -1450], [F110 - 40, 22, -1230], [F110 - 150, 31, -1080], [F110 - 360, 24, F101 - 16], [F110 - 620, Y101, F101 - 16]]);
    const lane = T.laneTex();
    c.add(new THREE.Mesh(road.geometry(), new THREE.MeshStandardMaterial({ map: lane, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide })), 0x9a9a9a);
    c.add(new THREE.Mesh(slab.geometry(), new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide })), 0x8a8a8a);
    const colG = new THREE.CylinderGeometry(1.4, 1.7, 1, 10).translate(0, 0.5, 0), colM = new THREE.MeshStandardMaterial({ color: 0xaaa497, roughness: 0.9 });
    const im = new THREE.InstancedMesh(colG, colM, cols.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    cols.forEach((p, i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, -0.5, p.z), q, new THREE.Vector3(1, p.y - 1.3, 1))));
    c.add(im as unknown as THREE.Mesh, 0x8a8a8a);
    for (let z = 3500; z > -1800; z -= 60) for (const s of [-1, 1]) c.lamp(F110 + s * 19, Y110 + 11, z, 5, [1.4, 0.95, 0.55]);
    for (let x = -4300; x < 4300; x += 60) for (const s of [-1, 1]) c.lamp(x, Y101 + 11, F101 + s * 19, 5, [1.4, 0.95, 0.55]);
  }
  // Wilshire Grand Center: a tapering glass tower under a curved sail, the spire, the LED crown.
  {
    const [cx, cz] = WILSHIRE, glass = c.glass(0x86a3b8, 0.08);
    const body = c.add(new THREE.Mesh(new THREE.CylinderGeometry(28, 36, 294, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.62).translate(0, 147, 0), glass)); body.position.set(cx, -1, cz);
    const sail = new THREE.Shape(); sail.moveTo(-28, 0); sail.lineTo(28, 0); sail.lineTo(28, 30); sail.quadraticCurveTo(-4, 24, -28, 0);
    const crownM = new THREE.MeshStandardMaterial({ color: 0x9fb4c6, roughness: 0.1, metalness: 0.7, emissive: 0xbfe0ff, emissiveIntensity: 0 });
    c.glowBy(crownM, [0, 0.3, 1.5]);
    const crown = c.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sail, { depth: 34, bevelEnabled: false }).translate(0, 0, -17), crownM)); crown.position.set(cx, 293, cz);
    const spire = c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 22, 8).translate(0, 324 + 11 - 22, 0), c.metal())); spire.position.set(cx + 26, 0, cz);
    c.lamp(cx + 26, 336, cz, 9, [2.2, 0.2, 0.15]);
  }
  // US Bank Tower: the round granite shaft stepping in at the top, the glass crown lit after dark, the helipad.
  {
    const [cx, cz] = USBANK, f = T.facade('stone');
    const tex = f.map.clone(); tex.repeat.set((2 * Math.PI * 34) / T.FACADE_W, 240 / T.FACADE_H); tex.needsUpdate = true;
    const night = f.night.clone(); night.repeat.copy(tex.repeat); night.needsUpdate = true;
    const granite = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: night, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7, color: 0xd8d2c8 });
    c.glowBy(granite, [0, 0.35, 1.3]);
    for (const [r, y0, y1] of [[34, 0, 240], [31, 240, 268], [27, 268, 290]] as [number, number, number][]) { const m = c.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 40).translate(0, (y0 + y1) / 2, 0), granite)); m.position.set(cx, -1, cz); }
    const crownM = new THREE.MeshStandardMaterial({ color: 0x9fb2c0, roughness: 0.08, metalness: 0.6, emissive: 0xf4f8ff, emissiveIntensity: 0 });
    c.glowBy(crownM, [0, 0.4, 1.8]);
    const crown = c.add(new THREE.Mesh(new THREE.CylinderGeometry(22, 25, 16, 40).translate(0, 297, 0), crownM)); crown.position.set(cx, -1, cz);
    const pad = c.add(new THREE.Mesh(new THREE.CylinderGeometry(21, 21, 1.2, 40).translate(0, 306, 0), new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.8 }))); pad.position.set(cx, -1, cz);
    c.lamp(cx, 309, cz, 9, [2.2, 0.2, 0.15]);
  }
  // Aon Center: the dark slab with its chamfered corners.
  { const [cx, cz] = AON; c.mass(cx - 30, cz - 20, cx + 30, cz + 20, -1, 262, 'glass', [0.32, 0.33, 0.36]); c.lamp(cx, 265, cz, 8, [2.2, 0.2, 0.15]); }
  // Two California Plaza: an octagonal glass shaft under a pyramid.
  {
    const [cx, cz] = CALPLAZA, glass = c.glass(0x7d97aa, 0.1);
    const t = c.add(new THREE.Mesh(new THREE.CylinderGeometry(24, 26, 212, 8).translate(0, 106, 0), glass)); t.position.set(cx, -1, cz);
    const p = c.add(new THREE.Mesh(new THREE.ConeGeometry(24, 20, 8).translate(0, 222, 0), c.metal(0xb7bcc2, 0.3))); p.position.set(cx, -1, cz);
  }
  // City Hall: the white tower on its wide base, stepping up to the pyramid roof.
  {
    const [cx, cz] = CITYHALL, white: V = [1.15, 1.14, 1.1];
    c.mass(cx - 55, cz - 45, cx + 55, cz + 45, -1, 30, 'stone', white);
    c.mass(cx - 20, cz - 20, cx + 20, cz + 20, 30, 108, 'stone', white);
    c.mass(cx - 16, cz - 16, cx + 16, cz + 16, 108, 122, 'stone', white);
    const roofM = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.6, emissive: 0xfff0d0, emissiveIntensity: 0 });
    c.glowBy(roofM, [0, 0.2, 0.9]);
    const roof = c.add(new THREE.Mesh(new THREE.ConeGeometry(18, 24, 4).rotateY(Math.PI / 4).translate(0, 134, 0), roofM)); roof.position.set(cx, 0, cz);
    c.lamp(cx, 147, cz, 7, [2.2, 0.2, 0.15]);
  }
  // Walt Disney Concert Hall: stainless steel sails billowing over a stone base.
  {
    const [cx, cz] = DISNEY, steel = c.metal(0xd8dadc, 0.16);
    c.mass(cx - 48, cz - 42, cx + 48, cz + 42, -1, 8, 'stone', [1.05, 1.02, 0.96]);
    const sails: [number, number, number, number, number, number, number][] = [
      [-20, -12, 34, 30, 0.2, 1.9, 0.18], [12, -20, 30, 26, 1.3, 1.7, -0.22], [22, 16, 28, 34, 2.6, 1.6, 0.25], [-16, 22, 26, 22, 3.9, 1.8, -0.15], [0, 0, 22, 40, 5.0, 1.4, 0.1],
    ];
    for (const [ox, oz, r, h, th0, len, tilt] of sails) {
      const g = new THREE.CylinderGeometry(r, r * 0.8, h, 28, 1, true, th0, len).translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, steel); m.material.side = THREE.DoubleSide;
      m.position.set(cx + ox, 7, cz + oz); m.rotation.set(tilt, 0, -tilt * 0.6);
      c.add(m, 0xb0b0b0);
    }
  }
}

export function losAngelesSpec(): MetroSpec {
  // The take: the 110 northbound, the climb, Fifth east, Flower north, Temple east, beside City Hall, the US Bank orbit, the sunset.
  const pre: P3[] = [
    [F110 - 4, 16, 2150], [F110 - 4, 17, 1650], [F110 - 3, 18, 1250], [F110 + 2, 24, 1030], [-880, 95, 900], [-830, 205, 760], [-650, 172, 560],
    [-450, 152, 400], [-260, 146, 392], [-150, 142, 300], [-130, 146, 120], [-130, 150, -120], [-132, 132, -370], [-100, 112, -535],
    [60, 106, -522], [290, 102, -521], [388, 106, -430], [390, 112, -260], [382, 128, -130],
  ];
  const orbit = spiral(USBANK[0], USBANK[1], 132, 172, 140, 430, 0.23, 1.0, 12);
  const post: P3[] = [[250, 450, 20], [120, 470, 230]];
  const points = [...pre, ...orbit, ...post];
  const speed = [0.55, 1.35, 1.45, 1.3, 0.85, 0.55, 1.05, 1.2, 1.3, 1.25, 1.4, 1.45, 1.35, 1.2, 1.3, 1.3, 1.15, 1.2, 1.05, ...orbit.map(() => 0.95), 0.8, 0.65];
  return {
    name: 'Los Angeles', seed: 1781, mood: 'GOLDEN', size: 20000,
    sun: { DAY: new THREE.Vector3(0.3, 0.75, 0.55).normalize(), GOLDEN: new THREE.Vector3(-0.93, 0.12, -0.2).normalize(), BLUE: new THREE.Vector3(-0.4, 0.5, 0.2).normalize() },
    haze: { DAY: { color: 0xc4ccd2, density: 0.00012 }, GOLDEN: { color: 0xc49a7e, density: 0.00013 }, BLUE: { color: 0x121626, density: 0.00018 } },
    grid: { px: BLK, pz: BLK, wx: 20, wz: 20 },
    blocks: { i0: -6, i1: 5, j0: -6, j1: 5 },
    land: () => 1,
    height,
    block: (i, j) => {
      if (i === 2 && j === -2) return 'park';          // Grand Park
      if (i === 0 && j === 2) return 'park';           // Pershing Square
      return 'built';
    },
    lot: (cx, cz, r) => {
      const core = Math.exp(-((cx - 0) ** 2 + (cz + 100) ** 2) / (430 * 430));
      const floors = Math.round(4 + r() * 8 + core * (16 + r() * 44));
      const style = core > 0.4 ? (r() < 0.6 ? 'glass' : r() < 0.6 ? 'concrete' : 'stone') : (r() < 0.4 ? 'concrete' : r() < 0.6 ? 'stone' : 'brick');
      return { floors, style, form: floors > 18 ? 'tower' : 'block' };
    },
    clear: [[...WILSHIRE, 42], [...USBANK, 40], [...AON, 38], [...CALPLAZA, 30], [...CITYHALL, 64], [...DISNEY, 62]],
    keepOut: (x, z) => (Math.abs(x - F110) < 40 && z > -1850) || Math.abs(z - F101) < 40 || Math.hypot(x - F110, z - F101) < 700,
    landmarks,
    traffic: {
      avenues: [-5, -3, -1, 1, 3, 5], streets: [-5, -3, -1, 1, 3, 5], cars: 700,
      paths: [
        { pts: [[F110, Y110, 3600], [F110, Y110, -1800]], lanes: 4, width: 36 },
        { pts: [[-4400, Y101, F101], [4400, Y101, F101]], lanes: 4, width: 36 },
      ],
    },
    carColors: [[0xeeeeea, 24], [0x16171a, 20], [0x8a8d92, 18], [0xb9bcc0, 12], [0x2a3a66, 7], [0x7a1c1c, 7], [0x55585c, 8], [0xd8cfc0, 4]],
    trees: { kind: 'palm', every: 16 },
    sprawl: [{ x0: -4600, x1: 4600, z0: -3600, z1: 4200, pitch: 52, floors: [1, 2], palette: [0xe8dcc6, 0xd9c7a8, 0xf0e8d8, 0xc9b79c, 0xe0cfb8, 0xb8a58a, 0xf2efe6, 0xd6c3a3, 0xa8b0a0] }],
    paint: { land: '#a99d88', park: '#5d7440', hill: '#6f6a4c', street: '#5a5b5d' },
    route: {
      points, speed, dur: 72, easeIn: 2.5, fov: 76, lookAhead: 55, bank: 0.75, maxBank: 0.62,
      holds: [
        { from: pre.length + 1, to: pre.length + orbit.length - 1, at: [USBANK[0], 285, USBANK[1]], weight: 0.72 },
        { from: pre.length + orbit.length - 0.5, to: points.length - 1, at: [-7000, 250, -1500], weight: 0.8 },
      ],
    },
  };
}

export const losAngeles = (maxAniso: number, glow: THREE.Texture, renderer: THREE.WebGLRenderer | null) => new Metro(losAngelesSpec(), maxAniso, glow, renderer);
