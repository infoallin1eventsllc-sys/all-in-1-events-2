import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Wrench, X, Table2, BarChart3, FlaskConical, Trash2 } from 'lucide-react';
import { recordDb, type Vertical } from '../record/db';
import { recorder } from '../record/recorder';
import { rollupSession, type SessionRollup } from '../analytics/rollup';
import {
  filterRollups, isFlight, totals, delta, daily, bucket, byProduct, fleet, sortFleet, topAlerts, incidents, flightHours,
  SERVICE_HOURS, BATTERY_DRIFT_PCT, type ProductFilter, type SourceFilter, type AircraftStat, type Day, type Health, type ServiceRecord,
} from '../analytics/aggregate';
import { sampleHistory, sampleService } from '../analytics/sample';
import { Headline, Card, Section, Chip, Sparkline, ToolButton, IconButton, Segmented, type Tone } from './ui';

/**
 * Analytics: how the fleet and the business are doing, from the flight records.
 *
 * Built only on rollups (one summary per closed flight, never pruned), so it
 * covers the whole history even though raw telemetry is kept for the last 50
 * flights. Four questions, in order: how much did we fly, for which product,
 * which aircraft need attention, and what went wrong.
 */

const PRODUCTS: { id: Vertical; label: string }[] = [
  { id: 'LIGHT_SHOW', label: 'Light show' },
  { id: 'SURVEY', label: 'Site survey' },
  { id: 'SURVEILLANCE', label: 'Surveillance' },
  { id: 'DEFENSE', label: 'Defense (retired)' },
];
const LABEL = Object.fromEntries(PRODUCTS.map(p => [p.id, p.label])) as Record<Vertical, string>;

/**
 * Chart series colours, validated with the dataviz palette checker (lightness band,
 * chroma floor, colour-blind separation, contrast) against each theme's surface.
 * Fixed order, and a product keeps its colour whatever the filter shows.
 */
const SERIES: Record<'light' | 'dark', Record<Vertical, string>> = {
  light: { LIGHT_SHOW: '#5b5bd6', SURVEY: '#c2410c', SURVEILLANCE: '#0d9488', DEFENSE: '#8a94a6' },
  dark: { LIGHT_SHOW: '#7474ea', SURVEY: '#e46f25', SURVEILLANCE: '#10a08f', DEFENSE: '#6f7a8c' },
};

