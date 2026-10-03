import type { Pattern } from './plan';

/**
 * NodeODM: the processing engine behind WebODM (and usable on its own, e.g.
 * `docker run -p 3000:3000 opendronemap/nodeodm`). The dashboard sends it the
 * survey's photos, follows the task, and loads the orthophoto and DSM it makes.
 *
 * REST API, as documented by NodeODM (OpenDroneMap/NodeODM docs/index.adoc; routes in
 * index.js). Not re-read against the source for this change: check these if a
 * NodeODM release changes them.
 *   GET  /info                          version, queue, maxImages
 *   POST /task/new/init                 form: name, options (JSON [{name, value}]) → { uuid }
 *   POST /task/new/upload/:uuid         form: images (one or more files) → { success }
 *   POST /task/new/commit/:uuid         → { uuid }: processing starts
 *   GET  /task/:uuid/info               { status: { code, errorMessage }, progress 0–100, processingTime, imagesCount }
 *   GET  /task/:uuid/output?line=-n     the last n lines of the console log
 *   GET  /task/:uuid/download/:asset    orthophoto.tif, dsm.tif, dtm.tif, all.zip, …
 *   POST /task/cancel                   form: uuid
 *   Status codes: 10 queued, 20 running, 30 failed, 40 completed, 50 canceled.
 *   A node started with --token takes it as ?token= on every request.
 * Extra inputs go up with the images as files. geo.txt (ODM's image geolocation file,
 * the format the survey package writes: an EPSG:4326 header, then "image lon lat alt
 * yaw pitch roll") is sent under that exact name, which is how NodeODM is expected to
 * recognise it (not verified here). A node that ignores it still has the photos' own
 * EXIF GPS, so the task runs either way.
 *
 * The browser calls the node directly, so the node must allow this page's origin
 * (CORS). An https page can only call an https node, or one on localhost.
 */

export interface NodeOdm { url: string; token?: string; fetch?: typeof fetch }
export const STATUS = { QUEUED: 10, RUNNING: 20, FAILED: 30, COMPLETED: 40, CANCELED: 50 } as const;
export interface TaskInfo { uuid: string; name?: string; status: { code: number; errorMessage?: string }; progress?: number; processingTime?: number; imagesCount?: number }
export interface NodeInfo { version?: string; taskQueueCount?: number; maxImages?: number | null; engine?: string; engineVersion?: string }
export type OdmOption = { name: string; value: string | number | boolean };

/** Processing options from the plan: a DSM, the orthophoto at the plan's GSD, full (not fast) orthophoto. */
export function odmOptions(p: { gsdCm: number; pattern: Pattern }): OdmOption[] {
  const gsd = Math.max(0.5, Math.round(p.gsdCm * 10) / 10);
  return [
    { name: 'dsm', value: true },
    { name: 'orthophoto-resolution', value: gsd },
    // Elevation at twice the GSD: what photogrammetry resolves reliably, and a quarter of the pixels.
    { name: 'dem-resolution', value: Math.round(gsd * 20) / 10 },
    { name: 'fast-orthophoto', value: false },
    // Cloud-optimised GeoTIFFs carry overviews, which the viewer reads for display.
    { name: 'cog', value: true },
    ...(p.pattern === 'GRID' ? [] : [{ name: 'pc-quality', value: 'high' }]),
  ];
}

function endpoint(n: NodeOdm, path: string, q: Record<string, string> = {}) {
  const base = n.url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('The node URL must start with http:// or https:// (e.g. http://localhost:3000).');
  const qs = new URLSearchParams({ ...q, ...(n.token ? { token: n.token } : {}) }).toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

async function call(n: NodeOdm, path: string, init?: RequestInit, q?: Record<string, string>): Promise<Response> {
  const f = n.fetch ?? fetch, url = endpoint(n, path, q);
  let res: Response;
  try { res = await f(url, init); } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const mixed = typeof location !== 'undefined' && location.protocol === 'https:' && /^http:/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url);
    throw new Error(mixed
      ? `This page is https, so the browser will not call ${n.url} (http). Serve NodeODM over https, or run it on localhost.`
      : `Could not reach NodeODM at ${n.url}. Check it is running and the URL is right. The node must also allow this page's origin (CORS): put it behind a proxy that sends Access-Control-Allow-Origin if it does not.`);
  }
  if (res.status === 401 || res.status === 403) throw new Error('NodeODM refused the request: check the token.');
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.clone().json(); if (j?.error) msg = j.error; } catch { /* not JSON */ }
    throw new Error(`NodeODM: ${msg}`);
  }
  return res;
}
async function json<T>(n: NodeOdm, path: string, init?: RequestInit, q?: Record<string, string>): Promise<T> {
  const j = await (await call(n, path, init, q)).json();
  if (j && typeof j === 'object' && 'error' in j && j.error) throw new Error(`NodeODM: ${j.error}`);
  return j as T;
}

