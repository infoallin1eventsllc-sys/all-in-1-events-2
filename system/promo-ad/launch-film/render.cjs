const { chromium } = require('playwright'); const { spawn } = require('child_process');
(async()=>{const [mode,fmt,arg]=process.argv.slice(2);
const SZ={'16x9':[1920,1080],'9x16':[1080,1920],'4x5':[1080,1350],'1x1':[1080,1080]}[fmt];
const b=await chromium.launch();const p=await b.newPage({viewport:{width:SZ[0],height:SZ[1]},deviceScaleFactor:mode==='stills'?0.5:1});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`file://${process.cwd()}/film5.html?fmt=${fmt}`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
if(mode==='stills'){for(const t of arg.split(',')){await p.evaluate(x=>render(x),+t);await p.screenshot({path:`chk5/${fmt}-t${t}.jpg`,type:'jpeg',quality:82});}
 console.log(fmt,'errors',errs.slice(0,3));await b.close();return;}
if(mode==='cover'){await p.evaluate(x=>render(x),25.25);await p.screenshot({path:arg,type:'jpeg',quality:94});await b.close();return;}
const FPS=30,DUR=32,t0=Date.now();
const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-profile:v','high','-crf','17','-preset','medium','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',arg]);
for(let i=0;i<FPS*DUR;i++){await p.evaluate(t=>render(t),i/FPS);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await b.close();console.log('done',arg,Math.round((Date.now()-t0)/1000)+'s','errors',errs.slice(0,3));})();
