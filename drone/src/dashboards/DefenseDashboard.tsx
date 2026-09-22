import React, { useMemo, useState } from 'react';
import {
  ShieldAlert, Radar, Radio, Crosshair, Zap, RotateCw, XOctagon, Target, Flag, Cpu, Eye, Ear, Activity, Plus, Pause, Play, AlertTriangle,
} from 'lucide-react';
import { useDefenseSimulation, type Threat, type EffectorType, type ThreatClass } from '../hooks/useDefenseSimulation';
import { DefenseMapCanvas } from './DefenseMapCanvas';
import { Panel, Stat, Label, Meter, StatusDot, Toggle, ActionButton, Pill, DashboardHeader, ACCENT, STATUS, type StatusKey } from './ui';

const LEVEL_TONE: Record<Threat['level'], StatusKey> = { LOW: 'idle', MEDIUM: 'warning', HIGH: 'serious', CRITICAL: 'critical' };
const CLASS_LABEL: Record<ThreatClass, string> = {
  DJI_OCUSYNC: 'DJI OcuSync', FPV_ANALOG: 'FPV analog', WIFI_UAS: 'Wi-Fi UAS', FIXED_WING: 'Fixed wing', UNKNOWN: 'Unknown',
};
const EFFECTORS: { id: EffectorType; label: string; hint: string }[] = [
  { id: 'RF_JAM', label: 'RF jam', hint: 'Sever C2 + video link' },
  { id: 'GNSS_DENY', label: 'GNSS deny', hint: 'Deny GPS/GLONASS fix' },
  { id: 'PROTOCOL_TAKEOVER', label: 'Takeover', hint: 'Protocol-level forced land' },
];

