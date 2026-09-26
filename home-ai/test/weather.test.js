// Weather: Open-Meteo and Home Assistant sources, honest "not connected",
// and what the agent, parser and briefings say with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHome, loadConfig } from "../src/home.js";
import { Weather, fromWmo, fromHa } from "../src/weather.js";
import { parse } from "../src/agent/local.js";
import { homeState } from "../src/agent/tools.js";
import { template } from "../src/briefings.js";
import { localParts } from "../src/core/time.js";
import { testHome } from "./helpers.js";

const TZ = "America/New_York";

function serve(handler) {
  const server = http.createServer(handler);
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

// Open-Meteo's response shape, starting at the current local hour.
function openMeteoBody() {
  const { date, hhmm } = localParts(TZ);
  const h = Number(hhmm.slice(0, 2));
  const times = Array.from({ length: 24 }, (_, k) => {
    const d = new Date(Date.parse(`${date}T00:00:00Z`) + (h + k) * 3_600_000);
    return d.toISOString().slice(0, 13) + ":00";
  });
  return {
    current: { time: `${date}T${hhmm}`, temperature_2m: 61.4, relative_humidity_2m: 70, weather_code: 2, is_day: 1, wind_speed_10m: 6.2 },
    hourly: {
      time: times,
      temperature_2m: times.map((_, k) => 61 + k * 0.1),
      weather_code: times.map((_, k) => (k === 4 ? 63 : 2)),
      precipitation_probability: times.map((_, k) => (k === 4 ? 80 : 10)),
    },
    daily: {
      time: [0, 1, 2, 3].map((i) => new Date(Date.parse(`${date}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)),
      weather_code: [2, 61, 0, 3], temperature_2m_max: [68.2, 63, 71, 66], temperature_2m_min: [52.4, 50, 49, 51], precipitation_probability_max: [80, 70, 5, 10],
    },
  };
}

test("weather codes map to plain conditions", () => {
  assert.equal(fromWmo(0), "clear");
  assert.equal(fromWmo(2), "partly-cloudy");
  assert.equal(fromWmo(45), "fog");
  assert.equal(fromWmo(63), "rain");
  assert.equal(fromWmo(81), "rain");
  assert.equal(fromWmo(66), "sleet");
  assert.equal(fromWmo(73), "snow");
  assert.equal(fromWmo(95), "storm");
  assert.equal(fromHa("partlycloudy"), "partly-cloudy");
  assert.equal(fromHa("clear-night"), "clear");
  assert.equal(fromHa("lightning-rainy"), "storm");
  assert.equal(fromHa("something-new"), "cloudy");
});

test("without a location or weather entity, weather says it isn't connected", async () => {
  const home = await testHome();
  const r = home.weather.report();
  assert.equal(r.source, "none");
  assert.equal(r.available, false);
  assert.equal(home.weather.summary(), null);
  assert.match(homeState(home), /Weather: not connected/);
  const plan = parse("what's the weather like?", home);
  assert.match(plan.reply, /isn't connected/);
  assert.match(plan.reply, /outdoor sensor reads/);
});

test("Open-Meteo: current conditions, 12 hours and the next days", async () => {
  let asked = null;
  const { server, url } = await serve((req, res) => {
    asked = new URL(req.url, "http://x");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(openMeteoBody()));
  });
  try {
    const config = loadConfig();
    config.weather = { latitude: 40.71, longitude: -74.01 };
    const w = new Weather({ config, adapter: { name: "simulator" }, openMeteoUrl: `${url}/v1/forecast` });
    assert.equal(w.source(), "open-meteo");
    const r = await w.refresh();
    assert.equal(asked.searchParams.get("latitude"), "40.71");
    assert.equal(asked.searchParams.get("temperature_unit"), "fahrenheit");
    assert.equal(asked.searchParams.get("timezone"), TZ);
    assert.equal(r.available, true);
    assert.equal(r.stale, false);
    assert.equal(r.current.tempF, 61);
    assert.equal(r.current.text, "Partly cloudy");
    assert.equal(r.hourly.length, 12);
    assert.equal(r.hourly[0].label, "Now");
    assert.equal(r.hourly[4].condition, "rain");
    assert.equal(r.daily[0].label, "Today");
    assert.equal(r.daily[0].highF, 68);
    assert.equal(r.daily[0].lowF, 52);
    assert.match(w.summary(), /^61°F and partly cloudy outside, high 68°F, low 52°F\. Rain likely around \d+ (AM|PM)\.$/);
  } finally {
    server.close();
  }
});

test("Open-Meteo failure keeps the last reading and reports the error", async () => {
  let fail = false;
  const { server, url } = await serve((req, res) => {
    if (fail) { res.writeHead(503); return res.end(); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(openMeteoBody()));
  });
  try {
    const config = loadConfig();
    config.weather = { latitude: 1, longitude: 2 };
    const w = new Weather({ config, adapter: null, openMeteoUrl: url });
    await w.refresh();
    fail = true;
    const r = await w.refresh();
    assert.equal(r.available, true);
    assert.equal(r.current.tempF, 61);
    assert.match(r.error, /503/);
  } finally {
    server.close();
  }
});

test("Home Assistant: a weather entity with hourly and daily forecasts", async () => {
  const soon = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
  const forecasts = {
    hourly: Array.from({ length: 14 }, (_, k) => ({ datetime: soon(k), temperature: 15 + k * 0.5, condition: k === 3 ? "rainy" : "cloudy", precipitation_probability: k === 3 ? 90 : 0 })),
    daily: [0, 1, 2].map((d) => ({ datetime: soon(d * 24), temperature: 20, templow: 10, condition: "sunny" })),
  };
  const { server, url } = await serve((req, res) => {
    if (req.headers.authorization !== "Bearer ha-token") { res.writeHead(401); return res.end(); }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url === "/api/states") return res.end("[]");
      if (req.url === "/api/states/weather.home") return res.end(JSON.stringify({ entity_id: "weather.home", state: "cloudy", attributes: { temperature: 16, temperature_unit: "°C", humidity: 81 } }));
      if (req.url === "/api/services/weather/get_forecasts?return_response") {
        const { type } = JSON.parse(body);
        return res.end(JSON.stringify({ changed_states: [], service_response: { "weather.home": { forecast: forecasts[type] } } }));
      }
      res.end("{}");
    });
  });
  const home = await createHome({ env: { HAVEN_ADAPTER: "homeassistant", HA_URL: url, HA_TOKEN: "ha-token" }, dataDir: null });
  try {
    assert.equal(home.weather.source(), "homeassistant");
    const r = await home.weather.refresh();
    assert.equal(r.available, true);
    assert.equal(r.current.tempF, 61); // 16°C
    assert.equal(r.current.humidity, 81);
    assert.equal(r.current.condition, "cloudy");
    assert.equal(r.hourly.length, 12);
    assert.equal(r.hourly[3].condition, "rain");
    assert.equal(r.daily[0].highF, 68);
    assert.equal(r.daily[0].lowF, 50);
  } finally {
    home.stop();
    server.close();
  }
});

test("the agent, the parser and briefings use the forecast", async () => {
  const home = await testHome();
  home.weather.seedSample();
  assert.equal(home.weather.report().source, "sample");
  assert.match(homeState(home), /Weather: \d+°F and .* outside.*sample weather in the demo/);

  const reply = parse("is it going to rain today?", home).reply;
  assert.match(reply, /^\d+°F and /);
  assert.match(parse("it's cold outside", home).reply, /outside/); // about the weather, not the heat
  assert.deepEqual(parse("i'm cold", home), { feedback: { feeling: "too_cold" } });
  assert.ok(parse("turn on the lights outside", home).steps, "an outdoor command is still a command");

  const digest = home.briefings.digest("morning");
  assert.ok(digest.facts.weather);
  const b = template({ id: "morning", label: "Good morning" }, digest);
  assert.match(b.body, /Inside it's [\d.]+°F\. \d+°F and .* outside, high \d+°F/);
});
