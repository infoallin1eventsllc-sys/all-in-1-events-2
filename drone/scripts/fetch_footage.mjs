#!/usr/bin/env node
/**
 * Download the patrol feed's real drone footage into public/footage so the site
 * serves it itself (no dependency on Pexels at view time, and the thermal and
 * night-vision stages run in WebGL on the real frames).
 *
 *   npm run footage                 # 720p for the main feed, 360p for thumbnails
 *   PEXELS_KEY=... npm run footage  # with a free API key: exact files, no guessing
 *
 * The clip list lives in src/dashboards/feed/footage.ts. Pexels licence: free for
 * commercial use, no attribution required (https://www.pexels.com/license/).
 * Run it on a normal internet connection; about 150 MB in total.
 */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'footage');
const KEY = process.env.PEXELS_KEY;

// Read the clip ids from the app's own list so the two never drift apart.
const src = await readFile(join(root, 'src', 'dashboards', 'feed', 'footage.ts'), 'utf8');
const clips = [...src.matchAll(/\{ id: (\d+), title: '([^']+)'/g)].map(m => ({ id: Number(m[1]), title: m[2] }));
if (!clips.length) throw new Error('No clips found in footage.ts');

async function exists(p) { try { return (await stat(p)).size > 0; } catch { return false; } }

async function urlFor(id, maxWidth) {
  if (KEY) {
    const r = await fetch(`https://api.pexels.com/videos/videos/${id}`, { headers: { Authorization: KEY } });
    if (r.ok) {
      const v = await r.json();
      const files = (v.video_files ?? []).filter(f => f.file_type === 'video/mp4' && f.width <= maxWidth).sort((a, b) => b.width - a.width);
      if (files[0]) return files[0].link;
    }
  }
  const [w, h] = maxWidth > 900 ? [1280, 720] : [640, 360];
  return `https://www.pexels.com/download/video/${id}/?w=${w}&h=${h}`;
}

async function download(url, path) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (drone-command footage fetch)' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 50_000) throw new Error('response too small to be a video');
  await writeFile(path, buf);
  return buf.length;
}

await mkdir(out, { recursive: true });
const done = [];
for (const c of clips) {
  const targets = [[`${c.id}.mp4`, 1300], [`${c.id}-sd.mp4`, 700]];
  let ok = true;
  for (const [name, maxWidth] of targets) {
    const path = join(out, name);
    if (await exists(path)) { console.log(`  kept     ${name}`); continue; }
    try {
      const bytes = await download(await urlFor(c.id, maxWidth), path);
      console.log(`  saved    ${name}  ${(bytes / 1e6).toFixed(1)} MB  ${c.title}`);
    } catch (e) {
      ok = false;
      console.log(`  failed   ${name}  ${e.message}  (https://www.pexels.com/video/${c.id}/)`);
    }
  }
  if (ok) done.push({ id: c.id, title: c.title });
}
await writeFile(join(out, 'manifest.json'), JSON.stringify({ source: 'pexels.com', license: 'https://www.pexels.com/license/', clips: done }, null, 2));
console.log(`\n${done.length} of ${clips.length} clips in public/footage (manifest.json written).`);
if (done.length < clips.length) console.log('For any that failed, open the Pexels page, download the HD file by hand and save it as public/footage/<id>.mp4 (and -sd.mp4 for the thumbnail), then run this again.');
