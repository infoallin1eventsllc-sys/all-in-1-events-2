import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process"; import { chromium } from "playwright";
const ROOT = process.cwd(); const MIME = { ".png":"image/png", ".woff2":"font/woff2", ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript" };
const server = http.createServer((q,r)=>{ let f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404).end(); return; } r.writeHead(200, {"Content-Type": MIME[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); });
await new Promise(r=>server.listen(0,r)); const url = `http://127.0.0.1:${server.address().port}/v2.html?w=1920&h=1080`;
const base = "/opt/pw-browsers"; const dir = fs.readdirSync(base).filter(d=>/^chromium-\d+$/.test(d)).sort().pop();
const browser = await chromium.launch({ executablePath: path.join(base, dir, "chrome-linux64", "chrome"), args: ["--use-gl=angle","--use-angle=gl","--ignore-gpu-blocklist","--no-sandbox"], headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(url); await page.waitForFunction(() => window.__ok || window.__err, null, { timeout: 90000 });
const err = await page.evaluate(() => window.__err); if (err) { console.log(err); process.exit(1); }
const info = await page.evaluate(() => ({ total: __tour.total, hold: __tour.hold, caps: __tour.capStarts }));
fs.writeFileSync("caps.json", JSON.stringify(info)); console.log(JSON.stringify(info));
const FPS = 30, ALL = Math.ceil((info.total + info.hold) * FPS);
const S = Number(process.argv[2]), E = Math.min(ALL, Number(process.argv[3])), OUT = process.argv[4], W = 60;
if (S === 0) { await page.evaluate(() => { __tour.video(); __tour.step(0); }); }
else { await page.evaluate(([t]) => { __tour.at(t); __tour.step(0); }, [S / FPS - W / FPS]);
  for (let k = 0; k < W - 1; k++) await page.evaluate((dt) => __tour.step(dt), 1 / FPS); }
const ff = spawn("ffmpeg", ["-y","-loglevel","error","-f","image2pipe","-framerate",String(FPS),"-c:v","mjpeg","-i","-","-c:v","libx264","-preset","medium","-crf","14","-pix_fmt","yuv420p",OUT], { stdio: ["pipe","inherit","inherit"] });
const t0 = Date.now();
for (let i = S; i < E; i++) {
  const first = S === 0 && i === 0;
  const b64 = await page.evaluate(([dt, first]) => { if (!first) __tour.step(dt); return document.getElementById("c").toDataURL("image/jpeg", 0.96).slice(23); }, [1 / FPS, first]);
  if (!ff.stdin.write(Buffer.from(b64, "base64"))) await new Promise(r => ff.stdin.once("drain", r));
  if ((i - S) % 300 === 0) console.log(`${OUT} frame ${i - S}/${E - S}  ${((Date.now()-t0)/1000).toFixed(0)}s`);
}
ff.stdin.end(); await new Promise(r => ff.on("close", r));
console.log(`${OUT} done ${E - S} frames in ${((Date.now()-t0)/1000).toFixed(0)}s`);
await browser.close(); server.close();
