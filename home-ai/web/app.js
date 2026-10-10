// Haven wall panel: the room, the house status, controls, conversation by
// voice or text, and what Haven has learned about the homeowner.
//
// Talks to the Haven home server over HTTP. In the browser-only demo build,
// window.HavenDemo provides the same API in the page, backed by a simulated
// house, so the app code is identical in both.
import { createVoice } from "./voice.js";
import { renderMap } from "./map.js";
import { enableMapZoom } from "./mapzoom.js";
import { createHologram, hologramSupported, moodNow } from "./holo.js";
import { normalizeHome, mainRect, homeSignature } from "./building.js";
import { HOUSE_STILLS } from "./house-stills/index.js";
import { HOUSE_RENDERS, HOUSE_THUMBS } from "./house-stills/gallery.js";
import { SAMPLE_HOMES } from "./homes.js";
import { renderEnergyChart } from "./energy-chart.js";

const $ = (sel) => document.querySelector(sel);
const demo = window.HavenDemo || null;
let token = demo ? "demo" : safeGet("haven.token");
let state = null;
let feed = [];
let profile = { items: [], suggestions: [] };
let energy = null;
let weather = null;
let cams = null; // /api/cameras: { available, cameras, recent, reason }
let room = "all";
let tab = "home";
let speakAloud = safeGet("haven.speak") !== "off";
let started = false;
let panelRoom = safeGet("haven.panelRoom") || "";
let screen = null;        // the library screen this panel shows (set from initialScreen() below)
let controlsOpen = false; // All controls is showing over the screen

// ---------- helpers ----------
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

function svg(path) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  s.append(p);
  return s;
}
const ICON = {
  light: "M9 21h6v-1H9v1Zm3-19a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Z",
  fan: "M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm.5-9C17 2 17.1 8.1 13 9.5c1.4.9 2 2.2 2 2.5 4-1.8 9-.2 9 4.5 0 3.3-6.4 3.7-9.5-1.2-.4 1.6-1.4 2.6-2 2.9 1.3 4.2-1.8 8.3-5.9 5.7-2.9-1.8-.2-7.7 5.1-8.7C10.3 14.4 9.4 13.3 9 12.5 5 14.5 0 12.7 0 8c0-3.2 6.1-3.4 9.3 1.2C9.7 7.7 10.7 6.7 11.3 6.3 10 2.1 10.2 2 12.5 2Z",
  climate: "M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0Zm-3 7a3 3 0 0 1-1.5-5.6l.5-.3V5a1 1 0 0 1 2 0v9.1l.5.3A3 3 0 0 1 12 20Z",
  water: "M12 2s-7 7.6-7 12.5A7 7 0 0 0 19 14.5C19 9.6 12 2 12 2Zm0 18a5 5 0 0 1-5-5h2a3 3 0 0 0 3 3v2Z",
  heater: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 5c-1 1.5-2.5 3-2.5 5a2.5 2.5 0 0 0 5 0c0-2-1.5-3.5-2.5-5Z",
  garage: "M12 3 2 8v13h3v-9h14v9h3V8L12 3Zm-5 11v2h10v-2H7Zm0 4v2h10v-2H7Z",
  lock: "M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z",
  shield: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  door: "M6 2h12v20H6V2Zm2 2v16h8V4H8Zm6 7h1.5v2H14v-2Z",
  home: "M12 3 2 11.5h3V20h5.5v-5.5h3V20H19v-8.5h3L12 3Z",
  sparkle: "M11 2l2.3 6.2L19.5 10.5 13.3 12.8 11 19l-2.3-6.2L2.5 10.5l6.2-2.3L11 2Zm8 11 1 2.5 2.5 1-2.5 1L19 20l-1-2.5-2.5-1 2.5-1L19 13Z",
  motion: "M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 22h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3a7.3 7.3 0 0 0 5.5 2.5v-2a5.3 5.3 0 0 1-4.6-2.6l-1-1.6a2 2 0 0 0-1.7-.9 2 2 0 0 0-.7.1L5 7.3V12h2V8.6l1.8-.7-1 1Z",
  bell: "M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z",
};

// Weather icons, one per condition (night swaps the sun for the moon).
const WX = {
  sun: "M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm-1-16h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  cloud: "M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10H7Z",
  partly: "M8.5 3a4.5 4.5 0 0 0-4.3 5.8 5.2 5.2 0 0 1 6.9-.9A7 7 0 0 1 13 6.5 4.5 4.5 0 0 0 8.5 3Zm0 18a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 18.6 11 4 4 0 0 1 18 21H8.5Z",
  rain: "M7 15a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10H7Zm1 2h2l-1 4H7l1-4Zm4 0h2l-1 4h-2l1-4Zm4 0h2l-1 4h-2l1-4Z",
  snow: "M7 15a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10H7Zm1 3a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 8 18Zm4 1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm4-1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z",
  storm: "M7 15a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10H7Zm5.5 1H15l-1.7 2.8H15L11 23l.9-3.6H10l2.5-3.4Z",
  fog: "M3 7h18v2H3V7Zm2 4h14v2H5v-2Zm-2 4h18v2H3v-2Zm4 4h10v2H7v-2Z",
  wind: "M3 8h11a2.5 2.5 0 1 0-2.5-2.5h-2A4.5 4.5 0 1 1 14 10H3V8Zm0 4h15a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3v-2Z",
};
function wxIcon(condition, isDay = true) {
  const d = { clear: isDay ? WX.sun : WX.moon, "partly-cloudy": isDay ? WX.partly : WX.cloud, cloudy: WX.cloud, fog: WX.fog, drizzle: WX.rain, rain: WX.rain, sleet: WX.snow, snow: WX.snow, storm: WX.storm, wind: WX.wind }[condition] || WX.cloud;
  const s = svg(d);
  s.classList.add("wx-ic", `wx-${condition}${condition === "clear" && !isDay ? "-night" : ""}`);
  return s;
}

async function api(path, body) {
  if (demo) return demo.request(body ? "POST" : "GET", path, body);
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { showLogin("That token didn't work. Check it and try again."); throw new Error("unauthorized"); }
  return res.json();
}

function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ---------- login ----------
function showLogin(msg = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-error").textContent = msg;
}

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  token = $("#token-input").value.trim();
  safeSet("haven.token", token);
  $("#login").hidden = true;
  start();
});

// ---------- look switch and appearance ----------
// Each designed screen has its own look. The finish (Grounded, Futuristic, Vivid) dresses
// Wallpaper and All controls on Wallpaper; on the other screens the page wears the plain base
// and each screen's own colors (set on .panel[data-screen=…] in styles.css).
const LOOKS = ["grounded", "futuristic", "vivid"];
// The finish this panel's owner chose (look.js or the demo page may have put the plain base on
// <html> already, since the screen opening isn't Wallpaper).
const lookAsked = new URLSearchParams(location.search).get("look");
let chosenLook = [lookAsked, safeGet("haven.look"), window.__havenLook, document.documentElement.getAttribute("data-look")].find((x) => LOOKS.includes(x)) || "grounded";
const SCREEN_BG = { command: "#1b1e23", glass: "#08090b", console: "#0f1216", wall: "#0a0e13", classic: "#26282c", neon: "#040507", aurora: "#2c1660", lagoon: "#16357d", evening: "#0b0e13" };
function themeColor() {
  if (SCREEN_BG[screen] && !controlsOpen) return SCREEN_BG[screen];
  const look = document.documentElement.getAttribute("data-look");
  const theme = document.documentElement.getAttribute("data-theme");
  const dark = theme ? theme === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  if (look === "futuristic") return "#05060b";
  if (look === "vivid") return dark ? "#000000" : "#eef1f7";
  return dark ? "#15110d" : "#efe9df";
}
function applyLook() {
  const look = screen === "wallpaper" || controlsOpen ? chosenLook : "grounded";
  if (document.documentElement.getAttribute("data-look") !== look) document.documentElement.setAttribute("data-look", look);
  document.body.style.background = (!controlsOpen && SCREEN_BG[screen]) || ""; // past the end of the screen, its own color
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor());
}
function setLook(look) {
  if (!LOOKS.includes(look)) look = "grounded";
  chosenLook = look;
  safeSet("haven.look", look);
  if (screen) applyLook();
  for (const b of document.querySelectorAll(".look-switch button[data-look]")) b.setAttribute("aria-pressed", String(b.dataset.look === look));
}
for (const b of document.querySelectorAll(".look-switch button[data-look]")) b.addEventListener("click", () => setLook(b.dataset.look));
setLook(chosenLook);

// Appearance: Auto follows the device; Light or Dark pins it (Grounded and
// Vivid have both; Futuristic is always dark).
function setTheme(choice) {
  if (choice === "light" || choice === "dark") document.documentElement.setAttribute("data-theme", choice);
  else { choice = "auto"; document.documentElement.removeAttribute("data-theme"); }
  safeSet("haven.theme", choice);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor());
  for (const b of document.querySelectorAll("[data-theme-choice]")) b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice));
}
for (const b of document.querySelectorAll("[data-theme-choice]")) b.addEventListener("click", () => setTheme(b.dataset.themeChoice));
setTheme(document.documentElement.getAttribute("data-theme") || "auto");

// ---------- tabs ----------
function setTab(name) {
  tab = name;
  for (const b of document.querySelectorAll(".tabs [role=tab]")) {
    const on = b.dataset.tab === name;
    b.setAttribute("aria-selected", String(on));
    $(`#tab-${b.dataset.tab}`).hidden = !on;
  }
  if (name === "you") loadProfile();
}
for (const b of document.querySelectorAll(".tabs [role=tab]")) b.addEventListener("click", () => setTab(b.dataset.tab));

// ---------- state helpers ----------
// Devices are listed under their room; tag each with it for filtering.
// (The spread keeps the same state object, so setpoint steps still show.)
const allDevices = () => state.rooms.flatMap((r) => r.devices.map((d) => ({ ...d, room: r.id })));
const byType = (t) => allDevices().filter((d) => d.type === t);
const roomName = (id) => state.rooms.find((r) => r.id === id)?.name || id;
const CONTROL_TYPES = new Set(["light", "fan", "thermostat", "water_heater", "water_valve", "garage", "lock"]);
const MODES = [["auto", "Auto"], ["heat", "Heat"], ["cool", "Cool"], ["off", "Off"]];

function describe(d) {
  const s = d.state;
  switch (d.type) {
    case "light": return s.on ? `On · ${s.brightness}%` : "Off";
    case "fan": return s.on ? `On · speed ${s.speed}` : "Off";
    case "thermostat": return `${s.current}°F now · ${s.mode === "off" ? "off" : `${s.mode} to ${s.target}°F`}${s.hvac && s.hvac !== "idle" ? ` · ${s.hvac}` : ""}${s.setback ? " · away" : ""}`;
    case "water_heater": return s.on ? `${s.target}°F · ${s.mode.replace("_", " ")}` : "Off";
    case "water_valve": return s.open ? "Water on" : "Water off";
    case "garage": return s.door[0].toUpperCase() + s.door.slice(1);
    case "lock": return s.locked ? "Locked" : "Unlocked";
    case "motion": return s.motion ? "motion now" : s.lastMotion ? `motion ${timeAgo(s.lastMotion)}` : "no motion";
    case "leak": return s.wet ? "LEAK" : "dry";
    case "contact": return s.open ? "open" : "closed";
    case "illuminance": return `${s.lux} lux`;
    case "temperature": return `${s.value}°F`;
    default: return "";
  }
}

function isAlert(d) {
  const s = d.state;
  return (d.type === "leak" && s.wet) || (d.type === "water_valve" && !s.open) ||
    (d.type === "lock" && !s.locked) || (d.type === "garage" && s.door !== "closed") ||
    (d.type === "contact" && s.open);
}

const send = (id, command) => api(`/api/devices/${encodeURIComponent(id)}`, { command }).then(showResult);

// Step a setpoint. The new value shows at once so quick repeated taps add
// up. Pending values live apart from the house data (which is only ever
// replaced by what the house reports), so a refresh arriving between taps
// can't make a tap step from an old number.
// A pending value is dropped only when fresh data arrives after its
// request finished, never before, or a quick second tap could step from
// data that's a moment old.
const pendingTarget = new Map(); // device id -> { value, settled }
const targetOf = (d) => pendingTarget.get(d.id)?.value ?? d.state.target;
function stepTarget(d, delta) {
  const next = targetOf(d) + delta;
  pendingTarget.set(d.id, { value: next, settled: false });
  renderCurrent();
  return send(d.id, { target: next }).finally(() => {
    const p = pendingTarget.get(d.id);
    if (p && p.value === next) p.settled = true;
    refresh();
  });
}
function renderCurrent() {
  if (controlsOpen) renderHome(); else renderAlt();
}

// What needs the homeowner's attention, most serious first, each with the fix.
function issues() {
  const list = [];
  for (const l of byType("leak").filter((x) => x.state.wet)) list.push({ level: "bad", text: `Leak: ${l.name.replace(/ Leak Sensor$/, "")}` });
  const valve = byType("water_valve")[0];
  if (valve && !valve.state.open) list.push({ level: "warn", text: "Main water is off" });
  const th = byType("thermostat")[0];
  if (th && th.state.current < 50) list.push({ level: "bad", text: `${th.state.current}°F inside` });
  const garage = byType("garage")[0];
  if (garage && garage.state.door !== "closed") {
    list.push({ level: "warn", text: `Garage ${garage.state.door}`, action: garage.state.door === "open" ? ["Close", () => send(garage.id, { door: "closed" })] : null });
  }
  for (const l of byType("lock").filter((x) => !x.state.locked)) {
    list.push({ level: "warn", text: `${l.name.replace(/ Lock$/, "")} unlocked`, action: ["Lock", () => send(l.id, { locked: true })] });
  }
  for (const c of byType("contact").filter((x) => x.state.open)) list.push({ level: "warn", text: `${c.name} open` });
  return list;
}

function houseState() {
  const list = issues();
  return list.some((i) => i.level === "bad") ? "alert" : list.length ? "attention" : state.pending.length ? "confirm" : "ok";
}

// ---------- the stage (left) ----------
function greetingWord() {
  return { morning: "Good morning", day: "Good afternoon", evening: "Good evening", night: "Hello" }[state.daypart] || "Hello";
}

function renderStage() {
  const th = byType("thermostat")[0];
  const home = state.people.filter((p) => p.home).length;
  $("#app").dataset.daypart = state.daypart || "evening";
  $("#home-name").textContent = state.home;
  $("#room-title").textContent = room === "all" ? "Whole home" : roomName(room);

  const heat = th.state.hvac === "heating" ? ` Heating to ${th.state.target}°F.` : th.state.hvac === "cooling" ? ` Cooling to ${th.state.target}°F.` : "";
  const lit = room === "all" ? byType("light").filter((l) => l.state.on).length : allDevices().filter((d) => d.room === room && d.type === "light" && d.state.on).length;
  $("#greeting").textContent = `${greetingWord()}. It's ${th.state.current}°F inside.${heat} ${lit ? `${lit} light${lit === 1 ? "" : "s"} on` : "Lights are off"}${room === "all" ? `, ${home ? `${home} ${home === 1 ? "person" : "people"} home` : "everyone away"}` : ""}.`;

  const list = issues();
  const hs = houseState();
  $("#status").dataset.state = hs;
  $("#orb").dataset.house = hs;
  $("#status-headline").textContent = hs === "alert" ? "Needs your attention now"
    : list.length ? `${list.length} ${list.length === 1 ? "thing needs" : "things need"} attention`
    : state.pending.length ? "Waiting for your OK" : "All secure";
  $("#issues").replaceChildren(...list.map((i) =>
    el("li", { class: `issue ${i.level}` }, i.text, i.action && el("button", { onclick: i.action[1] }, i.action[0]))));

  houseView($("#map"), { selected: room === "all" ? null : room, onSelect: (id) => { room = room === id ? "all" : id; render(); }, onExpand: () => openExplorer() });

  const rooms = state.rooms.filter((r) => r.devices.length);
  $("#rooms-nav").replaceChildren(
    ...[{ id: "all", name: "Whole home" }, ...rooms].map((r) =>
      el("button", { "aria-current": String(room === r.id), onclick: () => { room = r.id; render(); } }, r.name)));
  tickClock();
}

function tickClock() {
  if (!state) return;
  const tz = state.timezone;
  const now = new Date();
  try {
    $("#clock").textContent = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
    $("#date").textContent = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(now);
  } catch { /* unknown timezone: leave as is */ }
  for (const n of document.querySelectorAll(".live-clock")) {
    const t = clockText(n.dataset.fmt);
    if (n.textContent !== t) n.textContent = t;
  }
}

// ---------- the glass (right) ----------
function askCard(kind, kicker, text, actions) {
  return el("div", { class: `ask-card ${kind}` },
    el("p", {}, el("span", { class: "kicker" }, kicker), text),
    el("div", { class: "ask-actions" }, ...actions));
}

function suggestionCards(list) {
  return list.map((s) => askCard("suggest", "Haven noticed", s.text, [
    el("button", { onclick: () => api(`/api/suggestions/${s.id}`, { accept: false }).then(afterProfileChange) }, "No thanks"),
    el("button", { class: "primary", onclick: () => api(`/api/suggestions/${s.id}`, { accept: true }).then(afterProfileChange) }, "Yes, do that"),
  ]));
}

function renderAsks() {
  $("#suggestions").replaceChildren(...suggestionCards(state.suggestions || []));
  $("#pending").replaceChildren(...state.pending.map((p) => askCard("confirm", "Needs your OK", `${p.summary}?`, [
    el("button", { onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: false }).then(showResult) }, "Cancel"),
    el("button", { class: "primary", onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: true }).then(showResult) }, "Confirm"),
  ])));
  const n = (state.suggestions || []).length;
  $("#you-badge").hidden = !n;
  $("#you-badge").textContent = n;
}

function renderScenes() {
  $("#scenes").replaceChildren(...Object.entries(state.scenes).map(([id, label]) =>
    el("button", { class: "scene", "data-scene": id, onclick: () => api(`/api/scenes/${id}`, {}).then(showResult) }, el("span", {}, label))));
}

function tile(d, { icon, name, stateText, on = false, alert = false, head = [], body = [], wide = false, id, style }) {
  return el("div", { class: `tile${on ? " on" : ""}${alert ? " alert" : ""}${wide ? " wide" : ""}`, "data-device": id || d?.id || "", style },
    el("div", { class: "tile-head" },
      el("div", { class: "tile-title" },
        el("span", { class: "tile-icon" }, svg(icon)),
        el("div", {}, el("div", { class: "tile-name" }, name), el("div", { class: "tile-state" }, stateText))),
      ...head),
    ...body);
}

const toggle = (label, checked, fn) => el("button", { class: "switch", role: "switch", "aria-checked": String(checked), "aria-label": label, onclick: fn });

function deviceTile(d) {
  const s = d.state;
  switch (d.type) {
    case "light": {
      const slider = el("input", {
        type: "range", min: "5", max: "100", step: "5", value: String(s.brightness), "aria-label": `${d.name} brightness`,
        style: `--fill:${s.brightness}%`,
        oninput: (e) => e.target.style.setProperty("--fill", `${e.target.value}%`),
        onchange: (e) => send(d.id, { on: true, brightness: Number(e.target.value) }),
      });
      return tile(d, { icon: ICON.light, name: d.name, stateText: describe(d), on: s.on, style: s.on ? `--glow:${s.brightness / 100}` : undefined,
        head: [toggle(d.name, s.on, () => send(d.id, { on: !s.on }))], body: s.on ? [slider] : [] });
    }
    case "fan":
      return tile(d, { icon: ICON.fan, name: d.name, stateText: describe(d), on: s.on,
        head: [toggle(d.name, s.on, () => send(d.id, { on: !s.on }))],
        body: s.on ? [el("div", { class: "seg", role: "group", "aria-label": "Fan speed" },
          ...[1, 2, 3].map((n) => el("button", { "aria-pressed": String(s.speed === n), "aria-label": `Speed ${n}`, onclick: () => send(d.id, { speed: n }) }, String(n))))] : [] });
    case "thermostat":
      return climateTile(d);
    case "water_heater":
      return tile(d, { icon: ICON.heater, name: d.name, stateText: describe(d), on: false,
        head: [toggle("Water heater power", s.on, () => send(d.id, { on: !s.on }))],
        body: s.on ? [el("div", { class: "stepper" },
          el("button", { "aria-label": "Lower 5°F", onclick: () => stepTarget(d, -5) }, "−"),
          el("span", { class: "target" }, `${targetOf(d)}°F`),
          el("button", { "aria-label": "Raise 5°F", onclick: () => stepTarget(d, 5) }, "+"))] : [] });
    case "water_valve":
      return tile(d, { icon: ICON.water, name: d.name, stateText: describe(d), alert: !s.open,
        body: [el("div", { class: "tile-actions" }, s.open
          ? el("button", { class: "danger", onclick: () => send(d.id, { open: false }) }, "Shut off")
          : el("button", { class: "primary", onclick: () => send(d.id, { open: true }) }, "Turn on"))] });
    case "garage":
      return tile(d, { icon: ICON.garage, name: d.name, stateText: describe(d), alert: s.door !== "closed",
        body: [el("div", { class: "tile-actions" },
          el("button", { onclick: () => send(d.id, { door: s.door === "closed" ? "open" : "closed" }) }, s.door === "closed" ? "Open" : "Close"))] });
    case "lock":
      return tile(d, { icon: ICON.lock, name: d.name, stateText: describe(d), alert: !s.locked,
        body: [el("div", { class: "tile-actions" },
          el("button", { onclick: () => send(d.id, { locked: !s.locked }) }, s.locked ? "Unlock" : "Lock"))] });
    default:
      return null;
  }
}

