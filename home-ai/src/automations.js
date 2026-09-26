// Deterministic automations. These run locally, every time, with or without
// the internet or the AI. Life-safety and comfort basics never wait on a
// language model:
//
//   motion       -> lights on when it's dark, off again when the room is empty
//   leak         -> main water shut off within a second, urgent alert
//   approaching  -> driveway and porch lights on (garage opens only if opted in)
//   arrived      -> welcome-home scene, climate back from setback
//   everyone out -> away scene: lights and fans off, garage closed, doors locked
//   garage open  -> reminder after N minutes, auto-close if nobody is home
//   freeze risk  -> heat on and urgent alert
//   door open while heating/cooling -> energy nudge
import { inWindow, localParts } from "./core/time.js";
import { PRIORITY } from "./notify.js";

export class Automations {
  constructor({ config, registry, controller, bus, notifier, presence, learner }) {
    this.config = config;
    this.s = config.settings;
    this.registry = registry;
    this.controller = controller;
    this.bus = bus;
    this.notifier = notifier;
    this.presence = presence;
    this.learner = learner;
    this.autoLit = new Map();      // light id -> room it was lit for
    this.garageOpenedAt = null;
    this.garageAlerted = false;
    this.freezeAlertedAt = 0;
    this.doorHvacSince = null;
    this.doorHvacAlerted = false;
  }

  start() {
    this.bus.on("state", (e) => this.onState(e).catch((err) => this.fail("state", err)));
    this.bus.on("action", (e) => this.onAction(e));
    this.bus.on("presence", (e) => this.onPresence(e).catch((err) => this.fail("presence", err)));
    this.timer = setInterval(() => this.tick().catch((err) => this.fail("tick", err)), 30_000);
  }

  stop() {
    clearInterval(this.timer);
  }

  fail(where, err) {
    this.bus.publish("automation_error", { where, error: String(err?.message || err) });
  }

  run(device, command, reason, extra = {}) {
    return this.controller.execute({ device, command, origin: "automation", reason, ...extra });
  }

  isDark() {
    const lux = this.registry.byType("illuminance")[0]?.state.lux;
    const night = inWindow(localParts(this.config.home.timezone).hhmm, this.s.nightStart, this.s.nightEnd);
    return night || (lux !== undefined && lux < this.s.darkLuxThreshold);
  }

  // ---- event handlers ----

  async onState(e) {
    const device = this.registry.get(e.device);
    if (!device) return;
    const c = e.changes;

    if (device.type === "motion" && c.motion?.to === true) await this.onMotion(device);
    if (device.type === "leak" && c.wet) await this.onLeak(device, c.wet.to);
    if (device.type === "garage" && c.door) this.onGarage(c.door.to);
    if (device.type === "thermostat" && c.current && c.current.to < this.s.freezeAlertF) await this.freezeCheck();
  }

  // A person changed a light by hand: stop managing it so we don't fight them.
  onAction(e) {
    if (e.origin !== "automation" && this.autoLit.has(e.device)) this.autoLit.delete(e.device);
  }

  async onMotion(sensor) {
    if (!this.isDark()) return;
    // The homeowner asked not to have this room lit automatically now.
    if (this.learner && !this.learner.allowMotionLight(sensor.room)) return;
    const lights = sensor.lights
      ? sensor.lights.map((id) => this.registry.get(id)).filter(Boolean)
      : this.registry.byRoom(sensor.room).filter((d) => d.type === "light");
    for (const light of lights) {
      if (light.state.on) continue;
      const brightness = this.learner?.preferredBrightness(light.room) ?? 100;
      const r = await this.run(light.id, { on: true, brightness }, `Motion: ${sensor.name}`);
      if (r.status === "done") this.autoLit.set(light.id, sensor.room);
    }
  }

  async onLeak(sensor, wet) {
    if (wet) {
      const valve = this.registry.byType("water_valve")[0];
      const shut = valve ? await this.run(valve.id, { open: false }, `Leak at ${sensor.name}`) : null;
      if (sensor.room === "utility") {
        for (const wh of this.registry.byType("water_heater")) {
          await this.run(wh.id, { on: false }, `Leak next to the water heater`);
        }
      }
      await this.notifier.send({
        priority: PRIORITY.URGENT,
        title: "Water leak detected",
        body: `${sensor.name} is wet. ${shut?.status === "done" || valve?.state.open === false ? "I shut off the main water." : "I could NOT shut off the water. Turn off the main valve now."} Check the area and dry the sensor.`,
        tag: "leak",
      });
    } else {
      const stillWet = this.registry.byType("leak").some((s) => s.state.wet);
      if (!stillWet) {
        await this.notifier.send({
          priority: PRIORITY.NORMAL,
          title: "Leak sensor is dry",
          body: `${sensor.name} is dry again. The main water is still off for safety. Turn it back on from the Haven app when you're sure the leak is fixed.`,
          tag: "leak",
        });
      }
    }
  }

  onGarage(door) {
    if (door === "open") {
      this.garageOpenedAt = Date.now();
      this.garageAlerted = false;
    } else if (door === "closed") {
      this.garageOpenedAt = null;
    }
  }

