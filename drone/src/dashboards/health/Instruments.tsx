import React, { useState } from 'react';
import { LIMITS, type HealthReport, type Level, type MotorState } from '../../diagnostics/health';

/**
 * The health screen's instruments. The four on the diagnostic deck are drawn
 * for its dark surface in both themes (the deck is a screen, like the imagery
 * panels elsewhere); the two charts below it take the page's theme tokens.
 *
 * Status colours are validated for the deck surface (dataviz validator: contrast
 * passes; amber and green sit close for red-green colour blindness), so every
 * status also carries a word, and the rings on the hologram a style.
 */

export const DECK = {
  ink: '#dbe7f5', ink2: '#9fb2c9', ink3: '#62778f', line: 'rgba(90, 210, 255, 0.16)', faint: 'rgba(90, 210, 255, 0.07)',
  holo: '#5ad2ff', ok: '#4ade80', warn: '#fbbf24', bad: '#f87171',
};
/** Validated vibration-axis colours for the deck surface (x, y, z). */
const AXIS = ['#7474ea', '#10a08f', '#e46f25'];
const STATUS: Record<Level, string> = { OK: DECK.ok, WATCH: DECK.warn, FAULT: DECK.bad, UNKNOWN: DECK.ink3 };
const WORD: Record<Level, string> = { OK: 'Good', WATCH: 'Watch', FAULT: 'Fault', UNKNOWN: 'No data' };
const MONO = '"JetBrains Mono", ui-monospace, monospace';

/** A deck instrument: HUD corner brackets, a label, and its reading. */
export const Instrument: React.FC<{ label: string; level?: Level; right?: React.ReactNode; children: React.ReactNode; id?: string }> = ({ label, level, right, children, id }) => (
  <section id={id} className="holo-panel relative min-w-0 rounded-[12px] px-3.5 pt-3 pb-3" aria-label={label}>
    <header className="flex items-center justify-between gap-2">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap" style={{ color: DECK.ink2 }}>{label}</h3>
      {right ?? (level && level !== 'UNKNOWN' && <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: STATUS[level] }}>{WORD[level]}</span>)}
    </header>
    {children}
  </section>
);

const polar = (cx: number, cy: number, r: number, deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const; };
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// ---------------------------------------------------------------------------- vibration dial

