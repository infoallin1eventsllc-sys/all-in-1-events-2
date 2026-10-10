// Builds the Screen Library catalog: one page showing every Haven screen,
// captured live from the demo build, for a client to choose from. Each screen
// has its own look; Wallpaper also comes in the three finishes.
//
//   npm run build:demo && npm run build:catalog
//   -> dist/catalog/haven-screen-library.html (self-contained, images inline)
//
// Set DEMO_URL_GROUNDED / DEMO_URL_FUTURISTIC to link each screen to a live
// published demo (the screen id is added as #anchor).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const demoDir = path.join(root, "dist/demo");
const out = path.join(root, "dist/catalog");
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, "shots"), { recursive: true, force: true }); // only this build's pictures
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const LIVE = {
  grounded: process.env.DEMO_URL_GROUNDED || "",
  futuristic: process.env.DEMO_URL_FUTURISTIC || "",
  vivid: process.env.DEMO_URL_VIVID || "",
};
// Each finish as shown in the pictures: the demo build it comes from and
// the device appearance it's captured in.
const FINISHES = [
  { key: "grounded", label: "Grounded", look: "grounded", scheme: "light" },
  { key: "futuristic", label: "Futuristic", look: "futuristic", scheme: "dark" },
  { key: "vivid", label: "Vivid light", look: "vivid", scheme: "light" },
  { key: "vivid-dark", label: "Vivid dark", look: "vivid", scheme: "dark" },
];

const SCREENS = [
  { id: "command", name: "Command", best: "Great room or main entry", about: "The flagship. Tabs across the top, a rail at the side, and tiles for everything: scenes, security, the weather, a thermostat dial, the house in 3D, big light tiles and the cameras.", has: ["Home, Lights, Climate, Security and Cameras tabs, all live", "Scene buttons that say what each scene does", "The house in 3D (or a photoreal render): tap a room for its lights", "A thermostat dial with + and −, and the mode", "Light tiles that glow as bright as the light is set"] },
  { id: "wallpaper", name: "Wallpaper", best: "A feature wall or large display", about: "The home's own photo behind frosted tiles. The photo changes with the time of day, or the homeowner can use a picture of their own house. The one screen that comes in all three finishes.", has: ["Photo backdrop: morning, day, evening and night", "Weather now, the next hours and days (when connected)", "Indoor temperature, humidity and electricity with a live line", "Every light with an icon switch and a pill dimmer", "Grounded, Futuristic, or Vivid in light and dark"] },
  { id: "glass", name: "Glass", best: "Living room, where people talk to Haven; the model-home showpiece", about: "Black glass with a thermostat dial at the side. Haven's voice line runs along the bottom: tap it and talk, and its agents light up as they work, together.", has: ["A big clock, the weather and the security mode", "Haven's latest updates, with Brief me", "Scene cards with photoreal pictures of the home", "A dial for the room's lights, and the doors", "Lighting, Climate, Security and Energy agents"] },
  { id: "wall", name: "Everything Wall", best: "Office or a large wall display", about: "Everything at once for the person who runs the house.", has: ["A strip of the numbers: inside, outside, humidity, power, today, water", "Every camera, door, lock and outside switch", "Each room with its lights as bars, motion and leaks", "Gauges and today's running total of electricity"] },
  { id: "evening", name: "Good Evening", best: "Kitchen", about: "A friendly greeting with the weather, then climate and the water heater, the forecast, scenes, a card for every room and the cameras with their lights.", has: ["Today's briefing, with Brief me now", "Climate or the water heater, one tap apart", "The forecast as temperature bars", "A card per room with round one-tap buttons", "Each camera with its own light underneath"] },
  { id: "aurora", name: "Aurora", best: "Bedroom", about: "Soft color that dims at night. Bedtime is one tap away, and whoever sleeps there can put their own photo behind it.", has: ["Goodnight, Lights off, Warmer, Cooler, Good morning", "This bedroom's lights and fan", "The thermostat, the weather and the security mode", "Today's electricity and the humidity", "Each bedroom's own photo, kept on that room's panel"] },
  { id: "console", name: "Security Console", best: "Mudroom or garage door", about: "The alarm-panel view, built for the moment you walk in or out.", has: ["I'm leaving, I'm home, Lock up", "Every door, lock, motion and leak sensor, in words", "The cameras, with the saved pictures", "The thermostat and water heater dials", "The house, today's updates, and what's still on"] },
  { id: "classic", name: "Portrait Classic", best: "Hallway, on a tall portrait screen", about: "The classic dashboard in sections, made to read top to bottom.", has: ["Today: the time and Haven's latest", "Climate: the forecast and a thermostat dial", "Every light and fan as a one-tap button", "Home at a glance, the cameras, security and scenes"] },
  { id: "neon", name: "Neon Frame", best: "Media room or office, in a dark room", about: "Glowing outlines on black. Electricity flows into the house on screen while it's being used.", has: ["Doors and locks with their state in words", "Electricity flowing from the grid, and the top user", "Today's running total", "The cameras, climate, and every light and fan on a switch"] },
  { id: "lagoon", name: "Lagoon", best: "Family room or guest suite", about: "Deep blue, with the house itself in the middle and Home and Away one tap away.", has: ["The weather with temperature bars", "The house in 3D, every room a button", "Home and Away cards with pictures of the home", "Choose Haven's voice right on the panel", "Who's home, security, the front door and the water"] },
];

