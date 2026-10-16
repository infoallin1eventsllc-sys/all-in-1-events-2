import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await ctx.route(u => !u.href.startsWith('http://localhost:4799'), r => r.abort());
const p = await ctx.newPage();
await p.goto('http://localhost:4799/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
for (let i = 0; i < 12; i++) { await p.screenshot({ path: `seq${String(i).padStart(2,'0')}.png`, clip: { x: 0, y: 0, width: 1920, height: 930 } }); await p.waitForTimeout(1500); }
await b.close();
