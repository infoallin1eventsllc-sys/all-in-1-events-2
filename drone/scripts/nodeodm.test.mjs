// NodeODM client against a mock node: chunked task creation, polling, failure, download,
// and the downloaded results loading into the viewer's model.
import assert from 'assert';
import http from 'http';
import { readFileSync } from 'fs';
import { loadModule } from './bundle.mjs';
const odm = await loadModule('../src/survey/nodeodm.ts');
const pr = await loadModule('../src/survey/processed.ts');
const tif = await loadModule('../src/survey/geotiff.ts');
const { SITE } = await loadModule('../src/survey/site.ts');

const dir = new URL('../public/demo/processed/', import.meta.url);
const ASSETS = { 'orthophoto.tif': readFileSync(new URL('orthophoto.tif', dir)), 'dsm.tif': readFileSync(new URL('dsm.tif', dir)) };
const TOKEN = 'secret';
const tasks = new Map(), log = [];
let polls = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('latin1');
    log.push(`${req.method} ${u.pathname}`);
    const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    if (u.searchParams.get('token') !== TOKEN) return send(403, { error: 'Invalid authentication token' });
    const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1];
    const files = [...body.matchAll(/name="images"; filename="([^"]+)"/g)].map(m => m[1]);
    let m;
    if (req.method === 'GET' && u.pathname === '/info') return send(200, { version: '2.5.0', taskQueueCount: 0, maxImages: null, engine: 'odm' });
    if (req.method === 'POST' && u.pathname === '/task/new/init') {
      const uuid = `t-${tasks.size + 1}`; tasks.set(uuid, { name: field('name'), options: JSON.parse(field('options')), files: [], uploads: 0, committed: false, fail: field('name') === 'bad' });
      return send(200, { uuid });
    }
    if (req.method === 'POST' && (m = u.pathname.match(/^\/task\/new\/upload\/(.+)$/))) { const t = tasks.get(m[1]); t.files.push(...files); t.uploads++; return send(200, { success: true }); }
    if (req.method === 'POST' && (m = u.pathname.match(/^\/task\/new\/commit\/(.+)$/))) { tasks.get(m[1]).committed = true; return send(200, { uuid: m[1] }); }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/task\/(.+)\/info$/))) {
      const t = tasks.get(m[1]); if (!t) return send(200, { error: 'Task not found' });
      polls++;
      if (polls === 2) { req.socket.destroy(); return; } // a dropped poll
      const n = (t.polls = (t.polls ?? 0) + 1);
      const status = n < 3 ? { code: n === 1 ? 10 : 20 } : t.fail ? { code: 30, errorMessage: 'Not enough images' } : { code: 40 };
      return send(200, { uuid: m[1], name: t.name, status, progress: n < 3 ? n * 40 : 100, imagesCount: t.files.length });
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/task\/(.+)\/output$/))) return send(200, ['[INFO] running opensfm', '[ERROR] Reconstruction failed']);
    if (req.method === 'GET' && (m = u.pathname.match(/^\/task\/(.+)\/download\/(.+)$/))) {
      const a = ASSETS[m[2]]; if (!a) return send(200, { error: 'Invalid asset' });
      res.writeHead(200, { 'Content-Type': 'image/tiff' }); return res.end(a);
    }
    send(404, { error: 'not found' });
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const node = { url, token: TOKEN };

