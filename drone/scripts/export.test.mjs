// Show-package export: keyframes, CSV shape and zip integrity.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const m = await loadModule('../src/lightshow/exportShow.ts');

// --- keyframes -------------------------------------------------------------
const COUNT = 12;
const { keys, cues, totalS } = m.buildKeyframes(COUNT);
assert.equal(keys.length, COUNT, 'one keyframe track per aircraft');
assert.ok(cues.length >= 6, 'every formation produces a cue');
assert.ok(totalS > 60, `show should be minutes long, got ${totalS}s`);

for (const track of keys) {
  // Time must never go backwards or the show controller will reject it.
  for (let i = 1; i < track.length; i++) assert.ok(track[i].t >= track[i - 1].t, 'keyframe times are monotonic');
  assert.equal(track[0].t, 0, 'every aircraft starts at T0');
  const first = track[0], last = track[track.length - 1];
  assert.equal(first.z, 0, 'starts on the pad');
  assert.equal(last.z, 0, 'lands on the pad');
  assert.deepEqual([last.r, last.g, last.b], [0, 0, 0], 'lights out on landing');
  assert.ok(Math.abs(last.x - first.x) < 0.01 && Math.abs(last.y - first.y) < 0.01, 'returns to its own pad');
}
// Cues are ordered and non-overlapping.
for (let i = 1; i < cues.length; i++) {
  assert.ok(cues[i].startS >= cues[i - 1].startS + cues[i - 1].holdS, 'cues do not overlap');
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
