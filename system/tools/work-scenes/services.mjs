import { stage, window_, phone, line, gridlines, icon, avatar } from './base.mjs';

/**
 * Service-card images.
 *
 * The first version was grey wireframe blocks — low-fidelity placeholders
 * standing in for design work, which is the opposite of what a service card
 * for design work should show. These are real interface at product fidelity.
 *
 * The site crops them two incompatible ways: a short full-width banner on the
 * home grid, and a tall panel in Solutions with a dark gradient over its lower
 * third. So each is a centred subject with margin to spare and nothing
 * load-bearing near an edge or in the bottom third.
 */

/* Web — a landing page at real fidelity, in a browser, because that is the
   artefact being sold. */
export const webDesign = () => stage(window_('lumenaero.com', `
<div style="height:660px;background:var(--surface);display:flex;flex-direction:column">
  <div style="height:62px;display:flex;align-items:center;padding:0 40px;gap:34px;border-bottom:1px solid var(--line-2)">
    <span style="font-family:Hanken;font-weight:700;font-size:17px;letter-spacing:-.01em">Lumen Aero</span>
    <div style="display:flex;gap:26px;font-size:13.5px;color:var(--ink-2)">
      ${['Platform','Solutions','Pricing','Docs'].map(t=>`<span>${t}</span>`).join('')}
    </div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:16px">
      <span style="font-size:13.5px;color:var(--ink-2)">Sign in</span>
      <span style="font-size:13.5px;color:#fff;background:#1f252b;border-radius:5px;padding:9px 16px;font-weight:500">Book a demo</span>
    </div>
  </div>
  <div style="flex:1;display:flex;align-items:center;gap:52px;padding:0 40px">
    <div style="flex:1.05;display:flex;flex-direction:column;gap:20px">
      <span class="cap" style="font-size:10.5px">Fleet operations</span>
      <div style="font-family:Hanken;font-weight:700;font-size:47px;line-height:1.08;letter-spacing:-.025em">
        Every aircraft,<br>accounted for.</div>
      <div style="font-size:15.5px;color:var(--ink-2);line-height:1.6;max-width:38ch">
        Maintenance, crew and dispatch on one record. Built for operators running
        twelve to four hundred tails.</div>
      <div style="display:flex;gap:11px;margin-top:6px">
        <span style="font-size:14.5px;color:#fff;background:#1f252b;border-radius:5px;padding:13px 24px;font-weight:500">Start free trial</span>
        <span style="font-size:14.5px;color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:13px 22px">See pricing</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:10px;padding-top:18px;border-top:1px solid var(--line-2)">
        <span style="font-size:12px;color:var(--faint)">Trusted by</span>
        ${['NORDAIR','VECTA','KELVIN','ORRIN'].map(n=>`<span style="font-family:Hanken;font-weight:700;font-size:12.5px;letter-spacing:.14em;color:var(--faint)">${n}</span>`).join('')}
      </div>
    </div>
    <div style="flex:1;height:400px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);
                padding:20px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:9px">
        <span style="width:7px;height:7px;border-radius:50%;background:#2f7a5b"></span>
        <span style="font-size:13px;font-weight:500">Fleet status</span>
        <span class="num" style="margin-left:auto;font-size:12px;color:var(--dim)">142 tails</span>
      </div>
      <div style="height:126px;position:relative">${gridlines(3)}${line([41,44,43,49,52,50,57,61,59,66,71,74],{c:'#3061a8'})}</div>
      ${[['In service','118','#2f7a5b'],['Scheduled maint.','19','#b0812f'],['AOG','5','#a8543c']].map(([k,v,c])=>`
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);
                    border:1px solid var(--line);border-radius:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:${c}"></span>
          <span style="font-size:13px;color:var(--ink-2)">${k}</span>
          <span class="num" style="margin-left:auto;font-size:14px;font-weight:600">${v}</span>
        </div>`).join('')}
    </div>
  </div>
</div>`, { x: 44, y: 96, w: 1512 }));

