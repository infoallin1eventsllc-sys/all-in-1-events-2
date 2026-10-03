import * as THREE from 'three';
import { PARKED_CARS, SITE, STOCKPILE, TREES, heightAt, siteImagery, WORLD_M } from '../survey/site';
import { capturePoints, planSurvey, type Pt } from '../survey/plan';
import { DEFAULT_PARAMS } from '../hooks/useSurveyMission';
import { buildDrone, droneMaterials, radialTexture } from '../components/hero/droneModel';
import { studioEnvironment } from '../components/hero/stage';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Site survey design concepts, drawn from the real demo venue and the real flight plan, frozen
 * mid-survey (line 8 of 13). ?c=sheet | model | lightbox. Dev-only (lab/survey-concepts.html).
 *  - sheet:    the screen is a surveyor's drawing: ink on paper, contours, the flight inked in as flown.
 *  - model:    the venue as a white architect's model on a plinth; the flight path is red thread above it.
 *  - lightbox: the map assembles from the aerial photos themselves, laid down frame by frame.
 *  - relief:   Swiss-style shaded relief and brown contours; land colours in as it is photographed,
 *              with the current line's altitude profile underneath (after Imhof, USGS topo, Wingtra).
 *  - holo:     the real site in daylight with a holographic survey over it: the camera's scan beam, a glowing
 *              boundary and flight lines, and the site's digital blueprint lit up where it has been scanned.
 */
const C = (new URLSearchParams(location.search).get('c') ?? 'sheet') as 'sheet' | 'model' | 'lightbox' | 'relief' | 'holo';

// ---- the survey, frozen mid-flight ----------------------------------------------------------------
const plan = planSurvey(SITE.boundary, SITE.home, DEFAULT_PARAMS);
const PTS = capturePoints(plan);
const NL = plan.lines.length, CUR = Math.min(7, NL - 1);
const curPts = PTS.filter(p => p.line === CUR);
const SHOT = [...PTS.filter(p => p.line < CUR), ...curPts.slice(0, Math.round(curPts.length * 0.55))];
const AT = SHOT[SHOT.length - 1];
const capLegs = plan.legs.filter(l => l.capture);
const pct = Math.round((SHOT.length / PTS.length) * 100);
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const timeLeft = fmt(plan.durationS * (1 - SHOT.length / PTS.length));
const lineLen = (i: number) => { const l = capLegs.find(g => g.line === i)!; return Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y); };
const linePhotos = (i: number) => PTS.filter(p => p.line === i).length;
const shotOn = (i: number) => SHOT.filter(p => p.line === i).length;

// ---- page scaffolding ------------------------------------------------------------------------------
const W = 1440, H = 900;
const css = (s: string) => { const e = document.createElement('style'); e.textContent = s; document.head.appendChild(e); };
css(`
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:13px;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 1}
.num{font-variant-numeric:tabular-nums}
.bar{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--line);background:var(--chrome)}
.brand{display:flex;align-items:center;gap:10px}.brand i{width:32px;height:32px;border-radius:9px;background:var(--ink);display:block}
.brand small{display:block;font-size:11px;color:var(--ink3)}.brand b{font-size:13px;font-weight:600}
.tabs{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--seg)}
.tabs span{padding:6px 12px;border-radius:8px;color:var(--ink2);font-size:13px}.tabs span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.icons{display:flex;gap:8px}.icons i{width:36px;height:32px;border:1px solid var(--line);border-radius:9px;display:block;background:var(--chrome)}
main{padding:18px 20px 0}
`);
const appBar = () => `<div class="bar"><div class="brand"><i></i><div><small>All in 1 Events</small><b>Drone Command</b></div></div>
<div class="tabs"><span>Light show</span><span class="on">Site survey</span><span>Surveillance</span></div>
<div class="icons"><i style="width:120px"></i><i style="width:76px"></i><i></i><i></i><i></i><i></i><i></i><i style="width:110px"></i></div></div>`;
const root = document.createElement('div'); document.body.appendChild(root);
const done = () => requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(window, { __ready: true })));

// ---- shared geometry helpers ----------------------------------------------------------------------
const STRUCTS = SITE.structures;
const PATHS: [number, number][][] = [[[-150, 120], [-100, 80], [-20, 30], [60, -40]], [[-20, 30], [-110, -20]], [[-20, 30], [120, 60], [150, 100]]];
function footprintCorners(p: Pt, heading: number): Pt[] {
  const { acrossM: a, alongM: b } = plan.footprint, c = Math.cos(heading), s = Math.sin(heading);
  return [[-b / 2, -a / 2], [b / 2, -a / 2], [b / 2, a / 2], [-b / 2, a / 2]].map(([u, v]) => ({ x: p.x + u * c - v * s, y: p.y + u * s + v * c }));
}
/** Smoothed height grid and marching-squares contour segments over an extent. */
function contours(x0: number, y0: number, x1: number, y1: number, step: number, levels: number[]) {
  const nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1;
  const raw = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) raw[j * nx + i] = heightAt(x0 + i * step, y0 + j * step);
  const h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny) { s += raw[b * nx + a]; n++; } }
    h[j * nx + i] = s / n;
  }
  const out: { level: number; seg: [Pt, Pt] }[] = [];
  const P = (i: number, j: number) => ({ x: x0 + i * step, y: y0 + j * step });
  const lerp = (a: Pt, b: Pt, ha: number, hb: number, L: number): Pt => { const t = (L - ha) / (hb - ha); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; };
  for (const L of levels) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i + 1], d = h[(j + 1) * nx + i];
    const k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const pa = P(i, j), pb = P(i + 1, j), pc = P(i + 1, j + 1), pd = P(i, j + 1);
    const top = () => lerp(pa, pb, a, b, L), right = () => lerp(pb, pc, b, c, L), bottom = () => lerp(pd, pc, d, c, L), left = () => lerp(pa, pd, a, d, L);
    const E: Record<number, (() => Pt)[][]> = { 1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]], 10: [[top, right], [left, bottom]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]] };
    for (const [f, g] of E[k]) out.push({ level: L, seg: [f(), g()] });
  }
  return out;
}

