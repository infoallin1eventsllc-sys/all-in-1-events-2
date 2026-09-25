import React from 'react';
import { useOperator, ROLE_LABEL } from '../operator/operator';

/**
 * Drone Command UI kit (v2).
 *
 * Quiet, client-facing components over the semantic tokens in index.css.
 * Rules: sentence-case labels, Inter for text, tabular numerals for values,
 * one accent per vertical, status colours only for status, no glass, no
 * decorative shadows, cards only where a boundary carries meaning.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'accent';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-ink', accent: 'text-accent',
};
const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', neutral: 'bg-ink-3', accent: 'bg-accent',
};
const TONE_SOFT: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', neutral: 'bg-surface-2 text-ink-2', accent: 'bg-accent-soft text-accent',
};

/** Hex values for canvas / SVG drawing that can't use CSS classes. */
export const TONE_HEX = { ok: '#15803d', warn: '#b45309', bad: '#b91c1c', neutral: '#8a94a6' } as const;

export const formatClock = (secs: number) => {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Read the live accent colour (for canvases/SVG) from the nearest dashboard root. */
export function useAccentHex(ref: React.RefObject<HTMLElement | null>, fallback = '#2563eb') {
  const [hex, setHex] = React.useState(fallback);
  React.useEffect(() => {
    const read = () => { if (ref.current) setHex(getComputedStyle(ref.current).getPropertyValue('--color-accent').trim() || fallback); };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [ref, fallback]);
  return hex;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface HeadlineProps {
  title: string;
  context: string;
  stats: { label: string; value: React.ReactNode; tone?: Tone }[];
  status?: { label: string; tone: Tone; pulse?: boolean };
  actions?: React.ReactNode;
}

/** The one header a dashboard gets: what this is, its state, four numbers, a few actions. */
export const Headline: React.FC<HeadlineProps> = ({ title, context, stats, status, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink leading-none">{title}</h1>
        {status && <Chip tone={status.tone} pulse={status.pulse}>{status.label}</Chip>}
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">{context}</p>
    </div>
    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
      {stats.map(s => (
        <div key={s.label} className="min-w-[72px]">
          <div className="text-[11px] text-ink-3">{s.label}</div>
          <div className={`num text-[20px] font-semibold leading-tight ${TONE_TEXT[s.tone ?? 'neutral']}`}>{s.value}</div>
        </div>
      ))}
      {actions && <div className="flex items-center gap-2 ml-2">{actions}</div>}
    </div>
  </div>
);

/** A bounded surface. Use for the rail and the action bar, not for every group of numbers. */
export const Card: React.FC<{ children: React.ReactNode; className?: string; id?: string; padded?: boolean }> = ({ children, className = '', id, padded = true }) => (
  <div id={id} className={`bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ${padded ? 'p-4' : ''} ${className}`}>{children}</div>
);

/** Section heading inside a rail: title + optional right-side detail, hairline below. */
export const Section: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <section className={className}>
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {right && <div className="text-[11px] text-ink-3">{right}</div>}
    </div>
    {children}
  </section>
);

export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => <hr className={`border-0 border-t border-line ${className}`} />;

interface TabsProps<T extends string> { items: { id: T; label: string; badge?: React.ReactNode }[]; value: T; onChange: (id: T) => void; className?: string }

/** Segmented tabs for the rail. One visible section at a time. */
export function Tabs<T extends string>({ items, value, onChange, className = '' }: TabsProps<T>) {
  return (
    <div role="tablist" className={`flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 overflow-x-auto ${className}`}>
      {items.map(t => (
        <button
          key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] whitespace-nowrap font-medium transition-colors ${value === t.id ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}
        >
          {t.label}{t.badge != null && <span className="num text-[10px] text-ink-3">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

interface StatProps { label: string; value: React.ReactNode; unit?: string; tone?: Tone; size?: 'sm' | 'md' | 'lg'; hint?: string }

export const Stat: React.FC<StatProps> = ({ label, value, unit, tone = 'neutral', size = 'md', hint }) => {
  const sz = size === 'lg' ? 'text-[28px]' : size === 'sm' ? 'text-[14px]' : 'text-[18px]';
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-3 truncate">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`num font-semibold leading-tight ${sz} ${TONE_TEXT[tone]}`}>{value}</span>
        {unit && <span className="text-[11px] text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-ink-3 truncate">{hint}</div>}
    </div>
  );
};

/** Label / value row for dense lists. */
export const Row: React.FC<{ label: string; value: React.ReactNode; tone?: Tone; right?: React.ReactNode }> = ({ label, value, tone = 'neutral', right }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
    <span className="text-ink-2">{label}</span>
    <span className="flex items-center gap-3">
      {right}
      <span className={`num font-medium ${TONE_TEXT[tone]}`}>{value}</span>
    </span>
  </div>
);

export const Chip: React.FC<{ tone?: Tone; pulse?: boolean; children: React.ReactNode; className?: string }> = ({ tone = 'neutral', pulse, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_SOFT[tone]} ${className}`}>
    <span className="relative inline-flex w-1.5 h-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {pulse && <span className={`absolute inset-0 rounded-full ${TONE_DOT[tone]} animate-ping opacity-50`} />}
    </span>
    {children}
  </span>
);

export const Dot: React.FC<{ tone: Tone; pulse?: boolean; className?: string }> = ({ tone, pulse, className = '' }) => (
  <span className={`relative inline-flex w-1.5 h-1.5 shrink-0 ${className}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
    {pulse && <span className={`absolute inset-0 rounded-full ${TONE_DOT[tone]} animate-ping opacity-50`} />}
  </span>
);

export const Meter: React.FC<{ value: number; tone?: Tone; className?: string }> = ({ value, tone = 'accent', className = '' }) => {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 w-full rounded-full bg-surface-2 overflow-hidden ${className}`} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${TONE_DOT[tone]} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
};

export const Sparkline: React.FC<{ data: number[]; color: string; height?: number; className?: string }> = ({ data, color, height = 20, className = '' }) => {
  if (data.length < 2) return null;
  const w = 100, min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  icon?: React.ReactNode; label: string; onClick?: () => void; active?: boolean; primary?: boolean; danger?: boolean; disabled?: boolean; title?: string; id?: string; size?: 'sm' | 'md'; className?: string;
  /** Sends a command: only the pilot in command may ('fly'); an observer may also 'abort'. */
  command?: 'fly' | 'abort';
}

/** Toolbar button. Ghost by default; `primary` is the one action that matters; `danger` is destructive. */
export const ToolButton: React.FC<ToolButtonProps> = ({ icon, label, onClick, active, primary, danger, disabled, title, id, size = 'md', className = '', command }) => {
  const op = useOperator();
  const blocked = command === 'fly' ? !op.canCommand : command === 'abort' ? !op.canAbort : false;
  if (blocked) { disabled = true; title = `${ROLE_LABEL[op.role]}: only the pilot in command can do this`; }
  const base = size === 'sm' ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3 text-[13px]';
  const look = danger
    ? 'bg-bad text-white hover:opacity-90'
    : primary
    ? 'bg-accent text-accent-ink hover:opacity-90'
    : active
    ? 'bg-accent-soft text-accent border border-accent/30'
    : 'bg-surface text-ink-2 border border-line hover:text-ink hover:border-line-2';
  return (
    <button id={id} type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed [&>svg]:w-4 [&>svg]:h-4 ${base} ${look} ${className}`}>
      {icon}{label}
    </button>
  );
};

export const IconButton: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; active?: boolean; disabled?: boolean }> = ({ icon, label, onClick, active, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active}
    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors disabled:opacity-40 [&>svg]:w-4 [&>svg]:h-4 ${active ? 'bg-accent-soft text-accent border-accent/30' : 'bg-surface text-ink-2 border-line hover:text-ink'}`}>
    {icon}
  </button>
);

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({ on, onChange, label, description }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center justify-between gap-3 w-full py-1.5 text-left group">
    <span className="min-w-0">
      <span className="block text-[13px] text-ink group-hover:text-ink">{label}</span>
      {description && <span className="block text-[11px] text-ink-3">{description}</span>}
    </span>
    <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-accent' : 'bg-line-2'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </button>
);

/** Segmented single-choice control. */
export function Segmented<T extends string>({ items, value, onChange, size = 'md' }: { items: { id: T; label: React.ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2 h-6 text-[11px]' : 'px-3 h-8 text-[12px]';
  return (
    <div className="inline-flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5">
      {items.map(i => (
        <button key={i.id} type="button" title={i.title} aria-pressed={value === i.id} onClick={() => onChange(i.id)}
          className={`inline-flex items-center gap-1 rounded-md font-medium transition-colors ${pad} ${value === i.id ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

/** Activity list row (event log). */
export const Activity: React.FC<{ items: { id: string; ts: string; tone: Tone; text: string; onClick?: () => void }[]; empty: string; max?: number }> = ({ items, empty, max = 30 }) => (
  <ul className="divide-y divide-line">
    {items.length === 0 && <li className="py-3 text-[13px] text-ink-3">{empty}</li>}
    {items.slice(0, max).map(e => (
      <li key={e.id} className="flex items-start gap-3 py-2 text-[13px]">
        <span className="num text-[11px] text-ink-3 shrink-0 pt-0.5">{e.ts}</span>
        <Dot tone={e.tone} className="mt-[7px]" />
        {e.onClick ? <button onClick={e.onClick} className="text-left text-ink-2 hover:text-ink">{e.text}</button> : <span className="text-ink-2">{e.text}</span>}
      </li>
    ))}
  </ul>
);

/**
 * Press and hold to confirm: for commands that start motors or can't be taken back.
 * Fills as it is held; releasing early cancels. Space or Enter held works the same.
 */
export const HoldButton: React.FC<{ icon?: React.ReactNode; label: string; onFire: () => void; ms?: number; disabled?: boolean; title?: string; id?: string; command?: 'fly' | 'abort'; hint?: string }> = ({ icon, label, onFire, ms = 1200, disabled, title, id, command = 'fly', hint = 'Hold' }) => {
  const op = useOperator();
  const blocked = command === 'fly' ? !op.canCommand : !op.canAbort;
  const [p, setP] = React.useState(0);
  const t0 = React.useRef(0), raf = React.useRef(0), timer = React.useRef(0);
  const fire = React.useRef(onFire); fire.current = onFire;
  const stop = () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); t0.current = 0; setP(0); };
  const start = () => {
    if (disabled || blocked || t0.current) return;
    t0.current = performance.now();
    // A timer decides, not the animation: on a busy device frames can be far apart, and a full hold must still fire.
    timer.current = window.setTimeout(() => { stop(); fire.current(); }, ms);
    const tick = () => { if (!t0.current) return; setP(Math.min(1, (performance.now() - t0.current) / ms)); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  React.useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); }, []);
  const off = disabled || blocked;
  return (
    <button id={id} type="button" disabled={off} title={blocked ? `${ROLE_LABEL[op.role]}: only the pilot in command can do this` : title}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
      aria-label={`${label} (press and hold)`}
      className="relative overflow-hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium bg-accent text-accent-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed touch-none select-none [&_svg]:w-4 [&_svg]:h-4">
      <span aria-hidden className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${p * 100}%` }} />
      <span className="relative inline-flex items-center gap-1.5">{icon}{label}<span className="ml-1 text-[10px] uppercase tracking-[0.08em] opacity-75">{p > 0 ? `${Math.round(p * 100)}%` : hint}</span></span>
    </button>
  );
};
