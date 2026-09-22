import React, { useState } from 'react';
import {
  Eye, Radio, Battery, Navigation, Crosshair, Sun, Moon, Flame, UserSearch, Home, Gauge, Clock, Wifi,
  ChevronUp, ChevronDown, ZoomIn, ZoomOut, Activity, Map, Video, MoonStar, SunMedium, Clock3,
} from 'lucide-react';
import { useSurveillanceSimulation, WAYPOINTS, type PatrolDrone, type Detection } from '../hooks/useSurveillanceSimulation';
import { SurveillanceMapCanvas } from './SurveillanceMapCanvas';
import { DroneFeedCanvas } from './DroneFeedCanvas';
import { Panel, Stat, Label, Meter, StatusDot, Toggle, ActionButton, Pill, Sparkline, DashboardHeader, ACCENT, STATUS, formatClock, type StatusKey } from './ui';

const STATUS_TONE: Record<PatrolDrone['status'], StatusKey> = { ON_PATROL: 'good', EN_ROUTE: 'good', MONITORING: 'warning', RTH: 'warning', OFFLINE: 'idle' };
const STATUS_LABEL: Record<PatrolDrone['status'], string> = { ON_PATROL: 'On patrol', EN_ROUTE: 'En route', MONITORING: 'Monitoring', RTH: 'Returning', OFFLINE: 'Offline' };
const SENSOR_LABEL: Record<PatrolDrone['sensorMode'], string> = { RGB_4K: 'RGB 4K', THERMAL_WHITE_HOT: 'Thermal · white hot', THERMAL_IRONBOW: 'Thermal · ironbow', NIGHT_VISION: 'Night vision' };
const DET_TONE: Record<Detection['kind'], StatusKey> = { PERSON: 'warning', VEHICLE: 'idle', HEAT_SIGNATURE: 'critical', UNKNOWN: 'idle' };

