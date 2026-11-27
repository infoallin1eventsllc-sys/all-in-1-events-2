const fs=require('fs');let s=fs.readFileSync('full.js','utf8');
function rep(a,b){ if(!s.includes(a)) throw new Error('anchor missing: '+a.slice(0,60)); s=s.replace(a,b); }
rep(`function tick() {
  requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;`,
`let manual = false, videoMode = false;
function tick() {
  if (manual) return; requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt);
}
function step(dt) {`);
rep('hint.material.opacity = playing ?','hint.material.opacity = videoMode ? 0 : playing ?');
rep('globalThis.__tour = { total: TOTAL,',`globalThis.__tour = { capStarts: CAPS.map((_, c) => { const j = K.findIndex((k) => k[7] === c); return j < 0 ? null : T[j]; }), hold: HOLD, K, T,
  video() { manual = true; videoMode = true; time = 0; playing = true; snap = true; yaw = 0; pitch = 0; capShown = 0; capAlpha = 0; },
  at(t) { manual = true; videoMode = true; time = t; playing = true; snap = true; yaw = 0; pitch = 0; capShown = -1; capAlpha = 0; },
  step(dt) { step(dt); return time; }, total: TOTAL, get dbg() { return { renderer, composer, scene, camera }; },`);
// full-resolution logo straight from the owner's file
rep('const logoTex = new THREE.CanvasTexture(logoCanvas());',
`function logoHi() { const c = document.createElement("canvas"); c.width = c.height = 1024; c.getContext("2d").drawImage(globalThis.__logoImg, 0, 0, 1024, 1024); return c; }
const logoTex = new THREE.CanvasTexture(globalThis.__logoImg ? logoHi() : logoCanvas());`);
// multisampled composer target: clean edges
rep('composer = new EffectComposer(renderer);',
`{ const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: globalThis.__msaa ?? 4 })); }`);

// ---- design patches ----
rep(`g.font = (L.weight || "800") + " " + L.size + "px Montserrat, 'Helvetica Neue', Arial, sans-serif";`,
`{ const fam = "px Montserrat, 'Helvetica Neue', Arial, sans-serif", wt = (L.weight || "800") + " "; let fs = L.size; g.font = wt + fs + fam;
      const mw = w * (o.plate ? 0.9 : 0.93), tw = g.measureText(L.t).width; if (tw > mw) { fs = Math.floor(fs * mw / tw); g.font = wt + fs + fam; } }`);
rep(`new THREE.MeshStandardMaterial({
    map: logoTex, transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: glow, roughness: 0.45, side: THREE.DoubleSide }));`,
`new THREE.MeshBasicMaterial({ map: logoTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }));
  p.material.color.setScalar(glow >= 0.9 ? 1.2 : glow <= 0.1 ? 0.5 : 1.0);`);
rep(`const car = (x, col) => { box(1.9, 0.62, 4.4, x, 0.2, 23, sm(col, 0.35, 0.5)); box(1.7, 0.5, 2.3, x, 0.82, 22.8, M.black); };`,
`const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20), tyreM = sm(0x101112, 0.85, 0.1), rimM = sm(0xb9bcc0, 0.3, 0.9);
  const car = (x, col) => { const paint = sm(col, 0.28, 0.6);
    box(1.88, 0.5, 4.5, x, 0.3, 23, paint); box(1.9, 0.1, 4.56, x, 0.26, 23, M.black, false);
    box(1.7, 0.2, 2.5, x, 0.8, 22.85, paint, false); box(1.62, 0.36, 2.3, x, 0.98, 22.85, M.black, false); box(1.66, 0.05, 2.2, x, 1.34, 22.85, paint, false);
    for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) { const w = new THREE.Mesh(tyre, tyreM); w.rotation.z = PI / 2; w.position.set(x + sx * 0.86, 0.34 - 0.06, 23 + sz); w.castShadow = true; scene.add(w);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 16), rimM); r.rotation.z = PI / 2; r.position.copy(w.position); scene.add(r); }
    box(0.34, 0.1, 0.04, x - 0.62, 0.58, 20.74, M.ledWarm, false); box(0.34, 0.1, 0.04, x + 0.62, 0.58, 20.74, M.ledWarm, false);
    box(0.4, 0.09, 0.04, x - 0.6, 0.6, 25.24, sm(0x7a0d12, 0.4, 0.2), false); box(0.4, 0.09, 0.04, x + 0.6, 0.6, 25.24, sm(0x7a0d12, 0.4, 0.2), false); };`);