function climateTile(d) {
  const s = d.state;
  const C = 2 * Math.PI * 52;
  const arc = C * 0.75;
  const frac = Math.min(1, Math.max(0, (s.target - 55) / 30));
  const color = s.hvac === "heating" ? "#e07a3a" : s.hvac === "cooling" ? "#3a8fe0" : "var(--on)";
  const dial = el("div", { class: "dial", style: `--dial:${color}` });
  dial.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52" stroke-dasharray="${arc} ${C}"/><circle class="value" cx="60" cy="60" r="52" stroke-dasharray="${s.mode === "off" ? 0 : arc * frac} ${C}"/></svg>`;
  dial.append(el("div", { class: "dial-center" },
    el("span", { class: "dial-temp" }, `${Math.round(s.current)}°`),
    el("span", { class: "dial-sub" }, s.mode === "off" ? "System off" : s.hvac === "heating" ? `Heating to ${s.target}°` : s.hvac === "cooling" ? `Cooling to ${s.target}°` : `Holding ${s.target}°`)));
  return tile(d, {
    icon: ICON.climate, name: "Climate", stateText: `${s.humidity ?? "--"}% humidity${s.setback ? " · away" : ""}`, wide: true,
    body: [el("div", { class: "dial-row" }, dial,
      el("div", { class: "climate-controls" },
        el("div", { class: "stepper" },
          el("button", { "aria-label": "Cooler by 1°F", onclick: () => stepTarget(d, -1) }, "−"),
          el("span", { class: "target" }, `${targetOf(d)}°F`),
          el("button", { "aria-label": "Warmer by 1°F", onclick: () => stepTarget(d, 1) }, "+")),
        el("div", { class: "seg", role: "group", "aria-label": "Mode" },
          ...MODES.map(([m, label]) => el("button", { "aria-pressed": String(s.mode === m), onclick: () => send(d.id, { mode: m }) }, label)))))],
  });
}

function wholeHomeTiles() {
  const lights = byType("light");
  const lit = lights.filter((l) => l.state.on);
  const garage = byType("garage")[0];
  const locks = byType("lock");
  const unlocked = locks.filter((l) => !l.state.locked);
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);
  const secure = garage.state.door === "closed" && !unlocked.length;
  return [
    climateTile(byType("thermostat")[0]),
    energyTile(),
    tile(null, { id: "lights", icon: ICON.light, name: "Lights", on: lit.length > 0,
      stateText: lit.length ? `${lit.length} on · ${lit.map((l) => l.name.replace(/ Lights?$/, "")).join(", ")}` : "All off",
      body: lit.length ? [el("div", { class: "tile-actions" }, el("button", { onclick: () => Promise.all(lit.map((l) => api(`/api/devices/${l.id}`, { command: { on: false } }))).then(() => showResult({ message: "All lights off." })) }, "All off"))] : [] }),
    tile(null, { id: "security", icon: ICON.shield, name: "Security", alert: !secure,
      stateText: `Garage ${garage.state.door} · ${unlocked.length ? `${unlocked.length} unlocked` : `${locks.length} doors locked`}`,
      body: !secure ? [el("div", { class: "tile-actions" }, el("button", { class: "primary", onclick: lockUp }, "Lock up"))] : [] }),
    tile(valve, { icon: ICON.water, name: "Water", alert: wet.length > 0 || !valve.state.open,
      stateText: `${valve.state.open ? "Main water on" : "Main water off"} · ${wet.length ? `leak at ${wet.map((w) => w.name.replace(/ Leak Sensor$/, "")).join(", ")}` : "no leaks"}`,
      body: [el("div", { class: "tile-actions" }, valve.state.open
        ? el("button", { class: "danger", onclick: () => send(valve.id, { open: false }) }, "Shut off")
        : el("button", { class: "primary", onclick: () => send(valve.id, { open: true }) }, "Turn on"))] }),
    deviceTile(byType("water_heater")[0]),
  ];
}

function energyTile() {
  const t = el("div", { class: "tile wide energy", "data-device": "energy" });
  if (!energy) { t.append(el("div", { class: "tile-name" }, "Energy"), el("p", { class: "muted small" }, "Loading…")); return t; }
  const estimated = energy.source === "estimate";
  const top = energy.breakdown.filter((p) => !p.name.startsWith("Always-on"))[0];
  const chart = el("div", { class: "chart-slot" }); // drawn once it has a width (renderHome)
  t.append(
    el("div", { class: "tile-head" },
      el("div", { class: "tile-title" },
        el("span", { class: "tile-icon" }, svg(ICON.bolt)),
        el("div", {}, el("div", { class: "tile-name" }, "Electricity today"),
          el("div", { class: "tile-state" }, estimated ? "Estimated from what each device is doing" : "Measured by your energy monitor"))),
      el("div", { class: "energy-stats" },
        el("div", {}, el("span", { class: "energy-num" }, `${energy.nowKw}`), el("span", { class: "energy-unit" }, " kW now")),
        el("div", {}, el("span", { class: "energy-num" }, `${energy.todayKwh}`), el("span", { class: "energy-unit" }, " kWh today")))),
    chart,
    el("p", { class: "energy-foot" }, top ? `Using the most right now: ${top.name.toLowerCase()} (${top.kw} kW).` : "Only the always-on load is running right now."),
  );
  return t;
}

async function lockUp() {
  const jobs = byType("lock").filter((l) => !l.state.locked).map((l) => api(`/api/devices/${l.id}`, { command: { locked: true } }));
  const garage = byType("garage")[0];
  if (garage.state.door !== "closed") jobs.push(api(`/api/devices/${garage.id}`, { command: { door: "closed" } }));
  const results = await Promise.all(jobs);
  const problem = results.find((r) => r.status !== "done");
  showResult({ message: problem ? problem.message : "Locked up. Doors locked and the garage is closing." });
}

function renderHome() {
  if (room === "all") {
    $("#devices-title").textContent = "Around the house";
    $("#tiles").replaceChildren(...wholeHomeTiles());
    $("#sensors").replaceChildren();
    const slot = $("#tiles .chart-slot");
    if (slot && energy) renderEnergyChart(slot, energy, slot.clientWidth || 600);
    return;
  }
  const devices = allDevices().filter((d) => d.room === room);
  $("#devices-title").textContent = `${roomName(room)} devices`;
  $("#tiles").replaceChildren(...devices.filter((d) => CONTROL_TYPES.has(d.type)).map(deviceTile).filter(Boolean));
  const r = roomName(room);
  $("#sensors").replaceChildren(...devices.filter((d) => !CONTROL_TYPES.has(d.type)).map((d) =>
    el("span", { class: isAlert(d) ? "alert" : "" }, `${d.name.startsWith(r + " ") ? d.name.slice(r.length + 1) : d.name}: ${describe(d)}`)));
}

const FEELINGS = [["too_cold", "Too cold"], ["too_warm", "Too warm"], ["too_bright", "Too bright"], ["too_dark", "Too dark"], ["just_right", "Just right"]];
function renderFeel() {
  $("#feel").replaceChildren(...feelButtons());
}
function feelButtons() {
  return FEELINGS.map(([f, label]) => el("button", {
    onclick: async () => {
      say("you", label);
      const r = await api("/api/feedback", { feeling: f, room: room === "all" ? (panelRoom || undefined) : room });
      reply(r.message);
      refresh();
    },
  }, label));
}

function feedItem(e) {
  if (e.type === "notification") return { title: e.title, body: e.body + (e.held ? " (held for quiet hours)" : ""), urgent: e.priority === "urgent" };
  if (e.type === "action" && e.origin === "automation") return { title: String(e.reason || "").startsWith("Your routine") ? "Your routine" : "Automatic", body: `${e.summary}. ${e.reason || ""}` };
  if (e.type === "action") return { title: e.origin === "agent" ? "Haven" : "You", body: e.summary };
  if (e.type === "refused") return { title: "Blocked for safety", body: e.reason };
  if (e.type === "presence") return { title: e.name, body: { approaching: "is almost home", arrived: "arrived home", left: "left home" }[e.kind] };
  if (e.type === "suggestion") return { title: "Haven noticed a habit", body: e.text };
  if (e.type === "reflection") return { title: "Daily review", body: e.message };
  return null;
}
function renderFeed() {
  const items = feed.map((e) => [e, feedItem(e)]).filter(([, f]) => f).slice(-40).reverse();
  $("#feed").replaceChildren(...items.map(([e, f]) =>
    el("li", { class: f.urgent ? "urgent" : "" },
      el("span", { class: "when" }, timeAgo(e.ts)),
      el("span", { class: "title" }, f.title),
      el("span", {}, f.body))));
}

// ---------- about you ----------
async function loadProfile() {
  profile = await api("/api/profile");
  renderProfile();
}

let forgetArmed = false;
function renderProfile() {
  $("#you-suggestions").replaceChildren(...suggestionCards(profile.suggestions));
  const KIND = { comfort: "Comfort", like: "Likes", dislike: "Dislikes", note: "Remembered", routine: "Routine", rule: "Rule" };
  $("#profile").replaceChildren(...(profile.items.length
    ? profile.items.map((i) => el("li", {},
        el("div", {}, el("span", { class: "kind" }, KIND[i.kind] || i.kind), i.text),
        el("button", { class: "ghost", "aria-label": `Forget: ${i.text}`, onclick: () => api("/api/profile/forget", { id: i.id }).then(afterProfileChange) }, "Forget")))
    : [el("li", { class: "empty" }, "Nothing yet. Tell Haven when you're too warm, too cold, or when something's just right, and it will start learning.")]));
  $("#forget-all").textContent = forgetArmed ? "Tap again to forget everything" : "Forget everything";
}

async function afterProfileChange(r) {
  if (r?.message) reply(r.message);
  await loadProfile();
  refresh();
}

$("#forget-all").addEventListener("click", async () => {
  if (!forgetArmed) {
    forgetArmed = true;
    renderProfile();
    setTimeout(() => { forgetArmed = false; if (tab === "you") renderProfile(); }, 4000);
    return;
  }
  forgetArmed = false;
  afterProfileChange(await api("/api/profile/forget", { id: "all" }));
});

$("#reflect-now").addEventListener("click", async () => {
  const r = await api("/api/profile/reflect", {});
  reply(r.message);
  await loadProfile();
});

// ---------- conversation and voice ----------
const log = $("#chat-log");
let interimNode = null;

function say(who, text) {
  log.hidden = false;
  interimNode?.remove();
  interimNode = null;
  log.append(el("div", { class: `msg ${who}` }, text));
  while (log.children.length > 12) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  clearTimeout(say.hideTimer);
  say.hideTimer = setTimeout(() => { if (!voice.isListening()) log.hidden = true; }, 20_000);
}

let lastReply = "";
function reply(text, { spoken = true } = {}) {
  if (!text) return;
  say("haven", text);
  lastReply = text;
  const st = document.querySelector(".st-reply");
  if (st) st.textContent = text;
  if (speakAloud && spoken) voice.speak(text);
}

// Haven's voice state, shown by the orb in the voice bar and the Studio orb.
const VOICE_LABEL = { idle: "Tap to talk", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking" };
let voiceState = "idle";
function setVoiceState(s) {
  voiceState = VOICE_LABEL[s] ? s : "idle";
  $("#orb").dataset.voice = voiceState;
  for (const o of document.querySelectorAll(".st-orb, .gl-orb")) o.dataset.voice = voiceState;
  for (const l of document.querySelectorAll(".st-state")) l.textContent = VOICE_LABEL[voiceState];
}

// The waveform: speech signals push a level up, it eases back down.
const level = { now: 0, target: 0, raf: 0 };
function pushLevel(v) {
  level.target = Math.max(level.target, v);
  if (!level.raf) level.raf = requestAnimationFrame(stepLevel);
}
function stepLevel(t) {
  level.raf = 0;
  level.now += (level.target - level.now) * 0.35;
  level.target *= 0.88;
  const active = level.now > 0.01 || level.target > 0.01;
  const bars = document.querySelectorAll(".wave i");
  bars.forEach((b, i) => {
    const shape = 0.5 + 0.5 * Math.abs(Math.sin(t / 150 + i * 1.7));
    b.style.setProperty("--l", active ? (level.now * shape).toFixed(3) : "0");
  });
  for (const o of document.querySelectorAll(".orb, .st-orb, .gl-orb")) o.style.setProperty("--lvl", active ? level.now.toFixed(3) : "0");
  if (active) level.raf = requestAnimationFrame(stepLevel);
}

function showResult(r) {
  if (r?.message) reply(r.message);
  refresh();
}

function showHint(text) {
  const hint = $("#voice-hint");
  hint.textContent = text || "";
  hint.hidden = !text;
  clearTimeout(showHint.t);
  if (text) showHint.t = setTimeout(() => { hint.hidden = true; }, 6000);
}

function showInterim(text) {
  log.hidden = false;
  if (!interimNode) { interimNode = el("div", { class: "msg you interim" }); log.append(interimNode); }
  interimNode.textContent = text || "Listening…";
  log.scrollTop = log.scrollHeight;
}

// Haven's ElevenLabs voice, when the home server has one (never in the demo).
async function serverSpeech(text) {
  if (demo || state?.voice?.provider !== "elevenlabs") return null;
  const res = await fetch("/api/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.ok ? res.blob() : null;
}

const voice = createVoice({
  synthesize: serverSpeech,
  onInterim: showInterim,
  onFinal: (text) => ask(text),
  onLevel: pushLevel,
  onState(s, message) {
    setVoiceState(s === "unavailable" || s === "error" ? "idle" : s);
    $("#mic").setAttribute("aria-pressed", String(s === "listening"));
    if (s === "listening") { showHint("Listening… tap the mic again to stop."); showInterim(""); }
    if (s !== "listening" && interimNode?.textContent === "Listening…") { interimNode.remove(); interimNode = null; }
    if (message) showHint(message);
  },
});
if (!voice.canListen) $("#mic").classList.add("unavailable");
$("#speak").setAttribute("aria-pressed", String(speakAloud && voice.canSpeak));
if (!voice.canSpeak) $("#speak").hidden = true;

function talk() {
  if (!voice.canListen) { showHint(voice.whyNot); $("#chat-input").focus(); return; }
  voice.listen();
}
$("#mic").addEventListener("click", talk);
$("#speak").addEventListener("click", () => {
  speakAloud = !speakAloud;
  safeSet("haven.speak", speakAloud ? "on" : "off");
  $("#speak").setAttribute("aria-pressed", String(speakAloud));
  if (!speakAloud) voice.silence();
  showHint(speakAloud ? "Haven will speak out loud." : "Haven will stay quiet and show its replies.");
});

async function ask(text) {
  say("you", text);
  setVoiceState("thinking");
  try {
    const r = await api("/api/chat", { text, conversationId: "panel", panelRoom: panelRoom || undefined });
    reply(r.reply || r.error || "Sorry, I didn't get a reply. Try again.");
  } finally {
    if (voiceState === "thinking") setVoiceState("idle");
  }
  refresh();
}

$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#chat-input").value.trim();
  if (!text) return;
  $("#chat-input").value = "";
  ask(text);
});

// The briefing arrives as a live event, which adds it to the conversation.
$("#brief-now").addEventListener("click", () => api("/api/briefing", {}));

// ---------- simulator ----------
function simButtons() {
  const sensor = (device, s) => () => api("/api/sim/sensor", { device, state: s }).then(refresh);
  const presence = (kind) => () => api("/api/presence", { person: "owner", kind }).then(refresh);
  const buttons = [
    ["Make it night", sensor("sensor.outdoor_lux", { lux: 5 })],
    ["Make it day", sensor("sensor.outdoor_lux", { lux: 800 })],
    ["Motion in kitchen", sensor("motion.kitchen", { motion: true })],
    ["Motion in hallway", sensor("motion.hallway", { motion: true })],
    ["Motion on driveway", sensor("motion.driveway", { motion: true })],
    ["Motion stops", () => Promise.all(["motion.kitchen", "motion.hallway", "motion.driveway", "motion.garage"].map((d) => api("/api/sim/sensor", { device: d, state: { motion: false } }))).then(refresh)],
    ["Leak at water heater", sensor("leak.water_heater", { wet: true })],
    ["Leak sensor dries", sensor("leak.water_heater", { wet: false })],
    ["Back door opens", sensor("contact.back_door", { open: true })],
    ["Back door closes", sensor("contact.back_door", { open: false })],
    ["Cold snap (48°F inside)", sensor("climate.main", { current: 48 })],
    ["Car approaching home", presence("approaching")],
    ["Arrive home", presence("arrived")],
    ["Everyone leaves", presence("left")],
  ];
  $("#sim-buttons").replaceChildren(...buttons.map(([label, fn]) => el("button", { onclick: fn }, label)));
}

// ---------- screen library ----------
// Every screen runs on the same live house; only the arrangement and the look change.
// All controls (the room view, every device tile, Updates, About you and the simulator) opens from any of them.
const SCREENS = [
  { id: "command", name: "Command", best: "Great room or main entry", about: "The flagship: tabs across the top, scene buttons, security, the weather, a thermostat dial, the house in 3D, big light tiles and the cameras. Every tab is live." },
  { id: "wallpaper", name: "Wallpaper", best: "Living room or a large wall display", about: "Your home's photo behind frosted tiles: weather, climate, every light on a slider, doors, energy and scenes. The photo follows the time of day, or use your own." },
  { id: "glass", name: "Glass", best: "Living room, where people talk to Haven", about: "Black glass with a thermostat dial, a big clock, Haven's updates, scene cards and the voice line along the bottom: tap it and talk. Haven's agents show what each is doing." },
  { id: "wall", name: "Everything Wall", best: "Office or a large wall display", about: "Everything at a glance: a strip of the numbers that matter, the cameras, every door and switch, each room's lights, gauges and today's electricity." },
  { id: "evening", name: "Good Evening", best: "Kitchen", about: "A friendly greeting with the weather, climate and the water heater, the forecast, scenes, a card for every room and the cameras with their lights." },
  { id: "aurora", name: "Aurora", best: "Bedroom", about: "Soft color that dims at night, big bedtime buttons, this room's lights, the thermostat and the day's electricity. Whoever sleeps there can put their own photo behind it." },
  { id: "console", name: "Security Console", best: "Mudroom or garage door", about: "The alarm-panel view: every door, lock, motion and leak sensor, the cameras, the thermostat and water heater, the house, and one tap to leave or arrive." },
  { id: "classic", name: "Portrait Classic", best: "Hallway, or a tall portrait screen", about: "The classic dashboard in sections: today, climate, every light, the cameras, security and scenes. Made to read top to bottom." },
  { id: "neon", name: "Neon Frame", best: "Media room or office, in a dark room", about: "Glowing outlines on black: doors and locks, electricity flowing into the house, the cameras, climate, and every light on a switch." },
  { id: "lagoon", name: "Lagoon", best: "Family room or guest suite", about: "Deep blue: the weather with temperature bars, the house itself, Home and Away cards, and the choice of Haven's voice." },
];
// Screens from before the redesign, so saved choices and old links keep working.
const SCREEN_ALIAS = { signature: "command", studio: "glass", "command-center": "wall", "family-hub": "evening", nightstand: "aurora", rooms: "classic", entry: "console" };
const screenId = (id) => SCREEN_ALIAS[id] || id;
const screenName = (id) => SCREENS.find((x) => x.id === id)?.name || id;
function initialScreen() {
  const fromHash = screenId(location.hash.replace("#", ""));
  if (SCREENS.some((x) => x.id === fromHash)) return fromHash;
  const saved = screenId(safeGet("haven.screen"));
  return SCREENS.some((x) => x.id === saved) ? saved : "command";
}
screen = initialScreen();

// A screen named in the address after load (the showroom's tour, a link tapped on the panel) switches the panel live.
window.addEventListener("hashchange", () => {
  const id = screenId(location.hash.replace("#", ""));
  if (id !== screen && SCREENS.some((x) => x.id === id)) setScreen(id);
});

function setScreen(id) {
  screen = id;
  controlsOpen = false;
  safeSet("haven.screen", id);
  try { history.replaceState(null, "", `#${id}`); } catch { /* not allowed here */ }
  room = "all";
  render();
  renderLibrary();
}

// All controls: the full room-by-room view, over whichever screen is showing.
function openControls() {
  controlsOpen = true;
  render();
  window.scrollTo?.(0, 0);
  $("#controls-close").focus();
}
function closeControls() {
  controlsOpen = false;
  render();
  window.scrollTo?.(0, 0);
}
$("#controls-close").addEventListener("click", closeControls);
document.addEventListener("click", (e) => { if (e.target.closest?.(".controls-open")) openControls(); });

