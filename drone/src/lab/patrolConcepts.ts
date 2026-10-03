import * as THREE from 'three';
import { PARKED_CARS, SITE, TREES, heightAt, sitePhoto, WORLD_M } from '../survey/site';
import type { Pt } from '../survey/plan';
import { buildDrone, droneMaterials, radialTexture } from '../components/hero/droneModel';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Patrol map design concepts, drawn on the real demo venue (the festival grounds the survey flies), with the
 * patrol frozen at one moment: T-80M en route to Backstage, T-70M holding over the parking, T-60M tracking a
 * person outside the north fence, T-50M on the pad. Every camera feed is rendered from the same venue, so the
 * map and the cameras finally show the same place. ?c=ops | overwatch | sectors | night. Dev-only.
 *  - ops:       a clean top-down operations map on the venue photo: perimeter, route, true camera footprints.
 *  - overwatch: the venue in 3D daylight; the route flies at its real height, cameras cast their view cones.
 *  - sectors:   the venue split into watch sectors, each tinted by how long since a camera last saw it.
 *  - night:     after dark: the venue in thermal, warm bodies bright, the patrol drawn over it.
 */
const C = (new URLSearchParams(location.search).get('c') ?? 'ops') as 'ops' | 'overwatch' | 'sectors' | 'night';

// ---- the patrol, frozen ----------------------------------------------------------------------------
interface WP { id: string; label: string; x: number; y: number; alt: number; hold: number }
const ROUTE: WP[] = [
  { id: 'WP1', label: 'Main gate', x: -150, y: 108, alt: 60, hold: 8 },
  { id: 'WP2', label: 'West tree line', x: -226, y: -18, alt: 70, hold: 6 },
  { id: 'WP3', label: 'North fence', x: -20, y: -160, alt: 60, hold: 6 },
  { id: 'WP4', label: 'Backstage', x: 98, y: -104, alt: 55, hold: 10 },
  { id: 'WP5', label: 'Parking', x: 160, y: 98, alt: 70, hold: 6 },
];
interface Craft { id: string; x: number; y: number; alt: number; hdg: number; pitch: number; vfov: number; status: string; mode: 'RGB' | 'THERMAL'; kmh: number; batt: number; next?: string; off?: boolean }
const CRAFT: Craft[] = [
  { id: 'T-80M', x: 18, y: -140, alt: 60, hdg: 114, pitch: -32, vfov: 40, status: 'En route', mode: 'RGB', kmh: 42, batt: 84, next: 'WP4' },
  { id: 'T-70M', x: 152, y: 104, alt: 70, hdg: 262, pitch: -40, vfov: 40, status: 'On patrol', mode: 'RGB', kmh: 0, batt: 71, next: 'WP1' },
  { id: 'T-60M', x: -124, y: -146, alt: 45, hdg: 323, pitch: -56, vfov: 20, status: 'Tracking', mode: 'THERMAL', kmh: 0, batt: 63 },
  { id: 'T-50M', x: -95, y: 92, alt: 0, hdg: 40, pitch: -10, vfov: 44, status: 'On pad', mode: 'RGB', kmh: 0, batt: 12, off: true },
];
const SEL = CRAFT[0];
const DET = { id: 'DET-01', kind: 'Person', x: -142, y: -170, conf: 89, by: 'T-60M', where: 'outside the north fence', age: '0:42' };
const PAD = { x: -95, y: 92 };
const BOUND = SITE.boundary;
const perimeterM = Math.round(BOUND.reduce((s, p, i) => { const q = BOUND[(i + 1) % BOUND.length]; return s + Math.hypot(q.x - p.x, q.y - p.y); }, 0));

