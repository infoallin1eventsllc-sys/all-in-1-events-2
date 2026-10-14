import { createRequire } from 'module';
const pw = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const dir = process.argv[2];
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
await p.goto('file://' + dir + '/ad.html', { waitUntil: 'load' }); await p.evaluate(() => window.readyForFrames); await p.waitForTimeout(600);
await p.evaluate(() => {
  window.render(6.9);
  const d = document.createElement('div');
  d.innerHTML = '<div style="position:absolute;inset:0;background:rgba(10,16,32,.35)"></div><div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:120px;height:120px;border-radius:50%;background:#2563eb;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 6px rgba(255,255,255,.9);display:grid;place-items:center"><svg width="52" height="52" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#fff"/></svg></div><div style="position:absolute;left:50%;top:calc(50% + 90px);transform:translateX(-50%);font:700 22px Inter;letter-spacing:.06em;color:#fff;text-shadow:0 2px 12px #000">Watch the video · 21 seconds</div>';
  document.getElementById('stage').appendChild(d);
});
await p.screenshot({ path: dir + '/out/meridian-promo-email-poster.jpg', type: 'jpeg', quality: 90 });
await b.close();