// Small schematic of each layout for the library cards.
const SCHEMATIC = {
  "command": [[0, 0, 1, 12, "s"], [1, 0, 11, 1.5], [1, 2, 2.2, 2.5], [3.4, 2, 2.2, 2.5], [5.8, 2, 2.2, 2.5], [8.2, 2, 3.8, 2.5], [1, 5, 3.6, 4], [4.8, 5, 3.4, 4, "s"], [8.4, 5, 3.6, 4], [1, 9.4, 2.6, 2.6], [3.8, 9.4, 2.6, 2.6], [6.6, 9.4, 5.4, 2.6]],
  "wallpaper": [[0, 0, 3, 5, "s"], [0, 5, 3, 3], [0, 8, 3, 4], [3, 0, 3, 4], [3, 4, 3, 8], [6, 0, 3, 7], [6, 7, 3, 5], [9, 0, 3, 5], [9, 5, 3, 7]],
  "glass": [[0, 0, 1.4, 12], [1.6, 0.4, 5, 2.4, "s"], [1.6, 3.2, 2.6, 6.6], [4.4, 3.2, 3, 3.2], [4.4, 6.6, 3, 3.2], [7.6, 3.2, 2.2, 6.6], [10, 2, 2, 5, "s"], [1.6, 10.2, 8.2, 1.6, "s"]],
  "wall": [[0, 0, 12, 1.6, "s"], [0, 2, 3, 2.4], [3, 2, 3, 2.4], [6, 2, 3, 2.4], [9, 2, 3, 2.4], [0, 4.8, 12, 1.6], [0, 6.8, 6, 5.2], [6.2, 6.8, 5.8, 1.8], [6.2, 8.8, 5.8, 3.2, "s"]],
  "evening": [[0, 0, 3, 4.6, "s"], [3.2, 0, 3, 4.6], [6.4, 0, 3, 4.6], [9.6, 0, 2.4, 4.6], [0, 5.4, 2, 2.6], [2, 5.4, 2, 2.6], [4, 5.4, 2, 2.6], [6, 5.4, 2, 2.6], [8, 5.4, 2, 2.6], [10, 5.4, 2, 2.6], [0, 8.8, 3, 3.2], [3, 8.8, 3, 3.2], [6, 8.8, 3, 3.2], [9, 8.8, 3, 3.2]],
  "aurora": [[0, 0, 4, 2.4, "s"], [0, 2.8, 4, 4.6], [0, 7.8, 4, 4.2], [4.2, 0, 3.8, 3], [4.2, 3.4, 3.8, 4.6, "s"], [4.2, 8.4, 3.8, 3.6], [8.2, 0, 3.8, 5], [8.2, 5.4, 3.8, 6.6]],
  "console": [[0, 0, 12, 1.2], [0, 1.6, 4, 1.6, "s"], [4, 1.6, 4, 1.6, "s"], [8, 1.6, 4, 1.6, "s"], [0, 3.6, 3, 8.4], [3.2, 3.6, 2.6, 4], [3.2, 7.8, 2.6, 4.2], [6, 3.6, 3.4, 4.2], [6, 8, 3.4, 4], [9.6, 3.6, 2.4, 4.2], [9.6, 8, 2.4, 4]],
  "classic": [[2, 0, 4, 1.6, "s"], [2, 2, 4, 3.6], [2, 6, 4, 3.4], [2, 9.8, 4, 2.2], [6.2, 0, 3.8, 2.2], [6.2, 2.6, 3.8, 4.6], [6.2, 7.6, 3.8, 2.4], [6.2, 10.4, 3.8, 1.6]],
  "neon": [[0, 0, 4, 1.8], [0, 2.2, 4, 2.6], [0, 5.2, 4, 4.4, "s"], [0, 10, 4, 2], [4.2, 0, 3.8, 2], [4.2, 2.4, 3.8, 1.6], [4.2, 4.4, 3.8, 4.2, "s"], [4.2, 9, 3.8, 3], [8.2, 0, 3.8, 2.4], [8.2, 2.6, 3.8, 2.4], [8.2, 5.2, 3.8, 2.6], [8.2, 8.2, 3.8, 3.8]],
  "lagoon": [[0, 0, 12, 1], [0, 1.4, 3.8, 7.6, "s"], [0, 9.4, 1.8, 2.6], [2, 9.4, 1.8, 2.6], [4, 1.4, 4, 6.8, "s"], [4, 8.6, 4, 3.4], [8.2, 1.4, 1.8, 6.6], [10.2, 1.4, 1.8, 6.6], [8.2, 8.4, 3.8, 3.6]],
};
function schematic(id) {
  const box = el("div", { class: "schematic", "aria-hidden": "true" });
  for (const [x, y, w, h, kind] of SCHEMATIC[id]) {
    box.append(el("span", { class: kind === "s" ? "hl" : "", style: `left:${(x / 12) * 100}%;top:${(y / 12) * 100}%;width:calc(${(w / 12) * 100}% - 4px);height:calc(${(h / 12) * 100}% - 4px)` }));
  }
  return box;
}

function renderLibrary() {
  const select = $("#panel-room");
  select.replaceChildren(el("option", { value: "" }, "Whole home (no single room)"),
    ...state.rooms.filter((r) => r.devices.length).map((r) => el("option", { value: r.id }, r.name)));
  select.value = panelRoom;
  $("#library-list").replaceChildren(...SCREENS.map((x) => el("li", { class: `library-card${x.id === screen ? " current" : ""}` },
    schematic(x.id),
    el("div", { class: "library-text" },
      el("h3", {}, x.name),
      el("p", { class: "best" }, `Best for: ${x.best}`),
      el("p", { class: "muted small" }, x.about)),
    el("button", { class: x.id === screen ? "ghost" : "primary", "aria-pressed": String(x.id === screen), "data-screen": x.id, onclick: () => setScreen(x.id) },
      x.id === screen ? "In use" : "Use this screen"))));
}

// Screens → Haven's voice: one choice for the whole home, saved on the home server.
function renderVoiceChoice() {
  const v = state?.voice;
  const box = $(".library-voice");
  box.hidden = !v?.choices?.length;
  if (box.hidden) return;
  const sel = $("#voice-choice");
  sel.replaceChildren(...(v.choice ? [] : [el("option", { value: "" }, "A custom voice (set by your installer)")]),
    ...v.choices.map((c) => el("option", { value: c.id }, `${c.name} · ${c.about}`)));
  sel.value = v.choice || "";
  $("#voice-choice-note").textContent = v.provider === "elevenlabs"
    ? "One voice for the whole home: every panel speaks with it."
    : "Saved for the whole home. These natural voices play once the home server has the premium voice; until then panels use the tablet's own voice.";
}
$("#voice-choice").addEventListener("change", async (e) => {
  const r = await api("/api/voice", { voice: e.target.value });
  if (!r?.choices) { showHint(r?.error || "That voice couldn't be saved. Try again."); renderVoiceChoice(); return; }
  state.voice = r;
  renderVoiceChoice();
  const name = r.choices.find((c) => c.id === r.choice)?.name;
  showHint(`Haven will speak as ${name} on every panel.`);
  if (speakAloud) voice.speak("Hello. This is how I'll sound in your home.");
});

function openLibrary() {
  renderLibrary();
  renderVoiceChoice();
  const d = $("#library");
  if (d.showModal) d.showModal(); else d.setAttribute("open", "");
}
$("#library-close").addEventListener("click", () => $("#library").close ? $("#library").close() : $("#library").removeAttribute("open"));
$("#panel-room").addEventListener("change", (e) => {
  panelRoom = e.target.value;
  safeSet("haven.panelRoom", panelRoom);
  if (state) render(); // the bedroom photo and "Lights off" follow the room right away
  showHint(panelRoom ? `This panel is in the ${roomName(panelRoom).toLowerCase()}. "Turn off the lights" here means that room.` : "This panel covers the whole home.");
});
document.addEventListener("click", (e) => { if (e.target.closest?.(".screens-open")) openLibrary(); });

// ---------- building blocks for the other screens ----------
const block = (title, cls, ...children) => el("section", { class: `xcard ${cls || ""}` }, title ? el("h2", {}, title) : null, ...children);

function asksBlock() {
  const cards = [...suggestionCards(state.suggestions || []), ...state.pending.map((p) => askCard("confirm", "Needs your OK", `${p.summary}?`, [
    el("button", { onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: false }).then(showResult) }, "Cancel"),
    el("button", { class: "primary", onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: true }).then(showResult) }, "Confirm"),
  ]))];
  return cards.length ? el("div", { class: "stack alt-asks" }, ...cards) : null;
}

// The security card, laid out the way alarm panels are: one status line (ready, or what's
// open), the mode the house is in, then every zone grouped as entry points, water and
// motion. State is a word and a dot, never a color alone.
const SEC_ICON = { garage: "garage", lock: "lock", contact: "door", water_valve: "water", leak: "water", motion: "motion" };
function secState(d) {
  const s = d.state;
  switch (d.type) {
    case "lock": return s.locked ? ["ok", "Locked"] : ["warn", "Unlocked"];
    case "garage": return s.door === "closed" ? ["ok", "Closed"] : ["warn", s.door[0].toUpperCase() + s.door.slice(1)];
    case "contact": return s.open ? ["warn", "Open"] : ["ok", "Closed"];
    case "water_valve": return s.open ? ["ok", "On"] : ["warn", "Shut off"];
    case "leak": return s.wet ? ["bad", "Leak"] : ["ok", "Dry"];
    case "motion": return s.motion ? ["info", "Motion now"] : ["ok", s.lastMotion ? `Clear · ${timeAgo(s.lastMotion)}` : "Clear"];
    default: return ["ok", describe(d)];
  }
}
function secRow(d) {
  const s = d.state, [level, word] = secState(d);
  let action = null;
  if (d.type === "garage") action = [s.door === "closed" ? "Open" : "Close", () => send(d.id, { door: s.door === "closed" ? "open" : "closed" })];
  if (d.type === "lock") action = [s.locked ? "Unlock" : "Lock", () => send(d.id, { locked: !s.locked })];
  if (d.type === "water_valve") action = [s.open ? "Shut off" : "Turn on", () => send(d.id, { open: !s.open })];
  const room = state.rooms.find((r) => r.id === d.room);
  return el("li", { class: `sec-item${isAlert(d) ? " alert" : ""}`, "data-device": d.id, "data-level": level },
    el("span", { class: "tile-icon" }, svg(ICON[SEC_ICON[d.type]] || ICON.shield)),
    el("div", {}, el("span", { class: "ll-name" }, d.name.replace(/ (Lock|Leak Sensor|Motion)$/, "")), el("span", { class: "ll-state" }, room && !d.name.includes(room.name) ? room.name : "")),
    el("span", { class: `sec-state ${level}` }, el("i", { "aria-hidden": "true" }), word),
    action ? el("button", { class: d.type === "water_valve" && s.open ? "danger" : "", onclick: action[1] }, action[0]) : null);
}
// The mode the house is in, from who's home and the hour on the home's own clock: Home, Night
// or Away. Haven sets it; nobody arms or disarms anything.
function homeMode() {
  const away = state.people.length > 0 && state.people.every((p) => !p.home);
  let h = new Date().getHours();
  try { h = Number(new Intl.DateTimeFormat("en-US", { timeZone: state.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date())); } catch { /* no time zone: the device's hour */ }
  const night = h >= 22 || h < 6;
  return away ? ["away", "Away", "Guarding the house"] : night ? ["night", "Night", "Watching the doors"] : ["home", "Home", "Watching"];
}
// The security card's verdict in one place, so every screen says the same thing.
function secSummary() {
  const entry = [...byType("lock"), ...byType("contact"), ...byType("garage")];
  const open = entry.filter(isAlert), wet = byType("leak").filter((l) => l.state.wet);
  const level = wet.length ? "bad" : open.length || !byType("water_valve").every((v) => v.state.open) ? "warn" : "ok";
  const headline = wet.length ? `Leak at ${wet.map((w) => w.name.replace(/ Leak Sensor$/, "")).join(", ")}`
    : open.length ? `Not ready · ${open.map((d) => `${d.name.replace(/ Lock$/, "")} ${secState(d)[1].toLowerCase()}`).join(", ")}`
    : "Ready · every entry point secured";
  const short = wet.length ? "Leak" : open.length ? `Not ready · ${open.length} open` : level === "warn" ? "Ready · water off" : "Ready";
  return { entry, open, wet, level, headline, short, mode: homeMode() };
}
function securityBlock() {
  const { entry, open, level, headline, mode } = secSummary();
  const water = [...byType("water_valve"), ...byType("leak")];
  const motion = byType("motion");
  const group = (title, items) => items.length ? el("div", { class: "sec-group" }, el("h3", {}, title), el("ul", { class: "sec-list" }, ...items.map(secRow))) : null;
  return block(null, "security-card",
    el("div", { class: "sec-head", "data-level": level },
      el("div", { class: "sec-title" }, el("span", { class: "tile-icon" }, svg(ICON.shield)), el("h2", {}, "Security"), el("span", { class: `sec-mode mode-${mode[0]}` }, el("b", {}, mode[1]), ` · ${mode[2]}`)),
      el("p", { class: "sec-headline" }, el("i", { class: `sec-dot ${level}`, "aria-hidden": "true" }), headline),
      el("div", { class: "sec-strip", role: "img", "aria-label": `${entry.length - open.length} of ${entry.length} entry points secured` },
        ...entry.map((d) => el("span", { class: `sec-seg ${secState(d)[0]}`, title: `${d.name}: ${secState(d)[1]}` }))),
      level === "ok" ? null : el("button", { class: "primary", onclick: lockUp }, "Lock up")),
    group("Entry points", entry), group("Water", water), group("Motion", motion));
}

// ---------- cameras ----------
// Cameras come from Home Assistant through the home server, which holds its key: pictures are
// fetched with the owner token and shown from memory, and live video plays in the viewer.
// With no cameras (the demo, a home without them) the card says so: never a placeholder feed.
const camPictures = new Map(); // "/api/cameras/…" -> { url, at }
const CAM_REFRESH_MS = 10_000;
async function cameraPicture(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`camera ${res.status}`);
  return URL.createObjectURL(await res.blob());
}
function camStatus(c) {
  if (c.sample) return ["ok", "Sample picture"];
  const recent = (iso, mins) => iso && Date.now() - Date.parse(iso) < mins * 60_000;
  if (!c.online) return ["warn", "Offline"];
  if (recent(c.lastRing, 10)) return ["info", `Doorbell rang ${timeAgo(c.lastRing)}`];
  if (recent(c.lastMotion, 10)) return ["info", `Motion ${timeAgo(c.lastMotion)}`];
  return ["ok", c.doorbell ? "Doorbell · watching" : "Watching"];
}
function camerasBlock() {
  if (!cams?.available) {
    return block("Cameras", "cameras-card", el("p", { class: "muted cam-none" }, cams?.reason || "No cameras connected."));
  }
  const name = (id) => cams.cameras.find((c) => c.id === id)?.name || id;
  const recent = cams.recent.slice(0, 4);
  return block("Cameras", "cameras-card",
    el("ul", { class: "cam-grid" }, ...cams.cameras.map((c) => {
      const [level, word] = camStatus(c);
      const pic = c.sample || camPictures.get(`/api/cameras/${c.id}/snapshot`)?.url;
      return el("li", {},
        el("button", { type: "button", class: "cam-tile", "data-camera": c.id, onclick: () => openCamera(c.id) },
          el("span", { class: "cam-frame" },
            el("img", { alt: "", ...(c.sample ? { src: c.sample } : { "data-cam-src": `/api/cameras/${c.id}/snapshot`, ...(pic ? { src: pic } : { hidden: "" }) }) }),
            pic ? null : el("span", { class: "cam-wait" }, c.online ? "Loading picture" : "No picture")),
          el("span", { class: "cam-name" }, c.name),
          el("span", { class: `sec-state ${level}` }, el("i", { "aria-hidden": "true" }), word)));
    })),
    recent.length ? el("div", { class: "cam-recent" }, el("h3", {}, "Saved on the home server"),
      el("ul", {}, ...recent.map((r) => {
        const pic = camPictures.get(`/api/cameras/stills/${r.id}`)?.url;
        const when = new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        return el("li", {}, el("button", { type: "button", class: "cam-still", "data-still": r.id, onclick: () => openCamera(r.camera, { still: r }) },
          el("img", { "data-cam-src": `/api/cameras/stills/${r.id}`, "data-keep": "", alt: "", ...(pic ? { src: pic } : { hidden: "" }) }),
          el("span", {}, `${r.kind === "doorbell" ? "Doorbell" : "Motion"} · ${name(r.camera)}`), el("span", { class: "muted" }, when)));
      }))) : null);
}
// Fill every camera picture on screen: snapshots every 10 seconds while the panel is visible,
// saved stills once (they never change).
let camLoading = false;
async function loadCameraPictures() {
  if (demo || !cams?.available || camLoading || document.hidden) return;
  camLoading = true;
  try {
    const paths = new Set([...document.querySelectorAll("#alt img[data-cam-src]")].map((i) => i.dataset.camSrc));
    for (const path of paths) {
      const had = camPictures.get(path);
      const keep = path.includes("/stills/");
      if (had && (keep || Date.now() - had.at < CAM_REFRESH_MS)) continue;
      let url = null;
      try { url = await cameraPicture(path); } catch { /* offline camera: keep the last picture */ }
      if (!url) continue;
      camPictures.set(path, { url, at: Date.now() });
      for (const img of document.querySelectorAll(`img[data-cam-src="${CSS.escape(path)}"]`)) {
        img.src = url; img.hidden = false; img.nextElementSibling?.classList.contains("cam-wait") && img.nextElementSibling.remove();
      }
      if (had) setTimeout(() => URL.revokeObjectURL(had.url), 1000);
    }
  } finally {
    camLoading = false;
  }
}
setInterval(loadCameraPictures, CAM_REFRESH_MS);

// The viewer: live video while it's open (motion JPEG through the home server), or a saved still.
// A camera without live video gets a fresh picture every 2 seconds instead, and says so.
const camView = { timer: 0, url: null };
function stopCameraView() {
  clearInterval(camView.timer);
  const img = $("#camera-img");
  img.onerror = null;
  img.removeAttribute("src"); // ends the live stream
  if (camView.url) { URL.revokeObjectURL(camView.url); camView.url = null; }
}
async function openCamera(id, { still = null } = {}) {
  const c = cams?.cameras.find((x) => x.id === id);
  if (!c) return;
  stopCameraView();
  const img = $("#camera-img"), dlg = $("#camera-view");
  $("#camera-title").textContent = c.name;
  $("#camera-note").textContent = "";
  if (!dlg.open) dlg.showModal();
  if (c.sample) { // the demo's stand-in: a still, never presented as live
    img.alt = `${c.name}, sample picture`;
    img.src = c.sample;
    $("#camera-state").textContent = "Sample picture";
    $("#camera-note").textContent = "The demo house has no cameras, so this is a still from the film of the model home. A real home shows its own cameras here, live.";
    return;
  }
  const showPicture = async (path) => {
    const url = await cameraPicture(path);
    if (camView.url) URL.revokeObjectURL(camView.url);
    camView.url = url;
    img.src = url;
  };
  if (still) {
    $("#camera-state").textContent = `${still.kind === "doorbell" ? "Doorbell" : "Motion"} · ${new Date(still.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} · saved picture`;
    img.alt = `${c.name}, saved picture`;
    showPicture(`/api/cameras/stills/${still.id}`).catch(() => { $("#camera-note").textContent = "That picture is no longer on the home server."; });
    return;
  }
  img.alt = `${c.name}, live view`;
  $("#camera-state").textContent = "Live";
  img.onerror = () => {
    img.onerror = null;
    $("#camera-state").textContent = "A new picture every 2 seconds";
    $("#camera-note").textContent = "This camera has no live video right now, so Haven shows a fresh picture every 2 seconds.";
    const tick = () => showPicture(`/api/cameras/${id}/snapshot`).catch(() => { $("#camera-note").textContent = `${c.name} isn't answering. Check that it has power and is online.`; });
    tick();
    camView.timer = setInterval(tick, 2000);
  };
  img.src = `/api/cameras/${encodeURIComponent(id)}/live?token=${encodeURIComponent(token)}`;
}
$("#camera-close").addEventListener("click", () => $("#camera-view").close());
$("#camera-view").addEventListener("close", stopCameraView);
document.addEventListener("visibilitychange", () => { if (document.hidden && $("#camera-view").open) $("#camera-view").close(); else loadCameraPictures(); });

// Kept across redraws (and shared by the screens that show the house) so a pinch or drag in
// progress, and the zoom, survive the live house updating.
const altMapBox = el("div", { class: "map alt-map" });

// The house view, from the gallery in Screens → House view (haven.houseView): live 3D
// ("cgi", the default: the real model of this home, web/holo.js), the hologram, or one of the
// photoreal AI renders (web/house-stills/gallery.js), shown as a picture with every room a
// button. A render shows this home only, so for any other home (Screens → Home style, or a
// home it wasn't made for) the panel uses live 3D instead. An old "model" choice reads as
// "cgi". Without 3D at all, this home's pre-rendered CGI picture stands in ("still" forces it;
// tests use it), and only a different home without 3D falls back to the drawn model.
const savedView = safeGet("haven.houseView");
let houseViewPref = HOUSE_RENDERS.some((r) => r.id === savedView) ? savedView : ({ hologram: "hologram", still: "still" })[savedView] || "cgi";
// Which home the house view shows: this home (from its config), or a sample
// home in another style (Screens → Home style) with this home's devices.
let homePreview = safeGet("haven.homePreview") || "";
function currentHome() {
  const sample = SAMPLE_HOMES.find((x) => x.id === homePreview);
  if (!sample) return { building: state.building || null, rooms: state.rooms };
  return { building: sample.building, rooms: sample.rooms, sample };
}
let explorerFloor = null;
function houseView(box, { selected, onSelect, onExpand, explorer = false }) {
  const home = currentHome();
  box.dataset.homeSig = homeSignature(home);
  const thisHome = HOUSE_STILLS?.sig === box.dataset.homeSig;
  const chosen = thisHome && HOUSE_RENDERS.find((r) => r.id === houseViewPref);
  if (chosen) return houseStill(box, chosen, { selected, onSelect, onExpand });
  const holo = houseViewPref !== "still" && hologramSupported() && !box.__holo?.failed;
  if (holo) {
    let h = box.__holo;
    if (!h) h = box.__holo = createHologram(box, { look: houseViewPref === "hologram" ? "hologram" : "cgi", onSelect, onExpand, explorer, describe, fallback: () => { if (state) render(); }, onBuilt: explorer ? renderExplorerFloors : null });
    h.opts.onSelect = onSelect;
    h.update({ building: home.building, rooms: home.rooms, devices: allDevices(), selected });
    if (box.__lastSel !== undefined && box.__lastSel !== selected && h.ready) selected ? h.focusRoom(selected) : h.reset();
    box.__lastSel = selected;
    $("#explorer").classList.toggle("holo-mode", Boolean($("#explorer-map").__holo && !$("#explorer-map").__holo.failed));
    return h;
  }
  const still = thisHome && HOUSE_STILLS[moodNow()];
  if (still) return houseStill(box, still, { selected, onSelect, onExpand });
  // The drawn model shows one floor at a time: the explorer's, the selected
  // room's, or the ground floor. It draws rectangles, so an L-shaped or odd
  // room shows its largest rectangle rather than covering its neighbours.
  const hm = normalizeHome(home);
  const floor = (explorer && explorerFloor) || hm.rooms.find((r) => r.id === selected)?.floor || hm.floors.find((f) => f.level === 0)?.id || hm.floors[0]?.id;
  const flat = hm.rooms.filter((r) => r.floor === floor).map((r) => ({ id: r.id, name: r.name, kind: r.kind, plan: r.shape ? mainRect(r.poly) : r.bbox }));
  renderMap(box, { rooms: flat, devicesIn: (id) => allDevices().filter((d) => d.room === id), selected, onSelect, pinInfo });
  if (explorer) renderExplorerFloors(hm, floor);
  return enableMapZoom(box, { onExpand, wheel: explorer });
}

