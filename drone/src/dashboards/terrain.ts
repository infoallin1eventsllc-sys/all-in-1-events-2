/**
 * Procedural terrain backdrop for the tactical map canvases.
 *
 * Renders a shaded, contoured height-field once into an offscreen canvas
 * (keyed by size + seed + palette) so the per-frame map loop only blits it.
 */

export interface TerrainPalette {
  /** Base sky/ground colour (darkest). */
  base: string;
  /** Low-elevation tint. */
  low: [number, number, number];
  /** High-elevation tint. */
  high: [number, number, number];
  /** Contour line colour. */
  contour: string;
  /** Accent glow applied to ridge lines. */
  ridge: [number, number, number];
}

export const TERRAIN_DEFENSE: TerrainPalette = {
  base: '#07090f',
  low: [14, 30, 34],
  high: [44, 92, 82],
  contour: 'rgba(120, 200, 170, 0.10)',
  ridge: [255, 120, 90],
};

export const TERRAIN_SURVEILLANCE: TerrainPalette = {
  base: '#070b0c',
  low: [10, 24, 26],
  high: [30, 70, 66],
  contour: 'rgba(120, 220, 180, 0.10)',
  ridge: [80, 220, 160],
};

const cache = new Map<string, HTMLCanvasElement>();

// Deterministic 2D value noise (no deps).
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t: number) { return t * t * (3 - 2 * t); }
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, seed: number) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 5; i++) {
    sum += amp * noise(x * freq, y * freq, seed + i * 7);
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

export function getTerrain(width: number, height: number, seed: number, palette: TerrainPalette): HTMLCanvasElement {
  const key = `${width}x${height}:${seed}:${palette.base}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Height field at reduced resolution for speed, then upscale.
  const step = 3;
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  const field = new Float32Array(cols * rows);
  const scale = 0.0042;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * step, y = r * step;
      // Ridged noise gives mountain spines.
      const n = fbm(x * scale, y * scale, seed);
      const ridge = 1 - Math.abs(fbm(x * scale * 1.7 + 30, y * scale * 1.7, seed + 99) * 2 - 1);
      field[r * cols + c] = Math.min(1, n * 0.65 + ridge * ridge * 0.55);
    }
  }

  const img = ctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = field[r * cols + c];
      // Simple directional shading from the north-west.
      const hl = field[r * cols + Math.max(0, c - 1)];
      const hu = field[Math.max(0, r - 1) * cols + c];
      const slope = (h - hl) + (h - hu);
      const light = 0.55 + slope * 6;
      const t = Math.pow(h, 1.6);
      const i = (r * cols + c) * 4;
      img.data[i] = Math.min(255, (palette.low[0] + (palette.high[0] - palette.low[0]) * t) * light);
      img.data[i + 1] = Math.min(255, (palette.low[1] + (palette.high[1] - palette.low[1]) * t) * light);
      img.data[i + 2] = Math.min(255, (palette.low[2] + (palette.high[2] - palette.low[2]) * t) * light);
      img.data[i + 3] = 255;
    }
  }
  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  small.getContext('2d')!.putImageData(img, 0, 0);

  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, width, height);

  // Contour lines every 0.08 of elevation.
  ctx.strokeStyle = palette.contour;
  ctx.lineWidth = 1;
  for (let level = 0.2; level < 1; level += 0.08) {
    ctx.beginPath();
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = field[r * cols + c], b = field[r * cols + c + 1];
        const d = field[(r + 1) * cols + c];
        if ((a < level) !== (b < level)) {
          const x = (c + (level - a) / (b - a)) * step;
          ctx.moveTo(x, r * step); ctx.lineTo(x, r * step + step);
        }
        if ((a < level) !== (d < level)) {
          const y = (r + (level - a) / (d - a)) * step;
          ctx.moveTo(c * step, y); ctx.lineTo(c * step + step, y);
        }
      }
    }
    ctx.stroke();
  }

  // Ridge glow on the highest elevations.
  const [rr, rg, rb] = palette.ridge;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = field[r * cols + c];
      if (h > 0.86) {
        ctx.fillStyle = `rgba(${rr},${rg},${rb},${(h - 0.86) * 2.2})`;
        ctx.fillRect(c * step, r * step, step, step);
      }
    }
  }

  // Fine lat/long grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  // Vignette so panels at the edges read cleanly.
  const vig = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  cache.set(key, canvas);
  return canvas;
}
