import { HealthMonitor, LIMITS, type Finding, type FlightHealth, type HealthReport, type Level, type SystemId, type VehicleState } from './health';
import type { HealthMsg } from './decode';
import { padLabel, padCols as gridCols } from '../lightshow/pads';

/**
 * Fleet health: one health monitor per aircraft, so a light show of 100, 250 or
 * 500 aircraft (or any multi-aircraft link) gets the same diagnosis for every
 * airframe that a single aircraft gets on the Health screen, plus the fleet view
 * an operator needs before a show: how many are ready, which to ground or swap a
 * pack on, and what is going wrong across the fleet.
 *
 * Messages are routed by aircraft (the MAVLink system id on a live link), never
 * mixed. Summaries are small flat records so 500 of them redraw cheaply.
 */

export interface AircraftHealth {
  id: string;
  /** Launch pad label, e.g. "C07" (row letter, column number). */
  pad: string;
  overall: Level;
  phase: HealthReport['phase'];
  verdict: string;
  top: Finding | null;
  findings: Finding[];
  batteryPct: number | null;
  minCellV: number | null;
  cellSpreadV: number | null;
  vibe: number | null;
  /** Largest motor difference from the average, % (absolute). */
  motorDev: number | null;
  escMaxC: number | null;
  /** Worst navigation-filter reading. */
  navMax: number | null;
  sats: number | null;
  dropPct: number | null;
  /** 0 = far from every limit, 0.5 = at a watch line, 1 = at a fault line. */
  margin: number;
  marginWorst: string | null;
  firmware: string | null;
  flightS: number;
  systems: Partial<Record<SystemId, Level>>;
  /** Hours on the props and motors since last replaced, when known. */
  propHours: number | null;
  motorHours: number | null;
}

export type Readiness = 'READY' | 'WATCH' | 'GROUNDED' | 'SILENT';

export const readiness = (a: AircraftHealth): Readiness =>
  a.overall === 'UNKNOWN' ? 'SILENT' : a.overall === 'FAULT' ? 'GROUNDED' : a.overall === 'WATCH' ? 'WATCH' : 'READY';

// One launch grid for the show: the simulation, the exported package and this view agree on every pad.
export { padLabel, padCols as gridCols } from '../lightshow/pads';

export function summarize(id: string, pad: string, r: HealthReport, hours?: { props: number; motors: number }): AircraftHealth {
  const devs = r.motors.map(m => m.deviationPct).filter((v): v is number => v != null);
  const temps = r.motors.map(m => m.tempC).filter((v): v is number => v != null && v > 0);
  const nav = r.nav ? Math.max(r.nav.compass, r.nav.posHoriz, r.nav.posVert, r.nav.velocity) : null;
  const sys: Partial<Record<SystemId, Level>> = {};
  for (const s of r.systems) sys[s.id] = s.level;
  const link = r.systems.find(s => s.id === 'LINK');
  const gps = r.systems.find(s => s.id === 'GPS');
  return {
    id, pad, overall: r.overall, phase: r.phase, verdict: r.verdict, top: r.findings[0] ?? null, findings: r.findings,
    batteryPct: r.battery?.remainingPct ?? null,
    minCellV: r.cellsV.length ? Math.min(...r.cellsV) : null,
    cellSpreadV: r.cellsV.length > 1 ? Math.max(...r.cellsV) - Math.min(...r.cellsV) : null,
    vibe: r.vibe ? Math.max(r.vibe.x, r.vibe.y, r.vibe.z) : null,
    motorDev: devs.length ? Math.max(...devs.map(Math.abs)) : null,
    escMaxC: temps.length ? Math.max(...temps) : null,
    navMax: nav,
    sats: gps && /(\d+) sats/.test(gps.reading) ? Number(gps.reading.match(/(\d+) sats/)![1]) : null,
    dropPct: link && /([\d.]+)% packets/.test(link.reading) ? Number(link.reading.match(/([\d.]+)% packets/)![1]) : null,
    margin: r.stress.now, marginWorst: r.stress.worst,
    firmware: r.firmware, flightS: r.flightS, systems: sys,
    propHours: hours?.props ?? null, motorHours: hours?.motors ?? null,
  };
}

// ------------------------------------------------------------------ the registry

export class FleetHealth {
  private monitors = new Map<string, HealthMonitor>();
  private order: string[] = [];
  private hours = new Map<string, { props: number; motors: number }>();
  source: 'LIVE' | 'SIMULATION' = 'SIMULATION';
  onFlightEnd: ((r: FlightHealth) => void) | null = null;

