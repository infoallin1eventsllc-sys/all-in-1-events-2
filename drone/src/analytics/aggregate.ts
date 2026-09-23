import type { SessionRollup } from './rollup';
import type { Vertical } from '../record/db';

/**
 * Analytics: everything the Analytics view shows, computed from rollups.
 * Pure functions (scripts/analytics.test.mjs).
 */

export type ProductFilter = Vertical | 'ALL';
export type SourceFilter = 'ALL' | 'REAL' | 'SIM';

export interface Filter { days: number; product: ProductFilter; source: SourceFilter; now: number }

/** Flight hours between services, and the share at which it shows as coming due. */
export const SERVICE_HOURS = 25;
export const SERVICE_SOON = 0.8;
export const MIN_RATE_HOURS = 1;
/** A pack whose drain rate has risen this much since its first flights is worth a check. */
export const BATTERY_DRIFT_PCT = 15;

/** Local midnight at the start of a period of `days` calendar days ending today. */
export function periodStart(days: number, now: number): number {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

/** Calendar days, so the headline totals and the daily chart always agree. */
export const inPeriod = (r: SessionRollup, days: number, now: number) => r.startedAt >= periodStart(days, now) && r.startedAt <= now;

/**
 * A flight is a session in which something was airborne for at least 10 s.
 * Opening a dashboard and leaving is a record (Records keeps it), not a flight.
 */
export const MIN_AIRBORNE_S = 10;
export const isFlight = (r: SessionRollup) => r.aircraft.some(a => a.airborneS >= MIN_AIRBORNE_S);

export function filterRollups(rs: SessionRollup[], f: Filter, days = f.days, now = f.now): SessionRollup[] {
  return rs.filter(r =>
    isFlight(r) &&
    inPeriod(r, days, now) &&
    (f.product === 'ALL' || r.vertical === f.product) &&
    (f.source === 'ALL' || (f.source === 'SIM') === (r.source === 'SIMULATION')));
}

export const flightHours = (r: SessionRollup) => r.aircraft.reduce((s, a) => s + a.airborneS, 0) / 3600;

export interface Totals {
  flights: number; flightHours: number; aircraft: number; distanceKm: number;
  critical: number; warning: number;
  /** Warnings and criticals per 10 flight hours — the rate that compares weeks fairly.
   *  null under MIN_RATE_HOURS of flying, where a single alert would read as an alarming rate. */
  alertsPer10h: number | null;
  realFlights: number; packs: number;
}

export function totals(rs: SessionRollup[]): Totals {
  const ids = new Set<string>();
  let hours = 0, dist = 0, critical = 0, warning = 0, real = 0, packs = 0;
  for (const r of rs) {
    hours += flightHours(r);
    for (const a of r.aircraft) { ids.add(a.id); dist += a.distanceM; packs += a.packs; }
    critical += r.events.critical; warning += r.events.warning;
    if (r.source !== 'SIMULATION') real++;
  }
  return {
    flights: rs.length, flightHours: hours, aircraft: ids.size, distanceKm: dist / 1000, critical, warning,
    alertsPer10h: hours >= MIN_RATE_HOURS ? ((critical + warning) / hours) * 10 : null, realFlights: real, packs,
  };
}

/** Change against the period of the same length just before it. null when there is nothing to compare. */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export interface Day { start: number; label: string; hours: number; flights: number; byProduct: Partial<Record<Vertical, number>> }

/** Flight hours per local calendar day, oldest first, one entry per day even when nothing flew. */
export function daily(rs: SessionRollup[], days: number, now: number): Day[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const out: Day[] = [];
  const index = new Map<number, Day>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const day: Day = { start: d.getTime(), label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), hours: 0, flights: 0, byProduct: {} };
    out.push(day); index.set(day.start, day);
  }
  for (const r of rs) {
    const d = new Date(r.startedAt); d.setHours(0, 0, 0, 0);
    const day = index.get(d.getTime()); if (!day) continue;
    const h = flightHours(r);
    day.hours += h; day.flights++;
    day.byProduct[r.vertical] = (day.byProduct[r.vertical] ?? 0) + h;
  }
  return out;
}

