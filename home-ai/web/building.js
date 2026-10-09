// What a home looks like, for the hologram and the drawn model: its style,
// floors, room shapes, roof and outdoor features. Pure data in, pure data
// out (no DOM), so the server, the panel and the tests share it.
//
// A home describes itself in config/home.json:
//
//   "building": {
//     "style": "colonial",                         // any of STYLES below
//     "floors": [{ "id": "ground", "name": "Ground floor" },
//                { "id": "upper", "name": "Upstairs" }],
//     "roof": "gable",                             // optional: overrides the style's roof
//     "features": [{ "type": "deck", "plan": [20, 3, 4, 6] }]
//   },
//   "rooms": [
//     { "id": "kitchen", "name": "Kitchen", "plan": [6, 0, 7, 6] },                    // a rectangle: x, y, width, depth
//     { "id": "great", "name": "Great Room", "shape": [[0,0],[9,0],[9,4],[5,4],[5,8],[0,8]] }, // any outline
//     { "id": "bed2", "name": "Bedroom 2", "floor": "upper", "plan": [0, 0, 5, 4] },
//     { "id": "office", "name": "Office" }                                             // no plan: laid out for you
//   ]
//
// Units are plan units (about a metre). Rooms without a plan or shape are
// placed automatically, and the model says the layout is estimated.

export const STYLES = {
  modern: {
    label: "Modern", roof: "flat", pitch: 0, overhang: 0.35, wall: 2.1, parapet: 0.3,
    window: { w: 2.2, h: 1.25, sill: 0.45, every: 3.2 },
  },
  contemporary: {
    label: "Contemporary", roof: "shed", pitch: 0.22, overhang: 0.7, wall: 2.2,
    window: { w: 1.8, h: 1.2, sill: 0.55, every: 2.8 }, clerestory: true,
  },
  farmhouse: {
    label: "Farmhouse", roof: "gable", pitch: 0.7, overhang: 0.45, wall: 2.1,
    window: { w: 0.9, h: 1.35, sill: 0.6, every: 2.1 }, porch: { sides: ["s", "e"], depth: 2.2, posts: "square" },
  },
  craftsman: {
    label: "Craftsman", roof: "gable", pitch: 0.42, overhang: 0.9, wall: 2.0,
    window: { w: 1.1, h: 1.1, sill: 0.8, every: 2.4 }, porch: { sides: ["s"], depth: 2.4, posts: "tapered", partial: 0.55 }, chimney: true,
  },
  colonial: {
    label: "Colonial", roof: "gable", pitch: 0.58, overhang: 0.25, wall: 2.1,
    window: { w: 0.8, h: 1.35, sill: 0.65, every: 1.9 }, shutters: true, chimney: true,
  },
  ranch: {
    label: "Ranch", roof: "hip", pitch: 0.3, overhang: 0.75, wall: 1.95,
    window: { w: 1.5, h: 1.0, sill: 0.85, every: 3.0 },
  },
  mediterranean: {
    label: "Mediterranean", roof: "hip", pitch: 0.28, overhang: 0.4, wall: 2.15,
    window: { w: 1.0, h: 1.35, sill: 0.55, every: 2.4 }, arches: true,
  },
  cabin: {
    label: "Cabin", roof: "gable", pitch: 1.05, overhang: 0.6, wall: 1.9,
    window: { w: 0.9, h: 1.0, sill: 0.8, every: 2.6 }, porch: { sides: ["s"], depth: 2.0, posts: "round" }, chimney: true,
  },
};
export const ROOFS = ["flat", "shed", "gable", "hip", "none"];
const SLAB = 0.3;          // floor-to-floor gap above the walls

