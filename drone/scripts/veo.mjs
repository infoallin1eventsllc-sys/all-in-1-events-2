#!/usr/bin/env node
/**
 * Generate the patrol feed's AI drone footage with Google's Veo video model
 * (Gemini API) and install it in public/footage/veo, where the feed plays it
 * for its place (San Francisco, Los Angeles, New York, Giza, the mountains).
 *
 *   GEMINI_API_KEY=... npm run veo                 # every clip in scripts/veo-prompts.json not yet made
 *   GEMINI_API_KEY=... npm run veo -- giza alps    # just these
 *   GEMINI_API_KEY=... npm run veo -- --list       # the Veo models this key can use
 *   VEO_MODEL=veo-3.1-fast-generate-preview ...    # pick the model (default: the newest "fast" Veo)
 *   GEMINI_API_KEY=... npm run veo -- --again giza # make a new take of one that exists
 *
 * The key comes from Google AI Studio (aistudio.google.com → Get API key). Veo is
 * billed per second of video on a paid (billing-enabled) key; check AI Studio's
 * pricing before a run. Each clip is about 8 seconds.
 *
 * Each clip is saved as <key>.mp4 (720p, H.264, no audio, sized for hosting) and
 * <key>-sd.mp4 (360p, for the thumbnails), and listed in manifest.json with its
 * prompt and the model that made it. The feed labels them as AI-generated.
 * Needs ffmpeg on the PATH (or FFMPEG=/path/to/ffmpeg).
 */
import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const fail = e => { console.error(`veo: ${e?.message ?? e}`); process.exit(1); };
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'footage', 'veo');
const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const args = process.argv.slice(2);

if (!KEY) { console.error('Set GEMINI_API_KEY (a Google AI Studio API key).'); process.exit(1); }
const headers = { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' };
const api = async (path, init = {}) => {
  const r = await fetch(`${API}/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
};
const exists = async p => { try { return (await stat(p)).size > 0; } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The Veo models this key can call, newest first.
async function veoModels() {
  const found = [];
  let page = '';
  do {
    const m = await api(`models?pageSize=200${page ? `&pageToken=${page}` : ''}`);
    for (const x of m.models ?? []) if (/veo/i.test(x.name) && (x.supportedGenerationMethods ?? []).some(g => /predictLongRunning/i.test(g))) found.push(x.name.replace(/^models\//, ''));
    page = m.nextPageToken ?? '';
  } while (page);
  const ver = n => Number((n.match(/veo-(\d+(?:\.\d+)?)/) ?? [])[1] ?? 0);
  return found.sort((a, b) => ver(b) - ver(a) || Number(/fast/.test(b)) - Number(/fast/.test(a)));
}

if (args.includes('--list')) { console.log((await veoModels()).join('\n') || 'No Veo models available to this key.'); process.exit(0); }

const spec = JSON.parse(await readFile(join(root, 'scripts', 'veo-prompts.json'), 'utf8'));
const again = args.includes('--again');
const wanted = args.filter(a => !a.startsWith('--'));
const todo = spec.clips.filter(c => !wanted.length || wanted.includes(c.key));
if (!todo.length) { console.error(`No clips match ${wanted.join(', ')}. Keys: ${spec.clips.map(c => c.key).join(', ')}`); process.exit(1); }

const models = await veoModels();
const model = process.env.VEO_MODEL || models.find(m => /fast/.test(m)) || models[0];
if (!model) { console.error('This key has no Veo model. Veo needs a paid (billing-enabled) Gemini API key.'); process.exit(1); }
console.log(`Veo model: ${model}`);

await mkdir(out, { recursive: true });
const manifestPath = join(out, 'manifest.json');
const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { source: 'Google Veo (Gemini API)', clips: [] };

for (const c of todo) {
  const file = `${c.key}.mp4`, sd = `${c.key}-sd.mp4`;
  if (!again && (await exists(join(out, file)))) { console.log(`${c.key}: already made, skipping (use --again for a new take)`); continue; }
  console.log(`${c.key}: generating "${c.title}"...`);
  const body = { instances: [{ prompt: c.prompt }], parameters: { aspectRatio: '16:9', negativePrompt: spec.negative, personGeneration: 'allow_all' } };
  let op;
  try { op = await api(`models/${model}:predictLongRunning`, { method: 'POST', body: JSON.stringify(body) }); }
  catch (e) {
    // Some models reject optional parameters; retry with the prompt and aspect ratio only.
    console.log(`  retrying without optional parameters (${String(e.message).slice(0, 120)})`);
    op = await api(`models/${model}:predictLongRunning`, { method: 'POST', body: JSON.stringify({ instances: [{ prompt: c.prompt }], parameters: { aspectRatio: '16:9' } }) });
  }
  const t0 = Date.now();
  while (!op.done) {
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error(`${c.key}: still generating after 15 minutes (${op.name})`);
    await sleep(10000);
    op = await api(op.name);
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  if (op.error) { console.error(`${c.key}: ${op.error.message ?? JSON.stringify(op.error)}`); continue; }
  const sample = op.response?.generateVideoResponse?.generatedSamples?.[0] ?? op.response?.generatedVideos?.[0];
  const uri = sample?.video?.uri;
  if (!uri) { console.error(`${c.key}: no video in the response (it may have been filtered): ${JSON.stringify(op.response).slice(0, 400)}`); continue; }
  const r = await fetch(uri, { headers: { 'x-goog-api-key': KEY }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${c.key}: download failed ${r.status}`);
  const raw = join(out, `${c.key}.raw.mp4`);
  await writeFile(raw, Buffer.from(await r.arrayBuffer()));
  // Sized for hosting: 720p H.264 without audio for the feed, 360p for the thumbnails.
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-an', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, file)]);
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-an', '-vf', 'scale=640:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, sd)]);
  await unlink(raw);
  manifest.clips = manifest.clips.filter(x => x.file !== file);
  manifest.clips.push({ file, sd, title: c.title, place: c.place, model, prompt: c.prompt, made: new Date().toISOString() });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const mb = (await stat(join(out, file))).size / 1e6;
  console.log(`${c.key}: saved ${file} (${mb.toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`Done. ${manifest.clips.length} clip(s) in public/footage/veo; the feed plays them under Video: <place>.`);
