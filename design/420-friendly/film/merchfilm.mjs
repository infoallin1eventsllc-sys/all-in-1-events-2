/* Merch reel from product stills. Apple language: pure black, slow push per
   shot, one specular pass per shot, cross-dissolves, headline beat at the end.
   All timing is a fraction of the total, so any duration works.

   node merchfilm.mjs "a.png,b.png,c.png" out.mp4 "Everybody's invited." 20
*/
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync, statSync, createReadStream } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize, resolve, basename, dirname } from 'path';
import { execFileSync } from 'child_process';

const [imgArg, out, headline = '', durArg] = process.argv.slice(2);
if (!imgArg || !out) { console.error('need "<img[,img...]>" <out.mp4> ["Headline"] [seconds]'); process.exit(1); }
const DUR = Number(durArg) || 7.7, FPS = 30, N = Math.round(DUR * FPS);
const imgs = imgArg.split(',').map(s => resolve(s.trim()));
for (const p of imgs) if (!existsSync(p)) { console.error('missing image:', p); process.exit(1); }

const TYPES = {'.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2'};
const roots = [process.cwd(), ...new Set(imgs.map(dirname))];
const srv = createServer((q, s) => {
  const rel = normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^\/+/, '');
  for (const r of roots) {
    const p = join(r, rel);
    if (p.startsWith(r) && existsSync(p) && statSync(p).isFile()) {
      s.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
      return createReadStream(p).pipe(s);
    }
  }
  s.writeHead(404); s.end();
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const shots = imgs.map((p, i) =>
  `<div class="shot" id="s${i}"><img src="http://127.0.0.1:${port}/${encodeURIComponent(basename(p))}" alt="">
     <div class="sw" id="w${i}"></div></div>`).join('\n');

const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'Archivo';font-weight:800;font-display:block;
  src:url('http://127.0.0.1:${port}/node_modules/@fontsource/archivo/files/archivo-latin-800-normal.woff2') format('woff2')}
html,body{margin:0;background:#000;overflow:hidden}
#f{position:relative;width:1920px;height:1080px;background:#000;overflow:hidden}
.shot{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  transform-origin:50% 50%;opacity:0}
.shot img{max-width:76%;max-height:86%;object-fit:contain;display:block;
  filter:contrast(1.12) saturate(1.05) brightness(.98)}
/* specular pass, confined to the shot's own box */
.sw{position:absolute;inset:0;pointer-events:none;opacity:0;mix-blend-mode:overlay;
  background:linear-gradient(102deg,transparent 41%,rgba(255,255,255,.50) 48%,
    rgba(255,255,255,.92) 50.5%,rgba(255,255,255,.50) 53%,transparent 59%);
  background-size:260% 100%;background-repeat:no-repeat}
#ln{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;
  font:800 104px/1.08 'Archivo',system-ui,sans-serif;letter-spacing:-.032em;color:#F5F7F2;
  text-align:center;opacity:0;padding:0 8%}
#vg{position:absolute;inset:0;z-index:6;pointer-events:none;
  background:radial-gradient(128% 94% at 50% 50%,transparent 56%,rgba(0,0,0,.72) 100%)}
#gr{position:absolute;inset:0;z-index:7;pointer-events:none;opacity:.045;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='.55'/></svg>");
  background-size:200px 200px}
</style>
<div id="f">
  ${shots}
  <div id="ln">${headline.replace(/[<>&]/g, '')}</div>
  <div id="vg"></div><div id="gr"></div>
</div>
<script>
var DUR=${DUR}, COUNT=${imgs.length}, HAS_LINE=${headline ? 'true' : 'false'};
var shots=[],sws=[];
for (var i=0;i<COUNT;i++){shots.push(document.getElementById('s'+i));sws.push(document.getElementById('w'+i));}
var ln=document.getElementById('ln'), gr=document.getElementById('gr');

function cl(v){return v<0?0:v>1?1:v}
function sp(t,a,b){return b<=a?(t>=b?1:0):cl((t-a)/(b-a))}
function oc(x){return 1-Math.pow(1-x,3)}
function io(x){return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2}
function mx(a,b,k){return a+(b-a)*k}

// Beats as fractions of the whole, so 7s and 20s are the same film at different lengths.
var LINE_IN=0.70, LINE_FULL=0.82;      // headline rises
var REC_IN =0.66, REC_FULL=0.80;       // last shot recedes behind it
var SEG=1/COUNT, XF=Math.min(0.55/DUR, SEG*0.34);   // cross-dissolve, in fractions

window.renderFrame=function(p){
  for (var i=0;i<COUNT;i++){
    var a=i*SEG, b=a+SEG;
    // hold through the dissolve on both sides; first and last don't fade off-frame
    var inA =(i===0)?0:a-XF, inB=(i===0)?0.035:a+XF;
    var outA=(i===COUNT-1)?1:b-XF, outB=(i===COUNT-1)?1:b+XF;
    var vis=cl(sp(p,inA,inB))*(1-cl(sp(p,outA,outB)));

    // local progress drives this shot's own push
    var local=cl((p-a)/SEG);
    var push=mx(1.0,1.075,oc(local));
    var drift=mx(0,-16,local);

    // the last shot recedes so the headline owns the frame
    var rec=(HAS_LINE&&i===COUNT-1)?io(sp(p,REC_IN,REC_FULL)):0;

    shots[i].style.opacity=(vis*mx(1,0.12,rec)).toFixed(4);
    shots[i].style.transform='translate('+drift.toFixed(2)+'px,'+mx(0,-150,rec).toFixed(2)+'px) scale('+mx(push,push*0.86,rec).toFixed(5)+')';

    // one specular pass per shot, at the middle of its own segment
    var s=sp(local,0.34,0.72);
    sws[i].style.opacity=(vis>0.02&&s>0&&s<1?Math.sin(s*Math.PI)*0.85:0).toFixed(4);
    sws[i].style.backgroundPosition=mx(115,-15,s).toFixed(2)+'% 0';
  }
  if(HAS_LINE){
    var h=oc(sp(p,LINE_IN,LINE_FULL));
    ln.style.opacity=h.toFixed(4);
    ln.style.transform='translateY('+mx(22,0,h).toFixed(2)+'px)';
  }
  var g=Math.floor(p*DUR*3.4)%8;
  gr.style.backgroundPosition=(g*37%200)+'px '+(g*91%200)+'px';
};
Promise.all(Array.prototype.map.call(document.images,function(im){
  return im.complete?Promise.resolve():new Promise(function(r){im.onload=im.onerror=r});
})).then(function(){return document.fonts.ready}).then(function(){
  window.renderFrame(0); window.__ready=true;
});
</script>`;

const dir = `mf_${Date.now()}`;
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'] });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.setContent(html, { waitUntil: 'load' });
await pg.waitForFunction('window.__ready===true', null, { timeout: 90000 });
const el = await pg.$('#f');
for (let i = 0; i < N; i++) {
  await pg.evaluate(t => window.renderFrame(t), i / (N - 1));
  await el.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png` });
}
await b.close(); srv.close();
if (errs.length) console.error('page errors:', errs.slice(0, 3));

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS),
  '-i', `${dir}/f%04d.png`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${out} — ${imgs.length} shot(s), ${N} frames at 3840x2160, ${DUR}s`);