export const nodeInfo = (n: NodeOdm) => json<NodeInfo>(n, '/info');
export const taskInfo = (n: NodeOdm, uuid: string) => json<TaskInfo>(n, `/task/${uuid}/info`);
export async function taskOutput(n: NodeOdm, uuid: string, lines = 12): Promise<string[]> {
  try { return await json<string[]>(n, `/task/${uuid}/output`, undefined, { line: String(-lines) }); } catch { return []; }
}
export async function cancelTask(n: NodeOdm, uuid: string) {
  const fd = new FormData(); fd.append('uuid', uuid);
  await json(n, '/task/cancel', { method: 'POST', body: fd });
}

/** Photos to send: JPEGs, plus a geolocation file if one was picked. Everything else is left out. */
export function pickInputs(files: File[]): { images: File[]; geo: File | null; skipped: number } {
  const images = files.filter(f => /\.jpe?g$/i.test(f.name));
  const geo = files.find(f => /^geo\.txt$/i.test(f.name)) ?? null;
  return { images, geo, skipped: files.length - images.length - (geo ? 1 : 0) };
}

/**
 * Create a task with a chunked upload (init → upload batches → commit), so a few
 * hundred 20 MB photos go up as a series of requests with progress in between.
 */
export async function createTask(n: NodeOdm, files: Blob[], o: { name: string; options: OdmOption[]; chunkBytes?: number; onUpload?: (sent: number, total: number) => void; signal?: AbortSignal }): Promise<string> {
  const init = new FormData();
  init.append('name', o.name);
  init.append('options', JSON.stringify(o.options));
  const { uuid } = await json<{ uuid: string }>(n, '/task/new/init', { method: 'POST', body: init, signal: o.signal });
  if (!uuid) throw new Error('NodeODM did not return a task id.');
  const total = files.reduce((s, f) => s + f.size, 0), limit = o.chunkBytes ?? 64e6;
  let sent = 0; o.onUpload?.(0, total);
  for (let i = 0; i < files.length;) {
    const fd = new FormData(); let bytes = 0, k = 0;
    while (i < files.length && (k === 0 || bytes + files[i].size <= limit)) { const f = files[i++]; fd.append('images', f, (f as File).name ?? `image_${i}.jpg`); bytes += f.size; k++; }
    await json(n, `/task/new/upload/${uuid}`, { method: 'POST', body: fd, signal: o.signal });
    sent += bytes; o.onUpload?.(sent, total);
  }
  await json(n, `/task/new/commit/${uuid}`, { method: 'POST', signal: o.signal });
  return uuid;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

/** Poll the task until it completes; a failure carries NodeODM's message and the log's last lines. */
export async function waitForTask(n: NodeOdm, uuid: string, o: { onInfo?: (i: TaskInfo) => void; intervalMs?: number; signal?: AbortSignal } = {}): Promise<TaskInfo> {
  for (let misses = 0; ;) {
    let info: TaskInfo;
    try { info = await taskInfo(n, uuid); misses = 0; } catch (e) {
      // A node busy processing can drop a poll: give it a few before giving up.
      if ((e as Error).name === 'AbortError' || ++misses > 5) throw e;
      await sleep(o.intervalMs ?? 5000, o.signal); continue;
    }
    o.onInfo?.(info);
    const c = info.status?.code;
    if (c === STATUS.COMPLETED) return info;
    if (c === STATUS.FAILED || c === STATUS.CANCELED) {
      const log = c === STATUS.FAILED ? await taskOutput(n, uuid) : [];
      throw new Error(`${c === STATUS.FAILED ? 'Processing failed' : 'The task was cancelled'}${info.status.errorMessage ? `: ${info.status.errorMessage}` : '.'}${log.length ? `\n${log.join('\n')}` : ''}`);
    }
    await sleep(o.intervalMs ?? 5000, o.signal);
  }
}

export async function downloadAsset(n: NodeOdm, uuid: string, asset: 'orthophoto.tif' | 'dsm.tif' | 'dtm.tif', signal?: AbortSignal): Promise<Blob> {
  const res = await call(n, `/task/${uuid}/download/${asset}`, { signal });
  // A missing asset comes back as JSON {error}, not a file.
  if (/json/i.test(res.headers.get('content-type') ?? '')) { const j = await res.json(); throw new Error(`NodeODM: ${j?.error ?? `no ${asset} for this task`}`); }
  return res.blob();
}

export const statusLabel = (i: TaskInfo) => ({ 10: 'Queued', 20: 'Processing', 30: 'Failed', 40: 'Completed', 50: 'Cancelled' } as Record<number, string>)[i.status?.code] ?? `Status ${i.status?.code}`;
