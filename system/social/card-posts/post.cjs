const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
for(const [w,h,shape] of [[1080,1350,'4x5-feed'],[1080,1920,'9x16-story']])for(const [src,qr,tag] of [['card-noqr.png',0,'Without-QR'],['card-qr.png',1,'With-QR']]){
 const p=await b.newPage({viewport:{width:w,height:h}});await p.goto(`file://${__dirname}/post.html?w=${w}&h=${h}&src=${src}&qr=${qr}`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
 await p.screenshot({path:`${__dirname}/Meridian-Digital-Card-${tag}-${shape}.png`});await p.close();}
await b.close();})();