// The house as a pre-rendered CGI picture, with each room a button where it sits in the
// picture: the same tags, states and taps as the 3D view, for panels that can't draw 3D.
function houseStill(box, still, { selected, onSelect, onExpand }) {
  box.classList.add("house-still");
  box.dataset.mood = still.mood || moodNow();   // a render carries its own day or evening
  let wrap = box.querySelector(":scope > .still-wrap");
  if (!wrap || wrap.dataset.src !== still.src) {
    wrap?.remove();
    wrap = el("div", { class: "still-wrap" }, el("img", { src: still.src, alt: "", draggable: "false" }));
    wrap.dataset.src = still.src;
    wrap.style.setProperty("--ratio", String(still.w / still.h));
    box.style.background = still.bg || "";
    box.prepend(wrap);
  }
  if (onExpand && !box.querySelector(":scope > .still-expand")) {
    box.append(el("button", { type: "button", class: "still-expand", "aria-label": "Open the house full screen", onclick: onExpand }, "Full screen"));
  }
  wrap.querySelectorAll(".map-room").forEach((b) => b.remove());
  for (const r of state.rooms) {
    const at = still.rooms[r.id];
    if (!at) continue;
    const ds = allDevices().filter((d) => d.room === r.id);
    const alert = ds.find((d) => (d.type === "leak" && d.state.wet) || (d.type === "water_valve" && !d.state.open) || (d.type === "garage" && d.state.door !== "closed"));
    const watch = !alert && ds.some((d) => (d.type === "lock" && !d.state.locked) || (d.type === "contact" && d.state.open));
    const lights = ds.filter((d) => d.type === "light" && d.state.on).length;
    const th = ds.find((d) => d.type === "thermostat");
    const note = alert ? (alert.type === "garage" ? "Door open" : alert.type === "leak" ? "Leak" : "Water off") : watch ? "Unlocked or open" : lights ? `${lights} light${lights === 1 ? "" : "s"} on` : "";
    const text = [note, th ? `${Math.round(th.state.current)}°` : ""].filter(Boolean).join(" · ");
    const name = r.name.replace(/ Room$/, "");
    const b = el("button", {
      type: "button", class: `holo-tag map-room${alert ? " alert" : ""}${lights ? " lit" : ""}${selected === r.id ? " selected" : ""}`,
      "data-room": r.id, "data-level": alert ? "FAULT" : watch ? "WATCH" : lights ? "LIT" : "OK",
      "aria-pressed": String(selected === r.id), "aria-label": [r.name, text].filter(Boolean).join(", "),
      onclick: () => onSelect?.(r.id),
    }, el("b", {}, name), text ? el("span", {}, text) : null);
    b.style.left = `${at[0] * 100}%`;
    b.style.top = `${at[1] * 100}%`;
    wrap.append(b);
  }
  return (box.__still ||= { update: null, focusRoom() {}, reset() {} });
}

// A device's pin on the zoomed-in house model.
const PIN_ICON = { light: "light", fan: "fan", thermostat: "climate", lock: "lock", garage: "garage", water_valve: "water", water_heater: "heater", leak: "water", contact: "door" };
function pinInfo(d) {
  const icon = ICON[PIN_ICON[d.type]];
  if (!icon) return null;
  const s = d.state;
  const alert = (d.type === "leak" && s.wet) || (d.type === "lock" && !s.locked) || (d.type === "garage" && s.door !== "closed") || (d.type === "contact" && s.open) || (d.type === "water_valve" && !s.open);
  const on = !alert && ((d.type === "light" && s.on) || (d.type === "fan" && s.on) || (d.type === "thermostat" && s.hvac && s.hvac !== "idle" && s.hvac !== "off"));
  return { icon, state: alert ? "alert" : on ? "on" : "", text: `${d.name}: ${describe(d)}` };
}

// ---------- full-screen house explorer ----------
// The model filling the screen: pinch, drag and the wheel zoom and look
// around; tapping a room flies the camera into it and opens its controls.
let explorerRoom = null;
function openExplorer() {
  explorerRoom = null;
  const dlg = $("#explorer");
  if (!dlg.open) dlg.showModal();
  renderExplorer();
  const box = $("#explorer-map");
  (box.__holo && !box.__holo.failed ? box.__holo : box.__zoom)?.reset();
}
function renderExplorer() {
  const dlg = $("#explorer");
  if (!dlg.open || !state) return;
  const box = $("#explorer-map");
  const z = houseView(box, { selected: explorerRoom, onSelect: (id) => selectExplorerRoom(explorerRoom === id ? null : id), explorer: true });
  if (z && "showRoof" in z) $("#explorer-roof").setAttribute("aria-pressed", String(z.showRoof));
  // The picture fallback can't be turned or zoomed, so the hint says only what it does.
  $("#explorer-hint").textContent = box.classList.contains("house-still") ? "Tap a room for its controls." : "Drag to look around from any angle, pinch or use + and \u2212 to zoom, and tap a room for its controls.";
  const r = explorerRoom && state.rooms.find((x) => x.id === explorerRoom);
  const aside = $("#explorer-room");
  aside.hidden = !r;
  $("#explorer").classList.toggle("has-room", Boolean(r));
  if (r) {
    const card = roomCard(r);
    aside.replaceChildren(
      el("div", { class: "explorer-room-head" },
        el("button", { type: "button", class: "ghost explorer-back", onclick: () => selectExplorerRoom(null) }, "← Whole house")),
      card);
  }
  return z;
}
function selectExplorerRoom(id) {
  explorerRoom = id;
  const z = renderExplorer();
  // The hologram flies on its own when the selection changes; the drawn model needs telling.
  if (!z || z.update) return;
  if (id) z.focusRoom(id); else z.reset();
}
// Floor buttons in the explorer, for homes with more than one floor.
// `shown` is set by the drawn model, which shows one floor at a time and so has no "All floors".
function renderExplorerFloors(hm, shown) {
  const bar = $("#explorer-floors");
  const floors = hm?.floors || [];
  bar.hidden = floors.length < 2;
  if (floors.length < 2) { bar.replaceChildren(); return; }
  if (explorerFloor && !floors.some((f) => f.id === explorerFloor)) explorerFloor = null;
  const pick = (id) => {
    explorerFloor = id;
    const h = $("#explorer-map").__holo;
    if (h && !h.failed) h.setFloor(id); else renderExplorer();
    if (h && !h.failed) renderExplorerFloors(hm);
  };
  const current = shown === undefined ? explorerFloor : shown;
  bar.replaceChildren(...[...(shown === undefined ? [{ id: null, name: "All floors" }] : []), ...[...floors].reverse()].map((f) =>
    el("button", { type: "button", "data-floor": f.id ?? "", "aria-pressed": String(current === f.id), onclick: () => pick(f.id) }, f.name)));
}
// Screens → Home style: preview the house view as another kind of home.
function renderHomePreview() {
  const sel = $("#home-preview");
  sel.replaceChildren(el("option", { value: "" }, "This home"), ...SAMPLE_HOMES.map((x) => el("option", { value: x.id }, x.label)));
  sel.value = homePreview;
  const sample = SAMPLE_HOMES.find((x) => x.id === homePreview);
  $("#home-preview-note").textContent = sample ? `${sample.about} Your devices stay in their rooms.` : "The house as it's described in this home's plan.";
}
$("#home-preview").addEventListener("change", (e) => {
  homePreview = e.target.value;
  safeSet("haven.homePreview", homePreview);
  explorerFloor = null;
  renderHomePreview();
  if (state) render();
  const sample = SAMPLE_HOMES.find((x) => x.id === homePreview);
  showHint(sample ? `Showing a ${sample.label} home. Choose "This home" to go back.` : "Showing this home.");
});
renderHomePreview();
$("#explorer-roof").addEventListener("click", (e) => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(on));
  $("#explorer-map").__holo?.setRoof?.(on);
});

// Hologram views in the explorer: 3D, top, front, side, and a slow auto-orbit.
for (const b of document.querySelectorAll("#explorer [data-hview]")) b.addEventListener("click", () => {
  const h = $("#explorer-map").__holo;
  if (!h?.ready) return;
  if (explorerRoom) { explorerRoom = null; renderExplorer(); }
  h.setView(b.dataset.hview);
  for (const x of document.querySelectorAll("#explorer [data-hview]")) x.setAttribute("aria-pressed", String(x === b));
});
$("#explorer-spin").addEventListener("click", (e) => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(on));
  $("#explorer-map").__holo?.setSpin?.(on);
});
$("#explorer-close").addEventListener("click", () => $("#explorer").close());
$("#explorer").addEventListener("close", () => {
  explorerRoom = null;
  $("#explorer").classList.remove("has-room");
  $("#explorer-map > svg.map-svg")?.remove();
  $("#explorer-map").__holo?.setSpin?.(false);
  explorerFloor = null;
  $("#explorer-map").__holo?.setFloor?.(null);
  $("#explorer-spin").setAttribute("aria-pressed", "false");
});
// Screens → House view: a gallery of every view, each with its picture. Reloads, so each
// panel builds only the one it uses.
{
  const views = [
    { id: "cgi", name: "Live 3D", note: "Turns and zooms", thumb: HOUSE_THUMBS.cgi },
    ...HOUSE_RENDERS.map((r) => ({ id: r.id, name: r.name, note: r.mood === "evening" ? "Photoreal, evening" : "Photoreal, daylight", thumb: r.thumb })),
    { id: "hologram", name: "Hologram", note: "Turns and zooms", thumb: HOUSE_THUMBS.hologram },
  ];
  $("#house-gallery").replaceChildren(...views.map((v) => el("button", { type: "button", class: "house-pick", "data-house-view": v.id },
    el("img", { src: v.thumb, alt: "", width: "240", height: "136", loading: "lazy" }),
    el("span", { class: "house-pick-name" }, v.name), el("span", { class: "house-pick-note" }, v.note))));
}
for (const b of document.querySelectorAll("[data-house-view]")) {
  b.setAttribute("aria-pressed", String(b.dataset.houseView === houseViewPref));
  b.addEventListener("click", () => {
    if (b.dataset.houseView === houseViewPref) return;
    safeSet("haven.houseView", b.dataset.houseView);
    location.reload();
  });
}

function bigButton(label, sub, onclick, cls = "") {
  return el("button", { class: `big-btn ${cls}`, onclick }, el("span", { class: "big-label" }, label), sub ? el("span", { class: "big-sub" }, sub) : null);
}

function roomCard(r) {
  const devs = allDevices().filter((d) => d.room === r.id);
  const controls = devs.filter((d) => CONTROL_TYPES.has(d.type));
  const sensors = devs.filter((d) => !CONTROL_TYPES.has(d.type));
  const th = devs.find((d) => d.type === "thermostat");
  const btn = (d) => {
    const s = d.state;
    const icon = { light: ICON.light, fan: ICON.fan, garage: ICON.garage, lock: ICON.lock, water_valve: ICON.water, water_heater: ICON.heater, thermostat: ICON.climate }[d.type];
    const fire = {
      light: () => send(d.id, { on: !s.on }), fan: () => send(d.id, { on: !s.on }),
      garage: () => send(d.id, { door: s.door === "closed" ? "open" : "closed" }), lock: () => send(d.id, { locked: !s.locked }),
      water_valve: () => send(d.id, { open: !s.open }), water_heater: () => send(d.id, { on: !s.on }),
    }[d.type];
    if (d.type === "thermostat") {
      return el("div", { class: "room-dev thermo", "data-device": d.id },
        el("span", { class: "tile-icon" }, svg(icon)),
        el("span", { class: "rd-name" }, `${targetOf(d)}°F`),
        el("span", { class: "rd-state" }, `${s.current}°F now`),
        el("div", { class: "stepper" }, el("button", { "aria-label": "Cooler by 1°F", onclick: () => stepTarget(d, -1) }, "−"), el("button", { "aria-label": "Warmer by 1°F", onclick: () => stepTarget(d, 1) }, "+")));
    }
    const on = (d.type === "light" || d.type === "fan" || d.type === "water_heater") && s.on;
    return el("button", { class: `room-dev${on ? " on" : ""}${isAlert(d) ? " alert" : ""}`, "data-device": d.id, style: d.type === "light" && s.on ? `--glow:${s.brightness / 100}` : undefined, "aria-pressed": d.type === "light" || d.type === "fan" ? String(s.on) : null, "aria-label": `${d.name}: ${describe(d)}`, onclick: fire },
      el("span", { class: "tile-icon" }, svg(icon)),
      el("span", { class: "rd-name" }, d.name.replace(new RegExp(`^${r.name} `), "").replace(/^Main /, "")),
      el("span", { class: "rd-state" }, describe(d)));
  };
  return el("section", { class: "xcard room-card", "data-room": r.id },
    el("div", { class: "row-between" }, el("h2", {}, r.name), th ? el("span", { class: "muted small" }, `${th.state.current}°F`) : null),
    el("div", { class: "room-devs" }, ...controls.map(btn)),
    sensors.length ? el("p", { class: "sensors" }, ...sensors.map((d) => el("span", { class: isAlert(d) ? "alert" : "" }, `${d.name.replace(new RegExp(`^${r.name} `), "")}: ${describe(d)}`))) : null);
}

// ---------- Haven's agents (on the Glass screen) ----------
// Each glows while it's working; the lines between them light up when one real event involves
// several of them at once (a scene, "I'm leaving", an automation), so people can see the house
// coordinating instead of guessing.
const AGENT_OF = { light: "lighting", climate: "climate", fan: "climate", water_heater: "climate", lock: "security", garage: "security", valve: "security" };
const agentSync = { last: {}, until: 0, timer: 0 };
function noteAgents(e) {
  const now = Date.now();
  if (e.type === "action") {
    const a = AGENT_OF[String(e.device).split(".")[0]];
    if (a) { agentSync.last[a] = now; agentSync.last.energy = now; }
  }
  if (e.type !== "action" && e.type !== "scene") return;
  const recent = ["lighting", "climate", "security"].filter((a) => now - (agentSync.last[a] || 0) < 3000);
  if (e.type === "scene" || recent.length >= 2) agentSync.until = now + 4000;
  clearTimeout(agentSync.timer);
  agentSync.timer = setTimeout(() => { if (screen === "glass" && !controlsOpen && state) renderAlt(); }, 6100);
}

function agentRow() {
  const now = Date.now();
  const lit = byType("light").filter((l) => l.state.on).length;
  const th = byType("thermostat")[0];
  const fans = byType("fan").filter((f) => f.state.on).length;
  const list = issues();
  const away = state.people.length > 0 && state.people.every((p) => !p.home);
  const running = energy ? energy.breakdown.filter((p) => !p.name.startsWith("Always-on")).length : 0;
  const agents = [
    ["lighting", "Lighting", ICON.light, lit ? `${lit} on` : "All off", lit > 0],
    ["climate", "Climate", ICON.climate, !th ? "No thermostat" : th.state.hvac === "heating" ? `Heating to ${th.state.target}°` : th.state.hvac === "cooling" ? `Cooling to ${th.state.target}°` : `Holding ${th.state.target}°`, (th && (th.state.hvac === "heating" || th.state.hvac === "cooling")) || fans > 0],
    ["security", "Security", ICON.shield, list.length ? list[0].text : away ? "Guarding the house" : "All secure", away || list.length > 0],
    ["energy", "Energy", ICON.bolt, energy ? `${energy.nowKw} kW now` : "Not measured", running > 0],
  ];
  return el("div", { class: "agents", role: "list", "aria-label": "What Haven's agents are doing", "data-sync": String(agentSync.until > now) },
    ...agents.map(([id, name, icon, text, active]) => el("div", {
      class: "agent", role: "listitem", "data-agent": id, "data-active": String(active),
      "data-busy": String(now - (agentSync.last[id] || 0) < 6000),
      "data-alert": String(id === "security" && list.some((i) => i.level === "bad")),
    },
      el("span", { class: "agent-ic", "aria-hidden": "true" }, svg(icon)),
      el("span", { class: "agent-name" }, name),
      el("span", { class: "agent-state" }, text))));
}

// ---------- the designed screens ----------
// Nine screens, each with its own look (its colors are tokens on .panel[data-screen=…] in
// styles.css, so every shared part, from the security card to the voice bar, takes them on).
// Every number comes from the house; nothing is decorative. Weather says "Sample" in the demo,
// electricity says "Estimated" unless a real meter reports it, and camera tiles show the home's
// own cameras (the demo's are stills marked "Sample picture"). Motion only follows something
// real: a light that's on glows, a fan that's running turns, electricity flows while it's used,
// the waveform follows Haven's voice, and a screen draws itself in once when it opens.
const DI = {
  sunrise: "M11 2h2v4h2.5L12 9.5 8.5 6H11V2ZM3.5 11l1.4-1.4 2 2-1.4 1.4-2-2Zm13.6.6 2-2 1.4 1.4-2 2-1.4-1.4ZM2 18h4.2a6 6 0 0 1 11.6 0H22v2H2v-2Zm6.3 0h7.4a4 4 0 0 0-7.4 0Z",
  moon: WX.moon,
  film: "M3 4h18v16H3V4Zm2 2v2h2V6H5Zm12 0v2h2V6h-2ZM5 11v2h2v-2H5Zm12 0v2h2v-2h-2ZM5 16v2h2v-2H5Zm12 0v2h2v-2h-2ZM9 6v12h6V6H9Z",
  exit: "M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9V3Zm-1 5 1.4 1.4L8.8 11H16v2H8.8l1.6 1.6L9 16l-4-4 4-4Z",
  grid: "M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z",
  camera: "M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z",
  person: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z",
  sliders: "M3 5h10v2H3V5Zm14 0h4v2h-4V5Zm-2-2h2v6h-2V3ZM3 11h4v2H3v-2Zm8 0h10v2H11v-2Zm-2-2h2v6H9V9Zm-6 8h10v2H3v-2Zm14 0h4v2h-4v-2Zm-2-2h2v6h-2v-6Z",
  sofa: "M5 6h14a2 2 0 0 1 2 2v2.2a2.5 2.5 0 0 0-1 .3V8H4v2.5a2.5 2.5 0 0 0-1-.3V8a2 2 0 0 1 2-2ZM1 13a2 2 0 0 1 4 0v2h14v-2a2 2 0 0 1 4 0v6h-2v1h-2v-1H5v1H3v-1H1v-6Z",
  bed: "M2 6h2v7h7V8h8a3 3 0 0 1 3 3v9h-2v-3H4v3H2V6Zm3 3.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z",
  pot: "M3 10h18v2h-1v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4H3v-2Zm5-6c1 1 1 2 0 3h1.6c1-1 1-2 0-3H8Zm4 0c1 1 1 2 0 3h1.6c1-1 1-2 0-3H12Z",
  tree: "M12 2 6 10h3l-4 6h6v6h2v-6h6l-4-6h3l-6-8Z",
  utility: "M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm5 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 15h6v1.6H9V15Zm0 3h6v1.6H9V18Z",
};
const SCENE_ICON = { morning: DI.sunrise, away: DI.exit, home: ICON.home, goodnight: DI.moon, movie: DI.film };
const ROOM_ICON = { kitchen: DI.pot, living: DI.sofa, primary: DI.bed, bedroom: DI.bed, hallway: ICON.door, garage: ICON.garage, utility: DI.utility, exterior: DI.tree, bath: ICON.water };
const roomIcon = (r) => ROOM_ICON[r.kind] || ROOM_ICON[r.id] || ICON.home;
const runScene = (id) => api(`/api/scenes/${id}`, {}).then(showResult);
const allOff = (list, message) => Promise.all(list.map((d) => api(`/api/devices/${d.id}`, { command: { on: false } }))).then(() => showResult({ message }));
const shortName = (d) => d.name.replace(/ (Lights?|Lock|Leak Sensor|Motion)$/, "").replace(/^Main /, "");
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// The time in the home's own time zone. Live clocks carry data-fmt and tick with tickClock().
function clockText(fmt) {
  const tz = state?.timezone;
  const now = new Date();
  try {
    if (fmt === "date") return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now);
    if (fmt === "dateShort") return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(now);
    if (fmt === "numeric") return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric", day: "numeric", year: "numeric" }).format(now);
    const t = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
    if (fmt === "time") return t.replace(/\s+/g, " ");
    const [hm, ap] = t.split(/\s+/);
    return fmt === "hm" ? hm : ap;
  } catch { return ""; }
}
const liveClock = (fmt, cls = "") => el("span", { class: `live-clock ${cls}`, "data-fmt": fmt }, clockText(fmt));

function headlineText(list = issues(), hs = houseState()) {
  return hs === "alert" ? "Needs your attention now" : list.length ? `${list.length} ${list.length === 1 ? "thing needs" : "things need"} attention` : state.pending.length ? "Waiting for your OK" : "All secure";
}
const issueItems = (list) => list.map((i) => el("li", { class: `issue ${i.level}` }, i.text, i.action && el("button", { onclick: i.action[1] }, i.action[0])));
// The house status every screen carries: one line, and each problem with its fix.
function dsStatus(cls = "") {
  const list = issues(), hs = houseState();
  return el("div", { class: `status ds-status ${cls}`, "data-state": hs },
    el("span", { class: "status-mark", "aria-hidden": "true" }),
    el("div", { class: "status-text" }, el("p", { class: "status-headline" }, headlineText(list, hs)), el("ul", { class: "issues" }, ...issueItems(list))));
}
// Only the problems, for screens that show "all secure" another way.
const dsIssues = () => { const list = issues(); return list.length ? el("ul", { class: "issues ds-issues", "aria-label": "Needs attention" }, ...issueItems(list)) : null; };
const dsTools = (cls = "") => el("div", { class: `ds-tools ${cls}` },
  el("button", { type: "button", class: "controls-open" }, "All controls"),
  el("button", { type: "button", class: "screens-open", "aria-haspopup": "dialog" }, "Screens"));
const tag = (text, cls = "") => (text ? el("span", { class: `ds-tag ${cls}` }, text) : null);

