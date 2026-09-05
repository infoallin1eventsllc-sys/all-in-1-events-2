/**
 * Record a demo being used, as raw footage for a social clip.
 *
 * The point is motion of the real product — a menu actually scrolling, a bag
 * actually filling — not a still with a pan over it. Playwright drives the
 * hosted build and records the viewport; the Meridian bar is hidden because
 * the clip carries its own branding at the end.
 *
 * Geometry: Playwright's screencast captures CSS pixels and does NOT scale the
 * page up to `recordVideo.size` — a 540x960 viewport lands in the top-left of a
 * 1080x1920 video with grey filling the rest, and deviceScaleFactor does not
 * change that. So record at a true 1080x1920 viewport and use `html{zoom:2}` to
 * get phone proportions back at full resolution.
 *
 * Timing: each beat is timestamped into beats.json so captions can be placed
 * over the moment they actually describe, instead of at guessed offsets. A beat
 * is held still for `hold` ms, because a caption over a moving scroll both reads
 * badly and catches the sticky header mid-repaint.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

// mode 'zoom'   — 1080x1920 viewport + html{zoom:2}: full resolution, but CSS
//                  media queries still see 1080px, so any desktop breakpoint fires.
// mode 'mobile'  — a true 540x960 viewport so mobile breakpoints apply; compose
//                  upscales it. Use this for anything with a desktop layout.
const [,, slug, outDir, mode = 'zoom'] = process.argv;
const MOBILE = mode === 'mobile';
fs.mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--hide-scrollbars'] });
const ctx = await b.newContext({
  viewport: MOBILE ? { width: 540, height: 960 } : { width: 1080, height: 1920 },
  recordVideo: { dir: outDir, size: MOBILE ? { width: 540, height: 960 } : { width: 1080, height: 1920 } },
});
const p = await ctx.newPage();
await p.goto(`http://localhost:4600/demos/${slug}/`, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: '#meridian-demo-bar{display:none!important}body{padding-top:0!important}'
  + (MOBILE ? '' : 'html{zoom:2}') });
await p.waitForTimeout(1500);

const T0 = Date.now();
const beats = [];
const now = () => (Date.now() - T0) / 1000;

const ease = async (frac, ms=1800) => {
  const [from, max] = await p.evaluate(() => [window.scrollY,
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight)]);
  const to = max * frac, steps = Math.round(ms/33);
  for (let i=1;i<=steps;i++){
    const t=i/steps, e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    await p.evaluate(y=>window.scrollTo(0,y), from+(to-from)*e);
    await p.waitForTimeout(33);
  }
  await p.waitForTimeout(260);           // let the sticky header settle
};
const click = async (fn) => {
  const ok = await p.evaluate(fn);
  await p.waitForTimeout(1100);
  return ok;
};
/** Mark a still stretch that a caption can sit over. */
const beat = async (label, hold=4200) => {
  const start = now();
  await p.waitForTimeout(hold);
  beats.push({ label, start, end: now() });
};

const script = {
  'big-boy-subs': async () => {
    await ease(0.26);
    await beat('lt0');                                   // hero / ordering
    if (!await click(()=>{const e=[...document.querySelectorAll('nav button, nav a')].find(b=>/menu/i.test(b.innerText)); e?.click(); return !!e;}))
      throw new Error('menu tab not found');
    await ease(0.30, 2000);
    await beat('lt1');                                   // the menu itself
    await click(()=>{const e=[...document.querySelectorAll('button')].find(b=>/^Add$/i.test(b.innerText.trim())); e?.click(); return !!e;});
    await p.waitForTimeout(900);
    if (!await click(()=>{const e=[...document.querySelectorAll('nav button, nav a')].find(b=>/merch/i.test(b.innerText)); e?.click(); return !!e;}))
      throw new Error('merch tab not found');
    await ease(0.30, 1800);
    await beat('lt2');                                   // merch
  },
  'modern-street': async () => {
    await ease(0.24);
    await beat('lt0');
    await click(()=>{const e=document.querySelector('#nav-collections'); e?.click(); return !!e;});
    await ease(0.30, 2000);
    await beat('lt1');
    await click(()=>{const e=document.querySelector('[id^="collection-item-"]'); e?.click(); return !!e;});
    await p.waitForTimeout(600);
    await beat('lt2');
  },
};
await script[slug]();
const total = now();
await p.waitForTimeout(400);
await ctx.close(); await b.close();

const f = fs.readdirSync(outDir).find(n=>n.endsWith('.webm'));
fs.writeFileSync(`${outDir}/beats.json`, JSON.stringify({ total, mode, beats }, null, 2));
console.log(`  ${slug}: ${f} ${(fs.statSync(`${outDir}/${f}`).size/1024/1024).toFixed(1)}MB  ${total.toFixed(1)}s`);
for (const x of beats) console.log(`    ${x.label}  ${x.start.toFixed(1)}–${x.end.toFixed(1)}s`);
