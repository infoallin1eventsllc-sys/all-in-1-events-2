import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Pencil, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { WORLD_M, siteImagery } from '../../survey/site';
import { usesDemoGeometry, checkLocal, moveCorner, insertCorner, deleteCorner, edgeMidpoints, type SurveySite } from '../../survey/boundary';
import { GOOD_VIEWS, toLatLon, type CoverageGrid, type Leg, type SurveyPlan, type Pt } from '../../survey/plan';
import { basemapSettings, subscribeBasemap, activeBasemap, basemapTiles, tilesCovering, tileRectLocal, tileUrl, zoomForScale } from '../../survey/tiles';
import type { Clearance, Terrain } from '../../survey/terrain';
import type { Photo, SurveyAircraft, useSurveyMission } from '../../hooks/useSurveyMission';
import type { SurveyLayer } from './SurveyScanCanvas3D';

/**
 * Plan view of the survey: the orthophoto revealed where photographed (on the
 * demo venue; a real site draws on map tiles, or a survey grid without them), the
 * boundary, the geofence, flight lines (flown in accent, remaining dashed), every
 * photo, and the aircraft with its camera footprint. Following terrain adds the
 * ground's relief and the route's height profile.
 *
 * On a real site the boundary can be edited here: drag a corner, click an edge's +
 * to add one, select one and press Delete to remove it, arrows to nudge (Shift for
 * 10 m), Ctrl/Cmd+Z to undo. Draw mode places a new outline corner by corner.
 */

type Sim = ReturnType<typeof useSurveyMission>;

interface Props {
  plan: SurveyPlan;
  legs: Leg[];
  legIndex: number;
  aircraft: SurveyAircraft;
  photosRef: React.RefObject<Photo[]>;
  grid: CoverageGrid;
  gridVersion: number;
  layer: SurveyLayer;
  site: SurveySite;
  /** Inclusion geofence to draw, local metres. */
  fence?: Pt[] | null;
  /** Corners being walked with the aircraft, not yet a site. */
  draft?: Pt[];
  compact?: boolean;
  /** Boundary editing (the full-size map only). */
  edit?: Sim['boundaryEdit'];
  terrain?: Sim['terrain'];
  /** What the mission clears above the ground, for the profile. */
  clearance?: Clearance | null;
}

export const MAP_W = 1280, MAP_H = 720;
const ACCENT = '#fb923c';
const MARGIN_M = 55;
const FONT = 'Inter, system-ui, sans-serif';

