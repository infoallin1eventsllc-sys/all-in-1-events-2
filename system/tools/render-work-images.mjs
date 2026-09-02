/**
 * Renders the portfolio and service images for the Meridian site.
 *
 *   node render-work-images.mjs [out-dir]      (needs playwright-core)
 *
 * Writes PNGs to the website's public/images/work/. Every scene is HTML, so a
 * change is a code change with a diff, not a re-export from a design tool
 * nobody else can open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { RESET, W, H } from './work-scenes/base.mjs';
import * as D from './work-scenes/dashboards.mjs';
import * as P from './work-scenes/products.mjs';
import * as B from './work-scenes/brand.mjs';
import * as S from './work-scenes/services.mjs';

const OUT = process.argv[2] || '/workspace/meridian-interface-website/public/images/work';

/** Light and dark grounds. Each scene picks one; the tokens are the same names
    either way so a scene body never branches on theme. */
const LIGHT = `--bg:#fbfcfd;--card:#ffffff;--ink:#1b2430;--dim:#6b7684;--line:#e2e7ee`;
const DARK  = `--bg:#0d1117;--card:#141a22;--ink:#e6ebf1;--dim:#8b96a3;--line:#232c37`;

const SCENES = {
  /* Portfolio concepts */
  'bi-dashboard':      { html: D.finance,       theme: LIGHT },
  'crm-pipeline':      { html: D.crm,           theme: LIGHT },
  'analytics-hub':     { html: D.analytics,     theme: DARK  },
  'cloud-platform':    { html: P.cloud,         theme: LIGHT },
  'banking-app':       { html: P.banking,       theme: DARK  },
  'fitness-app':       { html: P.fitness,       theme: LIGHT },
  'coffee-identity':   { html: B.coffee,        theme: LIGHT },
  'storefront':        { html: P.storefront,    theme: LIGHT },
  /* Service cards */
  'svc-web':           { html: S.webDesign,     theme: LIGHT },
  'svc-app':           { html: S.appDesign,     theme: DARK  },
  'svc-dashboard':     { html: S.dashboardDesign, theme: LIGHT },
  'svc-logo':          { html: S.logoDesign,    theme: LIGHT },
  'svc-full':          { html: S.fullPackage,   theme: DARK  },
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const [name, { html, theme }] of Object.entries(SCENES)) {
  await page.setContent(
    `<!doctype html><meta charset=utf-8><style>${RESET}:root{${theme}}</style>
     <div class="scene">${html()}</div>`,
    { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // JPEG, not PNG. These grounds are gradients, which PNG stores badly — the
  // set came to 2.6MB as PNG and a third of that as JPEG at a quality where no
  // artefact is visible at the size these are displayed.
  const file = path.join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  console.log(`  ${name.padEnd(18)} ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}
await browser.close();
console.log('\nwrote to', OUT);
