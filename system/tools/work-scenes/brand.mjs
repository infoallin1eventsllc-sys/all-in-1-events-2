import { icon } from './base.mjs';

/* p5 — Artisan coffee identity. Experience mode: this one is allowed to lead.
   A brand concept is shown the way a brand is actually presented — the mark,
   then the mark doing work on a bag and a sign — because a logo floating alone
   proves nothing about whether it survives being used. */
const bean = (c = '#3d2b1f', s = 84) => `
<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none">
  <path d="M50 8c20 0 34 18 34 42S70 92 50 92 16 74 16 50 30 8 50 8z" fill="${c}"/>
  <path d="M50 12c-7 10-7 66 0 76" stroke="#efe7dc" stroke-width="5" stroke-linecap="round"/>
</svg>`;

export const coffee = () => `
<div style="flex:1;display:grid;grid-template-columns:1.15fr 1fr;grid-template-rows:1fr 1fr;background:#efe7dc">

  <div style="grid-row:1 / span 2;display:flex;flex-direction:column;align-items:center;justify-content:center;
              gap:26px;border-right:1px solid #ded2c2">
    ${bean('#3d2b1f', 128)}
    <div style="text-align:center">
      <div style="font-family:Hanken;font-weight:800;font-size:40px;letter-spacing:.22em;color:#2b1f16">HOLLOW</div>
      <div style="font-size:16px;letter-spacing:.42em;color:#7a6a58;margin-top:9px">ROASTERS</div>
    </div>
    <div style="display:flex;gap:12px;margin-top:6px">
      ${['#3d2b1f','#8a5a3b','#c3a077','#efe7dc','#2b1f16'].map(c=>`
        <span style="width:42px;height:42px;border-radius:50%;background:${c};border:1px solid #00000014"></span>`).join('')}
    </div>
  </div>

  <div style="display:flex;align-items:center;justify-content:center;gap:26px;border-bottom:1px solid #ded2c2;padding:22px">
    ${[['#3d2b1f','#efe7dc','SINGLE ORIGIN','Kamwangi AA'],['#c3a077','#2b1f16','HOUSE BLEND','Ember No. 4']].map(([bg,fg,k,n])=>`
      <div style="width:214px;height:288px;border-radius:6px 6px 3px 3px;background:${bg};
                  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
                  box-shadow:inset 0 -18px 30px #00000018">
        ${bean(fg === '#efe7dc' ? '#efe7dc' : '#2b1f16', 54)}
        <div style="text-align:center;color:${fg}">
          <div style="font-size:11px;letter-spacing:.2em">${k}</div>
          <div style="font-family:Hanken;font-weight:800;font-size:22px;margin-top:7px">${n}</div>
        </div>
        <div style="width:52px;height:1px;background:${fg};opacity:.4"></div>
        <div style="font-size:11px;letter-spacing:.16em;color:${fg};opacity:.75">250 G · WHOLE BEAN</div>
      </div>`).join('')}
  </div>

  <div style="display:flex;align-items:center;justify-content:center;padding:22px 26px">
    <div style="width:100%;max-width:100%;height:250px;border-radius:8px;background:#2b1f16;
                display:flex;align-items:center;justify-content:center;gap:20px;position:relative;
                border:6px solid #1c130d">
      ${bean('#efe7dc', 78)}
      <div>
        <div style="font-family:Hanken;font-weight:800;font-size:40px;letter-spacing:.2em;color:#efe7dc">HOLLOW</div>
        <div style="font-size:13px;letter-spacing:.38em;color:#c3a077;margin-top:6px">ROASTERS · EST 2019</div>
      </div>
      <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
                  width:120px;height:6px;background:#1c130d"></div>
    </div>
  </div>
</div>`;
