import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, Trash2, FileJson, Plane, ShieldAlert, Sparkles, Eye, HardDriveDownload } from 'lucide-react';
import { recordDb, type FlightEvent, type FlightSample, type FlightSession } from '../record/db';
import { exportSessionCsv, exportSessionJson, recorder, summarise } from '../record/recorder';
import { Headline, Card, Section, Divider, Stat, Chip, Dot, ToolButton, Activity, useAccentHex, formatClock, type Tone } from './ui';

/**
 * Flight records — the evidence trail.
 *
 * Every dashboard run is recorded (see src/record). This browses them, exports
 * them for an insurer or investigator, and prints a one-page report.
 */

const VERTICAL_META: Record<FlightSession['vertical'], { label: string; icon: React.ReactNode }> = {
  SURVEILLANCE: { label: 'Surveillance', icon: <Eye /> },
  DEFENSE: { label: 'Airspace defense', icon: <ShieldAlert /> },
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

  const refresh = useCallback(async () => {
    try { setSessions(await recordDb.listSessions()); } catch { setSessions([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  // A dashboard closing its session writes asynchronously, so the list can load a
  // moment too early and show it as still running. The recorder notifies once its
  // final write lands; re-read then.
  useEffect(() => recorder.subscribe(() => { void refresh(); }), [refresh]);

  const selected = sessions?.find(s => s.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId) { setSamples([]); setEvents([]); return; }
    let live = true;
    void (async () => {
      const [sm, ev] = await Promise.all([recordDb.samplesFor(selectedId), recordDb.eventsFor(selectedId)]);
      if (!live) return;
      setSamples(sm); setEvents(ev);
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
            <ul className="divide-y divide-line -mx-2 rail-scroll max-h-[calc(100vh-220px)] overflow-y-auto">
              {sessions?.map(s => {
                const sel = s.id === selectedId;
                const meta = VERTICAL_META[s.vertical];
                return (
                  <li key={s.id}>
                    <button onClick={() => setSelectedId(s.id)} aria-current={sel}
                      className={`w-full text-left px-2 py-2.5 rounded-lg transition-colors ${sel ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-ink">
                          <span className="text-ink-3 shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{meta.icon}</span>
                          <span className="truncate">{s.title}</span>
                        </span>
                        <Chip tone={s.source === 'SIMULATION' ? 'neutral' : 'ok'}>{s.source === 'SIMULATION' ? 'Sim' : 'Live'}</Chip>
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
                  <Chip tone={selected.source === 'SIMULATION' ? 'neutral' : 'ok'}>{selected.source === 'SIMULATION' ? 'Simulated data' : `Live · ${selected.source.toLowerCase()}`}</Chip>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">
                  {VERTICAL_META[selected.vertical].label} · {fmtDate(selected.startedAt)}
                  {selected.endedAt ? ` to ${fmtTime(selected.endedAt)}` : ' · still running'}
                </p>
                <p className="mt-0.5 num text-[11px] text-ink-3">Record {selected.id}</p>
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
                    text: `${e.kind === 'SYSTEM' ? '' : `${e.kind.toLowerCase()} · `}${e.text}${e.aircraft ? ` (${e.aircraft})` : ''}`,
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
