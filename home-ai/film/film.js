// "The future, in your hands": a Meridian Interface film, rendered live.
//
// One Three.js scene, driven entirely by the film clock `t` (seconds), so the
// page can play it in real time and scripts/render-film.mjs can step it frame
// by frame into an MP4. Nothing here depends on the previous frame.
//
//   0-5    title
//   5-13   01 Design: the plan is drawn in light on the projection table
//   13-24  02 Structure: the house rises as a wireframe hologram
//   24-33  03 Build: foundation, frame, glass, siding and roof become real
//   33-44  04 Finish: paint, floors, furniture and lights, room by room
//   44-50  05 The AI guide forms from light at the front door
//   50-56  the door's light strip glows, it opens, "Welcome home"
//   56-63  the walkthrough, sensor lines awake in the walls
//   63-76  the control panel
//   76-86  it hands the home over and becomes the panel; pull back at dusk
//   86-92  end card
//
// The house is laid out with Haven's own any-home code (web/building.js), and
// drawn in the same hologram style as Haven's panel (web/holo.js).

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { normalizeHome, sharedStretches } from "../web/building.js";

export const DURATION = 92;

// ---------- the film's house ----------
export const HOME = {
  building: { style: "modern", floors: [{ id: "ground", name: "Ground floor" }, { id: "upper", name: "Upstairs" }] },
  rooms: [
    { id: "garage", name: "Garage", plan: [0, 0, 6, 7] },
    { id: "kitchen", name: "Kitchen", plan: [6, 0, 6, 4.5] },
    { id: "dining", name: "Dining", plan: [12, 0, 4, 4.5] },
    { id: "hall", name: "Entry Hall", kind: "hallway", plan: [6, 4.5, 3, 5.5] },
    { id: "living", name: "Living Room", plan: [9, 4.5, 7, 5.5] },
    { id: "primary", name: "Primary Suite", floor: "upper", plan: [6, 0, 5, 5] },
    { id: "bed2", name: "Bedroom", floor: "upper", plan: [11, 0, 5, 5] },
    { id: "bath", name: "Bath", floor: "upper", plan: [6, 5, 3, 3] },
    { id: "study", name: "Study", kind: "office", floor: "upper", plan: [9, 5, 7, 3] },
  ],
};
const ELEV = { ground: 0, upper: 3.2 };
const WALL = { ground: 3.0, upper: 2.8 };
const DOOR = { x: 7.5, z: 10 };             // front door, south wall of the hall
const PANEL = { x: 9.09, y: 1.45, z: 8.95 }; // on the living room side of the hall wall

// Colors (linear-ish sRGB triples)
const C = {
  primer: [0.72, 0.71, 0.69], paint: [0.93, 0.91, 0.87], render: [0.9, 0.89, 0.86], oakSiding: [0.52, 0.34, 0.19],
  stone: [0.24, 0.24, 0.25], frame: [0.08, 0.08, 0.09], concrete: [0.56, 0.56, 0.55], oak: [0.66, 0.47, 0.3],
  linen: [0.8, 0.76, 0.7], walnut: [0.3, 0.18, 0.1], marble: [0.93, 0.92, 0.9], steel: [0.62, 0.64, 0.66], leaf: [0.16, 0.34, 0.17],
  pot: [0.86, 0.84, 0.8], rug: [0.56, 0.5, 0.44], car: [0.1, 0.12, 0.16], grass: [0.17, 0.3, 0.12], path: [0.46, 0.45, 0.43],
  bark: [0.25, 0.17, 0.1], cabinet: [0.9, 0.88, 0.84], bedding: [0.94, 0.93, 0.9], ink: [0.12, 0.13, 0.15], tile: [0.82, 0.82, 0.8],
};

// ---------- small helpers ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- pieces: every solid part of the house, merged per material ----------
// Each piece carries its own timing as vertex attributes, so one draw call per
// material still lets every wall rise, turn solid and get painted on its own cue.
const kinds = { wall: [], clad: [], glass: [], floor: [], furn: [], glow: [] };
const lineGeos = [];
// Surface textures, drawn in the shader from world position: no image files.
const TEX = { flat: 0, wood: 1, render: 2, stone: 3, concrete: 4, planks: 5, fabric: 6, foliage: 7, roof: 8, grass: 9 };
const NEVER = 1e9;
function piece(kind, geo, { birth, solid, color, paint = -1, lines = true, tex = "flat" }) {
  if (kind !== "glow") solid = NEVER; // the house stays a hologram; only lamps become solid light
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeBoundingBox();
  const n = geo.attributes.position.count, base = geo.boundingBox.min.y;
  const fill = (v) => new THREE.Float32BufferAttribute(new Float32Array(n).fill(v), 1);
  // Assembly: each piece arrives from above and slightly outward, on its own beat, and settles into place.
  const bb = geo.boundingBox, cxp = (bb.min.x + bb.max.x) / 2, czp = (bb.min.z + bb.max.z) / 2;
  const r = rng(Math.round(cxp * 131 + czp * 71 + base * 17 + birth * 13));
  const ox = cxp - 8, oz = czp - 5, ol = Math.hypot(ox, oz) || 1;
  const off = [ox / ol * (1.2 + r() * 1.5) + (r() - 0.5) * 0.8, 2.2 + r() * 2.5, oz / ol * (1.2 + r() * 1.5) + (r() - 0.5) * 0.8];
  const offs = new Float32Array(n * 3); for (let i = 0; i < n; i++) offs.set(off, i * 3);
  geo.setAttribute("aOff", new THREE.Float32BufferAttribute(offs, 3));
  birth += r() * 0.35;
  geo.setAttribute("aBirth", fill(birth));
  geo.setAttribute("aSolid", fill(solid));
  geo.setAttribute("aBase", fill(base));
  geo.setAttribute("aPaint", fill(paint));
  geo.setAttribute("aTex", fill(TEX[tex] ?? 0));
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(color, i * 3);
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "aBirth", "aSolid", "aBase", "aPaint", "aColor", "aTex", "aOff"].includes(k)) geo.deleteAttribute(k);
  kinds[kind].push(geo);
  if (lines) {
    const e = new THREE.EdgesGeometry(geo, 25);
    const m = e.attributes.position.count;
    const f2 = (v) => new THREE.Float32BufferAttribute(new Float32Array(m).fill(v), 1);
    e.setAttribute("aBirth", f2(birth)); e.setAttribute("aSolid", f2(solid)); e.setAttribute("aBase", f2(base));
    const eo = new Float32Array(m * 3); for (let i = 0; i < m; i++) eo.set(off, i * 3);
    e.setAttribute("aOff", new THREE.Float32BufferAttribute(eo, 3));
    lineGeos.push(e);
  }
}
const box = (x0, y0, z0, x1, y1, z1) => {
  const g = new THREE.BoxGeometry(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
const cyl = (x, y0, z, r, h, rTop = r, seg = 20) => { const g = new THREE.CylinderGeometry(rTop, r, h, seg); g.translate(x, y0 + h / 2, z); return g; };
const ball = (x, y, z, r, sy = 1) => { const g = new THREE.SphereGeometry(r, 18, 12); g.scale(1, sy, 1); g.translate(x, y, z); return g; };

// A box along a wall: s0..s1 along the edge, y0..y1 high, off..off+th across it.
function wallBox(edge, s0, s1, y0, y1, off, th) {
  const { p, ux, uz, nx, nz } = edge;
  const a = [p[0] + ux * s0 + nx * off, p[1] + uz * s0 + nz * off];
  const b = [p[0] + ux * s1 + nx * (off + th), p[1] + uz * s1 + nz * (off + th)];
  return box(Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]));
}

// Openings in an outside wall, by room and side.
function openingsFor(room, side, L, floor) {
  const id = room.id;
  if (id === "living" && side === "s") return [{ a: 0.35, b: L - 0.35, sill: 0.05, head: 2.75, glass: true }];
  if (id === "hall" && side === "s") return [{ a: DOOR.x - 6 - 0.6, b: DOOR.x - 6 + 0.6, sill: 0, head: 2.45, door: true }, { a: DOOR.x - 6 + 0.75, b: DOOR.x - 6 + 1.2, sill: 0.05, head: 2.45, glass: true }];
  if (id === "garage" && side === "s") return [{ a: 0.5, b: 5.5, sill: 0, head: 2.4, garage: true }];
  if (id === "garage") return [];
  if (id === "dining" && side === "e") return [{ a: 0.7, b: 3.8, sill: 0.1, head: 2.6, glass: true }];
  if (id === "kitchen" && side === "n") return [{ a: 1.4, b: 4.6, sill: 1.05, head: 2.25, glass: true }];
  if (id === "study" && side === "s") return [{ a: 0.4, b: L - 0.4, sill: 0.05, head: 2.55, glass: true }];
  const n = Math.floor(L / 3.2);
  const out = [];
  for (let i = 0; i < n; i++) { const c = (L * (i + 0.5)) / n; out.push({ a: c - 0.8, b: c + 0.8, sill: floor === "upper" ? 0.7 : 0.8, head: 2.3, glass: true }); }
  return out;
}

