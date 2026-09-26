// End-to-end check: opens the Haven panel in a real browser and presses
// every control, scene, simulator button, voice control and learning
// feature, checking each one does what the panel says it does.
//
//   npm run e2e            both targets
//   npm run e2e -- server  the panel served by the Haven home server
//   npm run e2e -- demo    the browser-only demo build (run build:demo first)
//
// A test browser has no microphone or speakers, so speech recognition and
// speech synthesis are replaced with stand-ins that record what was said.
//
// Needs Chromium: set CHROMIUM_PATH, or it tries /opt/pw-browsers/chromium,
// then Playwright's own download (npx playwright install chromium).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createHome } from "../src/home.js";
import { createServer } from "../src/http.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AXE = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Automated WCAG 2.2 AA audit of what's on screen right now.
async function audit(page, label) {
  await page.waitForTimeout(400); // let color transitions settle before measuring contrast
  if (!(await page.evaluate(() => typeof window.axe !== "undefined"))) await page.addScriptTag({ content: AXE });
  const r = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags } }), WCAG);
  const detail = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`).join("; ");
  report(r.violations.length === 0, `Accessibility (WCAG 2.2 AA): ${label}`, detail);
}
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

// Stand-in microphone and speaker.
const FAKE_VOICE = () => {
  window.__spoken = [];
  window.__heard = "turn on the kitchen lights";
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak(u) { window.__spoken.push(u.text); u.onstart?.(); setTimeout(() => u.onend?.(), 10); },
      cancel() {}, getVoices() { return []; }, addEventListener() {},
    },
  });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => {
        const result = Object.assign([{ transcript: window.__heard }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        this.onend?.();
      }, 80);
    }
    stop() { this.onend?.(); }
  };
};

async function exercise(page, { garageTravelMs, home }) {
  const tileOf = (id) => page.locator(`.tile[data-device="${id}"]`);
  const stateOf = async (id) => (await tileOf(id).locator(".tile-state").textContent()).trim();
  const press = (id, label) => tileOf(id).getByRole("button", { name: label, exact: true }).first().click();
  const flip = (id) => tileOf(id).getByRole("switch").click();
  const headline = () => page.locator("#status-headline").textContent();
  const openRoom = (name) => page.locator("#rooms-nav button", { hasText: new RegExp(`^${name}$`) }).click();
  const openTab = (name) => page.locator(".tabs [role=tab]", { hasText: name }).click();
  const lastHaven = () => page.locator(".msg.haven").last().textContent();
  const spoken = () => page.evaluate(() => window.__spoken.join(" | "));
  const chat = async (text) => {
    await page.fill("#chat-input", text);
    await page.press("#chat-input", "Enter");
    return poll(() => page.evaluate((t) => {
      const kids = [...document.querySelectorAll("#chat-log .msg")];
      const i = kids.map((k) => k.textContent).lastIndexOf(t);
      return i >= 0 ? kids.slice(i + 1).find((k) => k.classList.contains("haven"))?.textContent || null : null;
    }, text));
  };
  const sim = async (label) => { await openTab("Simulator"); await page.locator("#sim-buttons button", { hasText: label }).click(); await openTab("Home"); };
  const waitGarageRest = () => new Promise((r) => setTimeout(r, Math.max(garageTravelMs, 10_500)));

  // ----- look and layout -----
  await page.click('.look-switch button[data-look="futuristic"]');
  await check("Style switch: Futuristic", async () => (await page.getAttribute("html", "data-look")) === "futuristic");
  await page.click('.look-switch button[data-look="grounded"]');
  await check("Style switch: Grounded", async () => (await page.getAttribute("html", "data-look")) === "grounded");
  await check("Status starts at 'All secure'", async () => (await headline()) === "All secure");
  await check("Greeting states the indoor temperature", async () => /It's [\d.]+°F inside/.test(await page.textContent("#greeting")));
  await check("Clock shows the time", async () => /\d:\d\d/.test(await page.textContent("#clock")));
  await audit(page, "whole home, Grounded");
  await page.click('.look-switch button[data-look="futuristic"]');
  await audit(page, "whole home, Futuristic");
  await page.click('.look-switch button[data-look="grounded"]');

  // ----- home map and energy -----
  await check("Home map draws every room", async () => (await page.locator(".map-room").count()) === 6);
  await page.locator('.map-room[data-room="kitchen"]').click();
  await check("Tapping a room on the map opens it", async () => (await page.textContent("#room-title")) === "Kitchen");
  await page.locator('.map-room[data-room="kitchen"]').click();
  await check("Tapping it again goes back to the whole home", async () => (await page.textContent("#room-title")) === "Whole home");
  await check("Energy tile says the numbers are estimated", async () => /Estimated/.test(await tileOf("energy").textContent()));
  const kwNow = async () => Number((await tileOf("energy").locator(".energy-num").first().textContent()).trim());
  const kw0 = await kwNow();
  await openRoom("Living Room");
  await flip("fan.living");
  await press("fan.living", "Speed 3");
  await openRoom("Whole home");
  await check("Live power rises when the fan runs", async () => (await kwNow()) > kw0);
  await openRoom("Living Room");
  await flip("fan.living");
  await openRoom("Whole home");
  if (await tileOf("energy").locator(".chart-hit").count()) {
    await check("Hovering the chart shows the time and kW", async () => {
      await tileOf("energy").locator(".chart-hit").evaluate((el) => el.scrollIntoView({ block: "center" }));
      const box = await tileOf("energy").locator(".chart-hit").boundingBox();
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.move(box.x + 14, box.y + box.height / 2);
      return /\d:\d\d [AP]M · [\d.]+ kW/.test(await tileOf("energy").locator(".chart-tip").textContent());
    });
    report((await tileOf("energy").locator("table caption").count()) === 1, "Chart has a table view for screen readers");
  }

  // ----- rooms: lights and fans -----
  await openRoom("Kitchen");
  await check("Room tabs switch the room", async () => (await page.textContent("#room-title")) === "Kitchen");
  const k0 = await stateOf("light.kitchen");
  await flip("light.kitchen");
  await check("Light switch toggles the light", async () => (await stateOf("light.kitchen")) !== k0);
  if ((await stateOf("light.kitchen")) === "Off") await flip("light.kitchen");
  await check("Light is on", async () => (await stateOf("light.kitchen")).startsWith("On"));
  await tileOf("light.kitchen").locator('input[type="range"]').evaluate((el) => { el.value = "40"; el.dispatchEvent(new Event("change", { bubbles: true })); });
  await check("Brightness slider sets 40%", async () => (await stateOf("light.kitchen")) === "On · 40%");

  await check("Home map glows where the light is on", async () => (await page.locator('.map-room[data-room="kitchen"].lit').count()) === 1);
  await audit(page, "a room view");

  await openRoom("Living Room");
  await flip("fan.living");
  await check("Fan switch turns the fan on", async () => (await stateOf("fan.living")).startsWith("On"));
  await press("fan.living", "Speed 3");
  await check("Fan speed buttons set speed 3", async () => (await stateOf("fan.living")) === "On · speed 3");
  await flip("fan.living");
  await check("Fan switch turns the fan off", async () => (await stateOf("fan.living")) === "Off");

  // ----- whole home: climate, water heater, water, security -----
  await openRoom("Whole home");
  const target = async () => Number((await tileOf("climate.main").locator(".stepper .target").textContent()).replace(/\D/g, ""));
  const t0 = await target();
  await press("climate.main", "Warmer by 1°F");
  await check("Climate + raises the target 1°F", async () => (await target()) === t0 + 1);
  await press("climate.main", "Cooler by 1°F");
  await check("Climate − lowers the target 1°F", async () => (await target()) === t0);
  await press("climate.main", "Heat");
  await check("Climate mode: Heat", async () => (await tileOf("climate.main").getByRole("button", { name: "Heat", exact: true }).getAttribute("aria-pressed")) === "true");
  await press("climate.main", "Auto");
  await check("Climate mode: back to Auto", async () => (await tileOf("climate.main").getByRole("button", { name: "Auto", exact: true }).getAttribute("aria-pressed")) === "true");

  const wh = () => stateOf("water_heater.main");
  await press("water_heater.main", "Lower 5°F");
  await check("Water heater − lowers 5°F", async () => (await wh()).startsWith("115°F"));
  await press("water_heater.main", "Raise 5°F");
  await check("Water heater + raises 5°F", async () => (await wh()).startsWith("120°F"));
  await press("water_heater.main", "Raise 5°F");
  await press("water_heater.main", "Raise 5°F");
  await check("Water heater refuses above 125°F", async () => /^125°F/.test(await wh()) && (await page.locator(".msg.haven", { hasText: "must stay between" }).count()) >= 1);
  await press("water_heater.main", "Lower 5°F");
  await flip("water_heater.main");
  await check("Water heater power switch turns it off", async () => (await wh()) === "Off");
  await flip("water_heater.main");
  await check("Water heater power switch turns it on", async () => (await wh()) !== "Off");

  await press("valve.main_water", "Shut off");
  await check("Shut off stops the main water", async () => (await stateOf("valve.main_water")).startsWith("Main water off"));
  await check("Status flags the water being off", async () => (await page.locator("#issues").textContent()).includes("Main water is off"));
  await press("valve.main_water", "Turn on");
  await check("Turn on restores the water", async () => (await stateOf("valve.main_water")).startsWith("Main water on"));

  await openRoom("Outside");
  await press("lock.front", "Unlock");
  await check("Unlock button unlocks the front door", async () => (await stateOf("lock.front")) === "Unlocked");
  await check("Status offers a Lock fix", async () => (await page.locator(".issue", { hasText: "Front Door unlocked" }).count()) === 1);
  await page.locator(".issue", { hasText: "Front Door unlocked" }).getByRole("button", { name: "Lock" }).click();
  await check("Status Lock fix locks the door", async () => (await stateOf("lock.front")) === "Locked");
  await press("lock.front", "Unlock");
  await openRoom("Whole home");
  await check("Security tile shows the unlocked door", async () => /1 unlocked/.test(await stateOf("security")));
  await press("security", "Lock up");
  await check("Lock up locks every door", async () => /doors locked/.test(await stateOf("security")));

  await openRoom("Garage");
  await press("garage.door", "Open");
  await check("Garage Open button opens the door", async () => (await stateOf("garage.door")) === "Open", garageTravelMs + 4000);
  await check("Status offers a Close fix for the garage", async () => (await page.locator(".issue", { hasText: "Garage open" }).count()) === 1);
  await waitGarageRest();
  await page.locator(".issue", { hasText: "Garage open" }).getByRole("button", { name: "Close" }).click();
  await check("Status Close fix closes the garage", async () => (await stateOf("garage.door")) === "Closed", garageTravelMs + 4000);
  await waitGarageRest();

  // ----- conversation and confirmations -----
  let reply = await chat("turn off the kitchen lights");
  await openRoom("Kitchen");
  await check("Chat: 'turn off the kitchen lights'", async () => (await stateOf("light.kitchen")) === "Off" && /Turned off|already/.test(reply));
  reply = await chat("what's the temperature");
  report(/°F inside/.test(reply || ""), "Chat: temperature question gets an answer");
  reply = await chat("open the garage");
  await check("Chat: 'open the garage' asks for confirmation", async () => (await page.locator(".ask-card.confirm").count()) === 1 && /Waiting for your OK/.test(reply || ""));
  await page.locator(".ask-card.confirm").getByRole("button", { name: "Cancel" }).click();
  await openRoom("Garage");
  await check("Cancel removes the confirmation, garage stays shut", async () => (await page.locator(".ask-card.confirm").count()) === 0 && (await stateOf("garage.door")) === "Closed");
  await chat("open the garage");
  await page.locator(".ask-card.confirm").getByRole("button", { name: "Confirm" }).click();
  await check("Confirm opens the garage", async () => (await stateOf("garage.door")) === "Open", garageTravelMs + 4000);
  await waitGarageRest();
  reply = await chat("purple monkey dishwasher");
  report(/didn't catch that/.test(reply || ""), "Chat: unknown request gets a helpful reply");

  // ----- voice -----
  await page.evaluate(() => { window.__heard = "turn on the kitchen lights"; window.__spoken = []; });
  await page.click("#mic");
  await openRoom("Kitchen");
  await check("Voice: spoken command runs", async () => (await stateOf("light.kitchen")).startsWith("On"));
  await check("Voice: Haven answers out loud", async () => /Kitchen Lights/.test(await spoken()));
  await page.click("#speak");
  await page.evaluate(() => { window.__spoken = []; });
  await chat("status");
  await page.waitForTimeout(300);
  report((await spoken()) === "", "Voice: speaker button mutes Haven");
  await page.click("#speak");
  report((await page.getAttribute("#speak", "aria-pressed")) === "true", "Voice: speaker button turns speech back on");

  // ----- scenes -----
  for (const [label, roomName, verify] of [
    ["Good morning", "Kitchen", async () => (await stateOf("light.kitchen")).startsWith("On · 80%")],
    ["Movie night", "Living Room", async () => (await stateOf("light.living")) === "On · 15%"],
    ["Welcome home", "Kitchen", async () => (await stateOf("light.kitchen")).startsWith("On · 90%")],
    ["Goodnight", "Garage", async () => (await stateOf("garage.door")) === "Closed" && (await stateOf("lock.garage_entry")) === "Locked"],
    ["Away", "Primary Bedroom", async () => (await stateOf("fan.primary")) === "Off" && (await stateOf("light.primary")) === "Off"],
  ]) {
    await page.locator(".scene", { hasText: label }).click();
    await openRoom(roomName);
    await check(`Scene: ${label}`, verify, garageTravelMs + 4000);
  }

  // ----- learning -----
  await openRoom("Whole home");
  const before = await target();
  await page.locator("#feel button", { hasText: "Too cold" }).click();
  await check("'Too cold' raises the temperature 2°F", async () => (await target()) === Math.min(85, before + 2));
  await check("'Too cold' reply says it will remember", async () => /remember you like it warmer/.test(await lastHaven()));
  await openTab("About you");
  await check("About you lists the learned temperature", async () => (await page.locator("#profile li", { hasText: /Likes \d+°F/ }).count()) === 1);
  await chat("I don't like the porch light on all night");
  await check("A dislike said in chat is remembered", async () => (await page.locator("#profile li", { hasText: "porch light on all night" }).count()) === 1);
  await page.locator("#profile li", { hasText: "porch light on all night" }).getByRole("button", { name: /Forget/ }).click();
  await check("Forget removes one item", async () => (await page.locator("#profile li", { hasText: "porch light on all night" }).count()) === 0);
  await page.click("#reflect-now");
  await check("Review my day reports back", async () => /reviewed the day/.test(await lastHaven()));
  if (home) {
    const th = home.registry.get("climate.main");
    for (const d of ["2026-09-01", "2026-09-02", "2026-09-03"]) home.learner.observe(th, { target: 68 }, { date: d, hhmm: "21:30" });
    await openTab("Home");
    await check("A habit shows up as a suggestion", async () => (await page.locator("#suggestions .ask-card", { hasText: "68°F" }).count()) === 1);
    await page.locator("#suggestions .ask-card").getByRole("button", { name: "Yes, do that" }).click();
    await openTab("About you");
    await check("Accepting it adds a daily routine", async () => (await page.locator("#profile li", { hasText: "every day at 9:30 PM" }).count()) === 1);
  }
  await audit(page, "About you tab");
  await page.click("#forget-all");
  await check("Forget everything asks for a second tap", async () => /Tap again/.test(await page.textContent("#forget-all")));
  await page.click("#forget-all");
  await check("Forget everything clears the profile", async () => (await page.locator("#profile li.empty").count()) === 1);
  await openTab("Home");

  // ----- updates -----
  await openTab("Updates");
  await page.click("#brief-now");
  await check("Brief me now posts a briefing", async () => (await page.locator(".msg.haven", { hasText: "House update" }).count()) === 1);
  await page.waitForTimeout(500);
  report((await page.locator(".msg.haven", { hasText: "House update" }).count()) === 1, "Brief me now does not post twice");
  await audit(page, "Updates tab");
  await openTab("Home");

  // ----- simulator and automations -----
  await sim("Make it night");
  await chat("turn off all the lights");
  await sim("Motion in kitchen");
  await openRoom("Kitchen");
  await check("Night motion turns on the kitchen lights", async () => (await stateOf("light.kitchen")).startsWith("On"));
  await sim("Motion on driveway");
  await openRoom("Outside");
  await check("Night driveway motion lights the driveway and porch", async () => (await stateOf("light.driveway")).startsWith("On") && (await stateOf("light.porch")).startsWith("On"));
  await sim("Make it day");
  await page.evaluate(() => { window.__spoken = []; });
  await sim("Leak at water heater");
  await openRoom("Whole home");
  await check("Leak shuts off the main water", async () => (await stateOf("valve.main_water")).startsWith("Main water off"));
  await check("Leak turns off the water heater", async () => (await stateOf("water_heater.main")) === "Off");
  await check("Leak makes the status urgent", async () => (await headline()) === "Needs your attention now");
  await check("Leak alert is read out loud", async () => /Water leak detected/.test(await spoken()));
  await check("Home map marks the utility room red", async () => (await page.locator('.map-room[data-room="utility"].alert').count()) === 1);
  await audit(page, "during a leak alert");
  await check("Leak posts an urgent update", async () => (await page.locator("#feed li.urgent", { hasText: "Water leak detected" }).count()) >= 1);
  await press("valve.main_water", "Turn on");
  await check("Water can't be turned back on while the sensor is wet", async () => (await page.locator(".msg.haven", { hasText: /leak/i }).count()) >= 1 && (await stateOf("valve.main_water")).startsWith("Main water off"));
  await sim("Leak sensor dries");
  await check("Dry sensor posts an update", async () => (await page.locator("#feed li", { hasText: "Leak sensor is dry" }).count()) >= 1);
  await press("valve.main_water", "Turn on");
  await check("Water turns back on once dry", async () => (await stateOf("valve.main_water")).startsWith("Main water on"));
  await flip("water_heater.main");
  await sim("Back door opens");
  await check("Open back door shows on the status", async () => (await page.locator(".issue", { hasText: "Back Door open" }).count()) === 1);
  await sim("Back door closes");
  await check("Closing the back door clears it", async () => (await page.locator(".issue", { hasText: "Back Door open" }).count()) === 0);
  await sim("Cold snap");
  await check("Cold snap raises an urgent alert", async () => (await page.locator("#feed li.urgent", { hasText: "getting cold" }).count()) >= 1);
  await sim("Make it night");
  await chat("turn off all the lights");
  await sim("Car approaching home");
  await openRoom("Outside");
  await check("Approaching at night turns on the porch light", async () => (await stateOf("light.porch")).startsWith("On"));
  await sim("Everyone leaves");
  await openRoom("Whole home");
  await check("Everyone leaving: greeting says everyone away", async () => /everyone away/.test(await page.textContent("#greeting")));
  await check("Everyone leaving turns the lights off", async () => (await stateOf("lights")) === "All off");
  await check("Everyone leaving posts 'House secured'", async () => (await page.locator("#feed li", { hasText: "House secured" }).count()) >= 1);
  await sim("Arrive home");
  await check("Arriving shows someone home", async () => /1 person home/.test(await page.textContent("#greeting")));
  await check("Arriving brings climate back from away", async () => !/away/.test(await stateOf("climate.main")));

  // ----- screen library -----
  const openLibrary = async () => { await page.locator(".screens-open:visible").first().click(); await page.waitForSelector("#library[open]"); };
  const useScreen = async (id) => {
    await openLibrary();
    await page.locator(`#library [data-screen="${id}"]`).click();
    await page.locator("#library-close").click();
    await check(`Library: switches to ${id}`, async () => (await page.getAttribute("#app", "data-screen")) === id);
  };
  await openLibrary();
  await check("Library lists six screens", async () => (await page.locator(".library-card").count()) === 6);
  await page.selectOption("#panel-room", "primary");
  await page.locator("#library-close").click();
  await chat("turn on the lights");
  await openRoom("Primary Bedroom");
  await check("Panel room: 'turn on the lights' means this panel's room", async () => (await stateOf("light.primary")).startsWith("On"));
  await openLibrary();
  await page.selectOption("#panel-room", "");
  await page.locator("#library-close").click();

  const ALT = (id) => `#alt [data-device="${id}"]`;
  await useScreen("command-center");
  await check("Command Center shows the map, climate, energy, lights, doors and conditions", async () =>
    (await page.locator("#alt .map-room").count()) === 6 && (await page.locator("#alt .energy").count()) === 1 &&
    (await page.locator("#alt .lights-list li").count()) === 7 && (await page.locator("#alt .sec-item").count()) >= 4 && (await page.locator("#alt .cond-list li").count()) >= 4);
  const kitchenLi = () => page.locator(`#alt .lights-list li[data-device="light.kitchen"]`);
  const wasOn = (await kitchenLi().getAttribute("class"))?.includes("on");
  await kitchenLi().getByRole("switch").click();
  await check("Command Center: a light switch works", async () => ((await kitchenLi().getAttribute("class")) || "").includes("on") !== wasOn);
  await audit(page, "Command Center");

  await useScreen("family-hub");
  await check("Family Hub shows the briefing, scenes and comfort buttons", async () =>
    (await page.locator("#alt .briefing-card").count()) === 1 && (await page.locator("#alt .scene").count()) === 5 && (await page.locator("#alt .feel button").count()) === 5);
  await page.locator("#alt .briefing-card button", { hasText: "Brief me now" }).click();
  await check("Family Hub: Brief me now fills the Today card", async () => (await page.locator("#alt .briefing-card .brief-title").count()) === 1);
  await audit(page, "Family Hub");

  await useScreen("nightstand");
  await page.locator("#alt .big-btn", { hasText: "Goodnight" }).click();
  await useScreen("rooms");
  await check("Nightstand Goodnight took effect (checked on Rooms)", async () =>
    (await page.locator(`${ALT("lock.front")} .rd-state`).textContent()) === "Locked" && (await page.locator(`${ALT("light.kitchen")} .rd-state`).textContent()) === "Off", garageTravelMs + 4000);
  await useScreen("nightstand");
  await audit(page, "Nightstand");

  await useScreen("rooms");
  await check("Rooms shows a card per room", async () => (await page.locator("#alt .room-card").count()) === 7);
  await page.locator(ALT("light.kitchen")).click();
  await check("Rooms: tapping a light turns it on", async () => (await page.locator(`${ALT("light.kitchen")} .rd-state`).textContent()).startsWith("On"));
  await audit(page, "Rooms");

  await useScreen("entry");
  await check("Entry lists what's still on", async () => (await page.locator("#alt .stillon-card li", { hasText: "Kitchen Lights" }).count()) === 1);
  await page.locator("#alt .stillon-card li", { hasText: "Kitchen Lights" }).getByRole("button", { name: "Turn off" }).click();
  await check("Entry: Turn off works", async () => (await page.locator("#alt .stillon-card li", { hasText: "Kitchen Lights" }).count()) === 0);
  await audit(page, "Entry");
  for (const id of ["command-center", "family-hub", "nightstand", "rooms", "entry"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await useScreen(id);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    report(!overflow, `${id}: no sideways scrolling at 390px`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await useScreen("signature");

  // ----- layout -----
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    report(!overflow, `No sideways scrolling at ${w}px`);
  }
  await audit(page, "phone width");
}

async function runTarget(browser, target) {
  console.log(`\n${target === "server" ? "Panel on the home server" : "Browser-only demo"}`);
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  await page.addInitScript(FAKE_VOICE);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errors.push(`request failed: ${r.url()}`); });

  let cleanup = () => {};
  let home = null;
  if (target === "server") {
    home = await createHome({ env: {}, dataDir: null, simSpeed: 10 });
    await home.start();
    home.energy.seedSimulatedDay((h) => 0.6 + (h > 17 ? 1.8 : 0)); // give the chart a shape to hover
    const server = createServer(home, { token: "e2e-token" });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    cleanup = () => { home.stop(); server.closeAllConnections?.(); server.close(); };
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await audit(page, "sign-in screen");
    await page.fill("#token-input", "wrong");
    await page.click("#login-form button");
    await check("Wrong token shows an error", async () => (await page.textContent("#login-error")).includes("didn't work"));
    await page.fill("#token-input", "e2e-token");
    await page.click("#login-form button");
  } else {
    const file = path.join(root, "dist/demo/haven-grounded.html");
    if (!fs.existsSync(file)) throw new Error("Run `npm run build:demo` first.");
    const wrapper = path.join(root, "dist/demo/_e2e.html");
    fs.writeFileSync(wrapper, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fs.readFileSync(file, "utf8")}</body></html>`);
    cleanup = () => fs.rmSync(wrapper, { force: true });
    await page.goto(pathToFileURL(wrapper).href);
  }
  await page.waitForSelector("#app:not([hidden])", { timeout: 10_000 });
  report(true, "Panel loads");
  try {
    await exercise(page, { garageTravelMs: target === "server" ? 400 : 4000, home });
  } catch (err) {
    report(false, "Run finished", err.message.split("\n")[0]);
  }
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
