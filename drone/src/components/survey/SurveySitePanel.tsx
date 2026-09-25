import React, { useRef, useState } from 'react';
import { FileUp, MapPin, Undo2, Check, RotateCcw, TriangleAlert, FlaskConical } from 'lucide-react';
import { Section, ToolButton, Chip, Row } from '../../dashboards/ui';
import { readBoundaryFile, checkBoundary, siteFromRing, benchSite, DEMO_SITE, type LatLon } from '../../survey/boundary';
import { polygonArea, fromLatLon, type Pt } from '../../survey/plan';
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
  DEMO: { label: 'Demo venue', tone: 'neutral' }, BENCH: { label: 'Bench test', tone: 'warn' }, IMPORTED: { label: 'Imported', tone: 'ok' }, WALKED: { label: 'Walked', tone: 'ok' },
};

export const SurveySitePanel: React.FC<{ sim: ReturnType<typeof useSurveyMission>; link: ReturnType<typeof useAircraftLink>; onDraft: (pts: Pt[]) => void }> = ({ sim, link, onDraft }) => {
  const site = sim.site;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });
  const [corners, setCorners] = useState<LatLon[]>([]);
  const editable = sim.phase === 'READY' || sim.phase === 'COMPLETE' || sim.phase === 'HELD';
  const t = link.telemetry;

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
