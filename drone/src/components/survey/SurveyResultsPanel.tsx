import React, { useMemo, useRef, useState } from 'react';
import { Spline, Pentagon, MapPin, Trash2, Eye, EyeOff, TriangleAlert, CircleCheck, Download, Table2, X, Check, FolderOpen, Cpu, Play, RotateCcw } from 'lucide-react';
import { Section, Segmented, Toggle, ToolButton, Row, Divider, Meter } from '../../dashboards/ui';
import { DENSITIES, type Annotation, type BaseKind, type LineMeasure } from '../../survey/measure';
import type { GeoOrigin, Pattern } from '../../survey/plan';
import { classifyFiles, loadProcessed, type ProcessedResults } from '../../survey/processed';
import { blobSource } from '../../survey/geotiff';
import { createTask, downloadAsset, nodeInfo, odmOptions, pickInputs, statusLabel, waitForTask, type NodeOdm } from '../../survey/nodeodm';
import { cancelJob, runJob, setJob, type ResultsSource, type ResultsSourceState } from '../../survey/resultsSource';
import type { Measured, ResultsLayer, Tool } from './SurveyResultsViewer';

/**
 * The rail beside the results model: where the results come from (the demo
 * model, processed GeoTIFFs, or a NodeODM task), layers, measuring tools, the list
 * of measurements, and the figures for the one selected — volumes with cut, fill,
 * net and tonnage; lines with grades, a limit check and a cross-section.
 */

interface Props {
  results: ResultsSourceState;
  /** The demo model exists only for the demo venue's geometry. */
  demoAvailable: boolean;
  siteOrigin: GeoOrigin; siteName: string;
  plan: { gsdCm: number; pattern: Pattern };
  /** The survey package's geo.txt for the photos this session captured, if any. */
  geoTxt: () => string | null;
  items: Measured[];
  selectedId: string | null; onSelect: (id: string | null) => void;
  layer: ResultsLayer; onLayer: (l: ResultsLayer) => void;
  contours: boolean; onContours: (v: boolean) => void;
  tool: Tool; onTool: (t: Tool) => void; draftCount: number; onFinish: () => void; onCancel: () => void;
  onChange: (a: Annotation) => void; onDelete: (id: string) => void;
  onExport: () => void;
}

const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const ICON = { LINE: <Spline />, AREA: <Pentagon />, POINT: <MapPin /> };
const TOOL_HELP: Record<Exclude<Tool, null>, string> = {
  LINE: 'Click the model along the route; double-click (or Finish) to end.',
  AREA: 'Click round the area; double-click (or Finish) to close it.',
  POINT: 'Click a point on the model.',
};

