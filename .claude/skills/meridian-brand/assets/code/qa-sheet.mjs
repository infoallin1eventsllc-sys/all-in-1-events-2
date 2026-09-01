// Proof sheet: every variant on the background it is meant for, plus the small
// sizes where a logo actually fails. Rendering is not verification — looking is.
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const L = path.resolve('../logo');
const d = f => `data:image/png;base64,${fs.readFileSync(path.join(L,f)).toString('base64')}`;
const html = `<!doctype html><meta charset=utf-8><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:13px system-ui;background:#fff;width:1100px}
.row{display:flex;align-items:center;gap:28px;padding:22px 26px;border-bottom:1px solid #e2e8f0}
.dark{background:#0f172a;color:#94a3b8}
.lab{width:190px;font-family:ui-monospace,monospace;font-size:11px;color:#64748b}
.dark .lab{color:#64748b}
img{display:block}
</style>
<div class=row><div class=lab>lockup-light<br>on white</div>
 <img src="${d('meridian-lockup-light.png')}" style="height:60px"><img src="${d('meridian-lockup-light.png')}" style="height:28px"><img src="${d('meridian-lockup-light.png')}" style="height:18px"></div>
<div class="row" style="background:#f7f9fd"><div class=lab>lockup-light<br>on site bg #f7f9fd</div>
 <img src="${d('meridian-lockup-light.png')}" style="height:44px"></div>
<div class="row dark"><div class=lab>lockup-dark<br>on navy</div>
 <img src="${d('meridian-lockup-dark.png')}" style="height:60px"><img src="${d('meridian-lockup-dark.png')}" style="height:28px"><img src="${d('meridian-lockup-dark.png')}" style="height:18px"></div>
<div class=row><div class=lab>mark<br>on white @ 96/48/32/16</div>
 <img src="${d('meridian-mark.png')}" style="height:96px"><img src="${d('meridian-mark.png')}" style="height:48px"><img src="${d('meridian-mark.png')}" style="height:32px"><img src="${d('meridian-mark.png')}" style="height:16px"></div>
<div class="row dark"><div class=lab>mark-tile<br>avatar / app icon</div>
 <img src="${d('meridian-mark-tile.png')}" style="height:96px"><img src="${d('meridian-mark-tile.png')}" style="height:48px"><img src="${d('meridian-mark-tile.png')}" style="height:32px"></div>
<div class=row style="background:#c026d3"><div class=lab style="color:#fbcfe8">mark-tile<br>on a hostile colour</div>
 <img src="${d('meridian-mark-tile.png')}" style="height:72px"><img src="${d('meridian-mark.png')}" style="height:72px"></div>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: 'load' });
await p.screenshot({ path: '/tmp/claude-0/-home-user-all-in-1-events-2/f81b4974-2063-5e90-85c0-6919ead1699b/scratchpad/logo-qa.png', fullPage: true });
await b.close(); console.log('ok');