/** Vibration as a dial: 0–90 m/s² over 240°, good / watch / fault zones, the needle on the worst axis. */
export const VibeDial: React.FC<{ vibe: HealthReport['vibe'] }> = ({ vibe }) => {
  const MAX = 90, A0 = -120, A1 = 120;
  const ang = (v: number) => A0 + (Math.min(MAX, Math.max(0, v)) / MAX) * (A1 - A0);
  const worst = vibe ? Math.max(vibe.x, vibe.y, vibe.z) : null;
  const level: Level = worst == null ? 'UNKNOWN' : worst >= LIMITS.vibeFault ? 'FAULT' : worst >= LIMITS.vibeWatch ? 'WATCH' : 'OK';
  const axis = vibe && worst != null ? (worst === vibe.z ? 'vertical' : worst === vibe.x ? 'forward' : 'side') : '';
  const cx = 100, cy = 92, R = 70;
  return (
    <Instrument label="Vibration" level={level} id="health-dial">
      <svg viewBox="0 0 200 150" className="w-full max-w-[260px] mx-auto block" role="img" aria-label={worst == null ? 'Vibration: no data' : `Vibration ${Math.round(worst)} m/s², ${WORD[level].toLowerCase()}, mostly ${axis}`}>
        <path d={arcPath(cx, cy, R, A0, ang(LIMITS.vibeWatch))} stroke={DECK.holo} strokeOpacity={0.35} strokeWidth={5} fill="none" />
        <path d={arcPath(cx, cy, R, ang(LIMITS.vibeWatch) + 1, ang(LIMITS.vibeFault))} stroke={DECK.warn} strokeOpacity={0.55} strokeWidth={5} fill="none" strokeDasharray="5 3" />
        <path d={arcPath(cx, cy, R, ang(LIMITS.vibeFault) + 1, A1)} stroke={DECK.bad} strokeOpacity={0.6} strokeWidth={5} fill="none" />
        {Array.from({ length: 19 }, (_, i) => i * 5).map(v => {
          const major = v % 30 === 0, [x0, y0] = polar(cx, cy, R - 9, ang(v)), [x1, y1] = polar(cx, cy, R - (major ? 17 : 13), ang(v));
          return <line key={v} x1={x0} y1={y0} x2={x1} y2={y1} stroke={DECK.ink3} strokeWidth={major ? 1.4 : 0.8} />;
        })}
        {[0, 30, 60, 90].map(v => { const [x, y] = polar(cx, cy, R - 27, ang(v)); return <text key={v} x={x} y={y + 3} textAnchor="middle" style={{ font: `500 9px ${MONO}`, fill: DECK.ink3 }}>{v}</text>; })}
        {worst != null && (() => {
          const [x, y] = polar(cx, cy, R - 4, ang(worst)), [bx, by] = polar(cx, cy, 10, ang(worst) + 180);
          return <g className="dial-needle">
            <line x1={bx} y1={by} x2={x} y2={y} stroke={STATUS[level]} strokeWidth={2.2} strokeLinecap="round" />
            <circle cx={x} cy={y} r={3} fill={STATUS[level]} />
          </g>;
        })()}
        <circle cx={cx} cy={cy} r={5} fill="#0a1424" stroke={DECK.holo} strokeOpacity={0.6} />
        <text x={cx} y={cy + 34} textAnchor="middle" style={{ font: `600 22px ${MONO}`, fill: DECK.ink }}>{worst == null ? '—' : Math.round(worst)}</text>
        <text x={cx} y={cy + 47} textAnchor="middle" style={{ font: `500 9px ${MONO}`, fill: DECK.ink3, letterSpacing: '0.08em' }}>{worst == null ? 'WAITING' : `M/S² · ${axis.toUpperCase()}`}</text>
      </svg>
      <div className="mt-1 grid grid-cols-3 gap-1 text-center" style={{ font: `500 10.5px ${MONO}`, color: DECK.ink2 }}>
        {(['x', 'y', 'z'] as const).map((k, i) => (
          <span key={k}><span className="inline-block w-2 h-0.5 align-middle mr-1 rounded" style={{ background: AXIS[i] }} />{k.toUpperCase()} <span style={{ color: DECK.ink }}>{vibe ? Math.round(vibe[k]) : '—'}</span></span>
        ))}
      </div>
    </Instrument>
  );
};

// ---------------------------------------------------------------------------- motor load

