// The tools the AI can use. Each one routes through the controller and its
// safety policy. Notice there is no "confirmed" field: the model can never
// approve its own high-risk action. Only the homeowner's tap can.
import { describeState } from "../core/controller.js";

export const TOOL_DEFS = [
  {
    name: "get_home_state",
    description: "Read the current state of every device, grouped by room, plus who is home and any actions waiting for the homeowner's confirmation. Call this when the state included with the message isn't enough.",
    input_schema: {
      type: "object",
      properties: { room: { type: "string", description: "Optional room id to narrow the result, e.g. 'kitchen'." } },
      additionalProperties: false,
    },
  },
  {
    name: "control_device",
    description:
      "Change one device. Commands by type — light: {on, brightness 0-100}; fan: {on, speed 1-3}; thermostat: {mode: off|heat|cool|auto|fan_only, target °F}; water_heater: {mode: heat_pump|electric|eco|vacation|off, target °F, on}; water_valve: {open}; garage: {door: open|closed}; lock: {locked}. Opening the garage, unlocking, and turning water on return needs_confirmation until the homeowner taps Confirm.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Device id from the home state, e.g. 'light.kitchen'." },
        command: { type: "object", description: "The fields to change, e.g. {\"on\": true, \"brightness\": 60}." },
        reason: { type: "string", description: "Short reason, shown in the activity log." },
      },
      required: ["device_id", "command"],
      additionalProperties: false,
    },
  },
  {
    name: "run_scene",
    description: "Run a named scene that sets several devices at once. Scenes: morning, away, home, goodnight, movie.",
    input_schema: {
      type: "object",
      properties: { scene: { type: "string" }, reason: { type: "string" } },
      required: ["scene"],
      additionalProperties: false,
    },
  },
  {
    name: "get_recent_events",
    description: "Read recent house activity: device changes, automations, alerts, refusals, arrivals and departures. Newest last.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many events, default 30, max 100." } },
      additionalProperties: false,
    },
  },
  {
    name: "notify_homeowner",
    description: "Push a notification to the homeowner's phone and watch. Use only for something they need to see outside this conversation, not to repeat your reply.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Under 40 characters." },
        body: { type: "string" },
        urgent: { type: "boolean", description: "True only for safety issues. Urgent alerts break through quiet hours." },
      },
      required: ["title", "body"],
      additionalProperties: false,
    },
  },
];

export function makeToolRunner(home, origin) {
  return async function runTool(name, input) {
    switch (name) {
      case "get_home_state":
        return homeState(home, input?.room);
      case "control_device":
        return home.controller.execute({ device: input.device_id, command: input.command, origin, reason: input.reason || "Asked Haven" });
      case "run_scene":
        return home.controller.runScene(input.scene, origin, input.reason || "Asked Haven");
      case "get_recent_events":
        return home.store.recent.slice(-Math.min(100, input?.limit || 30)).map(compactEvent);
      case "notify_homeowner":
        return home.notifier.send({ title: input.title, body: input.body, priority: input.urgent ? "urgent" : "normal" });
      default:
        return { status: "error", message: `Unknown tool ${name}` };
    }
  };
}

// Compact, readable state for the model: one line per device.
export function homeState(home, room) {
  const rooms = home.config.rooms.filter((r) => !room || r.id === room);
  const lines = [];
  for (const r of rooms) {
    const devices = home.registry.byRoom(r.id);
    if (!devices.length) continue;
    lines.push(`${r.name}:`);
    for (const d of devices) lines.push(`  ${d.id} (${d.name}): ${describeState(d)}`);
  }
  const people = home.presence.list().map((p) => `${p.name} ${p.home ? "home" : "away"}`).join(", ");
  const pending = home.controller.pendingList().map((p) => p.summary);
  return [
    ...lines,
    `People: ${people}`,
    `Waiting for homeowner confirmation: ${pending.length ? pending.join("; ") : "nothing"}`,
  ].join("\n");
}

export function compactEvent(e) {
  const { id, ...rest } = e;
  return rest;
}