export const SurveillanceDashboard: React.FC = () => {
  const sim = useSurveillanceSimulation();
  const { drones, detections, events, selected, selectedDroneId, setSelectedDroneId, missionElapsedSec, uplinkGbps, routeProgress, isNight, nightMode, setNightMode } = sim;
  const [filter, setFilter] = useState<'ALL' | 'AIRBORNE'>('ALL');

  const airborne = drones.filter(d => d.status !== 'OFFLINE');
  const list = filter === 'ALL' ? drones : airborne;
  const unacked = detections.filter(d => !d.acknowledged);
  const d = selected;
  const nextWp = d.targetWpIndex >= 0 ? WAYPOINTS[d.targetWpIndex] : null;
  const offline = d.status === 'OFFLINE';

  return (
    <div id="surveillance-dashboard" className="space-y-4">
      <DashboardHeader
        accent="emerald"
        icon={<Eye />}
        kicker="Vertical 03 · Surveillance & Patrol"
        title="Patrol Mission"
        subtitle={`${airborne.length} of ${drones.length} airframes airborne · ${WAYPOINTS.length}-point loop · ${unacked.length} open detection${unacked.length === 1 ? '' : 's'}`}
      >
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" /><Label>Flight time</Label>
          <span className="font-mono text-xs text-slate-100 tabular-nums">{formatClock(missionElapsedSec)}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
          <Wifi className="w-3.5 h-3.5 text-slate-500" /><Label>Uplink</Label>
          <span className="font-mono text-xs text-slate-100 tabular-nums">{uplinkGbps.toFixed(1)} Gbps</span>
        </div>
        <Pill tone={unacked.some(x => x.kind === 'PERSON' || x.kind === 'HEAT_SIGNATURE') ? 'warning' : 'emerald'}>{unacked.length ? `${unacked.length} to review` : 'All clear'}</Pill>
        {/* Night protocol: AUTO follows the clock; forcing NIGHT flips every airborne payload to thermal */}
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5" title="Night protocol: at night all airborne payloads switch to thermal so moving heat signatures stay visible">
          {(['AUTO', 'DAY', 'NIGHT'] as const).map(m => (
            <button key={m} onClick={() => setNightMode(m)} aria-pressed={nightMode === m} className={`px-2 py-1 rounded-md font-mono text-[10px] font-semibold flex items-center gap-1 ${nightMode === m ? (isNight ? 'bg-indigo-400 text-slate-950' : `${ACCENT.emerald.solid} text-slate-950`) : 'text-slate-400 hover:text-slate-100'}`}>
              {m === 'AUTO' ? <Clock3 className="w-3 h-3" /> : m === 'DAY' ? <SunMedium className="w-3 h-3" /> : <MoonStar className="w-3 h-3" />}{m}
            </button>
          ))}
        </div>
        <Pill tone={isNight ? 'violet' : 'emerald'}>{isNight ? 'Night · IR on all airframes' : 'Daylight · EO'}</Pill>
      </DashboardHeader>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr_300px] gap-4">
        {/* Left column: fleet + live telemetry + power */}
        <div className="space-y-4 min-w-0 order-2 xl:order-1">
          <Panel title="Fleet list" icon={<Radio className="w-3.5 h-3.5" />} right={
            <div className="flex items-center bg-white/[0.04] p-0.5 rounded-md border border-white/[0.08]">
              {(['ALL', 'AIRBORNE'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 rounded font-mono text-[10px] ${filter === f ? `${ACCENT.emerald.solid} text-slate-950 font-bold` : 'text-slate-400 hover:text-slate-100'}`}>{f === 'ALL' ? 'All' : 'Airborne'}</button>
              ))}
            </div>
          }>
            <ul className="divide-y divide-white/[0.05]">
              {list.map(x => (
                <li key={x.id}>
                  <button onClick={() => setSelectedDroneId(x.id)} className={`w-full flex items-center justify-between gap-2 py-1.5 text-xs rounded px-1 -mx-1 ${x.id === selectedDroneId ? 'bg-emerald-500/10 text-slate-50' : 'text-slate-300 hover:bg-white/[0.03]'}`}>
                    <span className="font-mono">{x.id}</span>
                    <span className="font-mono text-[10px] text-slate-500 tabular-nums">{(x.groundSpeedMps * 3.6).toFixed(1)} km/h</span>
                    <StatusDot tone={STATUS_TONE[x.status]} pulse={x.status === 'MONITORING'} label={STATUS_LABEL[x.status]} />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Live telemetry" icon={<Activity className="w-3.5 h-3.5" />} right={<StatusDot tone={offline ? 'idle' : 'good'} pulse={!offline} label={offline ? 'no link' : 'live'} />}>
            <ul className="space-y-2">
              {([
                ['Airspeed', `${(d.groundSpeedMps * 3.6 + 2).toFixed(1)}`, 'km/h', d.history.airspeed],
                ['Vertical speed', `${d.verticalSpeedMps >= 0 ? '+' : ''}${d.verticalSpeedMps.toFixed(1)}`, 'm/s', d.history.vspeed],
                ['Temp (EGT)', d.egtC.toFixed(0), '°C', d.history.egt],
                ['Signal strength', d.signalPct.toFixed(0), '%', d.history.signal],
              ] as const).map(([label, val, unit, hist]) => (
                <li key={label} className="grid grid-cols-[1fr_auto_64px] items-center gap-2">
                  <Label>{label}</Label>
                  <span className="font-mono text-xs text-slate-100 tabular-nums">{val}<span className="text-slate-500 text-[10px]"> {unit}</span></span>
                  <Sparkline data={hist} color={ACCENT.emerald.hex} height={18} />
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-white/[0.06] grid grid-cols-3 gap-2">
              <Stat label="RTT" value={d.rttMs} unit="ms" size="sm" tone={d.rttMs > 150 ? 'warning' : 'neutral'} />
              <Stat label="Pkt loss" value={d.packetLossPct.toFixed(1)} unit="%" size="sm" tone={d.packetLossPct > 2 ? 'warning' : 'neutral'} />
              <Stat label="Heading" value={`${d.headingDeg.toFixed(0)}°`} size="sm" />
            </div>
          </Panel>

          <Panel title="Power system" icon={<Battery className="w-3.5 h-3.5" />}>
            <div className="flex items-end justify-between">
              <Stat label="Battery level" value={`${d.battery.toFixed(1)}%`} size="lg" tone={d.battery > 30 ? 'good' : d.battery > 15 ? 'warning' : 'critical'} />
              <Stat label="Est. endurance" value={d.enduranceMin} unit="min" />
              <div className="flex flex-col gap-0.5 items-end"><Label>Status</Label><StatusDot tone={d.battery > 30 ? 'good' : d.battery > 15 ? 'warning' : 'critical'} label={d.battery > 30 ? 'Nominal' : d.battery > 15 ? 'Low' : 'Critical'} /></div>
            </div>
            <Meter value={d.battery} tone={d.battery > 30 ? 'good' : d.battery > 15 ? 'warning' : 'critical'} className="mt-2" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Voltage" value={d.voltageV.toFixed(1)} unit="V" size="sm" />
              <Stat label="Current" value={d.currentA.toFixed(1)} unit="A" size="sm" />
              <Stat label="Temp" value={d.tempC.toFixed(1)} unit="°C" size="sm" tone={d.tempC > 45 ? 'warning' : 'neutral'} />
            </div>
          </Panel>
        </div>

        {/* Center: live feed + map + flight control */}
        <div className="space-y-4 min-w-0 order-1 xl:order-2">
          {/* Live video feed from the selected airframe's gimbal */}
          <div id="live-feed" className="rounded-2xl overflow-hidden border border-white/[0.08] bg-black shadow-2xl">
            <DroneFeedCanvas
              key={d.id}
              drone={d}
              isNight={isNight}
              width={960}
              onSetSensorMode={m => sim.setSensorMode(d.id, m)}
              onSetZoom={z => sim.setZoom(d.id, z)}
            />
            {/* Other airframes' feeds — click to switch the hero */}
            <div className="grid grid-cols-3 gap-px bg-white/[0.06] border-t border-white/[0.08]">
              {drones.filter(x => x.id !== d.id).map(x => (
                <button key={x.id} onClick={() => setSelectedDroneId(x.id)} className="relative bg-black hover:ring-1 hover:ring-inset hover:ring-emerald-400/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400" title={`Switch feed to ${x.id}`}>
                  <DroneFeedCanvas drone={x} isNight={isNight} width={320} compact />
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#070b0c] shadow-2xl">
            <SurveillanceMapCanvas
              drones={drones} detections={detections} selectedDroneId={selectedDroneId}
              onSelectDrone={setSelectedDroneId} onSelectWaypoint={i => sim.goToWaypoint(selectedDroneId, i)}
            />
            {/* Waypoint strip along the bottom, like the reference */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-2 pointer-events-none">
              {WAYPOINTS.map((w, i) => {
                const isNext = i === d.targetWpIndex;
                const done = d.targetWpIndex >= 0 && ((i - routeProgress.legIndex + WAYPOINTS.length) % WAYPOINTS.length) === 0;
                return (
                  <button key={w.id} onClick={() => sim.goToWaypoint(selectedDroneId, i)} className="pointer-events-auto flex flex-col items-center gap-1" title={`Fly ${selectedDroneId} to ${w.label}`}>
                    <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${isNext ? 'bg-orange-400 text-slate-950' : done ? `${ACCENT.emerald.solid} text-slate-950` : 'bg-slate-800/90 text-slate-300 border border-white/[0.08]'}`}>{w.id}</span>
                    <span className={`w-px h-3 ${isNext ? 'bg-orange-400' : 'bg-white/20'}`} />
                    <span className={`w-2 h-2 rounded-full ${isNext ? 'bg-orange-400 shadow-[0_0_10px_#fb923c]' : done ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  </button>
                );
              })}
            </div>
            <div className="absolute top-3 left-3 rounded-lg border border-white/[0.08] bg-slate-950/80 backdrop-blur px-3 py-1.5 flex items-center gap-4 pointer-events-none">
              <Stat label="Selected" value={d.id} size="sm" hint={d.model} />
              <Stat label="Sensor" value={SENSOR_LABEL[d.sensorMode]} size="sm" />
              <Stat label="Zoom" value={`${d.zoom}×`} size="sm" />
            </div>
          </div>

          <Panel
            title="Flight control"
            icon={<Crosshair className="w-3.5 h-3.5" />}
            right={
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-slate-500">{d.id} · {STATUS_LABEL[d.status]}</span>
                <div className="flex items-center gap-2 rounded-md border border-white/[0.08] px-2 py-0.5">
                  <Toggle on={d.autopilot} onChange={on => sim.setAutopilot(d.id, on)} label="Autopilot" accent="emerald" />
                </div>
              </div>
            }
          >
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <ActionButton icon={<Crosshair />} label="Auto-track" accent="emerald" active={d.tasks.autoTrack} onClick={() => sim.toggleTask(d.id, 'autoTrack')} disabled={offline} />
              <ActionButton icon={<Sun />} label="Illumination" accent="emerald" active={d.tasks.illumination} onClick={() => sim.toggleTask(d.id, 'illumination')} disabled={offline} />
              <ActionButton icon={<Moon />} label="Night vision" accent="emerald" active={d.tasks.nightVision} onClick={() => sim.toggleTask(d.id, 'nightVision')} disabled={offline} />
              <ActionButton icon={<Flame />} label="Thermal scan" accent="emerald" active={d.tasks.thermalScan} onClick={() => sim.toggleTask(d.id, 'thermalScan')} disabled={offline} />
              <ActionButton icon={<UserSearch />} label="Survivor det." accent="emerald" active={d.tasks.survivorDetect} onClick={() => sim.toggleTask(d.id, 'survivorDetect')} disabled={offline} />
              <ActionButton icon={<Home />} label="Return home" danger onClick={() => sim.returnHome(d.id)} disabled={offline || d.status === 'RTH'} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Label>Gimbal</Label>
                <button onClick={() => sim.setGimbal(d.id, 5)} className="p-1.5 rounded-md border border-white/[0.08] text-slate-300 hover:bg-white/[0.06]" aria-label="Gimbal up"><ChevronUp className="w-3.5 h-3.5" /></button>
                <span className="font-mono text-xs text-slate-100 w-10 text-center tabular-nums">{d.gimbalPitchDeg}°</span>
                <button onClick={() => sim.setGimbal(d.id, -5)} className="p-1.5 rounded-md border border-white/[0.08] text-slate-300 hover:bg-white/[0.06]" aria-label="Gimbal down"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-2">
                <Label>Zoom</Label>
                <button onClick={() => sim.setZoom(d.id, Math.max(1, d.zoom - 1))} className="p-1.5 rounded-md border border-white/[0.08] text-slate-300 hover:bg-white/[0.06]" aria-label="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
                <span className="font-mono text-xs text-slate-100 w-8 text-center tabular-nums">{d.zoom}×</span>
                <button onClick={() => sim.setZoom(d.id, Math.min(10, d.zoom + 1))} className="p-1.5 rounded-md border border-white/[0.08] text-slate-300 hover:bg-white/[0.06]" aria-label="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Video className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-mono text-[10px] text-slate-400">{SENSOR_LABEL[d.sensorMode]} · H.264 4.2 Mbps · {d.rttMs} ms glass-to-glass</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right column: navigation, detections, log */}
        <div className="space-y-4 min-w-0 order-3">
          <Panel title="Navigation" icon={<Navigation className="w-3.5 h-3.5" />} right={nextWp ? <Pill tone="amber">→ {nextWp.id}</Pill> : <Pill tone="emerald">Tasked</Pill>}>
            <RouteProgressChart legIndex={routeProgress.legIndex} legFraction={routeProgress.legFraction} />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Distance" value={routeProgress.distanceKm.toFixed(2)} unit="km" size="sm" />
              <Stat label="Bearing" value={`${routeProgress.bearingDeg.toFixed(0)}°`} size="sm" />
              <Stat label="ETA" value={routeProgress.etaSec > 0 ? formatClock(routeProgress.etaSec) : '—'} size="sm" />
            </div>
            <Meter value={((routeProgress.legIndex + routeProgress.legFraction) / WAYPOINTS.length) * 100} tone="emerald" className="mt-2" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500"><span>loop {(((routeProgress.legIndex + routeProgress.legFraction) / WAYPOINTS.length) * 100).toFixed(0)}%</span><span>{nextWp ? `${nextWp.label} · ${nextWp.altM} m` : 'off-route target'}</span></div>
          </Panel>

          <Panel title="Detections" icon={<Eye className="w-3.5 h-3.5" />} right={<span className="font-mono text-[10px] text-slate-500">{unacked.length} open</span>}>
            {detections.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">Nothing flagged yet. Payload classifiers report here.</div>
            ) : (
              <ul className="divide-y divide-white/[0.05] max-h-56 overflow-y-auto">
                {detections.map(det => (
                  <li key={det.id} className={`py-1.5 text-xs ${det.acknowledged ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0"><StatusDot tone={det.acknowledged ? 'idle' : DET_TONE[det.kind]} pulse={!det.acknowledged && det.kind !== 'VEHICLE'} /><span className="font-mono text-slate-100">{det.id}</span><span className="text-slate-400 truncate">{det.kind.toLowerCase().replace('_', ' ')}</span></span>
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">{(det.confidence * 100).toFixed(0)}% · {det.byDroneId}</span>
                    </div>
                    {!det.acknowledged && (
                      <div className="mt-1 flex gap-1.5">
                        <button onClick={() => sim.dispatchToDetection(selectedDroneId, det.id)} className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 font-mono text-[10px] font-bold" disabled={offline}>Send {selectedDroneId}</button>
                        <button onClick={() => sim.acknowledgeDetection(det.id)} className="px-2 py-0.5 rounded border border-white/[0.1] text-slate-300 font-mono text-[10px]">Dismiss</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Mission map" icon={<Map className="w-3.5 h-3.5" />} right={<span className="font-mono text-[10px] text-slate-500">{WAYPOINTS.length} scan points</span>}>
            <ol className="space-y-1">
              {WAYPOINTS.map((w, i) => {
                const isNext = i === d.targetWpIndex;
                return (
                  <li key={w.id}>
                    <button onClick={() => sim.goToWaypoint(selectedDroneId, i)} disabled={offline} className={`w-full flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs ${isNext ? 'bg-orange-400/10 text-orange-100' : 'text-slate-300 hover:bg-white/[0.03]'} disabled:opacity-40`}>
                      <span className="flex items-center gap-2"><span className={`font-mono text-[10px] font-bold ${isNext ? 'text-orange-300' : 'text-slate-500'}`}>{w.id}</span>{w.label}</span>
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">{w.altM} m · {w.holdSec}s</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel title="Event log" icon={<Gauge className="w-3.5 h-3.5" />}>
            <ul className="max-h-40 overflow-y-auto divide-y divide-white/[0.05]">
              {events.length === 0 && <li className="py-2 text-xs text-slate-500">Quiet.</li>}
              {events.map(e => {
                const tone: StatusKey = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'WARNING' ? 'warning' : e.severity === 'SUCCESS' ? 'good' : 'idle';
                return (
                  <li key={e.id} className="flex items-start gap-2 py-1.5 text-xs">
                    <span className="font-mono text-[10px] text-slate-500 tabular-nums shrink-0 pt-0.5">{e.ts}</span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS[tone].dot}`} />
                    <span className="text-slate-300">{e.text}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
};

/**
 * Route progress: one line, x = waypoint sequence, y = altitude profile, with the
 * completed portion of the loop drawn in the accent and the remainder muted.
 */
const RouteProgressChart: React.FC<{ legIndex: number; legFraction: number }> = ({ legIndex, legFraction }) => {
  const W = 260, H = 84, padX = 14, padY = 12;
  const n = WAYPOINTS.length;
  const pts = [...WAYPOINTS, WAYPOINTS[0]].map((w, i) => ({ x: padX + (i / n) * (W - padX * 2), y: H - padY - ((w.altM - 40) / 60) * (H - padY * 2), w }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const progressX = padX + ((legIndex + legFraction) / n) * (W - padX * 2);
  // Interpolate y at progressX for the marker.
  const seg = Math.min(n - 1, Math.floor(legIndex));
  const a = pts[seg], b = pts[seg + 1];
  const my = a.y + (b.y - a.y) * legFraction;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label="Route altitude profile and progress">
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1={padX} x2={W - padX} y1={padY + g * (H - padY * 2)} y2={padY + g * (H - padY * 2)} stroke="rgba(255,255,255,0.06)" />)}
      <defs><clipPath id="rp-clip"><rect x={0} y={0} width={progressX} height={H} /></clipPath></defs>
      <path d={path} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={ACCENT.emerald.hex} strokeWidth={2} clipPath="url(#rp-clip)" />
      {pts.slice(0, n).map((p, i) => (
        <g key={p.w.id}>
          <circle cx={p.x} cy={p.y} r={3} fill={i === (legIndex + 1) % n ? '#fb923c' : i <= legIndex ? ACCENT.emerald.hex : '#334155'} stroke="#0b0f14" strokeWidth={1.5} />
          <text x={p.x} y={H - 1} textAnchor="middle" fontSize={8} fontFamily="ui-monospace, Menlo, monospace" fill="#64748b">{p.w.id}</text>
        </g>
      ))}
      <circle cx={progressX} cy={my} r={4} fill="#fb923c" stroke="#0b0f14" strokeWidth={1.5} />
    </svg>
  );
};