// Weather: the forecast when one is connected (the demo's is a labeled sample), or the outdoor
// sensor alone, or a plain "not connected".
const wxNow = () => (weather?.available ? weather : null);
const wxSampleTag = () => (weather?.source === "sample" ? tag("Sample") : null);
const outdoorF = () => byType("temperature")[0]?.state.value;
function wxDays(n = 4) {
  return (wxNow()?.daily || []).slice(0, n).map((d, i) => el("li", { class: "ds-day", "aria-label": `${d.label}: ${d.text}, high ${d.highF}°F, low ${d.lowF}°F${d.precip ? `, ${d.precip}% chance of rain` : ""}` },
    el("span", { class: "ds-day-name", "aria-hidden": "true" }, i === 0 ? "Today" : d.label.slice(0, 3)),
    el("span", { "aria-hidden": "true" }, wxIcon(d.condition)),
    el("span", { class: "ds-day-hi", "aria-hidden": "true" }, `${d.highF}°`),
    el("span", { class: "ds-day-lo", "aria-hidden": "true" }, `${d.lowF}°${d.precip >= 20 ? ` · ${d.precip}%` : ""}`)));
}
// The forecast as rows with a bar from each day's low to its high, on one shared scale.
function wxRanges(n = 4, cls = "") {
  const days = (wxNow()?.daily || []).slice(0, n);
  if (!days.length) return null;
  const lo = Math.min(...days.map((d) => d.lowF)) - 3, hi = Math.max(...days.map((d) => d.highF)) + 3, span = Math.max(1, hi - lo);
  const nowF = wxNow().current.tempF;
  return el("ul", { class: `ds-ranges ${cls}`, "aria-label": "The next days" }, ...days.map((d, i) => el("li", { "aria-label": `${d.label}: ${d.text}, low ${d.lowF}°F, high ${d.highF}°F` },
    el("span", { class: "rg-day", "aria-hidden": "true" }, i === 0 ? "Today" : d.label.slice(0, 3)),
    el("span", { "aria-hidden": "true" }, wxIcon(d.condition)),
    el("span", { class: "rg-lo", "aria-hidden": "true" }, `${d.lowF}°`),
    el("span", { class: "rg-bar", "aria-hidden": "true" },
      el("i", { style: `left:${((d.lowF - lo) / span) * 100}%;width:${((d.highF - d.lowF) / span) * 100}%;--d:${i * 0.08}s` }),
      i === 0 && nowF >= d.lowF - 3 && nowF <= d.highF + 3 ? el("b", { style: `left:${((nowF - lo) / span) * 100}%` }) : null),
    el("span", { class: "rg-hi", "aria-hidden": "true" }, `${d.highF}°`))));
}
function wxNotConnected() {
  const f = outdoorF();
  return el("p", { class: "ds-wx-none" }, f != null ? `${f}°F outside, from your sensor. The forecast isn't connected yet.` : "The forecast isn't connected yet.");
}