/* App — two screens at product fidelity, angled, on a dark stage. */
export const appDesign = () => stage(`
  ${phone(`
    <div style="padding:70px 22px 0;height:100%;background:linear-gradient(180deg,#141922,#0f1319);display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:9px">${avatar('AR','#1e2632')}
        <span style="font-size:13.5px;color:var(--dim)">Deliveries</span>
        <span style="margin-left:auto;color:var(--dim)">${icon('filter',{s:16})}</span></div>
      <div><div class="cap" style="font-size:10px">Out for delivery</div>
        <div class="display num" style="font-size:34px;margin-top:7px">24 <span style="font-size:16px;color:var(--dim);font-weight:400">of 31</span></div></div>
      <div style="height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden">
        <div style="width:77%;height:100%;background:#3061a8"></div></div>
      ${[['Kestrel Foods','2.4 km','On time','#2f7a5b'],['Halden Logistics','5.1 km','On time','#2f7a5b'],
         ['Orrin Manufacturing','8.8 km','Delayed','#b0812f'],['Sable Freight','11.2 km','On time','#2f7a5b']].map(([n,d,st,c])=>`
        <div style="display:flex;align-items:center;gap:11px;padding:12px;border-radius:6px;background:var(--surface-2)">
          <div style="width:32px;height:32px;border-radius:6px;background:var(--surface-3);flex-shrink:0"></div>
          <div style="min-width:0"><div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</div>
            <div class="num" style="font-size:11.5px;color:var(--faint);margin-top:2px">${d}</div></div>
          <span style="margin-left:auto;font-size:11px;color:${c};background:${c}1f;border-radius:3px;padding:3px 7px;white-space:nowrap">${st}</span>
        </div>`).join('')}
    </div>`, { w: 476, x: 206, y: 100, rot: -6 })}
  ${phone(`
    <div style="padding:70px 22px 0;height:100%;background:linear-gradient(180deg,#141922,#0f1319);display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center"><span style="font-size:16px;font-weight:600">Route 14</span>
        <span style="margin-left:auto;color:var(--dim)">${icon('more',{s:16})}</span></div>
      <div style="height:196px;border-radius:8px;background:var(--surface-2);position:relative;overflow:hidden">
        <svg viewBox="0 0 200 130" style="position:absolute;inset:0;width:100%;height:100%">
          ${[20,45,70,95,120].map(y=>`<line x1="0" y1="${y}" x2="200" y2="${y}" stroke="#ffffff08"/>`).join('')}
          ${[35,75,115,155].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="130" stroke="#ffffff08"/>`).join('')}
          <path d="M22 108 L58 96 L74 62 L118 52 L142 28 L178 22" fill="none" stroke="#3061a8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="22" cy="108" r="5" fill="#3061a8"/><circle cx="178" cy="22" r="5" fill="#2f7a5b"/>
          <circle cx="118" cy="52" r="4" fill="#0f1319" stroke="#3061a8" stroke-width="2.5"/>
        </svg>
      </div>
      ${[['Depot · 06:40','Departed','#2f7a5b'],['Stop 3 · 09:12','Signed for','#2f7a5b'],
         ['Stop 4 · 10:05','In progress','#3061a8'],['Stop 5 · 11:30','Scheduled','#6f7680']].map(([n,st,c],i)=>`
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
            <span style="width:9px;height:9px;border-radius:50%;background:${c};margin-top:4px"></span>
            ${i<3?'<span style="width:1.5px;height:26px;background:var(--line)"></span>':''}
          </div>
          <div><div style="font-size:13px;font-weight:500">${n}</div>
            <div style="font-size:11.5px;color:var(--faint);margin-top:2px">${st}</div></div>
        </div>`).join('')}
    </div>`, { w: 476, x: 842, y: 24, rot: 5 })}
