import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Home, Upload, Download, RefreshCw, Minus, Plus, Map as MapIcon, Box, Maximize2, RotateCcw,
} from 'lucide-react';
import { SurveySitePanel } from '../components/survey/SurveySitePanel';
import { SurveyFlightPanel } from '../components/survey/SurveyFlightPanel';
import { useSurveyFlight } from '../components/survey/useSurveyFlight';
import { usesDemoGeometry } from '../survey/boundary';
import { SurveyResultsViewer, type Measured, type ResultsLayer, type Tool } from '../components/survey/SurveyResultsViewer';
import { SurveyResultsPanel } from '../components/survey/SurveyResultsPanel';
import { measureArea, measureLine, type Annotation } from '../survey/measure';
import { demoMeasurements } from '../survey/demoMeasurements';
import { surfaceAt, SITE_DATUM_M } from '../survey/site';
import { polygonArea as areaOf } from '../survey/plan';
import { useSurveyMission, type Phase } from '../hooks/useSurveyMission';
import { SurveyScanCanvas3D, type SurveyLayer } from '../components/survey/SurveyScanCanvas3D';
import { SurveyMapCanvas } from '../components/survey/SurveyMapCanvas';
import { SITE } from '../survey/site';
import { CAMERAS, GOOD_VIEWS, ORBIT_PHOTOS, toLatLon, fromLatLon, type CameraId, type Pattern, type Pt } from '../survey/plan';
import { downloadSurveyPackage } from '../survey/exportSurvey';
import { useAircraftLink } from '../link/useAircraftLink';
import { useRecorder, useRecordedEvents } from '../record/useRecorder';
import {
  Headline, Card, Section, Divider, Tabs, Stat, Row, Chip, Meter, Sparkline, ToolButton, IconButton, Segmented, Activity, HoldButton, formatClock, useAccentHex, type Tone,
} from './ui';

/**
 * Site survey: map and model a venue from the air.
 *
 * A client books this to get a measurable top-down map of their site, a 3D model,
 * or an inspection of one structure. The operator picks the product, the plan
 * follows from the camera maths, the aircraft flies it, and the dashboard shows
 * the map developing and flags any patch that needs a second pass before the
 * crew leaves the venue.
 */

const PATTERNS: Record<Pattern, { label: string; product: string; short: string; plain: string; technical: string; altitude: number }> = {
  GRID: { label: 'Map', product: 'Orthomosaic map', short: 'orthomosaic map', plain: 'One measurable top-down photo of the whole site — for layout planning, CAD overlays and permits.', technical: 'Nadir grid · camera straight down', altitude: 60 },
  DOUBLE_GRID: { label: '3D model', product: '3D site model', short: '3D site model', plain: 'Two crossing passes with the camera tilted, so walls and roofs are both seen — for 3D walkthroughs and volumes.', technical: 'Crosshatch grid · camera tilted 25°', altitude: 70 },
  ORBIT: { label: 'Inspection', product: 'Structure inspection', short: 'inspection of the main stage', plain: `Circles the ${SITE.structures.find(s => s.id === SITE.orbitTarget)?.label.toLowerCase()} with the camera locked on it — for rigging checks and insurer photos.`, technical: `Orbit · camera locked on target · 36 angles`, altitude: 40 },
};

const DELIVERABLES: Record<Pattern, { name: string; body: string; format: string }[]> = {
  GRID: [
    { name: 'Orthomosaic', body: 'The whole site as one measurable, north-up image.', format: 'GeoTIFF' },
    { name: 'Elevation model', body: 'Ground height everywhere, for drainage and level checks.', format: 'DSM GeoTIFF' },
    { name: 'Layout overlay', body: 'The map in Google Earth and CAD, for placing stages, tents and fencing.', format: 'KMZ · DXF' },
  ],
  DOUBLE_GRID: [
    { name: '3D textured model', body: 'Walk around the venue in a browser or VR headset.', format: 'OBJ · glTF' },
    { name: 'Point cloud', body: 'Millions of measured points for engineers and surveyors.', format: 'LAS' },
    { name: 'Orthomosaic', body: 'The top-down map, sharper for the extra overlap.', format: 'GeoTIFF' },
    { name: 'Volume report', body: 'Stockpiles, earthworks and fill, measured.', format: 'PDF' },
  ],
  ORBIT: [
    { name: 'Inspection photo set', body: 'Every face of the structure from 36 angles, time-stamped.', format: 'JPEG' },
    { name: '3D model of the structure', body: 'Measure clearances and rigging points on screen.', format: 'OBJ' },
    { name: 'Inspection report', body: 'Annotated photos for the rigger, the venue and the insurer.', format: 'PDF' },
  ],
};

const PHASE: Record<Phase, { label: string; tone: Tone; pulse?: boolean }> = {
  READY: { label: 'Ready to fly', tone: 'neutral' },
  TAKEOFF: { label: 'Taking off', tone: 'accent', pulse: true },
  TRANSIT: { label: 'On the way to the next line', tone: 'accent', pulse: true },
  CAPTURING: { label: 'Capturing', tone: 'ok', pulse: true },
  PAUSED: { label: 'Paused · holding position', tone: 'warn' },
  RETURNING: { label: 'Returning home', tone: 'warn', pulse: true },
  LANDING: { label: 'Landing', tone: 'accent', pulse: true },
  SWAP: { label: 'Battery swap', tone: 'warn' },
  HELD: { label: 'Landed · survey held', tone: 'warn' },
  COMPLETE: { label: 'Capture complete', tone: 'ok' },
};

