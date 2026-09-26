// The outside connections: Home Assistant (real devices), push alerts to
// iPhone / Apple Watch (ntfy, Pushover), and the scheduled briefings.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHome, loadConfig } from "../src/home.js";
import { Notifier } from "../src/notify.js";
import { Bus } from "../src/core/bus.js";
import { localParts } from "../src/core/time.js";
import { testHome, settle } from "./helpers.js";

// A small stand-in for Home Assistant's REST API.
function fakeHomeAssistant() {
  const calls = [];
  const states = {
    "light.kitchen": { entity_id: "light.kitchen", state: "off", attributes: {} },
    "cover.garage_door": { entity_id: "cover.garage_door", state: "closed", attributes: {} },
    "lock.front_door": { entity_id: "lock.front_door", state: "locked", attributes: {} },
    "binary_sensor.kitchen_motion": { entity_id: "binary_sensor.kitchen_motion", state: "off", attributes: {} },
    "climate.main": { entity_id: "climate.main", state: "heat_cool", attributes: { temperature: 70, current_temperature: 69, hvac_action: "idle" } },
  };
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== "Bearer ha-token") { res.writeHead(401); return res.end(); }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/api/states") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(Object.values(states)));
      }
      const m = req.url.match(/^\/api\/services\/(\w+)\/(\w+)$/);
      if (req.method === "POST" && m) {
        const data = JSON.parse(body);
        calls.push([m[1], m[2], data]);
        if (m[1] === "light") states[data.entity_id].state = m[2] === "turn_on" ? "on" : "off";
        if (m[1] === "cover") states[data.entity_id].state = m[2] === "open_cover" ? "open" : "closed";
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end("[]");
      }
      res.writeHead(404); res.end();
    });
  });
  return { server, calls, states };
}

test("Home Assistant: commands go out as service calls and state comes back", async () => {
  const ha = fakeHomeAssistant();
  await new Promise((r) => ha.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${ha.server.address().port}`;
  const home = await createHome({ env: { HAVEN_ADAPTER: "homeassistant", HA_URL: url, HA_TOKEN: "ha-token" }, dataDir: null });
  try {
    await home.adapter.start();
    assert.equal(home.adapter.name, "homeassistant");
    assert.equal(home.registry.get("climate.main").state.current, 69);
    assert.equal(home.registry.get("climate.main").state.mode, "auto");

    const r = await home.controller.execute({ device: "light.kitchen", command: { on: true, brightness: 40 }, origin: "owner" });
    assert.equal(r.status, "done");
    assert.deepEqual(ha.calls.at(-1), ["light", "turn_on", { entity_id: "light.kitchen", brightness_pct: 40 }]);
    await home.adapter.poll();
    assert.equal(home.registry.get("light.kitchen").state.on, true);

    // A sensor changing in Home Assistant reaches Haven's automations.
    ha.states["binary_sensor.kitchen_motion"].state = "on";
    await home.adapter.poll();
    assert.equal(home.registry.get("motion.kitchen").state.motion, true);

    // Safety still applies on real hardware.
    const agentOpen = await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "agent" });
    assert.equal(agentOpen.status, "needs_confirmation");
    assert.ok(!ha.calls.some(([d]) => d === "cover"));
  } finally {
    home.adapter.stop();
    ha.server.close();
  }
});

test("Home Assistant: a device that doesn't respond is reported, not faked", async () => {
  const home = await createHome({ env: { HAVEN_ADAPTER: "homeassistant", HA_URL: "http://127.0.0.1:1", HA_TOKEN: "x" }, dataDir: null });
  const r = await home.controller.execute({ device: "light.kitchen", command: { on: true }, origin: "owner" });
  assert.equal(r.status, "error");
  assert.match(r.message, /didn't respond/);
  assert.equal(home.registry.get("light.kitchen").state.on, false);
});

test("Home Assistant: missing settings fail fast with a clear message", async () => {
  await assert.rejects(createHome({ env: { HAVEN_ADAPTER: "homeassistant" }, dataDir: null }), /HA_URL and HA_TOKEN/);
});

test("ntfy push: title, priority and body are sent", async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { received.push({ url: req.url, headers: req.headers, body }); res.end("{}"); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const config = loadConfig();
  const notifier = new Notifier({ config, bus: new Bus(), env: { NTFY_URL: `http://127.0.0.1:${server.address().port}`, NTFY_TOPIC: "haven-test", NTFY_TOKEN: "tok" } });
  notifier.isQuietHours = () => false;
  try {
    const r = await notifier.send({ title: "Water leak detected at 72°F", body: "I shut off the main water.", priority: "urgent" });
    assert.deepEqual(r.delivered, ["app", "ntfy"]);
    assert.equal(received[0].url, "/haven-test");
    assert.equal(received[0].headers.title, "Water leak detected at 72 degF");
    assert.equal(received[0].headers.priority, "5");
    assert.equal(received[0].headers.authorization, "Bearer tok");
    assert.equal(received[0].body, "I shut off the main water.");
  } finally {
    server.close();
  }
});

test("Pushover push and a failing channel are both handled", async () => {
  const bus = new Bus();
  const errors = [];
  bus.on("notify_error", (e) => errors.push(e));
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("pushover")) { sent.push(Object.fromEntries(new URLSearchParams(init.body))); return new Response("{}", { status: 200 }); }
    return new Response("nope", { status: 500 });
  };
  try {
    const notifier = new Notifier({ config: loadConfig(), bus, env: { PUSHOVER_TOKEN: "app", PUSHOVER_USER: "user", NTFY_TOPIC: "t", NTFY_URL: "https://ntfy.example" } });
    notifier.isQuietHours = () => false;
    const r = await notifier.send({ title: "Garage still open", body: "Open 12 minutes." });
    assert.deepEqual(r.delivered, ["app", "pushover"]);
    assert.equal(sent[0].title, "Garage still open");
    assert.equal(sent[0].priority, "0");
    assert.equal(errors[0].channel, "ntfy");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("info messages stay in the app and don't buzz the phone", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("{}"); };
  try {
    const notifier = new Notifier({ config: loadConfig(), bus: new Bus(), env: { NTFY_TOPIC: "t" } });
    notifier.isQuietHours = () => false;
    const r = await notifier.send({ title: "Welcome home", body: "The house is ready.", priority: "info" });
    assert.deepEqual(r.delivered, ["app"]);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("scheduled briefing goes out once at its time", async () => {
  const home = await testHome();
  const { hhmm } = localParts(home.config.home.timezone);
  home.config.settings.briefings = [{ id: "test", time: hhmm, label: "Test briefing" }];
  const sent = [];
  home.bus.on("briefing", (e) => sent.push(e));
  await home.briefings.check();
  await home.briefings.check();
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /Test briefing/);
});

test("quiet-hours messages are folded into the next briefing", async () => {
  const home = await testHome();
  home.notifier.isQuietHours = () => true;
  await home.notifier.send({ title: "Garage still open", body: "Open 12 minutes." });
  const digest = home.briefings.digest("morning");
  assert.match(digest.facts.heldDuringQuietHours[0], /Garage still open/);
});
