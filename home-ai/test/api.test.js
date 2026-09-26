// Runs the real HTTP server on a free port and exercises every route the
// app, Siri Shortcuts and geofences use.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/http.js";
import { testHome, settle } from "./helpers.js";

const TOKEN = "test-owner-token";
let home, server, base;

before(async () => {
  home = await testHome({ dark: true });
  server = createServer(home, { token: TOKEN });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); });

const call = (path, body, token = TOKEN) => fetch(base + path, {
  method: body ? "POST" : "GET",
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

test("health is public, everything else needs the token", async () => {
  assert.equal((await call("/api/health", null, null)).status, 200);
  assert.equal((await call("/api/state", null, null)).status, 401);
  assert.equal((await call("/api/state", null, "wrong-token-of-same-len")).status, 401);
  assert.equal((await call("/api/state")).status, 200);
});

test("state has everything the app renders", async () => {
  const { data } = await call("/api/state");
  for (const key of ["home", "rooms", "people", "pending", "scenes", "agent", "adapter", "channels", "now"]) assert.ok(key in data, key);
  assert.equal(data.rooms.flatMap((r) => r.devices).length, home.config.devices.length);
});

test("device control, scenes, confirmations", async () => {
  let r = await call("/api/devices/light.kitchen", { command: { on: true, brightness: 50 } });
  assert.equal(r.data.status, "done");
  r = await call("/api/scenes/movie", {});
  assert.equal(r.data.status, "done");
  assert.equal(home.registry.get("light.living").state.brightness, 15);
  r = await call("/api/scenes/nope", {});
  assert.equal(r.data.status, "error");

  r = await call("/api/chat", { text: "unlock the front door" });
  const pending = (await call("/api/state")).data.pending;
  assert.equal(pending.length, 1);
  r = await call(`/api/confirm/${pending[0].confirmId}`, { approve: true });
  assert.equal(r.data.status, "done");
  assert.equal(home.registry.get("lock.front").state.locked, false);
  await call("/api/devices/lock.front", { command: { locked: true } });
});

test("chat rejects empty text", async () => {
  assert.equal((await call("/api/chat", { text: "  " })).status, 400);
});

test("Siri Shortcut endpoints return speakable text", async () => {
  let r = await call("/api/shortcut/ask", { text: "status" });
  assert.equal(typeof r.data.text, "string");
  assert.match(r.data.text, /°F inside/);
  r = await call("/api/shortcut/garage", { action: "open" });
  assert.match(r.data.text, /Opening the garage/);
  await settle(60);
  home.controller.lastMove.clear();
  r = await call("/api/shortcut/garage", { action: "toggle" });
  assert.match(r.data.text, /Closing the garage/);
});

test("geofence presence updates and validates", async () => {
  assert.equal((await call("/api/presence", { person: "owner", kind: "approaching" })).data.status, "done");
  assert.equal((await call("/api/presence", { person: "owner", kind: "teleported" })).data.status, "error");
  assert.equal((await call("/api/presence", { person: "stranger", kind: "arrived" })).data.status, "error");
});

test("briefing on demand", async () => {
  const r = await call("/api/briefing", {});
  assert.ok(r.data.title && r.data.body);
});

test("simulator can move sensors but not bypass safety", async () => {
  assert.equal((await call("/api/sim/sensor", { device: "motion.kitchen", state: { motion: true } })).data.status, "done");
  assert.equal((await call("/api/sim/sensor", { device: "climate.main", state: { current: 70 } })).data.status, "done");
  assert.equal((await call("/api/sim/sensor", { device: "lock.front", state: { locked: false } })).status, 400);
  assert.equal((await call("/api/sim/sensor", { device: "climate.main", state: { target: 99 } })).status, 400);
  assert.equal(home.registry.get("lock.front").state.locked, true);
});

test("bad JSON and oversized bodies are rejected cleanly", async () => {
  const bad = await fetch(base + "/api/chat", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: "{nope" });
  assert.equal(bad.status, 400);
  const big = await fetch(base + "/api/chat", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: "x".repeat(70_000) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
});

test("static app files are served and path traversal is blocked", async () => {
  for (const f of ["/", "/app.js", "/styles.css", "/look.js", "/manifest.webmanifest", "/icon.svg"]) {
    assert.equal((await fetch(base + f)).status, 200, f);
  }
  assert.equal((await fetch(base + "/..%2f..%2fpackage.json")).status, 404);
  assert.equal((await fetch(base + "/nope.html")).status, 404);
});

test("live event stream delivers events", async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/stream?token=${TOKEN}`, { signal: controller.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  await reader.read(); // ": connected"
  await call("/api/devices/light.hallway", { command: { on: true } });
  let text = "";
  while (!text.includes("light.hallway")) text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  assert.match(text, /"type":"action"/);
});

test("repeated wrong tokens get locked out", async () => {
  for (let i = 0; i < 10; i++) await call("/api/state", null, "x");
  assert.equal((await call("/api/state", null, "x")).status, 429);
});
