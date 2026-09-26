// Offline command parser. Used when no Claude API key is set or the internet
// is down, so the essentials still work by text, Siri Shortcut, or watch:
// "turn off the kitchen lights", "set the thermostat to 70", "close the
// garage", "goodnight", "status".
import { homeState } from "./tools.js";
import { describeState } from "../core/controller.js";

const ROOM_ALIASES = { bedroom: "primary", "master": "primary", "living room": "living", lounge: "living", outside: "exterior", porch: "exterior", driveway: "exterior", hall: "hallway" };

export function createLocalAgent(home) {
  return {
    kind: "local",
    async chat(text, { origin = "agent" } = {}) {
      const plan = parse(text.toLowerCase().trim(), home);
      if (!plan) {
        return {
          reply: "I didn't catch that. Try \"turn off the kitchen lights\", \"set the thermostat to 70\", \"close the garage\", \"goodnight\", or \"status\".",
          actions: [],
        };
      }
      if (plan.reply) return { reply: plan.reply, actions: [] };
      const actions = [];
      for (const step of plan.steps) {
        const r = step.scene
          ? await home.controller.runScene(step.scene, origin, "Asked Haven")
          : await home.controller.execute({ device: step.device, command: step.command, origin, reason: "Asked Haven" });
        actions.push(r);
      }
      return { reply: actions.map((a) => a.message).join(" "), actions };
    },
    async briefing() {
      return null; // falls back to the template briefing
    },
    reset() {},
  };
}

export function parse(t, home) {
  const reg = home.registry;
  const step = (device, command) => ({ steps: [{ device, command }] });
  const scene = (name) => ({ steps: [{ scene: name }] });

  // Scenes
  if (/\bgood ?night\b|\bbedtime\b/.test(t)) return scene("goodnight");
  if (/\bgood morning\b/.test(t)) return scene("morning");
  if (/\bmovie\b/.test(t)) return scene("movie");
  if (/\b(i'?m|we'?re) (leaving|heading out)\b|\baway mode\b/.test(t)) return scene("away");
  if (/\b(i'?m|we'?re) home\b/.test(t)) return scene("home");

  // Status
  if (/\b(status|how'?s the house|what'?s (on|open)|everything ok)\b/.test(t)) {
    return { reply: statusSummary(home) };
  }
  if (/\bis the (garage|front door|door)\b/.test(t)) {
    const d = /garage/.test(t) && !/entry/.test(t) ? reg.get("garage.door") : reg.get("lock.front");
    return { reply: `The ${d.name.toLowerCase()} is ${describeState(d)}.` };
  }
  if (/\b(temp|temperature)\b.*\?|\bhow (warm|cold|hot)\b|^(what'?s|what is|how'?s) (the |it )?(temp|temperature|inside)/.test(t)) {
    const th = reg.byType("thermostat")[0];
    return { reply: `It's ${th.state.current}°F inside. The thermostat is ${describeState(th)}.` };
  }

  // Garage
  if (/\bgarage\b/.test(t) && !/\block|entry\b/.test(t) && !/lights?\b/.test(t)) {
    if (/\bopen\b/.test(t)) return step("garage.door", { door: "open" });
    if (/\b(close|shut)\b/.test(t)) return step("garage.door", { door: "closed" });
  }

  // Locks
  if (/\block up\b|\block (all|everything|the doors)\b/.test(t)) {
    return { steps: [...reg.byType("lock").map((l) => ({ device: l.id, command: { locked: true } })), { device: "garage.door", command: { door: "closed" } }] };
  }
  const lockMatch = t.match(/\b(unlock|lock)\b/);
  if (lockMatch) {
    const lock = /garage|entry/.test(t) ? "lock.garage_entry" : "lock.front";
    return step(lock, { locked: lockMatch[1] === "lock" });
  }

  // Water
  if (/\b(shut off|turn off|stop)\b.*\bwater\b(?! heater)/.test(t)) return step("valve.main_water", { open: false });
  if (/\b(turn on|restore)\b.*\bwater\b(?! heater)|\bturn the (main )?water (back )?on\b/.test(t)) return step("valve.main_water", { open: true });
  if (/\bwater heater\b/.test(t)) {
    const n = number(t);
    if (/vacation/.test(t)) return step("water_heater.main", { mode: "vacation" });
    if (/\boff\b/.test(t)) return step("water_heater.main", { on: false });
    if (n) return step("water_heater.main", { target: n });
    if (/\bon\b/.test(t)) return step("water_heater.main", { on: true });
  }

  // Climate
  const th = reg.byType("thermostat")[0];
  if (/\b(thermostat|temp|temperature|heat|ac|a\/c|air)\b/.test(t) || /\b(warmer|cooler|colder)\b/.test(t)) {
    const n = number(t);
    if (/\b(turn off|off)\b/.test(t) && !n) return step(th.id, { mode: "off" });
    if (/\b(turn on|start)\b/.test(t) && !n) {
      if (/\bheat\b/.test(t)) return step(th.id, { mode: "heat" });
      if (/\b(ac|a\/c|air|cool)\b/.test(t)) return step(th.id, { mode: "cool" });
      return step(th.id, { mode: "auto" });
    }
    if (/\bwarmer\b/.test(t)) return step(th.id, { target: th.state.target + 2 });
    if (/\b(cooler|colder)\b/.test(t)) return step(th.id, { target: th.state.target - 2 });
    if (n) {
      const mode = /\bheat\b/.test(t) ? "heat" : /\b(ac|a\/c|cool)\b/.test(t) ? "cool" : undefined;
      return step(th.id, { ...(mode ? { mode } : {}), target: n });
    }
  }

  // Lights and fans
  const kind = /\bfans?\b/.test(t) ? "fan" : /\blights?\b|\blamps?\b|\bdim\b/.test(t) ? "light" : null;
  if (kind) {
    const on = /\b(off|kill)\b/.test(t) ? false : /\b(on|dim|brighten)\b|\bto \d+/.test(t) ? true : null;
    if (on === null) return null;
    const everywhere = /\b(all|every|everywhere|whole house)\b/.test(t);
    let devices = reg.byType(kind);
    // A device named outright ("porch lights", "bedroom fan") wins over a room.
    const named = everywhere ? [] : devices.filter((d) => t.includes(d.name.toLowerCase().replace(/ (lights?|fan)$/, "")));
    const room = everywhere || named.length ? null : findRoom(t, home);
    if (named.length) devices = named;
    else if (room) devices = devices.filter((d) => d.room === room);
    else if (!everywhere) {
      // No room named: use where motion was seen in the last 15 minutes.
      const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
      const recent = reg.byType("motion").filter((m) => m.state.lastMotion && m.state.lastMotion > cutoff)
        .sort((a, b) => b.state.lastMotion.localeCompare(a.state.lastMotion))[0];
      devices = recent ? devices.filter((d) => d.room === recent.room) : [];
      if (!devices.length) {
        const rooms = [...new Set(reg.byType(kind).map((d) => home.config.rooms.find((r) => r.id === d.room)?.name || d.room))];
        return { reply: `Which room? I have ${kind}s in: ${rooms.join(", ")}.` };
      }
    }
    const n = number(t);
    const command = { on, ...(on && n !== null && kind === "light" ? { brightness: Math.min(100, n) } : {}), ...(on && n !== null && kind === "fan" ? { speed: Math.min(3, n) } : {}) };
    return { steps: devices.map((d) => ({ device: d.id, command })) };
  }

  return null;
}