// Electricity: the running total for today, drawn from the day's samples and scaled to the
// house's own total. Labeled estimated unless a meter measures it.
const energyWord = () => (energy?.source === "estimate" ? "Estimated" : "Measured");
function runningTotal({ w = 320, h = 140, labels = true } = {}) {
  const box = el("div", { class: "ds-total", role: "img", "aria-label": energy ? `Electricity today: ${energy.todayKwh} kilowatt hours so far, ${energyWord().toLowerCase()}.` : "Electricity today: loading." });
  const pts = energy?.samples || [];
  if (pts.length < 2) return box;
  let sum = 0;
  const acc = [[pts[0].minute, 0]];
  for (let i = 1; i < pts.length; i++) { sum += ((pts[i].kw + pts[i - 1].kw) / 2) * ((pts[i].minute - pts[i - 1].minute) / 60); acc.push([pts[i].minute, sum]); }
  const k = sum > 0 && energy.todayKwh ? energy.todayKwh / sum : 1;
  const top = Math.max(10, Math.ceil((energy.todayKwh || sum) / 10) * 10);
  const L = labels ? 34 : 4, B = labels ? h - 18 : h - 4, T = 8;
  const X = (min) => L + (min / 1440) * (w - L - 6), Y = (v) => B - (v / top) * (B - T);
  const line = acc.map(([m, v], i) => `${i ? "L" : "M"}${X(m).toFixed(1)} ${Y(v * k).toFixed(1)}`).join("");
  const end = acc.at(-1);
  const grid = [0, top / 2, top].map((v) => `<line x1="${L}" x2="${w - 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="tg"/>${labels ? `<text x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>` : ""}`).join("");
  const ticks = labels ? [[0, "12 AM"], [360, "6 AM"], [720, "Noon"], [1080, "6 PM"]].map(([m, t]) => `<text x="${X(m).toFixed(1)}" y="${h - 3}" text-anchor="${m ? "middle" : "start"}">${t}</text>`).join("") : "";
  box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${grid}${ticks}<path class="ta" d="${line}L${X(end[0]).toFixed(1)} ${B}L${X(acc[0][0]).toFixed(1)} ${B}Z"/><path class="tl" pathLength="1" d="${line}"/><circle class="te" cx="${X(end[0]).toFixed(1)}" cy="${Y(end[1] * k).toFixed(1)}" r="4"/></svg>`;
  return box;
}

// An arc gauge (270°), or a half circle with semi: value is 0..1. The number sits inside.
function gauge(frac, { size = 120, stroke = 10, semi = false, cls = "", label = "", value = "", unit = "" } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, arc = semi ? c / 2 : c * 0.75;
  const f = clamp01(frac);
  const rot = semi ? 180 : 135;
  const g = el("div", { class: `ds-gauge ${semi ? "semi" : ""} ${cls}`, role: "img", "aria-label": `${label}: ${value}${unit}`, style: `--size:${size}px` });
  g.innerHTML = `<svg viewBox="0 0 ${size} ${semi ? size / 2 + stroke : size}" aria-hidden="true"><circle class="gt" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${arc.toFixed(1)} ${c.toFixed(1)}" transform="rotate(${rot} ${size / 2} ${size / 2})"/><circle class="gv" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${(arc * f).toFixed(1)} ${c.toFixed(1)}" style="--arc:${(arc * f).toFixed(1)}" transform="rotate(${rot} ${size / 2} ${size / 2})"/></svg>`;
  g.append(el("span", { class: "gauge-num", "aria-hidden": "true" }, value, unit ? el("small", {}, unit) : null), label ? el("span", { class: "gauge-label", "aria-hidden": "true" }, label) : null);
  return g;
}

// The thermostat as a dial: the arc runs to the set temperature, the number is the room now.
function climateDoing(d) {
  const s = d.state, t = targetOf(d);
  return s.mode === "off" ? "System off" : s.hvac === "heating" ? `Heating to ${t}°` : s.hvac === "cooling" ? `Cooling to ${t}°` : `Holding ${t}°`;
}
function climateHue(d) {
  const s = d.state;
  return s.mode === "off" ? "var(--muted)" : s.hvac === "heating" ? "var(--heat)" : s.hvac === "cooling" ? "var(--cool)" : "var(--idle)";
}
function tempDial(d, { size = 190, stroke = 12, big = "current" } = {}) {
  const s = d.state, t = targetOf(d);
  const frac = clamp01((t - 55) / 30);
  const r = (size - stroke) / 2 - 4, c = 2 * Math.PI * r, arc = c * 0.75;
  const a = ((135 + 270 * frac) * Math.PI) / 180;
  const kx = size / 2 + r * Math.cos(a), ky = size / 2 + r * Math.sin(a);
  const dial = el("div", { class: "ds-dial", style: `--size:${size}px;--hue:${climateHue(d)}`, role: "img", "aria-label": `${s.current}°F inside, ${climateDoing(d).toLowerCase()}` });
  dial.innerHTML = `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="gt" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${arc.toFixed(1)} ${c.toFixed(1)}" transform="rotate(135 ${size / 2} ${size / 2})"/><circle class="gv" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${s.mode === "off" ? 0 : (arc * frac).toFixed(1)} ${c.toFixed(1)}" style="--arc:${(arc * frac).toFixed(1)}" transform="rotate(135 ${size / 2} ${size / 2})"/>${s.mode === "off" ? "" : `<circle class="gk" cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${stroke * 0.62}"/>`}</svg>`;
  dial.append(el("div", { class: "dial-mid", "aria-hidden": "true" },
    el("span", { class: "dial-small" }, big === "current" ? (s.hvac && s.hvac !== "idle" && s.hvac !== "off" ? cap(s.hvac) : "Idle") : "Set to"),
    el("span", { class: "dial-big" }, big === "current" ? `${s.current}°` : `${t}°`),
    el("span", { class: "dial-small" }, big === "current" ? climateDoing(d) : `${s.current}° now`)));
  return dial;
}
const climateStepper = (d, cls = "") => el("div", { class: `ds-stepper ${cls}` },
  el("button", { type: "button", "aria-label": "Cooler by 1°F", onclick: () => stepTarget(d, -1) }, "−"),
  el("span", { class: "target" }, `${targetOf(d)}°F`),
  el("button", { type: "button", "aria-label": "Warmer by 1°F", onclick: () => stepTarget(d, 1) }, "+"));
const modeButtons = (d, cls = "") => el("div", { class: `ds-modes ${cls}`, role: "group", "aria-label": "Mode" },
  ...MODES.map(([m, label]) => el("button", { type: "button", "aria-pressed": String(d.state.mode === m), onclick: () => send(d.id, { mode: m }) }, label)));
function heaterStepper(d, cls = "") {
  return el("div", { class: `ds-stepper ${cls}` },
    el("button", { type: "button", "aria-label": "Lower 5°F", onclick: () => stepTarget(d, -5), disabled: !d.state.on }, "−"),
    el("span", { class: "target" }, d.state.on ? `${targetOf(d)}°F` : "Off"),
    el("button", { type: "button", "aria-label": "Raise 5°F", onclick: () => stepTarget(d, 5), disabled: !d.state.on }, "+"));
}

// A light or fan as a big tile: the whole tile is its switch; a dimmer shows while a light is on.
function lightTile(d, { slider = false, cls = "", icon = ICON.light } = {}) {
  const s = d.state, on = s.on;
  const isFan = d.type === "fan";
  return el("div", { class: `ds-light${on ? " on" : ""}${isFan ? " fan" : ""} ${cls}`, "data-device": d.id, style: on && !isFan ? `--glow:${s.brightness / 100}` : undefined },
    el("button", { type: "button", class: "ds-light-btn", role: "switch", "aria-checked": String(on), "aria-label": d.name, onclick: () => send(d.id, { on: !on }) },
      el("span", { class: "ds-light-ic" }, svg(isFan ? ICON.fan : icon)),
      el("span", { class: "ds-light-name" }, shortName(d)),
      el("span", { class: "ds-light-state" }, isFan ? (on ? `On · speed ${s.speed}` : "Off") : on ? `On · ${s.brightness}%` : "Off")),
    slider && on && !isFan ? el("input", { type: "range", class: "ds-range", min: "5", max: "100", step: "5", value: String(s.brightness), "aria-label": `${d.name} brightness`, style: `--fill:${s.brightness}%`,
      oninput: (e) => e.target.style.setProperty("--fill", `${e.target.value}%`), onchange: (e) => send(d.id, { on: true, brightness: Number(e.target.value) }) }) : null);
}
// A row with a switch, for list-style screens.
function switchRow(d, cls = "") {
  const s = d.state, on = s.on;
  const word = d.type === "fan" ? (on ? `On · speed ${s.speed}` : "Off") : on ? `On · ${s.brightness}%` : "Off";
  return el("li", { class: `ds-row${on ? " on" : ""} ${cls}`, "data-device": d.id },
    el("span", { class: "ds-row-ic" }, svg(d.type === "fan" ? ICON.fan : ICON.light)),
    el("span", { class: "ds-row-name" }, shortName(d)),
    el("span", { class: "ds-row-state" }, word),
    toggle(d.name, on, () => send(d.id, { on: !on })));
}
// A door, lock, garage or water valve with its state in words and, where it has one, its action.
function statusRow(d, cls = "") {
  const [level, word] = secState(d);
  const s = d.state;
  let action = null;
  if (d.type === "garage") action = [s.door === "closed" ? "Open" : "Close", () => send(d.id, { door: s.door === "closed" ? "open" : "closed" })];
  if (d.type === "lock") action = [s.locked ? "Unlock" : "Lock", () => send(d.id, { locked: !s.locked })];
  return el("li", { class: `ds-row ${cls}`, "data-device": d.id, "data-level": level },
    el("span", { class: "ds-row-ic" }, svg(ICON[SEC_ICON[d.type]] || ICON.shield)),
    el("span", { class: "ds-row-name" }, shortName(d)),
    el("span", { class: `sec-state ${level}` }, el("i", { "aria-hidden": "true" }), word),
    action ? el("button", { type: "button", class: "ds-row-act", "aria-label": `${action[0]} ${d.name}`, onclick: action[1] }, action[0]) : null);
}
const entryPoints = () => [...byType("lock"), ...byType("garage"), ...byType("contact")];

// Cameras on the designed screens: the picture, its name and its state in words. A tap opens
// the viewer. With none connected, the space says so.
const camList = () => (cams?.available ? cams.cameras : []);
function camFeed(c, cls = "") {
  const [level, word] = camStatus(c);
  const pic = c.sample || camPictures.get(`/api/cameras/${c.id}/snapshot`)?.url;
  return el("button", { type: "button", class: `ds-cam ${cls}`, "data-camera": c.id, "aria-label": `${c.name} camera${c.sample ? ", sample picture" : ""}`, onclick: () => openCamera(c.id) },
    el("img", { alt: "", ...(c.sample ? { src: c.sample } : { "data-cam-src": `/api/cameras/${c.id}/snapshot`, ...(pic ? { src: pic } : { hidden: "" }) }) }),
    pic ? null : el("span", { class: "cam-wait" }, c.online ? "Loading picture" : "No picture"),
    el("span", { class: "ds-cam-name" }, c.name),
    el("span", { class: `ds-cam-state ${level}` }, word));
}
const camNone = (cls = "") => el("div", { class: `ds-cam-none ${cls}` }, el("p", {}, cams?.reason || "No cameras connected."));

// The house, in whichever view Screens → House view picks; tapping a room selects it.
function houseBox() {
  houseView(altMapBox, { selected: room === "all" ? null : room, onSelect: (id) => { room = room === id ? "all" : id; render(); }, onExpand: () => openExplorer() });
  return altMapBox;
}

// Haven's latest updates, newest first.
const latestUpdates = (n) => feed.map((e) => [e, feedItem(e)]).filter(([, f]) => f).slice(-n).reverse();
function updatesList(n, cls = "") {
  const items = latestUpdates(n);
  return items.length ? el("ol", { class: `ds-updates ${cls}` }, ...items.map(([e, f]) => el("li", { class: f.urgent ? "urgent" : "" },
    el("span", { class: "upd-title" }, f.title), el("span", { class: "upd-body" }, f.body), el("span", { class: "upd-when" }, timeAgo(e.ts)))))
    : el("p", { class: "muted" }, "Nothing new.");
}

// Scene cards with a picture: this home's own photoreal renders where they exist, otherwise
// the scene's painted light.
const SCENE_RENDER = { home: "ai-evening-1", away: "ai-day-1", goodnight: "ai-evening-2", morning: "ai-day-2", movie: "ai-evening-2" };
function scenePhoto(id, label, cls = "") {
  const thisHome = HOUSE_STILLS?.sig && HOUSE_STILLS.sig === homeSignature(currentHome());
  const pic = thisHome && HOUSE_RENDERS.find((r) => r.id === SCENE_RENDER[id]);
  return el("button", { type: "button", class: `scene ds-photo ${cls}`, "data-scene": id, onclick: () => runScene(id) },
    pic ? el("img", { src: pic.src, alt: "" }) : null,
    el("span", { class: "ds-photo-name" }, label),
    el("span", { class: "ds-photo-what" }, state.sceneInfo?.[id] || ""));
}
const sceneButton = (id, label, cls = "") => el("button", { type: "button", class: `ds-scene ${cls}`, "data-scene": id, onclick: () => runScene(id) },
  el("span", { class: "ds-scene-ic" }, svg(SCENE_ICON[id] || ICON.sparkle)),
  el("span", { class: "ds-scene-name" }, label),
  state.sceneInfo?.[id] ? el("span", { class: "ds-scene-what" }, state.sceneInfo[id]) : null);
const sceneList = () => Object.entries(state.scenes);

const bedRoom = () => panelRoom || "primary";
// The panel's own room for a lights card, or the living room, or the first room with lights.
function mainLightRoom() {
  const has = (id) => byType("light").some((l) => l.room === id);
  return [panelRoom, "living"].find((id) => id && has(id)) || byType("light")[0]?.room;
}

// ----- 1 · Command: tabs across the top, a rail on the left, tiles in a 12-column grid -----
let cmTab = "home";
function commandScreen() {
  const th = byType("thermostat")[0];
  const sec = secSummary();
  const home = state.people.filter((p) => p.home).length;
  const pick = (t) => { cmTab = t; renderAlt(); };
  const railBtn = (label, icon, attrs) => el("button", { type: "button", "aria-label": label, title: label, ...attrs }, svg(icon));
  const TABS = [["home", "Home"], ["lights", "Lights"], ["climate", "Climate"], ["security", "Security"], ["cameras", "Cameras"]];
  const lights = byType("light");
  const shownLights = room !== "all" ? lights.filter((l) => l.room === room) : lights.filter((l) => l.room !== "exterior").slice(0, 4);
  const camsShown = camList();
  let body;
  if (cmTab === "lights") {
    body = [...lights.map((l) => lightTile(l, { slider: true, cls: "span3" })), ...byType("fan").map((f) => lightTile(f, { cls: "span3" })),
      lights.some((l) => l.state.on) ? el("button", { type: "button", class: "cm-wide span12", onclick: () => allOff(lights.filter((l) => l.state.on), "All lights off.") }, "Turn every light off") : null];
  } else if (cmTab === "climate") {
    const wh = byType("water_heater")[0];
    body = [
      th ? el("section", { class: "cm-card cm-thermo span6", "data-device": th.id, "aria-label": "Thermostat" },
        el("h2", {}, shortName(th)), tempDial(th, { size: 230 }), climateStepper(th), modeButtons(th),
        el("p", { class: "muted" }, `${th.state.humidity ?? "--"}% humidity inside`)) : null,
      ...byType("fan").map((f) => lightTile(f, { cls: "span3" })),
      wh ? el("section", { class: "cm-card span6", "data-device": wh.id, "aria-label": wh.name },
        el("div", { class: "row-between" }, el("h2", {}, wh.name), toggle("Water heater power", wh.state.on, () => send(wh.id, { on: !wh.state.on }))),
        gauge((targetOf(wh) - 100) / 40, { size: 150, label: describe(wh), value: wh.state.on ? `${targetOf(wh)}°` : "Off" }), heaterStepper(wh)) : null,
    ];
  } else if (cmTab === "security") {
    body = [el("div", { class: "span12" }, securityBlock())];
  } else if (cmTab === "cameras") {
    body = camsShown.length ? camsShown.map((c) => camFeed(c, "span6 cm-cam-big")) : [camNone("span12")];
  } else {
    body = [
      ...sceneList().map(([id, label]) => sceneButton(id, label, "span2")),
      el("button", { type: "button", class: `cm-sec span2 lvl-${sec.level}`, onclick: () => pick("security") },
        el("span", { class: "ds-scene-ic" }, svg(ICON.shield)),
        el("span", { class: "ds-scene-name" }, "Security"),
        el("span", { class: "ds-scene-what" }, `${sec.short} · ${sec.mode[1]}`),
        el("span", { class: "ds-scene-what" }, home ? `${home} ${home === 1 ? "person" : "people"} home` : "Everyone away")),
      el("section", { class: "cm-card cm-wx span4", "aria-label": "Weather" },
        wxNow() ? [
          el("div", { class: "cm-wx-now" },
            el("span", { class: "cm-wx-ic" }, wxIcon(weather.current.condition, weather.current.isDay)),
            el("div", {}, el("p", { class: "cm-wx-text" }, weather.current.text), el("p", { class: "muted" }, `${weather.current.humidity ?? "--"}% humidity${weather.current.windMph != null ? ` · wind ${weather.current.windMph} mph` : ""}`)),
            el("div", { class: "cm-wx-temp" }, el("p", {}, `${weather.current.tempF}°`), wxSampleTag())),
          el("ul", { class: "ds-days" }, ...wxDays(4)),
        ] : [el("h2", {}, "Weather"), wxNotConnected()]),
      th ? el("section", { class: "cm-card cm-thermo span4", "data-device": th.id, "aria-label": "Thermostat" },
        el("h2", {}, shortName(th)), tempDial(th, { size: 180 }), climateStepper(th)) : null,
      el("section", { class: "cm-card cm-house span4", "aria-label": "The house" },
        el("div", { class: "row-between" }, el("h2", {}, room === "all" ? "The house" : roomName(room)),
          room !== "all" ? el("button", { type: "button", class: "ghost", onclick: () => { room = "all"; render(); } }, "Every room") : null),
        houseBox()),
      ...shownLights.map((l) => lightTile(l, { cls: "span2" })),
      el("div", { class: "cm-cams span4" }, ...(camsShown.length ? camsShown.slice(0, 2).map((c) => camFeed(c)) : [camNone()])),
    ];
    if (!shownLights.length) body.splice(body.length - 1, 0, el("p", { class: "muted span8" }, `No lights in the ${roomName(room).toLowerCase()}.`));
  }
  return el("div", { class: "ds s-command" },
    el("nav", { class: "cm-rail", "aria-label": "Panel" },
      el("span", { class: "cm-mark", "aria-hidden": "true" }, (state.home || "H").replace(/^The /, "")[0]),
      railBtn("Home", ICON.home, { "aria-pressed": String(cmTab === "home"), onclick: () => pick("home") }),
      railBtn("All controls", DI.sliders, { class: "controls-open" }),
      railBtn("Cameras", DI.camera, { "aria-pressed": String(cmTab === "cameras"), onclick: () => pick("cameras") }),
      railBtn("Screens", DI.grid, { class: "screens-open", "aria-haspopup": "dialog" })),
    el("div", { class: "cm-main" },
      el("header", { class: "cm-top" },
        el("nav", { class: "cm-tabs", "aria-label": "Sections" }, ...TABS.map(([id, label]) =>
          el("button", { type: "button", "aria-pressed": String(cmTab === id), "data-tab": id, onclick: () => pick(id) }, label))),
        liveClock("time", "cm-clock"),
        el("button", { type: "button", class: "cm-mic", "aria-label": "Talk to Haven", onclick: talk }, svg(DI.mic))),
      dsIssues(), asksBlock(),
      el("div", { class: `cm-grid tab-${cmTab}` }, ...body.flat().filter(Boolean))));
}

// ----- 2 · Glass: black glass, a thermostat dial at the side, Haven's voice along the bottom -----
function glassScreen() {
  const th = byType("thermostat")[0];
  const sec = secSummary();
  const lr = mainLightRoom();
  const ringLights = byType("light").filter((l) => l.room === lr);
  const ring = ringLights[0];
  const w = wxNow();
  const two = ["home", "away"].filter((id) => state.scenes[id]);
  const scenes = (two.length === 2 ? two : sceneList().slice(0, 2).map(([id]) => id)).map((id) => scenePhoto(id, state.scenes[id], "gl-scene"));
  const doors = entryPoints().filter((d) => d.type !== "contact").slice(0, 3);
  const chip = (k, v, extra, cls = "") => el("div", { class: `gl-chip ${cls}` }, el("span", { class: "gl-chip-k" }, k, extra), el("span", { class: "gl-chip-v" }, v));
  const nav = (label, icon, attrs) => el("button", { type: "button", ...attrs }, svg(icon), el("span", {}, label));
  const knob = th ? el("section", { class: "gl-knob", "data-device": th.id, "aria-label": "Thermostat" },
    el("p", { class: "gl-knob-label" }, shortName(th)),
    el("div", { class: "gl-dial" },
      el("span", { class: "gl-ring", style: `--rot:${(targetOf(th) - 70) * 9}deg;--hue:${climateHue(th)}`, "aria-hidden": "true" }, el("i")),
      el("div", { class: "gl-face" }, el("span", { class: "gl-set" }, `${targetOf(th)}°`), el("span", { class: "gl-doing" }, climateDoing(th).replace(/ (to )?\d+°$/, "")))),
    el("p", { class: "gl-now" }, `${th.state.current}° inside · ${th.state.humidity ?? "--"}%`),
    climateStepper(th, "gl-step"), modeButtons(th, "gl-modes")) : null;
  return el("div", { class: "ds s-glass" },
    el("nav", { class: "gl-nav", "aria-label": "Panel" },
      el("span", { class: "gl-mark", "aria-hidden": "true" }, "H"),
      nav("Home", ICON.home, { "aria-current": "page" }),
      nav("Controls", DI.sliders, { class: "controls-open", "aria-label": "All controls" }),
      nav("Screens", DI.grid, { class: "screens-open", "aria-haspopup": "dialog" })),
    el("div", { class: "gl-main" },
      el("header", { class: "gl-top" },
        el("div", {},
          el("p", { class: "gl-clock" }, liveClock("hm"), el("span", { class: "gl-ampm" }, liveClock("ampm"))),
          el("p", { class: "gl-date" }, liveClock("date"), ` · ${greetingWord()}`)),
        el("div", { class: "gl-chips" },
          w ? chip("Outside", `${w.current.tempF}° ${w.current.text}`, w.source === "sample" ? " · sample" : "")
            : chip("Outside", outdoorF() != null ? `${outdoorF()}°` : "Not connected"),
          th ? chip("Inside", `${th.state.current}° · ${th.state.humidity ?? "--"}%`) : null,
          chip("Security", `${sec.short} · ${sec.mode[1]}`, "", `lvl-${sec.level}`))),
      dsIssues(), asksBlock(),
      el("div", { class: "gl-grid" },
        el("section", { class: "gl-card gl-news", "aria-label": "Haven updates" },
          el("h2", {}, "Haven updates"), updatesList(4, "gl-feed"),
          el("div", { class: "gl-asks" },
            el("button", { type: "button", onclick: () => api("/api/briefing", {}) }, "Brief me"),
            el("button", { type: "button", onclick: () => ask("status") }, "How's the house?"))),
        el("div", { class: "gl-scenes" }, ...scenes),
        ring ? el("section", { class: "gl-card gl-lamp", "data-device": ring.id, "aria-label": `${roomName(lr)} lights` },
          el("div", { class: "gl-lamp-ring", style: `--fill:${ring.state.on ? ring.state.brightness : 0}%`, role: "img", "aria-label": ring.state.on ? `${ring.name} at ${ring.state.brightness}%` : `${ring.name} off` },
            el("span", { "aria-hidden": "true" }, ring.state.on ? `${ring.state.brightness}%` : "Off")),
          el("div", { class: "gl-lamp-side" },
            el("p", { class: "gl-lamp-name" }, `${roomName(lr)} lights`),
            el("div", { class: "gl-lamp-btns" },
              el("button", { type: "button", "aria-label": "Dimmer", onclick: () => (ring.state.on && ring.state.brightness > 10 ? send(ring.id, { on: true, brightness: ring.state.brightness - 10 }) : send(ring.id, { on: false })) }, "−"),
              el("button", { type: "button", "aria-label": "Brighter", onclick: () => send(ring.id, { on: true, brightness: ring.state.on ? Math.min(100, ring.state.brightness + 10) : 30 }) }, "+")),
            toggle(ring.name, ring.state.on, () => send(ring.id, { on: !ring.state.on })))) : null,
        el("section", { class: "gl-card gl-doors", "aria-label": "Doors" },
          el("ul", { class: "ds-rows" }, ...doors.map((d) => statusRow(d))))),
      el("div", { class: "gl-voice" },
        el("button", { type: "button", class: "gl-talk", "aria-label": "Talk to Haven", onclick: talk },
          el("span", { class: "gl-orb", "data-voice": voiceState, "aria-hidden": "true" }, svg(DI.mic)),
          el("span", { class: "gl-talk-text" },
            el("span", { class: "st-state" }, VOICE_LABEL[voiceState]),
            el("span", { class: "st-reply" }, lastReply || `${greetingWord()}. Talk to me.`)),
          el("span", { class: "wave gl-wave", "aria-hidden": "true" }, ...Array.from({ length: 28 }, () => el("i")))),
        agentRow())),
    knob);
}

// ----- 3 · Security Console: the alarm-panel view, for the door you leave by -----
function consoleScreen() {
  const th = byType("thermostat")[0];
  const wh = byType("water_heater")[0];
  const on = allDevices().filter((d) => (d.type === "light" || d.type === "fan") && d.state.on);
  const dialCard = (d, title, dial, controls) => el("section", { class: "co-card co-dial", "data-device": d.id, "aria-label": title },
    el("div", { class: "row-between" }, el("h2", {}, title), el("span", { class: "muted small" }, d.type === "thermostat" ? roomName(d.room) : "Heat pump")), dial, ...controls);
  return el("div", { class: "ds s-console" },
    el("header", { class: "co-top" },
      el("p", { class: "co-name" }, state.home),
      dsStatus("co-status"),
      liveClock("time", "co-clock"),
      dsTools()),
    asksBlock(),
    el("div", { class: "co-actions" },
      state.scenes.away ? bigButton("I'm leaving", state.sceneInfo?.away || "Away", () => runScene("away"), "primary") : null,
      state.scenes.home ? bigButton("I'm home", state.sceneInfo?.home || "Welcome home", () => runScene("home")) : null,
      bigButton("Lock up", "Every door, and the garage", lockUp)),
    el("div", { class: "co-grid" },
      el("div", { class: "co-sec" }, securityBlock()),
      el("div", { class: "co-dials" },
        th ? dialCard(th, "Thermostat", tempDial(th, { size: 170 }), [climateStepper(th), modeButtons(th)]) : null,
        wh ? dialCard(wh, wh.name, gauge((targetOf(wh) - 100) / 40, { size: 150, label: wh.state.on ? "Ready" : "Off", value: wh.state.on ? `${targetOf(wh)}°F` : "Off" }),
          [heaterStepper(wh), el("div", { class: "row-between" }, el("span", { class: "muted small" }, "Power"), toggle("Water heater power", wh.state.on, () => send(wh.id, { on: !wh.state.on })))]) : null),
      el("div", { class: "co-cams" }, camerasBlock()),
      el("div", { class: "co-side" },
        el("section", { class: "co-card co-house", "aria-label": "The house" },
          el("div", { class: "row-between" }, el("h2", {}, room === "all" ? "The house" : roomName(room)),
            room !== "all" ? el("button", { type: "button", class: "ghost", onclick: () => { room = "all"; render(); } }, "Every room") : null),
          houseBox()),
        el("section", { class: "co-card", "aria-label": "Today" }, el("h2", {}, "Today"), updatesList(4)),
        block("Still on", "stillon-card co-card",
          on.length ? el("ul", { class: "lights-list" }, ...on.map((d) => el("li", { class: "on", "data-device": d.id },
            el("span", { class: "tile-icon" }, svg(d.type === "fan" ? ICON.fan : ICON.light)),
            el("div", { class: "ll-text" }, el("span", { class: "ll-name" }, d.name), el("span", { class: "ll-state" }, describe(d))),
            el("button", { type: "button", onclick: () => send(d.id, { on: false }) }, "Turn off")))) : el("p", { class: "muted" }, "Everything's off."),
          on.length > 1 ? el("button", { type: "button", class: "ghost", onclick: () => allOff(on, "Everything's off.") }, "Turn everything off") : null))));
}

// ----- 4 · Everything Wall: a strip of numbers, the cameras, every switch, the rooms, gauges -----
function wallScreen() {
  const th = byType("thermostat")[0];
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);
  const wh = byType("water_heater")[0];
  const w = wxNow();
  const kpi = (label, value, unit, note, cls = "") => el("div", { class: `wa-kpi ${cls}` },
    el("span", { class: "wa-k" }, label), el("span", { class: "wa-v" }, value, unit ? el("small", {}, unit) : null), note ? tag(note) : null);
  const outside = w ? kpi("Outside", `${w.current.tempF}`, "°F", w.source === "sample" ? "Sample" : "") : outdoorF() != null ? kpi("Outside", `${outdoorF()}`, "°F", "Sensor") : kpi("Outside", "--", "", "Not connected");
  const devRow = [
    ...[...entryPoints(), ...byType("water_valve")].map((d) => { const [level, word] = secState(d); return el("div", { class: `wa-dev lvl-${level}`, "data-device": d.id }, el("span", { class: "wa-dev-ic" }, svg(ICON[SEC_ICON[d.type]] || ICON.shield)), el("span", { class: "wa-dev-name" }, shortName(d)), el("span", { class: "sec-state " + level }, el("i", { "aria-hidden": "true" }), word)); }),
    ...byType("light").filter((l) => l.room === "exterior").map((l) => lightTile(l, { cls: "wa-sw" })),
    ...byType("fan").map((f) => lightTile(f, { cls: "wa-sw" })),
  ];
  const rooms = state.rooms.filter((r) => allDevices().some((d) => d.room === r.id && ["light", "fan", "motion", "leak", "thermostat", "water_heater", "garage"].includes(d.type)) && r.id !== "exterior");
  const roomCardW = (r) => {
    const ds = allDevices().filter((d) => d.room === r.id);
    const lit = ds.some((d) => d.type === "light" && d.state.on);
    const lines = [];
    for (const d of ds) {
      if (d.type === "motion") lines.push([shortName(d) === r.name ? "Motion" : `${shortName(d)} motion`, d.state.motion ? "Motion now" : "Quiet"]);
      if (d.type === "leak") lines.push([d.name.replace(/ Leak Sensor$/, " leak sensor"), d.state.wet ? "LEAK" : "Dry"]);
      if (d.type === "thermostat") lines.push(["Thermostat", `${d.state.current}° · holding ${targetOf(d)}°`]);
      if (d.type === "water_heater") lines.push(["Water heater", describe(d)]);
      if (d.type === "garage") lines.push(["Garage door", secState(d)[1]]);
      if (d.type === "fan") lines.push([d.name, d.state.on ? `On · speed ${d.state.speed}` : "Off"]);
    }
    return el("section", { class: `wa-room${lit ? " lit" : ""}`, "data-room": r.id, "aria-label": r.name },
      el("h2", {}, r.name, lit ? tag("Lit", "lit") : null),
      ...ds.filter((d) => d.type === "light").map((l) => el("button", { type: "button", class: "wa-lamp", role: "switch", "aria-checked": String(l.state.on), "aria-label": l.name, "data-device": l.id, onclick: () => send(l.id, { on: !l.state.on }) },
        el("span", { class: "wa-lamp-top" }, el("span", {}, "Lights"), el("b", {}, l.state.on ? `${l.state.brightness}%` : "Off")),
        el("span", { class: "wa-bar", "aria-hidden": "true" }, el("i", { style: `width:${l.state.on ? l.state.brightness : 0}%` })))),
      el("ul", { class: "wa-lines" }, ...lines.map(([k, v]) => el("li", { class: v === "LEAK" ? "alert" : "" }, el("span", {}, k), el("b", {}, v)))));
  };
  return el("div", { class: "ds s-wall" },
    el("div", { class: "wa-kpis" },
      el("div", { class: "wa-kpi wa-time" }, el("span", { class: "wa-clock" }, liveClock("time")), el("span", { class: "wa-k" }, liveClock("date"))),
      th ? kpi("Inside", `${th.state.current}`, "°F") : null,
      outside,
      th ? kpi("Humidity", `${th.state.humidity ?? "--"}`, "%") : null,
      energy ? kpi("Power now", `${energy.nowKw}`, "kW", energy.source === "estimate" ? "Est." : "") : null,
      energy ? kpi("Today", `${energy.todayKwh}`, "kWh", energy.source === "estimate" ? "Est." : "") : null,
      valve ? kpi("Water", valve.state.open ? "On" : "Off", "", wet.length ? "Leak" : "No leaks", wet.length || !valve.state.open ? "alert" : "ok") : null),
    el("div", { class: "wa-top" }, dsStatus("wa-status"), dsTools()),
    asksBlock(),
    el("div", { class: "wa-cams" }, ...(camList().length ? camList().slice(0, 4).map((c) => camFeed(c)) : [camNone()])),
    el("div", { class: "wa-devs" }, ...devRow),
    el("div", { class: "wa-bottom" },
      el("div", { class: "wa-rooms" }, ...rooms.map(roomCardW)),
      el("div", { class: "wa-right" },
        el("div", { class: "wa-gauges" },
          th ? gauge((th.state.current - 50) / 40, { label: "Inside", value: `${th.state.current}°`, cls: "g-heat" }) : null,
          th ? gauge((th.state.humidity ?? 0) / 100, { label: "Humidity", value: `${th.state.humidity ?? "--"}%`, cls: "g-cool" }) : null,
          wh ? gauge((targetOf(wh) - 100) / 40, { label: "Water heater", value: wh.state.on ? `${targetOf(wh)}°F` : "Off", cls: "g-warm" }) : null,
          energy ? gauge(energy.nowKw / 5, { label: energy.source === "estimate" ? "Power, est." : "Power", value: `${energy.nowKw}`, unit: " kW", cls: "g-ok" }) : null),
        el("section", { class: "wa-energy", "aria-label": "Electricity today" },
          el("p", { class: "wa-energy-head" }, el("span", {}, "Electricity today"), tag(energyWord()), el("b", {}, energy ? `${energy.todayKwh}` : "--", el("small", {}, " kWh so far"))),
          runningTotal({ w: 640, h: 190 })))));
}

// ----- 5 · Good Evening: a greeting, climate and water, the forecast, scenes, rooms, cameras -----
let evSeg = "climate";
function eveningScreen() {
  const th = byType("thermostat")[0];
  const wh = byType("water_heater")[0];
  const w = wxNow();
  const today = w?.daily?.[0];
  const chipsWx = w ? [
    el("span", {}, "Outside is"), el("span", { class: "ev-pill" }, `${w.current.tempF}°F, ${w.current.text.toLowerCase()}`),
    w.current.windMph != null ? [el("span", {}, "Wind"), el("span", { class: "ev-pill" }, `${w.current.windMph} mph`)] : null,
    today ? [el("span", {}, "High"), el("span", { class: "ev-pill" }, `${today.highF}° ▲`), el("span", {}, "Low"), el("span", { class: "ev-pill" }, `${today.lowF}° ▼`)] : null,
  ] : [el("span", {}, outdoorF() != null ? `It's ${outdoorF()}°F outside, from your sensor.` : "The forecast isn't connected yet.")];
  const last = [...feed].reverse().find((e) => e.type === "briefing");
  const segBtn = (id, label) => el("button", { type: "button", role: "tab", "aria-selected": String(evSeg === id), onclick: () => { evSeg = id; renderAlt(); } }, label);
  const roomCardE = (r) => {
    const ds = allDevices().filter((d) => d.room === r.id);
    const lights = ds.filter((d) => d.type === "light"), fans = ds.filter((d) => d.type === "fan");
    const lit = lights.filter((l) => l.state.on);
    const bits = [];
    if (lights.length) bits.push(lit.length ? `Lights ${lit.length === 1 ? `${lit[0].state.brightness}%` : `${lit.length} on`}` : "Lights off");
    for (const f of fans) bits.push(`fan ${f.state.on ? "on" : "off"}`);
    if (!lights.length && !fans.length) {
      const extra = ds.find((d) => ["water_heater", "garage", "lock", "leak"].includes(d.type));
      if (extra) bits.push(`${shortName(extra)}: ${secState(extra)[1] || describe(extra)}`);
    }
    const circle = (d, label, icon) => el("button", { type: "button", class: "ev-act", role: "switch", "aria-checked": String(d.state.on), "aria-label": label, "data-device": d.id, onclick: () => send(d.id, { on: !d.state.on }) }, svg(icon));
    return el("section", { class: `ev-room${lit.length ? " lit" : ""}`, "data-room": r.id, "aria-label": r.name },
      el("p", { class: "ev-room-name" }, r.name.replace(/ Room$/, "")),
      el("p", { class: "ev-room-state" }, cap(bits.join(" · "))),
      el("span", { class: "ev-blob", "aria-hidden": "true" }, svg(roomIcon(r))),
      el("div", { class: "ev-acts" }, ...lights.slice(0, 2).map((l) => circle(l, l.name, ICON.light)), ...fans.map((f) => circle(f, f.name, ICON.fan))));
  };
  // Under each camera, the light that goes with it: one named like the camera ("Driveway" and
  // the Driveway Lights) first, then any other light in its room that no camera has yet.
  const shownCams = camList().slice(0, 4);
  const camLight = new Map(), used = new Set();
  for (const c of shownCams) {
    const words = c.name.toLowerCase().split(/\s+/).filter((wd) => wd.length > 3);
    const l = byType("light").find((x) => !used.has(x.id) && words.some((wd) => x.name.toLowerCase().includes(wd)));
    if (l) { camLight.set(c.id, l); used.add(l.id); }
  }
  for (const c of shownCams) {
    if (camLight.has(c.id)) continue;
    const l = byType("light").find((x) => x.room === c.room && !used.has(x.id));
    if (l) { camLight.set(c.id, l); used.add(l.id); }
  }
  const camLights = (c) => (camLight.has(c.id) ? [camLight.get(c.id)] : []);
  return el("div", { class: "ds s-evening" },
    el("div", { class: "ev-top" },
      el("div", { class: "ev-hello" },
        el("p", { class: "ev-greet" }, `${greetingWord()}!`),
        el("p", { class: "ev-date" }, "Today is ", liveClock("dateShort"), " · ", liveClock("time")),
        el("div", { class: "ev-chips" }, ...chipsWx.flat().filter(Boolean)),
        w?.source === "sample" ? el("p", { class: "ev-fine" }, "Sample weather for this demo") : null,
        el("div", { class: "ev-note briefing-card" },
          last ? el("div", { class: "brief" }, el("p", { class: "brief-title" }, last.title), el("p", {}, last.body)) : el("p", {}, lastReply || "Everything Haven notices shows up here."),
          el("button", { type: "button", class: "ghost", onclick: () => api("/api/briefing", {}) }, "Brief me now"))),
      el("section", { class: "ev-climate", "aria-label": "Climate and water" },
        el("div", { class: "ev-seg", role: "tablist", "aria-label": "Climate or water heater" }, segBtn("climate", "Climate"), wh ? segBtn("water", "Water heater") : null),
        evSeg === "water" && wh ? el("div", { class: "ev-pane", "data-device": wh.id, role: "tabpanel" },
          el("p", { class: "ev-big" }, wh.state.on ? `${targetOf(wh)}` : "Off", wh.state.on ? el("small", {}, "°F") : null),
          el("p", { class: "muted" }, `${wh.name} · ${describe(wh)}`),
          el("p", { class: "ev-ok" }, byType("leak").some((l) => l.state.wet) ? "A leak sensor is wet" : "Leak sensors dry"),
          heaterStepper(wh), el("div", { class: "row-between" }, el("span", { class: "muted small" }, "Power"), toggle("Water heater power", wh.state.on, () => send(wh.id, { on: !wh.state.on }))))
        : th ? el("div", { class: "ev-pane", "data-device": th.id, role: "tabpanel" },
          el("div", { class: "ev-now" },
            el("p", {}, el("b", {}, `${th.state.current}°F`), el("span", {}, "Inside now")),
            el("p", {}, el("b", {}, `${th.state.humidity ?? "--"}%`), el("span", {}, "Humidity"))),
          el("div", { class: "ev-track", role: "img", "aria-label": `Set to ${targetOf(th)}°F, on a scale of 60 to 80` },
            el("i", { style: `left:${clamp01((targetOf(th) - 60) / 20) * 100}%` })),
          el("div", { class: "ev-ctl" }, climateStepper(th), modeButtons(th)),
          el("div", { class: "feel", role: "group", "aria-label": "Tell Haven how it feels" }, ...feelButtons().slice(0, 2))) : null),
      el("section", { class: "ev-wx", "aria-label": "Weather forecast" },
        el("h2", {}, "Weather forecast"),
        w ? el("p", { class: "muted" }, (() => { const wet = w.daily.find((d) => d.precip >= 50); return wet ? `Rain likely ${wet.label} · ${wet.precip}%` : "No rain expected"; })(), w.source === "sample" ? " · sample" : "") : wxNotConnected(),
        wxRanges(4, "ev-ranges")),
      el("section", { class: "ev-scenes", "aria-label": "Scenes" },
        el("h2", {}, "Scenes"),
        ...sceneList().map(([id, label]) => el("button", { type: "button", class: "ev-scene", "data-scene": id, onclick: () => runScene(id) },
          el("span", { class: `ev-scene-bar sc-${id}`, "aria-hidden": "true" }),
          el("span", { class: "ev-scene-text" }, el("b", {}, label), el("span", {}, state.sceneInfo?.[id] || ""))))),
      el("div", { class: "ev-tools" }, dsStatus("ev-status"), dsTools())),
    asksBlock(),
    el("h2", { class: "ev-h" }, "Rooms"),
    el("div", { class: "ev-rooms" }, ...state.rooms.filter((r) => r.id !== "exterior" && allDevices().some((d) => d.room === r.id && CONTROL_TYPES.has(d.type))).map(roomCardE)),
    el("div", { class: "ev-cams" }, ...(shownCams.length ? shownCams.map((c) => el("div", { class: "ev-cam" },
      el("h2", {}, c.name), camFeed(c),
      el("div", { class: "ev-cam-lights" }, ...camLights(c).map((l) => el("button", { type: "button", role: "switch", "aria-checked": String(l.state.on), "aria-label": l.name, "data-device": l.id, onclick: () => send(l.id, { on: !l.state.on }) }, svg(ICON.light), shortName(l) + " light"))))) : [camNone()])));
}

