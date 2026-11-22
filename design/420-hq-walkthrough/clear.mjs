import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { chromium } from "playwright";
const ROOT = process.cwd(); const MIME = { ".png":"image/png", ".woff2":"font/woff2", ".html":"text/html", ".js":"text/javascript" };
const server = http.createServer((q,r)=>{ let f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404).end(); return; } r.writeHead(200, {"Content-Type": MIME[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); });
await new Promise(r=>server.listen(0,r));
const base = "/opt/pw-browsers"; const dir = fs.readdirSync(base).filter(d=>/^chromium-\d+$/.test(d)).sort().pop();
const browser = await chromium.launch({ executablePath: path.join(base, dir, "chrome-linux64", "chrome"), args: ["--use-gl=angle","--use-angle=gl","--ignore-gpu-blocklist","--no-sandbox"], headless: false });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } }); page.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0,300))); page.on("console", m => { if (m.type()==="error"||m.type()==="warning") console.log("CONSOLE", m.type(), m.text().slice(0,200)); });
await page.goto(`http://127.0.0.1:${server.address().port}/v2.html?w=480&h=270`); await page.waitForFunction(() => window.__ok || window.__err); const err = await page.evaluate(() => window.__err); if (err) { console.log(err); process.exit(1); }
const out = await page.evaluate(() => __people.map((p, n) => { let best = [1e9, 0]; for (let t = 0; t <= 190; t += 0.1) { const c = __tour.pos(t); if (Math.abs(c[1] - 1.65 - p.y) > 1.6) continue; const d = Math.hypot(c[0] - p.x, c[2] - p.z); if (d < best[0]) best = [d, t]; } return [n, p.x, p.z, p.y, +best[0].toFixed(2), +best[1].toFixed(1)]; }));
out.forEach(r => console.log("figure", r[0], "at", r[1], r[2], "level", r[3] ? 2 : 1, "closest camera pass", r[4], "m at", r[5], "s", r[4] < 1.2 ? "  <-- TOO CLOSE" : ""));
await browser.close(); server.close();
