import { chromium } from 'playwright';
import { mkdirSync, existsSync, statSync, createReadStream } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize } from 'path';
const T={'.html':'text/html','.woff2':'font/woff2','.woff':'font/woff','.js':'text/javascript'};
const root=process.cwd();
const srv=createServer((q,s)=>{const p=join(root,normalize(decodeURIComponent(q.url.split('?')[0])));
 if(!p.startsWith(root)||!existsSync(p)||!statSync(p).isFile()){s.writeHead(404);return s.end()}
 s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});createReadStream(p).pipe(s)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;

const FPS=30, DUR=7.7;
const ONLY=process.argv[2]==='probe';
const N=ONLY?3:Math.round(FPS*DUR);
const dir=ONLY?'probe':'film';
mkdirSync(dir,{recursive:true});

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--no-sandbox','--disable-dev-shm-usage','--force-color-profile=srgb','--font-render-hinting=none']});
const pg=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/sting.html`,{waitUntil:'load'});
await pg.waitForFunction('window.__ready===true',null,{timeout:60000});
const el=await pg.$('#frame');
const ts = ONLY ? [0.40,0.68,0.82] : Array.from({length:N},(_,i)=>i/(N-1));
for (let i=0;i<ts.length;i++){
  await pg.evaluate(t=>window.renderFrame(t), ts[i]);
  await el.screenshot({path:`${dir}/f${String(i).padStart(4,'0')}.png`});
}
console.log('captured',ts.length,'frames at 3840x2160; errors:',errs.length,errs.slice(0,3));
await b.close(); srv.close();
