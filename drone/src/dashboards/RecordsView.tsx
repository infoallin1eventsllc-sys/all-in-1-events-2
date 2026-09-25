import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, Trash2, FileJson, ShieldAlert, Sparkles, Eye, HardDriveDownload, ScanLine } from 'lucide-react';
import { recordDb, type FlightEvent, type FlightSample, type FlightSession } from '../record/db';
import { exportSessionCsv, exportSessionJson, recorder, summarise } from '../record/recorder';
import { verify, type ChainCheck } from '../record/chain';
import * as sync from '../sync/sync';
import { Headline, Card, Section, Divider, Stat, Chip, ToolButton, Activity, useAccentHex, formatClock, type Tone } from './ui';

/**
 * Flight records — the evidence trail.
 *
 * Every dashboard run is recorded (see src/record). This browses them, exports
 * them for an insurer or investigator, and prints a one-page report.
 */

const VERTICAL_META: Record<FlightSession['vertical'], { label: string; icon: React.ReactNode }> = {
  SURVEILLANCE: { label: 'Surveillance', icon: <Eye /> },
  SURVEY: { label: 'Site survey', icon: <ScanLine /> },
  DEFENSE: { label: 'Airspace defense (retired)', icon: <ShieldAlert /> },
  LIGHT_SHOW: { label: 'Light show', icon: <Sparkles /> },
};

const SEVERITY_TONE: Record<FlightEvent['severity'], Tone> = { CRITICAL: 'bad', WARNING: 'warn', SUCCESS: 'ok', INFO: 'neutral' };

const fmtDate = (t: number) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });

