import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const dir = process.argv[2];
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file://' + dir + '/overlays.html', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
for (const cls of ['lower', 'end']) { await p.evaluate((c) => document.body.className = c, cls); await p.screenshot({ path: `${dir}/ov-${cls}.png`, omitBackground: true }); }
await b.close(); console.log('ok');
