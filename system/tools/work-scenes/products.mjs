import { full, stage, window_, shell, phone, line, gridlines, icon, status, avatar } from './base.mjs';

/* ── p1 · Enterprise cloud console ─────────────────────────────────────────
   Density is the deliverable. Someone running fleets wants a lot at once, so
   this is table-led, status carried by a dot rather than a tinted row, and
   every column is a thing an operator would actually sort by. */
export const cloud = () => full(shell({
  brand: 'Helios', crumbs: ['Infrastructure', 'Clusters'], user: 'AR', accent: '#3061a8', env: 'Prod',
  nav: [
    { section: 'Compute' },
    { icon: 'grid',   label: 'Overview' },
    { icon: 'server', label: 'Clusters', on: true },
    { icon: 'layers', label: 'Workloads', badge: '212' },
    { icon: 'line',   label: 'Metrics' },
    { section: 'Platform' },
    { icon: 'shield', label: 'Policies' },
    { icon: 'key',    label: 'Access' },
    { icon: 'doc',    label: 'Audit log' },
    { section: 'Account' },
    { icon: 'cog', label: 'Settings' },
  ],
  body: `
  <div style="padding:30px 36px;display:flex;flex-direction:column;gap:20px;height:100%;background:var(--bg)">
    <div style="display:flex;align-items:flex-end;gap:14px">
      <div>
        <div style="font-size:22px;font-weight:600;letter-spacing:-.01em">Clusters</div>
        <div style="font-size:13.5px;color:var(--dim);margin-top:5px">12 regions · 348 nodes · last sync 40s ago</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2);border:1px solid var(--line);
                     border-radius:5px;padding:7px 12px;background:var(--surface)">${icon('filter',{s:14})}All regions</span>
        <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:#fff;background:#3061a8;
                     border-radius:5px;padding:8px 14px;font-weight:500">${icon('plus',{s:14,c:'#fff'})}New cluster</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
      ${[['Healthy','331','#2f7a5b'],['Degraded','14','#b0812f'],['Offline','3','#a8543c'],['p95 latency','82ms','#6f7680']].map(([k,v,c])=>`
        <div class="card" style="padding:16px 18px;display:flex;align-items:center;gap:14px">
          <span style="width:8px;height:8px;border-radius:50%;background:${c};box-shadow:0 0 0 4px color-mix(in srgb,${c} 16%,transparent)"></span>
          <div><div class="cap">${k}</div>
            <div class="display num" style="font-size:28px;margin-top:6px">${v}</div></div>
        </div>`).join('')}
    </div>

    <div class="card" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
      <div style="display:grid;grid-template-columns:2.2fr 1.1fr .7fr 1.5fr 1.2fr 1fr;gap:18px;padding:13px 20px;
                  border-bottom:1px solid var(--line);background:var(--surface-2)">
        ${['Cluster','Region','Nodes','CPU','Version','Status'].map(h=>`<span class="cap" style="font-size:10.5px">${h}</span>`).join('')}
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
      ${[['prod-eu-west-1','eu-west-1','64','71','1.29.4','Healthy','#2f7a5b'],
         ['prod-us-east-2','us-east-2','88','64','1.29.4','Healthy','#2f7a5b'],
         ['prod-ap-south-1','ap-south-1','42','89','1.28.9','Degraded','#b0812f'],
         ['stage-us-west-1','us-west-1','24','38','1.29.4','Healthy','#2f7a5b'],
         ['prod-sa-east-1','sa-east-1','36','12','1.28.9','Offline','#a8543c'],
         ['edge-eu-north-1','eu-north-1','18','44','1.29.4','Healthy','#2f7a5b'],
         ['prod-ca-central','ca-central-1','30','58','1.29.4','Healthy','#2f7a5b'],
         ['batch-us-east-1','us-east-1','46','76','1.29.1','Healthy','#2f7a5b'],
         ['prod-eu-central','eu-central-1','52','67','1.29.4','Healthy','#2f7a5b'],
         ['edge-ap-east-1','ap-east-1','14','29','1.29.4','Healthy','#2f7a5b']].map(([n,r,nodes,cpu,ver,st,c])=>`
        <div style="display:grid;grid-template-columns:2.2fr 1.1fr .7fr 1.5fr 1.2fr 1fr;gap:18px;padding:0 20px;
                    border-bottom:1px solid var(--line-2);font-size:13.5px;align-items:center;flex:1">
          <span style="font-weight:500">${n}</span>
          <span style="color:var(--dim)">${r}</span>
          <span class="num" style="color:var(--dim)">${nodes}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="flex:1;max-width:90px;height:4px;border-radius:2px;background:var(--surface-3);overflow:hidden">
              <div style="width:${cpu}%;height:100%;background:${c};opacity:.85"></div></div>
            <span class="num" style="font-size:12.5px;color:var(--dim)">${cpu}%</span>
          </div>
          <span class="num" style="color:var(--dim)">${ver}</span>
          ${status(st,c)}
        </div>`).join('')}
      </div>
    </div>
  </div>`
}));