try {
  // Options from the plan.
  const opts = odm.odmOptions({ gsdCm: 1.64, pattern: 'GRID' });
  assert.deepEqual(opts.find(o => o.name === 'dsm'), { name: 'dsm', value: true });
  assert.equal(opts.find(o => o.name === 'orthophoto-resolution').value, 1.6);
  assert.equal(opts.find(o => o.name === 'dem-resolution').value, 3.2);
  assert.equal(opts.find(o => o.name === 'fast-orthophoto').value, false);
  assert.ok(odm.odmOptions({ gsdCm: 2, pattern: 'DOUBLE_GRID' }).some(o => o.name === 'pc-quality'), '3D model: higher point-cloud quality');

  // Inputs: JPEGs and geo.txt, nothing else.
  const photos = Array.from({ length: 7 }, (_, i) => new File([new Uint8Array(3000 + i)], `DJI_${String(i + 1).padStart(4, '0')}.JPG`, { type: 'image/jpeg' }));
  const picked = odm.pickInputs([...photos, new File(['EPSG:4326\n'], 'geo.txt'), new File(['x'], 'notes.docx')]);
  assert.equal(picked.images.length, 7); assert.equal(picked.geo.name, 'geo.txt'); assert.equal(picked.skipped, 1);

  // Info and the token.
  assert.equal((await odm.nodeInfo(node)).version, '2.5.0');
  await assert.rejects(odm.nodeInfo({ url }), /token/, 'a missing token is reported as such');
  await assert.rejects(odm.nodeInfo({ url: 'localhost:3000' }), /must start with http/);
  await assert.rejects(odm.nodeInfo({ url: 'http://127.0.0.1:1' }), /Could not reach NodeODM[\s\S]*CORS/, 'unreachable node explains what to check');

  // Chunked upload: 7 photos of ~3 kB and geo.txt in 10 kB chunks.
  const progress = [];
  const uuid = await odm.createTask(node, [...picked.images, picked.geo], { name: 'Festival grounds', options: opts, chunkBytes: 10000, onUpload: (s, t) => progress.push([s, t]) });
  const t = tasks.get(uuid);
  assert.equal(t.name, 'Festival grounds'); assert.deepEqual(t.options, opts); assert.ok(t.committed);
  assert.deepEqual(t.files, [...photos.map(p => p.name), 'geo.txt'], 'every file uploaded once, in order');
  assert.ok(t.uploads >= 3, `split into chunks (${t.uploads})`);
  assert.equal(progress[progress.length - 1][0], progress[0][1], 'upload progress reaches the total');
  assert.deepEqual(log.filter(l => l.startsWith('POST')).map(l => l.replace(/\/t-\d+$/, '')), ['POST /task/new/init', ...Array(t.uploads).fill('POST /task/new/upload'), 'POST /task/new/commit']);

  // Polling through queued and running (and one dropped poll) to completed.
  const seen = [];
  const done = await odm.waitForTask(node, uuid, { intervalMs: 5, onInfo: i => seen.push(i.status.code) });
  assert.equal(done.status.code, odm.STATUS.COMPLETED); assert.deepEqual(seen, [10, 20, 40]);
  assert.equal(odm.statusLabel(done), 'Completed');

  // A failed task says why, with the log's last lines.
  const bad = await odm.createTask(node, photos.slice(0, 2), { name: 'bad', options: opts });
  await assert.rejects(odm.waitForTask(node, bad, { intervalMs: 5 }), /Processing failed: Not enough images[\s\S]*Reconstruction failed/);

  // Cancelling a wait.
  const ac = new AbortController(); const slow = await odm.createTask(node, photos.slice(0, 1), { name: 'slow', options: opts });
  const w = odm.waitForTask(node, slow, { intervalMs: 10000, signal: ac.signal }); setTimeout(() => ac.abort(), 20);
  await assert.rejects(w, e => e.name === 'AbortError');

  // Download the results and load them as the viewer does.
  const [dsm, ortho] = await Promise.all([odm.downloadAsset(node, uuid, 'dsm.tif'), odm.downloadAsset(node, uuid, 'orthophoto.tif')]);
  assert.equal(dsm.size, ASSETS['dsm.tif'].length);
  const kinds = await pr.classifyFiles([Object.assign(ortho, { name: 'orthophoto.tif' }), Object.assign(dsm, { name: 'dsm.tif' })]);
  assert.equal(kinds.dsm, dsm); assert.equal(kinds.ortho, ortho); assert.deepEqual(kinds.problems, []);
  const p = await pr.loadProcessed({ dsm: tif.blobSource(dsm), ortho: tif.blobSource(ortho), name: 'NodeODM task' }, SITE.origin);
  assert.equal(p.offSite, false); assert.ok(p.ortho); assert.ok(Number.isFinite(p.surface(0, 0)));
  await assert.rejects(odm.downloadAsset(node, uuid, 'dtm.tif'), /Invalid asset/, 'a missing asset reports the node\'s error');
} finally { server.close(); }
console.log('nodeodm: all tests passed');
