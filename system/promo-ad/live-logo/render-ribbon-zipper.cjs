// node render.cjs W H "query" out.mp4 [stills]   -> 8 s, 30 fps, seamless loop
const { chromium } = require('playwright'); const { spawn } = require('child_process');
(async()=>{const [W,H,q,out,mode]=[+process.argv[2],+process.argv[3],process.argv[4],process.argv[5],process.argv[6]||'video'];
const b=await chromium.launch();const p=await b.newPage({viewport:{width:W,height:H}});
await p.goto(`file://${__dirname}/flow.html?w=${W}&h=${H}&${q}`);await p.waitForFunction(()=>window.ready);
if(mode==='stills'){for(const t of [0,1.2,1.8,2.4,3.0,3.6,4.2,4.8,5.4,6.0,6.4,7.2]){await p.evaluate(x=>render(x),t);await p.screenshot({path:`${out}-t${t.toFixed(1)}.png`});}await b.close();return;}
const FPS=30,N=240;const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-c:v','png','-i','-','-c:v','libx264','-crf','15','-preset','medium','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',out]);
for(let i=0;i<N;i++){await p.evaluate(t=>render(t),i/FPS);const buf=await p.screenshot({type:'png'});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await b.close();console.log('done',out);})();
