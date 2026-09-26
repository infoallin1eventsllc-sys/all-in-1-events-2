// Haven entry point: `npm start`.
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createHome } from "./home.js";
import { createServer } from "./http.js";

loadDotEnv(fileURLToPath(new URL("../.env", import.meta.url)));
const env = process.env;
const dataDir = fileURLToPath(new URL("../data/", import.meta.url));

const home = await createHome({ env, dataDir });

let token = env.HAVEN_OWNER_TOKEN || home.store.loadSecret("ownerToken");
let generated = false;
if (!token) {
  token = crypto.randomBytes(24).toString("base64url");
  home.store.saveSecret("ownerToken", token);
  generated = true;
}

await home.start();
const port = Number(env.PORT) || 8787;
const host = env.HOST || "0.0.0.0";
createServer(home, { token }).listen(port, host, () => {
  console.log(`\nHaven is running for ${home.config.home.name}`);
  console.log(`  App:      http://localhost:${port}`);
  console.log(`  Devices:  ${home.adapter.name}`);
  console.log(`  Agent:    ${home.agent.kind === "claude" ? `Claude (${home.agent.model})` : "offline command parser (set ANTHROPIC_API_KEY for the full AI)"}`);
  console.log(`  Alerts:   ${home.notifier.channelNames().join(", ")}`);
  if (generated) console.log(`\n  Owner token (saved in data/secrets.json, shown once):\n  ${token}\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { home.stop(); process.exit(0); });

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined && m[2] !== "") process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
