import React, { useEffect, useRef, useState } from 'react';
import { gridCols, readiness, SHOW_MIN_BATTERY, type AircraftHealth, type Readiness } from '../../diagnostics/fleet';
import { LIMITS } from '../../diagnostics/health';
import { DECK } from './Instruments';

/**
 * The fleet on its launch grid: one cell per pad, 100 to 500 of them, drawn on
 * a canvas so the whole fleet redraws in a frame. Colour by health (with a
 * shape per state: dot, notched ring, cross, dashed ring, so it reads without
 * colour) or by one reading on a single-hue scale, where cells past the watch
 * or fault line also get an amber or red ring. Hover for the readings, click
 * to open that aircraft.
 */

export type ColorBy = 'HEALTH' | 'BATTERY' | 'VIBRATION' | 'BALANCE' | 'TEMPERATURE' | 'MARGIN';
export type Filter = 'ALL' | 'ATTENTION' | 'GROUNDED' | 'SILENT';

export const COLOR_BY: { id: ColorBy; label: string }[] = [
  { id: 'HEALTH', label: 'Health' }, { id: 'BATTERY', label: 'Battery' }, { id: 'VIBRATION', label: 'Vibration' },
  { id: 'BALANCE', label: 'Motor balance' }, { id: 'TEMPERATURE', label: 'Motor temp' }, { id: 'MARGIN', label: 'Closest to a limit' },
];

/** A reading on 0..1 for the scale, and whether it is past its watch / fault line. */
function metric(a: AircraftHealth, by: ColorBy): { v: number | null; watch: boolean; fault: boolean; text: string } {
  switch (by) {
    case 'BATTERY': return a.batteryPct == null ? { v: null, watch: false, fault: false, text: '—' } : { v: a.batteryPct / 100, watch: a.batteryPct < SHOW_MIN_BATTERY, fault: a.batteryPct < 20, text: `${Math.round(a.batteryPct)}%` };
    case 'VIBRATION': return a.vibe == null ? { v: null, watch: false, fault: false, text: '—' } : { v: Math.min(1, a.vibe / 90), watch: a.vibe >= LIMITS.vibeWatch, fault: a.vibe >= LIMITS.vibeFault, text: `${Math.round(a.vibe)} m/s²` };
    case 'BALANCE': return a.motorDev == null ? { v: null, watch: false, fault: false, text: '—' } : { v: Math.min(1, a.motorDev / 25), watch: a.motorDev >= LIMITS.motorWatchPct, fault: a.motorDev >= LIMITS.motorFaultPct, text: `${a.motorDev.toFixed(1)}%` };
    case 'TEMPERATURE': return a.escMaxC == null ? { v: null, watch: false, fault: false, text: '—' } : { v: Math.min(1, Math.max(0, (a.escMaxC - 20) / 80)), watch: a.escMaxC >= LIMITS.escWatchC, fault: a.escMaxC >= LIMITS.escFaultC, text: `${Math.round(a.escMaxC)} °C` };
    case 'MARGIN': return { v: a.overall === 'UNKNOWN' ? null : Math.min(1, a.margin / 1.25), watch: a.margin >= 0.5, fault: a.margin >= 1, text: a.overall === 'UNKNOWN' ? '—' : `${Math.round(a.margin * 100)}%` };
    default: return { v: null, watch: false, fault: false, text: '' };
  }
}

