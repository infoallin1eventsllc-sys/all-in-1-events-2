// Browser half of the Meridian pre-launch QA.
//
//   cd <website repo> && npm run build && npx vite preview --port 4799 --strictPort &
//   node <skill>/scripts/browser.mjs --site . --base http://localhost:4799 --out /tmp/qa
//
// Applies the production security headers from vercel.json to every local
// response, so anything the live CSP would block shows up here as a failure.
// Prints one line per finding, FAIL or WARN, and exits 1 on any FAIL.
// Screenshots of every page and demo land in --out for a human look.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SITE = path.resolve(arg('site', '.'));
const BASE = arg('base', 'http://localhost:4799').replace(/\/$/, '');
const OUT = path.resolve(arg('out', '/tmp/meridian-qa'));
const ONLY = arg('only', 'all'); // all | site | demos
const DEMO = arg('demo', '');     // one demo slug, with --only demos
fs.mkdirSync(OUT, { recursive: true });

// ---- locate Playwright, Chromium and axe-core wherever this runs ----------
async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '@playwright/test', '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) { try { const m = await import(t); return m.chromium ? m : m.default; } catch {} }
  console.error('FAIL Playwright not found. Install it: npm i -g playwright && npx playwright install chromium'); process.exit(2);
}
const { chromium } = await loadPlaywright();
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let AXE = process.env.AXE_PATH;
if (!AXE) { try { AXE = createRequire(path.join(SITE, 'package.json')).resolve('axe-core/axe.min.js'); } catch {} }

const fails = [], warns = [];
const FAIL = (m) => { fails.push(m); console.log('FAIL ' + m); };
const WARN = (m) => { warns.push(m); console.log('WARN ' + m); };
const OK = (m) => console.log('ok   ' + m);

// ---- production headers from vercel.json ----------------------------------
const vercel = JSON.parse(fs.readFileSync(path.join(SITE, 'vercel.json'), 'utf8'));
const rules = (vercel.headers || []).map(h => ({ re: new RegExp('^' + h.source + '$'), headers: h.headers }));
async function prod(ctx) {
  await ctx.route(BASE + '/**', async route => {
    // A local preview server under load drops the odd connection; retry
    // rather than let one reset abort the whole run.
    let res;
    for (let i = 0; i < 3 && !res; i++) { try { res = await route.fetch(); } catch { await new Promise(r => setTimeout(r, 300)); } }
    if (!res) { await route.abort().catch(() => {}); return; }
    const p = new URL(route.request().url()).pathname;
    const headers = { ...res.headers() };
    for (const r of rules) if (r.re.test(p)) for (const h of r.headers) headers[h.key.toLowerCase()] = h.value;
    if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].replace(/;\s*upgrade-insecure-requests/, '');
    await route.fulfill({ response: res, headers });
  });
  // Backend stand-ins, in the shapes the real functions return.
  const json = (body) => (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST' } })
    : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await ctx.route(/posthog/, r => r.abort());
  await ctx.route('**/functions/v1/site-images*', json({ ok: true, overrides: {} }));
  await ctx.route('**/functions/v1/intake*', json({ ok: true }));
  await ctx.route('**/functions/v1/owner*', json({ configured: true, twoStep: false }));
  await ctx.route('**/functions/v1/unsubscribe*', json({ ok: true, unsubscribed: true, message: 'Done.' }));
  await ctx.route('**/functions/v1/planner*', json({ ok: false, error: 'offline in QA' }));
}
const watch = (p, where) => {
  p.on('pageerror', e => FAIL(`${where()}: page error: ${e.message.slice(0, 160)}`));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Content Security Policy|Refused to/.test(t)) FAIL(`${where()}: blocked by the live security policy: ${t.slice(0, 180)}`);
    else if (!/net::ERR_(TUNNEL|CERT|ABORTED|FAILED|NAME)|Failed to load resource: net::/.test(t)) FAIL(`${where()}: console error: ${t.slice(0, 160)}`);
  });
  p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE) && !/favicon/.test(r.url())) FAIL(`${where()}: HTTP ${r.status()} ${r.url().slice(BASE.length)}`); });
  p.on('dialog', d => d.dismiss().catch(() => {}));
};
const brokenImages = (p) => p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map(i => i.src));
const iconsAsText = (p) => p.evaluate(() => [...document.querySelectorAll('.material-symbols-outlined')].filter(e => e.offsetParent && e.getBoundingClientRect().width > parseFloat(getComputedStyle(e).fontSize) * 1.6).map(e => e.textContent.trim()));
const overflowX = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const scrollAll = async (p) => { const H = await p.evaluate(() => document.body.scrollHeight); for (let y = 0; y < H; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(50); } await p.evaluate(() => scrollTo(0, 0)); };

