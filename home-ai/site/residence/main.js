// Linden House: a property-site template. Scrolling walks through the house
// (film/film.js); the facts and floor plans come from the same plan.
import { scrollFilm } from "../scrollfilm.js";
import { HOME } from "../../film/film.js";

const $ = (s) => document.querySelector(s);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const SEGMENTS = [
  [0.0, 0.3, 31.0, 32.9],   // the finished exterior at golden hour
  [0.3, 0.55, 35.6, 43.6],  // staged room by room, lights on
  [0.55, 0.8, 50.2, 63.0],  // the door opens, the walk in
  [0.8, 1.0, 82.0, 86.0],   // pulling back at dusk
];
const CUTS = [0.3, 0.55, 0.8];

// Facts from the plan.
const rooms = HOME.rooms;
const area = (r) => r.plan[2] * r.plan[3];
const indoor = rooms.filter((r) => r.id !== "garage");
const total = indoor.reduce((s, r) => s + area(r), 0);
const bedrooms = rooms.filter((r) => /bed|primary/i.test(r.id)).length;
const garage = rooms.find((r) => r.id === "garage");
// The plan is in metres; the listing speaks in feet, with metres beside the totals.
const m2 = (n) => `${Math.round(n)} m²`;
const sqft = (n) => `${Math.round(n * 10.7639).toLocaleString("en-US")} sq ft`;
const ft = (m) => Math.round(m * 3.28084);
$("#stats").innerHTML = [["Bedrooms", `${bedrooms}`], ["Study", "1"], ["Floors", "2"], ["Interior", sqft(total)]]
  .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
const facts = [
  ["Interior", `${sqft(total)} · ${m2(total)}`],
  ["Ground floor", `${sqft(indoor.filter((r) => !r.floor).reduce((s, r) => s + area(r), 0))} + garage`],
  ["Upstairs", sqft(indoor.filter((r) => r.floor === "upper").reduce((s, r) => s + area(r), 0))],
  ["Bedrooms", `${bedrooms}, and a study`],
  ["Garage", `${ft(garage.plan[2])} × ${ft(garage.plan[3])} ft`],
  ["Style", "Modern, flat roof with a deep overhang"],
  ["Finishes", "Oak siding and floors, white render, stone entry wall"],
  ["Smart home", "Haven, with a panel in the hall"],
  ["Price", "On request"],
];
$("#facts tbody").innerHTML = facts.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");

// Floor plans, drawn from the room plans (1 m = 34 px).
const S = 34, PAD = 30;
function planSVG(floor, label) {
  const rs = rooms.filter((r) => (r.floor || "ground") === floor);
  const x0 = Math.min(...rs.map((r) => r.plan[0])), z0 = Math.min(...rs.map((r) => r.plan[1]));
  const x1 = Math.max(...rs.map((r) => r.plan[0] + r.plan[2])), z1 = Math.max(...rs.map((r) => r.plan[1] + r.plan[3]));
  const W = (x1 - x0) * S + PAD * 2, H = (z1 - z0) * S + PAD * 2 + 26;
  const X = (x) => PAD + (x - x0) * S, Y = (z) => PAD + (z - z0) * S;
  let body = "";
  for (const r of rs) {
    const [x, z, w, d] = r.plan;
    body += `<rect class="room${r.id === "garage" ? " garage" : ""}" x="${X(x)}" y="${Y(z)}" width="${w * S}" height="${d * S}"/>`;
    body += `<text class="name" x="${X(x + w / 2)}" y="${Y(z + d / 2) - 2}" text-anchor="middle">${r.name}</text>`;
    body += `<text class="dim" x="${X(x + w / 2)}" y="${Y(z + d / 2) + 14}" text-anchor="middle">${ft(w)}′ × ${ft(d)}′</text>`;
  }
  // Glass walls: the living room and the study face the garden (south).
  for (const id of ["living", "study"]) {
    const r = rs.find((q) => q.id === id);
    if (r) body += `<line class="glass" x1="${X(r.plan[0] + 0.35)}" y1="${Y(r.plan[1] + r.plan[3])}" x2="${X(r.plan[0] + r.plan[2] - 0.35)}" y2="${Y(r.plan[1] + r.plan[3])}"/>`;
  }
  const sy = H - 16;
  const bar = 10 / 3.28084 * S; // a 10-foot scale bar
  body += `<line class="scale" x1="${PAD}" y1="${sy}" x2="${PAD + bar}" y2="${sy}"/><line class="scale" x1="${PAD}" y1="${sy - 5}" x2="${PAD}" y2="${sy + 5}"/><line class="scale" x1="${PAD + bar}" y1="${sy - 5}" x2="${PAD + bar}" y2="${sy + 5}"/>`;
  body += `<text class="dim" x="${PAD + bar + 8}" y="${sy + 4}">10 ft</text>`;
  const sum = rs.filter((r) => r.id !== "garage").reduce((s, r) => s + area(r), 0);
  return `<figure><figcaption><b>${label}</b><span>${sqft(sum)}</span></figcaption><div class="plan-scroll" tabindex="0" role="region" aria-label="${label} floor plan, scrolls sideways"><svg class="plan" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} floor plan">${body}</svg></div></figure>`;
}
$("#plan-figs").innerHTML = planSVG("ground", "Ground floor") + planSVG("upper", "Upstairs");