export const RecordsView: React.FC = () => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const accent = useAccentHex(rootRef);
  const [sessions, setSessions] = useState<FlightSession[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [samples, setSamples] = useState<FlightSample[]>([]);
  const [events, setEvents] = useState<FlightEvent[]>([]);
  const [aircraft, setAircraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [integrity, setIntegrity] = useState<ChainCheck | null>(null);

  const refresh = useCallback(async () => {
    try { setSessions(await recordDb.listSessions()); } catch { setSessions([]); }
  }, []);
  useEffect(() => { void refresh(); const f = () => { void refresh(); }; window.addEventListener('demo-seeded', f); return () => window.removeEventListener('demo-seeded', f); }, [refresh]);
  // A dashboard closing its session writes asynchronously, so the list can load a
  // moment too early and show it as still running. The recorder notifies once its
  // final write lands; re-read then.
  useEffect(() => recorder.subscribe(() => { void refresh(); }), [refresh]);

  // Open the most recent finished flight rather than an empty panel.
  useEffect(() => {
    if (selectedId || !sessions?.length) return;
    const first = sessions.find(s => s.endedAt) ?? sessions[0];
    setSelectedId(first.id);
  }, [sessions, selectedId]);

  const selected = sessions?.find(s => s.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId) { setSamples([]); setEvents([]); return; }
    let live = true;
    void (async () => {
      const [sm, ev] = await Promise.all([recordDb.samplesFor(selectedId), recordDb.eventsFor(selectedId)]);
      if (!live) return;
      setSamples(sm); setEvents(ev);
      setIntegrity(null); verify(ev).then(c => { if (live) setIntegrity(c); }).catch(() => {});
      setAircraft(sm.length ? sm[0].aircraft : null);
    })();
    return () => { live = false; };
  }, [selectedId]);

  const summary = useMemo(() => (selected ? summarise(selected, samples, events) : null), [selected, samples, events]);
  const aircraftList = useMemo(() => Array.from(new Set(samples.map(s => s.aircraft))), [samples]);
  const track = useMemo(() => samples.filter(s => s.aircraft === (aircraft ?? aircraftList[0])), [samples, aircraft, aircraftList]);

  const remove = async (s: FlightSession) => {
    setBusy(true);
    try { await recordDb.deleteSession(s.id); if (selectedId === s.id) setSelectedId(null); await refresh(); }
    finally { setBusy(false); }
  };

  const totalEvents = sessions?.reduce((n, s) => n + s.eventCount, 0) ?? 0;
  const totalFlights = sessions?.length ?? 0;
  const lastFlight = sessions?.[0];

  return (
    <div ref={rootRef} id="records-view" className="space-y-5">
      <div className="print:hidden">
        <Headline
          title="Flight records"
          context="Every dashboard run is recorded here — what flew, where it went, and every command it was given."
          stats={[
            { label: 'Sessions', value: totalFlights },
            { label: 'Logged events', value: totalEvents },
            { label: 'Most recent', value: lastFlight ? fmtDate(lastFlight.startedAt).split(',')[0] : '—' },
            { label: 'Stored', value: recordDb.available() ? 'On this device' : 'Unavailable', tone: recordDb.available() ? 'neutral' : 'warn' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
        {/* Session list */}
        <Card className="print:hidden xl:sticky xl:top-[72px]">
          <Section title="Sessions" right={sessions ? `${sessions.length} kept` : 'loading'}>
            {!recordDb.available() && <p className="text-[13px] text-warn">This browser has no local storage available, so nothing can be recorded. Private mode blocks it.</p>}
            {sessions && sessions.length === 0 && recordDb.available() && (
              <p className="text-[13px] text-ink-3">No records yet. Open a dashboard and a session starts automatically; it is kept once something happens in it.</p>
            )}
            <ul id="records-list" className="divide-y divide-line -mx-2 rail-scroll max-h-[calc(100vh-220px)] overflow-y-auto">
              {sessions?.map(s => {
                const sel = s.id === selectedId;
                const meta = VERTICAL_META[s.vertical];
                return (
                  <li key={s.id}>
                    <button onClick={() => setSelectedId(s.id)} aria-current={sel} data-sample={s.sample ? 'true' : undefined}
                      className={`w-full text-left px-2 py-2.5 rounded-lg transition-colors ${sel ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-ink">
                          <span className="text-ink-3 shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{meta.icon}</span>
                          <span className="truncate">{s.title}</span>
                        </span>
                        <Chip tone={s.sample ? 'accent' : s.source === 'SIMULATION' ? 'neutral' : 'ok'}>{s.sample ? 'Sample' : s.source === 'SIMULATION' ? 'Sim' : 'Live'}</Chip>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                        <span className="num">{fmtDate(s.startedAt)}</span>
                        <span className="num">{formatClock(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000)} · {s.eventCount} events</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        </Card>

        {/* Detail / report */}
        {selected && summary ? (
          <Card id="flight-report">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-semibold text-ink">{selected.title}</h2>
                  <Chip tone={selected.sample ? 'accent' : selected.source === 'SIMULATION' ? 'neutral' : 'ok'}>{selected.sample ? 'Sample record' : selected.source === 'SIMULATION' ? 'Simulated data' : `Live · ${selected.source.toLowerCase()}`}</Chip>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">
                  {VERTICAL_META[selected.vertical].label} · {fmtDate(selected.startedAt)}
                  {selected.endedAt ? ` to ${fmtTime(selected.endedAt)}` : ' · still running'}
                </p>
                <p className="mt-0.5 num text-[11px] text-ink-3">Record {selected.id}</p>
                {integrity && (
                  <p id="record-integrity" className="mt-2">
                    {integrity.status === 'VERIFIED' && <Chip tone="ok">Record intact · {integrity.checked} entries chained with SHA-256</Chip>}
                    {integrity.status === 'BROKEN' && <Chip tone="bad">Changed after recording, from entry {(integrity.brokenAt ?? 0) + 1}</Chip>}
                    {integrity.status === 'UNSIGNED' && <Chip tone="neutral">Recorded before record signing</Chip>}
                    {sync.enabled() && !selected.sample && <Chip className="ml-2" tone={sync.queue.done().has(selected.id) ? 'ok' : 'neutral'}>{sync.queue.done().has(selected.id) ? 'Copy on the server' : 'Waiting to upload'}</Chip>}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <ToolButton size="sm" icon={<Printer />} label="Print report" onClick={() => window.print()} />
                <ToolButton size="sm" icon={<Download />} label="CSV" onClick={() => void exportSessionCsv(selected)} />
                <ToolButton size="sm" icon={<FileJson />} label="JSON" onClick={() => void exportSessionJson(selected)} />
                <ToolButton size="sm" icon={<Trash2 />} label="Delete" danger disabled={busy} onClick={() => void remove(selected)} />
              </div>
            </div>

            <Divider className="my-4" />

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
              <Stat label="Duration" value={formatClock(summary.durationS)} />
              <Stat label="Aircraft" value={summary.aircraft.length || '—'} />
              <Stat label="Distance" value={summary.distanceM > 0 ? (summary.distanceM / 1000).toFixed(2) : '—'} unit="km" />
              <Stat label="Max altitude" value={summary.maxAltM.toFixed(0)} unit="m" />
              <Stat label="Max speed" value={(summary.maxSpeedMps * 3.6).toFixed(0)} unit="km/h" />
              <Stat label="Lowest battery" value={summary.minBatteryPct <= 100 ? summary.minBatteryPct.toFixed(0) : '—'} unit="%" tone={summary.minBatteryPct < 20 ? 'warn' : 'neutral'} />
              <Stat label="Critical events" value={summary.criticalEvents} tone={summary.criticalEvents ? 'bad' : 'neutral'} />
            </div>

            {selected.compliance && (
              <>
                <Divider className="my-4" />
                <Section title="Flown under" right="FAA Part 107 records at the start">
                  <dl id="record-compliance" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3 text-[13px]">
                    {([
                      ['Remote pilot', selected.compliance.pilot ? `${selected.compliance.pilot} · certificate ${selected.compliance.pilotCert || '—'}` : 'Not on file'],
                      ['Aircraft registration', selected.compliance.aircraft.length ? selected.compliance.aircraft.slice(0, 4).map(a => `${a.name} ${a.reg || '—'}`).join(', ') + (selected.compliance.aircraft.length > 4 ? ` +${selected.compliance.aircraft.length - 4}` : '') : 'Not on file'],
                      ...(selected.vertical === 'LIGHT_SHOW' ? [['Waiver', selected.compliance.waiver ?? 'None on file']] : []),
                      ...(selected.compliance.authorization ? [['Airspace authorization', selected.compliance.authorization]] : []),
                      ['Insurance', selected.compliance.insurance ?? 'Not on file'],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="min-w-0"><dt className="text-[11px] text-ink-3">{k}</dt><dd className="num text-ink break-words">{v}</dd></div>
                    ))}
                  </dl>
                </Section>
              </>
            )}

            {samples.some(r => r.lat != null) && (
              <>
                <Divider className="my-4" />
                <Section title="Flight path" right={`${aircraftList.length} aircraft · north up`}>
                  <FlightPathMap rows={samples} aircraft={aircraftList} selected={aircraft ?? aircraftList[0]} onSelect={setAircraft} />
                </Section>
              </>
            )}

            {track.length > 1 && (
              <>
                <Divider className="my-4" />
                <Section
                  title="Altitude (m)"
                  right={aircraftList.length > 1 ? (
                    <span className="flex flex-wrap gap-1 print:hidden">
                      {aircraftList.map(a => (
                        <button key={a} onClick={() => setAircraft(a)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${a === (aircraft ?? aircraftList[0]) ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink'}`}>{a}</button>
                      ))}
                    </span>
                  ) : (aircraftList[0] ?? '')}
                >
                  <AltitudeChart rows={track} accent={accent} />
                </Section>
              </>
            )}

            <Divider className="my-4" />
            <Section title="What happened" right={`${events.length} entries`}>
              {events.length === 0
                ? <p className="text-[13px] text-ink-3">No events logged in this session.</p>
                : <Activity max={400} empty="" items={events.map(e => ({
                    id: String(e.id ?? `${e.t}-${e.text}`),
                    ts: fmtTime(e.t),
                    tone: SEVERITY_TONE[e.severity],
                    text: `${e.kind === 'SYSTEM' ? '' : `${e.kind.toLowerCase()} · `}${e.text}${e.aircraft ? ` (${e.aircraft})` : ''}${e.operator && (e.kind === 'COMMAND' || e.kind === 'SHOW' || e.kind === 'PAYLOAD') ? ` · ${e.operator.split(' · ')[0]}` : ''}`,
                  }))} />}
            </Section>

            <Divider className="my-4" />
            <p className="text-[11px] text-ink-3">
              Generated by All in 1 Drone Command on {fmtDate(Date.now())}. Positions and telemetry as reported by the
              aircraft and recorded by the ground console.{selected.source === 'SIMULATION' ? ' This session ran on simulated data and is not a record of a real flight.' : ''}
            </p>
          </Card>
        ) : (
          <Card className="print:hidden">
            <div className="py-10 text-center">
              <HardDriveDownload className="w-6 h-6 mx-auto text-ink-3" />
              <p className="mt-3 text-[14px] font-medium text-ink">Select a session</p>
              <p className="mt-1 text-[13px] text-ink-2 max-w-md mx-auto">
                Each record holds the flight path, the telemetry and every command given — the document you hand an
                insurer, a venue or an investigator.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

/** Altitude over time for one aircraft. One series, thin mark, recessive grid. */
const AltitudeChart: React.FC<{ rows: FlightSample[]; accent: string }> = ({ rows, accent }) => {
  const W = 900, H = 150, padL = 40, padR = 12, padT = 12, padB = 22;
  const t0 = rows[0].t, t1 = rows[rows.length - 1].t || t0 + 1;
  const maxAlt = Math.max(10, ...rows.map(r => r.altM));
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const y = (a: number) => H - padB - (a / maxAlt) * (H - padT - padB);
  const path = rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.t).toFixed(1)},${y(r.altM).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map(f => Math.round(maxAlt * f));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img"
      aria-label={`Altitude from ${new Date(t0).toLocaleTimeString()} to ${new Date(t1).toLocaleTimeString()}, peak ${maxAlt.toFixed(0)} metres`}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-line" />
          <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-ink-3">{v}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke={accent} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <text x={padL} y={H - 6} fontSize={10} fill="currentColor" className="text-ink-3">{new Date(t0).toLocaleTimeString([], { hour12: false })}</text>
      <text x={W - padR} y={H - 6} textAnchor="end" fontSize={10} fill="currentColor" className="text-ink-3">{new Date(t1).toLocaleTimeString([], { hour12: false })}</text>
    </svg>
  );
};