// ================================================================================================
// A. SURVEY SHEET
// ================================================================================================
function sheet() {
  css(`:root{--bg:#efece4;--chrome:#f7f5ef;--seg:#e7e3d8;--line:#d9d3c4;--ink:#1c1f24;--ink2:#4c4f55;--ink3:#8a8578;--acc:#1d4ed8}
  .head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
  .head h1{font-size:24px;font-weight:600;letter-spacing:-.01em}.head p{color:var(--ink2);margin-top:3px}
  .chip{display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;font-weight:500;color:var(--acc);vertical-align:4px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
  .reads{display:flex;border:1px solid var(--ink);background:var(--chrome)}
  .reads div{padding:7px 16px 8px;border-left:1px solid var(--ink)}.reads div:first-child{border-left:0}
  .reads small{display:block;font-size:10.5px;color:var(--ink3)}.reads b{font-size:20px;font-weight:600}
  .sheet{display:grid;grid-template-columns:1fr 316px;height:640px;border:1.5px solid var(--ink);background:#f6f3eb;position:relative}
  .sheet:after{content:"";position:absolute;inset:4px;border:.5px solid var(--ink);pointer-events:none}
  .map{position:relative;border-right:1.5px solid var(--ink)}
  .col{display:flex;flex-direction:column;padding:14px 16px 12px}
  .col h3{font-size:11px;font-weight:600;color:var(--ink);margin:0 0 6px}
  .na{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .leg{display:grid;grid-template-columns:22px 1fr;gap:3px 8px;font-size:11px;color:var(--ink2);align-items:center;margin-bottom:10px}
  table{border-collapse:collapse;width:100%;font-size:10.5px}td,th{padding:1.5px 0;border-bottom:.5px solid var(--line);text-align:right}th{font-weight:500;color:var(--ink3)}td:first-child,th:first-child{text-align:left}
  tr.cur td{color:var(--acc);font-weight:600}tr.todo td{color:var(--ink3)}
  .tb{margin-top:10px;border:1px solid var(--ink);font-size:10.5px}
  .tb div{display:flex;justify-content:space-between;padding:3px 7px;border-top:.5px solid var(--ink)}.tb div:first-child{border-top:0;font-size:13px;font-weight:600;padding:7px}
  .tb span{color:var(--ink3)}
  .acts{display:flex;gap:8px;align-items:center;margin-top:12px}
  .btn{height:36px;padding:0 14px;border:1px solid var(--ink);display:inline-flex;align-items:center;font-weight:500;background:var(--chrome)}
  .btn.p{background:var(--ink);color:#f6f3eb}.btn.d{border-color:#b42318;color:#b42318}.sp{flex:1}
  .seg{display:inline-flex;border:1px solid var(--ink)}.seg span{padding:7px 10px;font-size:12px}.seg span.on{background:var(--ink);color:#f6f3eb}
  .tag{position:absolute;font:500 10px 'JetBrains Mono',monospace;color:var(--ink2);background:#f6f3eb;padding:1px 4px}
  `);
  const statusRow = (i: number) => { const st = i < CUR ? 'done' : i === CUR ? 'cur' : 'todo'; return `<tr class="${st}"><td>${i + 1}</td><td class="num">${Math.round(lineLen(i))} m</td><td class="num">${st === 'todo' ? '—' : shotOn(i)}/${linePhotos(i)}</td><td>${st === 'done' ? 'Flown' : st === 'cur' ? 'Flying' : 'To fly'}</td></tr>`; };
  root.innerHTML = `${appBar()}<main>
  <div class="head"><div><h1>Site survey<span class="chip">Capturing · line ${CUR + 1} of ${NL}</span></h1><p>Festival grounds · ${(plan.areaM2 / 1e4).toFixed(1)} ha · orthomosaic at ${plan.params.altitudeM} m</p></div>
  <div class="reads"><div><small>Photographed</small><b class="num">${pct}%</b></div><div><small>Photos</small><b class="num">${SHOT.length}</b></div><div><small>Ground detail</small><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div><small>Time left</small><b class="num">${timeLeft}</b></div></div></div>
  <div class="sheet"><div class="map"><canvas id="cv"></canvas></div>
   <div class="col">
    <div class="na"><div><h3>Survey of the festival grounds</h3><div style="font-size:11px;color:var(--ink2);line-height:1.45">Aerial capture for an orthomosaic and<br>surface model. Plan and flight to date.</div></div>
     <svg width="34" height="46" viewBox="0 0 34 46"><path d="M17 4 L25 34 L17 28 L9 34Z" fill="#1c1f24"/><path d="M17 4 L9 34 L17 28Z" fill="#f6f3eb" stroke="#1c1f24" stroke-width="1"/><text x="17" y="45" text-anchor="middle" font-family="Inter" font-weight="600" font-size="10">N</text></svg></div>
    <div class="leg">
     <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#1c1f24" stroke-width="2" stroke-dasharray="7 2 1.5 2"/></svg><span>Site boundary, corners P1 to P7</span>
     <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#1c1f24" stroke-width="1.2"/></svg><span>Flight line, flown</span>
     <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#1d4ed8" stroke-width="2.2"/></svg><span>Flight line, flying now</span>
     <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#8a8578" stroke-width="1" stroke-dasharray="3 3"/></svg><span>Flight line, to fly</span>
     <svg width="22" height="10"><rect x="1" y="1" width="20" height="8" fill="rgba(29,78,216,.16)" stroke="none"/></svg><span>Photographed ground, darker = more views</span>
     <svg width="22" height="10"><path d="M2 9 L11 1 L20 9" fill="none" stroke="#8a7a60" stroke-width=".8"/></svg><span>Contours every 0.5 m, index 2.5 m</span>
    </div>
    <h3>Flight lines</h3>
    <table><tr><th>Line</th><th>Length</th><th>Photos</th><th>State</th></tr>${Array.from({ length: NL }, (_, i) => statusRow(i)).join('')}</table>
    <div class="tb"><div>Festival grounds<span style="font-weight:400" class="num">Sheet 1/1</span></div>
     <div><span>Location</span>Long Beach, CA</div><div><span>Datum</span>WGS 84 · heights to site datum ${'11.4'} m</div>
     <div><span>Aircraft</span>Mavic 3 Enterprise · 60 m · 10 m/s</div><div><span>Overlap</span>75% along · 70% across</div><div><span>Scale</span>1 : 2 000 at print · 3 Oct 2026</div></div>
   </div></div>
  <div class="acts"><span class="seg"><span class="on">Flight</span><span>Results</span></span><span class="btn p">Pause</span><span class="btn">Re-fly weak patches</span><span class="seg"><span>1×</span><span class="on">4×</span><span>16×</span></span><span class="sp"></span><span class="btn">Export package</span><span class="btn d">Return home</span></div>
  </main>`;

  const host = document.querySelector('.map') as HTMLElement, cv = document.getElementById('cv') as HTMLCanvasElement;
  const w = host.clientWidth, h = host.clientHeight, dpr = 2;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const g = cv.getContext('2d')!; g.scale(dpr, dpr);
  const cx = 8, cy = -2, sc = Math.min((w - 70) / 520, (h - 60) / 372);
  const X = (x: number) => w / 2 + (x - cx) * sc, Y = (y: number) => h / 2 + (y - cy) * sc;
  const x0 = cx - w / 2 / sc, x1 = cx + w / 2 / sc, y0 = cy - h / 2 / sc, y1 = cy + h / 2 / sc;

  // Paper fibre.
  for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(120,105,80,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  // Grid crosses every 50 m, with coordinates on the neat line.
  g.strokeStyle = 'rgba(28,31,36,.35)'; g.lineWidth = 0.6;
  g.font = '500 8.5px "JetBrains Mono"'; g.fillStyle = '#8a8578';
  for (let x = Math.ceil(x0 / 50) * 50; x <= x1; x += 50) for (let y = Math.ceil(y0 / 50) * 50; y <= y1; y += 50) {
    g.beginPath(); g.moveTo(X(x) - 4, Y(y)); g.lineTo(X(x) + 4, Y(y)); g.moveTo(X(x), Y(y) - 4); g.lineTo(X(x), Y(y) + 4); g.stroke();
  }
  for (let x = Math.ceil(x0 / 50) * 50; x <= x1; x += 50) { g.fillText(`E ${x >= 0 ? '+' : ''}${x}`, X(x) + 3, 13); g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), 6); g.stroke(); }
  for (let y = Math.ceil(y0 / 50) * 50; y <= y1; y += 50) { g.save(); g.translate(13, Y(y) - 3); g.rotate(-Math.PI / 2); g.fillText(`N ${-y >= 0 ? '+' : ''}${-y}`, 0, 0); g.restore(); g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(6, Y(y)); g.stroke(); }

  // Contours.
  const levels: number[] = []; for (let L = -4; L < 5; L += 0.5) levels.push(L); for (let L = 5; L <= 90; L += 2.5) levels.push(L);
  for (const { level, seg } of contours(x0, y0, x1, y1, 3, levels)) {
    const index = Math.abs(level / 2.5 - Math.round(level / 2.5)) < 1e-6;
    g.strokeStyle = index ? 'rgba(122,104,76,.62)' : 'rgba(122,104,76,.3)'; g.lineWidth = index ? 0.9 : 0.5;
    g.beginPath(); g.moveTo(X(seg[0].x), Y(seg[0].y)); g.lineTo(X(seg[1].x), Y(seg[1].y)); g.stroke();
  }
  // Trees: scalloped crowns.
  g.strokeStyle = 'rgba(28,31,36,.55)'; g.lineWidth = 0.6;
  for (const t of TREES) {
    const r = t.r * sc * 0.9, px = X(t.x), py = Y(t.y); if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;
    g.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; g.arc(px + Math.cos(a) * r * 0.75, py + Math.sin(a) * r * 0.75, r * 0.38, a - 1.4, a + 1.4); } g.stroke();
  }
  // Paths: cased.
  for (const p of PATHS) {
    for (const [col, lw] of [['rgba(28,31,36,.6)', 6 * sc], ['#f6f3eb', 6 * sc - 1.6]] as [string, number][]) {
      g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
    }
  }
  g.lineCap = 'butt';
  // Coverage wash: each photo's footprint, so overlap reads as depth of tone.
  g.fillStyle = 'rgba(29,78,216,.028)';
  for (const p of SHOT) { const q = footprintCorners(p.p, p.headingRad); g.beginPath(); q.forEach((c, i) => (i ? g.lineTo(X(c.x), Y(c.y)) : g.moveTo(X(c.x), Y(c.y)))); g.closePath(); g.fill(); }
  // Parking and cars.
  const PK = SITE.parking; g.strokeStyle = '#1c1f24'; g.lineWidth = 0.8; g.strokeRect(X(PK.x0), Y(PK.y0), (PK.x1 - PK.x0) * sc, (PK.y1 - PK.y0) * sc);
  g.lineWidth = 0.35; for (let row = 0; row < 4; row++) for (let col = 0; col < 40; col++) { const x = PK.x0 + 4 + col * 2.8, y = PK.y0 + 6 + row * 15; g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x), Y(y + 5)); g.stroke(); }
  g.fillStyle = 'rgba(28,31,36,.25)'; for (const c of PARKED_CARS) g.fillRect(X(c.x + 0.5), Y(c.y + 0.6), 1.7 * sc, 3.8 * sc);
  // Structures: hatched footprints with labels.
  g.font = '500 10px Inter'; g.textBaseline = 'middle';
  for (const s of STRUCTS) {
    const rx = X(s.x - s.w / 2), ry = Y(s.y - s.d / 2), rw = s.w * sc, rh = s.d * sc;
    g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.fillStyle = '#f6f3eb'; g.fill(); g.clip();
    g.strokeStyle = 'rgba(28,31,36,.45)'; g.lineWidth = 0.5; for (let k = -rh; k < rw; k += 3.2) { g.beginPath(); g.moveTo(rx + k, ry + rh); g.lineTo(rx + k + rh, ry); g.stroke(); }
    g.restore(); g.strokeStyle = '#1c1f24'; g.lineWidth = 1; g.strokeRect(rx, ry, rw, rh);
  }
  const label = (t: string, x: number, y: number, align: CanvasTextAlign = 'left') => { g.font = '500 10.5px Inter'; g.textAlign = align; const m = g.measureText(t).width; const bx = align === 'left' ? x : align === 'center' ? x - m / 2 : x - m; g.fillStyle = 'rgba(246,243,235,.92)'; g.fillRect(bx - 3, y - 7, m + 6, 14); g.fillStyle = '#1c1f24'; g.fillText(t, x, y); g.textAlign = 'left'; };
  const st = (id: string) => STRUCTS.find(s => s.id === id)!;
  label('Main stage', X(st('stage').x), Y(st('stage').y - st('stage').d / 2) - 9, 'center');
  label('Exhibition hall', X(st('hall').x), Y(st('hall').y + st('hall').d / 2) + 10, 'center');
  label('Vendor tents', X(-145), Y(52 + 6) + 10, 'center');
  label('Food trucks', X(146), Y(40 - 4) - 10, 'center');
  label('Parking', X(PK.x1) - 4, Y(PK.y1) - 9, 'right');
  label('Stockpile', X(STOCKPILE.x), Y(STOCKPILE.y + STOCKPILE.r) + 10, 'center');
  // Flight lines.
  for (const l of capLegs) {
    const a = { x: X(l.a.x), y: Y(l.a.y) }, b = { x: X(l.b.x), y: Y(l.b.y) };
    if (l.line < CUR) { g.setLineDash([]); g.strokeStyle = '#1c1f24'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    else if (l.line === CUR) {
      g.strokeStyle = '#1d4ed8'; g.lineWidth = 2.2; g.setLineDash([]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(X(AT.p.x), Y(AT.p.y)); g.stroke();
      g.setLineDash([5, 4]); g.lineWidth = 1.4; g.beginPath(); g.moveTo(X(AT.p.x), Y(AT.p.y)); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    } else { g.setLineDash([3, 3]); g.strokeStyle = 'rgba(110,104,92,.8)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
    // Line number at its start.
    const col = l.line < CUR ? '#1c1f24' : l.line === CUR ? '#1d4ed8' : '#8a8578';
    g.fillStyle = '#f6f3eb'; g.strokeStyle = col; g.lineWidth = 0.9; g.beginPath(); g.arc(a.x, a.y, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = col; g.font = '600 8.5px Inter'; g.textAlign = 'center'; g.fillText(String(l.line + 1), a.x, a.y + 0.5); g.textAlign = 'left';
  }
  // Photo stations along flown lines.
  g.fillStyle = '#1c1f24'; for (const p of SHOT) { g.beginPath(); g.arc(X(p.p.x), Y(p.p.y), 0.9, 0, Math.PI * 2); g.fill(); }
  // Boundary: property line with corner monuments.
  g.strokeStyle = '#1c1f24'; g.lineWidth = 2; g.setLineDash([12, 3, 2, 3]);
  g.beginPath(); SITE.boundary.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.closePath(); g.stroke(); g.setLineDash([]);
  const cxB = SITE.boundary.reduce((s, p) => s + p.x, 0) / SITE.boundary.length, cyB = SITE.boundary.reduce((s, p) => s + p.y, 0) / SITE.boundary.length;
  SITE.boundary.forEach((p, i) => {
    g.fillStyle = '#f6f3eb'; g.strokeStyle = '#1c1f24'; g.lineWidth = 1.2; g.beginPath(); g.arc(X(p.x), Y(p.y), 4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#1c1f24'; g.beginPath(); g.arc(X(p.x), Y(p.y), 1.2, 0, Math.PI * 2); g.fill();
    const dx = p.x - cxB, dy = p.y - cyB, d = Math.hypot(dx, dy); g.font = '500 9.5px "JetBrains Mono"'; g.textAlign = 'center';
    g.fillText(`P${i + 1}`, X(p.x) + (dx / d) * 15, Y(p.y) + (dy / d) * 13); g.textAlign = 'left';
  });
  // Home benchmark.
  { const hx = X(SITE.home.x), hy = Y(SITE.home.y); g.fillStyle = '#f6f3eb'; g.strokeStyle = '#1c1f24'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(hx, hy - 7); g.lineTo(hx + 6.5, hy + 5); g.lineTo(hx - 6.5, hy + 5); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#1c1f24'; g.beginPath(); g.arc(hx, hy + 1, 1.4, 0, Math.PI * 2); g.fill(); label('Home · take-off', hx + 12, hy + 1); }
  // The aircraft, with a leader to its callout.
  { const px = X(AT.p.x), py = Y(AT.p.y), hd = AT.headingRad;
    g.strokeStyle = '#1d4ed8'; g.lineWidth = 1.4; g.fillStyle = 'rgba(29,78,216,.12)';
    g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(px - 15, py); g.lineTo(px - 5, py); g.moveTo(px + 5, py); g.lineTo(px + 15, py); g.moveTo(px, py - 15); g.lineTo(px, py - 5); g.moveTo(px, py + 5); g.lineTo(px, py + 15); g.stroke();
    g.fillStyle = '#1d4ed8'; g.beginPath(); g.moveTo(px + Math.cos(hd) * 22, py + Math.sin(hd) * 22); g.lineTo(px + Math.cos(hd + 2.6) * 9 + Math.cos(hd) * 13, py + Math.sin(hd + 2.6) * 9 + Math.sin(hd) * 13); g.lineTo(px + Math.cos(hd - 2.6) * 9 + Math.cos(hd) * 13, py + Math.sin(hd - 2.6) * 9 + Math.sin(hd) * 13); g.closePath(); g.fill();
    const lx = px + 46, ly = py - 52; g.strokeStyle = '#1d4ed8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(px + 8, py - 8); g.lineTo(lx - 4, ly + 10); g.lineTo(lx + 150, ly + 10); g.stroke();
    g.fillStyle = '#1d4ed8'; g.font = '600 11px Inter'; g.fillText(`Aircraft · line ${CUR + 1} of ${NL}`, lx, ly - 4); g.font = '500 9.5px "JetBrains Mono"'; g.fillText(`60 m AGL · 10.0 m/s · photo ${SHOT.length}`, lx, ly + 4 + 1); }
  // Scale bar.
  { const bx = 22, by = h - 22, m100 = 100 * sc; g.fillStyle = '#1c1f24'; g.strokeStyle = '#1c1f24'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) { const seg = m100 / 2; k % 2 ? g.strokeRect(bx + k * seg, by - 4, seg, 4) : g.fillRect(bx + k * seg, by - 4, seg, 4); }
    g.font = '500 9px "JetBrains Mono"'; ['0', '50', '100', '150', '200 m'].forEach((t, k) => g.fillText(t, bx + (k * m100) / 2 - (k ? 6 : 0), by + 10)); }
  done();
}

// ================================================================================================
// B. SITE MODEL
// ================================================================================================
function model() {
  css(`:root{--bg:#ebe9e4;--chrome:#f8f7f4;--seg:#e3e0d9;--line:#dcd8cf;--ink:#1a1b1e;--ink2:#55565b;--ink3:#8c8a84;--acc:#e0442b}
  .head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
  .head h1{font-size:24px;font-weight:600;letter-spacing:-.01em}.head p{color:var(--ink2);margin-top:3px}
  .chip{display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;font-weight:500;color:var(--acc);vertical-align:4px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
  .reads{display:flex;gap:30px}.reads small{display:block;font-size:11px;color:var(--ink3)}.reads b{font-size:22px;font-weight:600}
  .wrap{display:grid;grid-template-columns:1fr 330px;gap:16px;height:640px}
  .stage{position:relative;border-radius:18px;overflow:hidden;background:radial-gradient(120% 95% at 50% 30%,#ffffff 0%,#f1f0ec 55%,#dedbd3 100%)}
  .stage canvas{position:absolute;inset:0}
  .ann{position:absolute;font-size:11.5px;font-weight:500;color:var(--ink);white-space:nowrap}
  .ann small{display:block;font-weight:400;color:var(--ink3);font-size:10.5px}
  svg.lead{position:absolute;inset:0;pointer-events:none}
  .views{position:absolute;top:14px;right:14px;display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.8);box-shadow:0 0 0 1px var(--line)}
  .views span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.views span.on{background:var(--ink);color:#fff}
  .prog{position:absolute;left:18px;bottom:16px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink2)}
  .prog i{display:inline-block;width:18px;height:3px;border-radius:2px;background:#d6d2c9;margin-right:3px}.prog i.d{background:var(--ink)}.prog i.c{background:var(--acc)}
  .rail{background:var(--chrome);border-radius:18px;padding:18px;box-shadow:0 0 0 1px var(--line)}
  .rail h3{font-size:13px;font-weight:600;margin:0 0 10px}.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}.row span{color:var(--ink2)}
  .big{font-size:40px;font-weight:600;letter-spacing:-.02em;line-height:1}.meter{height:6px;border-radius:3px;background:#e7e3da;margin:10px 0 4px;overflow:hidden}.meter i{display:block;height:100%;background:var(--acc)}
  .acts{display:flex;gap:8px;align-items:center;margin-top:12px}
  .btn{height:36px;padding:0 14px;border-radius:10px;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;font-weight:500;background:var(--chrome)}
  .btn.p{background:var(--ink);color:#fff;box-shadow:none}.btn.d{color:#b42318}.sp{flex:1}
  .seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--seg)}.seg span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.seg span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
  `);
  root.innerHTML = `${appBar()}<main>
  <div class="head"><div><h1>Site survey<span class="chip">Capturing · line ${CUR + 1} of ${NL}</span></h1><p>Festival grounds · ${(plan.areaM2 / 1e4).toFixed(1)} ha · orthomosaic at ${plan.params.altitudeM} m</p></div>
  <div class="reads"><div><small>Photographed</small><b class="num">${pct}%</b></div><div><small>Photos</small><b class="num">${SHOT.length}</b></div><div><small>Ground detail</small><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div><small>Time left</small><b class="num">${timeLeft}</b></div></div></div>
  <div class="wrap"><div class="stage" id="st"><canvas id="cv"></canvas><svg class="lead" id="lead"></svg>
    <div class="views"><span class="on">Model</span><span>From above</span><span>Follow</span></div>
    <div class="prog">${Array.from({ length: NL }, (_, i) => `<i class="${i < CUR ? 'd' : i === CUR ? 'c' : ''}"></i>`).join('')}<span>Line ${CUR + 1} of ${NL}</span></div></div>
   <div class="rail"><h3>This flight</h3><div class="big num">${pct}%</div><div style="color:var(--ink2);margin-top:4px">of the site photographed</div><div class="meter"><i style="width:${pct}%"></i></div>
    <div style="height:14px"></div>
    <div class="row"><span>Photos</span><b class="num">${SHOT.length} of ~${PTS.length}</b></div>
    <div class="row"><span>Ground detail</span><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div>
    <div class="row"><span>Height</span><b class="num">${plan.params.altitudeM} m</b></div>
    <div class="row"><span>Overlap</span><b class="num">75% · 70%</b></div>
    <div class="row"><span>Speed</span><b class="num">10 m/s</b></div>
    <div class="row"><span>Camera</span><b>Mavic 3 Enterprise</b></div>
    <div class="row" style="border:0"><span>Battery</span><b class="num">1 of 1 · 58%</b></div>
    <div style="margin-top:16px;font-size:12px;color:var(--ink2);line-height:1.5">The red thread is the flight: solid where it has flown, with a bead at every photo. Grey thread is still to fly.</div>
   </div></div>
  <div class="acts"><span class="seg"><span class="on">Flight</span><span>Results</span></span><span class="btn p">Pause</span><span class="btn">Re-fly weak patches</span><span class="seg"><span>1×</span><span class="on">4×</span><span>16×</span></span><span class="sp"></span><span class="btn">Export package</span><span class="btn d">Return home</span></div>
  </main>`;

  const host = document.getElementById('st')!, cv = document.getElementById('cv') as HTMLCanvasElement;
  const w = host.clientWidth, h = host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); renderer.setSize(w, h); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene(); scene.environment = studioEnvironment(renderer); scene.environmentIntensity = 0.7;
  const cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 0.6));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.2); key.position.set(-3.5, 6, 2.2); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.blurSamples = 16; key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 0.5, far: 20 }); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8eef8, 0.5); fill.position.set(4, 3, 5); scene.add(fill);

  // Units: 1 = 100 m; heights doubled so the land reads.
  const U = 0.01, VX = 2 * U, TW = 6.2, TD = 3.9, cxM = 6, cyM = -2;
  const ground = (x: number, y: number) => Math.max(-0.05, heightAt(x, y) * VX);
  const clay = new THREE.MeshStandardMaterial({ color: 0xfcfbf8, roughness: 0.9, metalness: 0 });
  // Ground texture: engraved contours, paths and the photographed wash.
  const tx = document.createElement('canvas'); tx.width = 2048; tx.height = Math.round(2048 * TD / TW); const t2 = tx.getContext('2d')!;
  const mx = (x: number) => ((x - cxM) / (TW / U) + 0.5) * tx.width, my = (y: number) => ((y - cyM) / (TD / U) + 0.5) * tx.height, ms = tx.width / (TW / U);
  t2.fillStyle = '#e9e5dc'; t2.fillRect(0, 0, tx.width, tx.height);
  const lv: number[] = []; for (let L = -4; L < 5; L += 0.5) lv.push(L); for (let L = 5; L <= 90; L += 2.5) lv.push(L);
  t2.strokeStyle = 'rgba(150,140,122,.35)'; t2.lineWidth = 1.2;
  for (const { seg } of contours(cxM - TW / U / 2, cyM - TD / U / 2, cxM + TW / U / 2, cyM + TD / U / 2, 3, lv)) { t2.beginPath(); t2.moveTo(mx(seg[0].x), my(seg[0].y)); t2.lineTo(mx(seg[1].x), my(seg[1].y)); t2.stroke(); }
  for (const p of PATHS) { t2.strokeStyle = 'rgba(190,182,166,.9)'; t2.lineWidth = 6 * ms; t2.lineCap = 'round'; t2.beginPath(); p.forEach(([x, y], i) => (i ? t2.lineTo(mx(x), my(y)) : t2.moveTo(mx(x), my(y)))); t2.stroke(); }
  t2.fillStyle = 'rgba(224,68,43,.016)';
  for (const p of SHOT) { const q = footprintCorners(p.p, p.headingRad); t2.beginPath(); q.forEach((c, i) => (i ? t2.lineTo(mx(c.x), my(c.y)) : t2.moveTo(mx(c.x), my(c.y)))); t2.closePath(); t2.fill(); }
  t2.strokeStyle = 'rgba(26,27,30,.55)'; t2.lineWidth = 2.5; t2.setLineDash([16, 8]); t2.beginPath(); SITE.boundary.forEach((p, i) => (i ? t2.lineTo(mx(p.x), my(p.y)) : t2.moveTo(mx(p.x), my(p.y)))); t2.closePath(); t2.stroke(); t2.setLineDash([]);
  const PK = SITE.parking; t2.fillStyle = '#e4e0d8'; t2.fillRect(mx(PK.x0), my(PK.y0), (PK.x1 - PK.x0) * ms, (PK.y1 - PK.y0) * ms);
  const gtex = new THREE.CanvasTexture(tx); gtex.colorSpace = THREE.SRGBColorSpace; gtex.anisotropy = 8;
  const land = new THREE.PlaneGeometry(TW, TD, 260, 164).rotateX(-Math.PI / 2);
  const pos = land.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i) / U + cxM, pos.getZ(i) / U + cyM));
  land.computeVertexNormals();
  const landMesh = new THREE.Mesh(land, new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.93 })); landMesh.receiveShadow = true; scene.add(landMesh);
  // Cut faces round the tile, and a walnut plinth.
  const BASE = -0.14;
  const side = (pts: [number, number][]) => {
    const v: number[] = [], idx: number[] = [];
    pts.forEach(([x, z], i) => { v.push(x, ground(x / U + cxM, z / U + cyM), z, x, BASE, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); gg.setIndex(idx); gg.computeVertexNormals();
    scene.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.95, side: THREE.DoubleSide })));
  };
  const N = 160, edge = (f: (t: number) => [number, number]) => Array.from({ length: N + 1 }, (_, i) => f(i / N));
  side(edge(t => [-TW / 2 + TW * t, TD / 2])); side(edge(t => [TW / 2, -TD / 2 + TD * t])); side(edge(t => [-TW / 2 + TW * t, -TD / 2])); side(edge(t => [-TW / 2, -TD / 2 + TD * t]));
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.12, 0.16, TD + 0.12), new THREE.MeshStandardMaterial({ color: 0x5b4030, roughness: 0.55, metalness: 0 }));
  plinth.position.y = BASE - 0.08; plinth.receiveShadow = true; scene.add(plinth);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.12 })); floor.position.y = BASE - 0.16; floor.receiveShadow = true; scene.add(floor);
  // Buildings, tents, trucks, trees and cars, all in the same white clay (trees in cork).
  const at = (x: number, y: number) => new THREE.Vector3((x - cxM) * U, 0, (y - cyM) * U);
  const solid = (o: THREE.Mesh) => { o.castShadow = true; o.receiveShadow = true; scene.add(o); return o; };
  for (const s of STRUCTS) {
    const p = at(s.x, s.y), gy = ground(s.x, s.y), hh = s.h * VX;
    if (s.kind === 'tent') { const m = solid(new THREE.Mesh(new THREE.ConeGeometry(s.w * U * 0.72, hh * 1.2, 4).rotateY(Math.PI / 4), clay)); m.position.set(p.x, gy + hh * 0.6, p.z); continue; }
    if (s.kind === 'hall') { // an arched hall: a half-round section run along its length
      const r = (s.d * U) / 2, arch = new THREE.Shape(); arch.moveTo(-r, 0); arch.absarc(0, 0, r, Math.PI, 0, true); arch.lineTo(-r, 0);
      const geo = new THREE.ExtrudeGeometry(arch, { depth: s.w * U, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, (-s.w * U) / 2).rotateY(Math.PI / 2);
      const m = solid(new THREE.Mesh(geo, clay)); m.position.set(p.x, gy, p.z); m.scale.y = hh / r; continue; }
    const m = solid(new THREE.Mesh(new THREE.BoxGeometry(s.w * U, hh, s.d * U), s.kind === 'truck' ? new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.9 }) : clay)); m.position.set(p.x, gy + hh / 2, p.z);
  }
  const cork = new THREE.MeshStandardMaterial({ color: 0xcbbfa6, roughness: 1 });
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), cork, TREES.length); trees.castShadow = true; trees.receiveShadow = true;
  const m4 = new THREE.Matrix4(); let ti = 0;
  for (const t of TREES) { const p = at(t.x, t.y); if (Math.abs(p.x) > TW / 2 - 0.03 || Math.abs(p.z) > TD / 2 - 0.03) continue; const r = t.r * U * 0.85; m4.compose(new THREE.Vector3(p.x, ground(t.x, t.y) + r * 1.4, p.z), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.15, r)); trees.setMatrixAt(ti++, m4); }
  trees.count = ti; scene.add(trees);
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8 * U, 1.4 * VX, 4.2 * U), clay, PARKED_CARS.length); cars.castShadow = true;
  PARKED_CARS.forEach((c, i) => { const p = at(c.x + 1.3, c.y + 2.5); m4.makeTranslation(p.x, ground(c.x, c.y) + 0.7 * VX, p.z); cars.setMatrixAt(i, m4); }); scene.add(cars);
  // The stockpile in gravel grey.
  // Flight thread: flown legs solid red with a bead at each photo, the rest pale grey; pins at the line ends.
  const ALT = 0.24;
  const red = new THREE.MeshStandardMaterial({ color: 0xe0442b, roughness: 0.45, emissive: 0x3a0c04 });
  const route: THREE.Vector3[] = [], todo: THREE.Vector3[] = [];
  for (const l of plan.legs) {
    const a = at(l.a.x, l.a.y).setY(ALT), b = at(l.b.x, l.b.y).setY(ALT);
    if (l.line < CUR || (l.line === CUR && !l.capture && route.length === 0)) { route.push(a, b); continue; }
    if (l.line === CUR && l.capture) { const d = at(AT.p.x, AT.p.y).setY(ALT); route.push(a, d); todo.push(d, b); continue; }
    if (l.line < CUR) continue;
    todo.push(a, b);
  }
  for (let i = 0; i < route.length; i += 2) { const c = new THREE.LineCurve3(route[i], route[i + 1]); if (route[i].distanceTo(route[i + 1]) < 1e-4) continue; solid(new THREE.Mesh(new THREE.TubeGeometry(c, 2, 0.0042, 6), red)); }
  const pale = new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.8 });
  for (let i = 0; i < todo.length; i += 2) { if (todo[i].distanceTo(todo[i + 1]) < 1e-4) continue; const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(todo[i], todo[i + 1]), 2, 0.002, 5), pale); scene.add(m); }
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0085, 10, 8), red, SHOT.length);
  SHOT.forEach((p, i) => { const v = at(p.p.x, p.p.y); m4.makeTranslation(v.x, ALT, v.z); beads.setMatrixAt(i, m4); }); beads.castShadow = true; scene.add(beads);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 });
  for (const l of capLegs) for (const e of [l.a, l.b]) { const v = at(e.x, e.y), gy = ground(e.x, e.y); const pin = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, ALT - gy, 6), pinMat)); pin.position.set(v.x, (ALT + gy) / 2, v.z); }
  // The aircraft on the thread.
  const air = buildDrone(droneMaterials(), radialTexture());
  air.group.scale.setScalar(0.3); const dv = at(AT.p.x, AT.p.y); air.group.position.set(dv.x, ALT + 0.03, dv.z);
  air.group.rotation.y = -AT.headingRad; air.blur.forEach(b => { b.visible = true; });
  air.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = !(m.material as THREE.Material).transparent; });
  scene.add(air.group);

  cam.position.set(2.3, 5.6, 8.1); cam.lookAt(0.05, -0.25, 0.25); cam.updateMatrixWorld();
  renderer.render(scene, cam);
  // Annotations: leader lines from the model to labels, as on a presentation model.
  const lead = document.getElementById('lead')!; lead.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const proj = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(cam); return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h }; };
  const ann = (t: string, sub: string, p: { x: number; y: number }, dx: number, dy: number, color = '#1a1b1e') => {
    const e = document.createElement('div'); e.className = 'ann'; e.innerHTML = `${t}<small>${sub}</small>`; host.appendChild(e);
    const lx = p.x + dx, ly = p.y + dy; e.style.left = `${dx < 0 ? lx - e.offsetWidth - 6 : lx + 6}px`; e.style.top = `${ly - 9}px`;
    lead.insertAdjacentHTML('beforeend', `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${color}"/><polyline points="${p.x},${p.y} ${lx},${ly}" fill="none" stroke="${color}" stroke-width="1"/>`);
  };
  const S = (id: string) => STRUCTS.find(s => s.id === id)!;
  const s1 = S('stage'), s2 = S('hall');
  ann('Main stage', '15 m', proj((s1.x - cxM) * U, ground(s1.x, s1.y) + s1.h * VX, (s1.y - cyM) * U), 40, -70);
  ann('Exhibition hall', '11 m', proj((s2.x - cxM) * U, ground(s2.x, s2.y) + s2.h * VX, (s2.y - cyM) * U), -36, -78);
  ann('Home', 'take-off and landing', proj((SITE.home.x - cxM) * U, ground(SITE.home.x, SITE.home.y), (SITE.home.y - cyM) * U), -30, 44);
  ann(`Aircraft · line ${CUR + 1}`, `60 m · photo ${SHOT.length}`, proj(dv.x, ALT + 0.05, dv.z), 70, -60, '#e0442b');
  done();
}

