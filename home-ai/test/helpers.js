import { createHome, loadConfig } from "../src/home.js";

// A fast, in-memory home: no disk, no network, simulator at 1000x speed.
export async function testHome(overrides = {}) {
  const config = loadConfig();
  Object.assign(config.settings, overrides.settings || {});
  const home = await createHome({ config, env: {}, dataDir: null, simSpeed: 1000 });
  home.automations.isDark = overrides.dark === undefined ? () => true : () => overrides.dark;
  home.notifier.isQuietHours = () => false;
  home.automations.start();
  home.automations.stop(); // keep the event subscriptions, drop the timer; tests call tick() directly
  return home;
}

export const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