const b = await chromium.launch({ executablePath: exe });
const TABS = ['Home', 'Services', 'Portfolio', 'Book Appointment', 'My Appointments', 'Privacy', 'Terms', 'Studio login'];
const VIEWPORTS = [
  { tag: 'desktop', viewport: { width: 1440, height: 900 } },
  { tag: 'tablet', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  { tag: 'phone', viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true },
  { tag: 'small-phone', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
];
const goTab = async (p, tab) => {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (tab !== 'Home') await p.locator('footer button').filter({ hasText: new RegExp(tab === 'Studio login' ? 'Studio login' : '^' + tab + '$') }).first().click();
  await p.waitForTimeout(900);
};

if (ONLY !== 'demos') {
  // ---- 1. every page at every size ----------------------------------------
  for (const vp of VIEWPORTS) {
    const ctx = await b.newContext({ ...vp, reducedMotion: 'reduce' }); await prod(ctx);
    const p = await ctx.newPage(); let here = vp.tag; watch(p, () => here);
    for (const tab of TABS) {
      here = `${vp.tag} ${tab}`;
      await goTab(p, tab); await scrollAll(p);
      const ov = await overflowX(p); if (ov > 0) FAIL(`${here}: page scrolls sideways by ${ov}px`);
      for (const s of await brokenImages(p)) FAIL(`${here}: broken image ${s.slice(BASE.length)}`);
      const it = await iconsAsText(p); if (it.length) FAIL(`${here}: icon shows as text: ${[...new Set(it)].join(', ')}`);
      const clipped = await p.evaluate(() => [...document.querySelectorAll('.fixed.bottom-0 span, nav span, button span')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.trim()).slice(0, 5));
      if (clipped.length) FAIL(`${here}: clipped label: ${clipped.join(', ')}`);
      const bar = await p.evaluate(() => { const n = document.querySelector('.fixed.bottom-0'); if (!n || !n.offsetParent) return null; const r = n.getBoundingClientRect(); return [...n.querySelectorAll('button')].some(b2 => { const q = b2.getBoundingClientRect(); return q.right > r.right + 1 || q.left < r.left - 1; }); });
      if (bar) FAIL(`${here}: phone navigation bar runs off the screen`);
      if (vp.tag === 'desktop' || vp.tag === 'phone') await p.screenshot({ path: `${OUT}/site-${vp.tag}-${tab.replace(/ /g, '_')}.png`, fullPage: true });
      // dates offered for booking must not be in the past
      const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      for (const v of await p.evaluate(() => [...document.querySelectorAll('input[type=date]')].filter(i => i.offsetParent && !/issue|due/i.test(i.closest('div')?.textContent || '')).map(i => i.value)))
        if (v && v < iso) FAIL(`${here}: a booking date defaults to ${v}, which is in the past`);
    }
    // ---- 2. the flows a visitor uses ----------------------------------------
    here = `${vp.tag} flows`;
    await goTab(p, 'Home');
    await p.locator('button[aria-label="Search Studio"]').click(); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    if (await p.locator('[role=dialog][aria-label="Search the studio"]').count()) FAIL(`${here}: search does not close on Escape`);
    let posted = false; await p.route('**/functions/v1/intake*', r => { if (r.request().method() === 'POST') posted = true; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }); });
    await p.locator('footer button').filter({ hasText: /Book Appointment/i }).last().click(); await p.waitForTimeout(500);
    const dlg = p.locator('[role=dialog][aria-label="Book an appointment"]');
    if (!(await dlg.count())) FAIL(`${here}: booking window does not open`);
    else {
      await dlg.locator('button[type=submit]').first().click(); await p.waitForTimeout(300);
      if (posted) FAIL(`${here}: an EMPTY booking was sent`);
      for (const inp of await dlg.locator('input:not([type=date])').all()) { const t = await inp.getAttribute('type'); await inp.fill(t === 'email' ? 'qa@example.com' : t === 'tel' ? '2815550100' : 'QA Visitor'); }
      await dlg.locator('button[type=submit]').first().click(); await p.waitForTimeout(1500);
      if (!posted) FAIL(`${here}: a filled booking was not sent to the server`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    }
    if (await p.locator('button[aria-label="Open Navigation Menu"]').isVisible()) {
      await p.locator('button[aria-label="Open Navigation Menu"]').click(); await p.waitForTimeout(400);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      if (await p.locator('[role=dialog][aria-label="Navigation menu"]').count()) FAIL(`${here}: phone menu does not close on Escape`);
    }
    await goTab(p, 'Home');
    const vc = await p.locator('button:has-text("View concept")').count();
    for (let i = 0; i < vc; i++) { const bt = p.locator('button:has-text("View concept")').nth(i); await bt.scrollIntoViewIfNeeded(); await bt.click(); await p.waitForTimeout(350); if (!(await p.locator('[role=dialog]').count())) FAIL(`${here}: project ${i + 1} concept window does not open`); await p.keyboard.press('Escape'); await p.waitForTimeout(250); }
    await ctx.close();
  }
  OK('pages and flows checked at ' + VIEWPORTS.map(v => v.viewport.width).join(', ') + 'px');

  // ---- 3. card pictures flush to the top of their card ---------------------
  {
    // bypassCSP: the live policy (correctly) refuses the injected axe script.
    // Nothing in sections 3-5 tests the policy; section 1 already did.
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', bypassCSP: true }); await prod(ctx);
    const p = await ctx.newPage(); await p.mouse.move(1, 1);
    for (const tab of ['Home', 'Portfolio']) {
      await goTab(p, tab); await scrollAll(p); await p.waitForTimeout(600);
      const off = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => /View concept/.test(b.textContent)).map(b => { let c = b; while (c && !/rounded-(2)?xl/.test(c.className)) c = c.parentElement; const box = c?.querySelector('[class*="aspect-"]'); return box ? Math.round(box.getBoundingClientRect().top - c.getBoundingClientRect().top) : 0; }));
      const bad = off.filter(o => o > 2); if (bad.length) FAIL(`${tab}: ${bad.length} card pictures sit ${Math.max(...bad)}px below the top of their card`);
    }
    // ---- 4. repeated content on one page ----------------------------------
    for (const tab of ['Home', 'Services', 'Portfolio']) {
      await goTab(p, tab); await scrollAll(p);
      const rep = await p.evaluate(() => {
        const secOf = e => { const s = e.closest('section, footer'); return s ? (s.querySelector('h1,h2,h3')?.textContent || s.tagName).trim().slice(0, 40) : 'page'; };
        const seen = {}; const out = [];
        for (const e of document.querySelectorAll('main p, main li, main h2, main h3, footer p')) {
          const t = (e.innerText || '').trim().replace(/\s+/g, ' ').toLowerCase(); if (t.length < 40 || !e.offsetParent) continue;
          const s = secOf(e); (seen[t] = seen[t] || new Set()).add(s);
        }
        for (const [t, s] of Object.entries(seen)) if (s.size > 1) out.push(`"${t.slice(0, 70)}" in ${[...s].join(' + ')}`);
        const imgs = {}; for (const i of document.images) { if (i.getBoundingClientRect().width < 80) continue; const k = i.getAttribute('src'); imgs[k] = (imgs[k] || 0) + 1; }
        for (const [k, n] of Object.entries(imgs)) if (n > 1 && !/blur/.test(k)) out.push(`picture ${k} shown ${n} times`);
        const dashes = [...document.querySelectorAll('main *, footer *')].filter(e => e.children.length === 0 && e.offsetParent && /—/.test(e.textContent)).map(e => e.textContent.trim().slice(0, 60));
        for (const t of dashes.slice(0, 5)) out.push(`long dash in visitor copy: "${t}"`);
        const foot = document.querySelector('footer')?.innerText || '';
        for (const rx of [/[a-z.]+@meridianinterface\.com/g, /882-9198/g]) { const m = foot.match(rx) || []; if (m.length > 1) out.push(`footer repeats ${m[0]} ${m.length} times`); }
        return out;
      });
      for (const r of rep) WARN(`${tab}: repeated content: ${r}`);
    }
    // ---- 5. accessibility (WCAG A/AA) --------------------------------------
    if (!AXE) WARN('axe-core not found, accessibility not checked (npm i --no-save axe-core in the site repo, or set AXE_PATH)');
    else for (const vp of [{ width: 1440, height: 900 }, { width: 375, height: 740 }]) {
      await p.setViewportSize(vp);
      for (const tab of ['Home', 'Services', 'Portfolio', 'Book Appointment', 'My Appointments', 'Privacy']) {
        await goTab(p, tab);
        await p.addScriptTag({ path: AXE });
        const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(x => `${x.impact} ${x.id} x${x.nodes.length}: ${x.nodes[0].target.join(' ')}`));
        for (const x of v) FAIL(`accessibility ${vp.width}px ${tab}: ${x}`);
      }
    }
    await ctx.close();
  }
  OK('card alignment, repeats and accessibility checked');
}

