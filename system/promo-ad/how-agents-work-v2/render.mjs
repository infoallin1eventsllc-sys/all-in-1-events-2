// Renders scenes.html (or end.html) to numbered frames at 30 fps.
//   node render.mjs <fmt> <out_dir> <look>   main film, JPEG, native size for that shape
//   node render.mjs end <out_dir>            end-card text layer, transparent PNG, 1080x1920
import { createRequire } from 'module';
import fs from 'node:fs';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [fmt, out, look = 'day'] = process.argv.slice(2);
const FPS = 30, end = fmt === 'end';
const SIZE = { '9x16': [1080, 1920], '4x5': [1080, 1350], '1x1': [1080, 1080], '16x9': [1920, 1080], end: [1080, 1920] }[fmt];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: SIZE[0], height: SIZE[1] } });
await p.goto(`file://${process.cwd()}/${end ? 'end.html' : `scenes.html#fmt=${fmt}&look=${look}`}`, { waitUntil: 'load' });
await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(400);
const n = Math.round((await p.evaluate(() => window.DURATION)) * FPS);
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => window.render(t), i / FPS);
  const path = `${out}/${String(i + 1).padStart(4, '0')}.${end ? 'png' : 'jpg'}`;
  await p.screenshot(end ? { path, omitBackground: true } : { path, type: 'jpeg', quality: 95 });
}
await b.close(); console.log(look, fmt, n, 'frames');
