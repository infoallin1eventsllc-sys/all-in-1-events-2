import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const D = '/tmp/claude-0/-home-user-all-in-1-events-2/f81b4974-2063-5e90-85c0-6919ead1699b/scratchpad/still2';
const F = 'file:///home/user/meridian-interface-website/public/fonts/';
const head = (w, h, extra) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Hanken;src:url(${F}hanken-grotesk-var-latin.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:Inter;src:url(${F}inter-var-latin.woff2) format('woff2');font-weight:100 900}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
body{font-family:Inter,sans-serif;color:#fff;position:relative;background:#060d1f}
.blur{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(40px) brightness(.55)}
.art{position:absolute;background-repeat:no-repeat}
.feather{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 4%,#000 92%,transparent 100%),linear-gradient(to right,transparent 0,#000 4%,#000 96%,transparent 100%);-webkit-mask-composite:source-in}
.contact{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center}
.row{display:flex;align-items:center;justify-content:center}
.btn{border-radius:14px;font-family:Hanken;font-weight:800;white-space:nowrap}
.blue{background:#2563eb;color:#fff;box-shadow:0 8px 24px rgba(37,99,235,.45)}
.lime{background:#adf967;color:#0b1220;box-shadow:0 8px 24px rgba(173,249,103,.3)}
.site{font-family:Hanken;font-weight:800;letter-spacing:.005em;white-space:nowrap}
.line{font-weight:600;white-space:nowrap}.line b{color:#60a5fa;font-weight:700;margin-right:10px}
.sep{color:#64748b;margin:0 22px}
${extra}</style></head><body>`;
const src = n => `file://${D}/fixed${n}.png`;
// A clean ground in each picture's own colours (no blurred smear under the art).
const BG = {
  '22': 'radial-gradient(120% 80% at 50% 25%,#0b1d42 0%,#081530 45%,#050c1c 100%)',
  '23': 'radial-gradient(120% 80% at 50% 25%,#1a2537 0%,#121b29 50%,#0b111c 100%)',
  '25': 'radial-gradient(130% 70% at 50% 35%,#0c3a86 0%,#0a2a63 40%,#071a40 75%,#06142f 100%)',
};
const ground = n => `<div style="position:absolute;inset:0;background:${BG[n]}"></div>`;
const jobs = [];

// ---------- WIDE 2000x1131: art scaled to 0.875 at top, contact band below ----------
for (const [n, btn] of [['22', false], ['23', true]]) {
  const k = 0.875, aw = 2000 * k, ah = 1131 * k;
  jobs.push([`wide-${n}`, 2000, 1131, head(2000, 1131, '') +
    `${ground(n)}
     <div class="art feather" style="left:${(2000 - aw) / 2}px;top:0;width:${aw}px;height:${ah}px;background-image:url(${src(n)});background-size:${aw}px ${ah}px"></div>
     <div class="contact" style="top:${ah - 4}px;gap:12px">
       <div class="row" style="gap:30px">${btn ? '<div class="btn blue" style="font-size:30px;padding:11px 26px">Book your 1-on-1 appointment</div>' : ''}<div class="site" style="font-size:${btn ? 46 : 52}px">meridianinterface.com</div></div>
       <div class="line" style="font-size:29px"><b>Call</b>281-882-9198<span class="sep">|</span><b>Email</b>otis@meridianinterface.com</div>
     </div></body></html>`]);
}

// ---------- FEED 1080x1350 and STORY 1080x1920 for 22 and 23 ----------
// art cropped at the sides (centre kept), contact block below. Story keeps the
// top 250px and bottom 380px clear of the app's own buttons and captions.
const tall = (n, w, h, artH, artTop, contactTop, btnCol, sizes) => {
  const button = btnCol ? `<div class="btn ${btnCol}" style="font-size:${sizes.btn}px;padding:${sizes.btn * .5}px ${sizes.btn}px">Book your 1-on-1 appointment</div>` : '';
  const aw = artH * 2000 / 1131;
  return head(w, h, '') +
    `${ground(n)}
     <div class="art feather" style="left:0;top:${artTop}px;width:${w}px;height:${artH}px;background-image:url(${src(n)});background-size:${aw}px ${artH}px;background-position:center 0"></div>
     <div class="contact" style="top:${contactTop}px;gap:${sizes.gap}px">
       ${button}
       <div class="site" style="font-size:${sizes.site}px;margin-top:6px">meridianinterface.com</div>
       <div class="line" style="font-size:${sizes.line}px"><b>Call</b>281-882-9198</div>
       <div class="line" style="font-size:${sizes.line}px"><b>Email</b>otis@meridianinterface.com</div>
     </div></body></html>`;
};
// 22 already carries its own green "Book an appointment" button inside the art,
// so its contact block adds the address and numbers only, never a second button.
jobs.push(['feed-22', 1080, 1350, tall('22', 1080, 1350, 900, 0, 0, '', { gap: 18, btn: 40, site: 60, line: 38 })]);
jobs.push(['story-22', 1080, 1920, tall('22', 1080, 1920, 1000, 230, 0, '', { gap: 20, btn: 42, site: 62, line: 40 })]);
jobs.push(['feed-23', 1080, 1350, tall('23', 1080, 1350, 760, 10, 0, 'blue', { gap: 18, btn: 40, site: 56, line: 36 })]);
jobs.push(['story-23', 1080, 1920, tall('23', 1080, 1920, 800, 250, 0, 'blue', { gap: 20, btn: 42, site: 58, line: 38 })]);

jobs.push(['wide-25', 2000, 1131, head(2000, 1131, '') +
  `<div class="art" style="left:0;top:0;width:2000px;height:1131px;background-image:url(${src('25')});background-size:2000px 1131px"></div>
   <div style="position:absolute;left:0;right:0;bottom:0;height:230px;background:linear-gradient(to bottom,rgba(5,12,32,0) 0%,rgba(5,12,32,.62) 45%,rgba(5,12,32,.82) 100%)"></div>
   <div class="contact" style="top:968px;gap:16px">
     <div class="row" style="gap:34px"><div class="btn blue" style="font-size:33px;padding:15px 30px">Book your 1-on-1 appointment</div><div class="site" style="font-size:50px">meridianinterface.com</div></div>
     <div class="line" style="font-size:31px"><b>Call</b>281-882-9198<span class="sep">|</span><b>Email</b>otis@meridianinterface.com</div>
   </div></body></html>`]);
jobs.push(['feed-25', 1080, 1350, tall('25', 1080, 1350, 780, 20, 0, 'blue', { gap: 18, btn: 40, site: 56, line: 36 })]);
jobs.push(['story-25', 1080, 1920, tall('25', 1080, 1920, 760, 280, 0, 'blue', { gap: 20, btn: 42, site: 58, line: 38 })]);

// ---------- 24: white text card ----------
const white = (w, h, scale, srcTop, srcBottom, top, contactTop, sz) => {
  const sw = 1131 * scale, sh = 2000 * scale, cropH = (srcBottom - srcTop) * scale;
  return head(w, h, 'body{background:#fefefe;color:#0b1220}.line b{color:#2563eb}') +
    `<div class="art" style="left:${(w - sw) / 2}px;top:${top}px;width:${sw}px;height:${cropH}px;background-image:url(${src('24')});background-size:${sw}px ${sh}px;background-position:0 ${-srcTop * scale}px"></div>
     <div class="contact" style="top:${contactTop}px;gap:${sz.gap}px">
       <div class="btn blue" style="font-size:${sz.btn}px;padding:${sz.btn * .5}px ${sz.btn}px">Book your 1-on-1 appointment</div>
       <div class="site" style="font-size:${sz.site}px;margin-top:6px">meridianinterface.com</div>
       <div class="line" style="font-size:${sz.line}px;color:#334155"><b>Call</b>281-882-9198</div>
       <div class="line" style="font-size:${sz.line}px;color:#334155"><b>Email</b>otis@meridianinterface.com</div>
     </div></body></html>`;
};
jobs.push(['story-24', 1080, 1920, white(1080, 1920, 0.86, 470, 1540, 250, 0, { gap: 18, btn: 40, site: 54, line: 36 })]);
jobs.push(['feed-24', 1080, 1350, white(1080, 1350, 0.80, 460, 1550, 50, 0, { gap: 14, btn: 36, site: 50, line: 32 })]);

const b = await chromium.launch();
for (const [name, w, h, html] of jobs) {
  writeFileSync(`${D}/${name}.html`, html);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file://${D}/${name}.html`); await p.evaluate(() => document.fonts.ready);
  // Place each contact block directly under its art (top:0 means "auto").
  await p.evaluate((center) => {
    const c = document.querySelector('.contact'); const a = document.querySelector('.art');
    const artEnd = a.offsetTop + a.offsetHeight;
    // Feeds: centre the block in the space under the art. Stories: right under it,
    // so it stays above the bottom 380px the apps cover with their own buttons.
    if (c.style.top === '0px') c.style.top = (center ? artEnd + Math.max(34, (innerHeight - artEnd - c.offsetHeight) / 2) : artEnd + 34) + 'px';
    const r = c.getBoundingClientRect(); window.__bottom = r.bottom;
  }, name.startsWith('feed'));
  await p.waitForTimeout(300);
  const bottom = await p.evaluate(() => window.__bottom);
  console.log(name, w + 'x' + h, 'contact ends at', Math.round(bottom));
  await p.screenshot({ path: `${D}/${name}.png` }); await p.close();
}
await b.close();
