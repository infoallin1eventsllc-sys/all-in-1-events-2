const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
for(const [path,name] of [['/card/','card-noqr'],['/card3/','card-qr']]){
 const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
 const errs=[];p.on('requestfailed',r=>errs.push(r.url()));
 await p.goto('http://127.0.0.1:4840'+path,{waitUntil:'networkidle'});await p.waitForTimeout(3200);
 await p.screenshot({path:`${__dirname}/${name}.png`});
 const h=await p.evaluate(()=>document.documentElement.scrollHeight);console.log(name,'pageHeight',h,'failed',errs);await p.close();}
await b.close();})();
