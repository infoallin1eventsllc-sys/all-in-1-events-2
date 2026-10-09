// Cameras: live views, snapshots and the doorbell, from Home Assistant.
//
// Home Assistant already speaks to most professional camera systems (UniFi
// Protect, Reolink, Axis, Hikvision, Amcrest, ONVIF and many doorbells), so
// every camera it knows appears here on its own. "cameras" in config/home.json
// can rename one, put it in a room, hide it, or link its doorbell and motion
// sensors:
//
//   "cameras": [{ "ha_entity": "camera.front_door", "name": "Front door",
//                 "room": "exterior", "doorbell": "event.front_door_ding",
//                 "motion": "binary_sensor.front_door_person" }]
//
// The Home Assistant token never leaves the home server: panels ask Haven for
// pictures and video. Nothing here is ever sent to the AI service.
//
// When the doorbell rings, Haven saves a still from that camera on the home
// server (data/cameras/, never a cloud), shows it on the panels and pushes it
// to phones and the Apple Watch. Motion saves a still too, without a push.
// A ring never unlocks anything: cameras have no path to the controller.
//
// With no cameras (the simulator, the browser demo) every surface says so.
// Haven never shows a placeholder feed.
import fs from "node:fs";
import path from "node:path";
import { PRIORITY } from "./notify.js";

const KEEP_STILLS = 200;
const KEEP_DAYS = 14;
const RING_GAP_MS = 20_000; // one ring, however many times the button is pressed
const MOTION_GAP_MS = 60_000; // at most one motion still a minute per camera
const MAX_LIVE = 6; // live views at once, across every panel and phone
const ID = /^[\w-]+$/;

const cameraId = (entity) => entity.replace(/^camera\./, "").replace(/[^\w-]/g, "_");
const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

export class Cameras {
  constructor({ config, adapter, bus, notifier, dataDir = null }) {
    this.config = config;
    this.adapter = adapter;
    this.bus = bus;
    this.notifier = notifier;
    this.dir = dataDir ? path.join(dataDir, "cameras") : null;
    this.states = new Map();
    this.seen = new Map(); // trigger entity -> last state, so only changes count
    this.lastRing = new Map();
    this.lastMotion = new Map();
    this.memory = []; // stills when there's no data directory: [{ id, camera, kind, at, image }]
    this.live = 0;
    this.stills = this.dir ? this.loadStills() : [];
  }

  // Cameras come only from Home Assistant.
  get connected() {
    return typeof this.adapter.cameraImage === "function";
  }

  start() {
    if (this.connected && typeof this.adapter.watchStates === "function") this.adapter.watchStates((states) => this.onStates(states));
  }

  // Every camera Home Assistant has, with the overrides from config/home.json.
  list() {
    const extra = new Map((this.config.cameras || []).filter((c) => c?.ha_entity).map((c) => [c.ha_entity, c]));
    const entities = new Set([...extra.keys(), ...[...this.states.keys()].filter((e) => e.startsWith("camera."))]);
    const out = [];
    for (const entity of entities) {
      const c = extra.get(entity) || {};
      if (c.hidden) continue;
      const s = this.states.get(entity);
      const room = this.config.rooms.some((r) => r.id === c.room) ? c.room : null;
      out.push({
        id: cameraId(entity), entity, room,
        name: c.name || s?.attributes?.friendly_name || entity,
        online: !!s && s.state !== "unavailable" && s.state !== "unknown",
        doorbell: c.doorbell || null, motion: c.motion || null,
      });
    }
    return out.sort((a, b) => (b.doorbell ? 1 : 0) - (a.doorbell ? 1 : 0) || a.name.localeCompare(b.name));
  }

  get(id) {
    return ID.test(String(id)) ? this.list().find((c) => c.id === id) || null : null;
  }

  report() {
    if (!this.connected) return { available: false, cameras: [], recent: [], reason: "Cameras come from Home Assistant, and none are connected." };
    const cams = this.list();
    if (!cams.length) return { available: false, cameras: [], recent: [], reason: "Home Assistant has no cameras yet. Add them there and they appear here." };
    const recent = this.stills.slice(-24).reverse().map(({ id, camera, kind, at }) => ({ id, camera, kind, at }));
    return {
      available: true,
      cameras: cams.map(({ id, name, room, online, doorbell, motion }) => ({
        id, name, room, online, doorbell: !!doorbell, motion: !!motion,
        lastRing: this.lastRing.get(id) ? new Date(this.lastRing.get(id)).toISOString() : null,
        lastMotion: this.lastMotion.get(id) ? new Date(this.lastMotion.get(id)).toISOString() : null,
      })),
      recent,
    };
  }

  // A picture from the camera now: { image, contentType }.
  async snapshot(id) {
    const cam = this.get(id);
    if (!cam) throw Object.assign(new Error("No such camera."), { statusCode: 404, expose: true });
    try {
      return await this.adapter.cameraImage(cam.entity);
    } catch {
      throw Object.assign(new Error(`${cam.name} isn't answering.`), { statusCode: 502, expose: true });
    }
  }

