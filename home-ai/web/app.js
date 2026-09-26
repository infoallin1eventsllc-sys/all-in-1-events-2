// Haven app: live house view, controls, chat, confirmations and updates.
//
// Talks to the Haven home server over HTTP. In the browser-only demo build,
// window.HavenDemo provides the same API in the page, backed by a simulated
// house, so the app code is identical in both.
const $ = (sel) => document.querySelector(sel);
const demo = window.HavenDemo || null;
let token = demo ? "demo" : safeGet("haven.token");
let state = null;
let feed = [];

// ---------- helpers ----------
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
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

// ---------- look switch ----------
function setLook(look) {
  document.documentElement.setAttribute("data-look", look);
  safeSet("haven.look", look);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", look === "futuristic" ? "#06070c" : "#17130f");
  for (const b of document.querySelectorAll(".look-switch button")) b.setAttribute("aria-pressed", String(b.dataset.look === look));
}
for (const b of document.querySelectorAll(".look-switch button")) b.addEventListener("click", () => setLook(b.dataset.look));
setLook(document.documentElement.getAttribute("data-look") || "grounded");

// ---------- state helpers ----------
const allDevices = () => state.rooms.flatMap((r) => r.devices);
const byType = (t) => allDevices().filter((d) => d.type === t);
const NEXT_MODE = { auto: "heat", heat: "cool", cool: "off", off: "auto", fan_only: "auto" };
const MODE_LABEL = { auto: "Auto", heat: "Heat", cool: "Cool", off: "Off", fan_only: "Fan" };
const CONTROL_TYPES = new Set(["light", "fan", "thermostat", "water_heater", "water_valve", "garage", "lock"]);

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

const isOn = (d) => (d.type === "light" || d.type === "fan") && d.state.on;
function isAlert(d) {
  const s = d.state;
  return (d.type === "leak" && s.wet) || (d.type === "water_valve" && !s.open) ||
    (d.type === "lock" && !s.locked) || (d.type === "garage" && s.door !== "closed") ||
    (d.type === "contact" && s.open);
}

const send = (id, command) => api(`/api/devices/${encodeURIComponent(id)}`, { command }).then(showResult);

// Step a setpoint. The new value shows at once so quick repeated taps add
// up; if the house refuses it, the next refresh puts back the real value.
function stepTarget(d, delta) {
  d.state.target += delta;
  renderRooms();
  return send(d.id, { target: d.state.target });
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

// ---------- rendering ----------
function renderStatus() {
  const list = issues();
  const status = $("#status");
  const alert = list.some((i) => i.level === "bad");
  status.dataset.state = alert ? "alert" : list.length ? "attention" : state.pending.length ? "confirm" : "ok";
  $("#status-headline").textContent = alert
    ? "Needs your attention now"
    : list.length ? `${list.length} ${list.length === 1 ? "thing needs" : "things need"} attention`
    : state.pending.length ? "Waiting for your OK"
    : "All secure";
  $("#issues").replaceChildren(...list.map((i) =>
    el("li", { class: `issue ${i.level}` }, i.text, i.action && el("button", { onclick: i.action[1] }, i.action[0]))));
}

function renderSummary() {
  const th = byType("thermostat")[0];
  const garage = byType("garage")[0];
  const unlocked = byType("lock").filter((l) => !l.state.locked);
  const valve = byType("water_valve")[0];
  const wet = byType("leak").filter((l) => l.state.wet);

  const chip = (label, value, cls, sub) => el("div", { class: `chip ${cls || ""}` },
    el("span", { class: "label" }, label), el("span", { class: "value" }, value), sub && el("span", { class: "sub" }, sub));
  $("#summary").replaceChildren(
    chip("Inside", `${th.state.current}°F`, "", th.state.mode === "off" ? "System off" : `Set to ${th.state.target}°F`),
    chip("Garage", describe(garage), garage.state.door === "closed" ? "ok" : "warn"),
    chip("Doors", unlocked.length ? `${unlocked.length} unlocked` : "Locked", unlocked.length ? "warn" : "ok", `${byType("lock").length} smart locks`),
    chip("Water", wet.length ? "Leak" : valve.state.open ? "Normal" : "Off", wet.length ? "bad" : valve.state.open ? "ok" : "warn",
      valve.state.open ? "Main valve open" : "Main valve closed"),
  );
}

function renderPending() {
  $("#pending").replaceChildren(...state.pending.map((p) =>
    el("div", { class: "pending-card" },
      el("strong", {}, `${p.summary}?`),
      el("div", { class: "pending-actions" },
        el("button", { onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: false }).then(showResult) }, "Cancel"),
        el("button", { class: "primary", onclick: () => api(`/api/confirm/${p.confirmId}`, { approve: true }).then(showResult) }, "Confirm"),
      ))));
}