// ---- page scaffolding ------------------------------------------------------------------------------
const W = 1440, H = 900;
const css = (s: string) => { const e = document.createElement('style'); e.textContent = s; document.head.appendChild(e); };
css(`
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:13px;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 1}
:root{--bg:#f3f5f7;--chrome:#fff;--seg:#e8ecf0;--line:#dfe4ea;--ink:#101820;--ink2:#4f5b69;--ink3:#8b95a3;--acc:#0f766e;--bad:#d92d20;--warn:#b54708}
.dark{--bg:#0b0f14;--chrome:#121820;--seg:#1a222c;--line:#243040;--ink:#e8eef5;--ink2:#9aa8b8;--ink3:#64748b;--acc:#2dd4bf;--bad:#ff6b5e;--warn:#fdb022}
.num{font-variant-numeric:tabular-nums}
.bar{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--line);background:var(--chrome)}
.brand{display:flex;align-items:center;gap:10px}.brand i{width:32px;height:32px;border-radius:9px;background:var(--ink);display:block}
.brand small{display:block;font-size:11px;color:var(--ink3)}.brand b{font-size:13px;font-weight:600}
.tabs{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--seg)}
.tabs span{padding:6px 12px;border-radius:8px;color:var(--ink2);font-size:13px}.tabs span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.icons{display:flex;gap:8px}.icons i{width:36px;height:32px;border:1px solid var(--line);border-radius:9px;display:block;background:var(--chrome)}
main{padding:16px 20px 0}
.head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}
.head h1{font-size:24px;font-weight:600;letter-spacing:-.01em}.head p{color:var(--ink2);margin-top:3px}
.chip{display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;font-weight:500;color:var(--ink2);vertical-align:4px}.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
.reads{display:flex;gap:28px;align-items:flex-end}.reads small{display:block;font-size:11px;color:var(--ink3)}.reads b{font-size:22px;font-weight:600}
.seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--seg)}.seg span{padding:5px 10px;border-radius:7px;font-size:12px;color:var(--ink2)}.seg span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.grid{display:grid;grid-template-columns:1fr 316px;gap:16px}
.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.th{border-radius:12px;overflow:hidden;background:var(--chrome);box-shadow:0 0 0 1px var(--line)}.th.on{box-shadow:0 0 0 2px var(--acc)}
.th .img{position:relative;height:90px;background:#000}.th canvas{width:100%;height:100%;display:block}
.th .img b{position:absolute;left:6px;bottom:5px;font:600 10px/1 "JetBrains Mono",monospace;color:#fff;text-shadow:0 1px 2px #000}
.th .img em{position:absolute;right:6px;bottom:5px;font:500 9px/1 "JetBrains Mono",monospace;color:#7ff0c8;font-style:normal;text-shadow:0 1px 2px #000}
.th .lab{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;font-size:12.5px}.th .lab span{color:var(--ink3);font-size:11.5px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;background:var(--acc)}
.stage{position:relative;height:614px;border-radius:16px;overflow:hidden;background:#cfd6dc;box-shadow:0 0 0 1px var(--line)}
.stage>canvas{position:absolute;inset:0;width:100%;height:100%}
.ctl{position:absolute;display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.ctl span{padding:5px 10px;border-radius:7px;font-size:12px;color:#4f5b69}.ctl span.on{background:#101820;color:#fff}
.dark .ctl{background:rgba(18,24,32,.9);box-shadow:0 0 0 1px #243040}.dark .ctl span{color:#9aa8b8}.dark .ctl span.on{background:#e8eef5;color:#0b0f14}
.pip{position:absolute;right:14px;bottom:14px;width:272px;height:153px;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35),0 0 0 2px rgba(255,255,255,.9);background:#000}
.pip canvas{width:100%;height:100%;display:block}
.pip b{position:absolute;left:8px;top:7px;font:600 10px/1 "JetBrains Mono",monospace;color:#fff;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.55)}
.pip em{position:absolute;left:8px;bottom:7px;font:500 10px/1 "JetBrains Mono",monospace;color:#d8fff1;font-style:normal;text-shadow:0 1px 2px #000}
.rail{background:var(--chrome);border-radius:16px;box-shadow:0 0 0 1px var(--line);padding:16px;display:flex;flex-direction:column;gap:14px;height:736px}
.rtabs{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--seg)}.rtabs span{flex:1;text-align:center;padding:6px 0;border-radius:7px;font-size:11.5px;white-space:nowrap;color:var(--ink2)}.rtabs span.on{background:var(--chrome);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.rail h3{font-size:13px;font-weight:600}
.alert{border-radius:12px;padding:12px;background:color-mix(in srgb,var(--bad) 8%,var(--chrome));box-shadow:0 0 0 1px color-mix(in srgb,var(--bad) 35%,transparent)}
.alert .t{display:flex;justify-content:space-between;align-items:center;font-weight:600}.alert .t span{font:500 11px "JetBrains Mono",monospace;color:var(--bad)}
.alert p{color:var(--ink2);margin:4px 0 10px;font-size:12.5px;line-height:1.45}
.alert .shot{height:110px;border-radius:8px;overflow:hidden;background:#000;margin-bottom:10px;position:relative}.alert .shot canvas{width:100%;height:100%;display:block}
.btns{display:flex;gap:8px}.btn{height:32px;padding:0 11px;white-space:nowrap;border-radius:9px;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;font-weight:500;font-size:12.5px;background:var(--chrome)}.btn.p{background:var(--ink);color:var(--chrome);box-shadow:none}
.act{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:12.5px;line-height:1.4}.act small{font:500 10.5px "JetBrains Mono",monospace;color:var(--ink3);min-width:58px;padding-top:2px}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)}.row span{color:var(--ink2)}
.note{font-size:12px;color:var(--ink2);line-height:1.5}
.card{position:absolute;display:flex;gap:9px;align-items:center;padding:7px 11px 7px 8px;border-radius:10px;background:rgba(255,255,255,.9);box-shadow:0 6px 20px rgba(0,30,40,.2),0 0 0 1px rgba(45,212,191,.55);font-size:12px;color:#101820;white-space:nowrap}
.card i{width:24px;height:24px;border-radius:7px;background:linear-gradient(160deg,#2dd4bf,#0f766e);display:grid;place-items:center;color:#fff;font-style:normal;font-size:11px;font-weight:700}
.card.bad{box-shadow:0 6px 20px rgba(80,0,0,.25),0 0 0 1px rgba(255,90,80,.7)}.card.bad i{background:linear-gradient(160deg,#ff7a6e,#d92d20)}
.card small{display:block;color:#5b6676;font-size:10.5px}
.card:after{content:"";position:absolute;left:var(--lx,50%);top:100%;width:1.5px;height:var(--lh,40px);background:linear-gradient(var(--lc,#2dd4bf),rgba(45,212,191,0))}
`);
const appBar = () => `<div class="bar"><div class="brand"><i></i><div><small>Meridian Interface</small><b>Drone Command</b></div></div>
<div class="tabs"><span>Light show</span><span>Site survey</span><span class="on">Surveillance</span></div>
<div class="icons"><i style="width:100px"></i><i style="width:66px"></i><i style="width:76px"></i><i style="width:80px"></i><i style="width:84px"></i><i></i><i style="width:104px"></i><i style="width:100px"></i></div></div>`;
const root = document.createElement('div'); document.body.appendChild(root);
const done = () => requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(window, { __ready: true })));

function page(opts: { chip: string; rail: string; stage: string; dark?: boolean }) {
  if (opts.dark) document.documentElement.classList.add('dark');
  const air = CRAFT.filter(c => !c.off).length;
  root.innerHTML = `${appBar()}<main>
  <div class="head"><div><h1>Patrol<span class="chip">${opts.chip}</span></h1><p>Festival grounds · ${(perimeterM / 1000).toFixed(1)} km perimeter · 5-point loop · ${SEL.id} selected · next ${ROUTE[3].label}</p></div>
  <div class="reads"><div><small>Airborne</small><b class="num">${air} / ${CRAFT.length}</b></div><div><small>Flight time</small><b class="num">00:25:26</b></div><div><small>Open detections</small><b class="num" style="color:var(--bad)">1</b></div><div><small>${SEL.id} battery</small><b class="num" style="color:var(--acc)">${SEL.batt}%</b></div>
  <span class="seg"><span${opts.dark ? '' : ' class="on"'}>Auto</span><span>Day</span><span${opts.dark ? ' class="on"' : ''}>Night</span></span></div></div>
  <div class="grid"><div>
   <div class="thumbs">${CRAFT.map((c, i) => `<div class="th${i === 0 ? ' on' : ''}"><div class="img"><canvas id="th${i}"></canvas><b>${c.id}</b><em>${c.off ? 'NO LINK' : c.mode === 'THERMAL' || opts.dark ? 'THERMAL' : 'RGB 4K'}</em></div><div class="lab"><div><i class="dot" style="${c.off ? 'background:var(--ink3)' : c.status === 'Tracking' ? 'background:var(--bad)' : ''}"></i>${c.id}</div><span>${c.status}</span></div></div>`).join('')}</div>
   <div class="stage" id="st">${opts.stage}</div></div>
   <div class="rail">${opts.rail}</div></div></main>`;
}
const detectionRail = (extra = '') => `<div class="rtabs"><span>Aircraft</span><span>Route</span><span class="on">Detections 1</span><span>Activity</span></div>
  <div class="alert"><div class="t">Person · ${DET.where}<span>${DET.conf}%</span></div><p>Seen by ${DET.by} on thermal ${DET.age} ago, 14 m outside the fence line. ${DET.by} is holding over it at 45 m.</p>
  <div class="shot"><canvas id="detshot"></canvas></div><div class="btns"><span class="btn p">Send ${SEL.id}</span><span class="btn">Mark safe</span></div></div>
  ${extra}
  <div><h3 style="margin-bottom:4px">Activity</h3>
  <div class="act"><small>13:23:20</small><div>T-60M detected a person outside the north fence (89%)</div></div>
  <div class="act"><small>13:22:58</small><div>T-60M left the loop to track DET-01</div></div>
  <div class="act"><small>13:21:40</small><div>T-70M holding over Parking, 6 s</div></div>
  <div class="act"><small>13:19:02</small><div>T-80M passed North fence</div></div></div>`;

