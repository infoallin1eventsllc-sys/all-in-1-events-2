import { stage, icon } from './base.mjs';

/* ── p5 · Coffee identity ──────────────────────────────────────────────────
   Experience mode: this one may lead. A brand is shown the way a brand is
   actually presented — the mark, the grid it was drawn on, the palette with
   values, and then the mark doing work on packaging and a sign. A logo
   floating alone proves nothing about whether it survives being used. */
const mark = (c = '#2b1f16', s = 100) => `
<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none">
  <path d="M50 9c21.5 0 35 17.5 35 41S71.5 91 50 91 15 73.5 15 50 28.5 9 50 9z" fill="${c}"/>
  <path d="M50 14c-8.5 11-8.5 61 0 72" stroke="#efe9e0" stroke-width="4.6" stroke-linecap="round"/>
</svg>`;

export const coffee = () => stage(`
<div style="position:absolute;inset:0;display:grid;grid-template-columns:1.05fr 1.25fr;
            grid-template-rows:1fr 1fr;background:#efe9e0">

  <!-- the mark, on its construction grid -->
  <div style="grid-row:1 / span 2;border-right:1px solid #ddd3c6;display:flex;flex-direction:column;
              align-items:center;justify-content:space-evenly;gap:0;padding:52px 34px">
    <div style="position:relative;width:262px;height:262px">
      <svg width="262" height="262" viewBox="0 0 100 100" style="position:absolute;inset:0">
        ${Array.from({length:9},(_,i)=>`<line x1="${i*12.5}" y1="0" x2="${i*12.5}" y2="100" stroke="#d6cabb" stroke-width="0.35"/>
          <line x1="0" y1="${i*12.5}" x2="100" y2="${i*12.5}" stroke="#d6cabb" stroke-width="0.35"/>`).join('')}
        <circle cx="50" cy="50" r="41" fill="none" stroke="#d6cabb" stroke-width="0.35"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${mark('#2b1f16',186)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-family:Hanken;font-weight:700;font-size:44px;letter-spacing:.24em;color:#2b1f16">HOLLOW</div>
      <div style="font-size:13px;letter-spacing:.46em;color:#7a6a58;margin-top:11px">ROASTERS</div>
    </div>
    <div style="display:flex;gap:0;border:1px solid #ddd3c6;border-radius:4px;overflow:hidden">
      ${[['#2b1f16','2B1F16'],['#6b452c','6B452C'],['#a9784f','A9784F'],['#c9ae８a'.replace('８','8'),'C9AE8A'],['#efe9e0','EFE9E0']].map(([c,hex],i)=>`
        <div style="width:84px">
          <div style="height:68px;background:${c}"></div>
          <div style="font-size:9px;letter-spacing:.05em;color:#7a6a58;text-align:center;padding:6px 0;
                      background:#fff;${i?'border-left:1px solid #ddd3c6':''}">${hex}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- packaging -->
  <div style="display:flex;align-items:center;justify-content:center;gap:26px;
              border-bottom:1px solid #ddd3c6;padding:30px">
    ${[['#2b1f16','#efe9e0','SINGLE ORIGIN','Kamwangi AA','KENYA · WASHED'],
       ['#c9ae8a','#2b1f16','HOUSE BLEND','Ember No. 4','BRAZIL · NATURAL']].map(([bg,fg,k,n,o])=>`
      <div style="width:212px;height:286px;border-radius:3px 3px 2px 2px;background:${bg};position:relative;
                  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;
                  box-shadow:inset -22px 0 34px #00000018, 0 16px 34px -14px #00000030">
        <div style="position:absolute;top:0;left:0;right:0;height:16px;background:${fg};opacity:.14"></div>
        ${mark(fg === '#efe9e0' ? '#efe9e0' : '#2b1f16', 46)}
        <div style="text-align:center;color:${fg}">
          <div style="font-size:9.5px;letter-spacing:.22em;opacity:.8">${k}</div>
          <div style="font-family:Hanken;font-weight:700;font-size:20px;margin-top:7px;letter-spacing:-.01em">${n}</div>
        </div>
        <div style="width:44px;height:1px;background:${fg};opacity:.35"></div>
        <div style="font-size:9px;letter-spacing:.14em;color:${fg};opacity:.7">${o}</div>
        <div style="position:absolute;bottom:14px;font-size:8.5px;letter-spacing:.16em;color:${fg};opacity:.55">250 G · WHOLE BEAN</div>
      </div>`).join('')}
  </div>

  <!-- signage -->
  <div style="display:flex;align-items:center;justify-content:center;padding:30px 34px">
    <div style="width:100%;height:252px;border-radius:5px;background:#241a12;position:relative;
                display:flex;align-items:center;justify-content:center;gap:24px;
                box-shadow:inset 0 0 0 7px #17100b, 0 20px 44px -16px #00000055">
      <div style="position:absolute;top:0;left:0;right:0;height:44%;
                  background:linear-gradient(180deg,#ffffff10,transparent)"></div>
      ${mark('#efe9e0', 70)}
      <div>
        <div style="font-family:Hanken;font-weight:700;font-size:34px;letter-spacing:.22em;color:#efe9e0">HOLLOW</div>
        <div style="font-size:11px;letter-spacing:.4em;color:#a9784f;margin-top:8px">ROASTERS · EST 2019</div>
      </div>
      <div style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);width:104px;height:7px;background:#17100b;border-radius:0 0 2px 2px"></div>
    </div>
  </div>
</div>`);
