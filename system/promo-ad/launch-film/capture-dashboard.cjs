// Capture the real Meridian Agent Dashboard (the demo in the website repo, served locally) for the film.
// Run a static server on the website's public/ folder at port 4823 first.
const { chromium } = require('playwright');(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1200,height:760},deviceScaleFactor:2});
await p.goto('http://127.0.0.1:4823/demos/agent-dashboard/');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(3000);
await p.addStyleTag({content:'.toast{display:none!important} *{caret-color:transparent!important}'});
await p.mouse.move(600,2);await p.waitForTimeout(500);
// 1) Overview, without the dark demo banner (top 46 px)
await p.screenshot({path:'dashcap/overview.png',clip:{x:0,y:46,width:1200,height:714}});
// 2) Agents view and its first agent card
await p.getByText('Agents',{exact:true}).first().click();await p.waitForTimeout(1800);await p.mouse.move(600,2);await p.evaluate(()=>document.activeElement&&document.activeElement.blur());await p.waitForTimeout(400);
await p.screenshot({path:'dashcap/agents.png',clip:{x:0,y:46,width:1200,height:714}});
const cs=await p.evaluate(()=>{const e=document.querySelector('article.agent-card'),c=getComputedStyle(e),r=e.getBoundingClientRect();return {radius:c.borderRadius,w:r.width,h:r.height,n:document.querySelectorAll('article.agent-card').length};});console.log(JSON.stringify(cs));
for(let i=0;i<Math.min(cs.n,5);i++)await p.locator('article.agent-card').nth(i).screenshot({path:`dashcap/card-${i}.png`});
// 3) Pipeline view, for reference
await p.getByText('Pipeline',{exact:true}).first().click();await p.waitForTimeout(1800);await p.mouse.move(600,2);
await p.screenshot({path:'dashcap/pipeline.png',clip:{x:0,y:46,width:1200,height:714}});
await b.close();})();