// ----- 6 · Aurora: the bedroom; dims at night, and can wear its sleeper's own photo -----
function auroraScreen() {
  const th = byType("thermostat")[0];
  const here = bedRoom();
  const mine = allDevices().filter((d) => d.room === here && (d.type === "light" || d.type === "fan"));
  const lit = mine.filter((d) => d.type === "light" && d.state.on);
  const w = wxNow();
  const sec = secSummary();
  const feel = (f, room) => api("/api/feedback", { feeling: f, room }).then((r) => { reply(r.message); refresh(); });
  return el("div", { class: "ds s-aurora" },
    el("div", { class: "au-col" },
      el("div", { class: "au-card au-clock" },
        el("p", { class: "au-time" }, liveClock("hm"), el("small", {}, liveClock("ampm"))),
        el("p", { class: "au-date" }, liveClock("date"))),
      el("h2", { class: "au-h" }, roomName(here)),
      el("div", { class: "au-tiles" }, ...(mine.length ? mine.map((d) => lightTile(d, { cls: "au-tile" })) : [el("p", { class: "muted" }, "No lights or fans in this room.")])),
      el("div", { class: "au-bed" },
        bigButton("Goodnight", state.sceneInfo?.goodnight || "Lock up, lights off", () => runScene("goodnight"), "primary"),
        bigButton("Lights off", lit.length ? `${roomName(here)}: ${lit.length} on` : `${roomName(here)} is dark`, () => allOff(lit, `${roomName(here)} lights off.`)),
        th ? bigButton("Warmer", `Now ${targetOf(th)}°F`, () => feel("too_cold", here)) : null,
        th ? bigButton("Cooler", `Now ${targetOf(th)}°F`, () => feel("too_warm", here)) : null,
        state.scenes.morning ? bigButton("Good morning", state.sceneInfo?.morning || "", () => runScene("morning")) : null),
      el("div", { class: "night-photo" },
        el("button", { type: "button", class: "ghost night-photo-add", onclick: () => $("#night-file").click() }, nightPhoto() ? "Change photo" : "Add your photo"),
        nightPhoto() ? el("button", { type: "button", class: "ghost night-photo-remove", onclick: removeNightPhoto }, "Remove photo") : null,
        el("span", { class: "night-photo-note" }, `Stays on this ${roomName(here).toLowerCase()} panel.`))),
    el("div", { class: "au-col" },
      el("section", { class: "au-card au-wx", "aria-label": "Weather" },
        w ? [el("div", { class: "au-wx-now" }, el("span", { class: "au-wx-ic" }, wxIcon(w.current.condition, w.current.isDay)),
          el("div", {}, el("p", {}, w.current.text), w.source === "sample" ? el("p", { class: "au-fine" }, "Sample forecast") : null),
          el("p", { class: "au-wx-t" }, `${w.current.tempF}°`)),
        el("ul", { class: "ds-days" }, ...wxDays(4))] : wxNotConnected()),
      el("div", { class: `au-card au-sec lvl-${sec.level}` }, svg(ICON.shield), el("div", {}, el("p", { class: "au-sec-t" }, `${sec.short} · ${sec.mode[1]} mode`), el("p", { class: "au-fine" }, sec.headline))),
      dsIssues(), asksBlock(),
      th ? el("section", { class: "au-card au-thermo", "data-device": th.id, "aria-label": "Thermostat" },
        el("p", { class: "au-fine" }, shortName(th)), tempDial(th, { size: 180, stroke: 9, big: "target" }), climateStepper(th)) : null,
      el("div", { class: "au-tools" }, dsTools())),
    el("div", { class: "au-col" },
      el("h2", { class: "au-h" }, "Electricity"),
      el("p", { class: "au-pill" }, liveClock("dateShort"), ` · ${energyWord().toLowerCase()}`),
      el("section", { class: "au-card", "aria-label": "Electricity today" },
        el("p", { class: "au-fine" }, "Running total"),
        el("p", { class: "au-kwh" }, energy ? `${energy.todayKwh}` : "--", el("small", {}, " kWh so far")),
        runningTotal({ w: 300, h: 150, labels: false })),
      el("div", { class: "au-semis" },
        energy ? gauge(energy.nowKw / 5, { semi: true, size: 110, stroke: 9, label: `Right now, ${energyWord().toLowerCase()}`, value: `${energy.nowKw}`, unit: " kW", cls: "g-ok" }) : null,
        th ? gauge((th.state.humidity ?? 0) / 100, { semi: true, size: 110, stroke: 9, label: "Humidity", value: `${th.state.humidity ?? "--"}%`, cls: "g-cool" }) : null),
      el("h2", { class: "au-h" }, "Scenes"),
      ...sceneList().filter(([id]) => id !== "goodnight" && id !== "morning").map(([id, label]) => el("button", { type: "button", class: "au-scene", "data-scene": id, onclick: () => runScene(id) },
        el("b", {}, label), el("span", {}, state.sceneInfo?.[id] || "")))));
}

// ----- 7 · Portrait Classic: sections read top to bottom -----
function classicScreen() {
  const th = byType("thermostat")[0];
  const sec = secSummary();
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);
  const w = wxNow();
  const section = (title, icon, ...children) => el("section", { class: "cl-sec", "aria-label": title }, el("h2", {}, svg(icon), title), ...children.filter(Boolean));
  const locked = byType("lock").filter((l) => l.state.locked).length;
  const tile = (label, value, unit, icon, hue) => el("div", { class: "cl-tile" }, el("p", { class: "cl-tile-k" }, el("span", { class: "cl-chip", style: `--hue:${hue}` }, svg(icon)), label), el("p", { class: "cl-tile-v" }, value, el("small", {}, unit)));
  return el("div", { class: "ds s-classic" },
    el("header", { class: "cl-top" },
      el("p", { class: "cl-title" }, "Home overview"), el("p", { class: "cl-home" }, state.home), dsTools()),
    asksBlock(),
    el("div", { class: "cl-cols" },
      el("div", { class: "cl-col" },
        section("Today", ICON.bell,
          el("div", { class: "cl-card cl-clock" }, el("p", { class: "cl-time" }, liveClock("time")), el("p", {}, liveClock("dateShort"))),
          el("div", { class: "cl-card" }, dsStatus("cl-status"), el("p", { class: "cl-note" }, latestUpdates(1)[0] ? latestUpdates(1)[0][1].body : "Nothing new."))),
        section("Climate", ICON.climate,
          el("div", { class: "cl-card cl-wx" }, w ? [
            el("div", { class: "cl-wx-now" }, wxIcon(w.current.condition, w.current.isDay), el("div", {}, el("p", { class: "cl-wx-t" }, w.current.text), el("p", { class: "muted small" }, w.source === "sample" ? "Sample forecast" : "Forecast")), el("p", { class: "cl-wx-f" }, `${w.current.tempF} °F`)),
            el("ul", { class: "ds-days" }, ...wxDays(4))] : wxNotConnected()),
          th ? el("div", { class: "cl-card cl-thermo", "data-device": th.id },
            el("p", { class: "cl-card-t" }, roomName(th.room)), tempDial(th, { size: 190, big: "target" }), climateStepper(th), modeButtons(th)) : null),
        section("Lights", ICON.light,
          el("div", { class: "cl-pills" }, ...byType("light").map((l) => lightTile(l, { cls: "cl-pill" })), ...byType("fan").map((f) => lightTile(f, { cls: "cl-pill" }))))),
      el("div", { class: "cl-col" },
        section("Home", ICON.home,
          el("div", { class: "cl-tiles" },
            th ? tile("Inside", `${th.state.current}`, `°F · ${th.state.humidity ?? "--"}%`, ICON.climate, "#ff7043") : null,
            tile("Doors", locked === byType("lock").length ? "Locked" : `${byType("lock").length - locked} unlocked`, `${byType("lock").length} locks`, ICON.lock, locked === byType("lock").length ? "#43a047" : "#e8a33a"),
            valve ? tile("Water", valve.state.open ? "On" : "Off", wet.length ? "leak!" : "no leaks", ICON.water, wet.length || !valve.state.open ? "#e5534b" : "#1e88e5") : null,
            energy ? tile("Power now", `${energy.nowKw}`, energy.source === "estimate" ? "kW est." : "kW", ICON.bolt, "#f9a825") : null)),
        section("Cameras", DI.camera, el("div", { class: "cl-cams" }, ...(camList().length ? camList().slice(0, 2).map((c) => camFeed(c)) : [camNone()]))),
        section("Security", ICON.shield,
          el("div", { class: `cl-card cl-secline lvl-${sec.level}` }, svg(ICON.shield), el("div", {}, el("p", {}, `${sec.short} · ${sec.mode[1]} mode`), el("p", { class: "muted small" }, "Set by who's home and the time of day"))),
          el("ul", { class: "ds-rows cl-doors" }, ...entryPoints().map((d) => statusRow(d)))),
        section("Scenes", ICON.sparkle,
          el("div", { class: "cl-scenes" }, ...sceneList().map(([id, label]) => sceneButton(id, label, "cl-scene")))))));
}

// ----- 8 · Neon Frame: glowing outlines on black -----
function neonScreen() {
  const th = byType("thermostat")[0];
  const wh = byType("water_heater")[0];
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);
  const w = wxNow();
  const top = energy?.breakdown?.filter((p) => !p.name.startsWith("Always-on"))[0];
  const flowing = energy && energy.nowKw > 0;
  const flow = el("section", { class: "ne-card ne-flow", "aria-label": energy ? `Electricity: ${energy.nowKw} kilowatts from the grid now, ${energy.todayKwh} kilowatt hours today${top ? `; ${top.name.toLowerCase()} is using the most` : ""}. ${energyWord()}.` : "Electricity: loading" });
  flow.innerHTML = `<svg viewBox="0 0 240 230" aria-hidden="true" class="${flowing ? "on" : ""}">
    <path class="nf-glow" d="M60 100 H176"/><path class="nf-line" d="M60 100 H176"/>
    ${top ? `<path class="nf-line warm" d="M190 132 V176 Q190 192 174 192 H148"/>` : ""}
    <circle class="nf-node grid" cx="40" cy="100" r="28"/><text x="40" y="106" text-anchor="middle" class="nf-ic">⚡</text><text x="40" y="146" text-anchor="middle" class="nf-k">Grid</text>
    <circle class="nf-node home" cx="198" cy="100" r="30"/><text x="198" y="106" text-anchor="middle" class="nf-ic">⌂</text>
    <text x="198" y="48" text-anchor="middle" class="nf-k">Home today</text><text x="198" y="64" text-anchor="middle" class="nf-v">${energy ? `${energy.todayKwh} kWh` : "--"}</text>
    <text x="118" y="88" text-anchor="middle" class="nf-v big">${energy ? `${energy.nowKw} kW` : "--"}</text>
    ${top ? `<circle class="nf-node warm" cx="124" cy="192" r="22"/><text x="124" y="198" text-anchor="middle" class="nf-ic">♨</text><text x="124" y="226" text-anchor="middle" class="nf-k">${top.name.replace(/&/g, "&amp;").replace(/</g, "&lt;")} · top user</text>` : ""}
  </svg>`;
  flow.append(el("p", { class: "ne-foot" }, `${energyWord()} · `, el("button", { type: "button", class: "ne-link controls-open" }, "Open all controls")));
  const mini = (k, v, icon) => el("div", { class: "ne-card ne-mini" }, svg(icon), el("span", { class: "ne-mini-v" }, v), el("span", { class: "ne-mini-k" }, k));
  const listCard = (title, rows) => [el("h2", { class: "ne-h" }, title), el("ul", { class: "ne-card ds-rows ne-list" }, ...rows)];
  return el("div", { class: "ds s-neon" },
    el("div", { class: "ne-col" },
      el("div", { class: "ne-minis" }, th ? mini("Inside", `${th.state.current}°F`, ICON.climate) : null, th ? mini("Humidity", `${th.state.humidity ?? "--"}%`, ICON.water) : null),
      el("ul", { class: "ne-card ds-rows ne-list", "aria-label": "Doors and locks" }, ...entryPoints().map((d) => statusRow(d))),
      flow,
      el("div", { class: "ne-water" },
        el("div", { class: "ne-card ne-w" }, el("b", {}, wet.length ? "Leak" : "Dry"), el("span", {}, "Leak sensors")),
        valve ? el("div", { class: "ne-card ne-w" }, el("b", {}, valve.state.open ? "On" : "Off"), el("span", {}, "Main water")) : null,
        wh ? el("div", { class: "ne-card ne-w" }, el("b", {}, wh.state.on ? `${targetOf(wh)}°F` : "Off"), el("span", {}, "Water heater")) : null),
      dsStatus("ne-card ne-status")),
    el("div", { class: "ne-col" },
      el("div", { class: "ne-card ne-clock" }, el("p", { class: "ne-time" }, liveClock("time")), el("p", {}, liveClock("dateShort"))),
      el("div", { class: "ne-card ne-wx" }, w ? [wxIcon(w.current.condition, w.current.isDay), el("div", {}, el("p", { class: "ne-wx-t" }, w.current.text), el("p", { class: "ne-fine" }, w.source === "sample" ? "Sample forecast" : "Forecast")), el("p", { class: "ne-wx-f" }, `${w.current.tempF}°F`)] : wxNotConnected()),
      el("section", { class: "ne-card ne-chart", "aria-label": "Electricity today" },
        el("p", { class: "ne-chart-t" }, "Electricity today"),
        el("p", { class: "ne-fine" }, `Running total, ${energyWord().toLowerCase()} · ${energy ? energy.todayKwh : "--"} kWh`),
        runningTotal({ w: 420, h: 220 })),
      ...listCard("Outside lights", byType("light").filter((l) => l.room === "exterior").map((l) => switchRow(l))),
      dsIssues(), asksBlock(), dsTools("ne-tools")),
    el("div", { class: "ne-col" },
      ...(camList().length ? camList().slice(0, 3).map((c, i) => camFeed(c, `ne-cam ne-cam-${i}`)) : [camNone("ne-card")]),
      el("h2", { class: "ne-h" }, "Climate"),
      el("div", { class: "ne-card ne-climate" },
        th ? el("div", { class: "ne-cl-row", "data-device": th.id }, el("span", { class: "ne-cl-ic" }, svg(ICON.climate)), el("span", {}, shortName(th)), el("span", { class: "ne-cl-v" }, el("b", {}, `Hold ${targetOf(th)}°F`), el("br"), `Now ${th.state.current}°F`)) : null,
        th ? climateStepper(th, "ne-step") : null,
        wh ? el("div", { class: "ne-cl-row", "data-device": wh.id }, el("span", { class: "ne-cl-ic" }, svg(ICON.heater)), el("span", {}, wh.name), el("span", { class: "ne-cl-v" }, el("b", {}, wh.state.on ? `${targetOf(wh)}°F` : "Off"), el("br"), describe(wh).replace(/^\d+°F · /, ""))) : null),
      ...listCard("Lighting control", [...byType("light").filter((l) => l.room !== "exterior"), ...byType("fan")].map((d) => switchRow(d)))));
}

// ----- 9 · Lagoon: deep blue, the house itself, Home and Away, and Haven's voice -----
function lagoonScreen() {
  const th = byType("thermostat")[0];
  const sec = secSummary();
  const w = wxNow();
  const front = byType("lock")[0];
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);
  const home = state.people.filter((p) => p.home);
  const v = state.voice;
  const lit = byType("light").filter((l) => l.state.on);
  const two = ["home", "away"].filter((id) => state.scenes[id]);
  const stat = (k, val, icon) => el("div", { class: "la-stat" }, svg(icon), el("span", {}, el("span", { class: "la-stat-k" }, k), el("b", {}, val)));
  return el("div", { class: "ds s-lagoon" },
    el("header", { class: "la-top" },
      el("nav", { class: "la-nav", "aria-label": "Panel" },
        el("button", { type: "button", "aria-pressed": "true", "aria-label": "Overview" }, svg(DI.grid)),
        el("button", { type: "button", class: "controls-open", "aria-label": "All controls" }, svg(DI.sliders)),
        camList()[0] ? el("button", { type: "button", "aria-label": "Cameras", onclick: () => openCamera(camList()[0].id) }, svg(DI.camera)) : null,
        el("button", { type: "button", class: "screens-open", "aria-haspopup": "dialog", "aria-label": "Screens" }, svg(ICON.sparkle))),
      el("p", { class: "la-home" }, state.home)),
    dsIssues(), asksBlock(),
    el("div", { class: "la-grid" },
      el("div", { class: "la-col" },
        el("section", { class: "la-card la-wx", "aria-label": "Weather" },
          el("div", { class: "la-wx-head" },
            w ? el("span", { class: "la-wx-ic" }, wxIcon(w.current.condition, w.current.isDay)) : null,
            el("div", { class: "la-wx-side" },
              w ? el("p", { class: "la-wx-now" }, `${w.current.text}, ${w.current.tempF}°`, wxSampleTag()) : null,
              el("p", { class: "la-clock" }, liveClock("hm")),
              el("p", { class: "la-date" }, liveClock("numeric")))),
          w ? wxRanges(4, "la-ranges") : wxNotConnected()),
        el("div", { class: "la-pair" },
          el("div", { class: "la-card la-io" }, el("p", { class: "la-io-k" }, "Outside"), el("p", { class: "la-io-v" }, w ? `${w.current.tempF}` : outdoorF() ?? "--", el("small", {}, "°F")), el("p", { class: "la-io-n" }, w?.source === "sample" ? "Sample" : w ? "Forecast" : outdoorF() != null ? "Your sensor" : "Not connected")),
          th ? el("div", { class: "la-card la-io" }, el("p", { class: "la-io-k" }, "Inside"), el("p", { class: "la-io-v" }, `${th.state.current}`, el("small", {}, "°F")), el("p", { class: "la-io-n" }, `Holding ${targetOf(th)}° · ${th.state.humidity ?? "--"}%`)) : null)),
      el("div", { class: "la-col" },
        el("section", { class: "la-card la-house", "aria-label": "The house" },
          el("div", { class: "la-house-head" }, el("p", {}, room === "all" ? "Home" : roomName(room)),
            el("p", { class: "la-house-sub" }, lit.length ? `${lit.length} light${lit.length === 1 ? "" : "s"} on` : "Lights off", ` · ${sec.short}`)),
          houseBox()),
        v?.choices?.length ? el("section", { class: "la-card la-voice", "aria-label": "Haven's voice" },
          el("p", { class: "la-voice-t" }, "Haven's voice", el("span", {}, "Chosen by your home")),
          el("div", { class: "la-voices", role: "radiogroup", "aria-label": "Haven's voice" }, ...v.choices.map((c) => el("button", {
            type: "button", role: "radio", "aria-checked": String(v.choice === c.id), "data-voice": c.id,
            onclick: async () => {
              if (v.choice === c.id) return;
              const r = await api("/api/voice", { voice: c.id });
              if (!r?.choices) { showHint(r?.error || "That voice couldn't be saved. Try again."); return; }
              state.voice = r;
              renderAlt();
              showHint(`Haven will speak as ${c.name} on every panel.`);
              if (speakAloud) voice.speak("Hello. This is how I'll sound in your home.");
            },
          }, el("b", {}, c.name), el("span", {}, c.about.split("·")[0].trim())))),
          el("p", { class: "la-voice-n" }, v.provider === "elevenlabs" ? "Every panel speaks with it." : "Saved for the whole home. These natural voices need the premium voice on the home server; until then panels use the tablet's own.")) : null),
      el("div", { class: "la-col" },
        el("div", { class: "la-scenes" }, ...(two.length ? two : sceneList().slice(0, 2).map(([id]) => id)).map((id) => scenePhoto(id, state.scenes[id], "la-scene"))),
        el("div", { class: "la-stats" },
          stat("Who's home", home.length ? home.map((p) => p.name).join(", ") : "Everyone away", DI.person),
          stat("Security", `${sec.short} · ${sec.mode[1]}`, ICON.shield),
          front ? stat(shortName(front), secState(front)[1], ICON.lock) : null,
          valve ? stat("Water", `${valve.state.open ? "On" : "Off"} · ${wet.length ? "leak" : "dry"}`, ICON.water) : null),
        dsTools("la-tools"))));
}

// ---------- Wallpaper screen ----------
// The home's photo fills the screen (it follows the time of day, or the
// homeowner's own picture); frosted tiles float on it in columns, each with
// a colored icon for what it controls.
const HUE = { light: "#f0a93b", fan: "#43c47f", heat: "#ef7d3c", cool: "#3a8fe0", idle: "#37b3c8", water: "#3aa0e8", garage: "#9b7bff", ok: "#43c07a", bad: "#ff6b5e", door: "#8fa1b8", energy: "#f2c23a", humidity: "#8c8cff", weather: "#f5b64a", scenes: "#c38bff", updates: "#6fb3ff" };

function wpTile(hue, { cls = "", on = false, alert = false, id, card } = {}, ...children) {
  return el("div", { class: `wp-tile${on ? " on" : ""}${alert ? " alert" : ""}${cls ? ` ${cls}` : ""}`, style: `--hue:${hue}`, "data-device": id, "data-card": card }, ...children);
}
function wpHead(icon, name, stateText, ...extra) {
  return el("div", { class: "wp-head" },
    el("span", { class: "badge-ic" }, svg(icon)),
    el("div", { class: "wp-text" }, el("span", { class: "wp-name" }, name), stateText ? el("span", { class: "wp-state" }, stateText) : null),
    ...extra);
}
const wpSection = (title, icon, ...children) => el("section", { class: "wp-sec", "aria-label": title },
  el("h2", {}, svg(icon), title), ...children.filter(Boolean));

function localClock() {
  const tz = state.timezone;
  try {
    return {
      time: new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date()),
      date: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    };
  } catch { return { time: "", date: "" }; }
}

