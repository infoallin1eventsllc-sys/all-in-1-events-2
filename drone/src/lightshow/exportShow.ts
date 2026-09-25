import { SHOW_FORMATIONS, Spacer, formationPoints } from '../data/lightShowFormations';
import type { ShowFormation, Vector3D } from '../types/lightShowTypes';
import { PAD_SPACING_M, padXY } from './pads';
import { BRAND } from '../brand';

/**
 * Show package export.
 *
 * Produces the handoff the show-control tools ingest: one CSV per aircraft in the
 * Skybrush / Blender convention ("Time [msec],x [m],y [m],z [m],Red,Green,Blue",
 * z up, metres, linear interpolation between rows) plus a manifest.json with the
 * cue list. Zipped client-side (store-only, no dependency).
 *
 * The timeline is the conductor's, second for second: T+0 is the show clock's 0,
 * cue n starts at the conductor's cue n start, and every animated formation is
 * sampled through its cue exactly as the preview plays it. Each cue opens with a
 * straight-line transition into the formation, aircraft matched to slots so the
 * total squared distance is least (paths that do this do not cross); after the
 * last cue the fleet lands, again matched, one aircraft to a pad.
 *
 * Nothing leaves without a separation check: every pair of aircraft over every
 * row the controller will fly (holds and transitions, the closest point between
 * rows, not just the rows) must stay MIN_SEPARATION_M apart, or the export is
 * refused with the cue, the time and the two aircraft.
 */

export const MIN_SEPARATION_M = 1.5;
const TRANSIT_MPS = 8;      // straight-line transitions, never faster than this
const MIN_TRANSIT_S = 3;
const CUT_MPS = 11;        // inside a cue, where the shape changes outright: the preview's top speed
const LAND_S_MIN = 10;
const SAMPLE_HZ = 2;        // keyframes and CSV rows

interface Key { t: number; x: number; y: number; z: number; r: number; g: number; b: number }
export interface ExportCue { index: number; name: string; startS: number; holdS: number; transitionS: number }
type P3 = { x: number; y: number; z: number };

/**
 * Sim → show frame. The sim is Three.js (y up) with the audience towards -z, so the
 * crowd's right is -x. The package is z up with the audience towards -y. A rotation
 * (determinant +1), never a mirror, so words spell the same way from the crowd.
 */
export const toShowFrame = (p: Vector3D): P3 => ({ x: -p.x, y: p.z, z: p.y });

export const aircraftName = (i: number) => `DRN-${String(i + 1).padStart(3, '0')}`;

/**
 * Minimum-cost assignment (Hungarian, O(n³)): aircraft i → slot out[i], least total
 * squared distance. With synchronised straight lines this is the assignment whose
 * paths never cross (Turpin, Michael & Kumar, CAPT). About 0.3 s for 500 aircraft.
 */
export function assignSlots(from: P3[], to: P3[]): Int32Array {
  const n = from.length, INF = Infinity;
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const dx = from[i].x - to[j].x, dy = from[i].y - to[j].y, dz = from[i].z - to[j].z; C[i * n + j] = dx * dx + dy * dy + dz * dz; }
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1), minv = new Float64Array(n + 1), used = new Uint8Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; minv.fill(INF); used.fill(0);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = C[(i0 - 1) * n + j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Int32Array(n);
  for (let j = 1; j <= n; j++) out[p[j] - 1] = j - 1;
  return out;
}

const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const snap = (s: number) => Math.ceil(s * SAMPLE_HZ - 1e-9) / SAMPLE_HZ;

export interface SeparationViolation { t: number; a: number; b: number; d: number; where: string }

/**
 * Closest approach of every pair between consecutive rows (the controller flies
 * straight lines between them, so each segment's closest point is exact, not
 * sampled). Every track must share the same row times.
 */
