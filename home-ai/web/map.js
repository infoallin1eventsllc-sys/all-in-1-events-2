// The home map: a cutaway 3D model of the house, drawn live from the real
// device states. Rooms glow where lights are on (brighter for brighter
// lights), turn red where something needs attention, ripple where there's
// motion, and open when tapped. Each room is furnished for what it is
// (car in the garage, island in the kitchen, bed in the bedroom), with
// windows on the outside walls, doors between rooms, and the garage door
// drawn open or closed from the real door.
//
// Rooms come from config/home.json: plan = [x, y, width, depth] in grid
// units. The model is an isometric projection drawn in SVG, back to front.
// Colors are CSS tokens (--m-*), so every finish styles it: a warm
// architectural model in Grounded and Vivid light, a lit blueprint in
// Futuristic and Vivid dark.

const NS = "http://www.w3.org/2000/svg";
const WALL = 2.1;          // outside wall height, grid units
const INNER = 1.3;         // walls between rooms, lower so you can see into each room
const LOW = 0.35;          // cut-down outside walls at the front, so you can see in
const T = 0.24;            // wall thickness
const S = 14;              // pixels per grid unit
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

const iso = (x, y, z = 0) => [(x - y) * S * COS, (x + y) * S * SIN - z * S];
const pts = (list) => list.map(([x, y, z]) => iso(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");

function node(tag, attrs = {}, ...children) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  for (const c of children) if (c) n.append(c);
  return n;
}

const poly = (cls, list, mat) => node("polygon", { class: cls, points: pts(list), style: mat ? `--c: var(--m-${mat})` : undefined });

// A box: its top and the two faces that face the viewer (south and east).
// Position and footprint on the floor, then height, material, and how far
// above the floor it starts (for countertops, pillows, a car's roof).
function box(g, x, y, w, d, h, mat, z = 0, extra = "") {
  g.append(
    poly(`bx bx-s ${extra}`, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], mat),
    poly(`bx bx-e ${extra}`, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], mat),
    poly(`bx bx-t ${extra}`, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], mat));
}
const flat = (g, x, y, w, d, mat, z = 0.02) => g.append(poly("bx bx-t flat", [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], mat));
// A round door on the east face of an appliance (washer, dryer).
function disc(g, x, cy, cz, r, mat) {
  const list = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [x, cy + Math.cos(a) * r, cz + Math.sin(a) * r]; });
  g.append(poly("bx disc", list, mat));
}
function plant(g, x, y, s = 1) {
  box(g, x, y, 0.45 * s, 0.45 * s, 0.45 * s, "pot");
  const [cx, cy] = iso(x + 0.22 * s, y + 0.22 * s, 0.45 * s + 0.35 * s);
  g.append(node("ellipse", { class: "bx leaf", cx: cx.toFixed(1), cy: cy.toFixed(1), rx: (7.5 * s).toFixed(1), ry: (6.5 * s).toFixed(1) }));
}

// What a room is, from its id or name.
function kindOf(r) {
  const k = `${r.id} ${r.name}`.toLowerCase();
  if (/garage/.test(k)) return "garage";
  if (/kitchen/.test(k)) return "kitchen";
  if (/bed|primary|nursery|guest/.test(k)) return "bedroom";
  if (/living|family|great|den/.test(k)) return "living";
  if (/utility|laundry|mud/.test(k)) return "utility";
  if (/hall|entry|foyer/.test(k)) return "hallway";
  if (/office|study/.test(k)) return "office";
  if (/dining/.test(k)) return "dining";
  if (/bath/.test(k)) return "bath";
  return "room";
}
const FLOOR = { garage: "concrete", kitchen: "tile", utility: "tile", bath: "tile", hallway: "wood", living: "wood", bedroom: "wood", office: "wood", dining: "wood", room: "wood" };

// Floor finish: planks, tile joints, or slab joints and parking lines.
function grain(g, kind, x, y, w, d) {
  const mat = FLOOR[kind];
  const line = (a, b, cls = mat) => g.append(node("polyline", { class: `map-grain ${cls}`, points: pts([a, b]) }));
  if (mat === "wood") for (let k = 0.55; k < d; k += 0.55) line([x, y + k], [x + w, y + k]);
  if (mat === "tile") {
    for (let k = 1; k < w; k += 1) line([x + k, y], [x + k, y + d]);
    for (let k = 1; k < d; k += 1) line([x, y + k], [x + w, y + k]);
  }
  if (mat === "concrete") {
    line([x + w / 2, y], [x + w / 2, y + d]);
    line([x, y + d / 2], [x + w, y + d / 2]);
    line([x + 1.1, y + 0.9], [x + 1.1, y + d - 0.6], "stripe");
    line([x + w - 1.3, y + 0.9], [x + w - 1.3, y + d - 0.6], "stripe");
  }
}

