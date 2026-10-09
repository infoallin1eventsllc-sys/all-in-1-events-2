// Home Assistant bridge. Home Assistant speaks Matter, Thread, Zigbee,
// Z-Wave, Wi-Fi and most brand clouds, so Haven drives real hardware through
// it instead of re-implementing hundreds of device protocols.
//
// Each device in config/home.json names its Home Assistant entity ("ha_entity").
// Commands go out through the REST service API; state comes back by polling.

const POLL_MS = 2000;

export class HomeAssistantAdapter {
  constructor({ registry, url, token }) {
    if (!url || !token) throw new Error("HA_URL and HA_TOKEN are required for the Home Assistant adapter.");
    this.registry = registry;
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.name = "homeassistant";
    this.watchers = [];
  }

  // Called with every poll's states (a Map of entity_id -> state), for cameras and doorbells.
  watchStates(fn) {
    this.watchers.push(fn);
  }

  async start() {
    await this.poll();
    this.timer = setInterval(() => this.poll().catch(() => {}), POLL_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  async call(domain, service, data) {
    const res = await fetch(`${this.url}/api/services/${domain}/${service}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Home Assistant ${domain}.${service} returned ${res.status}`);
  }

  async apply(device, command) {
    const entity_id = device.ha_entity;
    if (!entity_id) throw new Error(`${device.name} has no ha_entity in config/home.json`);
    for (const [domain, service, data] of toServiceCalls(device.type, command)) {
      await this.call(domain, service, { entity_id, ...data });
    }
    // Poll right away so the app reflects the change without waiting.
    setTimeout(() => this.poll().catch(() => {}), 500);
  }

  // A weather entity: its state plus hourly and daily forecasts from the
  // weather.get_forecasts service (Home Assistant 2023.9 and later). Older
  // versions put a single forecast list in the state's attributes.
  async weather(entity) {
    const headers = { Authorization: `Bearer ${this.token}` };
    const res = await fetch(`${this.url}/api/states/${entity}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Home Assistant ${entity} returned ${res.status}`);
    const state = await res.json();
    const forecast = async (type) => {
      try {
        const r = await fetch(`${this.url}/api/services/weather/get_forecasts?return_response`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ entity_id: entity, type }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) return null;
        return (await r.json()).service_response?.[entity]?.forecast ?? null;
      } catch {
        return null;
      }
    };
    const [hourly, daily] = await Promise.all([forecast("hourly"), forecast("daily")]);
    return { state, hourly: hourly ?? [], daily: daily ?? state.attributes?.forecast ?? [] };
  }

  // A camera's picture now: { image, contentType }.
  async cameraImage(entity) {
    const res = await fetch(`${this.url}/api/camera_proxy/${encodeURIComponent(entity)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Home Assistant ${entity} returned ${res.status}`);
    return { image: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") || "image/jpeg" };
  }

  // A camera's live video as motion JPEG: { stream, contentType }. Ends when signal aborts.
  async cameraStream(entity, signal) {
    const res = await fetch(`${this.url}/api/camera_proxy_stream/${encodeURIComponent(entity)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`Home Assistant ${entity} stream returned ${res.status}`);
    return { stream: res.body, contentType: res.headers.get("content-type") || "multipart/x-mixed-replace" };
  }

  async poll() {
    const res = await fetch(`${this.url}/api/states`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Home Assistant /api/states returned ${res.status}`);
    const states = new Map((await res.json()).map((s) => [s.entity_id, s]));
    for (const fn of this.watchers) { try { fn(states); } catch { /* one watcher can't stop the poll */ } }
    for (const device of this.registry.all()) {
      const s = states.get(device.ha_entity);
      if (!s || s.state === "unavailable" || s.state === "unknown") continue;
      const mapped = fromHaState(device.type, s);
      if (mapped) this.registry.report(device.id, mapped, device.type in SENSORS ? "sensor" : "device");
    }
  }
}

const SENSORS = { motion: 1, leak: 1, contact: 1, illuminance: 1, temperature: 1, power: 1 };

// Haven command -> list of [domain, service, data].
export function toServiceCalls(type, c) {
  const calls = [];
  switch (type) {
    case "light":
      if (c.on === false) calls.push(["light", "turn_off", {}]);
      else calls.push(["light", "turn_on", c.brightness !== undefined ? { brightness_pct: c.brightness } : {}]);
      break;
    case "fan":
      if (c.on === false) calls.push(["fan", "turn_off", {}]);
      else calls.push(["fan", "turn_on", c.speed !== undefined ? { percentage: Math.min(100, c.speed * 33) } : {}]);
      break;
    case "thermostat":
      if (c.mode) calls.push(["climate", "set_hvac_mode", { hvac_mode: c.mode === "auto" ? "heat_cool" : c.mode }]);
      if (c.target !== undefined) calls.push(["climate", "set_temperature", { temperature: c.target }]);
      break;
    case "water_heater":
      if (c.on === false) calls.push(["water_heater", "turn_off", {}]);
      if (c.on === true) calls.push(["water_heater", "turn_on", {}]);
      if (c.mode) calls.push(["water_heater", "set_operation_mode", { operation_mode: c.mode }]);
      if (c.target !== undefined) calls.push(["water_heater", "set_temperature", { temperature: c.target }]);
      break;
    case "water_valve":
      calls.push(["valve", c.open ? "open_valve" : "close_valve", {}]);
      break;
    case "garage":
      calls.push(["cover", c.door === "open" ? "open_cover" : "close_cover", {}]);
      break;
    case "lock":
      calls.push(["lock", c.locked ? "lock" : "unlock", {}]);
      break;
  }
  return calls;
}

// Home Assistant state object -> Haven state.
export function fromHaState(type, s) {
  const a = s.attributes || {};
  const on = s.state === "on";
  switch (type) {
    case "light": return { on, ...(a.brightness != null ? { brightness: Math.round((a.brightness / 255) * 100) } : {}) };
    case "fan": return { on, ...(a.percentage != null ? { speed: Math.max(1, Math.round(a.percentage / 33)) } : {}) };
    case "thermostat": return {
      mode: s.state === "heat_cool" ? "auto" : s.state,
      ...(a.temperature != null ? { target: a.temperature } : {}),
      ...(a.current_temperature != null ? { current: a.current_temperature } : {}),
      ...(a.current_humidity != null ? { humidity: a.current_humidity } : {}),
      ...(a.hvac_action ? { hvac: a.hvac_action } : {}),
    };
    case "water_heater": return { on: s.state !== "off", ...(a.operation_mode ? { mode: a.operation_mode } : {}), ...(a.temperature != null ? { target: a.temperature } : {}) };
    case "water_valve": return { open: s.state === "open" };
    case "garage": return { door: s.state };
    case "lock": return { locked: s.state === "locked" };
    case "motion": return { motion: on };
    case "leak": return { wet: on };
    case "contact": return { open: on };
    case "illuminance": return { lux: Number(s.state) };
    case "temperature": return { value: Number(s.state) };
    case "power": return { watts: Number(s.state) * (a.unit_of_measurement === "kW" ? 1000 : 1) };
    default: return null;
  }
}
