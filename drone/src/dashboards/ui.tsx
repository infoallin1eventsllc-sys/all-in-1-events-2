import React from 'react';

/**
 * Shared glass-panel UI kit for the three vertical dashboards
 * (Light Show, Defense, Surveillance). Operate-mode surfaces: state first,
 * decoration only where it carries information.
 */

export type Accent = 'violet' | 'rose' | 'emerald' | 'sky' | 'amber';

export const ACCENT: Record<Accent, { text: string; bg: string; border: string; solid: string; hex: string }> = {
  violet: { text: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/40', solid: 'bg-violet-500', hex: '#a78bfa' },
  rose:   { text: 'text-rose-300',   bg: 'bg-rose-500/10',   border: 'border-rose-500/40',   solid: 'bg-rose-500',   hex: '#fb7185' },
  emerald:{ text: 'text-emerald-300',bg: 'bg-emerald-500/10',border: 'border-emerald-500/40',solid: 'bg-emerald-500',hex: '#34d399' },
  sky:    { text: 'text-sky-300',    bg: 'bg-sky-500/10',    border: 'border-sky-500/40',    solid: 'bg-sky-500',    hex: '#38bdf8' },
  amber:  { text: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/40',  solid: 'bg-amber-500',  hex: '#fbbf24' },
};

/** Reserved status palette — never reused for series colour. */
export const STATUS = {
  good: { text: 'text-emerald-400', dot: 'bg-emerald-400', hex: '#34d399' },
  warning: { text: 'text-amber-400', dot: 'bg-amber-400', hex: '#fbbf24' },
  serious: { text: 'text-orange-400', dot: 'bg-orange-400', hex: '#fb923c' },
  critical: { text: 'text-rose-400', dot: 'bg-rose-400', hex: '#fb7185' },
  idle: { text: 'text-slate-400', dot: 'bg-slate-500', hex: '#64748b' },
} as const;
export type StatusKey = keyof typeof STATUS;

interface PanelProps {
  title?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  id?: string;
}

/** Translucent panel that floats over the map/3D stage. */
export const Panel: React.FC<PanelProps> = ({ title, icon, right, className = '', children, id }) => (
  <section
    id={id}
    className={`rounded-xl border border-white/[0.08] bg-slate-950/75 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${className}`}
  >
    {title && (
      <header className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 truncate">{title}</h3>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
    )}
    <div className={title ? 'px-3.5 pb-3.5' : 'p-3.5'}>{children}</div>
  </section>
);

/** Small uppercase caption used above values. */
export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500 ${className}`}>{children}</span>
);

interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
  tone?: StatusKey | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  hint?: string;
}

/** Stat tile: one number, one label, optional unit and hint. */
export const Stat: React.FC<StatProps> = ({ label, value, unit, tone = 'neutral', size = 'md', hint }) => {
  const color = tone === 'neutral' ? 'text-slate-100' : STATUS[tone].text;
  const sizeCls = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <Label>{label}</Label>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`font-mono font-semibold tabular-nums ${sizeCls} ${color} truncate`}>{value}</span>
        {unit && <span className="font-mono text-[10px] text-slate-500">{unit}</span>}
      </div>
      {hint && <span className="text-[10px] text-slate-500 truncate">{hint}</span>}
    </div>
  );
};

interface MeterProps {
  value: number; // 0..100
  tone?: StatusKey | Accent;
  className?: string;
}

/** Thin horizontal meter. Tone maps to a status colour or an accent. */
export const Meter: React.FC<MeterProps> = ({ value, tone = 'good', className = '' }) => {
  const pct = Math.max(0, Math.min(100, value));
  const bar = tone in STATUS ? STATUS[tone as StatusKey].dot : ACCENT[tone as Accent].solid;
  return (
    <div className={`h-1 w-full rounded-full bg-white/[0.06] overflow-hidden ${className}`} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${bar} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
};

interface StatusDotProps { tone: StatusKey; pulse?: boolean; label?: string }

export const StatusDot: React.FC<StatusDotProps> = ({ tone, pulse, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${STATUS[tone].dot}`}>
      {pulse && <span className={`absolute inset-0 rounded-full ${STATUS[tone].dot} animate-ping opacity-60`} />}
    </span>
    {label && <span className={`font-mono text-[10px] uppercase tracking-wider ${STATUS[tone].text}`}>{label}</span>}
  </span>
);

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  accent?: Accent;
}

export const Toggle: React.FC<ToggleProps> = ({ on, onChange, label, accent = 'emerald' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className="flex items-center justify-between gap-3 w-full py-1 text-left group"
  >
    <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors">{label}</span>
    <span className={`relative w-8 h-[18px] rounded-full transition-colors ${on ? ACCENT[accent].solid : 'bg-white/10'}`}>
      <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-slate-950 transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
    </span>
  </button>
);

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  accent?: Accent;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  id?: string;
}

/** Square icon-over-label action tile used in control grids. */
export const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, onClick, active, accent = 'sky', danger, disabled, title, id }) => {
  const a = ACCENT[accent];
  const cls = danger
    ? 'border-rose-500/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
    : active
    ? `${a.border} ${a.bg} ${a.text}`
    : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-slate-100';
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      <span className="font-mono text-[10px] leading-tight text-center">{label}</span>
    </button>
  );
};

interface PillProps { children: React.ReactNode; tone?: StatusKey | Accent; className?: string }

export const Pill: React.FC<PillProps> = ({ children, tone = 'idle', className = '' }) => {
  const cls = tone in STATUS
    ? `${STATUS[tone as StatusKey].text} border-current/30`
    : `${ACCENT[tone as Accent].text} ${ACCENT[tone as Accent].border} ${ACCENT[tone as Accent].bg}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${cls} ${className}`}>
      {children}
    </span>
  );
};

/** Sparkline drawn as inline SVG; one series, no axis, accent stroke. */
export const Sparkline: React.FC<{ data: number[]; color?: string; height?: number; className?: string }> = ({ data, color = '#94a3b8', height = 22, className = '' }) => {
  if (data.length < 2) return null;
  const w = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** Header strip for a vertical dashboard: brand mark, title, and a live status cluster. */
export const DashboardHeader: React.FC<{
  accent: Accent;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}> = ({ accent, icon, kicker, title, subtitle, children }) => {
  const a = ACCENT[accent];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-xl border ${a.border} ${a.bg} ${a.text} flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${a.text}`}>{kicker}</div>
          <h2 className="text-base font-semibold text-slate-100 leading-tight truncate">{title}</h2>
          <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
};

export const formatClock = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
