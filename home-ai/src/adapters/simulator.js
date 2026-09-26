// Simulated house. Behaves like real hardware: commands take a moment,
// the garage door travels, and the indoor temperature drifts toward the
// thermostat target. Sensors are triggered from the app's simulator panel
// or the /api/sim endpoints.

export class SimulatorAdapter {
  constructor({ registry, speed = 1 }) {
    this.registry = registry;
    this.name = "simulator";
    this.speed = speed; // tests use a large number to skip waits
    this.timers = new Set();
  }

  async start() {
    this.climateTimer = setInterval(() => this.tickClimate(), 30_000 / this.speed);
  }

  stop() {
    clearInterval(this.climateTimer);
    for (const t of this.timers) clearTimeout(t);
  }

  wait(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.timers.delete(t); resolve(); }, ms / this.speed);
      this.timers.add(t);
    });
  }

  async apply(device, command) {
    await this.wait(120);
    if (device.type === "garage") {
      const moving = command.door === "open" ? "opening" : "closing";
      this.registry.report(device.id, { door: moving });
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.registry.report(device.id, { door: command.door });
      }, 4000 / this.speed);
      this.timers.add(t);
      return;
    }
    this.registry.report(device.id, command);
    if (device.type === "thermostat") this.tickClimate();
  }

  // Sensor input (from the simulator panel or tests).
  sensor(id, partial) {
    this.registry.report(id, partial, "sensor");
  }

  tickClimate() {
    for (const t of this.registry.byType("thermostat")) {
      const { mode, target, current } = t.state;
      let hvac = "idle";
      let next = current;
      if ((mode === "heat" || mode === "auto") && current < target - 0.5) { hvac = "heating"; next = current + 0.5; }
      else if ((mode === "cool" || mode === "auto") && current > target + 0.5) { hvac = "cooling"; next = current - 0.5; }
      this.registry.report(t.id, { hvac, current: Math.round(next * 10) / 10 }, "sensor");
    }
  }
}
