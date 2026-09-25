import React, { useMemo, useRef, useState } from 'react';
import { Spline, Pentagon, MapPin, Trash2, Eye, EyeOff, TriangleAlert, CircleCheck, Download, Table2, X, Check } from 'lucide-react';
import { Section, Segmented, Toggle, ToolButton, Row, Divider } from '../../dashboards/ui';
import { DENSITIES, type Annotation, type BaseKind, type LineMeasure } from '../../survey/measure';
import { SITE_DATUM_M } from '../../survey/site';
import type { Measured, ResultsLayer, Tool } from './SurveyResultsViewer';

/**
 * The rail beside the results model: layers, measuring tools, the list of
 * measurements, and the figures for the one selected — volumes with cut, fill,
 * net and tonnage; lines with grades, a limit check and a cross-section.
 */

interface Props {
  items: Measured[];
  selectedId: string | null; onSelect: (id: string | null) => void;
  layer: ResultsLayer; onLayer: (l: ResultsLayer) => void;
  contours: boolean; onContours: (v: boolean) => void;
  tool: Tool; onTool: (t: Tool) => void; draftCount: number; onFinish: () => void; onCancel: () => void;
  onChange: (a: Annotation) => void; onDelete: (id: string) => void;
  onExport: () => void;
}

const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const ICON = { LINE: <Spline />, AREA: <Pentagon />, POINT: <MapPin /> };
const TOOL_HELP: Record<Exclude<Tool, null>, string> = {
  LINE: 'Click the model along the route; double-click (or Finish) to end.',
  AREA: 'Click round the area; double-click (or Finish) to close it.',
  POINT: 'Click a point on the model.',
};

