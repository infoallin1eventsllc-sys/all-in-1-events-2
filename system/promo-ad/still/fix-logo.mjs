// Stage 1: put Otis's real mark (meridian-mark.png, never redrawn) onto the
// cleaned 2000x1131 sources, with the wordmark as live text in the site's
// type (Hanken 800 MERIDIAN over Inter INTERFACE), sized by the brand ratios.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const D = '/tmp/claude-0/-home-user-all-in-1-events-2/f81b4974-2063-5e90-85c0-6919ead1699b/scratchpad/still2';
const MARK = 'file:///home/user/all-in-1-events-2/.claude/skills/meridian-brand/assets/logo/meridian-mark.png';
const F = 'file:///home/user/meridian-interface-website/public/fonts/';
const css = `@font-face{font-family:Hanken;src:url(${F}hanken-grotesk-var-latin.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:Inter;src:url(${F}inter-var-latin.woff2) format('woff2');font-weight:100 900}
html,body{margin:0;width:2000px;height:1131px;overflow:hidden}body{position:relative;background-size:2000px 1131px}
.lock{position:absolute;display:flex;align-items:center}
.mk{display:block}
.words{display:flex;flex-direction:column;justify-content:center}
.m1{font-family:Hanken;font-weight:800;letter-spacing:.2em;line-height:1;color:#fff;text-transform:uppercase}
.m2{font-family:Inter;font-weight:700;letter-spacing:.28em;line-height:1;color:#cbd5e1;text-transform:uppercase}`;
const lockup = (mark) => `<div class="lock" style="gap:${mark * .389}px">
  <img class="mk" src="${MARK}" style="height:${mark}px;width:auto">
  <div class="words"><div class="m1" style="font-size:${mark * .5 / .7}px">Meridian</div>
  <div class="m2" style="font-size:${mark * .306 / .727}px;margin-top:${mark * .111}px">Interface</div></div></div>`;
const pages = {
  '22': `<body style="background-image:url(file://${D}/clean22.png)">
    <div id="top" style="position:absolute;left:0;right:0;top:24px;display:flex;justify-content:center">${lockup(64)}</div>
    <img src="${MARK}" style="position:absolute;left:1314px;top:363px;height:29px;transform:rotate(-3deg)">`,
  '23': `<body style="background-image:url(file://${D}/clean23.png)">
    <img src="${MARK}" style="position:absolute;left:50px;top:40px;height:84px">`,
  // The custom-studio ad: the AI M was the whole centrepiece, so it is hidden
  // under the ad's own light (a soft blue bloom where its rays already meet)
  // and the real mark stands in the same place, the same size.
  '25': `<body style="background-image:url(file://${D}/src25.png)">
    <div style="position:absolute;left:1000px;top:425px;width:0;height:0">
      <div style="position:absolute;left:-620px;top:-520px;width:1240px;height:1040px;border-radius:50%;
        background:radial-gradient(closest-side,rgba(9,66,140,1) 0%,rgba(9,66,140,1) 62%,rgba(9,64,136,.8) 74%,rgba(8,60,130,.35) 88%,rgba(8,60,130,0) 100%)"></div>
      <div style="position:absolute;left:-330px;top:-330px;width:660px;height:660px;border-radius:50%;
        background:radial-gradient(closest-side,rgba(90,170,255,.55),rgba(60,140,240,.18) 60%,rgba(40,120,230,0))"></div>
      <img src="${MARK}" style="position:absolute;height:500px;left:-257px;top:-250px;filter:drop-shadow(0 18px 40px rgba(0,10,40,.55))">
    </div>`,
};
const b = await chromium.launch();
for (const [n, body] of Object.entries(pages)) {
  writeFileSync(`${D}/fix${n}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>${body}</body></html>`);
  const p = await b.newPage({ viewport: { width: 2000, height: 1131 } });
  await p.goto(`file://${D}/fix${n}.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: `${D}/fixed${n}.png` }); await p.close();
}
await b.close();