/** Each motor's command as a lit segment bar, with its difference from the average. */
export const MotorLoad: React.FC<{ motors: MotorState[] }> = ({ motors }) => {
  const SEG = 18;
  const worst: Level = motors.some(m => m.level === 'FAULT') ? 'FAULT' : motors.some(m => m.level === 'WATCH') ? 'WATCH' : motors.some(m => m.level === 'OK') ? 'OK' : 'UNKNOWN';
  return (
    <Instrument label="Motor load" level={worst} id="health-load">
      {!motors.length ? <p className="py-6 text-[12px]" style={{ color: DECK.ink3 }}>No motor outputs.</p> : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {motors.map(m => {
            const lit = Math.round(((m.outputPct ?? 0) / 100) * SEG);
            const col = m.level === 'WATCH' || m.level === 'FAULT' ? STATUS[m.level] : DECK.holo;
            const d = m.deviationPct;
            return (
              <li key={m.n} className="grid items-center gap-2" style={{ gridTemplateColumns: '24px 1fr 52px' }}>
                <span style={{ font: `600 11px ${MONO}`, color: DECK.ink }}>M{m.n}</span>
                <span className="flex gap-[2px] h-3" aria-hidden>
                  {Array.from({ length: SEG }, (_, s) => (
                    <span key={s} className="flex-1 rounded-[1.5px]" style={{ background: s < lit ? col : DECK.faint, boxShadow: s < lit && s === lit - 1 ? `0 0 6px ${col}` : undefined, opacity: s < lit ? 0.55 + 0.45 * (s / SEG) : 1 }} />
                  ))}
                </span>
                <span className="text-right" style={{ font: `500 10.5px ${MONO}`, color: m.level === 'WATCH' || m.level === 'FAULT' ? STATUS[m.level] : DECK.ink2 }}>
                  {m.outputPct == null ? '—' : `${Math.round(m.outputPct)}%`}
                  <span className="block text-[9.5px]" style={{ color: m.level === 'WATCH' || m.level === 'FAULT' ? STATUS[m.level] : DECK.ink3 }}>{d == null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}${m.level === 'WATCH' || m.level === 'FAULT' ? ` ${WORD[m.level]}` : ''}`}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Instrument>
  );
};

// ---------------------------------------------------------------------------- battery

/** Charge as a ring, pack voltage and current in the middle, each cell as a bar. */
export const BatteryRing: React.FC<{ battery: HealthReport['battery']; cells: number[] }> = ({ battery, cells }) => {
  const pct = battery?.remainingPct ?? null;
  const spread = cells.length > 1 ? Math.max(...cells) - Math.min(...cells) : 0;
  const lowCell = cells.length ? Math.min(...cells) : null;
  const level: Level = !battery ? 'UNKNOWN'
    : spread >= LIMITS.cellSpreadFaultV || (lowCell != null && lowCell < LIMITS.cellLowFaultV) ? 'FAULT'
    : spread >= LIMITS.cellSpreadWatchV || (lowCell != null && lowCell < LIMITS.cellLowWatchV) || (pct != null && pct < 20) ? 'WATCH' : 'OK';
  const cx = 60, cy = 60, R = 46, A0 = -135, A1 = 135;
  const end = pct == null ? A0 : A0 + (Math.max(0, Math.min(100, pct)) / 100) * (A1 - A0);
  const col = pct != null && pct < 20 ? DECK.warn : DECK.holo;
  return (
    <Instrument label="Battery" level={level} id="health-battery">
      <div className="mt-1 flex items-center gap-3">
        <svg viewBox="0 0 120 112" className="w-[48%] max-w-[150px] shrink-0 block" role="img" aria-label={pct == null ? 'Battery charge not reported' : `Battery ${pct}% left`}>
          <path d={arcPath(cx, cy, R, A0, A1)} stroke={DECK.faint} strokeWidth={8} fill="none" strokeLinecap="round" />
          {pct != null && pct > 0 && <path d={arcPath(cx, cy, R, A0, end)} stroke={col} strokeWidth={8} fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${col})` }} />}
          <text x={cx} y={cy + 4} textAnchor="middle" style={{ font: `600 20px ${MONO}`, fill: DECK.ink }}>{pct == null ? '—' : `${pct}%`}</text>
          <text x={cx} y={cy + 19} textAnchor="middle" style={{ font: `500 10px ${MONO}`, fill: DECK.ink2 }}>{battery?.packV ? `${battery.packV.toFixed(1)} V` : 'pack'}{battery?.currentA != null ? ` · ${battery.currentA.toFixed(0)} A` : ''}</text>
        </svg>
        <div className="min-w-0 flex-1">
          {cells.length ? (
            <div className="flex items-end gap-1.5 h-[64px]" aria-label={`Cells ${cells.map(v => v.toFixed(2)).join(', ')} volts`}>
              {cells.map((v, i) => {
                const h = Math.max(6, Math.min(100, ((v - 3.0) / (4.25 - 3.0)) * 100));
                const low = v - Math.min(...cells) < 1e-6 && spread >= LIMITS.cellSpreadWatchV;
                const c = low ? (spread >= LIMITS.cellSpreadFaultV ? DECK.bad : DECK.warn) : DECK.holo;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full rounded-[3px]" style={{ height: `${h}%`, background: `linear-gradient(to top, ${c}, ${c}55)`, boxShadow: `0 0 8px ${c}55` }} />
                  </div>
                );
              })}
            </div>
          ) : <p className="text-[11px]" style={{ color: DECK.ink3 }}>Pack voltage only.</p>}
          {cells.length > 0 && <div className="mt-1 flex gap-1.5" style={{ font: `500 9.5px ${MONO}`, color: DECK.ink2 }}>{cells.map((v, i) => <span key={i} className="flex-1 text-center">{v.toFixed(2)}</span>)}</div>}
          <div className="mt-1.5" style={{ font: `500 9.5px ${MONO}`, color: spread >= LIMITS.cellSpreadWatchV ? STATUS[level] : DECK.ink3 }}>
            {cells.length > 1 ? `spread ${Math.round(spread * 1000)} mV${spread >= LIMITS.cellSpreadWatchV ? ` · ${WORD[level]}` : ''}` : battery?.tempC != null ? `${Math.round(battery.tempC)} °C` : ''}
          </div>
        </div>
      </div>
    </Instrument>
  );
};

// ---------------------------------------------------------------------------- sensor agreement

/**
 * The navigation filter's check of each sensor against the others, as a radar.
 * ArduPilot's EKF variance (or PX4's test ratio) for the compass, position,
 * height and velocity: near the centre the sensors agree; the dashed ring is
 * the watch line, the solid one the failsafe.
 */
export const SensorRadar: React.FC<{ nav: HealthReport['nav'] }> = ({ nav }) => {
  const [watch, fault] = nav?.source === 'ESTIMATOR' ? [LIMITS.estWatch, LIMITS.estFault] : [LIMITS.ekfWatch, LIMITS.ekfFault];
  const MAX = fault * 1.25, cx = 100, cy = 72, R = 44;
  const axes = nav ? [
    { k: 'Compass', v: nav.compass, a: 0 }, { k: 'Position', v: nav.posHoriz, a: 90 }, { k: 'Height', v: nav.posVert, a: 180 }, { k: 'Velocity', v: nav.velocity, a: 270 },
  ] : [];
  const worst = axes.length ? Math.max(...axes.map(a => a.v)) : null;
  const level: Level = worst == null ? 'UNKNOWN' : worst >= fault ? 'FAULT' : worst >= watch ? 'WATCH' : 'OK';
  const pt = (v: number, a: number) => polar(cx, cy, (Math.min(MAX, v) / MAX) * R, a);
  const ring = (v: number) => [0, 90, 180, 270].map(a => polar(cx, cy, (v / MAX) * R, a).join(',')).join(' ');
  return (
    <Instrument label="Sensor agreement" level={level} id="health-radar">
      <svg viewBox="-18 0 236 146" className="w-full max-w-[300px] mx-auto block" role="img" aria-label={nav ? `Navigation filter: ${axes.map(a => `${a.k} ${a.v.toFixed(2)}`).join(', ')}; watch at ${watch}, failsafe at ${fault}` : 'Navigation filter not reported'}>
        {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={ring(MAX * f)} fill="none" stroke={DECK.line} />)}
        <polygon points={ring(watch)} fill="none" stroke={DECK.warn} strokeOpacity={0.7} strokeDasharray="3 3" />
        <polygon points={ring(fault)} fill="none" stroke={DECK.bad} strokeOpacity={0.7} />
        {[0, 90, 180, 270].map(a => { const [x, y] = polar(cx, cy, R, a); return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke={DECK.line} />; })}
        {nav && <>
          <polygon points={axes.map(a => pt(a.v, a.a).join(',')).join(' ')} fill={STATUS[level] === DECK.ok ? DECK.holo : STATUS[level]} fillOpacity={0.18} stroke={level === 'OK' ? DECK.holo : STATUS[level]} strokeWidth={1.6} strokeLinejoin="round" />
          {axes.map(a => { const [x, y] = pt(a.v, a.a); return <circle key={a.k} cx={x} cy={y} r={2.6} fill={a.v >= fault ? DECK.bad : a.v >= watch ? DECK.warn : DECK.holo} />; })}
        </>}
        {[{ k: 'Compass', a: 0 }, { k: 'Position', a: 90 }, { k: 'Height', a: 180 }, { k: 'Velocity', a: 270 }].map(({ k, a }) => {
          const [x, y] = polar(cx, cy, R + 10, a), v = axes.find(z => z.k === k)?.v;
          const anchor = a === 90 ? 'start' : a === 270 ? 'end' : 'middle';
          return <text key={k} x={a === 90 ? x - 6 : a === 270 ? x + 6 : x} y={a === 0 ? y - 1 : a === 180 ? y + 8 : y + 3} textAnchor={anchor} style={{ font: `500 9px ${MONO}`, fill: v != null && v >= watch ? (v >= fault ? DECK.bad : DECK.warn) : DECK.ink2 }}>{k}{v != null ? ` ${v.toFixed(2)}` : ''}</text>;
        })}
      </svg>
      <p className="text-[10px] leading-snug" style={{ color: DECK.ink3 }}>How far GPS, compass, barometer and IMU disagree inside the navigation filter. Closer to the centre is better.</p>
    </Instrument>
  );
};

