#!/usr/bin/env node
// Loads every page in a real browser and asserts it actually renders.
//
// This is the net for the failure that hurts most: the page that returns 200,
// looks fine to a link checker, and is blank. Renaming one function in
// products.js once made every product page render nothing — `getProduct is not
// defined` in the console, HTTP 200 on the wire.
//
// Per page, at desktop and phone width:
//   · no console errors, no uncaught exceptions
//   · no same-origin request failing (404s on css/js/img)
//   · no horizontal scroll  (a nowrap element once pushed every page 11px wide)
//   · the page renders real text rather than an empty shell
//
//   node scripts/smoke.mjs
//
// External hosts are ignored on purpose — product photography is served from
// Supabase, which a sandbox or an offline laptop cannot reach. Their CSP
// coverage is check-refs.mjs's job, not this one.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- pages ---------- */
function firstProductId() {
  try {
    const src = fs.readFileSync(path.join(ROOT, "420-friendly/assets/products.js"), "utf8");
    return new Function(`${src}\nreturn CATALOG[0].id;`)();
  } catch { return null; }
}
const pid = firstProductId();

const PAGES = [
  "/index.html",
  "/420-friendly/index.html",
  "/420-friendly/shop.html",
  "/420-friendly/shop.html?cat=HOODIES",
  pid && `/420-friendly/product.html?id=${pid}`,
  "/420-friendly/cart.html",
  "/420-friendly/drops.html",
  "/420-friendly/playlist.html",
  "/420-friendly/favorites.html",
  "/420-friendly/contact.html",
  "/420-friendly/faq.html",
  "/420-friendly/shipping.html",
  "/420-friendly/sizing.html",
  "/420-friendly/returns.html",
  "/420-friendly/privacy.html",
  "/420-friendly/terms.html",
].filter(Boolean);

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
];

/* ---------- static server ---------- */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".mp4": "video/mp4",
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

/* ---------- the browser this sandbox actually has ---------- */
function browserExe() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().pop();
  const exe = dir && path.join(base, dir, "chrome-linux", "chrome");
  return exe && fs.existsSync(exe) ? exe : undefined;
}

/* ---------- run ---------- */
const failures = [];

await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ executablePath: browserExe() });
} catch {
  browser = await chromium.launch();   // a normal machine with its own download
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  console.log(`\n${vp.name}  ${vp.width}x${vp.height}`);

  for (const route of PAGES) {
    const page = await ctx.newPage();
    const errors = [];

    // A bare static server serves no Netlify functions, so the soundtrack feed
    // 404s here by design — the site is built to degrade when it does. Only
    // `netlify dev` can answer these, and failing on them would make this
    // script permanently red, which is the same as having no net at all.
    const expected = (url) => url.includes("/.netlify/functions/");

    page.on("console", (m) => {
      // Resource-load failures are reported properly, with a URL, by the
      // response and requestfailed handlers below. The console version carries
      // no URL to filter on, so it would flag every blocked external host.
      if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) {
        errors.push(`console: ${m.text()}`);
      }
    });
    page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
    page.on("requestfailed", (r) => {
      if (r.url().startsWith(origin) && !expected(r.url())) {
        errors.push(`request failed: ${r.url().replace(origin, "")}`);
      }
    });
    page.on("response", (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400 && !expected(r.url())) {
        errors.push(`HTTP ${r.status()}: ${r.url().replace(origin, "")}`);
      }
    });

    try {
      await page.goto(origin + route, { waitUntil: "load", timeout: 20000 });
      await page.waitForTimeout(450);          // let deferred chrome render

      const m = await page.evaluate(() => ({
        slip: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        text: (document.body.innerText || "").trim().length,
      }));
      if (m.slip > 1) errors.push(`scrolls sideways by ${m.slip}px`);
      if (m.text < 120) errors.push(`renders almost nothing (${m.text} chars of text)`);
    } catch (e) {
      errors.push(`did not load: ${e.message.split("\n")[0]}`);
    }

    const label = route.replace("/420-friendly/", "420/");
    if (errors.length) {
      failures.push({ vp: vp.name, route, errors });
      console.log(`  FAIL  ${label}`);
      for (const e of [...new Set(errors)].slice(0, 4)) console.log(`          ${e}`);
    } else {
      console.log(`  ok    ${label}`);
    }
    await page.close();
  }
  await ctx.close();
}

await browser.close();
server.close();

console.log(
  failures.length
    ? `\n${failures.length} page/viewport combination${failures.length === 1 ? "" : "s"} failed\n`
    : `\nall ${PAGES.length} pages render clean at both widths\n`
);
process.exit(failures.length ? 1 : 0);
