const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto(`file://${__dirname}/story.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
await p.screenshot({path:`${__dirname}/Meridian-Instagram-Story-Link.png`});await b.close();})();
