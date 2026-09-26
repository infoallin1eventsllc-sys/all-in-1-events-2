// Haven wall panel: the room, the house status, controls, conversation by
// voice or text, and what Haven has learned about the homeowner.
//
// Talks to the Haven home server over HTTP. In the browser-only demo build,
// window.HavenDemo provides the same API in the page, backed by a simulated
// house, so the app code is identical in both.
import { createVoice } from "./voice.js";
import { renderMap } from "./map.js";
import { renderEnergyChart } from "./energy-chart.js";

const $ = (sel) => document.querySelector(sel);
const demo = window.HavenDemo || null;
let token = demo ? "demo" : safeGet("haven.token");
let state = null;
let feed = [];
let profile = { items: [], suggestions: [] };
let energy = null;
let room = "all";
let tab = "home";
let speakAloud = safeGet("haven.speak") !== "off";
let started = false;

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
};

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

// ---------- look switch ----------
function setLook(look) {
  document.documentElement.setAttribute("data-look", look);
  safeSet("haven.look", look);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", look === "futuristic" ? "#05060b" : "#17130f");
  for (const b of document.querySelectorAll(".look-switch button")) b.setAttribute("aria-pressed", String(b.dataset.look === look));
}
for (const b of document.querySelectorAll(".look-switch button")) b.addEventListener("click", () => setLook(b.dataset.look));
setLook(document.documentElement.getAttribute("data-look") || "grounded");

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
const pendingTarget = new Map();
const targetOf = (d) => pendingTarget.get(d.id) ?? d.state.target;
function stepTarget(d, delta) {
  const next = targetOf(d) + delta;
  pendingTarget.set(d.id, next);
  renderHome();
  return send(d.id, { target: next }).finally(() => {
    if (pendingTarget.get(d.id) === next) { pendingTarget.delete(d.id); renderHome(); }
  });
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

  renderMap($("#map"), {
    rooms: state.rooms,
    devicesIn: (id) => allDevices().filter((d) => d.room === id),
    selected: room,
    onSelect: (id) => { room = room === id ? "all" : id; render(); },
  });

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

function tile(d, { icon, name, stateText, on = false, alert = false, head = [], body = [], wide = false, id }) {
  return el("div", { class: `tile${on ? " on" : ""}${alert ? " alert" : ""}${wide ? " wide" : ""}`, "data-device": id || d?.id || "" },
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
      return tile(d, { icon: ICON.light, name: d.name, stateText: describe(d), on: s.on,
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
  $("#feel").replaceChildren(...FEELINGS.map(([f, label]) => el("button", {
    onclick: async () => {
      say("you", label);
      const r = await api("/api/feedback", { feeling: f, room: room === "all" ? undefined : room });
      reply(r.message);
      refresh();
    },
  }, label)));
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

function reply(text, { spoken = true } = {}) {
  if (!text) return;
  say("haven", text);
  if (speakAloud && spoken) voice.speak(text);
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

const voice = createVoice({
  onInterim: showInterim,
  onFinal: (text) => ask(text),
  onState(s, message) {
    $("#orb").dataset.voice = s === "unavailable" || s === "error" ? "idle" : s;
    $("#mic").setAttribute("aria-pressed", String(s === "listening"));
    if (s === "listening") { showHint("Listening… tap the mic again to stop."); showInterim(""); }
    if (s !== "listening" && interimNode?.textContent === "Listening…") { interimNode.remove(); interimNode = null; }
    if (message) showHint(message);
  },
});
if (!voice.canListen) $("#mic").classList.add("unavailable");
$("#speak").setAttribute("aria-pressed", String(speakAloud && voice.canSpeak));
if (!voice.canSpeak) $("#speak").hidden = true;

$("#mic").addEventListener("click", () => {
  if (!voice.canListen) { showHint(voice.whyNot); return; }
  voice.listen();
});
$("#speak").addEventListener("click", () => {
  speakAloud = !speakAloud;
  safeSet("haven.speak", speakAloud ? "on" : "off");
  $("#speak").setAttribute("aria-pressed", String(speakAloud));
  if (!speakAloud) voice.silence();
  showHint(speakAloud ? "Haven will speak out loud." : "Haven will stay quiet and show its replies.");
});

async function ask(text) {
  say("you", text);
  $("#orb").dataset.voice = "thinking";
  try {
    const r = await api("/api/chat", { text, conversationId: "panel" });
    reply(r.reply || r.error || "Sorry, I didn't get a reply. Try again.");
  } finally {
    if ($("#orb").dataset.voice === "thinking") $("#orb").dataset.voice = "idle";
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

// ---------- render and live updates ----------
function render() {
  renderStage();
  renderAsks();
  renderScenes();
  renderHome();
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
    [state, energy] = await Promise.all([api("/api/state"), api("/api/energy")]);
    render();
    if (tab === "you") loadProfile();
  }, 120);
}

function onEvent(e) {
  feed.push(e);
  if (feed.length > 300) feed.shift();
  if (started) {
    // Haven speaks up for briefings and anything urgent.
    if (e.type === "briefing") reply(`${e.title}. ${e.body}`);
    else if (e.type === "notification" && e.priority === "urgent") reply(`${e.title}. ${e.body}`);
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
    [state, feed, energy] = await Promise.all([api("/api/state"), api("/api/events?limit=150"), api("/api/energy")]);
  } catch {
    return;
  }
  $("#app").hidden = false;
  renderFeel();
  simButtons();
  render();
  connect();
  started = true;
  setInterval(tickClock, 15_000);
  setInterval(() => { renderFeed(); refresh(); }, 60_000);
}

start();