function weatherCard() {
  const { time, date } = localClock();
  const outdoor = byType("temperature")[0];
  if (!weather?.available) {
    return wpTile(HUE.weather, { cls: "wp-weather span2", card: "weather" },
      el("div", { class: "wx-now" },
        outdoor ? el("div", { class: "wx-cond" }, el("p", { class: "wx-temp" }, `${outdoor.state.value}°F outside`), el("p", { class: "wp-state" }, "From your outdoor sensor")) : null,
        el("div", { class: "wx-clock" }, el("p", { class: "wx-time" }, time), el("p", { class: "wx-date" }, date))),
      el("p", { class: "wx-note" }, "The forecast isn't connected yet. Your installer can add it with your location or a Home Assistant weather entity."));
  }
  const c = weather.current;
  const lo = Math.min(...weather.daily.map((d) => d.lowF));
  const hi = Math.max(...weather.daily.map((d) => d.highF));
  const span = Math.max(1, hi - lo);
  const updated = weather.source === "sample" ? "Sample weather for the demo" : `${weather.source === "homeassistant" ? "Home Assistant" : "Open-Meteo"} · updated ${timeAgo(weather.updated)}${weather.stale ? " (can't reach it right now)" : ""}`;
  return wpTile(HUE.weather, { cls: "wp-weather span2", card: "weather" },
    el("div", { class: "wx-now" },
      el("span", { class: "wx-big" }, wxIcon(c.condition, c.isDay)),
      el("div", { class: "wx-cond" },
        el("p", { class: "wx-temp" }, `${c.tempF}°F`),
        el("p", { class: "wp-state" }, `${c.text}${c.humidity != null ? ` · ${c.humidity}% humidity` : ""}`)),
      el("div", { class: "wx-clock" }, el("p", { class: "wx-time" }, time), el("p", { class: "wx-date" }, date))),
    el("ul", { class: "wx-days", "aria-label": "Next days" }, ...weather.daily.map((d) =>
      el("li", { "aria-label": `${d.label}: ${d.text}, low ${d.lowF}°F, high ${d.highF}°F` },
        el("span", { class: "wx-day", "aria-hidden": "true" }, d.label),
        el("span", { "aria-hidden": "true" }, wxIcon(d.condition)),
        el("span", { class: "wx-lo", "aria-hidden": "true" }, `${d.lowF}°`),
        el("span", { class: "wx-range", "aria-hidden": "true" }, el("i", { style: `left:${((d.lowF - lo) / span) * 100}%;width:${Math.max(6, ((d.highF - d.lowF) / span) * 100)}%` })),
        el("span", { class: "wx-hi", "aria-hidden": "true" }, `${d.highF}°`)))),
    el("ol", { class: "wx-hours", "aria-label": "Next hours" }, ...weather.hourly.slice(0, 6).map((h) =>
      el("li", { "aria-label": `${h.label}: ${h.tempF}°F, ${h.text}${h.precip ? `, ${h.precip}% chance of rain` : ""}` },
        el("span", { class: "wx-h", "aria-hidden": "true" }, h.label),
        el("span", { "aria-hidden": "true" }, wxIcon(h.condition, h.isDay)),
        el("span", { class: "wx-t", "aria-hidden": "true" }, `${h.tempF}°`),
        el("span", { class: "wx-p", "aria-hidden": "true" }, h.precip >= 20 ? `${h.precip}%` : "")))),
    el("p", { class: "wx-source" }, updated));
}

function sparkline(samples) {
  const W = 300, H = 64;
  const box = el("div", { class: "spark" });
  if (!samples?.length) return box;
  const max = Math.max(...samples.map((p) => p.kw), 0.5) * 1.1;
  const pts = samples.map((p) => [(p.minute / 1440) * W, H - (p.kw / max) * (H - 4)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-area" d="${line}L${pts.at(-1)[0].toFixed(1)} ${H}L${pts[0][0].toFixed(1)} ${H}Z"/><path class="spark-line" d="${line}"/></svg>`;
  return box;
}

function powerTile() {
  if (!energy) return null;
  const measured = energy.source !== "estimate";
  const peak = energy.peak ? ` Peak ${energy.peak.kw} kW at ${new Date(Date.UTC(2000, 0, 1, 0, energy.peak.minute)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}.` : "";
  return wpTile(HUE.energy, { cls: "span2 wp-power", card: "power" },
    wpHead(ICON.bolt, "Electricity", measured ? "Measured by your energy monitor" : "Estimated from what each device is doing",
      el("p", { class: "wp-big" }, `${energy.nowKw}`, el("span", {}, " kW"))),
    el("div", { role: "img", "aria-label": `Electricity today: ${energy.todayKwh} kWh so far, ${energy.nowKw} kW now.${peak}` }, sparkline(energy.samples)),
    el("p", { class: "wp-state" }, `${energy.todayKwh} kWh today.${peak}`));
}

function metricTile(hue, icon, label, value, unit, card) {
  return wpTile(hue, { card, cls: "wp-metric" },
    el("div", { class: "wp-head" }, el("span", { class: "badge-ic" }, svg(icon)), el("p", { class: "wp-big" }, value, el("span", {}, unit))),
    el("p", { class: "wp-state" }, label));
}

function wpClimate(d) {
  const s = d.state;
  const hue = s.hvac === "heating" ? HUE.heat : s.hvac === "cooling" ? HUE.cool : HUE.idle;
  return wpTile(hue, { cls: "span2", on: s.hvac === "heating" || s.hvac === "cooling", id: d.id },
    wpHead(ICON.climate, "Climate", describe(d)),
    el("div", { class: "pill-stepper" },
      el("button", { "aria-label": "Cooler by 1°F", onclick: () => stepTarget(d, -1) }, "−"),
      el("span", { class: "target" }, `${targetOf(d)}°F`),
      el("button", { "aria-label": "Warmer by 1°F", onclick: () => stepTarget(d, 1) }, "+")),
    el("div", { class: "seg wp-seg", role: "group", "aria-label": "Mode" },
      ...MODES.map(([m, label]) => el("button", { "aria-pressed": String(s.mode === m), onclick: () => send(d.id, { mode: m }) }, label))));
}

function wpFan(d) {
  const s = d.state;
  return wpTile(HUE.fan, { on: s.on, id: d.id, cls: "span2" },
    wpHead(ICON.fan, d.name, describe(d), toggle(d.name, s.on, () => send(d.id, { on: !s.on }))),
    s.on ? el("div", { class: "seg wp-seg", role: "group", "aria-label": `${d.name} speed` },
      ...[1, 2, 3].map((n) => el("button", { "aria-pressed": String(s.speed === n), "aria-label": `Speed ${n}`, onclick: () => send(d.id, { speed: n }) }, String(n)))) : null);
}

function wpWaterHeater(d) {
  if (!d) return null;
  const s = d.state;
  return wpTile(HUE.heat, { on: s.on, id: d.id, cls: "span2" },
    wpHead(ICON.heater, d.name, describe(d), toggle("Water heater power", s.on, () => send(d.id, { on: !s.on }))),
    s.on ? el("div", { class: "pill-stepper" },
      el("button", { "aria-label": "Lower 5°F", onclick: () => stepTarget(d, -5) }, "−"),
      el("span", { class: "target" }, `${targetOf(d)}°F`),
      el("button", { "aria-label": "Raise 5°F", onclick: () => stepTarget(d, 5) }, "+")) : null);
}

function wpLight(d) {
  const s = d.state;
  // The round icon is the on/off switch, as on the reference dashboards.
  return wpTile(HUE.light, { on: s.on, id: d.id },
    el("div", { class: "wp-head" },
      el("button", { class: "badge-ic", role: "switch", "aria-checked": String(s.on), "aria-label": d.name, onclick: () => send(d.id, { on: !s.on }) }, svg(ICON.light)),
      el("div", { class: "wp-text" }, el("span", { class: "wp-name" }, d.name.replace(/ Lights?$/, "")), el("span", { class: "wp-state" }, s.on ? `${s.brightness}%` : "Off"))),
    el("input", {
      type: "range", class: `pill-range${s.on ? "" : " off"}`, min: "5", max: "100", step: "5", value: String(s.brightness),
      "aria-label": `${d.name} brightness`, "aria-valuetext": s.on ? `${s.brightness}%` : `Off (${s.brightness}% when on)`, style: `--fill:${s.brightness}%`,
      oninput: (e) => e.target.style.setProperty("--fill", `${e.target.value}%`),
      onchange: (e) => send(d.id, { on: true, brightness: Number(e.target.value) }),
    }));
}

function wpSecure(d) {
  const s = d.state;
  const alert = isAlert(d);
  const spec = {
    garage: [ICON.garage, alert ? HUE.bad : HUE.garage, [s.door === "closed" ? "Open" : "Close", () => send(d.id, { door: s.door === "closed" ? "open" : "closed" })]],
    lock: [ICON.lock, alert ? HUE.bad : HUE.ok, [s.locked ? "Unlock" : "Lock", () => send(d.id, { locked: !s.locked })]],
    water_valve: [ICON.water, alert ? HUE.bad : HUE.water, [s.open ? "Shut off" : "Turn on", () => send(d.id, { open: !s.open }), s.open ? "danger" : "primary"]],
    contact: [ICON.door, alert ? HUE.bad : HUE.door, null],
  }[d.type];
  const [icon, hue, action] = spec;
  const text = describe(d);
  return wpTile(hue, { id: d.id, alert },
    wpHead(icon, d.name.replace(/ Lock$/, "").replace(/^Main /, ""), text[0].toUpperCase() + text.slice(1)),
    action ? el("button", { class: `wp-action ${action[2] || ""}`, onclick: action[1] }, action[0]) : null);
}

function wallpaperScreen() {
  const th = byType("thermostat")[0];
  const list = issues();
  const hs = houseState();
  const secure = [...byType("garage"), ...byType("lock"), ...byType("water_valve"), ...byType("contact")];
  const lit = byType("light").filter((l) => l.state.on);
  const recent = feed.map((e) => [e, feedItem(e)]).filter(([, f]) => f).slice(-3).reverse();
  return el("div", { class: "wp" },
    el("header", { class: "wp-top" },
      el("div", { class: "wp-title" },
        el("p", { class: "eyebrow" }, state.home),
        el("div", { class: "status", "data-state": hs },
          el("span", { class: "status-mark", "aria-hidden": "true" }),
          el("div", { class: "status-text" },
            el("p", { class: "status-headline" }, hs === "alert" ? "Needs your attention now" : list.length ? `${list.length} ${list.length === 1 ? "thing needs" : "things need"} attention` : state.pending.length ? "Waiting for your OK" : "All secure"),
            el("ul", { class: "issues" }, ...list.map((i) => el("li", { class: `issue ${i.level}` }, i.text, i.action && el("button", { onclick: i.action[1] }, i.action[0]))))))),
      el("div", { class: "wp-tools" },
        el("button", { type: "button", class: "controls-open" }, "All controls"),
        el("button", { class: "screens-open", "aria-haspopup": "dialog" }, "Screens"))),
    asksBlock(),
    el("div", { class: "wp-grid" },
      wpSection("Main", ICON.home,
        el("div", { class: "wp-tiles" },
          weatherCard(),
          metricTile(HUE.heat, ICON.climate, "Temperature inside", `${th.state.current}`, "°F", "indoor-temp"),
          metricTile(HUE.humidity, ICON.water, "Humidity inside", `${th.state.humidity ?? "--"}`, "%", "indoor-humidity"),
          powerTile())),
      wpSection("Climate", ICON.climate,
        el("div", { class: "wp-tiles" }, wpClimate(th), ...byType("fan").map(wpFan), wpWaterHeater(byType("water_heater")[0]))),
      wpSection("Lights", ICON.light,
        el("div", { class: "wp-tiles" }, ...byType("light").map(wpLight)),
        lit.length ? el("button", { class: "wp-wide", onclick: () => Promise.all(lit.map((l) => api(`/api/devices/${l.id}`, { command: { on: false } }))).then(() => showResult({ message: "All lights off." })) },
          lit.length === 1 ? "Turn off the light that's on" : lit.length === 2 ? "Turn off both lights" : `Turn off all ${lit.length} lights`) : null),
      wpSection("Doors & water", ICON.shield,
        el("div", { class: "wp-tiles" }, ...secure.map(wpSecure)),
        list.length ? el("button", { class: "wp-wide primary", onclick: lockUp }, "Lock up") : null),
      wpSection("Scenes", ICON.sparkle,
        el("div", { class: "wp-scenes" }, ...Object.entries(state.scenes).map(([id, label]) =>
          el("button", { class: "scene", "data-scene": id, onclick: () => api(`/api/scenes/${id}`, {}).then(showResult) }, el("span", {}, label))))),
      wpSection("Updates", ICON.bell,
        wpTile(HUE.updates, { cls: "wp-updates" },
          recent.length ? el("ol", { class: "feed" }, ...recent.map(([e, f]) =>
            el("li", { class: f.urgent ? "urgent" : "" }, el("span", { class: "when" }, timeAgo(e.ts)), el("span", { class: "title" }, f.title), el("span", {}, f.body))))
            : el("p", { class: "wp-state" }, "Nothing new."),
          el("button", { class: "ghost", onclick: () => api("/api/briefing", {}) }, "Brief me now")))));
}

// The Wallpaper screen's photo: Haven's (by time of day) or the homeowner's
// own, kept on this panel only.
function applyWallpaperPhoto() {
  const custom = wallpaperPhoto || safeGet("haven.wallpaper");
  if (custom) $("#app").style.setProperty("--wp-photo", `url("${custom}")`);
  else $("#app").style.removeProperty("--wp-photo");
  $("#wp-reset").hidden = !custom;
}
// A photo from the homeowner's device, scaled down and saved as a JPEG so it
// fits in the panel's storage.
async function readPhoto(file, maxW, maxH) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
const keep = (key, value) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); return true; } catch { return false; } };

let wallpaperPhoto = null;
$("#wp-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file || !file.type.startsWith("image/")) return;
  try {
    wallpaperPhoto = await readPhoto(file, 1920, 1200);
    const kept = keep("haven.wallpaper", wallpaperPhoto);
    applyWallpaperPhoto();
    showHint(kept ? "Your photo is now the wallpaper on this panel." : "Your photo is on screen, but it's too large to keep after a restart.");
  } catch {
    showHint("That photo couldn't be opened. Try a JPEG or PNG.");
  }
});
$("#wp-reset").addEventListener("click", () => {
  wallpaperPhoto = null;
  keep("haven.wallpaper", null);
  applyWallpaperPhoto();
  showHint("Back to Haven's photos, which follow the time of day.");
});

// The bedroom photo (on the Aurora screen): each bedroom's own, chosen by whoever sleeps
// there and kept on that room's panel only (one per room, so a shared panel in the hallway
// never shows someone's bedroom photo). Stored as haven.nightstand.<room>, as it always was.
const nightPhotos = new Map(); // room -> photo, for when storage is full or blocked
const nightRoom = () => panelRoom || "primary";
const nightPhoto = (r = nightRoom()) => nightPhotos.get(r) || safeGet(`haven.nightstand.${r}`);
function applyNightPhoto() {
  const photo = screen === "aurora" && !controlsOpen ? nightPhoto() : null;
  $("#app").classList.toggle("has-night-photo", Boolean(photo));
  if (photo) $("#app").style.setProperty("--night-photo", `url("${photo}")`);
  else $("#app").style.removeProperty("--night-photo");
}
$("#night-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file || !file.type.startsWith("image/")) return;
  const r = nightRoom();
  try {
    const photo = await readPhoto(file, 1600, 1600);
    nightPhotos.set(r, photo);
    const kept = keep(`haven.nightstand.${r}`, photo);
    render();
    showHint(kept ? `Your photo is on the ${roomName(r).toLowerCase()} panel.` : "Your photo is on screen, but it's too large to keep after a restart.");
  } catch {
    showHint("That photo couldn't be opened. Try a JPEG or PNG.");
  }
});
function removeNightPhoto() {
  const r = nightRoom();
  nightPhotos.delete(r);
  keep(`haven.nightstand.${r}`, null);
  render();
  showHint("Photo removed from this panel.");
}

const SCREEN_VIEW = { command: commandScreen, wallpaper: wallpaperScreen, glass: glassScreen, wall: wallScreen, evening: eveningScreen, aurora: auroraScreen, console: consoleScreen, classic: classicScreen, neon: neonScreen, lagoon: lagoonScreen };
let introFor = null; // a screen draws itself in once when it opens, not on every live update
function renderAlt() {
  const alt = $("#alt");
  const view = (SCREEN_VIEW[screen] || commandScreen)();
  if (introFor !== screen) { introFor = screen; view.classList.add("intro"); }
  alt.replaceChildren(view);
  loadCameraPictures();
  const slot = alt.querySelector(".chart-slot");
  if (slot && energy) renderEnergyChart(slot, energy, slot.clientWidth || 600);
}

// ---------- model home showcase ----------
// For a builder's model home: when nobody has touched the panel for a
// while, Haven shows what it does with a short live tour of scenes (the
// same ones a homeowner would tap, through the same safety checks). It
// never runs while something needs attention, and any touch stops it.
const SHOWCASE = [
  ["home", "Welcome home. I turned the lights on and set a comfortable temperature."],
  ["movie", "Movie night. Lights down low, all with one word."],
  ["goodnight", "Goodnight. Doors locked, garage closed, lights off, and the house cooled for sleep."],
  ["morning", "Good morning. Warm light, a comfortable temperature, and the day's weather ready."],
];
let showcaseOn = safeGet("haven.showcase") === "on";
const showcase = { idleTimer: 0, stepTimer: 0, running: false, step: 0, returnTo: null };
const showcaseIdleMs = () => Number(safeGet("haven.showcaseIdleMs")) || 60_000;
function armShowcase() {
  clearTimeout(showcase.idleTimer);
  if (showcaseOn && !showcase.running) showcase.idleTimer = setTimeout(startShowcase, showcaseIdleMs());
}
function startShowcase() {
  if (!showcaseOn || !state || houseState() === "alert" || state.pending.length) return armShowcase();
  showcase.running = true;
  showcase.returnTo = screen;
  $("#showcase-banner").hidden = false;
  if (screen !== "glass" || controlsOpen) { screen = "glass"; controlsOpen = false; room = "all"; render(); }
  runShowcaseStep();
}
async function runShowcaseStep() {
  if (!showcase.running) return;
  if (houseState() === "alert") return stopShowcase();
  const [scene, line] = SHOWCASE[showcase.step++ % SHOWCASE.length];
  await api(`/api/scenes/${scene}`, {});
  if (!showcase.running) return;
  reply(line);
  refresh();
  showcase.stepTimer = setTimeout(runShowcaseStep, 14_000);
}
function stopShowcase() {
  if (showcase.running) {
    showcase.running = false;
    clearTimeout(showcase.stepTimer);
    $("#showcase-banner").hidden = true;
    if (showcase.returnTo && showcase.returnTo !== screen) { screen = showcase.returnTo; render(); }
  }
  armShowcase();
}
window.addEventListener("pointerdown", stopShowcase, true);
window.addEventListener("keydown", stopShowcase, true);
$("#showcase-toggle").setAttribute("aria-checked", String(showcaseOn));
$("#showcase-toggle").addEventListener("click", () => {
  showcaseOn = !showcaseOn;
  safeSet("haven.showcase", showcaseOn ? "on" : "off");
  $("#showcase-toggle").setAttribute("aria-checked", String(showcaseOn));
  showHint(showcaseOn ? "Showcase on: after a minute untouched, Haven gives a live tour." : "Showcase off.");
  armShowcase();
});

// ---------- render and live updates ----------
function render() {
  const alt = !controlsOpen;
  $("#app").classList.toggle("alt-mode", alt);
  $("#app").classList.toggle("controls-mode", !alt);
  $("#app").dataset.screen = alt ? screen : "controls"; // All controls wears the finish, not the screen's colors
  $("#alt").hidden = !alt;
  $("#controls-close").textContent = `Back to ${screenName(screen)}`;
  applyLook();
  // Every designed screen is dark, so the house wears its evening light there.
  if (alt && screen !== "wallpaper") $("#app").dataset.mood = "evening"; else delete $("#app").dataset.mood;
  applyNightPhoto();
  if (alt) {
    $("#app").dataset.daypart = state.daypart || "evening";
    $("#orb").dataset.house = houseState();
    renderAlt();
  } else {
    $("#alt").replaceChildren(); // nothing of the screen lingers, hidden, behind All controls
    renderStage();
    renderAsks();
    renderScenes();
    renderHome();
  }
  renderExplorer();
  renderFeed();
  $("#t-sim").hidden = state.adapter !== "simulator";
  $("#footer").textContent = demo
    ? "Demo house: devices are simulated and Haven uses its built-in command parser."
    : `Devices: ${state.adapter} · AI: ${state.agent.kind === "claude" ? state.agent.model : "offline mode"} · Alerts: ${state.channels.join(", ")}`;
}

let refreshTimer;
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    [state, energy, weather, cams] = await Promise.all([api("/api/state"), api("/api/energy"), api("/api/weather"), api("/api/cameras")]);
    for (const [id, p] of pendingTarget) if (p.settled) pendingTarget.delete(id);
    render();
    if (tab === "you") loadProfile();
  }, 120);
}

function onEvent(e) {
  noteAgents(e);
  feed.push(e);
  if (feed.length > 300) feed.shift();
  if (started) {
    // Haven speaks up for briefings and anything urgent.
    if (e.type === "briefing") reply(`${e.title}. ${e.body}`);
    else if (e.type === "notification" && e.priority === "urgent") reply(`${e.title}. ${e.body}`);
    else if (e.type === "doorbell") {
      reply(`Someone's at the door. The ${e.name} camera is showing who.`);
      // The panel by the front door shows them right away; the others say so.
      if (screen === "console" && !$("#camera-view").open) openCamera(e.camera);
    }
  }
  refresh();
}

function connect() {
  if (demo) {
    demo.subscribe(onEvent);
    $("#conn").classList.add("live");
    return;
  }
  const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
  es.onopen = () => $("#conn").classList.add("live");
  es.onerror = () => $("#conn").classList.remove("live");
  es.onmessage = (m) => onEvent(JSON.parse(m.data));
}

async function start() {
  if (!token) return showLogin();
  try {
    [state, feed, energy, weather, cams] = await Promise.all([api("/api/state"), api("/api/events?limit=150"), api("/api/energy"), api("/api/weather"), api("/api/cameras")]);
  } catch {
    return;
  }
  $("#app").hidden = false;
  applyWallpaperPhoto();
  renderFeel();
  simButtons();
  render();
  connect();
  started = true;
  armShowcase();
  setInterval(tickClock, 15_000);
  setInterval(() => { renderFeed(); refresh(); }, 60_000);
}

start();