`, { tone: 'dark' });

/* Dashboards — the KPI row and the chart, large. At banner height this is the
   only band that survives the crop, so it is the only band here. */
export const dashboardDesign = () => stage(window_('atlas.northgate.io', `
<div style="height:640px;background:var(--bg);padding:32px 36px;display:flex;flex-direction:column;gap:20px">
  <div style="display:flex;align-items:flex-end">
    <div><div style="font-size:21px;font-weight:600;letter-spacing:-.01em">Operations</div>
      <div style="font-size:13px;color:var(--dim);margin-top:5px">Live · updated 2 minutes ago</div></div>
    <div style="margin-left:auto;display:flex;border:1px solid var(--line);border-radius:5px;overflow:hidden;background:var(--surface)">
      ${['Day','Week','Month'].map((t,i)=>`<span style="font-size:13px;padding:7px 14px;color:${i===1?'var(--ink)':'var(--dim)'};
        background:${i===1?'var(--surface-3)':'transparent'};${i?'border-left:1px solid var(--line)':''}">${t}</span>`).join('')}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
    ${[['Throughput','14,802','+6.4%','#2f7a5b'],['On-time rate','96.1%','+0.8pts','#2f7a5b'],
       ['Exceptions','1,204','+92','#a8543c'],['Cycle time','19.4h','−1.2h','#2f7a5b']].map(([k,v,d,c])=>`
      <div class="card" style="padding:16px 18px">
        <div class="cap">${k}</div>
        <div class="display num" style="font-size:31px;margin-top:9px">${v}</div>
        <div class="num" style="font-size:12.5px;color:${c};margin-top:8px;font-weight:500">${d}</div>
      </div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:1.7fr 1fr;gap:14px;flex:1;min-height:0">
    <div class="card" style="padding:18px 20px;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:14.5px;font-weight:600">Volume by day</span>
        <span style="margin-left:auto;font-size:12.5px;color:var(--faint)">Last 14 days</span>
      </div>
      <div style="flex:1;display:flex;align-items:flex-end;gap:9px;margin-top:16px;min-height:0">
        ${[52,61,55,68,64,74,71,66,79,75,84,80,91,88].map((h,i)=>`
          <div style="flex:1;height:${h}%;border-radius:2px 2px 0 0;background:${i>10?'#3061a8':'#3061a8'};opacity:${i>10?1:.42}"></div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--faint);
                  margin-top:10px;padding-top:10px;border-top:1px solid var(--line-2)">
        <span>Mar 1</span><span>Mar 7</span><span>Mar 14</span>
      </div>
    </div>
    <div class="card" style="padding:18px 20px;display:flex;flex-direction:column">
      <span style="font-size:14.5px;font-weight:600">By facility</span>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-around;margin-top:8px">
      ${[['Rotterdam','4,912',72],['Felixstowe','3,804',56],['Antwerp','3,110',46],['Bilbao','2,976',44]].map(([n,v,w])=>`
        <div><div style="display:flex;font-size:13px"><span style="color:var(--ink-2)">${n}</span>
          <span class="num" style="margin-left:auto;font-weight:500">${v}</span></div>
          <div style="height:5px;border-radius:3px;background:var(--surface-3);margin-top:8px;overflow:hidden">
            <div style="width:${w}%;height:100%;background:#3061a8;opacity:.8"></div></div></div>`).join('')}
      </div>
    </div>
  </div>
</div>`, { x: 44, y: 128, w: 1512 }));

/* Logo — the construction, the palette, and the mark applied. Never MERIDIAN:
   printing his own name beside a mark that is not his logo is the exact
   mistake this site already made once. */
export const logoDesign = () => stage(`
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:74px;padding:0 100px">
  <div style="position:relative;width:330px;height:330px;flex-shrink:0">
    <svg width="330" height="330" viewBox="0 0 100 100" style="position:absolute;inset:0">
      ${Array.from({length:9},(_,i)=>`<line x1="${i*12.5}" y1="0" x2="${i*12.5}" y2="100" stroke="#00000012" stroke-width="0.35"/>
        <line x1="0" y1="${i*12.5}" x2="100" y2="${i*12.5}" stroke="#00000012" stroke-width="0.35"/>`).join('')}
      <circle cx="50" cy="50" r="38" fill="none" stroke="#00000012" stroke-width="0.35"/>
      <circle cx="50" cy="50" r="25" fill="none" stroke="#00000012" stroke-width="0.35"/>
      <path d="M29 74V39c0-8.5 6.5-14 13-10.2L50 33.5l8-4.7c6.5-3.8 13 1.7 13 10.2v35"
            fill="none" stroke="#1f252b" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="50" y1="21" x2="50" y2="79" stroke="#8a7f6d" stroke-width="1.2"/>
    </svg>
  </div>
  <div style="display:flex;flex-direction:column;gap:16px">
    ${[['#1f252b','#f6f4f0','Primary'],['#f6f4f0','#1f252b','Reversed'],['#8d6a4a','#f6f4f0','Accent']].map(([bg,fg,label])=>`
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:250px;height:84px;border-radius:6px;background:${bg};border:1px solid rgba(0,0,0,.08);
                    display:flex;align-items:center;justify-content:center;gap:13px">
          <svg width="30" height="30" viewBox="0 0 100 100"><path d="M29 74V39c0-8.5 6.5-14 13-10.2L50 33.5l8-4.7c6.5-3.8 13 1.7 13 10.2v35"
            fill="none" stroke="${fg}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div style="font-family:Hanken;font-weight:700;font-size:19px;letter-spacing:.2em;color:${fg}">MARLOW</div>
        </div>
        <span style="font-size:11.5px;color:var(--faint);letter-spacing:.05em">${label}</span>
      </div>`).join('')}
    <div style="display:flex;gap:0;border:1px solid rgba(0,0,0,.1);border-radius:4px;overflow:hidden;margin-top:6px">
      ${[['#1f252b','1F252B'],['#3d4650','3D4650'],['#8d6a4a','8D6A4A'],['#c4b39c','C4B39C'],['#f6f4f0','F6F4F0']].map(([c,hex],i)=>`
        <div style="width:66px"><div style="height:44px;background:${c}"></div>
          <div style="font-size:8.5px;letter-spacing:.04em;color:var(--faint);text-align:center;padding:5px 0;
                      background:var(--surface);${i?'border-left:1px solid rgba(0,0,0,.08)':''}">${hex}</div></div>`).join('')}
    </div>
  </div>
</div>`);

/* Everything together — the surfaces overlapped in one frame, because the
   point of the bundle is that they are one system rather than five purchases. */
export const fullPackage = () => stage(`
  <div style="position:absolute;left:290px;top:150px;width:1080px;border-radius:9px;overflow:hidden;
              border:1px solid rgba(255,255,255,.09);box-shadow:0 50px 100px -34px rgba(0,0,0,.75)">
    <div style="height:44px;background:var(--surface);border-bottom:1px solid var(--line);display:flex;align-items:center;
                gap:14px;padding:0 18px">
      <span style="width:20px;height:20px;border-radius:5px;background:#3061a8"></span>
      <span style="font-size:14px;font-weight:600">Marlow</span>
      <span style="font-size:13px;color:var(--dim)">Operations / Overview</span>
      <span style="margin-left:auto">${avatar('MK','var(--surface-3)')}</span>
    </div>
    <div style="background:var(--bg);padding:24px 26px;display:flex;flex-direction:column;gap:16px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${[['Revenue','$14.8M'],['Margin','61.3%'],['Orders','1,204'],['Runway','19 mo']].map(([k,v])=>`
          <div class="card" style="padding:14px 16px"><div class="cap" style="font-size:10px">${k}</div>
            <div class="display num" style="font-size:25px;margin-top:7px">${v}</div></div>`).join('')}
      </div>
      <div class="card" style="height:186px;padding:16px 18px;display:flex;align-items:flex-end;gap:8px">
        ${[46,55,50,63,58,70,66,78,73,85,80,92].map((h,i)=>`
          <div style="flex:1;height:${h}%;border-radius:2px 2px 0 0;background:#3061a8;opacity:${i>8?1:.4}"></div>`).join('')}
      </div>
    </div>
  </div>
  ${phone(`
    <div style="padding:66px 20px 0;height:100%;background:linear-gradient(180deg,#141922,#0f1319);display:flex;flex-direction:column;gap:13px">
      <div class="cap" style="font-size:10px">Today</div>
      <div class="display num" style="font-size:29px">$48,210</div>
      <div style="height:88px;margin:0 -4px">${line([30,34,32,41,45,43,52,58],{c:'#3f9d74'})}</div>
      ${[0,1,2].map(()=>`<div style="display:flex;align-items:center;gap:10px;padding:9px;border-radius:5px;background:var(--surface-2)">
        <div style="width:26px;height:26px;border-radius:6px;background:var(--surface-3)"></div>
        <div style="flex:1"><div style="width:70%;height:7px;border-radius:3px;background:var(--surface-3)"></div>
          <div style="width:44%;height:6px;border-radius:3px;background:var(--surface-3);opacity:.6;margin-top:6px"></div></div>
      </div>`).join('')}
    </div>`, { w: 316, x: 88, y: 372, rot: -8 })}
  <div style="position:absolute;right:74px;bottom:96px;width:250px;height:150px;border-radius:7px;background:#f6f4f0;
              display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
              box-shadow:0 30px 60px -20px rgba(0,0,0,.7);transform:rotate(6deg)">
    <svg width="34" height="34" viewBox="0 0 100 100"><path d="M29 74V39c0-8.5 6.5-14 13-10.2L50 33.5l8-4.7c6.5-3.8 13 1.7 13 10.2v35"
      fill="none" stroke="#1f252b" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div style="font-family:Hanken;font-weight:700;font-size:17px;letter-spacing:.2em;color:#1f252b">MARLOW</div>
    <div style="width:36px;height:1px;background:#1f252b;opacity:.25"></div>
    <div style="font-size:9px;letter-spacing:.16em;color:#6b6459">OPERATIONS PLATFORM</div>
  </div>
`, { tone: 'dark' });
