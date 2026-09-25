import * as THREE from 'three';
import { BRAND } from '../../brand';

/**
 * Procedural surface textures for the patrol camera's city, drawn once on 2D
 * canvases: asphalt with lane paint, crosswalks, concrete sidewalks, pavers,
 * grass, gravel roofs and four facade styles (each with a night-window map and a
 * thermal map). Deterministic, so every page load shows the same city.
 */

let s = 20250923;
const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

export type Tex = THREE.CanvasTexture;

function make(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true): Tex {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    p[i] += n; p[i + 1] += n; p[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}

/** Soft blotches (stains, patches), drawn wrapped so the tile repeats without seams. */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, n: number, rgb: string, rMin: number, rMax: number, aMax: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rMin + rnd() * (rMax - rMin), a = rnd() * aMax;
    const rx = r * (0.6 + rnd() * 0.8);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x + ox, y + oy, rx, r, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }
}

function cracks(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
  g.strokeStyle = 'rgba(18,18,20,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    let x = rnd() * w, y = rnd() * h;
    g.beginPath(); g.moveTo(x, y);
    const steps = 4 + Math.floor(rnd() * 8), ang = rnd() * Math.PI * 2;
    for (let k = 0; k < steps; k++) { x += Math.cos(ang + (rnd() - 0.5) * 1.6) * 10; y += Math.sin(ang + (rnd() - 0.5) * 1.6) * 10; g.lineTo(x, y); }
    g.stroke();
  }
}

function asphalt(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#44474b'; g.fillRect(0, 0, w, h);
  blotches(g, w, h, 30, '30,31,34', w * 0.04, w * 0.14, 0.35);
  blotches(g, w, h, 14, '92,94,98', w * 0.03, w * 0.1, 0.22);
  grain(g, w, h, 30);
  cracks(g, w, h, 6);
}

/** Worn road paint: a solid fill with asphalt showing through. */
function paint(g: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = color; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(70,72,76,0.55)';
  const n = Math.max(2, Math.round((w * h) / 60));
  for (let i = 0; i < n; i++) g.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
}

// ---- Roads -------------------------------------------------------------------
// Road textures run along canvas x (u) and across canvas y (v); a road is 14 m
// wide: 4 lanes of 3.5 m, double yellow in the middle.
export const ROAD_TILE = 12;  // metres of road per lane-texture repeat
export const XWALK_LEN = 5;   // metres of the crosswalk piece at each end of a block

export function laneTex(): Tex {
  const W = 1024, H = 1024, mx = W / ROAD_TILE, my = H / 14;
  return make(W, H, g => {
    asphalt(g, W, H);
    for (const c of [1.75, 5.25, 8.75, 12.25]) {
      for (const o of [-0.8, 0.8]) { g.fillStyle = 'rgba(22,22,24,0.22)'; g.fillRect(0, (c + o - 0.25) * my, W, 0.5 * my); }
      g.fillStyle = 'rgba(16,16,16,0.12)'; g.fillRect(0, (c - 0.35) * my, W, 0.7 * my);
    }
    paint(g, '#dcdcd4', 0, 0.3 * my, W, 0.15 * my);
    paint(g, '#dcdcd4', 0, 13.55 * my, W, 0.15 * my);
    paint(g, '#d9b640', 0, 6.78 * my, W, 0.12 * my);
    paint(g, '#d9b640', 0, 7.1 * my, W, 0.12 * my);
    for (const y of [3.5, 10.5]) paint(g, '#e2e2da', 0, (y - 0.06) * my, 3 * mx, 0.12 * my);
  });
}

export function crosswalkTex(): Tex {
  const W = 512, H = 1024, mx = W / XWALK_LEN, my = H / 14;
  return make(W, H, g => {
    asphalt(g, W, H);
    // Continental crosswalk: bars parallel to traffic, 0.5 m wide every metre.
    for (let v = 0.5; v < 13.6; v += 1.0) paint(g, '#e6e6de', 0.5 * mx, v * my, 3 * mx, 0.5 * my);
    // Stop line on the approach half (v 0.5..1), then the centre and edge lines resume.
    paint(g, '#e6e6de', 4.0 * mx, 7.1 * my, 0.4 * mx, 6.5 * my);
    paint(g, '#d9b640', 3.8 * mx, 6.78 * my, 1.2 * mx, 0.12 * my);
    paint(g, '#d9b640', 3.8 * mx, 7.1 * my, 1.2 * mx, 0.12 * my);
    paint(g, '#dcdcd4', 3.8 * mx, 0.3 * my, 1.2 * mx, 0.15 * my);
    paint(g, '#dcdcd4', 3.8 * mx, 13.55 * my, 1.2 * mx, 0.15 * my);
  });
}

