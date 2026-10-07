// Renders the film to MP4, frame by frame, from the built page
// (run scripts/build-film.mjs first):
//   dist/film/meridian-film.mp4   1280x720, 24 fps, H.264 + AAC
// FFMPEG=/path/to/ffmpeg if it isn't on PATH. FROM/TO (seconds) render a part. SPEED=1.7 renders
// that part at 1.7x pace, drawing every output frame (no dropped frames); the film's audio is left out then.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const FF = process.env.FFMPEG || "ffmpeg";
const W = 1280, H = 720, FPS = 24;
const FROM = +(process.env.FROM || 0), TO = +(process.env.TO || 92), SPEED = +(process.env.SPEED || 1);
const OUT = process.env.OUT || "dist/film/meridian-film.mp4";
const exe = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const browser = await chromium.launch({ executablePath: exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exitCode = 1; });
await page.goto(`file://${resolve("dist/film/meridian-film.html")}?render=1&w=${W}&h=${H}`);
await page.waitForFunction(() => window.filmReady, null, { timeout: 120000 });

const ff = spawn(FF, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  ...(SPEED === 1 ? ["-ss", String(FROM), "-t", String(TO - FROM), "-i", "dist/film/film-audio.wav"] : []),
  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  ...(SPEED === 1 ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : ["-an"]), OUT], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round((TO - FROM) / SPEED * FPS);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.filmFrame(t), FROM + (i / FPS) * SPEED);
  const jpg = await page.screenshot({ type: "jpeg", quality: 93, clip: { x: 0, y: 0, width: W, height: H } });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 120 === 0) console.log(`frame ${i}/${frames}  ${Math.round((Date.now() - t0) / 1000)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`${OUT} done in ${Math.round((Date.now() - t0) / 1000)}s`);
