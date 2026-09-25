import React, { useRef, useState, useSyncExternalStore } from 'react';
import { FileUp, MapPin, Undo2, Redo2, Check, RotateCcw, TriangleAlert, FlaskConical, Pencil, PenLine, Trash2, RefreshCw } from 'lucide-react';
import { Section, ToolButton, Chip, Row, Toggle, Segmented } from '../../dashboards/ui';
import { readBoundaryFile, checkBoundary, siteFromRing, benchSite, deleteCorner, usesDemoGeometry, DEMO_SITE, type LatLon } from '../../survey/boundary';
import { polygonArea, fromLatLon, followTolerance, type Pt } from '../../survey/plan';
import { BASEMAPS, basemapSettings, setBasemap, subscribeBasemap, activeBasemap, providerKey, type BasemapId } from '../../survey/tiles';
import type { useSurveyMission } from '../../hooks/useSurveyMission';
import type { useAircraftLink } from '../../link/useAircraftLink';

/**
 * Where the survey flies. A real job needs the real boundary: import the outline
 * the client or the planner already has (KML/KMZ from Google Earth or DJI Pilot 2,
 * GeoJSON, or a list of coordinates), or walk the aircraft to each corner and mark
 * it. The demo venue stays for demonstrations and, placed around a connected
 * aircraft, for bench tests.
 */

const KIND: Record<string, { label: string; tone: 'accent' | 'ok' | 'warn' | 'neutral' }> = {
  DEMO: { label: 'Demo venue', tone: 'neutral' }, BENCH: { label: 'Bench test', tone: 'warn' }, IMPORTED: { label: 'Imported', tone: 'ok' }, WALKED: { label: 'Walked', tone: 'ok' }, DRAWN: { label: 'Drawn', tone: 'ok' },
};
const FIELD = 'h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink placeholder:text-ink-3';

