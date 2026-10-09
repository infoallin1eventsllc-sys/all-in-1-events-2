// Cameras: found in Home Assistant, renamed from config, the doorbell and motion
// stills, the phone alert with its picture, and the server's picture and live
// video routes. Home Assistant is a stand-in here; nothing touches a network.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Bus } from "../src/core/bus.js";
import { Cameras } from "../src/cameras.js";
import { Notifier } from "../src/notify.js";
import { HomeAssistantAdapter } from "../src/adapters/homeassistant.js";
import { createServer } from "../src/http.js";
import { loadConfig } from "../src/home.js";
import { testHome, settle } from "./helpers.js";

const st = (entity_id, state, attributes = {}) => [entity_id, { entity_id, state, attributes }];

function fakeHa() {
  return {
    name: "homeassistant",
    shots: 0,
    async cameraImage(entity) { this.shots++; return { image: Buffer.from(`jpeg:${entity}:${this.shots}`), contentType: "image/jpeg" }; },
    async cameraStream(entity, signal) {
      let n = 0;
      const stream = new ReadableStream({
        pull(c) { if (signal?.aborted || n > 2) return c.close(); c.enqueue(new TextEncoder().encode(`--frame\r\nContent-Type: image/jpeg\r\n\r\nframe${n++}\r\n`)); },
      });
      return { stream, contentType: "multipart/x-mixed-replace;boundary=frame" };
    },
    watchStates(fn) { this.watch = fn; },
  };
}

function setup({ cameras, dataDir = null } = {}) {
  const config = loadConfig();
  config.cameras = cameras ?? [
    { ha_entity: "camera.front_door", name: "Front door", room: "exterior", doorbell: "event.front_door_ding", motion: "binary_sensor.front_door_person" },
    { ha_entity: "camera.garage_inside", hidden: true },
  ];
  const bus = new Bus();
  const events = [];
  bus.on("event", (e) => events.push(e));
  const sent = [];
  const notifier = { send: async (m) => { sent.push(m); return { delivered: ["app"] }; } };
  const adapter = fakeHa();
  const cams = new Cameras({ config, adapter, bus, notifier, dataDir });
  cams.start();
  return { cams, adapter, events, sent };
}

const states = (extra = []) => new Map([
  st("camera.front_door", "idle", { friendly_name: "Doorbell Cam" }),
  st("camera.backyard", "recording", { friendly_name: "Backyard" }),
  st("camera.side_yard", "unavailable", { friendly_name: "Side yard" }),
  st("camera.garage_inside", "idle", { friendly_name: "Garage" }),
  st("light.kitchen", "on"),
  ...extra,
]);

test("every Home Assistant camera appears, renamed and placed from config, hidden ones left out", () => {
  const { cams } = setup();
  cams.onStates(states());
  const r = cams.report();
  assert.equal(r.available, true);
  assert.deepEqual(r.cameras.map((c) => [c.id, c.name, c.room, c.online, c.doorbell]), [
    ["front_door", "Front door", "exterior", true, true], // the doorbell first
    ["backyard", "Backyard", null, true, false],
    ["side_yard", "Side yard", null, false, false],
  ]);
});

test("with no cameras, every surface says so instead of showing a placeholder", async () => {
  const home = await testHome();
  const r = home.cameras.report();
  assert.equal(r.available, false);
  assert.deepEqual(r.cameras, []);
  assert.match(r.reason, /none are connected/);
  const { cams } = setup({ cameras: [] });
  cams.onStates(new Map([st("light.kitchen", "on")]));
  assert.match(cams.report().reason, /no cameras yet/);
});

test("a doorbell ring saves a still and pushes it to phones, once, without touching any device", async () => {
  const { cams, events, sent } = setup();
  const t0 = Date.now();
  cams.onStates(states([st("event.front_door_ding", "2026-10-09T12:00:00.000Z")]), t0);
  assert.equal(sent.length, 0, "the first look is a baseline, not a ring");
  cams.onStates(states([st("event.front_door_ding", "2026-10-09T12:05:00.000Z")]), t0 + 1000);
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, "Doorbell: Front door");
  assert.equal(sent[0].bypassQuiet, true);
  assert.ok(Buffer.isBuffer(sent[0].image), "the picture rides along to the phone");
  const ring = events.find((e) => e.type === "doorbell");
  assert.equal(ring.camera, "front_door");
  assert.ok(ring.still);
  assert.equal(cams.still(ring.still).image.toString(), "jpeg:camera.front_door:1");
  assert.equal(cams.report().recent[0].kind, "doorbell");
  // Pressed again ten seconds later: still one ring.
  cams.onStates(states([st("event.front_door_ding", "2026-10-09T12:05:10.000Z")]), t0 + 11_000);
  await settle();
  assert.equal(sent.length, 1);
  assert.ok(!events.some((e) => e.type === "action" || e.type === "command"), "a ring never moves a device");
});

test("a binary doorbell rings on off → on; motion saves a still without a push", async () => {
  const { cams, events, sent } = setup({ cameras: [{ ha_entity: "camera.front_door", doorbell: "binary_sensor.bell", motion: "binary_sensor.person" }] });
  const t0 = Date.now();
  cams.onStates(states([st("binary_sensor.bell", "off"), st("binary_sensor.person", "off")]), t0);
  cams.onStates(states([st("binary_sensor.bell", "on"), st("binary_sensor.person", "off")]), t0 + 1000);
  cams.onStates(states([st("binary_sensor.bell", "on"), st("binary_sensor.person", "on")]), t0 + 2000);
  await settle();
  assert.equal(sent.length, 1, "on → on isn't a second ring");
  assert.equal(events.filter((e) => e.type === "camera_motion").length, 1);
  assert.deepEqual(cams.report().recent.map((r) => r.kind), ["motion", "doorbell"]);
});

