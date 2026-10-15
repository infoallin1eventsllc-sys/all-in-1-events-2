import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const dir = process.argv[2];
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
await p.goto('file://' + dir + '/poster2.html', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.screenshot({ path: dir + '/out2/meridian-promo-email-poster.jpg', type: 'jpeg', quality: 90 });
await b.close();