export function junctionTex(): Tex {
  const W = 512, m = W / 14;
  return make(W, W, g => {
    asphalt(g, W, W);
    blotches(g, W, W, 8, '25,25,27', 30, 80, 0.3);
    g.fillStyle = '#2b2c2e'; g.beginPath(); g.arc(10 * m, 4 * m, 0.38 * m, 0, 7); g.fill();
    g.strokeStyle = '#1c1c1d'; g.lineWidth = 2; g.stroke();
  });
}

// ---- Ground ------------------------------------------------------------------

export function sidewalkTex(): Tex {
  const W = 512, m = W / 4;
  return make(W, W, g => {
    g.fillStyle = '#bdb9b0'; g.fillRect(0, 0, W, W);
    // Slightly different tone per slab.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,250' : '90,88,84'},${rnd() * 0.08})`;
      g.fillRect(i * W / 3, j * W / 3, W / 3, W / 3);
    }
    blotches(g, W, W, 10, '80,78,72', 10, 50, 0.12);
    grain(g, W, W, 16);
    g.fillStyle = 'rgba(88,86,80,0.7)';
    for (let k = 0; k <= 3; k++) { g.fillRect(k * W / 3 - 1, 0, 2, W); g.fillRect(0, k * W / 3 - 1, W, 2); }
    g.fillStyle = 'rgba(40,40,40,0.5)';
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * W, 1 + rnd() * 1.6, 0, 7); g.fill(); }
    void m;
  });
}

export function paversTex(): Tex {
  const W = 512, m = W / 4, pw = 0.4 * m, ph = 0.2 * m;
  return make(W, W, g => {
    g.fillStyle = '#6e6b66'; g.fillRect(0, 0, W, W);
    for (let r = 0; r * ph < W; r++) {
      const off = (r % 2) * pw / 2;
      for (let c = -1; c * pw < W; c++) {
        const t = 118 + rnd() * 26;
        g.fillStyle = `rgb(${t},${t - 6},${t - 14})`;
        g.fillRect(c * pw + off + 1, r * ph + 1, pw - 2, ph - 2);
      }
    }
    blotches(g, W, W, 8, '70,66,60', 20, 70, 0.14);
    grain(g, W, W, 12);
  });
}

export function grassTex(): Tex {
  const W = 512;
  return make(W, W, g => {
    g.fillStyle = '#5c7d38'; g.fillRect(0, 0, W, W);
    blotches(g, W, W, 40, '120,150,60', 20, 70, 0.3);
    blotches(g, W, W, 30, '48,70,28', 20, 60, 0.35);
    blotches(g, W, W, 6, '150,140,90', 10, 30, 0.25);
    const d = g.getImageData(0, 0, W, W), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const n = (rnd() - 0.5) * 34; p[i] += n * 0.6; p[i + 1] += n; p[i + 2] += n * 0.4; }
    g.putImageData(d, 0, 0);
  });
}

export function roofTex(): Tex {
  const W = 512;
  return make(W, W, g => {
    g.fillStyle = '#8f8f8a'; g.fillRect(0, 0, W, W);
    blotches(g, W, W, 18, '60,60,58', 20, 90, 0.25);
    blotches(g, W, W, 10, '190,190,185', 20, 70, 0.2);
    grain(g, W, W, 36);
    g.fillStyle = 'rgba(70,70,68,0.35)';
    for (let k = 0; k < 4; k++) g.fillRect(0, k * W / 4, W, 2);
  });
}

// ---- Lots (one texture per whole 78 m block interior) ------------------------
export const LOT = 78;

/** Parking stall rows across a lot: [z0, z1, facing] in lot metres. Shared with the parked-car placement. */
export const PARKING_ROWS: [number, number][] = [];
{
  let z = 3;
  while (z + 5.5 * 2 + 7 < LOT - 2) { PARKING_ROWS.push([z, z + 5.5]); z += 5.5 + 7; PARKING_ROWS.push([z, z + 5.5]); z += 5.5 + 1.5; }
}
export const STALL_W = 2.7;

