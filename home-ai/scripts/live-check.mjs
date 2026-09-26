// One-command check of the live Claude agent: `npm run live-check`.
// Runs against the simulated house (never real hardware), so it's safe
// anywhere. Needs ANTHROPIC_API_KEY in the environment or in .env.
// Fails if any step falls back to offline mode, so a pass means Claude did it.
import { readFileSync, existsSync } from "node:fs";
import { createHome, loadConfig } from "../src/home.js";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY isn't set. Add it to .env (see .env.example) or the environment, then run again.");
  process.exit(2);
}

const home = await createHome({ config: loadConfig(), env: { ...process.env, HAVEN_ADAPTER: "simulator" }, dataDir: null, simSpeed: 1000 });
home.notifier.isQuietHours = () => false;
await home.adapter.start();

const errors = [];
home.bus.on("event", (e) => { if (e.type === "agent_error") errors.push(e.error); });
const dev = (id) => home.registry.get(id).state;
const results = [];

async function step(name, fn) {
  const before = errors.length;
  const t0 = Date.now();
  try {
    const detail = await fn();
    if (errors.length > before) throw new Error(`fell back to offline mode: ${errors.slice(before).join("; ")}`);
    results.push({ name, ok: true, detail, ms: Date.now() - t0 });
  } catch (err) {
    const cause = errors.length > before && !/fell back/.test(err.message) ? ` (${errors[errors.length - 1]})` : "";
    results.push({ name, ok: false, detail: String(err.message || err) + cause, ms: Date.now() - t0 });
  }
}

const chat = (text) => home.agent.chat(text, { conversationId: "live-check" });
const reply = (r) => {
  if (r.offline) throw new Error(`offline reply: ${r.reply}`);
  return `"${r.reply}"`;
};

await step("Uses Claude", async () => {
  if (home.agent.kind !== "claude") throw new Error(`agent is ${home.agent.kind}; check the key and HAVEN_MODEL`);
  return home.agent.model;
});

await step("Turns on the kitchen lights", async () => {
  const r = await chat("Turn on the kitchen lights");
  await new Promise((ok) => setTimeout(ok, 200));
  if (!dev("light.kitchen").on) throw new Error(`light still off; Claude said ${reply(r)}`);
  return reply(r);
});

await step("Garage waits for the homeowner's confirmation", async () => {
  const r = await chat("Open the garage door");
  await new Promise((ok) => setTimeout(ok, 200));
  if (dev("garage.door").door !== "closed") throw new Error("the garage moved without a confirmation");
  if (!home.controller.pendingList().some((p) => p.device === "garage.door")) throw new Error(`no confirmation was requested; Claude said ${reply(r)}`);
  return reply(r);
});

await step("Learns from \"I'm cold\"", async () => {
  const r = await chat("I'm cold");
  return reply(r);
});

await step("Answers a question about the house", async () => {
  const r = await chat("Is anything open or unlocked?");
  return reply(r);
});

await step("Writes a briefing", async () => {
  const b = await home.agent.briefing("House update", home.briefings.digest("now").text);
  if (!b?.title || !b?.body) throw new Error("no briefing came back");
  return `${b.title}: ${b.body}`;
});

await step("Reviews the day (reflection)", async () => {
  const r = await home.reflection.run();
  return r.message;
});

home.stop();
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${(r.ms / 1000).toFixed(1)}s)\n      ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} failed.` : `\nAll ${results.length} passed.`);
process.exit(failed ? 1 : 0);
