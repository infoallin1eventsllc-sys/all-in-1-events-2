// Join the Higgsfield clip to the logo ending as one move: A pushes in and dims, B settles from 1.06 to 1.
const { chromium } = require('playwright'); const fs=require('fs');
const P0=200, X0=213, XN=30, BS=30; // push starts, crossfade starts (A frame), crossfade frames, B settle frames
const se=x=>.5-.5*Math.cos(Math.PI*Math.min(1,Math.max(0,x)));
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
fs.writeFileSync('blend.html',`<body style="margin:0;background:#0b1530;overflow:hidden"><img id="a" style="position:absolute;inset:0;width:1080px;height:1920px;transform-origin:50% 42%"><img id="b" style="position:absolute;inset:0;width:1080px;height:1920px;transform-origin:50% 30%"></body>`);
await p.goto('file://'+process.cwd()+'/blend.html');
const aN=fs.readdirSync('A').length;
for(let f=P0; f<X0+BS; f++){
 const z=se((f-P0)/(aN-1-P0)), e=se((f-X0)/XN), s=se((f-X0)/BS);
 const ai=Math.min(f,aN-1), bi=f-X0;
 await p.evaluate(async({a,bsrc,az,ab,bo,bz})=>{const A=document.getElementById('a'),B=document.getElementById('b');
  A.src=a;await A.decode();A.style.transform=`scale(${az})`;A.style.filter=`brightness(${ab})`;
  if(bsrc){B.src=bsrc;await B.decode();B.style.display='block';}else B.style.display='none';
  B.style.opacity=bo;B.style.transform=`scale(${bz})`;},
  {a:'A/'+String(ai).padStart(4,'0')+'.png',bsrc:bi>=0?'B2/'+String(bi).padStart(4,'0')+'.png':null,az:1+0.09*z,ab:1-0.35*e,bo:e,bz:1});
 await p.screenshot({path:`C/${String(f).padStart(4,'0')}.png`});}
await b.close();console.log('composited',X0+BS-P0);})();
