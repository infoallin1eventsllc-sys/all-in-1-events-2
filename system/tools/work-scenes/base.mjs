/**
 * Foundation for the portfolio and service mockups — second system.
 *
 * The first set was credible and generic: three-dot browser chrome, 12px
 * radii, GitHub's dark palette, icon-only sidebars and no sign that anyone
 * had ever logged in. Competent mockups. This is the system that separates
 * product design at the top of the market from that:
 *
 *   Radii      4 controls · 6 cards · 12 windows · never larger.
 *   Hairlines  1px of ink at low alpha. No drop shadows on anything inside a
 *              product; elevation is expressed by a surface step.
 *   Type       Inter 400/500/600 for UI — semibold, never bold, which is what
 *              every serious product does. Hanken 700 only for display figures.
 *              Tabular numerals everywhere a number appears.
 *   Colour     Neutrals are tinted, never pure grey. One accent per product,
 *              spent only on meaning: state, variance, the thing under
 *              examination. Dark is near-black with a cool cast, not a
 *              recognisable palette borrowed from someone else's app.
 *   Chrome     A product that has shipped has a top bar with breadcrumbs, an
 *              environment badge, a search field, and a person logged in. A
 *              sidebar has sections with labels. Timestamps say when data was
 *              last true. All of that is what makes a screen read as real.
 *   Framing    Case-study composition: the device at product density, scaled
 *              up and allowed to bleed off an edge, so the focal region is
 *              legible at 450px and the rest reads as the product continuing.
 */
import fs from 'node:fs';

const FONTS = '/workspace/meridian-interface-website/public/fonts';
export const inter  = fs.readFileSync(`${FONTS}/inter-var-latin.woff2`).toString('base64');
export const hanken = fs.readFileSync(`${FONTS}/hanken-grotesk-var-latin.woff2`).toString('base64');

export const W = 1600, H = 1000;

/* Two tinted neutral ramps. Light leans cool-grey-blue; dark is a deep
   slate, not black and not GitHub. Tokens are the same names so no scene
   branches on theme. */
export const LIGHT = `
  --bg:#f3f4f6; --surface:#ffffff; --surface-2:#f8f9fb; --surface-3:#eef0f3;
  --ink:#16191d; --ink-2:#3d434b; --dim:#6f7680; --faint:#9aa1ab;
  --line:rgba(22,25,29,.10); --line-2:rgba(22,25,29,.06);
  --chrome:#e9ebee; --chrome-ink:#5b626b`;
export const DARK = `
  --bg:#0f1216; --surface:#161a20; --surface-2:#1b2027; --surface-3:#21272f;
  --ink:#eef0f3; --ink-2:#c5cad2; --dim:#8b929c; --faint:#5f6670;
  --line:rgba(238,240,243,.10); --line-2:rgba(238,240,243,.06);
  --chrome:#0b0d10; --chrome-ink:#8b929c`;

export const RESET = `
@font-face{font-family:Inter;font-weight:400 700;src:url(data:font/woff2;base64,${inter}) format('woff2')}
@font-face{font-family:Hanken;font-weight:400 900;src:url(data:font/woff2;base64,${hanken}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,system-ui,sans-serif;
     -webkit-font-smoothing:antialiased;font-feature-settings:"tnum","cv11";color:var(--ink)}
.scene{width:${W}px;height:${H}px;position:relative;overflow:hidden;display:flex}
.num{font-feature-settings:"tnum";letter-spacing:-0.012em}
.display{font-family:Hanken;font-weight:700;letter-spacing:-0.02em;line-height:1}
.cap{font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:6px}
.hr{height:1px;background:var(--line)}
`;

/* ─── Stage ────────────────────────────────────────────────────────────────
   The backdrop a device sits on. A single soft light from the upper left,
   nothing else. */
export const stage = (body, { tone = 'light' } = {}) => {
  const bg = tone === 'dark'
    ? 'radial-gradient(110% 80% at 26% 6%, #333c47 0%, #1c222a 52%, #101419 100%)'
    : 'radial-gradient(110% 80% at 26% 6%, #ffffff 0%, #e8ebf0 52%, #d3d8e0 100%)';
  return `<div style="position:absolute;inset:0;background:${bg}"></div>${body}`;
};

/* ─── Full-bleed ───────────────────────────────────────────────────────────
   The product filling the frame, no browser around it.

   A window was the first instinct and it cost twice: the three-dot chrome is a
   cliché, and scaling the window down to fit put the data at a size where none
   of it survived a 450px thumbnail. Trying to win that back by scaling up and
   bleeding an edge cut the segment percentages off the right — losing content
   rather than filler, which is the wrong thing to crop. Top-tier case studies
   show the interface edge to edge, and it uses every pixel of the frame. */