// ================================================================================================
// C. LIGHTBOX
// ================================================================================================
/** A richer orthophoto for the lightbox: the venue imagery with grain, mowing stripes and tree relief. */
function photo(size = 2048): HTMLCanvasElement {
  const base = siteImagery(size), c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!;
  g.drawImage(base, 0, 0); const s = size / WORLD_M, X = (x: number) => (x + WORLD_M / 2) * s, Y = (y: number) => (y + WORLD_M / 2) * s;
  // Mowing stripes inside the venue.
  g.save(); g.beginPath(); SITE.boundary.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.closePath(); g.clip();
  for (let x = -260; x < 260; x += 12) { g.fillStyle = 'rgba(255,255,230,.045)'; g.fillRect(X(x), 0, 6 * s, size); }
  g.restore();
  // Tree crowns with light from the north-west and a cast shadow.
  for (const t of TREES) {
    g.fillStyle = 'rgba(10,20,8,.35)'; g.beginPath(); g.arc(X(t.x + t.r * 0.5), Y(t.y + t.r * 0.5), t.r * s, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(X(t.x - t.r * 0.35), Y(t.y - t.r * 0.35), 0, X(t.x), Y(t.y), t.r * s);
    gr.addColorStop(0, `rgb(${70 + t.shade * 30},${100 + t.shade * 30},${48})`); gr.addColorStop(1, `rgb(${26 + t.shade * 14},${50 + t.shade * 16},${24})`);
    g.fillStyle = gr; g.beginPath(); g.arc(X(t.x), Y(t.y), t.r * s, 0, Math.PI * 2); g.fill();
  }
  // Roofs: a lit edge and a shaded edge.
  for (const st of SITE.structures) {
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X(st.x - st.w / 2), Y(st.y - st.d / 2), st.w * s, Math.max(1, st.d * s * 0.12));
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(X(st.x - st.w / 2), Y(st.y + st.d / 2) - st.d * s * 0.12, st.w * s, st.d * s * 0.12);
  }
  // Sensor grain.
  const id = g.getImageData(0, 0, size, size), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
  return c;
}
function lightbox() {
  css(`:root{--bg:#e9e7e2;--chrome:#f7f6f3;--seg:#e1ded7;--line:#d8d4cc;--ink:#18191b;--ink2:#56575c;--ink3:#8b8983;--acc:#c2620a}
  .head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
  .head h1{font-size:24px;font-weight:600;letter-spacing:-.01em}.head p{color:var(--ink2);margin-top:3px}
  .chip{display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;font-weight:500;color:var(--acc);vertical-align:4px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
  .reads{display:flex;gap:30px}.reads small{display:block;font-size:11px;color:var(--ink3)}.reads b{font-size:22px;font-weight:600}
  .wrap{display:grid;grid-template-columns:1fr 330px;gap:16px;height:640px}
  .box{display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:#fbfaf7;box-shadow:0 0 0 1px var(--line)}
  .table{position:relative;flex:1;background:radial-gradient(90% 80% at 50% 45%,#ffffff 0%,#f4f2ed 60%,#e8e5de 100%)}
  .table canvas{position:absolute;inset:0}
  .strip{height:104px;display:flex;gap:8px;align-items:center;padding:0 14px;background:#f1efea;border-top:1px solid var(--line)}
  .fr{flex:1;display:flex;flex-direction:column;gap:4px}.fr canvas{width:100%;aspect-ratio:4/3;border-radius:3px;display:block}
  .fr small{font:500 10px 'JetBrains Mono',monospace;color:var(--ink3);display:flex;justify-content:space-between}.fr.new small{color:var(--acc)}.fr.new canvas{outline:2px solid var(--acc);outline-offset:1px}
  .views{position:absolute;top:14px;right:14px;display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.85);box-shadow:0 0 0 1px var(--line)}
  .views span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.views span.on{background:var(--ink);color:#fff}
  .note{position:absolute;left:16px;bottom:12px;font-size:11.5px;color:var(--ink3)}
  .rail{background:var(--chrome);border-radius:16px;padding:18px;box-shadow:0 0 0 1px var(--line)}
  .rail h3{font-size:13px;font-weight:600;margin:0 0 10px;display:flex;justify-content:space-between}.rail h3 span{font-weight:500;color:var(--acc);font-size:12px}
  #latest{width:100%;aspect-ratio:4/3;border-radius:8px;display:block}
  .exif{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:12px 0 16px}.exif small{display:block;font-size:10.5px;color:var(--ink3)}.exif b{font-weight:500}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)}.row span{color:var(--ink2)}
  .acts{display:flex;gap:8px;align-items:center;margin-top:12px}
  .btn{height:36px;padding:0 14px;border-radius:10px;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;font-weight:500;background:var(--chrome)}
  .btn.p{background:var(--ink);color:#fff;box-shadow:none}.btn.d{color:#b42318}.sp{flex:1}
  .seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--seg)}.seg span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.seg span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
  `);
  const last = SHOT.slice(-8);
  root.innerHTML = `${appBar()}<main>
  <div class="head"><div><h1>Site survey<span class="chip">Capturing · line ${CUR + 1} of ${NL}</span></h1><p>Festival grounds · ${(plan.areaM2 / 1e4).toFixed(1)} ha · orthomosaic at ${plan.params.altitudeM} m</p></div>
  <div class="reads"><div><small>Photographed</small><b class="num">${pct}%</b></div><div><small>Photos</small><b class="num">${SHOT.length}</b></div><div><small>Ground detail</small><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div><small>Time left</small><b class="num">${timeLeft}</b></div></div></div>
  <div class="wrap"><div class="box"><div class="table" id="tb"><canvas id="cv"></canvas><div class="views"><span class="on">Mosaic</span><span>Coverage</span><span>Flight</span></div><div class="note">Each photo lands where it was taken. The map builds itself as the aircraft flies.</div></div>
    <div class="strip">${last.map((p, i) => `<div class="fr ${i === last.length - 1 ? 'new' : ''}"><canvas data-i="${SHOT.length - last.length + i}"></canvas><small><span>${String(SHOT.length - last.length + i + 1).padStart(4, '0')}</span><span>L${p.line + 1}</span></small></div>`).join('')}</div></div>
   <div class="rail"><h3>Latest photo<span class="num">No. ${String(SHOT.length).padStart(4, '0')}</span></h3><canvas id="latest"></canvas>
    <div class="exif"><div><small>Height</small><b class="num">60.2 m</b></div><div><small>Shutter</small><b class="num">1/1000 s</b></div><div><small>Aperture</small><b class="num">f/2.8</b></div><div><small>ISO</small><b class="num">100</b></div><div><small>Ground detail</small><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div><small>Covers</small><b class="num">${Math.round(plan.footprint.acrossM)} × ${Math.round(plan.footprint.alongM)} m</b></div></div>
    <div class="row"><span>Photos</span><b class="num">${SHOT.length} of ~${PTS.length}</b></div>
    <div class="row"><span>Photographed</span><b class="num">${pct}%</b></div>
    <div class="row"><span>Overlap</span><b class="num">75% · 70%</b></div>
    <div class="row" style="border:0"><span>Line</span><b class="num">${CUR + 1} of ${NL}</b></div>
   </div></div>
  <div class="acts"><span class="seg"><span class="on">Flight</span><span>Results</span></span><span class="btn p">Pause</span><span class="btn">Re-fly weak patches</span><span class="seg"><span>1×</span><span class="on">4×</span><span>16×</span></span><span class="sp"></span><span class="btn">Export package</span><span class="btn d">Return home</span></div>
  </main>`;
  const img = photo(2048), ipm = img.width / WORLD_M, IX = (x: number) => (x + WORLD_M / 2) * ipm;
  const host = document.getElementById('tb')!, cv = document.getElementById('cv') as HTMLCanvasElement;
  const w = host.clientWidth, h = host.clientHeight, dpr = 2;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const g = cv.getContext('2d')!; g.scale(dpr, dpr);
  const cx = 6, cy = -2, sc = Math.min((w - 60) / 500, (h - 50) / 360);
  const X = (x: number) => w / 2 + (x - cx) * sc, Y = (y: number) => h / 2 + (y - cy) * sc;
  // Faint grid on the lightbox and the plan in pencil underneath.
  g.strokeStyle = 'rgba(0,0,0,.045)'; g.lineWidth = 1; for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = 'rgba(24,25,27,.35)'; g.lineWidth = 1.2; g.setLineDash([6, 4]); g.beginPath(); SITE.boundary.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.closePath(); g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(24,25,27,.18)'; g.lineWidth = 0.8; for (const s of STRUCTS) g.strokeRect(X(s.x - s.w / 2), Y(s.y - s.d / 2), s.w * sc, s.d * sc);
  for (const l of capLegs) if (l.line >= CUR) { g.strokeStyle = 'rgba(24,25,27,.22)'; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(X(l.a.x), Y(l.a.y)); g.lineTo(X(l.b.x), Y(l.b.y)); g.stroke(); g.setLineDash([]); }
  // The photos, in the order taken, each with its own small exposure difference.
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const { acrossM, alongM } = plan.footprint;
  SHOT.forEach((p, i) => {
    const recent = SHOT.length - 1 - i, jit = recent < 3 ? (3 - recent) * 0.6 : 0;
    g.save(); g.translate(X(p.p.x + (rnd() - 0.5) * jit * 2), Y(p.p.y + (rnd() - 0.5) * jit * 2)); g.rotate(p.headingRad + (rnd() - 0.5) * jit * 0.02);
    const fw = alongM * sc, fh = acrossM * sc;
    g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 6; g.shadowOffsetY = 1.5; g.fillStyle = '#fff'; g.fillRect(-fw / 2, -fh / 2, fw, fh); g.shadowColor = 'transparent';
    g.beginPath(); g.rect(-fw / 2, -fh / 2, fw, fh); g.clip();
    g.rotate(-p.headingRad); g.drawImage(img, IX(p.p.x) - (w / sc) * ipm, IX(p.p.y) - (h / sc) * ipm, (2 * w / sc) * ipm, (2 * h / sc) * ipm, -w, -h, 2 * w, 2 * h); g.rotate(p.headingRad);
    const e = (rnd() - 0.5) * 0.12; g.fillStyle = e > 0 ? `rgba(255,250,240,${e})` : `rgba(10,10,0,${-e})`; g.fillRect(-fw / 2, -fh / 2, fw, fh);
    const v = g.createRadialGradient(0, 0, fh * 0.3, 0, 0, fw * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = v; g.fillRect(-fw / 2, -fh / 2, fw, fh);
    g.restore();
    if (recent === 0) { // crop marks on the newest frame
      g.save(); g.translate(X(p.p.x), Y(p.p.y)); g.rotate(p.headingRad); g.strokeStyle = '#c2620a'; g.lineWidth = 2;
      const a = fw / 2 + 4, b = fh / 2 + 4, k = 12;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(sx * a, sy * (b - k)); g.lineTo(sx * a, sy * b); g.lineTo(sx * (a - k), sy * b); g.stroke(); }
      g.restore();
      const t = `Photo ${String(SHOT.length).padStart(4, '0')} · just now`; g.font = '600 11px Inter';
      const tw = g.measureText(t).width, tx = X(p.p.x) - tw / 2, ty = Y(p.p.y) + fh / 2 + 22;
      g.fillStyle = '#c2620a'; g.beginPath(); g.roundRect(tx - 8, ty - 13, tw + 16, 20, 10); g.fill();
      g.fillStyle = '#fff'; g.fillText(t, tx, ty + 1);
    }
  });
  // Thumbnails.
  const thumb = (c: HTMLCanvasElement, p: (typeof SHOT)[number], tw: number) => {
    // Heading up, so the frame's long side (across the track) runs left to right, as the camera saw it.
    const th = (tw * 3) / 4; c.width = tw * 2; c.height = th * 2; const t = c.getContext('2d')!; t.scale(2, 2);
    t.translate(tw / 2, th / 2); t.rotate(-p.headingRad - Math.PI / 2);
    const k = tw / acrossM; t.drawImage(img, IX(p.p.x) - acrossM * ipm, IX(p.p.y) - acrossM * ipm, 2 * acrossM * ipm, 2 * acrossM * ipm, -acrossM * k, -acrossM * k, 2 * acrossM * k, 2 * acrossM * k);
  };
  document.querySelectorAll<HTMLCanvasElement>('.strip canvas').forEach(c => thumb(c, SHOT[Number(c.dataset.i)], c.clientWidth));
  const lat = document.getElementById('latest') as HTMLCanvasElement; thumb(lat, AT, lat.clientWidth);
  done();
}

