import React, { useMemo, useRef, useState } from 'react';
import {
  Radio, Radar, Eye, Ear, Zap, RotateCw, XOctagon, Target, Flag, Plus, Pause, Play, Layers, Video, Map as MapIcon, Maximize2, SunMedium, MoonStar,
} from 'lucide-react';
import { useDefenseSimulation, type Threat, type EffectorType, type ThreatClass } from '../hooks/useDefenseSimulation';
import { DefenseMapCanvas } from './DefenseMapCanvas';
import { EoIrFeedCanvas } from './EoIrFeedCanvas';
import { Headline, Card, Section, Divider, Tabs, Stat, Row, Chip, Dot, Meter, ToolButton, IconButton, Toggle, Segmented, Activity, useAccentHex, TONE_HEX, type Tone } from './ui';

const LEVEL_TONE: Record<Threat['level'], Tone> = { LOW: 'neutral', MEDIUM: 'warn', HIGH: 'warn', CRITICAL: 'bad' };
const LEVEL_LABEL: Record<Threat['level'], string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
const CLASS_LABEL: Record<ThreatClass, string> = { DJI_OCUSYNC: 'DJI OcuSync', FPV_ANALOG: 'FPV analog', WIFI_UAS: 'Wi-Fi drone', FIXED_WING: 'Fixed wing', UNKNOWN: 'Unclassified' };
const EFFECTORS: { id: EffectorType; label: string; title: string }[] = [
  { id: 'RF_JAM', label: 'RF jam', title: 'Sever the control and video link' },
  { id: 'GNSS_DENY', label: 'GNSS deny', title: 'Deny the satellite fix' },
  { id: 'PROTOCOL_TAKEOVER', label: 'Takeover', title: 'Protocol-level forced landing' },
];

type RailTab = 'TRACKS' | 'SENSORS' | 'ACTIVITY';

