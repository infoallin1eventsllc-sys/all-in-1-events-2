import { fromLatLon, toLatLon, polygonArea, type GeoOrigin, type Pt } from './plan';
import { SITE, structureAt } from './site';

/**
 * Survey sites: the demo venue, or a real boundary the operator brings.
 *
 * A real survey needs the real site. Crews usually have it already as a KML or
 * KMZ (Google Earth, DJI Pilot 2, a client's GIS), a GeoJSON, or a list of
 * coordinates; or they walk the aircraft to each corner and mark it. This module
 * reads those, checks the shape is flyable, and turns it into local metres around
 * its own origin, which is what the planner works in.
 */

export type SiteKind = 'DEMO' | 'BENCH' | 'IMPORTED' | 'WALKED';

export interface SurveySite {
  name: string;
  kind: SiteKind;
  /** WGS84 point that local (0, 0) sits on. */
  origin: GeoOrigin;
  /** Boundary in local metres (x east, y south). */
  boundary: Pt[];
  /** Take-off point in local metres; on a live link it follows the autopilot's home. */
  home: Pt;
  /** Default centre for an orbit inspection. */
  orbitCenter: Pt;
}

export interface LatLon { lat: number; lon: number }

/** The demo festival ground, simulated at its own coordinates. */
export const DEMO_SITE: SurveySite = {
  name: SITE.name, kind: 'DEMO', origin: SITE.origin, boundary: SITE.boundary, home: SITE.home,
  orbitCenter: { x: structureAt(SITE.orbitTarget)!.x, y: structureAt(SITE.orbitTarget)!.y },
};

/** The demo venue's shape placed around a real aircraft's home, for bench tests with a connected autopilot. */
export function benchSite(home: LatLon): SurveySite {
  return { ...DEMO_SITE, name: `${SITE.name} (bench test)`, kind: 'BENCH', origin: toLatLon(home, { x: -SITE.home.x, y: -SITE.home.y }) };
}

/** Sites drawn from the demo venue's geometry render on its 3D model; real sites render on a plain survey grid. */
export const usesDemoGeometry = (s: SurveySite) => s.kind === 'DEMO' || s.kind === 'BENCH';

/** A site from a WGS84 ring. Its origin is the ring's centre; home starts there until the aircraft reports one. */
export function siteFromRing(name: string, ring: LatLon[], kind: 'IMPORTED' | 'WALKED'): SurveySite {
  const o = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
  const boundary = ring.map(p => fromLatLon(o, p.lat, p.lon));
  return { name, kind, origin: o, boundary, home: { x: 0, y: 0 }, orbitCenter: { x: 0, y: 0 } };
}

// ---- checks ----------------------------------------------------------------------

const segmentsCross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

/** Problems that stop a boundary being flown (empty when it is fine), plus advisories. */
export function checkBoundary(ring: LatLon[]): { errors: string[]; warnings: string[]; areaM2: number } {
  const errors: string[] = [], warnings: string[] = [];
  if (ring.length < 3) return { errors: ['A boundary needs at least three corners.'], warnings, areaM2: 0 };
  if (ring.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) errors.push('Some coordinates are not valid latitude/longitude.');
  const s = siteFromRing('', ring, 'IMPORTED');
  const area = polygonArea(s.boundary);
  const n = s.boundary.length;
  for (let i = 0; i < n && !errors.length; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segmentsCross(s.boundary[i], s.boundary[(i + 1) % n], s.boundary[j], s.boundary[(j + 1) % n])) { errors.push('The boundary crosses itself. Check the corner order.'); break; }
  }
  if (area < 400) errors.push('The area is smaller than 20 × 20 m, too small to survey from the air.');
  if (area > 25e6) errors.push('The area is over 25 km². Split it into several surveys.');
  else if (area > 2e6) warnings.push(`The area is ${(area / 1e6).toFixed(1)} km²: expect many battery swaps; consider splitting it.`);
  const span = Math.max(...s.boundary.map(p => Math.hypot(p.x, p.y)));
  if (span > 3000) warnings.push('Parts of the site are over 3 km from its centre: check the radio will reach.');
  return { errors, warnings, areaM2: area };
}

// ---- reading files ---------------------------------------------------------------

/** Drop the repeated closing point and consecutive duplicates. */
function clean(ring: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  for (const p of ring) { const q = out[out.length - 1]; if (!q || Math.abs(q.lat - p.lat) > 1e-9 || Math.abs(q.lon - p.lon) > 1e-9) out.push(p); }
  if (out.length > 1 && Math.abs(out[0].lat - out[out.length - 1].lat) < 1e-9 && Math.abs(out[0].lon - out[out.length - 1].lon) < 1e-9) out.pop();
  return out;
}
const ringArea = (r: LatLon[]) => (r.length < 3 ? 0 : polygonArea(siteFromRing('', r, 'IMPORTED').boundary));
const largest = (rings: LatLon[][]) => rings.map(clean).filter(r => r.length >= 3).sort((a, b) => ringArea(b) - ringArea(a))[0] ?? [];

/** KML: the outer ring of the largest polygon (Google Earth, DJI Pilot 2, most GIS). Falls back to a closed LineString. */
export function parseKml(text: string): { name?: string; ring: LatLon[] } {
  const coords = (block: string) => block.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && a.every(Number.isFinite)).map(([lon, lat]) => ({ lat, lon }));
  const polys = [...text.matchAll(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi)].map(m => coords(m[1]));
  const lines = polys.length ? [] : [...text.matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi)].map(m => coords(m[1]));
  const name = text.match(/<Placemark>[\s\S]*?<name>([\s\S]*?)<\/name>/i)?.[1] ?? text.match(/<name>([\s\S]*?)<\/name>/i)?.[1];
  return { name: name?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || undefined, ring: largest(polys.length ? polys : lines) };
}