export const SurveyResultsPanel: React.FC<Props> = (p) => {
  const sel = p.items.find(i => i.a.id === p.selectedId) ?? null;
  return (
    <div className="space-y-5">
      <Section title="Layers">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-ink-2">Surface</span>
          <Segmented size="sm" value={p.layer} onChange={p.onLayer} items={[{ id: 'PHOTO', label: 'Orthophoto' }, { id: 'ELEVATION', label: 'Elevation' }]} />
        </div>
        <div className="mt-2"><Toggle on={p.contours} onChange={p.onContours} label="Contours" description="Every 0.5 m, heavier every 2.5 m" /></div>
      </Section>

      <Section title="Measure" right={p.tool ? `${p.draftCount} point${p.draftCount === 1 ? '' : 's'}` : undefined}>
        <div className="flex flex-wrap gap-2">
          <ToolButton size="sm" icon={<Spline />} label="Distance & grade" active={p.tool === 'LINE'} onClick={() => p.onTool(p.tool === 'LINE' ? null : 'LINE')} />
          <ToolButton size="sm" icon={<Pentagon />} label="Area & volume" active={p.tool === 'AREA'} onClick={() => p.onTool(p.tool === 'AREA' ? null : 'AREA')} />
          <ToolButton size="sm" icon={<MapPin />} label="Spot height" active={p.tool === 'POINT'} onClick={() => p.onTool(p.tool === 'POINT' ? null : 'POINT')} />
        </div>
        {p.tool && (
          <div className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-[12px] text-ink-2">
            {TOOL_HELP[p.tool]}
            {p.tool !== 'POINT' && (
              <div className="mt-2 flex gap-2">
                <ToolButton size="sm" primary icon={<Check />} label="Finish" disabled={p.draftCount < (p.tool === 'AREA' ? 3 : 2)} onClick={p.onFinish} />
                <ToolButton size="sm" icon={<X />} label="Cancel" onClick={p.onCancel} />
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Measurements" right={<button type="button" onClick={p.onExport} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Download className="w-3 h-3" />GeoJSON</button>}>
        <ul className="-mx-2">
          {p.items.map(({ a }) => (
            <li key={a.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${a.id === p.selectedId ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
              <button type="button" aria-label={a.visible ? `Hide ${a.name}` : `Show ${a.name}`} onClick={() => p.onChange({ ...a, visible: !a.visible })} className="text-ink-3 hover:text-ink [&>svg]:w-3.5 [&>svg]:h-3.5">{a.visible ? <Eye /> : <EyeOff />}</button>
              <button type="button" onClick={() => p.onSelect(a.id === p.selectedId ? null : a.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <span className="text-ink-3 [&>svg]:w-3.5 [&>svg]:h-3.5">{ICON[a.kind]}</span>
                <span className="truncate text-[13px] text-ink">{a.name}</span>
              </button>
              <button type="button" aria-label={`Delete ${a.name}`} onClick={() => p.onDelete(a.id)} className="text-ink-3 hover:text-bad [&>svg]:w-3.5 [&>svg]:h-3.5"><Trash2 /></button>
            </li>
          ))}
          {!p.items.length && <li className="px-2 py-1.5 text-[12px] text-ink-3">No measurements yet.</li>}
        </ul>
      </Section>

      {sel && <><Divider /><Details key={sel.a.id} m={sel} onChange={p.onChange} /></>}
    </div>
  );
};

const Details: React.FC<{ m: Measured; onChange: (a: Annotation) => void }> = ({ m, onChange }) => {
  const { a } = m;
  const [name, setName] = useState(a.name);
  const nameRow = (
    <input value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== a.name && onChange({ ...a, name: name.trim() })} aria-label="Measurement name"
      className="w-full bg-transparent text-[15px] font-semibold text-ink border-b border-transparent hover:border-line focus:border-accent outline-none" />
  );
  if (a.kind === 'AREA' && m.area) {
    const A = m.area, dens = a.density ?? 1.6, base = a.base ?? { kind: 'PLANE' as BaseKind };
    return (
      <div className="space-y-4">
        {nameRow}
        <Section title="Volume">
          <Segmented size="sm" value={base.kind} onChange={(k: BaseKind) => onChange({ ...a, base: { kind: k, level: k === 'DESIGN' ? (base.level ?? A.baseAtCentre) : undefined } })}
            items={[{ id: 'PLANE', label: 'Fitted base', title: 'A plane through the ground round the edge: for stockpiles, even on a slope' }, { id: 'LOWEST', label: 'Lowest point', title: 'Level with the lowest point on the edge' }, { id: 'DESIGN', label: 'Level', title: 'A level you set: cut and fill to level a pad' }]} />
          {base.kind === 'DESIGN' && (
            <label className="mt-2 flex items-center justify-between gap-2 text-[13px] text-ink-2">Level to
              <span className="flex items-center gap-1"><input type="number" step={0.05} value={((base.level ?? A.baseAtCentre) + SITE_DATUM_M).toFixed(2)}
                onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange({ ...a, base: { kind: 'DESIGN', level: v - SITE_DATUM_M } }); }}
                className="w-24 h-8 rounded-lg border border-line bg-surface px-2 text-right num text-[13px] text-ink" /><span className="text-ink-3">m</span></span>
            </label>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Fig label="Cut" swatch="#e0604f" value={`${fmt(A.cutM3)} m³`} hint="above the base" />
            <Fig label="Fill" swatch="#3987e5" value={`${fmt(A.fillM3)} m³`} hint="below the base" />
            <Fig label="Net" value={`${A.netM3 >= 0 ? '' : '−'}${fmt(Math.abs(A.netM3))} m³`} hint={A.netM3 >= 0 ? 'to remove' : 'to bring in'} />
          </div>
        </Section>
        <Section title="Tonnage">
          <label className="flex items-center justify-between gap-2 text-[13px] text-ink-2">Material
            <select value={dens} onChange={e => onChange({ ...a, density: parseFloat(e.target.value) })} aria-label="Material density"
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink">
              {DENSITIES.map(d => <option key={d.label} value={d.t}>{d.label} · {d.t} t/m³</option>)}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Fig label="Cut" value={`${fmt(A.cutM3 * dens)} t`} />
            <Fig label="Fill" value={`${fmt(A.fillM3 * dens)} t`} />
            <Fig label="Net" value={`${fmt(A.netM3 * dens)} t`} />
          </div>
        </Section>
        <Section title="Surface">
          <div className="space-y-1.5">
            <Row label="Highest point" value={`${(A.elevMax + SITE_DATUM_M).toFixed(2)} m`} />
            <Row label="Lowest point" value={`${(A.elevMin + SITE_DATUM_M).toFixed(2)} m`} />
            <Row label="Horizontal area" value={`${fmt(A.horizontalM2)} m²`} />
            <Row label="Surface area" value={`${fmt(A.surfaceM2)} m²`} />
          </div>
        </Section>
      </div>
    );
  }
  if (a.kind === 'LINE' && m.line) {
    const L = m.line, lim = a.limitPct;
    const over = lim !== undefined ? L.segments.filter(s => Math.abs(s.gradePct) > lim) : [];
    return (
      <div className="space-y-4">
        {nameRow}
        <Section title="Gradient">
          <div className="grid grid-cols-3 gap-2">
            <Fig label="Average" value={`${L.gradeAvgPct.toFixed(1)} %`} />
            <Fig label="Steepest" value={`${L.gradeMaxPct.toFixed(1)} %`} />
            <Fig label="Gentlest" value={`${L.gradeMinPct.toFixed(1)} %`} />
          </div>
          <label className="mt-3 flex items-center justify-between gap-2 text-[13px] text-ink-2">Limit
            <select value={lim ?? ''} onChange={e => onChange({ ...a, limitPct: e.target.value === '' ? undefined : parseFloat(e.target.value) })} aria-label="Grade limit"
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink">
              <option value="">None</option><option value="5">5 % · accessible route</option><option value="8.33">8.33 % · ramp (1 in 12)</option><option value="10">10 % · vehicle access</option><option value="15">15 % · haul road</option>
            </select>
          </label>
          {lim !== undefined && (
            <div className={`mt-2 flex items-start gap-1.5 text-[12px] ${over.length ? 'text-warn' : 'text-ok'}`}>
              {over.length ? <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <CircleCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {over.length ? `${over.length} segment${over.length > 1 ? 's' : ''} over ${lim} %: steepest ${L.gradeMaxPct.toFixed(1)} %` : `Every segment within ${lim} %`}
            </div>
          )}
        </Section>
        <Section title="Cross-section">
          <CrossSection L={L} limitPct={lim} />
        </Section>
        <Section title="Length">
          <div className="space-y-1.5">
            <Row label="Along the ground" value={`${fmt(L.surfaceM, 1)} m`} />
            <Row label="Horizontal" value={`${fmt(L.horizontalM, 1)} m`} />
            <Row label="Highest / lowest" value={`${(L.elevMax + SITE_DATUM_M).toFixed(2)} / ${(L.elevMin + SITE_DATUM_M).toFixed(2)} m`} />
          </div>
        </Section>
      </div>
    );
  }
  return <div className="space-y-2">{nameRow}<p className="text-[12px] text-ink-3">Elevation shown on the model.</p></div>;
};

const Fig: React.FC<{ label: string; value: string; hint?: string; swatch?: string }> = ({ label, value, hint, swatch }) => (
  <div className="rounded-lg border border-line px-2 py-1.5 min-w-0">
    <div className="flex items-center gap-1 text-[11px] text-ink-3">{swatch && <span className="w-2 h-2 rounded-sm" style={{ background: swatch }} />}{label}</div>
    <div className="num text-[13px] font-semibold text-ink truncate">{value}</div>
    {hint && <div className="text-[10px] text-ink-3 truncate">{hint}</div>}
  </div>
);

/**
 * Elevation against distance along the line. One series (no legend; the section
 * names it), 2 px line in the series colour, recessive grid, corners marked,
 * crosshair and tooltip on hover, and a table view of the segments.
 */
const CrossSection: React.FC<{ L: LineMeasure; limitPct?: number }> = ({ L, limitPct }) => {
  const W = 300, H = 150, pad = { l: 38, r: 8, t: 8, b: 24 };
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const g = useMemo(() => {
    const zs = L.profile.map(p => p.z + SITE_DATUM_M), dMax = L.profile[L.profile.length - 1]?.d || 1;
    let lo = Math.min(...zs), hi = Math.max(...zs); const span = Math.max(0.5, hi - lo); lo -= span * 0.12; hi += span * 0.12;
    const X = (d: number) => pad.l + (d / dMax) * (W - pad.l - pad.r), Y = (z: number) => pad.t + (1 - (z - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const nice = (v: number) => { const e = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 5, 10].map(k => k * e).find(k => k >= v) ?? v; };
    const yStep = nice((hi - lo) / 4), xStep = nice(dMax / 5);
    const yt: number[] = []; for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yt.push(v);
    const xt: number[] = []; for (let v = 0; v <= dMax + 1e-6; v += xStep) xt.push(v);
    const path = L.profile.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.z + SITE_DATUM_M).toFixed(1)}`).join('');
    return { X, Y, yt, xt, path, dMax, yDec: yStep < 1 ? 1 : 0 };
  }, [L]);
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
    const d = Math.max(0, Math.min(g.dMax, ((x - pad.l) / (W - pad.l - pad.r)) * g.dMax));
    let best = 0; for (let i = 1; i < L.profile.length; i++) if (Math.abs(L.profile[i].d - d) < Math.abs(L.profile[best].d - d)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? L.profile[hover] : null;
  const segAt = (d: number) => { let i = 0; while (i < L.vertexD.length - 2 && d > L.vertexD[i + 1]) i++; return L.segments[i]; };
  return (
    <div>
      <div className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
          aria-label={`Cross-section: elevation from ${(L.elevMin + SITE_DATUM_M).toFixed(1)} to ${(L.elevMax + SITE_DATUM_M).toFixed(1)} m over ${L.horizontalM.toFixed(0)} m`}>
          {g.yt.map(v => <g key={`y${v}`}><line x1={pad.l} x2={W - pad.r} y1={g.Y(v)} y2={g.Y(v)} className="stroke-line" strokeWidth={1} />
            <text x={pad.l - 5} y={g.Y(v) + 3} textAnchor="end" className="fill-ink-3" fontSize={9}>{v.toFixed(g.yDec)}</text></g>)}
          {g.xt.map(v => <text key={`x${v}`} x={g.X(v)} y={H - 8} textAnchor="middle" className="fill-ink-3" fontSize={9}>{v.toFixed(0)}</text>)}
          <text x={W - pad.r} y={H - 0.5} textAnchor="end" className="fill-ink-3" fontSize={8}>m along the line</text>
          <path d={g.path} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-series-1" />
          {L.vertexD.map((d, i) => { const z = L.profile.reduce((b, p) => (Math.abs(p.d - d) < Math.abs(b.d - d) ? p : b)).z + SITE_DATUM_M;
            return <circle key={i} cx={g.X(d)} cy={g.Y(z)} r={4} className="fill-series-1 stroke-surface" strokeWidth={2} />; })}
          {hp && <>
            <line x1={g.X(hp.d)} x2={g.X(hp.d)} y1={pad.t} y2={H - pad.b} className="stroke-ink-3" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={g.X(hp.d)} cy={g.Y(hp.z + SITE_DATUM_M)} r={4} className="fill-surface stroke-series-1" strokeWidth={2} />
          </>}
        </svg>
        {hp && (() => { const s = segAt(hp.d); const over = limitPct !== undefined && Math.abs(s.gradePct) > limitPct;
          return (
            <div className="absolute top-1 right-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink shadow-[var(--shadow-card)] pointer-events-none num">
              <div>{hp.d.toFixed(1)} m · <b>{(hp.z + SITE_DATUM_M).toFixed(2)} m</b></div>
              <div className="text-ink-3">segment {Math.abs(s.gradePct).toFixed(1)} %{over ? ' · over limit' : ''}</div>
            </div>
          ); })()}
      </div>
      <button type="button" onClick={() => setTable(t => !t)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Table2 className="w-3 h-3" />{table ? 'Hide' : 'Show'} segments as a table</button>
      {table && (
        <table className="mt-1 w-full text-[11px] num">
          <thead><tr className="text-ink-3 text-left"><th className="font-normal py-0.5">#</th><th className="font-normal text-right">Length</th><th className="font-normal text-right">Rise</th><th className="font-normal text-right">Grade</th></tr></thead>
          <tbody>{L.segments.map((s, i) => { const over = limitPct !== undefined && Math.abs(s.gradePct) > limitPct;
            return <tr key={i} className="border-t border-line text-ink"><td className="py-0.5">{i + 1}</td><td className="text-right">{s.horizM.toFixed(1)} m</td><td className="text-right">{s.riseM >= 0 ? '+' : '−'}{Math.abs(s.riseM).toFixed(2)} m</td>
              <td className={`text-right ${over ? 'text-warn font-semibold' : ''}`}>{over && <TriangleAlert className="inline w-3 h-3 mr-0.5 -mt-0.5" />}{s.gradePct.toFixed(1)} %</td></tr>; })}</tbody>
        </table>
      )}
    </div>
  );
};