const home = normalizeHome(HOME);
const rooms = home.rooms;
const doorLeaf = { geo: null };
const labels = [];

function buildHouse() {
  const byFloor = (f) => rooms.filter((r) => r.floor === f);
  for (const r of rooms) {
    const f = r.floor, y0 = ELEV[f], H = WALL[f];
    const [x, z, w, d] = r.bbox;
    const cx = x + w / 2;
    const riseAt = f === "ground" ? 13.4 + ((cx - 0) / 16) * 2.2 : 16.9 + ((cx - 6) / 10) * 1.8;
    const paintAt = 34.6 + ((cx - 6) / 10) * 2.4;
    labels.push({ text: r.name.toUpperCase(), pos: new THREE.Vector3(cx, y0 + 0.05, z + d / 2), from: 5.6 + ((cx) / 16) * 5.5, floor: f });

    // Floor: oak planks (concrete in the garage), laid in the Finish scene.
    const floorCol = r.id === "garage" ? C.concrete : (r.kind === "kitchen" || r.id === "bath") ? C.tile : C.oak;
    piece("floor", box(x, y0 - 0.08, z, x + w, y0, z + d), { birth: riseAt - 0.4, solid: 24.3, color: floorCol, paint: r.id === "garage" ? -1 : paintAt + 1.0, tex: r.id === "garage" ? "concrete" : floorCol === C.tile ? "flat" : "planks" });

    // Walls from where rooms meet (Haven's sharedStretches): inside walls with
    // doorways, drawn once; outside walls with this house's windows and doors.
    const others = byFloor(f).filter((o) => o !== r);
    const shared = sharedStretches(r, others);
    const n = r.poly.length;
    const [pcx, pcz] = [x + w / 2, z + d / 2];
    for (let i = 0; i < n; i++) {
      const p = r.poly[i], q = r.poly[(i + 1) % n];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L;
      let nx = -uz, nz = ux;
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      if ((mx + nx - pcx) ** 2 + (mz + nz - pcz) ** 2 < (mx - nx - pcx) ** 2 + (mz - nz - pcz) ** 2) { nx = -nx; nz = -nz; }
      const side = Math.abs(nz) > 0.5 ? (nz > 0 ? "s" : "n") : (nx > 0 ? "e" : "w");
      const edge = { p, ux, uz, nx, nz };
      // Split the edge into shared (inside) and open (outside) stretches.
      let cur = 0;
      const spans = [];
      for (const s of shared[i]) { if (s.lo * L > cur + 0.01) spans.push({ a: cur, b: s.lo * L, out: true }); spans.push({ a: s.lo * L, b: s.hi * L, out: false, other: s.other }); cur = Math.max(cur, s.hi * L); }
      if (cur < L - 0.01) spans.push({ a: cur, b: L, out: true });
      // The garage's roof covers it at ground-floor height; the upper floor sits on the rest.
      for (const sp of spans) {
        if (!sp.out) {
          if (r.id > sp.other) continue;
          const len = sp.b - sp.a;
          const pair = [r.id, sp.other].sort().join("-");
          if (pair === "dining-living") { piece("wall", wallBox(edge, sp.a, sp.b, y0, y0 + H, -0.07, 0.14), { birth: riseAt, solid: 24.8, color: C.paint, paint: paintAt }); continue; }
          const dw = pair === "hall-living" ? 1.9 : pair === "dining-kitchen" ? 2.6 : 1.0;
          const wall = (s0, s1, yy0, yy1) => piece("wall", wallBox(edge, s0, s1, y0 + yy0, y0 + yy1, -0.07, 0.14), { birth: riseAt, solid: 24.8, color: C.paint, paint: paintAt });
          if (len > dw + 0.6) {
            // The hall opens into the living room nearer the front, clear of the panel.
            const c = pair === "hall-living" && Math.abs(uz) > 0.5 ? (7.35 - p[1]) / uz : sp.a + len / 2;
            wall(sp.a, c - dw / 2, 0, H); wall(c + dw / 2, sp.b, 0, H); wall(c - dw / 2, c + dw / 2, 2.25, H);
          } else wall(sp.a, sp.b, 0, H);
          continue;
        }
        const ops = openingsFor(r, side, L, f).filter((o) => o.b > sp.a && o.a < sp.b);
        let s = sp.a;
        const inner = (s0, s1, yy0, yy1) => {
          if (s1 - s0 < 0.01 || yy1 - yy0 < 0.01) return;
          piece("wall", wallBox(edge, s0, s1, y0 + yy0, y0 + yy1, -0.08, 0.16), { birth: riseAt, solid: 24.8, color: C.paint, paint: paintAt });
          const clad = r.id === "garage" || (r.id === "hall" && side === "s") ? C.stone : f === "upper" ? C.oakSiding : C.render;
          const tex = clad === C.stone ? "stone" : clad === C.oakSiding ? "wood" : "render";
          piece("clad", wallBox(edge, s0 - (s0 <= 0.01 ? 0.14 : 0), s1 + (s1 >= L - 0.01 ? 0.14 : 0), y0 + yy0 - (yy0 === 0 ? 0.02 : 0), y0 + yy1, 0.08, 0.06), { birth: riseAt + 0.2, solid: 26.8, color: clad, lines: false, tex });
        };
        for (const o of ops) {
          const a = Math.max(o.a, sp.a), b = Math.min(o.b, sp.b);
          inner(s, a, 0, H);
          inner(a, b, 0, o.sill);
          inner(a, b, o.head, H);
          // Frame and glass (or the door / garage door) in the opening.
          const fr = (s0, s1, yy0, yy1) => piece("furn", wallBox(edge, s0, s1, y0 + yy0, y0 + yy1, 0.02, 0.1), { birth: riseAt + 0.3, solid: 26.2, color: C.frame });
          fr(a, a + 0.06, o.sill, o.head); fr(b - 0.06, b, o.sill, o.head); fr(a, b, o.head - 0.06, o.head);
          if (o.sill > 0.02) fr(a, b, o.sill, o.sill + 0.06);
          if (o.glass) {
            piece("glass", wallBox(edge, a + 0.06, b - 0.06, y0 + o.sill + 0.06, y0 + o.head - 0.06, 0.05, 0.02), { birth: riseAt + 0.3, solid: 26.2, color: [0.2, 0.28, 0.34] });
            const mull = Math.floor((b - a) / 1.8);
            for (let k = 1; k <= mull; k++) { const m = a + ((b - a) * k) / (mull + 1); fr(m - 0.025, m + 0.025, o.sill, o.head); }
          }
          if (o.garage) {
            for (let k = 0; k < 5; k++) piece("furn", wallBox(edge, a + 0.06, b - 0.06, y0 + k * 0.47, y0 + k * 0.47 + 0.45, 0.03, 0.05), { birth: riseAt + 0.3, solid: 27.2, color: [0.2, 0.2, 0.21] });
          }
          if (o.door) doorLeaf.span = { edge, a: a + 0.05, b: b - 0.05, y0, h: o.head - 0.05 };
          s = b;
        }
        inner(s, sp.b, 0, H);
      }
    }
  }
  // Ceilings, the upper floor's deck, the terrace and the roofs.
  const g = byFloorBBox("ground");
  piece("wall", box(6, 3.0, 0, 16, 3.14, 10), { birth: 16.3, solid: 25.4, color: C.paint, paint: 34.6 });
  piece("clad", box(-0.14, 2.98, -0.14, 6.14, 3.28, 7.14), { birth: 16.1, solid: 27.6, color: C.frame, tex: "roof" });
  piece("clad", box(5.86, 3.0, 9.86, 16.14, 3.25, 10.14), { birth: 16.4, solid: 25.6, color: C.render, lines: false });
  piece("clad", box(5.4, 6.0, -0.6, 16.7, 6.28, 8.7), { birth: 19.4, solid: 27.8, color: C.frame, tex: "roof" });
  // Fascia in oak under the roof edge, and a slim steel edge to the lower roof.
  piece("clad", box(5.4, 5.72, -0.6, 16.7, 6.0, 8.7), { birth: 19.4, solid: 27.8, color: C.oakSiding, tex: "wood", lines: false });
  piece("clad", box(6.0, 3.14, 8.0, 16.0, 3.25, 9.86), { birth: 19.0, solid: 27.0, color: [0.5, 0.48, 0.45], lines: false });
  // Terrace glass balustrade over the living room.
  piece("glass", box(9.0, 3.25, 9.93, 16.0, 4.25, 9.97), { birth: 19.2, solid: 27.4, color: [0.2, 0.28, 0.34] });
  // Foundation.
  piece("clad", box(-0.3, -0.35, -0.3, g[2] + 0.3, -0.06, g[3] + 0.3), { birth: 13.1, solid: 24.1, color: C.concrete, tex: "concrete" });
  // Stairs up the west side of the hall.
  for (let k = 0; k < 16; k++) piece("furn", box(6.08, k * 0.19, 5.0 + k * 0.22, 7.08, k * 0.19 + 0.19, 5.0 + k * 0.22 + 0.24), { birth: 15.6 + k * 0.03, solid: 25.2, color: C.oak, paint: -1 });
}
function byFloorBBox(f) {
  const bs = rooms.filter((r) => r.floor === f).map((r) => r.bbox);
  const x0 = Math.min(...bs.map((b) => b[0])), z0 = Math.min(...bs.map((b) => b[1]));
  return [x0, z0, Math.max(...bs.map((b) => b[0] + b[2])), Math.max(...bs.map((b) => b[1] + b[3]))];
}