// What a room is, from an explicit kind or its id and name.
export function kindOf(r) {
  if (r.kind) return r.kind;
  const k = `${r.id} ${r.name || ""}`.toLowerCase();
  if (/garage/.test(k)) return "garage";
  if (/kitchen/.test(k)) return "kitchen";
  if (/bath|powder|wc|restroom/.test(k)) return "bath";
  if (/closet|pantry|storage/.test(k)) return "closet";
  if (/primary|master|bed|nursery|guest|kids/.test(k)) return "bedroom";
  if (/living|family|great|den|lounge|media|theater|rec/.test(k)) return "living";
  if (/dining/.test(k)) return "dining";
  if (/office|study|library/.test(k)) return "office";
  if (/utility|laundry|mud/.test(k)) return "utility";
  if (/hall|entry|foyer|landing|stair/.test(k)) return "hallway";
  if (/gym|workout/.test(k)) return "gym";
  if (/outside|exterior|yard|porch|patio/.test(k)) return "outside";
  return "room";
}

// Rough footprint for a room with no plan, by what it is.
const AREA = { garage: [6, 6], kitchen: [5, 4.5], living: [6, 5], dining: [4, 4], bedroom: [4.5, 4], bath: [3, 2.5], closet: [2, 2], office: [3.5, 3.5], utility: [3, 3], hallway: [4, 2], gym: [4, 4], room: [4, 4] };

