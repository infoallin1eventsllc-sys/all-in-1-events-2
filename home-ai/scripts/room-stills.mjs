// Renders each room of the film's house twice, as structure and as a furnished,
// lit home, for the sites' before/after section: dist/site/stills/<room>-{before,after}.jpg
// Run after build:film. FFMPEG isn't needed; Chromium is (SwiftShader flags as in e2e).
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { HOME } from "../film/film.js";

const OUT = "dist/site/stills"; mkdirSync(OUT, { recursive: true });
const ELEV = { ground: 0, upper: 3.2 };
const W = 1200, H = 900;
const exe = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`file://${resolve("dist/film/meridian-film.html")}?render=1&w=${W}&h=${H}`);
await page.waitForFunction(() => window.filmReady, null, { timeout: 120000 });
for (const r of HOME.rooms) {
  const [x, z, w, d] = r.plan, y = ELEV[r.floor || "ground"];
  const c = [x + w / 2, y + 1.2, z + d / 2], span = Math.max(w, d);
  // From the front-right, high enough to see over the walls, close enough to fill the frame.
  const view = { pos: [c[0] + span * 0.9, y + 3.6 + span * 0.55, c[2] + span * 1.15], tgt: c, fov: 42, gain: 0 };
  for (const [name, t] of [["before", 23.6], ["after", 48.5]]) {
    await page.evaluate(([t, v]) => window.filmRoom(t, v), [t, view]);
    await page.screenshot({ path: `${OUT}/${r.id}-${name}.jpg`, type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: W, height: H } });
  }
  console.log(r.id);
}
await browser.close();
