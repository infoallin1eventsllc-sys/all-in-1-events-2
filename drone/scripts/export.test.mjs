// Show-package export: keyframes on the conductor's timeline, separation, orientation, CSV shape and zip integrity.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const m = await loadModule('../src/lightshow/exportShow.ts');
const F = await loadModule('../src/data/lightShowFormations.ts');
const P = await loadModule('../src/lightshow/pads.ts');

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function minSep(pts) { let d = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) d = Math.min(d, dist(pts[i], pts[j])); return d; }
/** Where every aircraft is at show time t (tracks share row times; linear between rows, as the controller flies). */
const at = (keys, t) => keys.map(k => { let i = 0; while (i < k.length - 2 && k[i + 1].t <= t) i++; const a = k[i], b = k[i + 1] ?? a, u = b.t === a.t ? 1 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u }; });

// --- formations: never two aircraft closer than 1.5 m, at any moment of any cue -----------
for (const n of [100, 500]) for (const f of F.SHOW_FORMATIONS) {
  let worst = Infinity, wt = 0;
  for (let t = 0; t <= f.durationSeconds; t += 1) { const d = minSep(f.generatePoints(n, t).map(p => p.pos)); if (d < worst) { worst = d; wt = t; } }
  assert.ok(worst >= m.MIN_SEPARATION_M, `${f.name} with ${n} aircraft: ${worst.toFixed(2)} m apart at ${wt} s`);
}
// A cue played in order (the preview and the export step a Spacer) keeps the same spacing.
{
  const f = F.SHOW_FORMATIONS.find(x => x.id === 'LOTUS_BLOOM'), sp = new F.Spacer();
  for (let t = 0; t <= f.durationSeconds; t += 0.25) assert.ok(minSep(F.formationPoints(f, 250, t, sp, 0.25).map(p => p.pos)) >= m.MIN_SEPARATION_M, `stepped lotus at ${t}s`);
}

// --- keyframes on the conductor's timeline --------------------------------------------------
{
  const COUNT = 12;
  const { keys, cues, totalS } = m.buildKeyframes(COUNT);
  assert.equal(keys.length, COUNT, 'one keyframe track per aircraft');
  assert.equal(cues.length, F.SHOW_FORMATIONS.length, 'every formation produces a cue');
  cues.forEach((c, i) => {
    assert.equal(c.startS, F.CUE_STARTS[i], `cue ${i + 1} starts when the conductor starts it`);
    assert.equal(c.holdS, F.SHOW_FORMATIONS[i].durationSeconds);
    assert.ok(c.transitionS >= 3 && c.transitionS < c.holdS, `cue ${i + 1} flies in inside its own time (${c.transitionS}s)`);
  });
  assert.ok(totalS > F.SHOW_TOTAL_SECONDS && totalS < F.SHOW_TOTAL_SECONDS + 60, `the show, then the landing: ${totalS}s`);
  const pads = Array.from({ length: COUNT }, (_, i) => P.padXY(i, COUNT));
  const landed = new Set();
  keys.forEach((track, i) => {
    // Time must never go backwards or the show controller will reject it.
    for (let r = 1; r < track.length; r++) assert.ok(track[r].t > track[r - 1].t, 'keyframe times increase');
    assert.equal(track.length, keys[0].length, 'every track has the same rows');
    const first = track[0], last = track[track.length - 1];
    assert.equal(first.t, 0); assert.equal(first.z, 0, 'starts on the pad');
    assert.ok(Math.abs(first.x - pads[i].x) < 1e-9 && Math.abs(first.y - pads[i].y) < 1e-9, 'on its pad of the shared launch grid');
    assert.equal(last.z, 0, 'lands on a pad'); assert.deepEqual([last.r, last.g, last.b], [0, 0, 0], 'lights out on landing');
    const p = pads.findIndex(q => Math.abs(q.x - last.x) < 1e-9 && Math.abs(q.y - last.y) < 1e-9);
    assert.ok(p >= 0, 'lands on one of the pads'); landed.add(p);
  });
  assert.equal(landed.size, COUNT, 'one aircraft to each pad');
  // Animated cues are flown as they play, not frozen at their first pose.
  const sphere = cues[0], a = at(keys, sphere.startS + sphere.transitionS), b = at(keys, sphere.startS + sphere.holdS);
  assert.ok(Math.max(...a.map((p, i) => dist(p, b[i]))) > 3, 'the sphere turns and breathes through its cue');
  // The countdown shows its numbers one after another (and the burst), not only the first.
  const cd = cues.find(c => c.name === 'Countdown'), s1 = at(keys, cd.startS + 7.5), s2 = at(keys, cd.startS + 10.5), s3 = at(keys, cd.startS + 20);
  assert.ok(Math.max(...s1.map((p, i) => dist(p, s2[i]))) > 3 && Math.max(...s2.map((p, i) => dist(p, s3[i]))) > 3, 'countdown numbers change in the export');
}

// --- separation over the whole show, 100 and 500 aircraft (buildKeyframes throws otherwise) ---------
for (const n of [100, 500]) {
  const { keys, cues } = m.buildKeyframes(n);
  assert.equal(m.separationViolations(keys, cues).length, 0, `${n} aircraft: no pair under ${m.MIN_SEPARATION_M} m`);
}

