import React, { useEffect, useMemo, useState } from 'react';
import { OctagonAlert, TriangleAlert, CircleCheck, PlaneLanding, PlaneTakeoff, X, ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import { useFleetHealth, type FleetSize } from '../../diagnostics/useFleetHealth';
import { goSentence, readiness, SHOW_MIN_BATTERY, type AircraftHealth, type Readiness } from '../../diagnostics/fleet';
import { Headline, Card, Section, Chip, Segmented, ToolButton, type Tone } from '../ui';
import { COLOR_BY, FleetGrid, GridLegend, matchesFilter, type ColorBy, type Filter } from './FleetGrid';
import { DECK } from './Instruments';
import { recordDb } from '../../record/db';
import type { HealthReport } from '../../diagnostics/health';

/**
 * Fleet health: every aircraft in a light show (or on a multi-vehicle link) at
 * once. Summary before detail: the go / hold for the show and what to do first,
 * the fleet on its launch grid, the pre-show gates with the pads that fail them,
 * then what is going wrong across the fleet, the battery spread, where the
 * problems sit, firmware and service, and a table of every aircraft. Any pad
 * opens that aircraft's full health screen.
 */

const READY_TONE: Record<Readiness, Tone> = { READY: 'ok', WATCH: 'warn', GROUNDED: 'bad', SILENT: 'neutral' };
const READY_LABEL: Record<Readiness, string> = { READY: 'Ready', WATCH: 'Watch', GROUNDED: 'Grounded', SILENT: 'Not reporting' };
const RANK: Record<Readiness, number> = { GROUNDED: 0, SILENT: 1, WATCH: 2, READY: 3 };
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type RenderAircraft = (report: HealthReport, onReplace: (part: string, note: string) => void) => React.ReactNode;

export const FleetHealthView: React.FC<{ renderAircraft: RenderAircraft }> = ({ renderAircraft }) => {
  const f = useFleetHealth();
  f.useActive();
  const { list, stats } = f;
  const [colorBy, setColorBy] = useState<ColorBy>('HEALTH');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selected, setSelected] = useState<string | null>(null);
  const byPad = useMemo(() => new Map(list.map(a => [a.pad, a])), [list]);
  const selectPad = (pad: string) => { const a = byPad.get(pad); if (a) setSelected(a.id); };

  return (
    <div id="fleet-health" className="flex flex-col gap-5">
      <Headline
        title="Fleet health"
        status={{ label: stats.go ? 'Go' : 'Hold', tone: stats.go ? 'ok' : 'warn' }}
        context={`${stats.n} aircraft · ${f.source === 'LIVE' ? 'live from the link' : 'simulated light-show fleet'}${f.flying ? ` · airborne ${mmss(f.flightT)}` : ''}`}
        stats={[
          { label: 'Ready', value: stats.counts.READY, tone: 'ok' },
          { label: 'To watch', value: stats.counts.WATCH, tone: stats.counts.WATCH ? 'warn' : 'neutral' },
          { label: 'Grounded', value: stats.counts.GROUNDED, tone: stats.counts.GROUNDED ? 'bad' : 'neutral' },
          { label: 'Not reporting', value: stats.counts.SILENT, tone: stats.counts.SILENT ? 'warn' : 'neutral' },
        ]}
      />

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="text-[13px] font-semibold text-ink">{f.source === 'LIVE' ? 'Aircraft on the link' : 'Simulated show fleet'}</div>
          <div className="text-[12px] text-ink-3">{f.source === 'LIVE'
            ? 'Every system id on the link is diagnosed on its own: motors, vibration, battery cells, sensors, GPS, link and firmware.'
            : 'Packs of different ages, a few aircraft with a fault and one that drops off the link, the way a real fleet arrives on the night. Fly it to see motors and vibration checked too.'}</div>
        </div>
        {f.source === 'SIMULATION' && <>
          <label className="flex items-center gap-2 text-[12px] text-ink-2">Fleet
            <Segmented size="sm" value={String(f.size)} onChange={v => { setSelected(null); f.setSize(Number(v) as FleetSize); }} items={[{ id: '100', label: '100' }, { id: '250', label: '250' }, { id: '500', label: '500' }]} />
          </label>
          <Segmented size="sm" value={String(f.speed)} onChange={v => f.setSpeed(+v)} items={[{ id: '1', label: '1×' }, { id: '4', label: '4×' }, { id: '10', label: '10×' }]} />
          {f.flying
            ? <ToolButton command="abort" id="fleet-land" icon={<PlaneLanding />} label="Land all" onClick={f.land} />
            : <ToolButton command="fly" id="fleet-fly" primary icon={<PlaneTakeoff />} label="Fly the fleet" onClick={f.takeoff} />}
        </>}
        {f.source === 'LIVE' && <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"><Radio className="w-3.5 h-3.5" />{stats.n} on the link</span>}
      </Card>

      <div id="fleet-verdict" role="status" className="flex items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3"
        style={{ borderColor: stats.go ? 'var(--color-ok)' : 'var(--color-warn)', background: stats.go ? 'var(--color-ok-soft)' : 'var(--color-warn-soft)' }}>
        {stats.go ? <CircleCheck className="w-7 h-7 text-ok shrink-0" aria-hidden /> : <TriangleAlert className="w-7 h-7 text-warn shrink-0" aria-hidden />}
        <div className="min-w-0">
          <div className="text-[17px] font-semibold text-ink leading-snug">{stats.go ? `Go for the show: all ${stats.n} aircraft ready` : `Hold: ${stats.blocked} of ${stats.n} aircraft need something first`}</div>
          <div className="text-[13px] text-ink-2">{goSentence(stats)}{!stats.go && stats.counts.GROUNDED + stats.counts.SILENT > 0 ? ` A show fleet carries about 5% spares: ${Math.ceil(stats.n * 0.05)} for ${stats.n}.` : ''}</div>
        </div>
      </div>

      {/* The deck: the launch grid and the pre-show gates. */}
      <section id="fleet-deck" aria-label="Launch grid" className="holo-deck p-3 sm:p-4 grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4">
        <div className="holo-panel relative rounded-[14px] p-3 sm:p-4 xl:col-span-8 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: DECK.holo }}>Launch grid</div>
              <div className="text-[12px]" style={{ color: DECK.ink2 }}>One cell per pad. Click one to open that aircraft.</div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour the grid by">
              {COLOR_BY.map(c => (
                <button key={c.id} type="button" aria-pressed={colorBy === c.id} onClick={() => setColorBy(c.id)}
                  className="h-7 px-2.5 rounded-full text-[11.5px] font-medium border transition-colors"
                  style={{ color: colorBy === c.id ? '#05101d' : DECK.ink2, background: colorBy === c.id ? DECK.holo : 'transparent', borderColor: colorBy === c.id ? DECK.holo : DECK.line }}>{c.label}</button>
              ))}
            </div>
          </div>
          <FleetGrid list={list} colorBy={colorBy} filter={filter} selected={selected} onSelect={setSelected} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <GridLegend colorBy={colorBy} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {([['ALL', 'All'], ['ATTENTION', 'Needs attention'], ['GROUNDED', 'Grounded'], ['SILENT', 'Not reporting']] as [Filter, string][]).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                  className="h-7 px-2.5 rounded-full text-[11.5px] border" style={{ color: filter === id ? DECK.ink : DECK.ink3, borderColor: filter === id ? DECK.holo : DECK.line }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="holo-panel relative rounded-[14px] p-3 sm:p-4 xl:col-span-4" id="fleet-gates">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: DECK.ink2 }}>Pre-show gates</h3>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: stats.go ? DECK.ok : DECK.warn }}>{stats.go ? 'Go' : 'Hold'}</span>
          </div>
          <ul className="flex flex-col">
            {stats.gates.map(g => (
              <li key={g.id} className="py-2.5 border-t first:border-t-0" style={{ borderColor: DECK.line }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-start gap-2 text-[12.5px]" style={{ color: DECK.ink }}>
                    {g.ok ? <CircleCheck className="w-4 h-4 mt-px shrink-0" style={{ color: DECK.ok }} aria-hidden /> : <OctagonAlert className="w-4 h-4 mt-px shrink-0" style={{ color: DECK.warn }} aria-hidden />}
                    <span>{g.label}<span className="sr-only">{g.ok ? ': passes' : ': fails'}</span></span>
                  </span>
                  <span className="shrink-0 text-right" style={{ font: '500 10.5px "JetBrains Mono", monospace', color: g.ok ? DECK.ink3 : DECK.warn }}>{g.detail}</span>
                </div>
                {!g.ok && g.pads.length > 0 && <PadChips pads={g.pads} onPick={selectPad} dark />}
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3" style={{ borderColor: DECK.line }}>
            <DeckStat label="Lowest battery" value={stats.battery.min != null ? `${Math.round(stats.battery.min)}%` : '—'} warn={stats.battery.min != null && stats.battery.min < SHOW_MIN_BATTERY} />
            <DeckStat label="Average battery" value={stats.battery.avg != null ? `${Math.round(stats.battery.avg)}%` : '—'} />
            <DeckStat label="Firmware versions" value={String(stats.firmware.length || '—')} warn={stats.firmware.length > 1} />
            <DeckStat label="Spares to fly" value={String(stats.counts.GROUNDED + stats.counts.SILENT)} warn={stats.counts.GROUNDED + stats.counts.SILENT > 0} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-7" id="fleet-issues">
          <Section title="What is wrong across the fleet" right={stats.issues.length ? (() => { const f = stats.issues.reduce((s, g) => s + g.ids.length, 0); return `${f} finding${f === 1 ? '' : 's'} on ${stats.n - stats.counts.READY - stats.counts.SILENT} aircraft`; })() : undefined}>
            {stats.issues.length === 0 ? <p className="flex items-center gap-2 py-2 text-[13px] text-ink-2"><CircleCheck className="w-4 h-4 text-ok" />Nothing found on any aircraft.</p> : (
              <ul className="divide-y divide-line">
                {stats.issues.map(g => (
                  <li key={g.key} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {g.level === 'FAULT' ? <OctagonAlert className="w-4 h-4 text-bad" aria-hidden /> : <TriangleAlert className="w-4 h-4 text-warn" aria-hidden />}
                      <span className="text-[14px] font-semibold text-ink">{g.label}</span>
                      <Chip tone={g.level === 'FAULT' ? 'bad' : 'warn'}>{g.level === 'FAULT' ? 'Fault' : 'Watch'}</Chip>
                      <span className="num ml-auto text-[13px] text-ink">{g.ids.length} aircraft</span>
                    </div>
                    <div className="mt-1 text-[12px] text-ink-2">{g.action}</div>
                    <PadChips pads={g.pads} onPick={selectPad} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
        <Card className="xl:col-span-5" id="fleet-battery">
          <Section title="Battery across the fleet" right={`${stats.battery.below} under ${SHOW_MIN_BATTERY}%`}>
            <BatteryHistogram buckets={stats.battery.buckets} />
          </Section>
        </Card>

        <Card className="xl:col-span-7" id="fleet-systems">
          <Section title="Where the problems are" right="aircraft per system">
            <SystemBars rows={stats.bySystem} n={stats.n} />
          </Section>
        </Card>
        <Card className="xl:col-span-5" id="fleet-service">
          <Section title="Firmware and service">
            <div className="space-y-2">
              {stats.firmware.map((v, i) => (
                <div key={v.name} className="flex items-center gap-3 text-[12px]">
                  <span className="w-[120px] shrink-0 text-ink-2 truncate">{v.name}</span>
                  <div className="relative flex-1 h-2.5 rounded-full bg-surface-2"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(v.count / stats.n) * 100}%`, background: i === 0 ? 'var(--color-accent)' : 'var(--color-warn)' }} /></div>
                  <span className="num w-10 text-right text-ink">{v.count}</span>
                </div>
              ))}
              {stats.firmware.length > 1 && <p className="text-[11px] text-ink-3">A show flies best on one version: the same flight behaviour and failsafes on every aircraft.</p>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><div className="text-[12px] text-ink-3">Props over 50 h</div><div className="num text-[20px] font-semibold text-ink">{stats.service.propsDue.length}</div><PadChips pads={stats.service.propsDue} onPick={selectPad} max={6} /></div>
              <div><div className="text-[12px] text-ink-3">Motors over 200 h</div><div className="num text-[20px] font-semibold text-ink">{stats.service.motorsDue.length}</div><PadChips pads={stats.service.motorsDue} onPick={selectPad} max={6} /></div>
            </div>
          </Section>
        </Card>

        <Card className="xl:col-span-12" id="fleet-table">
          <Section title="Every aircraft" right="worst first · click a row to open it">
            <FleetTable list={list} filter={filter} onFilter={setFilter} onSelect={setSelected} selected={selected} />
          </Section>
        </Card>
      </div>

      {selected && <AircraftDrawer id={selected} list={list} onClose={() => setSelected(null)} onPick={setSelected} renderAircraft={renderAircraft} />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const DeckStat: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div>
    <div className="text-[10.5px] uppercase tracking-[0.12em]" style={{ color: DECK.ink3 }}>{label}</div>
    <div className="text-[18px] font-semibold" style={{ font: '600 18px "JetBrains Mono", monospace', color: warn ? DECK.warn : DECK.ink }}>{value}</div>
  </div>
);

const PadChips: React.FC<{ pads: string[]; onPick: (pad: string) => void; max?: number; dark?: boolean }> = ({ pads, onPick, max = 12, dark }) => {
  const [all, setAll] = useState(false);
  if (!pads.length) return null;
  const shown = all ? pads : pads.slice(0, max);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {shown.map(p => (
        <button key={p} type="button" onClick={() => onPick(p)} className={`num h-6 px-1.5 rounded-md text-[11px] border ${dark ? '' : 'border-line text-ink-2 hover:text-ink hover:border-line-2'}`}
          style={dark ? { color: DECK.ink, borderColor: DECK.line, background: 'rgba(90,210,255,0.06)' } : undefined}>{p}</button>
      ))}
      {pads.length > max && <button type="button" onClick={() => setAll(v => !v)} className={`h-6 px-1.5 text-[11px] underline underline-offset-2 ${dark ? '' : 'text-ink-3'}`} style={dark ? { color: DECK.ink2 } : undefined}>{all ? 'fewer' : `+${pads.length - max} more`}</button>}
    </div>
  );
};

/** How charged the fleet is: aircraft per 10% band, bands under the show minimum marked. */
const BatteryHistogram: React.FC<{ buckets: number[] }> = ({ buckets }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets);
  const W = 420, H = 170, P = { l: 30, r: 6, t: 14, b: 22 }, bw = (W - P.l - P.r) / 10;
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px]" role="img" aria-label={`Aircraft by battery: ${buckets.map((b, i) => `${i * 10}–${i * 10 + 10}%: ${b}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
      <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
      {[...new Set([0, Math.round(max / 2), max])].map(v => <text key={v} x={P.l - 5} y={y(v) + 3} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{v}</text>)}
      {buckets.map((b, i) => {
        const low = (i + 1) * 10 <= SHOW_MIN_BATTERY;
        const x = P.l + i * bw + 2, h = y(0) - y(b);
        return (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={P.l + i * bw} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" />
            {b > 0 && <path d={`M${x} ${y(0)} V${y(b) + Math.min(4, h)} Q${x} ${y(b)} ${x + Math.min(4, h)} ${y(b)} H${x + bw - 4 - Math.min(4, h)} Q${x + bw - 4} ${y(b)} ${x + bw - 4} ${y(b) + Math.min(4, h)} V${y(0)} Z`}
              fill={low ? 'var(--color-warn)' : 'var(--color-accent)'} fillOpacity={hover === i ? 1 : low ? 0.9 : 0.35 + 0.65 * (i / 9)} />}
            {(hover === i || (b > 0 && low)) && <text x={x + (bw - 4) / 2} y={y(b) - 4} textAnchor="middle" className="num" style={{ font: '600 10px Inter, sans-serif', fill: 'var(--color-ink)' }}>{b}</text>}
            <text x={P.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{i % 2 === 0 ? `${i * 10}` : ''}</text>
          </g>
        );
      })}
      <line x1={P.l + (SHOW_MIN_BATTERY / 10) * bw} x2={P.l + (SHOW_MIN_BATTERY / 10) * bw} y1={P.t - 6} y2={y(0)} stroke="var(--color-warn)" strokeDasharray="4 3" />
      <text x={P.l + (SHOW_MIN_BATTERY / 10) * bw + 4} y={P.t} style={{ font: '10px Inter, sans-serif', fill: 'var(--color-warn)' }}>show minimum {SHOW_MIN_BATTERY}%</text>
      <text x={W - P.r} y={H - 8} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>100%</text>
      {hover != null && <text x={W - P.r} y={P.t + 10} textAnchor="end" className="num" style={{ font: '11px Inter, sans-serif', fill: 'var(--color-ink-2)' }}>{hover * 10}–{hover * 10 + 10}%: {buckets[hover]} aircraft</text>}
    </svg>
  );
};

/** Aircraft with a fault or a watch in each system, as stacked bars with the counts written on. */
const SystemBars: React.FC<{ rows: { id: string; label: string; watch: number; fault: number }[]; n: number }> = ({ rows, n }) => {
  const max = Math.max(1, ...rows.map(r => r.watch + r.fault));
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-bad" />Fault</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-warn" />Watch</span>
      </div>
      {rows.map(r => (
        <div key={r.id} className="grid items-center gap-3 text-[12px]" style={{ gridTemplateColumns: '140px 1fr 70px' }}>
          <span className="text-ink-2 truncate">{r.label}</span>
          <div className="flex h-3 gap-[2px]" aria-hidden>
            {r.fault > 0 && <div className="h-full rounded-l-[3px] bg-bad" style={{ width: `${(r.fault / max) * 100}%`, borderRadius: r.watch ? '3px 0 0 3px' : 3 }} />}
            {r.watch > 0 && <div className="h-full bg-warn" style={{ width: `${(r.watch / max) * 100}%`, borderRadius: r.fault ? '0 3px 3px 0' : 3 }} />}
            {r.fault + r.watch === 0 && <div className="h-px w-full self-center bg-line" />}
          </div>
          <span className="num text-right text-ink">{r.fault + r.watch === 0 ? <span className="text-ink-3">none</span> : <>{r.fault > 0 && <span className="text-bad">{r.fault}</span>}{r.fault > 0 && r.watch > 0 && ' + '}{r.watch > 0 && <span className="text-warn">{r.watch}</span>}</>}</span>
        </div>
      ))}
      <p className="text-[11px] text-ink-3">Of {n} aircraft. An aircraft can count in more than one system.</p>
    </div>
  );
};

type SortKey = 'status' | 'pad' | 'battery' | 'cell' | 'vibe' | 'balance' | 'temp' | 'sats' | 'margin';

const FleetTable: React.FC<{ list: AircraftHealth[]; filter: Filter; onFilter: (f: Filter) => void; onSelect: (id: string) => void; selected: string | null }> = ({ list, filter, onFilter, onSelect, selected }) => {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'status', dir: 1 });
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const val = (a: AircraftHealth, k: SortKey): number | string => {
    switch (k) {
      case 'status': return RANK[readiness(a)] * 10 - a.margin;
      case 'pad': return a.pad;
      case 'battery': return a.batteryPct ?? 999;
      case 'cell': return a.minCellV ?? 99;
      case 'vibe': return -(a.vibe ?? -1);
      case 'balance': return -(a.motorDev ?? -1);
      case 'temp': return -(a.escMaxC ?? -1);
      case 'sats': return a.sats ?? 99;
      case 'margin': return -a.margin;
    }
  };
  const rows = useMemo(() => list
    .filter(a => matchesFilter(a, filter) && (!q || a.pad.toLowerCase().includes(q.toLowerCase()) || a.id.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x < y ? -1 : x > y ? 1 : a.pad.localeCompare(b.pad)) * sort.dir; }),
  [list, filter, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setLimit(25), [filter, q]);
  const H: React.FC<{ k: SortKey; children: React.ReactNode; right?: boolean }> = ({ k, children, right }) => (
    <th className={`font-normal py-1.5 ${right ? 'text-right' : 'text-left'}`} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`hover:text-ink ${sort.k === k ? 'text-ink font-medium' : ''}`} onClick={() => setSort(s => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>{children}{sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  );
  const cellFmt = (v: number | null, f: (n: number) => string, bad?: boolean, warn?: boolean) => <span className={bad ? 'text-bad font-medium' : warn ? 'text-warn font-medium' : ''}>{v == null ? '—' : f(v)}</span>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input id="fleet-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a pad or aircraft" aria-label="Find a pad or aircraft"
          className="h-8 w-[200px] rounded-lg border border-line bg-surface px-2 text-[13px] text-ink" />
        <Segmented size="sm" value={filter} onChange={v => onFilter(v as Filter)} items={[{ id: 'ALL', label: 'All' }, { id: 'ATTENTION', label: 'Needs attention' }, { id: 'GROUNDED', label: 'Grounded' }, { id: 'SILENT', label: 'Not reporting' }]} />
        <span className="ml-auto text-[12px] text-ink-3">{rows.length} of {list.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-[12px]">
          <thead className="text-ink-3">
            <tr>
              <H k="pad">Pad</H><th className="font-normal text-left">Aircraft</th><H k="status">Status</H>
              <H k="battery" right>Battery</H><H k="cell" right>Lowest cell</H><H k="vibe" right>Vibration</H><H k="balance" right>Motor balance</H>
              <H k="temp" right>Hottest motor</H><H k="sats" right>GPS</H><H k="margin" right>Closest to a limit</H><th className="font-normal text-left pl-4">Top issue</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(a => {
              const r = readiness(a);
              return (
                <tr key={a.id} onClick={() => onSelect(a.id)} className={`border-t border-line cursor-pointer ${selected === a.id ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                  <td className="py-1.5 num font-medium text-ink"><button type="button" className="hover:underline" onClick={e => { e.stopPropagation(); onSelect(a.id); }}>{a.pad}</button></td>
                  <td className="text-ink-2">{a.id}</td>
                  <td><Chip tone={READY_TONE[r]}>{READY_LABEL[r]}</Chip></td>
                  <td className="num text-right">{cellFmt(a.batteryPct, v => `${Math.round(v)}%`, false, a.batteryPct != null && a.batteryPct < SHOW_MIN_BATTERY)}</td>
                  <td className="num text-right">{cellFmt(a.minCellV, v => `${v.toFixed(2)} V`, a.cellSpreadV != null && a.cellSpreadV >= 0.2, a.cellSpreadV != null && a.cellSpreadV >= 0.1)}</td>
                  <td className="num text-right">{cellFmt(a.vibe, v => `${Math.round(v)}`, a.vibe != null && a.vibe >= 60, a.vibe != null && a.vibe >= 30)}</td>
                  <td className="num text-right">{cellFmt(a.motorDev, v => `${v.toFixed(1)}%`, a.motorDev != null && a.motorDev >= 15, a.motorDev != null && a.motorDev >= 8)}</td>
                  <td className="num text-right">{cellFmt(a.escMaxC, v => `${Math.round(v)}°`, a.escMaxC != null && a.escMaxC >= 85, a.escMaxC != null && a.escMaxC >= 70)}</td>
                  <td className="num text-right">{cellFmt(a.sats, v => `${v}`)}</td>
                  <td className="num text-right">{a.overall === 'UNKNOWN' ? '—' : <span className={a.margin >= 1 ? 'text-bad font-medium' : a.margin >= 0.5 ? 'text-warn font-medium' : ''}>{Math.round(a.margin * 100)}%</span>}</td>
                  <td className="pl-4 text-ink-2 max-w-[260px] truncate">{a.overall === 'UNKNOWN' ? 'Not reporting on the link' : a.top?.title ?? <span className="text-ink-3">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button type="button" onClick={() => setLimit(l => l + 100)} className="mt-2 px-1 text-[12px] font-medium text-accent hover:underline">{rows.length - limit <= 100 ? `Show the other ${rows.length - limit}` : `Show 100 more of ${rows.length - limit}`}</button>}
    </div>
  );
};

/** One aircraft's full health screen, over the fleet, with a walk through the aircraft that need attention. */
const AircraftDrawer: React.FC<{ id: string; list: AircraftHealth[]; onClose: () => void; onPick: (id: string) => void; renderAircraft: RenderAircraft }> = ({ id, list, onClose, onPick, renderAircraft }) => {
  const f = useFleetHealth();
  const a = list.find(x => x.id === id);
  const report = f.report(id);
  const flagged = list.filter(x => readiness(x) !== 'READY').sort((x, y) => x.pad.localeCompare(y.pad));
  const walk = flagged.length ? flagged : list;
  const i = walk.findIndex(x => x.id === id);
  const go = (d: number) => { const n = walk[(i + d + walk.length) % walk.length]; if (n) onPick(n.id); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight' || e.key === ']') go(1); if (e.key === 'ArrowLeft' || e.key === '[') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const replace = (part: string, note: string) => { if (recordDb.available()) recordDb.addService({ aircraft: id, t: Date.now(), note, part }).catch(() => {}); };
  if (!a) return null;
  const r = readiness(a);
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={`Aircraft ${a.pad}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-[1180px] overflow-y-auto bg-bg border-l border-line shadow-2xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 bg-surface/95 backdrop-blur border-b border-line">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="num text-[18px] font-semibold text-ink">{a.pad}</span><span className="text-[13px] text-ink-3">{a.id}</span><Chip tone={READY_TONE[r]}>{READY_LABEL[r]}</Chip></div>
            <div className="text-[12px] text-ink-2 truncate">{a.overall === 'UNKNOWN' ? 'Not reporting on the link: check its power, radio and antenna, or fly a spare in this slot.' : a.verdict}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-ink-3">{flagged.length ? `${i + 1} of ${flagged.length} needing attention` : `${i + 1} of ${list.length}`}</span>
            <button type="button" onClick={() => go(-1)} aria-label="Previous aircraft" className="h-8 w-8 grid place-items-center rounded-lg border border-line text-ink-2 hover:text-ink"><ChevronLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next aircraft" className="h-8 w-8 grid place-items-center rounded-lg border border-line text-ink-2 hover:text-ink"><ChevronRight className="w-4 h-4" /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 grid place-items-center rounded-lg border border-line text-ink-2 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-4 sm:p-6">{report ? renderAircraft(report, replace) : <p className="text-[13px] text-ink-3">No data from this aircraft yet.</p>}</div>
      </div>
    </div>
  );
};
