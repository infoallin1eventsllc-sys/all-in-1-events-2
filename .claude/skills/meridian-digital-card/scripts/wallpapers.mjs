// Wallpapers that go with a digital business card.
//   node wallpapers.mjs <card.json> <plates-dir> <out-dir> [background ...]
// For each background it writes six JPEGs:
//   <bg>-phone-qr.jpg     1290x2796  lock screen: QR to the card, name, logo (clock area and bottom buttons kept clear)
//   <bg>-phone.jpg        1290x2796  clean: art and a small logo
//   <bg>-laptop.jpg       2880x1800  16:10 (MacBook): art, glass panel with contacts and QR, bottom left
//   <bg>-laptop-clean.jpg 2880x1800  art and a small logo, bottom right
//   <bg>-desktop.jpg      2560x1440  16:9 monitor: as laptop
//   <bg>-desktop-clean.jpg 2560x1440
// Plates: <plates-dir>/<bg>-phone.jpg (1290x2796) and <bg>-laptop.jpg (2880x1800); the desktop
// plate is cut from the laptop plate. The config needs logo_mark_file and qr_file (local files).
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const [cfgPath, plates, out, ...wanted] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); const base = path.dirname(path.resolve(cfgPath));
const KIT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const f = p => 'file://' + path.resolve(base, p);
const E = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
fs.mkdirSync(out, { recursive: true });
const bgs = wanted.length ? wanted : fs.readdirSync(plates).filter(n => n.endsWith('-phone.jpg')).map(n => n.replace('-phone.jpg', ''));
const fonts = `@font-face{font-family:H;src:url(file://${KIT}/assets/fonts/hanken-grotesk-var-latin.woff2)}@font-face{font-family:I;src:url(file://${KIT}/assets/fonts/inter-var-latin.woff2)}`;
const lg = c.logo || {};
const logo = (cls) => `<div class="lg ${cls}"><img src="${f(c.logo_mark_file)}"><div><b>${E(lg.line1)}</b><span>${E(lg.line2)}</span></div></div>`;
const css = `${fonts}*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%}body{font-family:I;color:#fff;background:#000 center/cover no-repeat;position:relative;overflow:hidden}
.lg{display:flex;align-items:center;gap:.6em}.lg img{height:2.6em;width:auto;filter:drop-shadow(0 4px 14px rgba(0,0,0,.45))}.lg b{display:block;font:800 1em/1 H;letter-spacing:.2em;text-shadow:0 2px 14px rgba(0,0,0,.6)}.lg span{display:block;margin-top:.35em;font:700 .55em/1 I;letter-spacing:.28em;color:#cbd5e1;text-shadow:0 2px 14px rgba(0,0,0,.6)}
.qrc{background:#fff;color:#0f172a;border-radius:28px;text-align:center;box-shadow:0 30px 70px -20px rgba(0,0,0,.6)}
.qrc img{display:block;margin:0 auto}
.panel{position:absolute;border-radius:22px;background:rgba(8,12,40,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 30px 70px -30px rgba(0,0,0,.7);backdrop-filter:blur(16px);display:flex;gap:22px;align-items:center}
.panel .qr{background:#fff;border-radius:12px;padding:8px;line-height:0}.panel h1{font:800 26px/1.1 H}.panel .r{margin-top:4px;font:600 14px I;color:#dbe5f5}.panel .k{margin-top:12px;font:600 13.5px/1.6 I;color:#fff}.panel .k span{color:#cbd5e1}
.lg.ink b,.lg.ink span{text-shadow:none}.lg.ink b{color:#0f172a}.lg.ink span{color:#475569}.lg.ink img{filter:none;margin:0}
.corner{position:absolute;right:40px;bottom:64px;font-size:15px;opacity:.92}`;
const page = (bg, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="background-image:url('${bg}')">${body}</body></html>`;
const phoneQR = (bg) => page(bg, `<div style="position:absolute;left:0;right:0;top:34%;display:flex;flex-direction:column;align-items:center">
 <div class="qrc" style="padding:18px 20px 14px"><img src="${f(c.qr_file)}" style="width:176px;height:176px"><div style="margin-top:10px;font:800 16px H">Scan to open my card</div><div style="margin-top:3px;font:600 12.5px I;color:#475569">${E(c.name)} · ${E(c.role)}</div>
 <div class="lg ink" style="justify-content:center;font-size:12px;margin-top:12px;padding-top:11px;border-top:1px solid #e2e8f0">${logo('').replace(/^<div class="lg ">|<\/div>$/g, '')}</div></div></div>`);
const phoneClean = (bg) => page(bg, `<div style="position:absolute;left:0;right:0;top:44%;display:flex;justify-content:center;font-size:16px">${logo('')}</div>`);
const comp = (bg, w, h) => page(bg, `<div class="panel" style="left:48px;bottom:${Math.round(h*0.11)}px;padding:22px 24px">
 <div class="qr"><img src="${f(c.qr_file)}" style="width:104px;height:104px"></div>
 <div><div style="font-size:14px;margin-bottom:12px">${logo('')}</div><h1>${E(c.name)}</h1><div class="r">${E(c.role)}${c.location ? ' · ' + E(c.location) : ''}</div>
 <div class="k">${E(c.phone_display)} <span>·</span> ${E(c.email)}<br>${E(c.website_display)}</div></div></div>`);
const compClean = (bg) => page(bg, `<div class="corner">${logo('')}</div>`);
const b = await chromium.launch();
const shot = async (html, w, h, scale, file) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  // a page opened from a file may load file:// art and fonts; setContent (about:blank) may not
  const tmp = path.join(out, `.render-${process.pid}.html`); fs.writeFileSync(tmp, html);
  await p.goto('file://' + path.resolve(tmp), { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  const missing = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
  if (missing.length) throw new Error('image did not load: ' + missing.join(', '));
  fs.unlinkSync(tmp);
  await p.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 90 }); await p.close();
};
for (const n of bgs) {
  const ph = f(path.join(plates, `${n}-phone.jpg`)), lp = f(path.join(plates, `${n}-laptop.jpg`));
  await shot(phoneQR(ph), 430, 932, 3, `${n}-phone-qr.jpg`);
  await shot(phoneClean(ph), 430, 932, 3, `${n}-phone.jpg`);
  await shot(comp(lp, 1440, 900), 1440, 900, 2, `${n}-laptop.jpg`);
  await shot(compClean(lp), 1440, 900, 2, `${n}-laptop-clean.jpg`);
  await shot(comp(lp, 1280, 720), 1280, 720, 2, `${n}-desktop.jpg`);   // cover crops the 16:10 plate to 16:9
  await shot(compClean(lp), 1280, 720, 2, `${n}-desktop-clean.jpg`);
  console.log('wallpapers', n);
}
await b.close();