function useTheme() {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const [t, setT] = useState(read);
  useEffect(() => {
    const o = new MutationObserver(() => setT(read()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => o.disconnect();
  }, []);
  return t;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el); setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PERIODS = [{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' }, { id: '365', label: '1 year' }] as const;
type PeriodId = typeof PERIODS[number]['id'];

const fmtH = (h: number) => (h >= 100 ? h.toFixed(0) : h >= 10 ? h.toFixed(1) : h.toFixed(2));
const fmtN = (n: number) => n.toLocaleString();
const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

const HEALTH: Record<Health, { label: string; tone: Tone }> = {
  SERVICE_DUE: { label: 'Service due', tone: 'bad' },
  BATTERY: { label: 'Check battery', tone: 'warn' },
  SERVICE_SOON: { label: 'Service soon', tone: 'warn' },
  OK: { label: 'OK', tone: 'ok' },
};

export const AnalyticsView: React.FC = () => {
  const theme = useTheme();
  const colors = SERIES[theme];
  const [rollups, setRollups] = useState<SessionRollup[] | null>(null);
  const [service, setService] = useState<ServiceRecord[]>([]);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<PeriodId>('30');
  const [product, setProduct] = useState<ProductFilter>('ALL');
  const [source, setSource] = useState<SourceFilter>('ALL');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      // Backfill: sessions recorded before Analytics existed get their rollup now.
      const [sessions, have] = await Promise.all([recordDb.listSessions(), recordDb.listRollups()]);
      const known = new Set(have.map(r => r.sessionId));
      const current = recorder.current()?.id;
      const missing = sessions.filter(s => s.endedAt && s.id !== current && !known.has(s.id));
      const fresh: SessionRollup[] = [];
      for (const s of missing) {
        const [smp, ev] = await Promise.all([recordDb.samplesFor(s.id), recordDb.eventsFor(s.id)]);
        fresh.push(rollupSession(s, smp, ev));
      }
      if (fresh.length) await recordDb.putRollups(fresh);
      setRollups([...have, ...fresh]);
      setService(await recordDb.listService());
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setRollups([]);
    }
  }, []);
  useEffect(() => { void load(); return recorder.onClosed(() => { void load(); }); }, [load]);

  const hasSample = !!rollups?.some(r => r.sample);
  const anyFlights = !!rollups?.some(isFlight);
  const loadSample = async () => { const t = Date.now(); await recordDb.putRollups(sampleHistory(t)); for (const s of sampleService(t)) await recordDb.addService(s); await load(); };
  const clearSample = async () => { await recordDb.clearSamples(); await load(); };
  const logService = async (aircraft: string, note: string) => { await recordDb.addService({ aircraft, t: Date.now(), note }); await load(); };

  const days = Number(period);
  const f = { days, product, source, now };
  const cur = useMemo(() => filterRollups(rollups ?? [], f), [rollups, period, product, source, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => filterRollups(rollups ?? [], f, days, now - days * 86_400_000), [rollups, period, product, source, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const T = totals(cur), P = totals(prev);
  const bins = useMemo(() => { const d = daily(cur, days, now); return days > 90 ? bucket(d, 7) : days > 30 ? bucket(d, 3) : d; }, [cur, days, now]);
  const products = byProduct(cur);
  const fleetAll = useMemo(() => sortFleet(fleet((rollups ?? []).filter(r => isFlight(r) && (source === 'ALL' || (source === 'SIM') === (r.source === 'SIMULATION'))), service)), [rollups, service, source]);
  const fleetShown = product === 'ALL' ? fleetAll : fleetAll.filter(a => a.product === product);
  const alerts = topAlerts(cur);
  const crit = incidents(cur);

  if (rollups === null) return <div className="py-20 text-center text-[13px] text-ink-3">Loading flight history…</div>;

  const deltaChip = (d: number | null, upIsGood = true) => d == null || !isFinite(d) ? null : (
    <span className={`ml-1.5 text-[11px] font-medium ${Math.abs(d) < 1 ? 'text-ink-3' : (d > 0) === upIsGood ? 'text-ok' : 'text-bad'}`}>{d > 0 ? '▲' : d < 0 ? '▼' : ''}{Math.abs(d).toFixed(0)}%</span>
  );

  return (
    <div id="analytics-view" className="space-y-5">
      <Headline
        title="Analytics"
        context={!anyFlights ? 'Nothing flown yet' : `${fmtN(T.flights)} flight${T.flights === 1 ? '' : 's'} in the last ${PERIODS.find(p => p.id === period)!.label} · compared with the ${days} days before`}
        stats={[
          { label: 'Flight hours', value: <>{fmtH(T.flightHours)}{deltaChip(delta(T.flightHours, P.flightHours))}</> },
          { label: 'Flights', value: <>{fmtN(T.flights)}{deltaChip(delta(T.flights, P.flights))}</> },
          { label: 'Aircraft flown', value: fmtN(T.aircraft) },
          { label: 'Alerts per 10 h', value: T.alertsPer10h == null ? '—' : <>{T.alertsPer10h.toFixed(1)}{deltaChip(delta(T.alertsPer10h, P.alertsPer10h), false)}</>, tone: T.critical ? 'warn' : 'neutral' },
        ]}
        actions={<Segmented size="sm" value={period} onChange={setPeriod} items={PERIODS.map(p => ({ id: p.id, label: p.label }))} />}
      />

      {/* Filters: one row, above everything they affect */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2"><span className="text-[11px] text-ink-3">Product</span>
          <Segmented size="sm" value={product} onChange={setProduct} items={[{ id: 'ALL', label: 'All' }, ...PRODUCTS.slice(0, 3).map(p => ({ id: p.id, label: p.label }))]} />
        </span>
        <span className="flex items-center gap-2"><span className="text-[11px] text-ink-3">Flights</span>
          <Segmented size="sm" value={source} onChange={setSource} items={[{ id: 'ALL', label: 'All' }, { id: 'REAL', label: 'Real aircraft' }, { id: 'SIM', label: 'Simulation' }]} />
        </span>
        <span className="ml-auto flex items-center gap-2">
          {anyFlights && <ToolButton size="sm" icon={<Download />} label="Export flight log" onClick={() => exportLog(cur)} title="One row per flight in this view, as CSV" />}
        </span>
      </div>

      {hasSample && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft px-4 py-2.5">
          <p className="text-[13px] text-ink"><FlaskConical className="inline w-4 h-4 mr-1.5 -mt-0.5 text-warn" />Includes <strong className="font-semibold">sample history</strong> — three months of example operations so you can see what this page does. Your real flights are counted alongside it.</p>
          <ToolButton size="sm" icon={<Trash2 />} label="Remove sample history" onClick={clearSample} />
        </div>
      )}
      {error && <div className="rounded-lg bg-bad-soft px-4 py-2.5 text-[13px] text-bad">Flight records are unavailable in this browser ({error}).</div>}

      {!anyFlights ? (
        <Card className="py-12 text-center">
          <BarChart3 className="mx-auto w-6 h-6 text-ink-3" />
          <h2 className="mt-2 text-[15px] font-semibold text-ink">No flights yet</h2>
          <p className="mt-1 mx-auto max-w-[56ch] text-[13px] text-ink-2">Every run of a dashboard is recorded and summarised here: flight hours, which products you fly, aircraft that need service, and every alert. Fly something, or load three months of sample operations to see the page working.</p>
          <ToolButton className="mt-4" primary icon={<FlaskConical />} label="Load sample history" onClick={loadSample} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Flight hours over time */}
          <Card className="xl:col-span-8 min-w-0">
            <FlightHoursChart bins={bins} colors={colors} product={product} unit={days > 90 ? 'week' : days > 30 ? '3 days' : 'day'} />
          </Card>

          {/* By product */}
          <Card className="xl:col-span-4">
            <Section title="By product" right="share of flight hours">
              {products.length === 0 ? <p className="text-[13px] text-ink-3 py-2">No flights in this view.</p> : (
                <ul className="space-y-4">
                  {products.map(p => (
                    <li key={p.vertical}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="flex items-center gap-2 font-medium text-ink"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[p.vertical] }} />{LABEL[p.vertical]}</span>
                        <span className="num text-ink-2">{fmtH(p.hours)} h · {p.flights} flight{p.flights === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.share * 100}%`, background: colors[p.vertical] }} /></div>
                      <p className="mt-1.5 text-[12px] text-ink-3">{productLine(p.vertical, p.highlights, p.flights)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>

          {/* Fleet health */}
          <Card className="xl:col-span-8 min-w-0">
            <FleetHealth fleet={fleetShown} colors={colors} onService={logService} />
          </Card>

          {/* Safety */}
          <Card className="xl:col-span-4">
            <Section title="Safety" right={`${T.warning} warnings · ${T.critical} critical`}>
              <div className="flex items-end gap-6">
                <div><div className="text-[11px] text-ink-3">Alerts per 10 flight hours</div><div className="text-[28px] font-semibold leading-tight text-ink">{T.alertsPer10h == null ? '—' : <>{T.alertsPer10h.toFixed(1)}{deltaChip(delta(T.alertsPer10h, P.alertsPer10h), false)}</>}</div>{T.alertsPer10h == null && <div className="text-[11px] text-ink-3">needs an hour of flying</div>}</div>
                <div><div className="text-[11px] text-ink-3">Critical</div><div className={`text-[28px] font-semibold leading-tight ${T.critical ? 'text-bad' : 'text-ink'}`}>{T.critical}</div></div>
              </div>
              <h4 className="mt-4 mb-1 text-[12px] font-semibold text-ink">Most frequent alerts</h4>
              {alerts.length === 0 ? <p className="text-[13px] text-ink-3">None in this period.</p> : (
                <ul className="divide-y divide-line">
                  {alerts.map(a => (
                    <li key={a.pattern} className="flex items-start justify-between gap-3 py-2 text-[13px]">
                      <span className="min-w-0"><span className="text-ink-2">{a.example}</span><span className="block text-[11px] text-ink-3">{a.products.map(p => LABEL[p]).join(', ')} · last {fmtDate(a.lastT)}</span></span>
                      <Chip tone={a.severity === 'CRITICAL' ? 'bad' : 'warn'}>{a.count}×</Chip>
                    </li>
                  ))}
                </ul>
              )}
              {crit.length > 0 && <>
                <h4 className="mt-4 mb-1 text-[12px] font-semibold text-ink">Incidents</h4>
                <ul className="divide-y divide-line">
                  {crit.map(c => (
                    <li key={`${c.sessionId}-${c.t}`} className="py-2 text-[13px]">
                      <span className="text-ink">{c.text}</span>
                      <span className="block text-[11px] text-ink-3">{new Date(c.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {c.title}{c.sample ? ' · sample' : ''}</span>
                    </li>
                  ))}
                </ul>
              </>}
            </Section>
          </Card>
        </div>
      )}

      {anyFlights && (
        <p className="text-[11px] text-ink-3 text-center">
          Built from the flight records on this device. Full telemetry is kept for the last 50 flights; the summaries behind this page are kept for good.
          {!hasSample && <> <button onClick={loadSample} className="underline hover:text-ink-2">Load sample history</button> to compare.</>}
        </p>
      )}
    </div>
  );
};

function productLine(v: Vertical, h: Record<string, number>, flights: number): string {
  if (v === 'SURVEY') {
    const rej = h.photos ? (h.rejected / h.photos) * 100 : 0;
    return `${fmtN(Math.round(h.photos ?? 0))} photos · ${rej.toFixed(1)}% rejected${h.coverageN ? ` · ${(h.coverageSum / h.coverageN).toFixed(1)}% average coverage` : ''}`;
  }
  if (v === 'LIGHT_SHOW') return `${flights} show${flights === 1 ? '' : 's'}${h.worstDeviationM != null ? ` · worst drift ${h.worstDeviationM.toFixed(1)} m from slot` : ''}${h.syncN ? ` · clock sync ${(h.syncSum / h.syncN).toFixed(1)} ms` : ''}`;
  if (v === 'SURVEILLANCE') return `${fmtN(h.detections ?? 0)} detections · ${fmtN(Math.round(h.distanceKm ?? 0))} km patrolled`;
  return 'Retired product — past flights only';
}

// ---- Flight hours chart ------------------------------------------------------

const FlightHoursChart: React.FC<{ bins: Day[]; colors: Record<Vertical, string>; product: ProductFilter; unit: string }> = ({ bins, colors, product, unit }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const H = 220, padL = 36, padR = 8, padT = 10, padB = 26;
  const series: Vertical[] = product === 'ALL' ? (['LIGHT_SHOW', 'SURVEY', 'SURVEILLANCE', 'DEFENSE'] as Vertical[]).filter(v => bins.some(b => (b.byProduct[v] ?? 0) > 0)) : [product];
  const max = Math.max(0.1, ...bins.map(b => b.hours));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotW = Math.max(100, width - padL - padR), plotH = H - padT - padB;
  const slot = plotW / Math.max(1, bins.length);
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const y = (h: number) => padT + plotH - (h / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(bins.length / Math.max(2, Math.floor(plotW / 70))));
  const total = bins.reduce((s, b) => s + b.hours, 0);

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Flight hours</h3>
          <p className="text-[11px] text-ink-3">per {unit} · every aircraft's time in the air, added up · {fmtH(total)} h in total</p>
        </div>
        <div className="flex items-center gap-3">
          {series.length > 1 && (
            <ul className="hidden sm:flex items-center gap-3 text-[11px] text-ink-2" aria-label="Legend">
              {series.map(v => <li key={v} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[v] }} />{LABEL[v]}</li>)}
            </ul>
          )}
          <IconButton icon={table ? <BarChart3 /> : <Table2 />} label={table ? 'Show chart' : 'Show as table'} onClick={() => setTable(t => !t)} />
        </div>
      </div>

      {table ? (
        <div className="max-h-[260px] overflow-y-auto rail-scroll">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface text-ink-3"><tr><th className="text-left font-medium py-1">Period</th>{series.map(v => <th key={v} className="text-right font-medium py-1">{LABEL[v]}</th>)}<th className="text-right font-medium py-1">Total h</th><th className="text-right font-medium py-1">Flights</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...bins].reverse().filter(b => b.flights > 0).map(b => (
                <tr key={b.start}><td className="py-1 text-ink-2">{b.label}</td>{series.map(v => <td key={v} className="py-1 text-right num text-ink-2">{fmtH(b.byProduct[v] ?? 0)}</td>)}<td className="py-1 text-right num text-ink">{fmtH(b.hours)}</td><td className="py-1 text-right num text-ink-2">{b.flights}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={`Flight hours per ${unit}, ${fmtH(total)} hours in total`} className="block">
            {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map(v => (
              <g key={v}>
                <line x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-ink-3)" className="num">{v.toFixed(Math.max(0, -Math.floor(Math.log10(step))))}</text>
              </g>
            ))}
            {bins.map((b, i) => {
              const cx = padL + slot * i + slot / 2, x = cx - barW / 2;
              let acc = 0;
              const segs = series.map(v => ({ v, h: product === 'ALL' ? b.byProduct[v] ?? 0 : b.hours })).filter(s => s.h > 0);
              return (
                <g key={b.start}>
                  {hover === i && <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="var(--color-surface-2)" />}
                  {segs.map((s, k) => {
                    const y0 = y(acc), y1 = y(acc + s.h); acc += s.h;
                    const last = k === segs.length - 1;
                    // 2px surface gap between stacked segments; only the top segment gets the rounded data-end.
                    const hgt = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0));
                    const yt = y0 - (k > 0 ? 2 : 0) - hgt;
                    return last ? <path key={s.v} d={roundedTop(x, yt, barW, hgt, Math.min(4, barW / 2, hgt))} fill={colors[s.v]} /> : <rect key={s.v} x={x} y={yt} width={barW} height={hgt} fill={colors[s.v]} />;
                  })}
                  {i % labelEvery === 0 && <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">{b.label.split(' – ')[0]}</text>}
                  <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
            <line x1={padL} x2={padL + plotW} y1={y(0)} y2={y(0)} stroke="var(--color-line-2)" strokeWidth={1} />
          </svg>
          {hover != null && bins[hover] && (
            <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
              style={{ left: Math.min(width - 190, Math.max(0, padL + slot * hover + slot / 2 - 90)), top: 4, width: 180 }}>
              <div className="font-medium text-ink">{bins[hover].label}</div>
              {product === 'ALL' && series.map(v => (bins[hover].byProduct[v] ?? 0) > 0 && (
                <div key={v} className="mt-1 flex items-center justify-between gap-2 text-ink-2"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: colors[v] }} />{LABEL[v]}</span><span className="num">{fmtH(bins[hover].byProduct[v] ?? 0)} h</span></div>
              ))}
              <div className="mt-1 flex items-center justify-between border-t border-line pt-1 text-ink"><span>{bins[hover].flights} flight{bins[hover].flights === 1 ? '' : 's'}</span><span className="num font-medium">{fmtH(bins[hover].hours)} h</span></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

// ---- Fleet health --------------------------------------------------------------

const FleetHealth: React.FC<{ fleet: AircraftStat[]; colors: Record<Vertical, string>; onService: (id: string, note: string) => Promise<void> }> = ({ fleet, colors, onService }) => {
  const [all, setAll] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const attention = fleet.filter(a => a.health !== 'OK').length;
  const shown = all ? fleet : fleet.slice(0, 8);
  return (
    <Section title="Fleet health" right={`${fleet.length} aircraft · ${attention} need attention · service every ${SERVICE_HOURS} flight hours`}>
      {fleet.length === 0 ? <p className="text-[13px] text-ink-3 py-2">No aircraft in this view.</p> : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-[11px] text-ink-3">
              <tr className="text-left">
                <th className="font-medium py-1.5 px-1">Aircraft</th>
                <th className="font-medium py-1.5 px-1 text-right">Flights</th>
                <th className="font-medium py-1.5 px-1 text-right">Hours</th>
                <th className="font-medium py-1.5 px-1 w-[150px]">Since service</th>
                <th className="font-medium py-1.5 px-1 w-[130px]" title="Battery used per airborne minute, flight by flight. A rising line is a pack losing capacity.">Battery drain</th>
                <th className="font-medium py-1.5 px-1">Status</th>
                <th className="py-1.5 px-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map(a => {
                const svcPct = Math.min(100, (a.hoursSinceService / SERVICE_HOURS) * 100);
                const h = HEALTH[a.health];
                return (
                  <React.Fragment key={a.id}>
                    <tr>
                      <td className="py-2 px-1">
                        <span className="flex items-center gap-2 font-medium text-ink"><span className="w-2 h-2 rounded-sm" style={{ background: colors[a.product] }} />{a.id}</span>
                        <span className="block text-[11px] text-ink-3 pl-4">{LABEL[a.product]} · last flew {fmtDate(a.lastFlown)}</span>
                      </td>
                      <td className="py-2 px-1 text-right num text-ink-2">{a.flights}</td>
                      <td className="py-2 px-1 text-right num text-ink">{fmtH(a.hours)}</td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden"><div className={`h-full rounded-full ${svcPct >= 100 ? 'bg-bad' : svcPct >= 80 ? 'bg-warn' : 'bg-ink-3'}`} style={{ width: `${svcPct}%` }} /></div>
                          <span className="num text-[11px] text-ink-2 w-12 text-right">{fmtH(a.hoursSinceService)} h</span>
                        </div>
                        <span className="block text-[11px] text-ink-3">{a.lastService ? `serviced ${fmtDate(a.lastService)}` : 'no service logged'}</span>
                      </td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-2">
                          <span className="w-16 inline-block text-ink-3"><Sparkline data={a.drain.length > 1 ? a.drain : [0, 0]} color="currentColor" height={16} /></span>
                          <span className={`num text-[11px] ${a.drainDriftPct != null && a.drainDriftPct >= BATTERY_DRIFT_PCT ? 'text-warn font-medium' : 'text-ink-3'}`}>{a.drainDriftPct == null ? '—' : `${a.drainDriftPct > 0 ? '+' : ''}${a.drainDriftPct.toFixed(0)}%`}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1"><Chip tone={h.tone}>{h.label}</Chip></td>
                      <td className="py-2 px-1 text-right">
                        <button onClick={() => { setLogging(logging === a.id ? null : a.id); setNote(''); }} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"><Wrench className="w-3.5 h-3.5" />Log service</button>
                      </td>
                    </tr>
                    {logging === a.id && (
                      <tr><td colSpan={7} className="pb-3 px-1">
                        <form className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2" onSubmit={e => { e.preventDefault(); void onService(a.id, note.trim() || 'Routine service').then(() => setLogging(null)); }}>
                          <span className="text-[12px] text-ink-2">Service {a.id} today:</span>
                          <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What was done (props, motors, battery swap…)" className="flex-1 min-w-[200px] rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink" />
                          <ToolButton size="sm" primary label="Save" onClick={() => void onService(a.id, note.trim() || 'Routine service').then(() => setLogging(null))} />
                          <IconButton icon={<X />} label="Cancel" onClick={() => setLogging(null)} />
                        </form>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {fleet.length > 8 && <button onClick={() => setAll(v => !v)} className="mt-2 px-1 text-[12px] font-medium text-accent hover:underline">{all ? 'Show fewer' : `Show all ${fleet.length} aircraft`}</button>}
        </div>
      )}
    </Section>
  );
};

// ---- export ----------------------------------------------------------------------

function exportLog(rs: SessionRollup[]) {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['date', 'product', 'flight', 'link', 'duration_min', 'flight_hours', 'aircraft', 'distance_km', 'warnings', 'critical', 'details', 'sample'].map(cell).join(',')];
  for (const r of [...rs].sort((a, b) => a.startedAt - b.startedAt)) {
    rows.push([new Date(r.startedAt).toISOString(), LABEL[r.vertical], r.title, r.source.toLowerCase(), (r.durationS / 60).toFixed(1), flightHours(r).toFixed(3), r.aircraft.length,
      (r.aircraft.reduce((s, a) => s + a.distanceM, 0) / 1000).toFixed(2), r.events.warning, r.events.critical,
      Object.entries(r.highlights).map(([k, v]) => `${k}=${Math.round(v * 100) / 100}`).join(' '), r.sample ? 'yes' : ''].map(cell).join(','));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }));
  a.download = `flight-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
