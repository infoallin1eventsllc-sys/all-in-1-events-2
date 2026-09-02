import { full, shell, line, gridlines, icon, avatar } from './base.mjs';

/* ── p7 · Financial & Revenue BI ───────────────────────────────────────────
   Operate. An executive reads this before a board call, so one figure leads
   and the rest is evidence. Green is spent only on variance — never on a
   heading, never on a border. Scaled to 1.06 and bled off the right edge:
   case-study framing, so the focal column is legible at thumbnail size. */
export const finance = () => full(shell({
  brand: 'Northgate', crumbs: ['Finance', 'Revenue'], user: 'DM', accent: '#2f7a5b',
  nav: [
    { section: 'Overview' },
    { icon: 'home',  label: 'Home' },
    { icon: 'chart', label: 'Revenue', on: true },
    { icon: 'line',  label: 'Forecast' },
    { section: 'Ledger' },
    { icon: 'wallet', label: 'Cash flow' },
    { icon: 'doc',    label: 'Statements', badge: '3' },
    { icon: 'users',  label: 'Entities' },
    { section: 'Admin' },
    { icon: 'cog', label: 'Settings' },
  ],
  body: `
  <div style="padding:30px 36px;display:flex;flex-direction:column;gap:22px;height:100%;background:var(--bg)">
    <div style="display:flex;align-items:flex-end;gap:14px">
      <div>
        <div style="font-size:22px;font-weight:600;letter-spacing:-.01em">Revenue overview</div>
        <div style="font-size:13.5px;color:var(--dim);margin-top:5px">Consolidated · 4 entities · updated 14 minutes ago</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <div style="display:flex;border:1px solid var(--line);border-radius:5px;overflow:hidden">
          ${['Month','Quarter','Year'].map((t,i)=>`<span style="font-size:13px;padding:7px 13px;color:${i===1?'var(--ink)':'var(--dim)'};
            background:${i===1?'var(--surface-3)':'var(--surface)'};${i?'border-left:1px solid var(--line)':''}">${t}</span>`).join('')}
        </div>
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2);border:1px solid var(--line);
                     border-radius:5px;padding:7px 12px;background:var(--surface)">${icon('calendar',{s:14})}Q3 FY26</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
      ${[['Net revenue','$14.82M','+6.4%','vs forecast','#2f7a5b',true],
         ['Gross margin','61.3%','+120bps','vs Q2','#2f7a5b'],
         ['Operating cash','$3.94M','−5.1%','vs Q2','#a8543c'],
         ['Runway','19 mo','—','unchanged','#6f7680']].map(([k,v,d,sub,c,lead])=>`
        <div class="card" style="padding:16px 18px;${lead?`border-color:${c}44;box-shadow:inset 3px 0 0 ${c}`:''}">
          <div class="cap">${k}</div>
          <div class="display num" style="font-size:${lead?'40px':'32px'};margin-top:10px;color:var(--ink)">${v}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:9px;font-size:12.5px">
            <span class="num" style="color:${c};font-weight:500">${d}</span><span style="color:var(--faint)">${sub}</span>
          </div>
        </div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:1.62fr 1fr;gap:14px;flex:1;min-height:0">
      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:15px;font-weight:600">Revenue vs forecast</span>
          <span style="font-size:12.5px;color:var(--faint)">USD, millions</span>
          <div style="margin-left:auto;display:flex;gap:16px;font-size:12.5px;color:var(--dim)">
            <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:2px;background:#2f7a5b"></span>Actual</span>
            <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:2px;background:var(--faint);opacity:.7"></span>Forecast</span>
          </div>
        </div>
        <div style="position:relative;flex:1;margin-top:14px;min-height:0">
          ${gridlines(4)}
          <div style="position:absolute;inset:0">${line([9.1,9.8,9.5,10.9,11.6,11.2,12.7,13.6,13.1,14.0,14.5,14.82],{c:'#2f7a5b'})}</div>
          <div style="position:absolute;inset:0;opacity:.5">${line([9.3,9.7,10.0,10.5,11.1,11.6,12.2,12.7,13.2,13.6,13.9,14.2],{c:'#6f7680',fill:false,dash:true})}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--faint);margin-top:10px;
                    padding-top:10px;border-top:1px solid var(--line-2)">
          ${['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'].map(m=>`<span>${m}</span>`).join('')}
        </div>
      </div>

      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center"><span style="font-size:15px;font-weight:600">By segment</span>
          <span style="margin-left:auto;color:var(--faint)">${icon('more',{s:16})}</span></div>
        <div style="flex:1;display:flex;flex-direction:column;justify-content:space-around;margin-top:6px">
        ${[['Enterprise','$7.91M','53.4%',53],['Mid-market','$4.32M','29.1%',29],
           ['SMB','$1.88M','12.7%',13],['Partner','$0.71M','4.8%',5]].map(([n,v,pc,w])=>`
          <div>
            <div style="display:flex;align-items:baseline;font-size:13.5px">
              <span style="color:var(--ink-2)">${n}</span>
              <span class="num" style="margin-left:auto;color:var(--ink);font-weight:500">${v}</span>
              <span class="num" style="width:52px;text-align:right;color:var(--faint);font-size:12.5px">${pc}</span>
            </div>
            <div style="height:5px;border-radius:3px;background:var(--surface-3);margin-top:8px;overflow:hidden">
              <div style="width:${w}%;height:100%;background:#2f7a5b;opacity:.85"></div></div>
          </div>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:14px;
                    margin-top:12px;border-top:1px solid var(--line);font-size:13.5px">
          <span style="color:var(--dim)">Total</span>
          <span class="num" style="font-weight:600;font-size:16px">$14.82M</span>
        </div>
      </div>
    </div>
  </div>`
}));

/* ── p8 · CRM pipeline ─────────────────────────────────────────────────────
   The job is spotting what is stuck, so age is the loudest thing on a card
   and a stalled deal is the only one that gets colour. */
export const crm = () => full(shell({
  brand: 'Corvus', crumbs: ['Sales', 'Pipeline'], user: 'LM', accent: '#3061a8', env: 'Live',
  nav: [
    { section: 'Sell' },
    { icon: 'home',   label: 'Dashboard' },
    { icon: 'target', label: 'Pipeline', on: true },
    { icon: 'inbox',  label: 'Inbox', badge: '12' },
    { icon: 'users',  label: 'Accounts' },
    { section: 'Insight' },
    { icon: 'chart',    label: 'Forecast' },
    { icon: 'calendar', label: 'Activity' },
    { section: 'Team' },
    { icon: 'cog', label: 'Settings' },
  ],
  body: `
  <div style="padding:26px 32px;display:flex;flex-direction:column;gap:18px;height:100%;background:var(--bg)">
    <div style="display:flex;align-items:flex-end;gap:14px">
      <div>
        <div style="font-size:22px;font-weight:600;letter-spacing:-.01em">Pipeline</div>
        <div style="font-size:13.5px;color:var(--dim);margin-top:5px">62 open · <span class="num">$2.41M</span> weighted · 3 reps</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2);border:1px solid var(--line);
                     border-radius:5px;padding:7px 12px;background:var(--surface)">${icon('filter',{s:14})}All reps</span>
        <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:#fff;background:#3061a8;
                     border-radius:5px;padding:8px 14px;font-weight:500">${icon('plus',{s:14,c:'#fff'})}New deal</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;flex:1;min-height:0">
      ${[['Qualified','$742K',18,'#8b929c',[['Halden Logistics','$96K','RO','4d',0],['Bright Path Clinics','$54K','MV','2d',0],['Orrin Manufacturing','$128K','RO','9d',0],['Sable Freight','$77K','LM','1d',0],['Nine Elms Dental','$41K','MV','5d',0]]],
         ['Proposal sent','$610K',11,'#3061a8',[['Kestrel Foods','$210K','LM','1d',0],['Loam Agriculture','$134K','RO','2d',0],['Verity Legal','$96K','LM','8d',0],['Tuvia Rail','$88K','MV','6d',0],['Pell & Draper','$82K','MV','3d',0]]],
         ['Negotiation','$538K',8,'#b0812f',[['Anvil Components','$305K','LM','11d',0],['Wrenfield Group','$118K','MV','34d',1],['Fen & Co.','$71K','RO','3d',0],['Astley Marine','$44K','LM','7d',0]]],
         ['Closed won','$521K',9,'#2f7a5b',[['Marrow Health','$182K','MV','—',0],['Kite Systems','$146K','LM','—',0],['Calder Interiors','$97K','RO','—',0],['Bramble Cafe Co.','$96K','MV','—',0]]]
        ].map(([name,total,count,c,cards])=>`
        <div style="display:flex;flex-direction:column;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;padding:0 2px 10px">
            <span style="width:6px;height:6px;border-radius:50%;background:${c}"></span>
            <span style="font-size:13.5px;font-weight:600">${name}</span>
            <span class="num" style="font-size:12px;color:var(--dim);background:var(--surface-3);border-radius:3px;padding:1px 6px">${count}</span>
            <span class="num" style="margin-left:auto;font-size:13px;color:var(--dim)">${total}</span>
          </div>
          <div style="height:2px;background:${c};opacity:.35;border-radius:2px;margin-bottom:10px"></div>
          <div style="display:flex;flex-direction:column;gap:8px;min-height:0">
          ${cards.map(([co,amt,rep,age,stale])=>`
            <div class="card" style="padding:11px 12px;${stale?'border-color:#b0812f55':''}">
              <div style="font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${co}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
                <span class="num" style="font-size:16px;font-weight:600">${amt}</span>
                <span class="num" style="margin-left:auto;font-size:12px;color:${stale?'#b0812f':'var(--faint)'};
                      ${stale?'background:#b0812f18;border-radius:3px;padding:1px 6px;font-weight:500':''}">${age}</span>
              </div>
              <div style="display:flex;align-items:center;gap:7px;margin-top:10px;padding-top:9px;border-top:1px solid var(--line-2)">
                ${avatar(rep)}<span style="font-size:12px;color:var(--dim)">${{RO:'R. Osei',MV:'M. Vance',LM:'L. Marsh'}[rep]}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>
  </div>`
}));

/* ── p9 · Analytics · dark ─────────────────────────────────────────────────
   A surface people leave open all day. The heatmap is the subject, so amber
   is spent entirely on it and nothing else in the frame is coloured. */
export const analytics = () => full(shell({
  brand: 'Atlas', crumbs: ['Product', 'Retention'], user: 'SK', accent: '#c8913a', env: 'Prod',
  nav: [
    { section: 'Analyse' },
    { icon: 'grid',   label: 'Overview' },
    { icon: 'line',   label: 'Retention', on: true },
    { icon: 'users',  label: 'Cohorts' },
    { icon: 'target', label: 'Funnels' },
    { section: 'Data' },
    { icon: 'layers', label: 'Events', badge: '48' },
    { icon: 'server', label: 'Sources' },
    { section: 'Workspace' },
    { icon: 'cog', label: 'Settings' },
  ],
  body: `
  <div style="padding:30px 36px;display:flex;flex-direction:column;gap:20px;height:100%;background:var(--bg)">
    <div style="display:flex;align-items:flex-end;gap:14px">
      <div>
        <div style="font-size:22px;font-weight:600;letter-spacing:-.01em">Weekly retention</div>
        <div style="font-size:13.5px;color:var(--dim);margin-top:5px">84,912 users · 7 cohorts · streaming</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2);border:1px solid var(--line);
                     border-radius:5px;padding:7px 12px;background:var(--surface)">${icon('filter',{s:14})}All plans</span>
        <span style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#c8913a;border:1px solid #c8913a44;
                     background:#c8913a14;border-radius:5px;padding:7px 12px">
          <span style="width:6px;height:6px;border-radius:50%;background:#c8913a"></span>Live</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
      ${[['Week-4 retention','38.2%','+2.1 pts'],['Median session','6m 41s','+18s'],
         ['Activation','54.9%','−0.6 pts'],['At risk','1,204','+92']].map(([k,v,d])=>`
        <div class="card" style="padding:16px 18px">
          <div class="cap">${k}</div>
          <div class="display num" style="font-size:30px;margin-top:10px">${v}</div>
          <div class="num" style="font-size:12.5px;color:var(--dim);margin-top:9px">${d}</div>
        </div>`).join('')}
    </div>

    <div class="card" style="padding:18px 20px;flex:1;display:flex;flex-direction:column;min-height:0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <span style="font-size:15px;font-weight:600">Cohort retention</span>
        <span style="font-size:12.5px;color:var(--faint)">% of cohort active in week N</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--faint)">
          <span>0%</span>
          ${[.1,.28,.46,.64,.82,1].map(o=>`<span style="width:22px;height:9px;background:rgba(200,145,58,${o});border-radius:1px"></span>`).join('')}
          <span>100%</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:92px 58px repeat(9,1fr);grid-template-rows:auto repeat(7,1fr);gap:4px;font-size:12px;flex:1;align-items:stretch">
        <div class="cap" style="font-size:10.5px;align-self:end;padding-bottom:4px">Cohort</div><div class="cap" style="font-size:10.5px;text-align:right;align-self:end;padding-bottom:4px">Users</div>
        ${Array.from({length:9},(_,i)=>`<div class="cap" style="font-size:10.5px;text-align:center;align-self:end;padding-bottom:4px">W${i}</div>`).join('')}
        ${[['Jun 2','12,408',[100,71,58,49,44,40,38,36,35]],
           ['Jun 9','11,982',[100,68,55,47,42,39,37,35,null]],
           ['Jun 16','13,204',[100,73,61,52,47,43,40,null,null]],
           ['Jun 23','12,776',[100,76,64,55,49,45,null,null,null]],
           ['Jun 30','14,022',[100,74,62,54,48,null,null,null,null]],
           ['Jul 7','13,540',[100,79,67,58,null,null,null,null,null]],
           ['Jul 14','12,980',[100,81,69,null,null,null,null,null,null]]].map(([label,users,row])=>`
          <div style="display:flex;align-items:center;color:var(--ink-2)">${label}</div>
          <div class="num" style="display:flex;align-items:center;justify-content:flex-end;color:var(--faint)">${users}</div>
          ${row.map(v=>v===null
            ? `<div style="border-radius:2px;background:var(--surface-2);opacity:.4"></div>`
            : `<div class="num" style="border-radius:2px;display:flex;align-items:center;justify-content:center;font-weight:500;
                   background:rgba(200,145,58,${(v/100*0.88+0.07).toFixed(2)});
                   color:${v>58?'#171208':'#d8dde3'}">${v}</div>`).join('')}
        `).join('')}
      </div>
    </div>
  </div>`
}));
