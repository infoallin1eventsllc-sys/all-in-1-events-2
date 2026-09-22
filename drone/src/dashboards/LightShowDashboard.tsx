import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Play, Pause, RotateCcw, AlertOctagon, ShieldCheck, Wind, Clock, Radio,
  Satellite, Battery, Layers, Music, ListChecks, Gauge,
} from 'lucide-react';
import { useLightShowSimulation } from '../hooks/useLightShowSimulation';
import { LightShowCanvas3D } from '../components/lightshow/LightShowCanvas3D';
import { SHOW_FORMATIONS } from '../data/lightShowFormations';
import { ChoreographyEngineModal } from '../components/lightshow/ChoreographyEngineModal';
import { SyncPrecisionModal } from '../components/lightshow/SyncPrecisionModal';
import { LaunchPadProvisioningModal } from '../components/production/LaunchPadProvisioningModal';
import { RegulatoryComplianceModal } from '../components/production/RegulatoryComplianceModal';
import {
  Panel, Stat, Label, Meter, StatusDot, Toggle, ActionButton, Pill, Sparkline, DashboardHeader, ACCENT, STATUS,
} from './ui';
import type { LightShowDrone } from '../types/lightShowTypes';

const ACCENT_KEY = 'violet' as const;

/** Pre-flight checklist shown before the show is armed. Each gate is derived from live sim state. */
function useShowGates(drones: LightShowDrone[], windMps: number, jitterMs: number) {
  return useMemo(() => {
    const n = drones.length || 1;
    const lowBatt = drones.filter(d => d.battery < 40).length;
    const noSync = drones.filter(d => !d.hasCommsSync).length;
    const weakGps = drones.filter(d => d.gpsSatellites < 14).length;
    const maxDev = drones.reduce((m, d) => Math.max(m, d.deviationMeters), 0);
    return [
      { id: 'batt', label: 'Battery reserve ≥ 40% on all units', ok: lowBatt === 0, detail: lowBatt ? `${lowBatt} low` : `min ${Math.min(...drones.map(d => d.battery), 100).toFixed(0)}%` },
      { id: 'rtk', label: 'RTK fix on every airframe', ok: weakGps === 0, detail: weakGps ? `${weakGps} degraded` : `${(drones.reduce((s, d) => s + d.gpsSatellites, 0) / n).toFixed(0)} sats avg` },
      { id: 'sync', label: 'Timecode lock < 2 ms', ok: noSync === 0 && jitterMs < 2, detail: `${jitterMs.toFixed(2)} ms` },
      { id: 'wind', label: 'Wind below 8 m/s launch limit', ok: windMps < 8, detail: `${windMps.toFixed(1)} m/s` },
      { id: 'dev', label: 'Trajectory deviation < 0.8 m', ok: maxDev < 0.8, detail: `${maxDev.toFixed(2)} m max` },
    ];
  }, [drones, windMps, jitterMs]);
}

