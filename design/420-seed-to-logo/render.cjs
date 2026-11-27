const { chromium } = require('playwright');
const { spawn } = require('child_process');
const [,, W, H, out] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + process.cwd() + '/grow.html?render', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__render && window.__render.ready());
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-',
    '-i', 'sound.wav', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(12.5 * 30);
  for (let i = 0; i < frames; i++){
    const d = await p.evaluate(([t, w, h]) => { window.__render.draw(t, w, h); return document.getElementById('c').toDataURL('image/jpeg', 0.95); }, [i/30, +W, +H]);
    if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await b.close(); console.log('done', out, frames);
})();
