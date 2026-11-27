const { chromium } = require('playwright');
const [,, W, H, out, ...times] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + process.cwd() + '/grow.html?render', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__render && window.__render.ready());
  console.log(JSON.stringify(await p.evaluate(([w,h]) => { const L = window.__render.layout(+w,+h); return { nodeT: L.nodeT.map(x=>+x.toFixed(3)), frac0: L.frac0 }; }, [W,H])));
  const fs = require('fs');
  for (const t of times){
    const d = await p.evaluate(([t,w,h]) => { window.__render.draw(+t, +w, +h); return document.getElementById('c').toDataURL('image/jpeg', .9); }, [t, W, H]);
    fs.writeFileSync(`${out}-${t}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  }
  await b.close();
})();
