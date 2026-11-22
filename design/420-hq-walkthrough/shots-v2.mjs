import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { chromium } from "playwright";
const ROOT = process.cwd(); const MIME = { ".png":"image/png", ".woff2":"font/woff2", ".html":"text/html", ".js":"text/javascript" };
const server = http.createServer((q,r)=>{ let f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404).end(); return; } r.writeHead(200, {"Content-Type": MIME[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); });
await new Promise(r=>server.listen(0,r));
const base = "/opt/pw-browsers"; const dir = fs.readdirSync(base).filter(d=>/^chromium-\d+$/.test(d)).sort().pop();
const browser = await chromium.launch({ executablePath: path.join(base, dir, "chrome-linux64", "chrome"), args: ["--use-gl=angle","--use-angle=gl","--ignore-gpu-blocklist","--no-sandbox"], headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); page.on("pageerror", e => console.log("pageerror", String(e).slice(0,400)));
await page.goto(`http://127.0.0.1:${server.address().port}/v2.html?w=1920&h=1080${process.env.NOAO ? "&noao=1" : ""}`); await page.waitForFunction(() => window.__ok || window.__err, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__err); if (err) { console.log(err); process.exit(1); }
const shots = JSON.parse(process.argv[2]); fs.mkdirSync("merchshots", { recursive: true });
for (const [name, ...c] of shots) { const b64 = await page.evaluate((c) => { if (c[0] === 't') { __tour.view(c[1]); } else { __tour.shot(...c); __tour.shot(...c); } return document.getElementById("c").toDataURL("image/jpeg", 0.93).slice(23); }, c); fs.writeFileSync(`merchshots/${name}.jpg`, Buffer.from(b64, "base64")); console.log("shot", name); }
await browser.close(); server.close();