/** Single-hue scale for the dark deck: deep blue (low) to bright cyan (high). */
function ramp(t: number) {
  const a = [18, 44, 74], b = [140, 228, 255];
  const k = Math.pow(Math.max(0, Math.min(1, t)), 0.8);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)}, ${Math.round(a[1] + (b[1] - a[1]) * k)}, ${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

const STATE: Record<Readiness, { color: string; label: string }> = {
  READY: { color: DECK.ok, label: 'Ready' }, WATCH: { color: DECK.warn, label: 'Watch' }, GROUNDED: { color: DECK.bad, label: 'Grounded' }, SILENT: { color: DECK.ink3, label: 'Not reporting' },
};

export const matchesFilter = (a: AircraftHealth, f: Filter) => {
  const r = readiness(a);
  return f === 'ALL' || (f === 'ATTENTION' && r !== 'READY') || (f === 'GROUNDED' && r === 'GROUNDED') || (f === 'SILENT' && r === 'SILENT');
};

export const FleetGrid: React.FC<{ list: AircraftHealth[]; colorBy: ColorBy; filter: Filter; selected: string | null; onSelect: (id: string) => void }> = ({ list, colorBy, filter, selected, onSelect }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ a: AircraftHealth; x: number; y: number } | null>(null);
  const n = list.length, cols = gridCols(n || 1), rows = Math.ceil(n / cols);
  const LW = 26, TH = 18;
  const cell = Math.max(9, Math.min(38, Math.floor((width - LW) / cols)));
  const H = TH + rows * cell + 4;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(H * dpr);
    c.style.width = `${width}px`; c.style.height = `${H}px`;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, H);
    g.font = `500 ${Math.max(8, Math.min(10, cell * 0.42))}px "JetBrains Mono", ui-monospace, monospace`;
    g.textBaseline = 'middle';
    // Column numbers every 5, row letters.
    g.fillStyle = DECK.ink3; g.textAlign = 'center';
    for (let cI = 0; cI < cols; cI++) if (cI === 0 || (cI + 1) % 5 === 0) g.fillText(String(cI + 1), LW + cI * cell + cell / 2, TH / 2);
    g.textAlign = 'right';
    const step = cell < 14 ? 2 : 1;
    for (let r = 0; r < rows; r++) if (r % step === 0) g.fillText(list[r * cols]?.pad.replace(/\d+$/, '') ?? '', LW - 6, TH + r * cell + cell / 2);

    list.forEach((a, i) => {
      const x = LW + (i % cols) * cell, y = TH + Math.floor(i / cols) * cell;
      const cx = x + cell / 2, cy = y + cell / 2, R = cell * 0.36;
      const on = matchesFilter(a, filter);
      g.globalAlpha = on ? 1 : 0.16;
      // pad plate
      g.fillStyle = 'rgba(90, 210, 255, 0.05)';
      g.beginPath(); g.roundRect(x + 1, y + 1, cell - 2, cell - 2, Math.min(5, cell * 0.18)); g.fill();
      const st = readiness(a);
      if (colorBy === 'HEALTH' || st === 'SILENT') {
        const col = STATE[st].color;
        g.lineWidth = Math.max(1.2, cell * 0.07);
        if (st === 'READY') {
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6); gr.addColorStop(0, col); gr.addColorStop(0.45, col + 'aa'); gr.addColorStop(1, col + '00');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 1.5, 0, Math.PI * 2); g.fill();
          g.fillStyle = col; g.beginPath(); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.fill();
        } else if (st === 'WATCH') {
          g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, R, 0.35, Math.PI * 2 - 0.35); g.stroke();          // notched ring
          g.fillStyle = col; g.beginPath(); g.arc(cx, cy, R * 0.38, 0, Math.PI * 2); g.fill();
        } else if (st === 'GROUNDED') {
          g.fillStyle = col + '44'; g.beginPath(); g.arc(cx, cy, R * 1.05, 0, Math.PI * 2); g.fill();
          g.strokeStyle = col; g.lineWidth = Math.max(1.6, cell * 0.1); const k = R * 0.62;
          g.beginPath(); g.moveTo(cx - k, cy - k); g.lineTo(cx + k, cy + k); g.moveTo(cx + k, cy - k); g.lineTo(cx - k, cy + k); g.stroke();
        } else {
          g.strokeStyle = col; g.setLineDash([2, 2.5]); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        }
      } else {
        const m = metric(a, colorBy);
        if (m.v != null) {
          g.fillStyle = ramp(m.v); g.beginPath(); g.roundRect(x + cell * 0.16, y + cell * 0.16, cell * 0.68, cell * 0.68, Math.min(4, cell * 0.14)); g.fill();
          if (m.watch) { g.strokeStyle = m.fault ? DECK.bad : DECK.warn; g.lineWidth = Math.max(1.4, cell * 0.08); g.beginPath(); g.roundRect(x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, Math.min(5, cell * 0.18)); g.stroke(); }
        }
      }
      if (a.id === selected) { g.globalAlpha = 1; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x + 0.5, y + 0.5, cell - 1, cell - 1, Math.min(6, cell * 0.2)); g.stroke(); }
    });
    g.globalAlpha = 1;
  }, [list, colorBy, filter, selected, width, cell, cols, rows, H]);

  const at = (e: React.MouseEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    const x = e.clientX - b.left - LW, y = e.clientY - b.top - TH;
    if (x < 0 || y < 0) return null;
    const i = Math.floor(y / cell) * cols + Math.floor(x / cell);
    return Math.floor(x / cell) < cols && list[i] ? { a: list[i], x: e.clientX - b.left, y: e.clientY - b.top } : null;
  };
  const m = hover && colorBy !== 'HEALTH' ? metric(hover.a, colorBy) : null;

  return (
    <div ref={wrap} className="relative w-full">
      <canvas ref={canvas} role="img" className="block cursor-pointer"
        aria-label={`Launch grid of ${n} aircraft. ${list.filter(a => readiness(a) === 'READY').length} ready, ${list.filter(a => readiness(a) === 'WATCH').length} to watch, ${list.filter(a => readiness(a) === 'GROUNDED').length} grounded, ${list.filter(a => readiness(a) === 'SILENT').length} not reporting. The table below lists every aircraft.`}
        onMouseMove={e => setHover(at(e))} onMouseLeave={() => setHover(null)} onClick={e => { const h = at(e); if (h) onSelect(h.a.id); }} />
      {hover && (
        <div className="holo-tag pointer-events-none z-10" style={{ transform: `translate(${Math.min(width - 230, Math.max(0, hover.x + 12))}px, ${hover.y + 14}px)`, whiteSpace: 'normal', width: 220 }}>
          <div><b>{hover.a.pad}</b> <span>{hover.a.id}</span> <em data-l={readiness(hover.a) === 'GROUNDED' ? 'FAULT' : readiness(hover.a) === 'WATCH' ? 'WATCH' : ''} style={{ color: STATE[readiness(hover.a)].color }}>{STATE[readiness(hover.a)].label}</em></div>
          {m && <div><span>{COLOR_BY.find(c => c.id === colorBy)?.label}:</span> {m.text}</div>}
          <div><span>Battery</span> {hover.a.batteryPct != null ? `${Math.round(hover.a.batteryPct)}%` : '—'} <span>· vib</span> {hover.a.vibe != null ? Math.round(hover.a.vibe) : '—'} <span>· sats</span> {hover.a.sats ?? '—'}</div>
          {hover.a.top && <div style={{ color: hover.a.top.level === 'FAULT' ? DECK.bad : DECK.warn }}>{hover.a.top.title}</div>}
        </div>
      )}
    </div>
  );
};

