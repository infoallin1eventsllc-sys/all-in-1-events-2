const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const [,, mode, out, stills] = process.argv;
const N = 134, FPS = 24, IN = 0.35, PLAY = N/FPS, TOTAL = IN + PLAY + 2.6;
(async () => {
  const b = await chromium.launch();
  const ctx = mode === 'phone'
    ? await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    : await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + process.cwd() + '/preview-D.html', { waitUntil: 'load' });
  // preload every frame as a data URL so swaps are instant
  const urls = [...Array(N).keys()].map(i => 'data:image/png;base64,' + fs.readFileSync(`seq/${String(i).padStart(3,'0')}.png`).toString('base64'));
  await p.evaluate(async urls => { window.__f = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; }))); }, urls);
  await p.waitForTimeout(1200);
  const setT = t => p.evaluate(([t, N, FPS, IN, PLAY]) => {
    const im = document.getElementById('orbit'), sh = document.getElementById('orbit-shadow');
    const k = Math.max(0, Math.min(N-1, Math.floor((t - IN)*FPS)));
    if (im.dataset.k !== String(k)) { im.src = window.__f[k].src; im.dataset.k = k; }
    const a = Math.min(1, t/IN), e = 1 - Math.pow(1 - a, 3);
    const idle = Math.max(0, t - IN - PLAY), fl = -10*Math.sin(idle*Math.PI/3)**2*Math.min(1, idle/0.6);
    im.style.opacity = e; im.style.transform = `translateY(${fl}px) scale(${0.9 + 0.1*e})`;
    sh.style.opacity = e*(1 + fl/40); sh.style.transform = `scale(${1 + fl/90})`;
    return im.decode().catch(() => {}).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  }, [t, N, FPS, IN, PLAY]);
  if (stills){ for (const t of stills.split(',')){ await setT(+t); await p.screenshot({ path: `${out}-${t}.png` }); } await b.close(); return; }
  const ff = spawn('ffmpeg', ['-y','-loglevel','error','-f','image2pipe','-framerate','24','-i','-','-c:v','libx264','-crf','19','-preset','medium','-pix_fmt','yuv420p','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-movflags','+faststart', out], { stdio: ['pipe','inherit','inherit'] });
  for (let i = 0; i < Math.round(TOTAL*24); i++){
    await setT(i/24);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('done', out);
})();