interface View { s: number; ox: number; oy: number; lat: number; lon: number; kind: string }
/** Room kept clear at the top of a real site's map for the edit buttons (a phone shows the canvas at a third of its size). */
const TOOLBAR_PAD = 90;
function fitView(site: SurveySite): View {
  const top = usesDemoGeometry(site) ? 0 : TOOLBAR_PAD;
  const fitPts = [...site.boundary, site.home];
  const xs = fitPts.map(p => p.x), ys = fitPts.map(p => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const margin = Math.max(MARGIN_M, span * 0.12);
  const x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin, y0 = Math.min(...ys) - margin, y1 = Math.max(...ys) + margin;
  const s = Math.min(MAP_W / (x1 - x0), (MAP_H - top) / (y1 - y0));
  return { s, ox: MAP_W / 2 - ((x0 + x1) / 2) * s, oy: (MAP_H + top) / 2 - ((y0 + y1) / 2) * s, lat: site.origin.lat, lon: site.origin.lon, kind: site.kind };
}

/** Hillshade tinted by height, with contours: drawn once per terrain and view, at a quarter of the canvas. */
function reliefImage(t: Terrain, v: View, lo: number, hi: number): HTMLCanvasElement {
  const k = 4, w = MAP_W / k, h = MAP_H / k, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = new Float32Array((w + 1) * (h + 1));
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) g[j * (w + 1) + i] = t.at({ x: (i * k - v.ox) / v.s, y: (j * k - v.oy) / v.s });
  const range = Math.max(1, hi - lo), step = [1, 2, 5, 10, 20, 50, 100].find(m => range / m <= 12) ?? 200, cell = k / v.s;
  const img = c.getContext('2d')!.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = g[j * (w + 1) + i], b = g[j * (w + 1) + i + 1], d = g[(j + 1) * (w + 1) + i], o = (j * w + i) * 4;
    if (!Number.isFinite(a)) continue;
    // Sun from the north-west, 45° up.
    const dx = (Number.isFinite(b) ? b - a : 0) / cell, dy = (Number.isFinite(d) ? d - a : 0) / cell;
    const shade = Math.max(0, Math.min(1, (1 + (dx + dy) * 0.707) / Math.sqrt(1 + dx * dx + dy * dy) * 0.707 + 0.3));
    const f = Math.max(0, Math.min(1, (a - lo) / range));
    const contour = Math.floor(a / step) !== Math.floor(b / step) || Math.floor(a / step) !== Math.floor(d / step);
    img.data[o] = (40 + f * 170) * shade + (contour ? 60 : 0); img.data[o + 1] = (90 + (1 - Math.abs(f - 0.5) * 2) * 70) * shade + (contour ? 60 : 0); img.data[o + 2] = (150 - f * 110) * shade + (contour ? 60 : 0);
    img.data[o + 3] = contour ? 200 : 120;
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

export const SurveyMapCanvas: React.FC<Props> = (props) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props); propsRef.current = props;
  const bm = useSyncExternalStore(subscribeBasemap, basemapSettings);
  const viewRef = useRef<View | null>(null);
  /** Pointer state: the corner being dragged, the outline it makes, and that outline's check. */
  const ui = useRef<{ drag: { i: number; id: number; base: Pt[]; moved: boolean; merge?: string } | null; preview: Pt[] | null; check: ReturnType<typeof checkLocal> | null; hover: Pt | null }>({ drag: null, preview: null, check: null, hover: null });
  const { site, edit, compact } = props;
  const real = !usesDemoGeometry(site);
  const mode = !compact && edit?.allowed ? edit.mode : 'OFF';
  const editing = mode === 'EDIT' && real;
  const drawing = mode === 'DRAW';

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = MAP_W * dpr; cv.height = MAP_H * dpr;
    let v = viewRef.current = fitView(propsRef.current.site);
    let fitted = propsRef.current.site.boundary;
    const X = (x: number) => v.ox + x * v.s, Y = (y: number) => v.oy + y * v.s;

    // Coverage veil, redrawn only when coverage, layer or view changes.
    const veil = document.createElement('canvas'); veil.width = MAP_W; veil.height = MAP_H;
    const vctx = veil.getContext('2d')!;
    let veilKey = '', veilGrid: CoverageGrid | null = null, veilView: View | null = null;
    const drawVeil = (grid: CoverageGrid, layer: SurveyLayer) => {
      const key = `${grid.version}:${layer}`; if (key === veilKey && grid === veilGrid && v === veilView) return; veilKey = key; veilGrid = grid; veilView = v;
      const s = v.s, vx0 = -v.ox / s, vy0 = -v.oy / s;
      vctx.clearRect(0, 0, MAP_W, MAP_H);
      vctx.fillStyle = 'rgba(4,7,14,0.66)'; vctx.fillRect(0, 0, MAP_W, MAP_H);
      const cs = grid.cellM * s;
      for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
        const i = r * grid.cols + c; if (!grid.inside[i]) continue;
        const px = X(grid.minX + c * grid.cellM), py = Y(grid.minY + r * grid.cellM);
        vctx.clearRect(px, py, cs + 0.5, cs + 0.5);
        const n = grid.views[i];
        if (layer === 'OVERLAP') {
          vctx.fillStyle = n === 0 ? 'rgba(8,10,14,0.86)' : n >= GOOD_VIEWS ? 'rgba(46,184,92,0.55)' : n >= 2 ? 'rgba(242,158,31,0.65)' : 'rgba(230,51,51,0.7)';
          vctx.fillRect(px, py, cs + 0.5, cs + 0.5);
        } else if (n === 0) { vctx.fillStyle = 'rgba(4,8,16,0.86)'; vctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
      }
      // Blueprint grid (25 m, heavier every 100 m) over ground no photo has seen, matching the 3D view.
      if (layer === 'MODEL') {
        vctx.save();
        vctx.globalCompositeOperation = 'source-atop';
        for (let m = Math.floor(vx0 / 25) * 25; m < vx0 + MAP_W / s; m += 25) { vctx.fillStyle = m % 100 === 0 ? 'rgba(91,141,239,0.35)' : 'rgba(91,141,239,0.16)'; vctx.fillRect(X(m), 0, 1, MAP_H); }
        for (let m = Math.floor(vy0 / 25) * 25; m < vy0 + MAP_H / s; m += 25) { vctx.fillStyle = m % 100 === 0 ? 'rgba(91,141,239,0.35)' : 'rgba(91,141,239,0.16)'; vctx.fillRect(0, Y(m), MAP_W, 1); }
        vctx.restore();
      }
    };

    /** Map tiles under a real site. Returns a note when they are not there (the survey grid shows through). */
    const drawBasemap = (P: Props): string => {
      const st = basemapSettings(); if (!st.on) return '';
      const act = activeBasemap(st); if (!act.provider) return act.reason;
      const o = P.site.origin, s = v.s, vx0 = -v.ox / s, vy0 = -v.oy / s;
      // Tile pixels about the size of screen pixels (the canvas is shown scaled to its box).
      const screen = (cv.clientWidth || MAP_W) / MAP_W * (window.devicePixelRatio || 1);
      const nw = toLatLon(o, { x: vx0, y: vy0 }), se = toLatLon(o, { x: vx0 + MAP_W / s, y: vy0 + MAP_H / s });
      const box = { north: nw.lat, south: se.lat, west: nw.lon, east: se.lon };
      let z = zoomForScale(o.lat, s * screen, act.provider.maxZoom), tiles = tilesCovering(box, z);
      while (tiles.length > 48 && z > 1) tiles = tilesCovering(box, --z); // a polite ceiling per view
      const want = new Set<string>(); let shown = 0, failed = 0;
      ctx.save(); ctx.globalAlpha = st.opacity; ctx.imageSmoothingEnabled = true;
      for (const t of tiles) {
        const url = tileUrl(act.provider.url, t.z, t.x, t.y, act.key), r = tileRectLocal(o, t.x, t.y, t.z);
        want.add(url);
        const dx = X(r.x0), dy = Y(r.y0), dw = (r.x1 - r.x0) * s + 0.5, dh = (r.y1 - r.y0) * s + 0.5;
        const bmp = basemapTiles.get(url);
        if (bmp) { ctx.drawImage(bmp, dx, dy, dw, dh); shown++; continue; }
        if (basemapTiles.isFailed(url)) failed++;
        // Meanwhile, a coarser tile already here, cropped to this one.
        for (let up = 1; up <= 4 && t.z - up >= 0; up++) {
          const pb = basemapTiles.peek(tileUrl(act.provider.url, t.z - up, t.x >> up, t.y >> up, act.key)); if (!pb) continue;
          const n = 2 ** up, sw = pb.width / n, sh = pb.height / n;
          ctx.drawImage(pb, (t.x - ((t.x >> up) << up)) * sw, (t.y - ((t.y >> up) << up)) * sh, sw, sh, dx, dy, dw, dh); break;
        }
      }
      ctx.restore();
      basemapTiles.prune(want);
      if (failed && !shown) return 'Map tiles unavailable · showing the survey grid';
      if (!shown && tiles.length && basemapTiles.budgetLeft(tileUrl(act.provider.url, z, tiles[0].x, tiles[0].y, act.key)) <= 0) return 'Tile budget for this session used · showing the survey grid';
      return '';
    };

    let relief: { img: HTMLCanvasElement; model: Terrain; view: View } | null = null;
    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 60) return; // ~15 fps is plenty for a plan view
      last = t;
      const P = propsRef.current; const a = P.aircraft; const pl = P.plan; const S = P.site;
      const U = ui.current, E = P.compact || !P.edit?.allowed ? undefined : P.edit, demo = usesDemoGeometry(S);
      // A new site refits the view; an edited one only when it no longer fits (never mid-drag or mid-draw).
      if (S.origin.lat !== v.lat || S.origin.lon !== v.lon || S.kind !== v.kind) { v = viewRef.current = fitView(S); fitted = S.boundary; }
      else if (S.boundary !== fitted && !U.drag && E?.mode !== 'DRAW') {
        fitted = S.boundary;
        if ([...S.boundary, S.home].some(p => X(p.x) < 12 || X(p.x) > MAP_W - 12 || Y(p.y) < 12 || Y(p.y) > MAP_H - 12)) v = viewRef.current = fitView(S);
      }
      const s = v.s, vx0 = -v.ox / s, vy0 = -v.oy / s;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, MAP_W, MAP_H);
      let note = '';
      if (demo) {
        const img = siteImagery(2048), ipm = img.width / WORLD_M;
        ctx.drawImage(img, (vx0 + WORLD_M / 2) * ipm, (vy0 + WORLD_M / 2) * ipm, (MAP_W / s) * ipm, (MAP_H / s) * ipm, 0, 0, MAP_W, MAP_H);
      } else {
        // A real site: a survey grid at a step that suits the scale, with map tiles over it when they load.
        const stepM = [10, 25, 50, 100, 250, 500, 1000].find(m => m * s >= 28) ?? 1000;
        ctx.fillStyle = '#101722'; ctx.fillRect(0, 0, MAP_W, MAP_H);
        for (let m = Math.floor(vx0 / stepM) * stepM; m < vx0 + MAP_W / s; m += stepM) { ctx.fillStyle = m % (stepM * 4) === 0 ? 'rgba(120,150,200,0.22)' : 'rgba(120,150,200,0.09)'; ctx.fillRect(X(m), 0, 1, MAP_H); }
        for (let m = Math.floor(vy0 / stepM) * stepM; m < vy0 + MAP_H / s; m += stepM) { ctx.fillStyle = m % (stepM * 4) === 0 ? 'rgba(120,150,200,0.22)' : 'rgba(120,150,200,0.09)'; ctx.fillRect(0, Y(m), MAP_W, 1); }
        note = drawBasemap(P);
      }
      // Tiles show the ground as it is: lighten the veil over them so the map reads through unseen ground.
      drawVeil(P.grid, P.layer);
      ctx.globalAlpha = !demo && basemapSettings().on ? 0.55 : 1; ctx.drawImage(veil, 0, 0); ctx.globalAlpha = 1;

      // Terrain relief while following it.
      const T = P.terrain, model = T?.follow ? T.model : null;
      if (model && T?.relief && Number.isFinite(T.relief.min)) {
        if (!relief || relief.model !== model || relief.view !== v) relief = { img: reliefImage(model, v, T.relief.min, T.relief.max), model, view: v };
        ctx.save(); ctx.globalAlpha = 0.5; ctx.imageSmoothingEnabled = true; ctx.drawImage(relief.img, 0, 0, MAP_W, MAP_H); ctx.restore();
      }

      // Boundary: the outline being dragged, with any crossing edges in red.
      const B = U.preview ?? S.boundary;
      ctx.beginPath(); B.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath();
      ctx.strokeStyle = ACCENT; ctx.lineWidth = E?.mode === 'EDIT' && !demo ? 2 : 1.5; ctx.setLineDash(E?.mode === 'EDIT' && !demo ? [] : [8, 6]); ctx.stroke(); ctx.setLineDash([]);
      if (U.preview && U.check) for (const pair of U.check.crossing) for (const i of pair) {
        const p = B[i], q = B[(i + 1) % B.length];
        ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(q.x), Y(q.y)); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3; ctx.stroke();
      }
      // Geofence: where the autopilot will stop the aircraft.
      if (P.fence?.length && !U.preview) {
        ctx.beginPath(); P.fence.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath();
        ctx.strokeStyle = 'rgba(248,113,113,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
      // Corners marked so far while walking the boundary, or placed in draw mode.
      const dots = (pts: Pt[], color: string, open: boolean) => {
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); if (pts.length > 2 && !open) ctx.closePath();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), i === 0 && open && pts.length > 2 ? 7 : 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.fillStyle = '#111'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), X(p.x), Y(p.y) + 3); ctx.textAlign = 'left'; });
      };
      if (P.draft?.length) dots(P.draft, '#fde68a', false);
      if (E?.mode === 'DRAW') {
        const d = E.draw;
        if (d.length && U.hover) { ctx.beginPath(); ctx.moveTo(X(d[d.length - 1].x), Y(d[d.length - 1].y)); ctx.lineTo(X(U.hover.x), Y(U.hover.y)); if (d.length > 1) ctx.lineTo(X(d[0].x), Y(d[0].y)); ctx.strokeStyle = 'rgba(253,230,138,0.6)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
        if (d.length) dots(d, '#fde68a', true);
      }

      // Flight path (hidden while dragging: it is re-planned on release)
      const legs = P.legs;
      if (!U.preview) {
        ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        ctx.beginPath();
        legs.forEach((g, i) => { if (i < P.legIndex) return; const from = i === P.legIndex ? a : g.a; ctx.moveTo(X(from.x), Y(from.y)); ctx.lineTo(X(g.b.x), Y(g.b.y)); });
        ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.beginPath();
        legs.forEach((g, i) => { if (i > P.legIndex || !g.capture) return; ctx.moveTo(X(g.a.x), Y(g.a.y)); const to = i === P.legIndex ? a : g.b; ctx.lineTo(X(to.x), Y(to.y)); });
        ctx.stroke();
      }

      // Photos
      const photos = P.photosRef.current ?? [];
      for (const ph of photos) {
        if (ph.ok) { ctx.fillStyle = 'rgba(255,226,190,0.9)'; ctx.fillRect(X(ph.x) - 1, Y(ph.y) - 1, 2, 2); }
        else { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(ph.x) - 3, Y(ph.y) - 3); ctx.lineTo(X(ph.x) + 3, Y(ph.y) + 3); ctx.moveTo(X(ph.x) + 3, Y(ph.y) - 3); ctx.lineTo(X(ph.x) - 3, Y(ph.y) + 3); ctx.stroke(); }
      }

      // Home
      const home = S.home;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(home.x), Y(home.y), 8, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `600 10px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center'; ctx.fillText('H', X(home.x), Y(home.y) + 3.5); ctx.textAlign = 'left';

      // Camera footprint + aircraft
      if (a.altM > 0.3) {
        const h = ((a.headingDeg - 90) * Math.PI) / 180, k = Math.max(0.2, a.altM / pl.params.altitudeM);
        let cx = a.x, cy = a.y;
        if (pl.params.pattern === 'ORBIT') { cx = pl.params.orbit.center.x; cy = pl.params.orbit.center.y; }
        else if (pl.gimbalPitchDeg > -85) { const off = a.altM * Math.tan(((90 + pl.gimbalPitchDeg) * Math.PI) / 180); cx += Math.cos(h) * off; cy += Math.sin(h) * off; }
        ctx.save(); ctx.translate(X(cx), Y(cy)); ctx.rotate(h);
        const hw = (pl.footprint.alongM * k * s) / 2, hh = (pl.footprint.acrossM * k * s) / 2;
        ctx.fillStyle = 'rgba(251,146,60,0.12)'; ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
        ctx.strokeStyle = 'rgba(251,146,60,0.85)'; ctx.lineWidth = 1; ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
        ctx.restore();
      }
      ctx.save(); ctx.translate(X(a.x), Y(a.y)); ctx.rotate((a.headingDeg * Math.PI) / 180);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.stroke();
      for (const [dx, dy] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) { ctx.beginPath(); ctx.arc(dx, dy, 2.6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(3.5, -5); ctx.lineTo(-3.5, -5); ctx.closePath(); ctx.fillStyle = ACCENT; ctx.fill();
      ctx.restore();

      // Edit handles: corners (selected one filled) and a + on each edge to add one.
      if (E?.mode === 'EDIT' && !demo) {
        // Handles keep a usable size when the canvas is shown small (a phone shows it at a third).
        const hs = Math.max(1, Math.min(2.5, (MAP_W / (cv.clientWidth || MAP_W)) * 0.6));
        edgeMidpoints(B).forEach(m => {
          ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 6 * hs, 0, Math.PI * 2); ctx.fillStyle = 'rgba(11,15,20,0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(251,146,60,0.9)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = ACCENT; ctx.fillRect(X(m.x) - 3.5 * hs, Y(m.y) - 0.75 * hs, 7 * hs, 1.5 * hs); ctx.fillRect(X(m.x) - 0.75 * hs, Y(m.y) - 3.5 * hs, 1.5 * hs, 7 * hs);
        });
        B.forEach((p, i) => {
          const sel = (U.drag?.i ?? E.selected) === i;
          ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), (sel ? 9 : 7) * hs, 0, Math.PI * 2); ctx.fillStyle = sel ? ACCENT : '#fff'; ctx.fill();
          ctx.strokeStyle = sel ? '#fff' : ACCENT; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = sel ? '#fff' : '#111'; ctx.font = `700 ${Math.round(9 * hs)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), X(p.x), Y(p.y) + 3 * hs); ctx.textAlign = 'left';
        });
      }

      // Terrain profile along the route, and where it comes closest to the ground.
      const C = P.clearance;
      if (model && C && C.samples.length > 1 && !U.preview) {
        ctx.beginPath(); ctx.arc(X(C.minAt.x), Y(C.minAt.y), 7, 0, Math.PI * 2); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.stroke();
        if (!P.compact) {
          const bx = 16, bw = 340, bh = 92, by = MAP_H - 50 - bh, sm = C.samples, L = sm[sm.length - 1].d || 1;
          let lo = Infinity, hi = -Infinity; for (const q of sm) { lo = Math.min(lo, q.ground); hi = Math.max(hi, q.alt); }
          const pad = (hi - lo) * 0.08 + 1, PX = (d: number) => bx + 8 + (d / L) * (bw - 16), PY = (h: number) => by + bh - 8 - ((h - lo + pad) / (hi - lo + 2 * pad)) * (bh - 26);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
          const every = Math.max(1, Math.floor(sm.length / 400));
          ctx.beginPath(); ctx.moveTo(PX(0), by + bh - 8); for (let i = 0; i < sm.length; i += every) ctx.lineTo(PX(sm[i].d), PY(sm[i].ground)); ctx.lineTo(PX(L), by + bh - 8); ctx.closePath();
          ctx.fillStyle = 'rgba(146,120,86,0.85)'; ctx.fill();
          ctx.beginPath(); for (let i = 0; i < sm.length; i += every) (i ? ctx.lineTo(PX(sm[i].d), PY(sm[i].alt)) : ctx.moveTo(PX(sm[i].d), PY(sm[i].alt))); ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.font = `600 10px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText(`Route profile · lowest ${C.minAglM.toFixed(0)} m above ground`, bx + 8, by + 13);
          ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(`${lo.toFixed(0)}–${hi.toFixed(0)} m ASL`, bx + bw - 8, by + 13); ctx.textAlign = 'left';
        }
      }

      if (!P.compact) {
        // Scale bar + north
        const barM = [25, 50, 100, 250, 500, 1000, 2000].find(m => m * s >= 90) ?? 2000, bar = barM * s;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(16, MAP_H - 38, bar + 24, 24);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28, MAP_H - 22); ctx.lineTo(28 + bar, MAP_H - 22); ctx.stroke();
        ctx.font = `11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(barM >= 1000 ? `${barM / 1000} km` : `${barM} m`, 28, MAP_H - 27);
        ctx.beginPath(); ctx.moveTo(MAP_W - 28, 44); ctx.lineTo(MAP_W - 22, 30); ctx.lineTo(MAP_W - 16, 44); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
        ctx.textAlign = 'center'; ctx.fillText('N', MAP_W - 22, 58); ctx.textAlign = 'left';
        // Live check of the outline being dragged: released like this, it would not be accepted.
        if (U.preview && U.check && (U.check.errors.length || U.check.warnings.length)) {
          const t2 = U.check.errors[0] ?? U.check.warnings[0]; ctx.font = `600 12px ${FONT}`; const w = ctx.measureText(t2).width + 20;
          ctx.fillStyle = U.check.errors.length ? 'rgba(220,38,38,0.92)' : 'rgba(245,158,11,0.92)'; ctx.fillRect(MAP_W / 2 - w / 2, 50, w, 24);
          ctx.fillStyle = U.check.errors.length ? '#fff' : '#111'; ctx.textAlign = 'center'; ctx.fillText(t2, MAP_W / 2, 66); ctx.textAlign = 'left';
        }
        if (note) { ctx.font = `11px ${FONT}`; const w = ctx.measureText(note).width + 16; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(MAP_W - w - 16, MAP_H - 62, w, 20); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(note, MAP_W - w - 8, MAP_H - 48); }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- editing ----------------------------------------------------------------------
  const [say, setSay] = useState('');
  const toMap = (e: React.PointerEvent | PointerEvent) => {
    const cv = ref.current!, r = cv.getBoundingClientRect(), v = viewRef.current!;
    const lx = ((e.clientX - r.left) / r.width) * MAP_W, ly = ((e.clientY - r.top) / r.height) * MAP_H;
    return { p: { x: (lx - v.ox) / v.s, y: (ly - v.oy) / v.s }, lx, ly, perCss: MAP_W / r.width };
  };
  const hitIndex = (pts: Pt[], lx: number, ly: number, radius: number) => {
    const v = viewRef.current!; let best = -1, bd = radius;
    pts.forEach((q, i) => { const d = Math.hypot(v.ox + q.x * v.s - lx, v.oy + q.y * v.s - ly); if (d <= bd) { bd = d; best = i; } });
    return best;
  };
  const announce = (b: Pt[], i: number | null) => {
    if (i === null || !b[i]) { setSay('No corner selected'); return; }
    const ll = toLatLon(site.origin, b[i]);
    setSay(`Corner ${i + 1} of ${b.length} selected, ${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}. Arrow keys move it 1 m, with Shift 10 m. Delete removes it.`);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!edit || (!editing && !drawing)) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); ref.current?.focus();
    const { p, lx, ly, perCss } = toMap(e), R = (e.pointerType === 'touch' ? 22 : 11) * perCss;
    if (drawing) {
      const d = edit.draw;
      if (d.length >= 3 && hitIndex([d[0]], lx, ly, R) === 0) { edit.finishDraw(); return; }
      edit.setDraw([...d, p]); setSay(`Corner ${d.length + 1} placed`);
      return;
    }
    const b = site.boundary;
    let i = hitIndex(b, lx, ly, R), base = b, merge: string | undefined;
    if (i < 0) {
      const m = hitIndex(edgeMidpoints(b), lx, ly, R);
      if (m < 0) { edit.select(null); return; }
      // Adding a corner and dragging it straight away is one step to undo.
      base = insertCorner(b, m); merge = `insert:${e.timeStamp}`;
      if (!edit.commit(base, merge)) return;
      i = m + 1;
    }
    edit.select(i); announce(base, i);
    ui.current.drag = { i, id: e.pointerId, base, moved: false, merge };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!edit || (!editing && !drawing)) return;
    const U = ui.current, { p, lx, ly, perCss } = toMap(e);
    U.hover = p;
    const D = U.drag;
    if (D && D.id === e.pointerId) {
      D.moved = true; U.preview = moveCorner(D.base, D.i, p); U.check = checkLocal(site.origin, U.preview);
      return;
    }
    if (editing && ref.current) {
      const R = 11 * perCss, b = site.boundary;
      ref.current.style.cursor = hitIndex(b, lx, ly, R) >= 0 ? 'grab' : hitIndex(edgeMidpoints(b), lx, ly, R) >= 0 ? 'copy' : 'default';
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    const U = ui.current, D = U.drag; if (!D || D.id !== e.pointerId) return;
    if (commit && D.moved && U.preview && edit) { const next = U.preview; edit.commit(next, D.merge); announce(next, D.i); }
    U.drag = null; U.preview = null; U.check = null;
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!edit) return;
    if (drawing) {
      if (e.key === 'Enter') { e.preventDefault(); edit.finishDraw(); }
      else if (e.key === 'Escape') { e.preventDefault(); edit.setMode('OFF'); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); edit.setDraw(edit.draw.slice(0, -1)); }
      return;
    }
    if (!editing) return;
    const b = site.boundary, sel = edit.selected;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && sel !== null) {
      e.preventDefault();
      const k = e.shiftKey ? 10 : 1, [dx, dy] = arrows[e.key];
      const next = moveCorner(b, sel, { x: b[sel].x + dx * k, y: b[sel].y + dy * k });
      if (edit.commit(next, `nudge:${sel}`)) announce(next, sel);
    } else if (e.key === ']' || e.key === '[') {
      e.preventDefault();
      const i = sel === null ? 0 : (sel + (e.key === ']' ? 1 : b.length - 1)) % b.length; edit.select(i); announce(b, i);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
      e.preventDefault();
      const next = deleteCorner(b, sel);
      if (!next) { edit.showCheck({ errors: ['A boundary needs at least three corners.'], warnings: [] }); return; }
      if (edit.commit(next)) { const i = Math.min(sel, next.length - 1); edit.select(i); announce(next, i); }
    } else if ((e.key === 'Insert' || e.key === '+') && sel !== null) {
      e.preventDefault();
      const next = insertCorner(b, sel); if (edit.commit(next)) { edit.select(sel + 1); announce(next, sel + 1); }
    } else if (e.key === 'Escape') { edit.select(null); setSay('No corner selected'); }
  };
  // Undo and redo anywhere on the page while editing, except in a text field.
  useEffect(() => {
    if (!editing || !edit) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); edit.undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); edit.redo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [editing, edit]);

  // Attribution: always on screen while tiles are (the providers' terms).
  const act = real && bm.on ? activeBasemap(bm) : null;
  const credits = [act?.provider ? { text: act.provider.attribution, href: act.provider.attributionUrl } : null,
    props.terrain?.follow && props.terrain.model?.source === 'TERRARIUM' ? { text: 'Elevation: Terrain Tiles (Mapzen, AWS)', href: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' } : null].filter(Boolean) as { text: string; href?: string }[];
  const msg = edit && (editing || drawing) ? edit.msg : null;
  const btn = 'inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 sm:px-2 py-1 text-[11px] font-medium text-white hover:bg-black/80 disabled:opacity-40 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>span]:hidden sm:[&>span]:inline';

  return (
    <div className="relative w-full h-full">
      <canvas ref={ref} className="w-full h-full block outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, touchAction: editing || drawing ? 'none' : undefined }}
        role={editing || drawing ? "application" : "img"} tabIndex={editing || drawing ? 0 : -1}
        aria-label={editing ? 'Survey boundary editor. Drag a corner or click an edge\'s plus to add one. With the map focused: [ and ] select corners, arrow keys move the selected one, Delete removes it, Ctrl+Z undoes.'
          : drawing ? 'Drawing a boundary: click or tap to place each corner, click the first corner or press Enter to finish, Backspace removes the last, Escape cancels.'
          : 'Survey plan view: boundary, flight lines, photos and coverage'}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => endDrag(e, true)} onPointerCancel={e => endDrag(e, false)}
        onPointerLeave={() => { ui.current.hover = null; }} onKeyDown={onKeyDown} />
      {credits.length > 0 && (
        <div className={`absolute bottom-0 right-0 max-w-full truncate bg-white/75 px-1.5 py-px text-black/80 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
          {credits.map((c, i) => <React.Fragment key={c.text}>{i > 0 && ' · '}{c.href ? <a href={c.href} target="_blank" rel="noreferrer" className="hover:underline">{c.text}</a> : c.text}</React.Fragment>)}
        </div>
      )}
      {!compact && edit?.allowed && (
        <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 flex items-center gap-1 sm:gap-1.5 max-w-[85%]">
          {!editing && !drawing && real && <button type="button" className={btn} onClick={() => edit.setMode('EDIT')} aria-label="Edit boundary"><Pencil /><span>Edit boundary</span></button>}
          {editing && <>
            <button type="button" className={btn} onClick={() => edit.setMode('OFF')} aria-label="Done editing"><Check /><span>Done</span></button>
            <button type="button" className={btn} onClick={edit.undo} disabled={!edit.history.past.length} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo"><Undo2 /><span>Undo</span></button>
            <button type="button" className={btn} onClick={edit.redo} disabled={!edit.history.future.length} title="Redo (Shift+Ctrl/Cmd+Z)" aria-label="Redo"><Redo2 /><span>Redo</span></button>
            <button type="button" className={btn} disabled={edit.selected === null || site.boundary.length <= 3} title="Remove the selected corner (Delete)"
              onClick={() => { const i = edit.selected; if (i === null) return; const next = deleteCorner(site.boundary, i); if (next && edit.commit(next)) edit.select(Math.min(i, next.length - 1)); }} aria-label="Delete corner"><Trash2 /><span>Delete corner</span></button>
            <span className="hidden lg:inline rounded-md bg-black/55 px-2 py-1 text-[11px] text-white/85">Drag a corner · + adds one · arrows nudge</span>
          </>}
          {drawing && <>
            <button type="button" className={btn} onClick={edit.finishDraw} disabled={edit.draw.length < 3} aria-label="Use this boundary"><Check /><span>Use this boundary</span></button>
            <button type="button" className={btn} onClick={() => edit.setDraw(edit.draw.slice(0, -1))} disabled={!edit.draw.length} aria-label="Remove the last corner"><Undo2 /><span>Last corner</span></button>
            <button type="button" className={btn} onClick={() => edit.setMode('OFF')} aria-label="Cancel drawing"><X /><span>Cancel</span></button>
            <span className="hidden sm:inline rounded-md bg-black/55 px-2 py-1 text-[11px] text-white/85">{edit.draw.length} corner{edit.draw.length === 1 ? '' : 's'} · click to place, first corner or Enter to finish</span>
          </>}
        </div>
      )}
      {msg && (msg.errors.length > 0 || msg.warnings.length > 0) && (
        <div role="alert" className={`absolute top-12 left-1/2 -translate-x-1/2 max-w-[80%] rounded-md px-2.5 py-1.5 text-[12px] font-medium shadow ${msg.errors.length ? 'bg-bad text-white' : 'bg-warn text-black'}`}>
          {msg.errors[0] ?? msg.warnings[0]}
        </div>
      )}
      <div aria-live="polite" className="sr-only">{say}</div>
    </div>
  );
};
