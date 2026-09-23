import React, { useEffect, useMemo, useState } from 'react';
import { OctagonAlert, TriangleAlert, CircleCheck, PlaneLanding, PlaneTakeoff, RefreshCw, Wrench, Compass, Download, Eye, Trash2, Stethoscope } from 'lucide-react';
import { useHealth } from '../diagnostics/useHealth';
import { LIMITS, PARTS, motorTrend, partsLife, type Action, type Finding, type FlightHealth, type Level, type MotorState, type HealthReport } from '../diagnostics/health';
import { SIM_FAULTS, SIM_FLIGHT_S, type SimFault } from '../diagnostics/sim';
import { Headline, Card, Section, Chip, Dot, Tabs, Segmented, ToolButton, Activity, Sparkline, type Tone } from './ui';

/**
 * Aircraft health: what is wrong with the aircraft, which part, and what to do.
 *
 *   Now             live in flight (or on the bench): motors on the airframe,
 *                   findings with the part and the action, every system's state
 *   After landing   one report per flight, motor trends across flights, and the
 *                   hands-on check the numbers cannot replace
 *   Parts           hours on each part since it was replaced, and the log
 */

const LEVEL: Record<Level, { tone: Tone; label: string }> = {
  OK: { tone: 'ok', label: 'OK' }, WATCH: { tone: 'warn', label: 'Watch' }, FAULT: { tone: 'bad', label: 'Fault' }, UNKNOWN: { tone: 'neutral', label: 'No data' },
};
const LEVEL_VAR: Record<Level, [string, string]> = {
  OK: ['var(--color-ok)', 'var(--color-ok-soft)'], WATCH: ['var(--color-warn)', 'var(--color-warn-soft)'],
  FAULT: ['var(--color-bad)', 'var(--color-bad-soft)'], UNKNOWN: ['var(--color-ink-3)', 'var(--color-surface-2)'],
};
const ACTION_ICON: Record<Action, React.ReactNode> = {
  LAND: <PlaneLanding className="w-3.5 h-3.5" />, REPLACE: <RefreshCw className="w-3.5 h-3.5" />, INSPECT: <Wrench className="w-3.5 h-3.5" />,
  CALIBRATE: <Compass className="w-3.5 h-3.5" />, UPDATE: <Download className="w-3.5 h-3.5" />, MONITOR: <Eye className="w-3.5 h-3.5" />,
};
const PHASE: Record<HealthReport['phase'], { label: string; tone: Tone; pulse?: boolean }> = {
  FLYING: { label: 'In flight', tone: 'accent', pulse: true }, LANDED: { label: 'Landed', tone: 'neutral' }, BENCH: { label: 'On the ground', tone: 'neutral' }, NO_DATA: { label: 'No aircraft', tone: 'neutral' },
};

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtWhen = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const partLabel = (p: string) => {
  const m = p.match(/^(prop|motor)-(\d+)$/);
  if (m) return `${m[1] === 'prop' ? 'Propeller' : 'Motor'} ${m[2]}`;
  return PARTS.find(x => x.id === p)?.label ?? p.charAt(0).toUpperCase() + p.slice(1);
};

const LevelIcon: React.FC<{ level: Level; className?: string }> = ({ level, className = 'w-5 h-5' }) =>
  level === 'FAULT' ? <OctagonAlert className={`${className} text-bad`} aria-hidden /> : level === 'WATCH' ? <TriangleAlert className={`${className} text-warn`} aria-hidden /> : level === 'OK' ? <CircleCheck className={`${className} text-ok`} aria-hidden /> : <Stethoscope className={`${className} text-ink-3`} aria-hidden />;

// ---------------------------------------------------------------------------