const polyOfPlan = ([x, y, w, d]) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
function bboxOf(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}
export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
// The largest rectangle inside a room's outline, [x, y, w, d]: how the drawn
// model (which draws rectangles only) shows an L-shaped or odd room without
// spilling over its neighbours.
export function mainRect(poly) {
  const xs = [...new Set(poly.map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b);
  const inCell = (i, j) => pointInPoly([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], poly);
  const cells = xs.slice(1).map((_, i) => ys.slice(1).map((__, j) => inCell(i, j)));
  let best = null, bestA = 0;
  for (let i0 = 0; i0 < xs.length - 1; i0++) for (let j0 = 0; j0 < ys.length - 1; j0++) {
    for (let i1 = i0; i1 < xs.length - 1; i1++) {
      if (!cells[i1][j0]) break;
      for (let j1 = j0; j1 < ys.length - 1; j1++) {
        let ok = true;
        for (let i = i0; i <= i1 && ok; i++) ok = cells[i][j1];
        if (!ok) break;
        const w = xs[i1 + 1] - xs[i0], d = ys[j1 + 1] - ys[j0];
        if (w * d > bestA) { bestA = w * d; best = [xs[i0], ys[j0], w, d]; }
      }
    }
  }
  return best || bboxOf(poly);
}
export function pointInPoly([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Place rooms that have no plan: service rooms (garage, utility) down the
// west side, living spaces along the front, private rooms behind, packed in
// rows beside whatever is already placed on that floor.
export function autoLayout(rooms, placed = []) {
  if (!rooms.length) return [];
  const zone = (k) => (k === "garage" || k === "utility" ? 0 : k === "living" || k === "kitchen" || k === "dining" || k === "hallway" || k === "office" ? 1 : 2);
  const sorted = [...rooms].sort((a, b) => zone(kindOf(a)) - zone(kindOf(b)));
  const startX = placed.length ? Math.max(...placed.map((p) => { const b = bboxOf(p); return b[0] + b[2]; })) : 0;
  const startY = placed.length ? Math.min(...placed.map((p) => bboxOf(p)[1])) : 0;
  const total = sorted.reduce((s, r) => { const [w, d] = AREA[kindOf(r)] || AREA.room; return s + w * d; }, 0);
  const rowWidth = Math.max(8, Math.ceil(Math.sqrt(total) * 1.5));
  const out = [];
  let x = startX, y = startY, rowDepth = 0, row = [];
  const closeRow = () => {
    if (!row.length) return;
    // Stretch the row to a clean rectangle: last room takes the leftover width, all rooms share the row depth.
    const used = row.reduce((s, it) => s + it.w, 0);
    row[row.length - 1].w += Math.max(0, rowWidth - used);
    let cx = startX;
    for (const it of row) { out.push({ ...it.room, plan: [cx, y, it.w, rowDepth], auto: true }); cx += it.w; }
    y += rowDepth; row = []; rowDepth = 0; x = startX;
  };
  for (const r of sorted) {
    const [w, d] = AREA[kindOf(r)] || AREA.room;
    if (x + w - startX > rowWidth + 0.01 && row.length) closeRow();
    row.push({ room: r, w });
    rowDepth = Math.max(rowDepth, d);
    x += w;
  }
  closeRow();
  return out;
}

/**
 * Turn a home's building + rooms into what the renderers draw.
 * Returns { style, styleId, floors, rooms, features, bounds, approximate, warnings }.
 * rooms: [{ ...room, kind, floor, poly, bbox, auto }] (outdoor rooms left out).
 */
export function normalizeHome({ building, rooms } = {}) {
  const b = building && typeof building === "object" ? building : {};
  // A typo in home.json must not take the panel down: ignore anything that isn't a room.
  rooms = (Array.isArray(rooms) ? rooms : []).filter((r) => r && typeof r === "object" && r.id != null)
    .map((r) => (r.name ? r : { ...r, name: String(r.id) }));
  const styleId = STYLES[b.style] ? b.style : "modern";
  const style = { ...STYLES[styleId], ...(ROOFS.includes(b.roof) ? { roof: b.roof } : {}), ...(typeof b.pitch === "number" ? { pitch: b.pitch } : {}) };
  const warnings = [];
  if (b.style && !STYLES[b.style]) warnings.push(`Unknown style "${b.style}"; showing Modern.`);

  const floorsGiven = Array.isArray(b.floors) ? b.floors.filter((f) => f && typeof f === "object") : [];
  const floorsIn = floorsGiven.length ? floorsGiven : [{ id: "ground", name: "Ground floor", level: 0 }];
  const floors = floorsIn.map((f, i) => ({ id: String(f.id ?? `floor${i}`), name: f.name || (i === 0 ? "Ground floor" : `Floor ${i + 1}`), level: typeof f.level === "number" ? f.level : i, wall: f.wall || style.wall }))
    .sort((a, b2) => a.level - b2.level);
  // Elevation: ground (level 0) at 0, upper floors stacked, basements below.
  const ground = floors.findIndex((f) => f.level >= 0);
  let up = 0;
  floors.forEach((f, i) => { if (i >= Math.max(0, ground)) { f.elev = up; up += f.wall + SLAB; } });
  let down = 0;
  for (let i = Math.max(0, ground) - 1; i >= 0; i--) { down -= floors[i].wall + SLAB; floors[i].elev = down; }
  const floorIds = new Set(floors.map((f) => f.id));
  const defaultFloor = floors[Math.max(0, ground)].id;

  const indoor = rooms.filter((r) => kindOf(r) !== "outside");
  const out = [];
  const pending = new Map();   // floor -> rooms needing a layout
  for (const r of indoor) {
    const floor = floorIds.has(r.floor) ? r.floor : defaultFloor;
    if (r.floor && !floorIds.has(r.floor)) warnings.push(`${r.name || r.id}: floor "${r.floor}" isn't in building.floors; put on ${floors.find((f) => f.id === defaultFloor).name}.`);
    let poly = null;
    if (Array.isArray(r.shape) && r.shape.length >= 3 && r.shape.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) poly = r.shape.map(([x, y]) => [x, y]);
    else if (Array.isArray(r.plan) && r.plan.length === 4 && r.plan.every(Number.isFinite) && r.plan[2] > 0 && r.plan[3] > 0) poly = polyOfPlan(r.plan);
    if (!poly) { if (!pending.has(floor)) pending.set(floor, []); pending.get(floor).push({ ...r, floor }); continue; }
    out.push({ ...r, floor, kind: kindOf(r), poly, bbox: bboxOf(poly), auto: false });
  }
  for (const [floor, list] of pending) {
    const placed = out.filter((r) => r.floor === floor).map((r) => r.poly);
    for (const r of autoLayout(list, placed)) out.push({ ...r, kind: kindOf(r), poly: polyOfPlan(r.plan), bbox: r.plan, auto: true });
  }
  const approximate = out.some((r) => r.auto);
  if (approximate) warnings.push("Some rooms have no plan, so their layout is estimated.");

  const features = (Array.isArray(b.features) ? b.features : []).filter((f) => f && ["deck", "patio", "pool", "driveway", "porch"].includes(f.type) && Array.isArray(f.plan) && f.plan.length === 4 && f.plan.every(Number.isFinite) && f.plan[2] > 0 && f.plan[3] > 0)
    .map((f) => ({ ...f, floor: floorIds.has(f.floor) ? f.floor : defaultFloor }));

  const all = out.map((r) => r.bbox);
  const bounds = all.length ? (() => {
    const x = Math.min(...all.map((q) => q[0])), y = Math.min(...all.map((q) => q[1]));
    return [x, y, Math.max(...all.map((q) => q[0] + q[2])) - x, Math.max(...all.map((q) => q[1] + q[3])) - y];
  })() : [0, 0, 1, 1];
  // Each floor's footprint, for roofs and porches.
  for (const f of floors) {
    const bs = out.filter((r) => r.floor === f.id).map((r) => r.bbox);
    f.rooms = bs.length;
    f.bbox = bs.length ? (() => {
      const x = Math.min(...bs.map((q) => q[0])), y = Math.min(...bs.map((q) => q[1]));
      return [x, y, Math.max(...bs.map((q) => q[0] + q[2])) - x, Math.max(...bs.map((q) => q[1] + q[3])) - y];
    })() : null;
  }
  // A home with no indoor rooms still has its ground floor, so the camera and porches have something to stand on.
  const kept = floors.filter((f) => f.rooms > 0);
  if (!kept.length) { const g = floors.find((f) => f.id === defaultFloor); g.bbox = bounds; kept.push(g); }
  return { style, styleId, floors: kept, rooms: out, features, bounds, approximate, warnings };
}

// Where two room outlines share a wall on the same floor: for each edge of
// `a`, the stretches (0..1 along the edge) that touch an edge of another room.
export function sharedStretches(a, others, eps = 0.05) {
  const res = [];
  const n = a.poly.length;
  for (let i = 0; i < n; i++) {
    const p = a.poly[i], q = a.poly[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) { res.push([]); continue; }
    const ux = dx / len, uy = dy / len;
    const hits = [];
    for (const o of others) {
      const m = o.poly.length;
      for (let j = 0; j < m; j++) {
        const r0 = o.poly[j], r1 = o.poly[(j + 1) % m];
        // Collinear with this edge?
        const d0 = Math.abs((r0[0] - p[0]) * uy - (r0[1] - p[1]) * ux), d1 = Math.abs((r1[0] - p[0]) * uy - (r1[1] - p[1]) * ux);
        if (d0 > eps || d1 > eps) continue;
        const t0 = ((r0[0] - p[0]) * ux + (r0[1] - p[1]) * uy) / len, t1 = ((r1[0] - p[0]) * ux + (r1[1] - p[1]) * uy) / len;
        const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
        if (hi - lo > eps / len) hits.push({ lo, hi, other: o.id });
      }
    }
    res.push(hits.sort((x, y) => x.lo - y.lo));
  }
  return res;
}

// A short fingerprint of a home's shape (the building and each room's plan, outline, floor
// and kind): the pre-rendered house pictures (web/house-stills/) are used only for the home
// they were made from.
export function homeSignature({ building, rooms } = {}) {
  const s = JSON.stringify({ b: building || null, r: (rooms || []).map((r) => [r.id, r.plan || null, r.shape || null, r.floor || null, r.kind || null]) });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