// ---- shared geometry -------------------------------------------------------------------------------
const rad = (d: number) => (d * Math.PI) / 180;
const groundAt = (x: number, y: number) => heightAt(x, y);
/** The camera's direction for an aircraft: heading clockwise from north (−y), pitch below the horizon. */
function camDir(c: Craft) { const h = rad(c.hdg), p = rad(c.pitch); return new THREE.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)); }
/** Where the camera's frame lands on the ground: near-left, near-right, far-right, far-left (map metres). */
function footprint(c: Craft, aspect = 16 / 9, maxM = 190): Pt[] {
  const o = new THREE.Vector3(c.x, groundAt(c.x, c.y) + c.alt, c.y), cam = new THREE.Object3D(); cam.position.copy(o); cam.lookAt(o.clone().add(camDir(c))); cam.updateMatrixWorld();
  // Object3D.lookAt points +z at the target; a camera looks down −z, so flip.
  cam.rotateY(Math.PI);
  const tv = Math.tan(rad(c.vfov / 2)), th = tv * aspect, gy = groundAt(c.x, c.y);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const d = new THREE.Vector3(sx * th, sy * tv, -1).applyQuaternion(cam.quaternion).normalize();
    let t = d.y < -1e-3 ? (gy - o.y) / d.y : Infinity; const horiz = Math.hypot(d.x, d.z);
    if (t * horiz > maxM) t = maxM / horiz;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  });
}

// ---- the venue in 3D, for every camera feed (and the overwatch stage) ------------------------------
function venue(photoSize: number) {
  const scene = new THREE.Scene();
  { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#8fb3d6'); gr.addColorStop(0.55, '#d9dfe2'); gr.addColorStop(0.8, '#efdcc4'); gr.addColorStop(1, '#f3d9b8'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.fog = new THREE.Fog(0xe8dccb, 260, 1150);
  scene.add(new THREE.HemisphereLight(0xcfe0f2, 0x8a7a60, 0.9));
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.6); sun.position.set(-260, 220, -140); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 900 }); sun.shadow.bias = -0.0005; scene.add(sun);
  const tex = new THREE.CanvasTexture(sitePhoto(photoSize)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const G = new THREE.PlaneGeometry(WORLD_M, WORLD_M, 260, 260).rotateX(-Math.PI / 2);
  { const a = G.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setY(i, heightAt(a.getX(i), a.getZ(i))); G.computeVertexNormals(); }
  const ground = new THREE.Mesh(G, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })); ground.receiveShadow = true; scene.add(ground);
  const at = (x: number, y: number, up = 0) => new THREE.Vector3(x, heightAt(x, y) + up, y);
  const wall = new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.85 });
  for (const s of SITE.structures) {
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
  // The perimeter fence: posts every 3 m and a see-through mesh panel.
  { const pts: THREE.Vector3[] = []; for (let i = 0; i < BOUND.length; i++) { const a = BOUND[i], b = BOUND[(i + 1) % BOUND.length], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3); for (let k = 0; k < n; k++) pts.push(at(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n)); }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x6b7178, metalness: 0.6, roughness: 0.4 }), pts.length); posts.castShadow = true;
    pts.forEach((p, i) => { m4.makeTranslation(p.x, p.y + 1.1, p.z); posts.setMatrixAt(i, m4); }); scene.add(posts);
    const pos: number[] = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + 2.1, b.z, a.x, a.y, a.z, b.x, b.y + 2.1, b.z, a.x, a.y + 2.1, a.z); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.computeVertexNormals();
    scene.add(new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0x8a9096, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))); }
  // People: crew around the stage and tents, and the one outside the north fence.
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.8 });
  const body = new THREE.CapsuleGeometry(0.28, 1.15, 4, 8);
  const people: THREE.Mesh[] = [];
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots: [number, number, number][] = [[60, -50, 9], [-140, 70, 7], [130, 52, 6], [-150, 112, 3], [-112, 96, 2]];
  for (const [cx, cy, n] of spots) for (let k = 0; k < n; k++) { const m = new THREE.Mesh(body, bodyMat); m.position.copy(at(cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 16, 0.85)); m.castShadow = true; scene.add(m); people.push(m); }
  const intruder = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.8 })); intruder.position.copy(at(DET.x, DET.y, 0.85)); intruder.castShadow = true; scene.add(intruder); people.push(intruder);
  // The fleet.
  const mats = droneMaterials(), blurTex = radialTexture();
  const models = CRAFT.map(c => {
    const d = buildDrone(mats, blurTex); d.group.position.copy(at(c.x, c.y, c.alt + (c.off ? 0.25 : 0))); d.group.rotation.y = -rad(c.hdg) + Math.PI / 2;
    d.blur.forEach(b => { b.visible = !c.off; }); d.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = !(m.material as THREE.Material).transparent; });
    scene.add(d.group); return d.group;
  });
  // The landing pad by the control tent.
  { const pad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.9 })); pad.position.copy(at(PAD.x, PAD.y, 0.05)); pad.receiveShadow = true; scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2c94c })); ring.position.copy(at(PAD.x, PAD.y, 0.08)); scene.add(ring); }
  return { scene, at, G, models, people, intruder };
}
type Venue = ReturnType<typeof venue>;