// ================================================================================================
// D. RELIEF PLATE
// ================================================================================================
function relief() {
  css(`:root{--bg:#ece9e1;--chrome:#f8f6f1;--seg:#e4e0d6;--line:#d8d2c5;--ink:#1d1d1b;--ink2:#55534d;--ink3:#8d887c;--acc:#c2311f}
  .head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
  .head h1{font-size:24px;font-weight:600;letter-spacing:-.01em}.head p{color:var(--ink2);margin-top:3px}
  .chip{display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;font-weight:500;color:var(--acc);vertical-align:4px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
  .reads{display:flex;gap:30px}.reads small{display:block;font-size:11px;color:var(--ink3)}.reads b{font-size:22px;font-weight:600}
  .wrap{display:grid;grid-template-columns:1fr 316px;gap:16px;height:640px}
  .plate{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#f3efe4;box-shadow:0 0 0 1px var(--line)}
  .map{position:relative;flex:1}.map canvas,.prof canvas{position:absolute;inset:0}
  .prof{position:relative;height:128px;border-top:1px solid var(--line);background:#f8f5ed}
  .views{position:absolute;top:12px;right:12px;display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(248,246,241,.9);box-shadow:0 0 0 1px var(--line)}
  .views span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.views span.on{background:var(--ink);color:#fff}
  .panel{background:var(--chrome);border-radius:14px;padding:16px 18px;box-shadow:0 0 0 1px var(--line);display:flex;flex-direction:column;gap:14px}
  .panel h3{font-size:12px;font-weight:600;margin-bottom:7px}
  .sum{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .sum div{padding:8px 9px;border-left:1px solid var(--line)}.sum div:first-child{border:0}.sum small{display:block;font-size:10.5px;color:var(--ink3)}.sum b{font-size:16px;font-weight:600}
  .qa{display:grid;grid-template-columns:auto 1fr auto;gap:7px 9px;align-items:center;font-size:12px}
  .qa i{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:10px;font-weight:700;color:#fff}
  .ok{background:#2f7d4f}.wn{background:#b7791f}.qa span{color:var(--ink2)}.qa b{font-weight:500}
  .key{display:grid;grid-template-columns:28px 1fr;gap:6px 9px;font-size:11.5px;color:var(--ink2);align-items:center}
  .key em{display:block;height:12px;border-radius:2px}
  .crs{margin-top:auto;font-size:11px;color:var(--ink3);line-height:1.5;border-top:1px solid var(--line);padding-top:10px}
  .acts{display:flex;gap:8px;align-items:center;margin-top:12px}
  .btn{height:36px;padding:0 14px;border-radius:10px;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;font-weight:500;background:var(--chrome)}
  .btn.p{background:var(--ink);color:#fff;box-shadow:none}.btn.d{color:#b42318}.sp{flex:1}
  .seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--seg)}.seg span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.seg span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
  `);
  root.innerHTML = `${appBar()}<main>
  <div class="head"><div><h1>Site survey<span class="chip">Capturing · line ${CUR + 1} of ${NL}</span></h1><p>Festival grounds · ${(plan.areaM2 / 1e4).toFixed(1)} ha · orthomosaic at ${plan.params.altitudeM} m</p></div>
  <div class="reads"><div><small>Photographed</small><b class="num">${pct}%</b></div><div><small>Photos</small><b class="num">${SHOT.length}</b></div><div><small>Ground detail</small><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div><small>Time left</small><b class="num">${timeLeft}</b></div></div></div>
  <div class="wrap"><div class="plate"><div class="map" id="mp"><canvas id="cv"></canvas><div class="views"><span class="on">Relief</span><span>Imagery</span><span>3D</span></div></div><div class="prof" id="pf"><canvas id="pc"></canvas></div></div>
   <div class="panel">
    <div><h3>Plan</h3><div class="sum"><div><small>Minutes</small><b class="num">${Math.round(plan.durationS / 60)}</b></div><div><small>Hectares</small><b class="num">${(plan.areaM2 / 1e4).toFixed(1)}</b></div><div><small>Photos</small><b class="num">~${PTS.length}</b></div><div><small>Batteries</small><b class="num">${plan.batteries}</b></div></div></div>
    <div><h3>Quality so far</h3><div class="qa">
      <i class="ok">✓</i><span>Ground detail</span><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b>
      <i class="ok">✓</i><span>Views per point, flown ground</span><b class="num">≥ 5</b>
      <i class="ok">✓</i><span>Height above ground</span><b class="num">58–61 m</b>
      <i class="wn">!</i><span>Wind at 60 m</span><b class="num">6.8 m/s</b></div></div>
    <div><h3>Key</h3><div class="key">
      <em style="background:linear-gradient(90deg,#9aa0c4,#efe6c8)"></em><span>Relief, lit from the north-west</span>
      <em style="background:linear-gradient(90deg,#cfcbc2,#cfcbc2 50%,#e9dfbd 50%)"></em><span>Grey: still to photograph. Colour: photographed</span>
      <em style="height:2px;background:#9c6b3a"></em><span>Contours 0.5 m, index 2.5 m</span>
      <em style="height:2px;background:#c2311f"></em><span>Flight line, flying now</span>
      <em style="height:2px;background:#1d1d1b"></em><span>Flight line, flown</span></div></div>
    <div class="crs">WGS 84 / UTM zone 11N · heights to site datum 11.4 m · Long Beach, CA · 3 Oct 2026</div>
   </div></div>
  <div class="acts"><span class="seg"><span class="on">Flight</span><span>Results</span></span><span class="btn p">Pause</span><span class="btn">Re-fly weak patches</span><span class="seg"><span>1×</span><span class="on">4×</span><span>16×</span></span><span class="sp"></span><span class="btn">Export package</span><span class="btn d">Return home</span></div>
  </main>`;

  const host = document.getElementById('mp')!, cv = document.getElementById('cv') as HTMLCanvasElement;
  const w = host.clientWidth, h = host.clientHeight, dpr = 2;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const g = cv.getContext('2d')!;
  const cx = 6, cy = -2, sc = Math.min((w - 40) / 520, (h - 30) / 365);
  const X = (x: number) => w / 2 + (x - cx) * sc, Y = (y: number) => h / 2 + (y - cy) * sc;
  const wx = (px: number) => cx + (px - w / 2) / sc, wy = (py: number) => cy + (py - h / 2) / sc;
  // Photographed mask: every footprint so far, at screen resolution.
  const mk = document.createElement('canvas'); mk.width = w; mk.height = h; const m2 = mk.getContext('2d')!;
  m2.fillStyle = '#fff'; for (const p of SHOT) { const q = footprintCorners(p.p, p.headingRad); m2.beginPath(); q.forEach((c, i) => (i ? m2.lineTo(X(c.x), Y(c.y)) : m2.moveTo(X(c.x), Y(c.y)))); m2.closePath(); m2.fill(); }
  const mask = m2.getImageData(0, 0, w, h).data;
  // Relief: heights at half-pixel steps, hillshade from the north-west, hypsometric tint, then grey where not yet photographed.
  const R = 2, gw = Math.ceil(w * R), gh = Math.ceil(h * R), Hs = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) Hs[j * gw + i] = heightAt(wx(i / R), wy(j / R));
  const img = g.createImageData(gw, gh), d = img.data, cell = 1 / (sc * R), Z = 3.2;
  const L = [-0.62, -0.62, 0.48]; const ln = Math.hypot(...L); L[0] /= ln; L[1] /= ln; L[2] /= ln;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, hc = Hs[k];
    const hx = (Hs[j * gw + Math.min(gw - 1, i + 1)] - Hs[j * gw + Math.max(0, i - 1)]) / (2 * cell) * Z;
    const hy = (Hs[Math.min(gh - 1, j + 1) * gw + i] - Hs[Math.max(0, j - 1) * gw + i]) / (2 * cell) * Z;
    const nl = Math.hypot(hx, hy, 1), dot = (-hx * L[0] - hy * L[1] + L[2]) / nl;
    const t = Math.min(1, Math.max(0, hc / 45));
    // tint: venue meadow (pale green-cream) to dry hills (straw)
    let r = 210 + 26 * t, gg = 224 - 10 * t, b = 170 - 14 * t;
    const sh = Math.min(1, Math.max(-1, (dot - 0.48 / 1) * 2.2));
    if (sh >= 0) { r += 18 * sh; gg += 12 * sh; b -= 6 * sh; } else { r += 70 * sh; gg += 62 * sh; b += 6 * sh; }
    const mi = (Math.floor(j / R) * w + Math.floor(i / R)) * 4, cov = mask[mi + 3] / 255;
    const lum = 0.3 * r + 0.59 * gg + 0.11 * b, grey = 0.55 * lum + 0.45 * 214;
    const o = k * 4; d[o] = grey + (r - grey) * cov; d[o + 1] = grey + (gg - grey) * cov; d[o + 2] = grey * 0.985 + (b - grey * 0.985) * cov; d[o + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = gw; tmp.height = gh; tmp.getContext('2d')!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, cv.width, cv.height); g.scale(dpr, dpr);
  // Contours, labelled on the index lines.
  const lv: number[] = []; for (let L2 = -4; L2 < 5; L2 += 0.5) lv.push(L2); for (let L2 = 5; L2 <= 90; L2 += 2.5) lv.push(L2);
  const segs = contours(wx(0), wy(0), wx(w), wy(h), 3, lv); const labelled = new Set<number>(); const placed: [number, number][] = [];
  for (const { level, seg } of segs) {
    const index = Math.abs(level / 2.5 - Math.round(level / 2.5)) < 1e-6;
    g.strokeStyle = index ? 'rgba(140,90,46,.75)' : 'rgba(140,90,46,.35)'; g.lineWidth = index ? 0.9 : 0.5;
    g.beginPath(); g.moveTo(X(seg[0].x), Y(seg[0].y)); g.lineTo(X(seg[1].x), Y(seg[1].y)); g.stroke();
    const mx = (X(seg[0].x) + X(seg[1].x)) / 2, my = Y(seg[0].y); if (index && level >= 5 && !labelled.has(level) && mx > 30 && mx < w - 60 && my > 70 && my < h - 40 && placed.every(([px, py]) => Math.hypot(px - mx, py - my) > 90)) { placed.push([mx, my]); labelled.add(level); g.font = '500 9px Inter'; g.fillStyle = 'rgba(140,90,46,.95)'; g.fillText(`${Math.round(level + 11.4)}`, X(seg[0].x) + 2, Y(seg[0].y) - 2); }
  }
  // Vegetation, paths, buildings (USGS conventions: green, brown, black).
  for (const t of TREES) { g.fillStyle = 'rgba(96,140,78,.7)'; g.beginPath(); g.arc(X(t.x), Y(t.y), Math.max(1.4, t.r * sc * 0.75), 0, Math.PI * 2); g.fill(); }
  for (const p of PATHS) { g.strokeStyle = 'rgba(139,90,43,.75)'; g.lineWidth = 1.2; g.setLineDash([5, 3]); g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); g.setLineDash([]); }
  const PK = SITE.parking; g.strokeStyle = 'rgba(29,29,27,.55)'; g.lineWidth = 0.8; g.strokeRect(X(PK.x0), Y(PK.y0), (PK.x1 - PK.x0) * sc, (PK.y1 - PK.y0) * sc);
  for (const s of STRUCTS) { g.fillStyle = '#1d1d1b'; g.fillRect(X(s.x - s.w / 2), Y(s.y - s.d / 2), s.w * sc, s.d * sc); }
  // Boundary.
  g.strokeStyle = 'rgba(29,29,27,.8)'; g.lineWidth = 1.6; g.setLineDash([10, 3, 2, 3]); g.beginPath(); SITE.boundary.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.closePath(); g.stroke(); g.setLineDash([]);
  // Flight lines.
  for (const l of capLegs) {
    if (l.line < CUR) { g.strokeStyle = '#1d1d1b'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(l.a.x), Y(l.a.y)); g.lineTo(X(l.b.x), Y(l.b.y)); g.stroke(); }
    else if (l.line === CUR) { g.strokeStyle = '#c2311f'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(X(l.a.x), Y(l.a.y)); g.lineTo(X(AT.p.x), Y(AT.p.y)); g.stroke(); g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(AT.p.x), Y(AT.p.y)); g.lineTo(X(l.b.x), Y(l.b.y)); g.stroke(); g.setLineDash([]); }
    else { g.strokeStyle = 'rgba(29,29,27,.38)'; g.lineWidth = 0.9; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(X(l.a.x), Y(l.a.y)); g.lineTo(X(l.b.x), Y(l.b.y)); g.stroke(); g.setLineDash([]); }
  }
  g.fillStyle = '#1d1d1b'; for (const p of SHOT) { g.beginPath(); g.arc(X(p.p.x), Y(p.p.y), 0.9, 0, Math.PI * 2); g.fill(); }
  // Aircraft and home.
  { const px = X(AT.p.x), py = Y(AT.p.y), hd = AT.headingRad; g.fillStyle = '#c2311f'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(px + Math.cos(hd) * 11, py + Math.sin(hd) * 11); g.lineTo(px + Math.cos(hd + 2.5) * 8, py + Math.sin(hd + 2.5) * 8); g.lineTo(px + Math.cos(hd - 2.5) * 8, py + Math.sin(hd - 2.5) * 8); g.closePath(); g.fill(); g.stroke(); }
  { const hx = X(SITE.home.x), hy = Y(SITE.home.y); g.fillStyle = '#fff'; g.strokeStyle = '#1d1d1b'; g.lineWidth = 1.4; g.beginPath(); g.arc(hx, hy, 5, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#1d1d1b'; g.font = '600 10.5px Inter'; g.fillText('Home', hx + 9, hy + 4); }
  const tag = (t: string, x: number, y: number) => { g.font = '500 10.5px Inter'; g.fillStyle = '#1d1d1b'; g.fillText(t, x, y); };
  const S = (id: string) => STRUCTS.find(s => s.id === id)!;
  tag('Main stage', X(S('stage').x + S('stage').w / 2) + 5, Y(S('stage').y) + 4); tag('Exhibition hall', X(S('hall').x - S('hall').w / 2), Y(S('hall').y + S('hall').d / 2) + 13);
  // Scale and north.
  { const bx = 18, by = h - 18, m = 100 * sc; g.fillStyle = '#1d1d1b'; g.fillRect(bx, by - 3, m / 2, 3); g.strokeStyle = '#1d1d1b'; g.lineWidth = 1; g.strokeRect(bx + m / 2, by - 3, m / 2, 3); g.font = '500 9px Inter'; g.fillText('0', bx - 2, by + 11); g.fillText('50', bx + m / 2 - 5, by + 11); g.fillText('100 m', bx + m - 8, by + 11);
    g.beginPath(); g.moveTo(w - 30, 58); g.lineTo(w - 24, 76); g.lineTo(w - 30, 72); g.lineTo(w - 36, 76); g.closePath(); g.fill(); g.font = '600 10px Inter'; g.fillText('N', w - 33.5, 52); }

  // Altitude profile along the line being flown (after Wingtra's profile strip).
  const ph = document.getElementById('pf')!, pc = document.getElementById('pc') as HTMLCanvasElement;
  const pw = ph.clientWidth, phh = ph.clientHeight; pc.width = pw * dpr; pc.height = phh * dpr; pc.style.width = `${pw}px`; pc.style.height = `${phh}px`;
  const q = pc.getContext('2d')!; q.scale(dpr, dpr);
  const leg = capLegs.find(l => l.line === CUR)!, len = Math.hypot(leg.b.x - leg.a.x, leg.b.y - leg.a.y), homeH = heightAt(SITE.home.x, SITE.home.y);
  const N = 240, prof = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return heightAt(leg.a.x + (leg.b.x - leg.a.x) * t, leg.a.y + (leg.b.y - leg.a.y) * t); });
  const L0 = 110, R0 = pw - 24, T0 = 24, B0 = phh - 26, hMin = Math.min(...prof) - 2, hMax = homeH + plan.params.altitudeM + 6;
  const PX = (t: number) => L0 + (R0 - L0) * t, PY = (v: number) => B0 - ((v - hMin) / (hMax - hMin)) * (B0 - T0);
  q.font = '600 11.5px Inter'; q.fillStyle = '#1d1d1b'; q.fillText(`Line ${CUR + 1} profile`, 16, 30); q.font = '400 11px Inter'; q.fillStyle = '#55534d';
  q.fillText(`${Math.round(len)} m long`, 16, 47); q.fillText(`${Math.round(plan.params.altitudeM)} m above take-off`, 16, 63); q.fillText('Clearance 58 m min.', 16, 79);
  q.fillStyle = '#e9dfbd'; q.beginPath(); q.moveTo(PX(0), B0); prof.forEach((v, i) => q.lineTo(PX(i / N), PY(v))); q.lineTo(PX(1), B0); q.closePath(); q.fill();
  q.strokeStyle = '#8c5a2e'; q.lineWidth = 1.2; q.beginPath(); prof.forEach((v, i) => (i ? q.lineTo(PX(i / N), PY(v)) : q.moveTo(PX(0), PY(v)))); q.stroke();
  const fly = PY(homeH + plan.params.altitudeM), at = Math.hypot(AT.p.x - leg.a.x, AT.p.y - leg.a.y) / len;
  q.strokeStyle = '#c2311f'; q.lineWidth = 2; q.beginPath(); q.moveTo(PX(0), fly); q.lineTo(PX(at), fly); q.stroke(); q.setLineDash([5, 4]); q.lineWidth = 1.3; q.beginPath(); q.moveTo(PX(at), fly); q.lineTo(PX(1), fly); q.stroke(); q.setLineDash([]);
  q.strokeStyle = 'rgba(194,49,31,.35)'; q.lineWidth = 1; q.setLineDash([2, 3]); q.beginPath(); q.moveTo(PX(at), fly); q.lineTo(PX(at), PY(prof[Math.round(at * N)])); q.stroke(); q.setLineDash([]);
  q.fillStyle = '#c2311f'; q.beginPath(); q.arc(PX(at), fly, 4.5, 0, Math.PI * 2); q.fill();
  q.font = '500 10px Inter'; q.fillStyle = '#8d887c'; q.fillText('0 m', PX(0) - 4, B0 + 15); q.fillText(`${Math.round(len)} m`, PX(1) - 26, B0 + 15); q.fillText('ground', PX(0.02), PY(prof[4]) - 5);
  q.fillStyle = '#c2311f'; q.fillText(`60 m · photo ${SHOT.length}`, PX(at) + 9, fly - 7);
  done();
}

