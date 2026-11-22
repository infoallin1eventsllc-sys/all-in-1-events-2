// Clean laptop clip: keep the footage whole on its own black ground (no cut-out), and re-seat the
// sharp dashboard from one clean frame onto the screen of every frame so the text never smears.
// 1) find the screen's four corners per frame (line fits on its edges)  2) smooth them over time
// 3) warp the reference screen onto each frame  4) save the framed region.
const { chromium } = require('playwright'); const fs=require('fs');
const N=+process.env.N||89, REF=+process.env.REF||16, CY=330, CH=1260, MODE=process.argv[2]||'all';
const b64=n=>'data:image/png;base64,'+fs.readFileSync(`full/s${String(n).padStart(3,'0')}.png`).toString('base64');
function solveH(src,dst){ // 4 point pairs -> 3x3 homography (h33=1)
 const A=[],B=[];for(let i=0;i<4;i++){const [x,y]=src[i],[u,v]=dst[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);B.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);B.push(v);}
 const n=8;for(let i=0;i<n;i++){let m=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[m][i]))m=r;[A[i],A[m]]=[A[m],A[i]];[B[i],B[m]]=[B[m],B[i]];
  for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];B[r]-=f*B[i];}}
 const h=new Array(n);for(let i=n-1;i>=0;i--){let s=B[i];for(let c=i+1;c<n;c++)s-=A[i][c]*h[c];h[i]=s/A[i][i];}return h;}
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});await p.goto(`file://${process.cwd()}/blank.html`);
let Q;
if(fs.existsSync('quads.json')&&MODE!=='detect')Q=JSON.parse(fs.readFileSync('quads.json'));
else{Q=[];for(let i=0;i<N;i++){Q.push(await p.evaluate(async src=>{const im=new Image();im.src=src;await im.decode();const W=im.width,H=im.height;
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,W,H).data;
  const L=new Float32Array(W*H);for(let k=0;k<W*H;k++)L[k]=Math.min(a[k*4],a[k*4+1],a[k*4+2]);
  const T=200,rows=new Int32Array(H);let mx=0;for(let Y=0;Y<H;Y++){let s=0;for(let X=0;X<W;X++)if(L[Y*W+X]>T)s++;rows[Y]=s;mx=Math.max(mx,s);}
  let y0=-1,y1=-1,best=[0,0,0];for(let Y=0;Y<H;Y++){if(rows[Y]>mx*.55){if(y0<0)y0=Y;y1=Y;}else if(y0>=0){if(y1-y0>best[2])best=[y0,y1,y1-y0];y0=-1;if(best[2]>120)break;}}
  [y0,y1]=best;const cols=new Int32Array(W);for(let X=0;X<W;X++){let s=0;for(let Y=y0;Y<=y1;Y++)if(L[Y*W+X]>T)s++;cols[X]=s;}
  let x0=0,x1=W-1;const hh=(y1-y0+1)*.5;while(x0<W&&cols[x0]<hh)x0++;while(x1>0&&cols[x1]<hh)x1--;
  const lv=120;
  const fit=pts=>{let use=pts;let a=0,bb=0;for(let it=0;it<3;it++){let n=use.length,sx=0,sy=0,sxx=0,sxy=0;for(const [u,v] of use){sx+=u;sy+=v;sxx+=u*u;sxy+=u*v;}
    a=(n*sxy-sx*sy)/(n*sxx-sx*sx);bb=(sy-a*sx)/n;const res=pts.map(([u,v])=>Math.abs(v-(a*u+bb)));const srt=[...res].sort((p,q)=>p-q),med=srt[srt.length>>1];use=pts.filter((q,i)=>res[i]<=Math.max(.6,med*2.5));}return [a,bb];};
  // vertical edges: x = a*Y + b ; horizontal edges: y = a*X + b
  const vEdge=(dir,xs)=>{const pts=[];for(let Y=Math.round(y0+(y1-y0)*.1);Y<y0+(y1-y0)*.9;Y+=2){let X=xs;while(X>1&&X<W-2&&L[Y*W+X]>lv)X+=dir;const inn=L[Y*W+X-dir],o=L[Y*W+X];if(inn>lv&&o<=lv)pts.push([Y,(X-dir)+dir*(inn-lv)/(inn-o)]);}return fit(pts);};
  const hEdge=(dir,ys)=>{const pts=[];for(let X=Math.round(x0+(x1-x0)*.1);X<x0+(x1-x0)*.9;X+=2){let Y=ys;while(Y>1&&Y<H-2&&L[Y*W+X]>lv)Y+=dir;const inn=L[(Y-dir)*W+X],o=L[Y*W+X];if(inn>lv&&o<=lv)pts.push([X,(Y-dir)+dir*(inn-lv)/(inn-o)]);}return fit(pts);};
  const Lf=vEdge(-1,x0+8),Rt=vEdge(1,x1-8),Tp=hEdge(-1,y0+8),Bt=hEdge(1,y1-8);
  const X_=(v,h)=>{const y=(h[0]*v[1]+h[1])/(1-h[0]*v[0]);return [v[0]*y+v[1],y];}; // x=av*y+bv ; y=ah*x+bh
  return [X_(Lf,Tp),X_(Rt,Tp),X_(Rt,Bt),X_(Lf,Bt)];},b64(i)));}
 // smooth each coordinate over time with a 1-2-1 kernel, twice
 for(let pass=0;pass<2;pass++){const S=Q.map(q=>q.map(c=>c.slice()));for(let i=1;i<N-1;i++)for(let k=0;k<4;k++)for(let d=0;d<2;d++)S[i][k][d]=(Q[i-1][k][d]+2*Q[i][k][d]+Q[i+1][k][d])/4;Q=S;}
 fs.writeFileSync('quads.json',JSON.stringify(Q));}
