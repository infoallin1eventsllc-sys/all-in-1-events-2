// Every phrase the app and docs suggest, mapped to what should happen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome } from "./helpers.js";
import { parse } from "../src/agent/local.js";

const cases = [
  ["turn on the kitchen lights", [{ device: "light.kitchen", command: { on: true } }]],
  ["turn off the kitchen lights", [{ device: "light.kitchen", command: { on: false } }]],
  ["dim the living room lights to 30", [{ device: "light.living", command: { on: true, brightness: 30 } }]],
  ["turn on the porch lights", [{ device: "light.porch", command: { on: true } }]],
  ["turn on the driveway lights", [{ device: "light.driveway", command: { on: true } }]],
  ["turn on the garage lights", [{ device: "light.garage", command: { on: true } }]],
  ["turn on the bedroom fan", [{ device: "fan.primary", command: { on: true } }]],
  ["set the living room fan to 3", [{ device: "fan.living", command: { on: true, speed: 3 } }]],
  ["set the thermostat to 70", [{ device: "climate.main", command: { target: 70 } }]],
  ["set the heat to 68", [{ device: "climate.main", command: { mode: "heat", target: 68 } }]],
  ["set the ac to 74", [{ device: "climate.main", command: { mode: "cool", target: 74 } }]],
  ["turn on the heat", [{ device: "climate.main", command: { mode: "heat" } }]],
  ["turn on the ac", [{ device: "climate.main", command: { mode: "cool" } }]],
  ["turn off the ac", [{ device: "climate.main", command: { mode: "off" } }]],
  ["make it warmer", [{ device: "climate.main", command: { target: 73 } }]],
  ["make it cooler", [{ device: "climate.main", command: { target: 69 } }]],
  ["open the garage", [{ device: "garage.door", command: { door: "open" } }]],
  ["close the garage door", [{ device: "garage.door", command: { door: "closed" } }]],
  ["lock the front door", [{ device: "lock.front", command: { locked: true } }]],
  ["unlock the front door", [{ device: "lock.front", command: { locked: false } }]],
  ["lock the garage entry door", [{ device: "lock.garage_entry", command: { locked: true } }]],
  ["shut off the water", [{ device: "valve.main_water", command: { open: false } }]],
  ["turn the water back on", [{ device: "valve.main_water", command: { open: true } }]],
  ["turn on the water", [{ device: "valve.main_water", command: { open: true } }]],
  ["turn off the water heater", [{ device: "water_heater.main", command: { on: false } }]],
  ["set the water heater to 120", [{ device: "water_heater.main", command: { target: 120 } }]],
  ["water heater vacation mode", [{ device: "water_heater.main", command: { mode: "vacation" } }]],
];

for (const [phrase, expected] of cases) {
  test(`parses: ${phrase}`, async () => {
    const home = await testHome();
    const plan = parse(phrase, home);
    assert.ok(plan?.steps, `no plan for "${phrase}": ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.steps, expected);
  });
}

test("scenes by phrase", async () => {
  const home = await testHome();
  const scene = (t) => parse(t, home)?.steps?.[0]?.scene;
  assert.equal(scene("goodnight"), "goodnight");
  assert.equal(scene("good night haven"), "goodnight");
  assert.equal(scene("good morning"), "morning");
  assert.equal(scene("movie time"), "movie");
  assert.equal(scene("i'm leaving"), "away");
  assert.equal(scene("i'm home"), "home");
});

test("questions get answers, not actions", async () => {
  const home = await testHome();
  assert.match(parse("status", home).reply, /Garage is closed/);
  assert.match(parse("is the garage open?", home).reply, /garage door is closed/i);
  assert.match(parse("is the front door locked?", home).reply, /locked/);
  assert.match(parse("what's the temperature", home).reply, /°F inside/);
  assert.match(parse("how warm is it", home).reply, /°F inside/);
});

test("'turn on the lights' with no room and no recent motion asks which room", async () => {
  const home = await testHome();
  const plan = parse("turn on the lights", home);
  assert.match(plan.reply, /Which room/);
  assert.ok(home.registry.byType("light").every((l) => !l.state.on));
});

test("'turn on the lights' uses the room with recent motion", async () => {
  const home = await testHome({ dark: false });
  home.adapter.sensor("motion.hallway", { motion: true });
  const plan = parse("turn on the lights", home);
  assert.deepEqual(plan.steps, [{ device: "light.hallway", command: { on: true } }]);
});

test("'all the lights off' turns off every light", async () => {
  const home = await testHome();
  const plan = parse("turn off all the lights", home);
  assert.equal(plan.steps.length, home.registry.byType("light").length);
});

test("gibberish gets a helpful fallback", async () => {
  const home = await testHome();
  const r = await home.agent.chat("purple monkey dishwasher");
  assert.match(r.reply, /didn't catch that/);
  assert.equal(r.actions.length, 0);
});

test("the panel's room is used when no room is named", async () => {
  const home = await testHome();
  assert.deepEqual(parse("turn off the lights", home, { panelRoom: "primary" }).steps, [{ device: "light.primary", command: { on: false } }]);
  assert.equal(parse("it's too bright", home, { panelRoom: "kitchen" }).feedback.room, "kitchen");
  // A named room still wins.
  assert.deepEqual(parse("turn off the kitchen lights", home, { panelRoom: "primary" }).steps, [{ device: "light.kitchen", command: { on: false } }]);
  const r = await home.agent.chat("turn on the lights", { panelRoom: "living" });
  assert.equal(home.registry.get("light.living").state.on, true);
  assert.match(r.reply, /Living Room Lights/);
});