/** Render each aircraft's camera from the venue into its thumbnail (and the PiP and detection shot). */
function feeds(v: Venue, hide: THREE.Object3D[] = [], night = false) {
  const fw = 640, fh = 360;
  const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(fw, fh, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const cam = new THREE.PerspectiveCamera(40, fw / fh, 0.5, 2500);
  const shots: HTMLCanvasElement[] = [];
  hide.forEach(o => { o.visible = false; });
  const hotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  CRAFT.forEach((c, i) => {
    const out = document.createElement('canvas'); out.width = fw; out.height = fh; const g = out.getContext('2d')!;
    if (c.off) { g.fillStyle = '#05070a'; g.fillRect(0, 0, fw, fh); shots.push(out); return; }
    const thermal = c.mode === 'THERMAL' || night;
    v.models[i].visible = false;
    const saved = v.people.map(p => p.material);
    if (thermal) v.people.forEach(p => { p.material = hotMat; });
    cam.fov = c.vfov; cam.updateProjectionMatrix();
    const o = v.at(c.x, c.y, c.alt); cam.position.copy(o); cam.lookAt(o.clone().add(camDir(c)));
    r.render(v.scene, cam);
    g.filter = thermal ? (night ? 'grayscale(1) brightness(.8) contrast(1.45)' : 'grayscale(1) brightness(1.02) contrast(1.2)') : 'saturate(1.05)';
    g.drawImage(cv, 0, 0); g.filter = 'none';
    if (thermal) { const id = g.getImageData(0, 0, fw, fh), d = id.data; let s = 5; for (let k = 0; k < d.length; k += 4) { s = (s * 16807) % 2147483647; const n = (s / 2147483647 - 0.5) * 14; d[k] += n; d[k + 1] += n; d[k + 2] += n; } g.putImageData(id, 0, 0); }
    if (thermal) v.people.forEach((p, k) => { p.material = saved[k]; });
    v.models[i].visible = true;
    shots.push(out);
  });
  hide.forEach(o => { o.visible = true; });
  r.dispose();
  const put = (id: string, src: HTMLCanvasElement, crop?: [number, number, number, number]) => { const el = document.getElementById(id) as HTMLCanvasElement | null; if (!el) return;
    const bw = el.clientWidth * 2, bh = el.clientHeight * 2; el.width = bw; el.height = bh; const g = el.getContext('2d')!;
    const [sx, sy, sw, sh] = crop ?? (() => { const a = bw / bh, sa = fw / fh; return a > sa ? [0, (fh - fw / a) / 2, fw, fw / a] : [(fw - fh * a) / 2, 0, fh * a, fh]; })() as [number, number, number, number];
    g.drawImage(src, sx, sy, sw, sh, 0, 0, bw, bh); return g; };
  shots.forEach((s, i) => put(`th${i}`, s));
  put('pip', shots[0]);
  // The detection: T-60M's thermal frame with the lock box.
  const dg = put('detshot', shots[2], [120, 40, 400, 220]);
  if (dg) { const el = document.getElementById('detshot') as HTMLCanvasElement; dg.strokeStyle = '#ff5a4e'; dg.lineWidth = 3; const cx = el.width / 2, cy = el.height / 2; dg.strokeRect(cx - 26, cy - 34, 52, 68); dg.font = '600 18px "JetBrains Mono"'; dg.fillStyle = '#ff5a4e'; dg.fillText('PERSON 89%', cx + 34, cy - 20); }
  return shots;
}

// ---- 2D map helpers --------------------------------------------------------------------------------
function mapCanvas(view: { cx: number; cy: number; mpp: number }) {
  const host = document.getElementById('st')!, cv = document.createElement('canvas'); host.prepend(cv);
  const w = host.clientWidth, h = host.clientHeight, dpr = 2; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d')!; g.scale(dpr, dpr);
  const X = (x: number) => (x - view.cx) / view.mpp + w / 2, Y = (y: number) => (y - view.cy) / view.mpp + h / 2;
  const photo = (filter = '') => { const N = 4096, img = sitePhoto(N), k = N / WORLD_M;
    g.filter = filter || 'none'; g.drawImage(img, (view.cx - (w / 2) * view.mpp + WORLD_M / 2) * k, (view.cy - (h / 2) * view.mpp + WORLD_M / 2) * k, w * view.mpp * k, h * view.mpp * k, 0, 0, w, h); g.filter = 'none'; };
  const poly = (pts: Pt[], close = true) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); if (close) g.closePath(); };
  const pill = (x: number, y: number, text: string, sub: string | null, o: { bg?: string; fg?: string; sub?: string; ring?: string; align?: 'l' | 'c' } = {}) => {
    g.font = '600 12px Inter'; const tw = g.measureText(text).width; g.font = '500 11px Inter'; const sw = sub ? g.measureText(sub).width + 10 : 0;
    const bw = tw + sw + 18, bh = 24, bx = o.align === 'c' ? x - bw / 2 : x, by = y - bh / 2;
    g.fillStyle = o.bg ?? 'rgba(255,255,255,.94)'; g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = 8; g.shadowOffsetY = 2; g.beginPath(); g.roundRect(bx, by, bw, bh, 7); g.fill(); g.shadowColor = 'transparent';
    if (o.ring) { g.strokeStyle = o.ring; g.lineWidth = 1.5; g.stroke(); }
    g.fillStyle = o.fg ?? '#101820'; g.font = '600 12px Inter'; g.textBaseline = 'middle'; g.fillText(text, bx + 9, y + 0.5);
    if (sub) { g.fillStyle = o.sub ?? '#5b6676'; g.font = '500 11px Inter'; g.fillText(sub, bx + 9 + tw + 10, y + 0.5); }
    return { bx, by, bw, bh };
  };
  const scale = (fg = '#101820', bg = 'rgba(255,255,255,.9)') => { const m = 100, px = m / view.mpp; g.fillStyle = bg; g.beginPath(); g.roundRect(14, h - 40, px + 52, 26, 7); g.fill();
    g.strokeStyle = fg; g.lineWidth = 2; g.beginPath(); g.moveTo(24, h - 22); g.lineTo(24, h - 27 + 9); g.lineTo(24 + px, h - 18); g.lineTo(24 + px, h - 22); g.stroke(); g.fillStyle = fg; g.font = '600 11px Inter'; g.textBaseline = 'middle'; g.fillText('100 m', 30 + px, h - 25); };
  return { g, w, h, X, Y, photo, poly, pill, scale, host };
}
/** A top-down drone glyph: four rotor rings on an X, nose wedge forward. */
function droneGlyph(g: CanvasRenderingContext2D, x: number, y: number, hdg: number, col: string, size = 11, ring = '#fff') {
  g.save(); g.translate(x, y); g.rotate(rad(hdg));
  g.fillStyle = ring; g.beginPath(); g.arc(0, 0, size * 1.75, 0, Math.PI * 2); g.fill();
  g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-size * 0.75, -size * 0.75); g.lineTo(size * 0.75, size * 0.75); g.moveTo(size * 0.75, -size * 0.75); g.lineTo(-size * 0.75, size * 0.75); g.stroke();
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.arc(a * size * 0.75, b * size * 0.75, size * 0.36, 0, Math.PI * 2); g.lineWidth = 1.6; g.stroke(); }
  g.fillStyle = col; g.beginPath(); g.moveTo(0, -size * 1.45); g.lineTo(size * 0.4, -size * 0.85); g.lineTo(-size * 0.4, -size * 0.85); g.closePath(); g.fill();
  g.restore();
}
const VIEW = { cx: 70, cy: -2, mpp: 0.66 };
/** Where each checkpoint's label sits relative to its marker (px), clear of the aircraft and the PiP. */
const PLACE: Record<string, [number, number]> = { WP1: [-14, 18], WP2: [14, 0], WP3: [14, -16], WP4: [14, -16], WP5: [-24, 26] };
const TAG: Record<string, [number, number]> = { 'T-80M': [26, 0], 'T-70M': [24, -30], 'T-60M': [24, 22], 'T-50M': [26, 0] };
const routeLoop = (): Pt[] => ROUTE.map(w => ({ x: w.x, y: w.y }));

