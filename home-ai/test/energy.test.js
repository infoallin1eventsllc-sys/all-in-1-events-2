// Energy: the estimate follows device states, the day's total adds up,
// a real meter replaces the estimate, and nothing is presented as measured
// unless it was.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome } from "./helpers.js";
import { createHome, loadConfig } from "../src/home.js";

test("an idle house draws the always-on load plus the water heater", async () => {
  const home = await testHome();
  home.registry.report("climate.main", { hvac: "idle" });
  assert.equal(home.energy.source(), "estimate");
  assert.equal(home.energy.nowKw(), 0.65);
  assert.deepEqual(home.energy.breakdown().map((p) => p.name).sort(), ["Always-on (fridge, network, standby)", "Water Heater"]);
});

test("estimate follows lights, fans, heating and the water heater", async () => {
  const home = await testHome();
  home.registry.report("climate.main", { hvac: "idle" });
  const base = home.energy.nowKw();
  await home.controller.execute({ device: "light.kitchen", command: { on: true, brightness: 50 }, origin: "owner" });
  assert.equal(home.energy.nowKw(), Math.round((base + 0.006) * 100) / 100);
  home.registry.report("climate.main", { hvac: "heating" });
  assert.ok(home.energy.nowKw() > 3.8);
  assert.equal(home.energy.breakdown()[0].name, "Heating & cooling");
  await home.controller.execute({ device: "water_heater.main", command: { on: false }, origin: "owner" });
  assert.ok(!home.energy.breakdown().some((p) => p.name === "Water Heater"));
});

test("today's kWh adds up and resets at midnight", async () => {
  const home = await testHome();
  home.registry.report("climate.main", { hvac: "idle" });
  const e = home.energy;
  const t0 = new Date("2026-09-26T16:00:00Z"); // noon in New York
  e.day = null;
  e.sample(t0);
  e.sample(new Date(t0.getTime() + 60 * 60_000)); // one hour later
  const kw = e.nowKw();
  assert.equal(Math.round(e.report().todayKwh * 100) / 100, Math.round(kw * 100) / 100);
  e.sample(new Date("2026-09-27T05:00:00Z")); // 1 AM the next day
  assert.equal(e.report().todayKwh, 0);
  assert.equal(e.report().samples.length, 1);
});

test("report has hourly averages, a peak and the top consumers", async () => {
  const home = await testHome();
  home.energy.seedSimulatedDay((h) => 0.5 + (h > 17 ? 2 : 0), new Date("2026-09-26T23:30:00Z")); // 7:30 PM local
  const r = home.energy.report();
  assert.equal(r.hourly.length, 24);
  assert.equal(r.hourly[10], 0.5);
  assert.equal(r.hourly[21], null);
  assert.equal(r.peak.kw, 2.5);
  assert.ok(r.breakdown.length >= 1);
  assert.equal(r.source, "estimate");
});

test("a whole-home meter replaces the estimate", async () => {
  const config = loadConfig();
  config.devices.push({ id: "sensor.home_power", name: "Home Energy Monitor", type: "power", room: "utility", ha_entity: "sensor.home_power" });
  const home = await createHome({ config, env: {}, dataDir: null });
  home.registry.report("sensor.home_power", { watts: 2450 }, "sensor");
  assert.equal(home.energy.source(), "meter");
  assert.equal(home.energy.nowKw(), 2.45);
  assert.deepEqual(home.energy.breakdown(), [{ name: "Home Energy Monitor", kw: 2.45 }]);
});
