const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, mode, arg] = process.argv;
const THREE_DIR = path.resolve('../tour/node_modules/three');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 1080 } });
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.route('http://badge.local/**', route => {
    const u = new URL(route.request().url());
    const f = u.pathname.startsWith('/three/') ? path.join(THREE_DIR, u.pathname.slice(7)) : path.join(process.cwd(), u.pathname);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await p.goto('http://badge.local/badge.html');
  await p.waitForFunction(() => window.__badge, null, { timeout: 60000 });
  const save = async (t, f) => { const d = await p.evaluate(t => window.__badge.draw(t), t); fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); };
  if (mode === 'stills'){ for (const t of arg.split(',')) await save(+t, `s3-${t}.png`); }
  else { fs.rmSync('seq3', { recursive: true, force: true }); fs.mkdirSync('seq3'); const dur = await p.evaluate(() => window.__badge.DUR); const n = Math.round(dur*24);
    for (let i = 0; i < n; i++) await save(i/24, `seq3/${String(i).padStart(3, '0')}.png`); console.log('frames', n); }
  await b.close();
})();
