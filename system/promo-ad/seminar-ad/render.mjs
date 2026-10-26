import fs from 'fs';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
let chromium; try { chromium = req('playwright').chromium; } catch { chromium = req(process.env.PW_PATH || '/usr/local/lib/node_modules/playwright').chromium; }
const D = process.argv[2]; const FPS = 30, DUR = 37.0, END = 31.6, SHIFT = 3.2, SPLIT = 28.4;
const W0 = JSON.parse(fs.readFileSync(D + '/words.json'));
const W = W0.map(w => ({ w: w.w, s: w.s >= SPLIT ? w.s + SHIFT : w.s, e: w.e >= SPLIT ? w.e + SHIFT : w.e }));
W[28].w = 'Interface'; W[72].s = 32.3; // 'Book' was timed to start in the pause
// merge "meridianinterface" + ".com."
W[77] = { w: 'meridianinterface.com', s: W[77].s, e: W[78].e, url: true }; W.splice(78, 1);
const CH = [[0,3],[4,7],[8,10],[11,14],[15,20],[21,23],[24,26],[27,29],[30,33],[34,36],[37,39],[40,43],[44,48],[49,52],[53,56],[57,63],[64,67],[68,71],[72,75],[76,77]].map(([a,b]) => W.slice(a, b + 1));
// element windows: id, start, end, fadeIn, fadeOut (fadeOut begins at end)
const EL = [
  ['slide1', 0.1, 5.9, 0.4, 0.25], ['search', 6.15, 9.4, 0.3, 0.2], ['slide2', 9.4, 11.9, 0.3, 0.25],
  ['tA', 12.8, 16.3, 0.35, 0.25], ['tB', 14.8, 16.3, 0.35, 0.25], ['t4', 16.7, 18.5, 0.3, 0.2], ['t4b', 18.5, 22.0, 0.3, 0.25],
  ['p5', 22.25, 26.3, 0.3, 0.0], ['l5', 22.25, 26.3, 0.3, 0.0], ['p6', 26.3, 28.6, 0.0, 0.4], ['l6', 26.3, 28.6, 0.0, 0.4],
  ['s7', 29.0, 31.6, 0.3, 0.4]];
const al = (t, s, e, fi, fo) => t < s ? 0 : t < s + fi ? (t - s) / fi : t < e ? 1 : t < e + fo ? 1 - (t - e) / fo : 0;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + D + '/panel.html'); await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
fs.mkdirSync(D + '/frames', { recursive: true });
let last = null, shots = 0;
for (let f = 0; f < Math.round(FPS * DUR); f++) {
  const t = f / FPS;
  const eA = Math.min(1, Math.max(0, (t - END) / 0.6)); const onEnd = eA > 0;
  const ch = CH.find(c => t >= c[0].s - 0.05 && t < c[c.length - 1].e + 0.25);
  const html = ch ? ch.map(w => `<span class="${(t >= w.s - 0.03 && t < w.e ? 'on ' : '') + (w.url ? 'url' : '')}">${w.w}</span>`).join('') : '';
  const op = {}; for (const [id, s, e, fi, fo] of EL) op[id] = +al(t, s, e, fi, fo).toFixed(2);
  const sc = {}; for (const id of ['tA', 'tB', 't4', 't4b']) { const e = EL.find(x => x[0] === id); sc[id] = 0.92 + 0.08 * Math.min(1, Math.max(0, (t - e[1]) / e[3])); }
  const key = JSON.stringify([html, op, sc, eA.toFixed(2)]);
  if (key !== last) {
    await p.evaluate(([h, op, sc, eA, onEnd]) => {
      document.getElementById('cap').innerHTML = onEnd ? '' : h; document.getElementById('endcap').innerHTML = onEnd ? h : '';
      for (const id in op) document.getElementById(id).style.opacity = op[id];
      for (const id in sc) document.getElementById(id).style.transform = `scale(${sc[id]})`;
      document.getElementById('end').style.opacity = eA;
    }, [html, op, sc, eA, onEnd]);
    await p.screenshot({ path: `${D}/frames/${String(f).padStart(4, '0')}.png`, omitBackground: true }); last = key; shots++;
  } else fs.copyFileSync(`${D}/frames/${String(f - 1).padStart(4, '0')}.png`, `${D}/frames/${String(f).padStart(4, '0')}.png`);
}
await b.close(); console.log('frames', Math.round(FPS * DUR), 'screenshots', shots);