// Furniture, laid out from the room's size so any floor plan works.
const FURNISH = {
  kitchen(g, x, y, w, d) {
    box(g, x + 0.3, y + 0.3, 1.0, 0.9, 1.95, "metal");                          // fridge
    box(g, x + 1.4, y + 0.3, w - 1.7, 0.85, 0.88, "cabinet");                    // base cabinets
    box(g, x + 1.35, y + 0.25, w - 1.6, 0.95, 0.08, "stone", 0.88);             // countertop
    flat(g, x + w * 0.5, y + 0.4, 0.9, 0.55, "dark", 0.97);                      // sink
    box(g, x + 1.4, y + 0.3, w - 1.7, 0.45, 0.55, "cabinet", 1.4);              // upper cabinets
    const iw = Math.max(1.6, w * 0.42), ix = x + (w - iw) / 2 + 0.3, iy = y + d * 0.47;
    box(g, ix, iy, iw, 1.05, 0.88, "cabinet");                                   // island
    box(g, ix - 0.08, iy - 0.08, iw + 0.16, 1.46, 0.08, "stone", 0.88);         // island top, overhang for stools
    for (let k = 0; k < 3; k++) box(g, ix + 0.25 + (k * (iw - 0.9)) / 2, iy + 1.55, 0.42, 0.42, 0.66, "wood-dark"); // stools
    plant(g, x + w - 0.8, y + d - 0.9, 0.9);
  },
  living(g, x, y, w, d) {
    flat(g, x + 1.2, y + 2.2, w - 2.4, d - 4.4, "rug");
    box(g, x + w * 0.24, y + 0.3, w * 0.52, 0.5, 0.45, "wood");                 // media console
    box(g, x + w * 0.29, y + 0.45, w * 0.42, 0.08, 0.95, "dark", 0.55);         // TV
    box(g, x + 0.35, y + 2.4, 0.3, d - 5.2, 0.95, "fabric");                     // side sofa: back, then seat
    box(g, x + 0.65, y + 2.4, 1.0, d - 5.2, 0.45, "fabric");
    box(g, x + w * 0.36, y + d * 0.4, w * 0.28, 1.1, 0.38, "wood-dark");        // coffee table
    box(g, x + 1.4, y + d - 3.1, w - 2.6, 1.1, 0.45, "fabric");                  // sofa seat
    box(g, x + 1.9, y + d - 2.95, 0.7, 0.6, 0.14, "accent", 0.45);              // cushions
    box(g, x + w - 2.3, y + d - 2.95, 0.7, 0.6, 0.14, "accent", 0.45);
    box(g, x + 1.4, y + d - 2.0, w - 2.6, 0.32, 0.95, "fabric");                 // sofa back
    plant(g, x + w - 1.0, y + 0.4, 1.15);
    plant(g, x + 0.4, y + d - 1.0, 0.9);
  },
  bedroom(g, x, y, w, d) {
    const bw = Math.min(3.2, w * 0.4), bd = Math.min(3.8, d - 0.8), bx = x + (w - bw) / 2;
    flat(g, bx - 0.8, y + 1.2, bw + 1.6, bd, "rug");
    if (w > 9) {
      box(g, x + 0.7, y + 0.3, 2.0, 0.75, 0.75, "wood");                        // desk and chair
      box(g, x + 1.35, y + 1.3, 0.6, 0.6, 0.5, "fabric");
      box(g, x + w - 3.1, y + 0.3, 2.6, 0.75, 1.85, "wood");                    // wardrobe
    }
    box(g, bx - 1.0, y + 0.3, 0.72, 0.6, 0.55, "wood");                         // nightstands and lamps
    box(g, bx - 0.85, y + 0.42, 0.35, 0.35, 0.35, "lamp", 0.55);
    box(g, bx, y + 0.25, bw, 0.25, 1.25, "wood-dark");                          // headboard
    box(g, bx, y + 0.5, bw, bd - 0.25, 0.42, "wood-dark");                      // frame
    box(g, bx + 0.08, y + 0.55, bw - 0.16, bd - 0.4, 0.2, "soft", 0.42);        // mattress
    box(g, bx + 0.3, y + 0.7, bw / 2 - 0.4, 0.6, 0.16, "soft", 0.62);          // pillows
    box(g, bx + bw / 2 + 0.1, y + 0.7, bw / 2 - 0.4, 0.6, 0.16, "soft", 0.62);
    box(g, bx + 0.05, y + 1.55, bw - 0.1, bd - 1.45, 0.24, "accent", 0.42);     // duvet
    box(g, bx + bw + 0.28, y + 0.3, 0.72, 0.6, 0.55, "wood");
    box(g, bx + bw + 0.43, y + 0.42, 0.35, 0.35, 0.35, "lamp", 0.55);
    if (w > 9) plant(g, x + w - 1.0, y + d - 1.0);
  },
  garage(g, x, y, w, d) {
    const cl = Math.min(4.4, d - 2), cw = 2.2, cx = x + (w - cw) / 2 + 0.4, cy = y + 1.1;
    box(g, cx - 0.12, cy + 0.55, 0.3, 0.8, 0.42, "dark");                        // far wheels
    box(g, cx - 0.12, cy + cl - 1.35, 0.3, 0.8, 0.42, "dark");
    box(g, cx, cy, cw, cl, 0.55, "car", 0.2);                                    // body
    box(g, cx + 0.18, cy + cl * 0.3, cw - 0.36, cl * 0.42, 0.45, "glass", 0.75); // cabin
    box(g, cx + 0.18, cy + cl * 0.3, cw - 0.36, cl * 0.42, 0.06, "car", 1.2);    // roof
    box(g, cx + cw - 0.18, cy + 0.55, 0.3, 0.8, 0.42, "dark");                   // near wheels
    box(g, cx + cw - 0.18, cy + cl - 1.35, 0.3, 0.8, 0.42, "dark");
    box(g, x + 0.3, y + d - 2.9, 0.2, 2.4, 0.9, "cabinet", 0.9);                 // pegboard, then workbench
    box(g, x + 0.3, y + d - 2.9, 0.75, 2.4, 0.9, "wood");
    box(g, x + w - 0.95, y + d - 1.3, 0.6, 0.85, 1.1, "metal");                  // bins
  },
  utility(g, x, y, w, d) {
    box(g, x + 0.3, y + 0.5, 0.95, 0.95, 1.0, "soft");                           // washer
    disc(g, x + 1.25, y + 0.97, 0.48, 0.3, "glass");
    box(g, x + 0.3, y + 1.55, 0.95, 0.95, 1.0, "soft");                          // dryer
    disc(g, x + 1.25, y + 2.02, 0.48, 0.3, "glass");
    box(g, x + w - 1.4, y + 0.4, 1.0, 1.0, 1.7, "soft");                         // water heater
    box(g, x + w - 1.3, y + 0.5, 0.8, 0.8, 0.12, "metal", 1.7);
    flat(g, x + 2.0, y + d - 1.5, 1.4, 0.9, "rug");
  },
  hallway(g, x, y, w, d) {
    flat(g, x + 0.9, y + 0.8, w - 1.8, d - 1.6, "rug");
    plant(g, x + 0.35, y + 0.35, 0.9);
    box(g, x + w - 2.3, y + 0.3, 1.5, 0.42, 0.8, "wood");                        // console and lamp
    box(g, x + w - 1.9, y + 0.38, 0.3, 0.3, 0.3, "lamp", 0.8);
  },
  office(g, x, y, w, d) {
    box(g, x + 0.4, y + 0.3, Math.min(2.4, w - 1), 0.8, 0.75, "wood");
    box(g, x + 1.1, y + 1.4, 0.6, 0.6, 0.5, "fabric");
    plant(g, x + w - 0.9, y + 0.4);
  },
  dining(g, x, y, w, d) {
    const tw = Math.min(3, w - 2), tx = x + (w - tw) / 2, ty = y + d / 2 - 0.6;
    for (let k = 0; k < 3; k++) box(g, tx + 0.2 + (k * (tw - 0.8)) / 2, ty - 0.6, 0.4, 0.4, 0.5, "fabric");
    box(g, tx, ty, tw, 1.2, 0.75, "wood");
    for (let k = 0; k < 3; k++) box(g, tx + 0.2 + (k * (tw - 0.8)) / 2, ty + 1.4, 0.4, 0.4, 0.5, "fabric");
  },
  bath(g, x, y, w, d) {
    box(g, x + 0.3, y + 0.3, Math.min(2.6, w - 0.8), 1.0, 0.55, "soft");
    box(g, x + w - 1.4, y + 0.3, 1.0, 0.55, 0.85, "cabinet");
  },
  room() {},
};

