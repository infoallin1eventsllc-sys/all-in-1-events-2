// Touch and mouse zoom for the house model.
//
//   Pinch (two fingers) or a trackpad pinch   zoom around your fingers
//   Drag with one finger or the mouse         look around, once zoomed in
//   + / − / Fit buttons, or + - 0 and arrows  the same from the keyboard
//   Mouse wheel                               zooms in the full-screen explorer
//
// The model is SVG, so zooming changes the viewBox: every wall and label
// stays sharp at any size. Zoom state lives on the container, so the live
// house can redraw the model (a light turns on) without losing your place.
// A drag or pinch never counts as a tap on a room.

const MAX = 5;
const DETAIL = 1.6;          // from this zoom on, each room shows its devices
const MOVE_SLOP = 6;         // px a finger may wander and still be a tap

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function enableMapZoom(container, { onExpand, wheel = false } = {}) {
  const svg = container.querySelector(":scope > svg.map-svg");
  let z = container.__zoom;
  if (!z) z = container.__zoom = create(container, { onExpand, wheel });
  z.attach(svg);
  return z;
}

function create(container, { onExpand, wheel }) {
  const z = { s: 1, cx: 0, cy: 0, base: null, svg: null, pointers: new Map(), suppress: false, anim: 0 };

  // ---------- view ----------
  const clampView = () => {
    const [bx, by, bw, bh] = z.base;
    z.s = Math.min(MAX, Math.max(1, z.s));
    const w = bw / z.s, h = bh / z.s;
    z.cx = Math.min(bx + bw - w / 2, Math.max(bx + w / 2, z.cx));
    z.cy = Math.min(by + bh - h / 2, Math.max(by + h / 2, z.cy));
  };
  const apply = () => {
    if (!z.svg || !z.base) return;
    clampView();
    const w = z.base[2] / z.s, h = z.base[3] / z.s;
    z.svg.setAttribute("viewBox", [z.cx - w / 2, z.cy - h / 2, w, h].map((n) => n.toFixed(2)).join(" "));
    // Labels and device pins stay about the same size on screen as you zoom.
    z.svg.style.setProperty("--ks", (1 / Math.pow(z.s, 0.8)).toFixed(3));
    container.classList.toggle("zoomed", z.s > 1.02);
    container.classList.toggle("detail", z.s >= DETAIL);
    if (out) out.textContent = `${Math.round(z.s * 100)}%`;
    if (zoomOutBtn) zoomOutBtn.disabled = z.s <= 1.02;
    if (zoomInBtn) zoomInBtn.disabled = z.s >= MAX - 0.01;
  };
  const toModel = (px, py) => {
    const m = z.svg.getScreenCTM();
    if (!m) return [z.cx, z.cy];
    const p = new DOMPoint(px, py).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const pxPerUnit = () => z.svg.getScreenCTM()?.a || 1;

  function zoomAt(px, py, factor) {
    const [mx, my] = toModel(px, py);
    const s2 = Math.min(MAX, Math.max(1, z.s * factor));
    z.cx = mx + (z.cx - mx) * (z.s / s2);
    z.cy = my + (z.cy - my) * (z.s / s2);
    z.s = s2;
    apply();
  }
  function pan(dx, dy) {
    const k = pxPerUnit();
    z.cx -= dx / k;
    z.cy -= dy / k;
    apply();
  }
  function animateTo(s, cx, cy) {
    cancelAnimationFrame(z.anim);
    z.goal = { s, cx, cy };
    if (reduceMotion()) { Object.assign(z, { s, cx, cy }); z.goal = null; apply(); return; }
    const from = { s: z.s, cx: z.cx, cy: z.cy }, t0 = performance.now(), T = 420;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / T), e = 1 - Math.pow(1 - k, 3);
      z.s = from.s + (s - from.s) * e;
      z.cx = from.cx + (cx - from.cx) * e;
      z.cy = from.cy + (cy - from.cy) * e;
      apply();
      if (k < 1) z.anim = requestAnimationFrame(step); else z.goal = null;
    };
    z.anim = requestAnimationFrame(step);
  }
  const center = () => [z.base[0] + z.base[2] / 2, z.base[1] + z.base[3] / 2];
  // Quick repeated taps add up: each one starts from where the last was heading.
  z.zoomBy = (factor) => {
    const from = z.goal || z;
    animateTo(Math.min(MAX, Math.max(1, from.s * factor)), from.cx, from.cy);
  };
  z.reset = () => { const [cx, cy] = center(); animateTo(1, cx, cy); };
  // Fly the camera to one room, filling most of the view.
  z.focusRoom = (id) => {
    const g = z.svg?.querySelector(`.map-room[data-room="${CSS.escape(id)}"] .map-floor`);
    if (!g) return;
    const b = g.getBBox();
    const pad = 1.3; // leave room for the walls and furniture around the floor
    const s = Math.min(MAX, Math.max(1, Math.min(z.base[2] / (b.width * pad), z.base[3] / (b.height * pad))));
    animateTo(s, b.x + b.width / 2, b.y + b.height / 2 - (b.height * 0.08));
  };

  // ---------- controls ----------
  const bar = document.createElement("div");
  bar.className = "map-zoom";
  const button = (label, text, fn, cls = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `map-zoom-btn ${cls}`;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = text;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  const zoomInBtn = button("Zoom in", "<span aria-hidden=\"true\">+</span>", () => z.zoomBy(1.5), "zin");
  const zoomOutBtn = button("Zoom out", "<span aria-hidden=\"true\">−</span>", () => z.zoomBy(1 / 1.5), "zout");
  const out = document.createElement("output");
  out.className = "map-zoom-level";
  out.setAttribute("aria-live", "polite");
  const fit = button("Show the whole house", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/></svg>`, () => z.reset(), "fit");
  bar.append(zoomOutBtn, out, zoomInBtn, fit);
  if (onExpand) bar.append(button("Open the house full screen", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-5.3 5.3-1.4-1.4L17.6 5H14V3ZM3 14h2v3.6l5.3-5.3 1.4 1.4L6.4 19H10v2H3v-7Z"/></svg>`, onExpand, "expand"));
  container.append(bar);

  // ---------- gestures ----------
  let last = null;       // previous pinch: { dist, mx, my }
  let start = null;      // where the first finger went down
  const pts = () => [...z.pointers.values()];

  container.addEventListener("pointerdown", (e) => {
    if (!z.svg || !z.svg.contains(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelAnimationFrame(z.anim);
    z.goal = null;
    z.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (z.pointers.size === 1) { start = { x: e.clientX, y: e.clientY }; z.moved = false; }
    if (z.pointers.size === 2) { const [a, b] = pts(); last = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; z.moved = true; }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  function onMove(e) {
    const p = z.pointers.get(e.pointerId);
    if (!p) return;
    const prev = { ...p };
    p.x = e.clientX; p.y = e.clientY;
    if (z.pointers.size >= 2) {
      const [a, b] = pts();
      const now = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (last && last.dist > 0) {
        zoomAt(now.mx, now.my, now.dist / last.dist);
        pan(now.mx - last.mx, now.my - last.my);
      }
      last = now;
      e.preventDefault?.();
      return;
    }
    if (start && Math.hypot(p.x - start.x, p.y - start.y) > MOVE_SLOP) z.moved = true;
    if (z.moved && z.s > 1.02) {
      pan(p.x - prev.x, p.y - prev.y);
      container.classList.add("panning");
    }
  }

  function onUp(e) {
    z.pointers.delete(e.pointerId);
    if (z.pointers.size < 2) last = null;
    if (z.pointers.size === 0) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      container.classList.remove("panning");
      if (z.moved) { z.suppress = true; setTimeout(() => { z.suppress = false; }, 350); }
      start = null;
    }
  }

  // A drag or pinch that ends over a room isn't a tap on it.
  container.addEventListener("click", (e) => {
    if (z.suppress && z.svg?.contains(e.target)) { e.stopPropagation(); e.preventDefault(); z.suppress = false; }
  }, true);

  // Trackpad pinches arrive as ctrl+wheel; the plain wheel zooms only in the
  // full-screen explorer, so it never traps page scrolling.
  container.addEventListener("wheel", (e) => {
    if (!z.svg || !(e.ctrlKey || wheel)) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
  }, { passive: false });

  container.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".map-zoom")) return;
    const step = 40;
    const keys = {
      "+": () => z.zoomBy(1.5), "=": () => z.zoomBy(1.5), "-": () => z.zoomBy(1 / 1.5), "0": () => z.reset(),
      ArrowLeft: () => pan(step, 0), ArrowRight: () => pan(-step, 0), ArrowUp: () => pan(0, step), ArrowDown: () => pan(0, -step),
    };
    const fn = keys[e.key];
    if (!fn || (e.key.startsWith("Arrow") && z.s <= 1.02)) return;
    e.preventDefault();
    fn();
  });

  z.attach = (svg) => {
    if (!svg) return;
    const base = (svg.dataset.base || svg.getAttribute("viewBox")).split(/[\s,]+/).map(Number);
    const first = !z.base;
    const moved = z.base && (Math.abs(z.base[2] - base[2]) > 0.5 || Math.abs(z.base[3] - base[3]) > 0.5);
    z.svg = svg;
    z.base = base;
    if (first || moved) { z.s = 1; [z.cx, z.cy] = center(); }
    apply();
  };
  return z;
}
