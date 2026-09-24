import * as THREE from 'three';
import { Metro, gauss, sstep, type MetroCtx, type MetroSpec } from './metro';
import { spiral, type P3 } from './fly';

/**
 * New York for the patrol feed: Manhattan from Central Park to the Battery as an
 * FPV pilot would fly it, in one continuous take.
 *
 * The take: low over the Great Lawn, a punch straight up at the park's south
 * edge to reveal Midtown, a dive into the Fifth Avenue canyon, a bank east along
 * 42nd Street past the Chrysler Building's crown, south down Lexington, west
 * along 34th Street, and a climbing orbit of the Empire State Building that ends
 * looking down the island to the Financial District, One World Trade Center and
 * the harbour.
 *
 * The grid is Manhattan's, squared to the axes: avenues run north-south every
 * 260 m (x), streets east-west every 80 m (z); north is -z. Distances outside the
 * island are compressed.
 */

type V = [number, number, number];
const AVE = 260, ST = 80;
const ESB: [number, number] = [130, -600], CHRYSLER: [number, number] = [390, -1000], PARK432: [number, number] = [390, -1320], WTC: [number, number] = [-390, 1320];
const LIBERTY: [number, number] = [-420, 3900];

function land(x: number, z: number) {
  const manhattan = sstep(-1130, -1070, x) * (1 - sstep(1070, 1130, x)) * (1 - sstep(1640, 1720, z + Math.max(0, x) * 0.12));
  const nj = 1 - sstep(-2180, -2100, x);
  const brooklyn = sstep(1900, 1980, x);
  const liberty = sstep(0.4, 0.7, gauss(x, z, ...LIBERTY, 90, 1));
  return Math.max(manhattan, nj, brooklyn, liberty);
}