/** Group days into weeks when the range is long, so bars stay readable. */
export function bucket(days: Day[], size: number): Day[] {
  if (size <= 1) return days;
  const out: Day[] = [];
  for (let i = 0; i < days.length; i += size) {
    const g = days.slice(i, i + size);
    const byProduct: Partial<Record<Vertical, number>> = {};
    for (const d of g) for (const [k, v] of Object.entries(d.byProduct)) byProduct[k as Vertical] = (byProduct[k as Vertical] ?? 0) + (v ?? 0);
    out.push({ start: g[0].start, label: `${g[0].label} – ${g[g.length - 1].label}`, hours: g.reduce((s, d) => s + d.hours, 0), flights: g.reduce((s, d) => s + d.flights, 0), byProduct });
  }
  return out;
}

export interface ProductRow { vertical: Vertical; flights: number; hours: number; share: number; highlights: Record<string, number> }

export function byProduct(rs: SessionRollup[]): ProductRow[] {
  const map = new Map<Vertical, ProductRow>();
  let total = 0;
  for (const r of rs) {
    const row = map.get(r.vertical) ?? { vertical: r.vertical, flights: 0, hours: 0, share: 0, highlights: {} };
    const h = flightHours(r);
    row.flights++; row.hours += h; total += h;
    const hl = row.highlights;
    if (r.vertical === 'SURVEY') {
      hl.photos = (hl.photos ?? 0) + (r.highlights.photos ?? 0);
      hl.rejected = (hl.rejected ?? 0) + (r.highlights.rejected ?? 0);
      if (r.highlights.coveredPct != null) { hl.coverageSum = (hl.coverageSum ?? 0) + r.highlights.coveredPct; hl.coverageN = (hl.coverageN ?? 0) + 1; }
    } else if (r.vertical === 'LIGHT_SHOW') {
      if (r.highlights.maxDeviationM != null) hl.worstDeviationM = Math.max(hl.worstDeviationM ?? 0, r.highlights.maxDeviationM);
      if (r.highlights.avgSyncMs != null) { hl.syncSum = (hl.syncSum ?? 0) + r.highlights.avgSyncMs; hl.syncN = (hl.syncN ?? 0) + 1; }
      hl.aircraftFlown = (hl.aircraftFlown ?? 0) + r.aircraft.length;
    } else if (r.vertical === 'SURVEILLANCE') {
      hl.detections = (hl.detections ?? 0) + (r.highlights.detections ?? 0);
      hl.distanceKm = (hl.distanceKm ?? 0) + r.aircraft.reduce((s, a) => s + a.distanceM, 0) / 1000;
    }
    map.set(r.vertical, row);
  }
  const ORDER: Vertical[] = ['LIGHT_SHOW', 'SURVEY', 'SURVEILLANCE', 'DEFENSE'];
  return [...map.values()].map(r => ({ ...r, share: total > 0 ? r.hours / total : 0 })).sort((a, b) => ORDER.indexOf(a.vertical) - ORDER.indexOf(b.vertical));
}

// ---- fleet health -----------------------------------------------------------

/** A full service, or (with `part`) one part replaced — which does not reset the service clock. */
export interface ServiceRecord { id?: number; aircraft: string; t: number; note: string; part?: string; sample?: boolean }

export type Health = 'SERVICE_DUE' | 'BATTERY' | 'SERVICE_SOON' | 'OK';

export interface AircraftStat {
  id: string;
  product: Vertical;
  flights: number;
  hours: number;
  distanceKm: number;
  packs: number;
  lastFlown: number;
  /** Drain rate per flight, oldest first (%/min). */
  drain: number[];
  /** Latest drain against the aircraft's early flights, percent change. null with too few flights. */
  drainDriftPct: number | null;
  hoursSinceService: number;
  lastService: number | null;
  health: Health;
}

