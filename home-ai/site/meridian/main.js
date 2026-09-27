// Meridian Interface: scrolling builds the home (film/film.js), and each
// chapter's drawing sheet fades in over its stretch of the scroll.
import { scrollFilm } from "../scrollfilm.js";

const $ = (s) => document.querySelector(s);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Scroll progress → film time. Each row is one chapter; the jumps between rows are cuts.
const SEGMENTS = [
  [0.0, 0.13, 7.5, 12.6],   // the plan is drawn
  [0.13, 0.29, 13.0, 24.0], // the wireframe rises
  [0.29, 0.43, 24.0, 32.8], // it becomes real
  [0.43, 0.57, 33.6, 43.6], // finished room by room
  [0.57, 0.69, 44.6, 55.6], // the guide forms and opens the door
  [0.69, 0.81, 56.0, 63.0], // the walkthrough and the sensors
  [0.81, 0.93, 63.0, 76.0], // the panel
  [0.93, 1.0, 79.5, 86.0],  // the handover and the pull back
];
const CUTS = [0.43, 0.57];

const sheets = [...document.querySelectorAll(".sheet")];
const dots = $("#progress");
let api;
sheets.forEach((s) => {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-label", s.querySelector(".block span").textContent);
  b.addEventListener("click", () => api?.jumpTo(+s.dataset.from + 0.02));
  dots.append(b);
});

function overlay(p) {
  sheets.forEach((s, i) => {
    const a = +s.dataset.from, b = +s.dataset.to, w = 0.022;
    const k = clamp01((p - a) / w) * clamp01((b - p) / w);
    s.style.opacity = k.toFixed(3);
    s.style.transform = `translateY(${((1 - k) * 12).toFixed(1)}px)`;
    s.style.visibility = k > 0.001 ? "visible" : "hidden";
    if (p >= a && p < b) dots.children[i].setAttribute("aria-current", "step"); else dots.children[i].removeAttribute("aria-current");
  });
  $("#fade").style.opacity = Math.max(0, ...CUTS.map((c) => 1 - Math.abs(p - c) / 0.012)).toFixed(3);
  $("#hint").style.opacity = (1 - clamp01(p / 0.03)).toFixed(3);
}

scrollFilm({ canvas: $("#canvas"), track: $("#track"), segments: SEGMENTS, onFrame: overlay })
  .then((a) => { api = a; $("#loading").hidden = true; })
  .catch((err) => { $("#loading").textContent = "This page needs WebGL to draw the house."; console.error(err); });