// ================================================================================================
// A. OPS MAP
// ================================================================================================
function ops() {
  page({ chip: 'Daylight · on the venue photo', rail: detectionRail(), stage: `<div class="ctl" style="top:14px;right:14px"><span class="on">Photo</span><span>Plan</span><span>3D</span></div>
    <div class="ctl" style="top:14px;left:14px"><span class="on">Fit venue</span><span>Follow ${SEL.id}</span></div>
    <div class="pip"><canvas id="pip"></canvas><b>${SEL.id} · CAMERA</b><em>RGB 4K · 60 m · gimbal −32°</em></div>` });
  const M = mapCanvas(VIEW), { g, X, Y } = M;
  M.photo('saturate(.8) brightness(1.04)');
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, M.w, M.h);
  // Outside the perimeter: dimmed, so the protected ground reads first.
  g.save(); g.beginPath(); g.rect(0, 0, M.w, M.h); M.poly(BOUND); g.fillStyle = 'rgba(16,24,32,.28)'; g.fill('evenodd'); g.restore();
  // Perimeter fence: white casing, dark line, posts.
  M.poly(BOUND); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 5; g.stroke(); M.poly(BOUND); g.strokeStyle = '#1d2733'; g.lineWidth = 1.6; g.setLineDash([7, 4]); g.stroke(); g.setLineDash([]);
  // Camera footprints: where each aircraft is looking, on the ground.
  for (const c of CRAFT) { if (c.off) continue; const f = footprint(c); M.poly(f);
    const sel = c === SEL, col = c.mode === 'THERMAL' ? '217,45,32' : '15,118,110';
    g.fillStyle = `rgba(${col},${sel ? 0.26 : 0.16})`; g.fill(); g.strokeStyle = `rgba(${col},.9)`; g.lineWidth = sel ? 2 : 1.3; g.stroke();
    g.beginPath(); g.moveTo(X(c.x), Y(c.y)); g.lineTo(X(f[2].x), Y(f[2].y)); g.moveTo(X(c.x), Y(c.y)); g.lineTo(X(f[3].x), Y(f[3].y)); g.strokeStyle = `rgba(${col},.45)`; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
  // Route: white casing, accent line, direction chevrons.
  M.poly(routeLoop()); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.lineJoin = 'round'; g.stroke();
  M.poly(routeLoop()); g.strokeStyle = '#0f766e'; g.lineWidth = 2.6; g.stroke();
  for (let i = 0; i < ROUTE.length; i++) { const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length]; for (const t of [0.35, 0.65]) { const x = X(a.x + (b.x - a.x) * t), y = Y(a.y + (b.y - a.y) * t), an = Math.atan2(Y(b.y) - Y(a.y), X(b.x) - X(a.x));
    g.save(); g.translate(x, y); g.rotate(an); g.fillStyle = '#0f766e'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-3, -4.5); g.lineTo(-1, 0); g.lineTo(-3, 4.5); g.closePath(); g.fill(); g.restore(); } }
  // Selected aircraft's leg to its next checkpoint.
  { const nx = ROUTE[3]; g.beginPath(); g.moveTo(X(SEL.x), Y(SEL.y)); g.lineTo(X(nx.x), Y(nx.y)); g.strokeStyle = '#f79009'; g.lineWidth = 2.4; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]); }
  // Checkpoints.
    ROUTE.forEach((w, i) => { const x = X(w.x), y = Y(w.y), next = i === 3;
    g.fillStyle = next ? '#f79009' : '#0f766e'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 11px Inter'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y + 0.5); g.textAlign = 'left';
    const [dx, dy] = PLACE[w.id]; const label = w.label, sub = `${w.alt} m · hold ${w.hold}s`;
    if (dx < 0) { g.font = '600 12px Inter'; const tw = g.measureText(label).width; g.font = '500 11px Inter'; const sw = g.measureText(sub).width; M.pill(x + dx - (tw + sw + 28), y + dy, label, sub, next ? { ring: '#f79009' } : {}); }
    else M.pill(x + dx, y + dy, label, sub, next ? { ring: '#f79009' } : {}); });
  // Detection: red pin with pulse rings and a label.
  { const x = X(DET.x), y = Y(DET.y); for (const r of [26, 17]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = `rgba(217,45,32,${r > 20 ? 0.35 : 0.6})`; g.lineWidth = 2; g.stroke(); }
    g.fillStyle = '#d92d20'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); g.stroke();
    M.pill(x - 190, y + 74, 'Person · 89%', 'outside fence · 0:42', { bg: '#d92d20', fg: '#fff', sub: 'rgba(255,255,255,.85)' }); }
  // Aircraft.
  for (const c of CRAFT) { const x = X(c.x), y = Y(c.y), col = c.off ? '#8b95a3' : c.mode === 'THERMAL' ? '#d92d20' : '#0f766e';
    if (c === SEL) { g.strokeStyle = '#101820'; g.lineWidth = 1.5; const s = 26; for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(x + a * s, y + b * (s - 8)); g.lineTo(x + a * s, y + b * s); g.lineTo(x + a * (s - 8), y + b * s); g.stroke(); } }
    droneGlyph(g, x, y, c.hdg, col, c === SEL ? 10 : 8.5);
    const sub = c.off ? 'on pad · 12%' : `${c.alt} m · ${c.kmh} km/h`;
    const [ox, oy] = TAG[c.id]; M.pill(x + ox, y + oy, c.id, sub, c === SEL ? { bg: '#101820', fg: '#fff', sub: 'rgba(255,255,255,.75)' } : {}); }
  M.scale();
  // North arrow.
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(M.w - 34, 76, 16, 0, Math.PI * 2); g.fill(); g.fillStyle = '#101820'; g.beginPath(); g.moveTo(M.w - 34, 64); g.lineTo(M.w - 29, 80); g.lineTo(M.w - 34, 77); g.lineTo(M.w - 39, 80); g.closePath(); g.fill(); g.font = '700 9px Inter'; g.textAlign = 'center'; g.fillText('N', M.w - 34, 86); g.textAlign = 'left';
  const v = venue(2048); feeds(v);
  done();
}