  // Live video (motion JPEG), streamed through the home server until the viewer closes.
  async liveView(id, signal) {
    const cam = this.get(id);
    if (!cam) throw Object.assign(new Error("No such camera."), { statusCode: 404, expose: true });
    if (this.live >= MAX_LIVE) throw Object.assign(new Error("Too many live views are open. Close one and try again."), { statusCode: 429, expose: true });
    let r;
    try {
      r = await this.adapter.cameraStream(cam.entity, signal);
    } catch {
      throw Object.assign(new Error(`${cam.name} has no live video right now.`), { statusCode: 502, expose: true });
    }
    this.live++;
    let done = false;
    const release = () => { if (!done) { done = true; this.live--; } };
    signal?.addEventListener("abort", release, { once: true });
    return { stream: r.stream, contentType: r.contentType, release };
  }

  // A saved still: { image, contentType }.
  still(id) {
    const s = ID.test(String(id)) && this.stills.find((x) => x.id === id);
    if (!s) throw Object.assign(new Error("That picture is gone."), { statusCode: 404, expose: true });
    if (s.image) return { image: s.image, contentType: "image/jpeg" };
    try {
      return { image: fs.readFileSync(path.join(this.dir, `${s.id}.jpg`)), contentType: "image/jpeg" };
    } catch {
      throw Object.assign(new Error("That picture is gone."), { statusCode: 404, expose: true });
    }
  }

  // Home Assistant states, every poll: a doorbell or motion trigger that changes counts.
  onStates(states, now = Date.now()) {
    this.states = states;
    for (const cam of this.list()) {
      for (const [kind, entity] of [["doorbell", cam.doorbell], ["motion", cam.motion]]) {
        if (!entity) continue;
        const s = states.get(entity);
        if (!s || s.state === "unavailable" || s.state === "unknown") continue;
        const before = this.seen.get(entity);
        this.seen.set(entity, s.state);
        if (before === undefined) continue; // the first look is the baseline, not an event
        const fired = entity.startsWith("event.") ? s.state !== before : s.state === "on" && before !== "on";
        if (!fired) continue;
        if (kind === "doorbell") this.ring(cam, now).catch(() => {});
        else this.motionAt(cam, now).catch(() => {});
      }
    }
  }

  async ring(cam, now = Date.now()) {
    if (now - (this.lastRing.get(cam.id) || 0) < RING_GAP_MS) return null;
    this.lastRing.set(cam.id, now);
    const still = await this.capture(cam, "doorbell", now);
    const event = this.bus.publish("doorbell", { camera: cam.id, name: cam.name, still: still?.id || null });
    await this.notifier.send({
      title: `Doorbell: ${cam.name}`,
      body: still ? "Someone's at the door. Here's who." : "Someone's at the door.",
      priority: PRIORITY.NORMAL,
      bypassQuiet: true, // a ring at night still reaches the phone
      tag: "doorbell",
      still: still?.id || null,
      ...(still ? { image: still.image } : {}),
    });
    return event;
  }

  async motionAt(cam, now = Date.now()) {
    if (now - (this.lastMotion.get(cam.id) || 0) < MOTION_GAP_MS) return null;
    this.lastMotion.set(cam.id, now);
    const still = await this.capture(cam, "motion", now);
    return this.bus.publish("camera_motion", { camera: cam.id, name: cam.name, still: still?.id || null });
  }

  // Save a still on the home server. A camera that doesn't answer saves nothing.
  async capture(cam, kind, now = Date.now()) {
    let shot;
    try { shot = await this.adapter.cameraImage(cam.entity); } catch { return null; }
    const at = new Date(now);
    const id = `${cam.id}-${stamp(at)}-${kind}`;
    const entry = { id, camera: cam.id, kind, at: at.toISOString() };
    if (this.dir) {
      try {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.writeFileSync(path.join(this.dir, `${id}.jpg`), shot.image);
      } catch {
        return null;
      }
      this.stills.push(entry);
    } else {
      this.stills.push({ ...entry, image: shot.image });
    }
    this.prune(now);
    return { ...entry, image: shot.image };
  }

  prune(now = Date.now()) {
    const cutoff = now - KEEP_DAYS * 86_400_000;
    const drop = this.stills.filter((s, i) => Date.parse(s.at) < cutoff || i < this.stills.length - KEEP_STILLS);
    if (!drop.length) return;
    const gone = new Set(drop.map((s) => s.id));
    this.stills = this.stills.filter((s) => !gone.has(s.id));
    if (this.dir) for (const id of gone) fs.rm(path.join(this.dir, `${id}.jpg`), { force: true }, () => {});
  }

  loadStills() {
    try {
      return fs.readdirSync(this.dir).map((f) => f.match(/^(.+)-(\d{8})-(\d{6})-(doorbell|motion)\.jpg$/)).filter(Boolean)
        .map(([file, camera, d, t, kind]) => ({
          id: file.slice(0, -4), camera, kind,
          at: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}.000Z`,
        }))
        .sort((a, b) => a.at.localeCompare(b.at));
    } catch {
      return [];
    }
  }
}
