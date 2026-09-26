// Haven app: live house view, controls, chat, confirmations and updates.
const $ = (sel) => document.querySelector(sel);
let token = safeGet("haven.token");
let state = null;
let feed = [];

// ---------- helpers ----------
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : String(c));
  return node;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { showLogin("That token didn't work."); throw new Error("unauthorized"); }
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

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  token = $("#token-input").value.trim();
  safeSet("haven.token", token);
  $("#login").hidden = true;
  start();
});

// ---------- rendering ----------
const allDevices = () => state.rooms.flatMap((r) => r.devices);
const byType = (t) => allDevices().filter((d) => d.type === t);

function describe(d) {
  const s = d.state;
  switch (d.type) {
    case "light": return s.on ? `On · ${s.brightness}%` : "Off";
    case "fan": return s.on ? `On · speed ${s.speed}` : "Off";
    case "thermostat": return `${s.current}°F · ${s.mode} to ${s.target}°F${s.hvac && s.hvac !== "idle" ? ` · ${s.hvac}` : ""}${s.setback ? " · away" : ""}`;
    case "water_heater": return s.on ? `${s.target}°F · ${s.mode.replace("_", " ")}` : "Off";
    case "water_valve": return s.open ? "Water on" : "Water OFF";
    case "garage": return s.door[0].toUpperCase() + s.door.slice(1);
    case "lock": return s.locked ? "Locked" : "Unlocked";
    case "motion": return s.motion ? "Motion now" : s.lastMotion ? `Last motion ${timeAgo(s.lastMotion)}` : "No motion";
    case "leak": return s.wet ? "LEAK" : "Dry";
    case "contact": return s.open ? "Open" : "Closed";
    case "illuminance": return `${s.lux} lux`;
    case "temperature": return `${s.value}°F`;
    default: return "";
  }
}

function isOn(d) {
  const s = d.state;
  return (d.type === "light" || d.type === "fan") && s.on;
}
function isAlert(d) {
  const s = d.state;
  return (d.type === "leak" && s.wet) || (d.type === "water_valve" && !s.open) ||
    (d.type === "lock" && !s.locked) || (d.type === "garage" && s.door !== "closed");
}

const send = (id, command) => api(`/api/devices/${encodeURIComponent(id)}`, { command }).then(showResult);

function controls(d) {
  const s = d.state;
  const b = (label, fn, cls) => el("button", { class: cls, onclick: fn }, label);
  switch (d.type) {
    case "light":
    case "fan":
      return [b(s.on ? "Off" : "On", () => send(d.id, { on: !s.on }))];
    case "thermostat":
      return [
        b("−", () => send(d.id, { target: s.target - 1 }), undefined),
        b("+", () => send(d.id, { target: s.target + 1 })),
        b(s.mode, () => send(d.id, { mode: { auto: "heat", heat: "cool", cool: "off", off: "auto", fan_only: "auto" }[s.mode] })),
      ];
    case "water_heater":
      return [b("−", () => send(d.id, { target: s.target - 5 })), b("+", () => send(d.id, { target: s.target + 5 })), b(s.on ? "Off" : "On", () => send(d.id, { on: !s.on }))];
    case "water_valve":
      return [s.open ? b("Shut off", () => send(d.id, { open: false }), "danger") : b("Turn on", () => send(d.id, { open: true }))];
    case "garage":
      return [b(s.door === "closed" ? "Open" : "Close", () => send(d.id, { door: s.door === "closed" ? "open" : "closed" }))];
    case "lock":
      return [b(s.locked ? "Unlock" : "Lock", () => send(d.id, { locked: !s.locked }))];
    default:
      return [];
  }
}

function renderSummary() {
  const th = byType("thermostat")[0];
  const garage = byType("garage")[0];
  const locks = byType("lock");
  const unlocked = locks.filter((l) => !l.state.locked);
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);
  const lights = byType("light").filter((l) => l.state.on);
  const home = state.people.filter((p) => p.home).length;

  const chip = (label, value, cls) => el("div", { class: `chip ${cls || ""}` }, el("div", { class: "label" }, label), el("div", { class: "value" }, value));
  $("#summary").replaceChildren(
    chip("Inside", `${th.state.current}°F`, ""),
    chip("Garage", describe(garage), garage.state.door === "closed" ? "ok" : "warn"),
    chip("Doors", unlocked.length ? `${unlocked.length} unlocked` : "Locked", unlocked.length ? "warn" : "ok"),
    chip("Water", wet.length ? "LEAK" : valve.state.open ? "Normal" : "Shut off", wet.length ? "bad" : valve.state.open ? "ok" : "warn"),
    chip("Lights on", String(lights.length), ""),
    chip("People", home ? `${home} home` : "Away", ""),
  );
}

function renderPending() {
  $("#pending").replaceChildren(...state.pending.map((p) =>
    el("div", { class: "pending-card" },
      el("strong", {}, `Confirm: ${p.summary}?`),
      el("button", { class: "primary", onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: true }).then(showResult) }, "Confirm"),
      el("button", { onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: false }).then(showResult) }, "Cancel"),
    )));
}

