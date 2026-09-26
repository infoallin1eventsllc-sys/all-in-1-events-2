import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome, settle } from "./helpers.js";
import { toServiceCalls, fromHaState } from "../src/adapters/homeassistant.js";

test("offline agent handles common commands", async () => {
  const home = await testHome();
  assert.equal(home.agent.kind, "local");

  await home.agent.chat("turn on the kitchen lights");
  assert.equal(home.registry.get("light.kitchen").state.on, true);

  await home.agent.chat("set the thermostat to 68");
  assert.equal(home.registry.get("climate.main").state.target, 68);

  await home.agent.chat("dim the living room lights to 30");
  assert.equal(home.registry.get("light.living").state.brightness, 30);

  await home.agent.chat("turn off all the lights");
  assert.ok(home.registry.byType("light").every((l) => !l.state.on));

  const status = await home.agent.chat("status");
  assert.match(status.reply, /Garage is closed/);
});

test("offline agent asks for confirmation to open the garage", async () => {
  const home = await testHome();
  const r = await home.agent.chat("open the garage");
  assert.equal(r.actions[0].status, "needs_confirmation");
  await settle();
  assert.equal(home.registry.get("garage.door").state.door, "closed");
});

test("goodnight scene locks up", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "lock.front", command: { locked: false }, origin: "owner" });
  await home.agent.chat("goodnight");
  assert.equal(home.registry.get("lock.front").state.locked, true);
  assert.equal(home.registry.get("climate.main").state.target, 68);
});

test("offline briefing flags an open garage", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "garage.door", command: { door: "open" }, origin: "owner" });
  await settle(50);
  const msg = await home.briefings.send({ id: "night", label: "Night lock-up check" });
  assert.match(msg.title, /check the house/);
  assert.match(msg.body, /Garage is open/);
});

test("Home Assistant mapping both ways", () => {
  assert.deepEqual(toServiceCalls("garage", { door: "open" }), [["cover", "open_cover", {}]]);
  assert.deepEqual(toServiceCalls("light", { on: true, brightness: 50 }), [["light", "turn_on", { brightness_pct: 50 }]]);
  assert.deepEqual(toServiceCalls("thermostat", { mode: "auto", target: 70 }), [
    ["climate", "set_hvac_mode", { hvac_mode: "heat_cool" }],
    ["climate", "set_temperature", { temperature: 70 }],
  ]);
  assert.deepEqual(fromHaState("lock", { state: "unlocked", attributes: {} }), { locked: false });
  assert.equal(fromHaState("light", { state: "on", attributes: { brightness: 255 } }).brightness, 100);
});
