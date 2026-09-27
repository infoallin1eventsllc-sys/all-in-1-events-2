// Any home can be drawn: styles, floors, room outlines, and rooms with no
// plan at all get a layout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHome, autoLayout, sharedStretches, STYLES, polyArea, kindOf, mainRect } from "../web/building.js";
import { SAMPLE_HOMES } from "../web/homes.js";
import { loadConfig } from "../src/home.js";

const overlap = (a, b) => {
  const [ax, ay, aw, ad] = a, [bx, by, bw, bd] = b;
  return Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx)) * Math.max(0, Math.min(ay + ad, by + bd) - Math.max(ay, by));
};
const DEVICE_ROOMS = ["kitchen", "living", "primary", "hallway", "garage", "utility"];

test("Haven's own home: modern style, one floor, every indoor room drawn, nothing estimated", () => {
  const c = loadConfig();
  const h = normalizeHome({ building: c.building, rooms: c.rooms });
  assert.equal(h.styleId, "modern");
  assert.equal(h.floors.length, 1);
  assert.equal(h.rooms.length, c.rooms.filter((r) => r.plan).length, "the outdoor area isn't a room of the building");
  assert.equal(h.approximate, false);
  assert.deepEqual(h.warnings, []);
});

test("every sample home: known style, rooms on real floors, no two rooms overlapping, device rooms kept", () => {
  for (const s of SAMPLE_HOMES) {
    const h = normalizeHome(s);
    assert.ok(STYLES[s.building.style], `${s.id}: style`);
    assert.equal(h.styleId, s.building.style, s.id);
    for (const id of DEVICE_ROOMS) assert.ok(h.rooms.some((r) => r.id === id), `${s.id} keeps ${id}`);
    const ids = new Set(h.floors.map((f) => f.id));
    for (const r of h.rooms) assert.ok(ids.has(r.floor), `${s.id}/${r.id} is on a real floor`);
    for (const f of h.floors) {
      const rs = h.rooms.filter((r) => r.floor === f.id && !r.shape);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        assert.ok(overlap(rs[i].bbox, rs[j].bbox) < 0.01, `${s.id}: ${rs[i].id} overlaps ${rs[j].id}`);
      }
    }
    assert.deepEqual(h.warnings.filter((w) => !/estimated/.test(w)), [], `${s.id} warnings`);
  }
});

test("floors stack upward, basements go below ground", () => {
  const h = normalizeHome({
    building: { floors: [{ id: "up", name: "Upstairs", level: 1 }, { id: "base", name: "Basement", level: -1 }, { id: "g", name: "Ground", level: 0 }] },
    rooms: [{ id: "a", name: "Den", floor: "base", plan: [0, 0, 4, 4] }, { id: "b", name: "Kitchen", floor: "g", plan: [0, 0, 4, 4] }, { id: "c", name: "Bedroom", floor: "up", plan: [0, 0, 4, 4] }],
  });
  const el = Object.fromEntries(h.floors.map((f) => [f.id, f.elev]));
  assert.equal(el.g, 0);
  assert.ok(el.up > 0 && el.base < 0);
  assert.deepEqual(h.floors.map((f) => f.id), ["base", "g", "up"]);
});

test("an L-shaped room keeps its outline and area", () => {
  const h = normalizeHome({ rooms: [{ id: "great", name: "Great Room", shape: [[0, 0], [9, 0], [9, 4], [5, 4], [5, 8], [0, 8]] }] });
  const r = h.rooms[0];
  assert.equal(r.poly.length, 6);
  assert.equal(polyArea(r.poly), 9 * 4 + 5 * 4);
  assert.deepEqual(r.bbox, [0, 0, 9, 8]);
});

test("rooms with no plan are laid out without overlaps and marked estimated", () => {
  const rooms = ["Garage", "Kitchen", "Living Room", "Bedroom 2", "Bath", "Office", "Primary Bedroom"].map((name, i) => ({ id: `r${i}`, name }));
  const laid = autoLayout(rooms);
  assert.equal(laid.length, rooms.length);
  for (let i = 0; i < laid.length; i++) for (let j = i + 1; j < laid.length; j++) assert.ok(overlap(laid[i].plan, laid[j].plan) < 0.01, `${laid[i].name} / ${laid[j].name}`);
  const h = normalizeHome({ rooms: [{ id: "k", name: "Kitchen", plan: [0, 0, 5, 5] }, { id: "o", name: "Office" }] });
  assert.equal(h.approximate, true);
  assert.ok(h.rooms.find((r) => r.id === "o").bbox[0] >= 5, "placed beside the rooms that have plans");
});

test("walls shared between rooms are found, so doors go there and windows go outside", () => {
  const a = { id: "a", poly: [[0, 0], [4, 0], [4, 4], [0, 4]] };
  const b = { id: "b", poly: [[4, 1], [8, 1], [8, 3], [4, 3]] };
  const s = sharedStretches(a, [b]);
  assert.equal(s[1].length, 1, "a's east wall touches b");
  assert.ok(Math.abs(s[1][0].lo - 0.25) < 1e-9 && Math.abs(s[1][0].hi - 0.75) < 1e-9);
  assert.equal(s[0].length + s[2].length + s[3].length, 0);
});

test("unknown styles and floors fall back and say so", () => {
  const h = normalizeHome({ building: { style: "gothic" }, rooms: [{ id: "x", name: "Kitchen", floor: "attic", plan: [0, 0, 3, 3] }] });
  assert.equal(h.styleId, "modern");
  assert.equal(h.warnings.length, 2);
  assert.equal(kindOf({ id: "powder", name: "Powder Room" }), "bath");
});

test("a broken or empty description still gives a ground floor to draw on, never a crash", () => {
  for (const input of [undefined, {}, { rooms: null }, { rooms: {} }, { building: { floors: [null] }, rooms: [null, { name: "no id" }] }, { rooms: [{ id: "yard", name: "Yard" }] }]) {
    const h = normalizeHome(input);
    assert.equal(h.floors.length, 1, JSON.stringify(input));
    assert.ok(h.floors[0].bbox.every(Number.isFinite));
  }
  const h = normalizeHome({ rooms: [{ id: "office", plan: [0, 0, 3, 3] }], building: { features: [{ type: "deck", plan: [0, 0, "wide", 2] }, { type: "patio", plan: [0, 4, 3, 0] }] } });
  assert.equal(h.rooms[0].name, "office", "a room with no name is called by its id");
  assert.equal(h.features.length, 0, "features with bad sizes are left out");
});

test("the drawn model shows an L-shaped room as its largest rectangle, clear of its neighbours", () => {
  const craftsman = SAMPLE_HOMES.find((s) => s.id === "craftsman");
  const h = normalizeHome(craftsman);
  const plans = h.rooms.map((r) => (r.shape ? mainRect(r.poly) : r.bbox));
  assert.deepEqual(mainRect(h.rooms.find((r) => r.id === "living").poly), [4, 0, 8, 4]);
  for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) assert.ok(overlap(plans[i], plans[j]) < 0.01, `${h.rooms[i].id} / ${h.rooms[j].id}`);
});
