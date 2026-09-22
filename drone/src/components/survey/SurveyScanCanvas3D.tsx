import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCcw } from 'lucide-react';
import { SITE, TREES, WORLD_M, heightAt, siteImagery } from '../../survey/site';
import { GOOD_VIEWS, type CoverageGrid, type Leg, type SurveyPlan } from '../../survey/plan';
import type { Photo, SurveyAircraft, Phase } from '../../hooks/useSurveyMission';

/**
 * The survey stage: the venue being scanned, in 3D.
 *
 * Unscanned ground is a dim wireframe; every accepted photo "develops" the patch
 * of ground it saw, so the finished map grows under the aircraft as it flies —
 * with a brief warm glow on freshly captured ground. The Overlap layer recolours
 * the same surface by how many photos see each point, which is the quality
 * report a photogrammetry tool would produce after processing.
 *
 * The ground texture is a preview of coverage, not a reconstruction: the real
 * orthomosaic and 3D model are built afterwards from the photos (see Deliverables).
 */

export type SurveyLayer = 'MODEL' | 'OVERLAP';
type View = 'OVERVIEW' | 'TOP' | 'FOLLOW';

interface Props {
  plan: SurveyPlan;
  legs: Leg[];
  legIndex: number;
  legProgressM: number;
  aircraft: SurveyAircraft;
  photosRef: React.RefObject<Photo[]>;
  photoCount: number;
  grid: CoverageGrid;
  gridVersion: number;
  phase: Phase;
  layer: SurveyLayer;
  onLayerChange: (l: SurveyLayer) => void;
  coveredPct: number;
  /** Progress chip text, e.g. "62% photographed" or "20 of 36 angles". */
  progressLabel: string;
  /** Picture-in-picture: no overlay chrome. */
  compact?: boolean;
}

const SEG = 180;              // terrain resolution (5 m per vertex over 900 m)
const PHOTO_CAP = 6000;
const AC_SCALE = 6;           // aircraft drawn larger than life so it reads at 60 m
const ACCENT = new THREE.Color('#fb923c');
const VIEWS: Record<Exclude<View, 'FOLLOW'>, { radius: number; theta: number; phi: number }> = {
  OVERVIEW: { radius: 640, theta: Math.PI * 0.62, phi: 0.98 },
  TOP: { radius: 720, theta: Math.PI / 2, phi: 0.02 },
};

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#06070a'); gr.addColorStop(0.44, '#0b0c10'); gr.addColorStop(0.5, '#1a1512'); gr.addColorStop(0.56, '#0c0d10'); gr.addColorStop(1, '#050608');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Heat ramp for the overlap layer. Status colours: this is a quality status. */
function heat(v: number, out: THREE.Color) {
  const S = THREE.SRGBColorSpace; // specify as displayed; three converts to linear
  if (v === 0) return out.setRGB(0.07, 0.08, 0.1, S);
  if (v >= GOOD_VIEWS) return out.setRGB(0.18, 0.72, 0.36, S).multiplyScalar(0.8 + Math.min(1, (v - GOOD_VIEWS) / 10) * 0.3);
  if (v >= 2) return out.setRGB(0.95, 0.62, 0.12, S);
  return out.setRGB(0.9, 0.2, 0.2, S);
}

