/**
 * The ground the synthetic patrol camera looks at: an event venue that repeats
 * without edges. City blocks bounded by roads; each block is a car park, a
 * building, a park or the event itself (tents, a stage, a crowd).
 *
 * `sample(wx, wy)` writes the surface at a world point (metres) into `out`:
 *   heat   apparent temperature at night on a 0–255 white-hot scale
 *   r,g,b  daylight colour
 * It is called once per pixel per frame, so it allocates nothing and uses a
 * handful of integer hashes.
 */

export const out = { heat: 0, r: 0, g: 0, b: 0, lamp: 0 };

const T = 140;                    // block size, m
const ROAD = 12, WALK = 15;       // road width and sidewalk edge

function h2(x: number, y: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

type Kind = 0 | 1 | 2 | 3 | 4; // parking, building, park, event, building (clay roof)

function blockKind(bx: number, by: number): Kind {
  const v = h2(bx * 7 + 3, by * 13 + 5);
  // The event sits at the origin block so the patrol always passes it.
  if (bx === 0 && by === 0) return 3;
  return v < 0.22 ? 0 : v < 0.44 ? 1 : v < 0.72 ? 2 : v < 0.84 ? 3 : 4;
}

const CAR_COLORS: [number, number, number][] = [[200, 200, 205], [40, 42, 48], [150, 30, 30], [30, 60, 120], [120, 124, 130], [230, 230, 228], [70, 90, 60]];

function set(heat: number, r: number, g: number, b: number) { out.heat = heat; out.r = r; out.g = g; out.b = b; }

export function sample(wx: number, wy: number): void {
  out.lamp = 0;
  const bx = Math.floor(wx / T), by = Math.floor(wy / T);
  const lx = wx - bx * T, ly = wy - by * T;
  const grain = h2(Math.floor(wx * 2), Math.floor(wy * 2)) - 0.5; // 0.5 m texture

  // Roads with a dashed centre line, then sidewalks.
  if (lx < ROAD || ly < ROAD) {
    const along = lx < ROAD ? wy : wx, across = lx < ROAD ? lx : ly;
    const dash = Math.abs(across - ROAD / 2) < 0.18 && ((along % 9) + 9) % 9 < 4.5;
    if (dash) { set(138, 225, 215, 150); return; }
    set(126 + grain * 6, 64 + grain * 10, 66 + grain * 10, 70 + grain * 10);
    // Street lamps at block corners.
    const cx = ((wx % T) + T) % T, cy = ((wy % T) + T) % T;
    const dl = Math.hypot(Math.min(cx, T - cx) - ROAD - 1, Math.min(cy, T - cy) - ROAD - 1);
    if (dl < 0.6) { set(255, 250, 240, 200); out.lamp = 1; }
    return;
  }
  if (lx < WALK || ly < WALK) { set(116 + grain * 5, 150 + grain * 12, 148 + grain * 12, 140 + grain * 12); return; }

  const ix = lx - WALK, iy = ly - WALK, W = T - WALK; // interior coords, 0..125
  const kind = blockKind(bx, by);

  if (kind === 0) {
    // Car park: two rows of stalls every 18 m, a car in most of them, some engines still warm.
    const row = Math.floor(iy / 18), ry = iy - row * 18;
    const inRow = (ry > 2 && ry < 7.2) || (ry > 10.8 && ry < 16);
    const col = Math.floor(ix / 3), rx = ix - col * 3;
    const stallLine = inRow && rx < 0.14;
    if (stallLine) { set(130, 210, 210, 200); return; }
    if (inRow && ix > 2 && ix < W - 2) {
      const side = ry < 9 ? 0 : 1;
      const hc = h2(bx * 101 + col, by * 211 + row * 2 + side);
      if (hc > 0.3 && rx > 0.5 && rx < 2.5) {
        const carY = side === 0 ? ry - 2.3 : ry - 11.1; // 0..4.6 along the car
        if (carY > 0 && carY < 4.6) {
          const warm = hc > 0.84, hood = side === 0 ? carY > 3.3 : carY < 1.3;
          const c = CAR_COLORS[Math.floor(hc * 997) % CAR_COLORS.length];
          const glass = carY > 1.5 && carY < 3.1 && rx > 0.75 && rx < 2.25;
          set(warm && hood ? 215 : glass ? 70 : 96, glass ? 40 : c[0], glass ? 50 : c[1], glass ? 60 : c[2]);
          return;
        }
      }
    }
    // Lamp posts down the middle of each row pair.
    if (Math.abs(ry - 9) < 0.5 && Math.abs(((ix % 30) + 30) % 30 - 15) < 0.5) { set(255, 250, 240, 200); out.lamp = 1; return; }
    set(122 + grain * 6, 70 + grain * 10, 72 + grain * 10, 76 + grain * 10);
    return;
  }

  if (kind === 1 || kind === 4) {
    // Building: a flat roof with a parapet, rooftop air units running warm, a car park apron around it.
    const inset = 10, x0 = inset, x1 = W - inset, y0 = inset + 8, y1 = W - inset;
    if (ix > x0 && ix < x1 && iy > y0 && iy < y1) {
      const edge = Math.min(ix - x0, x1 - ix, iy - y0, y1 - iy);
      if (edge < 0.8) { set(92, 90, 92, 96); return; }
      const ux = Math.floor((ix - x0) / 16), uy = Math.floor((iy - y0) / 16);
      const cx = x0 + ux * 16 + 8, cy = y0 + uy * 16 + 8;
      if (h2(bx * 31 + ux, by * 17 + uy) > 0.72 && Math.abs(ix - cx) < 2 && Math.abs(iy - cy) < 1.5) { set(232, 190, 192, 196); return; }
      const clay = kind === 4;
      set(86 + grain * 4, clay ? 150 + grain * 10 : 118 + grain * 8, clay ? 92 + grain * 8 : 122 + grain * 8, clay ? 78 + grain * 8 : 128 + grain * 8);
      return;
    }
    set(122 + grain * 6, 92 + grain * 10, 94 + grain * 10, 96 + grain * 10);
    return;
  }

  if (kind === 2) {
    // Park: grass, a diagonal path, trees on a jittered grid (canopies stay cool at night).
    const d = Math.abs(ix - iy) / Math.SQRT2;
    if (d < 1.4) { set(108 + grain * 5, 170, 160, 140); return; }
    const gx = Math.floor(ix / 13), gy = Math.floor(iy / 13);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const cx = gx + ox, cy = gy + oy;
      const hv = h2(bx * 53 + cx, by * 97 + cy);
      if (hv < 0.45) continue;
      const tx = cx * 13 + 6.5 + (h2(cx + 11, cy + bx) - 0.5) * 6, ty = cy * 13 + 6.5 + (h2(cx + by, cy + 7) - 0.5) * 6;
      const rad = 2.8 + hv * 2.6, dd = Math.hypot(ix - tx, iy - ty);
      if (dd < rad) { const k = dd / rad; set(46 + k * 14, 34 + k * 20 + grain * 10, 72 + k * 20 + grain * 12, 36 + k * 10); return; }
    }
    set(70 + grain * 8, 70 + grain * 14, 112 + grain * 18, 52 + grain * 10);
    return;
  }

  // Event: grass field, a row of tents (warm inside), a stage with lights, and a crowd in front of it.
  const stageX0 = 40, stageX1 = 85, stageY0 = 12, stageY1 = 30;
  if (ix > stageX0 && ix < stageX1 && iy > stageY0 && iy < stageY1) {
    const light = Math.abs(((ix - stageX0) % 5) - 2.5) < 0.5 && iy > stageY1 - 2;
    set(light ? 252 : 170, light ? 250 : 36, light ? 240 : 36, light ? 220 : 42); if (light) out.lamp = 1; return;
  }
  // Crowd: dense warm dots in the arc in front of the stage.
  const cdx = ix - (stageX0 + stageX1) / 2, cdy = iy - stageY1;
  if (cdy > 2 && cdy < 36 && Math.abs(cdx) < 32 - cdy * 0.4) {
    const px = Math.floor(ix / 1.1), py = Math.floor(iy / 1.1);
    const hv = h2(px + bx * 7, py + by * 5);
    const density = 0.62 - cdy / 90;
    if (hv < density) {
      const fx = ix / 1.1 - px - 0.5, fy = iy / 1.1 - py - 0.5;
      if (fx * fx + fy * fy < 0.12) { const c = CAR_COLORS[Math.floor(hv * 50) % CAR_COLORS.length]; set(236, c[0], c[1], c[2]); return; }
    }
  }
  // Tents along the far edge.
  if (iy > 88 && iy < 108) {
    const tcol = Math.floor(ix / 14), tx = ix - tcol * 14;
    if (tx > 2 && tx < 12) {
      const ridge = Math.abs(tx - 7) < 0.25 || Math.abs(iy - 98) < 0.25;
      set(ridge ? 140 : 158, ridge ? 205 : 238, ridge ? 205 : 236, ridge ? 200 : 228); return;
    }
  }
  set(74 + grain * 8, 78 + grain * 14, 118 + grain * 18, 58 + grain * 10);
}
