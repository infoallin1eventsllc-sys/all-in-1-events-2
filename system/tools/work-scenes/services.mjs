/**
 * Service-card images.
 *
 * These are cropped two incompatible ways by the site: a short full-width
 * banner on the home grid, and a tall panel in Solutions with a dark gradient
 * over its lower third. So every one of these is a centred subject with wide
 * margins and nothing load-bearing near an edge — a composition that survives
 * both crops rather than one that looks best uncropped.
 */
const ground = (c1, c2, body) => `
<div style="flex:1;background:linear-gradient(150deg,${c1},${c2});display:flex;
            align-items:center;justify-content:center;padding:96px 70px">${body}</div>`;

const win = (inner, { w = 1080, dark = false } = {}) => `
<div style="width:${w}px;border-radius:13px;overflow:hidden;background:${dark?'#111820':'#fff'};
            border:1px solid ${dark?'#26313d':'#dde3ea'};box-shadow:0 26px 60px -24px #0b111a55">
  <div style="height:38px;display:flex;align-items:center;gap:7px;padding:0 15px;
              background:${dark?'#0d1319':'#f4f7fa'};border-bottom:1px solid ${dark?'#26313d':'#e5eaf0'}">
    ${['#d9d9d9','#d9d9d9','#d9d9d9'].map(()=>`<span style="width:9px;height:9px;border-radius:50%;background:${dark?'#2b3844':'#d5dbe3'}"></span>`).join('')}
  </div>${inner}</div>`;

const phoneSm = (inner, { r = -7 } = {}) => `
<div style="width:250px;height:512px;border-radius:32px;background:#fff;border:9px solid #1b2027;
            overflow:hidden;transform:rotate(${r}deg);box-shadow:0 26px 60px -22px #0b111a66;flex-shrink:0">${inner}</div>`;

/* Web — a landing page reduced to its skeleton: one headline, one action, a
   supporting row. The shape of a page that converts, not a picture of a laptop. */
export const webDesign = () => ground('#eef2f7','#dfe6ee', win(`
  <div style="padding:44px 46px;display:flex;flex-direction:column;gap:26px">
    <div style="display:flex;align-items:center;gap:26px">
      <div style="width:96px;height:13px;border-radius:3px;background:#1b2430"></div>
      <div style="display:flex;gap:20px;margin-left:auto">
        ${[54,44,48,38].map(w=>`<div style="width:${w}px;height:9px;border-radius:3px;background:#c3ccd8"></div>`).join('')}
      </div>
      <div style="width:104px;height:32px;border-radius:7px;background:#2d5f8f"></div>
    </div>
    <div style="display:flex;gap:38px;align-items:center;margin-top:8px">
      <div style="flex:1.1;display:flex;flex-direction:column;gap:15px">
        <div style="width:96%;height:26px;border-radius:5px;background:#1b2430"></div>
        <div style="width:74%;height:26px;border-radius:5px;background:#1b2430"></div>
        <div style="width:88%;height:11px;border-radius:4px;background:#c3ccd8;margin-top:6px"></div>
        <div style="width:66%;height:11px;border-radius:4px;background:#c3ccd8"></div>
        <div style="display:flex;gap:12px;margin-top:12px">
          <div style="width:146px;height:42px;border-radius:8px;background:#2d5f8f"></div>
          <div style="width:118px;height:42px;border-radius:8px;border:1px solid #c3ccd8"></div>
        </div>
      </div>
      <div style="flex:1;height:210px;border-radius:11px;background:linear-gradient(140deg,#c8d4e2,#9fb2c6)"></div>
    </div>
    <div style="display:flex;gap:18px;margin-top:6px">
      ${[0,1,2].map(()=>`<div style="flex:1;height:74px;border-radius:9px;border:1px solid #e0e6ed;background:#f8fafc"></div>`).join('')}
    </div>
  </div>`));

/* App — two screens, overlapping, at an angle. One phone flat-on is the stock
   photograph this replaces. */
