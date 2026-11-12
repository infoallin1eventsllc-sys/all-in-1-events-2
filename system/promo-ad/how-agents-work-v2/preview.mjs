// Stills for checking: node preview.mjs <fmt> <look> <out_dir> t1 t2 ...
import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [fmt, look, out, ...ts] = process.argv.slice(2);
const SIZE = { '9x16': [1080, 1920], '4x5': [1080, 1350], '1x1': [1080, 1080], '16x9': [1920, 1080] }[fmt];
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: SIZE[0], height: SIZE[1] } });
await p.goto(`file://${process.cwd()}/scenes.html#fmt=${fmt}&look=${look}`, { waitUntil: 'load' });
await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(300);
for (const t of ts) { await p.evaluate((x) => window.render(x), +t); await p.screenshot({ path: `${out}/${look}-${fmt}-${t}.jpg`, type: 'jpeg', quality: 88 }); }
await b.close();
