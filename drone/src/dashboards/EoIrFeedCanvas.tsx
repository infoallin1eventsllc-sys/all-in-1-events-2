import React, { useEffect, useRef, useState } from 'react';
import type { Threat } from '../hooks/useDefenseSimulation';
import { fbm } from './terrain';

/**
 * Ground-based EO/IR camera slewed onto a threat track.
 *
 * Sky background with a terrain silhouette, the target drone drawn as a quad
 * silhouette sized by range. In thermal it renders as a hot body with four
 * motor hot-spots and a warm battery core — the signature an operator uses
 * to confirm a classification before engaging.
 */

interface Props {
  target: Threat | null;
  rangeM: number;
  mode: 'EO' | 'IR';
  onSetMode: (m: 'EO' | 'IR') => void;
  isNight: boolean;
}

export const EoIrFeedCanvas: React.FC<Props> = ({ target, rangeM, mode, onSetMode, isNight }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ target, rangeM, mode, isNight });
  stateRef.current = { target, rangeM, mode, isNight };
  const [clock, setClock] = useState('');

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    let raf = 0, frame = 0;
    const draw = () => {
      frame++;
      const { target, rangeM, mode, isNight } = stateRef.current;
      const ir = mode === 'IR';
      const now = performance.now();

      // Sky
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (ir) { g.addColorStop(0, '#0b0f14'); g.addColorStop(1, '#3a4149'); }
      else if (isNight) { g.addColorStop(0, '#03040a'); g.addColorStop(1, '#0d1220'); }
      else { g.addColorStop(0, '#5b86b8'); g.addColorStop(1, '#a9c2dd'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Terrain silhouette along the bottom
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) ctx.lineTo(x, H * 0.82 - fbm(x * 0.006, 3.3, 11, 3) * H * 0.22);
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = ir ? '#6b7280' : isNight ? '#05070c' : '#2f4a35'; ctx.fill();

      if (target) {
        // Slew jitter and size by range.
        const jx = Math.sin(now / 530) * 6 + (Math.random() - 0.5) * 1.5, jy = Math.cos(now / 710) * 4 + (Math.random() - 0.5) * 1.5;
        const cx = W / 2 + jx, cy = H * 0.42 + jy;
        const size = Math.max(10, Math.min(90, 9000 / Math.max(80, rangeM)));
        const spin = now / 60;
        const disrupting = target.status === 'DISRUPTING';
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(now / 900) * 0.15 + (disrupting ? Math.sin(now / 90) * 0.25 : 0));
        if (ir) {
          // Hot body + four motors
          const body = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.55);
          body.addColorStop(0, 'rgba(255,255,255,1)'); body.addColorStop(0.5, 'rgba(230,230,230,0.9)'); body.addColorStop(1, 'rgba(120,120,120,0)');
          ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 4; i++) {
            const a = (Math.PI / 4) + (i * Math.PI) / 2;
            const mx = Math.cos(a) * size, my = Math.sin(a) * size * 0.45;
            ctx.strokeStyle = 'rgba(200,200,200,0.8)'; ctx.lineWidth = Math.max(1, size * 0.08);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(mx, my); ctx.stroke();
            const mg = ctx.createRadialGradient(mx, my, 0, mx, my, size * 0.32);
            mg.addColorStop(0, 'rgba(255,255,255,1)'); mg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, size * 0.32, 0, Math.PI * 2); ctx.fill();
            // rotor disc blur
            ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(mx, my, size * 0.38, size * 0.16, spin + i, 0, Math.PI * 2); ctx.stroke();
          }
        } else {
          ctx.fillStyle = isNight ? 'rgba(20,24,32,0.95)' : '#111827';
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, size * 0.08);
          for (let i = 0; i < 4; i++) {
            const a = (Math.PI / 4) + (i * Math.PI) / 2;
            const mx = Math.cos(a) * size, my = Math.sin(a) * size * 0.45;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(mx, my); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(mx, my, size * 0.38, size * 0.16, spin + i, 0, Math.PI * 2);
            ctx.fillStyle = isNight ? 'rgba(20,24,32,0.5)' : 'rgba(17,24,39,0.45)'; ctx.fill();
            ctx.fillStyle = isNight ? 'rgba(20,24,32,0.95)' : '#111827';
          }
          ctx.beginPath(); ctx.ellipse(0, 0, size * 0.5, size * 0.28, 0, 0, Math.PI * 2); ctx.fill();
          if (isNight) { ctx.fillStyle = target.classification === 'FPV_ANALOG' ? '#ef4444' : '#22c55e'; ctx.beginPath(); ctx.arc(size * 0.5, size * 0.1, 1.5, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();

        // Track gate
        const gw = size * 2.6, gh = size * 1.6;
        ctx.strokeStyle = disrupting ? '#fb7185' : '#f8fafc'; ctx.lineWidth = 1;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(cx + sx * gw / 2, cy + sy * (gh / 2 - 8)); ctx.lineTo(cx + sx * gw / 2, cy + sy * gh / 2); ctx.lineTo(cx + sx * (gw / 2 - 8), cy + sy * gh / 2); ctx.stroke();
        });
      }

      // Sensor character
      if (ir) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; if (frame % 3 === 0) ctx.fillRect(0, (frame * 7) % H, W, 2); }
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
      // Reticle
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.42, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 - 34, H * 0.42); ctx.lineTo(W / 2 - 26, H * 0.42); ctx.moveTo(W / 2 + 26, H * 0.42); ctx.lineTo(W / 2 + 34, H * 0.42);
      ctx.moveTo(W / 2, H * 0.42 - 34); ctx.lineTo(W / 2, H * 0.42 - 26); ctx.moveTo(W / 2, H * 0.42 + 26); ctx.lineTo(W / 2, H * 0.42 + 34); ctx.stroke();

      if (frame % 15 === 0) setClock(new Date().toLocaleTimeString([], { hour12: false }));
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
      <canvas ref={ref} width={480} height={270} className="w-full h-full block" role="img" aria-label="EO/IR camera feed" />
      <div className="absolute inset-0 pointer-events-none font-mono text-[10px] text-slate-100">
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-black/60 font-bold">EO/IR-1</span>
            <span className={`px-1.5 py-0.5 rounded bg-black/60 font-bold ${mode === 'IR' ? 'text-rose-300' : 'text-sky-300'}`}>{mode === 'IR' ? 'IR · WHITE HOT' : 'EO · 30× OPTICAL'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE</span>
            <span className="px-1.5 py-0.5 rounded bg-black/60 tabular-nums">{clock}</span>
          </div>
        </div>
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
          <div className="px-1.5 py-0.5 rounded bg-black/60">
            {target ? <><b>{target.id}</b> · {target.classification.replace('_', ' ')} · LRF <b>{rangeM.toFixed(0)} m</b> · {target.altitudeM.toFixed(0)} m AGL{mode === 'IR' && <span className="text-rose-200"> · 4 MOTOR HOT-SPOTS</span>}</> : <span className="text-slate-400">NO TRACK SELECTED — CAMERA PARKED</span>}
          </div>
          <div className="pointer-events-auto flex items-center gap-1">
            {(['EO', 'IR'] as const).map(m => (
              <button key={m} onClick={() => onSetMode(m)} aria-pressed={mode === m} className={`px-1.5 py-0.5 rounded bg-black/60 border ${mode === m ? 'border-white/60 text-white' : 'border-transparent text-slate-400 hover:text-slate-100'}`}>{m}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