export const full = (body) => `<div style="position:absolute;inset:0">${body}</div>`;

/* ─── Window ───────────────────────────────────────────────────────────────
   A browser reduced to what a case study shows: a slim bar with a centred
   address, real corner radius, a 1px edge, and one large soft shadow because
   the window is the one thing on the stage that is genuinely raised. */
export const window_ = (url, inner, { x = 100, y = 90, w = 1500, scale = 1, dark = false } = {}) => `
<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;transform:scale(${scale});transform-origin:top left;
            border-radius:12px;overflow:hidden;background:var(--bg);border:1px solid ${dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)'};
            box-shadow:0 40px 90px -30px rgba(8,10,14,${dark?'.8':'.35'}),0 2px 6px rgba(8,10,14,.08)">
  <div style="height:44px;background:var(--chrome);display:flex;align-items:center;padding:0 16px;gap:14px;
              border-bottom:1px solid var(--line)">
    <div style="display:flex;gap:7px;opacity:.55">
      ${[0,1,2].map(()=>`<span style="width:11px;height:11px;border-radius:50%;background:var(--chrome-ink);opacity:.35"></span>`).join('')}
    </div>
    <div style="flex:1;display:flex;justify-content:center">
      <div style="height:28px;min-width:380px;border-radius:6px;background:var(--surface);border:1px solid var(--line);
                  display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--chrome-ink)">
        <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="5" width="8" height="6" rx="1.2"/><path d="M3.5 5V3.5a2 2 0 014 0V5"/></svg>${url}
      </div>
    </div>
    <div style="width:52px"></div>
  </div>
  ${inner}
</div>`;

/* ─── App shell ────────────────────────────────────────────────────────────
   Top bar + sidebar that a shipped product actually has. `crumbs` is the
   breadcrumb trail; `env` the environment badge; `user` the initials of
   whoever is logged in. */
export const shell = ({ brand, crumbs, env = 'Production', user = 'JM', nav, accent, body, w = W, h = H }) => `
<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;background:var(--bg)">
  <div style="height:52px;display:flex;align-items:center;gap:18px;padding:0 20px;background:var(--surface);
              border-bottom:1px solid var(--line);flex-shrink:0">
    <div style="display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;min-width:180px">
      <span style="width:22px;height:22px;border-radius:5px;background:${accent}"></span>${brand}
    </div>
    <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--dim)">
      ${crumbs.map((c,i)=>`<span style="${i===crumbs.length-1?'color:var(--ink);font-weight:500':''}">${c}</span>${i<crumbs.length-1?'<span style="color:var(--faint)">/</span>':''}`).join('')}
    </div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:14px">
      <div style="height:30px;width:260px;border-radius:5px;background:var(--surface-2);border:1px solid var(--line);
                  display:flex;align-items:center;padding:0 10px;gap:8px;font-size:13px;color:var(--faint)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        Search<span style="margin-left:auto;font-size:11px;border:1px solid var(--line);border-radius:3px;padding:1px 5px">⌘K</span>
      </div>
      <span style="font-size:11px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--dim);
                   border:1px solid var(--line);border-radius:4px;padding:4px 8px">${env}</span>
      <span style="position:relative;color:var(--dim)">${icon('bell',{s:18})}<span style="position:absolute;top:-1px;right:-1px;width:7px;height:7px;border-radius:50%;background:${accent};border:2px solid var(--surface)"></span></span>
      <span style="width:30px;height:30px;border-radius:50%;background:var(--surface-3);border:1px solid var(--line);
                   display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--ink-2)">${user}</span>
    </div>
  </div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:220px;background:var(--surface);border-right:1px solid var(--line);padding:16px 12px;
                display:flex;flex-direction:column;gap:2px;flex-shrink:0">
      ${nav.map(n => n.section
        ? `<div class="cap" style="padding:14px 10px 6px;font-size:10.5px">${n.section}</div>`
        : `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:5px;font-size:14px;
                     color:${n.on?'var(--ink)':'var(--ink-2)'};background:${n.on?'var(--surface-3)':'transparent'};font-weight:${n.on?500:400}">
             <span style="color:${n.on?accent:'var(--dim)'}">${icon(n.icon,{s:16})}</span>${n.label}
             ${n.badge?`<span class="num" style="margin-left:auto;font-size:11.5px;color:var(--dim)">${n.badge}</span>`:''}
           </div>`).join('')}
    </div>
    <div style="flex:1;min-width:0;overflow:hidden">${body}</div>
  </div>
</div>`;

/* ─── Phone ────────────────────────────────────────────────────────────────
   Current hardware: 19.5:9, continuous-curve corners, dynamic island, a
   1px inner highlight where the glass meets the frame. */