export function parkingTex(): Tex {
  const W = 1024, m = W / LOT;
  return make(W, W, g => {
    asphalt(g, W, W);
    for (const [z0, z1] of PARKING_ROWS) {
      for (let x = 3; x <= LOT - 3 + 0.01; x += STALL_W) paint(g, '#e0e0d8', x * m - 1, z0 * m, 2, (z1 - z0) * m);
      g.fillStyle = 'rgba(15,15,15,0.18)';
      for (let x = 3; x < LOT - 3; x += STALL_W) g.fillRect((x + 0.6) * m, (z0 + 0.8) * m, (STALL_W - 1.2) * m, (z1 - z0 - 1.6) * m);
    }
    // Drive aisles arrows.
    g.fillStyle = 'rgba(225,225,215,0.8)';
    for (const [, z1] of PARKING_ROWS.filter((_, i) => i % 2 === 0)) {
      for (let x = 12; x < LOT - 8; x += 22) { const y = (z1 + 3.5) * m; g.beginPath(); g.moveTo(x * m, y - 6); g.lineTo(x * m + 18, y); g.lineTo(x * m, y + 6); g.fill(); }
    }
  });
}

/** Park geometry, shared by the texture and tree placement. */
export const PARK = {
  onPath(x: number, z: number): boolean {
    const c = LOT / 2, r = Math.hypot(x - c, z - c);
    return Math.abs(x - z) < 3 || Math.abs(x + z - LOT) < 3 || Math.abs(r - 22) < 3.2 || r < 9;
  },
};

export function parkTex(): Tex {
  const W = 1024, m = W / LOT, c = LOT / 2 * m;
  return make(W, W, g => {
    const grass = grassTex().image as HTMLCanvasElement;
    const pat = g.createPattern(grass, 'repeat')!;
    g.save(); g.scale(m * 8 / 512, m * 8 / 512); g.fillStyle = pat; g.fillRect(0, 0, W / (m * 8 / 512), W / (m * 8 / 512)); g.restore();
    g.strokeStyle = '#b3aa98'; g.lineCap = 'round';
    g.lineWidth = 3.4 * m;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, W); g.moveTo(W, 0); g.lineTo(0, W); g.stroke();
    g.beginPath(); g.arc(c, c, 22 * m, 0, 7); g.stroke();
    g.fillStyle = '#b8b0a0'; g.beginPath(); g.arc(c, c, 9 * m, 0, 7); g.fill();
    g.fillStyle = '#8f8a80'; g.beginPath(); g.arc(c, c, 5.2 * m, 0, 7); g.fill();
    const wg = g.createRadialGradient(c, c, 0, c, c, 4.6 * m);
    wg.addColorStop(0, '#9fb7bf'); wg.addColorStop(1, '#4d6b78');
    g.fillStyle = wg; g.beginPath(); g.arc(c, c, 4.6 * m, 0, 7); g.fill();
    grain(g, W, W, 10);
  });
}

export function plazaTex(): Tex {
  const W = 1024, m = W / LOT;
  return make(W, W, g => {
    g.fillStyle = '#b1aca2'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,250' : '80,76,70'},${rnd() * 0.1})`;
      g.fillRect(i * 3 * m, j * 3 * m, 3 * m, 3 * m);
    }
    blotches(g, W, W, 20, '70,66,60', 20, 80, 0.12);
    grain(g, W, W, 12);
    g.fillStyle = 'rgba(80,78,72,0.6)';
    for (let k = 0; k <= 26; k++) { g.fillRect(k * 3 * m, 0, 1.5, W); g.fillRect(0, k * 3 * m, W, 1.5); }
  });
}

// ---- Facades -----------------------------------------------------------------
// One tile = 4 bays of 3 m × 4 floors of 3.6 m. Each style has a day map, a
// night-window emissive map and a thermal map (walls warmer than glass).
export const BAY = 3, FLOOR = 3.6;
export const FACADE_W = BAY * 4, FACADE_H = FLOOR * 4;
export type FacadeStyle = 'glass' | 'brick' | 'concrete' | 'stone';
export interface Facade { map: Tex; night: Tex; ir: Tex }

type Rect = [number, number, number, number];