/** 32-bin spectrum bars for one band. Uses a single accent hue; peaks are magnitude, not identity. */
const SpectrumBars: React.FC<{ bins: number[]; lo: number; hi: number; label: string; enabled: boolean }> = ({ bins, lo, hi, label, enabled }) => (
  <div className={enabled ? '' : 'opacity-40'}>
    <div className="flex items-center justify-between"><Label>{label}</Label><span className="font-mono text-[10px] text-slate-500">{lo}–{hi} MHz</span></div>
    <div className="mt-1 flex items-end gap-px h-9" aria-hidden="true">
      {bins.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(4, v)}%`, backgroundColor: v > 60 ? STATUS.critical.hex : v > 30 ? STATUS.warning.hex : ACCENT.rose.hex, opacity: v > 30 ? 0.95 : 0.45 }} />
      ))}
    </div>
  </div>
);

export const DefenseDashboard: React.FC = () => {
  const sim = useDefenseSimulation();
  const { threats, sensors, disruption, events, metrics, selectedThreatId, setSelectedThreatId } = sim;
  const [showCoverage, setShowCoverage] = useState(true);
  const [showTrails, setShowTrails] = useState(true);

  const active = useMemo(
    () => threats.filter(t => t.status === 'TRACKING' || t.status === 'DISRUPTING')
      .sort((a, b) => Number(b.priority) - Number(a.priority) || sim.rangeM(a) - sim.rangeM(b)),
    [threats, sim],
  );
  const selected = threats.find(t => t.id === selectedThreatId) ?? active[0] ?? null;
  const posture: StatusKey = metrics.criticalTracks > 0 ? 'critical' : metrics.activeTracks > 0 ? 'warning' : 'good';
  const postureLabel = posture === 'critical' ? 'Engage' : posture === 'warning' ? 'Tracking' : 'Clear';

  return (
    <div id="defense-dashboard" className="space-y-4">
      <DashboardHeader
        accent="rose"
        icon={<ShieldAlert />}
        kicker="Vertical 02 · Counter-UAS Defense"
        title="Airspace Defense"
        subtitle={`Protected asset · engage ring ${metrics.engageRingM.toFixed(0)} m · ${metrics.sensorsOnline}/${metrics.sensorsTotal} sensors online`}
      >
        <StatusDot tone={posture} pulse={posture !== 'good'} label={postureLabel} />
        <Pill tone={disruption.autoEngage ? 'rose' : 'idle'}>{disruption.autoEngage ? 'Auto-engage' : 'Manual auth'}</Pill>
        <button onClick={() => sim.setPaused(!sim.paused)} className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 text-xs flex items-center gap-1.5">
          {sim.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}{sim.paused ? 'Resume feed' : 'Freeze feed'}
        </button>
        <button onClick={() => sim.injectThreat()} className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 text-xs flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Inject track</button>
      </DashboardHeader>

      {/* Stage: map with floating panels on wide screens, stacked below on narrow ones */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#07090f] shadow-2xl">
        <DefenseMapCanvas
          threats={threats} sensors={sensors} disruption={disruption}
          selectedThreatId={selectedThreatId} onSelectThreat={setSelectedThreatId}
          showSensorCoverage={showCoverage} showTrails={showTrails}
        />

        {/* Top-left: posture strip */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none">
          <div className="rounded-lg border border-white/[0.08] bg-slate-950/80 backdrop-blur px-3 py-1.5 flex items-center gap-4">
            <Stat label="Tracks" value={metrics.activeTracks} size="sm" tone={metrics.activeTracks ? 'warning' : 'neutral'} />
            <Stat label="Critical" value={metrics.criticalTracks} size="sm" tone={metrics.criticalTracks ? 'critical' : 'neutral'} />
            <Stat label="Closest" value={Number.isFinite(metrics.closestRangeM) ? metrics.closestRangeM.toFixed(0) : '—'} unit="m" size="sm" />
            <Stat label="Neutralized" value={metrics.neutralizedToday} size="sm" tone="good" />
          </div>
        </div>

        {/* Top-right: layer toggles */}
        <div className="absolute top-3 right-3 rounded-lg border border-white/[0.08] bg-slate-950/80 backdrop-blur px-3 py-1 w-44 hidden md:block">
          <Toggle on={showCoverage} onChange={setShowCoverage} label="Sensor coverage" accent="rose" />
          <Toggle on={showTrails} onChange={setShowTrails} label="Track history" accent="rose" />
        </div>

        {/* Bottom-right (wide screens): disruption control */}
        <div className="hidden xl:block absolute bottom-3 right-3 w-[340px]">
          <DisruptionControl sim={sim} selected={selected} />
        </div>

        {/* Bottom-left (wide screens): selected track */}
        <div className="hidden xl:block absolute bottom-3 left-3 w-[300px]">
          <SelectedTrack t={selected} sim={sim} />
        </div>
      </div>

      {/* Narrow-screen versions of the floating panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:hidden">
        <SelectedTrack t={selected} sim={sim} />
        <DisruptionControl sim={sim} selected={selected} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Threat board */}
        <Panel title="Threat board" icon={<Crosshair className="w-3.5 h-3.5" />} right={<span className="font-mono text-[10px] text-slate-500">{active.length} active · sorted by priority, range</span>} className="lg:col-span-2">
          {active.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">No active emitters. Sensors are listening.</div>
          ) : (
            <div className="overflow-x-auto -mx-3.5">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-left">
                    {['Track', 'Class / protocol', 'Freq', 'RSSI', 'Range', 'Alt', 'Speed', 'Level', 'Status', ''].map(h => (
                      <th key={h} className="px-3.5 pb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {active.map(t => {
                    const sel = t.id === selected?.id;
                    return (
                      <tr key={t.id} onClick={() => setSelectedThreatId(t.id)} className={`cursor-pointer transition-colors ${sel ? 'bg-rose-500/10' : 'hover:bg-white/[0.03]'}`}>
                        <td className="px-3.5 py-2 font-mono text-slate-100 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">{t.priority && <Flag className="w-3 h-3 text-rose-300 fill-current" />}{t.id}</span>
                        </td>
                        <td className="px-3.5 py-2 text-slate-300 whitespace-nowrap">
                          <div>{CLASS_LABEL[t.classification]}</div>
                          <div className="text-[10px] text-slate-500">{t.protocol} · {(t.confidence * 100).toFixed(0)}%</div>
                        </td>
                        <td className="px-3.5 py-2 font-mono text-slate-300 tabular-nums">{t.freqMHz.toFixed(0)}<span className="text-slate-600"> MHz</span></td>
                        <td className="px-3.5 py-2 font-mono text-slate-300 tabular-nums">{t.rssiDbm.toFixed(0)}<span className="text-slate-600"> dBm</span></td>
                        <td className="px-3.5 py-2 font-mono text-slate-100 tabular-nums">{sim.rangeM(t).toFixed(0)}<span className="text-slate-600"> m</span></td>
                        <td className="px-3.5 py-2 font-mono text-slate-300 tabular-nums">{t.altitudeM.toFixed(0)}<span className="text-slate-600"> m</span></td>
                        <td className="px-3.5 py-2 font-mono text-slate-300 tabular-nums">{t.speedMps.toFixed(0)}<span className="text-slate-600"> m/s</span></td>
                        <td className="px-3.5 py-2"><StatusDot tone={LEVEL_TONE[t.level]} label={t.level} /></td>
                        <td className="px-3.5 py-2">
                          {t.status === 'DISRUPTING' ? (
                            <div className="w-20"><div className="flex justify-between font-mono text-[10px] text-rose-300"><span>DISRUPT</span><span>{(t.disruptProgress * 100).toFixed(0)}%</span></div><Meter value={t.disruptProgress * 100} tone="critical" /></div>
                          ) : <span className="font-mono text-[10px] text-slate-400">TRACKING</span>}
                        </td>
                        <td className="px-3.5 py-2 text-right whitespace-nowrap">
                          <button onClick={e => { e.stopPropagation(); sim.setPriority(t.id); }} title="Toggle priority" className={`p-1.5 rounded-md border mr-1 ${t.priority ? 'border-rose-500/50 text-rose-300 bg-rose-500/10' : 'border-white/[0.08] text-slate-400 hover:text-slate-100'}`}><Flag className="w-3 h-3" /></button>
                          {t.status === 'TRACKING'
                            ? <button onClick={e => { e.stopPropagation(); sim.disruptTarget(t.id); }} className="px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-200 font-mono text-[10px] font-bold">DISRUPT</button>
                            : <button onClick={e => { e.stopPropagation(); sim.cancelDisruption(); }} className="px-2 py-1 rounded-md border border-white/[0.1] text-slate-300 font-mono text-[10px]">CANCEL</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Sensor network */}
        <Panel title="Sensor network" icon={<Radar className="w-3.5 h-3.5" />} right={<StatusDot tone={metrics.sensorsOnline === metrics.sensorsTotal ? 'good' : 'warning'} label={`${metrics.sensorsOnline}/${metrics.sensorsTotal}`} />}>
          <ul className="divide-y divide-white/[0.05]">
            {sensors.map(s => {
              const Icon = s.type === 'RF' ? Radio : s.type === 'RADAR' ? Radar : s.type === 'EO_IR' ? Eye : Ear;
              const tone: StatusKey = s.status === 'ONLINE' ? 'good' : s.status === 'DEGRADED' ? 'warning' : 'idle';
              return (
                <li key={s.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="flex items-center gap-2 text-slate-300"><Icon className="w-3.5 h-3.5 text-slate-500" /><span className="font-mono">{s.id}</span><span className="text-[10px] text-slate-500">{(s.rangePx * 2.2).toFixed(0)} m{s.fovDeg < 360 ? ` · ${s.fovDeg}°` : ''}</span></span>
                  <button onClick={() => sim.toggleSensor(s.id)} className="flex items-center gap-2" title="Toggle sensor online/offline"><StatusDot tone={tone} label={s.status} /></button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 space-y-3 pt-3 border-t border-white/[0.06]">
            <SpectrumBars bins={metrics.spectrum24} lo={2400} hi={2500} label="2.4 GHz band" enabled={disruption.bands.b24} />
            <SpectrumBars bins={metrics.spectrum58} lo={5725} hi={5875} label="5.8 GHz band" enabled={disruption.bands.b58} />
          </div>
        </Panel>
      </div>

      {/* Event log */}
      <Panel title="Event log" icon={<Activity className="w-3.5 h-3.5" />} right={<span className="font-mono text-[10px] text-slate-500">{events.length} entries</span>}>
        <ul className="max-h-48 overflow-y-auto divide-y divide-white/[0.05] -mx-1 px-1">
          {events.length === 0 && <li className="py-3 text-xs text-slate-500">Quiet. Detections and effector actions appear here.</li>}
          {events.map(e => {
            const tone: StatusKey = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'WARNING' ? 'warning' : e.severity === 'SUCCESS' ? 'good' : 'idle';
            return (
              <li key={e.id} className="flex items-start gap-3 py-1.5 text-xs">
                <span className="font-mono text-[10px] text-slate-500 tabular-nums shrink-0 pt-0.5">{e.ts}</span>
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS[tone].dot}`} />
                <button onClick={() => e.threatId && setSelectedThreatId(e.threatId)} className={`text-left text-slate-300 ${e.threatId ? 'hover:text-slate-100' : 'cursor-default'}`}>{e.text}</button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
};

