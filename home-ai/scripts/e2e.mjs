// End-to-end check: opens the Haven app in a real browser at phone size and
// presses every control, scene, simulator button and chat command, checking
// each one does what the app says it does.
//
//   npm run e2e            both targets
//   npm run e2e -- server  the app served by the Haven home server
//   npm run e2e -- demo    the browser-only demo build (run build:demo first)
//
// Needs Chromium: set CHROMIUM_PATH, or it tries /opt/pw-browsers/chromium,
// then Playwright's own download (npx playwright install chromium).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createHome } from "../src/home.js";
import { createServer } from "../src/http.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const targets = process.argv.slice(2).filter((a) => a === "server" || a === "demo");
const run = targets.length ? targets : ["server", "demo"];
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

let failures = 0;
function report(ok, label, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
}

async function poll(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return last;
}

async function check(label, fn, timeout) {
  let result;
  try { result = await poll(fn, timeout); } catch (err) { return report(false, label, err.message); }
  report(Boolean(result), label);
}

async function exercise(page, { garageTravelMs }) {
  const device = (name) => page.locator(".device").filter({ has: page.locator(".name", { hasText: new RegExp(`^${name}$`) }) });
  const stateOf = async (name) => (await device(name).locator(".state").textContent()).trim();
  const press = (name, label) => device(name).getByRole("button", { name: label }).first().click();
  const headline = () => page.locator("#status-headline").textContent();
  const chat = async (text) => {
    const before = await page.locator(".msg.haven").count();
    await page.fill("#chat-input", text);
    await page.press("#chat-input", "Enter");
    await poll(async () => (await page.locator(".msg.haven").count()) > before);
    return page.locator(".msg.haven").last().textContent();
  };
  const sim = (label) => page.locator("#sim-buttons button", { hasText: label }).click();
  const waitGarageRest = () => new Promise((r) => setTimeout(r, Math.max(garageTravelMs, 10_500)));

  // Look switch
  await page.click('.look-switch button[data-look="futuristic"]');
  await check("Look switch: Futuristic", async () => (await page.getAttribute("html", "data-look")) === "futuristic");
  await page.click('.look-switch button[data-look="grounded"]');
  await check("Look switch: Grounded", async () => (await page.getAttribute("html", "data-look")) === "grounded");
  await check("Status line starts at 'All secure'", async () => (await headline()) === "All secure");

  // Lights and fans
  const kitchenBefore = await stateOf("Kitchen Lights");
  await press("Kitchen Lights", /Turn (on|off)/);
  await check("Kitchen light button toggles the light", async () => (await stateOf("Kitchen Lights")) !== kitchenBefore);
  await press("Living Room Fan", /Turn on/);
  await check("Fan button turns the fan on", async () => (await stateOf("Living Room Fan")).startsWith("On"));
  await press("Living Room Fan", /Turn off/);
  await check("Fan button turns the fan off", async () => (await stateOf("Living Room Fan")) === "Off");

  // Thermostat
  const target = async () => Number((await stateOf("Main Thermostat")).match(/to (\d+)°F/)?.[1]);
  const t0 = await target();
  await press("Main Thermostat", "Warmer by 1°F");
  await check("Thermostat + raises the target 1°F", async () => (await target()) === t0 + 1);
  await press("Main Thermostat", "Cooler by 1°F");
  await check("Thermostat − lowers the target 1°F", async () => (await target()) === t0);
  const modeBtn = () => device("Main Thermostat").locator(".controls button").nth(2);
  const mode0 = await modeBtn().textContent();
  await modeBtn().click();
  await check("Thermostat mode button changes the mode", async () => (await modeBtn().textContent()) !== mode0);
  for (let i = 0; i < 3; i++) { await modeBtn().click(); await page.waitForTimeout(250); }
  await check("Thermostat mode cycles back around", async () => (await modeBtn().textContent()) === mode0);

  // Water heater
  const wh = async () => stateOf("Water Heater");
  await press("Water Heater", "Lower 5°F");
  await check("Water heater − lowers 5°F", async () => (await wh()).startsWith("115°F"));
  await press("Water Heater", "Raise 5°F");
  await check("Water heater + raises 5°F", async () => (await wh()).startsWith("120°F"));
  await press("Water Heater", "Raise 5°F");
  await press("Water Heater", "Raise 5°F");
  await check("Water heater refuses above 125°F", async () => /^125°F/.test(await wh()) && (await page.locator(".msg.haven", { hasText: "must stay between" }).count()) >= 1);
  await press("Water Heater", "Lower 5°F");
  await press("Water Heater", "Turn off water heater");
  await check("Water heater Off button", async () => (await wh()) === "Off");
  await press("Water Heater", "Turn on");
  await check("Water heater Turn on button", async () => (await wh()) !== "Off");

  // Main water valve
  await press("Main Water Shutoff", "Shut off");
  await check("Shut off stops the main water", async () => (await stateOf("Main Water Shutoff")) === "Water off");
  await check("Status line flags the water being off", async () => (await page.locator("#issues").textContent()).includes("Main water is off"));
  await press("Main Water Shutoff", "Turn on");
  await check("Turn on restores the water", async () => (await stateOf("Main Water Shutoff")) === "Water on");

  // Locks, with the status line's one-tap fix
  await press("Front Door Lock", "Unlock");
  await check("Unlock button unlocks the front door", async () => (await stateOf("Front Door Lock")) === "Unlocked");
  await check("Status line offers a Lock fix", async () => (await page.locator(".issue", { hasText: "Front Door unlocked" }).count()) === 1);
  await page.locator(".issue", { hasText: "Front Door unlocked" }).getByRole("button", { name: "Lock" }).click();
  await check("Status line Lock fix locks the door", async () => (await stateOf("Front Door Lock")) === "Locked");

  // Garage from the room card, then the status line Close fix
  await press("Garage Door", "Open");
  await check("Garage Open button opens the door", async () => (await stateOf("Garage Door")) === "Open", garageTravelMs + 4000);
  await check("Status line offers a Close fix for the garage", async () => (await page.locator(".issue", { hasText: "Garage open" }).count()) === 1);
  await waitGarageRest();
  await page.locator(".issue", { hasText: "Garage open" }).getByRole("button", { name: "Close" }).click();
  await check("Status line Close fix closes the garage", async () => (await stateOf("Garage Door")) === "Closed", garageTravelMs + 4000);
  await waitGarageRest();

  // Chat and confirmations
  let reply = await chat("turn off the kitchen lights");
  await check("Chat: 'turn off the kitchen lights'", async () => (await stateOf("Kitchen Lights")) === "Off" && /Turned off|already/.test(reply));
  reply = await chat("set the thermostat to 70");
  await check("Chat: 'set the thermostat to 70'", async () => (await target()) === 70);
  reply = await chat("what's the temperature");
  report(/°F inside/.test(reply), "Chat: temperature question gets an answer");
  reply = await chat("open the garage");
  await check("Chat: 'open the garage' asks for confirmation", async () => (await page.locator(".pending-card").count()) === 1 && /Waiting for your OK/.test(reply));
  await page.locator(".pending-card").getByRole("button", { name: "Cancel" }).click();
  await check("Cancel removes the confirmation and leaves the garage shut", async () => (await page.locator(".pending-card").count()) === 0 && (await stateOf("Garage Door")) === "Closed");
  await chat("open the garage");
  await page.locator(".pending-card").getByRole("button", { name: "Confirm" }).click();
  await check("Confirm opens the garage", async () => (await stateOf("Garage Door")) === "Open", garageTravelMs + 4000);
  await waitGarageRest();
  reply = await chat("purple monkey dishwasher");
  report(/didn't catch that/.test(reply), "Chat: unknown request gets a helpful reply");

  // Scenes
  for (const [label, verify] of [
    ["Good morning", async () => (await stateOf("Kitchen Lights")).startsWith("On · 80%")],
    ["Movie night", async () => (await stateOf("Living Room Lights")) === "On · 15%"],
    ["Welcome home", async () => (await stateOf("Kitchen Lights")).startsWith("On · 90%")],
    ["Goodnight", async () => (await stateOf("Garage Door")) === "Closed" && (await stateOf("Kitchen Lights")) === "Off" && (await stateOf("Front Door Lock")) === "Locked"],
    ["Away", async () => (await stateOf("Bedroom Fan")) === "Off" && /away/.test(await stateOf("Main Thermostat"))],
  ]) {
    await page.locator("#scenes button", { hasText: label }).click();
    await check(`Scene: ${label}`, verify, garageTravelMs + 4000);
  }

  // Brief me now: exactly one message
  const beforeBrief = await page.locator(".msg.haven").count();
  await page.click("#brief-now");
  await check("Brief me now posts one briefing", async () => (await page.locator(".msg.haven").count()) === beforeBrief + 1);
  await page.waitForTimeout(500);
  report((await page.locator(".msg.haven").count()) === beforeBrief + 1, "Brief me now does not post twice");

  // Simulator and automations
  await sim("Make it night");
  await page.waitForTimeout(300);
  await chat("turn off all the lights");
  await sim("Motion in kitchen");
  await check("Night motion turns on the kitchen lights", async () => (await stateOf("Kitchen Lights")).startsWith("On"));
  await sim("Motion on driveway");
  await check("Night driveway motion lights the driveway and porch", async () => (await stateOf("Driveway Lights")).startsWith("On") && (await stateOf("Porch Lights")).startsWith("On"));
  await sim("Make it day");
  await sim("Leak at water heater");
  await check("Leak shuts off the main water", async () => (await stateOf("Main Water Shutoff")) === "Water off");
  await check("Leak turns off the water heater", async () => (await stateOf("Water Heater")) === "Off");
  await check("Leak makes the status line urgent", async () => (await headline()) === "Needs your attention now");
  await check("Leak posts an urgent update", async () => (await page.locator("#feed li.urgent", { hasText: "Water leak detected" }).count()) >= 1);
  await press("Main Water Shutoff", "Turn on");
  await check("Water can't be turned back on while the sensor is wet", async () => /leak/i.test(await page.locator(".msg.haven").last().textContent()) && (await stateOf("Main Water Shutoff")) === "Water off");
  await sim("Leak sensor dries");
  await check("Dry sensor posts an update", async () => (await page.locator("#feed li", { hasText: "Leak sensor is dry" }).count()) >= 1);
  await press("Main Water Shutoff", "Turn on");
  await check("Water turns back on once dry", async () => (await stateOf("Main Water Shutoff")) === "Water on");
  await press("Water Heater", "Turn on");
  await sim("Back door opens");
  await check("Open back door shows on the status line", async () => (await page.locator(".issue", { hasText: "Back Door open" }).count()) === 1);
  await sim("Back door closes");
  await check("Closing the back door clears it", async () => (await page.locator(".issue", { hasText: "Back Door open" }).count()) === 0);
  await sim("Cold snap");
  await check("Cold snap raises an urgent alert", async () => (await page.locator("#feed li.urgent", { hasText: "getting cold" }).count()) >= 1);
  await sim("Make it night");
  await chat("turn off all the lights");
  await sim("Car approaching home");
  await check("Approaching at night turns on the porch light", async () => (await stateOf("Porch Lights")).startsWith("On"));
  await sim("Everyone leaves");
  await check("Everyone leaving shows 'Everyone away'", async () => (await page.locator("#subtitle").textContent()).includes("Everyone away"));
  await check("Everyone leaving turns the lights off", async () => (await stateOf("Porch Lights")) === "Off" && (await stateOf("Kitchen Lights")) === "Off");
  await check("Everyone leaving posts 'House secured'", async () => (await page.locator("#feed li", { hasText: "House secured" }).count()) >= 1);
  await sim("Arrive home");
  await check("Arriving shows someone home", async () => (await page.locator("#subtitle").textContent()).includes("1 person home"));
  await check("Arriving brings climate back from away", async () => !/away/.test(await stateOf("Main Thermostat")));

  // Layout
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  report(!overflow, "No sideways scrolling at phone width");
}

async function runTarget(browser, target) {
  console.log(`\n${target === "server" ? "Home server app" : "Browser-only demo"}`);
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errors.push(`request failed: ${r.url()}`); });

  let cleanup = () => {};
  if (target === "server") {
    const home = await createHome({ env: {}, dataDir: null, simSpeed: 10 });
    await home.start();
    const server = createServer(home, { token: "e2e-token" });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    cleanup = () => { home.stop(); server.closeAllConnections?.(); server.close(); };
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.fill("#token-input", "wrong");
    await page.click("#login-form button");
    await check("Wrong token shows an error", async () => (await page.textContent("#login-error")).includes("didn't work"));
    await page.fill("#token-input", "e2e-token");
    await page.click("#login-form button");
  } else {
    const file = path.join(root, "dist/demo/haven-grounded.html");
    if (!fs.existsSync(file)) throw new Error("Run `npm run build:demo` first.");
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fs.readFileSync(file, "utf8")}</body></html>`);
  }
  await page.waitForSelector("#app:not([hidden])", { timeout: 10_000 });
  report(true, "App loads");
  await exercise(page, { garageTravelMs: target === "server" ? 400 : 4000 });
  report(errors.length === 0, "No script errors", errors.join(" | "));
  await page.close();
  cleanup();
}

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const t of run) await runTarget(browser, t);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
