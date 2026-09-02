import { browser, spark, icon } from './base.mjs';

/* p7 — Financial & Revenue BI. Operate mode: an executive reads this in thirty
   seconds before a board call, so one figure dominates and everything else
   supports it. Light ground, ink type, a single green reserved for variance. */
export const finance = () => browser('app.northgate.finance/overview', `
<div style="display:flex;height:100%">
  <div style="width:78px;background:#111820;display:flex;flex-direction:column;align-items:center;padding-top:26px;gap:22px">
    <div style="width:34px;height:34px;border-radius:9px;background:#2f6f57"></div>
    ${['chart','wallet','doc','users','cog'].map((n,i)=>`
      <div style="width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;
                  background:${i===0?'#1e2a36':'transparent'};color:${i===0?'#e6ebf1':'#5c6b7a'}">${icon(n,{s:22})}</div>`).join('')}
  </div>
  <div style="flex:1;padding:32px 36px;display:flex;flex-direction:column;gap:26px;min-width:0">
    <div style="display:flex;align-items:baseline;gap:16px">
      <div style="font-family:Hanken;font-size:30px;font-weight:800;color:var(--ink)">Revenue overview</div>
      <div style="font-size:17px;color:var(--dim)">Q3 FY26 · consolidated</div>
      <div style="margin-left:auto;font-size:15px;color:var(--dim);border:1px solid var(--line);
                  border-radius:7px;padding:8px 14px">Jul 1 – Sep 30</div>
    </div>

    <div style="display:grid;grid-template-columns:1.35fr 1fr 1fr 1fr;gap:20px">
      ${[['Net revenue','$14.82M','+6.4% vs forecast','#1b7a5a',true],
         ['Gross margin','61.3%','+120 bps','#1b7a5a'],
         ['Operating cash','$3.94M','−$210K','#a4553f'],
         ['Runway','19 mo','unchanged','#5b6472']].map(([k,v,d,c,big])=>`
        <div class="hair" style="border-radius:11px;padding:${big?'22px 24px':'20px 22px'};background:var(--card)">
          <div style="font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)">${k}</div>
          <div class="mono" style="font-family:Hanken;font-weight:800;font-size:${big?'54px':'38px'};color:var(--ink);margin-top:8px;line-height:1">${v}</div>
          <div style="font-size:15px;color:${c};margin-top:8px">${d}</div>
        </div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:1.7fr 1fr;gap:22px;flex:1;min-height:0">
      <div class="hair" style="border-radius:11px;padding:22px 24px;background:var(--card);display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:18px">
          <div style="font-size:19px;font-weight:600;color:var(--ink)">Revenue vs forecast</div>
          <div style="display:flex;gap:16px;margin-left:auto;font-size:14px;color:var(--dim)">
            <span><span style="display:inline-block;width:11px;height:3px;background:#2f6f57;vertical-align:middle;margin-right:6px"></span>Actual</span>
            <span><span style="display:inline-block;width:11px;height:3px;background:#9aa6b2;vertical-align:middle;margin-right:6px"></span>Forecast</span>
          </div>
        </div>
        <div style="position:relative;margin-top:16px;flex:1;min-height:0">
          <div style="position:absolute;inset:0">${spark([41,44,43,49,52,50,57,61,59,66,71,74],{c:'#2f6f57'})}</div>
          <div style="position:absolute;inset:0;opacity:.5">${spark([42,44,45,47,50,52,55,57,60,62,65,68],{c:'#9aa6b2',fill:false})}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;color:var(--dim);margin-top:10px;
                    padding-top:10px;border-top:1px solid var(--line)">
          ${['Jul','Aug','Sep','Oct','Nov','Dec'].map(m=>`<span>${m}</span>`).join('')}
        </div>
      </div>

      <div class="hair" style="border-radius:11px;padding:22px 24px;background:var(--card);display:flex;flex-direction:column">
        <div style="font-size:19px;font-weight:600;color:var(--ink);margin-bottom:18px">By segment</div>
        <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between">
        ${[['Enterprise','$7.91M',68],['Mid-market','$4.32M',37],['SMB','$1.88M',16],
           ['Partner','$0.71M',6],['Services','$0.44M',4],['Other','$0.12M',1]].map(([n,v,p])=>`
          <div>
            <div style="display:flex;justify-content:space-between;font-size:15px;color:var(--ink)">
              <span>${n}</span><span class="mono" style="color:var(--dim)">${v}</span>
            </div>
            <div style="height:8px;border-radius:4px;background:var(--line);margin-top:7px;overflow:hidden">
              <div style="width:${p}%;height:100%;background:#2f6f57;border-radius:4px"></div>
            </div>
          </div>`).join('')}
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line);
                    display:flex;justify-content:space-between;font-size:15px">
          <span style="color:var(--dim)">Total</span>
          <span class="mono" style="color:var(--ink);font-weight:600">$14.82M</span>
        </div>
      </div>
    </div>
  </div>
</div>`);

/* p8 — CRM pipeline. Operate mode again, but the job is different: you are
   scanning for what is stuck, so the columns carry weight and the cards stay
   quiet. */
export const crm = () => browser('pipeline.corvus.io/deals', `
<div style="padding:30px 34px;display:flex;flex-direction:column;height:100%;gap:22px">
  <div style="display:flex;align-items:baseline;gap:16px">
    <div style="font-family:Hanken;font-size:30px;font-weight:800;color:var(--ink)">Pipeline</div>
    <div style="font-size:17px;color:var(--dim)">62 open · $2.41M weighted</div>
    <div style="margin-left:auto;display:flex;gap:10px">
      ${['All reps','This quarter'].map(t=>`<span style="font-size:15px;color:var(--dim);border:1px solid var(--line);border-radius:7px;padding:8px 14px">${t}</span>`).join('')}
      <span style="font-size:15px;color:#fff;background:#3f6f9e;border-radius:7px;padding:8px 16px">New deal</span>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;flex:1;min-height:0">
    ${[['Qualified','$742K','#7d8896',[['Halden Logistics','$96K','R. Osei','4d'],['Bright Path Clinics','$54K','M. Vance','2d'],['Orrin Manufacturing','$128K','R. Osei','9d'],['Sable Freight','$77K','L. Marsh','1d'],['Nine Elms Dental','$41K','M. Vance','5d'],['Redmond Civil','$112K','R. Osei','12d']]],
       ['Proposal sent','$610K','#3f6f9e',[['Kestrel Foods','$210K','L. Marsh','1d'],['Tuvia Rail','$88K','M. Vance','6d'],['Loam Agriculture','$134K','R. Osei','2d'],['Verity Legal','$96K','L. Marsh','8d'],['Pell & Draper','$82K','M. Vance','3d']]],
       ['Negotiation','$538K','#b07d2c',[['Anvil Components','$305K','L. Marsh','11d'],['Fen & Co.','$71K','R. Osei','3d'],['Wrenfield Group','$118K','M. Vance','16d'],['Astley Marine','$44K','L. Marsh','7d']]],
       ['Closed won','$521K','#2f6f57',[['Marrow Health','$182K','M. Vance','—'],['Kite Systems','$146K','L. Marsh','—'],['Calder Interiors','$97K','R. Osei','—'],['Bramble Cafe Co.','$96K','M. Vance','—']]]
      ].map(([name,total,c,cards])=>`
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div style="display:flex;align-items:center;gap:9px;padding-bottom:11px;border-bottom:2px solid ${c}">
          <span style="font-size:16px;font-weight:600;color:var(--ink)">${name}</span>
          <span class="mono" style="font-size:15px;color:var(--dim);margin-left:auto">${total}</span>
        </div>
        ${cards.map(([co,amt,rep,age])=>`
          <div class="hair" style="border-radius:9px;background:var(--card);padding:13px 15px">
            <div style="font-size:15px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${co}</div>
            <div style="display:flex;align-items:baseline;gap:8px;margin-top:5px">
              <span class="mono" style="font-size:20px;color:var(--ink)">${amt}</span>
              <span style="font-size:13px;color:var(--dim);margin-left:auto">${age}</span>
            </div>
            <div style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:13px;color:var(--dim)">
              <span style="width:18px;height:18px;border-radius:50%;background:var(--line);display:inline-block"></span>${rep}
            </div>
          </div>`).join('')}
        <div style="font-size:13px;color:var(--dim);padding-left:2px">+${{'Qualified':9,'Proposal sent':6,'Negotiation':4,'Closed won':7}[name]} more</div>
      </div>`).join('')}
  </div>
</div>`);

/* p9 — Analytics hub. Dark, because this is a surface people leave open all
   day. Amber is the only accent and it is reserved for the metric under
   examination. */
export const analytics = () => browser('atlas.meridianlabs.dev/cohorts', `
<div style="padding:30px 34px;display:flex;flex-direction:column;height:100%;gap:22px">
  <div style="display:flex;align-items:baseline;gap:16px">
    <div style="font-family:Hanken;font-size:30px;font-weight:800;color:var(--ink)">Retention</div>
    <div style="font-size:17px;color:var(--dim)">Weekly cohorts · 84,912 users</div>
    <div style="margin-left:auto;font-size:15px;color:#d9a441;border:1px solid #6b5527;background:#241d10;border-radius:7px;padding:8px 14px">Live</div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">
    ${[['Week-4 retention','38.2%','+2.1 pts'],['Median session','6m 41s','+18s'],['Activation','54.9%','−0.6 pts'],['Churn risk','1,204','+92']].map(([k,v,d])=>`
      <div class="hair" style="border-radius:11px;padding:20px 22px;background:var(--card)">
        <div style="font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)">${k}</div>
        <div class="mono" style="font-family:Hanken;font-weight:800;font-size:40px;color:var(--ink);margin-top:8px;line-height:1">${v}</div>
        <div style="font-size:15px;color:var(--dim);margin-top:8px">${d}</div>
      </div>`).join('')}
  </div>

  <div class="hair" style="border-radius:11px;background:var(--card);padding:22px 24px;flex:1;display:flex;flex-direction:column;min-height:0">
    <div style="font-size:19px;font-weight:600;color:var(--ink);margin-bottom:16px">Cohort retention by week</div>
    <div style="display:grid;grid-template-columns:132px repeat(9,1fr);gap:6px;font-size:13px">
      <div></div>${Array.from({length:9},(_,i)=>`<div style="color:var(--dim);text-align:center">W${i}</div>`).join('')}
      ${[['Jun 2',[100,71,58,49,44,40,38,36,35]],
         ['Jun 9',[100,68,55,47,42,39,37,35,0]],
         ['Jun 16',[100,73,61,52,47,43,40,0,0]],
         ['Jun 23',[100,76,64,55,49,45,0,0,0]],
         ['Jun 30',[100,74,62,54,48,0,0,0,0]],
         ['Jul 7',[100,79,67,58,0,0,0,0,0]],
         ['Jul 14',[100,81,69,0,0,0,0,0,0]]].map(([label,row])=>`
        <div style="color:var(--dim);display:flex;align-items:center">${label}</div>
        ${row.map(v=>v===0
          ? `<div style="height:42px;border-radius:5px;background:transparent"></div>`
          : `<div class="mono" style="height:42px;border-radius:5px;display:flex;align-items:center;justify-content:center;
                 background:rgba(217,164,65,${(v/100*0.82+0.06).toFixed(2)});
                 color:${v>55?'#161206':'#cfd6de'}">${v}</div>`).join('')}
      `).join('')}
    </div>
  </div>
</div>`, { dark: true });