// Furniture, appearing as wireframe light and then turning solid (Finish scene).
function buildFurniture() {
  let i = 0;
  const F = (kind, geo, color, extra = {}) => { const k = i++; piece(kind, geo, { birth: 38 + k * 0.05, solid: 39 + k * 0.05, color, ...extra }); };
  // Living room
  F("furn", box(10.9, 0.001, 5.9, 14.3, 0.012, 8.7), C.rug);
  F("furn", box(14.55, 0, 5.7, 15.5, 0.42, 8.7), C.linen); F("furn", box(15.2, 0.42, 5.7, 15.5, 0.85, 8.7), C.linen);
  F("furn", box(14.55, 0.42, 5.7, 15.2, 0.62, 5.95), C.linen); F("furn", box(14.55, 0.42, 8.45, 15.2, 0.62, 8.7), C.linen);
  F("furn", box(12.4, 0, 6.8, 13.5, 0.38, 7.6), C.walnut);
  F("furn", box(10.7, 0, 6.2, 11.5, 0.42, 7.0), C.linen); F("furn", box(10.7, 0.42, 6.2, 10.85, 0.8, 7.0), C.linen);
  F("furn", box(11.4, 0, 4.58, 14.6, 2.7, 4.95), C.stone);
  F("glow", box(12.3, 0.35, 4.94, 13.7, 0.95, 4.97), [1.0, 0.55, 0.2], { lines: false });
  F("furn", box(9.12, 1.1, 5.4, 9.16, 2.1, 6.9), [0.72, 0.42, 0.26]);
  F("furn", cyl(15.5, 0, 9.4, 0.22, 0.45, 0.26), C.pot); F("furn", ball(15.5, 0.95, 9.4, 0.42, 1.3), C.leaf);
  F("furn", cyl(9.6, 0, 5.1, 0.18, 0.38, 0.2), C.pot); F("furn", ball(9.6, 0.8, 5.1, 0.34, 1.3), C.leaf);
  F("furn", cyl(14.2, 0, 9.3, 0.02, 1.55), C.frame); F("glow", ball(14.2, 1.62, 9.3, 0.16, 0.8), [1.0, 0.82, 0.6], { lines: false });
  // Kitchen
  F("furn", box(7.2, 0, 0.08, 11.8, 0.88, 0.7), C.cabinet); F("furn", box(7.15, 0.88, 0.05, 11.85, 0.93, 0.72), C.marble);
  F("furn", box(7.2, 1.5, 0.08, 11.8, 2.3, 0.44), C.cabinet);
  F("furn", box(6.12, 0, 0.08, 7.1, 2.15, 0.8), C.steel);
  F("furn", box(8.0, 0, 2.1, 10.6, 0.9, 3.05), C.walnut); F("furn", box(7.95, 0.9, 2.05, 10.65, 0.95, 3.1), C.marble);
  for (const sx of [8.5, 9.3, 10.1]) { F("furn", cyl(sx, 0, 3.45, 0.18, 0.72, 0.2), C.ink); }
  for (const sx of [8.6, 9.3, 10.0]) { F("furn", cyl(sx, 2.35, 2.58, 0.006, 0.65), C.ink); F("glow", ball(sx, 2.28, 2.58, 0.1, 0.9), [1.0, 0.8, 0.55], { lines: false }); }
  // Dining
  F("furn", box(12.9, 0.72, 1.8, 15.1, 0.77, 2.8), C.walnut); F("furn", box(13.0, 0, 2.2, 15.0, 0.72, 2.4), C.walnut);
  for (const cx of [13.4, 14.0, 14.6]) for (const cz of [1.45, 3.15]) { F("furn", box(cx - 0.22, 0, cz - 0.22, cx + 0.22, 0.46, cz + 0.22), C.linen); F("furn", box(cx - 0.22, 0.46, cz + (cz < 2 ? -0.22 : 0.18), cx + 0.22, 0.95, cz + (cz < 2 ? -0.18 : 0.22)), C.linen); }
  F("glow", box(13.3, 2.05, 2.25, 14.7, 2.1, 2.35), [1.0, 0.8, 0.55], { lines: false });
  // Hall: console and the panel's wall
  F("furn", box(8.55, 0, 8.4, 8.95, 0.8, 9.6), C.walnut);
  // Garage: car and water heater
  F("furn", box(1.2, 0.3, 1.2, 4.6, 0.95, 5.6), C.car); F("furn", box(1.5, 0.95, 2.3, 4.3, 1.45, 4.4), [0.14, 0.18, 0.24]);
  for (const [wx, wz] of [[1.25, 2.0], [4.55, 2.0], [1.25, 4.8], [4.55, 4.8]]) { const gw = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18); gw.rotateZ(Math.PI / 2); gw.translate(wx, 0.33, wz); F("furn", gw, C.ink); }
  F("furn", cyl(0.6, 0, 0.6, 0.3, 1.5), [0.8, 0.8, 0.78]);
  // Upstairs
  F("furn", box(7.2, 0, 0.3, 9.4, 0.5, 2.5).translate(0, 3.2, 0), C.bedding); F("furn", box(7.2, 0, 0.1, 9.4, 1.1, 0.3).translate(0, 3.2, 0), C.walnut);
  F("furn", box(12.3, 0, 0.3, 14.1, 0.5, 2.3).translate(0, 3.2, 0), C.bedding); F("furn", box(12.3, 0, 0.1, 14.1, 1.0, 0.3).translate(0, 3.2, 0), C.walnut);
  F("furn", box(11.0, 0.72, 5.3, 12.8, 0.76, 6.0).translate(0, 3.2, 0), C.walnut);
  F("furn", box(6.2, 0, 5.2, 7.4, 0.85, 5.8).translate(0, 3.2, 0), C.marble);
}

// Landscape: lawn, driveway, path, planters and trees (Build scene).
function buildLandscape() {
  piece("furn", box(0.4, -0.05, 7.14, 5.6, 0.02, 20), { birth: 22, solid: 25.5, color: C.concrete, lines: false, tex: "concrete" });
  piece("furn", box(7.0, -0.05, 10.1, 8.0, 0.025, 20), { birth: 22, solid: 25.7, color: C.path, lines: false, tex: "concrete" });
  piece("furn", box(9.2, 0, 10.35, 15.8, 0.45, 10.95), { birth: 22, solid: 27.5, color: C.stone, lines: false, tex: "stone" });
  for (let k = 0; k < 7; k++) piece("furn", ball(9.7 + k * 1.0, 0.62, 10.65, 0.36, 0.7), { birth: 22, solid: 28 + k * 0.05, color: C.leaf, lines: false, tex: "foliage" });
  const trees = [[-4, -3, 1.2], [19.5, -2, 1.0], [21, 12.5, 1.3], [-3.5, 12, 0.9], [23, 5, 1.1], [-6, 4, 1.15], [12, -5, 1.0]];
  let seed = 11;
  for (const [tx, tz, s] of trees) {
    const r = rng(seed++);
    piece("furn", cyl(tx, 0, tz, 0.17 * s, 2.3 * s, 0.09 * s, 10), { birth: 22, solid: 28.3, color: C.bark, lines: false, tex: "wood" });
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2, br = new THREE.CylinderGeometry(0.03 * s, 0.07 * s, 1.4 * s, 6);
      br.translate(0, 0.7 * s, 0); br.rotateZ(0.6 + r() * 0.5); br.rotateY(a); br.translate(tx, 1.7 * s + k * 0.3 * s, tz);
      piece("furn", br, { birth: 22, solid: 28.3, color: C.bark, lines: false });
    }
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2, d = (k ? 0.45 + r() * 0.5 : 0) * s, rad = (k ? 0.75 + r() * 0.35 : 1.25) * s;
      const cx = tx + Math.cos(a) * d, cz = tz + Math.sin(a) * d, cy = (2.6 + (k ? r() * 1.1 : 0.7)) * s;
      const g2 = new THREE.IcosahedronGeometry(rad, 3), pa = g2.attributes.position, off = r() * 100;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const n = 0.82 + 0.3 * Math.abs(Math.sin(x * 3.1 + off) * Math.cos(y * 2.7 + off) + 0.5 * Math.sin(z * 4.3 + y * 2.0));
        pa.setXYZ(i, x * n, y * n * 0.92, z * n);
      }
      g2.computeVertexNormals(); g2.translate(cx, cy, cz);
      const shade = 0.8 + r() * 0.4;
      piece("furn", g2, { birth: 22, solid: 28.5 + k * 0.05, color: [C.leaf[0] * shade, C.leaf[1] * shade, C.leaf[2] * shade], lines: false, tex: "foliage" });
    }
  }
}

