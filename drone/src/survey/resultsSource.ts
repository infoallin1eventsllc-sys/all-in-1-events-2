import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { GeoOrigin } from './plan';
import type { Annotation } from './measure';
import { demoMeasurements } from './demoMeasurements';
import { demoModel, processedModel, rebaseNotes, gapShare, type ProcessedResults, type ResultsModel } from './processed';
import { cancelTask, type NodeOdm } from './nodeodm';

/**
 * Which model the results viewer measures: the demo venue's, or processed results
 * (imported files, the shipped sample, or a NodeODM task). Each keeps its own
 * measurements; switching carries them across when the new model covers them.
 *
 * Loading (a big GeoTIFF, or hours of processing on a node) runs in a small store
 * outside React, so it keeps going while the operator uses other tabs, and the
 * result opens when it lands.
 */

export type ResultsSource = 'DEMO' | 'PROCESSED';

export interface Job {
  busy: boolean; label: string; f: number | null; error: string | null;
  result: ProcessedResults | null;
  /** The NodeODM task being followed, to cancel it. */
  task: { node: NodeOdm; uuid: string } | null;
}
let job: Job = { busy: false, label: '', f: null, error: null, result: null, task: null };
const subs = new Set<() => void>();
export function setJob(p: Partial<Job>) { job = { ...job, ...p }; subs.forEach(f => f()); }
export const useJob = () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => job, () => job);

let ctrl: AbortController | null = null;
export async function runJob(label: string, fn: (signal: AbortSignal, progress: (label: string, f?: number | null) => void) => Promise<ProcessedResults>) {
  ctrl?.abort(); const c = (ctrl = new AbortController());
  setJob({ busy: true, label, f: null, error: null, task: null });
  try {
    const r = await fn(c.signal, (l, f = null) => { if (ctrl === c) setJob({ label: l, f }); });
    if (ctrl === c) setJob({ busy: false, label: '', f: null, result: r, task: null });
  } catch (e) {
    if (ctrl !== c) return;
    setJob({ busy: false, label: '', f: null, task: null, error: (e as Error).name === 'AbortError' ? null : (e as Error).message });
  }
}
/** Stop loading; a NodeODM task is cancelled on the node too. */
export function cancelJob() {
  const t = job.task; ctrl?.abort(); ctrl = null;
  if (t) cancelTask(t.node, t.uuid).catch(() => { /* the node may already be done */ });
  setJob({ busy: false, label: '', f: null, task: null, error: t ? 'Cancelled: the task was cancelled on the node.' : null });
}

export function useResultsSource(demoOrigin: GeoOrigin | null, onSwitched?: (notes: Annotation[]) => void) {
  const [chosen, setChosen] = useState<ResultsSource>('DEMO');
  const [processed, setProcessed] = useState<ProcessedResults | null>(null);
  const [notes, setNotes] = useState<Annotation[]>(demoMeasurements);
  const stash = useRef(new Map<string, Annotation[]>());
  // A real site has no demo model: processed results are all there is.
  const source: ResultsSource = demoOrigin ? chosen : 'PROCESSED';
  const modelFor = (s: ResultsSource, p: ProcessedResults | null): ResultsModel | null =>
    s === 'PROCESSED' ? (p ? processedModel(p) : null) : demoOrigin ? demoModel(demoOrigin) : null;
  const model = useMemo(() => modelFor(source, processed), [source, processed, demoOrigin?.lat, demoOrigin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (s: ResultsSource, p: ProcessedResults | null) => {
    const next = modelFor(s, p);
    if (model) stash.current.set(model.id, notes);
    let nn = next ? stash.current.get(next.id) : undefined;
    if (!nn) {
      if (!next || next.kind === 'DEMO') nn = demoMeasurements();
      else if (next.processed!.offSite || !model) nn = [];
      // New results over the same site: keep what was measured, where the DSM covers it.
      else nn = rebaseNotes(notes, model.zOffset - next.zOffset).filter(a => gapShare(next.processed!, a.pts, a.kind) < 0.5);
    }
    setChosen(s); setProcessed(p); setNotes(nn); onSwitched?.(nn);
  };

  const j = useJob();
  useEffect(() => { if (j.result) { const r = j.result; setJob({ result: null }); switchTo('PROCESSED', r); } }, [j.result]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    model, source, processed, notes, setNotes, job: j,
    setSource: (s: ResultsSource) => { if (s !== source) switchTo(s, processed); },
    clear: () => { if (processed) stash.current.delete(processedModel(processed).id); switchTo(demoOrigin ? 'DEMO' : 'PROCESSED', null); },
  };
}
export type ResultsSourceState = ReturnType<typeof useResultsSource>;