rep(`const fr = []; for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; fr.push({ x: x + Math.cos(a) * 1.35, y: h - 0.2, z: z + Math.sin(a) * 1.35, sx: 0.5, sy: 0.05, sz: 3.1, ry: -a + PI / 2, rx: 0.5 }); }
    ibox(M.leaf, fr);`,
`const fr = [], fd = []; const N = 16;
    for (let i = 0; i < N; i++) { const a = i / N * PI * 2 + x * 0.37, low = i % 2, k = (low ? 0.86 : 1) * (0.93 + 0.12 * Math.sin(i * 2.4 + x)), d0 = low ? 0.18 : -0.3, list = low ? fd : fr;
      let r = 0.12, y = h - (low ? 0.28 : 0.08);
      [[1.5, d0, 0.44], [1.35, d0 + 0.5, 0.38], [1.15, d0 + 1.0, 0.26], [0.8, d0 + 1.45, 0.14]].forEach(([len, tilt, wd]) => { const L = len * k, dx = Math.cos(tilt) * L, dy = -Math.sin(tilt) * L;
        list.push({ x: x + Math.cos(a) * (r + dx / 2), y: y + dy / 2, z: z + Math.sin(a) * (r + dx / 2), sx: wd, sy: 0.04, sz: L * 1.04, ry: -a + PI / 2, rx: tilt }); r += dx; y += dy; }); }
    ibox(M.leaf, fr); ibox(M.leafDark, fd); cyl(0.3, 0.2, 0.5, x, h - 0.45, z, M.trunk, 10);`);

rep('g.fillStyle = "rgba(14,18,16,0.78)";','g.fillStyle = "rgba(14,18,16,0.9)";');
rep(`box(0.04, 3.2, 7, 14.8, y, 8.5, M.glass, false); box(5.2, 3.2, 0.04, 17.4, y, 5, M.glass, false);`,
`box(0.08, 0.06, 7, 14.8, y, 8.5, M.charcoal, false); box(5.2, 0.06, 0.08, 17.4, y, 5, M.charcoal, false);`);

rep(`sign([{ t: "BOARDROOM", size: 130, y: 0.5 }], 1.5, 0.24, 14.77, y + 1.5, 6.3, -PI / 2);`,
`sign([{ t: "BOARDROOM", size: 130, y: 0.5 }], 0.9, 0.144, 14.77, y + 1.5, 5.5, -PI / 2, { glow: 0.72 });`);

rep(`ch.push(B(0.08, 0.5, 0.5, 17.4 + s * 1.38, y + 0.46, 6.7 + i * 0.9)); }
  ibox(M.charcoal, ch);`, `ch.push(B(0.08, 0.5, 0.5, 17.4 + s * 1.38, y + 0.46, 6.7 + i * 0.9)); }
  ibox(M.black, ch);`);
rep(`box(0.06, 1.9, 3.3, 19.84, y + 1.1, 8.5, M.black, false);`, `box(0.06, 1.9, 3.3, 19.84, y + 1.1, 8.5, new THREE.MeshBasicMaterial({ color: 0x0b0d0c }), false);`);

rep(`if (composer) { outMat.uniforms.fade.value = fade; composer.render(); }`,
`if (composer) { outMat.uniforms.fade.value = fade; if (videoMode) composer.passes[1].strength = 0.3 - 0.2 * Math.min(1, Math.max(0, (time - 174) / 2)); composer.render(); }`);

if (process.env.INLAY) {
  rep(`const inlay = logoPanel(2.4, 0, 0.006, 9.3, 0, 0.1);`, `const inlay = logoPanel(2.4, 0, 0.006, 9.3, 0, 0.1); globalThis.__inlay = inlay;`);
  rep(`function step(dt) {`, `function step(dt) { if (globalThis.__inlay && globalThis.__hide) globalThis.__inlay.visible = !(time >= globalThis.__hide[0] && time <= globalThis.__hide[1]);`);
}

