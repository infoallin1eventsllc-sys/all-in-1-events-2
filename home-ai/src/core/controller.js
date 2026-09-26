// The controller is the only path from intent to hardware:
//   validate -> hard limits -> authorize -> adapter -> audit log.
import { validateCommand } from "./registry.js";
import { authorize, hardLimit, classify } from "../safety.js";

const CONFIRM_TTL_MS = 2 * 60 * 1000;

export class Controller {
  constructor({ config, registry, adapter, bus }) {
    this.config = config;
    this.registry = registry;
    this.adapter = adapter;
    this.bus = bus;
    this.lastMove = new Map();
    this.pending = new Map(); // confirmation id -> request
  }

  // Returns { status: "done"|"needs_confirmation"|"refused"|"error", message, ... }
  async execute({ device: id, command, origin, confirmed = false, reason = "", allowOverride = false }) {
    const device = this.registry.get(id);
    if (!device) return { status: "error", message: `No device called "${id}".` };

    // Thermostat "setback" is a convenience that expands to real targets.
    if (device.type === "thermostat" && command.setback === true) {
      const s = this.config.settings;
      const mode = device.state.mode === "cool" ? "cool" : "heat";
      command = { mode, target: mode === "cool" ? s.awaySetbackCoolF : s.awaySetbackHeatF, setback: true };
    } else if (device.type === "thermostat" && command.target !== undefined) {
      command = { ...command, setback: false };
    }

    const invalid = validateCommand(device, command);
    if (invalid) return { status: "error", message: invalid };

    const limit = hardLimit(device, command, { limits: this.config.limits, registry: this.registry, lastMove: this.lastMove });
    if (limit) {
      this.bus.publish("refused", { device: id, name: device.name, command, origin, reason: limit });
      return { status: "refused", message: limit };
    }

    const auth = authorize({ device, command, origin, confirmed, allowOverride });
    if (auth.decision === "deny") {
      this.bus.publish("refused", { device: id, name: device.name, command, origin, reason: auth.reason });
      return { status: "refused", message: auth.reason };
    }
    if (auth.decision === "confirm") {
      const confirmId = Math.random().toString(36).slice(2, 10);
      const summary = describe(device, command);
      this.pending.set(confirmId, { device: id, command, reason, summary, expires: Date.now() + CONFIRM_TTL_MS });
      this.bus.publish("confirm_request", { confirmId, device: id, name: device.name, summary, reason });
      return {
        status: "needs_confirmation",
        confirmId,
        message: `Waiting for your OK to ${lcFirst(summary)}. Tap Confirm in the Haven app.`,
      };
    }

    if (sameAsCurrent(device, command)) {
      return { status: "done", message: `${device.name} is already ${describeState(device)}.` };
    }

    try {
      if (device.type === "garage") this.lastMove.set(id, Date.now());
      await this.adapter.apply(device, command);
      this.bus.publish("action", { device: id, name: device.name, command, origin, risk: auth.risk, reason, summary: describe(device, command) });
      return { status: "done", message: `${pastTense(describe(device, command))}.` };
    } catch (err) {
      this.bus.publish("device_error", { device: id, name: device.name, command, error: String(err.message || err) });
      return { status: "error", message: `${device.name} didn't respond: ${err.message || err}` };
    }
  }

  async confirm(confirmId, approve = true) {
    const req = this.pending.get(confirmId);
    this.pending.delete(confirmId);
    if (!req || req.expires < Date.now()) return { status: "error", message: "That request expired. Ask again." };
    if (!approve) {
      this.bus.publish("confirm_declined", { confirmId, device: req.device, summary: req.summary });
      return { status: "refused", message: `Cancelled: ${req.summary}.` };
    }
    return this.execute({ device: req.device, command: req.command, origin: "owner", reason: req.reason });
  }