/** Selected track card. */
const SelectedTrack: React.FC<{ t: Threat | null; sim: ReturnType<typeof useDefenseSimulation> }> = ({ t, sim }) => {
  if (!t) return (
    <Panel title="Selected track" icon={<Target className="w-3.5 h-3.5" />}>
      <div className="text-xs text-slate-500">Click a track on the map or in the board.</div>
    </Panel>
  );
  const first = Math.max(0, (Date.now() - t.firstSeenMs) / 1000);
  return (
    <Panel title="Selected track" icon={<Target className="w-3.5 h-3.5" />} right={<StatusDot tone={LEVEL_TONE[t.level]} pulse={t.level === 'CRITICAL'} label={t.level} />}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold text-slate-50">{t.id}</span>
        <span className="text-[11px] text-slate-400">{CLASS_LABEL[t.classification]} · {t.protocol}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Stat label="Range" value={sim.rangeM(t).toFixed(0)} unit="m" size="sm" />
        <Stat label="Altitude" value={t.altitudeM.toFixed(0)} unit="m AGL" size="sm" />
        <Stat label="Speed" value={t.speedMps.toFixed(0)} unit="m/s" size="sm" />
        <Stat label="RSSI" value={t.rssiDbm.toFixed(0)} unit="dBm" size="sm" />
        <Stat label="Freq" value={t.freqMHz.toFixed(0)} unit="MHz" size="sm" />
        <Stat label="Tracked" value={`${first.toFixed(0)}s`} size="sm" hint={`${(t.confidence * 100).toFixed(0)}% ID conf.`} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ActionButton icon={<Flag />} label={t.priority ? 'Priority set' : 'Mark priority'} active={t.priority} accent="rose" onClick={() => sim.setPriority(t.id)} />
        {t.status === 'TRACKING'
          ? <ActionButton icon={<Zap />} label="Disrupt signal" danger onClick={() => sim.disruptTarget(t.id)} />
          : <ActionButton icon={<XOctagon />} label="Cancel" onClick={sim.cancelDisruption} disabled={t.status !== 'DISRUPTING'} />}
        <ActionButton icon={<Crosshair />} label="Engage now" danger onClick={() => { sim.setPriority(t.id); sim.disruptTarget(t.id); }} disabled={t.status !== 'TRACKING'} />
      </div>
    </Panel>
  );
};

