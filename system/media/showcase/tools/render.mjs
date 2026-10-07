import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node22/lib/node_modules/playwright');
const [,, url, out, fpsS, secsS] = process.argv;
const fps = +fpsS, n = Math.round(+secsS * fps);
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => window.renderAt(t), i / fps);
  await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
  if (i % 48 === 0) console.log(`frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('done', n, 'errors', errs);
await b.close();
