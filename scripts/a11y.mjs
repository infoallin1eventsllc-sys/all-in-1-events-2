#!/usr/bin/env node
// Accessibility sweep: axe-core over every customer-facing storefront page,
// at desktop and phone width.
//
// Not part of `npm test` — it takes a couple of minutes — but run it before
// a launch and after any change to the shared chrome, the colour tokens or
// a form. The first run found three things nothing else would have: a strip
// of links outside any landmark, a page whose headings jumped h1→h3, and a
// brand colour 0.13 short of AA contrast at label size.
//
//   npm run test:a11y
//
// Fails on any violation. Rules are WCAG 2.0/2.1 A and AA plus axe's
// best-practice set; "needs review" items are not counted.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pid = new Function(
  fs.readFileSync(path.join(ROOT, "420-friendly/assets/products.js"), "utf8") + "\nreturn CATALOG[0].id;"
)();

// Customer-facing only: the owner tools render a passcode gate to the sweep.
const PAGES = [
  "index", "shop", `product.html?id=${pid}`, "cart", "checkout", "drops", "playlist",
  "favorites", "contact", "faq", "shipping", "sizing", "returns", "privacy", "terms",
  "members", "404",
].map((p) => "/420-friendly/" + (p.includes(".html") ? p : p + ".html"));

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

/* ---------- static server and browser, as smoke.mjs ---------- */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".mp4": "video/mp4", ".woff2": "font/woff2",
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
function browserExe() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().pop();
  const exe = dir && path.join(base, dir, "chrome-linux", "chrome");
  return exe && fs.existsSync(exe) ? exe : undefined;
}

await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try { browser = await chromium.launch({ executablePath: browserExe() }); }
catch { browser = await chromium.launch(); }

const axeSource = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

/* ---------- run ---------- */
const failures = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  console.log(`\n${vp.name}  ${vp.width}x${vp.height}`);
  for (const route of PAGES) {
    const page = await ctx.newPage();
    await page.goto(origin + route, { waitUntil: "networkidle" });
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
      });
      return r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
        sample: v.nodes[0] && v.nodes[0].target.join(" "),
        fix: v.nodes[0] && String(v.nodes[0].failureSummary || "").split("\n").slice(1, 2).join(""),
      }));
    });
    const label = route.replace("/420-friendly/", "420/");
    if (violations.length) {
      console.log(`  FAIL  ${label}`);
      for (const v of violations) {
        console.log(`          ${v.impact.padEnd(8)} ${v.id} ×${v.count}  ${v.help}`);
        console.log(`          ${" ".repeat(8)} e.g. ${v.sample}${v.fix ? " — " + v.fix.trim() : ""}`);
      }
      failures.push(...violations.map((v) => `${vp.name} ${label} ${v.id}`));
    } else {
      console.log(`  ok    ${label}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
server.close();

if (!failures.length) {
  console.log(`\nno accessibility violations on ${PAGES.length} pages at both widths\n`);
  process.exit(0);
}
console.log(`\n${failures.length} violation${failures.length === 1 ? "" : "s"}\n`);
process.exit(1);
