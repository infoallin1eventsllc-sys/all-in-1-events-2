import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node22/lib/node_modules/playwright');
const [,, base, out] = process.argv;
const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
// [name, path, width, height, waitMs, action]
const SIZES = { phone: [390, 844, 3], tablet: [768, 1024, 2] };
const PRODUCTS = [
  ['drone', '/demos/drone-command/', 8000, async p => {
    await p.click('#demo-tour button[aria-label="Close tour"]', { timeout: 8000 }).catch(() => {});
    await p.getByRole('button', { name: 'Light show' }).first().click({ timeout: 60000 });
    await p.waitForSelector('#ls-play', { timeout: 90000 }); await p.click('#ls-play'); await p.waitForTimeout(9000);
    await p.locator('#lightshow-dashboard').scrollIntoViewIfNeeded().catch(() => {});
  }],
  ['carepulse', '/demos/healthcare/', 3500, null],
  ['frameshop', '/demos/frame-shop/', 3500, null],
  ['bigboy', '/demos/big-boy-subs/', 3500, null],
  ['fogcity', '/demos/fog-city/', 3500, null],
  ['finsight', '/demos/finsight/', 3500, null],
  ['crm', '/demos/meridian-crm/', 3500, null],
  ['planner', '/demos/stack-planner/', 3500, null],
  ['analytics', '/demos/analytics-hub/', 3500, null],
  ['modernstreet', '/demos/modern-street/', 3500, null],
];
const shots = [];
for (const [kind, [w, h, dpr]] of Object.entries(SIZES)) for (const [n, path, wait, act] of PRODUCTS) shots.push([`${kind}-${n}`, path, w, h, wait, act, dpr]);
for (const [name, path, w, h, wait, act, dpr] of shots) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 1000 });
  await p.route(/supabase\.co|posthog/, r => r.abort());
  await p.goto(base + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(wait);
  if (act) await act(p);
  // Hide the Meridian demonstration bar: the panel shows the product itself.
  await p.addStyleTag({ content: '#meridian-demo-bar{display:none!important} body{padding-top:0!important} :root{--meridian-bar:0px!important}' }).catch(() => {});
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log('ok', name);
  await p.close();
}
await b.close();
