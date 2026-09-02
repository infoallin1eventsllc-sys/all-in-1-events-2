import { browser, phone, spark, icon } from './base.mjs';

/* p1 — Enterprise cloud orchestration. Operate. Density is the point: someone
   running fleets wants to see a lot at once, so this is a table-led layout with
   status carried by a single dot rather than a coloured row. */
export const cloud = () => browser('console.helios.cloud/clusters', `
<div style="display:flex;height:100%">
  <div style="width:212px;border-right:1px solid var(--line);padding:26px 0;background:var(--card)">
    <div style="padding:0 22px 20px;font-family:Hanken;font-weight:800;font-size:21px;color:var(--ink)">Helios</div>
    ${[['grid','Overview',0],['chart','Clusters',1],['doc','Workloads',0],['users','Access',0],['cog','Settings',0]].map(([ic,l,on])=>`
      <div style="display:flex;align-items:center;gap:12px;padding:11px 22px;font-size:16px;
                  color:${on?'#2d5f8f':'var(--dim)'};background:${on?'#eaf1f8':'transparent'};
                  border-left:3px solid ${on?'#2d5f8f':'transparent'}">${icon(ic,{s:20})}${l}</div>`).join('')}
  </div>
  <div style="flex:1;padding:30px 34px;display:flex;flex-direction:column;gap:22px;min-width:0">
    <div style="display:flex;align-items:baseline;gap:14px">
      <div style="font-family:Hanken;font-size:29px;font-weight:800;color:var(--ink)">Clusters</div>
      <div style="font-size:16px;color:var(--dim)">12 regions · 348 nodes</div>
      <span style="margin-left:auto;font-size:15px;color:#fff;background:#2d5f8f;border-radius:7px;padding:8px 16px">Deploy</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px">
      ${[['Healthy','331'],['Degraded','14'],['Offline','3'],['p95 latency','82ms']].map(([k,v])=>`
        <div class="hair" style="border-radius:10px;padding:17px 20px;background:var(--card)">
          <div style="font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)">${k}</div>
          <div class="mono" style="font-family:Hanken;font-weight:800;font-size:34px;color:var(--ink);margin-top:6px">${v}</div>
        </div>`).join('')}
    </div>
    <div class="hair" style="border-radius:10px;background:var(--card);flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.4fr;gap:16px;padding:14px 22px;
                  border-bottom:1px solid var(--line);font-size:13px;letter-spacing:.07em;
                  text-transform:uppercase;color:var(--dim)">
        <span>Cluster</span><span>Region</span><span>Nodes</span><span>CPU</span><span>Status</span>
      </div>
      ${[['prod-eu-west-1','eu-west-1','64','71%','Healthy','#2f6f57'],
         ['prod-us-east-2','us-east-2','88','64%','Healthy','#2f6f57'],
         ['prod-ap-south-1','ap-south-1','42','89%','Degraded','#b07d2c'],
         ['stage-us-west-1','us-west-1','24','38%','Healthy','#2f6f57'],
         ['prod-sa-east-1','sa-east-1','36','12%','Offline','#a4553f'],
         ['edge-eu-north-1','eu-north-1','18','44%','Healthy','#2f6f57'],
         ['prod-ca-central','ca-central','30','58%','Healthy','#2f6f57'],
         ['batch-us-east-1','us-east-1','46','76%','Healthy','#2f6f57'],
         ['prod-eu-central','eu-central','52','67%','Healthy','#2f6f57'],
         ['edge-ap-east-1','ap-east-1','14','29%','Healthy','#2f6f57'],
         ['stage-eu-west-2','eu-west-2','16','41%','Degraded','#b07d2c'],
         ['prod-us-west-2','us-west-2','58','73%','Healthy','#2f6f57']].map(([n,r,nodes,cpu,st,c])=>`
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.4fr;gap:16px;padding:14px 22px;
                    border-bottom:1px solid var(--line);font-size:16px;color:var(--ink);align-items:center">
          <span class="mono">${n}</span><span style="color:var(--dim)">${r}</span>
          <span class="mono" style="color:var(--dim)">${nodes}</span>
          <div style="display:flex;align-items:center;gap:9px">
            <div style="flex:1;height:6px;border-radius:3px;background:var(--line);overflow:hidden;max-width:80px">
              <div style="width:${cpu};height:100%;background:${c}"></div></div>
            <span class="mono" style="font-size:14px;color:var(--dim)">${cpu}</span>
          </div>
          <span style="display:flex;align-items:center;gap:9px;font-size:15px;color:var(--dim)">
            <span style="width:9px;height:9px;border-radius:50%;background:${c}"></span>${st}</span>
        </div>`).join('')}
    </div>
  </div>
</div>`);

/* p2 — Mobile banking, dark. Two screens because a single phone centred on a
   flat ground is the stock-photo composition this set exists to replace. */
export const banking = () => `
<div style="flex:1;background:linear-gradient(160deg,#151b24,#0c1016);display:flex;align-items:center;
            justify-content:center;gap:48px;padding:0 40px">
  ${phone(`
    <div style="padding:62px 26px 0;height:100%;display:flex;flex-direction:column;gap:20px;background:#0f141b">
      <div style="font-size:15px;color:#7c8794">Total balance</div>
      <div class="mono" style="font-family:Hanken;font-weight:800;font-size:44px;color:#eef2f7;line-height:1">$248,912<span style="font-size:26px;color:#7c8794">.40</span></div>
      <div style="font-size:15px;color:#4fa87c">+$6,204 this month</div>
      <div style="height:150px;margin-top:4px">${spark([28,31,29,36,34,41,39,47,52,49,58,64],{c:'#4fa87c'})}</div>
      <div style="display:flex;gap:10px">
        ${['Send','Request','Invest'].map((t,i)=>`<div style="flex:1;text-align:center;padding:12px 0;border-radius:10px;
          background:${i===0?'#1d4d3a':'#171d26'};color:${i===0?'#8fd6b3':'#9aa5b1'};font-size:15px">${t}</div>`).join('')}
      </div>
      <div style="font-size:14px;color:#7c8794;letter-spacing:.08em;text-transform:uppercase;margin-top:6px">Recent</div>
      ${[['Northwind Rail','−$142.00','Today'],['Payroll deposit','+$4,820.00','Fri'],['Ovid Coffee','−$6.80','Fri']].map(([n,a,d])=>`
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#171d26"></div>
          <div style="min-width:0"><div style="font-size:15px;color:#dbe2ea;white-space:nowrap">${n}</div>
            <div style="font-size:13px;color:#6b7683">${d}</div></div>
          <div class="mono" style="margin-left:auto;font-size:15px;color:${a[0]==='+'?'#4fa87c':'#c8d0d9'}">${a}</div>
        </div>`).join('')}
    </div>`)}
  ${phone(`
    <div style="padding:58px 24px 0;height:100%;display:flex;flex-direction:column;gap:18px;background:#0f141b">
      <div style="font-size:20px;font-weight:600;color:#eef2f7">Portfolio</div>
      <div style="display:flex;gap:8px">
        ${['1D','1W','1M','1Y','All'].map((t,i)=>`<span style="flex:1;text-align:center;padding:7px 0;border-radius:7px;font-size:13px;
          background:${i===3?'#1d4d3a':'transparent'};color:${i===3?'#8fd6b3':'#6b7683'}">${t}</span>`).join('')}
      </div>
      <div style="height:190px">${spark([52,49,55,58,54,63,68,64,72,79,75,84],{c:'#7aa7d6'})}</div>
      ${[['Equities','54.2%','$134,910','#7aa7d6'],['Fixed income','27.8%','$69,197','#4fa87c'],
         ['Real assets','11.4%','$28,376','#b08a4a'],['Cash','6.6%','$16,428','#6b7683']].map(([n,p,v,c])=>`
        <div>
          <div style="display:flex;font-size:15px;color:#dbe2ea"><span>${n}</span>
            <span class="mono" style="margin-left:auto;color:#8b96a3">${v}</span></div>
          <div style="height:7px;border-radius:4px;background:#171d26;margin-top:7px;overflow:hidden">
            <div style="width:${p};height:100%;background:${c}"></div></div>
        </div>`).join('')}
    </div>`)}
</div>`;

/* p4 — Fitness. Warmer and lighter than the banking pair on purpose: two
   products for two audiences should not share a mood. */
export const fitness = () => `
<div style="flex:1;background:linear-gradient(160deg,#f4f1ec,#e6e2db);display:flex;align-items:center;
            justify-content:center;gap:56px;padding:0 40px">
  ${phone(`
    <div style="padding:58px 24px 0;height:100%;display:flex;flex-direction:column;gap:18px;background:#fbfaf8">
      <div style="font-size:15px;color:#8a8378">Wednesday</div>
      <div style="font-family:Hanken;font-weight:800;font-size:31px;color:#242019;line-height:1.1">Push day<br>Week 6 of 12</div>
      <div style="display:flex;gap:12px;margin-top:2px">
        ${[['Volume','14.2k'],['Sets','21'],['Time','48m']].map(([k,v])=>`
          <div style="flex:1;border:1px solid #e2ddd4;border-radius:11px;padding:13px 14px;background:#fff">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a8378">${k}</div>
            <div class="mono" style="font-family:Hanken;font-weight:800;font-size:25px;color:#242019;margin-top:4px">${v}</div>
          </div>`).join('')}
      </div>
      ${[['Bench press','4 × 8','62.5 kg',true],['Incline dumbbell','3 × 10','24 kg',true],
         ['Cable fly','3 × 12','18 kg',false],['Overhead press','4 × 6','45 kg',false]].map(([n,s,w,done])=>`
        <div style="display:flex;align-items:center;gap:13px;padding:13px 15px;border:1px solid #e2ddd4;
                    border-radius:11px;background:${done?'#f3f7f3':'#fff'}">
          <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${done?'#4a7c59':'#d6cfc4'};
                      background:${done?'#4a7c59':'transparent'};display:flex;align-items:center;justify-content:center">
            ${done?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg>':''}</div>
          <div><div style="font-size:16px;color:#242019">${n}</div>
            <div style="font-size:13px;color:#8a8378">${s} · ${w}</div></div>
        </div>`).join('')}
    </div>`)}
  ${phone(`
    <div style="padding:58px 24px 0;height:100%;display:flex;flex-direction:column;gap:20px;background:#fbfaf8">
      <div style="font-size:20px;font-weight:600;color:#242019">This week</div>
      <div style="display:flex;justify-content:center;padding:6px 0">
        <svg width="196" height="196" viewBox="0 0 100 100">
          ${[['#4a7c59',82,0],['#b0713f',64,1],['#5b7f96',47,2]].map(([c,pct,i])=>{
            const r=42-i*11, C=2*Math.PI*r;
            return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#eae5dc" stroke-width="8"/>
                    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"
                      stroke-dasharray="${(C*pct/100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>`;
          }).join('')}
        </svg>
      </div>
      ${[['Training','4 of 5 days','#4a7c59'],['Steps','61,204','#b0713f'],['Sleep','7h 12m avg','#5b7f96']].map(([k,v,c])=>`
        <div style="display:flex;align-items:center;gap:11px">
          <span style="width:11px;height:11px;border-radius:50%;background:${c}"></span>
          <span style="font-size:16px;color:#242019">${k}</span>
          <span class="mono" style="margin-left:auto;font-size:16px;color:#8a8378">${v}</span>
        </div>`).join('')}
      <div style="border-top:1px solid #e2ddd4;padding-top:16px;margin-top:2px">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8378">Synced</div>
        <div style="font-size:15px;color:#242019;margin-top:6px">Watch · 4 minutes ago</div>
      </div>
    </div>`)}
</div>`;

/* p6 — Storefront. Persuade, so this one may lead with an image and a single
   clear action, and the checkout beside it shows the flow continues. */
export const storefront = () => browser('shop.fernandroot.com/kettle', `
<div style="display:flex;height:100%">
  <div style="flex:1.25;background:#e9e4dc;display:flex;align-items:center;justify-content:center;position:relative">
    <svg width="330" height="330" viewBox="0 0 100 100">
      <ellipse cx="50" cy="88" rx="30" ry="4" fill="#00000012"/>
      <path d="M28 46h44v26a12 12 0 01-12 12H40a12 12 0 01-12-12z" fill="#2f3a45"/>
      <path d="M28 46h44v8H28z" fill="#3c4854"/>
      <path d="M72 54c9 0 12 6 12 11s-4 10-12 10" fill="none" stroke="#2f3a45" stroke-width="4"/>
      <path d="M40 46c0-8 4-13 10-13s10 5 10 13" fill="none" stroke="#8a939c" stroke-width="3"/>
      <rect x="44" y="24" width="12" height="7" rx="3" fill="#8a939c"/>
    </svg>
    <div style="position:absolute;left:34px;top:30px;font-size:14px;letter-spacing:.14em;
                text-transform:uppercase;color:#6f675c">Fernand &amp; Root</div>
  </div>
  <div style="flex:1;padding:44px 42px;display:flex;flex-direction:column;gap:20px">
    <div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)">Brewing</div>
    <div style="font-family:Hanken;font-weight:800;font-size:38px;color:var(--ink);line-height:1.1">Gooseneck<br>pour-over kettle</div>
    <div class="mono" style="font-size:29px;color:var(--ink)">$148.00</div>
    <div style="font-size:17px;color:var(--dim);line-height:1.55">Variable-temperature base, 0.9 L counterweighted spout. Ships in two days.</div>
    <div>
      <div style="font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);margin-bottom:10px">Finish</div>
      <div style="display:flex;gap:11px">
        ${[['#2f3a45',1],['#b8bcc0',0],['#8d6a4a',0]].map(([c,on])=>`
          <span style="width:40px;height:40px;border-radius:50%;background:${c};
            box-shadow:0 0 0 ${on?'3px var(--bg),0 0 0 5px #2f3a45':'1px #d9dee5'}"></span>`).join('')}
      </div>
    </div>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:11px">
      <div style="text-align:center;padding:17px;border-radius:10px;background:#1f2933;color:#fff;font-size:17px;font-weight:600">Add to basket</div>
      <div style="display:flex;justify-content:space-between;font-size:15px;color:var(--dim);
                  border-top:1px solid var(--line);padding-top:14px">
        <span>Free returns for 60 days</span><span>2-year warranty</span>
      </div>
    </div>
  </div>
</div>`);
