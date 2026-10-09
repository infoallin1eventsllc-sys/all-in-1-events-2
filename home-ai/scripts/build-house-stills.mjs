// Renders this home in the realistic 3D look, by day and by evening, for panels that can't
// draw 3D: web/house-stills/index.js holds both pictures (as data URIs, so the one-file demo
// carries them) and where each room's tag sits on them. Run after build:demo, and again
// whenever the home's plan changes (the panel ignores pictures of a different home).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const executablePath = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const tmp = mkdtempSync(path.join(tmpdir(), "stills-"));
const out = {};
for (const [mood, finish] of [["day", "grounded"], ["evening", "futuristic"]]) {
  const file = `dist/demo/haven-${finish}.html`;
  if (!existsSync(file)) throw new Error(`${file} missing: run npm run build:demo first`);
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem("haven.holoMotion", "still"); } catch {} });
  await page.goto(`${pathToFileURL(path.resolve(file)).href}#signature`);
  await page.waitForSelector("#map.holo-ready", { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#map").__holo.opts.onExpand());
  await page.waitForSelector("#explorer-map.holo-ready", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const sig = await page.evaluate(() => document.querySelector("#explorer-map").dataset.homeSig);
  const m = await page.evaluate(() => document.querySelector("#explorer-map").dataset.mood);
  if (m !== mood) throw new Error(`${finish}: expected the ${mood} mood, got ${m}`);
  // Where each room's tag points, as a fraction of the picture.
  const rooms = await page.evaluate(() => {
    const box = document.querySelector("#explorer-map .holo-canvas").getBoundingClientRect(), at = {};
    for (const t of document.querySelectorAll("#explorer-map .holo-tag.map-room")) {
      const mt = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t.style.transform);
      if (mt && !t.classList.contains("off")) at[t.dataset.room] = [+(mt[1] / box.width).toFixed(4), +(mt[2] / box.height).toFixed(4)];
    }
    return at;
  });
  await page.addStyleTag({ content: "#explorer-map .holo-tags, #explorer-map .map-zoom, #explorer-map .holo-note, .explorer-views, .explorer-floors { visibility: hidden !important; }" });
  await page.waitForTimeout(300);
  const png = path.join(tmp, `${mood}.png`), webp = path.join(tmp, `${mood}.webp`);
  await page.locator("#explorer-map .holo-canvas").screenshot({ path: png });
  execFileSync("python3", ["-c", "import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert('RGB')\nim.save(sys.argv[2], 'WEBP', quality=82, method=6)\nprint(im.width, im.height)", png, webp]);
  // The picture's own edge color, so the space around it (when the box is a different shape) matches.
  const bg = execFileSync("python3", ["-c", "import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert('RGB')\nw, h = im.size\npx = [im.getpixel((x, y)) for x in (2, w // 2, w - 3) for y in (2, h - 3)]\nprint('#%02x%02x%02x' % tuple(sum(p[i] for p in px) // len(px) for i in range(3)))", png]).toString().trim();
  const [w, h] = execFileSync("python3", ["-c", "import sys\nfrom PIL import Image\nprint(*Image.open(sys.argv[1]).size)", webp]).toString().trim().split(" ").map(Number);
  out[mood] = { src: `data:image/webp;base64,${readFileSync(webp).toString("base64")}`, w, h, bg, rooms };
  out.sig = sig;
  console.log(`${mood}: ${w}x${h}, ${(readFileSync(webp).length / 1024).toFixed(0)} KB, rooms ${Object.keys(rooms).join(", ")}`);
  await ctx.close();
}
await browser.close();
writeFileSync("web/house-stills/index.js", `// Pictures of this home in the realistic 3D look, for panels that can't draw 3D.
// Written by \`npm run build:house-stills\` (after build:demo); used only for the home whose
// signature matches (building.js homeSignature).
export const HOUSE_STILLS = ${JSON.stringify(out)};
`);
console.log("web/house-stills/index.js");
