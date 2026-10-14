import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const dir = process.argv[2];
const b = await pw.chromium.launch();
const FORMATS = { square: [1080, 1080], vertical: [1080, 1920], wide: [1920, 1080] };
const TIMES = (process.argv[3] || '1.4,2.4,4.6,6.9,9.2,11.5,13.5,15.9,20').split(',').map(Number);
for (const [name, [w, h]] of Object.entries(FORMATS)) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('file://' + dir + '/ad.html', { waitUntil: 'load' });
  await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(800);
  for (const t of TIMES) { await p.evaluate((t) => window.render(t), t); await p.screenshot({ path: `${dir}/mock/${name}-${String(t).padStart(4, '0')}.png` }); }
  await p.close();
}
await b.close(); console.log('done');
