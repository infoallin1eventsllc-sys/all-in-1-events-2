// Screenshot built cards at iPhone size and check small phones for sideways scroll.
//   node shoot.mjs <base-url> <out-dir> <path> [<path> ...]
// e.g. node shoot.mjs http://127.0.0.1:4811 /tmp/shots card-ribbon-1 card-tower-3
// Serve the folder first (python3 -m http.server). Finds Playwright in the cloud
// sandbox; elsewhere set PLAYWRIGHT_PATH.
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const [base, out, ...paths] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let bad = 0;
for (const k of paths) {
  const p = await ctx.newPage(); const errs = [];
  p.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  await p.goto(`${base}/${k}/`, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/${k.replace(/\//g, '_')}.png` });
  const over = [];
  for (const [w, h] of [[390, 844], [375, 667], [320, 568]]) {
    await p.setViewportSize({ width: w, height: h });
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) over.push(w);
  }
  const ok = !over.length && !errs.length; if (!ok) bad++;
  console.log(ok ? 'ok  ' : 'FAIL', k, over.length ? 'sideways scroll at ' + over.join(',') : '', errs.join(' '));
  await p.close();
}
await b.close(); process.exit(bad ? 1 : 0);
