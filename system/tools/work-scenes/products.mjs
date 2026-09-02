import { full, stage, window_, shell, phone, line, gridlines, icon, status, avatar, metric, sparkline } from './base.mjs';

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
      ${metric({label:'Healthy nodes',value:'331',delta:'4',dir:'up',sub:'last hour',
                spark:[318,322,320,325,327,326,329,328,330,329,331,331],c:'#2f7a5b'})}
      ${metric({label:'Degraded',value:'14',delta:'3',dir:'up',sub:'last hour',
                spark:[8,9,9,10,11,10,12,12,13,13,14,14],c:'#b0812f'})}
      ${metric({label:'Offline',value:'3',delta:'1',dir:'up',sub:'last hour',
                spark:[1,1,2,2,2,2,2,3,3,3,3,3],c:'#a8543c'})}
      ${metric({label:'p95 latency',value:'82ms',delta:'6ms',dir:'down',sub:'vs 24h',
                spark:[94,92,90,91,88,89,86,87,85,84,83,82],c:'#2f7a5b'})}
    </div>

    <div class="card" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
      <div style="display:grid;grid-template-columns:2.2fr 1.1fr .6fr 1.4fr 1.1fr 1fr;gap:18px;padding:13px 20px;
                  border-bottom:1px solid var(--line);background:var(--surface-2)">
        ${['Cluster','Region','Nodes','CPU','24h','Status'].map((h,i)=>`<span class="cap" style="font-size:10.5px;${i===2||i===3?'text-align:right':''}">${h}</span>`).join('')}
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
      ${[['prod-eu-west-1','eu-west-1','64','71','1.29.4','Healthy','#2f7a5b',[62,64,63,66,68,67,70,69,71,70,72,71]],
         ['prod-us-east-2','us-east-2','88','64','1.29.4','Healthy','#2f7a5b',[58,59,61,60,62,61,63,62,64,63,65,64]],
         ['prod-ap-south-1','ap-south-1','42','89','1.28.9','Degraded','#b0812f',[71,74,73,78,80,79,83,85,84,87,88,89]],
         ['stage-us-west-1','us-west-1','24','38','1.29.4','Healthy','#2f7a5b',[41,40,39,40,38,39,37,38,37,38,38,38]],
         ['prod-sa-east-1','sa-east-1','36','12','1.28.9','Offline','#a8543c',[64,62,58,51,44,38,29,22,18,15,13,12]],
         ['edge-eu-north-1','eu-north-1','18','44','1.29.4','Healthy','#2f7a5b',[40,41,42,41,43,42,44,43,45,44,44,44]],
         ['prod-ca-central','ca-central-1','30','58','1.29.4','Healthy','#2f7a5b',[54,55,54,56,57,56,58,57,59,58,58,58]],
         ['batch-us-east-1','us-east-1','46','76','1.29.1','Healthy','#2f7a5b',[68,70,69,72,73,72,75,74,76,75,77,76]],
         ['prod-eu-central','eu-central-1','52','67','1.29.4','Healthy','#2f7a5b',[62,63,64,63,65,64,66,65,67,66,67,67]],
         ['edge-ap-east-1','ap-east-1','14','29','1.29.4','Healthy','#2f7a5b',[33,32,31,32,30,31,29,30,29,30,29,29]]].map(([n,r,nodes,cpu,ver,st,c,spark])=>`
        <div style="display:grid;grid-template-columns:2.2fr 1.1fr .6fr 1.4fr 1.1fr 1fr;gap:18px;padding:0 20px;
                    border-bottom:1px solid var(--line-2);font-size:13.5px;align-items:center;flex:1">
          <span style="font-weight:500">${n}</span>
          <span style="color:var(--dim)">${r}</span>
          <span class="num" style="color:var(--ink-2);text-align:right">${nodes}</span>
          <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
            <div style="flex:1;height:4px;border-radius:2px;background:var(--surface-3);overflow:hidden">
              <div style="width:${cpu}%;height:100%;background:${c};opacity:.85"></div></div>
            <span class="num" style="font-size:12.5px;color:var(--ink-2);width:34px;text-align:right">${cpu}%</span>
          </div>
          <span style="display:flex;justify-content:flex-start;opacity:.75">${sparkline(spark,c,{w:64,h:18})}</span>
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

/* ── p4 · Apparel design & brand studio · light ────────────────────────────
   Mixed mode. The garment canvas is Experience — the artwork is the product,
   so it gets the room. The specification beneath it is Operate: colourways,
   placement in millimetres, a size run and a print method are the things a
   factory needs to be right, and they are what separate an apparel tool from a
   drawing toy. Warm neutrals, because a studio app for a clothing label should
   not look like the banking one. */
export const apparel = () => stage(`
  ${phone(`
    <div style="padding:70px 22px 0;height:100%;background:#faf8f5;display:flex;flex-direction:column;gap:15px">
      <div style="display:flex;align-items:center;gap:10px">
        <div><div style="font-size:12px;color:#8f877c">Drop 04 · Spring</div>
          <div style="font-family:Hanken;font-weight:700;font-size:21px;color:#221f1b;margin-top:3px;letter-spacing:-.01em">Heavyweight tee</div></div>
        <span style="margin-left:auto;font-size:11px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;
                     color:#7a6a4f;background:#f0e8d8;border:1px solid #e2d6be;border-radius:4px;padding:4px 8px">Draft</span>
      </div>

      <!-- the garment canvas -->
      <div style="background:#fff;border:1px solid #e8e2d9;border-radius:8px;padding:18px;position:relative">
        <div style="display:flex;justify-content:center">
          <svg width="180" height="196" viewBox="0 0 120 130">
            <path d="M40 14 L28 20 L14 34 L26 46 L33 40 L33 118 A2 2 0 0035 120 L85 120 A2 2 0 0087 118 L87 40 L94 46 L106 34 L92 20 L80 14
                     C76 22 70 26 60 26 C50 26 44 22 40 14 Z"
                  fill="#2f3540" stroke="#232830" stroke-width="1"/>
            <path d="M40 14 C44 22 50 26 60 26 C70 26 76 22 80 14" fill="none" stroke="#454c58" stroke-width="1.4"/>
            <!-- the placed artwork -->
            <g transform="translate(60 66)">
              <circle r="15.5" fill="none" stroke="#d8c9a8" stroke-width="1.6"/>
              <path d="M-8 5 L-2.5 -7 L3 5 M-5.6 0.5 L0.4 0.5" fill="none" stroke="#d8c9a8"
                    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 -6 L5 6" stroke="#d8c9a8" stroke-width="2.4" stroke-linecap="round"/>
            </g>
            <rect x="44" y="50" width="32" height="32" fill="none" stroke="#7ea8d8" stroke-width="0.8" stroke-dasharray="2 2"/>
          </svg>
        </div>
        <div style="position:absolute;left:16px;top:16px;font-size:10px;letter-spacing:.06em;
                    text-transform:uppercase;color:#a89e91">Front</div>
        <div style="position:absolute;right:16px;bottom:16px;font-size:10.5px;color:#7ea8d8;
                    background:#eef4fb;border-radius:3px;padding:3px 7px">100 × 100 mm</div>
      </div>

      <div>
        <div style="display:flex;align-items:center;margin-bottom:9px">
          <span style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8f877c">Colourway</span>
          <span style="margin-left:auto;font-size:11.5px;color:#221f1b">Slate / Sand</span>
        </div>
        <div style="display:flex;gap:9px">
          ${[['#2f3540',1],['#8c8578',0],['#b9ae97',0],['#f0ece4',0],['#6d3f36',0]].map(([c,on])=>`
            <span style="width:34px;height:34px;border-radius:50%;background:${c};
              box-shadow:${on?'0 0 0 2px #faf8f5,0 0 0 3.5px #221f1b':'inset 0 0 0 1px #00000014'}"></span>`).join('')}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:2px">
        ${[['Print method','Water-based screen'],['Placement','Centre front, 70 mm'],['Size run','XS – 3XL']].map(([k,v])=>`
          <div style="display:flex;font-size:12.5px;padding:9px 11px;background:#fff;
                      border:1px solid #e8e2d9;border-radius:6px">
            <span style="color:#8f877c">${k}</span>
            <span style="margin-left:auto;color:#221f1b;font-weight:500">${v}</span>
          </div>`).join('')}
      </div>

      <div style="background:#fff;border:1px solid #e8e2d9;border-radius:8px;padding:15px 16px;margin-top:2px">
        <div style="display:flex;align-items:center;margin-bottom:12px">
          <span style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8f877c">Unit costing</span>
          <span style="margin-left:auto;font-size:11px;color:#4a7c59;background:#eaf2ec;border-radius:3px;padding:2px 7px">62% margin</span>
        </div>
        ${[['Blank, 240 gsm','$8.40'],['Screen, 2 colour','$3.15'],['Label &amp; finishing','$1.20']].map(([k,v])=>`
          <div style="display:flex;font-size:12.5px;margin-bottom:8px">
            <span style="color:#8f877c">${k}</span>
            <span class="num" style="margin-left:auto;color:#221f1b">${v}</span>
          </div>`).join('')}
        <div style="display:flex;font-size:13px;padding-top:10px;border-top:1px solid #eee8de">
          <span style="color:#221f1b;font-weight:500">Landed · RRP</span>
          <span class="num" style="margin-left:auto;color:#221f1b;font-weight:600">$12.75 · $34</span>
        </div>
      </div>

      <div style="display:flex;gap:9px;margin-top:2px;margin-bottom:24px">
        <div style="flex:1;text-align:center;padding:13px;border-radius:6px;background:#221f1b;color:#f7f5f1;font-size:13.5px;font-weight:500">Send to sampling</div>
        <div style="width:48px;display:flex;align-items:center;justify-content:center;border-radius:6px;
                    border:1px solid #e0d9cd;color:#8f877c">${icon('more',{s:17})}</div>
      </div>
    </div>`, { w: 476, x: 196, y: 104, rot: -5 })}
  ${phone(`
    <div style="padding:70px 22px 0;height:100%;background:#faf8f5;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center">
        <span style="font-size:17px;font-weight:600;color:#221f1b">Brand kit</span>
        <span style="margin-left:auto;font-size:12px;color:#8f877c">Kestrel Supply Co.</span>
      </div>

      <!-- the mark, on its grid -->
      <div style="background:#fff;border:1px solid #e8e2d9;border-radius:8px;padding:20px;
                  display:flex;justify-content:center">
        <div style="position:relative;width:150px;height:150px">
          <svg width="150" height="150" viewBox="0 0 100 100" style="position:absolute;inset:0">
            ${Array.from({length:7},(_,i)=>`<line x1="${i*16.6}" y1="0" x2="${i*16.6}" y2="100" stroke="#00000010" stroke-width="0.5"/>
              <line x1="0" y1="${i*16.6}" x2="100" y2="${i*16.6}" stroke="#00000010" stroke-width="0.5"/>`).join('')}
            <circle cx="50" cy="50" r="34" fill="none" stroke="#00000010" stroke-width="0.5"/>
            <path d="M32 66 L50 26 L68 66 M39.5 50 L60.5 50" fill="none" stroke="#221f1b"
                  stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M62 24 L62 62" stroke="#8c7a55" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </div>
      </div>

      <div style="display:flex;gap:9px">
        ${[['#221f1b','#f0ece4'],['#f0ece4','#221f1b'],['#6d3f36','#f0ece4']].map(([bg,fg])=>`
          <div style="flex:1;height:56px;border-radius:6px;background:${bg};border:1px solid #00000012;
                      display:flex;align-items:center;justify-content:center">
            <svg width="21" height="21" viewBox="0 0 100 100"><path d="M32 66 L50 26 L68 66 M39.5 50 L60.5 50"
              fill="none" stroke="${fg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>`).join('')}
      </div>

      <!-- applied: the woven label -->
      <div style="background:#fff;border:1px solid #e8e2d9;border-radius:8px;padding:16px">
        <div style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;
                    color:#8f877c;margin-bottom:11px">Applied · woven label</div>
        <div style="background:#221f1b;border-radius:3px;padding:15px 12px;display:flex;
                    flex-direction:column;align-items:center;gap:7px">
          <svg width="20" height="20" viewBox="0 0 100 100"><path d="M32 66 L50 26 L68 66 M39.5 50 L60.5 50"
            fill="none" stroke="#f0ece4" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div style="font-family:Hanken;font-weight:700;font-size:12px;letter-spacing:.22em;color:#f0ece4">KESTREL</div>
          <div style="font-size:7.5px;letter-spacing:.2em;color:#8c7a55">SUPPLY CO. · MMXIX</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e8e2d9;border-radius:8px;padding:16px">
        <div style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;
                    color:#8f877c;margin-bottom:11px">Typeface</div>
        <div style="font-family:Hanken;font-weight:700;font-size:30px;color:#221f1b;letter-spacing:-.01em;line-height:1">Aa Bb Cc</div>
        <div style="display:flex;gap:14px;margin-top:11px;font-size:11.5px;color:#8f877c">
          <span>Hanken Grotesk</span><span>·</span><span>400 / 500 / 700</span>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:9px;margin-top:2px;margin-bottom:24px">
        ${[['Label stock','Damask, 32 mm'],['Care label','Satin, 4 language'],['Hangtag','450 gsm, uncoated']].map(([k,v])=>`
          <div style="display:flex;font-size:12.5px">
            <span style="color:#8f877c">${k}</span>
            <span style="margin-left:auto;color:#221f1b;font-weight:500">${v}</span>
          </div>`).join('')}
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