/* ── p2 · Mobile banking · dark ────────────────────────────────────────────
   Two screens, angled, one bleeding off the frame. A single phone centred on a
   flat ground is the stock-photo composition this whole set replaces. */
export const banking = () => stage(`
  ${phone(`
    <div style="padding:70px 24px 0;height:100%;background:linear-gradient(180deg,#141922,#0f1319);display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;align-items:center;gap:10px">
        ${avatar('JT','#1e2632')}<div style="font-size:14px;color:var(--dim)">Good morning, Jess</div>
        <span style="margin-left:auto;color:var(--dim)">${icon('bell',{s:17})}</span>
      </div>
      <div>
        <div class="cap" style="font-size:10.5px">Total balance</div>
        <div class="display num" style="font-size:38px;margin-top:8px">$248,912<span style="font-size:21px;color:var(--dim)">.40</span></div>
        <div class="num" style="font-size:13px;color:#3f9d74;margin-top:8px;display:flex;align-items:center;gap:5px">
          ${icon('arrowUp',{s:12,c:'#3f9d74'})}$6,204 · 2.6% this month</div>
      </div>
      <div style="height:118px;margin:2px -4px">${line([28,31,29,36,34,41,39,47,52,49,58,64],{c:'#3f9d74'})}</div>
      <div style="display:flex;gap:8px">
        ${[['Send','plus'],['Request','arrowUp'],['Cards','wallet']].map(([t,ic],i)=>`
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 0;border-radius:6px;
                      background:${i===0?'#17352a':'var(--surface-2)'};color:${i===0?'#5fbc90':'var(--ink-2)'}">
            ${icon(ic,{s:16})}<span style="font-size:12px">${t}</span></div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;margin-top:2px">
        <span class="cap" style="font-size:10.5px">Recent</span>
        <span style="margin-left:auto;font-size:12px;color:var(--dim)">See all</span>
      </div>
      ${[['Northwind Rail','−$142.00','Today · Travel'],['Payroll deposit','+$4,820.00','Fri · Income'],
         ['Ovid Coffee','−$6.80','Fri · Food']].map(([n,a,d])=>`
        <div style="display:flex;align-items:center;gap:11px">
          <div style="width:34px;height:34px;border-radius:8px;background:var(--surface-2);flex-shrink:0"></div>
          <div style="min-width:0"><div style="font-size:13.5px;font-weight:500;white-space:nowrap">${n}</div>
            <div style="font-size:11.5px;color:var(--faint);margin-top:2px">${d}</div></div>
          <div class="num" style="margin-left:auto;font-size:13.5px;font-weight:500;color:${a[0]==='+'?'#3f9d74':'var(--ink-2)'}">${a}</div>
        </div>`).join('')}
    </div>`, { w: 476, x: 196, y: 104, rot: -5 })}
  ${phone(`
    <div style="padding:70px 24px 0;height:100%;background:linear-gradient(180deg,#141922,#0f1319);display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center"><span style="font-size:17px;font-weight:600">Portfolio</span>
        <span style="margin-left:auto;color:var(--dim)">${icon('more',{s:17})}</span></div>
      <div style="display:flex;gap:5px;background:var(--surface-2);border-radius:6px;padding:3px">
        ${['1D','1W','1M','1Y','All'].map((t,i)=>`<span style="flex:1;text-align:center;padding:6px 0;border-radius:4px;font-size:12px;
          background:${i===3?'var(--surface-3)':'transparent'};color:${i===3?'var(--ink)':'var(--dim)'};font-weight:${i===3?500:400}">${t}</span>`).join('')}
      </div>
      <div>
        <div class="display num" style="font-size:29px">$164,238</div>
        <div class="num" style="font-size:13px;color:#3f9d74;margin-top:6px">+$18,402 · 12.6%</div>
      </div>
      <div style="height:150px;position:relative;margin:0 -4px">${gridlines(3)}${line([52,49,55,58,54,63,68,64,72,79,75,84],{c:'#6f9fd8'})}</div>
      <div style="display:flex;flex-direction:column;gap:13px;margin-top:2px">
      ${[['Equities','54.2%','$134,910','#6f9fd8'],['Fixed income','27.8%','$69,197','#3f9d74'],
         ['Real assets','11.4%','$28,376','#b0812f'],['Cash','6.6%','$16,428','#6f7680']].map(([n,p,v,c])=>`
        <div>
          <div style="display:flex;align-items:baseline;font-size:13px">
            <span style="display:flex;align-items:center;gap:7px;color:var(--ink-2)">
              <span style="width:7px;height:7px;border-radius:2px;background:${c}"></span>${n}</span>
            <span class="num" style="margin-left:auto;font-weight:500">${v}</span>
            <span class="num" style="width:46px;text-align:right;color:var(--faint);font-size:12px">${p}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>`, { w: 476, x: 838, y: 28, rot: 4 })}
`, { tone: 'dark' });

/* ── p4 · Fitness · light ──────────────────────────────────────────────────
   Warmer and lighter than the banking pair on purpose. Two products for two
   audiences should not share a mood. */
export const fitness = () => stage(`
  ${phone(`
    <div style="padding:70px 24px 0;height:100%;background:#fbfaf8;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <div><div style="font-size:12.5px;color:#8a8378">Wednesday, 12 March</div>
          <div style="font-family:Hanken;font-weight:700;font-size:23px;color:#242019;margin-top:3px;letter-spacing:-.01em">Push · Week 6</div></div>
        <span style="margin-left:auto;width:34px;height:34px;border-radius:50%;background:#f0ece5;
                     display:flex;align-items:center;justify-content:center;color:#6b6459">${icon('more',{s:16})}</span>
      </div>
      <div style="display:flex;gap:9px">
        ${[['Volume','14.2k','kg'],['Sets','21','done'],['Time','48','min']].map(([k,v,u])=>`
          <div style="flex:1;border:1px solid #e6e1d8;border-radius:6px;padding:11px 12px;background:#fff">
            <div style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8a8378">${k}</div>
            <div class="num" style="font-family:Hanken;font-weight:700;font-size:22px;color:#242019;margin-top:5px">${v}<span style="font-size:11px;color:#8a8378;font-weight:400;margin-left:2px">${u}</span></div>
          </div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;margin-top:2px">
        <span style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8a8378">Today's session</span>
        <span class="num" style="margin-left:auto;font-size:12px;color:#8a8378">2 of 4</span>
      </div>
      ${[['Bench press','4 × 8','62.5 kg',1],['Incline dumbbell','3 × 10','24 kg',1],
         ['Cable fly','3 × 12','18 kg',0],['Overhead press','4 × 6','45 kg',0]].map(([n,st,w,done])=>`
        <div style="display:flex;align-items:center;gap:12px;padding:12px 13px;border:1px solid ${done?'#dde5dc':'#e6e1d8'};
                    border-radius:6px;background:${done?'#f4f7f3':'#fff'}">
          <div style="width:20px;height:20px;border-radius:50%;border:1.5px solid ${done?'#4a7c59':'#d6cfc4'};
                      background:${done?'#4a7c59':'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${done?icon('check',{s:11,c:'#fff'}):''}</div>
          <div style="min-width:0"><div style="font-size:14px;font-weight:500;color:#242019">${n}</div>
            <div class="num" style="font-size:12px;color:#8a8378;margin-top:2px">${st} · ${w}</div></div>
          <span style="margin-left:auto;color:#c4bdb1">${icon('more',{s:15})}</span>
        </div>`).join('')}
    </div>`, { w: 476, x: 196, y: 104, rot: -5 })}
  ${phone(`
    <div style="padding:70px 24px 0;height:100%;background:#fbfaf8;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;align-items:center"><span style="font-size:17px;font-weight:600;color:#242019">This week</span>
        <span style="margin-left:auto;font-size:12px;color:#8a8378">Mar 10–16</span></div>
      <div style="display:flex;justify-content:center;padding:8px 0 4px;position:relative">
        <svg width="184" height="184" viewBox="0 0 100 100">
          ${[['#4a7c59',82,0],['#b0713f',64,1],['#5b7f96',47,2]].map(([c,pct,i])=>{
            const r=42-i*11, C=2*Math.PI*r;
            return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#ece7de" stroke-width="7.5"/>
                    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${c}" stroke-width="7.5" stroke-linecap="round"
                      stroke-dasharray="${(C*pct/100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>`;
          }).join('')}
        </svg>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-42%);text-align:center">
          <div class="num" style="font-family:Hanken;font-weight:700;font-size:28px;color:#242019">82%</div>
          <div style="font-size:10.5px;color:#8a8378;letter-spacing:.05em">OF GOAL</div>
        </div>
      </div>
      ${[['Training','4 of 5 days','#4a7c59'],['Steps','61,204','#b0713f'],['Sleep','7h 12m avg','#5b7f96']].map(([k,v,c])=>`
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:8px;height:8px;border-radius:2px;background:${c}"></span>
          <span style="font-size:14px;color:#242019">${k}</span>
          <span class="num" style="margin-left:auto;font-size:14px;font-weight:500;color:#5c5648">${v}</span>
        </div>`).join('')}
      <div style="border-top:1px solid #e6e1d8;padding-top:14px;margin-top:auto;margin-bottom:22px;display:flex;align-items:center;gap:10px">
        <span style="color:#8a8378">${icon('check',{s:15})}</span>
        <div><div style="font-size:12.5px;color:#242019">Synced from Watch</div>
          <div style="font-size:11.5px;color:#8a8378;margin-top:1px">4 minutes ago</div></div>
      </div>
    </div>`, { w: 476, x: 838, y: 28, rot: 4 })}
`);

/* ── p6 · Storefront ───────────────────────────────────────────────────────
   Persuade, and the one scene where a browser belongs: it is a public page,
   and the frame is what says so. */
export const storefront = () => stage(window_('fernandroot.com/kettle', `
<div style="height:790px;display:flex;background:var(--surface)">
  <div style="flex:1.15;background:#e7e2da;display:flex;align-items:center;justify-content:center;position:relative">
    <div style="position:absolute;top:26px;left:30px;right:30px;display:flex;align-items:center;gap:26px;font-size:12.5px;color:#6f675c">
      <span style="font-family:Hanken;font-weight:700;font-size:15px;letter-spacing:.16em;color:#3a342c">FERNAND &amp; ROOT</span>
      <span style="margin-left:auto;display:flex;gap:20px">${['Brewing','Grinders','Beans','Journal'].map(t=>`<span>${t}</span>`).join('')}</span>
    </div>
    <svg width="330" height="330" viewBox="0 0 100 100">
      <ellipse cx="50" cy="89" rx="27" ry="3.2" fill="#00000010"/>
      <path d="M30 47h40v25a11 11 0 01-11 11H41a11 11 0 01-11-11z" fill="#31383f"/>
      <path d="M30 47h40v6H30z" fill="#3d454d"/>
      <path d="M70 55c8.5 0 11 5.5 11 10.5S77 76 70 76" fill="none" stroke="#31383f" stroke-width="3.6"/>
      <path d="M41 47c0-7.5 4-12.5 9.5-12.5S60 39.5 60 47" fill="none" stroke="#98a0a8" stroke-width="2.6"/>
      <rect x="45" y="26" width="11" height="6" rx="2.6" fill="#98a0a8"/>
      <circle cx="50" cy="66" r="4" fill="#1f252b"/>
    </svg>
    <div style="position:absolute;bottom:26px;left:30px;display:flex;gap:8px">
      ${[0,1,2,3].map(i=>`<span style="width:44px;height:44px;border-radius:4px;background:${i===0?'#d6cfc4':'#ded8cf'};
        border:1px solid ${i===0?'#3a342c':'transparent'}"></span>`).join('')}
    </div>
  </div>
  <div style="flex:1;padding:52px 48px;display:flex;flex-direction:column;gap:18px">
    <div class="cap" style="font-size:10.5px">Brewing · Kettles</div>
    <div style="font-family:Hanken;font-weight:700;font-size:36px;line-height:1.12;letter-spacing:-.02em">Gooseneck<br>pour-over kettle</div>
    <div style="display:flex;align-items:baseline;gap:12px">
      <span class="num" style="font-size:26px;font-weight:600">$148.00</span>
      <span style="font-size:13px;color:var(--dim)">or 4 × $37 interest-free</span>
    </div>
    <div style="font-size:14.5px;color:var(--ink-2);line-height:1.6;max-width:42ch">
      Variable-temperature base with 1°F precision, 0.9 L counterweighted spout, and a brushed
      interior that will not stain. Ships in two days.</div>
    <div style="margin-top:4px">
      <div class="cap" style="font-size:10.5px;margin-bottom:10px">Finish · Slate</div>
      <div style="display:flex;gap:10px">
        ${[['#31383f',1],['#b8bcc0',0],['#8d6a4a',0]].map(([c,on])=>`
          <span style="width:36px;height:36px;border-radius:50%;background:${c};
            box-shadow:${on?'0 0 0 2px var(--surface),0 0 0 3.5px #31383f':'0 0 0 1px var(--line)'}"></span>`).join('')}
      </div>
    </div>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:10px">
        <div style="display:flex;align-items:center;border:1px solid var(--line);border-radius:5px;padding:0 4px">
          ${['−','1','+'].map((t,i)=>`<span class="${i===1?'num':''}" style="width:34px;text-align:center;font-size:${i===1?'14px':'16px'};color:${i===1?'var(--ink)':'var(--dim)'}">${t}</span>`).join('')}
        </div>
        <div style="flex:1;text-align:center;padding:14px;border-radius:5px;background:#1f252b;color:#fff;font-size:15px;font-weight:500">Add to basket</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--dim);
                  border-top:1px solid var(--line);padding-top:14px">
        <span>Free returns for 60 days</span><span>2-year warranty</span><span>In stock</span>
      </div>
    </div>
  </div>
</div>`, { x: 60, y: 88, w: 1480 }));
