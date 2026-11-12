// Stills of every look and beat: node shots.mjs <out_dir>
import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2];
const b = await pw.chromium.launch();
for (const look of ['day', 'signal', 'emerald', 'stage']) for (const beat of ['hook', 'approve']) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto(`file://${process.cwd()}/looks.html#look=${look}&beat=${beat}`, { waitUntil: 'load' });
  await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${look}-${beat}.png` }); await p.close();
}
await b.close();