// --- ... and the export refuses a show that breaks it, naming the cue, the time and the pair ----------
{
  const white = { r: 255, g: 255, b: 255, w: 0 };
  const stacked = { id: 'STACK', name: 'Stacked', description: '', durationSeconds: 10, paletteName: '', generatePoints: n => Array.from({ length: n }, () => ({ pos: { x: 0, y: 30, z: 0 }, color: white })) };
  assert.throws(() => m.buildKeyframes(4, [stacked]), e => e instanceof m.SeparationError && /cue 1 "Stacked"/.test(e.message) && /DRN-001 and DRN-002/.test(e.message) && e.violations[0].d < 0.01);
  // Two aircraft that are 2.8 m apart at every row but fly through the same point between rows: caught between the rows.
  const cross = { id: 'CROSS', name: 'Crossing', description: '', durationSeconds: 10, paletteName: '', generatePoints: (n, t = 0) => [
    { pos: { x: -8 * (t - 3.75), y: 20, z: 0 }, color: white }, { pos: { x: 0, y: 20, z: 8 * (t - 3.75) }, color: white }] };
  assert.throws(() => m.buildKeyframes(2, [cross]), e => e instanceof m.SeparationError && e.violations.some(v => /hold/.test(v.where) && Math.abs(v.t - 3.75) < 0.01 && v.d < 0.01));
}

// --- orientation: a rotation, never a mirror; words read left to right from the audience -------------
{
  const r = [m.toShowFrame({ x: 1, y: 0, z: 0 }), m.toShowFrame({ x: 0, y: 1, z: 0 }), m.toShowFrame({ x: 0, y: 0, z: 1 })];
  const det = r[0].x * (r[1].y * r[2].z - r[1].z * r[2].y) - r[0].y * (r[1].x * r[2].z - r[1].z * r[2].x) + r[0].z * (r[1].x * r[2].y - r[1].y * r[2].x);
  assert.equal(det, 1, 'determinant +1');
  assert.deepEqual(m.toShowFrame({ x: 0, y: 0, z: -1 }), { x: -0, y: -1, z: 0 }, 'the audience (sim -z) is towards -y');
  assert.deepEqual(m.toShowFrame({ x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 }, 'up is +z');
  // Seen from the audience (at -y, looking +y, z up) their right is +x. An "L": its upright is on the left, its foot runs right.
  F.showText.value = 'L';
  const name = F.SHOW_FORMATIONS.find(f => f.id === 'NAME_IN_LIGHTS');
  const pts = name.generatePoints(100, 0).map(p => m.toShowFrame(p.pos));
  const top = Math.max(...pts.map(p => p.z)), bottom = Math.min(...pts.map(p => p.z));
  const upright = pts.filter(p => p.z > top - 4), foot = pts.filter(p => p.z < bottom + 4);
  const mean = xs => xs.reduce((s, p) => s + p.x, 0) / xs.length;
  assert.ok(mean(upright) < mean(foot) - 5, `"L" reads correctly from the crowd (upright ${mean(upright).toFixed(1)}, foot ${mean(foot).toFixed(1)})`);
  // "LA": the L on the left from the crowd, then the A.
  F.showText.value = 'LA';
  const la = name.generatePoints(100, 0).map(p => m.toShowFrame(p.pos));
  const midX = (Math.min(...la.map(p => p.x)) + Math.max(...la.map(p => p.x))) / 2;
  const topRow = la.filter(p => p.z > Math.max(...la.map(q => q.z)) - 3);
  // Top row: the L has one cell (its upright) on the left half, the A has three (its crossbar top) on the right.
  assert.ok(topRow.filter(p => p.x > midX).length > topRow.filter(p => p.x < midX).length, '"LA" is L then A, left to right');
  F.showText.value = 'ALL IN 1';
}

// --- assignment -----------------------------------------------------------------------------
{
  const a = Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) * 3, y: Math.floor(i / 8) * 3, z: 10 }));
  const perm = a.map((_, i) => i).sort((x, y) => ((x * 7919) % 40) - ((y * 7919) % 40));
  const b = perm.map(i => ({ ...a[i], z: 10 }));
  const who = m.assignSlots(a, b);
  a.forEach((p, i) => assert.equal(dist(p, b[who[i]]), 0, 'recovers the shuffle exactly'));
  // Two aircraft trading places side by side cross if they keep their index; matched, they do not move at all.
  const w = m.assignSlots([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }], [{ x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
  assert.deepEqual([...w], [1, 0]);
}

// --- zip -------------------------------------------------------------------
const enc = new TextEncoder();
const files = [
  { name: 'drones/DRN-001.csv', data: enc.encode('Time [msec],x [m],y [m],z [m],Red,Green,Blue\n0,0,0,0,0,0,0\n') },
  { name: 'manifest.json', data: enc.encode('{"a":1}') },
];
const blob = m.zipStore(files);
const bytes = new Uint8Array(await blob.arrayBuffer());
const dv = new DataView(bytes.buffer);
assert.equal(dv.getUint32(0, true), 0x04034b50, 'local file header magic');
// End-of-central-directory sits at the tail and counts our entries.
const eocd = bytes.length - 22;
assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'end of central directory magic');
assert.equal(dv.getUint16(eocd + 8, true), files.length, 'entry count');
assert.equal(dv.getUint16(eocd + 10, true), files.length);
// Stored (uncompressed) entries keep their bytes verbatim, so the CSV text survives.
const text = new TextDecoder().decode(bytes);
assert.ok(text.includes('Time [msec],x [m],y [m],z [m],Red,Green,Blue'), 'csv content is stored verbatim');
assert.ok(text.includes('drones/DRN-001.csv') && text.includes('manifest.json'), 'names in the directory');

console.log('show export: all tests passed');