async function capture(browser, finish, id) {
  const wrapper = path.join(demoDir, `_catalog-${finish.key}.html`);
  fs.writeFileSync(wrapper, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fs.readFileSync(path.join(demoDir, `haven-${finish.look}.html`), "utf8")}</body></html>`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: finish.scheme });
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem("haven.holoMotion", "still"); } catch {} });
  await page.goto(`file://${wrapper}#${id}`);
  await page.waitForSelector("#app:not([hidden])");
  // Let the hologram load and draw its first frame.
  await page.waitForFunction(() => !document.querySelector(".map.holo:not(.holo-ready)"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const jpg = await page.screenshot({ type: "jpeg", quality: 84 }); // 2880x1800: crisp on any screen
  // The website (scripts/build-website.mjs) shows the same pictures as files.
  fs.mkdirSync(path.join(out, "shots"), { recursive: true });
  fs.writeFileSync(path.join(out, "shots", id === "wallpaper" ? `${finish.key}-${id}.jpg` : `${id}.jpg`), jpg);
  await page.close();
  fs.rmSync(wrapper, { force: true });
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

// Software WebGL, so the hologram renders in headless Chromium.
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const shots = {};
for (const s of SCREENS) {
  if (s.id === "wallpaper") for (const f of FINISHES) shots[`${f.key}/${s.id}`] = await capture(browser, f, s.id);
  else shots[s.id] = await capture(browser, FINISHES[0], s.id);
}
await browser.close();

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const card = (s, i) => `
<article class="screen" id="${s.id}">
  <figure class="shot${s.id === "wallpaper" ? " by-finish" : ""}">
    ${s.id === "wallpaper"
      ? FINISHES.map((f, k) => `<img class="img-${f.key}" src="${shots[`${f.key}/${s.id}`]}" alt="${esc(s.name)} screen in the ${f.label} finish" loading="${k === 0 ? "eager" : "lazy"}" width="1440" height="900">`).join("\n    ")
      : `<img src="${shots[s.id]}" alt="The ${esc(s.name)} screen" loading="${i < 2 ? "eager" : "lazy"}" width="1440" height="900">`}
  </figure>
  <div class="about">
    <h2>${esc(s.name)}</h2>
    <p class="best">Best for: ${esc(s.best)}</p>
    <p class="lede">${esc(s.about)}</p>
    <ul>${s.has.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    ${s.id === "wallpaper" ? `<div class="finish" role="group" aria-label="Finish shown in the picture">
      ${FINISHES.map((f, k) => `<button type="button" data-finish="${f.key}" aria-pressed="${k === 0}">${f.label}</button>`).join("\n      ")}
    </div>` : ""}
    ${Object.values(LIVE).some(Boolean) ? `<p class="links">${(s.id === "wallpaper" ? [["grounded", "Grounded"], ["futuristic", "Futuristic"], ["vivid", "Vivid"]] : [["grounded", ""]]).filter(([k]) => LIVE[k]).map(([k, l]) => `<a href="${LIVE[k]}#${s.id}">Open live${l ? ` · ${l}` : ""}</a>`).join("")}</p>` : ""}
  </div>
</article>`;

const html = `<meta charset="utf-8">
<title>Haven Screen Library</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
<style>
:root {
  --bg: #f1ede6; --surface: #fbf9f5; --ink: #2a241e; --muted: #6e6459; --line: #ddd4c7; --accent: #6b4a2f; --accent-ink: #fbf9f5;
  --font: "Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #15110d; --surface: #211b16; --ink: #f1ebe2; --muted: #a89c8e; --line: #3a3129; --accent: #c9a27a; --accent-ink: #1a140f; color-scheme: dark; }
}
:root[data-theme="dark"] { --bg: #15110d; --surface: #211b16; --ink: #f1ebe2; --muted: #a89c8e; --line: #3a3129; --accent: #c9a27a; --accent-ink: #1a140f; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 var(--font); padding-inline: 16px; }
.wrap { max-width: 1180px; margin: 0 auto; padding-block: 40px 64px; display: grid; gap: 28px; }
header.top { display: grid; gap: 14px; }
.kicker { font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0; }
h1 { font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.05; letter-spacing: -0.02em; margin: 0; text-wrap: balance; }
.intro { max-width: 68ch; color: var(--muted); margin: 0; font-size: 1.05rem; }
.controls { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; }
.finish { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); }
.finish button { font: inherit; font-size: 0.9rem; border: 0; background: transparent; color: var(--muted); padding: 8px 16px; border-radius: 999px; cursor: pointer; min-height: 40px; }
.finish button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.finish button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
nav.jump { display: flex; flex-wrap: wrap; gap: 8px; }
nav.jump a { color: var(--ink); text-decoration: none; font-size: 0.9rem; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); }
.screen { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 24px; align-items: center; padding: 18px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); scroll-margin-top: 16px; }
@media (max-width: 860px) { .screen { grid-template-columns: 1fr; } }
.shot { margin: 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); aspect-ratio: 16 / 10; background: #0b0b0e; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; max-width: 100%; }
.shot.by-finish img { display: none; }
${FINISHES.map((f) => `body[data-finish="${f.key}"] .by-finish .img-${f.key}`).join(", ")} { display: block; }
.about .finish { justify-self: start; margin-top: 6px; }
.about { display: grid; gap: 8px; }
.about h2 { margin: 0; font-size: 1.7rem; letter-spacing: -0.01em; }
.best { margin: 0; font-weight: 600; color: var(--accent); }
.lede { margin: 0; }
.about ul { margin: 4px 0 0; padding-left: 1.1em; color: var(--muted); display: grid; gap: 4px; }
.links { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 0; }
.links a { color: var(--accent); font-weight: 600; }
section.plan, section.note { padding: 22px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); display: grid; gap: 12px; }
section h2.sec { margin: 0; font-size: 1.3rem; }
.table-wrap { overflow-x: auto; }
.table-wrap:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
table { border-collapse: collapse; width: 100%; min-width: 520px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); }
th { font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
/* Phones: each row becomes a short stacked entry instead of a table that scrolls sideways. */
@media (max-width: 560px) {
  table { min-width: 0; }
  thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  tr { display: block; padding: 10px 0; border-bottom: 1px solid var(--line); }
  td { display: grid; grid-template-columns: 5.5em 1fr; gap: 12px; padding: 3px 0; border: 0; }
  td::before { content: attr(data-label); font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding-top: 0.2em; }
}
.note p { margin: 0; color: var(--muted); max-width: 72ch; }
footer { color: var(--muted); font-size: 0.85rem; }
/* Scroll reveal: cards rise into place as they come into view. Only when
   scripts run (html.reveal) and the viewer hasn't asked for less motion;
   otherwise everything is simply visible. */
@media (prefers-reduced-motion: no-preference) {
  html.reveal .screen, html.reveal section.plan, html.reveal section.note { opacity: 0; transform: translateY(28px); transition: opacity 0.7s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1); }
  html.reveal .screen .shot { transform: scale(0.97); transition: transform 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) 0.08s; }
  html.reveal .screen .about > * { opacity: 0; transform: translateY(10px); transition: opacity 0.5s ease, transform 0.5s ease; }
  html.reveal .is-in { opacity: 1 !important; transform: none !important; }
  html.reveal .is-in .shot { transform: none; }
  html.reveal .is-in .about > * { opacity: 1; transform: none; }
  html.reveal .is-in .about > :nth-child(2) { transition-delay: 0.08s; }
  html.reveal .is-in .about > :nth-child(3) { transition-delay: 0.16s; }
  html.reveal .is-in .about > :nth-child(4) { transition-delay: 0.24s; }
  html.reveal .is-in .about > :nth-child(5) { transition-delay: 0.32s; }
}
</style>
<div class="wrap">
  <header class="top">
    <p class="kicker">Haven · Screen library</p>
    <h1>Choose a screen for every room</h1>
    <p class="intro">Ten screens, each designed for a different spot in the home and each with a look of its own. All of them run on the same live house, talk and listen, and learn the homeowner's preferences. Wallpaper also comes in three finishes. Each panel in the home can use a different screen, and All controls (every device, room by room) opens from any of them.</p>
    <div class="controls">
      <nav class="jump" aria-label="Screens">${SCREENS.map((s) => `<a href="#${s.id}">${esc(s.name)}</a>`).join("")}</nav>
    </div>
  </header>
  ${SCREENS.map(card).join("")}
  <section class="plan" aria-labelledby="plan-h">
    <h2 class="sec" id="plan-h">A typical home</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-label="A typical home, room by room"><table>
      <thead><tr><th scope="col">Where</th><th scope="col">Screen</th><th scope="col">Why</th></tr></thead>
      <tbody>
        <tr><td data-label="Where">Great room</td><td data-label="Screen">Command</td><td data-label="Why">The showpiece: the house in 3D, every system a tab away</td></tr>
        <tr><td data-label="Where">Model home, living room</td><td data-label="Screen">Glass</td><td data-label="Why">Shows the intelligence working: tap the voice line, watch the agents coordinate</td></tr>
        <tr><td data-label="Where">Kitchen</td><td data-label="Screen">Good Evening</td><td data-label="Why">Everyone uses it: the greeting, the forecast, scenes and every room</td></tr>
        <tr><td data-label="Where">Primary bedroom</td><td data-label="Screen">Aurora</td><td data-label="Why">Dims at night; bedtime in one tap or by voice; each person's own photo</td></tr>
        <tr><td data-label="Where">Mudroom or garage door</td><td data-label="Screen">Security Console</td><td data-label="Why">Leave or arrive in one tap; nothing left on or unlocked</td></tr>
        <tr><td data-label="Where">Office</td><td data-label="Screen">Everything Wall</td><td data-label="Why">Every system on one wall for whoever runs the house</td></tr>
        <tr><td data-label="Where">Feature wall</td><td data-label="Screen">Wallpaper</td><td data-label="Why">Looks like a photo of the home until you need it</td></tr>
      </tbody>
    </table></div>
  </section>
  <section class="note" aria-labelledby="builder-h">
    <h2 class="sec" id="builder-h">For builders: the model home</h2>
    <p>Haven is designed to be a standard feature in new construction. On a model-home panel, turn on <strong>Model home showcase</strong> (Screens, on the panel): when nobody has touched it for a minute, Haven gives a short live tour on the Glass screen. It runs Welcome home, Movie night, Goodnight and Good morning on the real lights, locks and thermostat, and says what it's doing, so visitors watch the agents work together. Any touch hands control back, and it pauses if anything needs attention. The agent row shows only what the house is really doing; nothing on it is animated for show.</p>
  </section>
  <section class="note" aria-labelledby="note-h">
    <h2 class="sec" id="note-h">Coming with integrations</h2>
    <p>Weather is now built in: it comes from the home's Home Assistant weather or from Open-Meteo once the installer adds the home's location, and the screens say so plainly when it isn't connected. The demo shows sample weather, labeled as a sample. Cameras come from the home's Home Assistant; the demo has none, so its camera tiles show four stills from the film of the model home, each marked "Sample picture". Family calendars and package tracking will be added as cards once each is connected to a real source, so a screen never shows made-up information. The pictures here are the live demo house, captured as built. The Wallpaper screen's photos were generated for the demo; a homeowner can replace them with a photo of their own home.</p>
  </section>
  <footer>Screens shown with simulated devices. Each installed panel can be set to its own screen and room from Screens on the panel.</footer>
</div>
<script>
(function () {
  if (!("IntersectionObserver" in window) || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
  var targets = document.querySelectorAll(".screen, section.plan, section.note");
  document.documentElement.classList.add("reveal");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  // Anything scrolled past (End key, a link) or printed shows too; nothing stays hidden above you.
  function showPassed() { document.querySelectorAll(".screen:not(.is-in), section.plan:not(.is-in), section.note:not(.is-in)").forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight * 0.92) el.classList.add("is-in"); }); }
  addEventListener("scroll", function () { clearTimeout(showPassed.t); showPassed.t = setTimeout(showPassed, 120); }, { passive: true });
  addEventListener("beforeprint", function () { document.documentElement.classList.remove("reveal"); });
  targets.forEach(function (t) { io.observe(t); });
  // Anything already on screen, or jumped to by a link, shows at once.
  addEventListener("hashchange", function () { var t = document.querySelector(location.hash); if (t) t.classList.add("is-in"); });
  if (location.hash) { var t0 = document.querySelector(location.hash); if (t0) t0.classList.add("is-in"); }
})();
(function () {
  var body = document.body;
  function set(f) {
    body.setAttribute("data-finish", f);
    document.querySelectorAll(".finish button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.finish === f)); });
    try { localStorage.setItem("haven.catalog.finish", f); } catch (e) {}
  }
  var saved = null;
  try { saved = localStorage.getItem("haven.catalog.finish"); } catch (e) {}
  set(${JSON.stringify(FINISHES.map((f) => f.key))}.indexOf(saved) >= 0 ? saved : "grounded"); // the Wallpaper card's finish
  document.querySelectorAll(".finish button").forEach(function (b) { b.addEventListener("click", function () { set(b.dataset.finish); }); });
})();
</script>
`;
fs.writeFileSync(path.join(out, "haven-screen-library.html"), html);
console.log(`dist/catalog/haven-screen-library.html  ${(html.length / 1024 / 1024).toFixed(1)} MB`);