// Short status for a room, from its devices.
function roomStatus(devices) {
  const lights = devices.filter((d) => d.type === "light" && d.state.on);
  const alerts = [];
  for (const d of devices) {
    if (d.type === "leak" && d.state.wet) alerts.push("Leak");
    if (d.type === "garage" && d.state.door !== "closed") alerts.push(`Door ${d.state.door}`);
    if (d.type === "lock" && !d.state.locked) alerts.push("Unlocked");
    if (d.type === "contact" && d.state.open) alerts.push(`${d.name} open`);
    if (d.type === "water_valve" && !d.state.open) alerts.push("Water off");
  }
  const th = devices.find((d) => d.type === "thermostat");
  const motion = devices.some((d) => d.type === "motion" && d.state.motion);
  const glow = lights.length ? Math.max(...lights.map((l) => l.state.brightness)) / 100 : 0;
  const garage = devices.find((d) => d.type === "garage");
  const parts = [];
  if (alerts.length) parts.push(alerts[0]);
  else if (lights.length) parts.push(`${lights.length} light${lights.length === 1 ? "" : "s"} on`);
  if (th) parts.push(`${Math.round(th.state.current)}°`);
  return { text: parts.join(" · "), alert: alerts.length > 0, glow, motion, lights: lights.length, garageOpen: garage ? garage.state.door !== "closed" : null };
}