/** Every aircraft ever flown (not just in the period): maintenance does not reset with the date filter. */
export function fleet(all: SessionRollup[], service: ServiceRecord[]): AircraftStat[] {
  const map = new Map<string, { product: Record<string, number>; flights: { t: number; a: SessionRollup['aircraft'][number] }[] }>();
  for (const r of all) for (const a of r.aircraft) {
    const e = map.get(a.id) ?? { product: {}, flights: [] };
    e.product[r.vertical] = (e.product[r.vertical] ?? 0) + 1;
    e.flights.push({ t: r.startedAt, a });
    map.set(a.id, e);
  }
  const lastService = new Map<string, number>();
  for (const s of service) if (!s.part) lastService.set(s.aircraft, Math.max(lastService.get(s.aircraft) ?? 0, s.t));

  return [...map.entries()].map(([id, e]) => {
    const flights = e.flights.sort((x, y) => x.t - y.t);
    const drain = flights.map(f => f.a.drainPctPerMin).filter(v => v > 0);
    let drift: number | null = null;
    if (drain.length >= 6) {
      const early = drain.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
      const late = drain.slice(-3).reduce((s, v) => s + v, 0) / 3;
      drift = early > 0 ? ((late - early) / early) * 100 : null;
    }
    const svc = lastService.get(id) ?? null;
    const sinceS = flights.filter(f => svc == null || f.t > svc).reduce((s, f) => s + f.a.airborneS, 0);
    const since = sinceS / 3600;
    const health: Health = since >= SERVICE_HOURS ? 'SERVICE_DUE' : drift != null && drift >= BATTERY_DRIFT_PCT ? 'BATTERY' : since >= SERVICE_HOURS * SERVICE_SOON ? 'SERVICE_SOON' : 'OK';
    const product = Object.entries(e.product).sort((a, b) => b[1] - a[1])[0][0] as Vertical;
    return {
      id, product, flights: flights.length,
      hours: flights.reduce((s, f) => s + f.a.airborneS, 0) / 3600,
      distanceKm: flights.reduce((s, f) => s + f.a.distanceM, 0) / 1000,
      packs: flights.reduce((s, f) => s + f.a.packs, 0),
      lastFlown: flights[flights.length - 1].t,
      drain, drainDriftPct: drift, hoursSinceService: since, lastService: svc, health,
    };
  });
}

const HEALTH_RANK: Record<Health, number> = { SERVICE_DUE: 0, BATTERY: 1, SERVICE_SOON: 2, OK: 3 };
export const sortFleet = (xs: AircraftStat[]) => [...xs].sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.hours - a.hours || a.id.localeCompare(b.id));

// ---- safety -------------------------------------------------------------------

/** Group alerts that differ only in their numbers ("Gust to 12 m/s" = "Gust to 13 m/s"). */
export function alertPattern(text: string): string {
  return text.replace(/\b[A-Z]{1,4}-\d+[A-Z]?\b/g, '<aircraft>').replace(/-?\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
}

export interface AlertRow { pattern: string; example: string; count: number; severity: 'WARNING' | 'CRITICAL'; lastT: number; products: Vertical[] }

export function topAlerts(rs: SessionRollup[], limit = 6): AlertRow[] {
  const map = new Map<string, AlertRow>();
  for (const r of rs) for (const e of r.notable) {
    const p = alertPattern(e.text);
    const row = map.get(p) ?? { pattern: p, example: e.text, count: 0, severity: e.severity, lastT: 0, products: [] };
    row.count++;
    if (e.t >= row.lastT) { row.lastT = e.t; row.example = e.text; }
    if (e.severity === 'CRITICAL') row.severity = 'CRITICAL';
    if (!row.products.includes(r.vertical)) row.products.push(r.vertical);
    map.set(p, row);
  }
  return [...map.values()].sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'CRITICAL' ? -1 : 1)).slice(0, limit);
}

export function incidents(rs: SessionRollup[], limit = 8) {
  return rs.flatMap(r => r.notable.filter(e => e.severity === 'CRITICAL').map(e => ({ ...e, sessionId: r.sessionId, vertical: r.vertical, title: r.title, sample: !!r.sample })))
    .sort((a, b) => b.t - a.t).slice(0, limit);
}
