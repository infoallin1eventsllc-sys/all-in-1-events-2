// Scene cards describe a scene from its own actions, so the words can't drift from what it does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { describeScene } from "../src/scenes.js";

const config = JSON.parse(fs.readFileSync(new URL("../config/home.json", import.meta.url), "utf8"));
const names = Object.fromEntries(config.devices.map((d) => [d.id, d.name]));
const say = (id) => describeScene(config.scenes[id], (d) => names[d] || d);

test("each demo scene reads as what it does", () => {
  assert.equal(say("home"), "Kitchen 90%, Living Room 70%, 71°F");
  assert.equal(say("movie"), "Living Room 15%, Kitchen off, Living Room Fan on");
  assert.equal(say("goodnight"), "Lights off, Bedroom Fan on, garage closed, doors locked, 68°F");
  assert.equal(say("away"), "Lights off, fans off, garage closed, doors locked, energy-saving temperature");
  assert.equal(say("morning"), "Kitchen 80%, Hallway 60%, 71°F, Porch off, Driveway off");
});

test("an empty or unknown scene describes as nothing", () => {
  assert.equal(describeScene(null), "");
  assert.equal(describeScene({ actions: [{ device: "speaker.den", command: { volume: 3 } }] }), "");
});

test("the panel state carries each scene's summary", async () => {
  const { testHome } = await import("./helpers.js");
  const { createRoutes } = await import("../src/api.js");
  const home = await testHome();
  const state = createRoutes(home).find(([m, re]) => m === "GET" && re.test("/api/state"))[3]();
  assert.equal(state.sceneInfo.home, "Kitchen 90%, Living Room 70%, 71°F");
  home.stop?.();
});