/** Painted advertising for the Times Square screens: colour fields and shapes, no real brands. */
function adTex(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const g = c.getContext('2d')!;
  let s = seed * 9301 + 49297; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const hues = [[255, 60, 90], [40, 170, 255], [255, 200, 40], [140, 70, 255], [30, 220, 160], [255, 120, 30], [240, 240, 250]];
  const a = hues[Math.floor(r() * hues.length)], b = hues[Math.floor(r() * hues.length)];
  const gr = g.createLinearGradient(0, 0, 256, 384); gr.addColorStop(0, `rgb(${a})`); gr.addColorStop(1, `rgb(${b})`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 384);
  for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`; g.beginPath(); g.arc(r() * 256, r() * 384, 20 + r() * 70, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(10,10,20,0.55)'; g.fillRect(0, 300, 256, 84);
  g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
  g.fillText(seed === 0 ? 'ALL IN 1' : ['LIVE', 'NOW', 'TONIGHT', 'NEW', 'SHOW', 'OPEN'][seed % 6], 128, 358);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function landmarks(c: MetroCtx) {
  const stone = (m: number) => new THREE.MeshStandardMaterial({ color: m, roughness: 0.8 });

  // Empire State Building: a five-storey base, setbacks to the shaft, the observatory, the mast and antenna.
  {
    const [cx, cz] = ESB, lime: V = [1.06, 1.0, 0.9];
    c.mass(cx - 60, cz - 28, cx + 60, cz + 28, -1, 22, 'stone', lime);
    c.mass(cx - 50, cz - 22, cx + 50, cz + 22, 22, 80, 'stone', lime);
    c.mass(cx - 40, cz - 20, cx + 40, cz + 20, 80, 110, 'stone', lime);
    c.mass(cx - 30, cz - 18, cx + 30, cz + 18, 110, 262, 'stone', lime);
    c.mass(cx - 24, cz - 13, cx + 24, cz + 13, 262, 292, 'stone', lime);
    c.mass(cx - 15, cz - 9, cx + 15, cz + 9, 292, 320, 'stone', lime);
    const crownM = new THREE.MeshStandardMaterial({ color: 0xdcd6c8, roughness: 0.5, emissive: 0x9fc4ff, emissiveIntensity: 0 });
    c.glowBy(crownM, [0, 0.4, 1.4]);
    const mast = c.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 10, 44, 8).translate(0, 342, 0), crownM)); mast.position.set(cx, 0, cz);
    const ant = c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 79, 8).translate(0, 403, 0), stone(0x9a9a98))); ant.position.set(cx, 0, cz);
    c.lamp(cx, 443, cz, 10, [2.2, 0.2, 0.15]);
  }
  // Chrysler Building: white brick shaft, the terraced stainless crown and its needle.
  {
    const [cx, cz] = CHRYSLER;
    c.mass(cx - 25, cz - 25, cx + 25, cz + 25, -1, 200, 'stone', [1.08, 1.08, 1.1]);
    c.mass(cx - 20, cz - 20, cx + 20, cz + 20, 200, 228, 'stone', [1.08, 1.08, 1.1]);
    const steel = c.metal(0xd9dde2, 0.2); steel.emissive.set(0xfff1d6); c.glowBy(steel, [0, 0.15, 0.9]);
    for (let k = 0; k < 6; k++) {
      const r0 = 20 - k * 3, r1 = 17 - k * 3;
      const tier = c.add(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 8, 4, 1).rotateY(Math.PI / 4).translate(0, 232 + k * 8, 0), steel)); tier.position.set(cx, 0, cz);
      if (k % 2 === 0) for (let a = 0; a < 4; a++) c.lamp(cx + Math.cos(a * Math.PI / 2) * r0 * 0.75, 234 + k * 8, cz + Math.sin(a * Math.PI / 2) * r0 * 0.75, 6, [1.6, 1.5, 1.3]);
    }
    const needle = c.add(new THREE.Mesh(new THREE.ConeGeometry(2.6, 40, 8).translate(0, 299, 0), steel)); needle.position.set(cx, 0, cz);
  }
  // 432 Park Avenue: the slender concrete grid, the tallest roof on the avenue.
  { const [cx, cz] = PARK432; c.mass(cx - 14, cz - 14, cx + 14, cz + 14, -1, 425, 'concrete', [1.15, 1.15, 1.15]); c.lamp(cx, 428, cz, 8, [2.2, 0.2, 0.15]); }
  // One World Trade Center: a glass cube base, then the tapering faceted shaft and the spire.
  {
    const [cx, cz] = WTC;
    c.mass(cx - 30, cz - 30, cx + 30, cz + 30, -1, 56, 'glass', [0.95, 1.0, 1.05]);
    const y0 = 56, y1 = 417, rb = 30 * Math.SQRT2, rt = 21;
    const pos: number[] = [];
    const bot = (k: number) => { const a = Math.PI / 4 + (k * Math.PI) / 2; return [cx + Math.cos(a) * rb, y0, cz + Math.sin(a) * rb]; };
    const top = (k: number) => { const a = (k * Math.PI) / 2; return [cx + Math.cos(a) * rt * Math.SQRT2, y1, cz + Math.sin(a) * rt * Math.SQRT2]; };
    for (let k = 0; k < 4; k++) {
      pos.push(...bot(k), ...top(k + 1), ...bot(k + 1));
      pos.push(...bot(k), ...top(k), ...top(k + 1));
    }
    for (let k = 0; k < 4; k++) pos.push(cx, y1, cz, ...top(k + 1), ...top(k));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const glass = c.glass(0x9fb6c8, 0.06); glass.side = THREE.DoubleSide;
    c.add(new THREE.Mesh(g, glass));
    const spire = c.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 2.4, 124, 8).translate(0, 479, 0), stone(0xcfd2d6))); spire.position.set(cx, 0, cz);
    for (let k = 0; k < 3; k++) { const ring = c.add(new THREE.Mesh(new THREE.TorusGeometry(4 - k, 0.5, 6, 20).rotateX(Math.PI / 2).translate(0, 430 + k * 14, 0), stone(0xb8bcc2))); ring.position.set(cx, 0, cz); }
    c.lamp(cx, 541, cz, 12, [2.4, 2.4, 2.6]);
  }
  // Times Square: screens stacked on the corners where Broadway crosses Seventh.
  {
    const ax = -AVE, az = -11 * ST;
    let k = 0;
    for (const side of [-1, 1]) for (let dz = -150; dz <= 150; dz += 42) {
      if (Math.abs(dz) < 12) continue;
      const w = 22 + (k % 3) * 6, h = 30 + (k % 4) * 8, y = 10 + (k % 3) * 12;
      const m = new THREE.MeshBasicMaterial({ map: adTex(k), toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      plane.position.set(ax + side * 16.5, y + h / 2, az + dz); plane.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      c.scene.add(plane); k++;
    }
  }
  // Central Park: the Reservoir and the Lake.
  {
    const pond = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.2 });
    const res = c.add(new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), pond), 0x404040); res.position.set(-130, 0.2, -2480); res.scale.set(230, 1, 150);
    const lake = c.add(new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), pond), 0x404040); lake.position.set(-300, 0.2, -2000); lake.scale.set(110, 1, 50);
  }
  // Brooklyn Bridge: two granite towers with their gothic arches, the deck, the cables and the stays.
  {
    const Z = 1480, A = 1060, B = 1990, T1 = 1270, T2 = 1780, deckY = 40, topY = 84;
    const granite = stone(0xb4a58c);
    for (const tx of [T1, T2]) {
      for (const [z0, z1] of [[-22, -13], [-4, 4], [13, 22]]) c.add(new THREE.Mesh(new THREE.BoxGeometry(18, topY - 22, z1 - z0).translate(tx, (topY + 22) / 2 - 11, Z + (z0 + z1) / 2), granite), 0xb0b0b0);
      c.add(new THREE.Mesh(new THREE.BoxGeometry(18, 22, 44).translate(tx, topY - 11 + 11, Z), granite), 0xb0b0b0);
      c.add(new THREE.Mesh(new THREE.BoxGeometry(26, 14, 52).translate(tx, -6, Z), granite), 0xb0b0b0);
    }
    const deckM = new THREE.MeshStandardMaterial({ color: 0x6c6a66, roughness: 0.8 });
    const deck = c.add(new THREE.Mesh(new THREE.BoxGeometry(B - A, 3, 26).translate((A + B) / 2, deckY, Z), deckM), 0x909090);
    void deck;
    const lines: THREE.Vector3[] = [];
    const sag = (x: number) => {
      if (x < T1) return deckY + 2 + (topY - deckY - 2) * ((x - A) / (T1 - A)) ** 1.4;
      if (x > T2) return deckY + 2 + (topY - deckY - 2) * ((B - x) / (B - T2)) ** 1.4;
      const u = (x - T1) / (T2 - T1); return topY - (topY - deckY - 4) * (1 - (2 * u - 1) ** 2);
    };
    for (const dz of [-11, 11]) {
      for (let x = A; x < B; x += 10) { lines.push(new THREE.Vector3(x, sag(x), Z + dz), new THREE.Vector3(x + 10, sag(x + 10), Z + dz)); lines.push(new THREE.Vector3(x, sag(x), Z + dz), new THREE.Vector3(x, deckY + 1.5, Z + dz)); }
      for (const tx of [T1, T2]) for (let k = 1; k <= 8; k++) for (const s of [-1, 1]) lines.push(new THREE.Vector3(tx, topY - 4, Z + dz), new THREE.Vector3(tx + s * k * 18, deckY + 1.5, Z + dz));
    }
    c.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x5d5a55, transparent: true, opacity: 0.85 })));
    for (let x = A; x <= B; x += 40) for (const dz of [-12, 12]) c.lamp(x, deckY + 5, Z + dz, 5, [1.4, 1.05, 0.6]);
  }
  // The Statue of Liberty on her island, in the harbour off the Battery.
  {
    const [cx, cz] = LIBERTY, copper = new THREE.MeshStandardMaterial({ color: 0x6fa38f, roughness: 0.7 });
    c.add(new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 10, 11).translate(cx, 5, cz), stone(0x9c9384)), 0x909090);
    c.add(new THREE.Mesh(new THREE.BoxGeometry(22, 47, 22).translate(cx, 10 + 23.5, cz), stone(0xbdb2a0)), 0xa0a0a0);
    c.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 7, 34, 10).translate(cx, 57 + 17, cz), copper), 0xa0a0a0);
    c.add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 10).translate(cx, 94, cz), copper), 0xa0a0a0);
    c.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 14, 8).rotateZ(-0.25).translate(cx + 3, 99, cz), copper), 0xa0a0a0);
    c.lamp(cx + 5, 107, cz, 7, [2.2, 1.6, 0.6], true);
  }
}

export function newYorkSpec(): MetroSpec {
  // The take: Central Park, the climb, Fifth Avenue, 42nd Street past the Chrysler, Lexington, 34th Street, the Empire State orbit.
  const pre: P3[] = [
    [0, 9, -2250], [0, 10, -2000], [0, 12, -1770], [0, 95, -1695], [0, 230, -1640], [0, 170, -1520], [0, 108, -1320], [0, 86, -1130],
    [70, 86, -1043], [240, 92, -1040], [395, 102, -1044], [505, 110, -1030], [520, 114, -940], [520, 112, -780], [505, 112, -668], [390, 118, -645],
  ];
  const orbit = spiral(ESB[0], ESB[1], 128, 165, 138, 465, -0.17, 1.0, 12);
  const post: P3[] = [[270, 490, -440], [245, 515, -250]];
  const points = [...pre, ...orbit, ...post];
  const speed = [0.5, 1, 1.1, 0.8, 0.5, 1.05, 1.35, 1.4, 1.3, 1.35, 1.2, 1.1, 1.25, 1.3, 1.15, 1.0, ...orbit.map(() => 0.95), 0.9, 0.7];
  return {
    name: 'New York', seed: 1811, mood: 'DAY', size: 16000,
    sun: { DAY: new THREE.Vector3(-0.42, 0.62, 0.66).normalize(), GOLDEN: new THREE.Vector3(-0.93, 0.11, -0.2).normalize(), BLUE: new THREE.Vector3(-0.3, 0.5, 0.3).normalize() },
    haze: { DAY: { color: 0xb9c6d4, density: 0.00016 }, GOLDEN: { color: 0x9a8a80, density: 0.0003 }, BLUE: { color: 0x0f1422, density: 0.00026 } },
    grid: { px: AVE, pz: ST, wx: 22, wz: 12 },
    blocks: { i0: -4, i1: 3, j0: -35, j1: 20 },
    land,
    block: (i, j) => {
      if (i >= -2 && i <= 0 && j <= -21) return 'park';                 // Central Park
      if (i === -1 && j === -13) return 'park';                           // Bryant Park
      if (i === 0 && j === -3) return 'park';                             // Madison Square
      return 'built';
    },
    lot: (cx, cz, r) => {
      const edge = Math.abs(cx) > 900 ? 0.55 : 1;
      if (cz < -1450) return r() < 0.4 ? { floors: Math.round((55 + r() * 30) * edge), style: r() < 0.6 ? 'glass' : 'stone', form: 'tower' } : { floors: Math.round((18 + r() * 22) * edge), style: 'stone', form: 'setback' };
      if (cz < -380) {
        const tall = r() < 0.55;
        if (!tall) return { floors: Math.round((12 + r() * 20) * edge), style: r() < 0.5 ? 'stone' : 'brick', form: r() < 0.5 ? 'setback' : 'block' };
        return r() < 0.5 ? { floors: Math.round((30 + r() * 38) * edge), style: 'glass', form: 'tower' } : { floors: Math.round((24 + r() * 30) * edge), style: 'stone', form: 'setback' };
      }
      if (cz < 700) return r() < 0.1 ? { floors: 20 + Math.round(r() * 14), style: 'glass', form: 'tower' } : { floors: 4 + Math.round(r() * 12), style: r() < 0.6 ? 'brick' : 'stone', form: 'block' };
      return r() < 0.5 ? { floors: Math.round((28 + r() * 35) * edge), style: r() < 0.5 ? 'glass' : 'stone', form: r() < 0.5 ? 'tower' : 'setback' } : { floors: 10 + Math.round(r() * 18), style: 'stone', form: 'setback' };
    },
    clear: [[...ESB, 64], [...CHRYSLER, 34], [...PARK432, 20], [...WTC, 44]],
    landmarks,
    traffic: { avenues: [-3, -2, -1, 0, 1, 2, 3], streets: [-30, -26, -20, -16, -12, -8, -4, 0, 4, 8, 12, 16], cars: 520 },
    carColors: [[0xf2b705, 34], [0xeeeeea, 16], [0x16171a, 16], [0x8a8d92, 12], [0x2a3a66, 6], [0x7a1c1c, 5], [0x55585c, 8]],
    trees: { kind: 'leafy', every: 9 },
    waterTanks: true,
    sprawl: [
      { x0: -5600, x1: -2200, z0: -3600, z1: 3600, pitch: 50, floors: [2, 6], palette: [0x9a8a7a, 0xb0a08a, 0x8a7a6c, 0xc4b8a4, 0x7d7065, 0xa89c8a] },
      { x0: 2000, x1: 5600, z0: -3600, z1: 4600, pitch: 50, floors: [2, 6], palette: [0x9a7462, 0xa88a72, 0x8a6a58, 0xc0ae96, 0x7a6252, 0xb49c84] },
      { x0: -1080, x1: 1080, z0: -5200, z1: -2860, pitch: 44, floors: [4, 7], palette: [0x8f6a55, 0xa27d62, 0x7c5e4c, 0xb89c80] },
    ],
    paint: { land: '#8b8780', park: '#4f6b35', street: '#3b3d40' },
    route: {
      points, speed, dur: 70, easeIn: 2.5, fov: 76, lookAhead: 50, bank: 0.75, maxBank: 0.62,
      holds: [
        { from: pre.length + 1, to: pre.length + orbit.length - 1, at: [ESB[0], 360, ESB[1]], weight: 0.72 },
        { from: pre.length + orbit.length - 0.5, to: points.length - 1, at: [WTC[0], 250, WTC[1]], weight: 0.55 },
      ],
    },
  };
}

export const newYork = (maxAniso: number, glow: THREE.Texture, renderer: THREE.WebGLRenderer | null) => new Metro(newYorkSpec(), maxAniso, glow, renderer);