  pendingList() {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k);
    return [...this.pending.entries()].map(([confirmId, v]) => ({ confirmId, ...v }));
  }

  async runScene(name, origin, reason = "") {
    const scene = this.config.scenes[name];
    if (!scene) return { status: "error", message: `No scene called "${name}". Scenes: ${Object.keys(this.config.scenes).join(", ")}.` };
    const results = [];
    for (const action of scene.actions) {
      for (const device of this.registry.resolve(action.device)) {
        const r = await this.execute({ device: device.id, command: { ...action.command }, origin, reason: reason || `${scene.label} scene` });
        results.push({ device: device.id, ...r });
      }
    }
    this.bus.publish("scene", { scene: name, label: scene.label, origin });
    const problems = results.filter((r) => r.status !== "done");
    return {
      status: problems.length ? "partial" : "done",
      message: problems.length
        ? `${scene.label} ran, with ${problems.length} item(s) needing attention: ${problems.map((p) => p.message).join(" ")}`
        : `${scene.label} is set.`,
      results,
    };
  }
}

const lcFirst = (s) => s[0].toLowerCase() + s.slice(1);

// "Turn on Kitchen Lights" -> "Turned on Kitchen Lights"; the garage takes a
// few seconds, so it reports as in progress.
function pastTense(summary) {
  return summary
    .replace(/^Turn /, "Turned ")
    .replace(/^Open /, "Opening ")
    .replace(/^Close /, "Closing ")
    .replace(/^Lock /, "Locked ")
    .replace(/^Unlock /, "Unlocked ")
    .replace(/^Shut off /, "Shut off ");
}

function sameAsCurrent(device, command) {
  return Object.entries(command).every(([k, v]) => device.state[k] === v);
}

export function describe(device, command) {
  const n = device.name;
  switch (device.type) {
    case "light":
      if (command.on === false) return `Turn off ${n}`;
      return `Turn on ${n}${command.brightness !== undefined ? ` at ${command.brightness}%` : ""}`;
    case "fan":
      if (command.on === false) return `Turn off ${n}`;
      return `Turn on ${n}${command.speed !== undefined ? ` (speed ${command.speed})` : ""}`;
    case "thermostat": {
      const parts = [];
      if (command.mode) parts.push(`mode ${command.mode}`);
      if (command.target !== undefined) parts.push(`${command.target}°F`);
      return `Set ${n} to ${parts.join(", ")}${command.setback ? " (away setback)" : ""}`;
    }
    case "water_heater":
      if (command.on === false) return `Turn off ${n}`;
      return `Set ${n}${command.mode ? ` to ${command.mode}` : ""}${command.target !== undefined ? ` at ${command.target}°F` : ""}`;
    case "water_valve":
      return command.open ? "Turn the main water back on" : "Shut off the main water";
    case "garage":
      return command.door === "open" ? `Open the ${n.toLowerCase()}` : `Close the ${n.toLowerCase()}`;
    case "lock":
      return command.locked ? `Lock the ${n.toLowerCase()}` : `Unlock the ${n.toLowerCase()}`;
    default:
      return `${n}: ${JSON.stringify(command)}`;
  }
}

export function describeState(device) {
  const s = device.state;
  switch (device.type) {
    case "light": return s.on ? `on (${s.brightness}%)` : "off";
    case "fan": return s.on ? `on (speed ${s.speed})` : "off";
    case "thermostat": return `${s.mode}, set to ${s.target}°F, ${s.current}°F inside`;
    case "water_heater": return s.on ? `${s.mode} at ${s.target}°F` : "off";
    case "water_valve": return s.open ? "open" : "shut off";
    case "garage": return s.door;
    case "lock": return s.locked ? "locked" : "unlocked";
    case "motion": return s.motion ? "motion now" : "clear";
    case "leak": return s.wet ? "WET" : "dry";
    case "contact": return s.open ? "open" : "closed";
    case "illuminance": return `${s.lux} lux`;
    case "temperature": return `${s.value}°F`;
    default: return JSON.stringify(s);
  }
}

export { classify };
