// Renders scenes.html to numbered JPEG frames, and the contact bar alone as a
// transparent PNG for laying over the film part.
//   node render.mjs <work_dir> <name> <width> <height>
// <work_dir> must hold scenes.html, fonts/ and img/mark.png (build.sh sets it up).
import { createRequire } from 'module';
import fs from 'node:fs';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [dir, name, w, h] = process.argv.slice(2);
const FPS = 24;
const out = `${dir}/frames-${name}`;
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });

await p.goto(`file://${dir}/scenes.html?foot=1`, { waitUntil: 'load' });
await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(500);
await p.screenshot({ path: `${dir}/foot-${name}.png`, omitBackground: true });

await p.goto(`file://${dir}/scenes.html`, { waitUntil: 'load' });
await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(500);
const n = Math.round((await p.evaluate(() => window.DURATION)) * FPS);
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => window.render(t), i / FPS);
  await p.screenshot({ path: `${out}/${String(i + 1).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
}
await b.close(); console.log(name, n, 'frames');