export const HealthView: React.FC = () => {
  const h = useHealth();
  const r = h.report;
  const [tab, setTab] = useState<'NOW' | 'AFTER' | 'PARTS'>('NOW');
  const faults = r.findings.filter(f => f.level === 'FAULT').length, watch = r.findings.length - faults;

  return (
    <div id="health-view" className="flex flex-col gap-5">
      <Headline
        title="Aircraft health"
        status={PHASE[r.phase]}
        context={`${h.aircraft} · ${r.frame.label} · ${h.source === 'LIVE' ? 'live from the aircraft' : 'simulated aircraft'}`}
        stats={[
          { label: 'Faults', value: r.phase === 'NO_DATA' ? '—' : faults, tone: faults ? 'bad' : 'neutral' },
          { label: 'To watch', value: r.phase === 'NO_DATA' ? '—' : watch, tone: watch ? 'warn' : 'neutral' },
          { label: r.phase === 'LANDED' ? 'Last flight' : 'Flight time', value: mmss(r.flightS) },
          { label: 'Firmware', value: <span className="text-[15px]">{r.firmware?.replace('ArduPilot ', 'ArduPilot ') ?? '—'}</span> },
        ]}
      />

      {h.source === 'SIMULATION' ? <SimBar /> : <LiveBar />}

      <Verdict report={r} />

      <Tabs
        className="max-w-[520px]"
        value={tab} onChange={setTab}
        items={[{ id: 'NOW', label: r.phase === 'FLYING' ? 'Now (in flight)' : 'Now' }, { id: 'AFTER', label: 'After landing', badge: h.flights.length || undefined }, { id: 'PARTS', label: 'Parts and service' }]}
      />
      {tab === 'NOW' && <NowTab report={r} />}
      {tab === 'AFTER' && <AfterTab />}
      {tab === 'PARTS' && <PartsTab />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SimBar: React.FC = () => {
  const { sim } = useHealth();
  return (
    <Card className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="min-w-0 flex-1 basis-[280px]">
        <div className="text-[13px] font-semibold text-ink">Simulated quadcopter</div>
        <div className="text-[12px] text-ink-3">{sim.fault === 'NONE' ? 'Pick a fault and fly it to see how it shows up. Connect an aircraft from the link menu to check it for real.' : `Simulating: ${SIM_FAULTS.find(f => f.id === sim.fault)?.detail.toLowerCase()}. Fly it and see where it shows up.`}</div>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-ink-2">
        <span>Fault</span>
        <select id="sim-fault" value={sim.fault} onChange={e => sim.setFault(e.target.value as SimFault)} title={SIM_FAULTS.find(f => f.id === sim.fault)?.detail}
          className="h-8 w-[220px] rounded-lg border border-line bg-surface px-2 text-[13px] text-ink">
          {SIM_FAULTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[12px] text-ink-3 min-w-[118px] text-right">{sim.flying ? `Flying ${mmss(sim.t)} / ${mmss(SIM_FLIGHT_S)}` : 'On the ground'}</span>
        <Segmented size="sm" value={String(sim.speed)} onChange={v => sim.setSpeed(+v)} items={[{ id: '1', label: '1×' }, { id: '4', label: '4×' }, { id: '10', label: '10×' }]} />
        {sim.flying
          ? <ToolButton id="sim-land" icon={<PlaneLanding />} label="Land" onClick={sim.land} />
          : <ToolButton id="sim-fly" primary icon={<PlaneTakeoff />} label="Fly a test flight" onClick={sim.takeoff} />}
      </div>
    </Card>
  );
};

const LiveBar: React.FC = () => {
  const h = useHealth();
  const [name, setName] = useState(h.aircraft);
  useEffect(() => setName(h.aircraft), [h.aircraft]);
  const missing = h.report.systems.filter(s => s.level === 'UNKNOWN');
  const hint: Record<string, string> = {
    PROPULSION: 'Motor outputs (SERVO_OUTPUT_RAW) are not arriving.',
    AIRFRAME: 'No VIBRATION messages: update the firmware or raise its stream rate.',
    BATTERY: 'No battery status. Check the power module settings.',
    FIRMWARE: 'The autopilot has not answered the version request yet.',
  };
  const noRpm = h.report.systems.find(s => s.id === 'PROPULSION')?.detail.includes('no rpm');
  return (
    <Card className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1 text-[12px] text-ink-3">
        Aircraft name (for its history and parts)
        <input value={name} onChange={e => setName(e.target.value)} onBlur={() => h.setAircraft(name)} onKeyDown={e => { if (e.key === 'Enter') h.setAircraft(name); }}
          className="h-8 w-[200px] rounded-lg border border-line bg-surface px-2 text-[13px] text-ink" />
      </label>
      <div className="min-w-0 flex-1 text-[12px] text-ink-2 space-y-1">
        <div className="text-[13px] font-semibold text-ink">What this aircraft reports</div>
        {missing.length === 0 && !noRpm && <div>Everything the health checks use is arriving.</div>}
        {noRpm && <div><Dot tone="warn" className="mr-1.5 mb-0.5" />No motor rpm. Turn on ESC telemetry (BLHeli / DShot, e.g. <span className="num">SERVO_BLH_TRATE</span>) to tell a damaged prop from a failing motor.</div>}
        {missing.map(s => <div key={s.id}><Dot tone="neutral" className="mr-1.5 mb-0.5" />{s.label}: {hint[s.id] ?? 'not reported by this aircraft.'}</div>)}
      </div>
    </Card>
  );
};

const Verdict: React.FC<{ report: HealthReport }> = ({ report: r }) => {
  const top = r.findings[0];
  const [fg, bg] = LEVEL_VAR[r.overall];
  const sub = r.overall === 'UNKNOWN' ? 'Waiting for telemetry.'
    : top ? `Next step: ${top.actionText}.${r.findings.length > 1 ? ` ${r.findings.length - 1} more below.` : ''}`
    : r.phase === 'FLYING' ? 'Motors balanced, vibration low, battery and sensors normal.'
    : r.phase === 'LANDED' ? 'Nothing wrong showed up in the flight data. Still do the hands-on check before the next flight.'
    : 'Sensors, battery, GPS and firmware are fine. Motor and vibration checks start once it flies.';
  return (
    <div id="health-verdict" role="status" className="flex items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3" style={{ borderColor: fg, background: bg }}>
      <LevelIcon level={r.overall} className="w-7 h-7 shrink-0" />
      <div className="min-w-0">
        <div className="text-[17px] font-semibold text-ink leading-snug">{r.verdict}</div>
        <div className="text-[13px] text-ink-2">{sub}</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Now
// ---------------------------------------------------------------------------

const NowTab: React.FC<{ report: HealthReport }> = ({ report: r }) => {
  const h = useHealth();
  const armIssue = r.findings.find(f => f.part === 'arms');
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <Card className="xl:col-span-5" id="health-airframe">
        <Section title="Motors" right={r.balanceSamples ? `balance from ${Math.round(r.balanceSamples / 4)} s of steady flight` : r.phase === 'FLYING' ? 'collecting steady flight…' : 'live command'}>
          {r.motors.length ? <>
            <AircraftDiagram motors={r.motors} armLevel={armIssue?.level ?? 'OK'} />
            <MotorTable motors={r.motors} />
          </> : <p className="text-[13px] text-ink-3 py-6">{r.frame.kind === 'PLANE' ? 'Fixed-wing aircraft: motor balance does not apply; the other checks do.' : 'Waiting for motor outputs.'}</p>}
        </Section>
      </Card>

      <Card className="xl:col-span-7" id="health-findings">
        <Section title="What needs attention" right={r.findings.length ? `${r.findings.length} found` : undefined}>
          <FindingList findings={r.findings} empty={r.phase === 'NO_DATA' ? 'No aircraft data yet.' : 'Nothing wrong found.'} onReplace={(f) => h.markReplaced(f.part!, f.title)} />
        </Section>
      </Card>

      <div className="xl:col-span-12 grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3" id="health-systems">
        {r.systems.map(s => (
          <div key={s.id} className="bg-surface border border-line rounded-[var(--radius-card)] px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{s.label}</span>
              <Chip tone={LEVEL[s.level].tone}>{LEVEL[s.level].label}</Chip>
            </div>
            <div className="num mt-1 text-[14px] text-ink">{s.reading}</div>
            {s.detail && <div className="text-[11px] text-ink-3 truncate">{s.detail}</div>}
          </div>
        ))}
      </div>

      <Card className="xl:col-span-7">
        <Section title="Vibration" right={`good under ${LIMITS.vibeWatch} m/s² · problems over ${LIMITS.vibeFault}`}>
          <VibeChart data={r.vibeHistory} clip={r.vibe?.clipDelta ?? 0} />
        </Section>
      </Card>
      <Card className="xl:col-span-5">
        <Section title="Battery cells" right={r.cellsV.length ? `spread ${Math.round((Math.max(...r.cellsV) - Math.min(...r.cellsV)) * 1000)} mV` : undefined}>
          <Cells cells={r.cellsV} />
        </Section>
      </Card>

      <Card className="xl:col-span-12">
        <Section title="Autopilot messages" right="warnings and errors the flight controller sent">
          <Activity max={12} empty="No messages yet." items={r.events.map((e, i) => ({ id: `${e.t}-${i}`, ts: new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), tone: LEVEL[e.level].tone, text: e.text }))} />
        </Section>
      </Card>
    </div>
  );
};

/** Top-down airframe: arms and motors in the autopilot's own numbering, coloured by state. */
const AircraftDiagram: React.FC<{ motors: MotorState[]; armLevel: Level }> = ({ motors, armLevel }) => {
  const S = 320, c = S / 2, L = 112, R = 34;
  const armStroke = armLevel === 'OK' ? 'var(--color-line-2)' : LEVEL_VAR[armLevel][0];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[340px] mx-auto block" role="img"
      aria-label={`Airframe seen from above. ${motors.map(m => `Motor ${m.n}: ${LEVEL[m.level].label}`).join('. ')}`}>
      <text x={c} y={16} textAnchor="middle" className="fill-[var(--color-ink-3)]" style={{ font: '600 11px Inter, sans-serif', letterSpacing: '0.08em' }}>FRONT</text>
      <path d={`M${c - 7} 26 L${c} 18 L${c + 7} 26`} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.5} />
      {motors.map(m => {
        const a = (m.angleDeg * Math.PI) / 180, x = c + Math.sin(a) * L, y = c - Math.cos(a) * L;
        return <line key={`arm${m.n}`} x1={c} y1={c} x2={x} y2={y} stroke={armStroke} strokeWidth={9} strokeLinecap="round" />;
      })}
      <rect x={c - 30} y={c - 38} width={60} height={76} rx={14} fill="var(--color-surface-2)" stroke="var(--color-line-2)" strokeWidth={1.5} />
      <rect x={c - 16} y={c - 26} width={32} height={20} rx={4} fill="none" stroke="var(--color-ink-3)" strokeWidth={1} />
      <text x={c} y={c + 22} textAnchor="middle" className="fill-[var(--color-ink-3)]" style={{ font: '500 9px Inter, sans-serif' }}>FC</text>
      {motors.map(m => {
        const a = (m.angleDeg * Math.PI) / 180, x = c + Math.sin(a) * L, y = c - Math.cos(a) * L;
        const [fg, bg] = LEVEL_VAR[m.level];
        const dir = m.spin === 'CW' ? 1 : -1;
        // spin arrow: an arc outside the prop disc
        const r2 = R + 7, a0 = -0.9, a1 = 0.9;
        const p0 = [x + Math.cos(a0) * r2, y + Math.sin(a0) * r2 * dir], p1 = [x + Math.cos(a1) * r2, y + Math.sin(a1) * r2 * dir];
        return (
          <g key={`m${m.n}`}>
            <circle cx={x} cy={y} r={R + 7} fill="none" stroke={fg} strokeOpacity={0.35} strokeDasharray="3 4" />
            <path d={`M${p0[0]} ${p0[1]} A ${r2} ${r2} 0 0 ${dir > 0 ? 1 : 0} ${p1[0]} ${p1[1]}`} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.2} markerEnd="url(#spin-arrow)" />
            <circle cx={x} cy={y} r={R} fill={bg} stroke={fg} strokeWidth={m.level === 'OK' || m.level === 'UNKNOWN' ? 1.5 : 3} />
            <text x={x} y={y - 6} textAnchor="middle" style={{ font: '700 13px Inter, sans-serif', fill: 'var(--color-ink)' }}>M{m.n}</text>
            <text x={x} y={y + 10} textAnchor="middle" className="num" style={{ font: '500 12px "JetBrains Mono", monospace', fill: 'var(--color-ink-2)' }}>{m.outputPct != null ? `${Math.round(m.outputPct)}%` : '—'}</text>
            <text x={x} y={y + 23} textAnchor="middle" style={{ font: '500 9px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{m.spin === 'CW' ? 'CW' : 'CCW'}</text>
          </g>
        );
      })}
      <defs>
        <marker id="spin-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill="var(--color-ink-3)" />
        </marker>
      </defs>
    </svg>
  );
};

/** Per motor: command, difference from the average (diverging bar), rpm, temperature, current. */
const MotorTable: React.FC<{ motors: MotorState[] }> = ({ motors }) => {
  const SPAN = 20;
  const pos = (v: number) => 50 + (Math.max(-SPAN, Math.min(SPAN, v)) / SPAN) * 50;
  return (
    <table className="w-full mt-3 text-[12px]">
      <thead>
        <tr className="text-ink-3 text-left">
          <th className="font-normal py-1">Motor</th><th className="font-normal">vs average</th><th className="font-normal text-right">rpm</th><th className="font-normal text-right">Temp</th><th className="font-normal text-right">Amps</th>
        </tr>
      </thead>
      <tbody>
        {motors.map(m => {
          const d = m.deviationPct;
          return (
            <tr key={m.n} className="border-t border-line">
              <td className="py-1.5"><span className="inline-flex items-center gap-1.5"><Dot tone={LEVEL[m.level].tone} /><span className="font-medium text-ink">M{m.n}</span></span></td>
              <td className="py-1.5 pr-3 w-[46%]">
                <div className="flex items-center gap-2">
                  <div className="relative h-2.5 flex-1 rounded-full bg-surface-2" aria-hidden>
                    <div className="absolute top-0 bottom-0 w-px bg-line-2" style={{ left: '50%' }} />
                    <div className="absolute top-[-2px] bottom-[-2px] w-px bg-warn opacity-60" style={{ left: `${pos(LIMITS.motorWatchPct)}%` }} />
                    <div className="absolute top-[-2px] bottom-[-2px] w-px bg-bad opacity-60" style={{ left: `${pos(LIMITS.motorFaultPct)}%` }} />
                    {d != null && <div className="absolute top-0 bottom-0 rounded-full" style={{ left: `${Math.min(50, pos(d))}%`, width: `${Math.abs(pos(d) - 50)}%`, background: m.level === 'WATCH' || m.level === 'FAULT' ? LEVEL_VAR[m.level][0] : 'var(--color-ink-3)' }} />}
                  </div>
                  <span className="num w-[46px] text-right text-ink">{d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}</span>
                </div>
              </td>
              <td className="num text-right text-ink-2">{m.rpm ? m.rpm.toLocaleString() : '—'}</td>
              <td className="num text-right text-ink-2">{m.tempC ? `${Math.round(m.tempC)}°` : '—'}</td>
              <td className="num text-right text-ink-2">{m.currentA ? m.currentA.toFixed(1) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
      <caption className="caption-bottom text-left text-[11px] text-ink-3 pt-2">A motor working harder than the rest points at its propeller or the motor itself. Lines mark {LIMITS.motorWatchPct}% (watch) and {LIMITS.motorFaultPct}% (fault).</caption>
    </table>
  );
};

const FindingList: React.FC<{ findings: Finding[]; empty: string; onReplace?: (f: Finding) => void; compact?: boolean }> = ({ findings, empty, onReplace, compact }) => {
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!findings.length) return <div className="flex items-center gap-2 py-3 text-[13px] text-ink-2"><CircleCheck className="w-4 h-4 text-ok" />{empty}</div>;
  return (
    <ul className="divide-y divide-line">
      {findings.map(f => (
        <li key={f.id} className="py-3 first:pt-0 flex gap-3">
          <LevelIcon level={f.level} className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[14px] font-semibold text-ink">{f.title}</span>
              <Chip tone={LEVEL[f.level].tone}>{LEVEL[f.level].label}</Chip>
            </div>
            {!compact && <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{f.detail}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium ${f.level === 'FAULT' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'}`}>{ACTION_ICON[f.action]}{f.actionText}</span>
              {onReplace && f.part && (f.action === 'REPLACE' || f.part.startsWith('prop-') || f.part.startsWith('motor-')) && (
                done.has(f.id)
                  ? <span className="text-[12px] text-ok">Logged as replaced</span>
                  : <button className="text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink" onClick={() => { onReplace(f); setDone(s => new Set(s).add(f.id)); }}>Mark {partLabel(f.part).toLowerCase()} replaced</button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

function useDark() {
  const read = () => document.documentElement.dataset.theme === 'dark';
  const [d, setD] = useState(read);
  useEffect(() => { const o = new MutationObserver(() => setD(read())); o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => o.disconnect(); }, []);
  return d;
}

/** Validated categorical colours (same set as Analytics), light / dark. */
const AXIS = { light: ['#5b5bd6', '#0d9488', '#c2410c'], dark: ['#7474ea', '#10a08f', '#e46f25'] };

const VibeChart: React.FC<{ data: { x: number; y: number; z: number }[]; clip: number }> = ({ data, clip }) => {
  const dark = useDark(); const col = AXIS[dark ? 'dark' : 'light'];
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, Hh = 150, P = { l: 30, r: 8, t: 8, b: 18 };
  const max = Math.max(80, ...data.flatMap(d => [d.x, d.y, d.z]));
  const X = (i: number) => P.l + (data.length > 1 ? (i / (data.length - 1)) * (W - P.l - P.r) : 0);
  const Y = (v: number) => P.t + (1 - v / max) * (Hh - P.t - P.b);
  const line = (k: 'x' | 'y' | 'z') => data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d[k]).toFixed(1)}`).join(' ');
  const last = data[data.length - 1];
  const hv = hover != null ? data[hover] : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1 text-[12px] text-ink-2">
        {(['x', 'y', 'z'] as const).map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: col[i] }} />{k === 'z' ? 'Vertical (z)' : k === 'x' ? 'Forward (x)' : 'Side (y)'} <span className="num text-ink">{(hv ?? last)?.[k].toFixed(0) ?? '—'}</span></span>
        ))}
        <span className="ml-auto">Clipping this flight <span className={`num font-medium ${clip ? 'text-bad' : 'text-ink'}`}>{clip}</span></span>
      </div>
      {data.length < 2 ? <p className="text-[13px] text-ink-3 py-8 text-center">Waiting for vibration data.</p> : (
        <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-[150px]" preserveAspectRatio="none" role="img" aria-label={`Vibration over the last ${Math.round(data.length / 2)} seconds; latest vertical ${last.z.toFixed(0)} m/s²`}
          onMouseMove={e => { const b = e.currentTarget.getBoundingClientRect(); const fx = ((e.clientX - b.left) / b.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((fx - P.l) / (W - P.l - P.r)) * (data.length - 1))))); }}
          onMouseLeave={() => setHover(null)}>
          {[0, LIMITS.vibeWatch, LIMITS.vibeFault].map(v => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke={v === LIMITS.vibeFault ? 'var(--color-bad)' : v === LIMITS.vibeWatch ? 'var(--color-warn)' : 'var(--color-line)'} strokeDasharray={v ? '4 4' : undefined} strokeOpacity={v ? 0.7 : 1} vectorEffect="non-scaling-stroke" />
              <text x={P.l - 4} y={Y(v) + 3} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{v}</text>
            </g>
          ))}
          {(['x', 'y', 'z'] as const).map((k, i) => <path key={k} d={line(k)} fill="none" stroke={col[i]} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {hover != null && <line x1={X(hover)} x2={X(hover)} y1={P.t} y2={Hh - P.b} stroke="var(--color-ink-3)" vectorEffect="non-scaling-stroke" />}
          <text x={W - P.r} y={Hh - 4} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>now</text>
        </svg>
      )}
    </div>
  );
};

const Cells: React.FC<{ cells: number[] }> = ({ cells }) => {
  if (!cells.length) return <p className="text-[13px] text-ink-3 py-6">This aircraft reports the pack voltage only. A cell monitor or smart battery adds per-cell checks.</p>;
  const lo = 3.0, hi = 4.25;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const min = Math.min(...cells);
  return (
    <div className="space-y-2">
      {cells.map((v, i) => {
        const level: Level = v < LIMITS.cellLowFaultV ? 'FAULT' : v < LIMITS.cellLowWatchV || v - min >= LIMITS.cellSpreadWatchV || (Math.max(...cells) - v >= LIMITS.cellSpreadWatchV && v === min) ? 'WATCH' : 'OK';
        return (
          <div key={i} className="flex items-center gap-3 text-[12px]">
            <span className="w-12 text-ink-2">Cell {i + 1}</span>
            <div className="relative flex-1 h-2.5 rounded-full bg-surface-2">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(v)}%`, background: LEVEL_VAR[level][0] }} />
              <div className="absolute top-[-2px] bottom-[-2px] w-px bg-warn opacity-70" style={{ left: `${pct(LIMITS.cellLowWatchV)}%` }} />
            </div>
            <span className="num w-14 text-right text-ink">{v.toFixed(2)} V</span>
          </div>
        );
      })}
      <p className="text-[11px] text-ink-3">Mark at {LIMITS.cellLowWatchV} V under load. Cells should stay within {LIMITS.cellSpreadWatchV * 1000} mV of each other.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// After landing
// ---------------------------------------------------------------------------

const CHECKS = [
  'Propellers: no chips, cracks, nicks or bends; tips intact; spinners and nuts tight',
  'Spin each motor by hand: smooth and quiet, no grinding, no up-and-down play',
  'Arms: no cracks at the root; clamps tight; every motor square to its arm',
  'Motor screws tight; no wires rubbing on the bells',
  'Flight controller and GPS mounts secure; dampers not hardened or torn',
  'Battery: no swelling, dents or scorched connector; warm, not hot',
  'Landing gear, camera and gimbal: free, undamaged, cables seated',
];

const AfterTab: React.FC = () => {
  const h = useHealth();
  const trend = useMemo(() => motorTrend(h.flights), [h.flights]);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-8 flex flex-col gap-3" id="health-flights">
        {h.flights.length === 0 && (
          <Card><p className="text-[13px] text-ink-2">No flights yet. A report is written here every time the aircraft lands and disarms{h.source === 'SIMULATION' ? ': fly a test flight above to see one' : ''}.</p></Card>
        )}
        {h.flights.map((f, i) => <FlightCard key={f.id ?? f.startedAt} f={f} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />)}
      </div>
      <div className="xl:col-span-4 flex flex-col gap-5">
        <Card>
          <Section title="Motor trend" right={`last ${Math.min(8, h.flights.length)} flights`}>
            {trend.length === 0 ? <p className="text-[13px] text-ink-3">Builds up over a few flights: a motor that works a little harder every flight is wearing out.</p> : (
              <ul className="space-y-2">
                {trend.map(m => (
                  <li key={m.n} className="grid grid-cols-[40px_1fr_64px] items-center gap-2 text-[12px]">
                    <span className="font-medium text-ink">M{m.n}</span>
                    <Sparkline data={m.series.map(v => v ?? 0)} color={m.rising ? 'var(--color-warn)' : 'var(--color-ink-3)'} height={22} />
                    <span className="num text-right text-ink">{m.latest == null ? '—' : `${m.latest > 0 ? '+' : ''}${m.latest.toFixed(1)}%`}</span>
                    {m.rising && <span className="col-span-3 -mt-1 text-[11px] text-warn">Working harder every flight: inspect its prop and bearings</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
        <Card id="health-checklist">
          <Section title="Hands-on check after landing" right={`${ticked.size}/${CHECKS.length}`}>
            <p className="text-[12px] text-ink-3 mb-2">The data finds what changes how it flies. A fresh crack in an arm or a prop doesn't show up until it gets worse, so check by hand.</p>
            <ul className="space-y-1.5">
              {CHECKS.map((c, i) => (
                <li key={i}>
                  <label className="flex items-start gap-2 text-[13px] text-ink-2 cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={ticked.has(i)} onChange={() => setTicked(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                    <span className={ticked.has(i) ? 'line-through text-ink-3' : ''}>{c}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>
        </Card>
      </div>
    </div>
  );
};

const FlightCard: React.FC<{ f: FlightHealth; open: boolean; onToggle: () => void }> = ({ f, open, onToggle }) => {
  const h = useHealth();
  return (
    <Card padded={false}>
      <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <LevelIcon level={f.overall} className="w-5 h-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink truncate">{f.verdict}</div>
          <div className="text-[12px] text-ink-3">{fmtWhen(f.startedAt)} · {mmss(f.airborneS)} in the air{f.sample ? ' · sample' : f.source === 'SIMULATION' ? ' · simulated' : ''}</div>
        </div>
        <Chip tone={LEVEL[f.overall].tone}>{f.findings.length ? `${f.findings.length} found` : 'Clean'}</Chip>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-line pt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <FindingList findings={f.findings} empty="Nothing wrong in this flight's data." onReplace={x => h.markReplaced(x.part!, x.title)} />
          </div>
          <div className="text-[12px]">
            <table className="w-full">
              <thead><tr className="text-ink-3 text-left"><th className="font-normal py-1">Motor</th><th className="font-normal text-right">Avg output</th><th className="font-normal text-right">vs avg</th><th className="font-normal text-right">rpm ×</th><th className="font-normal text-right">Max °C</th></tr></thead>
              <tbody>
                {f.motors.map(m => (
                  <tr key={m.n} className="border-t border-line">
                    <td className="py-1 font-medium text-ink">M{m.n}</td>
                    <td className="num text-right text-ink-2">{m.meanOutputPct?.toFixed(1) ?? '—'}%</td>
                    <td className={`num text-right ${m.deviationPct != null && m.deviationPct >= LIMITS.motorFaultPct ? 'text-bad' : m.deviationPct != null && m.deviationPct >= LIMITS.motorWatchPct ? 'text-warn' : 'text-ink'}`}>{m.deviationPct == null ? '—' : `${m.deviationPct > 0 ? '+' : ''}${m.deviationPct.toFixed(1)}%`}</td>
                    <td className="num text-right text-ink-2">{m.rpmRatio?.toFixed(2) ?? '—'}</td>
                    <td className="num text-right text-ink-2">{m.maxTempC ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-ink-3">Peak vibration</dt><dd className="num text-right text-ink">{f.vibeMax ? `${Math.round(Math.max(f.vibeMax.x, f.vibeMax.y, f.vibeMax.z))} m/s²` : '—'}</dd>
              <dt className="text-ink-3">Clipping</dt><dd className="num text-right text-ink">{f.clipDelta}</dd>
              <dt className="text-ink-3">Lowest cell</dt><dd className="num text-right text-ink">{f.minCellV ? `${f.minCellV.toFixed(2)} V` : '—'}</dd>
              <dt className="text-ink-3">Cell spread</dt><dd className="num text-right text-ink">{f.maxCellSpreadV != null ? `${Math.round(f.maxCellSpreadV * 1000)} mV` : '—'}</dd>
              <dt className="text-ink-3">Battery temp</dt><dd className="num text-right text-ink">{f.maxBatteryTempC != null ? `${Math.round(f.maxBatteryTempC)} °C` : '—'}</dd>
            </dl>
            {f.events.length > 0 && <div className="mt-3"><div className="text-ink-3 mb-1">Autopilot warnings</div><ul className="space-y-0.5 text-ink-2">{f.events.slice(0, 6).map((e, i) => <li key={i}><Dot tone={LEVEL[e.level].tone} className="mr-1.5 mb-0.5" />{e.text}</li>)}</ul></div>}
            {f.id != null && <button className="mt-3 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-bad" onClick={() => h.deleteFlight(f.id!)}><Trash2 className="w-3.5 h-3.5" />Delete this report</button>}
          </div>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Parts and service
// ---------------------------------------------------------------------------

const PartsTab: React.FC = () => {
  const h = useHealth();
  const life = useMemo(() => partsLife(h.flights, h.parts.map(p => ({ part: p.part!, t: p.t }))), [h.flights, h.parts]);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <Card className="xl:col-span-8" id="health-parts">
        <Section title="Hours since replaced" right={`from ${h.flights.length} recorded flight${h.flights.length === 1 ? '' : 's'}`}>
          <ul className="divide-y divide-line">
            {life.map(p => (
              <li key={p.id} className="py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[180px_1fr_auto] items-center gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">{p.label}</div>
                  <div className="text-[11px] text-ink-3">{p.note}</div>
                </div>
                <div className="hidden sm:block">
                  {p.interval != null ? (
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1 h-2 rounded-full bg-surface-2"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (p.hours / p.interval) * 100)}%`, background: LEVEL_VAR[p.level][0] }} /></div>
                      <span className="num text-[12px] text-ink w-[92px] text-right">{p.hours.toFixed(1)} / {p.interval} h</span>
                    </div>
                  ) : <span className="text-[12px] text-ink-3">{h.report.firmware ?? 'Version not reported yet'}</span>}
                  <div className="text-[11px] text-ink-3 mt-0.5">{(() => { const verb = p.id === 'firmware' ? 'Updated' : p.id === 'frame' || p.id === 'fc-mount' ? 'Checked' : 'Replaced'; return p.since ? `${verb} ${fmtWhen(p.since)}` : `${verb === 'Replaced' ? 'No replacement' : verb === 'Updated' ? 'No update' : 'No check'} logged yet`; })()}</div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  {p.level !== 'OK' && <Chip tone={LEVEL[p.level].tone}>{p.level === 'FAULT' ? 'Due' : 'Soon'}</Chip>}
                  {confirm === p.id
                    ? <><ToolButton size="sm" primary label="Confirm" onClick={() => { h.markReplaced(p.id, `${p.label} ${p.id === 'firmware' ? 'updated' : 'replaced'}`); setConfirm(null); }} /><ToolButton size="sm" label="Cancel" onClick={() => setConfirm(null)} /></>
                    : <ToolButton size="sm" label={p.id === 'firmware' ? 'Mark updated' : p.id === 'frame' || p.id === 'fc-mount' ? 'Mark checked' : 'Mark replaced'} onClick={() => setConfirm(p.id)} />}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">Starting intervals for a typical 5–10 kg quad. Your manufacturer's numbers win where they differ; any finding on the Now tab overrides the clock.</p>
        </Section>
      </Card>
      <Card className="xl:col-span-4">
        <Section title="Replacement log" right={h.aircraft}>
          <Activity max={20} empty="Nothing logged yet. Use Mark replaced here or on a finding." items={h.parts.map((p, i) => ({ id: `${p.t}-${i}`, ts: new Date(p.t).toLocaleDateString([], { month: 'short', day: 'numeric' }), tone: 'ok' as Tone, text: `${partLabel(p.part!)}: ${p.note}` }))} />
        </Section>
      </Card>
    </div>
  );
};
