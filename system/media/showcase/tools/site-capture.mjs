// The homepage as the large pane shows it: 1440x900 at 1.333x, demo bar hidden.
// 'poster' keeps the hero's still frame; 'plain' hides the backdrop media.
import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [,, base, out] = process.argv;
const b = await pw.chromium.launch();
for (const variant of ['poster', 'plain']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.333, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.route(/supabase\.co|posthog/, r => r.abort());
  await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await p.addStyleTag({ content: '#meridian-demo-bar{display:none!important} body{padding-top:0!important} :root{--meridian-bar:0px!important}' + (variant === 'plain' ? ' section [aria-hidden="true"] img, section [aria-hidden="true"] video{display:none!important}' : '') });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/site-${variant}.png` }); console.log('ok', variant);
  await ctx.close();
}
await b.close();
