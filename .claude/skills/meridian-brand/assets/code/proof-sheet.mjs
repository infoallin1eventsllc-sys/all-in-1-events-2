/**
 * Builds proof-sheet.png: the real artwork on every ground it has to survive,
 * at the sizes where logos actually fail.
 *
 * Its job is to make contrast problems visible rather than arguable — the
 * wordmark in the lockup is near-black, so any dark ground is a question worth
 * looking at rather than assuming.
 *
 *   node proof-sheet.mjs      (needs playwright-core on NODE_PATH)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = path.resolve(here, '..', 'logo');
const d = (f) => `data:image/png;base64,${fs.readFileSync(path.join(L, f)).toString('base64')}`;

const html = `<!doctype html><meta charset=utf-8><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:13px system-ui;background:#fff;width:1140px}
.row{display:flex;align-items:center;gap:30px;padding:24px 26px;border-bottom:1px solid #e2e8f0}
.lab{width:200px;font-family:ui-monospace,monospace;font-size:11px;color:#64748b;line-height:1.5}
.dark{background:#0f172a}.dark .lab{color:#7c8899}
.paper{background:#f5f4ef}
.plate{background:#f1f5f9;border-radius:12px;padding:18px 24px;display:inline-flex}
img{display:block}
</style>
<div class=row><div class=lab>lockup<br>on white</div>
 <img src="${d('meridian-lockup.png')}" style="height:74px"><img src="${d('meridian-lockup.png')}" style="height:40px"><img src="${d('meridian-lockup.png')}" style="height:26px"></div>
<div class="row paper"><div class=lab>lockup<br>on warm paper</div>
 <img src="${d('meridian-lockup.png')}" style="height:60px"></div>
<div class="row dark"><div class=lab>lockup<br>DIRECT on navy<br>(the wordmark is near-black)</div>
 <img src="${d('meridian-lockup.png')}" style="height:74px"></div>
<div class="row dark"><div class=lab>lockup<br>on a light plate<br>(the fix)</div>
 <span class=plate><img src="${d('meridian-lockup.png')}" style="height:74px"></span></div>
<div class=row><div class=lab>mark alone<br>on white @ 96/48/32/20</div>
 <img src="${d('meridian-mark.png')}" style="height:96px"><img src="${d('meridian-mark.png')}" style="height:48px"><img src="${d('meridian-mark.png')}" style="height:32px"><img src="${d('meridian-mark.png')}" style="height:20px"></div>
<div class="row dark"><div class=lab>mark alone<br>on navy @ 96/48/32/20</div>
 <img src="${d('meridian-mark.png')}" style="height:96px"><img src="${d('meridian-mark.png')}" style="height:48px"><img src="${d('meridian-mark.png')}" style="height:32px"><img src="${d('meridian-mark.png')}" style="height:20px"></div>
<div class=row style="background:#c026d3"><div class=lab style="color:#fbcfe8">mark<br>on a hostile colour</div>
 <img src="${d('meridian-mark.png')}" style="height:72px"></div>
<div class=row><div class=lab>square / icon files<br>(both carry an off-white<br>ground, no alpha)</div>
 <img src="${d('meridian-logo-square.png')}" style="height:110px"><img src="${d('meridian-icon-512.png')}" style="height:110px"></div>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1140, height: 900 }, deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: 'load' });
await p.screenshot({ path: path.join(L, 'proof-sheet.png'), fullPage: true });
await b.close();
console.log('wrote', path.join(L, 'proof-sheet.png'));
