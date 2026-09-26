// Browser-only Haven: the real core (safety controller, automations,
// command parser, briefings) running on a simulated house inside the page.
// Exposes window.HavenDemo with the same API the home server serves.
import config from "../../config/home.json";
import { createHome } from "../../src/home.js";
import { createRoutes } from "../../src/api.js";

const ready = (async () => {
  const home = await createHome({ config, env: {}, dataDir: null });
  // Open in a lived-in evening state rather than an empty house.
  home.registry.report("light.kitchen", { on: true, brightness: 80 });
  home.registry.report("light.living", { on: true, brightness: 60 });
  home.registry.report("sensor.outdoor_lux", { lux: 12 }, "sensor");
  home.registry.report("climate.main", { current: 71.5 }, "sensor");
  await home.start();
  // A simulated day so far, so the energy chart has a shape (the panel
  // labels this house as simulated). Base load, a morning bump, a quiet
  // midday, an evening peak for cooking and cooling.
  home.energy.seedSimulatedDay((h) => {
    const bump = (c, w, a) => a * Math.exp(-((h - c) ** 2) / (2 * w * w));
    return 0.55 + bump(7.2, 0.9, 1.6) + bump(12.5, 1.2, 0.35) + bump(18.8, 1.4, 2.6) + 0.12 * Math.sin(h * 2.3);
  });
  await home.notifier.send({
    priority: "info",
    title: "Welcome to the Haven demo",
    body: "This is a simulated house. Try \"goodnight\", \"open the garage\", or the Simulator buttons at the bottom.",
  });
  return { home, routes: createRoutes(home) };
})();

window.HavenDemo = {
  async request(method, path, body) {
    const { routes } = await ready;
    const url = new URL(path, "https://haven.demo");
    const route = routes.find(([m, re]) => m === method && re.test(url.pathname));
    if (!route) return { error: "not found" };
    const [, re, , handler] = route;
    // Copy in and out, exactly like a network round trip, so the app can
    // never touch the house's own objects and bypass the safety controller.
    const result = await handler(url, copy(body || {}), url.pathname.match(re));
    return copy(result);
  },
  subscribe(fn) {
    ready.then(({ home }) => home.bus.on("event", (e) => fn(copy(e))));
  },
};

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
