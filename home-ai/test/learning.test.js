// How Haven learns the homeowner: feedback, habits, undos, memory, forgetting,
// and the reflection agent. Nothing learned may act without the owner's yes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testHome, settle } from "./helpers.js";
import { blockOf } from "../src/learning.js";
import { localParts } from "../src/core/time.js";
import { createClaudeAgent, REFLECTION_SCHEMA } from "../src/agent/claude.js";

const nowBlock = (home) => blockOf(localParts(home.config.home.timezone).hhmm);

test("time of day blocks", () => {
  assert.equal(blockOf("07:00"), "morning");
  assert.equal(blockOf("13:30"), "day");
  assert.equal(blockOf("19:45"), "evening");
  assert.equal(blockOf("23:10"), "night");
  assert.equal(blockOf("02:00"), "night");
});

test("'I'm cold' warms the house and remembers it for this time of day", async () => {
  const home = await testHome();
  const r = await home.agent.chat("I'm cold");
  assert.equal(home.registry.get("climate.main").state.target, 73);
  assert.match(r.reply, /Raised the thermostat to 73°F/);
  assert.equal(home.learner.preferredTemp(), 73);
  assert.equal(home.learner.profile.feedback.at(-1).feeling, "too_cold");
});

test("'it's stuffy' cools, and turns the system on if it was off", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "climate.main", command: { mode: "off" }, origin: "owner" });
  await home.agent.chat("it's so stuffy in here");
  const t = home.registry.get("climate.main").state;
  assert.equal(t.target, 69);
  assert.equal(t.mode, "auto");
});

test("'too bright' dims the named room and remembers the level", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "light.kitchen", command: { on: true, brightness: 90 }, origin: "owner" });
  const r = await home.agent.chat("the kitchen is too bright");
  assert.equal(home.registry.get("light.kitchen").state.brightness, 60);
  assert.match(r.reply, /Dimmed the kitchen lights to 60%/);
  assert.equal(home.learner.preferredBrightness("kitchen"), 60);
});

test("learned brightness is used by motion lights", async () => {
  const home = await testHome({ dark: true });
  home.learner.profile.comfort.brightness.hallway = { [nowBlock(home)]: 35 };
  home.adapter.sensor("motion.hallway", { motion: true });
  await settle(60);
  assert.equal(home.registry.get("light.hallway").state.brightness, 35);
});

test("arriving home restores the temperature they like", async () => {
  const home = await testHome();
  await home.controller.execute({ device: "climate.main", command: { setback: true }, origin: "owner" });
  home.learner.profile.comfort.tempF[nowBlock(home)] = 69;
  home.presence.update("owner", "arrived");
  await settle(60);
  assert.equal(home.registry.get("climate.main").state.target, 69);
});

test("a habit on three different days becomes a suggestion, never an action", async () => {
  const home = await testHome();
  const th = home.registry.get("climate.main");
  home.learner.observe(th, { target: 68 }, { date: "2026-09-20", hhmm: "21:25" });
  home.learner.observe(th, { target: 68 }, { date: "2026-09-21", hhmm: "21:40" });
  assert.equal(home.learner.pendingSuggestions().length, 0);
  home.learner.observe(th, { target: 68 }, { date: "2026-09-22", hhmm: "21:30" });
  const [s] = home.learner.pendingSuggestions();
  assert.match(s.text, /set the thermostat to 68°F around 9:30 PM/);
  assert.equal(home.learner.profile.routines.length, 0);

  const accepted = home.learner.respond(s.id, true);
  assert.match(accepted.message, /every day at 9:30 PM/);
  await home.learner.runRoutines({ date: "2026-09-23", hhmm: "21:30" });
  assert.equal(home.registry.get("climate.main").state.target, 68);
  // Only once a day.
  await home.controller.execute({ device: "climate.main", command: { target: 71 }, origin: "owner" });
  await home.learner.runRoutines({ date: "2026-09-23", hhmm: "21:30" });
  assert.equal(home.registry.get("climate.main").state.target, 71);
});

test("a dismissed suggestion is never offered again", async () => {
  const home = await testHome();
  const fan = home.registry.get("fan.primary");
  for (const d of ["2026-09-20", "2026-09-21", "2026-09-22"]) home.learner.observe(fan, { on: true }, { date: d, hhmm: "22:00" });
  const [s] = home.learner.pendingSuggestions();
  home.learner.respond(s.id, false);
  home.learner.observe(fan, { on: true }, { date: "2026-09-23", hhmm: "22:05" });
  assert.equal(home.learner.pendingSuggestions().length, 0);
});

test("undoing motion lights twice leads to 'stop doing that', and accepting it works", async () => {
  const home = await testHome({ dark: true });
  for (let i = 0; i < 2; i++) {
    home.adapter.sensor("motion.kitchen", { motion: true });
    await settle(60);
    assert.equal(home.registry.get("light.kitchen").state.on, true);
    await home.controller.execute({ device: "light.kitchen", command: { on: false }, origin: "owner" });
    home.adapter.sensor("motion.kitchen", { motion: false });
    await settle(20);
  }
  const [s] = home.learner.pendingSuggestions();
  assert.equal(s.type, "skip_motion_lights");
  home.learner.respond(s.id, true);
  home.adapter.sensor("motion.kitchen", { motion: true });
  await settle(60);
  assert.equal(home.registry.get("light.kitchen").state.on, false);
});

