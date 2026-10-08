// Captures for screens that scroll inside the glass, per product and size:
//   <name>.png        the page, full height (capped), with pinned bars hidden
//   <name>-pin.png    the pinned bars only (fixed/sticky headers, tab bars, floating
//                     buttons) on a transparent ground, at their place on the screen
// The compositor scrolls the page under the pinned layer, as a real phone does.
import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [,, base, out, only] = process.argv;
const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const HIDE = '#meridian-demo-bar{display:none!important} body{padding-top:0!important} :root{--meridian-bar:0px!important}';
const PRODUCTS = [
  ['drone', '/demos/drone-command/', 8000, async p => {
    await p.click('#demo-tour button[aria-label="Close tour"]', { timeout: 8000 }).catch(() => {});
    await p.getByRole('button', { name: 'Light show' }).first().click({ timeout: 60000 });
    await p.waitForSelector('#ls-play', { timeout: 90000 }); await p.click('#ls-play'); await p.waitForTimeout(9000);
  }],
  ['carepulse', '/demos/healthcare/', 3500], ['frameshop', '/demos/frame-shop/', 3500], ['bigboy', '/demos/big-boy-subs/', 3500],
  ['fogcity', '/demos/fog-city/', 3500], ['finsight', '/demos/finsight/', 3500], ['crm', '/demos/meridian-crm/', 3500],
  ['planner', '/demos/stack-planner/', 3500], ['analytics', '/demos/analytics-hub/', 3500], ['modernstreet', '/demos/modern-street/', 3500],
];
const JOBS = [['site', '/', 1440, 900, 1.333, 3000, null, 2.6]];
for (const [kind, w, h, dpr] of [['phone', 390, 844, 3], ['tablet', 768, 1024, 2]])
  for (const [n, path, wait, act] of PRODUCTS) JOBS.push([`${kind}-${n}`, path, w, h, dpr, wait, act, 2.4]);

for (const [name, path, w, h, dpr, wait, act, maxScreens] of JOBS) {
  if (only && !name.includes(only)) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 1000, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.route(/supabase\.co|posthog/, r => r.abort());
  await p.goto(base + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(wait);
  if (act) await act(p);
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  // The homepage is shown inside the hero's own big pane: hide the hero backdrop there,
  // or the pane would show a smaller copy of the clip inside itself.
  if (name === 'site') await p.addStyleTag({ content: 'section [aria-hidden="true"] img, section [aria-hidden="true"] video{display:none!important}' });
  // Unroll an app that scrolls inside a panel instead of the page (the page is one screen
  // tall but some element holds much more): let that element and its ancestors grow.
  const unrolled = await p.evaluate((h) => {
    if (document.documentElement.scrollHeight > h * 1.2) return false;
    let best = null;
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e);
      if (!/(auto|scroll)/.test(s.overflowY)) continue;
      if (e.scrollHeight > e.clientHeight + 200 && e.clientHeight > h * 0.4 && (!best || e.scrollHeight > best.scrollHeight)) best = e;
    }
    if (!best) return false;
    for (let e = best; e && e !== document.documentElement; e = e.parentElement) {
      e.style.setProperty('height', 'auto', 'important'); e.style.setProperty('max-height', 'none', 'important');
      e.style.setProperty('overflow', 'visible', 'important');
    }
    document.documentElement.style.setProperty('height', 'auto', 'important');
    document.body.style.setProperty('height', 'auto', 'important');
    return true;
  }, h);
  // lazy images: walk the page once
  const full0 = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(full0, h * maxScreens); y += h * 0.8) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(220); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(700);
  // pinned elements: outermost fixed or sticky elements that are on screen
  const pinned = await p.evaluate(() => {
    const all = [...document.querySelectorAll('body *')].filter(e => {
      const s = getComputedStyle(e); if (!(s.position === 'fixed' || s.position === 'sticky')) return false;
      const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight;
    });
    const outer = all.filter(e => !all.some(o => o !== e && o.contains(e)));
    outer.forEach((e, i) => e.setAttribute('data-pin', i));
    return outer.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  });
  const shot = async (file) => p.screenshot({ path: file, omitBackground: false });
  if (pinned.length) {
    (await import('fs')).writeFileSync(`${out}/${name}-pin.json`, JSON.stringify({ dpr, rects: pinned }));
    await shot(`${out}/${name}-with.png`);
    await p.addStyleTag({ content: '[data-pin]{visibility:hidden!important}' });
    await p.waitForTimeout(300);
    await shot(`${out}/${name}-without.png`);
  }
  const H = Math.min(await p.evaluate(() => document.documentElement.scrollHeight), Math.round(h * maxScreens));
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width: w, height: H } });
  console.log('ok', name, `${(H / h).toFixed(2)} screens`, pinned.length ? `${pinned.length} pinned` : '', unrolled ? 'unrolled' : '');
  await ctx.close();
}
await b.close();