// ---------------------------------------------------------------------------- theme charts

/** Closest to a limit, second by second: the tightest reading scaled so watch is 50% and fault 100%. */
export const MarginTrace: React.FC<{ stress: HealthReport['stress'] }> = ({ stress }) => {
  const [hover, setHover] = useState<number | null>(null);
  const data = stress.history.map(v => Math.min(125, v * 100));
  const W = 600, H = 150, P = { l: 34, r: 10, t: 10, b: 18 }, MAX = 125;
  const X = (i: number) => P.l + (data.length > 1 ? (i / (data.length - 1)) * (W - P.l - P.r) : 0);
  const Y = (v: number) => P.t + (1 - v / MAX) * (H - P.t - P.b);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = data.length > 1 ? `${line} L${X(data.length - 1).toFixed(1)} ${Y(0)} L${X(0).toFixed(1)} ${Y(0)} Z` : '';
  const now = Math.round(stress.now * 100);
  const tone = now >= 100 ? 'var(--color-bad)' : now >= 50 ? 'var(--color-warn)' : 'var(--color-accent)';
  const hv = hover != null ? data[hover] : null;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <span className="num text-[26px] font-semibold leading-none" style={{ color: tone }}>{now}%</span>
        <span className="text-[13px] text-ink-2">{stress.worst ? <>of the way to a fault · tightest: <span className="text-ink font-medium">{stress.worst}</span></> : 'Waiting for readings.'}</span>
        {hv != null && <span className="ml-auto num text-[12px] text-ink-3">{Math.round(data.length - 1 - hover!)} s ago · {Math.round(hv)}%</span>}
      </div>
      {data.length < 2 ? <p className="text-[13px] text-ink-3 py-8 text-center">Collecting a reading each second.</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[150px]" preserveAspectRatio="none" role="img" aria-label={`Closest reading to a limit over the last ${data.length} seconds; now ${now}% of the way to its fault line`}
          onMouseMove={e => { const b = e.currentTarget.getBoundingClientRect(); const fx = ((e.clientX - b.left) / b.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((fx - P.l) / (W - P.l - P.r)) * (data.length - 1))))); }}
          onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="margin-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.28" /><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" /></linearGradient>
          </defs>
          <rect x={P.l} y={Y(100)} width={W - P.l - P.r} height={Y(50) - Y(100)} fill="var(--color-warn)" fillOpacity={0.06} />
          <rect x={P.l} y={Y(MAX)} width={W - P.l - P.r} height={Y(100) - Y(MAX)} fill="var(--color-bad)" fillOpacity={0.07} />
          {[0, 50, 100].map(v => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke={v === 100 ? 'var(--color-bad)' : v === 50 ? 'var(--color-warn)' : 'var(--color-line)'} strokeDasharray={v ? '4 4' : undefined} strokeOpacity={v ? 0.75 : 1} vectorEffect="non-scaling-stroke" />
              <text x={P.l - 5} y={Y(v) + 3} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{v === 0 ? '0' : v === 50 ? 'watch' : 'fault'}</text>
            </g>
          ))}
          <path d={area} fill="url(#margin-fill)" />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r={3.5} fill={tone} />
          {hover != null && <line x1={X(hover)} x2={X(hover)} y1={P.t} y2={H - P.b} stroke="var(--color-ink-3)" vectorEffect="non-scaling-stroke" />}
          <text x={W - P.r} y={H - 4} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>now</text>
          <text x={P.l} y={H - 4} style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{data.length} s ago</text>
        </svg>
      )}
    </div>
  );
};

