// Cut the laptop out of its black ground: flood-fill the dark ground in from the frame edges,
// close small leaks, feather one pixel. Writes RGBA PNGs.
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto(`file://${process.cwd()}/blank.html`);
const N=+process.argv[2]||73, T=+process.argv[3]||30;
for(let i=1;i<=N;i++){const n=String(i).padStart(3,'0');
 const src='data:image/png;base64,'+fs.readFileSync(`clipsrc/f${n}.png`).toString('base64');
 const out=await p.evaluate(async({src,T})=>{
  const im=new Image();im.src=src;await im.decode();const W=im.width,H=im.height;
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(im,0,0);
  const d=x.getImageData(0,0,W,H),a=d.data,n=W*H;
  const dark=new Uint8Array(n);for(let k=0;k<n;k++){const j=k*4;dark[k]=(Math.max(a[j],a[j+1],a[j+2])<T)?1:0;}
  const bg=new Uint8Array(n),st=new Int32Array(n);let sp=0;
  const push=k=>{if(dark[k]&&!bg[k]){bg[k]=1;st[sp++]=k;}};
  for(let X=0;X<W;X++){push(X);push((H-1)*W+X);}for(let Y=0;Y<H;Y++){push(Y*W);push(Y*W+W-1);}
  while(sp){const k=st[--sp],X=k%W;if(X>0)push(k-1);if(X<W-1)push(k+1);if(k>=W)push(k-W);if(k<n-W)push(k+W);}
  // closing on the object mask (radius R): dilate then erode, separable
  const R=4;let m=new Uint8Array(n);for(let k=0;k<n;k++)m[k]=bg[k]?0:1;
  const pass=(src,horiz,isMax)=>{const o=new Uint8Array(n);for(let Y=0;Y<H;Y++)for(let X=0;X<W;X++){let v=isMax?0:1;
    for(let r=-R;r<=R;r++){const xx=horiz?X+r:X,yy=horiz?Y:Y+r;if(xx<0||yy<0||xx>=W||yy>=H)continue;const s=src[yy*W+xx];if(isMax){if(s){v=1;break;}}else{if(!s){v=0;break;}}}
    o[Y*W+X]=v;}return o;};
  m=pass(pass(m,true,true),false,true);m=pass(pass(m,true,false),false,false);
  // feather: 3x3 mean of the mask
  for(let Y=0;Y<H;Y++)for(let X=0;X<W;X++){let s=0,c2=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=X+dx,yy=Y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;s+=m[yy*W+xx];c2++;}
   a[(Y*W+X)*4+3]=Math.round(255*s/c2);}
  x.putImageData(d,0,0);return c.toDataURL('image/png').split(',')[1];},{src,T});
 fs.writeFileSync(`clipa/f${n}.png`,Buffer.from(out,'base64'));}
await b.close();console.log('matted',N);})();