export const SurveyScanCanvas3D: React.FC<Props> = (props) => {
  const { layer, onLayerChange, coveredPct, progressLabel, compact } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('OVERVIEW');
  const propsRef = useRef(props); propsRef.current = props;
  const viewRef = useRef<View>(view); viewRef.current = view;
  const goal = useRef({ ...VIEWS.OVERVIEW, target: new THREE.Vector3(0, 0, 0) });
  const now = useRef({ ...VIEWS.OVERVIEW, target: new THREE.Vector3(0, 0, 0) });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const w = host.clientWidth || 900, h = host.clientHeight || 520;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    host.innerHTML = ''; host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c0d10, 0.0011);
    const camera = new THREE.PerspectiveCamera(40, w / h, 1, 5000);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })));
    scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x1a1c20, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); sun.position.set(-300, 500, -200); scene.add(sun);

    // ---- terrain ------------------------------------------------------------
    const geo = new THREE.PlaneGeometry(WORLD_M, WORLD_M, SEG, SEG);
    geo.rotateX(-Math.PI / 2); // plane now in XZ; world z = map y (south)
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    for (let i = 0; i < n; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    // Baked hillshade from the north-west so relief reads without real-time lighting.
    const shade = new Float32Array(n); const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const L = new THREE.Vector3(-0.5, 0.8, -0.35).normalize();
    for (let i = 0; i < n; i++) shade[i] = 0.62 + 0.5 * Math.max(0, nrm.getX(i) * L.x + nrm.getY(i) * L.y + nrm.getZ(i) * L.z) - 0.25;
    const colors = new Float32Array(n * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ortho = new THREE.CanvasTexture(siteImagery(2048)); ortho.colorSpace = THREE.SRGBColorSpace; ortho.anisotropy = 8;
    const terrainMat = new THREE.MeshBasicMaterial({ map: ortho, vertexColors: true });
    scene.add(new THREE.Mesh(geo, terrainMat));
    // Wireframe skin: what "not yet modelled" looks like.
    const wireGeo = new THREE.PlaneGeometry(WORLD_M * 0.84, WORLD_M * 0.84, 84, 84); wireGeo.rotateX(-Math.PI / 2);
    const wp = wireGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) wp.setY(i, heightAt(wp.getX(i), wp.getZ(i)) + 0.4);
    const wire = new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({ color: 0x8fa3c0, wireframe: true, transparent: true, opacity: 0.07, depthWrite: false }));
    scene.add(wire);

    const lastViews = new Uint16Array(n); const flash = new Float32Array(n);
    const col = new THREE.Color();
    let lastVersion = -1, lastLayer: SurveyLayer | null = null;
    const paintTerrain = (grid: CoverageGrid, mode: SurveyLayer, dt: number) => {
      const fresh = grid.version !== lastVersion;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const v = grid.viewsAt({ x, y: z });
        if (v > lastViews[i]) flash[i] = 1;
        lastViews[i] = v;
        if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dt * 0.9);
        const s = shade[i];
        if (mode === 'OVERLAP') {
          const gc = Math.floor((x - grid.minX) / grid.cellM), gr = Math.floor((z - grid.minY) / grid.cellM);
          const inside = gc >= 0 && gr >= 0 && gc < grid.cols && gr < grid.rows && grid.inside[gr * grid.cols + gc] === 1;
          if (inside) heat(v, col).multiplyScalar(s); else col.setRGB(0.1, 0.105, 0.12, THREE.SRGBColorSpace).multiplyScalar(s);
        } else {
          const k = v > 0 ? 1.25 : 0.06;
          col.setRGB(k * s, k * s, k * s * (v > 0 ? 1 : 1.25));
        }
        const f = flash[i] * 0.9;
        colors[i * 3] = col.r + ACCENT.r * f; colors[i * 3 + 1] = col.g + ACCENT.g * f * 0.8; colors[i * 3 + 2] = col.b + ACCENT.b * f * 0.4;
      }
      geo.attributes.color.needsUpdate = true;
      if (mode !== lastLayer) { terrainMat.map = mode === 'MODEL' ? ortho : null; terrainMat.needsUpdate = true; lastLayer = mode; }
      if (fresh) lastVersion = grid.version;
    };

    // ---- venue structures ----------------------------------------------------
    const structMats: { mat: THREE.MeshLambertMaterial; roof: THREE.Color; x: number; y: number }[] = [];
    for (const st of SITE.structures) {
      const roof = new THREE.Color(st.roof);
      const mat = new THREE.MeshLambertMaterial({ color: 0x1b1f27 });
      let mesh: THREE.Mesh;
      if (st.kind === 'tent') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(st.w * 0.72, st.h, 4, 1), mat);
        mesh.rotation.y = Math.PI / 4;
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), mat);
      }
      mesh.position.set(st.x, heightAt(st.x, st.y) + st.h / 2, st.y);
      scene.add(mesh);
      if (st.kind === 'stage') {
        // Roof slab overhanging the deck, on four legs.
        const top = new THREE.Mesh(new THREE.BoxGeometry(st.w + 6, 1.2, st.d + 4), mat); top.position.set(st.x, heightAt(st.x, st.y) + st.h + 3, st.y); scene.add(top);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), mat); leg.position.set(st.x + dx * (st.w / 2 + 2), heightAt(st.x, st.y) + st.h + 1.5, st.y + dz * (st.d / 2 + 1.5)); scene.add(leg); }
      }
      structMats.push({ mat, roof, x: st.x, y: st.y });
    }
    // Trees: one instanced mesh.
    const treeGeo = new THREE.ConeGeometry(1, 2.4, 6); treeGeo.translate(0, 1.2, 0);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x1d3a24 }), TREES.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    TREES.forEach((t, i) => { p3.set(t.x, heightAt(t.x, t.y), t.y); sc.set(t.r, t.r * 1.6, t.r); trees.setMatrixAt(i, m4.compose(p3, q, sc)); });
    scene.add(trees);

    // Boundary: dashed accent line draped on the ground.
    const bpts: THREE.Vector3[] = [];
    SITE.boundary.forEach((a, i) => {
      const b = SITE.boundary[(i + 1) % SITE.boundary.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
      for (let k = 0; k < steps; k++) { const x = a.x + ((b.x - a.x) * k) / steps, y = a.y + ((b.y - a.y) * k) / steps; bpts.push(new THREE.Vector3(x, heightAt(x, y) + 0.8, y)); }
    });
    bpts.push(bpts[0].clone());
    const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bpts), new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 7, gapSize: 5, transparent: true, opacity: 0.9 }));
    boundary.computeLineDistances(); scene.add(boundary);

    // Home pad
    const pad = new THREE.Mesh(new THREE.RingGeometry(4, 5.2, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(SITE.home.x, heightAt(SITE.home.x, SITE.home.y) + 0.3, SITE.home.y); scene.add(pad);

    // ---- flight path: remaining (faint, dashed) and flown (accent) ------------
    const pathRemaining = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 4, gapSize: 4, transparent: true, opacity: 0.32 }));
    const pathFlown = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 }));
    scene.add(pathRemaining, pathFlown);
    let pathKey = '';
    const rebuildPath = (legs: Leg[], idx: number, prog: number, alt: number, acx: number, acy: number) => {
      const key = `${legs.length}:${idx}:${alt}:${Math.round(prog / 8)}`;
      if (key === pathKey) return; pathKey = key;
      const flown: THREE.Vector3[] = [], rest: THREE.Vector3[] = [];
      // Flown: capture legs only (pairs of points), so transits don't read as mapped lines.
      legs.forEach((g, i) => {
        if (i < idx) { if (g.capture) flown.push(new THREE.Vector3(g.a.x, alt, g.a.y), new THREE.Vector3(g.b.x, alt, g.b.y)); }
        else if (i === idx) { if (g.capture) flown.push(new THREE.Vector3(g.a.x, alt, g.a.y), new THREE.Vector3(acx, alt, acy)); rest.push(new THREE.Vector3(acx, alt, acy), new THREE.Vector3(g.b.x, alt, g.b.y)); }
        else { if (!rest.length) rest.push(new THREE.Vector3(g.a.x, alt, g.a.y)); rest.push(new THREE.Vector3(g.b.x, alt, g.b.y)); }
      });
      pathFlown.geometry.dispose(); pathFlown.geometry = new THREE.BufferGeometry().setFromPoints(flown);
      pathRemaining.geometry.dispose(); pathRemaining.geometry = new THREE.BufferGeometry().setFromPoints(rest); pathRemaining.computeLineDistances();
    };

    // ---- photo points --------------------------------------------------------
    const phPos = new Float32Array(PHOTO_CAP * 3), phCol = new Float32Array(PHOTO_CAP * 3);
    const phGeo = new THREE.BufferGeometry();
    phGeo.setAttribute('position', new THREE.BufferAttribute(phPos, 3)); phGeo.setAttribute('color', new THREE.BufferAttribute(phCol, 3)); phGeo.setDrawRange(0, 0);
    const photoPts = new THREE.Points(phGeo, new THREE.PointsMaterial({ size: 3.2, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
    scene.add(photoPts);
    let shown = 0;

    // ---- aircraft, camera frustum and footprint ------------------------------
    const ac = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36 }), light = new THREE.MeshLambertMaterial({ color: 0xd8dde4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.4), light); ac.add(body);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.3), dark); arm.position.set(dx * 0.55, 0, dz * 0.55); arm.rotation.y = Math.atan2(dx, dz); ac.add(arm);
      const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      rotor.rotation.x = -Math.PI / 2; rotor.position.set(dx * 0.95, 0.12, dz * 0.95); ac.add(rotor);
    }
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: ACCENT })); nav.position.set(0, 0.2, -0.7); ac.add(nav);
    ac.scale.setScalar(AC_SCALE); scene.add(ac);
    // Per-frame overlays reuse fixed buffers: no allocation in the render loop.
    const buf = (points: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3).setUsage(THREE.DynamicDrawUsage)); return g; };
    const tether = new THREE.LineSegments(buf(2), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    scene.add(tether);
    // Frustum edges + ground footprint outline + a fill that flashes on each photo.
    const frustum = new THREE.LineSegments(buf(8), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55, depthWrite: false }));
    const fpLine = new THREE.LineLoop(buf(4), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 }));
    const fpFill = new THREE.Mesh(buf(6), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(frustum, fpLine, fpFill);
    const setPts = (obj: THREE.Object3D & { geometry: THREE.BufferGeometry }, pts: THREE.Vector3[]) => {
      const attr = obj.geometry.attributes.position as THREE.BufferAttribute;
      pts.forEach((v, i) => attr.setXYZ(i, v.x, v.y, v.z)); attr.needsUpdate = true; obj.geometry.computeBoundingSphere();
    };
    let lastPhotoCount = 0, shutter = 0;

    // ---- loop -----------------------------------------------------------------
    let raf = 0, lastT = performance.now(), paintAcc = 0;
    const tmpV = new THREE.Vector3();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
      const P = propsRef.current;
      const a = P.aircraft;
      const groundY = heightAt(a.x, a.y);
      const acY = groundY + Math.max(0.5, a.altM);
      const flying = a.altM > 0.3;

      // Terrain colours ~8 Hz (and immediately on layer change).
      paintAcc += dt;
      if (paintAcc > 0.12 || P.layer !== lastLayer) { paintTerrain(P.grid, P.layer, paintAcc); paintAcc = 0; }
      wire.visible = P.layer === 'MODEL';

      // Structures develop when the ground under them has been photographed.
      for (const s of structMats) {
        const v = P.grid.viewsAt({ x: s.x, y: s.y });
        if (P.layer === 'OVERLAP') heat(v, col); else if (v > 0) col.copy(s.roof); else col.setRGB(0.1, 0.11, 0.14);
        s.mat.color.lerp(col, 0.15);
      }

      // Aircraft
      ac.position.set(a.x, acY, a.y);
      ac.rotation.y = -(a.headingDeg * Math.PI) / 180;
      ac.children.forEach(c => { if ((c as THREE.Mesh).geometry instanceof THREE.CircleGeometry) c.rotation.z += dt * 40; });
      setPts(tether, [tmpV.set(a.x, acY - 1.5, a.y).clone(), new THREE.Vector3(a.x, groundY, a.y)]);
      tether.visible = flying;

      // Footprint on the ground, oriented along the flight direction.
      const pl = P.plan;
      const hRad = ((a.headingDeg - 90) * Math.PI) / 180; // compass → map angle
      const scaleAlt = Math.max(0.2, a.altM / pl.params.altitudeM);
      const hx = (pl.footprint.alongM * scaleAlt) / 2, hy = (pl.footprint.acrossM * scaleAlt) / 2;
      let cx = a.x, cy = a.y;
      if (pl.params.pattern === 'ORBIT') { cx = pl.params.orbit.center.x; cy = pl.params.orbit.center.y; }
      else if (pl.gimbalPitchDeg > -85) { const off = a.altM * Math.tan(((90 + pl.gimbalPitchDeg) * Math.PI) / 180); cx += Math.cos(hRad) * off; cy += Math.sin(hRad) * off; }
      const ca = Math.cos(hRad), sa = Math.sin(hRad);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = cx + u * hx * ca - v * hy * sa, y = cy + u * hx * sa + v * hy * ca; return new THREE.Vector3(x, heightAt(x, y) + 0.6, y); });
      const camPos = new THREE.Vector3(a.x, acY - 0.8, a.y);
      setPts(fpLine, corners);
      setPts(frustum, corners.flatMap(c => [camPos, c]));
      setPts(fpFill, [corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
      const capturing = P.phase === 'CAPTURING';
      fpLine.visible = frustum.visible = fpFill.visible = flying;
      (frustum.material as THREE.LineBasicMaterial).opacity = capturing ? 0.55 : 0.18;
      (fpLine.material as THREE.LineBasicMaterial).opacity = capturing ? 0.9 : 0.3;
      if (P.photoCount > lastPhotoCount) shutter = 1;
      lastPhotoCount = P.photoCount;
      shutter = Math.max(0, shutter - dt * 3.5);
      (fpFill.material as THREE.MeshBasicMaterial).opacity = shutter * 0.28;

      // Photos
      const photos = P.photosRef.current ?? [];
      if (photos.length < shown) shown = 0; // survey reset
      for (; shown < Math.min(photos.length, PHOTO_CAP); shown++) {
        const ph = photos[shown];
        phPos[shown * 3] = ph.x; phPos[shown * 3 + 1] = heightAt(ph.x, ph.y) + ph.altM; phPos[shown * 3 + 2] = ph.y;
        if (ph.ok) { phCol[shown * 3] = 1; phCol[shown * 3 + 1] = 0.86; phCol[shown * 3 + 2] = 0.7; } else { phCol[shown * 3] = 1; phCol[shown * 3 + 1] = 0.18; phCol[shown * 3 + 2] = 0.18; }
        phGeo.attributes.position.needsUpdate = true; phGeo.attributes.color.needsUpdate = true;
      }
      phGeo.setDrawRange(0, shown);

      rebuildPath(P.legs, P.legIndex, P.legProgressM, pl.params.altitudeM, a.x, a.y);

      // Camera
      const g = goal.current, o = now.current;
      if (viewRef.current === 'FOLLOW') {
        g.target.set(a.x, acY * 0.5, a.y); g.radius = Math.min(g.radius, 260);
      }
      o.radius += (g.radius - o.radius) * 0.07; o.theta += (g.theta - o.theta) * 0.08; o.phi += (g.phi - o.phi) * 0.07;
      o.target.lerp(g.target, 0.08);
      camera.position.set(o.target.x + o.radius * Math.sin(o.phi) * Math.cos(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * Math.sin(o.phi) * Math.sin(o.theta));
      camera.lookAt(tmpV.copy(o.target));
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch);
    });
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse(obj => {
        const m = obj as THREE.Mesh; m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
      });
      ortho.dispose(); renderer.dispose();
    };
  }, []);

  const applyView = (v: View) => {
    setView(v);
    if (v === 'FOLLOW') { goal.current.radius = 220; goal.current.phi = 1.05; return; }
    goal.current = { ...VIEWS[v], target: new THREE.Vector3(0, 0, 0) };
  };
  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY };
    goal.current.theta += dx * 0.005; goal.current.phi = Math.max(0.02, Math.min(1.45, goal.current.phi - dy * 0.005));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => { goal.current.radius = Math.max(90, Math.min(1100, goal.current.radius * (1 + e.deltaY * 0.001))); };

  const chip = 'rounded-lg bg-black/55 backdrop-blur';
  return (
    <div id="survey-stage" className="relative w-full h-full bg-imagery select-none overflow-hidden">
      <div ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing" role="img" aria-label={`3D view of ${SITE.name}, ${coveredPct.toFixed(0)}% photographed`} />

      {!compact && <>
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <span className={`${chip} px-2.5 py-1 text-[12px] font-medium text-white hidden sm:inline`}>{SITE.name}</span>
        <span className={`${chip} px-2.5 py-1 text-[11px] text-white/75 num`}>{progressLabel}</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div role="group" aria-label="Layer" className={`inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
          {([['MODEL', 'Map', 'The venue as the finished map will show it'], ['OVERLAP', 'Overlap', 'How many photos see each point: green is enough for a reliable model']] as [SurveyLayer, string, string][]).map(([id, label, title]) => (
            <button key={id} type="button" title={title} aria-pressed={layer === id} onClick={() => onLayerChange(id)}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${layer === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Camera" className={`hidden sm:inline-flex items-center gap-0.5 p-0.5 ${chip}`}>
          {([['OVERVIEW', 'Overview'], ['TOP', 'Top-down'], ['FOLLOW', 'Follow']] as [View, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => applyView(id)}
              className={`h-6 px-2 rounded-md text-[11px] font-medium transition-colors ${view === id ? 'bg-white/15 text-white' : 'text-white/65 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => applyView(view)}
          className={`inline-flex items-center justify-center w-7 h-7 text-white/65 hover:text-white transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${chip}`}><RotateCcw /></button>
      </div>

      {layer === 'OVERLAP' ? (
        <div className={`absolute bottom-3 left-3 flex items-center gap-3 px-2.5 py-1.5 text-[11px] text-white/80 ${chip} pointer-events-none max-sm:gap-2 max-sm:text-[10px]`}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#2eb85c]" />{GOOD_VIEWS}+ photos</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f29e1f]" />2–{GOOD_VIEWS - 1}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#e63333]" />1</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1a1d24] border border-white/20" />not yet</span>
        </div>
      ) : (
        <div className="hidden sm:block absolute bottom-3 left-3 text-[11px] text-white/45 pointer-events-none">Coverage preview — the finished map and 3D model are built from the photos after landing</div>
      )}
      </>}
    </div>
  );
};
