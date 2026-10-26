import { createRequire } from 'module';
const req = createRequire(import.meta.url);
let chromium; try { chromium = req('playwright').chromium; } catch { chromium = req(process.env.PW_PATH || '/usr/local/lib/node_modules/playwright').chromium; }
const D = process.argv[2]; const b = await chromium.launch();
const shot = async (url, file, vp, scale, act) => {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: scale, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('goto', url, e.message));
  await p.waitForTimeout(1500); if (act) await act(p); await p.waitForTimeout(800);
  await p.screenshot({ path: `${D}/img/${file}` }); console.log('shot', file); await p.close();
};
await shot('https://meridianinterface.com/', 'home.png', { width: 430, height: 932 }, 2);
await shot('https://meridianinterface.com/', 'booking.png', { width: 430, height: 932 }, 2, async p => { await p.getByText(/^book$/i).first().click({ timeout: 10000 }).catch(() => p.locator('button:has-text("Book")').first().click({ timeout: 10000 })); await p.waitForTimeout(1500); });
await shot('https://meridianinterface.com/demos/big-boy-subs/', 'store.png', { width: 430, height: 932 }, 2);
await shot('https://meridianinterface.com/demos/meridian-crm/', 'crm.png', { width: 1280, height: 800 }, 1.5);
await b.close();
