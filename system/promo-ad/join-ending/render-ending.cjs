// Render the launch film's logo ending on its own (no tagline overlap), 9:16, 24 fps,
// with PAD seconds of the clip's plain navy first frame held before it starts.
const { chromium } = require('playwright');(async()=>{const PAD=+process.argv[2], N=+process.argv[3], OUT=process.argv[4];
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto(`file://${process.cwd()}/film5.html?fmt=9x16`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
for(let k=0;k<N;k++){const te=Math.max(0,k/24-PAD);
 await p.evaluate(async t=>{st.innerHTML=ending(E0+t);st.firstElementChild.style.opacity=1;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));},te);
 await p.screenshot({path:`${OUT}/${String(k).padStart(4,'0')}.png`});}
await b.close();console.log('ending frames',N);})();
