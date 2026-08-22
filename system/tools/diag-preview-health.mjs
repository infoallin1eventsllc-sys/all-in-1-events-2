import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file://' + (process.env.OUT || '/tmp/meridian-site-preview.html'));
await pg.waitForTimeout(1500);

// Footer -> Studio login
await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await pg.waitForTimeout(400);
const login = pg.locator('#root').getByRole('button', { name: /studio login/i }).or(pg.locator('#root').getByText(/studio login/i)).first();
await login.click();
await pg.waitForTimeout(600);
await pg.locator('input[type="password"]').first().fill('anything');
console.log('buttons:', JSON.stringify(await pg.$$eval('button', bs => bs.map(b => b.innerText.trim()).filter(Boolean))));
await pg.locator('form').first().evaluate(f => f.requestSubmit ? f.requestSubmit() : f.submit());
await pg.waitForTimeout(1500);

const tab = pg.getByRole('button', { name: /system health/i }).first();
console.log('tab visible:', await tab.isVisible());
await tab.click();
await pg.waitForTimeout(1500);

const txt = await pg.locator('body').innerText();
for (const probe of ['Key Router', 'not been deployed', 'Nothing is broken', 'runner', 'healthcheck', 'Schedule', '*/2 * * * *', 'Demo mode']) {
  console.log(`  ${probe.padEnd(22)} ${txt.toLowerCase().includes(probe.toLowerCase()) ? 'yes' : 'NO'}`);
}
// Icon ligature check: any glyph painted as its own name is wider than it should be.
const wide = await pg.$$eval('.material-symbols-outlined', els =>
  els.map(e => ({ t: e.textContent, w: e.getBoundingClientRect().width, f: parseFloat(getComputedStyle(e).fontSize) }))
     .filter(o => o.w > o.f * 2.2));
console.log('broken icons:', wide.length ? JSON.stringify(wide) : 'none');
console.log('page errors:', errs.length ? errs : 'none');
await pg.screenshot({ path: process.env.SHOT || '/tmp/preview-health.png', fullPage: false });
await pg.setViewportSize({ width: 390, height: 900 });
await pg.waitForTimeout(500);
console.log('h-scroll at 390px:', await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
await b.close();