// ---------- shaders ----------
const U = {
  uT: { value: 0 }, uPrimer: { value: new THREE.Color(...C.primer) }, uCutY: { value: 99 }, uHolo: { value: 1 },
  uScan: { value: -10 }, uHoloColor: { value: new THREE.Color(0.36, 0.82, 1.0) }, uLights: { value: 0 }, uWarm: { value: 0 }, uGain: { value: 1 },
};
const HASH = `float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.25 + vnoise(p * 4.11) * 0.125 + vnoise(p * 8.3) * 0.0625; }
  // Surfaces from world position: returns a colour multiplier and writes roughness.
  vec3 surface(float tex, vec3 p, vec3 base, inout float rough){
    if (tex < 0.5) { rough = 0.88 + 0.06 * vnoise(p * 9.0); return base * (0.965 + 0.05 * fbm(p * 5.0)); } // paint
    if (tex < 1.5) { // horizontal oak boards, 0.18 m, with grain and dark gaps
      float row = floor(p.y / 0.18); float gap = smoothstep(0.93, 0.985, fract(p.y / 0.18)) + smoothstep(0.03, 0.0, fract(p.y / 0.18));
      float grain = fbm(vec3(p.x * 1.5, row * 7.0 + p.y * 40.0, p.z * 1.5)); float v = hash3(vec3(row, floor(p.x / 2.4 + row * 0.37), 1.0));
      rough = 0.55 + grain * 0.2; return base * (0.72 + 0.42 * grain + 0.14 * v) * (1.0 - 0.55 * gap); }
    if (tex < 2.5) { float n = fbm(p * 9.0); rough = 0.85 + n * 0.1; return base * (0.9 + 0.16 * n); } // render
    if (tex < 3.5) { // stone blocks, staggered courses, mortar lines
      float course = floor(p.y / 0.32); float sx = (p.x + p.z) + course * 0.53; float blk = floor(sx / 0.75);
      float mortar = max(smoothstep(0.9, 0.97, fract(p.y / 0.32)), smoothstep(0.92, 0.985, fract(sx / 0.75)));
      float v = hash3(vec3(course, blk, 2.0)); float n = fbm(p * 12.0);
      rough = 0.8; return mix(base * (0.78 + 0.4 * v + 0.15 * n), vec3(0.42, 0.42, 0.4), mortar); }
    if (tex < 4.5) { float n = fbm(p * 5.0); rough = 0.88; return base * (0.86 + 0.22 * n) * (1.0 - 0.3 * step(0.985, fract(p.z / 3.0))); } // concrete slabs
    if (tex < 6.5) { rough = 0.65; return base; }
    if (tex < 7.5) { float n = fbm(p * 2.5); rough = 0.9; return base * (0.7 + 0.6 * n); } // foliage
    if (tex < 8.5) { float n = fbm(p * 6.0); rough = 0.75; return base * (0.85 + 0.3 * n); } // roof membrane
    return base;
  }`;
function patch(mat, { planks = false, glow = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aBirth; attribute float aSolid; attribute float aBase; attribute float aPaint; attribute vec3 aColor; attribute float aTex;
        uniform float uT; varying float vSolid; varying float vPaint; varying vec3 vCol; varying vec3 vWorld; varying float vTex;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vSolid = aSolid; vPaint = aPaint; vCol = aColor; vTex = aTex;
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uT; uniform vec3 uPrimer; uniform float uCutY; uniform float uLights; uniform vec3 uHoloColor;
        varying float vSolid; varying float vPaint; varying vec3 vCol; varying vec3 vWorld; varying float vTex; ${HASH}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        if (vWorld.y > uCutY && vWorld.x > -0.6 && vWorld.x < 16.8 && vWorld.z > -0.8 && vWorld.z < 10.4) discard;
        float raw = (uT - vSolid - vWorld.y * 0.22) / 0.9;
        float prog = clamp(raw, 0.0, 1.0);
        float nz = hash3(floor(vWorld * 16.0));
        if (nz > prog) discard;
        // A thin glowing edge where the surface is turning solid, gone once it's done.
        float front = (1.0 - smoothstep(0.0, 0.06, prog - nz)) * (1.0 - smoothstep(0.85, 1.0, raw));`)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", planks ? `
        float pk = vPaint < 0.0 ? 1.0 : clamp((uT - vPaint) / 0.6, 0.0, 1.0);
        vec2 q = vWorld.xz; float row = floor(q.y / 0.21); float off = fract(sin(row * 12.9898) * 43758.5) * 3.0;
        float plank = floor((q.x + off) / 1.5); float v = fract(sin(row * 78.233 + plank * 37.719) * 43758.5);
        float seam = max(step(0.965, fract(q.y / 0.21)), step(0.99, fract((q.x + off) / 1.5)));
        vec3 finish = vPaint < 0.0 ? vCol : vCol * (0.84 + 0.28 * v) * (1.0 - 0.3 * seam);
        vec4 diffuseColor = vec4(mix(vec3(0.5, 0.5, 0.49), finish, pk), opacity);` : `
        vec3 baseCol = vPaint < 0.0 ? vCol : mix(uPrimer, vCol, clamp((uT - vPaint) / 0.6, 0.0, 1.0));
        float roughT = roughness;
        baseCol = surface(vTex, vWorld, baseCol, roughT);
        vec4 diffuseColor = vec4(baseCol, opacity);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        if (vTex > 0.5) roughnessFactor = roughT;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += uHoloColor * front * 0.6;
        ${glow ? "totalEmissiveRadiance += vCol * (0.3 + 1.6 * uLights);" : ""}
        if (vPaint >= 0.0) totalEmissiveRadiance += uHoloColor * exp(-pow((uT - vPaint - 0.25) / 0.22, 2.0)) * 0.5;`);
  };
  return mat;
}
// The shadow-map twin of patch(): shadows rise, dissolve in and cut away with the surface.
function depthTwin() {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aBirth; attribute float aSolid; attribute float aBase; uniform float uT; varying float vSolid; varying vec3 vWorld;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vSolid = aSolid; vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uT; uniform float uCutY; varying float vSolid; varying vec3 vWorld; ${HASH}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        if (vWorld.y > uCutY && vWorld.x > -0.6 && vWorld.x < 16.8 && vWorld.z > -0.8 && vWorld.z < 10.4) discard;
        float prog = clamp((uT - vSolid - vWorld.y * 0.22) / 0.9, 0.0, 1.0);
        if (hash3(floor(vWorld * 16.0)) > prog) discard;`);
  };
  return mat;
}

