// The learning layer: how Haven gets to know the homeowner.
//
// It learns three ways, all day long:
//   1. What they say:  "I'm cold", "too bright", "just right", "I don't like
//      the porch light on all night". Comfort feedback acts right away and
//      is remembered for that time of day.
//   2. What they do:   the changes they make by hand. Setting 68°F around
//      9:30 PM on three different days becomes a suggested routine.
//   3. What they undo: turning off a light an automation just turned on,
//      twice, becomes a suggestion to stop doing that.
//
// Nothing learned ever acts on its own. Suggestions wait for the homeowner
// to accept them, and accepted routines still go through the safety
// controller as automations (so they can never open, unlock or restore
// water). Everything learned is visible and can be forgotten.
import { localParts, minutesOf } from "./core/time.js";
import { validateCommand } from "./core/registry.js";
import { classify, RISK } from "./safety.js";

export const BLOCKS = [
  { id: "morning", label: "mornings", start: "05:00", end: "11:00" },
  { id: "day", label: "during the day", start: "11:00", end: "17:00" },
  { id: "evening", label: "evenings", start: "17:00", end: "22:00" },
  { id: "night", label: "at night", start: "22:00", end: "05:00" },
];

export function blockOf(hhmm) {
  const t = minutesOf(hhmm);
  for (const b of BLOCKS) {
    const s = minutesOf(b.start), e = minutesOf(b.end);
    if (s <= e ? t >= s && t < e : t >= s || t < e) return b.id;
  }
  return "day";
}

const blockLabel = (id) => BLOCKS.find((b) => b.id === id)?.label || id;
const UNDO_WINDOW_MS = 2 * 60_000;
const MAX_LOG = 500;

export const FEELINGS = ["too_cold", "too_warm", "too_bright", "too_dark", "just_right"];

function emptyProfile() {
  return {
    comfort: { tempF: {}, brightness: {} }, // tempF[block], brightness[room][block]
    likes: [],
    dislikes: [],
    notes: [],          // things the reflection agent or the owner asked to remember
    suggestions: [],    // { id, key, type, text, status: pending|accepted|dismissed, ... }
    routines: [],       // accepted routines: { id, device, command, time, label, lastRun }
    rules: { skipMotionLights: [] }, // [{ room, block }]
    observations: [],   // owner changes: { date, hhmm, device, command }
    feedback: [],       // { ts, feeling, room, block, detail }
    conversations: [],  // { ts, you, haven }, for the overnight reflection
    undos: {},          // "room|block" -> count
  };
}