if (ONLY !== 'site') {
  // ---- 6. every hosted demo ------------------------------------------------
  const demos = fs.readdirSync(path.join(SITE, 'public/demos'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).filter(d => !DEMO || d === DEMO);
  const ALLOW_OFFSITE = { 'stack-planner': /supabase\.co\/functions\/v1\/planner/, 'drone-command': /fonts\.(googleapis|gstatic)\.com|pexels|vimeo/ };
  const SKIP = /delete|remove|clear all|reset|log ?out|sign ?out|wipe|erase/i;
  // Demos whose menus are plain elements the generic crawl cannot see: drive
  // them by label. A label that has gone missing is a WARN (the demo changed;
  // update this list), a page error while driving it is a FAIL.
  const MENUS = {
    'meridian-crm': ['Leads Funnel', 'Operations Projects', 'Memos & Reports', 'Client Contacts', 'Kanban Board', 'Manage Invoices', 'SaaS Expenses', 'Gmail Inbox', 'Tutorial Logs', 'AI Voice & n8n', 'Google Search Fixer', 'Overview'],
    'stack-planner': ['Build your stack', 'Watch a workflow run', 'Department playbooks', 'What it frees up', 'Governance', 'AI advisor', 'The five layers'],
    'analytics-hub': ['Trend Models', 'Cohort Analysis', 'Anomaly Sentinel', 'Dashboard Overview'],
    'finsight': ['Executive Summary', 'Real-Time Revenue', 'P&L & Forecasts', 'Cash Flow & Runway', 'Treasury & FX', 'Export Center'],
    'modern-street': ['New Arrivals', 'Collections', 'About'],
    // Aircraft-panel controls first: choosing a mode replaces that panel.
    'drone-command': ['Straight down', 'Portrait', 'Landed', 'Light show', 'Site survey', 'Surveillance'],
  };
  // 3D demos render in software in a sandbox with no GPU: a click there can
  // take ~5 s. Give them room instead of reporting "0 controls clicked".
  const SLOW = { 'drone-command': 9000 };
  // The one button a visitor presses first, pressed on a phone, with what must
  // happen. Drone Command's Start show once stayed greyed out until a second
  // button was found, with the reason only in a hover tooltip (7 Oct).
  const PRIMARY = {
    'drone-command': { open: 'Light show', press: '#ls-play', what: 'Start show does not start the light show',
      ok: async (p) => /Hold/.test(await p.locator('#ls-play').textContent({ timeout: 5000 }).catch(() => '')) },
  };
  for (const d of demos) {
    const base = `${BASE}/demos/${d}/`;
    const ctx = await b.newContext({ viewport: { width: 1366, height: 850 }, acceptDownloads: true }); await prod(ctx);
    const p = await ctx.newPage(); const where = () => `demo ${d}`; watch(p, where);
    const off = new Set(); p.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !/^(data|blob):/.test(u) && !(ALLOW_OFFSITE[d] && ALLOW_OFFSITE[d].test(u))) off.add(u.slice(0, 100)); });
    await p.goto(base, { waitUntil: 'networkidle' }).catch(e => FAIL(`${where()}: does not load: ${e.message.slice(0, 80)}`));
    await p.waitForTimeout(1200);
    const rootLen = await p.evaluate(() => (document.getElementById('root') || document.body).innerText.length);
    if (rootLen < 200) FAIL(`${where()}: page is nearly empty (${rootLen} chars)`);
    const barTop = await p.evaluate(() => document.getElementById('meridian-demo-bar')?.getBoundingClientRect().top);
    if (barTop !== 0) FAIL(`${where()}: the Meridian demonstration bar is missing or not at the top`);
    const seen = new Set(); let clicks = 0;
    const clickTimeout = SLOW[d] || 2000;
    while (clicks < (SLOW[d] ? 15 : 70)) {
      const next = await p.evaluate((seenArr) => {
        const seen = new Set(seenArr);
        for (const e of document.querySelectorAll('button, [role=tab], [role=button], a[href^="#"], nav a, aside a, [onclick]')) {
          const r = e.getBoundingClientRect(); if (r.width < 5 || r.height < 5 || e.disabled || e.closest('#meridian-demo-bar') || getComputedStyle(e).visibility === 'hidden') continue;
          const t = (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50); const k = t || e.tagName + (e.className || '').toString().slice(0, 30);
          if (seen.has(k)) continue; document.querySelectorAll('[data-qa-next]').forEach(x => x.removeAttribute('data-qa-next')); e.setAttribute('data-qa-next', '1'); return { k, t };
        }
        return null;
      }, [...seen]);
      if (!next) break; seen.add(next.k); if (SKIP.test(next.t)) continue;
      try { await p.locator('[data-qa-next]').first().click({ timeout: clickTimeout }); clicks++; } catch { continue; }
      await p.waitForTimeout(250);
      if (!p.url().startsWith(base) && !p.url().startsWith(BASE + '/?')) { await p.goto(base, { waitUntil: 'networkidle' }).catch(() => {}); }
      await p.keyboard.press('Escape').catch(() => {});
    }
    let menuOk = 0;
    // Fresh load: the crawl may have left a dialog open or switched a mode,
    // which hides or covers the menu.
    if (MENUS[d]) { await p.goto(base, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(SLOW[d] ? 4000 : 1000); }
    for (const label of MENUS[d] || []) {
      if (!p.url().startsWith(base)) await p.goto(base, { waitUntil: 'networkidle' }).catch(() => {});
      const loc = p.getByText(label, { exact: true }).first();
      if (!(await loc.count())) { WARN(`${where()}: menu item "${label}" not found (demo changed? update MENUS)`); continue; }
      try { await loc.click({ timeout: Math.max(clickTimeout, 4000) }); menuOk++; await p.waitForTimeout(500); }
      catch { WARN(`${where()}: menu item "${label}" could not be clicked`); }
      await p.keyboard.press('Escape').catch(() => {});
      for (const s of await brokenImages(p)) FAIL(`${where()} ${label}: broken image ${s.slice(0, 100)}`);
    }
    for (const s of await brokenImages(p)) FAIL(`${where()}: broken image ${s.slice(0, 100)}`);
    for (const u of off) FAIL(`${where()}: loads from another site (blank or blocked live): ${u}`);
    await p.screenshot({ path: `${OUT}/demo-${d}.png` });
    await ctx.close();
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await prod(pc);
    const q = await pc.newPage(); q.on('pageerror', e => FAIL(`demo ${d} phone: page error: ${e.message.slice(0, 140)}`));
    await q.goto(base, { waitUntil: 'networkidle' }).catch(() => {}); await q.waitForTimeout(1000);
    const ov = await overflowX(q); if (ov > 0) FAIL(`demo ${d} phone: scrolls sideways by ${ov}px`);
    const under = await q.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); if (!['fixed', 'sticky'].includes(s.position) || e.closest('#meridian-demo-bar') || s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.top < 45 && r.bottom > 0 && r.height > 0 && r.height < 300; }).length);
    if (under) FAIL(`demo ${d} phone: ${under} pinned element(s) sit under the Meridian bar`);
    if (PRIMARY[d]) {
      const t = PRIMARY[d];
      try {
        await q.locator('#demo-tour button[aria-label="Close tour"]').click({ timeout: 5000 }).catch(() => {});
        await q.getByRole('button', { name: t.open }).first().click({ timeout: 60000 });
        await q.locator(t.press).click({ timeout: 60000 });
        await q.waitForTimeout(6000);
        if (!(await t.ok(q))) FAIL(`demo ${d} phone: ${t.what}`);
      } catch (e) { FAIL(`demo ${d} phone: ${t.what} (${e.message.split('\n')[0].slice(0, 100)})`); }
    }
    await q.screenshot({ path: `${OUT}/demo-${d}-phone.png` });
    await pc.close();
    OK(`demo ${d}: ${clicks} controls clicked` + (MENUS[d] ? `, ${menuOk}/${MENUS[d].length} menu items` : ''));
  }
}

await b.close();
console.log('----');
console.log(`browser: ${fails.length} FAIL, ${warns.length} WARN. Screenshots in ${OUT}`);
process.exit(fails.length ? 1 : 0);
