// The home map: a cutaway 3D model of the house, drawn live from the real
// device states. Rooms glow where lights are on (brighter for brighter
// lights), turn red where something needs attention, ripple where there's
// motion, and open when tapped.
//
// Rooms come from config/home.json: plan = [x, y, width, depth] in grid
// units. The model is an isometric projection drawn in SVG, back to front.

const NS = "http://www.w3.org/2000/svg";
const WALL = 1.3;          // wall height, grid units
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
  const parts = [];
  if (alerts.length) parts.push(alerts[0]);
  else if (lights.length) parts.push(`${lights.length} light${lights.length === 1 ? "" : "s"} on`);
  if (th) parts.push(`${Math.round(th.state.current)}°`);
  return { text: parts.join(" · "), alert: alerts.length > 0, glow, motion, lights: lights.length };
}

export function renderMap(container, { rooms, devicesIn, selected, onSelect }) {
  const planned = rooms.filter((r) => r.plan);
  if (!planned.length) { container.replaceChildren(); return; }

  // Bounds of the model, for the viewBox.
  const corners = planned.flatMap(({ plan: [x, y, w, d] }) => [iso(x, y, WALL), iso(x + w, y, WALL), iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x, y + d, WALL), iso(x + w, y, 0)]);
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const pad = 26;
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];

  const svg = node("svg", { viewBox: vb.map((n) => n.toFixed(1)).join(" "), class: "map-svg", role: "group", "aria-label": "Home map. Select a room to open it." });
  const defs = node("defs");
  defs.append(node("radialGradient", { id: "map-glow", cx: "50%", cy: "50%", r: "60%" },
    node("stop", { offset: "0%", "stop-color": "var(--map-light)", "stop-opacity": "0.95" }),
    node("stop", { offset: "100%", "stop-color": "var(--map-light)", "stop-opacity": "0" })));
  svg.append(defs);

  // Ground shadow under the whole footprint.
  const minX = Math.min(...planned.map((r) => r.plan[0])), minY = Math.min(...planned.map((r) => r.plan[1]));
  const maxX = Math.max(...planned.map((r) => r.plan[0] + r.plan[2])), maxY = Math.max(...planned.map((r) => r.plan[1] + r.plan[3]));
  svg.append(node("polygon", { class: "map-ground", points: pts([[minX - 1.5, minY - 1.5], [maxX + 1.5, minY - 1.5], [maxX + 1.5, maxY + 1.5], [minX - 1.5, maxY + 1.5]]) }));

  // Back to front so nearer walls overlap farther floors.
  const order = [...planned].sort((a, b) => (a.plan[0] + a.plan[1]) - (b.plan[0] + b.plan[1]));
  const labels = [];
  for (const r of order) {
    const [x, y, w, d] = r.plan;
    const devices = devicesIn(r.id);
    const st = roomStatus(devices);
    const g = node("g", {
      class: `map-room${st.alert ? " alert" : ""}${st.lights ? " lit" : ""}${selected === r.id ? " selected" : ""}`,
      role: "button", tabindex: "0",
      "aria-label": `${r.name}${st.text ? `, ${st.text}` : ""}`,
      "aria-pressed": String(selected === r.id),
      "data-room": r.id,
    });
    // Back walls (north and west), then the floor.
    g.append(node("polygon", { class: "map-wall wall-n", points: pts([[x, y, 0], [x + w, y, 0], [x + w, y, WALL], [x, y, WALL]]) }));
    g.append(node("polygon", { class: "map-wall wall-w", points: pts([[x, y, 0], [x, y + d, 0], [x, y + d, WALL], [x, y, WALL]]) }));
    g.append(node("polygon", { class: "map-floor", points: pts([[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) }));
    if (st.glow) {
      const [cx, cy] = iso(x + w / 2, y + d / 2);
      g.append(node("ellipse", { class: "map-light", cx: cx.toFixed(1), cy: cy.toFixed(1), rx: (Math.min(w, d) * S * 0.95).toFixed(1), ry: (Math.min(w, d) * S * 0.5).toFixed(1), fill: "url(#map-glow)", opacity: (0.35 + st.glow * 0.65).toFixed(2) }));
    }
    if (st.motion) {
      const [mx, my] = iso(x + w * 0.7, y + d * 0.7);
      g.append(node("circle", { class: "map-motion", cx: mx.toFixed(1), cy: my.toFixed(1), r: "5" }));
    }
    // Top edges of the back walls, drawn last so the outline reads as a model.
    g.append(node("polyline", { class: "map-edge", points: pts([[x, y + d, WALL], [x, y, WALL], [x + w, y, WALL]]) }));
    g.addEventListener("click", () => onSelect(r.id));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } });
    svg.append(g);
    labels.push({ r, st, at: iso(x + w / 2, y + d / 2, 0.2) });
  }

  // Labels on top of everything, so walls never cover them.
  for (const { r, st, at: [lx, ly] } of labels) {
    const t = node("text", { class: "map-label", x: lx.toFixed(1), y: (ly - 2).toFixed(1), "text-anchor": "middle", "aria-hidden": "true" });
    t.textContent = r.name.replace(/ Room$/, "");
    svg.append(t);
    if (st.text) {
      const s = node("text", { class: `map-sub${st.alert ? " alert" : ""}`, x: lx.toFixed(1), y: (ly + 11).toFixed(1), "text-anchor": "middle", "aria-hidden": "true" });
      s.textContent = st.text;
      svg.append(s);
    }
  }
  container.replaceChildren(svg);
}