  async onPresence(e) {
    const s = this.s;
    if (e.kind === "approaching") {
      if (this.isDark()) {
        for (const light of this.registry.byType("light").filter((l) => l.exterior)) {
          await this.run(light.id, { on: true, brightness: 100 }, `${e.name} is almost home`);
        }
      }
      if (s.autoOpenGarageOnArrival && e.trusted) {
        await this.run("garage.door", { door: "open" }, `${e.name} is pulling in`, { allowOverride: true });
      }
    }

    if (e.kind === "arrived") {
      const thermostat = this.registry.byType("thermostat")[0];
      const target = this.learner?.preferredTemp() ?? 71;
      if (thermostat?.state.setback) await this.run(thermostat.id, { mode: "auto", target }, `${e.name} is home`);
      if (this.isDark() && e.wasEmpty) await this.controller.runScene("home", "automation", `${e.name} arrived`);
      await this.notifier.send({ priority: PRIORITY.INFO, title: `Welcome home, ${e.name}`, body: "The house is ready." });
    }

    if (e.kind === "left" && this.presence.nobodyHome()) {
      const result = await this.controller.runScene("away", "automation", "Everyone left");
      await this.notifier.send({
        priority: PRIORITY.NORMAL,
        title: "House secured",
        body: `Everyone's out. Lights and fans are off, the garage is closed, doors are locked, and the thermostat is on setback. ${result.status === "partial" ? result.message : ""}`.trim(),
      });
    }
  }

  // ---- once-a-minute-ish checks ----

  async tick() {
    await this.motionLightsOff();
    await this.garageCheck();
    await this.freezeCheck();
    await this.doorHvacCheck();
  }

  async motionLightsOff() {
    const cutoff = Date.now() - this.s.motionLightsOffAfterMinutes * 60_000;
    for (const [lightId, room] of this.autoLit) {
      const sensors = this.registry.byType("motion").filter((m) =>
        m.room === room || (m.lights || []).includes(lightId));
      const active = sensors.some((m) => m.state.motion || (m.state.lastMotion && Date.parse(m.state.lastMotion) > cutoff));
      if (active) continue;
      this.autoLit.delete(lightId);
      await this.run(lightId, { on: false }, "No motion for a while");
    }
  }

  async garageCheck() {
    if (!this.garageOpenedAt) {
      const door = this.registry.byType("garage")[0];
      if (door?.state.door === "open") this.garageOpenedAt = Date.now(); // e.g. after a restart
      return;
    }
    const minutes = (Date.now() - this.garageOpenedAt) / 60_000;
    if (minutes < this.s.garageOpenAlertMinutes) return;

    if (this.presence.nobodyHome() && this.s.autoCloseGarageWhenAway) {
      const r = await this.run("garage.door", { door: "closed" }, "Garage left open with nobody home");
      await this.notifier.send({
        priority: PRIORITY.NORMAL,
        title: "Garage closed",
        body: r.status === "done" ? "The garage was open with nobody home, so I closed it." : `The garage is open with nobody home and I couldn't close it: ${r.message}`,
      });
      this.garageOpenedAt = null;
      return;
    }
    if (!this.garageAlerted) {
      this.garageAlerted = true;
      await this.notifier.send({
        priority: PRIORITY.NORMAL,
        title: "Garage still open",
        body: `The garage door has been open ${Math.round(minutes)} minutes. Reply "close the garage" or tap Close in the app.`,
        tag: "garage",
      });
    }
  }

  async freezeCheck() {
    const t = this.registry.byType("thermostat")[0];
    if (!t || t.state.current >= this.s.freezeAlertF) return;
    if (Date.now() - this.freezeAlertedAt < 60 * 60_000) return;
    this.freezeAlertedAt = Date.now();
    if (t.state.mode === "off" || t.state.mode === "cool") {
      await this.run(t.id, { mode: "heat", target: 62 }, "Freeze protection");
    }
    await this.notifier.send({
      priority: PRIORITY.URGENT,
      title: "House is getting cold",
      body: `It's ${t.state.current}°F inside. I turned the heat on to protect the pipes. If it keeps dropping, the furnace may need service.`,
    });
  }

  async doorHvacCheck() {
    const t = this.registry.byType("thermostat")[0];
    const openDoors = this.registry.byType("contact").filter((c) => c.state.open);
    const running = t && (t.state.hvac === "heating" || t.state.hvac === "cooling");
    if (!running || openDoors.length === 0) {
      this.doorHvacSince = null;
      this.doorHvacAlerted = false;
      return;
    }
    this.doorHvacSince ??= Date.now();
    if (!this.doorHvacAlerted && Date.now() - this.doorHvacSince > 5 * 60_000) {
      this.doorHvacAlerted = true;
      await this.notifier.send({
        priority: PRIORITY.NORMAL,
        title: "Door open while the AC/heat runs",
        body: `${openDoors.map((d) => d.name).join(", ")} has been open for 5 minutes while the system is ${t.state.hvac}.`,
      });
    }
  }
}

// Tracks who is home. Fed by phone/car geofences through Apple Shortcuts.
export class Presence {
  constructor({ config, bus }) {
    this.bus = bus;
    this.people = new Map(config.home.owners.map((o) => [o.id, { id: o.id, name: o.name, home: true, updated: null }]));
  }

  nobodyHome() {
    return [...this.people.values()].every((p) => !p.home);
  }

  list() {
    return [...this.people.values()];
  }

  // kind: "approaching" | "arrived" | "left"
  update(personId, kind, { trusted = true } = {}) {
    const p = this.people.get(personId);
    if (!p) return { status: "error", message: `Unknown person "${personId}".` };
    if (!["approaching", "arrived", "left"].includes(kind)) {
      return { status: "error", message: `"kind" must be approaching, arrived or left.` };
    }
    const wasEmpty = this.nobodyHome();
    if (kind === "arrived") p.home = true;
    if (kind === "left") p.home = false;
    p.updated = new Date().toISOString();
    this.bus.publish("presence", { person: personId, name: p.name, kind, trusted, wasEmpty });
    return { status: "done", message: `${p.name}: ${kind}.` };
  }
}
