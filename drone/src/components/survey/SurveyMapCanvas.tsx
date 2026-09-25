import React, { useEffect, useRef } from 'react';
import { WORLD_M, siteImagery } from '../../survey/site';
import { usesDemoGeometry, type SurveySite } from '../../survey/boundary';
import { GOOD_VIEWS, type CoverageGrid, type Leg, type SurveyPlan, type Pt } from '../../survey/plan';
import type { Photo, SurveyAircraft } from '../../hooks/useSurveyMission';
import type { SurveyLayer } from './SurveyScanCanvas3D';

/**
 * Plan view of the survey: the orthophoto revealed where photographed (on the
 * demo venue; a real site draws on a survey grid), the boundary, the geofence,
 * flight lines (flown in accent, remaining dashed), every photo, and the
 * aircraft with its camera footprint. Remount it (key) when the site changes.
 */

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
}

export const MAP_W = 1280, MAP_H = 720;
const ACCENT = '#fb923c';
const MARGIN_M = 55;

export const SurveyMapCanvas: React.FC<Props> = (props) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props); propsRef.current = props;

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = MAP_W * dpr; cv.height = MAP_H * dpr;
    const site = propsRef.current.site, demo = usesDemoGeometry(site);
    const img = demo ? siteImagery(2048) : null; const ipm = img ? img.width / WORLD_M : 1;

    // View: fit the boundary (and home) with a margin, centred.
    const fitPts = [...site.boundary, site.home];
    const xs = fitPts.map(p => p.x), ys = fitPts.map(p => p.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const margin = Math.max(MARGIN_M, span * 0.12);
    const x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin, y0 = Math.min(...ys) - margin, y1 = Math.max(...ys) + margin;
    const s = Math.min(MAP_W / (x1 - x0), MAP_H / (y1 - y0));
    const ox = MAP_W / 2 - ((x0 + x1) / 2) * s, oy = MAP_H / 2 - ((y0 + y1) / 2) * s;
    const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
    const vx0 = -ox / s, vy0 = -oy / s; // world at canvas (0,0)

    // Coverage veil, redrawn only when coverage or layer changes.
    const veil = document.createElement('canvas'); veil.width = MAP_W; veil.height = MAP_H;
    const vctx = veil.getContext('2d')!;
    let veilKey = '';
    const drawVeil = (grid: CoverageGrid, layer: SurveyLayer) => {
      const key = `${grid.version}:${layer}`; if (key === veilKey) return; veilKey = key;
      vctx.clearRect(0, 0, MAP_W, MAP_H);
      vctx.fillStyle = 'rgba(4,7,14,0.66)'; vctx.fillRect(0, 0, MAP_W, MAP_H);
      const cs = grid.cellM * s;
      for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
        const i = r * grid.cols + c; if (!grid.inside[i]) continue;
        const px = X(grid.minX + c * grid.cellM), py = Y(grid.minY + r * grid.cellM);
        vctx.clearRect(px, py, cs + 0.5, cs + 0.5);
        const v = grid.views[i];
        if (layer === 'OVERLAP') {
          vctx.fillStyle = v === 0 ? 'rgba(8,10,14,0.86)' : v >= GOOD_VIEWS ? 'rgba(46,184,92,0.55)' : v >= 2 ? 'rgba(242,158,31,0.65)' : 'rgba(230,51,51,0.7)';
          vctx.fillRect(px, py, cs + 0.5, cs + 0.5);
        } else if (v === 0) { vctx.fillStyle = 'rgba(4,8,16,0.86)'; vctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
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

    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 60) return; // ~15 fps is plenty for a plan view
      last = t;
      const P = propsRef.current; const a = P.aircraft; const pl = P.plan;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, MAP_W, MAP_H);
      if (img) ctx.drawImage(img, (vx0 + WORLD_M / 2) * ipm, (vy0 + WORLD_M / 2) * ipm, (MAP_W / s) * ipm, (MAP_H / s) * ipm, 0, 0, MAP_W, MAP_H);
      else {
        // A real site: no imagery here, so a survey grid at a step that suits the scale.
        const stepM = [10, 25, 50, 100, 250, 500, 1000].find(m => m * s >= 28) ?? 1000;
        ctx.fillStyle = '#101722'; ctx.fillRect(0, 0, MAP_W, MAP_H);
        for (let m = Math.floor(vx0 / stepM) * stepM; m < vx0 + MAP_W / s; m += stepM) { ctx.fillStyle = m % (stepM * 4) === 0 ? 'rgba(120,150,200,0.22)' : 'rgba(120,150,200,0.09)'; ctx.fillRect(X(m), 0, 1, MAP_H); }
        for (let m = Math.floor(vy0 / stepM) * stepM; m < vy0 + MAP_H / s; m += stepM) { ctx.fillStyle = m % (stepM * 4) === 0 ? 'rgba(120,150,200,0.22)' : 'rgba(120,150,200,0.09)'; ctx.fillRect(0, Y(m), MAP_W, 1); }
      }
      drawVeil(P.grid, P.layer); ctx.drawImage(veil, 0, 0);

      // Boundary
      ctx.beginPath(); site.boundary.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath();
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      // Geofence: where the autopilot will stop the aircraft.
      if (P.fence?.length) {
        ctx.beginPath(); P.fence.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath();
        ctx.strokeStyle = 'rgba(248,113,113,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
      // Corners marked so far while walking the boundary.
      if (P.draft?.length) {
        ctx.beginPath(); P.draft.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); if (P.draft.length > 2) ctx.closePath();
        ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.stroke();
        P.draft.forEach((p, i) => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 5, 0, Math.PI * 2); ctx.fillStyle = '#fde68a'; ctx.fill(); ctx.fillStyle = '#111'; ctx.font = '600 9px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), X(p.x), Y(p.y) + 3); ctx.textAlign = 'left'; });
      }

      // Flight path
      const legs = P.legs;
      ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.beginPath();
      legs.forEach((g, i) => { if (i < P.legIndex) return; const from = i === P.legIndex ? a : g.a; ctx.moveTo(X(from.x), Y(from.y)); ctx.lineTo(X(g.b.x), Y(g.b.y)); });
      ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.beginPath();
      legs.forEach((g, i) => { if (i > P.legIndex || !g.capture) return; ctx.moveTo(X(g.a.x), Y(g.a.y)); const to = i === P.legIndex ? a : g.b; ctx.lineTo(X(to.x), Y(to.y)); });
      ctx.stroke();

      // Photos
      const photos = P.photosRef.current ?? [];
      for (const ph of photos) {
        if (ph.ok) { ctx.fillStyle = 'rgba(255,226,190,0.9)'; ctx.fillRect(X(ph.x) - 1, Y(ph.y) - 1, 2, 2); }
        else { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(ph.x) - 3, Y(ph.y) - 3); ctx.lineTo(X(ph.x) + 3, Y(ph.y) + 3); ctx.moveTo(X(ph.x) + 3, Y(ph.y) - 3); ctx.lineTo(X(ph.x) - 3, Y(ph.y) + 3); ctx.stroke(); }
      }

      // Home
      const home = P.site.home;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(home.x), Y(home.y), 8, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center'; ctx.fillText('H', X(home.x), Y(home.y) + 3.5); ctx.textAlign = 'left';

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

      if (!P.compact) {
        // Scale bar + north
        const barM = [25, 50, 100, 250, 500, 1000, 2000].find(m => m * s >= 90) ?? 2000, bar = barM * s;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(16, MAP_H - 38, bar + 24, 24);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28, MAP_H - 22); ctx.lineTo(28 + bar, MAP_H - 22); ctx.stroke();
        ctx.font = '11px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(barM >= 1000 ? `${barM / 1000} km` : `${barM} m`, 28, MAP_H - 27);
        ctx.beginPath(); ctx.moveTo(MAP_W - 28, 44); ctx.lineTo(MAP_W - 22, 30); ctx.lineTo(MAP_W - 16, 44); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
        ctx.textAlign = 'center'; ctx.fillText('N', MAP_W - 22, 58); ctx.textAlign = 'left';
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="w-full h-full block" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }} role="img" aria-label="Survey plan view: boundary, flight lines, photos and coverage" />;
};