function controls(d) {
  const s = d.state;
  const b = (label, fn, cls, aria) => el("button", { class: cls, onclick: fn, "aria-label": aria }, label);
  switch (d.type) {
    case "light":
    case "fan":
      return [b(s.on ? "Turn off" : "Turn on", () => send(d.id, { on: !s.on }))];
    case "thermostat":
      return [
        b("−", () => stepTarget(d, -1), "", "Cooler by 1°F"),
        b("+", () => stepTarget(d, 1), "", "Warmer by 1°F"),
        b(MODE_LABEL[s.mode] || s.mode, () => send(d.id, { mode: NEXT_MODE[s.mode] || "auto" }), "", `Mode: ${s.mode}. Tap to change.`),
      ];
    case "water_heater":
      return s.on
        ? [b("−", () => stepTarget(d, -5), "", "Lower 5°F"), b("+", () => stepTarget(d, 5), "", "Raise 5°F"), b("Off", () => send(d.id, { on: false }), "", "Turn off water heater")]
        : [b("Turn on", () => send(d.id, { on: true }))];
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

function renderRooms() {
  $("#rooms").replaceChildren(...state.rooms.filter((r) => r.devices.length).map((r) => {
    const controlsList = r.devices.filter((d) => CONTROL_TYPES.has(d.type));
    const sensors = r.devices.filter((d) => !CONTROL_TYPES.has(d.type));
    return el("div", { class: "card room" },
      el("h3", {}, r.name),
      controlsList.length > 0 && el("div", { class: "devices" }, ...controlsList.map((d) =>
        el("div", { class: `device ${isOn(d) ? "on" : ""} ${isAlert(d) ? "alert" : ""}` },
          el("div", {}, el("div", { class: "name" }, d.name), el("div", { class: "state" }, describe(d))),
          el("div", { class: "controls" }, ...controls(d)),
        ))),
      sensors.length > 0 && el("p", { class: "sensors" }, ...sensors.map((d) =>
        el("span", { class: isAlert(d) ? "alert" : "" }, `${d.name.startsWith(r.name + " ") ? d.name.slice(r.name.length + 1) : d.name}: ${describe(d)}`))),
    );
  }));
}

function renderScenes() {
  $("#scenes").replaceChildren(...Object.entries(state.scenes).map(([id, label]) =>
    el("button", { onclick: () => api(`/api/scenes/${id}`, {}).then(showResult) }, label)));
}

function feedItem(e) {
  if (e.type === "notification") return { title: e.title, body: e.body + (e.held ? " (held for quiet hours)" : ""), urgent: e.priority === "urgent" };
  if (e.type === "action" && e.origin === "automation") return { title: "Automatic", body: `${e.summary}. ${e.reason || ""}` };
  if (e.type === "action") return { title: e.origin === "agent" ? "Haven" : "You", body: e.summary };
  if (e.type === "refused") return { title: "Blocked for safety", body: e.reason };
  if (e.type === "presence") return { title: e.name, body: { approaching: "is almost home", arrived: "arrived home", left: "left home" }[e.kind] };
  return null;
}
function renderFeed() {
  const items = feed.map((e) => [e, feedItem(e)]).filter(([, f]) => f).slice(-30).reverse();
  $("#feed").replaceChildren(...items.map(([e, f]) =>
    el("li", { class: f.urgent ? "urgent" : "" },
      el("span", { class: "when" }, timeAgo(e.ts)),
      el("span", { class: "title" }, f.title),
      el("span", {}, f.body))));
}

function render() {
  const home = state.people.filter((p) => p.home).length;
  $("#home-name").textContent = state.home;
  $("#subtitle").textContent = `${state.now} · ${home ? `${home} ${home === 1 ? "person" : "people"} home` : "Everyone away"}`;
  renderStatus();
  renderPending();
  renderSummary();
  renderScenes();
  renderRooms();
  renderFeed();
  $("#footer").textContent = demo
    ? "Demo house: devices are simulated and Haven uses its built-in command parser."
    : `Devices: ${state.adapter} · AI: ${state.agent.kind === "claude" ? state.agent.model : "offline mode"} · Alerts: ${state.channels.join(", ")}`;
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
  $("#status").classList.add("thinking");
  try {
    const r = await api("/api/chat", { text, conversationId: "app" });
    say("haven", r.reply || r.error || "Sorry, I didn't get a reply. Try again.");
  } finally {
    $("#status").classList.remove("thinking");
  }
  refresh();
});

// The briefing arrives as a live event, which adds it to the chat.
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

// ---------- live updates ----------
let refreshTimer;
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => { state = await api("/api/state"); render(); }, 120);
}

function onEvent(e) {
  feed.push(e);
  if (feed.length > 300) feed.shift();
  if (e.type === "briefing") say("haven", `${e.title}: ${e.body}`);
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
    [state, feed] = await Promise.all([api("/api/state"), api("/api/events?limit=150")]);
  } catch {
    return;
  }
  $("#app").hidden = false;
  render();
  simButtons();
  connect();
  setInterval(() => { renderFeed(); renderRooms(); }, 60_000);
}

start();
