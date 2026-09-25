import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { SITE, TREES, WORLD_M, SITE_DATUM_M, heightAt, surfaceAt, siteImagery } from '../../survey/site';
import { toLatLon, pointInPolygon, type Pt, type GeoOrigin } from '../../survey/plan';
import type { Annotation, AreaMeasure, LineMeasure } from '../../survey/measure';
import { release3d } from '../../lib/release3d';

/**
 * The finished survey: the textured site model (orthophoto on the terrain, the
 * structures standing on it) or its elevation, with contours, and the crew's
 * measurements drawn where they were taken.
 *
 *   Volume  curtain walls from the base up to the ground along the boundary, and
 *           the ground inside coloured by cut (above the base) and fill (below).
 *   Grade   the line on the ground, raised markers over each corner, and every
 *           segment's grade as a label; segments over the route's limit say so.
 *   Height  a pin with the elevation.
 *
 * Colour: elevation is one sequential blue ramp (dark low → light high); cut/fill
 * is a diverging pair, red cut / blue fill round a grey midpoint, brighter with
 * magnitude on this dark model. Both validated with the dataviz checks.
 * Elevations read above sea level (the survey datum).
 */

export type ResultsLayer = 'PHOTO' | 'ELEVATION';
export type Tool = 'LINE' | 'AREA' | 'POINT' | null;
export type Measured = { a: Annotation; line?: LineMeasure; area?: AreaMeasure };

interface Props {
  items: Measured[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  layer: ResultsLayer;
  contours: boolean;
  tool: Tool;
  draft: Pt[];
  onPick: (p: Pt) => void;
  onFinish: () => void;
  origin: GeoOrigin;
  /** Changes to this ask the camera to frame an annotation. */
  focus: { id: string; seq: number } | null;
}

const ELEV_RAMP = ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#9ec5f4', '#cde2fb'];
const CUT = ['#b3342b', '#e0604f', '#f0a79a'], FILL = ['#1c5cab', '#3987e5', '#86b6ef'], MID = '#383835';
const ACCENT = '#fb923c';
const CELL = 1.5;

const hex = (h: string) => new THREE.Color(h);
function ramp(stops: string[], t: number, out: THREE.Color) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
  return out.copy(hex(stops[i])).lerp(hex(stops[i + 1]), x - i);
}
/** Diverging cut/fill colour for a height above (+) or below (−) the base, `k` the magnitude at full colour. */
function cutFill(dz: number, k: number, out: THREE.Color) {
  const t = Math.min(1, Math.abs(dz) / k);
  if (t < 0.04) return out.copy(hex(MID));
  return out.copy(hex(MID)).lerp(ramp(dz > 0 ? CUT : FILL, t, new THREE.Color()), Math.min(1, t * 3));
}

