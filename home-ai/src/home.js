// Assembles a running home: registry, adapter, controller, automations,
// notifications, presence, agent and briefings, all sharing one event bus.
import fs from "node:fs";
import { Bus } from "./core/bus.js";
import { Store } from "./core/store.js";
import { Registry } from "./core/registry.js";
import { Controller } from "./core/controller.js";
import { friendlyTime, localParts } from "./core/time.js";
import { SimulatorAdapter } from "./adapters/simulator.js";
import { HomeAssistantAdapter } from "./adapters/homeassistant.js";
import { Notifier } from "./notify.js";
import { Automations, Presence } from "./automations.js";
import { Briefings } from "./briefings.js";
import { Learner } from "./learning.js";
import { Reflection } from "./reflection.js";
import { createAgent } from "./agent/index.js";

export function loadConfig(path = new URL("../config/home.json", import.meta.url)) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export async function createHome({ config = loadConfig(), env = process.env, dataDir = null, simSpeed = 1 } = {}) {
  const bus = new Bus();
  const store = new Store(dataDir);
  bus.on("event", (e) => store.append(e));

  const registry = new Registry(config, bus, store);
  const adapter = (env.HAVEN_ADAPTER || "simulator") === "homeassistant"
    ? new HomeAssistantAdapter({ registry, url: env.HA_URL, token: env.HA_TOKEN })
    : new SimulatorAdapter({ registry, speed: simSpeed });

  const home = {
    config, bus, store, registry, adapter,
    controller: new Controller({ config, registry, adapter, bus }),
    notifier: new Notifier({ config, bus, env }),
    presence: new Presence({ config, bus }),
    now() {
      const { weekday } = localParts(config.home.timezone);
      return `${weekday} ${friendlyTime(config.home.timezone)}`;
    },
  };
  home.learner = new Learner(home);
  home.automations = new Automations(home);
  home.agent = await createAgent(home, env);
  home.briefings = new Briefings({ home });
  home.reflection = new Reflection({ home });

  home.start = async () => {
    await adapter.start();
    home.automations.start();
    home.learner.start();
    home.briefings.start();
    home.reflection.start();
    bus.publish("system", { message: `Haven started (${adapter.name} adapter, ${home.agent.kind} agent).` });
  };
  home.stop = () => {
    store.flush();
    adapter.stop();
    home.automations.stop();
    home.learner.stop();
    home.briefings.stop();
    home.reflection.stop();
  };
  return home;
}
