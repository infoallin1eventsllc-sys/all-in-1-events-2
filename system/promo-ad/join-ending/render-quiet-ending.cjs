const { chromium } = require('playwright');(async()=>{const [N,OUT,FPS]=[+process.argv[2],process.argv[3],+(process.argv[4]||24)];
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto(`file://${process.cwd()}/endnew/ending.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
const list=process.env.ONLY?process.env.ONLY.split(',').map(Number):[...Array(N).keys()];
for(const k of list){await p.evaluate(t=>render(t),k/FPS);await p.screenshot({path:`${OUT}/${String(k).padStart(4,'0')}.png`});}
await b.close();console.log('frames',list.length);})();