/** Legend for the current colouring. */
export const GridLegend: React.FC<{ colorBy: ColorBy }> = ({ colorBy }) => {
  const txt = { font: '500 10.5px "JetBrains Mono", monospace', color: DECK.ink2 } as const;
  if (colorBy === 'HEALTH') return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={txt}>
      {(['READY', 'WATCH', 'GROUNDED', 'SILENT'] as Readiness[]).map(r => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden>
            {r === 'READY' && <circle cx="7" cy="7" r="3" fill={STATE[r].color} />}
            {r === 'WATCH' && <><path d="M 11.4 5.6 A 4.6 4.6 0 1 0 11.4 8.4" fill="none" stroke={STATE[r].color} strokeWidth="1.6" /><circle cx="7" cy="7" r="1.7" fill={STATE[r].color} /></>}
            {r === 'GROUNDED' && <path d="M4 4 L10 10 M10 4 L4 10" stroke={STATE[r].color} strokeWidth="2" />}
            {r === 'SILENT' && <circle cx="7" cy="7" r="4.6" fill="none" stroke={STATE[r].color} strokeWidth="1.4" strokeDasharray="2 2" />}
          </svg>{STATE[r].label}
        </span>
      ))}
    </div>
  );
  const ends: Record<ColorBy, [string, string]> = { HEALTH: ['', ''], BATTERY: ['0%', '100%'], VIBRATION: ['0', '90 m/s²'], BALANCE: ['0%', '25%'], TEMPERATURE: ['20 °C', '100 °C'], MARGIN: ['far', 'past fault'] };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={txt}>
      <span>{ends[colorBy][0]}</span>
      <span className="inline-block h-2.5 w-28 rounded" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.5)}, ${ramp(1)})` }} aria-hidden />
      <span>{ends[colorBy][1]}</span>
      <span className="inline-flex items-center gap-1.5 ml-2"><span className="inline-block w-3 h-3 rounded-[3px] border-2" style={{ borderColor: DECK.warn }} />past watch</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px] border-2" style={{ borderColor: DECK.bad }} />past fault</span>
    </div>
  );
};