/** One band of the RF spectrum. Magnitude only, so a single hue with status colours for hot bins. */
const Spectrum: React.FC<{ bins: number[]; label: string; range: string; enabled: boolean; accent: string }> = ({ bins, label, range, enabled, accent }) => (
  <div className={enabled ? '' : 'opacity-40'}>
    <div className="flex items-center justify-between text-[11px]"><span className="text-ink-2">{label}</span><span className="num text-ink-3">{range}</span></div>
    <div className="mt-1 flex items-end gap-px h-8" aria-hidden="true">
      {bins.map((v, i) => <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(4, v)}%`, backgroundColor: v > 60 ? TONE_HEX.bad : v > 30 ? TONE_HEX.warn : accent, opacity: v > 30 ? 0.9 : 0.45 }} />)}
    </div>
  </div>
);

export const DefenseDashboard: React.FC = () => {
  const sim = useDefenseSimulation();
  const { threats, sensors, disruption: dz, events, metrics, selectedThreatId, setSelectedThreatId } = sim;
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = useAccentHex(rootRef, '#c2410c');
  const [rail, setRail] = useState<RailTab>('TRACKS');
  const [hero, setHero] = useState<'MAP' | 'CAMERA'>('MAP');
  const [showCoverage, setShowCoverage] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const hour = new Date().getHours();
  const [night, setNight] = useState<boolean>(hour >= 19 || hour < 6);
  const [camMode, setCamMode] = useState<'EO' | 'IR'>(night ? 'IR' : 'EO');

  const active = useMemo(
    () => threats.filter(t => t.status === 'TRACKING' || t.status === 'DISRUPTING').sort((a, b) => Number(b.priority) - Number(a.priority) || sim.rangeM(a) - sim.rangeM(b)),
    [threats, sim],
  );
  const selected = threats.find(t => t.id === selectedThreatId) ?? active[0] ?? null;
  const anyDisrupting = threats.some(t => t.status === 'DISRUPTING');
  const posture: Tone = metrics.criticalTracks > 0 ? 'bad' : metrics.activeTracks > 0 ? 'warn' : 'ok';
  const postureLabel = posture === 'bad' ? 'Engaging' : posture === 'warn' ? 'Tracking' : 'Clear';

  const map = (
    <DefenseMapCanvas threats={threats} sensors={sensors} disruption={dz} selectedThreatId={selectedThreatId} onSelectThreat={setSelectedThreatId} showSensorCoverage={showCoverage} showTrails={showTrails} />
  );
  const camera = <EoIrFeedCanvas target={selected} rangeM={selected ? sim.rangeM(selected) : 0} mode={camMode} onSetMode={setCamMode} isNight={night} />;

  return (
    <div ref={rootRef} data-accent="defense" id="defense-dashboard" className="space-y-5">
      <Headline
        title="Airspace defense"
        context={`Venue perimeter · engage ring ${metrics.engageRingM.toFixed(0)} m · ${metrics.sensorsOnline} of ${metrics.sensorsTotal} sensors online`}
        status={{ label: postureLabel, tone: posture, pulse: posture !== 'ok' }}
        stats={[
          { label: 'Active tracks', value: metrics.activeTracks, tone: metrics.activeTracks ? 'warn' : 'neutral' },
          { label: 'Critical', value: metrics.criticalTracks, tone: metrics.criticalTracks ? 'bad' : 'neutral' },
          { label: 'Closest', value: Number.isFinite(metrics.closestRangeM) ? `${metrics.closestRangeM.toFixed(0)} m` : '—' },
          { label: 'Neutralized today', value: metrics.neutralizedToday, tone: 'ok' },
        ]}
        actions={<>
          <Segmented size="sm" value={night ? 'NIGHT' : 'DAY'} onChange={v => { const n = v === 'NIGHT'; setNight(n); setCamMode(n ? 'IR' : 'EO'); }} items={[
            { id: 'DAY', label: <><SunMedium className="w-3 h-3" />Day</> }, { id: 'NIGHT', label: <><MoonStar className="w-3 h-3" />Night</>, title: 'Camera switches to thermal' },
          ]} />
          <ToolButton size="sm" icon={sim.paused ? <Play /> : <Pause />} label={sim.paused ? 'Resume' : 'Freeze'} onClick={() => sim.setPaused(!sim.paused)} />
          <ToolButton size="sm" icon={<Plus />} label="Inject track" onClick={() => sim.injectThreat()} />
        </>}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
        {/* ---------------- Stage ---------------- */}
        <div className="space-y-3 min-w-0">
          <div className="relative rounded-[var(--radius-card)] overflow-hidden bg-imagery border border-line" style={{ aspectRatio: '5 / 3' }}>
            <div className="absolute inset-0">{hero === 'MAP' ? map : <div className="w-full h-full [&>div]:h-full [&>div]:rounded-none">{camera}</div>}</div>
            {/* Layer controls */}
            {hero === 'MAP' && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <IconButton icon={<Radar />} label="Sensor coverage" active={showCoverage} onClick={() => setShowCoverage(v => !v)} />
                <IconButton icon={<Layers />} label="Track history" active={showTrails} onClick={() => setShowTrails(v => !v)} />
              </div>
            )}
            {/* Picture-in-picture: camera on the map, or map on the camera */}
            <button
              onClick={() => setHero(h => (h === 'MAP' ? 'CAMERA' : 'MAP'))}
              title={hero === 'MAP' ? 'Show camera full size' : 'Show map full size'}
              className="hidden md:block absolute bottom-3 right-3 w-[26%] min-w-[180px] rounded-lg overflow-hidden border border-white/25 shadow-xl bg-imagery group"
              style={{ aspectRatio: hero === 'MAP' ? '16 / 9' : '5 / 3' }}
            >
              <div className="absolute inset-0 pointer-events-none [&>div]:h-full [&>div]:rounded-none">{hero === 'MAP' ? camera : map}</div>
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {hero === 'MAP' ? <><Video className="w-3 h-3" />Camera</> : <><MapIcon className="w-3 h-3" />Map</>}
              </span>
              <span className="absolute top-1.5 right-1.5 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-3 h-3" /></span>
            </button>
          </div>

          {/* Action bar: effector + the decisions */}
          <Card padded={false} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={dz.effector} onChange={sim.setEffector} items={EFFECTORS.map(e => ({ id: e.id, label: e.label, title: e.title }))} />
              <span className="flex items-center gap-2 ml-1">
                <span className="text-[11px] text-ink-3">Power</span>
                <input type="range" min={10} max={100} value={dz.powerPct} onChange={e => sim.setPower(Number(e.target.value))} aria-label="Effector power" className="w-24 h-1 cursor-pointer" />
                <span className="num text-[12px] text-ink w-9">{dz.powerPct}%</span>
              </span>
              <span className="flex items-center gap-1">
                {([['b24', '2.4 GHz'], ['b58', '5.8 GHz'], ['gnss', 'GNSS']] as const).map(([k, label]) => (
                  <ToolButton key={k} size="sm" label={label} active={dz.bands[k]} onClick={() => sim.toggleBand(k)} title={`Gate the ${label} band`} />
                ))}
              </span>
              <span className="w-px h-6 bg-line mx-1" />
              <ToolButton icon={<Zap />} label="Pulse" onClick={sim.pulseBurst} title="1.5 s wideband burst inside the engage ring" />
              <ToolButton icon={<RotateCw />} label="Sweep" active={dz.sweepActive} onClick={sim.toggleSweep} title="360° rotating beam" />
              <span className="ml-auto flex items-center gap-2">
                <span className="w-24"><Toggle on={dz.autoEngage} onChange={sim.setAutoEngage} label="Auto" /></span>
                <ToolButton icon={<XOctagon />} label="Stand down" disabled={!anyDisrupting && !dz.sweepActive} onClick={sim.cancelDisruption} />
                <ToolButton icon={<Target />} label={selected ? `Disrupt ${selected.id}` : 'Disrupt target'} primary disabled={!selected || selected.status !== 'TRACKING'} onClick={() => selected && sim.disruptTarget(selected.id)} />
                <ToolButton label="Disrupt all" danger onClick={sim.disruptAll} />
              </span>
            </div>
          </Card>
        </div>

        {/* ---------------- Inspector rail ---------------- */}
        <Card className="xl:sticky xl:top-[72px]">
          <Tabs value={rail} onChange={setRail} items={[
            { id: 'TRACKS', label: 'Tracks', badge: active.length || undefined },
            { id: 'SENSORS', label: 'Sensors' },
            { id: 'ACTIVITY', label: 'Activity' },
          ]} />
          <div className="mt-4 rail-scroll max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            {rail === 'TRACKS' && (
              <div className="space-y-5">
                {selected ? (
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[15px] font-semibold text-ink">{selected.id}</div>
                        <div className="text-[12px] text-ink-3">{CLASS_LABEL[selected.classification]} · {selected.protocol}</div>
                      </div>
                      <Chip tone={LEVEL_TONE[selected.level]} pulse={selected.level === 'CRITICAL'}>{LEVEL_LABEL[selected.level]}</Chip>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <Stat label="Range" value={sim.rangeM(selected).toFixed(0)} unit="m" />
                      <Stat label="Altitude" value={selected.altitudeM.toFixed(0)} unit="m" />
                      <Stat label="Speed" value={selected.speedMps.toFixed(0)} unit="m/s" />
                      <Stat label="Signal" value={selected.rssiDbm.toFixed(0)} unit="dBm" size="sm" />
                      <Stat label="Frequency" value={selected.freqMHz.toFixed(0)} unit="MHz" size="sm" />
                      <Stat label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} size="sm" />
                    </div>
                    {selected.status === 'DISRUPTING' && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px]"><span className="text-ink-2">Disrupting · {dz.effector.replace('_', ' ').toLowerCase()}</span><span className="num text-ink">{(selected.disruptProgress * 100).toFixed(0)}%</span></div>
                        <Meter value={selected.disruptProgress * 100} tone="bad" className="mt-1" />
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <ToolButton size="sm" icon={<Flag />} label={selected.priority ? 'Priority' : 'Mark priority'} active={selected.priority} onClick={() => sim.setPriority(selected.id)} />
                      <ToolButton size="sm" icon={<Video />} label="Camera" onClick={() => { setHero('CAMERA'); }} />
                    </div>
                  </div>
                ) : <p className="text-[13px] text-ink-3">No active emitters. Sensors are listening.</p>}

                <Divider />
                <Section title="All tracks" right="sorted by priority, range">
                  <ul className="divide-y divide-line -mx-2">
                    {active.map(t => {
                      const sel = t.id === selected?.id;
                      return (
                        <li key={t.id}>
                          <button onClick={() => setSelectedThreatId(t.id)} className={`w-full flex items-center justify-between gap-2 px-2 py-2 text-[13px] rounded-lg ${sel ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                            <span className="flex items-center gap-2 min-w-0"><Dot tone={LEVEL_TONE[t.level]} pulse={t.status === 'DISRUPTING'} />{t.priority && <Flag className="w-3 h-3 text-accent" />}<span className="font-medium text-ink">{t.id}</span><span className="text-ink-3 truncate">{CLASS_LABEL[t.classification]}</span></span>
                            <span className="num text-[12px] text-ink-2 shrink-0">{sim.rangeM(t).toFixed(0)} m{t.status === 'DISRUPTING' ? ` · ${(t.disruptProgress * 100).toFixed(0)}%` : ''}</span>
                          </button>
                        </li>
                      );
                    })}
                    {active.length === 0 && <li className="px-2 py-3 text-[13px] text-ink-3">Nothing tracked.</li>}
                  </ul>
                </Section>
              </div>
            )}

            {rail === 'SENSORS' && (
              <div className="space-y-5">
                <Section title="Sensor network" right={`${metrics.sensorsOnline} / ${metrics.sensorsTotal} online`}>
                  <ul className="divide-y divide-line">
                    {sensors.map(s => {
                      const Icon = s.type === 'RF' ? Radio : s.type === 'RADAR' ? Radar : s.type === 'EO_IR' ? Eye : Ear;
                      const tone: Tone = s.status === 'ONLINE' ? 'ok' : s.status === 'DEGRADED' ? 'warn' : 'neutral';
                      return (
                        <li key={s.id} className="flex items-center justify-between py-2 text-[13px]">
                          <span className="flex items-center gap-2.5 text-ink"><Icon className="w-4 h-4 text-ink-3" />{s.id}<span className="num text-[11px] text-ink-3">{(s.rangePx * 2.2).toFixed(0)} m{s.fovDeg < 360 ? ` · ${s.fovDeg}°` : ''}</span></span>
                          <button onClick={() => sim.toggleSensor(s.id)} title="Toggle online / offline"><Chip tone={tone}>{s.status === 'ONLINE' ? 'Online' : s.status === 'DEGRADED' ? 'Degraded' : 'Offline'}</Chip></button>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
                <Divider />
                <Section title="RF spectrum" right="live">
                  <div className="space-y-3">
                    <Spectrum bins={metrics.spectrum24} label="2.4 GHz" range="2400–2500 MHz" enabled={dz.bands.b24} accent={accent} />
                    <Spectrum bins={metrics.spectrum58} label="5.8 GHz" range="5725–5875 MHz" enabled={dz.bands.b58} accent={accent} />
                  </div>
                </Section>
              </div>
            )}

            {rail === 'ACTIVITY' && (
              <Section title="Activity" right={`${events.length} events`}>
                <Activity empty="Quiet. Detections and effector actions appear here." items={events.map(e => ({ id: e.id, ts: e.ts, text: e.text, tone: e.severity === 'CRITICAL' ? 'bad' : e.severity === 'WARNING' ? 'warn' : e.severity === 'SUCCESS' ? 'ok' : 'neutral', onClick: e.threatId ? () => setSelectedThreatId(e.threatId!) : undefined }))} />
              </Section>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

// Row is imported for parity with the other dashboards' rails; keep the kit surface consistent.
void Row;