const TERRAIN_VS = /* glsl */ `
  varying vec3 vWorld; varying vec2 vUv;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TERRAIN_FS = /* glsl */ `
  uniform sampler2D uMap; uniform float uMode; uniform float uContours; uniform float uInterval;
  uniform float uZmin; uniform float uZmax; uniform vec3 uRamp[6];
  varying vec3 vWorld; varying vec2 vUv;
  vec3 rampAt(float t) { t = clamp(t, 0.0, 1.0) * 5.0; int i = int(min(floor(t), 4.0)); float f = t - float(i);
    vec3 a = uRamp[0], b = uRamp[1];
    for (int k = 0; k < 5; k++) { if (k == i) { a = uRamp[k]; b = uRamp[k + 1]; } }
    return mix(a, b, f); }
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float shade = 0.62 + 0.5 * max(dot(n, normalize(vec3(-0.55, 0.75, -0.35))), 0.0);
    vec3 col = uMode < 0.5 ? texture2D(uMap, vUv).rgb * (0.78 + 0.32 * shade) : rampAt((vWorld.y - uZmin) / max(0.01, uZmax - uZmin)) * shade;
    if (uContours > 0.5) {
      float h = vWorld.y / uInterval;
      float minor = 1.0 - min(abs(fract(h - 0.5) - 0.5) / fwidth(h), 1.0);
      float h5 = h / 5.0;
      float major = 1.0 - min(abs(fract(h5 - 0.5) - 0.5) / fwidth(h5), 1.0);
      col = mix(col, vec3(1.0), minor * 0.28 + major * 0.5);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export const SurveyResultsViewer: React.FC<Props> = (props) => {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props); propsRef.current = props;
  const api = useRef<{ rebuild: () => void; setLayer: () => void; frame: (id: string) => void; dirty: () => void } | null>(null);
  const [hover, setHover] = useState<{ z: number; lat: number; lon: number } | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 1]);

  useEffect(() => {
    const el = host.current, lab = labels.current; if (!el || !lab) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0f14');
    scene.fog = new THREE.Fog('#0b0f14', 700, 1400);
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 1, 3000);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f24, 1.1));
    const sun = new THREE.DirectionalLight(0xfff4e2, 1.6); sun.position.set(-300, 400, -200); scene.add(sun);

    // ---- terrain: the site plus a margin, at 1.5 m ----
    const xs = SITE.boundary.map(p => p.x), ys = SITE.boundary.map(p => p.y);
    const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70, y0 = Math.min(...ys) - 70, y1 = Math.max(...ys) + 70;
    const W = x1 - x0, D = y1 - y0, sx = Math.round(W / CELL), sy = Math.round(D / CELL);
    const geo = new THREE.PlaneGeometry(W, D, sx, sy); geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, 0, (y0 + y1) / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
    const inside: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getZ(i), z = heightAt(x, y);
      pos.setY(i, z); uv.setXY(i, (x + WORLD_M / 2) / WORLD_M, 1 - (y + WORLD_M / 2) / WORLD_M);
      if (pointInPolygon({ x, y }, SITE.boundary)) inside.push(z);
    }
    // The ramp spans the site's own ground (2nd–98th percentile), so its relief reads; hills and roofs beyond clamp to the ends.
    inside.sort((a, b) => a - b);
    const zmin = inside[Math.floor(inside.length * 0.02)], zmax = Math.max(zmin + 1, inside[Math.floor(inside.length * 0.98)]);
    setRange([zmin + SITE_DATUM_M, zmax + SITE_DATUM_M]);
    const map = new THREE.CanvasTexture(siteImagery(2048)); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const uniforms = {
      uMap: { value: map }, uMode: { value: 0 }, uContours: { value: 0 }, uInterval: { value: 0.5 },
      uZmin: { value: zmin }, uZmax: { value: zmax }, uRamp: { value: ELEV_RAMP.map(h => hex(h)) },
    };
    const terrain = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, uniforms }));
    scene.add(terrain);

    // ---- structures and trees, as the processed model shows them ----
    const struct = new THREE.Group(); scene.add(struct);
    const elevMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const structMats: { m: THREE.MeshStandardMaterial; photo: THREE.Color; elev: THREE.Color }[] = [];
    for (const s of SITE.structures) {
      const gy = heightAt(s.x, s.y), top = gy + s.h;
      const photo = hex(s.roof), elev = ramp(ELEV_RAMP, (top - zmin) / (zmax - zmin), new THREE.Color());
      const m = new THREE.MeshStandardMaterial({ color: photo.clone(), roughness: 0.8, metalness: 0.05 });
      structMats.push({ m, photo, elev });
      const box = new THREE.Mesh(s.kind === 'tent' ? new THREE.ConeGeometry(s.w * 0.72, s.h, 4) : new THREE.BoxGeometry(s.w, s.h, s.d), m);
      box.position.set(s.x, gy - 0.5 + s.h / 2 + 0.5, s.y); if (s.kind === 'tent') box.rotation.y = Math.PI / 4;
      struct.add(box);
    }
    const treeGeo = new THREE.ConeGeometry(1, 1, 7); treeGeo.translate(0, 0.5, 0);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: '#27432a', roughness: 1 }), TREES.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    TREES.forEach((t, i) => trees.setMatrixAt(i, m4.compose(v3.set(t.x, heightAt(t.x, t.y), t.y), q, s3.set(t.r, t.r * 2.4, t.r))));
    scene.add(trees); void elevMat;

    // ---- annotations ----
    const annot = new THREE.Group(); scene.add(annot);
    const fatMats: LineMaterial[] = [];
    const fat = (pts: THREE.Vector3[], color: string, width: number, opacity = 1, dashed = false) => {
      const g = new LineGeometry(); g.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
      const m = new LineMaterial({ color: hex(color).getHex(), linewidth: width, transparent: opacity < 1, opacity, dashed, dashSize: 3, gapSize: 2, depthTest: true });
      m.resolution.set(el.clientWidth || 1, el.clientHeight || 1); fatMats.push(m);
      const l = new Line2(g, m); if (dashed) l.computeLineDistances(); return l;
    };
    const ground = (x: number, y: number, lift = 0.25) => new THREE.Vector3(x, surfaceAt(x, y) + lift, y);
    const along = (a: Pt, b: Pt, step: number, lift = 0.25) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)); return Array.from({ length: n + 1 }, (_, k) => ground(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, lift)); };
    /** `pri`: when labels collide on screen the higher one stays (names, then over-limit grades, then grades). */
    type Label = { el: HTMLDivElement; at: THREE.Vector3; pri: number };
    let labelEls: Label[] = [];
    const addLabel = (at: THREE.Vector3, html: string, cls: string, pri = 1) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; lab.appendChild(d); labelEls.push({ el: d, at, pri }); labelEls.sort((x, y) => y.pri - x.pri); };

    const rebuild = () => {
      const P = propsRef.current;
      for (const c of [...annot.children]) { annot.remove(c); c.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); }
      fatMats.length = 0; lab.innerHTML = ''; labelEls = [];
      for (const it of P.items) {
        const { a } = it; if (!a.visible) continue;
        const sel = a.id === P.selectedId;
        if (a.kind === 'AREA' && it.area) {
          const A = it.area, g = A.grid;
          // Cut/fill heatmap, draped just above the ground.
          const step = Math.max(1, Math.ceil(Math.max(g.cols, g.rows) / 180));
          const cw = Math.ceil(g.cols / step), ch = Math.ceil(g.rows / step);
          const hg = new THREE.PlaneGeometry(cw * g.cellM * step, ch * g.cellM * step, cw, ch); hg.rotateX(-Math.PI / 2);
          hg.translate(g.x0 + (cw * g.cellM * step) / 2, 0, g.y0 + (ch * g.cellM * step) / 2);
          const hp = hg.attributes.position as THREE.BufferAttribute, cols = new Float32Array(hp.count * 4), c = new THREE.Color();
          let k = 0.05; for (let i = 0; i < g.dz.length; i++) if (!Number.isNaN(g.dz[i])) k = Math.max(k, Math.abs(g.dz[i]));
          k *= 0.85;
          for (let i = 0; i < hp.count; i++) {
            const x = hp.getX(i), y = hp.getZ(i);
            const cc = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x0) / g.cellM))), rr = Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.y0) / g.cellM)));
            const dz = g.dz[rr * g.cols + cc];
            hp.setY(i, surfaceAt(x, y) + 0.12);
            if (Number.isNaN(dz)) { cols[i * 4 + 3] = 0; continue; }
            cutFill(dz, k, c); cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = sel ? 0.8 : 0.6;
          }
          hg.setAttribute('color', new THREE.BufferAttribute(cols, 4));
          annot.add(new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })));
          // Curtain walls from the base up to the ground along the boundary.
          const ring = [...a.pts, a.pts[0]];
          const wallPos: number[] = [], top: THREE.Vector3[] = [], bottom: THREE.Vector3[] = [];
          for (let i = 0; i + 1 < ring.length; i++) {
            const pts = along(ring[i], ring[i + 1], 1.5, 0);
            for (let j = 0; j < pts.length; j++) {
              const p = pts[j], b = A.base(p.x, p.z);
              if (i + 1 < ring.length && j < pts.length - 1) {
                const n = pts[j + 1], bn = A.base(n.x, n.z);
                wallPos.push(p.x, b, p.z, n.x, bn, n.z, n.x, n.y, n.z, p.x, b, p.z, n.x, n.y, n.z, p.x, p.y, p.z);
              }
              top.push(new THREE.Vector3(p.x, p.y + 0.15, p.z)); bottom.push(new THREE.Vector3(p.x, b, p.z));
            }
          }
          const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
          annot.add(new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: sel ? 0.16 : 0.08, side: THREE.DoubleSide, depthWrite: false })));
          annot.add(fat(top, '#ffffff', sel ? 2.5 : 1.6), fat(bottom, '#ffffff', 1.2, 0.8));
          for (const p of a.pts) { const g0 = surfaceAt(p.x, p.y), b = A.base(p.x, p.y); annot.add(fat([new THREE.Vector3(p.x, Math.min(g0, b), p.y), new THREE.Vector3(p.x, Math.max(g0, b) + 0.15, p.y)], '#ffffff', 1.2, 0.9)); }
          const cx = a.pts.reduce((s, p) => s + p.x, 0) / a.pts.length, cy = a.pts.reduce((s, p) => s + p.y, 0) / a.pts.length;
          addLabel(new THREE.Vector3(cx, A.elevMax + 4, cy), a.name, `rv-label${sel ? ' rv-sel' : ''}`, 3);
        } else if (a.kind === 'LINE' && it.line && a.pts.length > 1) {
          const L = it.line, lift = 9;
          const path: THREE.Vector3[] = [];
          for (let i = 0; i + 1 < a.pts.length; i++) path.push(...along(a.pts[i], a.pts[i + 1], 1, 0.3).slice(i ? 1 : 0));
          annot.add(fat(path, ACCENT, sel ? 3.5 : 2.5));
          const raised = a.pts.map(p => ground(p.x, p.y, lift));
          annot.add(fat(raised, '#ffffff', sel ? 2 : 1.4, 0.95));
          a.pts.forEach(p => annot.add(fat([ground(p.x, p.y, 0.3), ground(p.x, p.y, lift)], '#ffffff', 1.2, 0.85)));
          L.segments.forEach((s, i) => {
            const mid = raised[i].clone().lerp(raised[i + 1], 0.5).add(new THREE.Vector3(0, 1.2, 0));
            const over = a.limitPct !== undefined && Math.abs(s.gradePct) > a.limitPct;
            addLabel(mid, `${over ? '<span aria-hidden="true">▲</span> ' : ''}${Math.abs(s.gradePct).toFixed(1)} %`, `rv-grade${over ? ' rv-over' : ''}${sel ? ' rv-sel' : ''}`, over ? 2 : 1);
          });
          addLabel(ground(a.pts[0].x, a.pts[0].y, lift + 4), a.name, `rv-label${sel ? ' rv-sel' : ''}`, 3);
        } else if (a.kind === 'POINT' && a.pts[0]) {
          const p = a.pts[0], z = surfaceAt(p.x, p.y);
          annot.add(fat([new THREE.Vector3(p.x, z, p.y), new THREE.Vector3(p.x, z + 8, p.y)], ACCENT, 2.5));
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false })); dot.position.set(p.x, z + 0.4, p.y); annot.add(dot);
          addLabel(new THREE.Vector3(p.x, z + 10, p.y), `${a.name}<br><b>${(z + SITE_DATUM_M).toFixed(2)} m</b>`, `rv-label${sel ? ' rv-sel' : ''}`);
        }
      }
      // Draft: the points placed so far.
      const dr = P.draft;
      if (dr.length) {
        const pts = dr.map(p => ground(p.x, p.y, 0.5));
        if (P.tool === 'AREA' && dr.length > 2) pts.push(pts[0].clone());
        if (pts.length > 1) annot.add(fat(pts, '#fde68a', 2.5));
        for (const p of pts) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), new THREE.MeshBasicMaterial({ color: '#fde68a', toneMapped: false })); d.position.copy(p); annot.add(d); }
      }
      dirty = true;
    };

    const setLayer = () => {
      const P = propsRef.current;
      uniforms.uMode.value = P.layer === 'ELEVATION' ? 1 : 0;
      uniforms.uContours.value = P.contours ? 1 : 0;
      for (const s of structMats) s.m.color.copy(P.layer === 'ELEVATION' ? s.elev : s.photo);
      dirty = true;
    };

    // ---- camera: orbit round a target ----
    const orbit = { theta: -2.2, phi: 0.95, radius: 520, target: new THREE.Vector3((x0 + x1) / 2, 0, (y0 + y1) / 2) };
    const goal = { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.clone() };
    const frame = (id: string) => {
      const it = propsRef.current.items.find(i => i.a.id === id); if (!it) return;
      const pts = it.a.pts; const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const ext = Math.max(20, ...pts.map(p => Math.hypot(p.x - cx, p.y - cy)));
      goal.target.set(cx, surfaceAt(cx, cy), cy); goal.radius = ext * 3.2 + 30; goal.phi = 0.9;
    };
    let dirty = true;
    const size = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      fatMats.forEach(m => m.resolution.set(w, h)); dirty = true;
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);

    // ---- input ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e: { clientX: number; clientY: number }): Pt | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObject(terrain, false)[0];
      return hit ? { x: hit.point.x, y: hit.point.z } : null;
    };
    let drag: { x: number; y: number; moved: number; pan: boolean } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey }; renderer.domElement.setPointerCapture(e.pointerId); };
    let hoverT = 0;
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.pan) {
          const k = goal.radius * 0.0016, c = Math.cos(goal.theta), s = Math.sin(goal.theta);
          goal.target.x += (-dx * s - dy * c) * k * -1; goal.target.z += (dx * c - dy * s) * k * -1;
        } else { goal.theta -= dx * 0.005; goal.phi = Math.max(0.12, Math.min(1.45, goal.phi - dy * 0.005)); }
        return;
      }
      const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
      const p = pick(e);
      if (p) { const ll = toLatLon(propsRef.current.origin, p); setHover({ z: surfaceAt(p.x, p.y) + SITE_DATUM_M, lat: ll.lat, lon: ll.lon }); } else setHover(null);
    };
    const up = (e: PointerEvent) => {
      const d = drag; drag = null;
      if (d && d.moved < 5 && propsRef.current.tool) { const p = pick(e); if (p) propsRef.current.onPick(p); }
    };
    const dbl = () => { if (propsRef.current.tool) propsRef.current.onFinish(); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); goal.radius = Math.max(25, Math.min(1400, goal.radius * Math.exp(e.deltaY * 0.0012))); };
    const ctx = (e: Event) => e.preventDefault();
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
    cv.addEventListener('dblclick', dbl); cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('contextmenu', ctx);

    // ---- render on demand ----
    let raf = 0; const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = 0.14; let moving = false;
      for (const key of ['theta', 'phi', 'radius'] as const) { const dlt = goal[key] - orbit[key]; if (Math.abs(dlt) > 1e-4 * (key === 'radius' ? 100 : 1)) { orbit[key] += dlt * k; moving = true; } }
      if (orbit.target.distanceToSquared(goal.target) > 1e-4) { orbit.target.lerp(goal.target, k); moving = true; }
      if (!moving && !dirty) return;
      dirty = false;
      cam.position.set(orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta), orbit.target.y + orbit.radius * Math.cos(orbit.phi), orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta));
      cam.lookAt(orbit.target);
      renderer.render(scene, cam);
      const w = el.clientWidth, h = el.clientHeight;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const L of labelEls) {
        v.copy(L.at).project(cam);
        const px = ((v.x + 1) / 2) * w, py = ((1 - v.y) / 2) * h;
        const bw = L.el.offsetWidth || 60, bh = L.el.offsetHeight || 18, box = { x: px - bw / 2 - 3, y: py - bh - 3, w: bw + 6, h: bh + 6 };
        const clash = placed.some(b => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h);
        const hidden = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1 || clash;
        L.el.style.display = hidden ? 'none' : '';
        if (!hidden) { placed.push(box); L.el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`; }
      }
    };
    raf = requestAnimationFrame(loop);

    api.current = { rebuild, setLayer, frame, dirty: () => { dirty = true; } };
    setLayer(); rebuild();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up);
      cv.removeEventListener('dblclick', dbl); cv.removeEventListener('wheel', wheel); cv.removeEventListener('contextmenu', ctx);
      api.current = null; lab.innerHTML = '';
      release3d(scene, renderer, null, [map]);
      renderer.domElement.remove();
    };
  }, []);

  const P = props;
  const key = JSON.stringify([P.items.map(i => [i.a.id, i.a.name, i.a.visible, i.a.pts.length, i.a.base, i.a.limitPct, i.area?.cutM3, i.line?.surfaceM]), P.selectedId, P.draft, P.tool]);
  useEffect(() => { api.current?.rebuild(); }, [key]);
  useEffect(() => { api.current?.setLayer(); }, [P.layer, P.contours]);
  useEffect(() => { if (P.focus) api.current?.frame(P.focus.id); }, [P.focus]);

  return (
    <div className="absolute inset-0">
      <div ref={host} className={`absolute inset-0 ${P.tool ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} role="img"
        aria-label={`Survey results model, ${P.layer === 'ELEVATION' ? 'elevation' : 'orthophoto'} layer, ${P.items.filter(i => i.a.visible).length} measurements shown`} />
      <div ref={labels} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden />
      {/* Legend: elevation ramp, or cut/fill when a volume is shown */}
      <div className="absolute left-3 bottom-3 flex flex-col gap-2 pointer-events-none">
        {P.layer === 'ELEVATION' && (
          <div className="rounded-lg bg-black/60 backdrop-blur px-2.5 py-2 text-[11px] text-white/85">
            <div className="font-medium text-white">Elevation</div>
            <div className="mt-1 h-2 w-40 rounded-sm" style={{ background: `linear-gradient(90deg, ${ELEV_RAMP.join(',')})` }} />
            <div className="mt-0.5 flex justify-between num"><span>{range[0].toFixed(1)} m</span><span>{range[1].toFixed(1)} m</span></div>
          </div>
        )}
        {P.items.some(i => i.a.visible && i.a.kind === 'AREA') && (
          <div className="rounded-lg bg-black/60 backdrop-blur px-2.5 py-2 text-[11px] text-white/85 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: CUT[1] }} />Cut · above base</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: FILL[1] }} />Fill · below base</span>
          </div>
        )}
      </div>
      <div className="absolute right-3 bottom-3 rounded-lg bg-black/60 backdrop-blur px-2.5 py-1 text-[11px] text-white/80 num pointer-events-none min-w-[220px] text-right">
        {hover ? <>Elv {hover.z.toFixed(2)} m · {hover.lat.toFixed(6)}, {hover.lon.toFixed(6)}</> : 'Drag to orbit · shift-drag to pan · scroll to zoom'}
      </div>
      <style>{`
        .rv-label { position:absolute; left:0; top:0; white-space:nowrap; font: 500 11px Inter, system-ui, sans-serif; color:#fff; background:rgba(8,11,16,0.72); padding:2px 7px; border-radius:6px; }
        .rv-grade { position:absolute; left:0; top:0; white-space:nowrap; font: 600 12px Inter, system-ui, sans-serif; color:#fff; background:rgba(8,11,16,0.8); padding:2px 6px; border-radius:5px; border:1px solid rgba(255,255,255,0.25); }
        .rv-over { border-color:#fab219; color:#ffe2a8; }
        .rv-sel { outline: 1px solid rgba(251,146,60,0.9); }
      `}</style>
    </div>
  );
};
