import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, AlertOctagon, ShieldCheck, Layers, Clock, ListChecks, Scale, Download } from 'lucide-react';
import { downloadShowPackage } from '../lightshow/exportShow';
import { useLightShowSimulation } from '../hooks/useLightShowSimulation';
import { LightShowCanvas3D } from '../components/lightshow/LightShowCanvas3D';
import { SHOW_FORMATIONS } from '../data/lightShowFormations';
import { ChoreographyEngineModal } from '../components/lightshow/ChoreographyEngineModal';
import { SyncPrecisionModal } from '../components/lightshow/SyncPrecisionModal';
import { LaunchPadProvisioningModal } from '../components/production/LaunchPadProvisioningModal';
import { RegulatoryComplianceModal } from '../components/production/RegulatoryComplianceModal';
import { Headline, Card, Section, Divider, Tabs, Stat, Row, Chip, Dot, Meter, Sparkline, ToolButton, IconButton, Toggle, Segmented, useAccentHex, type Tone } from './ui';
import type { LightShowDrone } from '../types/lightShowTypes';

type RailTab = 'CUES' | 'FLEET' | 'PREFLIGHT';

/** Pre-flight gates derived from live state; all must pass before ARM is enabled. */
function useShowGates(drones: LightShowDrone[], windMps: number, jitterMs: number) {
  return useMemo(() => {
    const n = drones.length || 1;
    const lowBatt = drones.filter(d => d.battery < 40).length;
    const noSync = drones.filter(d => !d.hasCommsSync).length;
    const weakGps = drones.filter(d => d.gpsSatellites < 14).length;
    const maxDev = drones.reduce((m, d) => Math.max(m, d.deviationMeters), 0);
    return [
      { id: 'batt', label: 'Battery reserve above 40% on every aircraft', ok: lowBatt === 0, detail: lowBatt ? `${lowBatt} low` : `min ${Math.min(...drones.map(d => d.battery), 100).toFixed(0)}%` },
      { id: 'rtk', label: 'RTK position fix on every aircraft', ok: weakGps === 0, detail: weakGps ? `${weakGps} degraded` : `${(drones.reduce((s, d) => s + d.gpsSatellites, 0) / n).toFixed(0)} satellites avg` },
      { id: 'sync', label: 'Timecode lock under 2 ms', ok: noSync === 0 && jitterMs < 2, detail: `${jitterMs.toFixed(2)} ms` },
      { id: 'wind', label: 'Wind under the 8 m/s launch limit', ok: windMps < 8, detail: `${windMps.toFixed(1)} m/s` },
      { id: 'dev', label: 'Trajectory deviation under 0.8 m', ok: maxDev < 0.8, detail: `${maxDev.toFixed(2)} m max` },
    ];
  }, [drones, windMps, jitterMs]);
}