let seq = 0;
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export class Learner {
  constructor({ config, bus, store, registry, controller }) {
    this.config = config;
    this.tz = config.home.timezone;
    this.s = config.settings;
    this.bus = bus;
    this.store = store;
    this.registry = registry;
    this.controller = controller;
    this.profile = { ...emptyProfile(), ...(store.loadDoc("profile") || {}) };
    this.recentAuto = new Map(); // device -> { ts, reason }
  }

  start() {
    this.onActionBound = (e) => this.onAction(e);
    this.bus.on("action", this.onActionBound);
    this.timer = setInterval(() => this.runRoutines().catch(() => {}), 30_000);
  }

  stop() {
    clearInterval(this.timer);
  }

  save(change) {
    this.store.saveDoc("profile", this.profile);
    if (change) this.bus.publish("learned", { change });
  }

  parts() {
    return localParts(this.tz);
  }

  // ---------- watching what happens ----------

  onAction(e) {
    const device = this.registry.get(e.device);
    if (!device) return;
    if (e.origin === "automation") {
      this.recentAuto.set(e.device, { ts: Date.now(), reason: e.reason || "" });
      return;
    }
    if (e.origin !== "owner" && e.origin !== "agent") return;
    if (String(e.reason || "").startsWith("Your routine")) return;
    this.observe(device, e.command, this.parts());
  }

  // Record a homeowner-made change and look for patterns. Exposed for tests.
  observe(device, command, { date, hhmm }) {
    const block = blockOf(hhmm);

    // Undoing an automation: an automatic light switched straight back off.
    const auto = this.recentAuto.get(device.id);
    if (device.type === "light" && command.on === false && auto && Date.now() - auto.ts < UNDO_WINDOW_MS && /^Motion/.test(auto.reason)) {
      this.recentAuto.delete(device.id);
      const key = `${device.room}|${block}`;
      this.profile.undos[key] = (this.profile.undos[key] || 0) + 1;
      if (this.profile.undos[key] >= (this.s.learnUndoCount || 2)) {
        const room = this.roomName(device.room);
        this.suggest({
          key: `skip-motion:${key}`,
          type: "skip_motion_lights",
          room: device.room,
          block,
          text: `Stop turning on the ${room} lights automatically ${blockLabel(block)}? You've switched them back off ${this.profile.undos[key]} times.`,
        });
      }
    }

    // Comfort: what they set is what they like at this time of day.
    if (device.type === "thermostat" && typeof command.target === "number") {
      this.profile.comfort.tempF[block] = command.target;
    }
    if (device.type === "light" && typeof command.brightness === "number" && command.on !== false) {
      (this.profile.comfort.brightness[device.room] ||= {})[block] = command.brightness;
    }

    // Routines: the same change at about the same time on different days.
    const learnable = (device.type === "thermostat" && command.target !== undefined) ||
      ((device.type === "light" || device.type === "fan") && command.on !== undefined) ||
      (device.type === "water_heater" && (command.target !== undefined || command.mode !== undefined));
    if (learnable && classify(device, command) !== RISK.HIGH) {
      this.profile.observations.push({ date, hhmm, device: device.id, command });
      if (this.profile.observations.length > MAX_LOG) this.profile.observations.shift();
      this.detectRoutine(device, command, hhmm);
    }
    this.save();
  }

  detectRoutine(device, command, hhmm) {
    const key = JSON.stringify(command);
    const near = this.profile.observations.filter((o) =>
      o.device === device.id && JSON.stringify(o.command) === key && Math.abs(minutesOf(o.hhmm) - minutesOf(hhmm)) <= 30);
    const days = new Set(near.map((o) => o.date));
    if (days.size < (this.s.learnAfterDays || 3)) return;
    const mins = near.map((o) => minutesOf(o.hhmm)).sort((a, b) => a - b);
    const median = Math.round(mins[Math.floor(mins.length / 2)] / 5) * 5;
    const time = `${String(Math.floor(median / 60) % 24).padStart(2, "0")}:${String(median % 60).padStart(2, "0")}`;
    const what = describeCommand(device, command);
    this.suggest({
      key: `routine:${device.id}:${key}`,
      type: "routine",
      device: device.id,
      command,
      time,
      label: what,
      text: `You ${lcFirst(what)} around ${friendly(time)} most days. Want me to do that for you every day?`,
    });
  }

  suggest(s) {
    // Never repeat a suggestion, including one the homeowner said no to.
    if (this.profile.suggestions.some((x) => x.key === s.key)) return null;
    const suggestion = { id: newId("sug"), status: "pending", created: new Date().toISOString(), ...s };
    this.profile.suggestions.push(suggestion);
    this.save();
    this.bus.publish("suggestion", { id: suggestion.id, text: suggestion.text });
    return suggestion;
  }

  // ---------- what the homeowner tells Haven ----------

  // feeling: too_cold | too_warm | too_bright | too_dark | just_right
  async feedback(feeling, { room, origin = "owner" } = {}) {
    if (!FEELINGS.includes(feeling)) return { status: "error", message: `Unknown feeling "${feeling}".` };
    const { hhmm } = this.parts();
    const block = blockOf(hhmm);
    const th = this.registry.byType("thermostat")[0];
    const lim = this.config.limits;
    const results = [];
    let message;

    if (feeling === "too_cold" || feeling === "too_warm") {
      const delta = feeling === "too_cold" ? 2 : -2;
      const target = Math.min(lim.thermostatMaxF, Math.max(lim.thermostatMinF, th.state.target + delta));
      const command = { target };
      if (th.state.mode === "off") command.mode = "auto";
      const r = await this.controller.execute({ device: th.id, command, origin, reason: feeling === "too_cold" ? "You said you're cold" : "You said you're warm" });
      results.push(r);
      if (r.status === "done") this.profile.comfort.tempF[block] = target;
      message = r.status === "done"
        ? `${delta > 0 ? "Raised" : "Lowered"} the thermostat to ${target}°F. I'll remember you like it ${delta > 0 ? "warmer" : "cooler"} ${blockLabel(block)}.`
        : r.message;
    }

    if (feeling === "too_bright" || feeling === "too_dark") {
      room ||= this.likelyRoom();
      const lights = this.registry.byType("light").filter((l) => l.room === room);
      if (!room || !lights.length) return { status: "error", message: "Which room? Say, for example, \"the kitchen is too bright\"." };
      for (const l of lights) {
        let command;
        if (feeling === "too_bright") {
          if (!l.state.on) continue;
          command = { brightness: Math.max(10, l.state.brightness - 30) };
        } else {
          command = l.state.on ? { brightness: Math.min(100, l.state.brightness + 30) } : { on: true, brightness: 70 };
        }
        const r = await this.controller.execute({ device: l.id, command, origin, reason: feeling === "too_bright" ? "You said it's too bright" : "You said it's too dark" });
        results.push(r);
        if (r.status === "done") (this.profile.comfort.brightness[room] ||= {})[block] = command.brightness;
      }
      const level = this.profile.comfort.brightness[room]?.[block];
      message = results.length
        ? `${feeling === "too_bright" ? "Dimmed" : "Brightened"} the ${this.roomName(room)} lights${level ? ` to ${level}%` : ""}. I'll use that ${blockLabel(block)}.`
        : `The ${this.roomName(room)} lights are already off.`;
    }

    if (feeling === "just_right") {
      this.profile.comfort.tempF[block] = th.state.target;
      room ||= this.likelyRoom();
      for (const l of this.registry.byType("light").filter((x) => x.room === room && x.state.on)) {
        (this.profile.comfort.brightness[room] ||= {})[block] = l.state.brightness;
      }
      message = `Good to know. I'll aim for ${th.state.target}°F ${blockLabel(block)}${room && this.profile.comfort.brightness[room]?.[block] ? ` and keep the ${this.roomName(room)} lights around ${this.profile.comfort.brightness[room][block]}%` : ""}.`;
    }

    this.profile.feedback.push({ ts: new Date().toISOString(), feeling, room: room || null, block, indoorF: th.state.current });
    if (this.profile.feedback.length > MAX_LOG) this.profile.feedback.shift();
    this.save(`feedback:${feeling}`);
    return { status: "done", message, actions: results };
  }

  // kind: like | dislike | note
  remember(kind, text, source = "homeowner") {
    const list = { like: "likes", dislike: "dislikes", note: "notes" }[kind];
    if (!list || !text?.trim()) return { status: "error", message: "Tell me what to remember." };
    const clean = text.trim().replace(/\s+/g, " ").slice(0, 200);
    if (this.profile[list].some((x) => x.text.toLowerCase() === clean.toLowerCase())) {
      return { status: "done", message: "I already know that." };
    }
    this.profile[list].push({ id: newId(kind), text: clean, source, ts: new Date().toISOString() });
    this.save(`${kind}:${clean}`);
    return { status: "done", message: kind === "dislike" ? `Noted: you don't like ${clean}.` : kind === "like" ? `Noted: you like ${clean}.` : `I'll remember that.` };
  }

  logConversation(you, haven) {
    this.profile.conversations.push({ ts: new Date().toISOString(), you: String(you).slice(0, 500), haven: String(haven).slice(0, 500) });
    if (this.profile.conversations.length > 200) this.profile.conversations.shift();
    this.save();
  }

  // ---------- suggestions ----------

  pendingSuggestions() {
    return this.profile.suggestions.filter((s) => s.status === "pending");
  }

  respond(id, accept) {
    const s = this.profile.suggestions.find((x) => x.id === id);
    if (!s || s.status !== "pending") return { status: "error", message: "That suggestion isn't waiting anymore." };
    s.status = accept ? "accepted" : "dismissed";
    s.decided = new Date().toISOString();
    if (!accept) {
      this.save(`dismissed:${s.key}`);
      return { status: "done", message: "Okay, I won't suggest that again." };
    }
    if (s.type === "routine") {
      this.profile.routines.push({ id: newId("rt"), device: s.device, command: s.command, time: s.time, label: s.label, lastRun: null });
    } else if (s.type === "skip_motion_lights") {
      this.profile.rules.skipMotionLights.push({ room: s.room, block: s.block });
    } else if (s.type === "comfort" && typeof s.tempF === "number") {
      this.profile.comfort.tempF[s.block] = s.tempF;
    }
    this.save(`accepted:${s.key}`);
    return { status: "done", message: s.type === "routine" ? `Done. I'll ${lcFirst(s.label)} every day at ${friendly(s.time)}.` : "Done. I'll do it that way from now on." };
  }

  async runRoutines({ date, hhmm } = this.parts()) {
    for (const r of this.profile.routines) {
      if (r.time !== hhmm || r.lastRun === date) continue;
      r.lastRun = date;
      this.save();
      await this.controller.execute({ device: r.device, command: { ...r.command }, origin: "automation", reason: `Your routine: ${r.label}` });
    }
  }

  // ---------- forgetting ----------

  forget(id) {
    if (id === "all") {
      this.profile = emptyProfile();
      this.save("forgot:all");
      return { status: "done", message: "I've forgotten everything I learned about you." };
    }
    if (id?.startsWith("comfort:")) {
      const [, what, block] = id.split(":");
      if (what === "temp") delete this.profile.comfort.tempF[block];
      else delete this.profile.comfort.brightness[what]?.[block];
      this.save(`forgot:${id}`);
      return { status: "done", message: "Forgotten." };
    }
    for (const list of ["likes", "dislikes", "notes", "routines"]) {
      const i = this.profile[list].findIndex((x) => x.id === id);
      if (i >= 0) {
        this.profile[list].splice(i, 1);
        this.save(`forgot:${id}`);
        return { status: "done", message: "Forgotten." };
      }
    }
    const rule = /^rule:(\d+)$/.exec(id || "");
    if (rule && this.profile.rules.skipMotionLights[rule[1]]) {
      this.profile.rules.skipMotionLights.splice(Number(rule[1]), 1);
      this.save(`forgot:${id}`);
      return { status: "done", message: "Forgotten. Motion lights will come on there again." };
    }
    return { status: "error", message: "I couldn't find that." };
  }

  // ---------- used by automations and the AI ----------

  allowMotionLight(room, hhmm = this.parts().hhmm) {
    const block = blockOf(hhmm);
    return !this.profile.rules.skipMotionLights.some((r) => r.room === room && r.block === block);
  }

  preferredBrightness(room, hhmm = this.parts().hhmm) {
    return this.profile.comfort.brightness[room]?.[blockOf(hhmm)] ?? null;
  }

  preferredTemp(hhmm = this.parts().hhmm) {
    return this.profile.comfort.tempF[blockOf(hhmm)] ?? null;
  }

  likelyRoom() {
    const recent = this.registry.byType("motion").filter((m) => m.state.lastMotion)
      .sort((a, b) => b.state.lastMotion.localeCompare(a.state.lastMotion))[0];
    return recent?.room || null;
  }

  roomName(id) {
    return (this.config.rooms.find((r) => r.id === id)?.name || id).toLowerCase();
  }

  // Everything learned, as items the app can list and the owner can forget.
  view() {
    const p = this.profile;
    const items = [];
    for (const [block, t] of Object.entries(p.comfort.tempF)) items.push({ id: `comfort:temp:${block}`, kind: "comfort", text: `Likes ${t}°F ${blockLabel(block)}` });
    for (const [room, blocks] of Object.entries(p.comfort.brightness)) {
      for (const [block, b] of Object.entries(blocks)) items.push({ id: `comfort:${room}:${block}`, kind: "comfort", text: `${cap(this.roomName(room))} lights at ${b}% ${blockLabel(block)}` });
    }
    for (const x of p.likes) items.push({ id: x.id, kind: "like", text: `Likes ${x.text}` });
    for (const x of p.dislikes) items.push({ id: x.id, kind: "dislike", text: `Doesn't like ${x.text}` });
    for (const x of p.notes) items.push({ id: x.id, kind: "note", text: x.text });
    for (const r of p.routines) items.push({ id: r.id, kind: "routine", text: `${r.label} every day at ${friendly(r.time)}` });
    p.rules.skipMotionLights.forEach((r, i) => items.push({ id: `rule:${i}`, kind: "rule", text: `No automatic ${this.roomName(r.room)} lights ${blockLabel(r.block)}` }));
    return {
      items,
      suggestions: this.pendingSuggestions().map(({ id, text, type }) => ({ id, text, type })),
      stats: { feedback: p.feedback.length, observations: p.observations.length, conversations: p.conversations.length },
    };
  }

  // Plain-text summary for the AI's context and "what do you know about me?"
  summary() {
    const v = this.view();
    if (!v.items.length) return "Nothing learned yet.";
    return v.items.map((i) => `- ${i.text}`).join("\n");
  }

  // Today's raw material for the overnight reflection agent.
  dayLog(date = this.parts().date) {
    return {
      date,
      feedback: this.profile.feedback.filter((f) => f.ts.slice(0, 10) >= shiftDate(date, -1)),
      changes: this.profile.observations.filter((o) => o.date === date),
      conversations: this.profile.conversations.filter((c) => c.ts.slice(0, 10) >= shiftDate(date, -1)),
      known: this.summary(),
      devices: this.registry.all().filter((d) => ["light", "fan", "thermostat", "water_heater"].includes(d.type)).map((d) => ({ id: d.id, name: d.name, type: d.type })),
    };
  }

  // Merge what the reflection agent concluded. Suggestions still need the
  // homeowner's yes, and only safe, valid changes are accepted.
  applyReflection({ notes = [], likes = [], dislikes = [], suggestions = [] } = {}) {
    let added = 0;
    const saved = (kind, t) => {
      const r = this.remember(kind, t, "reflection");
      return r.status === "done" && r.message !== "I already know that.";
    };
    for (const t of notes.slice(0, 3)) if (saved("note", t)) added++;
    for (const t of likes.slice(0, 3)) if (saved("like", t)) added++;
    for (const t of dislikes.slice(0, 3)) if (saved("dislike", t)) added++;
    let offered = 0;
    for (const s of suggestions) {
      if (offered >= 2) break;
      const device = this.registry.get(s.device);
      if (!device || !s.command || !/^\d{2}:\d{2}$/.test(s.time || "")) continue;
      if (validateCommand(device, s.command) || classify(device, s.command) === RISK.HIGH) continue;
      if (this.suggest({
        key: `routine:${device.id}:${JSON.stringify(s.command)}`,
        type: "routine",
        device: device.id,
        command: s.command,
        time: s.time,
        label: describeCommand(device, s.command),
        text: s.text || `Want me to ${lcFirst(describeCommand(device, s.command))} every day at ${friendly(s.time)}?`,
        source: "reflection",
      })) { added++; offered++; }
    }
    return added;
  }
}

function describeCommand(device, c) {
  if (device.type === "thermostat") return `Set the thermostat to ${c.target}°F`;
  if (device.type === "water_heater") return c.target !== undefined ? `Set the water heater to ${c.target}°F` : `Put the water heater in ${c.mode} mode`;
  if (c.on === false) return `Turn off the ${device.name.toLowerCase()}`;
  return `Turn on the ${device.name.toLowerCase()}${c.brightness !== undefined ? ` at ${c.brightness}%` : ""}`;
}

function friendly(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function lcFirst(s) {
  return s[0].toLowerCase() + s.slice(1);
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