export function separationViolations(keys: Key[][], cues: ExportCue[], min = MIN_SEPARATION_M, limit = 8): SeparationViolation[] {
  const n = keys.length, out: SeparationViolation[] = [];
  if (n < 2) return out;
  const rows = keys[0].length;
  const head = new Int32Array(1 << Math.ceil(Math.log2(n * 2))), next = new Int32Array(n), mask = head.length - 1;
  const hash = (x: number, y: number, z: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
  const where = (t: number) => {
    const c = cues.find(q => t >= q.startS - 1e-6 && t <= q.startS + q.holdS + 1e-6);
    if (!c) return t < (cues[0]?.startS ?? 0) ? 'take-off' : 'landing';
    return `cue ${c.index + 1} "${c.name}", ${t < c.startS + c.transitionS ? 'transition in' : 'hold'}`;
  };
  for (let k = 0; k + 1 < rows && out.length < limit; k++) {
    let reach = 0;
    for (let i = 0; i < n; i++) reach = Math.max(reach, dist(keys[i][k], keys[i][k + 1]));
    const cell = min + 2 * reach;   // only pairs this close at the row can meet before the next one
    const c = (v: number) => Math.floor(v / cell);
    head.fill(-1);
    for (let i = 0; i < n; i++) { const a = keys[i][k], h = hash(c(a.x), c(a.y), c(a.z)); next[i] = head[h]; head[h] = i; }
    const hs: number[] = [];
    for (let i = 0; i < n && out.length < limit; i++) {
      const a0 = keys[i][k], a1 = keys[i][k + 1], cx = c(a0.x), cy = c(a0.y), cz = c(a0.z);
      hs.length = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const h = hash(cx + dx, cy + dy, cz + dz); if (hs.includes(h)) continue; hs.push(h);   // two cells can share a bucket
        for (let j = head[h]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const b0 = keys[j][k], b1 = keys[j][k + 1];
          const rx = b0.x - a0.x, ry = b0.y - a0.y, rz = b0.z - a0.z;
          const vx = b1.x - a1.x - rx, vy = b1.y - a1.y - ry, vz = b1.z - a1.z - rz;
          const vv = vx * vx + vy * vy + vz * vz;
          const s = vv > 1e-12 ? Math.max(0, Math.min(1, -(rx * vx + ry * vy + rz * vz) / vv)) : 0;
          const d = Math.hypot(rx + vx * s, ry + vy * s, rz + vz * s);
          if (d < min) {
            const t = a0.t + (a1.t - a0.t) * s;
            out.push({ t, a: i, b: j, d, where: where(t) });
            if (out.length >= limit) break;
          }
        }
      }
    }
  }
  return out;
}

export class SeparationError extends Error {
  constructor(readonly violations: SeparationViolation[]) {
    super(`Show not exported: aircraft come closer than ${MIN_SEPARATION_M} m.\n` + violations.map(v => `  T+${v.t.toFixed(1)} s, ${v.where}: ${aircraftName(v.a)} and ${aircraftName(v.b)} ${v.d.toFixed(2)} m apart`).join('\n'));
    this.name = 'SeparationError';
  }
}

/**
 * Keyframes per aircraft on the conductor's timeline. Throws SeparationError when any
 * two aircraft would come closer than MIN_SEPARATION_M.
 */
