/**
 * Paths come from the environment because none of these locations survive a
 * new session: the website checkout moves, and the scratchpad is deleted with
 * the container.
 *
 *   SITE_DIST   the website's built dist/            (default ../../../meridian-interface-website/dist)
 *   PRICING     a JSON dump of settings.pricing_catalogue
 *   OUT         where to write the preview HTML
 *
 * PRICING is deliberately not committed. It is the studio's rate card, and
 * this repository's root is a client site. Fetch it fresh instead:
 *   node system/cli.mjs catalogue > /tmp/pricing.json
 * or POST {"action":"catalogue"} to the owner function with an owner token.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml'};
const root=process.env.SITE_DIST || new URL('../../../meridian-interface-website/dist', import.meta.url).pathname;
const srv=createServer((q,r)=>{let p=join(root,decodeURIComponent(q.url.split('?')[0]));
 if(!existsSync(p)||p.endsWith('/'))p=join(root,'index.html');
 try{const b=readFileSync(p);r.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','content-length':b.length});r.end(b);}catch{r.writeHead(404);r.end();}});
await new Promise(r=>srv.listen(8301,r));
const R=[]; const chk=(n,ok,note='')=>R.push({n,ok,note});
const CAT = JSON.parse(readFileSync(process.env.PRICING || '/tmp/pricing.json','utf8'));
CAT.hourly_benchmarks = { freelancer:'$50 – $120 / hr', boutique:'$100 – $200 / hr', agency:'$200 – $350 / hr' };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('dialog',d=>d.accept());

let store=[];
await p.route('**', r => new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());
await p.route('**/functions/v1/owner', route=>{const q=JSON.parse(route.request().postData()||'{}');
  const rep=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(q.action==='status')return rep({ok:true,configured:true});
  if(q.action==='login')return rep({ok:true,token:'t',expiresIn:9999});
  if(q.action==='list')return rep({ok:true,invoices:store});
  // Pricing now comes from the server after login rather than the bundle.
  if(q.action==='catalogue')return rep({ok:true,catalogue:CAT});
  if(q.action==='save'){store=[q.invoice,...store.filter(i=>i.id!==q.invoice.id)];return rep({ok:true,invoice:q.invoice});}
  return rep({ok:true});});

await p.goto('http://localhost:8301/',{waitUntil:'load'}); await p.waitForTimeout(1600);
const txt=()=>p.evaluate(()=>document.body.innerText);

/* ---- public views ---- */
chk('Home renders', /MERIDIAN/i.test(await txt()));
for (const [label, marker] of [['SERVICES',/Solutions|Services|Design/i],['PORTFOLIO',/Portfolio|Projects|Work/i],['MY APPOINTMENTS',/Appointment/i]]) {
  const btn=p.getByRole('button',{name:new RegExp(`^${label}$`,'i')}).first();
  if(await btn.count()){ await btn.click(); await p.waitForTimeout(800);
    chk(`${label} view renders`, marker.test(await txt())); }
  else chk(`${label} nav button exists`, false, 'not found');
}
await p.getByRole('button',{name:/^HOME$/i}).first().click(); await p.waitForTimeout(700);

/* ---- hero video ---- */
const heroOk = await p.evaluate(()=>{const v=document.querySelector('video');
  return v ? {found:true, hasSource:v.querySelectorAll('source').length>0, poster:!!v.poster} : {found:false};});
chk('Hero video present with poster fallback', heroOk.found ? (heroOk.hasSource&&heroOk.poster) : false, JSON.stringify(heroOk));

/* ---- booking end to end ---- */
let intakeBody=null;
await p.route('**/functions/v1/intake', route=>{ intakeBody=JSON.parse(route.request().postData()||'{}');
  route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
await p.getByRole('button',{name:/BOOK A DESIGN APPOINTMENT/i}).first().click(); await p.waitForTimeout(900);
await p.getByPlaceholder('e.g. Sarah Jenkins').fill('Full Site Check');
await p.getByPlaceholder('sarah@company.com').fill('fullcheck@example.com');
await p.getByLabel('Consultation date').fill('2026-10-20');
await p.getByRole('button',{name:/Confirm & Schedule Appointment/i}).click(); await p.waitForTimeout(1500);
chk('Booking submits to intake', !!intakeBody, intakeBody?'payload sent':'no POST');
chk('Booking carries an attribution source', !!intakeBody?.payload?.source, intakeBody?.payload?.source);

/* ---- owner portal ---- */
await p.getByRole('button',{name:/Studio login/i}).click(); await p.waitForTimeout(500);
await p.getByPlaceholder(/Enter owner passcode/i).fill('x');
await p.getByRole('button',{name:/Authenticate Owner Access/i}).click(); await p.waitForTimeout(1300);
chk('Owner portal unlocks', /Internal Invoice/i.test(await txt()));

for (const [tab, marker] of [
  ['Invoices & Pricing', /Industry Standard|Invoice Directory/i],
  ['Client Answers',     /What am I actually paying for/i],
  ['Campaign Links',     /Tag a link so the lead can be traced/i],
  ['Photo Control',      /Photo|Image/i],
]) {
  const t=p.getByRole('button',{name:new RegExp(tab,'i')}).first();
  if(await t.count()){ await t.click(); await p.waitForTimeout(700);
    chk(`Portal tab: ${tab}`, marker.test(await txt())); }
  else chk(`Portal tab: ${tab}`, false, 'tab not found');
}

/* ---- campaign link builder actually builds ---- */
await p.getByRole('button',{name:/Campaign Links/i}).first().click(); await p.waitForTimeout(600);
const linkText = await p.locator('code').first().innerText();
chk('Link builder emits a tagged URL', /utm_source=instagram/.test(linkText), linkText.slice(0,70));
await p.getByRole('button',{name:/Copy link/i}).first().click(); await p.waitForTimeout(400);
chk('Link copies to clipboard', (await p.evaluate(()=>navigator.clipboard.readText())).includes('utm_source=instagram'));

/* ---- invoice manager still works ---- */
await p.getByRole('button',{name:/Invoices & Pricing/i}).first().click(); await p.waitForTimeout(600);
await p.getByRole('button',{name:/Bundled Packages/i}).first().click(); await p.waitForTimeout(400);
await p.getByRole('button',{name:/Add Bundle to Invoice/i}).first().click(); await p.waitForTimeout(600);
const items=()=>p.locator('table').filter({has:p.locator('th',{hasText:'Category'})})
  .locator('tbody tr').filter({has:p.locator('input[placeholder="Service scope..."]')}).count();
chk('Invoice: bundle adds a line', (await items())>0, `${await items()} items`);
await p.getByRole('button',{name:/Save & View Printable Invoice/i}).click(); await p.waitForTimeout(1200);
chk('Invoice: saves through the seam', store.length>0, `${store.length} saved`);

/* ---- responsive ---- */
await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(700);
chk('No horizontal scroll at 390px',
  !(await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)));

chk('Zero page errors across the whole run', errs.length===0, errs.slice(0,3).join(' | ')||'none');

console.log('\n=== WEBSITE FEATURE QA ===\n');
for(const r of R) console.log(`${r.ok?'PASS':'FAIL'}  ${r.n}${r.note?'   ('+r.note+')':''}`);
console.log(`\n${R.filter(r=>r.ok).length}/${R.length} passed`);
srv.close(); await b.close();
