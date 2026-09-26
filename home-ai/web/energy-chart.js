// Electricity today: a single-series area chart of power over the day,
// with a crosshair tooltip, one labeled peak, and a table view for screen
// readers. Colors come from the theme's --series token (validated against
// each theme's surface with the dataviz validator).

const NS = "http://www.w3.org/2000/svg";
const H = 176, L = 34, R = 10, T = 24, B = 22;
let W = 640;

function node(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

export function clockOf(minute) {
  const h = Math.floor(minute / 60) % 24, m = minute % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function niceMax(v) {
  for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20]) if (v <= n) return n;
  return Math.ceil(v / 5) * 5;
}

// Drawn at the container's real width so labels stay at their true size.
export function renderEnergyChart(container, report, width = 640) {
  W = Math.max(300, Math.round(width));
  const samples = report.samples;
  const wrap = document.createElement("div");
  wrap.className = "chart";
  if (samples.length < 2) {
    wrap.append(Object.assign(document.createElement("p"), { className: "muted small", textContent: "The chart fills in as the day goes on." }));
    container.replaceChildren(wrap);
    return;
  }

  const yMax = niceMax(Math.max(...samples.map((s) => s.kw)) * 1.15);
  const x = (minute) => L + (minute / 1440) * (W - L - R);
  const y = (kw) => T + (1 - kw / yMax) * (H - T - B);

  const svg = node("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": `Power use today by time of day, up to ${report.peak?.kw ?? 0} kilowatts. Table view follows.` });
  const defs = node("defs");
  const grad = node("linearGradient", { id: "energy-fill", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.append(node("stop", { offset: "0%", "stop-color": "var(--series)", "stop-opacity": "0.32" }), node("stop", { offset: "100%", "stop-color": "var(--series)", "stop-opacity": "0.02" }));
  defs.append(grad);
  svg.append(defs);

  // Recessive grid and axes.
  for (const t of [0, yMax / 2, yMax]) {
    svg.append(node("line", { class: "chart-grid", x1: L, x2: W - R, y1: y(t), y2: y(t) }));
    svg.append(node("text", { class: "chart-axis", x: L - 6, y: y(t) + 3.5, "text-anchor": "end" }, `${t % 1 ? t.toFixed(1) : t}`));
  }
  svg.append(node("text", { class: "chart-axis", x: L - 6, y: 11, "text-anchor": "end" }, "kW"));
  for (const [m, label] of [[0, "12 AM"], [360, "6 AM"], [720, "12 PM"], [1080, "6 PM"], [1440, "12 AM"]]) {
    svg.append(node("text", { class: "chart-axis", x: x(m), y: H - 6, "text-anchor": m === 0 ? "start" : m === 1440 ? "end" : "middle" }, label));
  }

  // Area and line.
  const line = samples.map((s, i) => `${i ? "L" : "M"}${x(s.minute).toFixed(1)},${y(s.kw).toFixed(1)}`).join(" ");
  const last = samples[samples.length - 1], first = samples[0];
  svg.append(node("path", { class: "chart-area", d: `${line} L${x(last.minute).toFixed(1)},${y(0)} L${x(first.minute).toFixed(1)},${y(0)} Z`, fill: "url(#energy-fill)" }));
  svg.append(node("path", { class: "chart-line", d: line }));

  // Emphasized endpoint (now) and the day's peak, labeled once.
  svg.append(node("circle", { class: "chart-now", cx: x(last.minute), cy: y(last.kw), r: 4.5 }));
  if (report.peak && report.peak.minute !== last.minute) {
    const px = x(report.peak.minute), py = y(report.peak.kw);
    svg.append(node("circle", { class: "chart-peak", cx: px, cy: py, r: 3.5 }));
    svg.append(node("text", { class: "chart-note", x: Math.min(Math.max(px, L + 70), W - R - 70), y: Math.max(py - 8, T + 8), "text-anchor": "middle" }, `Peak ${report.peak.kw} kW · ${clockOf(report.peak.minute)}`));
  }

  // Hover layer: crosshair, dot, tooltip.
  const cross = node("line", { class: "chart-cross", y1: T, y2: H - B, x1: 0, x2: 0, visibility: "hidden" });
  const dot = node("circle", { class: "chart-dot", r: 4.5, visibility: "hidden" });
  const hit = node("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent", class: "chart-hit" });
  svg.append(cross, dot, hit);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  const show = (clientX) => {
    const box = svg.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    const minute = ((vx - L) / (W - L - R)) * 1440;
    const s = samples.reduce((best, p) => (Math.abs(p.minute - minute) < Math.abs(best.minute - minute) ? p : best), samples[0]);
    cross.setAttribute("x1", x(s.minute)); cross.setAttribute("x2", x(s.minute));
    dot.setAttribute("cx", x(s.minute)); dot.setAttribute("cy", y(s.kw));
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = `${clockOf(s.minute)} · ${s.kw} kW`;
    const left = (x(s.minute) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left, 50), box.width - 50)}px`;
    tip.style.top = `${(y(s.kw) / H) * box.height}px`;
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
  hit.addEventListener("pointermove", (e) => show(e.clientX));
  hit.addEventListener("pointerdown", (e) => show(e.clientX));
  hit.addEventListener("pointerleave", hide);

  // Table view: hourly averages.
  const table = document.createElement("table");
  table.className = "sr-only";
  table.innerHTML = `<caption>Average power by hour today${report.source === "estimate" ? " (estimated)" : ""}</caption><thead><tr><th scope="col">Hour</th><th scope="col">Average kW</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  report.hourly.forEach((kw, h) => {
    if (kw === null) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `<th scope="row">${clockOf(h * 60)}</th><td>${kw}</td>`;
    tbody.append(tr);
  });
  table.append(tbody);

  wrap.append(svg, tip, table);
  container.replaceChildren(wrap);
}
