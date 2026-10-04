import { chromium } from 'playwright';
import { mkdirSync, createReadStream, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize } from 'path';

const TYPES={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'};
const root = process.cwd();
const server = createServer((req,res)=>{
  const p = join(root, normalize(decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200,{'Content-Type':TYPES[extname(p)]||'application/octet-stream'});
  createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port = server.address().port;

const FRAMES = 48;
mkdirSync('frames',{recursive:true});
const browser = await chromium.launch({
  executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars']
});
const page = await browser.newPage({ viewport:{width:1600,height:1200}, deviceScaleFactor:1 });
const errs=[];
page.on('pageerror',e=>errs.push('pageerror: '+e.message));
page.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
page.on('requestfailed',r=>errs.push('reqfail: '+r.url()+' '+r.failure()?.errorText));
await page.goto(`http://127.0.0.1:${port}/scene.html`, { waitUntil:'load' });
try {
  await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
} catch (e) {
  console.error('NOT READY. Errors captured:'); errs.slice(0,8).forEach(x=>console.error('  '+x));
  await browser.close(); server.close(); process.exit(1);
}
const el = await page.$('canvas');
for (let i=0;i<FRAMES;i++){
  await page.evaluate(t=>window.renderFrame(t), i/(FRAMES-1));
  await el.screenshot({ path:`frames/f${String(i).padStart(3,'0')}.png` });
}
console.log('rendered',FRAMES,'frames; errors:',errs.length);
errs.slice(0,4).forEach(x=>console.log('  '+x));
await browser.close(); server.close();