// ================================================================================================
// B. OVERWATCH (3D)
// ================================================================================================
function overwatch() {
  page({ chip: 'Daylight · 3D overwatch', rail: detectionRail(`<div class="note">The route flies at its real height. Each aircraft's camera casts its view onto the ground, so you can see what it sees and what nobody is watching.</div>`), stage: `<canvas id="cv"></canvas>
    <div class="ctl" style="top:14px;right:14px"><span class="on">Overwatch</span><span>Follow ${SEL.id}</span><span>Top-down</span></div>
    <div class="pip"><canvas id="pip"></canvas><b>${SEL.id} · CAMERA</b><em>RGB 4K · 60 m · gimbal −32°</em></div>` });
  const host = document.getElementById('st')!, cv = document.getElementById('cv') as HTMLCanvasElement;
  const w = host.clientWidth, h = host.clientHeight;
  const v = venue(4096), { scene, at } = v; scene.fog = new THREE.Fog(0xe8dccb, 700, 2600);
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); renderer.setSize(w, h); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.Scene().add(new THREE.HemisphereLight(0xdde8f4, 0x8a7a60, 3)) as THREE.Scene, 0.04).texture; scene.environmentIntensity = 0.5;
  const fx = new THREE.Group(); scene.add(fx);
  const TEAL = new THREE.Color(0.14, 0.95, 0.8), TEAL2 = new THREE.Color(0.04, 0.4, 0.34), RED = new THREE.Color(1.6, 0.22, 0.16);
  const glow = (c: THREE.Color, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material, closed = false) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.2), Math.max(16, pts.length * 12), r, 8, closed), mat); fx.add(m); return m; };
  const grad = (stops: [number, number][]) => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d')!; for (let y = 0; y < 128; y++) { const t = y / 127; let a = 0; for (let k = 0; k < stops.length - 1; k++) if (t >= stops[k][0] && t <= stops[k + 1][0]) a = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * ((t - stops[k][0]) / (stops[k + 1][0] - stops[k][0])); g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, y, 4, 1); } return new THREE.CanvasTexture(c); };
  // Geofence curtain: a glowing wall rising from the fence and fading upward.
  { const pos: number[] = [], uv: number[] = [], HH = 16; const pts: THREE.Vector3[] = [];
    for (let i = 0; i < BOUND.length; i++) { const a = BOUND[i], b = BOUND[(i + 1) % BOUND.length], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4); for (let k = 0; k < n; k++) pts.push(at(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n)); }
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + HH, b.z, a.x, a.y, a.z, b.x, b.y + HH, b.z, a.x, a.y + HH, a.z); uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = glow(new THREE.Color(0.06, 0.6, 0.5), 0.55); m.map = grad([[0, 0], [0.6, 0.1], [1, 0.75]]); fx.add(new THREE.Mesh(geo, m));
    tube([...pts, pts[0]], 0.35, glow(TEAL)); }
  // The route at its real height, with drop lines and ground rings at each checkpoint.
  const air = ROUTE.map(wp => at(wp.x, wp.y, wp.alt));
  tube(air, 0.7, glow(TEAL, 0.9), true); tube(air, 2.2, glow(TEAL2, 0.3), true);
  ROUTE.forEach((wp, i) => { const top = air[i], g0 = at(wp.x, wp.y, 0.4);
    tube([g0, top], 0.14, glow(TEAL, 0.5));
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6, 48).rotateX(-Math.PI / 2), glow(i === 3 ? new THREE.Color(2, 1.1, 0.2) : TEAL, 0.85)); ring.position.copy(g0); fx.add(ring);
    const node = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), glow(i === 3 ? new THREE.Color(2.4, 1.4, 0.3) : new THREE.Color(1, 2.2, 2))); node.position.copy(top); fx.add(node); });
  // The aircraft, scaled so they read at this distance, each with its camera cone to the ground.
  const K = 26;
  CRAFT.forEach((c, i) => { const m = v.models[i]; m.scale.setScalar(K); if (c.off) return;
    const top = at(c.x, c.y, c.alt), fp = footprint(c).map(p => at(p.x, p.y, 0.5)), col = c.mode === 'THERMAL' ? RED : TEAL;
    tube([at(c.x, c.y, 0.3), top], 0.08, glow(col, 0.35));
    const pos: number[] = []; for (let k = 0; k < 4; k++) { const a = fp[k], b = fp[(k + 1) % 4]; pos.push(top.x, top.y, top.z, a.x, a.y, a.z, b.x, b.y, b.z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fx.add(new THREE.Mesh(geo, glow(col, c === SEL ? 0.16 : 0.1)));
    const fg = new THREE.BufferGeometry().setFromPoints([fp[0], fp[1], fp[2], fp[0], fp[2], fp[3]]); fx.add(new THREE.Mesh(fg, glow(col, c === SEL ? 0.32 : 0.2)));
    tube([...fp, fp[0]], 0.3, glow(col, 0.95)); for (const p of fp) tube([top, p], 0.06, glow(col, 0.5)); });
  // The selected aircraft's leg to Backstage.
  tube([at(SEL.x, SEL.y, SEL.alt), air[3]], 0.35, glow(new THREE.Color(2.2, 1.2, 0.25), 0.9));
  // The detection: a red light column and rings.
  { const base = at(DET.x, DET.y, 0.3); const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 90, 24, 1, true), glow(RED, 0.8)); (col.material as THREE.MeshBasicMaterial).map = grad([[0, 0], [1, 0.8]]); col.position.copy(base).add(new THREE.Vector3(0, 45, 0)); fx.add(col);
    for (const r of [6, 11]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.8, 48).rotateX(-Math.PI / 2), glow(RED, r > 8 ? 0.5 : 0.95)); ring.position.copy(base); fx.add(ring); } }
  // Camera: high oblique from the south-west.
  const cam = new THREE.PerspectiveCamera(36, w / h, 1, 4000);
  const tgt = new THREE.Vector3(10, 0, -4), az = rad(-22), el = rad(40), dist = 520;
  cam.position.copy(tgt).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist)); cam.lookAt(tgt);
  const composer = new EffectComposer(renderer); composer.setPixelRatio(2); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, cam)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.45, 0.92)); composer.addPass(new OutputPass());
  composer.render();
  // Floating cards.
  const proj = (p: THREE.Vector3) => { const q = p.clone().project(cam); return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h }; };
  const card = (icon: string, t: string, sub: string, p: THREE.Vector3, lift = 40, bad = false) => { const s = proj(p); const e = document.createElement('div'); e.className = `card${bad ? ' bad' : ''}`; e.innerHTML = `<i>${icon}</i><div>${t}<small>${sub}</small></div>`; host.appendChild(e);
    e.style.left = `${s.x - e.offsetWidth / 2}px`; e.style.top = `${s.y - lift - e.offsetHeight}px`; e.style.setProperty('--lh', `${lift}px`); if (bad) e.style.setProperty('--lc', '#ff6b5e'); };
  card('➚', `${SEL.id} · to Backstage`, `${SEL.alt} m · ${SEL.kmh} km/h · ${SEL.batt}%`, at(SEL.x, SEL.y, SEL.alt + 6), 36);
  card('◎', 'T-70M · holding', 'Parking · 70 m', at(CRAFT[1].x, CRAFT[1].y, CRAFT[1].alt + 6), 30);
  card('!', 'Person · 89%', 'outside the north fence · T-60M', at(DET.x, DET.y, 90), 18, true);
  card('▲', 'Main gate', 'WP1 · hold 8 s', at(ROUTE[0].x, ROUTE[0].y, ROUTE[0].alt), 26);
  feeds(v, [fx]);
  done();
}

