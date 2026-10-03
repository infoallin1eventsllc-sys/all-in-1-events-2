import { SITE, SITE_PATHS, STOCKPILE, WORLD_M } from './site';
import type { Pt } from './plan';

/**
 * The venue's digital plan, for the survey stage to light up on the ground where the scan has
 * passed: a 10 m grid inside the boundary, every structure outlined with its name and size, the
 * paths, the parking stalls and the stockpile's rings.
 *
 * Drawn in two channels on black so one texture carries both layers: red is the linework, green
 * is the area inside the boundary (the survey's fill). The canvas covers WORLD_M × WORLD_M centred
 * on the origin, north up, like siteImagery.
 */
export function blueprintCanvas(boundary: Pt[], size = 4096): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, s = size / WORLD_M;
  const P = (x: number, y: number): [number, number] => [(x + WORLD_M / 2) * s, (y + WORLD_M / 2) * s];
  const ring = (pts: Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...P(p.x, p.y)) : g.moveTo(...P(p.x, p.y)))); g.closePath(); };
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);

  // Green: the survey area.
  if (boundary.length >= 3) { g.fillStyle = '#00ff00'; ring(boundary); g.fill(); }

  // Red: the linework, added on top without touching the green.
  g.globalCompositeOperation = 'lighter';
  const ink = (a: number) => `rgba(255,0,0,${a})`;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 10 m grid, inside the boundary only.
  if (boundary.length >= 3) {
    g.save(); ring(boundary); g.clip();
    g.strokeStyle = ink(0.32); g.lineWidth = 0.18 * s;
    for (let x = -WORLD_M / 2; x <= WORLD_M / 2; x += 10) { g.beginPath(); g.moveTo(...P(x, -WORLD_M / 2)); g.lineTo(...P(x, WORLD_M / 2)); g.stroke(); }
    for (let y = -WORLD_M / 2; y <= WORLD_M / 2; y += 10) { g.beginPath(); g.moveTo(...P(-WORLD_M / 2, y)); g.lineTo(...P(WORLD_M / 2, y)); g.stroke(); }
    g.restore();
  }
  // Structures: outline, an inner line on the larger ones, a dimension line above, name and size inside.
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const st of SITE.structures) {
    const [x0, y0] = P(st.x - st.w / 2, st.y - st.d / 2), ww = st.w * s, dd = st.d * s;
    g.strokeStyle = ink(1); g.lineWidth = 0.55 * s; g.strokeRect(x0, y0, ww, dd);
    if (st.w <= 10) continue;
    g.lineWidth = 0.22 * s; g.strokeRect(x0 + 1.2 * s, y0 + 1.2 * s, ww - 2.4 * s, dd - 2.4 * s);
    const yy = y0 - 3 * s; g.lineWidth = 0.18 * s; g.beginPath();
    g.moveTo(x0, yy); g.lineTo(x0 + ww, yy); g.moveTo(x0, yy - s); g.lineTo(x0, yy + s); g.moveTo(x0 + ww, yy - s); g.lineTo(x0 + ww, yy + s); g.stroke();
    g.fillStyle = ink(1);
    const big = Math.min(4.2, st.w / 7), small = Math.min(3.2, st.w / 9);
    g.font = `600 ${Math.round(big * s)}px Inter, system-ui, sans-serif`; g.fillText(st.label, x0 + ww / 2, y0 + dd / 2 - small * 0.45 * s);
    g.font = `500 ${Math.round(small * s)}px Inter, system-ui, sans-serif`; g.fillText(`${st.w} × ${st.d} m`, x0 + ww / 2, y0 + dd / 2 + big * 0.75 * s);
  }
  // Paths: a centreline and a faint band for the width.
  for (const path of SITE_PATHS) for (const [lw, a] of [[6, 0.14], [0.3, 1]] as [number, number][]) {
    g.strokeStyle = ink(a); g.lineWidth = lw * s; g.beginPath(); path.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y)))); g.stroke();
  }
  // Parking: the lot and its stalls.
  const PK = SITE.parking; g.strokeStyle = ink(1); g.lineWidth = 0.3 * s; g.strokeRect(...P(PK.x0, PK.y0), (PK.x1 - PK.x0) * s, (PK.y1 - PK.y0) * s);
  g.lineWidth = 0.18 * s;
  for (let row = 0; row < 4; row++) for (let col = 0; col <= 40; col++) { const [x, y] = P(PK.x0 + 4 + col * 2.8, PK.y0 + 6 + row * 15); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 5 * s); g.stroke(); }
  // Stockpile: rings at quarter radii.
  g.lineWidth = 0.25 * s;
  for (let k = 1; k <= 4; k++) { const [x, y] = P(STOCKPILE.x, STOCKPILE.y); g.beginPath(); g.arc(x, y, STOCKPILE.r * s * (k / 4), 0, Math.PI * 2); g.stroke(); }
  return c;
}