if (process.env.MERCH) {
  rep(`[10.6, 12.6, 14.6, 16.6, 18.6].forEach((x, i) => mannequin(x, 11.4, HOOD[i % 4], 0.25));`,
  fs.readFileSync('merch-patch.js','utf8') + `
  { const Dm = globalThis.__merch;
    hoodieForm(11.3, 11.4, { y0: 0.25, fab: [161, 49, 54], decal: Dm[3], dw: 0.345, cords: [[[105, -75], [105, 108], [106, 136]], [[177, -75], [177, 108], [177, 137]]] });
    hoodieForm(13.5, 11.4, { y0: 0.25, fab: [30, 31, 34], decal: Dm[4], dw: 0.35, sleeve: { t: "INDICA", up: false }, cords: [[[94, -90], [94, 205], [94, 232]], [[194, -90], [194, 205], [194, 232]]] });
    hoodieForm(15.7, 11.4, { y0: 0.25, fab: [150, 150, 150], decal: Dm[6], dw: 0.36, cord: 0xe6dfd0, cords: [[[70, -70], [45, 0], [28, 30], [14, 62], [8, 78]], [[208, -70], [221, 0], [228, 30], [222, 62], [207, 92], [202, 103]]] });
    hoodieForm(17.9, 11.4, { y0: 0.25, fab: [30, 31, 34], decal: Dm[7], dw: 0.3, dy: 1.3, sleeve: { t: "HYBRID", up: true }, cords: [[[61, -55], [62, 105], [59, 128]], [[113, -55], [113, 100], [108, 124]]] }); }`);
  rep('step(dt) { step(dt); return time; }, total: TOTAL,', `step(dt) { step(dt); return time; }, total: TOTAL,
  view(t) { manual = true; videoMode = true; hud.visible = true; time = t; playing = true; snap = true; capShown = -1; capAlpha = 0; for (let i = 0; i < 12; i++) step(1 / 6); },
  shot(px, py, pz, lx, ly, lz) { manual = true; hud.visible = false; hint.visible = false; camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); if (composer) { outMat.uniforms.fade.value = 1; composer.render(); } },`);
}

if (process.env.FINAL) {
  rep(`[13.8, e, 5, 19, 1.6, 7, 3, 8], [13.6, e, 7.6, 10.5, 1.5, 11.3, 3.5, 8], [11, e, 9.2, 5.4, 1.9, 6.5, 3.5, 8], [8, e, 10.5, 3, 1.7, 10.6, 3, 8],`,
      `[13.8, e, 5, 19, 1.6, 7, 3.5, 8], [15.9, e, 9.85, 16.7, 1.52, 11.4, 3.5, 8], [12.6, e, 9.9, 12.1, 1.52, 11.4, 3.5, 8], [8, e, 10.5, 3, 1.7, 10.6, 2.5, 8],`);
}

if (process.env.FINAL) {
  const a = s.indexOf("function mannequin(x, z, col, y0) {"), b = s.indexOf("\n}\n", a); if (a < 0 || b < 0) throw new Error("mannequin fn"); s = s.slice(0, a) + s.slice(b + 3);
  rep("} catch (err) { composer = null; }", "} catch { composer = null; }");
}

if (process.env.V2) {
  // ambient occlusion (contact shadows) between the beauty pass and bloom
  rep(`composer.addPass(new RenderPass(scene, camera));`, `composer.addPass(new RenderPass(scene, camera));
  if (globalThis.__GTAOPass && !globalThis.__noAO) { const sz2 = renderer.getDrawingBufferSize(new THREE.Vector2()); const ao = new globalThis.__GTAOPass(scene, camera, sz2.x, sz2.y);
    ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 16 }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 2, samples: 16 }); ao.blendIntensity = 0.85;
    const run = ao.render.bind(ao); ao.render = (...a) => { const hid = []; scene.traverse((o) => { const m = o.material; if (o.visible && m && (o.isSprite || m.transparent || m.alphaTest > 0)) { o.visible = false; hid.push(o); } }); run(...a); hid.forEach((o) => { o.visible = true; }); };
    composer.addPass(ao); globalThis.__ao = ao; }`);
  rep(`composer.passes[1].strength = 0.3 - 0.2`, `composer.passes[composer.passes.length - 2].strength = 0.3 - 0.2`);
}