/** Effector selection, band gates, power and area actions. */
const DisruptionControl: React.FC<{ sim: ReturnType<typeof useDefenseSimulation>; selected: Threat | null }> = ({ sim, selected }) => {
  const d = sim.disruption;
  const anyDisrupting = sim.threats.some(t => t.status === 'DISRUPTING');
  return (
    <Panel title="Disruption control" icon={<Cpu className="w-3.5 h-3.5" />} right={<StatusDot tone={anyDisrupting ? 'critical' : 'good'} pulse={anyDisrupting} label={anyDisrupting ? 'emitting' : 'ready'} />}>
      <div className="grid grid-cols-3 gap-1.5">
        {EFFECTORS.map(e => (
          <button key={e.id} onClick={() => sim.setEffector(e.id)} title={e.hint} className={`rounded-md border px-2 py-1.5 text-left transition-colors ${d.effector === e.id ? 'border-rose-500/50 bg-rose-500/10 text-rose-200' : 'border-white/[0.08] text-slate-400 hover:text-slate-100'}`}>
            <div className="font-mono text-[10px] font-bold uppercase">{e.label}</div>
            <div className="text-[10px] opacity-70 truncate">{e.hint}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Label className="shrink-0 w-14">Power</Label>
        <input type="range" min={10} max={100} value={d.powerPct} onChange={e => sim.setPower(Number(e.target.value))} aria-label="Effector power" className="flex-1 h-1 bg-white/[0.08] rounded-full appearance-none cursor-pointer accent-rose-400" />
        <span className="font-mono text-xs text-slate-200 w-10 text-right tabular-nums">{d.powerPct}%</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {([['b24', '2.4 GHz'], ['b58', '5.8 GHz'], ['gnss', 'GNSS L1/L2']] as const).map(([k, label]) => (
          <button key={k} onClick={() => sim.toggleBand(k)} aria-pressed={d.bands[k]} className={`flex-1 rounded-md border px-2 py-1 font-mono text-[10px] font-semibold transition-colors ${d.bands[k] ? 'border-rose-500/50 bg-rose-500/10 text-rose-200' : 'border-white/[0.08] text-slate-500'}`}>{label}</button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ActionButton icon={<Zap />} label="Pulse burst" accent="rose" onClick={sim.pulseBurst} />
        <ActionButton icon={<RotateCw />} label="Sweep area" accent="rose" active={d.sweepActive} onClick={sim.toggleSweep} />
        <ActionButton icon={<Target />} label="Disrupt target" danger disabled={!selected || selected.status !== 'TRACKING'} onClick={() => selected && sim.disruptTarget(selected.id)} />
        <ActionButton icon={<AlertTriangle />} label="Disrupt all" danger onClick={sim.disruptAll} />
        <ActionButton icon={<XOctagon />} label="Cancel all" onClick={sim.cancelDisruption} disabled={!anyDisrupting && !d.sweepActive} />
        <div className="flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-2">
          <Toggle on={d.autoEngage} onChange={sim.setAutoEngage} label="Auto" accent="rose" />
        </div>
      </div>
    </Panel>
  );
};