export function facade(style: FacadeStyle): Facade {
  const W = 512, bay = W / 4, fl = W / 4;
  const windows: Rect[] = [];
  const map = make(W, W, g => {
    if (style === 'glass') {
      const gr = g.createLinearGradient(0, 0, W, W);
      gr.addColorStop(0, '#48647a'); gr.addColorStop(0.5, '#2f4a5c'); gr.addColorStop(1, '#557489');
      g.fillStyle = gr; g.fillRect(0, 0, W, W);
      blotches(g, W, W, 12, '190,210,225', 40, 140, 0.18);
      for (let f = 0; f < 4; f++) {
        g.fillStyle = '#27333c'; g.fillRect(0, f * fl + fl * 0.78, W, fl * 0.22);
        for (let b = 0; b < 8; b++) windows.push([b * bay / 2, f * fl, bay / 2, fl * 0.78]);
      }
      g.fillStyle = '#a7b2b8';
      for (let b = 0; b <= 8; b++) g.fillRect(b * bay / 2 - 1.5, 0, 3, W);
      for (let f = 0; f < 4; f++) { g.fillRect(0, f * fl + fl * 0.78 - 1.5, W, 3); g.fillRect(0, f * fl - 1, W, 2); }
      grain(g, W, W, 8);
      return;
    }
    const wall = style === 'brick' ? '#8b4e3c' : style === 'concrete' ? '#b7b0a3' : '#cfc5b0';
    g.fillStyle = wall; g.fillRect(0, 0, W, W);
    if (style === 'brick') { g.fillStyle = 'rgba(60,30,20,0.12)'; for (let y = 0; y < W; y += 3) g.fillRect(0, y, W, 1); }
    blotches(g, W, W, 10, style === 'brick' ? '60,30,24' : '90,86,78', 20, 80, 0.15);
    for (let f = 0; f < 4; f++) {
      if (style === 'concrete') {
        windows.push([0, f * fl + fl * 0.3, W, fl * 0.42]);
      } else if (style === 'brick') {
        for (let b = 0; b < 4; b++) windows.push([b * bay + bay * 0.26, f * fl + fl * 0.22, bay * 0.48, fl * 0.56]);
      } else {
        for (let b = 0; b < 8; b++) windows.push([b * bay / 2 + bay * 0.14, f * fl + fl * 0.2, bay * 0.22, fl * 0.6]);
      }
      if (style === 'stone') { g.fillStyle = 'rgba(245,240,228,0.8)'; g.fillRect(0, f * fl + fl - 5, W, 5); }
      if (style === 'concrete') { g.fillStyle = 'rgba(80,76,70,0.4)'; g.fillRect(0, f * fl, W, 2); }
    }
    for (const [x, y, w, h] of windows) {
      g.fillStyle = style === 'brick' ? '#e2dccf' : '#8d8980';
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
      const gl = g.createLinearGradient(x, y, x + w, y + h);
      gl.addColorStop(0, '#5d7486'); gl.addColorStop(1, '#27343e');
      g.fillStyle = gl; g.fillRect(x, y, w, h);
      g.fillStyle = style === 'brick' ? '#e2dccf' : '#8d8980';
      if (style === 'concrete') for (let k = 1; k < 8; k++) g.fillRect(x + k * w / 8 - 1.5, y, 3, h);
      else { g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h * 0.4, w, 3); }
    }
    grain(g, W, W, 14);
  });
  const night = make(W, W, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    for (const [x, y, w, h] of windows) {
      if (style === 'concrete') {
        for (let k = 0; k < 8; k++) if (rnd() < 0.4) { const b = 0.5 + rnd() * 0.5; g.fillStyle = `rgba(255,${200 + rnd() * 40},${140 + rnd() * 60},${b})`; g.fillRect(x + k * w / 8, y, w / 8, h); }
      } else if (rnd() < (style === 'glass' ? 0.45 : 0.35)) {
        const warm = rnd() < 0.7, b = 0.45 + rnd() * 0.55;
        g.fillStyle = warm ? `rgba(255,${196 + rnd() * 40},${130 + rnd() * 50},${b})` : `rgba(205,225,255,${b})`;
        g.fillRect(x, y, w, h);
      }
    }
  });
  const ir = make(W, W, g => {
    g.fillStyle = style === 'glass' ? '#8a8a8a' : '#b4b4b4'; g.fillRect(0, 0, W, W);
    g.fillStyle = style === 'glass' ? '#6a6a6a' : '#7c7c7c';
    for (const [x, y, w, h] of windows) g.fillRect(x, y, w, h);
    grain(g, W, W, 6);
  }, false);
  return { map, night, ir };
}

// ---- Sprites -----------------------------------------------------------------

export function glowTex(): Tex {
  const W = 128;
  const t = make(W, W, g => {
    const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Stage LED wall content. */
export function screenTex(): Tex {
  const W = 256, H = 128;
  const t = make(W, H, g => {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#3a2a9a'); gr.addColorStop(0.5, '#1f7ad0'); gr.addColorStop(1, '#b0309a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText(BRAND.showText, W / 2, H / 2 + 12);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