export const appDesign = () => ground('#1b2430','#0e151d', `
  <div style="display:flex;align-items:center;justify-content:center;position:relative;height:100%">
    ${phoneSm(`<div style="padding:44px 20px;height:100%;background:#f7f9fb;display:flex;flex-direction:column;gap:14px">
      <div style="width:60%;height:15px;border-radius:4px;background:#1b2430"></div>
      <div style="width:100%;height:118px;border-radius:12px;background:linear-gradient(140deg,#2d5f8f,#1b3a58)"></div>
      ${[0,1,2,3].map(()=>`<div style="display:flex;gap:11px;align-items:center">
        <div style="width:38px;height:38px;border-radius:11px;background:#dde4ec"></div>
        <div style="flex:1"><div style="width:74%;height:10px;border-radius:3px;background:#c9d2dc"></div>
          <div style="width:44%;height:8px;border-radius:3px;background:#e2e8ef;margin-top:7px"></div></div>
      </div>`).join('')}
    </div>`, { r: -8 })}
    <div style="width:-56px;margin-left:-56px"></div>
    ${phoneSm(`<div style="padding:44px 20px;height:100%;background:#101820;display:flex;flex-direction:column;gap:14px">
      <div style="width:52%;height:15px;border-radius:4px;background:#e6ebf1"></div>
      <div style="width:78%;height:34px;border-radius:5px;background:#4fa87c;opacity:.9"></div>
      <div style="width:100%;height:96px;border-radius:12px;background:#18222c"></div>
      ${[0,1,2].map(()=>`<div><div style="width:100%;height:7px;border-radius:4px;background:#1e2a35"></div></div>`).join('')}
      <div style="margin-top:auto;display:flex;gap:9px">
        ${[0,1,2].map(i=>`<div style="flex:1;height:40px;border-radius:9px;background:${i===0?'#1d4d3a':'#18222c'}"></div>`).join('')}
      </div>
    </div>`, { r: 7 })}
  </div>`);

/* Dashboards — the KPI row and one chart, large. At banner height this is the
   only part that survives, so it is the only part that is here. */
