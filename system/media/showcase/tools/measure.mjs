import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node22/lib/node_modules/playwright');
const [,, url, out] = process.argv;
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
// Project each pane's corners to the screen over the loop: overall extent, and the smallest on-screen width of each pane.
const r = await p.evaluate(async () => {
  const res = { minX: 1, maxX: 0, phoneW: 1, cardW: 1, bigW: 1 };
  for (const t of [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5]) {
    window.renderAt(t);
    for (const [name, pane] of Object.entries(window.__panes)) {
      const { w, h } = pane.userData; const xs = [];
      for (const [x, y] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) {
        const v = new window.__THREE.Vector3(x, y, 0).applyMatrix4(pane.matrixWorld).project(window.__camera);
        xs.push((v.x + 1) / 2);
      }
      const lo = Math.min(...xs), hi = Math.max(...xs);
      res.minX = Math.min(res.minX, lo); res.maxX = Math.max(res.maxX, hi);
      res[name + 'W'] = Math.min(res[name + 'W'], hi - lo);
    }
  }
  return res;
});
console.log(JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(3)]))));
if (out) { await p.evaluate(() => window.renderAt(4.2)); await p.screenshot({ path: out }); }
await b.close();