// ================================================================================================
// E. HOLOGRAPHIC SITE
// ================================================================================================
function holo() {
  css(`:root{--bg:#eef0f3;--chrome:#fbfcfd;--seg:#e4e8ee;--line:#dce1e8;--ink:#0f1720;--ink2:#4d5866;--ink3:#8a94a3;--acc:#1f7ae0}
  .head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
  .head h1{font-size:24px;font-weight:600;letter-spacing:-.01em}.head p{color:var(--ink2);margin-top:3px}
  .chip{display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;font-weight:500;color:var(--acc);vertical-align:4px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
  .reads{display:flex;gap:30px}.reads small{display:block;font-size:11px;color:var(--ink3)}.reads b{font-size:22px;font-weight:600}
  .wrap{display:grid;grid-template-columns:1fr 316px;gap:16px;height:640px}
  .stage{position:relative;border-radius:16px;overflow:hidden;background:#cfd8e0}
  .stage canvas{position:absolute;inset:0}
  .card{position:absolute;display:flex;gap:9px;align-items:center;padding:8px 11px 8px 9px;border-radius:10px;background:rgba(255,255,255,.86);box-shadow:0 6px 22px rgba(10,40,80,.18),0 0 0 1px rgba(80,160,255,.45);font-size:12px;color:#0f1720;white-space:nowrap}
  .card i{width:26px;height:26px;border-radius:7px;background:linear-gradient(160deg,#4aa8ff,#1f6fe0);display:grid;place-items:center;color:#fff;font-style:normal;font-size:12px;font-weight:700}
  .card small{display:block;color:#5b6676;font-size:10.5px}
  .card:after{content:"";position:absolute;left:var(--lx,50%);top:100%;width:1.5px;height:var(--lh,40px);background:linear-gradient(#5fb4ff,rgba(95,180,255,0))}
  .views{position:absolute;top:14px;right:14px;display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.88);box-shadow:0 0 0 1px var(--line)}
  .views span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.views span.on{background:var(--ink);color:#fff}
  .lines{position:absolute;left:16px;bottom:14px;display:flex;align-items:center;gap:3px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.88);font-size:12px;color:var(--ink2)}
  .lines i{width:16px;height:4px;border-radius:2px;background:#cdd5df}.lines i.d{background:#1f7ae0}.lines i.c{background:#5fb4ff;box-shadow:0 0 6px #5fb4ff}.lines span{margin-left:8px}
  .rail{background:var(--chrome);border-radius:16px;padding:18px;box-shadow:0 0 0 1px var(--line);display:flex;flex-direction:column;gap:16px}
  .rail h3{font-size:13px;font-weight:600;margin-bottom:8px}
  .big{font-size:40px;font-weight:600;letter-spacing:-.02em;line-height:1}.meter{height:6px;border-radius:3px;background:#e3e8ee;margin-top:10px;overflow:hidden}.meter i{display:block;height:100%;background:linear-gradient(90deg,#1f7ae0,#5fb4ff)}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)}.row span{color:var(--ink2)}
  .acts{display:flex;gap:8px;align-items:center;margin-top:12px}
  .btn{height:36px;padding:0 14px;border-radius:10px;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;font-weight:500;background:var(--chrome)}
  .btn.p{background:var(--ink);color:#fff;box-shadow:none}.btn.d{color:#b42318}.sp{flex:1}
  .seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--seg)}.seg span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.seg span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
  `);
  root.innerHTML = `${appBar()}<main>
  <div class="head"><div><h1>Site survey<span class="chip">Scanning · line ${CUR + 1} of ${NL}</span></h1><p>Festival grounds · ${(plan.areaM2 / 1e4).toFixed(1)} ha · orthomosaic at ${plan.params.altitudeM} m</p></div>
  <div class="reads"><div><small>Scanned</small><b class="num">${pct}%</b></div><div><small>Photos</small><b class="num">${SHOT.length}</b></div><div><small>Ground detail</small><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div><small>Time left</small><b class="num">${timeLeft}</b></div></div></div>
  <div class="wrap"><div class="stage" id="st"><canvas id="cv"></canvas><div class="views"><span class="on">Chase</span><span>Site</span><span>Top-down</span></div>
    <div class="lines">${Array.from({ length: NL }, (_, i) => `<i class="${i < CUR ? 'd' : i === CUR ? 'c' : ''}"></i>`).join('')}<span>Line ${CUR + 1} of ${NL}</span></div></div>
   <div class="rail"><div><h3>Scan</h3><div class="big num">${pct}%</div><div style="color:var(--ink2);margin-top:4px">of the site scanned</div><div class="meter"><i style="width:${pct}%"></i></div></div>
    <div><div class="row"><span>Photos</span><b class="num">${SHOT.length} of ~${PTS.length}</b></div><div class="row"><span>Ground detail</span><b class="num">${plan.gsdCm.toFixed(1)} cm/px</b></div><div class="row"><span>Height</span><b class="num">${plan.params.altitudeM} m</b></div><div class="row"><span>Overlap</span><b class="num">75% · 70%</b></div><div class="row"><span>Speed</span><b class="num">10 m/s</b></div><div class="row" style="border:0"><span>Battery</span><b class="num">58%</b></div></div>
    <div style="font-size:12px;color:var(--ink2);line-height:1.5">The blue beam is the camera's view. Where it has passed, the site's digital plan lights up on the ground.</div></div></div>
  <div class="acts"><span class="seg"><span class="on">Flight</span><span>Results</span></span><span class="btn p">Pause</span><span class="btn">Re-fly weak patches</span><span class="seg"><span>1×</span><span class="on">4×</span><span>16×</span></span><span class="sp"></span><span class="btn">Export package</span><span class="btn d">Return home</span></div>
  </main>`;

  const host = document.getElementById('st')!, cv = document.getElementById('cv') as HTMLCanvasElement;
  const w = host.clientWidth, h = host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); renderer.setSize(w, h); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  // Late-afternoon sky and haze.
  { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#8fb3d6'); gr.addColorStop(0.55, '#d9dfe2'); gr.addColorStop(0.8, '#efdcc4'); gr.addColorStop(1, '#f3d9b8'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.fog = new THREE.Fog(0xe8dccb, 260, 1150);
  scene.add(new THREE.HemisphereLight(0xcfe0f2, 0x8a7a60, 0.9));
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.6); sun.position.set(-260, 220, -140); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 900 }); sun.shadow.bias = -0.0005; scene.add(sun);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.Scene().add(new THREE.HemisphereLight(0xdde8f4, 0x8a7a60, 3)) as THREE.Scene, 0.04).texture; scene.environmentIntensity = 0.5;

  // Ground: the venue photograph draped on the terrain.
  const img = photo(4096); const tex = new THREE.CanvasTexture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const G = new THREE.PlaneGeometry(WORLD_M, WORLD_M, 300, 300).rotateX(-Math.PI / 2);
  { const a = G.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setY(i, heightAt(a.getX(i), a.getZ(i))); G.computeVertexNormals(); }
  const ground = new THREE.Mesh(G, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })); ground.receiveShadow = true; scene.add(ground);
  const at = (x: number, y: number, up = 0) => new THREE.Vector3(x, heightAt(x, y) + up, y);
  // Buildings, tents, trucks, trees, cars.
  const wall = new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.85 });
  for (const s of STRUCTS) {
    const gy = heightAt(s.x, s.y), roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.roof), roughness: 0.7 });
    let m: THREE.Mesh;
    if (s.kind === 'tent') { m = new THREE.Mesh(new THREE.ConeGeometry(s.w * 0.72, s.h, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.8 })); m.position.set(s.x, gy + s.h / 2, s.y); }
    else if (s.kind === 'hall') { const r = s.d / 2, arch = new THREE.Shape(); arch.moveTo(-r, 0); arch.absarc(0, 0, r, Math.PI, 0, true); arch.lineTo(-r, 0);
      m = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: s.w, bevelEnabled: false, curveSegments: 36 }).translate(0, 0, -s.w / 2).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe2e5, roughness: 0.6, metalness: 0.1 })); m.position.set(s.x, gy, s.y); m.scale.y = s.h / r; }
    else { m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), [wall, wall, roof, wall, wall, wall]); m.position.set(s.x, gy + s.h / 2, s.y); }
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  const m4 = new THREE.Matrix4();
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), TREES.length); crowns.castShadow = true; crowns.receiveShadow = true;
  TREES.forEach((t, i) => { const p = at(t.x, t.y); m4.compose(new THREE.Vector3(p.x, p.y + t.r * 1.5, p.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.r * 1.25, t.r)); crowns.setMatrixAt(i, m4); crowns.setColorAt(i, new THREE.Color().setHSL(0.25, 0.34, 0.24 + t.shade * 0.1)); }); scene.add(crowns);
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.4, 4.3), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), PARKED_CARS.length); cars.castShadow = true;
  PARKED_CARS.forEach((c, i) => { const p = at(c.x + 1.3, c.y + 2.5, 0.7); m4.makeTranslation(p.x, p.y, p.z); cars.setMatrixAt(i, m4); cars.setColorAt(i, new THREE.Color(c.color)); }); scene.add(cars);

  // ---- the holographic survey ----
  const HOLO = new THREE.Color(0.3, 0.68, 1.45), HOLO2 = new THREE.Color(0.12, 0.38, 0.95);
  const glow = (c: THREE.Color, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const drape = (pts: Pt[], step = 2, up = 0.35) => { const out: THREE.Vector3[] = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)); for (let k = 0; k < n; k++) { const t = k / n; out.push(at(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, up)); } } const l = pts[pts.length - 1]; out.push(at(l.x, l.y, up)); return out; };
  const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), Math.max(8, pts.length * 2), r, 6), mat); scene.add(m); return m; };
  // The blueprint layer: the site plan in light, revealed where the scan has passed, faint elsewhere.
  { const N = 4096, bp = document.createElement('canvas'); bp.width = bp.height = N; const g = bp.getContext('2d')!, s = N / WORLD_M;
    const P = (x: number, y: number): [number, number] => [(x + WORLD_M / 2) * s, (y + WORLD_M / 2) * s];
    const plan2 = document.createElement('canvas'); plan2.width = plan2.height = N; const q = plan2.getContext('2d')!;
    q.strokeStyle = '#fff'; q.fillStyle = '#fff'; q.lineCap = 'round';
    // grid every 10 m inside the boundary
    q.save(); q.beginPath(); SITE.boundary.forEach((p, i) => (i ? q.lineTo(...P(p.x, p.y)) : q.moveTo(...P(p.x, p.y)))); q.closePath(); q.clip();
    q.globalAlpha = 0.16; q.lineWidth = 1.2; for (let x = -260; x <= 260; x += 10) { q.beginPath(); q.moveTo(...P(x, -200)); q.lineTo(...P(x, 200)); q.stroke(); } for (let y = -200; y <= 200; y += 10) { q.beginPath(); q.moveTo(...P(-260, y)); q.lineTo(...P(260, y)); q.stroke(); }
    q.restore(); q.globalAlpha = 1;
    // structures: outline, inner offset line, dimensions
    q.font = `600 ${Math.round(3.2 * s)}px Inter`; q.textAlign = 'center';
    for (const st of STRUCTS) {
      const [x0, y0] = P(st.x - st.w / 2, st.y - st.d / 2), ww = st.w * s, dd = st.d * s;
      q.lineWidth = 0.55 * s; q.strokeRect(x0, y0, ww, dd);
      if (st.w > 10) { q.lineWidth = 0.22 * s; q.strokeRect(x0 + 1.2 * s, y0 + 1.2 * s, ww - 2.4 * s, dd - 2.4 * s);
        q.lineWidth = 0.18 * s; const yy = y0 - 3 * s; q.beginPath(); q.moveTo(x0, yy); q.lineTo(x0 + ww, yy); q.moveTo(x0, yy - s); q.lineTo(x0, yy + s); q.moveTo(x0 + ww, yy - s); q.lineTo(x0 + ww, yy + s); q.stroke();
        q.font = `600 ${Math.round(Math.min(4.2, st.w / 7) * s)}px Inter`; q.fillText(st.label, x0 + ww / 2, y0 + dd / 2); q.font = `500 ${Math.round(Math.min(3.2, st.w / 9) * s)}px Inter`; q.fillText(`${st.w} × ${st.d} m`, x0 + ww / 2, y0 + dd / 2 + Math.min(5, st.w / 6) * s); }
    }
    // paths as centrelines with edges, parking stalls, stockpile rings
    for (const pth of PATHS) for (const [lw, a] of [[0.3, 1], [6, 0.12]] as [number, number][]) { q.globalAlpha = a; q.lineWidth = lw * s; q.beginPath(); pth.forEach(([x, y], i) => (i ? q.lineTo(...P(x, y)) : q.moveTo(...P(x, y)))); q.stroke(); }
    q.globalAlpha = 1; const PK = SITE.parking; q.lineWidth = 0.25 * s; q.strokeRect(...P(PK.x0, PK.y0), (PK.x1 - PK.x0) * s, (PK.y1 - PK.y0) * s);
    for (let row = 0; row < 4; row++) for (let col = 0; col <= 40; col++) { const [x, y] = P(PK.x0 + 4 + col * 2.8, PK.y0 + 6 + row * 15); q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 5 * s); q.stroke(); }
    for (let k = 1; k <= 4; k++) { const [x, y] = P(STOCKPILE.x, STOCKPILE.y); q.beginPath(); q.arc(x, y, STOCKPILE.r * s * (k / 4), 0, Math.PI * 2); q.stroke(); }
    // reveal: full where photographed, 18% elsewhere
    const mk = document.createElement('canvas'); mk.width = mk.height = N; const mg = mk.getContext('2d')!; mg.fillStyle = 'rgba(255,255,255,.1)'; mg.fillRect(0, 0, N, N);
    mg.fillStyle = '#fff'; for (const p of SHOT) { const c4 = footprintCorners(p.p, p.headingRad); mg.beginPath(); c4.forEach((c, i) => (i ? mg.lineTo(...P(c.x, c.y)) : mg.moveTo(...P(c.x, c.y)))); mg.closePath(); mg.fill(); }
    g.drawImage(plan2, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mk, 0, 0); g.globalCompositeOperation = 'source-over';
    const bt = new THREE.CanvasTexture(bp); bt.anisotropy = 16;
    const layer = new THREE.Mesh(G.clone(), new THREE.MeshBasicMaterial({ map: bt, color: HOLO, opacity: 0.7, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    layer.position.y = 0.25; scene.add(layer);
    // translucent blue over the whole site, like a survey area fill
    const fillC = document.createElement('canvas'); fillC.width = fillC.height = 1024; const fg = fillC.getContext('2d')!; const fs = 1024 / WORLD_M;
    fg.fillStyle = 'rgba(40,120,255,.07)'; fg.beginPath(); SITE.boundary.forEach((p, i) => (i ? fg.lineTo((p.x + WORLD_M / 2) * fs, (p.y + WORLD_M / 2) * fs) : fg.moveTo((p.x + WORLD_M / 2) * fs, (p.y + WORLD_M / 2) * fs))); fg.closePath(); fg.fill();
    const ft = new THREE.CanvasTexture(fillC);
    const fill = new THREE.Mesh(G.clone(), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); fill.position.y = 0.15; scene.add(fill);
  }
  // Boundary: a glowing edge with nodes at the corners.
  tube(drape([...SITE.boundary, SITE.boundary[0]], 2, 0.6), 0.45, glow(HOLO));
  tube(drape([...SITE.boundary, SITE.boundary[0]], 2, 0.6), 1.6, glow(HOLO2, 0.25));
  for (const p of SITE.boundary) { const v = at(p.x, p.y, 0.8); const n = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), glow(new THREE.Color(1.2, 2, 3))); n.position.copy(v); scene.add(n);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 3.6, 40).rotateX(-Math.PI / 2), glow(HOLO, 0.8)); ring.position.copy(v); scene.add(ring); }
  // Flight lines on the ground: flown bright, the current one to the aircraft, the rest faint.
  for (const l of capLegs) {
    if (l.line < CUR) tube(drape([l.a, l.b], 3, 0.5), 0.28, glow(HOLO, 0.9));
    else if (l.line === CUR) { tube(drape([l.a, AT.p], 3, 0.5), 0.45, glow(new THREE.Color(0.7, 1.4, 2.6))); tube(drape([AT.p, l.b], 3, 0.5), 0.18, glow(HOLO, 0.35)); }
    else tube(drape([l.a, l.b], 3, 0.5), 0.15, glow(HOLO2, 0.28));
  }
  // The aircraft (scaled up so it reads from the chase camera) and its scan beam.
  const ALT = heightAt(SITE.home.x, SITE.home.y) + plan.params.altitudeM;
  const dir = new THREE.Vector3(Math.cos(AT.headingRad), 0, Math.sin(AT.headingRad)), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const D = new THREE.Vector3(AT.p.x, ALT, AT.p.y);
  const air = buildDrone(droneMaterials(), radialTexture()); const K = 10; air.group.scale.setScalar(K); air.group.position.copy(D); air.group.rotation.y = -AT.headingRad;
  air.blur.forEach(b => { b.visible = true; }); air.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = !(m.material as THREE.Material).transparent; }); scene.add(air.group);
  const cam0 = D.clone().addScaledVector(dir, 0.4 * K).add(new THREE.Vector3(0, -0.12 * K, 0));
  const fp = footprintCorners(AT.p, AT.headingRad).map(c => at(c.x, c.y, 0.6));
  { const pos: number[] = [], uv: number[] = [];
    for (let i = 0; i < 4; i++) { const a = fp[i], b = fp[(i + 1) % 4]; pos.push(cam0.x, cam0.y, cam0.z, a.x, a.y, a.z, b.x, b.y, b.z); uv.push(0.5, 0, 0, 1, 1, 1); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const sc = document.createElement('canvas'); sc.width = 4; sc.height = 256; const sg = sc.getContext('2d')!;
    for (let y = 0; y < 256; y++) { const t = y / 255, band = (Math.floor(y / 6) % 2) * 0.12; sg.fillStyle = `rgba(255,255,255,${(0.1 + 0.32 * t + band * t).toFixed(3)})`; sg.fillRect(0, y, 4, 1); }
    const beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), color: new THREE.Color(0.35, 0.8, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); scene.add(beam);
    tube([...fp, fp[0]], 0.35, glow(new THREE.Color(0.8, 1.6, 2.8)));
    for (const c of fp) tube([cam0, c], 0.08, glow(HOLO, 0.7));          // the beam's edges
    const footFill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([fp[0], fp[1], fp[2], fp[0], fp[2], fp[3]]), glow(new THREE.Color(0.2, 0.5, 1.1), 0.35)); scene.add(footFill);
  }
  // Chase camera behind and beside the aircraft, looking down the line.
  const cam = new THREE.PerspectiveCamera(46, w / h, 1, 3000);
  cam.position.copy(D).addScaledVector(dir, -58).addScaledVector(side, -34).add(new THREE.Vector3(0, 24, 0));
  cam.lookAt(D.clone().addScaledVector(dir, 30).addScaledVector(side, 6).add(new THREE.Vector3(0, -36, 0)));
  const composer = new EffectComposer(renderer); composer.setPixelRatio(2); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, cam)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.5, 0.9)); composer.addPass(new OutputPass());
  composer.render();
  // Floating cards anchored to the site.
  const proj = (v: THREE.Vector3) => { const p = v.clone().project(cam); return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, ok: p.z < 1 }; };
  const card = (icon: string, t: string, sub: string, v: THREE.Vector3, lift = 46) => {
    const p = proj(v); if (!p.ok || p.x < 0 || p.x > w || p.y < 0 || p.y > h) return;
    const e = document.createElement('div'); e.className = 'card'; e.innerHTML = `<i>${icon}</i><div>${t}<small>${sub}</small></div>`; host.appendChild(e);
    e.style.left = `${p.x - e.offsetWidth / 2}px`; e.style.top = `${p.y - lift - e.offsetHeight}px`; e.style.setProperty('--lh', `${lift}px`);
  };
  const S = (id: string) => STRUCTS.find(s => s.id === id)!;
  card('▲', 'Main stage', '38 × 20 m · 15 m high', at(S('stage').x, S('stage').y, S('stage').h), 30);
  card('➚', `Aircraft · line ${CUR + 1} of ${NL}`, '60 m · 10 m/s · battery 58%', D.clone().add(new THREE.Vector3(0, 0.25 * K, 0)), 34);
  card('◉', 'Gravel stockpile', 'volume after landing', at(STOCKPILE.x, STOCKPILE.y, STOCKPILE.h), 34);
  card('✦', `Photo ${SHOT.length}`, `line ${CUR + 1} · 1.6 cm/px`, fp[1].clone().lerp(fp[2], 0.5), 24);
  done();
}

// Canvas text needs the faces loaded first (the page links Inter; the stills harness injects it).
Promise.all(['400 10px Inter', '500 10px Inter', '600 10px Inter', '500 10px "JetBrains Mono"'].map(f => document.fonts.load(f))).catch(() => undefined).then(() => ({ sheet, model, lightbox, relief, holo })[C]());