  /** The monitor for an aircraft, created on first sight. */
  monitor(id: string): HealthMonitor {
    let m = this.monitors.get(id);
    if (!m) {
      m = new HealthMonitor(); m.aircraft = id; m.source = this.source;
      m.onFlightEnd = r => this.onFlightEnd?.(r);
      this.monitors.set(id, m); this.order.push(id);
    }
    return m;
  }
  setHours(id: string, props: number, motors: number) { this.hours.set(id, { props, motors }); }
  apply(id: string, msg: HealthMsg, t: number) { this.monitor(id).apply(msg, t); }
  setState(id: string, s: VehicleState, t: number, dtS?: number) { this.monitor(id).setState(s, t, dtS); }
  ids() { return this.order.slice(); }
  size() { return this.order.length; }
  clear() { this.monitors.clear(); this.order = []; this.hours.clear(); }
  report(id: string, t = Date.now()): HealthReport | null { return this.monitors.get(id)?.report(t) ?? null; }

  summary(t = Date.now()): AircraftHealth[] {
    const cols = gridCols(this.order.length);
    return this.order.map((id, i) => summarize(id, padLabel(i, cols), this.monitors.get(id)!.report(t), this.hours.get(id)));
  }
}

// ------------------------------------------------------------------ fleet analytics

/** Finding ids that differ only by motor number group together. */
const GROUP_LABEL: Record<string, string> = {
  prop: 'Damaged or loose propeller', motor: 'Dragging motor', hot: 'Motor or ESC running hot', hotter: 'Motor running hotter than the rest',
  norpm: 'Motor reporting no rpm', sat: 'Motor ran out of power', yaw: 'Twisted arm or tilted motor', 'yaw-ap': 'Autopilot reports yaw imbalance',
  cg: 'Load off-centre', vibe: 'High vibration', 'vibe-comp': 'Vibration compensation active', clip: 'Accelerometer clipping',
  'cell-spread': 'Battery cells out of balance', 'cell-low': 'Cell sagging under load', 'batt-hot': 'Battery running hot', 'batt-fault': 'Smart battery fault',
  'nav-compass-Compass': 'Compass disagrees with the other sensors', 'mag-current': 'Compass disturbed by motor current', 'compass-text': 'Compass problem',
  'fw-old': 'Firmware out of date', 'fw-beta': 'Test build of the firmware', 'gps-weak': 'Weak GPS', 'gps-fix': 'No 3D GPS fix', 'gps-glitch': 'GPS glitch',
  drop: 'Telemetry link dropping packets', vcc: 'Flight controller supply out of range', overcurrent: 'Peripheral over-current', crash: 'Crash detected', 'esc-fail': 'Motor or ESC failure',
};
/** Group findings across aircraft: the id without its motor number (a balance finding groups by the part it blames, prop or motor). */
export const groupKey = (f: Finding) => (/^motor-\d+$/.test(f.id) && f.part ? f.part.replace(/-\d+$/, '') : f.id.replace(/-\d+$/, ''));

export interface IssueGroup { key: string; label: string; level: 'WATCH' | 'FAULT'; action: string; ids: string[]; pads: string[] }

export interface FleetStats {
  n: number;
  counts: Record<Readiness, number>;
  battery: { buckets: number[]; below: number; min: number | null; avg: number | null; unknown: number };
  bySystem: { id: SystemId; label: string; watch: number; fault: number }[];
  issues: IssueGroup[];
  firmware: { name: string; count: number }[];
  service: { propsDue: string[]; motorsDue: string[] };
  /** Go / hold for a show and what has to happen first. */
  gates: { id: string; label: string; ok: boolean; detail: string; pads: string[] }[];
  go: boolean;
  /** Aircraft named by at least one failing gate: what has to be dealt with before a go. */
  blocked: number;
}

const SYS_LABEL: Record<SystemId, string> = {
  PROPULSION: 'Motors and props', AIRFRAME: 'Frame and vibration', BATTERY: 'Battery', SENSORS: 'Sensors', NAVIGATION: 'Navigation filter',
  GPS: 'GPS', LINK: 'Telemetry link', POWER: 'FC power', FIRMWARE: 'Firmware',
};

/** Show launch minimums (the light show's own pre-flight gates). */
export const SHOW_MIN_BATTERY = 40;

