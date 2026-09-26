// The device registry: the single source of truth for what is in the house
// and what state it is in. Adapters report state here; nothing else writes it.

// Default state for each device type, used for a fresh install.
export const DEFAULT_STATE = {
  light: { on: false, brightness: 100 },
  fan: { on: false, speed: 2 },
  thermostat: { mode: "auto", target: 71, current: 72, humidity: 45, hvac: "idle", setback: false },
  water_heater: { mode: "heat_pump", target: 120, on: true },
  water_valve: { open: true },
  garage: { door: "closed" },
  lock: { locked: true },
  motion: { motion: false, lastMotion: null },
  leak: { wet: false },
  contact: { open: false },
  illuminance: { lux: 500 },
  temperature: { value: 70 },
};

// Which commands each type accepts. Used to validate input from the app,
// Shortcuts and the AI before anything reaches hardware.
export const COMMANDS = {
  light: { on: "boolean", brightness: "number" },
  fan: { on: "boolean", speed: "number" },
  thermostat: { mode: ["off", "heat", "cool", "auto", "fan_only"], target: "number", setback: "boolean" },
  water_heater: { mode: ["heat_pump", "electric", "eco", "vacation", "off"], target: "number", on: "boolean" },
  water_valve: { open: "boolean" },
  garage: { door: ["open", "closed"] },
  lock: { locked: "boolean" },
};

export const SENSOR_TYPES = new Set(["motion", "leak", "contact", "illuminance", "temperature"]);

export class Registry {
  constructor(config, bus, store) {
    this.config = config;
    this.bus = bus;
    this.store = store;
    this.devices = new Map();
    const saved = store.loadState();
    for (const def of config.devices) {
      const state = { ...DEFAULT_STATE[def.type], ...(saved[def.id] || {}) };
      this.devices.set(def.id, { ...def, state, updated: null });
    }
  }

  get(id) {
    return this.devices.get(id);
  }

  all() {
    return [...this.devices.values()];
  }

  byType(type) {
    return this.all().filter((d) => d.type === type);
  }

  byRoom(room) {
    return this.all().filter((d) => d.room === room);
  }

  // Resolve a scene target: an id, or "*type" for every device of a type.
  resolve(target) {
    if (target.startsWith("*")) return this.byType(target.slice(1));
    const d = this.get(target);
    return d ? [d] : [];
  }

  // Record a new state reported by an adapter (hardware is the truth).
  report(id, partial, source = "device") {
    const d = this.devices.get(id);
    if (!d) return;
    const before = { ...d.state };
    Object.assign(d.state, partial);
    if (d.type === "motion" && partial.motion === true && !before.motion) d.state.lastMotion = new Date().toISOString();
    d.updated = new Date().toISOString();
    const changed = Object.keys(partial).filter((k) => before[k] !== d.state[k]);
    if (changed.length === 0) return;
    this.bus.publish("state", {
      device: id, name: d.name, deviceType: d.type, room: d.room,
      changes: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: d.state[k] }])),
      source,
    });
    this.store.saveState(this.snapshotStates());
  }

  snapshotStates() {
    return Object.fromEntries(this.all().map((d) => [d.id, d.state]));
  }

  // A compact, readable snapshot for the app and the AI.
  snapshot() {
    return {
      home: this.config.home.name,
      rooms: this.config.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        devices: this.byRoom(r.id).map(({ id, name, type, state, updated }) => ({ id, name, type, state, updated })),
      })),
    };
  }
}

// Validate a command against the device type. Returns an error string or null.
export function validateCommand(device, command) {
  const spec = COMMANDS[device.type];
  if (!spec) return `${device.name} is a sensor and can't be controlled.`;
  if (!command || typeof command !== "object" || Object.keys(command).length === 0) return "Empty command.";
  for (const [key, value] of Object.entries(command)) {
    const rule = spec[key];
    if (!rule) return `${device.name} doesn't support "${key}". Supported: ${Object.keys(spec).join(", ")}.`;
    if (Array.isArray(rule) && !rule.includes(value)) return `"${key}" must be one of ${rule.join(", ")}.`;
    if (rule === "boolean" && typeof value !== "boolean") return `"${key}" must be true or false.`;
    if (rule === "number" && (typeof value !== "number" || !Number.isFinite(value))) return `"${key}" must be a number.`;
  }
  return null;
}
