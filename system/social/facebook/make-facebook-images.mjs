import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const D = process.cwd();
const MARK = 'file:///home/user/all-in-1-events-2/.claude/skills/meridian-brand/assets/logo/meridian-mark.png';
const F = 'file:///home/user/meridian-interface-website/public/fonts/';
const css = `@font-face{font-family:Hanken;src:url(${F}hanken-grotesk-var-latin.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:Inter;src:url(${F}inter-var-latin.woff2) format('woff2');font-weight:100 900}
html,body{margin:0;overflow:hidden}`;
const pages = {
  // Profile picture: the mark alone on its own light plate (brand rule for avatars).
  // Facebook crops to a circle, so the mark sits well inside it.
  profile: [720, 720, `<body style="width:720px;height:720px;background:radial-gradient(circle at 50% 45%,#ffffff 0%,#f1f5f9 70%,#e2e8f0 100%);display:flex;align-items:center;justify-content:center">
    <img src="${MARK}" style="width:380px;height:auto"></body>`],
  // Cover: everything centred so Facebook's phone crop (sides trimmed) keeps it all.
  cover: [1640, 624, `<body style="width:1640px;height:624px;background:radial-gradient(120% 140% at 50% 0%,#12306b 0%,#0b1d42 45%,#060d1f 100%);color:#fff;font-family:Inter,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;position:relative">
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(96,165,250,.06) 0 1px,transparent 1px 82px),repeating-linear-gradient(0deg,rgba(96,165,250,.05) 0 1px,transparent 1px 82px)"></div>
    <div style="position:relative;display:flex;align-items:center;gap:34px">
      <img src="${MARK}" style="height:110px">
      <div><div style="font-family:Hanken;font-weight:800;letter-spacing:.2em;font-size:79px;line-height:1">MERIDIAN</div>
      <div style="font-family:Inter;font-weight:700;letter-spacing:.28em;font-size:46px;line-height:1;color:#cbd5e1;margin-top:12px">INTERFACE</div></div>
    </div>
    <div style="position:relative;font-family:Hanken;font-weight:700;font-size:40px;color:#e2e8f0">Custom websites, apps, dashboards &amp; video ads</div>
    <div style="position:relative;font-family:Inter;font-weight:600;font-size:32px;color:#93c5fd">meridianinterface.com</div>
  </body>`],
};
const b = await chromium.launch();
for (const [n, [w, h, body]] of Object.entries(pages)) {
  writeFileSync(`${D}/${n}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>${body}</html>`);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file://${D}/${n}.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: `${D}/${n}.png` }); await p.close();
}
await b.close();