export function fleetStats(list: AircraftHealth[], opts: { propHours?: number; motorHours?: number } = {}): FleetStats {
  const counts: Record<Readiness, number> = { READY: 0, WATCH: 0, GROUNDED: 0, SILENT: 0 };
  for (const a of list) counts[readiness(a)]++;
  const buckets = Array(10).fill(0);
  let below = 0, unknown = 0, min: number | null = null, sum = 0, nb = 0;
  for (const a of list) {
    if (a.batteryPct == null || a.overall === 'UNKNOWN') { unknown++; continue; }
    buckets[Math.max(0, Math.min(9, Math.floor(a.batteryPct / 10)))]++;
    if (a.batteryPct < SHOW_MIN_BATTERY) below++;
    min = min == null ? a.batteryPct : Math.min(min, a.batteryPct); sum += a.batteryPct; nb++;
  }
  const bySystem = (Object.keys(SYS_LABEL) as SystemId[]).map(id => ({
    id, label: SYS_LABEL[id],
    watch: list.filter(a => a.systems[id] === 'WATCH').length,
    fault: list.filter(a => a.systems[id] === 'FAULT').length,
  }));
  const groups = new Map<string, IssueGroup>();
  for (const a of list) for (const f of a.findings) {
    const key = groupKey(f);
    const g = groups.get(key) ?? { key, label: GROUP_LABEL[key] ?? f.title, level: f.level, action: f.actionText.replace(/\d+/g, 'N'), ids: [], pads: [] };
    if (f.level === 'FAULT') g.level = 'FAULT';
    if (!g.ids.includes(a.id)) { g.ids.push(a.id); g.pads.push(a.pad); }
    groups.set(key, g);
  }
  const issues = [...groups.values()].sort((x, y) => (x.level === y.level ? y.ids.length - x.ids.length : x.level === 'FAULT' ? -1 : 1));
  const fw = new Map<string, number>();
  for (const a of list) if (a.firmware) fw.set(a.firmware, (fw.get(a.firmware) ?? 0) + 1);
  const firmware = [...fw.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const PH = opts.propHours ?? 50, MH = opts.motorHours ?? 200;
  const propsDue = list.filter(a => a.propHours != null && a.propHours >= PH).map(a => a.pad);
  const motorsDue = list.filter(a => a.motorHours != null && a.motorHours >= MH).map(a => a.pad);

  const live = list.filter(a => a.overall !== 'UNKNOWN');
  // A gate passes on what an aircraft reports, never on what it has not: no pack reading or no GPS report holds the show.
  const noBatt = live.filter(a => a.batteryPct == null);
  const lowBatt = live.filter(a => a.batteryPct == null || a.batteryPct < SHOW_MIN_BATTERY);
  const grounded = live.filter(a => a.overall === 'FAULT');
  const silent = list.filter(a => a.overall === 'UNKNOWN');
  const noFix = live.filter(a => a.systems.GPS !== 'OK' && a.systems.GPS !== 'WATCH');
  const main = firmware[0]?.name;
  const odd = live.filter(a => a.firmware && a.firmware !== main);
  const gates = [
    { id: 'report', label: 'Every aircraft reporting', ok: silent.length === 0, detail: silent.length ? `${silent.length} silent` : `${list.length} of ${list.length}`, pads: silent.map(a => a.pad) },
    { id: 'faults', label: 'No aircraft with a fault', ok: grounded.length === 0, detail: grounded.length ? `${grounded.length} to ground` : 'none', pads: grounded.map(a => a.pad) },
    { id: 'battery', label: `Battery above ${SHOW_MIN_BATTERY}% on every aircraft`, ok: lowBatt.length === 0, detail: lowBatt.length ? [lowBatt.length > noBatt.length ? `${lowBatt.length - noBatt.length} packs to swap` : '', noBatt.length ? `${noBatt.length} not reporting a charge` : ''].filter(Boolean).join(', ') : min != null ? `lowest ${Math.round(min)}%` : '—', pads: lowBatt.map(a => a.pad) },
    { id: 'gps', label: '3D GPS fix on every aircraft', ok: noFix.length === 0, detail: noFix.length ? `${noFix.length} without` : 'all fixed', pads: noFix.map(a => a.pad) },
    { id: 'firmware', label: 'Every aircraft on the same firmware', ok: odd.length === 0, detail: odd.length ? `${odd.length} on another version` : main ?? '—', pads: odd.map(a => a.pad) },
  ];
  return {
    n: list.length, counts, battery: { buckets, below, min, avg: nb ? sum / nb : null, unknown }, bySystem, issues, firmware,
    service: { propsDue, motorsDue }, gates, go: gates.every(g => g.ok),
    blocked: new Set(gates.filter(g => !g.ok).flatMap(g => g.pads)).size,
  };
}

/** What a light-show operator has to do before the fleet is a go, in one sentence. */
export function goSentence(s: FleetStats): string {
  if (s.go) return `Go: all ${s.n} aircraft are ready.`;
  const steps: string[] = [];
  const g = (id: string) => s.gates.find(x => x.id === id)!;
  if (!g('faults').ok) steps.push(`ground ${s.counts.GROUNDED} aircraft and fly spares in their slots`);
  if (!g('battery').ok) {
    if (s.battery.below) steps.push(`swap ${s.battery.below} pack${s.battery.below === 1 ? '' : 's'} under ${SHOW_MIN_BATTERY}%`);
    const unread = g('battery').pads.length - s.battery.below;
    if (unread > 0) steps.push(`get a battery reading from ${unread} aircraft`);
  }
  if (!g('report').ok) steps.push(`bring ${s.counts.SILENT} silent aircraft back on the link or replace them`);
  if (!g('gps').ok) steps.push('wait for a 3D GPS fix on every aircraft');
  if (!g('firmware').ok) steps.push('put every aircraft on the same firmware');
  const txt = steps.join(', ');
  return `Hold: ${txt.charAt(0).toUpperCase()}${txt.slice(1)}.`;
}

export { LIMITS };