// ================================================================================================
// C. SECTOR WATCH
// ================================================================================================
const SECTORS: { name: string; x: number; y: number; ago: number }[] = [
  { name: 'Main gate', x: -165, y: 92, ago: 34 }, { name: 'West tree line', x: -205, y: -40, ago: 74 }, { name: 'Exhibition hall', x: -110, y: -60, ago: 132 },
  { name: 'North fence', x: -40, y: -140, ago: 18 }, { name: 'Main stage', x: 50, y: -40, ago: 51 }, { name: 'Backstage', x: 130, y: -112, ago: 205 },
  { name: 'East fence', x: 212, y: -30, ago: 268 }, { name: 'Food trucks', x: 120, y: 32, ago: 96 }, { name: 'Parking', x: 160, y: 112, ago: 6 },
  { name: 'Vendor tents', x: -125, y: 40, ago: 41 }, { name: 'South lawn', x: -30, y: 112, ago: 158 },
];
const freshCol = (s: number) => (s < 60 ? [18, 183, 106] : s < 180 ? [253, 176, 34] : [240, 68, 56]);
const agoText = (s: number) => (s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s ` : ''}ago`);
function sectors() {
  const stale = [...SECTORS].sort((a, b) => b.ago - a.ago);
  page({ chip: 'Daylight · sector watch', stage: `<div class="ctl" style="top:14px;right:14px"><span>Photo</span><span class="on">Sectors</span><span>3D</span></div>
    <div class="ctl" style="bottom:52px;left:14px;padding:7px 12px;gap:14px;font-size:12px;color:#4f5b69;align-items:center"><span style="padding:0;display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:#10b981;display:block"></i>Seen &lt; 1 min</span><span style="padding:0;display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:#f79009;display:block"></i>1–3 min</span><span style="padding:0;display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:#d92d20;display:block"></i>Over 3 min</span></div>
    <div class="pip"><canvas id="pip"></canvas><b>${SEL.id} · CAMERA</b><em>RGB 4K · 60 m · gimbal −32°</em></div>`,
  rail: `<div class="rtabs"><span>Aircraft</span><span>Route</span><span class="on">Sectors</span><span>Activity</span></div>
    <div><h3>Longest since seen</h3><div class="note" style="margin-top:3px">Every second a camera spends over a sector resets its clock. Send the nearest aircraft to whatever goes red.</div></div>
    <div>${stale.slice(0, 7).map(s => { const [r, g, b] = freshCol(s.ago); return `<div class="row" style="align-items:center"><div style="display:flex;align-items:center;gap:8px"><i style="width:10px;height:10px;border-radius:3px;background:rgb(${r},${g},${b});display:block"></i>${s.name}</div><b class="num" style="font-weight:600;${s.ago >= 180 ? 'color:var(--bad)' : ''}">${agoText(s.ago)}</b></div>`; }).join('')}</div>
    <div class="btns"><span class="btn p">Send T-70M</span><span class="btn">Re-plan loop</span></div>
    <div class="alert" style="margin-top:2px"><div class="t">Person · ${DET.where}<span>${DET.conf}%</span></div><p style="margin-bottom:0">T-60M is holding over it on thermal.</p></div>` });
  const M = mapCanvas(VIEW), { g, X, Y } = M;
  M.photo('grayscale(.9) brightness(1.2) contrast(.85)');
  g.save(); g.beginPath(); g.rect(0, 0, M.w, M.h); M.poly(BOUND); g.fillStyle = 'rgba(16,24,32,.3)'; g.fill('evenodd'); g.restore();
  // Sector tint: nearest seed inside the boundary, rasterised, with borders where the owner changes.
  { const sc = 2, cw = Math.ceil(M.w / sc), ch = Math.ceil(M.h / sc), own = new Int16Array(cw * ch).fill(-1);
    const mask = document.createElement('canvas'); mask.width = cw; mask.height = ch; const mg = mask.getContext('2d')!; mg.beginPath(); BOUND.forEach((p, i) => (i ? mg.lineTo(X(p.x) / sc, Y(p.y) / sc) : mg.moveTo(X(p.x) / sc, Y(p.y) / sc))); mg.closePath(); mg.fill();
    const md = mg.getImageData(0, 0, cw, ch).data;
    const inv = (px: number, py: number) => ({ x: (px * sc - M.w / 2) * VIEW.mpp + VIEW.cx, y: (py * sc - M.h / 2) * VIEW.mpp + VIEW.cy });
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { if (md[(j * cw + i) * 4 + 3] < 128) continue; const p = inv(i, j); let best = 0, bd = Infinity; SECTORS.forEach((s, k) => { const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; best = k; } }); own[j * cw + i] = best; }
    const tc = document.createElement('canvas'); tc.width = cw; tc.height = ch; const tg = tc.getContext('2d')!; const id = tg.createImageData(cw, ch);
    for (let k = 0; k < own.length; k++) { const o = own[k]; if (o < 0) continue; const [r, gg, b] = freshCol(SECTORS[o].ago); const i = k % cw, j = (k / cw) | 0;
      const edge = (i > 0 && own[k - 1] !== o) || (i < cw - 1 && own[k + 1] !== o) || (j > 0 && own[k - cw] !== o) || (j < ch - 1 && own[k + cw] !== o);
      id.data[k * 4] = edge ? 255 : r; id.data[k * 4 + 1] = edge ? 255 : gg; id.data[k * 4 + 2] = edge ? 255 : b; id.data[k * 4 + 3] = edge ? 230 : (SECTORS[o].ago >= 180 ? 92 : SECTORS[o].ago >= 60 ? 84 : 70); }
    tg.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(tc, 0, 0, M.w, M.h); }
  M.poly(BOUND); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
  // Footprints in white: what is being refreshed right now.
  for (const c of CRAFT) { if (c.off) continue; const f = footprint(c); M.poly(f); g.fillStyle = 'rgba(255,255,255,.28)'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.setLineDash([5, 3]); g.stroke(); g.setLineDash([]); }
  M.poly(routeLoop()); g.strokeStyle = 'rgba(16,24,32,.55)'; g.lineWidth = 1.5; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
  for (const c of CRAFT) droneGlyph(g, X(c.x), Y(c.y), c.hdg, c.off ? '#8b95a3' : '#101820', 7.5);
  // Sector labels.
  for (const s of SECTORS) { const [r, gg, b] = freshCol(s.ago); M.pill(X(s.x), Y(s.y), s.name, agoText(s.ago), { align: 'c', ring: `rgb(${r},${gg},${b})`, sub: s.ago >= 180 ? '#d92d20' : '#5b6676' }); }
  { const x = X(DET.x), y = Y(DET.y); g.fillStyle = '#d92d20'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.stroke(); }
  M.scale();
  const v = venue(2048); feeds(v);
  done();
}

