/**
 * Renders the Meridian Interface logo to PNG and SVG from its one source of
 * truth: the MeridianLogoMark paths that ship in the website's header.
 *
 * Nothing here invents artwork. The paths, gradients, type weights and
 * letter-spacing are lifted from src/components/MeridianLogo.tsx verbatim, so a
 * re-render can only ever produce what the live site already draws. If the mark
 * changes there, re-run this and the whole asset set moves with it.
 *
 *   node render-logo.mjs [path-to-website-repo]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'logo');
const SITE = process.argv[2] || '/workspace/meridian-interface-website';

/* Brand constants — the same literals the component uses. */
const INK = '#0f172a';        // wordmark on light
const SUB_DARK = '#475569';   // subtext on light  (slate-600)
const SUB_LIGHT = '#cbd5e1';  // subtext on dark   (slate-300)
const NAVY = '#0f172a';       // solid-tile background

/** The mark, as standalone SVG. `light` = drawn for a dark background. */
function markSVG(light, { size = 100, id = 'a' } = {}) {
  const g = (name, stops, x1, y1, x2, y2) => `
    <linearGradient id="${name}_${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      ${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}
    </linearGradient>`;

  const stem_l = light ? [['0%','#f8fafc'],['50%','#cbd5e1'],['100%','#94a3b8']]
                       : [['0%','#64748b'],['50%','#475569'],['100%','#334155']];
  const fold_l = light ? [['0%','#ffffff'],['40%','#e2e8f0'],['100%','#94a3b8']]
                       : [['0%','#718096'],['40%','#4a5568'],['100%','#2d3748']];
  const stem_r = light ? [['0%','#e2e8f0'],['50%','#94a3b8'],['100%','#64748b']]
                       : [['0%','#475569'],['50%','#334155'],['100%','#1e293b']];
  const fold_r = light ? [['0%','#cbd5e1'],['60%','#94a3b8'],['100%','#64748b']]
                       : [['0%','#4a5568'],['60%','#2d3748'],['100%','#1a202c']];
  const needle = light ? [['0%','#ffffff'],['50%','#94a3b8'],['100%','#475569']]
                       : [['0%','#64748b'],['50%','#475569'],['100%','#1e293b']];

  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Meridian Interface">
  <defs>
    <filter id="sh_${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="${light ? 0.2 : 0.4}"/>
    </filter>
    ${g('stemL', stem_l, '0%','0%','100%','100%')}
    ${g('foldL', fold_l, '0%','0%','100%','100%')}
    ${g('stemR', stem_r, '100%','0%','0%','100%')}
    ${g('foldR', fold_r, '100%','0%','0%','100%')}
    ${g('needle', needle, '0%','0%','0%','100%')}
  </defs>
  <line x1="50" y1="16" x2="50" y2="84" stroke="url(#needle_${id})" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M 22 78 L 22 36 C 22 22, 34 22, 38 28 L 38 78 Z" fill="url(#stemL_${id})"/>
  <path d="M 22 36 C 22 20, 36 20, 50 44 L 50 58 C 36 34, 28 32, 22 40 Z" fill="url(#foldL_${id})" filter="url(#sh_${id})"/>
  <path d="M 78 78 L 78 36 C 78 22, 66 22, 62 28 L 62 78 Z" fill="url(#stemR_${id})"/>
  <path d="M 78 36 C 78 20, 64 20, 50 44 L 50 58 C 64 34, 72 32, 78 40 Z" fill="url(#foldR_${id})" filter="url(#sh_${id})"/>
</svg>`;
}

const b64 = (p) => fs.readFileSync(p).toString('base64');
const hanken = b64(path.join(SITE, 'public/fonts/hanken-grotesk-var-latin.woff2'));
const inter  = b64(path.join(SITE, 'public/fonts/inter-var-latin.woff2'));

/** One artboard. `mark` = 128px mark; type scaled to match the header lockup. */
function board(id, { light, markOnly, tile }) {
  const M = 128;                    // mark box
  const word = Math.round(M * 0.5); // 64px "MERIDIAN"
  const sub  = Math.round(M * 0.3056); // 11px sub : 36px mark, from the header
  const pad  = markOnly ? (tile ? Math.round(M * 0.25) : 0) : Math.round(M * 0.25);
  const svg  = markSVG(light, { size: M, id });

  const type = markOnly ? '' : `
    <div class="type">
      <span class="word" style="color:${light ? '#fff' : INK}">MERIDIAN</span>
      <span class="sub"  style="color:${light ? SUB_LIGHT : SUB_DARK}">INTERFACE</span>
    </div>`;

  // Mark-only boards get an explicit square box. Letting inline-flex shrink-wrap
  // leaves a stray sub-pixel, and a 387x384 "square" app icon gets rejected.
  const box = markOnly ? `width:${M + pad * 2}px;height:${M + pad * 2}px;justify-content:center;` : '';
  return `<div class="board" id="${id}" style="padding:${pad}px;${box}${
    tile ? `background:${NAVY};border-radius:${Math.round(M * 0.22)}px;` : ''
  }">${svg}${type}</div>`;
}

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Hanken Grotesk';font-weight:400 900;src:url(data:font/woff2;base64,${hanken}) format('woff2')}
@font-face{font-family:'Inter';font-weight:400 700;src:url(data:font/woff2;base64,${inter}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent}
.board{display:inline-flex;align-items:center;gap:50px;line-height:0}
svg{display:block}
.type{display:flex;flex-direction:column;justify-content:center;text-align:left}
.word{font-family:'Hanken Grotesk';font-weight:800;font-size:64px;line-height:1;
      letter-spacing:0.2em;text-transform:uppercase}
.sub{font-family:'Inter';font-weight:700;font-size:${Math.round(128*0.3056)}px;line-height:1;margin-top:14px;
     letter-spacing:0.28em;text-transform:uppercase}
</style>
${board('lockup-light', { light: false })}
${board('lockup-dark',  { light: true  })}
${board('mark',         { light: false, markOnly: true })}
${board('mark-tile',    { light: true,  markOnly: true, tile: true })}
`;

const files = {
  'meridian-lockup-light.png': 'lockup-light',
  'meridian-lockup-dark.png':  'lockup-dark',
  'meridian-mark.png':         'mark',
  'meridian-mark-tile.png':    'mark-tile',
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'meridian-mark.svg'), markSVG(false, { id: 'l' }));
fs.writeFileSync(path.join(OUT, 'meridian-mark-on-dark.svg'), markSVG(true, { id: 'd' }));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
// deviceScaleFactor 3 → the 128px mark lands at 384px, big enough for a
// letterhead or a 512px app icon without resampling artefacts.
const page = await browser.newPage({ deviceScaleFactor: 3 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

for (const [file, id] of Object.entries(files)) {
  // Clip to a rounded box rather than letting the locator decide. Flex layout
  // shrink-wraps to a fractional width, which a locator screenshot rounds up —
  // that is how a square app icon comes out 387x384 and gets rejected.
  const b = await page.locator(`#${id}`).boundingBox();
  await page.screenshot({
    path: path.join(OUT, file),
    omitBackground: true,   // real alpha, so it drops onto any background
    clip: {
      x: Math.round(b.x), y: Math.round(b.y),
      width: Math.round(b.width), height: Math.round(b.height),
    },
  });
  console.log(`  ${file.padEnd(28)} ${Math.round(b.width) * 3} x ${Math.round(b.height) * 3}`);
}
await browser.close();
console.log('\nWrote to', OUT);