type RailTab = 'SITE' | 'PLAN' | 'AIRCRAFT' | 'COVERAGE' | 'DELIVERABLES' | 'ACTIVITY';

export const SurveyDashboard: React.FC = () => {
  const sim = useSurveyMission();
  const { plan, phase, aircraft: ac, stats } = sim;
  const P = plan.params;
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = useAccentHex(rootRef, '#c2410c');
  const [rail, setRail] = useState<RailTab>('PLAN');
  const [hero, setHero] = useState<'3D' | 'MAP' | 'RESULTS'>('3D');
  // ---- results viewer: the processed model and the crew's measurements ----
  const [notes, setNotes] = useState<Annotation[]>(demoMeasurements);
  const [noteSel, setNoteSel] = useState<string | null>('m-pile');
  const [tool, setTool] = useState<Tool>(null);
  const [mDraft, setMDraft] = useState<Pt[]>([]);
  const [resLayer, setResLayer] = useState<ResultsLayer>('PHOTO');
  const [contours, setContours] = useState(false);
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const measured: Measured[] = useMemo(() => notes.map(a => {
    if (a.kind === 'LINE') return { a, line: measureLine(a.pts, surfaceAt, 0.5) };
    if (a.kind === 'AREA') return { a, area: measureArea(a.pts, surfaceAt, a.base ?? { kind: 'PLANE' }, Math.max(0.5, Math.sqrt(areaOf(a.pts)) / 220)) };
    return { a };
  }), [notes]);
  const selectNote = (id: string | null) => { setNoteSel(id); if (id) setFocus(f => ({ id, seq: (f?.seq ?? 0) + 1 })); };
  const finishDraft = () => {
    if (!tool || tool === 'POINT') return;
    const need = tool === 'AREA' ? 3 : 2; if (mDraft.length < need) return;
    const n = notes.filter(x => x.kind === tool).length + 1;
    const a: Annotation = { id: `m-${Date.now().toString(36)}`, name: tool === 'AREA' ? `Area ${n}` : `Line ${n}`, kind: tool, pts: mDraft, visible: true, ...(tool === 'AREA' ? { base: { kind: 'PLANE' as const }, density: 1.6 } : {}) };
    setNotes(ns => [...ns, a]); setMDraft([]); setTool(null); setNoteSel(a.id);
  };
  const pickPoint = (p: Pt) => {
    if (tool === 'POINT') { const n = notes.filter(x => x.kind === 'POINT').length + 1; const a: Annotation = { id: `m-${Date.now().toString(36)}`, name: `Spot height ${n}`, kind: 'POINT', pts: [p], visible: true }; setNotes(ns => [...ns, a]); setNoteSel(a.id); setTool(null); return; }
    setMDraft(d => [...d, p]);
  };
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTool(null); setMDraft([]); } else if (e.key === 'Enter') finishDraft(); else if (e.key === 'Backspace' && (e.target as HTMLElement).tagName !== 'INPUT') setMDraft(d => d.slice(0, -1)); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const exportMeasurements = () => {
    const features = measured.map(({ a, line, area }) => {
      const ll = a.pts.map(p => { const q = toLatLon(sim.origin, p); return [+q.lon.toFixed(7), +q.lat.toFixed(7)]; });
      const geometry = a.kind === 'AREA' ? { type: 'Polygon', coordinates: [[...ll, ll[0]]] } : a.kind === 'LINE' ? { type: 'LineString', coordinates: ll } : { type: 'Point', coordinates: ll[0] };
      const props: Record<string, unknown> = { name: a.name, kind: a.kind, datum: `elevations above sea level (site datum ${SITE_DATUM_M} m)` };
      if (area) Object.assign(props, { base: a.base?.kind, cut_m3: +area.cutM3.toFixed(1), fill_m3: +area.fillM3.toFixed(1), net_m3: +area.netM3.toFixed(1), density_t_m3: a.density, net_t: +(area.netM3 * (a.density ?? 1.6)).toFixed(1), area_m2: +area.horizontalM2.toFixed(1), surface_m2: +area.surfaceM2.toFixed(1), elev_max_m: +(area.elevMax + SITE_DATUM_M).toFixed(2), elev_min_m: +(area.elevMin + SITE_DATUM_M).toFixed(2) });
      if (line) Object.assign(props, { length_m: +line.surfaceM.toFixed(2), horizontal_m: +line.horizontalM.toFixed(2), grade_avg_pct: +line.gradeAvgPct.toFixed(2), grade_max_pct: +line.gradeMaxPct.toFixed(2), grade_min_pct: +line.gradeMinPct.toFixed(2), limit_pct: a.limitPct, segment_grades_pct: line.segments.map(g => +g.gradePct.toFixed(2)) });
      if (a.kind === 'POINT') props.elevation_m = +(surfaceAt(a.pts[0].x, a.pts[0].y) + SITE_DATUM_M).toFixed(2);
      return { type: 'Feature', geometry, properties: props };
    });
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], { type: 'application/geo+json' });
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = `${sim.site.name.replace(/[^\w-]+/g, '_')}_measurements.geojson`; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 5000);
  };
  const [layer, setLayer] = useState<SurveyLayer>('MODEL');
  const onGround = phase === 'READY' || phase === 'COMPLETE';
  const flying = !onGround && phase !== 'HELD' && phase !== 'SWAP';

  // Real aircraft: telemetry drives the map; the plan uploads as a MAVLink mission.
  const link = useAircraftLink();
  useEffect(() => { if (link.live) sim.applyLive(link.telemetry); }, [link.telemetry]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!link.live) sim.releaseLive(); }, [link.live]); // eslint-disable-line react-hooks/exhaustive-deps
  const connected = link.status === 'CONNECTED';
  const flight = useSurveyFlight(sim, link, plan);
  const [draft, setDraft] = useState<Pt[]>([]);
  // Connecting an aircraft opens its checklist; the demo venue's 3D model is not a real site's, so real sites fly on the plan view.
  useEffect(() => { if (link.live) setRail('AIRCRAFT'); else setRail(r => (r === 'AIRCRAFT' ? 'PLAN' : r)); }, [link.live]);
  const demoGeo = usesDemoGeometry(sim.site);
  useEffect(() => { if (!demoGeo) setHero('MAP'); }, [demoGeo]);
  useEffect(() => { if (sim.boundaryEdit.mode !== 'OFF') setHero('MAP'); }, [sim.boundaryEdit.mode]); // editing happens on the full-size map
  // Boundary edits keep the origin, so the map stays mounted (and in its view) while the outline changes.
  const siteKey = `${sim.site.origin.lat},${sim.site.origin.lon},${sim.site.kind}`;
  const exportPackage = () => downloadSurveyPackage(plan, sim.photosRef.current ?? [], sim.grid, sim.site, sim.camera, link.autopilot === 'PX4' ? 'PX4' : 'ARDUPILOT');

  // Flight record: one session per survey, 1 Hz, with the event log mirrored in.
  const linkSource = connected ? link.transport : 'SIMULATION';
  useRecorder('SURVEY', `Survey · ${sim.site.name}`, linkSource, () => {
    if (ac.altM <= 0.2 && onGround) return [];
    const ll = toLatLon(sim.origin, ac);
    return [{ t: Date.now(), aircraft: 'MAP-1', lat: ll.lat, lon: ll.lon, altM: ac.altM, speedMps: ac.speedMps, headingDeg: ac.headingDeg, batteryPct: ac.battery,
      extra: { phase, pattern: P.pattern, photos: sim.photoCount, rejected: sim.rejected, coveredPct: Math.round(stats.coveredPct), vibrationG: +ac.vibrationG.toFixed(2), windMps: +ac.windMps.toFixed(1) } }];
  });
  useRecordedEvents(sim.events, 'SURVEY');

  const accepted = sim.photoCount - sim.rejected;
  const orbit = P.pattern === 'ORBIT';
  const angles = Math.min(accepted, ORBIT_PHOTOS);
  const captureDone = phase === 'COMPLETE' && (orbit ? angles >= ORBIT_PHOTOS - 2 : stats.goodPct > 95 || sim.weakPatches === 0);
  const progressLabel = orbit ? `${angles} of ${ORBIT_PHOTOS} angles` : `${stats.coveredPct.toFixed(0)}% photographed`;
  const photos = sim.photosRef.current ?? [];
  const blur = photos.filter(p => p.reason === 'Blur').length, exposure = photos.filter(p => p.reason === 'Exposure').length;
  const battTone: Tone = ac.battery > 40 ? 'ok' : ac.battery > 27 ? 'warn' : 'bad';
  const lineLabel = P.pattern === 'ORBIT' ? 'orbit' : `line ${sim.currentLine ?? '—'} of ${plan.lines.length}`;
  const leg = sim.legs[Math.min(sim.legIndex, sim.legs.length - 1)];
  const transitLabel = !leg || leg.line === -1 ? 'Heading home' : sim.legIndex === 0 ? (orbit ? 'Heading to the orbit' : 'Heading to the first line') : 'On the way to the next line';
  const status = sim.live
    ? { ...PHASE[phase], label: `Live · ${phase === 'CAPTURING' ? `Capturing · ${sim.isRefly ? 'weak patches' : lineLabel}` : phase === 'READY' ? link.deviceName : PHASE[phase].label}`, pulse: phase !== 'READY' && phase !== 'COMPLETE' && phase !== 'HELD' }
    : phase === 'CAPTURING' ? { label: `Capturing · ${sim.isRefly ? 'weak patches' : lineLabel}`, tone: 'ok' as Tone, pulse: true }
    : phase === 'TRANSIT' ? { ...PHASE.TRANSIT, label: transitLabel } : PHASE[phase];

  const setPattern = (p: Pattern) => sim.setParams({ pattern: p, altitudeM: PATTERNS[p].altitude });
  const stage = (
    <SurveyScanCanvas3D plan={plan} legs={sim.legs} legIndex={sim.legIndex} legProgressM={sim.legProgressM} aircraft={ac}
      photosRef={sim.photosRef} photoCount={sim.photoCount} grid={sim.grid} gridVersion={sim.gridVersion} phase={phase}
      layer={layer} onLayerChange={setLayer} coveredPct={stats.coveredPct} progressLabel={progressLabel} compact={hero !== '3D'}
      lines={orbit ? { done: angles, total: ORBIT_PHOTOS, current: null, angles } : { done: sim.linesDone, total: plan.lines.length, current: phase === 'CAPTURING' || phase === 'TRANSIT' ? sim.currentLine : null }} />
  );
  const map = (
    <SurveyMapCanvas key={siteKey} site={sim.site} fence={flight.fence} draft={draft} plan={plan} legs={sim.legs} legIndex={sim.legIndex} aircraft={ac} photosRef={sim.photosRef} grid={sim.grid} gridVersion={sim.gridVersion} layer={layer} compact={hero !== 'MAP'}
      edit={sim.boundaryEdit} terrain={sim.terrain} clearance={flight.clearance} />
  );
  const HERO = 'absolute inset-0';
  const PIP = 'hidden md:block absolute bottom-3 right-3 w-[26%] min-w-[190px] aspect-video rounded-lg overflow-hidden border border-white/25 shadow-xl bg-imagery z-10';

  // Primary action by phase. On a live link: upload (or resume) → hold to start → hold/continue in the air.
  const resumeLine = flight.resumePoint ? flight.resumePoint.line + 1 : null;
  const reflyLabel = sim.weakPatches ? `Re-fly ${sim.weakPatches} weak patch${sim.weakPatches > 1 ? 'es' : ''}` : 'Re-fly weak patches';
  const livePrimary: React.ReactNode = !sim.live ? null
    : flight.upload.state === 'UPLOADING'
      ? <ToolButton primary icon={<Upload />} label={`Uploading ${link.missionUpload.sent}/${link.missionUpload.total}`} disabled />
    : !flight.onGround ? null
    : flight.armable
      ? <HoldButton id="sv-primary" icon={<Play />} label={flight.start.state === 'STARTING' ? 'Starting…' : flight.upload.kind === 'RESUME' ? 'Resume survey' : flight.upload.kind === 'REFLY' ? 'Start re-fly' : 'Start survey'} disabled={flight.start.state === 'STARTING' || !flight.gateOk} onFire={flight.begin} title="Arms the aircraft and starts the mission" />
    : resumeLine
      ? <ToolButton command="fly" id="sv-primary" primary icon={<Upload />} label={`Upload resume · line ${resumeLine}`} disabled={!flight.gateOk} onClick={flight.uploadResume} title="A new mission from the point the survey stopped: take off, fly back, carry on" />
    : phase === 'COMPLETE' && sim.weakPatches && !orbit
      ? <ToolButton command="fly" id="sv-primary" primary icon={<RefreshCw />} label={reflyLabel} disabled={!flight.gateOk} onClick={flight.uploadRefly} title="Short extra passes over every patch seen by fewer than five photos" />
    : phase === 'COMPLETE'
      // A new mission clears this capture's coverage and photo list: a hold, not a click, so the package is exported first.
      ? <HoldButton id="sv-primary" icon={<Upload />} label="Upload to fly again" hint="Hold · clears this capture" disabled={!flight.gateOk} onFire={flight.uploadMission} title="A new mission from the first line. Clears this capture's coverage and photo list: export the package first" />
      : <ToolButton command="fly" id="sv-primary" primary icon={<Upload />} label="Upload mission" disabled={!flight.gateOk} onClick={flight.uploadMission} title={flight.gateOk ? 'Geofence and survey mission to the aircraft' : 'See the checklist in the Aircraft tab'} />;
  const primary = sim.live
    ? { label: '', icon: null, onClick: () => {} }
    : phase === 'READY' ? { label: 'Start survey', icon: <Play />, onClick: sim.start }
    : phase === 'COMPLETE' ? { label: 'Fly again', icon: <Play />, onClick: sim.start }
    : phase === 'HELD' ? { label: 'Resume survey', icon: <Play />, onClick: sim.start }
    : phase === 'PAUSED' ? { label: 'Resume', icon: <Play />, onClick: sim.pause }
    : phase === 'CAPTURING' || phase === 'TRANSIT' ? { label: 'Pause', icon: <Pause />, onClick: sim.pause }
    : { label: PHASE[phase].label, icon: <Pause />, onClick: () => {}, disabled: true };

  return (
    <div ref={rootRef} data-accent="survey" id="survey-dashboard" className="space-y-5">
      <Headline
        title="Site survey"
        context={`${sim.site.name} · ${(plan.areaM2 / 10000).toFixed(1)} ha · ${PATTERNS[P.pattern].short} at ${P.altitudeM} m`}
        status={status}
        stats={[
          orbit
            ? { label: 'Angles captured', value: `${angles} / ${ORBIT_PHOTOS}`, tone: phase === 'COMPLETE' ? (captureDone ? 'ok' : 'warn') : 'neutral' }
            : { label: 'Photographed', value: `${stats.coveredPct.toFixed(0)}%`, tone: phase === 'COMPLETE' ? (captureDone ? 'ok' : 'warn') : 'neutral' },
          { label: 'Photos', value: onGround && !sim.photoCount ? `~${plan.photosEst}` : accepted },
          { label: 'Ground detail', value: `${plan.gsdCm.toFixed(1)} cm/px` },
          { label: phase === 'READY' ? 'Flight time' : 'Time left', value: formatClock(sim.remainingS) },
        ]}
        actions={
          <div className={phase !== 'READY' ? 'opacity-50 pointer-events-none' : ''} title={phase === 'COMPLETE' ? 'Start a new survey to change the plan' : phase !== 'READY' ? 'Change the plan after landing' : undefined}>
            <Segmented size="sm" value={P.pattern} onChange={setPattern} items={[
              { id: 'GRID', label: <><MapIcon className="w-3 h-3" />Map</>, title: PATTERNS.GRID.product },
              { id: 'DOUBLE_GRID', label: <><Box className="w-3 h-3" />3D model</>, title: PATTERNS.DOUBLE_GRID.product },
              { id: 'ORBIT', label: <><RefreshCw className="w-3 h-3" />Inspection</>, title: PATTERNS.ORBIT.product },
            ]} />
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
        {/* ---------------- Stage ---------------- */}
        <div className="space-y-3 min-w-0">
          <div className="relative rounded-[var(--radius-card)] overflow-hidden bg-imagery border border-line" style={{ aspectRatio: '16 / 9' }}>
            {hero === 'RESULTS' && demoGeo ? (
              <SurveyResultsViewer items={measured} selectedId={noteSel} onSelect={selectNote} layer={resLayer} contours={contours} tool={tool} draft={mDraft}
                onPick={pickPoint} onFinish={finishDraft} origin={sim.origin} focus={focus} />
            ) : <>
            {demoGeo && <div className={hero === '3D' ? HERO : PIP}>{stage}</div>}
            <div className={hero === 'MAP' || !demoGeo ? HERO : PIP}>{map}</div>
            {demoGeo && <button onClick={() => setHero(h => (h === '3D' ? 'MAP' : '3D'))} title={hero === '3D' ? 'Show the plan view full size' : 'Show the 3D view full size'}
              className="hidden md:block absolute bottom-3 right-3 w-[26%] min-w-[190px] aspect-video rounded-lg z-20 group">
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {hero === '3D' ? <><MapIcon className="w-3 h-3" />Plan view</> : <><Box className="w-3 h-3" />3D view</>}
              </span>
              <span className="absolute top-1.5 right-1.5 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-3 h-3" /></span>
            </button>}
            </>}
          </div>

          {/* Action bar */}
          <Card padded={false} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {demoGeo && (
                <>
                  <Segmented size="sm" value={hero === 'RESULTS' ? 'RESULTS' : 'FLIGHT'} onChange={v => { if (v === 'RESULTS') { setHero('RESULTS'); setRail('DELIVERABLES'); if (noteSel) setFocus(f => ({ id: noteSel, seq: (f?.seq ?? 0) + 1 })); } else { setHero('3D'); setTool(null); setMDraft([]); } }}
                    items={[{ id: 'FLIGHT', label: 'Flight', title: 'The capture: plan, aircraft and coverage' }, { id: 'RESULTS', label: 'Results', title: 'The processed model: measure volumes, grades and heights' }]} />
                  <span className="w-px h-6 bg-line mx-1" />
                </>
              )}
              {sim.live ? livePrimary : <ToolButton command="fly" id="sv-primary" primary icon={primary.icon} label={primary.label} onClick={primary.onClick} disabled={primary.disabled} />}
              {sim.live ? (
                !flight.onGround && <>
                  <ToolButton icon={<Pause />} label="Hold" onClick={() => link.setFlightMode('LOITER')} title="Hold position (Loiter)" />
                  <ToolButton command="fly" icon={<Play />} label="Continue" onClick={() => link.setFlightMode('AUTO')} title="Continue the mission (Auto)" />
                </>
              ) : orbit ? null : (
                <ToolButton icon={<RefreshCw />} label={sim.weakPatches && phase === 'COMPLETE' ? `Re-fly ${sim.weakPatches} weak patch${sim.weakPatches > 1 ? 'es' : ''}` : 'Re-fly weak patches'}
                  disabled={phase !== 'COMPLETE' || !sim.weakPatches} onClick={() => { sim.reflyGaps(); setRail('COVERAGE'); }}
                  title={phase === 'COMPLETE' ? 'Short extra passes over every patch seen by fewer than five photos' : 'Available after capture'} />
              )}
              {!sim.live && phase === 'COMPLETE' && <ToolButton icon={<RotateCcw />} label="New survey" onClick={sim.reset} title="Clear this capture and plan another" />}
              {!sim.live && (
                <>
                  <span className="w-px h-6 bg-line mx-1" />
                  <span className="text-[11px] text-ink-3">Simulation</span>
                  <Segmented size="sm" value={String(sim.simSpeed) as '1' | '4' | '16'} onChange={v => sim.setSimSpeed(Number(v))} items={[
                    { id: '1', label: '1×', title: 'Real time' }, { id: '4', label: '4×' }, { id: '16', label: '16×' },
                  ]} />
                </>
              )}
              <span className="ml-auto flex items-center gap-2">
                {connected && !sim.live && <span className="text-[11px] text-ink-3">Waiting for the autopilot's heartbeat…</span>}
                <ToolButton icon={<Download />} label="Export package" onClick={exportPackage} title="Mission plan with geofence, site KML, photo geotags and coverage, for QGroundControl, Google Earth / DJI Pilot 2 and WebODM / Pix4D / DroneDeploy" />
                <ToolButton command="abort" icon={<Home />} label="Return home" danger disabled={sim.live ? false : !flying || phase === 'RETURNING' || phase === 'LANDING'}
                  onClick={() => (sim.live ? link.returnToLaunch() : sim.returnHome())} />
              </span>
            </div>
          </Card>
        </div>

        {/* ---------------- Inspector rail ---------------- */}
        <Card className="xl:sticky xl:top-[72px]">
          <Tabs value={rail} onChange={setRail} items={[
            { id: 'SITE', label: 'Site' },
            { id: 'PLAN', label: 'Plan' },
            ...(link.live ? [{ id: 'AIRCRAFT' as const, label: 'Aircraft', badge: flight.gateOk ? undefined : flight.checks.filter(c => !c.ok && !c.advisory).length || undefined }] : []),
            { id: 'COVERAGE', label: 'Coverage', badge: phase === 'COMPLETE' && sim.weakPatches ? sim.weakPatches : undefined },
            { id: 'DELIVERABLES', label: 'Results' },
            { id: 'ACTIVITY', label: 'Log' },
          ]} />

          <div className="mt-4 rail-scroll max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            {rail === 'SITE' && <SurveySitePanel sim={sim} link={link} onDraft={setDraft} />}
            {rail === 'AIRCRAFT' && link.live && <SurveyFlightPanel flight={flight} link={link} />}
            {rail === 'PLAN' && (
              <div className="space-y-5">
                <div>
                  <div className="text-[15px] font-semibold text-ink">{PATTERNS[P.pattern].product}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{P.pattern === 'ORBIT' && !demoGeo ? 'Circles the structure at the orbit centre with the camera locked on it — for rigging checks and insurer photos.' : PATTERNS[P.pattern].plain}</p>
                  <p className="mt-1 text-[11px] text-ink-3">{PATTERNS[P.pattern].technical} · {sim.camera.name}</p>
                </div>

                <Section title="Flight" right={phase === 'READY' ? 'changes redraw the plan' : phase === 'COMPLETE' ? 'start a new survey to replan' : 'locked while flying'}>
                  <fieldset disabled={phase !== 'READY'} className="space-y-3 disabled:opacity-60">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-ink-2">Height</span>
                      <span className="flex items-center gap-2">
                        <IconButton icon={<Minus />} label="Lower" disabled={phase !== 'READY' || P.altitudeM <= 30} onClick={() => sim.setParams({ altitudeM: P.altitudeM - 5 })} />
                        <span className="num text-[13px] font-medium text-ink w-12 text-center">{P.altitudeM} m</span>
                        <IconButton icon={<Plus />} label="Higher" disabled={phase !== 'READY' || P.altitudeM >= 120} onClick={() => sim.setParams({ altitudeM: P.altitudeM + 5 })} />
                      </span>
                    </div>
                    <Slider label="Overlap along the line" value={Math.round(P.frontOverlap * 100)} min={60} max={90} step={5} unit="%" onChange={v => sim.setParams({ frontOverlap: v / 100 })} />
                    <Slider label="Overlap between lines" value={Math.round(P.sideOverlap * 100)} min={50} max={85} step={5} unit="%" onChange={v => sim.setParams({ sideOverlap: v / 100 })} />
                    <Slider label="Speed" value={P.speedMps} min={4} max={15} step={1} unit="m/s" onChange={v => sim.setParams({ speedMps: v })} />
                    {P.pattern === 'ORBIT' ? (
                      <>
                        <Slider label="Orbit radius" value={P.orbit.radiusM} min={25} max={80} step={5} unit="m" onChange={v => sim.setParams({ orbit: { ...P.orbit, radiusM: v } })} />
                        {!demoGeo && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] text-ink-2">Orbit centre</span>
                            <ToolButton size="sm" label="Aircraft's position" disabled={!link.live || link.telemetry.fixType < 3}
                              title={link.live ? 'Hover over (or stand the aircraft at) the structure, then press' : 'Connect the aircraft first'}
                              onClick={() => sim.setParams({ orbit: { ...P.orbit, center: fromLatLon(sim.origin, link.telemetry.lat, link.telemetry.lon) } })} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-ink-2">Line direction</span>
                        <Segmented size="sm" value={P.lineAngleDeg === 90 ? '90' : '0'} onChange={v => sim.setParams({ lineAngleDeg: Number(v) })} items={[{ id: '0', label: 'East–west' }, { id: '90', label: 'North–south' }]} />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-ink-2">Camera</span>
                      <select value={P.camera} onChange={e => sim.setParams({ camera: e.target.value as CameraId })} aria-label="Camera"
                        className="h-8 max-w-[190px] rounded-lg border border-line bg-surface px-2 text-[12px] text-ink">
                        {(Object.keys(CAMERAS) as CameraId[]).map(id => <option key={id} value={id}>{CAMERAS[id].name}</option>)}
                      </select>
                    </div>
                  </fieldset>
                </Section>

                <Divider />
                <Section title="What that gives you">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Stat size="sm" label="Ground detail" value={plan.gsdCm.toFixed(2)} unit="cm/px" hint={plan.gsdCm <= 2 ? 'measurement grade' : plan.gsdCm <= 3.5 ? 'planning grade' : 'overview only'} />
                    <Stat size="sm" label="One photo covers" value={`${plan.footprint.acrossM.toFixed(0)} × ${plan.footprint.alongM.toFixed(0)}`} unit="m" />
                    <Stat size="sm" label={P.pattern === 'ORBIT' ? 'Photos' : 'Flight lines'} value={P.pattern === 'ORBIT' ? plan.photosEst : plan.lines.length} hint={P.pattern === 'ORBIT' ? 'one every 10°' : `${plan.spacingM.toFixed(1)} m apart`} />
                    <Stat size="sm" label="Photo every" value={plan.triggerM.toFixed(1)} unit="m" hint={`${(plan.triggerM / plan.speedMps).toFixed(1)} s at ${plan.speedMps.toFixed(1)} m/s`} />
                    <Stat size="sm" label="Photos" value={`~${plan.photosEst}`} />
                    <Stat size="sm" label="Flight time" value={formatClock(plan.durationS)} hint={`${plan.batteries} ${plan.batteries > 1 ? 'batteries' : 'battery'}`} tone={plan.batteries > 1 ? 'warn' : 'neutral'} />
                  </div>
                  <ul className="mt-3 space-y-1.5 text-[12px]">
                    {plan.speedLimited && <li className="rounded-lg bg-warn-soft text-warn px-2.5 py-1.5">Speed held to {plan.speedMps.toFixed(1)} m/s so the camera can keep up ({CAMERAS[P.camera].minIntervalS} s between photos).</li>}
                    {plan.batteries > 1 && <li className="rounded-lg bg-surface-2 text-ink-2 px-2.5 py-1.5">Needs {plan.batteries} batteries. The aircraft lands at {27}%, swaps, and resumes from the same point.</li>}
                    {plan.gsdCm > 3.5 && <li className="rounded-lg bg-surface-2 text-ink-2 px-2.5 py-1.5">Coarser than 3.5 cm/px: fine for layout, not for measurements. Fly lower for detail.</li>}
                  </ul>
                </Section>
              </div>
            )}

            {rail === 'COVERAGE' && (
              <div className="space-y-5">
                {orbit ? (
                <Section title="Inspection" right="one photo every 10°">
                  <Stat size="lg" label="Angles captured" value={`${angles} / ${ORBIT_PHOTOS}`} tone={phase === 'COMPLETE' ? (captureDone ? 'ok' : 'warn') : 'neutral'} />
                  <Meter value={(angles / ORBIT_PHOTOS) * 100} tone={captureDone ? 'ok' : 'accent'} className="mt-2" />
                  <div className="mt-3">
                    <Row label="Photos taken" value={sim.photoCount} />
                    <Row label="Rejected" value={sim.rejected ? `${sim.rejected} · ${blur} blur${exposure ? `, ${exposure} exposure` : ''}` : '0'} tone={sim.rejected ? 'warn' : 'neutral'} />
                    <Row label="Orbit" value={`${P.orbit.radiusM} m radius · ${P.altitudeM} m up · camera ${plan.gimbalPitchDeg}°`} />
                  </div>
                  {phase === 'COMPLETE' && !captureDone && <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn">{ORBIT_PHOTOS - angles} angles missing. Fly again for a complete set.</div>}
                  {phase === 'COMPLETE' && captureDone && <div className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-[12px] text-ok">Every side of the structure is captured. Ready for the inspection report.</div>}
                </Section>
                ) : (
                <Section title="Coverage" right={`good = ${GOOD_VIEWS}+ photos per point`}>
                  <div className="flex items-end justify-between gap-3">
                    <Stat size="lg" label="Photographed" value={`${stats.coveredPct.toFixed(1)}%`} tone={phase === 'COMPLETE' ? (stats.goodPct > 95 ? 'ok' : 'warn') : 'neutral'} />
                    <div className="text-right text-[12px] text-ink-3 num">{(stats.covered * sim.grid.cellM ** 2 / 10000).toFixed(2)} of {(sim.grid.insideCount * sim.grid.cellM ** 2 / 10000).toFixed(2)} ha</div>
                  </div>
                  <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Good ${stats.goodPct.toFixed(0)}%, weak ${stats.marginalPct.toFixed(0)}%, not yet ${(100 - stats.coveredPct).toFixed(0)}%`}>
                    <div className="h-full bg-ok transition-[width] duration-300" style={{ width: `${stats.goodPct}%` }} />
                    <div className="h-full bg-warn transition-[width] duration-300" style={{ width: `${stats.marginalPct}%` }} />
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-ink-2">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ok" />Good <span className="num text-ink">{stats.goodPct.toFixed(0)}%</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn" />Weak <span className="num text-ink">{stats.marginalPct.toFixed(0)}%</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-line-2" />Not yet <span className="num text-ink">{(100 - stats.coveredPct).toFixed(0)}%</span></span>
                  </div>
                  <div className="mt-3">
                    <Row label="Photos taken" value={sim.photoCount} />
                    <Row label="Rejected" value={sim.rejected ? `${sim.rejected} · ${blur} blur${exposure ? `, ${exposure} exposure` : ''}` : '0'} tone={sim.rejected > sim.photoCount * 0.05 ? 'warn' : 'neutral'} />
                    {P.pattern !== 'ORBIT' && <Row label="Lines flown" value={`${sim.linesDone} of ${plan.lines.length}`} />}
                    <Row label="Batteries used" value={sim.batteriesUsed} />
                  </div>
                  {phase === 'COMPLETE' && sim.weakPatches > 0 && (
                    <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2.5">
                      <div className="text-[13px] font-medium text-warn">{sim.weakPatches} weak patch{sim.weakPatches > 1 ? 'es' : ''}</div>
                      <p className="mt-0.5 text-[12px] text-ink-2">Seen by fewer than {GOOD_VIEWS} photos, so the model may have holes there. Re-fly them before the crew leaves — it takes minutes now and a return trip later.</p>
                      <ToolButton size="sm" className="mt-2" icon={<RefreshCw />} label="Re-fly weak patches" onClick={() => (sim.live ? flight.uploadRefly() : sim.reflyGaps())} disabled={sim.live && (!flight.gateOk || !flight.onGround)} />
                    </div>
                  )}
                  {phase === 'COMPLETE' && sim.weakPatches === 0 && <div className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-[12px] text-ok">Every point inside the boundary is seen by {GOOD_VIEWS} or more photos. Ready to process.</div>}
                  {!onGround && sim.weakPatches > 0 && <p className="mt-3 text-[12px] text-ink-3">{sim.weakPatches} thin patch{sim.weakPatches > 1 ? 'es' : ''} so far — the next lines usually fill them. Anything left is flagged at the end.</p>}
                </Section>
                )}

                <Section title="Capture conditions" right="why photos get rejected">
                  <Row label="Vibration" value={`${ac.vibrationG.toFixed(2)} g`} tone={ac.vibrationG > 0.6 ? 'warn' : 'neutral'} right={<span className="w-16 inline-block"><Sparkline data={ac.history.vibration} color={accent} height={16} /></span>} />
                  <Row label="Wind" value={`${ac.windMps.toFixed(1)} m/s`} tone={ac.windMps > 9 ? 'warn' : 'neutral'} right={<span className="w-16 inline-block"><Sparkline data={ac.history.wind} color={accent} height={16} /></span>} />
                  <Row label="Ground speed" value={`${ac.speedMps.toFixed(1)} m/s`} right={<span className="w-16 inline-block"><Sparkline data={ac.history.speed} color={accent} height={16} /></span>} />
                  <Row label="Height" value={`${ac.altM.toFixed(0)} m`} />
                  <Row label="Signal" value={`${ac.signalPct.toFixed(0)}%`} tone={ac.signalPct < 60 ? 'warn' : 'neutral'} />
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <Stat label="Battery" value={`${ac.battery.toFixed(0)}%`} tone={battTone} />
                    <div className="grid grid-cols-3 gap-3">
                      <Stat size="sm" label="Voltage" value={ac.voltageV.toFixed(1)} unit="V" />
                      <Stat size="sm" label="Current" value={ac.currentA.toFixed(1)} unit="A" />
                      <Stat size="sm" label="Temp" value={ac.tempC.toFixed(0)} unit="°C" />
                    </div>
                  </div>
                  <Meter value={ac.battery} tone={battTone} className="mt-2" />
                </Section>
              </div>
            )}

            {rail === 'DELIVERABLES' && hero === 'RESULTS' && demoGeo && (
              <SurveyResultsPanel items={measured} selectedId={noteSel} onSelect={selectNote} layer={resLayer} onLayer={setResLayer} contours={contours} onContours={setContours}
                tool={tool} onTool={t => { setTool(t); setMDraft([]); }} draftCount={mDraft.length} onFinish={finishDraft} onCancel={() => { setTool(null); setMDraft([]); }}
                onChange={a => setNotes(ns => ns.map(x => (x.id === a.id ? a : x)))} onDelete={id => { setNotes(ns => ns.filter(x => x.id !== id)); if (noteSel === id) setNoteSel(null); }}
                onExport={exportMeasurements} />
            )}
            {rail === 'DELIVERABLES' && !(hero === 'RESULTS' && demoGeo) && (
              <div className="space-y-5">
                {demoGeo ? (
                  <div className="rounded-lg border border-accent/30 bg-accent-soft p-3">
                    <div className="text-[13px] font-medium text-ink">Measure the processed model</div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">Stockpile volumes with cut and fill, route grades with a cross-section, spot heights, on the orthophoto or the elevation model.</p>
                    <ToolButton size="sm" primary className="mt-2" label="Open results" onClick={() => { setHero('RESULTS'); if (noteSel) setFocus(f => ({ id: noteSel, seq: (f?.seq ?? 0) + 1 })); }} />
                  </div>
                ) : (
                  <p className="rounded-lg border border-line p-3 text-[12px] leading-relaxed text-ink-3">Measurements run on the processed elevation model. For this site, process the photos (WebODM, Pix4D or DroneDeploy) and measure there; the demo venue shows the tools on its model.</p>
                )}
                <Section title="What the client receives" right={PATTERNS[P.pattern].product}>
                  <ul className="divide-y divide-line">
                    {DELIVERABLES[P.pattern].map(d => (
                      <li key={d.name} className="py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-ink">{d.name}</span>
                          <Chip tone={captureDone ? 'ok' : 'neutral'}>{phase === 'COMPLETE' ? 'Ready to process' : 'After capture'}</Chip>
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-2">{d.body}</p>
                        <p className="mt-0.5 text-[11px] text-ink-3">{d.format}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Divider />
                <Section title="Survey package">
                  <p className="text-[12px] leading-relaxed text-ink-2">
                    The photos stay on the aircraft's SD card. The package tells the processing software where each one was taken, which to skip, and how well every point was covered.
                  </p>
                  <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
                    <li><span className="num text-ink">mission.plan</span> · QGroundControl, to re-fly or edit</li>
                    <li><span className="num text-ink">mission.waypoints</span> · Mission Planner</li>
                    <li><span className="num text-ink">geotags.csv</span>, <span className="num text-ink">geo.txt</span> · Pix4D, WebODM</li>
                    <li><span className="num text-ink">coverage.csv</span> · the quality map, per 5 m</li>
                  </ul>
                  <ToolButton className="mt-3" icon={<Download />} label={`Export package${sim.photoCount ? ` · ${accepted} photos` : ' · plan only'}`} onClick={exportPackage} />
                  <p className="mt-2 text-[11px] text-ink-3">Process in WebODM (free, self-hosted), Pix4D, DroneDeploy or Metashape. Processing a site this size takes 1–3 hours.</p>
                </Section>
              </div>
            )}

            {rail === 'ACTIVITY' && (
              <Section title="Activity" right={`${sim.events.length} events`}>
                <Activity empty="Nothing yet. Start the survey." items={sim.events.map(e => ({ id: e.id, ts: e.ts, text: e.text, tone: e.severity === 'CRITICAL' ? 'bad' : e.severity === 'WARNING' ? 'warn' : e.severity === 'SUCCESS' ? 'ok' : 'neutral' }))} />
              </Section>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }> = ({ label, value, min, max, step, unit, onChange }) => (
  <label className="block">
    <span className="flex items-center justify-between text-[13px]">
      <span className="text-ink-2">{label}</span>
      <span className="num font-medium text-ink">{value}{unit === '%' ? '%' : ` ${unit}`}</span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1 w-full" />
  </label>
);
