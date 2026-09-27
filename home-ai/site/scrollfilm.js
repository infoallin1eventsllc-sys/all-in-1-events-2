// Scroll drives the film: the page's scroll position inside `track` picks a
// moment of film/film.js and renders it. Nothing renders while the page is
// still, so an idle page costs nothing.
import { createFilm } from "../film/film.js";

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * segments: [[p0, p1, t0, t1], ...] — scroll progress p0..p1 plays film time t0..t1.
 * onFrame(p, t) runs after each render, for the page's own overlays.
 */
export async function scrollFilm({ canvas, track, segments, onFrame = () => {} }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const size = () => [Math.max(1, Math.round(canvas.clientWidth * dpr)), Math.max(1, Math.round(canvas.clientHeight * dpr))];
  const [w, h] = size();
  const film = await createFilm(canvas, { width: w, height: h, voice: [] });
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  const timeAt = (p) => {
    for (const [p0, p1, t0, t1] of segments) if (p <= p1) return t0 + (t1 - t0) * clamp01((p - p0) / (p1 - p0 || 1));
    const last = segments.at(-1);
    return last[3];
  };
  const progress = () => {
    const r = track.getBoundingClientRect();
    return clamp01(-r.top / Math.max(1, track.offsetHeight - innerHeight));
  };
  let target = progress(), cur = target, raf = 0;
  const draw = () => { const t = timeAt(cur); film.render(t); onFrame(cur, t); };
  const tick = () => {
    raf = 0;
    cur = still.matches ? target : cur + (target - cur) * 0.16;
    if (Math.abs(target - cur) < 0.0002) cur = target;
    draw();
    if (cur !== target) raf = requestAnimationFrame(tick);
  };
  const kick = () => { target = progress(); if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener("scroll", kick, { passive: true });
  new ResizeObserver(() => { const [w2, h2] = size(); film.resize(w2, h2); draw(); }).observe(canvas);
  draw();
  return { film, timeAt, jumpTo: (p) => { const top = track.offsetTop + p * (track.offsetHeight - innerHeight); scrollTo({ top, behavior: still.matches ? "auto" : "smooth" }); } };
}
