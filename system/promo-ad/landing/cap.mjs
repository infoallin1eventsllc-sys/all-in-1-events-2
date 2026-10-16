import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const b = await chromium.launch();
const shots = [
  ['desktop', { width: 1920, height: 1080 }, 2, false],
  ['phone', { width: 430, height: 932 }, 3, true],
];
for (const [n, vp, dpr, mobile] of shots) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  // Block outside calls (analytics, image overrides): the bundled pictures are the real ones.
  await ctx.route(u => !u.href.startsWith('http://localhost:4799'), r => r.abort());
  const p = await ctx.newPage();
  await p.goto('http://localhost:4799/', { waitUntil: 'load' });
  await p.waitForTimeout(6000);   // let the hero film reach a full frame
  await p.screenshot({ path: `${n}.png` });
  await ctx.close();
}
await b.close();
