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
    return handler(url, body || {}, url.pathname.match(re));
  },
  subscribe(fn) {
    ready.then(({ home }) => home.bus.on("event", fn));
  },
};
