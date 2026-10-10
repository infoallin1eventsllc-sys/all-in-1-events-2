import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: +process.argv[4], height: +process.argv[5] }, deviceScaleFactor: 2 });
await p.goto('file://' + process.argv[2]); await p.waitForTimeout(800); await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: process.argv[3] }); await b.close();
