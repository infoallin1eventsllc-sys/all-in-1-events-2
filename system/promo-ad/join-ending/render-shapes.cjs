const { chromium } = require('playwright');(async()=>{const [q,W,H,OUT]=[process.argv[2],+process.argv[3],+process.argv[4],process.argv[5]];
const b=await chromium.launch();const p=await b.newPage({viewport:{width:W,height:H}});
await p.goto(`file://${process.cwd()}/endnew/shapes.html?w=${W}&h=${H}&${q}`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
const list=process.env.ONLY?process.env.ONLY.split(',').map(Number):[...Array(371).keys()];
for(const f of list){await p.evaluate(x=>render(x),f);await p.screenshot({path:`${OUT}/${String(f).padStart(4,'0')}.png`});}
await b.close();console.log(OUT,'frames',list.length);})();