const HOLO_LINE_V = `attribute float aBirth; attribute float aSolid; attribute float aBase; attribute vec3 aOff; uniform float uT;
  varying float vA; varying float vY; varying float vD; varying float vFlash;
  void main(){
    vec3 p = position;
    float k = clamp((uT - aBirth) / 1.5, 0.0, 1.0);
    float c1 = 1.70158, c3 = c1 + 1.0, km = k - 1.0;
    float e = 1.0 + c3 * km * km * km + c1 * km * km;   // settles with a small overshoot
    p += aOff * (1.0 - e);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vY = w.y;
    float appear = clamp((uT - aBirth) / 0.45, 0.0, 1.0);
    vFlash = exp(-pow((uT - aBirth - 1.4) / 0.22, 2.0));
    float prog = clamp((uT - aSolid - w.y * 0.22) / 0.9, 0.0, 1.0);
    vA = appear * (1.0 - prog * 0.93);
    vec4 mv = viewMatrix * w; vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const HOLO_LINE_F = `uniform vec3 uHoloColor; uniform float uHolo; uniform float uScan; uniform float uCutY; uniform float uWarm; uniform float uGain; varying float vA; varying float vY; varying float vD; varying float vFlash;
  void main(){ if (vY > uCutY || vA < 0.002) discard; float s = exp(-pow((vY - uScan) / 0.12, 2.0)) + vFlash * 1.6;
    vec3 c = mix(uHoloColor, vec3(1.0, 0.72, 0.4), uWarm * smoothstep(3.4, 0.2, vY) * 0.7);
    float near = mix(1.0, 0.18 + 0.82 * smoothstep(0.3, 5.0, vD), 1.0 - uGain);
    gl_FragColor = vec4(c * (0.5 + s * 1.3) * vA * uHolo * near * mix(1.0, 0.55, 1.0 - uGain), 1.0); }`;
const RIM_V = `attribute float aBirth; attribute float aSolid; attribute float aBase; attribute vec3 aOff; uniform float uT;
  varying vec3 vN; varying vec3 vV; varying float vA; varying float vY; varying float vD;
  void main(){
    vec3 p = position;
    float k = clamp((uT - aBirth) / 1.5, 0.0, 1.0);
    float c1 = 1.70158, c3 = c1 + 1.0, km = k - 1.0;
    float e = 1.0 + c3 * km * km * km + c1 * km * km;   // settles with a small overshoot
    p += aOff * (1.0 - e);
    vec4 w = modelMatrix * vec4(p, 1.0); vY = w.y;
    float appear = clamp((uT - aBirth) / 0.45, 0.0, 1.0);
    float prog = clamp((uT - aSolid - w.y * 0.22) / 0.9, 0.0, 1.0);
    vA = appear * (1.0 - prog);
    vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const RIM_F = `uniform vec3 uHoloColor; uniform float uHolo; uniform float uScan; uniform float uCutY; uniform float uWarm; uniform float uGain; varying vec3 vN; varying vec3 vV; varying float vA; varying float vY; varying float vD;
  void main(){ if (vY > uCutY || vA < 0.002) discard; float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
    float s = exp(-pow((vY - uScan) / 0.25, 2.0));
    vec3 c = mix(uHoloColor, vec3(1.0, 0.72, 0.4), uWarm * smoothstep(3.4, 0.2, vY) * 0.7);
    float near = mix(1.0, 0.1 + 0.9 * smoothstep(0.3, 6.0, vD), 1.0 - uGain);
    gl_FragColor = vec4(c * (f * 0.16 + 0.012 + s * 0.08 + uWarm * 0.01) * vA * uHolo * near * mix(1.0, 0.4, 1.0 - uGain), 1.0); }`;

// ---------- the AI guide ----------
const GUIDE_V = `varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const GUIDE_F = `uniform vec3 uColor; uniform float uAlpha; uniform float uT; uniform float uVoice; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.7);
    float scan = 0.72 + 0.28 * step(0.5, fract(vW.y * 38.0 - uT * 1.6));
    float band = exp(-pow(fract(vW.y * 0.35 - uT * 0.25) - 0.5, 2.0) * 90.0) * 0.5;
    vec3 c = uColor * (0.1 + f * 1.25 + band) * scan * (1.0 + uVoice * 0.6);
    gl_FragColor = vec4(c * uAlpha, 1.0); }`;
function buildGuide() {
  const mat = new THREE.ShaderMaterial({ vertexShader: GUIDE_V, fragmentShader: GUIDE_F, uniforms: { uColor: { value: new THREE.Color(0.55, 0.88, 1.0) }, uAlpha: { value: 0 }, uT: U.uT, uVoice: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const root = new THREE.Group();
  const part = (geo, parent, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const hips = joint(root, 0, 0.95, 0);
  part(cap(0.14, 0.1), hips, 0, 0.02, 0, 1.15, 1, 0.8);
  const chest = joint(hips, 0, 0.12, 0);
  part(cap(0.165, 0.3), chest, 0, 0.26, 0, 1.2, 1, 0.72);
  part(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 12), chest, 0, 0.56, 0);
  const head = joint(chest, 0, 0.62, 0);
  part(new THREE.SphereGeometry(0.108, 22, 16), head, 0, 0.11, 0.01, 0.9, 1.12, 1.0);
  const arm = (sx) => {
    const sh = joint(chest, sx * 0.23, 0.46, 0);
    part(cap(0.05, 0.22), sh, 0, -0.16, 0);
    const el = joint(sh, 0, -0.32, 0);
    part(cap(0.043, 0.2), el, 0, -0.14, 0);
    part(new THREE.SphereGeometry(0.05, 12, 10), el, 0, -0.3, 0.01, 0.8, 1.2, 0.6);
    return { sh, el };
  };
  const leg = (sx) => {
    const hp = joint(hips, sx * 0.09, -0.03, 0);
    part(cap(0.074, 0.34), hp, 0, -0.22, 0);
    const kn = joint(hp, 0, -0.45, 0);
    part(cap(0.058, 0.34), kn, 0, -0.22, 0);
    part(new THREE.BoxGeometry(0.09, 0.06, 0.24), kn, 0, -0.44, 0.05);
    return { hp, kn };
  };
  const g = { root, mat, hips, chest, head, L: arm(1), R: arm(-1), LL: leg(1), RL: leg(-1) };
  // The particles it forms from, and later becomes the panel from.
  const N = 2600, r = rng(7);
  const target = new Float32Array(N * 3), start = new Float32Array(N * 3), pos = new Float32Array(N * 3);
  root.updateMatrixWorld(true);
  const meshes = []; root.traverse((o) => o.isMesh && meshes.push(o));
  for (let i = 0; i < N; i++) {
    const m = meshes[Math.floor(r() * meshes.length)];
    const pa = m.geometry.attributes.position, k = Math.floor(r() * pa.count);
    const v = new THREE.Vector3(pa.getX(k), pa.getY(k), pa.getZ(k)).applyMatrix4(m.matrixWorld);
    target.set([v.x, v.y, v.z], i * 3);
    const a = r() * Math.PI * 2, rad = 0.3 + r() * 1.6;
    start.set([Math.cos(a) * rad, r() * 3.2, Math.sin(a) * rad], i * 3);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: new THREE.Color(0.6, 0.9, 1.0), size: 0.028, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  g.points = new THREE.Points(pg, pm); g.pTarget = target; g.pStart = start; g.pPos = pos;
  return g;
}
function poseGuide(g, { walk = 0, phase = 0, gesture = 0, wave = 0, turn = 0 }) {
  const s = Math.sin(phase);
  g.LL.hp.rotation.x = s * 0.5 * walk; g.RL.hp.rotation.x = -s * 0.5 * walk;
  g.LL.kn.rotation.x = Math.max(0, -s) * 0.7 * walk; g.RL.kn.rotation.x = Math.max(0, s) * 0.7 * walk;
  g.hips.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.025 * walk;
  g.L.sh.rotation.x = -s * 0.35 * walk; g.L.sh.rotation.z = 0.08; g.L.el.rotation.x = -0.15;
  // The right arm: opening toward the door or the panel ("come in", "this is where we'll talk").
  g.R.sh.rotation.x = s * 0.35 * walk * (1 - gesture) - gesture * 0.55;
  g.R.sh.rotation.z = -0.08 - gesture * 0.95 - wave * 0.15;
  g.R.el.rotation.x = -0.2 - gesture * 0.5;
  g.head.rotation.y = turn; g.chest.rotation.y = turn * 0.3;
}

// ---------- the panel on the wall ----------
function buildPanel() {
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 420;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), mat);
  screen.position.set(PANEL.x + 0.012, PANEL.y, PANEL.z); screen.rotation.y = Math.PI / 2;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.33, 0.49), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.4 }));
  bezel.position.set(PANEL.x, PANEL.y, PANEL.z);
  return { cv, tex, screen, bezel, mat, drawn: "" };
}
function drawPanel(p, t) {
  const glow = smooth(80.0, 81.2, t), tap = t - 81.9;
  const key = `${Math.round(glow * 20)}:${tap > 0 && tap < 1.2 ? Math.round(tap * 24) : -1}:${t > 60 ? 1 : 0}`;
  if (key === p.drawn) return;
  p.drawn = key;
  const g = p.cv.getContext("2d"), W = 640, H = 420;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#08131f"); bg.addColorStop(1, "#050a12");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = `rgba(90,210,255,${0.06 + glow * 0.12})`; g.fillRect(0, 0, W, H);
  g.fillStyle = "#e8f6ff"; g.font = "600 30px 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif"; g.fillText("Haven", 32, 54);
  g.fillStyle = "#8fb4cc"; g.font = "400 20px 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif"; g.fillText("Good evening. Everything is calm.", 32, 86);
  // A tiny hologram of this house.
  g.save(); g.translate(430, 205); g.strokeStyle = `rgba(110,215,255,${0.75 + glow * 0.25})`; g.lineWidth = 2;
  const iso = (x, y, z) => [(x - z) * 9, (x + z) * 4.5 - y * 11];
  const boxL = (x0, z0, x1, z1, h, y0 = 0) => {
    const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (const yy of [y0, y0 + h]) { g.beginPath(); c.forEach(([x, z], i) => { const [a, b] = iso(x, yy, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.stroke(); }
    for (const [x, z] of c) { const [a, b] = iso(x, y0, z), [a2, b2] = iso(x, y0 + h, z); g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke(); }
  };
  boxL(-8, -5, -2, 2, 3); boxL(-2, -5, 8, 5, 3); boxL(-2, -5, 8, 3, 2.8, 3.2);
  g.restore();
  const rows = [["Doors", "Locked"], ["Water", "Normal"], ["Air", "72°"], ["Garage", "Closed"]];
  g.font = "500 22px 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif";
  rows.forEach(([a, b], i) => { const y = 150 + i * 56; g.fillStyle = "#6fd3ff"; g.beginPath(); g.arc(40, y - 7, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = "#cfe6f5"; g.fillText(a, 58, y); g.fillStyle = "#ffffff"; g.fillText(b, 170, y); });
  if (tap > 0 && tap < 1.2) { g.strokeStyle = `rgba(160,230,255,${1 - tap / 1.2})`; g.lineWidth = 4; g.beginPath(); g.arc(430, 205, 20 + tap * 190, 0, Math.PI * 2); g.stroke(); }
  p.tex.needsUpdate = true;
}

// ---------- sensor lines: the house's nervous system, converging on the panel ----------
function buildSensors() {
  const nodes = [
    [DOOR.x + 0.62, 2.35, 9.9], [12.5, 2.8, 9.9], [9.3, 0.95, 0.4], [3.0, 2.5, 6.9], [0.6, 1.4, 0.6], [15.9, 1.9, 2.3], [15.8, 2.9, 4.7], [9.3, 2.9, 4.6],
  ];
  const pts = [], ts = [];
  const top = [PANEL.x + 0.03, 2.95, PANEL.z], end = [PANEL.x + 0.03, PANEL.y + 0.2, PANEL.z];
  let maxLen = 0;
  for (const n of nodes) {
    const path = [n, [n[0], 2.95, n[2]], [top[0], 2.95, n[2]], top, end];
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      pts.push(...a, ...b); ts.push(acc, acc + l); acc += l;
    }
    maxLen = Math.max(maxLen, acc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uGrow: { value: 0 }, uAmp: { value: 0 }, uColor: U.uHoloColor },
    vertexShader: "attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uT; uniform float uGrow; uniform float uAmp; uniform vec3 uColor; varying float vT;
      void main(){ if (vT > uGrow) discard; float p = fract(vT * 0.33 - uT * 0.9); float pulse = smoothstep(0.75, 1.0, p) * 2.2;
        gl_FragColor = vec4(uColor * (0.35 + pulse + uAmp) , 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  const dots = new THREE.Group();
  for (const n of nodes) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.9, 1.0).multiplyScalar(2), transparent: true, opacity: 0 })); m.position.set(...n); dots.add(m); }
  return { lines, mat, dots, maxLen };
}

// ---------- camera: one function per shot ----------
function shotCamera(t) {
  const tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  let fov = 38;
  if (t < 13) {           // Design: looking down at the table
    const k = ease(clamp01((t - 4) / 9));
    pos.set(lerp(9, 7.5, k), lerp(26, 18.5, k), lerp(22, 17, k)); tgt.set(8, 0, 4.6);
  } else if (t < 24) {    // Structure: orbiting the rising hologram
    const k = ease(clamp01((t - 13) / 11)), a = lerp(0.55, 0.55 + Math.PI * 1.1, k), R = lerp(23, 21, k);
    pos.set(8 + Math.cos(a) * R, lerp(11, 7.5, k), 5 + Math.sin(a) * R); tgt.set(8, 2.6, 5);
  } else if (t < 33) {    // Detail: the orbit eases into a front three-quarter view, then keeps drifting
    const a0 = 0.55 + Math.PI * 1.1;
    const orbitEnd = new THREE.Vector3(8 + Math.cos(a0) * 21, 7.5, 5 + Math.sin(a0) * 21);
    const k = ease(clamp01((t - 24) / 9));
    pos.copy(orbitEnd).lerp(new THREE.Vector3(22, 9.5, 25), k); tgt.set(8.5, lerp(2.6, 2.0, k), 5);
  } else if (t < 44) {    // Furnish: the same move continues up and in, looking down into the rooms
    const k = ease(clamp01((t - 33) / 11));
    pos.set(lerp(22, 15.2, k), lerp(9.5, 9.8, k), lerp(25, 14.8, k)); tgt.set(lerp(8.5, 11, k), lerp(2.0, 0.6, k), lerp(5, 5.4, k));
  } else if (t < 50) {    // ...and sweeps down to the front door as the guide forms
    const k = ease(clamp01((t - 44) / 6));
    pos.set(lerp(15.2, 8.4, k), lerp(9.8, 1.65, k), lerp(14.8, 15.2, k)); tgt.set(lerp(11, 7.6, k), lerp(0.6, 1.35, k), lerp(5.4, 10.6, k)); fov = lerp(38, 36, k);
  } else if (t < 56) {    // The door opens and the client walks in (the camera is the client)
    const k = ease(clamp01((t - 52.8) / 3.2));
    pos.set(lerp(8.2, 7.5, k), 1.62 + Math.sin(k * Math.PI * 4) * 0.012, lerp(15.2, 8.9, k)); tgt.set(lerp(7.6, 9.8, k), 1.35, lerp(10.6, 7.6, smooth(0.5, 1, k)));
    fov = lerp(36, 52, k);
  } else if (t < 63) {    // Walkthrough, following the guide into the living room
    const k = ease(clamp01((t - 56) / 7));
    const way = [[7.5, 8.9], [8.3, 7.7], [10.0, 7.35], [12.2, 8.3], [13.9, 9.35]];
    const f = k * (way.length - 1), j = Math.min(way.length - 2, Math.floor(f)), kk = f - j;
    pos.set(lerp(way[j][0], way[j + 1][0], kk), 1.6, lerp(way[j][1], way[j + 1][1], kk));
    tgt.set(lerp(10.2, 10.0, k), lerp(1.4, 1.5, k), lerp(7.0, 6.8, k)); fov = 52;
  } else if (t < 82) {    // The panel
    const k = ease(clamp01((t - 63) / 13));
    pos.set(lerp(13.9, 12.6, k), lerp(1.6, 1.55, k), lerp(9.35, 9.5, k)); tgt.set(lerp(10.0, 9.3, k), lerp(1.5, 1.35, k), lerp(6.8, 8.45, k)); fov = lerp(52, 42, k);
  } else {                // Pull back out through the glass at dusk
    const k = ease(clamp01((t - 82) / 4.5));
    const a = new THREE.Vector3(12.6, 1.55, 9.5), b = new THREE.Vector3(13.2, 2.1, 14), c = new THREE.Vector3(24, 6.5, 30);
    pos.copy(k < 0.4 ? a.clone().lerp(b, k / 0.4) : b.clone().lerp(c, (k - 0.4) / 0.6)); tgt.set(lerp(9.3, 8.5, k), lerp(1.35, 2.8, k), lerp(8.45, 5, k)); fov = lerp(44, 38, k);
  }
  return { pos, tgt, fov };
}

// Where the guide is and what it's doing.
function guideState(t) {
  const P = (x, z) => new THREE.Vector3(x, 0, z);
  const path = [
    [44, P(7.5, 11.3)], [52.6, P(7.5, 11.3)], [53.6, P(6.85, 10.9)], [55.4, P(6.85, 10.9)],
    [56.2, P(7.4, 9.2)], [57.6, P(8.6, 7.4)], [59.2, P(10.8, 6.6)], [60.6, P(11.6, 6.9)], [62.2, P(11.0, 7.6)], [63.8, P(9.75, 8.05)], [99, P(9.75, 8.05)],
  ];
  let i = 0; while (i < path.length - 2 && t > path[i + 1][0]) i++;
  const [t0, a] = path[i], [t1, b] = path[i + 1];
  const k = clamp01((t - t0) / (t1 - t0));
  const pos = a.clone().lerp(b, k);
  const moving = t > t0 && t < t1 && a.distanceTo(b) > 0.05 ? 1 : 0;
  const dir = b.clone().sub(a);
  let yaw = moving ? Math.atan2(dir.x, dir.z) : 0;
  const cam = shotCamera(t).pos;
  if (!moving) yaw = Math.atan2(cam.x - pos.x, cam.z - pos.z);
  if (t > 64 && t < 66.5) yaw = lerp(yaw, -Math.PI / 2, smooth(64.5, 65.2, t) * (1 - smooth(65.8, 66.4, t)));
  const gesture = Math.max(smooth(53.0, 53.8, t) * (1 - smooth(55.2, 55.9, t)), smooth(64.6, 65.4, t) * (1 - smooth(68.5, 69.5, t)), smooth(59.2, 59.8, t) * (1 - smooth(60.8, 61.4, t)) * 0.8, smooth(77.5, 78.3, t) * (1 - smooth(79.4, 80.0, t)) * 0.6);
  const walk = moving ? Math.min(1, smooth(0, 0.12, k) + 0.001) * (1 - smooth(0.9, 1, k)) : 0;
  return { pos, yaw, walk, phase: t * 7.2, gesture };
}

// ---------- the film ----------
export async function createFilm(canvas, { width, height, voice = [] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 400);

  buildHouse(); buildFurniture(); buildLandscape();
  const matFor = {
    wall: patch(new THREE.MeshStandardMaterial({ roughness: 0.92, envMapIntensity: 0.35 })),
    clad: patch(new THREE.MeshPhysicalMaterial({ roughness: 0.8, envMapIntensity: 0.4 })),
    glass: patch(new THREE.MeshPhysicalMaterial({ roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 1.6, reflectivity: 0.9 })),
    floor: patch(new THREE.MeshPhysicalMaterial({ roughness: 0.45, envMapIntensity: 0.5 }), { planks: true }),
    furn: patch(new THREE.MeshStandardMaterial({ roughness: 0.7, envMapIntensity: 0.35 })),
    glow: patch(new THREE.MeshStandardMaterial({ roughness: 0.5 }), { glow: true }),
  };
  const house = new THREE.Group(); scene.add(house);
  const rimMat = new THREE.ShaderMaterial({ vertexShader: RIM_V, fragmentShader: RIM_F, uniforms: U, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [k, list] of Object.entries(kinds)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list);
    if (k === "glow") house.add(new THREE.Mesh(geo, matFor.glow));
    if (k !== "glow") { const rim = new THREE.Mesh(geo, rimMat); rim.renderOrder = 3; house.add(rim); }
  }
  const lines = new THREE.LineSegments(mergeGeometries(lineGeos), new THREE.ShaderMaterial({ vertexShader: HOLO_LINE_V, fragmentShader: HOLO_LINE_F, uniforms: U, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lines.renderOrder = 4; house.add(lines);

  // The front door leaf, hinged on its west side, opening inward.
  const ds = doorLeaf.span;
  const dxA = ds.edge.p[0] + ds.edge.ux * ds.a, dxB = ds.edge.p[0] + ds.edge.ux * ds.b;
  const dx0 = Math.min(dxA, dxB), dx1 = Math.max(dxA, dxB);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(dx0, ds.y0, 10.0);
  piece("furn", box(0, 0, -0.045, dx1 - dx0, ds.h, 0.045), { birth: 14.5, solid: NEVER, color: C.walnut, lines: false });
  const doorGeo = kinds.furn.pop();
  const doorEdges = new THREE.EdgesGeometry(doorGeo, 25);
  for (const [name, v] of [["aBirth", 14.5], ["aSolid", NEVER], ["aBase", 0]]) doorEdges.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(doorEdges.attributes.position.count).fill(v), 1));
  { const o = doorGeo.attributes.aOff, m = doorEdges.attributes.position.count, eo = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) eo.set([o.getX(0), o.getY(0), o.getZ(0)], i * 3);
    doorEdges.setAttribute("aOff", new THREE.Float32BufferAttribute(eo, 3)); }
  const doorRim = new THREE.Mesh(doorGeo, rimMat); doorRim.renderOrder = 3;
  const doorLines = new THREE.LineSegments(doorEdges, lines.material); doorLines.renderOrder = 4;
  doorPivot.add(doorRim, doorLines); scene.add(doorPivot);
  // The door's light strips and lock ring.
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.85, 1.0).multiplyScalar(2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const strip = new THREE.Mesh(box(dx0 - 0.06, 0.05, 10.12, dx0 - 0.03, ds.h, 10.15), stripMat);
  const strip2 = new THREE.Mesh(box(dx1 + 0.03, 0.05, 10.12, dx1 + 0.06, ds.h, 10.15), stripMat);
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.0, 0.6).multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  lockRing.position.set(dx1 - 0.1, 1.05, 10.1);
  scene.add(strip, strip2, lockRing);

  // Environment: a projection table in the dark, which becomes the real site.
  const envU = { uSite: { value: 0 }, uDusk: { value: 0 }, uOp: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: envU,
    vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uSite; uniform float uDusk; uniform float uOp; varying vec3 vD;
      void main(){ float h = clamp(vD.y, -0.2, 1.0);
        vec3 studio = mix(vec3(0.012, 0.03, 0.06), vec3(0.0, 0.005, 0.015), clamp(h * 2.0, 0.0, 1.0));
        vec3 gold = mix(vec3(1.0, 0.72, 0.42), vec3(0.32, 0.55, 0.85), pow(clamp(h * 1.6, 0.0, 1.0), 0.6));
        vec3 dusk = mix(vec3(0.95, 0.48, 0.3), mix(vec3(0.24, 0.2, 0.42), vec3(0.03, 0.05, 0.14), clamp(h * 2.5, 0.0, 1.0)), pow(clamp(h * 3.0, 0.0, 1.0), 0.5));
        vec3 site = mix(gold, dusk, uDusk);
        gl_FragColor = vec4(mix(studio, site, uSite), uOp); }`,
  }));
  sky.material.transparent = true; sky.renderOrder = -1;
  scene.add(sky);
  const realSky = new Sky(); realSky.scale.setScalar(4000); scene.add(realSky);
  const skyU = realSky.material.uniforms;
  skyU.turbidity.value = 6; skyU.rayleigh.value = 2.2; skyU.mieCoefficient.value = 0.006; skyU.mieDirectionalG.value = 0.8;
  const sunDir = new THREE.Vector3();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envKey = -1, envTex = null;
  const setSun = (dusk) => {
    const el = THREE.MathUtils.degToRad(lerp(11, -1.5, dusk)), az = THREE.MathUtils.degToRad(lerp(222, 262, dusk));
    sunDir.setFromSphericalCoords(1, Math.PI / 2 - el, az);
    skyU.sunPosition.value.copy(sunDir);
    skyU.turbidity.value = lerp(6, 12, dusk); skyU.rayleigh.value = lerp(2.2, 0.6, dusk); skyU.mieCoefficient.value = lerp(0.006, 0.02, dusk);
    // The environment (reflections in the glass, sky light on the walls) from the same sky, refreshed a few times through dusk.
    const key = Math.round(dusk * 6);
    if (key !== envKey) { envKey = key; envTex?.dispose(); envTex = pmrem.fromScene(realSky, 0.02).texture; scene.environment = envTex; }
  };
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...C.grass), roughness: 1, envMapIntensity: 0.3 });
  groundMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vW; ${HASH}`)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `float gn = fbm(vW * 0.9) * 0.5 + fbm(vW * 7.0) * 0.5; float dry = smoothstep(0.35, 0.65, fbm(vW * 0.15 + 3.0));
        vec3 gcol = diffuse * (0.72 + 0.55 * gn) * mix(vec3(1.0), vec3(1.12, 1.05, 0.8), dry * 0.5);
        vec4 diffuseColor = vec4(gcol, opacity);`);
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64).rotateX(-Math.PI / 2), groundMat);
  ground.position.y = -0.07; ground.receiveShadow = true; scene.add(ground);
  const table = new THREE.Mesh(new THREE.CircleGeometry(16, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: "varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uA; varying vec2 vP;
      void main(){ vec2 g = abs(fract(vP * 1.0 - 0.5) - 0.5) / fwidth(vP * 1.0); float grid = 1.0 - min(min(g.x, g.y), 1.0);
        float r = length(vP); float rings = 1.0 - min(abs(fract(r * 0.5 - 0.5) - 0.5) / fwidth(r * 0.5), 1.0);
        float rim = exp(-pow((r - 15.6) / 0.12, 2.0));
        float fade = smoothstep(16.0, 3.0, r);
        gl_FragColor = vec4(vec3(0.2, 0.62, 0.95) * (grid * 0.05 * fade + rings * 0.09 * fade + rim * 0.9) * uA, 1.0); }`,
  }));
  table.position.set(8, -0.36, 5); scene.add(table);

  // The plan drawn in light (Design scene).
  const planPts = [], planOrd = [];
  const ground0 = rooms.filter((r) => r.floor === "ground").sort((a, b) => a.bbox[0] - b.bbox[0]);
  let tot = 0; const segs = [];
  for (const r of ground0) { const n = r.poly.length; for (let i = 0; i < n; i++) { const a = r.poly[i], b = r.poly[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, tot, tot + l]); tot += l; } }
  for (const [a, b, l0, l1] of segs) { planPts.push(a[0], 0.02, a[1], b[0], 0.02, b[1]); planOrd.push(l0 / tot, l1 / tot); }
  const planGeo = new THREE.BufferGeometry();
  planGeo.setAttribute("position", new THREE.Float32BufferAttribute(planPts, 3));
  planGeo.setAttribute("aOrd", new THREE.Float32BufferAttribute(planOrd, 1));
  const planMat = new THREE.ShaderMaterial({ uniforms: { uP: { value: 0 }, uA: { value: 1 }, uColor: U.uHoloColor }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: "attribute float aOrd; varying float vO; void main(){ vO = aOrd; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uP; uniform float uA; uniform vec3 uColor; varying float vO; void main(){ if (vO > uP) discard; float hot = exp(-pow((uP - vO) / 0.02, 2.0)); gl_FragColor = vec4(uColor * (1.1 + hot * 2.5) * uA, 1.0); }" });
  scene.add(new THREE.LineSegments(planGeo, planMat));
  const pen = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.95, 1.0).multiplyScalar(3), transparent: true }));
  scene.add(pen);
  const penAt = (p) => { const L = p * tot; for (const [a, b, l0, l1] of segs) if (L <= l1) { const k = (L - l0) / (l1 - l0 || 1); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; } return segs.at(-1)[1]; };

  // Light.
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x3a3226, 0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc98a, 0); sun.target.position.set(8, 0, 5); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  const fill = new THREE.DirectionalLight(0x8fb6ff, 0); fill.position.set(25, 18, -10); scene.add(fill);
  const lamps = [[12.5, 2.4, 7.2], [9.3, 2.2, 2.6], [14, 2.0, 2.3], [7.5, 2.5, 7.8]].map(([x, y, z]) => { const l = new THREE.PointLight(0xffb870, 0, 9, 1.6); l.position.set(x, y, z); scene.add(l); return l; });
  lamps[0].castShadow = true; lamps[0].shadow.mapSize.set(512, 512); lamps[0].shadow.bias = -0.004;

  const guide = buildGuide(); scene.add(guide.root); scene.add(guide.points); guide.points.frustumCulled = false;
  const panel = buildPanel(); scene.add(panel.bezel, panel.screen);
  const sensors = buildSensors(); scene.add(sensors.lines, sensors.dots);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.8, 0.45, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // A little film grain and a soft vignette: the last touch that stops flat surfaces looking flat.
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: U.uT, uAmt: { value: 0.035 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; uniform float uAmt; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uT * 7.0) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv);
        float g = (h(vUv * 1000.0) - 0.5) * uAmt;
        float v = smoothstep(1.25, 0.35, distance(vUv, vec2(0.5)) * 1.3);
        gl_FragColor = vec4((c.rgb + g) * (0.82 + 0.18 * v), c.a); }`,
  });
  composer.addPass(grain);
  composer.setSize(width, height);

  const film = { renderer, composer, camera, labels, duration: DURATION };
  film.resize = (w, h) => { renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };

  // `view` overrides the shot camera: { pos:[x,y,z], tgt:[x,y,z], fov } (the sites' room stills use it).
  film.render = (t, view = null) => {
    U.uT.value = t;
    // The whole film is a hologram on the projection table: no site, no sun.
    const dusk = smooth(43.5, 44.5, t);
    envU.uSite.value = 0; envU.uDusk.value = 0; envU.uOp.value = 1;
    realSky.visible = false; ground.visible = false; table.visible = true;
    table.material.uniforms.uA.value = 1;
    hemi.intensity = 0; sun.intensity = 0; fill.intensity = 0;
    U.uLights.value = Math.max(smooth(41.8, 42.6, t) * (t < 44 ? 1 : 0), dusk);
    U.uWarm.value = U.uLights.value;
    for (const l of lamps) l.intensity = U.uLights.value * 2.5;
    // The cut-away plane sweeps down to open the house and back up to close it: no pop.
    U.uCutY.value = t < 32.5 || t > 46 ? 99 : t < 34.5 ? lerp(8, 2.96, ease(clamp01((t - 32.5) / 2))) : t < 43.5 ? 2.96 : lerp(2.96, 8, ease(clamp01((t - 43.5) / 2.5)));
    U.uHolo.value = 1;
    // One scan sweep as each stage lands, and a slow idle sweep while the guide speaks.
    U.uScan.value = t < 24 ? ((t - 13) % 3.6) * 2.2 - 0.5 : t < 44 ? ((t - 24) % 5) * 1.6 - 0.5 : ((t - 44) % 9) * 0.9 - 0.5;
    // Inside the house the camera is among the surfaces: turn the glow down so the walls read as walls.
    const inside = Math.max(smooth(31, 34, t) * 0.6, smooth(44, 46, t)) * (1 - smooth(82.5, 85.5, t) * 0.45);
    U.uGain.value = view && view.gain != null ? view.gain : 1 - inside;
    const soft = view && view.gain != null ? 1 - view.gain : inside;
    bloom.strength = lerp(0.7, 0.3, soft); bloom.threshold = lerp(0.12, 0.5, soft);
    renderer.toneMappingExposure = 1.0;

    // Plan drawing.
    const p = smooth(5.6, 11.8, t);
    planMat.uniforms.uP.value = p;
    planMat.uniforms.uA.value = 1 - smooth(22, 25, t);
    const [px, pz] = penAt(Math.min(p, 0.9999));
    pen.position.set(px, 0.05, pz);
    pen.visible = t > 5.4 && t < 12.2;

    // Door, its light strip and lock.
    doorPivot.rotation.y = smooth(51.6, 53.2, t) * 1.45;
    const stripA = smooth(50.2, 50.9, t) * (1 - smooth(55.2, 56.0, t));
    stripMat.opacity = stripA;
    lockRing.material.opacity = smooth(50.9, 51.3, t) * (1 - smooth(55.2, 56.0, t));

    // The guide.
    const gs = guideState(t);
    guide.root.position.copy(gs.pos); guide.root.rotation.y = gs.yaw;
    poseGuide(guide, { walk: gs.walk, phase: gs.phase, gesture: gs.gesture });
    const form = smooth(47.2, 49.2, t), gone = smooth(80.2, 81.6, t);
    const voiceNow = voice.length && t >= 51 ? voice[Math.min(voice.length - 1, Math.max(0, Math.floor((t - 51) * 24)))] || 0 : 0;
    guide.mat.uniforms.uAlpha.value = form * (1 - gone);
    guide.mat.uniforms.uVoice.value = voiceNow;
    guide.root.visible = form * (1 - gone) > 0.001;
    // Its particles: gathering at the door, then flowing into the panel.
    const gather = smooth(44.6, 48.4, t), toPanel = smooth(80.0, 81.9, t);
    const pp = guide.pPos, pt = guide.pTarget, ps = guide.pStart;
    guide.root.updateMatrixWorld(true);
    const inv = guide.root.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < pp.length; i += 3) {
      const sw = (1 - gather) * 1.4, ang = t * 1.3 + i;
      const lx = lerp(ps[i] * Math.cos(sw) - ps[i + 2] * Math.sin(sw), pt[i], ease(gather));
      const ly = lerp(ps[i + 1], pt[i + 1], ease(gather));
      const lz = lerp(ps[i] * Math.sin(sw) + ps[i + 2] * Math.cos(sw), pt[i + 2], ease(gather));
      v.set(lx, ly, lz).applyMatrix4(inv);
      if (toPanel > 0) {
        const d = (i % 97) / 97 * 0.5, k = ease(clamp01((toPanel - d * 0.5) / (1 - d * 0.5)));
        v.lerp(new THREE.Vector3(PANEL.x + 0.03, PANEL.y + Math.sin(ang) * 0.12, PANEL.z + Math.cos(ang) * 0.2), k);
      }
      pp[i] = v.x; pp[i + 1] = v.y; pp[i + 2] = v.z;
    }
    guide.points.geometry.attributes.position.needsUpdate = true;
    guide.points.material.opacity = Math.max(smooth(44.4, 45.4, t) * (1 - smooth(49, 50.5, t)) * 0.95, smooth(79.8, 80.4, t) * (1 - smooth(81.8, 82.6, t)) * 0.9);
    guide.points.visible = guide.points.material.opacity > 0.001;

    // Sensor lines, awake from the walkthrough on.
    sensors.mat.uniforms.uGrow.value = smooth(57.8, 62.5, t) * (sensors.maxLen + 1);
    sensors.mat.uniforms.uAmp.value = voiceNow * 0.8 + smooth(80.5, 81.5, t) * (1 - smooth(83, 85, t)) * 0.8;
    sensors.lines.visible = t > 57.5 && t < 86;
    sensors.dots.children.forEach((d, i) => { d.material.opacity = smooth(58 + i * 0.3, 58.6 + i * 0.3, t) * (t < 86 ? 1 : 0); });

    // Panel.
    drawPanel(panel, t);
    panel.mat.color.setScalar(t < 42 ? 0.15 : 1 + smooth(80.4, 81.4, t) * 0.6);

    // Camera.
    const cam = view ? { pos: new THREE.Vector3(...view.pos), tgt: new THREE.Vector3(...view.tgt), fov: view.fov || 40 } : shotCamera(t);
    camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
    // On a tall screen (a phone held upright) widen the view so the house still fits; at the film's 16:9 nothing changes.
    const fov = cam.fov * (camera.aspect < 1.3 ? Math.min(1.9, Math.pow(1.3 / camera.aspect, 0.7)) : 1);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    composer.render();
  };
  return film;
}