if(MODE==='detect'){Q.forEach((q,i)=>{if(i%8==0)console.log(i,q.map(c=>c.map(v=>v.toFixed(1)).join(',')).join('  '));});await b.close();return;}
// reference screen, rectified to a plain rectangle
const rq=Q[REF], RW=Math.round(Math.hypot(rq[1][0]-rq[0][0],rq[1][1]-rq[0][1])), RH=Math.round(Math.hypot(rq[3][0]-rq[0][0],rq[3][1]-rq[0][1]));
const GROW=1.0, PAD=2; // paste covers 1px past the screen edge; reference trimmed 2px so no bezel comes along
const grow=(q,g)=>{const cx=(q[0][0]+q[1][0]+q[2][0]+q[3][0])/4,cy=(q[0][1]+q[1][1]+q[2][1]+q[3][1])/4;return q.map(([x,y])=>[x+Math.sign(x-cx)*g,y+Math.sign(y-cy)*g]);};
await p.setContent(`<body style="margin:0;background:#000;overflow:hidden"><img id="f" style="position:absolute;left:0;top:0;width:1080px;height:1920px">
<div id="w" style="position:absolute;left:0;top:0;width:${RW}px;height:${RH}px;transform-origin:0 0;overflow:hidden;border-radius:3px"><img id="r" style="position:absolute;transform-origin:0 0"></div></body>`);
// the reference image inside #w: the ref frame, itself warped so its screen quad fills the RWxRH box
const m3=h=>`matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
const box=[[0,0],[RW,0],[RW,RH],[0,RH]];
await p.evaluate(async({src,t})=>{const r=document.getElementById('r');r.src=src;await r.decode();r.style.width='1080px';r.style.height='1920px';r.style.transform=t;},{src:b64(REF),t:m3(solveH(rq,[[-PAD,-PAD],[RW+PAD,-PAD],[RW+PAD,RH+PAD],[-PAD,RH+PAD]]))});
const frames=MODE==='all'?[...Array(N).keys()]:MODE.split(',').map(Number);
for(const i of frames){await p.evaluate(async({src,t,on})=>{const f=document.getElementById('f');f.src=src;await f.decode();const w=document.getElementById('w');w.style.transform=t;w.style.display=on?'block':'none';},{src:b64(i),t:m3(solveH(box,grow(Q[i],GROW))),on:!process.env.RAW});
 await p.screenshot({path:`${process.env.OUT||'clipc'}/c${String(i).padStart(3,'0')}.png`,clip:{x:0,y:CY,width:1080,height:CH}});}
await b.close();console.log('cleaned',frames.length,'ref',REF,RW+'x'+RH);})();