export const phone = (inner, { w = 390, x = 0, y = 0, rot = 0, dark = true } = {}) => {
  const h = Math.round(w * 2.164), r = Math.round(w * 0.14);
  return `
<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);
            border-radius:${r}px;background:#101317;padding:11px;
            box-shadow:0 50px 100px -30px rgba(8,10,14,.6),inset 0 0 0 1px rgba(255,255,255,.08)">
  <div style="width:100%;height:100%;border-radius:${r-11}px;overflow:hidden;position:relative;background:var(--bg)">
    <div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:${Math.round(w*0.31)}px;height:${Math.round(w*0.092)}px;
                border-radius:99px;background:#0a0c0f;z-index:5"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:54px;display:flex;justify-content:space-between;align-items:flex-end;
                padding:0 28px 6px;font-size:15px;font-weight:600;color:var(--ink);z-index:4">
      <span class="num">9:41</span>
      <span style="display:flex;gap:5px;align-items:center">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx=".6"/><rect x="4.5" y="5" width="3" height="6" rx=".6"/><rect x="9" y="2.5" width="3" height="8.5" rx=".6"/><rect x="13.5" y="0" width="3" height="11" rx=".6"/></svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="21" height="11" rx="3"/><rect x="2" y="2" width="16" height="8" rx="1.6" fill="currentColor" stroke="none"/><path d="M23 4v4" stroke-width="1.5"/></svg>
      </span>
    </div>
    ${inner}
  </div>
</div>`;
};

/* ─── Charts ───────────────────────────────────────────────────────────────
   Fill the box, constant stroke, points given not generated. */
export const line = (pts, { c, fill = true, dash = false, vb = 1000 } = {}) => {
  const max = Math.max(...pts), min = Math.min(...pts), h = 400;
  const x = i => (i / (pts.length - 1)) * vb;
  const y = v => h - ((v - min) / ((max - min) || 1)) * (h * 0.78) - h * 0.11;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${vb} ${h}" preserveAspectRatio="none" style="display:block;width:100%;height:100%;overflow:visible">
    ${fill ? `<defs><linearGradient id="g${c.replace('#','')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".18"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
             <path d="${d} L${vb},${h} L0,${h} Z" fill="url(#g${c.replace('#','')})"/>` : ''}
    <path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" ${dash?'stroke-dasharray="6 5"':''}
          vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
};

export const gridlines = (n = 4) => `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none">
  ${Array.from({length:n+1},()=>`<div style="height:1px;background:var(--line-2)"></div>`).join('')}</div>`;

/* ─── Icons ────────────────────────────────────────────────────────────────
   One consistent 1.75px stroke set. */
export const icon = (name, { c = 'currentColor', s = 18 } = {}) => {
  const P = {
    home:    'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
    chart:   'M4 20V10M10 20V4M16 20v-7M2 20h20',
    line:    'M3 17l6-6 4 4 8-8M15 7h6v6',
    wallet:  'M3 7h18v12H3zM3 7V5h13v2M16 13h3',
    users:   'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5M17 8.5a3 3 0 100-6M18 20c0-2.6-.9-4.3-2.2-5.3',
    doc:     'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    cog:     'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
    bell:    'M6 9a6 6 0 0112 0v5l2 3H4l2-3zM10 20a2 2 0 004 0',
    server:  'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01',
    layers:  'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    shield:  'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    key:     'M15 8a4 4 0 11-2.4 7.2L7 21H3v-4l5.8-5.8A4 4 0 0115 8z',
    grid:    'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    inbox:   'M3 12h5l2 3h4l2-3h5M3 12l2-7h14l2 7v7H3z',
    target:  'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 12m-5 0a5 5 0 1010 0 5 5 0 10-10 0M12 12m-1 0a1 1 0 102 0 1 1 0 10-2 0',
    filter:  'M3 5h18l-7 8v6l-4 2v-8z',
    calendar:'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
    more:    'M5 12h.01M12 12h.01M19 12h.01',
    arrowUp: 'M12 19V5M5 12l7-7 7 7',
    check:   'M4 12l5 5L20 7',
    plus:    'M12 5v14M5 12h14',
  };
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.75"
      stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0"><path d="${P[name]}"/></svg>`;
};

/* Status dot + label, the one place colour means something in a table. */
export const status = (label, c) => `<span style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2)">
  <span style="width:7px;height:7px;border-radius:50%;background:${c};box-shadow:0 0 0 3px color-mix(in srgb,${c} 18%,transparent)"></span>${label}</span>`;

export const avatar = (initials, c = 'var(--surface-3)') => `<span style="width:24px;height:24px;border-radius:50%;background:${c};
  display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--ink-2);flex-shrink:0">${initials}</span>`;