test("stills are kept on the home server and found again after a restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haven-cams-"));
  try {
    const { cams } = setup({ dataDir: dir });
    cams.onStates(states());
    const s = await cams.capture(cams.get("front_door"), "doorbell", Date.parse("2026-10-09T12:34:56Z"));
    assert.ok(fs.existsSync(path.join(dir, "cameras", `${s.id}.jpg`)));
    const again = setup({ dataDir: dir }).cams;
    assert.deepEqual(again.stills.map((x) => [x.camera, x.kind, x.at]), [["front_door", "doorbell", "2026-10-09T12:34:56.000Z"]]);
    assert.equal(again.still(s.id).image.toString(), s.image.toString());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown cameras and made-up picture names are refused", async () => {
  const { cams } = setup();
  cams.onStates(states());
  await assert.rejects(() => cams.snapshot("nope"), { statusCode: 404 });
  await assert.rejects(() => cams.snapshot("../secrets"), { statusCode: 404 });
  assert.throws(() => cams.still("../../secrets"), { statusCode: 404 });
  assert.equal(cams.get("garage_inside"), null, "a hidden camera can't be opened either");
});

test("phone alerts carry the picture, and a doorbell gets through quiet hours", async () => {
  const config = loadConfig();
  const bus = new Bus();
  const events = [];
  bus.on("event", (e) => events.push(e));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ url, ...opts }); return new Response("ok"); };
  try {
    const n = new Notifier({ config, bus, env: { NTFY_TOPIC: "home", PUSHOVER_TOKEN: "t", PUSHOVER_USER: "u" } });
    n.isQuietHours = () => true;
    const r = await n.send({ title: "Doorbell: Front door", body: "Someone's at the door.", bypassQuiet: true, image: Buffer.from("JPEG") });
    assert.deepEqual(r.delivered, ["app", "ntfy", "pushover"]);
    const ntfy = calls.find((c) => String(c.url).includes("ntfy"));
    assert.equal(ntfy.method, "PUT");
    assert.equal(ntfy.headers.Filename, "camera.jpg");
    assert.equal(ntfy.headers.Message, "Someone's at the door.");
    const po = new URLSearchParams(String(calls.find((c) => String(c.url).includes("pushover")).body));
    assert.equal(po.get("attachment_base64"), Buffer.from("JPEG").toString("base64"));
    const logged = events.find((e) => e.type === "notification");
    assert.equal(logged.image, undefined, "the picture never goes into the event log");
    assert.equal(logged.held, false);
    // Without bypassQuiet, the same message waits for the morning.
    assert.equal((await n.send({ title: "Garage", body: "Open" })).held, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Home Assistant: pictures and live video come through its camera proxy with the token", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), auth: opts.headers?.Authorization });
    if (String(url).endsWith("/api/states")) return Response.json([{ entity_id: "camera.front_door", state: "idle", attributes: {} }]);
    if (String(url).includes("camera_proxy_stream")) return new Response("--frame", { headers: { "content-type": "multipart/x-mixed-replace;boundary=frame" } });
    return new Response(new Uint8Array([0xff, 0xd8]), { headers: { "content-type": "image/jpeg" } });
  };
  try {
    const registry = { all: () => [] };
    const ha = new HomeAssistantAdapter({ registry, url: "http://ha.local:8123/", token: "secret" });
    let seen = null;
    ha.watchStates((s) => (seen = s));
    await ha.poll();
    assert.ok(seen.has("camera.front_door"));
    const pic = await ha.cameraImage("camera.front_door");
    assert.deepEqual([...pic.image], [0xff, 0xd8]);
    const live = await ha.cameraStream("camera.front_door");
    assert.match(live.contentType, /multipart/);
    assert.ok(calls.some((c) => c.url === "http://ha.local:8123/api/camera_proxy/camera.front_door" && c.auth === "Bearer secret"));
    assert.ok(calls.some((c) => c.url === "http://ha.local:8123/api/camera_proxy_stream/camera.front_door"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the server sends pictures and live video only with the owner token", async () => {
  const home = await testHome();
  const { cams } = setup();
  cams.onStates(states());
  home.cameras = cams;
  const server = createServer(home, { token: "tok" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/cameras/front_door/snapshot`)).status, 401);
    const auth = { headers: { Authorization: "Bearer tok" } };
    const list = await (await fetch(`${base}/api/cameras`, auth)).json();
    assert.equal(list.cameras[0].id, "front_door");
    const pic = await fetch(`${base}/api/cameras/front_door/snapshot`, auth);
    assert.equal(pic.headers.get("content-type"), "image/jpeg");
    assert.match(await pic.text(), /^jpeg:camera\.front_door/);
    // Live video in an <img>, which can't send headers: the token rides in the address.
    const live = await fetch(`${base}/api/cameras/front_door/live?token=tok`);
    assert.match(live.headers.get("content-type"), /multipart\/x-mixed-replace/);
    assert.match(await live.text(), /frame0[\s\S]*frame2/);
    await settle(50);
    assert.equal(cams.live, 0, "a finished live view frees its place");
    assert.equal((await fetch(`${base}/api/cameras/nope/snapshot`, auth)).status, 404);
  } finally {
    server.close();
    home.stop();
  }
});