export const LightShowDashboard: React.FC = () => {
  const {
    droneCount, setDroneCount, drones, selectedDroneId, setSelectedDroneId,
    conductorState: cs, togglePlay, rewind, seek, selectFormation, armShow, emergencyAbort,
    showTrajectories, setShowTrajectories, showGeofence, setShowGeofence,
  } = useLightShowSimulation(100);
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = useAccentHex(rootRef, '#5b5bd6');
  const [rail, setRail] = useState<RailTab>('CUES');
  const [wind, setWind] = useState({ mps: 3.4, headingDeg: 212, gustMps: 5.1 });
  const [jitterHistory, setJitterHistory] = useState<number[]>(() => Array.from({ length: 40 }, () => 0.5 + Math.random() * 0.3));
  const [audioLocked, setAudioLocked] = useState(true);
  const [ltc, setLtc] = useState(true);
  const [modal, setModal] = useState<null | 'CHOREO' | 'SYNC' | 'PADS' | 'WAIVER'>(null);

  // Airfield weather mast; slow-moving readings.
  useEffect(() => {
    const t = setInterval(() => {
      setWind(w => ({ mps: Math.max(0, Math.min(11, w.mps + (Math.random() - 0.5) * 0.4)), headingDeg: (w.headingDeg + (Math.random() - 0.5) * 3 + 360) % 360, gustMps: Math.max(w.mps, w.gustMps + (Math.random() - 0.5) * 0.6) }));
      setJitterHistory(h => [...h.slice(1), Math.max(0.2, cs.clockJitterMs + (Math.random() - 0.5) * 0.25)]);
    }, 1000);
    return () => clearInterval(t);
  }, [cs.clockJitterMs]);

  const gates = useShowGates(drones, wind.mps, cs.clockJitterMs);
  const allGatesPass = gates.every(g => g.ok);
  const formation = SHOW_FORMATIONS[cs.activeFormationIndex] || SHOW_FORMATIONS[0];
  const fleet = useMemo(() => {
    const n = drones.length || 1;
    return {
      inFormation: drones.filter(d => d.status === 'IN_FORMATION').length,
      moving: drones.filter(d => d.status === 'TRANSITIONING').length,
      onPad: drones.filter(d => ['LAUNCH_PAD', 'ARMED', 'LANDED'].includes(d.status)).length,
      avgBatt: drones.reduce((s, d) => s + d.battery, 0) / n,
      synced: drones.filter(d => d.hasCommsSync).length,
      watch: [...drones].sort((a, b) => b.deviationMeters - a.deviationMeters).slice(0, 5),
    };
  }, [drones]);

  const status = cs.status;
  const statusTone: Tone = status === 'RUNNING' ? 'ok' : status === 'ARMED' ? 'warn' : status === 'ABORTING' ? 'bad' : status === 'SHOW_COMPLETE' ? 'accent' : 'neutral';
  const statusLabel = { PRE_FLIGHT: 'Pre-flight', ARMED: 'Armed', RUNNING: 'Running', PAUSED: 'Holding', ABORTING: 'Aborting', SHOW_COMPLETE: 'Complete' }[status];
  const fmt = (secs: number) => { const m = Math.floor(secs / 60), s = Math.floor(secs % 60), t = Math.floor((secs % 1) * 10); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`; };
  const cueMarks = useMemo(() => { const total = SHOW_FORMATIONS.reduce((s, f) => s + f.durationSeconds, 0) || 1; let acc = 0; return SHOW_FORMATIONS.map((f, i) => { const start = acc / total; acc += f.durationSeconds; return { i, f, start }; }); }, []);

  return (
    <div ref={rootRef} data-accent="lightshow" id="lightshow-dashboard" className="space-y-5">
      <Headline
        title="Show conductor"
        context={`${formation.name} · ${droneCount} aircraft · GPS-disciplined master clock`}
        status={{ label: statusLabel, tone: statusTone, pulse: status === 'RUNNING' }}
        stats={[
          { label: 'Synchronised', value: `${fleet.synced} / ${drones.length}`, tone: fleet.synced === drones.length ? 'ok' : 'warn' },
          { label: 'Wind', value: `${wind.mps.toFixed(1)} m/s`, tone: wind.mps < 8 ? 'neutral' : 'bad' },
          { label: 'Clock jitter', value: `${cs.clockJitterMs.toFixed(2)} ms`, tone: cs.clockJitterMs < 2 ? 'neutral' : 'warn' },
          { label: 'Pre-flight', value: allGatesPass ? 'Go' : 'Hold', tone: allGatesPass ? 'ok' : 'warn' },
        ]}
        actions={<Segmented size="sm" value={String(droneCount)} onChange={v => setDroneCount(Number(v))} items={[100, 250, 500].map(n => ({ id: String(n), label: `${n}` }))} />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
        {/* ---------------- Stage ---------------- */}
        <div className="space-y-3 min-w-0">
          <div className="rounded-[var(--radius-card)] overflow-hidden border border-line bg-imagery [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
            <LightShowCanvas3D drones={drones} selectedDroneId={selectedDroneId} onSelectDrone={setSelectedDroneId} showTrajectories={showTrajectories} showGeofence={showGeofence} formationName={formation.name} />
          </div>

          {/* Transport bar */}
          <Card padded={false} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <IconButton icon={<RotateCcw />} label="Rewind to start" onClick={rewind} />
                <ToolButton id="ls-play" icon={status === 'RUNNING' ? <Pause /> : <Play />} label={status === 'RUNNING' ? 'Hold' : status === 'PAUSED' ? 'Resume' : 'Start show'} primary disabled={status === 'ABORTING'} onClick={togglePlay} />
                {status === 'PRE_FLIGHT' && <ToolButton id="ls-arm" icon={<ShieldCheck />} label="Arm fleet" disabled={!allGatesPass} onClick={armShow} title={allGatesPass ? 'All pre-flight gates pass' : 'Pre-flight gates not satisfied'} />}
              </div>
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-baseline justify-between">
                  <span className="num text-[22px] font-semibold text-ink leading-none">{fmt(cs.currentTimeSec)}</span>
                  <span className="num text-[12px] text-ink-3">{fmt(cs.totalDurationSec)} · cue {cs.activeFormationIndex + 1} of {SHOW_FORMATIONS.length}</span>
                </div>
                <div className="relative mt-2 h-5">
                  <input type="range" min={0} max={cs.totalDurationSec} step={0.1} value={cs.currentTimeSec} onChange={e => seek(parseFloat(e.target.value))} aria-label="Show timeline" className="absolute inset-x-0 top-1.5 w-full h-1.5 cursor-pointer" />
                  {cueMarks.map(c => (
                    <button key={c.f.id} onClick={() => selectFormation(c.i)} title={`Cue ${c.i + 1}: ${c.f.name}`}
                      className={`absolute -top-0.5 -translate-x-1/2 w-2 h-2 rotate-45 rounded-[1px] ${c.i === cs.activeFormationIndex ? 'bg-accent' : 'bg-line-2 hover:bg-ink-3'}`} style={{ left: `${c.start * 100}%` }} />
                  ))}
                </div>
              </div>
              <ToolButton id="ls-abort" icon={<AlertOctagon />} label="Abort" danger onClick={emergencyAbort} title="Lights out, vertical descent, all aircraft" />
            </div>
          </Card>
        </div>

        {/* ---------------- Inspector rail ---------------- */}
        <Card className="xl:sticky xl:top-[72px]">
          <Tabs value={rail} onChange={setRail} items={[{ id: 'CUES', label: 'Cues' }, { id: 'FLEET', label: 'Fleet' }, { id: 'PREFLIGHT', label: 'Pre-flight' }]} />
          <div className="mt-4 rail-scroll max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            {rail === 'CUES' && (
              <div className="space-y-4">
                <Section title="Formation cues" right="click to transition">
                  <ol className="-mx-2">
                    {SHOW_FORMATIONS.map((f, i) => {
                      const on = i === cs.activeFormationIndex;
                      return (
                        <li key={f.id}>
                          <button onClick={() => selectFormation(i)} className={`w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                            <span className={`num text-[11px] font-semibold w-6 ${on ? 'text-accent' : 'text-ink-3'}`}>{String(i + 1).padStart(2, '0')}</span>
                            <span className="flex-1 min-w-0"><span className="block text-[13px] font-medium text-ink truncate">{f.name}</span><span className="block text-[11px] text-ink-3 truncate">{f.paletteName}</span></span>
                            <span className="num text-[11px] text-ink-3">{f.durationSeconds}s</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </Section>
                <Divider />
                <div className="flex flex-wrap gap-2">
                  <ToolButton size="sm" primary icon={<Download />} label={`Export show package (${droneCount})`} onClick={() => downloadShowPackage('All in 1 show', droneCount)} title="CSV per aircraft + manifest, for Skybrush Studio / Blender or Verge Aero" />
                  <ToolButton size="sm" icon={<Layers />} label="Choreography engine" onClick={() => setModal('CHOREO')} />
                  <ToolButton size="sm" icon={<ListChecks />} label="Launch pads" onClick={() => setModal('PADS')} />
                </div>
                <p className="text-[11px] text-ink-3">The package is the handoff to the show-control stack (Skybrush / Verge) that uploads trajectories and LED programs to the aircraft.</p>
              </div>
            )}

            {rail === 'FLEET' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="In formation" value={fleet.inFormation} tone="ok" />
                  <Stat label="Moving" value={fleet.moving} />
                  <Stat label="On pad" value={fleet.onPad} />
                </div>
                <Section title="Health">
                  <Row label="Average battery" value={`${fleet.avgBatt.toFixed(0)}%`} tone={fleet.avgBatt > 40 ? 'neutral' : 'warn'} />
                  <Meter value={fleet.avgBatt} tone={fleet.avgBatt > 40 ? 'ok' : 'warn'} />
                  <Row label="Minimum separation" value={`${cs.minSeparationObservedMeters.toFixed(1)} m`} tone={cs.minSeparationObservedMeters >= 2.5 ? 'neutral' : 'bad'} />
                  <Meter value={(cs.minSeparationObservedMeters / 5) * 100} tone={cs.minSeparationObservedMeters >= 2.5 ? 'ok' : 'bad'} />
                  <Row label="Broadcast packet loss" value={`${cs.broadcastPacketLossPct.toFixed(2)}%`} />
                </Section>
                <Divider />
                <Section title="Watch list" right="highest deviation">
                  <ul className="divide-y divide-line -mx-2">
                    {fleet.watch.map(d => (
                      <li key={d.id}>
                        <button onClick={() => setSelectedDroneId(d.id)} className={`w-full flex items-center justify-between px-2 py-2 text-[13px] rounded-lg ${selectedDroneId === d.id ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                          <span className="flex items-center gap-2 text-ink"><Dot tone={d.deviationMeters > 0.5 ? 'warn' : 'ok'} />{d.id}</span>
                          <span className="num text-[11px] text-ink-3">{d.gpsSatellites} sats · {d.battery.toFixed(0)}% · {d.deviationMeters.toFixed(2)} m</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Divider />
                <Toggle on={showTrajectories} onChange={setShowTrajectories} label="Show transition paths" />
                <Toggle on={showGeofence} onChange={setShowGeofence} label="Show geofence volume" />
              </div>
            )}

            {rail === 'PREFLIGHT' && (
              <div className="space-y-5">
                <Section title="Gates" right={<Chip tone={allGatesPass ? 'ok' : 'warn'}>{allGatesPass ? 'Go' : 'Hold'}</Chip>}>
                  <ul className="divide-y divide-line">
                    {gates.map(g => (
                      <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                        <span className="flex items-center gap-2.5 min-w-0"><Dot tone={g.ok ? 'ok' : 'warn'} /><span className="text-ink-2 truncate">{g.label}</span></span>
                        <span className="num text-[11px] text-ink-3 shrink-0">{g.detail}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Divider />
                <Section title="Airfield weather" right="limit 8 m/s sustained · 10 gust">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Wind" value={wind.mps.toFixed(1)} unit="m/s" tone={wind.mps < 8 ? 'neutral' : 'bad'} />
                    <Stat label="Gust" value={wind.gustMps.toFixed(1)} unit="m/s" tone={wind.gustMps < 10 ? 'neutral' : 'warn'} />
                    <Stat label="From" value={`${wind.headingDeg.toFixed(0)}°`} />
                  </div>
                  <Meter value={(wind.mps / 12) * 100} tone={wind.mps < 8 ? 'ok' : 'bad'} className="mt-2" />
                </Section>
                <Divider />
                <Section title="Timecode" right={cs.syncClockSource.replace(/_/g, ' ')}>
                  <div className="flex items-end justify-between gap-4">
                    <Stat label="Clock jitter" value={cs.clockJitterMs.toFixed(2)} unit="ms" tone={cs.clockJitterMs < 2 ? 'neutral' : 'warn'} />
                    <span className="w-32"><Sparkline data={jitterHistory} color={accent} height={24} /></span>
                  </div>
                  <div className="mt-2">
                    <Toggle on={audioLocked} onChange={setAudioLocked} label="Soundtrack locked to timecode" />
                    <Toggle on={ltc} onChange={setLtc} label="Timecode out to pyro and lighting" />
                  </div>
                </Section>
                <Divider />
                <div className="flex flex-wrap gap-2">
                  <ToolButton size="sm" icon={<Clock />} label="Clock sync lab" onClick={() => setModal('SYNC')} />
                  <ToolButton size="sm" icon={<Scale />} label="FAA / EASA waiver" onClick={() => setModal('WAIVER')} />
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {modal === 'CHOREO' && <ChoreographyEngineModal droneCount={droneCount} currentFormationIndex={cs.activeFormationIndex} onClose={() => setModal(null)} onSelectFormation={i => { selectFormation(i); setModal(null); }} />}
      {modal === 'SYNC' && <SyncPrecisionModal droneCount={droneCount} onClose={() => setModal(null)} />}
      {modal === 'PADS' && <LaunchPadProvisioningModal droneCount={droneCount} onClose={() => setModal(null)} />}
      {modal === 'WAIVER' && <RegulatoryComplianceModal droneCount={droneCount} onClose={() => setModal(null)} />}
    </div>
  );
};
