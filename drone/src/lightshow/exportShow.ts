import { SHOW_FORMATIONS } from '../data/lightShowFormations';

/**
 * Show package export.
 *
 * Produces the handoff the show-control tools ingest: one CSV per aircraft in the
 * Skybrush / Blender convention ("Time [msec],x [m],y [m],z [m],Red,Green,Blue",
 * z up, metres, linear interpolation between rows) plus a manifest.json with the
 * cue list. Zipped client-side (store-only, no dependency).
 *
 * The timeline mirrors the conductor: launch from the pad grid, climb into cue 1,
 * hold each cue for its duration, transition at 5 m/s, land back on the pad.
 */

const SPEED_MPS = 5;
const PAD_SPACING_M = 3.5;
const SAMPLE_HZ = 2;

interface Key { t: number; x: number; y: number; z: number; r: number; g: number; b: number }

function padPositions(count: number) {
  const cols = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => ({ x: ((i % cols) - cols / 2) * PAD_SPACING_M, y: (Math.floor(i / cols) - cols / 2) * PAD_SPACING_M, z: 0 }));
}

/** Keyframes per aircraft. Sim axes are Three.js (y up); export is z up. */
export function buildKeyframes(count: number): { keys: Key[][]; cues: { index: number; name: string; startS: number; holdS: number }[]; totalS: number } {
  const pads = padPositions(count);
  const keys: Key[][] = pads.map(p => [{ t: 0, x: p.x, y: p.y, z: 0, r: 0, g: 0, b: 0 }]);
  const cues: { index: number; name: string; startS: number; holdS: number }[] = [];
  let t = 0;
  let prev = pads.map(p => ({ x: p.x, y: p.y, z: 0 }));
  SHOW_FORMATIONS.forEach((f, ci) => {
    const pts = f.generatePoints(count);
    const next = pts.map(p => ({ x: p.pos.x, y: p.pos.z, z: p.pos.y }));
    const maxDist = Math.max(...next.map((n, i) => Math.hypot(n.x - prev[i].x, n.y - prev[i].y, n.z - prev[i].z)));
    const transition = Math.max(8, maxDist / SPEED_MPS);
    t += transition;
    cues.push({ index: ci, name: f.name, startS: t, holdS: f.durationSeconds });
    for (let i = 0; i < count; i++) {
      const c = pts[i].color;
      keys[i].push({ t, x: next[i].x, y: next[i].y, z: next[i].z, r: c.r, g: c.g, b: c.b });
      keys[i].push({ t: t + f.durationSeconds, x: next[i].x, y: next[i].y, z: next[i].z, r: c.r, g: c.g, b: c.b });
    }
    t += f.durationSeconds;
    prev = next;
  });
  // Land: lights out, straight back to the pad.
  const maxHome = Math.max(...prev.map((p, i) => Math.hypot(p.x - pads[i].x, p.y - pads[i].y, p.z)));
  const landT = t + Math.max(10, maxHome / SPEED_MPS);
  for (let i = 0; i < count; i++) keys[i].push({ t: landT, x: pads[i].x, y: pads[i].y, z: 0, r: 0, g: 0, b: 0 });
  return { keys, cues, totalS: landT };
}

function sampleCsv(keys: Key[], totalS: number): string {
  const rows = ['Time [msec],x [m],y [m],z [m],Red,Green,Blue'];
  let k = 0;
  for (let t = 0; t <= totalS + 1e-6; t += 1 / SAMPLE_HZ) {
    while (k < keys.length - 2 && keys[k + 1].t <= t) k++;
    const a = keys[k], b = keys[Math.min(k + 1, keys.length - 1)];
    const u = b.t === a.t ? 1 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    const L = (p: number, q: number) => p + (q - p) * u;
    rows.push(`${Math.round(t * 1000)},${L(a.x, b.x).toFixed(3)},${L(a.y, b.y).toFixed(3)},${L(a.z, b.z).toFixed(3)},${Math.round(L(a.r, b.r))},${Math.round(L(a.g, b.g))},${Math.round(L(a.b, b.b))}`);
  }
  return rows.join('\n') + '\n';
}

// ---- store-only zip writer ------------------------------------------------

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = [];
  let offset = 0;
  const dosTime = 0, dosDate = (1 << 5) | 1; // fixed timestamp; the files are a snapshot
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length); const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
    v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true); v.setUint32(14, crc, true); v.setUint32(18, f.data.length, true); v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true); v.setUint16(28, 0, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length); const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true); ch.set(name, 46);
    parts.push(lh, f.data); central.push(ch); offset += lh.length + f.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22); const e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd] as unknown as BlobPart[], { type: 'application/zip' });
}

/** Build and download `<name>.zip` with drones/DRN-001.csv … and manifest.json. */
export function downloadShowPackage(showName: string, count: number) {
  const { keys, cues, totalS } = buildKeyframes(count);
  const enc = new TextEncoder();
  const files = keys.map((k, i) => ({ name: `drones/DRN-${String(i + 1).padStart(3, '0')}.csv`, data: enc.encode(sampleCsv(k, totalS)) }));
  const manifest = {
    name: showName, generator: 'All in 1 Drone Command', exportedAt: new Date().toISOString(),
    aircraft: count, durationS: Math.round(totalS), sampleHz: SAMPLE_HZ, units: 'metres, z up, colours 0-255',
    padGridSpacingM: PAD_SPACING_M, transitionSpeedMps: SPEED_MPS,
    cues: cues.map(c => ({ ...c, palette: SHOW_FORMATIONS[c.index].paletteName })),
    import: 'Skybrush Studio for Blender: File → Import → Skybrush CSV (select the drones folder). Verge Aero: import as CSV trajectories.',
  };
  files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) });
  const blob = zipStore(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${showName.replace(/[^\w-]+/g, '_')}_${count}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { files: files.length, durationS: totalS };
}