function renderRooms() {
  $("#rooms").replaceChildren(...state.rooms.filter((r) => r.devices.length).map((r) =>
    el("div", { class: "card room" },
      el("h3", {}, r.name),
      el("div", { class: "devices" }, ...r.devices.map((d) =>
        el("div", { class: `device ${isOn(d) ? "on" : ""} ${isAlert(d) ? "alert" : ""}` },
          el("div", {}, el("div", { class: "name" }, d.name), el("div", { class: "state" }, describe(d))),
          el("div", { class: "controls" }, ...controls(d)),
        ))),
    )));
}

function renderScenes() {
  $("#scenes").replaceChildren(...Object.entries(state.scenes).map(([id, label]) =>
    el("button", { onclick: () => api(`/api/scenes/${id}`, {}).then(showResult) }, label)));
}

const FEED_TYPES = new Set(["notification", "action", "refused", "presence", "briefing"]);
function feedItem(e) {
  if (e.type === "notification") return { title: e.title, body: e.body + (e.held ? " (held for quiet hours)" : ""), urgent: e.priority === "urgent" };
  if (e.type === "action" && e.origin === "automation") return { title: "Automatic", body: `${e.summary}. ${e.reason || ""}` };
  if (e.type === "action") return { title: e.origin === "agent" ? "Haven" : "You", body: e.summary };
  if (e.type === "refused") return { title: "Blocked for safety", body: e.reason, urgent: false };
  if (e.type === "presence") return { title: e.name, body: { approaching: "is almost home", arrived: "arrived home", left: "left home" }[e.kind] };
  return null;
}
function renderFeed() {
  const items = feed.filter((e) => FEED_TYPES.has(e.type) && e.type !== "briefing").slice(-40).reverse();
  $("#feed").replaceChildren(...items.map((e) => {
    const f = feedItem(e);
    if (!f) return null;
    return el("li", { class: f.urgent ? "urgent" : "" },
      el("div", { class: "when" }, timeAgo(e.ts)),
      el("div", { class: "title" }, f.title),
      el("div", { class: "body" }, f.body));
  }).filter(Boolean));
}

function render() {
  $("#home-name").textContent = state.home;
  $("#subtitle").textContent = state.now;
  renderPending();
  renderSummary();
  renderScenes();
  renderRooms();
  renderFeed();
  $("#footer").textContent = `Devices: ${state.adapter} · AI: ${state.agent.kind === "claude" ? state.agent.model : "offline mode"} · Alerts: ${state.channels.join(", ")}`;
  $("#sim").hidden = state.adapter !== "simulator";
}

// ---------- chat ----------
function say(who, text) {
  const log = $("#chat-log");
  log.append(el("div", { class: `msg ${who}` }, text));
  log.scrollTop = log.scrollHeight;
}
function showResult(r) {
  if (r?.message) say("haven", r.message);
  refresh();
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#chat-input").value.trim();
  if (!text) return;
  $("#chat-input").value = "";
  say("you", text);
  const r = await api("/api/chat", { text, conversationId: "app" });
  say("haven", r.reply || r.error || "…");
  refresh();
});

$("#brief-now").addEventListener("click", async () => {
  const r = await api("/api/briefing", {});
  say("haven", `${r.title}: ${r.body}`);
});

// ---------- simulator ----------
function simButtons() {
  const sensor = (device, s) => () => api("/api/sim/sensor", { device, state: s }).then(refresh);
  const presence = (kind) => () => api("/api/presence", { person: "owner", kind }).then(refresh);
  const buttons = [
    ["Motion: kitchen", sensor("motion.kitchen", { motion: true })],
    ["Motion: hallway", sensor("motion.hallway", { motion: true })],
    ["Motion: driveway", sensor("motion.driveway", { motion: true })],
    ["Motion clears", () => Promise.all(["motion.kitchen", "motion.hallway", "motion.driveway", "motion.garage"].map((d) => api("/api/sim/sensor", { device: d, state: { motion: false } }))).then(refresh)],
    ["Make it night", sensor("sensor.outdoor_lux", { lux: 5 })],
    ["Make it day", sensor("sensor.outdoor_lux", { lux: 800 })],
    ["Leak at water heater", sensor("leak.water_heater", { wet: true })],
    ["Leak sensor dries", sensor("leak.water_heater", { wet: false })],
    ["Back door opens", sensor("contact.back_door", { open: true })],
    ["Back door closes", sensor("contact.back_door", { open: false })],
    ["Cold snap (48°F inside)", sensor("climate.main", { current: 48 })],
    ["Car approaching home", presence("approaching")],
    ["Arrived home", presence("arrived")],
    ["Everyone left", presence("left")],
  ];
  $("#sim-buttons").replaceChildren(...buttons.map(([label, fn]) => el("button", { onclick: fn }, label)));
}

// ---------- live updates ----------
let refreshTimer;
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => { state = await api("/api/state"); render(); }, 120);
}

function connect() {
  const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
  es.onopen = () => $("#conn").classList.add("live");
  es.onerror = () => $("#conn").classList.remove("live");
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    feed.push(e);
    if (feed.length > 300) feed.shift();
    if (e.type === "briefing") say("haven", `${e.title}: ${e.body}`);
    refresh();
  };
}

async function start() {
  if (!token) return showLogin();
  try {
    [state, feed] = await Promise.all([api("/api/state"), api("/api/events?limit=150")]);
  } catch {
    return;
  }
  $("#app").hidden = false;
  render();
  simButtons();
  connect();
  setInterval(() => renderFeed(), 60_000);
}

start();
