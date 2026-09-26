import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome, settle } from "./helpers.js";

test("motion turns on lights when it's dark", async () => {
  const home = await testHome({ dark: true });
  home.adapter.sensor("motion.kitchen", { motion: true });
  await settle(50);
  assert.equal(home.registry.get("light.kitchen").state.on, true);
});

test("motion does nothing in daylight", async () => {
  const home = await testHome({ dark: false });
  home.adapter.sensor("motion.kitchen", { motion: true });
  await settle(50);
  assert.equal(home.registry.get("light.kitchen").state.on, false);
});

test("driveway motion lights the driveway and porch", async () => {
  const home = await testHome({ dark: true });
  home.adapter.sensor("motion.driveway", { motion: true });
  await settle(50);
  assert.equal(home.registry.get("light.driveway").state.on, true);
  assert.equal(home.registry.get("light.porch").state.on, true);
});

test("motion lights turn off after the room is empty", async () => {
  const home = await testHome({ dark: true, settings: { motionLightsOffAfterMinutes: 0 } });
  home.adapter.sensor("motion.kitchen", { motion: true });
  await settle(50);
  home.adapter.sensor("motion.kitchen", { motion: false, lastMotion: new Date(Date.now() - 60_000).toISOString() });
  await home.automations.tick();
  await settle(50);
  assert.equal(home.registry.get("light.kitchen").state.on, false);
});

test("a light someone turned on by hand is left alone", async () => {
  const home = await testHome({ dark: true, settings: { motionLightsOffAfterMinutes: 0 } });
  home.adapter.sensor("motion.kitchen", { motion: true });
  await settle(50);
  await home.controller.execute({ device: "light.kitchen", command: { brightness: 40 }, origin: "owner" });
  home.adapter.sensor("motion.kitchen", { motion: false, lastMotion: new Date(Date.now() - 60_000).toISOString() });
  await home.automations.tick();
  await settle(50);
  assert.equal(home.registry.get("light.kitchen").state.on, true);
});

test("a leak shuts off water and sends an urgent alert", async () => {
  const home = await testHome();
  const alerts = [];
  home.bus.on("notification", (n) => alerts.push(n));
  home.adapter.sensor("leak.water_heater", { wet: true });
  await settle(80);
  assert.equal(home.registry.get("valve.main_water").state.open, false);
  assert.equal(home.registry.get("water_heater.main").state.on, false);
  assert.equal(alerts[0].priority, "urgent");
  assert.match(alerts[0].body, /shut off the main water/);
});

test("everyone leaving secures the house", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "light.living", command: { on: true }, origin: "owner" });
  await home.controller.execute({ device: "lock.front", command: { locked: false }, origin: "owner" });
  await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "owner" });
  await settle(50);
  home.controller.lastMove.clear(); // skip the garage anti-bounce wait in tests
  home.presence.update("owner", "left");
  await settle(150);
  assert.equal(home.registry.get("light.living").state.on, false);
  assert.equal(home.registry.get("lock.front").state.locked, true);
  assert.equal(home.registry.get("garage.door").state.door, "closed");
  assert.equal(home.registry.get("climate.main").state.setback, true);
});

test("approaching home at night turns on outside lights but does not open the garage by default", async () => {
  const home = await testHome({ dark: true });
  home.presence.update("owner", "approaching");
  await settle(80);
  assert.equal(home.registry.get("light.driveway").state.on, true);
  assert.equal(home.registry.get("garage.door").state.door, "closed");
});

test("garage opens on arrival only when the owner opted in", async () => {
  const home = await testHome({ dark: false, settings: { autoOpenGarageOnArrival: true } });
  home.presence.update("owner", "approaching");
  await settle(80);
  assert.notEqual(home.registry.get("garage.door").state.door, "closed");
});

test("non-urgent alerts are held during quiet hours, urgent ones are not", async () => {
  const home = await testHome();
  home.notifier.isQuietHours = () => true;
  const normal = await home.notifier.send({ title: "Garage open", body: "..." });
  const urgent = await home.notifier.send({ title: "Leak", body: "...", priority: "urgent" });
  assert.equal(normal.held, true);
  assert.equal(urgent.held, undefined);
  assert.equal(home.notifier.takeHeld().length, 1);
});

test("a cold snap triggers freeze protection right away", async () => {
  const home = await testHome();
  const alerts = [];
  home.bus.on("notification", (n) => alerts.push(n));
  await home.controller.execute({ device: "climate.main", command: { mode: "off" }, origin: "owner" });
  home.adapter.sensor("climate.main", { current: 48 });
  await settle(60);
  assert.equal(home.registry.get("climate.main").state.mode, "heat");
  assert.equal(alerts.at(-1).priority, "urgent");
});
