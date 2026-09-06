// Frame-sequence renderer for a Clipkit Source, for machines whose Chrome has
// no WebCodecs H.264 encoder (Playwright's open-source Chromium). Loads the
// @clipkit/renderer harness once, patches it to expose the runtime, renders
// every frame, and pipes PNGs into ffmpeg.
//   node frames.mjs source.json out.mp4 [ffmpegPath]
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { HARNESS_JS } from './node_modules/@clipkit/renderer/dist/harness/embedded.js';

const [,, srcPath, outPath, ffmpegPath = 'ffmpeg'] = process.argv;
const source = JSON.parse(readFileSync(srcPath, 'utf8'));
const W = source.width ?? 1920, H = source.height ?? 1080;
const fps = source.fps ?? 30, dur = source.duration;
const total = process.env.MAX ? Number(process.env.MAX) : Math.round(dur * fps);
const START = process.env.START ? Number(process.env.START) : 0;

// expose the runtime instance the harness creates inside renderStill
const patched = HARNESS_JS.replaceAll('let o=new Us(n);', 'let o=new Us(n);window.__rt=o;');
if (patched === HARNESS_JS) throw new Error('harness patch point not found');

const server = createServer((_q, res) => { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><html><body></body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: true, channel: 'chrome',
  args: ['--use-gl=angle','--use-angle=gl-egl','--enable-gpu','--ignore-gpu-blocklist','--use-cmd-decoder=passthrough','--no-sandbox','--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
let ready; const first = new Promise(r => ready = r);
await page.exposeFunction('__clipkitStillReady', () => ready());
await page.exposeFunction('__clipkitReportError', m => { console.error('harness error:', m); process.exit(2); });
page.on('pageerror', e => { console.error('page error:', e.message); process.exit(2); });
page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.error('[page]', m.text()); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: patched });
page.evaluate(([s]) => window.renderStill(JSON.parse(s), { time: 0, backend: 'auto' }), [JSON.stringify(source)]).catch(() => {});
await first;
await page.evaluate(([s]) => { window.__src = JSON.parse(s); }, [JSON.stringify(source)]);

const ff = spawn(ffmpegPath, ['-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','png','-i','-',
  '-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart', outPath], { stdio: ['pipe','inherit','inherit'] });
const write = buf => new Promise(r => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', r); else r(); });

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = START + i / fps;
  const b64 = await page.evaluate(async ([t]) => {
    await window.__rt.renderAsync(window.__src, t);
    await window.__rt.gpuFinish();
    return document.getElementById('__clipkit_still').toDataURL('image/png').slice(22);
  }, [t]);
  await write(Buffer.from(b64, 'base64'));
  if (i % 60 === 0) console.log(`frame ${i}/${total}  ${((Date.now()-t0)/1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on('close', c => c === 0 ? r() : j(new Error('ffmpeg exit ' + c))));
await browser.close(); server.close();
console.log('done', outPath, ((Date.now()-t0)/1000).toFixed(0) + 's');