/**
 * Compass against motor current, one dot per navigation-filter report this
 * flight, with a fitted line. Rising with the current points at a power lead
 * near the compass; flat means the aircraft itself is clean.
 */
export const MagScatter: React.FC<{ mag: HealthReport['mag']; source: 'EKF' | 'ESTIMATOR' | null }> = ({ mag, source }) => {
  const [hover, setHover] = useState<number | null>(null);
  const watch = source === 'ESTIMATOR' ? LIMITS.estWatch : LIMITS.ekfWatch;
  if (!mag || mag.points.length < 4) return <p className="text-[13px] text-ink-3 py-10 text-center">Needs a flight: the check compares the compass with the current the motors draw.</p>;
  const pts = mag.points;
  const W = 420, H = 170, P = { l: 34, r: 10, t: 10, b: 26 };
  const aMax = Math.max(10, ...pts.map(p => p[0])) * 1.08, cMax = Math.max(watch * 1.3, ...pts.map(p => p[1])) * 1.08;
  const X = (a: number) => P.l + (a / aMax) * (W - P.l - P.r), Y = (c: number) => P.t + (1 - c / cMax) * (H - P.t - P.b);
  const n = pts.length, ma = pts.reduce((s, p) => s + p[0], 0) / n, mc = pts.reduce((s, p) => s + p[1], 0) / n;
  let sab = 0, saa = 0; for (const [a, c] of pts) { sab += (a - ma) * (c - mc); saa += (a - ma) ** 2; }
  const slope = saa ? sab / saa : 0;
  const a0 = Math.min(...pts.map(p => p[0])), a1 = Math.max(...pts.map(p => p[0]));
  const follows = mag.r != null && mag.r >= LIMITS.magCorr && mag.hi - mag.lo >= LIMITS.magRise;
  const verdict = mag.r == null ? 'The current has not varied enough yet to tell.'
    : follows ? 'The compass follows the motor current: a power lead or ESC is too close to it.'
    : mag.r >= 0.4 ? 'A slight link with the current. Worth watching on the next flight.'
    : 'The compass does not follow the motor current. The wiring is clear of it.';
  const hp = hover != null ? pts[hover] : null;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <span className="num text-[26px] font-semibold leading-none" style={{ color: follows ? 'var(--color-warn)' : 'var(--color-ink)' }}>{mag.r == null ? '—' : mag.r.toFixed(2)}</span>
        <span className="text-[12px] text-ink-3">correlation{follows ? ' · Watch' : ''}</span>
        {hp && <span className="ml-auto num text-[12px] text-ink-3">{hp[0].toFixed(1)} A · {hp[1].toFixed(2)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[170px]" role="img" aria-label={`Compass variance against battery current, ${n} readings, correlation ${mag.r == null ? 'unknown' : mag.r.toFixed(2)}`}
        onMouseLeave={() => setHover(null)}>
        <line x1={P.l} x2={W - P.r} y1={Y(watch)} y2={Y(watch)} stroke="var(--color-warn)" strokeDasharray="4 4" strokeOpacity={0.75} />
        <text x={W - P.r} y={Y(watch) - 4} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>watch</text>
        <line x1={P.l} x2={W - P.r} y1={Y(0)} y2={Y(0)} stroke="var(--color-line)" />
        <line x1={P.l} x2={P.l} y1={P.t} y2={Y(0)} stroke="var(--color-line)" />
        {[0, Math.round(aMax / 2), Math.round(aMax * 0.92)].map(a => <text key={a} x={X(a)} y={H - 10} textAnchor="middle" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{a} A</text>)}
        {[0, +(cMax / 2).toFixed(1)].map(c => <text key={c} x={P.l - 5} y={Y(c) + 3} textAnchor="end" style={{ font: '10px Inter, sans-serif', fill: 'var(--color-ink-3)' }}>{c}</text>)}
        {pts.map((p, i) => (
          <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={hover === i ? 5 : 3.2} fill={p[1] >= watch ? 'var(--color-warn)' : 'var(--color-accent)'} fillOpacity={0.75} stroke="var(--color-surface)" strokeWidth={1}
            onMouseEnter={() => setHover(i)} />
        ))}
        {mag.r != null && <line x1={X(a0)} x2={X(a1)} y1={Y(mc + slope * (a0 - ma))} y2={Y(mc + slope * (a1 - ma))} stroke={follows ? 'var(--color-warn)' : 'var(--color-ink-3)'} strokeWidth={2} />}
      </svg>
      <p className="text-[12px] text-ink-2 mt-1">{verdict}</p>
    </div>
  );
};
