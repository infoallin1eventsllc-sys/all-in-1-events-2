import { createRequire } from 'module';
import fs from 'node:fs';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [dir, name, w, h] = process.argv.slice(2);
const FPS = 30;
const out = `${dir}/cframes-${name}`; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('file://' + dir + '/ad.html?clear=1', { waitUntil: 'load' }); await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(800);
const dur = await p.evaluate(() => window.DURATION);
const n = Math.round(dur * FPS);
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => window.render(t), i / FPS);
  await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png`, omitBackground: true });
}
await b.close(); console.log(name, n, 'frames');