function findRoom(t, home) {
  for (const [alias, id] of Object.entries(ROOM_ALIASES)) if (t.includes(alias)) return id;
  for (const r of home.config.rooms) if (t.includes(r.id) || t.includes(r.name.toLowerCase())) return r.id;
  return null;
}

function number(t) {
  const m = t.match(/\b(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

export function statusSummary(home) {
  const reg = home.registry;
  const th = reg.byType("thermostat")[0];
  const garage = reg.byType("garage")[0];
  const unlocked = reg.byType("lock").filter((l) => !l.state.locked);
  const lightsOn = reg.byType("light").filter((l) => l.state.on);
  const wet = reg.byType("leak").filter((l) => l.state.wet);
  const valve = reg.byType("water_valve")[0];
  const parts = [];
  if (wet.length) parts.push(`LEAK: ${wet.map((w) => w.name).join(", ")}.`);
  if (valve && !valve.state.open) parts.push("Main water is off.");
  parts.push(`It's ${th.state.current}°F inside (${th.state.mode}, set to ${th.state.target}°F).`);
  parts.push(`Garage is ${garage.state.door}.`);
  parts.push(unlocked.length ? `Unlocked: ${unlocked.map((l) => l.name).join(", ")}.` : "All doors locked.");
  parts.push(lightsOn.length ? `Lights on: ${lightsOn.map((l) => l.name.replace(/ Lights$/, "")).join(", ")}.` : "All lights off.");
  return parts.join(" ");
}

export { homeState };