export const dashboardDesign = () => ground('#f2f5f8','#e2e8ef', win(`
  <div style="padding:38px 40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;gap:18px">
      ${[['#2f6f57','$14.8M'],['#2d5f8f','61.3%'],['#b07d2c','1,204'],['#5b6472','19 mo']].map(([c,v])=>`
        <div style="flex:1;border:1px solid #e2e8ef;border-radius:10px;padding:16px 18px">
          <div style="width:56%;height:8px;border-radius:3px;background:#ccd5df"></div>
          <div class="mono" style="font-family:Hanken;font-weight:800;font-size:30px;color:#1b2430;margin-top:10px">${v}</div>
          <div style="width:38%;height:7px;border-radius:3px;background:${c};opacity:.55;margin-top:10px"></div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:18px">
      <div style="flex:1.8;border:1px solid #e2e8ef;border-radius:10px;padding:20px;height:224px;
                  display:flex;align-items:flex-end;gap:10px">
        ${[38,46,41,58,52,64,60,74,69,82,78,92].map((h,i)=>`
          <div style="flex:1;height:${h}%;border-radius:4px 4px 0 0;background:${i>8?'#2f6f57':'#2f6f5766'}"></div>`).join('')}
      </div>
      <div style="flex:1;border:1px solid #e2e8ef;border-radius:10px;padding:20px;height:224px;
                  display:flex;flex-direction:column;justify-content:space-between">
        ${[72,54,38,22].map(w=>`<div><div style="width:44%;height:8px;border-radius:3px;background:#ccd5df"></div>
          <div style="height:8px;border-radius:4px;background:#eef2f6;margin-top:9px;overflow:hidden">
            <div style="width:${w}%;height:100%;background:#2d5f8f"></div></div></div>`).join('')}
      </div>
    </div>
  </div>`));

/* Logo — the construction, not the finished mark. Showing the grid is what
   distinguishes a drawn identity from a generated one.
   The wordmark here is a fictional client. It must never be MERIDIAN: printing
   his own name beside a mark that is not his logo is the exact mistake this
   site already made once. */
export const logoDesign = () => ground('#f6f4f0','#e8e3da', `
  <div style="display:flex;align-items:center;gap:70px">
    <div style="position:relative;width:330px;height:330px;flex-shrink:0">
      <svg width="330" height="330" viewBox="0 0 100 100">
        ${Array.from({length:9},(_,i)=>`<line x1="${i*12.5}" y1="0" x2="${i*12.5}" y2="100" stroke="#cfc7ba" stroke-width="0.4"/>
          <line x1="0" y1="${i*12.5}" x2="100" y2="${i*12.5}" stroke="#cfc7ba" stroke-width="0.4"/>`).join('')}
        <circle cx="50" cy="50" r="37.5" fill="none" stroke="#cfc7ba" stroke-width="0.4"/>
        <circle cx="50" cy="50" r="25" fill="none" stroke="#cfc7ba" stroke-width="0.4"/>
        <path d="M28 74V38c0-9 7-15 14-11l8 5 8-5c7-4 14 2 14 11v36" fill="none" stroke="#2b2620" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="50" y1="22" x2="50" y2="78" stroke="#8a7f6d" stroke-width="1.6"/>
      </svg>
    </div>
    <div style="display:flex;flex-direction:column;gap:22px">
      ${[['#2b2620','#f6f4f0'],['#f6f4f0','#2b2620'],['#8a5a3b','#f6f4f0']].map(([bg,fg])=>`
        <div style="width:230px;height:88px;border-radius:9px;background:${bg};border:1px solid #00000012;
                    display:flex;align-items:center;justify-content:center;gap:13px">
          <svg width="34" height="34" viewBox="0 0 100 100"><path d="M28 74V38c0-9 7-15 14-11l8 5 8-5c7-4 14 2 14 11v36"
            fill="none" stroke="${fg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div style="font-family:Hanken;font-weight:800;font-size:20px;letter-spacing:.19em;color:${fg}">MARLOW</div>
        </div>`).join('')}
    </div>
  </div>`);

/* Everything together — the pieces in one frame, overlapped, because the point
   of the bundle is that they are one system rather than five purchases. */
export const fullPackage = () => ground('#1b2430','#0d141c', `
  <div style="position:relative;display:flex;align-items:center;justify-content:center;height:100%">
    <div style="transform:translateX(70px)">
      ${win(`<div style="padding:30px 32px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;gap:14px">
          ${[0,1,2,3].map(i=>`<div style="flex:1;border:1px solid #e2e8ef;border-radius:9px;padding:13px">
            <div style="width:60%;height:7px;border-radius:3px;background:#ccd5df"></div>
            <div style="width:74%;height:20px;border-radius:4px;background:#1b2430;margin-top:9px"></div></div>`).join('')}
        </div>
        <div style="height:150px;border:1px solid #e2e8ef;border-radius:9px;display:flex;align-items:flex-end;gap:8px;padding:16px">
          ${[42,55,48,66,61,74,70,86].map((h,i)=>`<div style="flex:1;height:${h}%;border-radius:3px 3px 0 0;background:${i>5?'#2d5f8f':'#2d5f8f55'}"></div>`).join('')}
        </div>
      </div>`, { w: 760 })}
    </div>
    <div style="position:absolute;left:34px;bottom:52px">
      ${phoneSm(`<div style="padding:40px 18px;height:100%;background:#101820;display:flex;flex-direction:column;gap:12px">
        <div style="width:56%;height:13px;border-radius:4px;background:#e6ebf1"></div>
        <div style="width:100%;height:84px;border-radius:11px;background:#18222c"></div>
        ${[0,1,2].map(()=>`<div style="width:100%;height:7px;border-radius:3px;background:#1e2a35"></div>`).join('')}
      </div>`, { r: -9 })}
    </div>
    <div style="position:absolute;right:26px;bottom:64px;width:210px;height:132px;border-radius:11px;
                background:#f6f4f0;display:flex;align-items:center;justify-content:center;gap:11px;
                box-shadow:0 22px 50px -20px #00000066;transform:rotate(6deg)">
      <svg width="30" height="30" viewBox="0 0 100 100"><path d="M28 74V38c0-9 7-15 14-11l8 5 8-5c7-4 14 2 14 11v36"
        fill="none" stroke="#2b2620" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div style="font-family:Hanken;font-weight:800;font-size:17px;letter-spacing:.17em;color:#2b2620">MARLOW</div>
    </div>
  </div>`);