export const SurveyResultsPanel: React.FC<Props> = (p) => {
  const sel = p.items.find(i => i.a.id === p.selectedId) ?? null;
  const model = p.results.model, z = model?.zOffset ?? 0;
  const data = <DataSource {...p} />;
  if (!model) return <div className="space-y-5">{data}<Divider /><NodeOdmPanel {...p} /></div>;
  return (
    <div className="space-y-5">
      {data}
      {p.results.source === 'PROCESSED' && <NodeOdmPanel {...p} />}
      <Section title="Layers">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-ink-2">Surface</span>
          <Segmented size="sm" value={p.layer} onChange={p.onLayer} items={[{ id: 'PHOTO', label: 'Orthophoto' }, { id: 'ELEVATION', label: 'Elevation' }]} />
        </div>
        <div className="mt-2"><Toggle on={p.contours} onChange={p.onContours} label="Contours" description="Every 0.5 m, heavier every 2.5 m" /></div>
      </Section>

      <Section title="Measure" right={p.tool ? `${p.draftCount} point${p.draftCount === 1 ? '' : 's'}` : undefined}>
        <div className="flex flex-wrap gap-2">
          <ToolButton size="sm" icon={<Spline />} label="Distance & grade" active={p.tool === 'LINE'} onClick={() => p.onTool(p.tool === 'LINE' ? null : 'LINE')} />
          <ToolButton size="sm" icon={<Pentagon />} label="Area & volume" active={p.tool === 'AREA'} onClick={() => p.onTool(p.tool === 'AREA' ? null : 'AREA')} />
          <ToolButton size="sm" icon={<MapPin />} label="Spot height" active={p.tool === 'POINT'} onClick={() => p.onTool(p.tool === 'POINT' ? null : 'POINT')} />
        </div>
        {p.tool && (
          <div className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-[12px] text-ink-2">
            {TOOL_HELP[p.tool]}
            {p.tool !== 'POINT' && (
              <div className="mt-2 flex gap-2">
                <ToolButton size="sm" primary icon={<Check />} label="Finish" disabled={p.draftCount < (p.tool === 'AREA' ? 3 : 2)} onClick={p.onFinish} />
                <ToolButton size="sm" icon={<X />} label="Cancel" onClick={p.onCancel} />
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Measurements" right={<button type="button" onClick={p.onExport} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Download className="w-3 h-3" />GeoJSON</button>}>
        <ul className="-mx-2">
          {p.items.map(({ a }) => (
            <li key={a.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${a.id === p.selectedId ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
              <button type="button" aria-label={a.visible ? `Hide ${a.name}` : `Show ${a.name}`} onClick={() => p.onChange({ ...a, visible: !a.visible })} className="text-ink-3 hover:text-ink [&>svg]:w-3.5 [&>svg]:h-3.5">{a.visible ? <Eye /> : <EyeOff />}</button>
              <button type="button" onClick={() => p.onSelect(a.id === p.selectedId ? null : a.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <span className="text-ink-3 [&>svg]:w-3.5 [&>svg]:h-3.5">{ICON[a.kind]}</span>
                <span className="truncate text-[13px] text-ink">{a.name}</span>
              </button>
              <button type="button" aria-label={`Delete ${a.name}`} onClick={() => p.onDelete(a.id)} className="text-ink-3 hover:text-bad [&>svg]:w-3.5 [&>svg]:h-3.5"><Trash2 /></button>
            </li>
          ))}
          {!p.items.length && <li className="px-2 py-1.5 text-[12px] text-ink-3">No measurements yet.</li>}
        </ul>
      </Section>

      {sel && <><Divider /><Details key={sel.a.id} m={sel} onChange={p.onChange} z={z} /></>}
    </div>
  );
};

// ---- where the results come from -------------------------------------------------------

const mb = (b: number) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0);
const res = (m: number) => (m < 1 ? `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm/px` : `${m.toFixed(1)} m/px`);

const DataSource: React.FC<Props> = (p) => {
  const r = p.results, job = r.job, pr = r.processed;
  const fileRef = useRef<HTMLInputElement>(null);
  const openFiles = (files: File[]) => runJob('Opening the files', async (_signal, progress) => {
    const { dsm, ortho, problems } = await classifyFiles(files);
    if (!dsm) throw new Error(problems[0] ?? 'No elevation model among these files: pick the DSM GeoTIFF too (dsm.tif in WebODM\'s download).');
    return loadProcessed({ dsm: blobSource(dsm), ortho: ortho ? blobSource(ortho) : null, name: [dsm, ortho].filter(Boolean).map(f => (f as File).name).join(' + ') }, p.siteOrigin, { onProgress: progress });
  });
  const loadSample = () => runJob('Downloading the sample', async (signal, progress) => {
    const get = async (n: string) => { const q = await fetch(`${import.meta.env.BASE_URL}demo/processed/${n}`, { signal }); if (!q.ok) throw new Error(`Could not load the sample ${n} (${q.status}).`); return q.blob(); };
    const [dsm, ortho] = await Promise.all([get('dsm.tif'), get('orthophoto.tif')]);
    return loadProcessed({ dsm: blobSource(dsm), ortho: blobSource(ortho), name: 'Sample: festival grounds, as processed (UTM 11N)' }, p.siteOrigin, { onProgress: progress });
  });
  const pickers = (
    <div className="mt-2 flex flex-wrap gap-2">
      <ToolButton size="sm" primary={!pr} icon={<FolderOpen />} label={pr ? 'Open other results' : 'Open DSM + orthophoto'} disabled={job.busy} onClick={() => fileRef.current?.click()}
        title="GeoTIFFs from WebODM / OpenDroneMap (dsm.tif, odm_orthophoto.tif), Pix4D, DroneDeploy or Metashape: WGS 84, UTM or Web Mercator" />
      <ToolButton size="sm" label="Load sample processed results" disabled={job.busy} onClick={loadSample} title="The demo venue as a processor delivers it: a DSM and orthophoto GeoTIFF in UTM zone 11N" />
      <input ref={fileRef} type="file" multiple accept=".tif,.tiff,image/tiff" className="hidden" aria-label="Processed results GeoTIFFs"
        onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) openFiles(f); }} />
    </div>
  );
  return (
    <Section title="Data" right={r.source === 'DEMO' ? 'Demo' : pr ? 'Processed' : undefined}>
      {p.demoAvailable && (
        <Segmented size="sm" value={r.source} onChange={(s: ResultsSource) => r.setSource(s)} items={[
          { id: 'DEMO', label: 'Demo site model', title: 'The demo venue\'s built-in model' },
          { id: 'PROCESSED', label: 'Processed results', title: 'A DSM and orthophoto from the processing software, or a NodeODM task' },
        ]} />
      )}
      {r.source === 'DEMO' ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">The demo venue's built-in model. A real survey measures the DSM and orthophoto the processing software makes: load the sample to see that path.</p>
      ) : pr ? <ProcessedInfo pr={pr} /> : (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">Open the DSM (elevation) and orthophoto GeoTIFFs the processing software made, or process the photos on a NodeODM node below. Everything is read in this browser; nothing is uploaded.</p>
      )}
      {r.source === 'DEMO' ? (
        <ToolButton size="sm" className="mt-2" label="Load sample processed results" disabled={job.busy} onClick={loadSample} title="The demo venue as a processor delivers it: a DSM and orthophoto GeoTIFF in UTM zone 11N" />
      ) : pickers}
      {pr && r.source === 'PROCESSED' && <button type="button" onClick={r.clear} className="mt-2 text-[11px] text-ink-3 hover:text-bad hover:underline">Remove these results</button>}
      {job.busy && (
        <div className="mt-3" role="status">
          <div className="flex items-center justify-between gap-2 text-[12px] text-ink-2"><span className="truncate">{job.label}…</span>
            <button type="button" onClick={cancelJob} className="text-[11px] text-ink-3 hover:text-bad hover:underline">{job.task ? 'Cancel task' : 'Cancel'}</button></div>
          <Meter value={job.f === null ? 100 : Math.round(job.f * 100)} className={`mt-1 ${job.f === null ? 'animate-pulse' : ''}`} />
        </div>
      )}
      {job.error && (
        <div className="mt-3 flex items-start gap-1.5 text-[12px] text-bad" role="alert">
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="whitespace-pre-line break-words min-w-0">{job.error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setJob({ error: null })} className="ml-auto text-ink-3 hover:text-ink [&>svg]:w-3.5 [&>svg]:h-3.5"><X /></button>
        </div>
      )}
    </Section>
  );
};

const ProcessedInfo: React.FC<{ pr: ProcessedResults }> = ({ pr }) => {
  const d = pr.dem, o = pr.ortho;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-[13px] font-medium text-ink break-words">{pr.name}</div>
      <Row label="Elevation (DSM)" value={`${d.fileW.toLocaleString()} × ${d.fileH.toLocaleString()} · ${res(d.fileResM)}`} />
      {d.w < d.fileW && <Row label="Measured at" value={`${res(d.resM)} (fits memory)`} tone="warn" />}
      <Row label="Orthophoto" value={o ? `${o.fileW.toLocaleString()} × ${o.fileH.toLocaleString()} · ${res(o.fileResM)}` : 'none: elevation only'} />
      <Row label="Coordinates" value={<span className="text-[11px]">{d.crs.name}</span>} />
      <Row label="Heights" value={<span className="text-[11px]">{d.vertical}</span>} />
      <Row label="Data coverage" value={`${d.validPct.toFixed(0)} % of the DSM`} />
      {pr.offSite && <p className="text-[12px] text-warn">These results are not over this survey's site: they are measured round their own centre.</p>}
    </div>
  );
};

const NODE_KEY = 'survey.nodeodm';
const loadNode = (): { url: string; last?: string } => { try { return JSON.parse(localStorage.getItem(NODE_KEY) ?? '') ?? {}; } catch { return { url: 'http://localhost:3000' }; } };
const saveNode = (v: { url: string; last?: string }) => { try { localStorage.setItem(NODE_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

/** Follow a task to the end, then fetch its DSM and orthophoto and build the model. */
async function followTask(node: NodeOdm, uuid: string, origin: GeoOrigin, signal: AbortSignal, progress: (l: string, f?: number | null) => void) {
  setJob({ task: { node, uuid } });
  await waitForTask(node, uuid, { signal, onInfo: i => progress(`${statusLabel(i)} on the node${i.progress ? ` · ${Math.round(i.progress)} %` : ''}`, (i.progress ?? 0) / 100) });
  setJob({ task: null });
  progress('Downloading the DSM');
  const dsm = await downloadAsset(node, uuid, 'dsm.tif', signal);
  progress('Downloading the orthophoto');
  const ortho = await downloadAsset(node, uuid, 'orthophoto.tif', signal).catch(() => null);
  return loadProcessed({ dsm: blobSource(dsm), ortho: ortho ? blobSource(ortho) : null, name: `NodeODM task ${uuid.slice(0, 8)}` }, origin, { onProgress: progress });
}

const NodeOdmPanel: React.FC<Props> = (p) => {
  const job = p.results.job;
  const [cfg, setCfg] = useState(loadNode);
  const [token, setToken] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [useGeo, setUseGeo] = useState(true);
  const [probe, setProbe] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const node: NodeOdm = { url: cfg.url, token: token || undefined };
  const inputs = pickInputs(files), geoTxt = inputs.geo ? null : p.geoTxt();
  const opts = odmOptions(p.plan);
  const setUrl = (url: string) => { const v = { ...cfg, url }; setCfg(v); saveNode(v); };
  const test = async () => {
    setProbe('Connecting…');
    try { const i = await nodeInfo(node); setProbe(`Connected: NodeODM ${i.version ?? ''}${i.engineVersion ? ` · ODM ${i.engineVersion}` : ''} · ${i.taskQueueCount ?? 0} queued${i.maxImages ? ` · up to ${i.maxImages} images` : ''}`); }
    catch (e) { setProbe((e as Error).message); }
  };
  const start = () => runJob('Starting a NodeODM task', async (signal, progress) => {
    if (inputs.images.length < 5) throw new Error('Pick at least five overlapping JPEG photos from the survey.');
    const geo = inputs.geo ?? (useGeo && geoTxt ? new File([geoTxt], 'geo.txt', { type: 'text/plain' }) : null);
    const uuid = await createTask(node, geo ? [...inputs.images, geo] : inputs.images, {
      name: `${p.siteName} · ${new Date().toISOString().slice(0, 10)}`, options: opts, signal,
      onUpload: (s, t) => progress(`Uploading ${inputs.images.length} photos · ${mb(s)} of ${mb(t)} MB`, t ? s / t : 0),
    });
    const v = { ...cfg, last: uuid }; setCfg(v); saveNode(v);
    return followTask(node, uuid, p.siteOrigin, signal, progress);
  });
  const resume = () => cfg.last && runJob('Following the NodeODM task', (signal, progress) => followTask(node, cfg.last!, p.siteOrigin, signal, progress));
  return (
    <details className="group rounded-lg border border-line" open={!p.results.processed && !p.demoAvailable}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-medium text-ink [&>svg]:w-3.5 [&>svg]:h-3.5">
        <Cpu className="text-ink-3" />Process on a NodeODM node<span className="ml-auto text-[11px] font-normal text-ink-3 group-open:hidden">WebODM's engine</span>
      </summary>
      <div className="space-y-3 border-t border-line px-3 pb-3 pt-2">
        <label className="block text-[12px] text-ink-2">Node URL
          <input value={cfg.url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:3000" spellCheck={false}
            className="mt-1 w-full h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink num" />
        </label>
        <label className="block text-[12px] text-ink-2">Token <span className="text-ink-3">(if the node was started with --token; not saved)</span>
          <input value={token} onChange={e => setToken(e.target.value)} type="password" autoComplete="off" className="mt-1 w-full h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <ToolButton size="sm" label="Test connection" onClick={test} disabled={!cfg.url} />
          {probe && <span className={`basis-full text-[11px] min-w-0 break-words ${probe.startsWith('Connected') ? 'text-ok' : probe.endsWith('…') ? 'text-ink-3' : 'text-bad'}`}>{probe}</span>}
        </div>
        <div>
          <ToolButton size="sm" icon={<FolderOpen />} label={files.length ? `${inputs.images.length} photos${inputs.geo ? ' + geo.txt' : ''}` : 'Pick the photos'} onClick={() => photoRef.current?.click()} title="The survey's JPEGs from the SD card (and geo.txt from the survey package, if you have it)" />
          <input ref={photoRef} type="file" multiple accept=".jpg,.jpeg,.JPG,.txt,image/jpeg" className="hidden" aria-label="Survey photos"
            onChange={e => { setFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          {files.length > 0 && <p className="mt-1 text-[11px] text-ink-3">{mb(inputs.images.reduce((s, f) => s + f.size, 0))} MB{inputs.skipped ? ` · ${inputs.skipped} other file${inputs.skipped > 1 ? 's' : ''} left out` : ''}</p>}
          {!inputs.geo && geoTxt && <div className="mt-2"><Toggle on={useGeo} onChange={setUseGeo} label="Send this survey's geo.txt" description="Positions the aircraft reported for each photo (rejected and estimated frames left out)" /></div>}
        </div>
        <div className="text-[11px] leading-relaxed text-ink-3">
          Options from the plan: <span className="num text-ink-2">{opts.map(o => `${o.name} ${o.value}`).join(' · ')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToolButton size="sm" primary icon={<Play />} label="Upload and process" disabled={job.busy || !cfg.url || inputs.images.length < 5} onClick={start} />
          {cfg.last && !job.busy && <ToolButton size="sm" icon={<RotateCcw />} label={`Resume task ${cfg.last.slice(0, 8)}`} onClick={resume} title="Follow the last task started from this browser and load its results when it finishes" />}
        </div>
        <p className="text-[11px] leading-relaxed text-ink-3">
          The browser talks to the node directly, so the node must allow this page's origin (CORS); if requests are blocked, put the node behind a proxy that adds Access-Control-Allow-Origin. From an https page the node must be https or on localhost. With WebODM, point this at its NodeODM node (port 3000 by default), not the WebODM site.
        </p>
      </div>
    </details>
  );
};

// ---- the selected measurement -------------------------------------------------------------

const Details: React.FC<{ m: Measured; onChange: (a: Annotation) => void; z: number }> = ({ m, onChange, z: zOff }) => {
  const { a } = m;
  const [name, setName] = useState(a.name);
  const nameRow = (
    <>
      <input value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== a.name && onChange({ ...a, name: name.trim() })} aria-label="Measurement name"
        className="w-full bg-transparent text-[15px] font-semibold text-ink border-b border-transparent hover:border-line focus:border-accent outline-none" />
      {(m.gap ?? 0) > 0.005 && (
        <div className="flex items-start gap-1.5 text-[12px] text-warn"><TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {Math.round((m.gap ?? 0) * 100) || '<1'} % of it lies where the DSM has no data: heights there are filled from the surrounding surface.</div>
      )}
    </>
  );
  if (a.kind === 'AREA' && m.area) {
    const A = m.area, dens = a.density ?? 1.6, base = a.base ?? { kind: 'PLANE' as BaseKind };
    return (
      <div className="space-y-4">
        {nameRow}
        <Section title="Volume">
          <Segmented size="sm" value={base.kind} onChange={(k: BaseKind) => onChange({ ...a, base: { kind: k, level: k === 'DESIGN' ? (base.level ?? A.baseAtCentre) : undefined } })}
            items={[{ id: 'PLANE', label: 'Fitted base', title: 'A plane through the ground round the edge: for stockpiles, even on a slope' }, { id: 'LOWEST', label: 'Lowest point', title: 'Level with the lowest point on the edge' }, { id: 'DESIGN', label: 'Level', title: 'A level you set: cut and fill to level a pad' }]} />
          {base.kind === 'DESIGN' && (
            <label className="mt-2 flex items-center justify-between gap-2 text-[13px] text-ink-2">Level to
              <span className="flex items-center gap-1"><input type="number" step={0.05} value={((base.level ?? A.baseAtCentre) + zOff).toFixed(2)}
                onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange({ ...a, base: { kind: 'DESIGN', level: v - zOff } }); }}
                className="w-24 h-8 rounded-lg border border-line bg-surface px-2 text-right num text-[13px] text-ink" /><span className="text-ink-3">m</span></span>
            </label>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Fig label="Cut" swatch="#e0604f" value={`${fmt(A.cutM3)} m³`} hint="above the base" />
            <Fig label="Fill" swatch="#3987e5" value={`${fmt(A.fillM3)} m³`} hint="below the base" />
            <Fig label="Net" value={`${A.netM3 >= 0 ? '' : '−'}${fmt(Math.abs(A.netM3))} m³`} hint={A.netM3 >= 0 ? 'to remove' : 'to bring in'} />
          </div>
        </Section>
        <Section title="Tonnage">
          <label className="flex items-center justify-between gap-2 text-[13px] text-ink-2">Material
            <select value={dens} onChange={e => onChange({ ...a, density: parseFloat(e.target.value) })} aria-label="Material density"
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink">
              {DENSITIES.map(d => <option key={d.label} value={d.t}>{d.label} · {d.t} t/m³</option>)}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Fig label="Cut" value={`${fmt(A.cutM3 * dens)} t`} />
            <Fig label="Fill" value={`${fmt(A.fillM3 * dens)} t`} />
            <Fig label="Net" value={`${fmt(A.netM3 * dens)} t`} />
          </div>
        </Section>
        <Section title="Surface">
          <div className="space-y-1.5">
            <Row label="Highest point" value={`${(A.elevMax + zOff).toFixed(2)} m`} />
            <Row label="Lowest point" value={`${(A.elevMin + zOff).toFixed(2)} m`} />
            <Row label="Horizontal area" value={`${fmt(A.horizontalM2)} m²`} />
            <Row label="Surface area" value={`${fmt(A.surfaceM2)} m²`} />
          </div>
        </Section>
      </div>
    );
  }
  if (a.kind === 'LINE' && m.line) {
    const L = m.line, lim = a.limitPct;
    const over = lim !== undefined ? L.segments.filter(s => Math.abs(s.gradePct) > lim) : [];
    return (
      <div className="space-y-4">
        {nameRow}
        <Section title="Gradient">
          <div className="grid grid-cols-3 gap-2">
            <Fig label="Average" value={`${L.gradeAvgPct.toFixed(1)} %`} />
            <Fig label="Steepest" value={`${L.gradeMaxPct.toFixed(1)} %`} />
            <Fig label="Gentlest" value={`${L.gradeMinPct.toFixed(1)} %`} />
          </div>
          <label className="mt-3 flex items-center justify-between gap-2 text-[13px] text-ink-2">Limit
            <select value={lim ?? ''} onChange={e => onChange({ ...a, limitPct: e.target.value === '' ? undefined : parseFloat(e.target.value) })} aria-label="Grade limit"
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink">
              <option value="">None</option><option value="5">5 % · accessible route</option><option value="8.33">8.33 % · ramp (1 in 12)</option><option value="10">10 % · vehicle access</option><option value="15">15 % · haul road</option>
            </select>
          </label>
          {lim !== undefined && (
            <div className={`mt-2 flex items-start gap-1.5 text-[12px] ${over.length ? 'text-warn' : 'text-ok'}`}>
              {over.length ? <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <CircleCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {over.length ? `${over.length} segment${over.length > 1 ? 's' : ''} over ${lim} %: steepest ${L.gradeMaxPct.toFixed(1)} %` : `Every segment within ${lim} %`}
            </div>
          )}
        </Section>
        <Section title="Cross-section">
          <CrossSection L={L} limitPct={lim} zOff={zOff} />
        </Section>
        <Section title="Length">
          <div className="space-y-1.5">
            <Row label="Along the ground" value={`${fmt(L.surfaceM, 1)} m`} />
            <Row label="Horizontal" value={`${fmt(L.horizontalM, 1)} m`} />
            <Row label="Highest / lowest" value={`${(L.elevMax + zOff).toFixed(2)} / ${(L.elevMin + zOff).toFixed(2)} m`} />
          </div>
        </Section>
      </div>
    );
  }
  return <div className="space-y-2">{nameRow}<p className="text-[12px] text-ink-3">Elevation shown on the model.</p></div>;
};

const Fig: React.FC<{ label: string; value: string; hint?: string; swatch?: string }> = ({ label, value, hint, swatch }) => (
  <div className="rounded-lg border border-line px-2 py-1.5 min-w-0">
    <div className="flex items-center gap-1 text-[11px] text-ink-3">{swatch && <span className="w-2 h-2 rounded-sm" style={{ background: swatch }} />}{label}</div>
    <div className="num text-[13px] font-semibold text-ink truncate">{value}</div>
    {hint && <div className="text-[10px] text-ink-3 truncate">{hint}</div>}
  </div>
);

/**
 * Elevation against distance along the line. One series (no legend; the section
 * names it), 2 px line in the series colour, recessive grid, corners marked,
 * crosshair and tooltip on hover, and a table view of the segments.
 */
const CrossSection: React.FC<{ L: LineMeasure; limitPct?: number; zOff: number }> = ({ L, limitPct, zOff }) => {
  const W = 300, H = 150, pad = { l: 38, r: 8, t: 8, b: 24 };
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const g = useMemo(() => {
    const zs = L.profile.map(p => p.z + zOff), dMax = L.profile[L.profile.length - 1]?.d || 1;
    let lo = Math.min(...zs), hi = Math.max(...zs); const span = Math.max(0.5, hi - lo); lo -= span * 0.12; hi += span * 0.12;
    const X = (d: number) => pad.l + (d / dMax) * (W - pad.l - pad.r), Y = (z: number) => pad.t + (1 - (z - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const nice = (v: number) => { const e = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 5, 10].map(k => k * e).find(k => k >= v) ?? v; };
    const yStep = nice((hi - lo) / 4), xStep = nice(dMax / 5);
    const yt: number[] = []; for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yt.push(v);
    const xt: number[] = []; for (let v = 0; v <= dMax + 1e-6; v += xStep) xt.push(v);
    const path = L.profile.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.z + zOff).toFixed(1)}`).join('');
    return { X, Y, yt, xt, path, dMax, yDec: yStep < 1 ? 1 : 0 };
  }, [L, zOff]);
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
    const d = Math.max(0, Math.min(g.dMax, ((x - pad.l) / (W - pad.l - pad.r)) * g.dMax));
    let best = 0; for (let i = 1; i < L.profile.length; i++) if (Math.abs(L.profile[i].d - d) < Math.abs(L.profile[best].d - d)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? L.profile[hover] : null;
  const segAt = (d: number) => { let i = 0; while (i < L.vertexD.length - 2 && d > L.vertexD[i + 1]) i++; return L.segments[i]; };
  return (
    <div>
      <div className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
          aria-label={`Cross-section: elevation from ${(L.elevMin + zOff).toFixed(1)} to ${(L.elevMax + zOff).toFixed(1)} m over ${L.horizontalM.toFixed(0)} m`}>
          {g.yt.map(v => <g key={`y${v}`}><line x1={pad.l} x2={W - pad.r} y1={g.Y(v)} y2={g.Y(v)} className="stroke-line" strokeWidth={1} />
            <text x={pad.l - 5} y={g.Y(v) + 3} textAnchor="end" className="fill-ink-3" fontSize={9}>{v.toFixed(g.yDec)}</text></g>)}
          {g.xt.map(v => <text key={`x${v}`} x={g.X(v)} y={H - 8} textAnchor="middle" className="fill-ink-3" fontSize={9}>{v.toFixed(0)}</text>)}
          <text x={W - pad.r} y={H - 0.5} textAnchor="end" className="fill-ink-3" fontSize={8}>m along the line</text>
          <path d={g.path} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-series-1" />
          {L.vertexD.map((d, i) => { const z = L.profile.reduce((b, p) => (Math.abs(p.d - d) < Math.abs(b.d - d) ? p : b)).z + zOff;
            return <circle key={i} cx={g.X(d)} cy={g.Y(z)} r={4} className="fill-series-1 stroke-surface" strokeWidth={2} />; })}
          {hp && <>
            <line x1={g.X(hp.d)} x2={g.X(hp.d)} y1={pad.t} y2={H - pad.b} className="stroke-ink-3" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={g.X(hp.d)} cy={g.Y(hp.z + zOff)} r={4} className="fill-surface stroke-series-1" strokeWidth={2} />
          </>}
        </svg>
        {hp && (() => { const s = segAt(hp.d); const over = limitPct !== undefined && Math.abs(s.gradePct) > limitPct;
          return (
            <div className="absolute top-1 right-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink shadow-[var(--shadow-card)] pointer-events-none num">
              <div>{hp.d.toFixed(1)} m · <b>{(hp.z + zOff).toFixed(2)} m</b></div>
              <div className="text-ink-3">segment {Math.abs(s.gradePct).toFixed(1)} %{over ? ' · over limit' : ''}</div>
            </div>
          ); })()}
      </div>
      <button type="button" onClick={() => setTable(t => !t)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Table2 className="w-3 h-3" />{table ? 'Hide' : 'Show'} segments as a table</button>
      {table && (
        <table className="mt-1 w-full text-[11px] num">
          <thead><tr className="text-ink-3 text-left"><th className="font-normal py-0.5">#</th><th className="font-normal text-right">Length</th><th className="font-normal text-right">Rise</th><th className="font-normal text-right">Grade</th></tr></thead>
          <tbody>{L.segments.map((s, i) => { const over = limitPct !== undefined && Math.abs(s.gradePct) > limitPct;
            return <tr key={i} className="border-t border-line text-ink"><td className="py-0.5">{i + 1}</td><td className="text-right">{s.horizM.toFixed(1)} m</td><td className="text-right">{s.riseM >= 0 ? '+' : '−'}{Math.abs(s.riseM).toFixed(2)} m</td>
              <td className={`text-right ${over ? 'text-warn font-semibold' : ''}`}>{over && <TriangleAlert className="inline w-3 h-3 mr-0.5 -mt-0.5" />}{s.gradePct.toFixed(1)} %</td></tr>; })}</tbody>
        </table>
      )}
    </div>
  );
};