export function buildKeyframes(count: number, formations: ShowFormation[] = SHOW_FORMATIONS): { keys: Key[][]; cues: ExportCue[]; totalS: number } {
  const pads: P3[] = Array.from({ length: count }, (_, i) => ({ ...padXY(i, count), z: 0 }));
  const keys: Key[][] = pads.map(p => [{ t: 0, ...p, r: 0, g: 0, b: 0 }]);
  const cues: ExportCue[] = [];
  const dt = 1 / SAMPLE_HZ;
  const frame = (f: ShowFormation, t: number, sp?: Spacer) => formationPoints(f, count, t, sp, dt).map(q => ({ ...toShowFrame(q.pos), c: q.color }));
  let cueStart = 0, cur = pads;
  const last = () => keys.map(k => { const l = k[k.length - 1]; return { x: l.x, y: l.y, z: l.z }; });
  const push = (t: number, pts: ReturnType<typeof frame>, who: Int32Array) => { for (let i = 0; i < count; i++) { const q = pts[who[i]]; keys[i].push({ t, x: q.x, y: q.y, z: q.z, r: q.c.r, g: q.c.g, b: q.c.b }); } };
  /** Straight matched lines from `from` (at cue time `u0`) into `f` as it stands on arrival, no earlier than `earliest`, at `mps` at most. */
  const flyInto = (f: ShowFormation, from: P3[], u0: number, earliest: number, mps: number) => {
    // First guess from how far the furthest aircraft is from any slot (a lower bound, with room), so one assignment usually does.
    let slots = frame(f, earliest);
    const reach = Math.max(...from.map(p => { let m = Infinity; for (const q of slots) m = Math.min(m, dist(p, q)); return m; }));
    let at = Math.max(earliest, u0 + snap((1.3 * reach) / mps)), who: Int32Array;
    if (at > earliest) slots = frame(f, at);
    who = assignSlots(from, slots);
    for (let pass = 0; pass < 4; pass++) {
      const need = Math.max(earliest, u0 + snap(Math.max(...from.map((p, i) => dist(p, slots[who[i]]))) / mps));
      if (need <= at) break;
      at = need; slots = frame(f, at); who = assignSlots(from, slots);
    }
    return { at, who };
  };
  formations.forEach((f, ci) => {
    // Transition in: straight lines from where the fleet is to the formation as it stands `tr` into the cue.
    let { at: u, who } = flyInto(f, cur, 0, MIN_TRANSIT_S, TRANSIT_MPS);
    if (u > f.durationSeconds - dt) throw new Error(`Cue ${ci + 1} "${f.name}" needs ${u} s to fly into but lasts ${f.durationSeconds} s`);
    cues.push({ index: ci, name: f.name, startS: cueStart, holdS: f.durationSeconds, transitionS: u });
    // Hold: each aircraft flies its slot as the formation moves, sampled at the row rate to the end of the cue.
    const sp = new Spacer();   // stepped in time order, so spacing corrections stay continuous from row to row
    const cuts = (f.cuts ?? []).filter(c => c > u).sort((x, y) => x - y);
    push(cueStart + u, frame(f, u, sp), who);
    while (u + dt <= f.durationSeconds + 1e-9) {
      if (cuts.length && u + dt >= cuts[0] - 1e-9) {
        // The shape changes outright here (a new number): matched straight lines into the new one, as fast as the preview flies.
        const c = cuts.shift()!, go = flyInto(f, last(), u, Math.max(u + dt, Math.ceil(c * SAMPLE_HZ - 1e-9) / SAMPLE_HZ), CUT_MPS);
        if (go.at > f.durationSeconds + 1e-9) break;
        u = go.at; who = go.who; sp.reset();
        while (cuts.length && cuts[0] <= u) cuts.shift();
      } else u += dt;
      push(cueStart + u, frame(f, u, sp), who);
    }
    cur = last();
    cueStart += f.durationSeconds;
  });
  // Land: lights fade out on the way down, one aircraft to each pad.
  const home = assignSlots(cur, pads);
  const landT = cueStart + Math.max(LAND_S_MIN, snap(Math.max(...cur.map((p, i) => dist(p, pads[home[i]]))) / TRANSIT_MPS));
  for (let i = 0; i < count; i++) keys[i].push({ t: landT, ...pads[home[i]], r: 0, g: 0, b: 0 });
  const bad = separationViolations(keys, cues);
  if (bad.length) throw new SeparationError(bad);
  return { keys, cues, totalS: landT };
}

function sampleCsv(keys: Key[], totalS: number): string {
  const rows = ['Time [msec],x [m],y [m],z [m],Red,Green,Blue'];
  let k = 0;
  for (let i = 0; i <= Math.round(totalS * SAMPLE_HZ); i++) {
    const t = i / SAMPLE_HZ;
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

/** Build and download `<name>.zip` with drones/DRN-001.csv … and manifest.json. Throws SeparationError rather than export an unsafe show. */
export function downloadShowPackage(showName: string, count: number) {
  const { keys, cues, totalS } = buildKeyframes(count);
  const enc = new TextEncoder();
  const files = keys.map((k, i) => ({ name: `drones/${aircraftName(i)}.csv`, data: enc.encode(sampleCsv(k, totalS)) }));
  const manifest = {
    name: showName, generator: BRAND.name, exportedAt: new Date().toISOString(),
    aircraft: count, durationS: totalS, sampleHz: SAMPLE_HZ,
    units: 'metres, z up, colours 0-255', frame: 'x to the audience\'s right, y away from the audience (audience towards -y), z up; T+0 is the conductor\'s show clock 0',
    padGridSpacingM: PAD_SPACING_M, maxTransitionSpeedMps: TRANSIT_MPS, minSeparationM: MIN_SEPARATION_M,
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
