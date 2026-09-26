// Weather outside the house: now, the next twelve hours, and the next days.
//
// Sources, in order:
//   1. A Home Assistant weather entity ("weather.ha_entity" in
//      config/home.json) when Haven runs on Home Assistant.
//   2. Open-Meteo (free, no API key) for "weather.latitude" and
//      "weather.longitude" in config/home.json.
// With neither, Haven says weather isn't connected instead of showing
// made-up numbers. Only the browser demo seeds sample weather, and it is
// labeled as a sample everywhere it shows.
import { localParts } from "./core/time.js";

const REFRESH_MS = 15 * 60_000;
const STALE_MS = 2 * 60 * 60_000;
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export const CONDITIONS = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  sleet: "Sleet",
  snow: "Snow",
  storm: "Thunderstorms",
  wind: "Windy",
};

// WMO weather codes (used by Open-Meteo) -> Haven condition.
export function fromWmo(code) {
  if (code <= 1) return "clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "sleet";
  if (code >= 51 && code <= 55) return "drizzle";
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

// Home Assistant weather conditions -> Haven condition.
const HA = {
  "clear-night": "clear", sunny: "clear", partlycloudy: "partly-cloudy", cloudy: "cloudy", exceptional: "cloudy",
  fog: "fog", hail: "sleet", lightning: "storm", "lightning-rainy": "storm", pouring: "rain", rainy: "rain",
  snowy: "snow", "snowy-rainy": "sleet", windy: "wind", "windy-variant": "wind",
};
export const fromHa = (state) => HA[state] || "cloudy";

const toF = (v, unit) => (v == null ? null : /C/.test(unit || "") ? Math.round((v * 9) / 5 + 32) : Math.round(v));

function hourLabel(h) {
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

export class Weather {
  constructor({ config, adapter, fetch = globalThis.fetch, openMeteoUrl = OPEN_METEO }) {
    this.config = config;
    this.adapter = adapter;
    this.fetch = fetch;
    this.openMeteoUrl = openMeteoUrl;
    this.tz = config.home.timezone;
    this.settings = config.weather || {};
    this.data = null;
    this.error = null;
    this.sample = false;
  }

  source() {
    if (this.sample) return "sample";
    if (this.settings.ha_entity && this.adapter?.name === "homeassistant" && this.adapter.weather) return "homeassistant";
    if (Number.isFinite(this.settings.latitude) && Number.isFinite(this.settings.longitude)) return "open-meteo";
    return "none";
  }

  start() {
    if (this.source() === "none" || this.sample) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  async refresh() {
    const source = this.source();
    try {
      if (source === "homeassistant") this.data = this.fromHomeAssistant(await this.adapter.weather(this.settings.ha_entity));
      else if (source === "open-meteo") this.data = this.fromOpenMeteo(await this.getOpenMeteo());
      else return this.report();
      this.data.updated = new Date().toISOString();
      this.error = null;
    } catch (err) {
      this.error = String(err.message || err);
    }
    return this.report();
  }

  async getOpenMeteo() {
    const q = new URLSearchParams({
      latitude: String(this.settings.latitude),
      longitude: String(this.settings.longitude),
      current: "temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m",
      hourly: "temperature_2m,weather_code,precipitation_probability",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      timezone: this.tz,
      forecast_days: "4",
    });
    const res = await this.fetch(`${this.openMeteoUrl}?${q}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
    return res.json();
  }

  // Open-Meteo times are local to the home (we ask for its timezone).
  fromOpenMeteo(j) {
    const c = j.current;
    const hourPrefix = c.time.slice(0, 13);
    const start = Math.max(0, j.hourly.time.findIndex((t) => t.slice(0, 13) >= hourPrefix));
    const hourly = j.hourly.time.slice(start, start + 12).map((t, k) => {
      const i = start + k;
      const h = Number(t.slice(11, 13));
      return { label: k === 0 ? "Now" : hourLabel(h), tempF: Math.round(j.hourly.temperature_2m[i]), condition: fromWmo(j.hourly.weather_code[i]), precip: j.hourly.precipitation_probability?.[i] ?? null, isDay: h >= 6 && h < 20 };
    });
    const daily = j.daily.time.slice(0, 4).map((d, i) => ({
      date: d, label: this.dayLabel(d, i),
      highF: Math.round(j.daily.temperature_2m_max[i]), lowF: Math.round(j.daily.temperature_2m_min[i]),
      condition: fromWmo(j.daily.weather_code[i]), precip: j.daily.precipitation_probability_max?.[i] ?? null,
    }));
    return {
      current: { tempF: Math.round(c.temperature_2m), humidity: c.relative_humidity_2m ?? null, condition: fromWmo(c.weather_code), isDay: c.is_day !== 0, windMph: c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null },
      hourly, daily,
    };
  }

  // Home Assistant: { state, hourly, daily } from the adapter.
  fromHomeAssistant({ state, hourly = [], daily = [] }) {
    const a = state.attributes || {};
    const unit = a.temperature_unit || "°F";
    const localHour = (iso) => Number(new Intl.DateTimeFormat("en-US", { timeZone: this.tz, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
    const localDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: this.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
    const now = localParts(this.tz);
    const hour = Number(now.hhmm.slice(0, 2));
    return {
      current: { tempF: toF(a.temperature, unit), humidity: a.humidity ?? null, condition: fromHa(state.state), isDay: state.state !== "clear-night" && hour >= 6 && hour < 20, windMph: a.wind_speed != null ? Math.round(a.wind_speed) : null },
      hourly: hourly.filter((f) => Date.parse(f.datetime) > Date.now() - 3_600_000).slice(0, 12).map((f, k) => {
        const h = localHour(f.datetime);
        return { label: k === 0 ? "Now" : hourLabel(h), tempF: toF(f.temperature, unit), condition: fromHa(f.condition), precip: f.precipitation_probability ?? null, isDay: f.condition !== "clear-night" && h >= 6 && h < 20 };
      }),
      daily: daily.slice(0, 4).map((f, i) => {
        const d = localDate(f.datetime);
        return { date: d, label: this.dayLabel(d, i), highF: toF(f.temperature, unit), lowF: toF(f.templow, unit), condition: fromHa(f.condition), precip: f.precipitation_probability ?? null };
      }),
    };
  }

  dayLabel(date, i) {
    if (i === 0 && date === localParts(this.tz).date) return "Today";
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  }

  // For the browser demo only: a plausible day, labeled as a sample.
  seedSample(now = new Date()) {
    this.sample = true;
    const { date, hhmm } = localParts(this.tz, now);
    const h0 = Number(hhmm.slice(0, 2));
    const curve = (h) => Math.round(60 + 9 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
    const hourly = Array.from({ length: 12 }, (_, k) => {
      const h = (h0 + k) % 24;
      return { label: k === 0 ? "Now" : hourLabel(h), tempF: curve(h), condition: k >= 7 && k <= 9 ? "rain" : k >= 5 ? "cloudy" : "partly-cloudy", precip: k >= 7 && k <= 9 ? 60 : k >= 5 ? 20 : 5, isDay: h >= 6 && h < 20 };
    });
    const days = [0, 1, 2, 3].map((i) => new Date(Date.parse(`${date}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
    const shape = [["partly-cloudy", 69, 52, 20], ["rain", 63, 50, 70], ["clear", 71, 49, 5], ["partly-cloudy", 68, 51, 10]];
    this.data = {
      current: { tempF: curve(h0), humidity: 62, condition: "partly-cloudy", isDay: h0 >= 6 && h0 < 20, windMph: 7 },
      hourly,
      daily: days.map((d, i) => ({ date: d, label: this.dayLabel(d, i), condition: shape[i][0], highF: shape[i][1], lowF: shape[i][2], precip: shape[i][3] })),
      updated: now.toISOString(),
    };
    this.error = null;
  }

  report() {
    const source = this.source();
    if (!this.data) return { source, available: false, error: source === "none" ? null : this.error };
    const stale = Date.now() - Date.parse(this.data.updated) > STALE_MS;
    const label = (x) => ({ ...x, text: CONDITIONS[x.condition] });
    return {
      source, available: true, stale, updated: this.data.updated, error: this.error,
      current: label(this.data.current), hourly: this.data.hourly.map(label), daily: this.data.daily.map(label),
    };
  }

  // One line for the conversation agent and briefings, or null.
  summary() {
    const r = this.report();
    if (!r.available) return null;
    const c = r.current;
    const today = r.daily[0];
    const wet = r.hourly.slice(1).find((x) => (x.precip ?? 0) >= 50 && ["rain", "drizzle", "storm", "snow", "sleet"].includes(x.condition));
    return [
      `${c.tempF}°F and ${c.text.toLowerCase()} outside`,
      today ? `, high ${today.highF}°F, low ${today.lowF}°F` : "",
      wet ? `. ${CONDITIONS[wet.condition]} likely around ${wet.label}` : "",
      r.source === "sample" ? " (sample weather in the demo)" : "",
      r.stale ? " (last updated a while ago)" : "",
      ".",
    ].join("");
  }
}
