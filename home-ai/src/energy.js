// Electricity use: live power, today's total, and a 24-hour history.
//
// With a whole-home energy monitor (a "power" device in config/home.json,
// e.g. an Emporia or Sense meter through Home Assistant), Haven reports the
// meter's reading. Without one, it estimates from what each device is doing
// and says so ("estimated") everywhere it shows the numbers. It never
// presents an estimate as a measurement.
import { localParts } from "./core/time.js";

const BUCKET_MIN = 5;
const BUCKETS = (24 * 60) / BUCKET_MIN;

// Typical draw in watts, used only for the estimate. Override per device
// with "watts" in config/home.json.
const DEFAULT_WATTS = {
  light: 12,          // LED fixture at full brightness, scaled by brightness
  fan: 25,            // per speed step
  hvacHeating: 3500,  // heat pump heating
  hvacCooling: 3000,
  hvacFan: 350,
  waterHeater: { heat_pump: 300, electric: 1000, eco: 220, vacation: 30, off: 0 }, // average draw by mode
  baseLoad: 350,      // fridge, networking, standby
};

export class Energy {
  constructor({ config, registry, store, bus }) {
    this.config = config;
    this.registry = registry;
    this.store = store;
    this.bus = bus;
    this.tz = config.home.timezone;
    const saved = store.loadDoc("energy");
    this.day = saved?.day || null;              // local date of the history
    this.buckets = saved?.buckets || [];        // [{ i, kw, n }], i = bucket index in the day
    this.kwhToday = saved?.kwhToday || 0;
    this.lastSampleAt = null;
  }

  start() {
    this.sample();
    this.timer = setInterval(() => this.sample(), 60_000);
  }

  stop() {
    clearInterval(this.timer);
    this.save();
  }

  meter() {
    return this.registry.byType("power")[0] || null;
  }

  source() {
    return this.meter() ? "meter" : "estimate";
  }

  // Current draw by device, largest first. Sums to nowKw().
  breakdown() {
    const meter = this.meter();
    if (meter) return [{ name: meter.name, kw: round(meter.state.watts / 1000) }];
    const parts = [];
    const w = (d, key) => d.watts ?? DEFAULT_WATTS[key];
    for (const d of this.registry.all()) {
      const s = d.state;
      if (d.type === "light" && s.on) parts.push([d.name, w(d, "light") * (s.brightness / 100)]);
      if (d.type === "fan" && s.on) parts.push([d.name, w(d, "fan") * (s.speed || 1)]);
      if (d.type === "thermostat") {
        const watts = s.hvac === "heating" ? (d.heatingWatts ?? DEFAULT_WATTS.hvacHeating)
          : s.hvac === "cooling" ? (d.coolingWatts ?? DEFAULT_WATTS.hvacCooling)
          : s.hvac === "fan" ? DEFAULT_WATTS.hvacFan : 0;
        if (watts) parts.push(["Heating & cooling", watts]);
      }
      if (d.type === "water_heater" && s.on) parts.push([d.name, d.watts ?? DEFAULT_WATTS.waterHeater[s.mode] ?? 300]);
    }
    parts.push(["Always-on (fridge, network, standby)", this.config.settings.baseLoadWatts ?? DEFAULT_WATTS.baseLoad]);
    return parts.map(([name, watts]) => ({ name, kw: round(watts / 1000) })).sort((a, b) => b.kw - a.kw);
  }

  nowKw() {
    const meter = this.meter();
    if (meter) return round(meter.state.watts / 1000);
    return round(this.breakdown().reduce((sum, p) => sum + p.kw, 0));
  }

  // Take a reading: roll the day over at local midnight, average into the
  // 5-minute bucket, and add to today's kWh.
  sample(now = new Date()) {
    const { date, hhmm } = localParts(this.tz, now);
    if (this.day !== date) {
      this.day = date;
      this.buckets = [];
      this.kwhToday = 0;
      this.lastSampleAt = null;
    }
    const kw = this.nowKw();
    const [h, m] = hhmm.split(":").map(Number);
    const i = Math.floor((h * 60 + m) / BUCKET_MIN);
    const b = this.buckets.find((x) => x.i === i);
    if (b) { b.kw = (b.kw * b.n + kw) / (b.n + 1); b.n++; } else this.buckets.push({ i, kw, n: 1 });
    if (this.lastSampleAt) this.kwhToday += kw * Math.min(10, (now - this.lastSampleAt) / 3_600_000);
    this.lastSampleAt = now;
    this.save();
    return kw;
  }

  save() {
    this.store.saveDoc("energy", { day: this.day, buckets: this.buckets, kwhToday: this.kwhToday });
  }

  // For the simulated demo only: fill earlier hours with a plausible day so
  // the chart has a shape. The panel labels the demo as simulated.
  seedSimulatedDay(profile, now = new Date()) {
    const { date, hhmm } = localParts(this.tz, now);
    const [h, m] = hhmm.split(":").map(Number);
    const upTo = Math.floor((h * 60 + m) / BUCKET_MIN);
    this.day = date;
    this.buckets = [];
    this.kwhToday = 0;
    for (let i = 0; i < upTo; i++) {
      const kw = round(profile(i * BUCKET_MIN / 60));
      this.buckets.push({ i, kw, n: 1 });
      this.kwhToday += kw * (BUCKET_MIN / 60);
    }
    this.lastSampleAt = now;
    this.save();
  }

  report() {
    const sorted = [...this.buckets].sort((a, b) => a.i - b.i);
    const hourly = Array.from({ length: 24 }, (_, h) => {
      const inHour = sorted.filter((b) => Math.floor(b.i / (60 / BUCKET_MIN)) === h);
      return inHour.length ? round(inHour.reduce((s, b) => s + b.kw, 0) / inHour.length) : null;
    });
    const peak = sorted.reduce((p, b) => (!p || b.kw > p.kw ? b : p), null);
    return {
      source: this.source(),
      nowKw: this.nowKw(),
      todayKwh: round(this.kwhToday),
      bucketMinutes: BUCKET_MIN,
      samples: sorted.map((b) => ({ minute: b.i * BUCKET_MIN, kw: round(b.kw) })),
      hourly,
      peak: peak ? { minute: peak.i * BUCKET_MIN, kw: round(peak.kw) } : null,
      breakdown: this.breakdown().slice(0, 5),
    };
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}

export { BUCKETS, BUCKET_MIN };