// Preview requests. As a template, nothing is sent. Where the page carries data-intake (the
// Meridian website), the request goes to Meridian, and the reply says plainly that Linden House is
// a sample, so what they'll get is a walkthrough of Haven.
const INTAKE = document.documentElement.dataset.intake;
$("#book-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget, button = form.querySelector("button[type=submit]");
  const name = $("#f-name").value.trim(), email = $("#f-email").value.trim();
  const status = $("#book-status");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "Add your name and a valid email address."; return; }
  if (!INTAKE) { status.textContent = `Thanks, ${name}. This is a template, so the request wasn't sent. On a live listing it goes straight to the builder.`; return; }
  const message = ["Asked from the Linden House sample listing.", $("#f-date").value && `Preferred day: ${$("#f-date").value}`, `Time: ${$("#f-time").value}`, $("#f-note").value.trim()].filter(Boolean).join("\n");
  button.disabled = true; status.textContent = "Sending…";
  try {
    const res = await fetch(INTAKE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, message, source: "meridian-website:linden" }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.ok === false) throw new Error(out.error || `HTTP ${res.status}`);
    status.textContent = `Thanks, ${name}. Linden House is a sample listing, so Meridian will reply to ${email} to set up a walkthrough of Haven instead.`;
    form.reset();
  } catch {
    status.textContent = "This page couldn't reach Meridian just now, so your request wasn't sent. Your details are still here: try again in a moment.";
  } finally { button.disabled = false; }
});

// The walk-through.
const panels = [...document.querySelectorAll(".panel")];
function overlay(p) {
  panels.forEach((el) => {
    const a = +el.dataset.from, b = +el.dataset.to, w = 0.03;
    const k = a === 0 ? clamp01((b - p) / w) : clamp01((p - a) / w) * clamp01((b - p) / w);
    el.style.opacity = k.toFixed(3);
    el.style.visibility = k > 0.001 ? "visible" : "hidden";
  });
  $("#stats").style.opacity = (1 - clamp01((p - 0.27) / 0.03)).toFixed(3);
  $("#fade").style.opacity = Math.max(0, ...CUTS.map((c) => 1 - Math.abs(p - c) / 0.014)).toFixed(3);
}
scrollFilm({ canvas: $("#canvas"), track: $("#track"), segments: SEGMENTS, onFrame: overlay })
  .then(() => { $("#loading").hidden = true; })
  .catch((err) => { $("#loading").textContent = "This page needs WebGL to show the house."; console.error(err); });


// The header takes the tone of whatever is under it: light text over the film and the green
// section, dark text over the pale ones.
const top = $(".top");
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) top.dataset.tone = e.target.dataset.tone;
}, { rootMargin: "-1px 0px -97% 0px" });
document.querySelectorAll("[data-tone]").forEach((el) => { if (el !== top) io.observe(el); });
