import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair, Sun, Moon, Flame, UserSearch, Home, Camera, ChevronUp, ChevronDown, ZoomIn, ZoomOut, Map as MapIcon, Video, Maximize2, Clock3, SunMedium, MoonStar, Upload, Cable, Cpu, Globe, Film,
} from 'lucide-react';
import { useSurveillanceSimulation, WAYPOINTS, SITE, type PatrolDrone, type Detection, type SensorMode } from '../hooks/useSurveillanceSimulation';
import { SurveillanceMapCanvas } from './SurveillanceMapCanvas';
import { DroneFeedCanvas } from './DroneFeedCanvas';
import { useAircraftLink } from '../link/useAircraftLink';
import { useVideoSource, TURN_KEY, type VideoSource, type TurnConfig } from '../link/useVideoSource';
import { PLACES, PLACE_LABEL, type Place } from './feed/footage';
import { useRecorder, useRecordedEvents } from '../record/useRecorder';
import {
  Headline, Card, Section, Divider, Tabs, Stat, Row, Chip, Dot, Meter, Sparkline, ToolButton, IconButton, Toggle, Segmented, Activity, formatClock, useAccentHex, type Tone,
} from './ui';

const STATUS_TONE: Record<PatrolDrone['status'], Tone> = { ON_PATROL: 'ok', EN_ROUTE: 'ok', MONITORING: 'warn', RTH: 'warn', OFFLINE: 'neutral' };
const STATUS_LABEL: Record<PatrolDrone['status'], string> = { ON_PATROL: 'On patrol', EN_ROUTE: 'En route', MONITORING: 'Holding', RTH: 'Returning', OFFLINE: 'On pad' };
const SENSOR_LABEL: Record<PatrolDrone['sensorMode'], string> = { RGB_4K: 'Colour (EO)', THERMAL_WHITE_HOT: 'Thermal · white hot', THERMAL_IRONBOW: 'Thermal · ironbow', NIGHT_VISION: 'Night vision' };
const DET_TONE: Record<Detection['kind'], Tone> = { PERSON: 'warn', VEHICLE: 'neutral', HEAT_SIGNATURE: 'bad', UNKNOWN: 'neutral' };
const DET_LABEL: Record<Detection['kind'], string> = { PERSON: 'Person', VEHICLE: 'Vehicle', HEAT_SIGNATURE: 'Heat signature', UNKNOWN: 'Unknown' };

type RailTab = 'AIRCRAFT' | 'ROUTE' | 'DETECTIONS' | 'ACTIVITY';