/** GeoJSON: Polygon / MultiPolygon, bare or in a Feature / FeatureCollection. Takes the largest outer ring. */
export function parseGeoJson(text: string): { name?: string; ring: LatLon[] } {
  const j = JSON.parse(text);
  const rings: LatLon[][] = []; let name: string | undefined;
  const toRing = (c: number[][]) => c.map(([lon, lat]) => ({ lat, lon }));
  const visit = (g: { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[]; properties?: { name?: string } }) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') (g.features ?? []).forEach(f => visit(f as typeof g));
    else if (g.type === 'Feature') { name ??= g.properties?.name; visit(g.geometry as typeof g); }
    else if (g.type === 'GeometryCollection') (g.geometries ?? []).forEach(x => visit(x as typeof g));
    else if (g.type === 'Polygon') rings.push(toRing((g.coordinates as number[][][])[0]));
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates as number[][][][]) rings.push(toRing(p[0]));
  };
  visit(j);
  return { name, ring: largest(rings) };
}

/**
 * A list of coordinates, one corner per line: "lat, lon" (the order phones and
 * Google Maps copy), or "lon, lat" when the header says so or a first value is
 * beyond ±90. Separators: comma, semicolon, tab or space.
 */
export function parseCoordinateList(text: string): { ring: LatLon[] } {
  const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const head = rows[0]?.toLowerCase() ?? '';
  const lonFirst = /^(lon|lng|long|x)\b/.test(head) || /^[a-z_ ]*(lon|lng)[a-z_ ]*[,;\t ]+[a-z_ ]*lat/.test(head);
  const pts = rows.map(l => l.split(/[,;\t ]+/).map(Number)).filter(a => a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1]));
  const swap = lonFirst || pts.some(a => Math.abs(a[0]) > 90);
  return { ring: clean(pts.map(a => (swap ? { lat: a[1], lon: a[0] } : { lat: a[0], lon: a[1] }))) };
}

/** Parse by content: KML, GeoJSON, or a coordinate list. */
export function parseBoundaryText(text: string): { name?: string; ring: LatLon[] } {
  const t = text.trim();
  if (t.startsWith('<')) return parseKml(t);
  if (t.startsWith('{')) return parseGeoJson(t);
  return parseCoordinateList(t);
}

/** Read the first .kml inside a KMZ (a zip): stored or deflated entries. */
export async function kmlFromKmz(buf: ArrayBuffer): Promise<string> {
  const v = new DataView(buf); const u8 = new Uint8Array(buf);
  for (let i = 0; i + 30 <= u8.length;) {
    if (v.getUint32(i, true) !== 0x04034b50) break;
    const method = v.getUint16(i + 8, true), csize = v.getUint32(i + 18, true), nlen = v.getUint16(i + 26, true), xlen = v.getUint16(i + 28, true);
    const name = new TextDecoder().decode(u8.subarray(i + 30, i + 30 + nlen));
    const start = i + 30 + nlen + xlen, data = u8.subarray(start, start + csize);
    if (/\.kml$/i.test(name)) {
      if (method === 0) return new TextDecoder().decode(data);
      if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).text();
      }
      throw new Error('This KMZ uses a compression method the browser cannot open');
    }
    i = start + csize;
  }
  throw new Error('No KML inside this KMZ');
}

/** Read a boundary from a file the operator picked. */
export async function readBoundaryFile(file: File): Promise<{ name: string; ring: LatLon[] }> {
  const buf = await file.arrayBuffer();
  const isZip = buf.byteLength > 4 && new DataView(buf).getUint32(0, true) === 0x04034b50;
  const text = isZip ? await kmlFromKmz(buf) : new TextDecoder().decode(buf);
  const { name, ring } = parseBoundaryText(text);
  if (!ring.length) throw new Error('No polygon found in this file. Export the site outline as a KML, KMZ or GeoJSON polygon.');
  return { name: name || file.name.replace(/\.[^.]+$/, ''), ring };
}

/** Boundary as KML, for Google Earth, DJI Pilot 2 (import as a mapping area) or a client's GIS. */
export function boundaryKml(site: SurveySite, extra: { name: string; lines: [Pt, Pt][] } | null = null): string {
  const ll = (p: Pt) => { const q = toLatLon(site.origin, p); return `${q.lon.toFixed(7)},${q.lat.toFixed(7)},0`; };
  const ring = [...site.boundary, site.boundary[0]].map(ll).join(' ');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lines = extra ? `
    <Placemark><name>${esc(extra.name)}</name><Style><LineStyle><color>ff3c92fb</color><width>2</width></LineStyle></Style>
      <MultiGeometry>${extra.lines.map(([a, b]) => `<LineString><coordinates>${ll(a)} ${ll(b)}</coordinates></LineString>`).join('')}</MultiGeometry></Placemark>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(site.name)}</name>
    <Placemark><name>${esc(site.name)} boundary</name><Style><LineStyle><color>ff0c41c2</color><width>3</width></LineStyle><PolyStyle><color>330c41c2</color></PolyStyle></Style>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>${lines}
</Document></kml>
`;
}
