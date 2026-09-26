import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome, settle } from "./helpers.js";

test("owner can open the garage directly", async () => {
  const home = await testHome();
  const r = await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "owner" });
  assert.equal(r.status, "done");
  await settle();
  assert.equal(home.registry.get("garage.door").state.door, "open");
});

test("the AI cannot open the garage without the owner confirming", async () => {
  const home = await testHome();
  const r = await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "agent" });
  assert.equal(r.status, "needs_confirmation");
  assert.equal(home.registry.get("garage.door").state.door, "closed");

  const c = await home.controller.confirm(r.confirmId, true);
  assert.equal(c.status, "done");
  await settle();
  assert.equal(home.registry.get("garage.door").state.door, "open");
});

test("a confirmation can only be used once", async () => {
  const home = await testHome();
  const r = await home.controller.execute({ device: "lock.front", command: { locked: false }, origin: "agent" });
  await home.controller.confirm(r.confirmId, false);
  const again = await home.controller.confirm(r.confirmId, true);
  assert.equal(again.status, "error");
  assert.equal(home.registry.get("lock.front").state.locked, true);
});

test("automations and the proactive AI can never unlock doors", async () => {
  const home = await testHome();
  for (const origin of ["automation", "proactive"]) {
    const r = await home.controller.execute({ device: "lock.front", command: { locked: false }, origin });
    assert.equal(r.status, "refused");
  }
  assert.equal(home.registry.get("lock.front").state.locked, true);
});

test("protective actions are always allowed", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "lock.front", command: { locked: false }, origin: "owner" });
  const r = await home.controller.execute({ device: "lock.front", command: { locked: true }, origin: "proactive" });
  assert.equal(r.status, "done");
});

test("thermostat and water heater hard limits hold for everyone", async () => {
  const home = await testHome();
  const hot = await home.controller.execute({ device: "climate.main", command: { target: 95 }, origin: "owner" });
  assert.equal(hot.status, "refused");
  const scald = await home.controller.execute({ device: "water_heater.main", command: { target: 150 }, origin: "owner" });
  assert.equal(scald.status, "refused");
  const ok = await home.controller.execute({ device: "climate.main", command: { target: 70 }, origin: "agent" });
  assert.equal(ok.status, "done");
});

test("water can't be turned back on while a leak sensor is wet", async () => {
  const home = await testHome();
  home.adapter.sensor("leak.kitchen_sink", { wet: true });
  await settle(50);
  assert.equal(home.registry.get("valve.main_water").state.open, false);
  const r = await home.controller.execute({ device: "valve.main_water", command: { open: true }, origin: "owner" });
  assert.equal(r.status, "refused");
  assert.match(r.message, /leak/i);
});

test("invalid commands are rejected before reaching hardware", async () => {
  const home = await testHome();
  assert.equal((await home.controller.execute({ device: "light.kitchen", command: { on: "yes" }, origin: "owner" })).status, "error");
  assert.equal((await home.controller.execute({ device: "motion.kitchen", command: { motion: true }, origin: "owner" })).status, "error");
  assert.equal((await home.controller.execute({ device: "nope", command: { on: true }, origin: "owner" })).status, "error");
});

test("garage door can't be bounced up and down", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "owner" });
  const r = await home.controller.execute({ device: "garage.door", command: { door: "closed" }, origin: "owner" });
  assert.equal(r.status, "refused");
});

test("asking twice for the same risky action makes one confirmation, not two", async () => {
  const home = await testHome();
  const a = await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "agent" });
  const b = await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "agent" });
  assert.equal(a.confirmId, b.confirmId);
  assert.equal(home.controller.pendingList().length, 1);
});