export const SurveillanceDashboard: React.FC = () => {
  const sim = useSurveillanceSimulation();
  const { drones, detections, events, selected: d, selectedDroneId, setSelectedDroneId, missionElapsedSec, routeProgress, isNight, nightMode, setNightMode } = sim;
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = useAccentHex(rootRef, '#0f766e');
  const [rail, setRail] = useState<RailTab>('AIRCRAFT');
  const [hero, setHero] = useState<'CAMERA' | 'MAP'>('CAMERA');

  // Real aircraft: every vehicle heard on the link takes over an aircraft slot, primary first.
  const link = useAircraftLink();
  const liveSysIds = link.live ? Object.keys(link.vehicles).map(Number).sort((a, b) => (a === link.primarySysId ? -1 : b === link.primarySysId ? 1 : a - b)) : [];
  const liveIds = liveSysIds.map((_, i) => drones[i]?.id).filter(Boolean) as string[];
  useEffect(() => {
    liveSysIds.forEach((sys, i) => { const id = drones[i]?.id; if (id) sim.applyLiveTelemetry(id, link.vehicles[sys]); });
  }, [link.vehicles]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveKey = liveIds.join(',');
  useEffect(() => () => { liveKey.split(',').filter(Boolean).forEach(id => sim.releaseLive(id)); }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveId = liveIds.includes(selectedDroneId) ? selectedDroneId : null;
  const isPrimary = liveId === liveIds[0];

  // Send an aircraft to a waypoint: the simulation always; the real aircraft when it is the linked one.
  const sendToWaypoint = (i: number) => {
    sim.goToWaypoint(selectedDroneId, i);
    if (liveId && isPrimary) { const ll = sim.waypointLatLon(i); if (ll) link.goTo(ll.lat, ll.lon, WAYPOINTS[i].altM).catch(() => {}); }
  };
  /**
   * Payload controls. The simulation always follows so the feed stays in step;
   * when the selected aircraft is the linked one, the command also goes to it.
   * Thermal switches the camera source (MAV_CMD_SET_CAMERA_SOURCE, e.g. Siyi ZT6/ZT30);
   * palettes and night vision have no standard command and stay on this screen.
   */
  const toAircraft = !!liveId && isPrimary;
  const payload = {
    gimbal: (delta: number) => {
      const pitch = Math.max(-90, Math.min(15, d.gimbalPitchDeg + delta));
      sim.setGimbal(d.id, delta);
      if (toAircraft) link.setGimbal(pitch).catch(() => {});
    },
    zoom: (z: number) => { sim.setZoom(d.id, z); if (toAircraft) link.setZoom(((z - 1) / 9) * 100).catch(() => {}); },
    sensor: (mode: SensorMode) => sim.setSensorMode(d.id, mode),
    task: (task: keyof PatrolDrone['tasks']) => {
      const on = !d.tasks[task];
      sim.toggleTask(d.id, task);
      if (toAircraft && task === 'illumination') link.setRelay(0, on).catch(() => {});
    },
  };
  // The aircraft camera follows the dashboard's sensor state — including the night
  // protocol switching every payload to thermal after dark — whenever it changes.
  const wantSource = d.sensorMode.startsWith('THERMAL') ? 'IR' : 'RGB';
  useEffect(() => { if (toAircraft) link.setCameraSource(wantSource).catch(() => {}); }, [toAircraft, wantSource]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveGimbal = toAircraft && Number.isFinite(link.telemetry.gimbalPitchDeg) ? Math.round(link.telemetry.gimbalPitchDeg) : null;

  const uploadPatrol = () => {
    const items = WAYPOINTS.map((w, i) => { const ll = sim.waypointLatLon(i); return ll ? { lat: ll.lat, lon: ll.lon, altRelM: w.altM, holdS: w.holdSec } : null; });
    if (items.some(x => !x)) return;
    link.uploadMission(items as { lat: number; lon: number; altRelM: number; holdS: number }[], true).catch(() => {});
  };

  // Flight record: one session per patrol, sampled at 1 Hz, with the dashboard's
  // own event log mirrored in so every command and detection is in the record.
  const linkSource = link.status === 'CONNECTED' ? link.transport : 'SIMULATION';
  useRecorder('SURVEILLANCE', `Patrol · ${SITE.name}`, linkSource, () =>
    drones.filter(x => x.status !== 'OFFLINE').map(x => ({
      t: Date.now(), aircraft: x.id,
      lat: liveIds.includes(x.id) ? link.vehicles[liveSysIds[liveIds.indexOf(x.id)]]?.lat : undefined,
      lon: liveIds.includes(x.id) ? link.vehicles[liveSysIds[liveIds.indexOf(x.id)]]?.lon : undefined,
      altM: x.altM, speedMps: x.groundSpeedMps, headingDeg: x.headingDeg, batteryPct: x.battery,
      extra: { status: x.status, sensor: x.sensorMode, autopilot: x.autopilot, signalPct: Math.round(x.signalPct) },
    })));
  useRecordedEvents(events, 'PATROL');

  // Video: synthetic by default; a capture device or the companion computer's WebRTC stream when chosen.
  const [videoSource, setVideoSource] = useState<VideoSource>({ kind: 'FOOTAGE', place: 'SAN_FRANCISCO' });
  const [videoMenu, setVideoMenu] = useState(false);
  const [webrtcUrl, setWebrtcUrl] = useState(() => { try { return localStorage.getItem('a1-webrtc-url') || 'http://192.168.1.50:8080'; } catch { return 'http://192.168.1.50:8080'; } });
  const video = useVideoSource(videoSource);
  const videoLabel = videoSource.kind === 'CAPTURE' ? 'CAPTURE · LIVE' : videoSource.kind === 'WEBRTC' ? 'WEBRTC · LIVE' : undefined;
  // Real footage: the selected aircraft flies the chosen place; the others each get a different one.
  const place = videoSource.kind === 'FOOTAGE' ? videoSource.place : null;
  const simWorld = videoSource.kind === 'SIM' ? videoSource.world ?? 'CITY' : undefined;
  const placeFor = (i: number): Place | null => place ? PLACES[(PLACES.indexOf(place) + i) % PLACES.length] : null;

  const airborne = drones.filter(x => x.status !== 'OFFLINE');
  const unacked = detections.filter(x => !x.acknowledged);
  const offline = d.status === 'OFFLINE';
  const nextWp = d.targetWpIndex >= 0 ? WAYPOINTS[d.targetWpIndex] : null;
  const battTone: Tone = d.battery > 30 ? 'ok' : d.battery > 15 ? 'warn' : 'bad';

  const feed = (
    <DroneFeedCanvas key={d.id} drone={d} isNight={isNight} footage={placeFor(drones.findIndex(x => x.id === d.id) - Math.max(0, drones.findIndex(x => x.id === selectedDroneId)))} world={simWorld} onSetSensorMode={payload.sensor} onSetZoom={payload.zoom} className="w-full h-full" videoStream={video.stream} videoLabel={videoLabel} />
  );
  const map = (
    <SurveillanceMapCanvas drones={drones} detections={detections} selectedDroneId={selectedDroneId} onSelectDrone={setSelectedDroneId} onSelectWaypoint={sendToWaypoint} />
  );

  return (
    <div ref={rootRef} data-accent="surveillance" id="surveillance-dashboard" className="space-y-5">
      <Headline
        title="Patrol"
        context={`Venue compound · ${WAYPOINTS.length}-point loop · ${d.id} selected${nextWp ? ` · next ${nextWp.label}` : ''}`}
        status={liveIds.length ? { label: `Live · ${liveIds.length} aircraft on ${link.deviceName}`, tone: 'ok', pulse: true } : { label: isNight ? 'Night · thermal' : 'Daylight', tone: isNight ? 'accent' : 'neutral' }}
        stats={[
          { label: 'Airborne', value: `${airborne.length} / ${drones.length}` },
          { label: 'Flight time', value: formatClock(missionElapsedSec) },
          { label: 'Open detections', value: unacked.length, tone: unacked.length ? 'warn' : 'neutral' },
          { label: `${d.id} battery`, value: `${d.battery.toFixed(0)}%`, tone: battTone },
        ]}
        actions={
          <Segmented size="sm" value={nightMode} onChange={setNightMode} items={[
            { id: 'AUTO', label: <><Clock3 className="w-3 h-3" />Auto</>, title: 'Follow the clock (19:00–06:00 is night)' },
            { id: 'DAY', label: <><SunMedium className="w-3 h-3" />Day</> },
            { id: 'NIGHT', label: <><MoonStar className="w-3 h-3" />Night</>, title: 'Force night: all airborne payloads switch to thermal' },
          ]} />
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
        {/* ---------------- Stage ---------------- */}
        <div className="space-y-3 min-w-0">
          {/* Aircraft strip: every airframe's feed, click to select */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {drones.map(x => {
              const sel = x.id === selectedDroneId;
              return (
                <button key={x.id} onClick={() => setSelectedDroneId(x.id)} aria-pressed={sel}
                  className={`text-left rounded-xl overflow-hidden border bg-surface transition-colors ${sel ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line-2'}`}>
                  <div className="bg-imagery"><DroneFeedCanvas drone={x} isNight={isNight} footage={placeFor(drones.indexOf(x) - Math.max(0, drones.findIndex(y => y.id === selectedDroneId)))} world={simWorld} compact /></div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="flex items-center gap-2 text-[12px] font-medium text-ink"><Dot tone={STATUS_TONE[x.status]} pulse={x.status === 'MONITORING'} />{x.id}</span>
                    <span className="text-[11px] text-ink-3">{STATUS_LABEL[x.status]}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Hero: camera with the map picture-in-picture, or swapped */}
          <div className="relative rounded-[var(--radius-card)] overflow-hidden bg-imagery border border-line" style={{ aspectRatio: '16 / 9' }}>
            <div className="absolute inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:object-cover">{hero === 'CAMERA' ? feed : map}</div>
            <button
              onClick={() => setHero(h => (h === 'CAMERA' ? 'MAP' : 'CAMERA'))}
              title={hero === 'CAMERA' ? 'Show map full size' : 'Show camera full size'}
              className="hidden md:block absolute bottom-14 right-3 w-[26%] min-w-[180px] rounded-lg overflow-hidden border border-white/25 shadow-xl bg-imagery group"
              style={{ aspectRatio: hero === 'CAMERA' ? '5 / 3' : '16 / 9' }}
            >
              <div className="absolute inset-0 pointer-events-none [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:object-cover">{hero === 'CAMERA' ? map : feed}</div>
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {hero === 'CAMERA' ? <><MapIcon className="w-3 h-3" />Map</> : <><Video className="w-3 h-3" />Camera</>}
              </span>
              <span className="absolute top-1.5 right-1.5 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-3 h-3" /></span>
            </button>
          </div>

          {/* Action bar: payload and flight commands for the selected aircraft */}
          <Card padded={false} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <ToolButton icon={<Crosshair />} label="Auto-track" active={d.tasks.autoTrack} disabled={offline} onClick={() => payload.task('autoTrack')} title={toAircraft ? 'Needs onboard detection (companion computer); on this screen only for now' : undefined} />
              <ToolButton icon={<Flame />} label="Thermal" active={d.tasks.thermalScan} disabled={offline} onClick={() => payload.task('thermalScan')} title={toAircraft ? 'Switches the aircraft camera to its thermal sensor' : undefined} />
              <ToolButton icon={<Moon />} label="Night vision" active={d.tasks.nightVision} disabled={offline} onClick={() => payload.task('nightVision')} />
              <ToolButton command="fly" icon={<Sun />} label="Spotlight" active={d.tasks.illumination} disabled={offline} onClick={() => payload.task('illumination')} title={toAircraft ? 'Relay 1 on the flight controller (RELAY1_PIN)' : undefined} />
              <ToolButton icon={<UserSearch />} label="Survivor detect" active={d.tasks.survivorDetect} disabled={offline} onClick={() => payload.task('survivorDetect')} />
              {toAircraft && <ToolButton command="fly" icon={<Camera />} label="Photo" onClick={() => link.takePhoto().catch(() => {})} title="Still photo on the aircraft camera (IMAGE_START_CAPTURE)" />}
              <span className="w-px h-6 bg-line mx-1" />
              <span className="text-[11px] text-ink-3">Gimbal</span>
              <IconButton icon={<ChevronUp />} label="Gimbal up" disabled={offline} onClick={() => payload.gimbal(5)} />
              <span className="num text-[12px] text-ink w-9 text-center" title={liveGimbal != null ? 'Reported by the aircraft gimbal' : undefined}>{liveGimbal ?? d.gimbalPitchDeg}°</span>
              <IconButton icon={<ChevronDown />} label="Gimbal down" disabled={offline} onClick={() => payload.gimbal(-5)} />
              <span className="text-[11px] text-ink-3 ml-1">Zoom</span>
              <IconButton icon={<ZoomOut />} label="Zoom out" disabled={offline} onClick={() => payload.zoom(Math.max(1, d.zoom - 1))} />
              <span className="num text-[12px] text-ink w-7 text-center">{d.zoom}×</span>
              <IconButton icon={<ZoomIn />} label="Zoom in" disabled={offline} onClick={() => payload.zoom(Math.min(10, d.zoom + 1))} />
              <span className="ml-auto flex flex-wrap items-center gap-3 max-sm:ml-0 max-sm:w-full">
                <span className="relative">
                  <ToolButton icon={videoSource.kind === 'FOOTAGE' ? <Film /> : videoSource.kind === 'SIM' ? <Cpu /> : videoSource.kind === 'CAPTURE' ? <Cable /> : <Globe />} label={videoSource.kind === 'FOOTAGE' ? `Video: ${PLACE_LABEL[videoSource.place]}` : videoSource.kind === 'SIM' ? (videoSource.world === 'SF' ? 'Video: San Francisco tour' : 'Video: 3D simulation') : videoSource.kind === 'CAPTURE' ? 'Video: capture' : 'Video: aircraft'} active={videoSource.kind === 'CAPTURE' || videoSource.kind === 'WEBRTC'} onClick={() => setVideoMenu(m => !m)} />
                  {videoMenu && (
                    <div className="absolute right-0 bottom-full mb-2 w-[320px] rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_12px_40px_rgba(16,24,40,0.14)] p-2 z-40">
                      <div className="px-2 pt-1 pb-2 flex items-center justify-between"><span className="text-[13px] font-semibold text-ink">Video source</span><Chip tone={video.status === 'LIVE' ? 'ok' : video.status === 'CONNECTING' ? 'warn' : video.status === 'ERROR' ? 'bad' : 'neutral'}>{video.status === 'IDLE' ? (videoSource.kind === 'FOOTAGE' ? 'Recorded' : 'Simulation') : video.status[0] + video.status.slice(1).toLowerCase()}</Chip></div>
                      <div className={`rounded-lg px-2 py-2 ${videoSource.kind === 'FOOTAGE' ? 'bg-accent-soft' : ''}`}>
                        <div className="text-[13px] font-medium text-ink">Real drone footage</div>
                        <div className="text-[11px] text-ink-3">Recorded flights over real places, with the sensor modes on top</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {PLACES.map(p => (
                            <button key={p} onClick={() => setVideoSource({ kind: 'FOOTAGE', place: p })} aria-pressed={videoSource.kind === 'FOOTAGE' && videoSource.place === p}
                              className={`h-7 px-2 rounded-md border text-[12px] ${videoSource.kind === 'FOOTAGE' && videoSource.place === p ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-2 hover:text-ink'}`}>{PLACE_LABEL[p]}</button>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => { setVideoSource({ kind: 'SIM', world: 'SF' }); setVideoMenu(false); }} className={`w-full text-left rounded-lg px-2 py-2 text-[13px] ${videoSource.kind === 'SIM' && videoSource.world === 'SF' ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}><span className="font-medium text-ink">San Francisco aerial tour</span><span className="block text-[11px] text-ink-3">Eighteen shots cut like a 4K drone film: downtown, the Bay Bridge, the Golden Gate at golden hour and blue hour; rendered live, works offline</span></button>
                      <button onClick={() => { setVideoSource({ kind: 'SIM' }); setVideoMenu(false); }} className={`w-full text-left rounded-lg px-2 py-2 text-[13px] ${videoSource.kind === 'SIM' && videoSource.world !== 'SF' ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}><span className="font-medium text-ink">3D simulation</span><span className="block text-[11px] text-ink-3">A rendered city with traffic, people and thermal signatures; works offline</span></button>
                      <button onClick={() => { setVideoSource({ kind: 'CAPTURE' }); video.refreshDevices(); }} className={`w-full text-left rounded-lg px-2 py-2 text-[13px] ${videoSource.kind === 'CAPTURE' ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}><span className="font-medium text-ink">Capture device</span><span className="block text-[11px] text-ink-3">HDMI capture stick or USB camera on this computer</span></button>
                      {videoSource.kind === 'CAPTURE' && video.devices.length > 0 && (
                        <select value={videoSource.deviceId ?? ''} onChange={e => setVideoSource({ kind: 'CAPTURE', deviceId: e.target.value || undefined })} className="mx-2 mb-1 w-[calc(100%-16px)] rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink">
                          <option value="">Default camera</option>
                          {video.devices.map(dv => <option key={dv.id} value={dv.id}>{dv.label}</option>)}
                        </select>
                      )}
                      <div className={`rounded-lg px-2 py-2 ${videoSource.kind === 'WEBRTC' ? 'bg-accent-soft' : ''}`}>
                        <div className="text-[13px] font-medium text-ink">Aircraft (WebRTC)</div>
                        <div className="text-[11px] text-ink-3">Companion computer streamer, hardware/companion-pi/video</div>
                        <div className="mt-1.5 flex gap-1.5">
                          <input value={webrtcUrl} onChange={e => { setWebrtcUrl(e.target.value); try { localStorage.setItem('a1-webrtc-url', e.target.value); } catch { /* ignore */ } }} placeholder="http://<pi>:8080" className="flex-1 min-w-0 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink num" />
                          <ToolButton size="sm" primary label="Connect" onClick={() => setVideoSource({ kind: 'WEBRTC', url: webrtcUrl })} />
                        </div>
                        <TurnSettings />
                      </div>
                      {video.error && <div className="mx-2 mt-1 rounded bg-bad-soft px-2.5 py-1.5 text-[11px] text-bad">{video.error}</div>}
                    </div>
                  )}
                </span>
                <span className="w-40"><Toggle on={d.autopilot} onChange={on => sim.setAutopilot(d.id, on)} label="Autopilot" /></span>
                <ToolButton command="abort" icon={<Home />} label="Return home" danger disabled={offline || d.status === 'RTH'} onClick={() => { sim.returnHome(d.id); if (liveId && isPrimary) link.returnToLaunch(); }} title={liveId ? 'Sends MAV_CMD_NAV_RETURN_TO_LAUNCH to the aircraft' : undefined} />
              </span>
            </div>
          </Card>
        </div>

        {/* ---------------- Inspector rail ---------------- */}
        <Card className="xl:sticky xl:top-[72px]">
          <Tabs value={rail} onChange={setRail} items={[
            { id: 'AIRCRAFT', label: 'Aircraft' },
            { id: 'ROUTE', label: 'Route' },
            { id: 'DETECTIONS', label: 'Detections', badge: unacked.length || undefined },
            { id: 'ACTIVITY', label: 'Activity' },
          ]} />

          <div className="mt-4 rail-scroll max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            {rail === 'AIRCRAFT' && (
              <div className="space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-semibold text-ink">{d.id}</div>
                    <div className="text-[12px] text-ink-3">{liveId ? `${link.transport === 'BLUETOOTH' ? 'Bluetooth LE' : link.transport === 'NETWORK' ? 'Network' : 'USB radio'} · ${link.autopilot === 'PX4' ? 'PX4' : 'ArduPilot'} · ${link.telemetry.msgsPerSec} msg/s` : d.model} · {SENSOR_LABEL[d.sensorMode]}</div>
                  </div>
                  <Chip tone={STATUS_TONE[d.status]} pulse={d.status === 'MONITORING'}>{STATUS_LABEL[d.status]}</Chip>
                </div>

                <Section title="Power" right={`${d.enduranceMin} min remaining`}>
                  <div className="flex items-end justify-between gap-3">
                    <Stat label="Battery" value={`${d.battery.toFixed(1)}%`} size="lg" tone={battTone} />
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Voltage" value={d.voltageV.toFixed(1)} unit="V" size="sm" />
                      <Stat label="Current" value={d.currentA.toFixed(1)} unit="A" size="sm" />
                      <Stat label="Temp" value={d.tempC.toFixed(0)} unit="°C" size="sm" tone={d.tempC > 45 ? 'warn' : 'neutral'} />
                    </div>
                  </div>
                  <Meter value={d.battery} tone={battTone} className="mt-2" />
                </Section>

                <Section title="Flight">
                  {([
                    ['Airspeed', `${(d.groundSpeedMps * 3.6 + 2).toFixed(0)} km/h`, d.history.airspeed],
                    ['Vertical speed', `${d.verticalSpeedMps >= 0 ? '+' : ''}${d.verticalSpeedMps.toFixed(1)} m/s`, d.history.vspeed],
                    ['Altitude', `${d.altM.toFixed(0)} m`, null],
                    ['Heading', `${d.headingDeg.toFixed(0)}°`, null],
                    ['Motor temp', `${d.egtC.toFixed(0)} °C`, d.history.egt],
                  ] as const).map(([label, value, hist]) => (
                    <Row key={label} label={label} value={value} right={hist ? <span className="w-16 inline-block"><Sparkline data={[...hist]} color={accent} height={16} /></span> : undefined} />
                  ))}
                </Section>

                <Section title="Link">
                  <Row label="Signal" value={`${d.signalPct.toFixed(0)}%`} tone={d.signalPct < 50 ? 'warn' : 'neutral'} right={<span className="w-16 inline-block"><Sparkline data={d.history.signal} color={accent} height={16} /></span>} />
                  <Row label="Latency" value={`${d.rttMs} ms`} tone={d.rttMs > 150 ? 'warn' : 'neutral'} />
                  <Row label="Packet loss" value={`${d.packetLossPct.toFixed(1)}%`} tone={d.packetLossPct > 2 ? 'warn' : 'neutral'} />
                  <Row label="Video" value="H.264 · 4.2 Mbps" />
                </Section>
              </div>
            )}

            {rail === 'ROUTE' && (
              <div className="space-y-5">
                <Section title="Progress" right={nextWp ? `next: ${nextWp.id} ${nextWp.label}` : 'off-route target'}>
                  <RouteProgressChart legIndex={routeProgress.legIndex} legFraction={routeProgress.legFraction} accent={accent} />
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <Stat label="Distance flown" value={routeProgress.distanceKm.toFixed(2)} unit="km" size="sm" />
                    <Stat label="Bearing" value={`${routeProgress.bearingDeg.toFixed(0)}°`} size="sm" />
                    <Stat label="ETA" value={routeProgress.etaSec > 0 ? formatClock(routeProgress.etaSec) : '—'} size="sm" />
                  </div>
                </Section>
                {liveId && isPrimary && (
                  <div className="rounded-lg bg-accent-soft px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] text-ink">Fly this loop on {liveId}</div>
                      <ToolButton command="fly" size="sm" primary icon={<Upload />} label={link.missionUpload.state === 'UPLOADING' ? `Uploading ${link.missionUpload.sent}/${link.missionUpload.total}` : 'Upload patrol'} disabled={link.missionUpload.state === 'UPLOADING' || !link.preflight.ok} onClick={uploadPatrol} title={link.preflight.ok ? 'Sends the five waypoints as a MAVLink mission and starts AUTO' : 'Pre-flight gate not satisfied (see link popover)'} />
                    </div>
                    {link.missionUpload.state === 'DONE' && <div className="mt-1 text-[11px] text-ok">Mission on the aircraft · AUTO started</div>}
                    {link.missionUpload.state === 'FAILED' && <div className="mt-1 text-[11px] text-bad">{link.missionUpload.error}</div>}
                    {link.telemetry.missionCurrent > 0 && <div className="mt-1 text-[11px] text-ink-2">Aircraft reports mission item {link.telemetry.missionCurrent}</div>}
                  </div>
                )}
                <Divider />
                <Section title="Waypoints" right="click to send the aircraft">
                  <ol className="-mx-2">
                    {WAYPOINTS.map((w, i) => {
                      const isNext = i === d.targetWpIndex;
                      return (
                        <li key={w.id}>
                          <button onClick={() => sendToWaypoint(i)} disabled={offline}
                            className={`w-full flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-[13px] transition-colors disabled:opacity-40 ${isNext ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                            <span className="flex items-center gap-2.5"><span className={`num text-[11px] font-semibold w-8 ${isNext ? 'text-accent' : 'text-ink-3'}`}>{w.id}</span>{w.label}</span>
                            <span className="num text-[11px] text-ink-3">{w.altM} m · hold {w.holdSec}s</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </Section>
              </div>
            )}

            {rail === 'DETECTIONS' && (
              <Section title="Detections" right={`${unacked.length} open · ${detections.length} total`}>
                {detections.length === 0 ? (
                  <p className="text-[13px] text-ink-3 py-2">Nothing flagged yet. Payload classifiers report here.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {detections.map(det => (
                      <li key={det.id} className={`py-2.5 ${det.acknowledged ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="flex items-center gap-2 min-w-0"><Dot tone={det.acknowledged ? 'neutral' : DET_TONE[det.kind]} pulse={!det.acknowledged && det.kind !== 'VEHICLE'} /><span className="font-medium text-ink">{DET_LABEL[det.kind]}</span><span className="text-ink-3 truncate">{det.id}</span></span>
                          <span className="num text-[11px] text-ink-3">{(det.confidence * 100).toFixed(0)}% · {det.byDroneId}</span>
                        </div>
                        {!det.acknowledged && (
                          <div className="mt-2 flex gap-2">
                            <ToolButton command="fly" size="sm" primary label={`Send ${selectedDroneId}`} disabled={offline} onClick={() => sim.dispatchToDetection(selectedDroneId, det.id)} />
                            <ToolButton size="sm" label="Dismiss" onClick={() => sim.acknowledgeDetection(det.id)} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {rail === 'ACTIVITY' && (
              <Section title="Activity" right={`${events.length} events`}>
                <Activity empty="Quiet." items={events.map(e => ({ id: e.id, ts: e.ts, text: e.text, tone: e.severity === 'CRITICAL' ? 'bad' : e.severity === 'WARNING' ? 'warn' : e.severity === 'SUCCESS' ? 'ok' : 'neutral', onClick: e.droneId ? () => setSelectedDroneId(e.droneId!) : undefined }))} />
              </Section>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

/** Route altitude profile with the completed portion in the accent. */
const RouteProgressChart: React.FC<{ legIndex: number; legFraction: number; accent: string }> = ({ legIndex, legFraction, accent }) => {
  const W = 300, H = 84, padX = 14, padY = 12, n = WAYPOINTS.length;
  const pts = [...WAYPOINTS, WAYPOINTS[0]].map((w, i) => ({ x: padX + (i / n) * (W - padX * 2), y: H - padY - ((w.altM - 40) / 60) * (H - padY * 2), w }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const progressX = padX + ((legIndex + legFraction) / n) * (W - padX * 2);
  const seg = Math.min(n - 1, Math.floor(legIndex));
  const a = pts[seg], b = pts[seg + 1];
  const my = a.y + (b.y - a.y) * legFraction;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label="Route altitude profile and progress">
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1={padX} x2={W - padX} y1={padY + g * (H - padY * 2)} y2={padY + g * (H - padY * 2)} stroke="currentColor" className="text-line" />)}
      <defs><clipPath id="rp-clip"><rect x={0} y={0} width={progressX} height={H} /></clipPath></defs>
      <path d={path} fill="none" stroke="currentColor" className="text-line-2" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={accent} strokeWidth={2} clipPath="url(#rp-clip)" />
      {pts.slice(0, n).map((p, i) => (
        <g key={p.w.id}>
          <circle cx={p.x} cy={p.y} r={3} fill={i <= legIndex ? accent : 'currentColor'} className="text-line-2" />
          <text x={p.x} y={H - 1} textAnchor="middle" fontSize={9} fill="currentColor" className="text-ink-3">{p.w.id}</text>
        </g>
      ))}
      <circle cx={progressX} cy={my} r={4.5} fill={accent} stroke="white" strokeWidth={1.5} />
    </svg>
  );
};

/** TURN relay for video over LTE: stored on this device, used by the next WebRTC connect. */
const TurnSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<TurnConfig>(() => { try { return JSON.parse(localStorage.getItem(TURN_KEY) || 'null') ?? { url: '', username: '', credential: '' }; } catch { return { url: '', username: '', credential: '' }; } });
  const save = (n: TurnConfig) => { setT(n); try { localStorage.setItem(TURN_KEY, JSON.stringify(n)); } catch { /* private mode */ } };
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink">{t.url ? 'TURN relay set (for LTE)' : 'Over LTE? Add a TURN relay'}</button>
      {open && (
        <div className="mt-1.5 grid gap-1.5">
          <input value={t.url} onChange={e => save({ ...t, url: e.target.value.trim() })} placeholder="turn:turn.example.com:3478" aria-label="TURN server" className="rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink num" />
          <div className="flex gap-1.5">
            <input value={t.username} onChange={e => save({ ...t, username: e.target.value })} placeholder="username" aria-label="TURN username" className="flex-1 min-w-0 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink" />
            <input type="password" value={t.credential} onChange={e => save({ ...t, credential: e.target.value })} placeholder="password" aria-label="TURN password" className="flex-1 min-w-0 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink" />
          </div>
          <p className="text-[11px] text-ink-3">Use the same server on the aircraft: <span className="num">stream.py --ice turn:… --turn-user … --turn-pass …</span></p>
        </div>
      )}
    </div>
  );
};