export const SurveySitePanel: React.FC<{ sim: ReturnType<typeof useSurveyMission>; link: ReturnType<typeof useAircraftLink>; onDraft: (pts: Pt[]) => void }> = ({ sim, link, onDraft }) => {
  const site = sim.site;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });
  const [corners, setCorners] = useState<LatLon[]>([]);
  const editable = sim.phase === 'READY' || sim.phase === 'COMPLETE' || sim.phase === 'HELD';
  const t = link.telemetry;
  const ed = sim.boundaryEdit, tr = sim.terrain, real = !usesDemoGeometry(site);
  const bm = useSyncExternalStore(subscribeBasemap, basemapSettings), act = activeBasemap(bm);
  const agl = sim.params.altitudeM, px4 = link.autopilot === 'PX4';

  const adopt = (name: string, ring: LatLon[], kind: 'IMPORTED' | 'WALKED') => {
    const c = checkBoundary(ring);
    setMsg({ errors: c.errors, warnings: c.warnings });
    if (c.errors.length) return;
    sim.setSite(siteFromRing(name, ring, kind));
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { const { name, ring } = await readBoundaryFile(f); adopt(name, ring, 'IMPORTED'); }
    catch (e) { setMsg({ errors: [e instanceof Error ? e.message : String(e)], warnings: [] }); }
    if (file.current) file.current.value = '';
  };
  const draft = (ring: LatLon[]) => { setCorners(ring); onDraft(ring.map(p => fromLatLon(site.origin, p.lat, p.lon))); };

  return (
    <div className="space-y-5">
      <Section title="Survey site" right={<Chip tone={KIND[site.kind].tone}>{KIND[site.kind].label}</Chip>}>
        <div className="text-[15px] font-semibold text-ink">{site.name}</div>
        <div className="mt-2 space-y-1.5">
          <Row label="Area" value={`${(polygonArea(site.boundary) / 10000).toFixed(2)} ha`} />
          <Row label="Corners" value={site.boundary.length} />
          <Row label="Centre" value={<span className="num text-[12px]">{site.origin.lat.toFixed(5)}, {site.origin.lon.toFixed(5)}</span>} />
        </div>
        {site.kind === 'DEMO' && <p className="mt-2 text-[12px] leading-relaxed text-ink-3">The demo venue is for showing the product. Before a real flight, bring your site in below: the aircraft flies exactly this boundary.</p>}
        {site.kind === 'BENCH' && <p className="mt-2 text-[12px] leading-relaxed text-warn">Bench test: the demo venue's shape placed around the aircraft's home. For a simulator or a props-off bench; not a real site.</p>}
      </Section>

      <Section title="Edit on the map" right={ed.mode === 'EDIT' ? 'editing' : ed.mode === 'DRAW' ? `drawing · ${ed.draw.length} corners` : undefined}>
        <p className="text-[12px] leading-relaxed text-ink-3">
          {ed.mode === 'DRAW' ? 'Click or tap the map for each corner in turn; the first corner (or Enter) closes it.'
            : 'Drag a corner to move it, click an edge\'s + to add one, select one and press Delete to remove it. With the map focused, [ and ] pick a corner and the arrow keys move it (Shift for 10 m). The plan and fence redraw when you let go.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {real && <ToolButton size="sm" icon={<Pencil />} label={ed.mode === 'EDIT' ? 'Done editing' : 'Edit boundary'} active={ed.mode === 'EDIT'} disabled={!editable} onClick={() => ed.setMode(ed.mode === 'EDIT' ? 'OFF' : 'EDIT')} />}
          <ToolButton size="sm" icon={<PenLine />} label={ed.mode === 'DRAW' ? 'Cancel drawing' : 'Draw a new boundary'} active={ed.mode === 'DRAW'} disabled={!editable} onClick={() => ed.setMode(ed.mode === 'DRAW' ? 'OFF' : 'DRAW')}
            title="Place a new outline on this map, corner by corner" />
          {ed.mode === 'DRAW' && <ToolButton size="sm" primary icon={<Check />} label="Use this boundary" disabled={ed.draw.length < 3} onClick={ed.finishDraw} />}
          {ed.mode === 'EDIT' && <>
            <ToolButton size="sm" icon={<Undo2 />} label="Undo" disabled={!ed.history.past.length} onClick={ed.undo} title="Ctrl/Cmd+Z" />
            <ToolButton size="sm" icon={<Redo2 />} label="Redo" disabled={!ed.history.future.length} onClick={ed.redo} title="Shift+Ctrl/Cmd+Z" />
            <ToolButton size="sm" icon={<Trash2 />} label={ed.selected !== null ? `Delete corner ${ed.selected + 1}` : 'Delete corner'} disabled={ed.selected === null || site.boundary.length <= 3}
              title={site.boundary.length <= 3 ? 'A boundary keeps at least three corners' : 'Select a corner on the map first'}
              onClick={() => { const i = ed.selected; if (i === null) return; const next = deleteCorner(site.boundary, i); if (next && ed.commit(next)) ed.select(Math.min(i, next.length - 1)); }} />
          </>}
        </div>
        {(ed.msg.errors.length > 0 || ed.msg.warnings.length > 0) && (
          <div role="status" className={`mt-2 rounded-lg border p-2 text-[12px] leading-relaxed ${ed.msg.errors.length ? 'border-bad/30 bg-bad/5 text-bad' : 'border-warn/30 bg-warn/5 text-warn'}`}>
            {[...ed.msg.errors, ...ed.msg.warnings].map(m => <div key={m} className="flex gap-1.5"><TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />{m}</div>)}
          </div>
        )}
      </Section>

      <Section title="Map under the plan" right={real ? (bm.on ? (act.provider ? act.provider.label : 'not set up') : 'off') : 'demo imagery'}>
        {!real ? <p className="text-[12px] leading-relaxed text-ink-3">The demo venue shows its own imagery. A real site draws map tiles under the plan.</p> : <>
          <Toggle on={bm.on} onChange={on => setBasemap({ on })} label="Show map tiles" description="Streets or satellite under the boundary and flight lines; the survey grid shows if they can't load." />
          <fieldset disabled={!bm.on} className="mt-2 space-y-2.5 disabled:opacity-50">
            <label className="block">
              <span className="text-[12px] text-ink-2">Source</span>
              <select value={bm.provider} onChange={e => setBasemap({ provider: e.target.value as BasemapId })} aria-label="Map source" className={`${FIELD} mt-1`}>
                <option value="OSM">OpenStreetMap (streets, no key)</option>
                <option value="MAPTILER_SAT">MapTiler satellite (your key)</option>
                <option value="MAPBOX_SAT">Mapbox satellite (your token)</option>
                <option value="CUSTOM">Custom tile URL</option>
              </select>
            </label>
            {(bm.provider === 'MAPTILER_SAT' || bm.provider === 'MAPBOX_SAT') && (() => {
              const P = BASEMAPS[bm.provider], mine = bm.provider === 'MAPTILER_SAT' ? bm.maptilerKey : bm.mapboxToken, built = !mine && !!providerKey(bm, P);
              return (
                <label className="block">
                  <span className="text-[12px] text-ink-2">{bm.provider === 'MAPTILER_SAT' ? 'MapTiler API key' : 'Mapbox access token'}</span>
                  <input type="password" autoComplete="off" spellCheck={false} value={mine} placeholder={built ? 'using the key built into this app' : bm.provider === 'MAPTILER_SAT' ? 'from cloud.maptiler.com' : 'pk.… from account.mapbox.com'}
                    onChange={e => setBasemap(bm.provider === 'MAPTILER_SAT' ? { maptilerKey: e.target.value.trim() } : { mapboxToken: e.target.value.trim() })} className={`${FIELD} mt-1 num`} />
                  <span className="mt-1 block text-[11px] text-ink-3">Kept in this browser only. Usage counts against your own account's plan.</span>
                </label>
              );
            })()}
            {bm.provider === 'CUSTOM' && <>
              <label className="block">
                <span className="text-[12px] text-ink-2">Tile URL template</span>
                <input value={bm.customUrl} spellCheck={false} placeholder="https://tiles.example.com/{z}/{x}/{y}.png" onChange={e => setBasemap({ customUrl: e.target.value })} className={`${FIELD} mt-1 num`} />
                <span className="mt-1 block text-[11px] text-ink-3">{'{z} {x} {y} (or {-y} for TMS), optional {s} and {key}. Only use tiles you are licensed to use.'}</span>
              </label>
              <label className="block">
                <span className="text-[12px] text-ink-2">Attribution</span>
                <input value={bm.customAttribution} placeholder="© the tile provider" onChange={e => setBasemap({ customAttribution: e.target.value })} className={`${FIELD} mt-1`} />
              </label>
            </>}
            <label className="block">
              <span className="flex items-center justify-between text-[12px]"><span className="text-ink-2">Opacity</span><span className="num text-ink">{Math.round(bm.opacity * 100)}%</span></span>
              <input type="range" min={20} max={100} step={5} value={Math.round(bm.opacity * 100)} onChange={e => setBasemap({ opacity: Number(e.target.value) / 100 })} className="mt-1 w-full" aria-label="Map opacity" />
            </label>
            {!act.provider && <p className="text-[12px] text-warn">{act.reason}</p>}
          </fieldset>
        </>}
      </Section>

      <Section title="Terrain" right={tr.state === 'LOADING' ? 'loading…' : tr.state === 'FAILED' ? 'unavailable' : tr.model?.label}>
        {tr.relief && Number.isFinite(tr.relief.range) ? (
          <div className="space-y-1">
            <Row label="Ground across the site" value={`${tr.relief.min.toFixed(0)}–${tr.relief.max.toFixed(0)} m`} />
            <Row label="Height change" value={`${tr.relief.range.toFixed(0)} m`} tone={tr.relief.range > followTolerance(agl) ? 'warn' : 'neutral'} />
          </div>
        ) : tr.state === 'FAILED' ? (
          <div className="flex items-center justify-between gap-2 text-[12px] text-warn">
            <span>Elevation unavailable: {tr.error}.</span>
            <ToolButton size="sm" icon={<RefreshCw />} label="Retry" onClick={tr.retry} />
          </div>
        ) : <p className="text-[12px] text-ink-3">Reading the ground heights round the site…</p>}
        <div className="mt-2">
          <Toggle on={tr.follow} onChange={on => tr.setFollow({ on })} label="Follow terrain"
            description={`Holds ${agl} m above the ground instead of above home, within ${followTolerance(agl).toFixed(0)} m. Photo spacing stays the same.`} />
        </div>
        {tr.follow && (
          <div className="mt-2 space-y-2">
            <Segmented size="sm" value={px4 ? 'PLANNED' : tr.method} onChange={m => tr.setFollow({ method: m })} items={[
              { id: 'PLANNED', label: 'Planned heights', title: 'Each waypoint at its height above home for the ground there, with extra waypoints where the ground bends' },
              ...(px4 ? [] : [{ id: 'AUTOPILOT' as const, label: 'Autopilot terrain', title: 'MAV_FRAME_GLOBAL_TERRAIN_ALT: ArduPilot follows its own terrain data' }]),
            ]} />
            <p className="text-[11px] leading-relaxed text-ink-3">
              {px4 ? 'PX4 missions have no terrain frame: the heights are planned here, with extra waypoints where the ground bends.'
                : tr.method === 'AUTOPILOT' ? 'Autopilot terrain (MAV_FRAME_GLOBAL_TERRAIN_ALT; needs TERRAIN_ENABLE and terrain data on the SD card). ArduPilot only.'
                : 'Each waypoint gets its height above home for the ground below it; lines are split where the ground bends by more than the tolerance.'}
            </p>
            {!tr.model && <p className="text-[12px] text-warn">Needs the terrain data before the mission can follow it.</p>}
          </div>
        )}
      </Section>

      <Section title="Import the boundary">
        <p className="text-[12px] leading-relaxed text-ink-3">KML or KMZ (Google Earth, DJI Pilot 2, a client's GIS), GeoJSON, or a list of corners as "lat, lon" per line.</p>
        <input ref={file} type="file" accept=".kml,.kmz,.geojson,.json,.csv,.txt,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        <ToolButton className="mt-2" icon={<FileUp />} label="Choose a file" disabled={!editable} onClick={() => file.current?.click()} title={editable ? undefined : 'Change the site after landing'} />
      </Section>

      <Section title="Walk the corners" right={link.live ? `${corners.length} marked` : 'needs the aircraft'}>
        <p className="text-[12px] leading-relaxed text-ink-3">Carry or fly the aircraft to each corner in turn and mark it. Its GPS position becomes the corner; three or more make a site.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ToolButton size="sm" icon={<MapPin />} label="Mark corner here" disabled={!link.live || !editable || t.fixType < 3}
            title={!link.live ? 'Connect the aircraft first' : t.fixType < 3 ? 'Waiting for a 3D GPS fix' : `Adds ${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}`}
            onClick={() => draft([...corners, { lat: t.lat, lon: t.lon }])} />
          <ToolButton size="sm" icon={<Undo2 />} label="Undo" disabled={!corners.length} onClick={() => draft(corners.slice(0, -1))} />
          <ToolButton size="sm" primary icon={<Check />} label="Use these corners" disabled={corners.length < 3 || !editable}
            onClick={() => { adopt(`Walked site ${new Date().toLocaleDateString()}`, corners, 'WALKED'); draft([]); }} />
        </div>
      </Section>

      {(msg.errors.length > 0 || msg.warnings.length > 0) && (
        <div role="status" className={`rounded-lg border p-3 text-[12px] leading-relaxed ${msg.errors.length ? 'border-bad/30 bg-bad/5 text-bad' : 'border-warn/30 bg-warn/5 text-warn'}`}>
          {[...msg.errors, ...msg.warnings].map(m => <div key={m} className="flex gap-1.5"><TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />{m}</div>)}
        </div>
      )}

      <Section title="Other sites">
        <div className="flex flex-wrap gap-2">
          {site.kind !== 'DEMO' && <ToolButton size="sm" icon={<RotateCcw />} label="Demo venue" disabled={!editable} onClick={() => sim.setSite(DEMO_SITE)} />}
          {link.live && site.kind === 'DEMO' && (
            <ToolButton size="sm" icon={<FlaskConical />} label="Bench test here" disabled={!editable || !(t.home ?? t.lat)}
              title="Place the demo venue's shape around the aircraft's home, to test the whole flow on a simulator or a props-off bench"
              onClick={() => sim.setSite(benchSite(t.home ?? { lat: t.lat, lon: t.lon }))} />
          )}
        </div>
      </Section>
    </div>
  );
};
