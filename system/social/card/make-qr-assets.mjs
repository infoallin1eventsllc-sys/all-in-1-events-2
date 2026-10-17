// Renders the QR lock-screen wallpaper (PNG) and the print sheet (PDF + PNG) for
// Otis's digital business card at meridianinterface.com/card/.
//   node make-qr-assets.mjs
// Needs fonts/ next to qr-assets.html: ln -s <website>/public/fonts fonts
import { createRequire } from 'module';
import path from 'node:path';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const here = path.dirname(new URL(import.meta.url).pathname);
const page = `file://${here}/qr-assets.html`;
const b = await pw.chromium.launch();

const w = await b.newPage({ viewport: { width: 1179, height: 2556 } });
await w.goto(`${page}?v=wallpaper`); await w.evaluate(() => window.ready); await w.waitForTimeout(300);
await w.screenshot({ path: `${here}/meridian-card-qr-wallpaper.png` });

const p = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 3 });
await p.goto(`${page}?v=print`); await p.evaluate(() => window.ready); await p.waitForTimeout(300);
await p.screenshot({ path: `${here}/meridian-card-qr-print.png` });
await p.pdf({ path: `${here}/meridian-card-qr-print.pdf`, format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });

await b.close();
console.log('wrote wallpaper png, print png + pdf');