// ================================================================================================
// D. NIGHT WATCH
// ================================================================================================
function night() {
  page({ dark: true, chip: 'Night protocol · thermal on all aircraft', rail: detectionRail(), stage: `<div class="ctl" style="top:14px;right:14px"><span class="on">Thermal</span><span>Plan</span><span>3D</span></div>
    <div class="pip"><canvas id="pip"></canvas><b>${SEL.id} · THERMAL</b><em>white hot · 60 m · gimbal −32°</em></div>` });
  const M = mapCanvas(VIEW), { g, X, Y } = M;
  // The venue as a thermal mosaic: luminance only, dark; tarmac and roofs hold the day's heat.
  M.photo('grayscale(1) brightness(.38) contrast(1.5)');
  { const P = SITE.parking; g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(X(P.x0), Y(P.y0), (P.x1 - P.x0) / VIEW.mpp, (P.y1 - P.y0) / VIEW.mpp);
    for (const s of SITE.structures) { g.fillStyle = s.kind === 'truck' ? 'rgba(255,255,255,.75)' : s.kind === 'stage' ? 'rgba(255,255,255,.32)' : 'rgba(255,255,255,.14)'; g.fillRect(X(s.x - s.w / 2), Y(s.y - s.d / 2), s.w / VIEW.mpp, s.d / VIEW.mpp); }
    let seed = 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const car of PARKED_CARS) if (rnd() < 0.12) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(X(car.x + 0.4), Y(car.y + 0.5), 3, 6.6); }
    // Crew: small warm bodies around the stage, tents and gate.
    const spots: [number, number, number][] = [[60, -50, 9], [-140, 70, 7], [130, 52, 6], [-150, 112, 3], [-112, 96, 2]];
    for (const [cx, cy, n] of spots) for (let k = 0; k < n; k++) { const x = X(cx + (rnd() - 0.5) * 30), y = Y(cy + (rnd() - 0.5) * 16); const gr = g.createRadialGradient(x, y, 0, x, y, 5); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); } }
  g.save(); g.beginPath(); g.rect(0, 0, M.w, M.h); M.poly(BOUND); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill('evenodd'); g.restore();
  M.poly(BOUND); g.strokeStyle = 'rgba(45,212,191,.9)'; g.lineWidth = 1.8; g.setLineDash([7, 4]); g.stroke(); g.setLineDash([]);
  for (const c of CRAFT) { if (c.off) continue; const f = footprint(c); M.poly(f); g.fillStyle = c === SEL ? 'rgba(45,212,191,.16)' : 'rgba(45,212,191,.09)'; g.fill(); g.strokeStyle = 'rgba(45,212,191,.85)'; g.lineWidth = c === SEL ? 1.8 : 1.1; g.stroke(); }
  M.poly(routeLoop()); g.shadowColor = 'rgba(45,212,191,.8)'; g.shadowBlur = 8; g.strokeStyle = '#2dd4bf'; g.lineWidth = 2.2; g.stroke(); g.shadowBlur = 0;
  { const nx = ROUTE[3]; g.beginPath(); g.moveTo(X(SEL.x), Y(SEL.y)); g.lineTo(X(nx.x), Y(nx.y)); g.strokeStyle = '#fdb022'; g.lineWidth = 2; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]); }
  const dk = { bg: 'rgba(12,18,26,.9)', fg: '#e8eef5', sub: '#8fa3b8' };
  ROUTE.forEach((w, i) => { const x = X(w.x), y = Y(w.y), next = i === 3; g.fillStyle = next ? '#fdb022' : '#0b0f14'; g.strokeStyle = next ? '#fdb022' : '#2dd4bf'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = next ? '#0b0f14' : '#2dd4bf'; g.font = '700 10.5px Inter'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y + 0.5); g.textAlign = 'left';
    const [dx, dy] = PLACE[w.id]; if (dx < 0) { g.font = '600 12px Inter'; M.pill(x + dx - g.measureText(w.label).width - 18, y + dy, w.label, null, dk); } else M.pill(x + dx, y + dy, w.label, null, dk); });
  // The intruder: the hottest thing on the map.
  { const x = X(DET.x), y = Y(DET.y); const gr = g.createRadialGradient(x, y, 0, x, y, 12); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ff6b5e'; g.lineWidth = 2; g.strokeRect(x - 14, y - 14, 28, 28); for (const r of [24, 34]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = `rgba(255,107,94,${r > 30 ? 0.3 : 0.55})`; g.stroke(); }
    M.pill(x - 190, y + 74, 'Person · 89%', 'outside fence · 0:42', { bg: '#d92d20', fg: '#fff', sub: 'rgba(255,255,255,.85)' }); }
  for (const c of CRAFT) { const x = X(c.x), y = Y(c.y); droneGlyph(g, x, y, c.hdg, c.off ? '#64748b' : '#2dd4bf', c === SEL ? 10 : 8.5, '#0b0f14');
    const [ox, oy] = TAG[c.id]; M.pill(x + ox, y + oy, c.id, c.off ? 'on pad · 12%' : `${c.alt} m · ${c.kmh} km/h`, c === SEL ? { bg: '#2dd4bf', fg: '#0b0f14', sub: 'rgba(11,15,20,.7)' } : dk); }
  M.scale('#e8eef5', 'rgba(12,18,26,.9)');
  const v = venue(2048); feeds(v, [], true);
  done();
}

Promise.all(['400 10px Inter', '500 10px Inter', '600 10px Inter', '700 10px Inter', '500 10px "JetBrains Mono"', '600 10px "JetBrains Mono"'].map(f => document.fonts.load(f))).catch(() => undefined).then(() => ({ ops, overwatch, sectors, night })[C]());