// Where two rooms share a wall: the span along it, for a doorway.
function shared(a, b, axis) {
  const [ax, ay, aw, ad] = a.plan, [bx, by, bw, bd] = b.plan;
  if (axis === "n" && by + bd === ay) { const lo = Math.max(ax, bx), hi = Math.min(ax + aw, bx + bw); return hi - lo > 1.2 ? [lo, hi] : null; }
  if (axis === "w" && bx + bw === ax) { const lo = Math.max(ay, by), hi = Math.min(ay + ad, by + bd); return hi - lo > 1.2 ? [lo, hi] : null; }
  if (axis === "s" && by === ay + ad) { const lo = Math.max(ax, bx), hi = Math.min(ax + aw, bx + bw); return hi - lo > 0 ? [lo, hi] : null; }
  if (axis === "e" && bx === ax + aw) { const lo = Math.max(ay, by), hi = Math.min(ay + ad, by + bd); return hi - lo > 0 ? [lo, hi] : null; }
  return null;
}

export function renderMap(container, { rooms, devicesIn, selected, onSelect }) {
  const planned = rooms.filter((r) => r.plan);
  if (!planned.length) { container.replaceChildren(); return; }

  // Bounds of the model, for the viewBox.
  const corners = planned.flatMap(({ plan: [x, y, w, d] }) => [iso(x, y, WALL), iso(x + w, y, WALL), iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x, y + d, WALL), iso(x + w, y, 0)]);
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const pad = 22;
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];

  const svg = node("svg", { viewBox: vb.map((n) => n.toFixed(1)).join(" "), class: "map-svg", role: "group", "aria-label": "Home map. Select a room to open it." });
  const defs = node("defs");
  defs.append(node("radialGradient", { id: "map-glow", cx: "50%", cy: "50%", r: "60%" },
    node("stop", { offset: "0%", "stop-color": "var(--map-light)", "stop-opacity": "0.95" }),
    node("stop", { offset: "100%", "stop-color": "var(--map-light)", "stop-opacity": "0" })));
  defs.append(node("radialGradient", { id: "map-shadow", cx: "50%", cy: "50%", r: "50%" },
    node("stop", { offset: "0%", "stop-color": "var(--m-shadow)", "stop-opacity": "1" }),
    node("stop", { offset: "100%", "stop-color": "var(--m-shadow)", "stop-opacity": "0" })));
  svg.append(defs);

  // Soft ground shadow and a slab under the whole footprint.
  const minX = Math.min(...planned.map((r) => r.plan[0])), minY = Math.min(...planned.map((r) => r.plan[1]));
  const maxX = Math.max(...planned.map((r) => r.plan[0] + r.plan[2])), maxY = Math.max(...planned.map((r) => r.plan[1] + r.plan[3]));
  const [gx, gy] = iso((minX + maxX) / 2 + 1.2, (minY + maxY) / 2 + 1.2);
  const span = Math.hypot(maxX - minX, maxY - minY) * S;
  svg.append(node("ellipse", { class: "map-shadow", cx: gx.toFixed(1), cy: gy.toFixed(1), rx: (span * 0.62).toFixed(1), ry: (span * 0.36).toFixed(1), fill: "url(#map-shadow)" }));
  svg.append(node("polygon", { class: "map-ground", points: pts([[minX - 0.6, minY - 0.6], [maxX + 0.6, minY - 0.6], [maxX + 0.6, maxY + 0.6], [minX - 0.6, maxY + 0.6]]) }));
  svg.append(node("polygon", { class: "map-slab-s", points: pts([[minX - 0.6, maxY + 0.6, 0], [maxX + 0.6, maxY + 0.6, 0], [maxX + 0.6, maxY + 0.6, -0.35], [minX - 0.6, maxY + 0.6, -0.35]]) }));
  svg.append(node("polygon", { class: "map-slab-e", points: pts([[maxX + 0.6, minY - 0.6, 0], [maxX + 0.6, maxY + 0.6, 0], [maxX + 0.6, maxY + 0.6, -0.35], [maxX + 0.6, minY - 0.6, -0.35]]) }));

  // Back to front so nearer walls overlap farther rooms.
  const order = [...planned].sort((a, b) => (a.plan[0] + a.plan[1]) - (b.plan[0] + b.plan[1]));
  const labels = [];
  for (const r of order) {
    const [x, y, w, d] = r.plan;
    const kind = kindOf(r);
    const devices = devicesIn(r.id);
    const st = roomStatus(devices);
    const others = planned.filter((o) => o !== r);
    const g = node("g", {
      class: `map-room kind-${kind}${st.alert ? " alert" : ""}${st.lights ? " lit" : ""}${selected === r.id ? " selected" : ""}`,
      role: "button", tabindex: "0",
      "aria-label": `${r.name}${st.text ? `, ${st.text}` : ""}`,
      "aria-pressed": String(selected === r.id),
      "data-room": r.id,
    });

    // Floor and its finish.
    g.append(node("polygon", { class: `map-floor ${FLOOR[kind]}`, points: pts([[x, y], [x + w, y], [x + w, y + d], [x, y + d]]), style: `--floor: var(--m-${FLOOR[kind]})` }));
    grain(g, kind, x, y, w, d);

    // Back walls (north and west), full height, with a doorway where they
    // meet another room, and windows (or the garage door) where they're outside.
    const nDoor = others.map((o) => shared(r, o, "n")).find(Boolean);
    const wDoor = others.map((o) => shared(r, o, "w")).find(Boolean);
    const hn = nDoor ? INNER : WALL, hw = wDoor ? INNER : WALL;
    g.append(poly("map-wall wall-n", [[x, y, 0], [x + w, y, 0], [x + w, y, hn], [x, y, hn]]));
    g.append(poly("map-wall wall-w", [[x, y, 0], [x, y + d, 0], [x, y + d, hw], [x, y, hw]]));
    if (nDoor) { const m = (nDoor[0] + nDoor[1]) / 2; g.append(poly("map-door", [[m - 0.5, y, 0], [m + 0.5, y, 0], [m + 0.5, y, 1.1], [m - 0.5, y, 1.1]])); }
    else if (kind === "garage") {
      const open = st.garageOpen;
      g.append(poly(`map-garage-door${open ? " open" : ""}`, [[x + 0.7, y, 0], [x + w - 0.7, y, 0], [x + w - 0.7, y, 1.65], [x + 0.7, y, 1.65]]));
      if (!open) for (let k = 1; k < 4; k++) g.append(node("polyline", { class: "map-panel-line", points: pts([[x + 0.7, y, k * 0.41], [x + w - 0.7, y, k * 0.41]]) }));
    } else for (let k = 1; k * 2.4 < w; k++) {
      const cx = x + (w * k) / Math.ceil(w / 2.4);
      g.append(poly("map-window", [[cx - 0.6, y, 0.75], [cx + 0.6, y, 0.75], [cx + 0.6, y, 1.7], [cx - 0.6, y, 1.7]]));
    }
    if (wDoor) { const m = (wDoor[0] + wDoor[1]) / 2; g.append(poly("map-door", [[x, m - 0.5, 0], [x, m + 0.5, 0], [x, m + 0.5, 1.1], [x, m - 0.5, 1.1]])); }
    else for (let k = 1; k * 2.4 < d; k++) {
      const cy = y + (d * k) / Math.ceil(d / 2.4);
      g.append(poly("map-window", [[x, cy - 0.6, 0.75], [x, cy + 0.6, 0.75], [x, cy + 0.6, 1.7], [x, cy - 0.6, 1.7]]));
    }
    // Wall tops, so the walls read as solid.
    g.append(poly("map-cap", [[x - T / 2, y - T / 2, hn], [x + w + T / 2, y - T / 2, hn], [x + w + T / 2, y + T / 2, hn], [x - T / 2, y + T / 2, hn]]));
    g.append(poly("map-cap", [[x - T / 2, y - T / 2, hw], [x + T / 2, y - T / 2, hw], [x + T / 2, y + d + T / 2, hw], [x - T / 2, y + d + T / 2, hw]]));

    (FURNISH[kind] || FURNISH.room)(g, x, y, w, d);

    if (st.glow) {
      const [cx, cy] = iso(x + w / 2, y + d / 2);
      g.append(node("ellipse", { class: "map-light", cx: cx.toFixed(1), cy: cy.toFixed(1), rx: (Math.min(w, d) * S * 1.05).toFixed(1), ry: (Math.min(w, d) * S * 0.56).toFixed(1), fill: "url(#map-glow)", opacity: (0.35 + st.glow * 0.65).toFixed(2) }));
    }
    if (st.motion) {
      const [mx, my] = iso(x + w * 0.7, y + d * 0.7);
      g.append(node("circle", { class: "map-motion", cx: mx.toFixed(1), cy: my.toFixed(1), r: "5" }));
    }

    // Outside walls at the front (south and east), cut down so you can see in.
    if (!others.some((o) => shared(r, o, "s"))) box(g, x, y + d - T / 2, w, T, LOW, "wall", 0, "map-cut");
    if (!others.some((o) => shared(r, o, "e"))) box(g, x + w - T / 2, y, T, d, LOW, "wall", 0, "map-cut");

    g.append(node("polyline", { class: "map-edge", points: pts([[x, y + d, hw], [x, y, hw]]) }));
    g.append(node("polyline", { class: "map-edge", points: pts([[x, y, hn], [x + w, y, hn]]) }));
    g.addEventListener("click", () => onSelect(r.id));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } });
    svg.append(g);
    labels.push({ r, st, at: iso(x + w / 2, y + d * 0.62, 0) });
  }

  // Labels float above the rooms as one-line chips, drawn last so walls and
  // furniture never cover them, and nudged apart where rooms are close.
  const placed = [];
  for (const { r, st, at: [lx, ly0] } of labels) {
    const name = r.name.replace(/ Room$/, "");
    const width = name.length * 6.1 + (st.text ? st.text.length * 5 + 14 : 0) + 18;
    const hit = (y) => placed.some((p) => Math.abs(p.x - lx) < (p.w + width) / 2 + 2 && Math.abs(p.y - y) < 20);
    let ly = ly0;
    for (let k = 0; k < 12 && hit(ly); k++) ly += 5;
    placed.push({ x: lx, y: ly, w: width });
    const left = lx - width / 2;
    svg.append(node("rect", { class: `map-chip${st.alert ? " alert" : ""}${selected === r.id ? " selected" : ""}`, x: left.toFixed(1), y: (ly - 9).toFixed(1), width: width.toFixed(1), height: 18, rx: 9, "aria-hidden": "true" }));
    const t = node("text", { class: "map-label", x: (left + 9).toFixed(1), y: (ly + 3.6).toFixed(1), "aria-hidden": "true" });
    t.append(name);
    if (st.text) t.append(node("tspan", { class: `map-sub${st.alert ? " alert" : ""}`, dx: "7" }, document.createTextNode(st.text)));
    svg.append(t);
  }
  container.replaceChildren(svg);
  // Now that the text is on the page, fit each chip to it.
  for (const t of svg.querySelectorAll(".map-label")) {
    const len = t.getComputedTextLength?.();
    const chip = t.previousElementSibling;
    if (!len || !chip) continue;
    const width = len + 18, cx = +chip.getAttribute("x") + +chip.getAttribute("width") / 2;
    chip.setAttribute("x", (cx - width / 2).toFixed(1));
    chip.setAttribute("width", width.toFixed(1));
    t.setAttribute("x", (cx - width / 2 + 9).toFixed(1));
  }
}
