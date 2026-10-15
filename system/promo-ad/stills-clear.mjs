import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [dir, name, w, h, times] = process.argv.slice(2);
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('file://' + dir + '/ad.html?clear=1', { waitUntil: 'load' }); await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(600);
for (const t of times.split(',')) { await p.evaluate((t) => window.render(t), +t); await p.screenshot({ path: `${dir}/bgprev/${name}-${t}.png`, omitBackground: true }); }
await b.close();