if (process.env.V2) {
  rep(`// ---------- commit the instanced lists ----------`, fs.readFileSync('people-patch.js','utf8') + `\n// ---------- commit the instanced lists ----------`);
  // fuller plants: clustered foliage instead of single blobs
  rep(`fol.push({ x, y: y + 0.78 + j * 0.08, z, sx: 0.24, sy: 0.5 + j * 0.1, sz: 0.24, ry: j * 3, c: j > 0.5 ? 0x3f9a48 : 0x2f8a3c });
      cola.push({ x: x + 0.08, y: y + 1.36 + j * 0.14, z: z - 0.05, c: 0x9fc27a }, { x: x - 0.1, y: y + 1.24 + j * 0.1, z: z + 0.08, sx: 0.8, sy: 0.8, sz: 0.8, c: 0xb7c9a0 });`,
  `fol.push({ x, y: y + 0.74 + j * 0.08, z, sx: 0.15, sy: 0.5 + j * 0.1, sz: 0.15, ry: j * 3, c: 0x2f8a3c });
      cola.push({ x, y: y + 1.36 + j * 0.16, z, sx: 1.05, sy: 1.2, sz: 1.05, c: 0xa9c684 });
      for (let b = 0; b < 4; b++) { const a = j * 6.28 + b * 1.571 + (i % 2) * 0.6, r = 0.15, lean = 0.42, hb = 0.44 + (b % 2) * 0.1 + j * 0.06;
        fol.push({ x: x + Math.cos(a) * r, y: y + hb, z: z + Math.sin(a) * r, sx: 0.105, sy: 0.3, sz: 0.105, rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean, c: b % 2 ? 0x3f9a48 : 0x358f40 });
        cola.push({ x: x + Math.cos(a) * (r + 0.13), y: y + hb + 0.34, z: z + Math.sin(a) * (r + 0.13), sx: 0.75, sy: 0.8, sz: 0.75, rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean, c: b % 2 ? 0xb7c9a0 : 0x9fc27a }); }`);
  rep(`} else fol.push({ x, y: y + 0.3 + j * 0.05, z, sx: 0.17, sy: 0.2 + j * 0.05, sz: 0.17, ry: j * 3, c: j > 0.5 ? 0x3aa04a : 0x2f8f3f });`,
  `} else { fol.push({ x, y: y + 0.34 + j * 0.05, z, sx: 0.095, sy: 0.15 + j * 0.04, sz: 0.095, ry: j * 3, c: 0x3aa04a });
      for (let b = 0; b < 3; b++) { const a = j * 6.28 + b * 2.094 + (r % 2) * 0.5, rr = 0.075; fol.push({ x: x + Math.cos(a) * rr, y: y + 0.25 + (b % 2) * 0.04 + j * 0.03, z: z + Math.sin(a) * rr, sx: 0.1, sy: 0.12 + j * 0.03, sz: 0.1, ry: a, rz: -Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3, c: b ? 0x2f8f3f : 0x389a47 }); } }`);
  rep('step(dt) { step(dt); return time; }, total: TOTAL,', `step(dt) { step(dt); return time; }, total: TOTAL,
  pos(t) { const tt = Math.min(t, TOTAL); let i = 1; while (i < T.length - 1 && tt > T[i]) i++; const u = Math.min(1, Math.max(0, (tt - T[i - 1]) / (T[i] - T[i - 1]))); const p = pc.getPoint(Math.min(1, (i - 1 + u) / (K.length - 1))); return [p.x, p.y, p.z]; },`);
}

fs.writeFileSync(process.env.OUT||'video.js',s);

fs.writeFileSync('video.html',`<!doctype html><meta charset="utf-8"><style>
${[500,600,700,800,900].map(w=>`@font-face{font-family:Montserrat;font-weight:${w};src:url(/node_modules/@fontsource/montserrat/files/montserrat-latin-${w}-normal.woff2) format("woff2")}`).join('\n')}
</style><body style="margin:0;background:#000"><canvas id="c"></canvas>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
const q = new URLSearchParams(location.search), W = +q.get('w') || 1920, H = +q.get('h') || 1080; if (q.has('msaa')) globalThis.__msaa = +q.get('msaa');
try {
  await Promise.all([500,600,700,800,900].map(w => document.fonts.load(w + ' 40px Montserrat')));
  const img = new Image(); img.src = '/logo.png'; await img.decode(); globalThis.__logoImg = img;
  const code = await (await fetch('/video.js')).text();
  const canvas = document.getElementById('c'); canvas.width = W; canvas.height = H;
  new Function('THREE','OrbitControls','EffectComposer','RenderPass','UnrealBloomPass','canvas','width','height', code)(THREE,OrbitControls,EffectComposer,RenderPass,UnrealBloomPass,canvas,W,H); window.__ok = true; }
catch (e) { window.__err = String(e.stack || e); }
</script>`);
