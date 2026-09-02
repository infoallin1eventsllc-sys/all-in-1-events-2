/**
 * Shared foundation for the portfolio and service mockups.
 *
 * These images replace stock photographs of laptops. A photograph of a laptop
 * shows no design work; these show the work. They are read at roughly 450px
 * wide in a grid, so composition carries the meaning and fine text reads as
 * texture — the same way a real portfolio shot is a crop into the interesting
 * part rather than a whole 1440px window shrunk to a thumbnail.
 *
 * Each scene depicts a product with its own mode. A BI dashboard is an Operate
 * surface and must look restrained and legible to be credible as design work;
 * a storefront is Persuade and may lead with an image. They are held together
 * by one type scale and one spacing rhythm rather than one palette, because
 * they are meant to look like different clients served by the same studio.
 */
import fs from 'node:fs';

const FONTS = '/workspace/meridian-interface-website/public/fonts';
export const inter = fs.readFileSync(`${FONTS}/inter-var-latin.woff2`).toString('base64');
export const hanken = fs.readFileSync(`${FONTS}/hanken-grotesk-var-latin.woff2`).toString('base64');

/** 16:10 — the grid's ratio. The modal crops to 16:9, so nothing that matters
    goes in the top or bottom 6%. */
export const W = 1600, H = 1000;

export const RESET = `
@font-face{font-family:Inter;font-weight:400 700;src:url(data:font/woff2;base64,${inter}) format('woff2')}
@font-face{font-family:Hanken;font-weight:400 900;src:url(data:font/woff2;base64,${hanken}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,system-ui,sans-serif;
     -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.scene{width:${W}px;height:${H}px;display:flex;flex-direction:column;position:relative}
/* Hairlines, not drop shadows. Elevation should mean something; here nothing
   is floating above anything, so nothing gets a shadow. */
.hair{border:1px solid var(--line)}
.mono{font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
`;

/** A browser chrome that reads at thumbnail size without becoming the subject. */
export const browser = (url, body, { dark = false } = {}) => `
<div style="flex:1;display:flex;flex-direction:column;background:${dark?'#0d1117':'#eef1f5'};padding:34px 34px 0">
  <div style="display:flex;align-items:center;gap:14px;height:52px;padding:0 20px;
              background:${dark?'#161b22':'#fff'};border:1px solid var(--line);
              border-bottom:none;border-radius:12px 12px 0 0">
    <div style="display:flex;gap:8px">
      ${['#e06c6c','#e0b96c','#79c48a'].map(c=>`<span style="width:12px;height:12px;border-radius:50%;background:${c};opacity:.85"></span>`).join('')}
    </div>
    <div style="flex:1;height:28px;border-radius:6px;background:${dark?'#0d1117':'#f1f4f8'};
                border:1px solid var(--line);display:flex;align-items:center;padding:0 14px;
                font-size:15px;color:var(--dim)">${url}</div>
  </div>
  <div style="flex:1;background:var(--bg);border:1px solid var(--line);border-top:none;
              overflow:hidden;position:relative">${body}</div>
</div>`;

/** A phone body. Used for the two app concepts. */
export const phone = (body, { w = 424 } = {}) => `
<div style="width:${w}px;height:${Math.round(w*2.06)}px;border-radius:${Math.round(w*0.115)}px;
            background:var(--bg);border:10px solid #1b2027;overflow:hidden;position:relative;flex-shrink:0">
  <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:${Math.round(w*0.34)}px;
              height:${Math.round(w*0.075)}px;background:#1b2027;border-radius:0 0 ${Math.round(w*0.05)}px ${Math.round(w*0.05)}px;z-index:5"></div>
  ${body}
</div>`;

/** Bars sized from real-looking figures rather than a smooth curve — a chart
    that is too tidy reads as decoration. */
export const bars = (vals, { c, h = 190, gap = 14, radius = 4 }) => {
  const max = Math.max(...vals);
  return `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:${h}px">
    ${vals.map((v,i)=>`<div style="flex:1;height:${Math.round(h*v/max)}px;background:${
      i===vals.length-1 ? c : `color-mix(in srgb, ${c} 42%, transparent)`
    };border-radius:${radius}px ${radius}px 0 0"></div>`).join('')}
  </div>`;
};

/** An area line that fills whatever box it is given.
 *
 * Fixed pixel dimensions were the first version and they left every chart
 * floating in the top half of its card with dead space beneath — the tell that
 * a mockup was assembled rather than designed. This scales to the container and
 * keeps the stroke weight constant while doing it.
 *
 * Points are given, not generated: a chart with a smooth synthetic curve reads
 * as decoration, and each of these is supposed to have a shape that belongs to
 * its story. */
export const spark = (pts, { c, fill = true, vb = 1000 }) => {
  const max = Math.max(...pts), min = Math.min(...pts), h = 400;
  const x = i => (i / (pts.length - 1)) * vb;
  const y = v => h - ((v - min) / ((max - min) || 1)) * (h * 0.80) - h * 0.10;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${vb} ${h}" preserveAspectRatio="none"
       style="display:block;width:100%;height:100%">
    ${fill ? `<path d="${d} L${vb},${h} L0,${h} Z" fill="${c}" opacity="0.13"/>` : ''}
    <path d="${d}" fill="none" stroke="${c}" stroke-width="3"
          vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
};

/** Small line icons for app chrome. Grey rounded squares in a sidebar read as
 *  an unfinished mockup, which is the opposite of the point. */
export const icon = (name, { c = 'currentColor', s = 22 } = {}) => {
  const paths = {
    grid:   'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    chart:  'M4 20V10M10 20V4M16 20v-7M22 20H2',
    wallet: 'M3 7h18v12H3zM3 7l0-2h13v2M16 13h3',
    users:  'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5M17 8.5a3 3 0 100-6M18 20c0-2.6-.9-4.3-2.2-5.3',
    doc:    'M6 3h8l4 4v14H6zM14 3v4h4',
    cog:    'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  };
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]}"/></svg>`;
};