export const LightShowDashboard: React.FC = () => {
  const {
    droneCount, setDroneCount, drones, selectedDroneId, setSelectedDroneId,
    conductorState, togglePlay, rewind, seek, selectFormation, armShow, emergencyAbort,
    showTrajectories, setShowTrajectories, showGeofence, setShowGeofence,
  } = useLightShowSimulation(100);

  const [wind, setWind] = useState({ mps: 3.4, headingDeg: 212, gustMps: 5.1 });
  const [jitterHistory, setJitterHistory] = useState<number[]>(() => Array.from({ length: 40 }, () => 0.5 + Math.random() * 0.3));
  const [audioLocked, setAudioLocked] = useState(true);
  const [ltc, setLtc] = useState(true);
  const [modal, setModal] = useState<null | 'CHOREO' | 'SYNC' | 'PADS' | 'WAIVER'>(null);
  const tickRef = useRef(0);

  // Slow-moving environmental readings; real deployment feeds these from the airfield weather mast.
  useEffect(() => {
    const t = setInterval(() => {
      tickRef.current += 1;
      setWind(w => ({
        mps: Math.max(0, Math.min(11, w.mps + (Math.random() - 0.5) * 0.4)),
        headingDeg: (w.headingDeg + (Math.random() - 0.5) * 3 + 360) % 360,
        gustMps: Math.max(w.mps, w.gustMps + (Math.random() - 0.5) * 0.6),
      }));
      setJitterHistory(h => [...h.slice(1), Math.max(0.2, conductorState.clockJitterMs + (Math.random() - 0.5) * 0.25)]);
    }, 1000);
    return () => clearInterval(t);
  }, [conductorState.clockJitterMs]);

  const gates = useShowGates(drones, wind.mps, conductorState.clockJitterMs);
  const allGatesPass = gates.every(g => g.ok);
  const activeFormation = SHOW_FORMATIONS[conductorState.activeFormationIndex] || SHOW_FORMATIONS[0];

  const fleet = useMemo(() => {
    const n = drones.length || 1;
    const inFormation = drones.filter(d => d.status === 'IN_FORMATION').length;
    const transitioning = drones.filter(d => d.status === 'TRANSITIONING').length;
    const onPad = drones.filter(d => d.status === 'LAUNCH_PAD' || d.status === 'ARMED' || d.status === 'LANDED').length;
    const avgBatt = drones.reduce((s, d) => s + d.battery, 0) / n;
    const synced = drones.filter(d => d.hasCommsSync).length;
    const worst = [...drones].sort((a, b) => b.deviationMeters - a.deviationMeters).slice(0, 4);
    return { inFormation, transitioning, onPad, avgBatt, synced, worst };
  }, [drones]);

  const status = conductorState.status;
  const statusTone = status === 'RUNNING' ? 'good' : status === 'ARMED' ? 'warning' : status === 'ABORTING' ? 'critical' : 'idle';
  const progress = (conductorState.currentTimeSec / conductorState.totalDurationSec) * 100;

  const fmt = (secs: number) => {
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60), ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  };

  // Cue timeline positions along the show: cues are laid out evenly by duration.
  const cueMarks = useMemo(() => {
    const total = SHOW_FORMATIONS.reduce((s, f) => s + f.durationSeconds, 0) || 1;
    let acc = 0;
    return SHOW_FORMATIONS.map((f, i) => { const start = acc / total; acc += f.durationSeconds; return { i, f, start }; });
  }, []);

  return (
    <div id="lightshow-dashboard" className="space-y-4">
      <DashboardHeader
        accent={ACCENT_KEY}
        icon={<Sparkles />}
        kicker="Vertical 01 · Aerial Light Show"
        title="Show Conductor"
        subtitle={`${droneCount} airframes · ${activeFormation.name} · GPS 1PPS master clock`}
      >
        <Pill tone={statusTone === 'idle' ? 'violet' : statusTone}>{status.replace('_', ' ')}</Pill>
        <div className="flex items-center bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.08]">
          {[100, 250, 500].map(n => (
            <button key={n} onClick={() => setDroneCount(n)} className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors ${droneCount === n ? `${ACCENT.violet.solid} text-slate-950 font-bold` : 'text-slate-400 hover:text-slate-100'}`}>{n}</button>
          ))}
        </div>
        <button onClick={() => setModal('CHOREO')} className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 text-xs flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />Choreography</button>
        <button onClick={() => setModal('SYNC')} className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 text-xs flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Clock sync</button>
        <button onClick={() => setModal('PADS')} className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 text-xs flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" />Launch pads</button>
        <button onClick={() => setModal('WAIVER')} className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 text-xs flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />FAA waiver</button>
      </DashboardHeader>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        {/* Stage column */}
        <div className="space-y-4 min-w-0">
          <div className="relative">
            <LightShowCanvas3D
              drones={drones}
              selectedDroneId={selectedDroneId}
              onSelectDrone={setSelectedDroneId}
              showTrajectories={showTrajectories}
              showGeofence={showGeofence}
              formationName={activeFormation.name}
            />
          </div>

          {/* Transport + timeline */}
          <Panel>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <button onClick={rewind} title="Rewind to T-0" className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-300"><RotateCcw className="w-4 h-4" /></button>
                <button
                  id="ls-play"
                  onClick={togglePlay}
                  disabled={status === 'ABORTING'}
                  className={`px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-40 ${status === 'RUNNING' ? 'bg-white/[0.08] text-slate-100 border border-white/[0.1]' : `${ACCENT.violet.solid} text-slate-950`}`}
                >
                  {status === 'RUNNING' ? <><Pause className="w-4 h-4 fill-current" />HOLD</> : <><Play className="w-4 h-4 fill-current" />{status === 'PAUSED' ? 'RESUME' : 'START SHOW'}</>}
                </button>
                {status === 'PRE_FLIGHT' && (
                  <button
                    id="ls-arm"
                    onClick={armShow}
                    disabled={!allGatesPass}
                    title={allGatesPass ? 'All pre-flight gates pass' : 'Pre-flight gates not satisfied'}
                    className="px-3 py-2 rounded-lg border border-amber-500/50 bg-amber-500/15 text-amber-200 font-mono text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck className="w-4 h-4" />ARM FLEET
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-[220px]">
                <div className="flex items-baseline justify-between font-mono">
                  <span className={`text-2xl font-semibold tabular-nums ${ACCENT.violet.text}`}>{fmt(conductorState.currentTimeSec)}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{fmt(conductorState.totalDurationSec)}</span>
                </div>
                <div className="relative mt-1.5 h-6">
                  <input
                    type="range" min={0} max={conductorState.totalDurationSec} step={0.1}
                    value={conductorState.currentTimeSec} onChange={e => seek(parseFloat(e.target.value))}
                    aria-label="Show timeline"
                    className="absolute inset-x-0 top-2 w-full h-1.5 bg-white/[0.08] rounded-full appearance-none cursor-pointer accent-violet-400"
                  />
                  {/* Cue markers along the timeline */}
                  {cueMarks.map(c => (
                    <button
                      key={c.f.id}
                      onClick={() => selectFormation(c.i)}
                      title={`Cue ${c.i + 1}: ${c.f.name}`}
                      className={`absolute top-0 -translate-x-1/2 w-2 h-2 rounded-sm rotate-45 ${c.i === conductorState.activeFormationIndex ? ACCENT.violet.solid : 'bg-slate-500 hover:bg-slate-300'}`}
                      style={{ left: `${c.start * 100}%` }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>{progress.toFixed(0)}% elapsed</span>
                  <span>cue {conductorState.activeFormationIndex + 1} / {SHOW_FORMATIONS.length}</span>
                </div>
              </div>

              <button
                id="ls-abort"
                onClick={emergencyAbort}
                className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                title="Lights out, vertical descent, all airframes"
              >
                <AlertOctagon className="w-4 h-4" />ABORT
              </button>
            </div>
          </Panel>

          {/* Cue rack */}
          <Panel title="Formation cues" icon={<Music className="w-3.5 h-3.5" />} right={<span className="font-mono text-[10px] text-slate-500">click to transition (LAPJV assignment)</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {SHOW_FORMATIONS.map((f, i) => {
                const active = i === conductorState.activeFormationIndex;
                return (
                  <button
                    key={f.id}
                    onClick={() => selectFormation(i)}
                    className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${active ? `${ACCENT.violet.border} ${ACCENT.violet.bg}` : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <Label>Cue {String(i + 1).padStart(2, '0')}</Label>
                      <span className="font-mono text-[10px] text-slate-500">{f.durationSeconds}s</span>
                    </div>
                    <div className={`text-xs font-semibold truncate ${active ? 'text-slate-50' : 'text-slate-200'}`}>{f.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{f.paletteName}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Side column */}
        <div className="space-y-4 min-w-0">
          <Panel title="Fleet state" icon={<Layers className="w-3.5 h-3.5" />} right={<StatusDot tone={fleet.synced === drones.length ? 'good' : 'warning'} pulse={status === 'RUNNING'} label={`${fleet.synced}/${drones.length} synced`} />}>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="In formation" value={fleet.inFormation} tone="good" />
              <Stat label="Moving" value={fleet.transitioning} />
              <Stat label="On pad" value={fleet.onPad} />
            </div>
            <div className="mt-3 space-y-2">
              <div>
                <div className="flex items-center justify-between"><Label>Avg battery</Label><span className="font-mono text-xs text-slate-200 tabular-nums">{fleet.avgBatt.toFixed(0)}%</span></div>
                <Meter value={fleet.avgBatt} tone={fleet.avgBatt > 40 ? 'good' : 'warning'} className="mt-1" />
              </div>
              <div>
                <div className="flex items-center justify-between"><Label>Min separation</Label><span className="font-mono text-xs text-slate-200 tabular-nums">{conductorState.minSeparationObservedMeters.toFixed(1)} m</span></div>
                <Meter value={(conductorState.minSeparationObservedMeters / 5) * 100} tone={conductorState.minSeparationObservedMeters >= 2.5 ? 'good' : 'critical'} className="mt-1" />
              </div>
            </div>
          </Panel>

          <Panel title="Timecode sync" icon={<Clock className="w-3.5 h-3.5" />} right={<Pill tone="violet">{conductorState.syncClockSource.replace(/_/g, ' ')}</Pill>}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Clock jitter" value={conductorState.clockJitterMs.toFixed(2)} unit="ms" tone={conductorState.clockJitterMs < 2 ? 'good' : 'warning'} />
              <Stat label="Pkt loss" value={conductorState.broadcastPacketLossPct.toFixed(2)} unit="%" tone={conductorState.broadcastPacketLossPct < 1 ? 'good' : 'warning'} />
            </div>
            <Sparkline data={jitterHistory} color={ACCENT.violet.hex} className="mt-2" />
            <div className="mt-2 space-y-0.5">
              <Toggle on={audioLocked} onChange={setAudioLocked} label="Soundtrack locked to timecode" accent="violet" />
              <Toggle on={ltc} onChange={setLtc} label="LTC out to pyro / lighting desk" accent="violet" />
            </div>
          </Panel>

          <Panel title="Airfield weather" icon={<Wind className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Wind" value={wind.mps.toFixed(1)} unit="m/s" tone={wind.mps < 8 ? 'good' : 'critical'} />
              <Stat label="Gust" value={wind.gustMps.toFixed(1)} unit="m/s" tone={wind.gustMps < 10 ? 'neutral' : 'warning'} />
              <Stat label="From" value={`${wind.headingDeg.toFixed(0)}°`} />
            </div>
            <Meter value={(wind.mps / 12) * 100} tone={wind.mps < 8 ? 'good' : 'critical'} className="mt-2" />
            <div className="mt-1 text-[10px] text-slate-500">Launch limit 8 m/s sustained · 10 m/s gust</div>
          </Panel>

          <Panel title="Pre-flight gates" icon={<ListChecks className="w-3.5 h-3.5" />} right={<StatusDot tone={allGatesPass ? 'good' : 'warning'} label={allGatesPass ? 'go' : 'hold'} />}>
            <ul className="space-y-1.5">
              {gates.map(g => (
                <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${g.ok ? STATUS.good.dot : STATUS.warning.dot}`} />
                    <span className="text-slate-300 truncate">{g.label}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">{g.detail}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Watch list" icon={<Gauge className="w-3.5 h-3.5" />} right={<span className="font-mono text-[10px] text-slate-500">highest deviation</span>}>
            <ul className="divide-y divide-white/[0.06]">
              {fleet.worst.map(d => (
                <li key={d.id}>
                  <button onClick={() => setSelectedDroneId(d.id)} className={`w-full flex items-center justify-between py-1.5 text-xs hover:text-slate-100 ${selectedDroneId === d.id ? 'text-slate-100' : 'text-slate-300'}`}>
                    <span className="font-mono">{d.id}</span>
                    <span className="flex items-center gap-3 font-mono text-[10px] text-slate-500 tabular-nums">
                      <span className="flex items-center gap-1"><Satellite className="w-3 h-3" />{d.gpsSatellites}</span>
                      <span className="flex items-center gap-1"><Battery className="w-3 h-3" />{d.battery.toFixed(0)}%</span>
                      <span className="flex items-center gap-1"><Radio className="w-3 h-3" />{d.syncOffsetMs.toFixed(2)}ms</span>
                      <span className={d.deviationMeters > 0.5 ? STATUS.warning.text : ''}>{d.deviationMeters.toFixed(2)} m</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-0.5">
              <Toggle on={showTrajectories} onChange={setShowTrajectories} label="Show transition paths" accent="violet" />
              <Toggle on={showGeofence} onChange={setShowGeofence} label="Show geofence volume" accent="violet" />
            </div>
          </Panel>
        </div>
      </div>

      {modal === 'CHOREO' && (
        <ChoreographyEngineModal droneCount={droneCount} currentFormationIndex={conductorState.activeFormationIndex} onClose={() => setModal(null)} onSelectFormation={i => { selectFormation(i); setModal(null); }} />
      )}
      {modal === 'SYNC' && <SyncPrecisionModal droneCount={droneCount} onClose={() => setModal(null)} />}
      {modal === 'PADS' && <LaunchPadProvisioningModal droneCount={droneCount} onClose={() => setModal(null)} />}
      {modal === 'WAIVER' && <RegulatoryComplianceModal droneCount={droneCount} onClose={() => setModal(null)} />}
    </div>
  );
};