/**
 * Where each aircraft flew, north up, on a dark map surface. Colours are the
 * validated categorical set (dark-surface steps), fixed per aircraft in list order;
 * every path is also labelled at its end so colour is never the only cue.
 * Hover follows the selected aircraft: time, height, speed and battery.
 */
const PATH_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

const FlightPathMap: React.FC<{ rows: FlightSample[]; aircraft: string[]; selected: string; onSelect: (a: string) => void }> = ({ rows, aircraft, selected, onSelect }) => {
  const W = 900, H = 380, pad = 28;
  const [hover, setHover] = useState<FlightSample | null>(null);
  const geo = useMemo(() => {
    const pts = rows.filter(r => r.lat != null && r.lon != null);
    if (pts.length < 2) return null;
    const lat0 = pts.reduce((m, r) => m + r.lat!, 0) / pts.length;
    const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180), my = 111_320;
    const xs = pts.map(r => r.lon! * mx), ys = pts.map(r => -r.lat! * my);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0, 60);
    const k = Math.min((W - pad * 2) / Math.max(x1 - x0, span * 0.35), (H - pad * 2) / Math.max(y1 - y0, span * 0.35));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const P = (r: FlightSample) => [W / 2 + (r.lon! * mx - cx) * k, H / 2 + (-r.lat! * my - cy) * k] as const;
    const by = new Map<string, FlightSample[]>();
    for (const r of pts) { const l = by.get(r.aircraft) ?? []; l.push(r); by.set(r.aircraft, l); }
    // Scale bar: a round number of metres about a fifth of the width.
    const target = (W / 5) / k, pow = Math.pow(10, Math.floor(Math.log10(target)));
    const barM = [1, 2, 5, 10].map(f => f * pow).reduce((b, v) => (Math.abs(v - target) < Math.abs(b - target) ? v : b), pow);
    return { P, by, k, barM };
  }, [rows]);
  if (!geo) return null;
  const color = (a: string) => PATH_COLORS[Math.max(0, aircraft.indexOf(a)) % PATH_COLORS.length];
  const sel = geo.by.get(selected) ?? [];
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - b.left) / b.width) * W, my = ((e.clientY - b.top) / b.height) * H;
    let best: FlightSample | null = null, bd = 24 * 24;
    for (const r of sel) { const [x, y] = geo.P(r); const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = r; } }
    setHover(best);
  };
  const hp = hover ? geo.P(hover) : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[12px] text-ink-2 print:hidden">
        {aircraft.map(a => (
          <button key={a} onClick={() => onSelect(a)} aria-pressed={a === selected} className={`inline-flex items-center gap-1.5 ${a === selected ? 'text-ink font-medium' : 'hover:text-ink'}`}>
            <span className="w-3 h-[3px] rounded-full" style={{ background: color(a) }} />{a}
          </button>
        ))}
        <span className="ml-auto text-ink-3">Circle: take-off · square: landing</span>
      </div>
      <div className="relative rounded-[12px] overflow-hidden bg-[#0b0f14]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          aria-label={`Flight paths of ${aircraft.join(', ')}; selected ${selected}`}>
          <defs>
            <pattern id="fp-grid" width={Math.max(8, 50 * geo.k)} height={Math.max(8, 50 * geo.k)} patternUnits="userSpaceOnUse">
              <path d={`M ${Math.max(8, 50 * geo.k)} 0 L 0 0 0 ${Math.max(8, 50 * geo.k)}`} fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#fp-grid)" />
          {aircraft.map(a => {
            const list = geo.by.get(a); if (!list || list.length < 2) return null;
            const on = a === selected;
            const d = list.map((r, i) => { const [x, y] = geo.P(r); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
            const [sx, sy] = geo.P(list[0]), [ex, ey] = geo.P(list[list.length - 1]);
            return (
              <g key={a} opacity={on ? 1 : 0.45}>
                {on && <path d={d} fill="none" stroke={color(a)} strokeOpacity={0.25} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />}
                <path d={d} fill="none" stroke={color(a)} strokeWidth={on ? 2.5 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={sx} cy={sy} r={5} fill="#0b0f14" stroke={color(a)} strokeWidth={2} />
                <rect x={ex - 4.5} y={ey - 4.5} width={9} height={9} fill={color(a)} stroke="#0b0f14" strokeWidth={2} />
                {aircraft.length <= 4 && <text x={ex + 9} y={ey + 4} fontSize={11} fontWeight={600} fill="#e5e7eb">{a}</text>}
              </g>
            );
          })}
          {/* scale bar + north */}
          <g transform={`translate(${pad}, ${H - 18})`}>
            <line x1={0} x2={geo.barM * geo.k} y1={0} y2={0} stroke="#e5e7eb" strokeWidth={2} />
            <text x={0} y={-6} fontSize={10} fill="#cbd5e1">{geo.barM >= 1000 ? `${geo.barM / 1000} km` : `${geo.barM} m`}</text>
          </g>
          <g transform={`translate(${W - 26}, 26)`}><path d="M0 -12 L6 4 L0 0 L-6 4 Z" fill="#e5e7eb" /><text y={17} textAnchor="middle" fontSize={10} fill="#cbd5e1">N</text></g>
          {hp && <circle cx={hp[0]} cy={hp[1]} r={6} fill="none" stroke="#fff" strokeWidth={2} />}
        </svg>
        {hover && hp && (
          <div className="pointer-events-none absolute rounded-lg bg-black/80 px-2.5 py-1.5 text-[11px] text-white num"
            style={{ left: `${(hp[0] / W) * 100}%`, top: `${(hp[1] / H) * 100}%`, transform: 'translate(12px, -110%)' }}>
            <div className="font-semibold">{hover.aircraft} · {new Date(hover.t).toLocaleTimeString([], { hour12: false })}</div>
            <div>{hover.altM.toFixed(0)} m · {(hover.speedMps * 3.6).toFixed(0)} km/h · {hover.batteryPct.toFixed(0)}%</div>
          </div>
        )}
      </div>
    </div>
  );
};
