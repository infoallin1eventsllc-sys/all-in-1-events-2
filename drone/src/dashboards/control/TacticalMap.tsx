import React, { useEffect, useRef, useState } from 'react';
import type { VehicleView } from '../../control/useControl';
import { DECK } from '../health/Instruments';

/**
 * The flying field from above, and from the side. Every aircraft at its real
 * position (local metres), drawn smoothly between telemetry updates from its
 * velocity; its launch pad; where it has been told to go. Status reads by shape
 * as well as colour: hollow on the ground, amber ring armed, filled and glowing
 * in the air (brighter higher), dashed ring not reporting, red cross crashed.
 *
 * Fleet: drag a box to select (Shift adds), click an aircraft to toggle it.
 * One aircraft: the view follows it; with "click to fly there" on, a click on
 * the field sets its target.
 */

interface Props {
  vehicles: VehicleView[];
  updatedAt: number;
  selected: Set<string>;
  focus?: string | null;
  goMode?: boolean;
  onSelect?: (ids: string[], additive: boolean) => void;
  onPick?: (id: string) => void;
  onTarget?: (x: number, y: number) => void;
  height?: number;
}

const SIDE_H = 86;

export const TacticalMap: React.FC<Props> = ({ vehicles, updatedAt, selected, focus, goMode, onSelect, onPick, onTarget, height = 440 }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const live = useRef({ vehicles, updatedAt, selected, focus, goMode });
  live.current = { vehicles, updatedAt, selected, focus, goMode };
  const view = useRef({ cx: 0, cy: 0, s: 4 });              // centre (m) and pixels per metre
  const drag = useRef<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  const [hover, setHover] = useState<{ v: VehicleView; x: number; y: number } | null>(null);
  const mapH = height - SIDE_H;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Screen <-> field.
  const toScreen = (x: number, y: number) => { const v = view.current; return [w / 2 + (x - v.cx) * v.s, mapH / 2 - (y - v.cy) * v.s] as const; };
  const toField = (px: number, py: number) => { const v = view.current; return [v.cx + (px - w / 2) / v.s, v.cy - (py - mapH / 2) / v.s] as const; };

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(height * dpr); c.style.width = `${w}px`; c.style.height = `${height}px`;
    const g = c.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { vehicles: vs, updatedAt: at, selected: sel, focus: fid, goMode: go } = live.current;
      const since = Math.min(0.4, (performance.now() - at) / 1000);
      const pos = vs.map(v => ({ v, x: v.x + v.vx * since, y: v.y + v.vy * since, z: Math.max(0, v.alt + v.vz * since) }));
      // Frame: follow one aircraft, or fit the whole field.
      const f = fid ? pos.find(p => p.v.id === fid) : null;
      if (f) { const t = view.current; t.cx += (f.x - t.cx) * 0.15; t.cy += (f.y - t.cy) * 0.15; t.s += (Math.min(w, mapH) / 70 - t.s) * 0.1; }
      else if (pos.length) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pos) { x0 = Math.min(x0, p.x, p.v.home.x); x1 = Math.max(x1, p.x, p.v.home.x); y0 = Math.min(y0, p.y, p.v.home.y); y1 = Math.max(y1, p.y, p.v.home.y); }
        const s = Math.min((w - 60) / Math.max(20, x1 - x0), (mapH - 60) / Math.max(20, y1 - y0));
        const t = view.current; t.cx += ((x0 + x1) / 2 - t.cx) * 0.2; t.cy += ((y0 + y1) / 2 - t.cy) * 0.2; t.s += (s - t.s) * 0.2;
      }
      const s = view.current.s;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, height);
      // Field grid: 5 m, stronger every 25 m.
      const [fx0, fy1] = toField(0, 0), [fx1, fy0] = toField(w, mapH);
      // Coarsen the grid as the view widens, so no frame ever draws more than about 200 lines.
      let step = s < 2 ? 25 : 5;
      while ((fx1 - fx0) / step + (fy1 - fy0) / step > 200) step *= 5;
      for (let gx = Math.floor(fx0 / step) * step; gx <= fx1; gx += step) { const [sx] = toScreen(gx, 0); g.strokeStyle = gx % (step * 5) === 0 || (step === 5 && gx % 25 === 0) ? 'rgba(90,210,255,0.12)' : 'rgba(90,210,255,0.05)'; g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, mapH); g.stroke(); }
      for (let gy = Math.floor(fy0 / step) * step; gy <= fy1; gy += step) { const [, sy] = toScreen(0, gy); g.strokeStyle = gy % (step * 5) === 0 || (step === 5 && gy % 25 === 0) ? 'rgba(90,210,255,0.12)' : 'rgba(90,210,255,0.05)'; g.beginPath(); g.moveTo(0, sy); g.lineTo(w, sy); g.stroke(); }
      const r = Math.max(2.2, Math.min(9, s * 0.9));
      // Pads.
      g.fillStyle = 'rgba(90,210,255,0.08)';
      for (const p of pos) { const [hx, hy] = toScreen(p.v.home.x, p.v.home.y); g.fillRect(hx - r * 1.1, hy - r * 1.1, r * 2.2, r * 2.2); }
      // Targets.
      g.setLineDash([3, 3]); g.strokeStyle = 'rgba(219,231,245,0.35)';
      for (const p of pos) if (p.v.target && p.v.airborne && (Math.hypot(p.v.target.x - p.x, p.v.target.y - p.y) > 1)) {
        const [ax, ay] = toScreen(p.x, p.y), [tx, ty] = toScreen(p.v.target.x, p.v.target.y);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(tx, ty); g.stroke();
        g.beginPath(); g.moveTo(tx - 4, ty); g.lineTo(tx + 4, ty); g.moveTo(tx, ty - 4); g.lineTo(tx, ty + 4); g.stroke();
      }
      g.setLineDash([]);
      // Aircraft.
      const maxZ = Math.max(30, ...pos.map(p => p.z));
      for (const p of pos) {
        const [x, y] = toScreen(p.x, p.y), v = p.v;
        const dim = fid && v.id !== fid ? 0.35 : 1;
        g.globalAlpha = dim;
        if (v.crashed) { g.strokeStyle = DECK.bad; g.lineWidth = 2; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
        else if (v.doing === 'Not reporting') { g.strokeStyle = DECK.ink3; g.lineWidth = 1.2; g.setLineDash([2, 2]); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
        else if (v.airborne) {
          const k = Math.min(1, p.z / maxZ);
          const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6); gr.addColorStop(0, `rgba(90,210,255,${0.5 + 0.5 * k})`); gr.addColorStop(1, 'rgba(90,210,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.6, 0, Math.PI * 2); g.fill();
          g.fillStyle = `rgb(${Math.round(120 + 100 * k)}, ${Math.round(210 + 30 * k)}, 255)`; g.beginPath(); g.arc(x, y, r * 0.75, 0, Math.PI * 2); g.fill();
        } else if (v.armed) { g.strokeStyle = DECK.warn; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 0.85, 0, Math.PI * 2); g.stroke(); }
        else { g.strokeStyle = 'rgba(159,178,201,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r * 0.7, 0, Math.PI * 2); g.stroke(); }
        if (v.health === 'GROUNDED' && !v.crashed) { g.fillStyle = DECK.bad; g.beginPath(); g.arc(x + r * 0.9, y - r * 0.9, Math.max(1.8, r * 0.32), 0, Math.PI * 2); g.fill(); }
        if (sel.has(v.id)) { g.globalAlpha = 1; g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, r * 1.45, 0, Math.PI * 2); g.stroke(); }
        if (s > 18 || v.id === fid) {
          g.globalAlpha = dim; g.fillStyle = DECK.ink2; g.font = '500 10px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(`${v.pad}${v.airborne ? ` ${p.z.toFixed(0)}m` : ''}`, x + r * 1.7, y);
        }
      }
      g.globalAlpha = 1;
      // Selection box.
      const d = drag.current;
      if (d) { g.strokeStyle = DECK.holo; g.fillStyle = 'rgba(90,210,255,0.08)'; g.lineWidth = 1; g.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); g.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); }
      // Scale bar and north.
      const bar = s < 2 ? 50 : s < 6 ? 10 : 5;
      g.strokeStyle = DECK.ink2; g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, mapH - 14); g.lineTo(14 + bar * s, mapH - 14); g.stroke();
      g.fillStyle = DECK.ink2; g.font = '500 10px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`${bar} m`, 14, mapH - 18);
      g.textAlign = 'center'; g.fillText('N', w - 18, 18); g.beginPath(); g.moveTo(w - 18, 22); g.lineTo(w - 22, 32); g.lineTo(w - 14, 32); g.closePath(); g.fill();
      if (go) { g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = DECK.holo; g.fillText('Click the field to fly there', w / 2, 10); }
      // Side view: east-west against height.
      const top = mapH + 8, bh = SIDE_H - 22;
      g.strokeStyle = DECK.line; g.beginPath(); g.moveTo(0, mapH + 0.5); g.lineTo(w, mapH + 0.5); g.stroke();
      const zTop = Math.max(40, Math.ceil((maxZ + 5) / 10) * 10);
      const zy = (z: number) => top + bh - (z / zTop) * bh;
      g.fillStyle = DECK.ink3; g.textAlign = 'left'; g.textBaseline = 'middle';
      for (const zz of [0, zTop / 2, zTop]) { g.strokeStyle = 'rgba(90,210,255,0.07)'; g.beginPath(); g.moveTo(34, zy(zz)); g.lineTo(w, zy(zz)); g.stroke(); g.fillText(`${zz} m`, 4, zy(zz)); }
      for (const p of pos) {
        const [x] = toScreen(p.x, p.y); if (x < 34) continue;
        g.globalAlpha = fid && p.v.id !== fid ? 0.3 : 0.9;
        g.fillStyle = p.v.crashed ? DECK.bad : p.v.airborne ? DECK.holo : p.v.armed ? DECK.warn : 'rgba(159,178,201,0.6)';
        g.beginPath(); g.arc(x, zy(p.z), sel.has(p.v.id) || p.v.id === fid ? 2.6 : 1.8, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1; g.fillStyle = DECK.ink3; g.textAlign = 'right'; g.fillText('side view, looking north', w - 8, top + 2);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [w, height, mapH]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = (px: number, py: number) => {
    const [fx, fy] = toField(px, py);
    let best: VehicleView | null = null, bd = 1e9;
    for (const v of live.current.vehicles) { const d = Math.hypot(v.x - fx, v.y - fy); if (d < bd) { bd = d; best = v; } }
    return best && bd * view.current.s < 14 ? best : null;
  };
  const local = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] as const; };

  return (
    <div ref={wrap} className="relative w-full select-none">
      <canvas ref={cv} role="img" className={`block ${goMode ? 'cursor-crosshair' : 'cursor-default'}`}
        aria-label={`Field map: ${vehicles.filter(v => v.airborne).length} of ${vehicles.length} aircraft in the air, ${selected.size} selected. The table below lists every aircraft.`}
        onPointerDown={e => { const [x, y] = local(e); if (y > mapH) return; (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x0: x, y0: y, x1: x, y1: y, add: e.shiftKey }; }}
        onPointerMove={e => {
          const [x, y] = local(e);
          if (drag.current) { drag.current.x1 = x; drag.current.y1 = y; }
          const n = y < mapH ? nearest(x, y) : null; setHover(n ? { v: n, x, y } : null);
        }}
        onPointerUp={e => {
          const d = drag.current; drag.current = null; if (!d) return;
          const [x, y] = local(e);
          if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 5) {
            const n = nearest(x, y);
            if (n) { onPick?.(n.id); onSelect?.([n.id], true); }
            else if (goMode && onTarget) { const [fx, fy] = toField(x, y); onTarget(fx, fy); }
            else if (!d.add) onSelect?.([], false);
            return;
          }
          const [ax, ay] = toField(Math.min(d.x0, d.x1), Math.max(d.y0, d.y1)), [bx, by] = toField(Math.max(d.x0, d.x1), Math.min(d.y0, d.y1));
          onSelect?.(live.current.vehicles.filter(v => v.x >= ax && v.x <= bx && v.y >= ay && v.y <= by).map(v => v.id), d.add);
        }}
        onPointerLeave={() => setHover(null)} />
      {hover && (
        <div className="holo-tag pointer-events-none z-10" style={{ transform: `translate(${Math.min(w - 200, hover.x + 12)}px, ${hover.y + 12}px)`, whiteSpace: 'normal', width: 190 }}>
          <div><b>{hover.v.pad}</b> <span>{hover.v.id}</span></div>
          <div>{hover.v.doing}{hover.v.airborne ? ` · ${hover.v.alt.toFixed(0)} m` : ''}</div>
          <div><span>mode</span> {String(hover.v.mode).toLowerCase()} <span>· battery</span> {hover.v.battery != null ? `${hover.v.battery}%` : '—'}</div>
        </div>
      )}
    </div>
  );
};