test("learned routines can never open, unlock or restore water", async () => {
  const home = await testHome();
  const added = home.learner.applyReflection({
    suggestions: [
      { device: "garage.door", command: { door: "open" }, time: "07:30" },
      { device: "lock.front", command: { locked: false }, time: "07:30" },
      { device: "light.kitchen", command: { on: "yes" }, time: "07:30" },
      { device: "light.porch", command: { on: false }, time: "23:00", text: "Turn the porch light off at 11 PM?" },
    ],
  });
  assert.equal(added, 1);
  assert.equal(home.learner.pendingSuggestions()[0].device, "light.porch");
  // Even a hand-made routine for the garage is refused by the safety layer.
  home.learner.profile.routines.push({ id: "x", device: "garage.door", command: { door: "open" }, time: "07:30", label: "open garage" });
  await home.learner.runRoutines({ date: "2026-09-26", hhmm: "07:30" });
  await settle(30);
  assert.equal(home.registry.get("garage.door").state.door, "closed");
});

test("likes, dislikes and notes are remembered, listed and forgotten", async () => {
  const home = await testHome();
  await home.agent.chat("I don't like the porch light on all night");
  await home.agent.chat("I love the living room dim in the evening");
  await home.agent.chat("remember that my mom visits on Sundays");
  const r = await home.agent.chat("what do you know about me");
  assert.match(r.reply, /Doesn't like the porch light on all night/);
  assert.match(r.reply, /Likes the living room dim in the evening/);
  assert.match(r.reply, /my mom visits on sundays/i);

  const dislike = home.learner.view().items.find((i) => i.kind === "dislike");
  home.learner.forget(dislike.id);
  assert.ok(!home.learner.summary().includes("porch light"));
  const all = await home.agent.chat("forget everything you know about me");
  assert.match(all.reply, /forgotten everything/);
  assert.equal(home.learner.view().items.length, 0);
  assert.equal(home.learner.profile.conversations.length, 1); // only the forget exchange itself
});

test("every conversation is logged for the reflection agent", async () => {
  const home = await testHome();
  await home.agent.chat("turn on the kitchen lights");
  const log = home.learner.dayLog();
  assert.equal(log.conversations.at(-1).you, "turn on the kitchen lights");
  assert.match(log.conversations.at(-1).haven, /Kitchen Lights/);
});

test("offline reflection turns repeated complaints into a note", async () => {
  const home = await testHome();
  await home.agent.chat("I'm cold");
  await home.agent.chat("I'm freezing");
  const r = await home.reflection.run();
  assert.equal(r.added, 1);
  assert.match(home.learner.summary(), /Often feels cold/);
  const again = await home.reflection.run();
  assert.equal(again.added, 0);
});

test("Claude reflection: structured output is requested and its findings merged", async () => {
  const home = await testHome();
  const requests = [];
  const fetch = async (url, init) => {
    requests.push(JSON.parse(init.body));
    const out = {
      notes: ["Usually in bed by 10:30 PM"],
      likes: ["a cool bedroom at night"],
      dislikes: [],
      suggestions: [{ device: "climate.main", command_json: "{\"target\": 67}", time: "22:15", text: "Want me to set 67°F at 10:15 PM every night?" }],
    };
    return new Response(JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5",
      content: [{ type: "text", text: JSON.stringify(out) }], stop_reason: "end_turn", stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const claude = await createClaudeAgent(home, { apiKey: "k", model: "claude-opus-5", effort: "medium", fetch, promptPath: new URL("../prompts/agent-system.md", import.meta.url) });
  const found = await claude.reflect(home.learner.dayLog());
  assert.deepEqual(requests[0].output_config.format, { type: "json_schema", schema: REFLECTION_SCHEMA });
  assert.match(requests[0].system, /reflection agent/);
  assert.equal(home.learner.applyReflection(found), 3); // a note, a like, a suggestion
  assert.match(home.learner.summary(), /Usually in bed by 10:30 PM/);
  assert.match(home.learner.pendingSuggestions()[0].text, /67°F/);
});

test("Claude conversation: record_feedback and remember tools go through the learner", async () => {
  const home = await testHome();
  const responses = [
    [{ type: "tool_use", id: "t1", name: "record_feedback", input: { feeling: "too_warm" } },
     { type: "tool_use", id: "t2", name: "remember", input: { kind: "like", text: "a cool house at night" } }],
    [{ type: "text", text: "Cooled it to 69°F. I'll remember you like it cooler." }],
  ];
  const fetch = async () => {
    const content = responses.shift();
    return new Response(JSON.stringify({
      id: "m", type: "message", role: "assistant", model: "claude-opus-5", content,
      stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const claude = await createClaudeAgent(home, { apiKey: "k", model: "claude-opus-5", effort: "medium", fetch, promptPath: new URL("../prompts/agent-system.md", import.meta.url) });
  await claude.chat("ugh it's warm, and I like the house cool at night");
  assert.equal(home.registry.get("climate.main").state.target, 69);
  assert.match(home.learner.summary(), /Likes a cool house at night/);
});
