// The film page: plays film.js against the soundtrack's clock and draws the
// overlays (room labels, chapters, the guide's words, title and end cards).
// ?render=1 turns it into a fixed-size frame source for scripts/render-film.mjs.

import { createFilm, DURATION } from "./film.js";

/* global __VOICE__ */
const VOICE = typeof __VOICE__ !== "undefined" ? __VOICE__ : [];

const params = new URLSearchParams(location.search);
const RENDER = params.has("render");
const $ = (s) => document.querySelector(s);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

// The guide's words, timed to the voice track (seconds in the film).
const CAPTIONS = [
  [50.9, 52.0, "Welcome home."], [52.4, 53.4, "Come on in."],
  [56.1, 58.35, "I was here from the first line of the sketch."], [58.6, 61.4, "I know every wall, every window, every pipe."],
  [63.3, 64.55, "This is where we’ll talk."], [64.95, 68.85, "I watch the doors, the water, the heat and the air, day and night."],
  [69.25, 71.65, "If something’s wrong, I’ll tell you right away."], [71.9, 75.2, "And I’ll never unlock a door or open the garage unless you say so."],
  [76.3, 77.85, "You’re not just living in a house."], [78.0, 80.2, "You’re living with something that looks out for you."], [80.4, 81.5, "Welcome home."],
];
const CHAPTERS = [[5.4, 9.2, "01", "Design"], [13.4, 17.2, "02", "Structure"], [24.4, 28.2, "03", "Detail"], [33.4, 37.2, "04", "Furnish"], [44.4, 48.2, "05", "Welcome home"]];
const bump = (t, c, w) => clamp01(1 - Math.abs(t - c) / w);

function overlays(film, t, stage) {
  const W = stage.clientWidth, H = stage.clientHeight;
  // Black between scenes.
  const fade = Math.max(1 - smooth(4.9, 5.7, t), bump(t, 33, 0.45), bump(t, 44, 0.45), smooth(85.6, 86.3, t));
  $("#fade").style.opacity = fade.toFixed(3);
  // Title and end cards.
  $("#title").style.opacity = (smooth(0.4, 1.4, t) * (1 - smooth(3.8, 4.6, t))).toFixed(3);
  const end = $("#end");
  end.style.opacity = t > 86 ? "1" : "0";
  const path = $("#end-house"), len = 1200;
  path.style.strokeDasharray = len; path.style.strokeDashoffset = (len * (1 - smooth(86.4, 88.8, t))).toFixed(1);
  const kids = end.children;
  kids[0].style.opacity = smooth(86.3, 86.8, t); kids[1].style.opacity = smooth(88.2, 89.0, t);
  kids[2].style.opacity = smooth(88.8, 89.8, t); kids[3].style.opacity = smooth(89.8, 90.6, t);
  // Chapter marks.
  const ch = CHAPTERS.find(([a, b]) => t >= a && t <= b);
  const cEl = $("#chapter");
  if (ch) { cEl.children[0].textContent = ch[2]; cEl.children[1].textContent = ch[3]; cEl.style.opacity = (smooth(ch[0], ch[0] + 0.6, t) * (1 - smooth(ch[1] - 0.8, ch[1], t))).toFixed(3); }
  else cEl.style.opacity = "0";
  // The guide's words.
  const cap = CAPTIONS.find(([a, b]) => t >= a - 0.1 && t <= b + 0.15);
  const capEl = $("#caption");
  if (cap) { if (capEl.textContent !== cap[2]) capEl.textContent = cap[2]; capEl.style.opacity = (smooth(cap[0] - 0.1, cap[0] + 0.15, t) * (1 - smooth(cap[1], cap[1] + 0.15, t))).toFixed(3); }
  else capEl.style.opacity = "0";
  // Room names as the plan is drawn.
  const layer = $("#labels");
  if (!layer.children.length) for (const l of film.labels) { const d = document.createElement("div"); d.className = "label"; d.textContent = l.text; layer.append(d); }
  film.labels.forEach((l, i) => {
    const d = layer.children[i];
    const a = l.floor === "ground" ? smooth(l.from, l.from + 0.6, t) * (1 - smooth(21.5, 23.5, t)) : 0;
    if (a <= 0.001) { d.style.opacity = "0"; return; }
    const v = l.pos.clone().project(film.camera);
    d.style.left = `${((v.x + 1) / 2) * W}px`; d.style.top = `${((1 - v.y) / 2) * H}px`;
    d.style.opacity = a.toFixed(3);
  });
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function main() {
  const stage = $("#stage"), canvas = $("#film");
  if (RENDER) {
    document.body.classList.add("render");
    const w = +params.get("w") || 1280, h = +params.get("h") || 720;
    stage.style.width = `${w}px`; stage.style.height = `${h}px`;
  }
  const size = () => ({ w: Math.round(stage.clientWidth * (RENDER ? 1 : Math.min(devicePixelRatio, 1.5))), h: Math.round(stage.clientHeight * (RENDER ? 1 : Math.min(devicePixelRatio, 1.5))) });
  const s0 = size();
  let film;
  try { film = await createFilm(canvas, { width: s0.w, height: s0.h, voice: VOICE }); }
  catch (err) { $("#loading").textContent = "This film needs WebGL, which this browser doesn't have turned on."; console.error(err); return; }
  $("#loading").hidden = true;
  const draw = (t) => { film.render(t); overlays(film, t, stage); };

  if (RENDER) {
    window.filmFrame = (t) => { draw(t); return true; };
    window.filmReady = true;
    return;
  }

  new ResizeObserver(() => { const s = size(); film.resize(s.w, s.h); if (!playing) draw(clock()); }).observe(stage);
  const audio = $("#audio"), play = $("#play"), scrub = $("#scrub"), time = $("#time"), start = $("#start");
  let playing = false, t0 = 0, base = 0, audioOk = true;
  const clock = () => (playing ? (audioOk && !audio.paused ? audio.currentTime : base + (performance.now() - t0) / 1000) : base);
  const setPlaying = async (on) => {
    if (on === playing) return;
    if (on) {
      if (base >= DURATION - 0.05) base = 0;
      playing = true; t0 = performance.now();
      audio.currentTime = base;
      try { await audio.play(); audioOk = true; } catch { audioOk = false; }
      start.hidden = true;
      requestAnimationFrame(loop);
    } else { base = clock(); playing = false; audio.pause(); }
    play.textContent = playing ? "Pause" : "Play";
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
  };
  const loop = () => {
    if (!playing) return;
    const t = clock();
    if (t >= DURATION) { base = DURATION; setPlaying(false); draw(DURATION); return; }
    draw(t); scrub.value = t; time.textContent = `${fmt(t)} / ${fmt(DURATION)}`;
    requestAnimationFrame(loop);
  };
  play.addEventListener("click", () => setPlaying(!playing));
  start.addEventListener("click", () => setPlaying(true));
  scrub.addEventListener("input", () => { base = +scrub.value; if (playing) { t0 = performance.now(); audio.currentTime = base; } else draw(base); time.textContent = `${fmt(base)} / ${fmt(DURATION)}`; });
  document.addEventListener("keydown", (e) => { if (e.key === " " && e.target === document.body) { e.preventDefault(); setPlaying(!playing); } });
  // A still of the finished house behind the Play button.
  base = 0; draw(31.5); start.hidden = false;
}
main();
