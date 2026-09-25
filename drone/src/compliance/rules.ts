import type { Aircraft, Authorization, ComplianceData, ComplianceSnapshot, Pilot, Sighting, Site, Waiver, Ymd } from './types';
import { isDark } from './sun';

/**
 * Part 107 record-keeping rules, as pure functions over the records and a date.
 *
 * Only what the regulation says plainly is encoded; everything else is the
 * crew's own check. A record-keeping aid, not legal advice: the FAA's current
 * rules and each waiver's own conditions govern.
 */

export const SOON_DAYS = 30;

// ---------------------------------------------------------------------------
// Calendar dates
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (d: Ymd) => d.split('-').map(Number) as [number, number, number];
export const isYmd = (d: unknown): d is Ymd => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
/** The operator's local calendar day. */
export const todayYmd = (now = Date.now()) => { const t = new Date(now); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const dayNum = (d: Ymd) => { const [y, m, dd] = parts(d); return Date.UTC(y, m - 1, dd) / DAY; };
export const daysBetween = (from: Ymd, to: Ymd) => dayNum(to) - dayNum(from);
export const addDays = (d: Ymd, n: number) => new Date((dayNum(d) + n) * DAY).toISOString().slice(0, 10);
/** Same day n years on; 29 February falls back to the 28th. */
export function addYears(d: Ymd, n: number): Ymd {
  const [y, m, dd] = parts(d);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${pad(m)}-${pad(Math.min(dd, last))}`;
}
/** Last day of the month `n` calendar months after `d`'s month. */
export function endOfMonthAfter(d: Ymd, n: number): Ymd {
  const [y, m] = parts(d);
  const i = y * 12 + (m - 1) + n, ny = Math.floor(i / 12), nm = (i % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(new Date(Date.UTC(ny, nm, 0)).getUTCDate())}`;
}
export const fmtYmd = (d: Ymd | undefined, withYear = true) => {
  if (!isYmd(d)) return '—';
  const [y, m, dd] = parts(d);
  return new Date(y, m - 1, dd).toLocaleDateString([], withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type Status = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | 'PENDING';

/** Good through `expires` (inclusive); expiring inside 30 days; not yet started before `from`. */
export function statusOf(expires: Ymd | undefined, today: Ymd, from?: Ymd): Status {
  if (!isYmd(expires)) return 'MISSING';
  if (isYmd(from) && today < from) return 'PENDING';
  if (today > expires) return 'EXPIRED';
  return daysBetween(today, expires) <= SOON_DAYS ? 'EXPIRING' : 'VALID';
}
/** Usable today: valid, or valid but due soon. */
export const usable = (s: Status) => s === 'VALID' || s === 'EXPIRING';
const WORST: Status[] = ['MISSING', 'EXPIRED', 'PENDING', 'EXPIRING', 'VALID'];
export const worst = (...s: Status[]) => WORST.find(w => s.includes(w)) ?? 'VALID';

/** 107.65: knowledge recency lasts 24 calendar months, i.e. to the end of the 24th month after the month passed. */
export const recurrentDue = (trainedOn: Ymd | undefined) => (isYmd(trainedOn) ? endOfMonthAfter(trainedOn, 24) : undefined);
/** Part 48: registration is good for three years; the date printed on the certificate wins. */
export const registrationExpiry = (a: Pick<Aircraft, 'regIssued' | 'regExpires'>) => (isYmd(a.regExpires) ? a.regExpires : isYmd(a.regIssued) ? addYears(a.regIssued, 3) : undefined);

export function pilotStatus(p: Pilot, today: Ymd): Status {
  return p.certNumber.trim() ? statusOf(recurrentDue(p.trainedOn), today) : 'MISSING';
}
/** Part 89: declared means a method, and a broadcast serial unless flying only inside a FRIA. */
export const ridDeclared = (a: Aircraft) => !!a.ridMethod && (a.ridMethod === 'FRIA' || !!a.ridSerial?.trim());
export function aircraftStatus(a: Aircraft, today: Ymd): Status {
  const reg = a.regNumber.trim() ? statusOf(registrationExpiry(a), today) : 'MISSING';
  return worst(reg, ridDeclared(a) ? 'VALID' : 'MISSING');
}

/** 107.35: covers `fleet` aircraft on `today`. */
export function waiverCovers(w: Waiver, fleet: number, today: Ymd): boolean {
  return w.section === '107.35' && usable(statusOf(w.validTo, today, w.validFrom)) && (w.maxAircraft ?? 0) >= fleet;
}

export interface ReviewItem { kind: 'pilot' | 'aircraft' | 'waiver' | 'authorization' | 'insurance' | 'permit'; id: string; label: string; status: Status }

/**
 * Every record's standing today, plus what is missing outright: no pilot, no
 * aircraft, no insurance. Waivers, authorizations and permits are only needed
 * for some jobs, so their absence is not an item.
 */
export function review(d: ComplianceData, today: Ymd): ReviewItem[] {
  const out: ReviewItem[] = [
    ...d.pilots.map(p => ({ kind: 'pilot' as const, id: p.id, label: p.name, status: pilotStatus(p, today) })),
    ...d.aircraft.map(a => ({ kind: 'aircraft' as const, id: a.id, label: a.name, status: aircraftStatus(a, today) })),
    ...d.waivers.map(w => ({ kind: 'waiver' as const, id: w.id, label: `Waiver ${w.number}`, status: statusOf(w.validTo, today, w.validFrom) })),
    ...d.authorizations.map(a => ({ kind: 'authorization' as const, id: a.id, label: a.reference, status: statusOf(a.validTo, today, a.validFrom) })),
    ...d.insurance.map(i => ({ kind: 'insurance' as const, id: i.id, label: i.carrier, status: statusOf(i.expires, today) })),
    ...d.permits.map(p => ({ kind: 'permit' as const, id: p.id, label: p.venue, status: statusOf(p.expires, today, p.validFrom) })),
  ];
  if (!d.pilots.length) out.push({ kind: 'pilot', id: '', label: 'Remote pilot', status: 'MISSING' });
  if (!d.aircraft.length) out.push({ kind: 'aircraft', id: '', label: 'Aircraft', status: 'MISSING' });
  if (!d.insurance.length) out.push({ kind: 'insurance', id: '', label: 'Liability insurance', status: 'MISSING' });
  return out;
}
/** Per-job papers that lapse are history, not a problem: a LAANC window or an event's permit closing is normal. */
const PER_JOB = new Set<ReviewItem['kind']>(['authorization', 'permit', 'waiver']);
export const needsAttention = (items: ReviewItem[]) => items.filter(i => i.status === 'MISSING' || (i.status === 'EXPIRED' && !PER_JOB.has(i.kind)));
/** Renewals coming due. An authorization's window is short by design: it ends, it isn't renewed. */
export const renewalsDue = (items: ReviewItem[]) => items.filter(i => i.status === 'EXPIRING' && i.kind !== 'authorization');

// ---------------------------------------------------------------------------
// Who and what is flying
// ---------------------------------------------------------------------------

/** The operator's own record if their name matches, else the chosen pilot in command, else the first. */
export function pilotInCommand(d: ComplianceData, operatorName?: string): Pilot | undefined {
  const n = operatorName?.trim().toLowerCase();
  return (n && d.pilots.find(p => p.name.trim().toLowerCase() === n)) || d.pilots.find(p => p.id === d.settings.picId) || d.pilots[0];
}
/** The aircraft on the link: by MAVLink system ID, else the first flagged for this work. */
export function linkedAircraft(d: ComplianceData, use: Aircraft['use'], sysId?: number): Aircraft | undefined {
  return (sysId ? d.aircraft.find(a => a.mavSysId === sysId) : undefined) ?? d.aircraft.find(a => a.use === use) ?? d.aircraft.find(a => a.use === 'ANY');
}
export const siteNamed = (d: ComplianceData, name: string) => d.sites.find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase());
export const showSite = (d: ComplianceData): Site | undefined => d.sites.find(s => s.id === d.settings.showSiteId) ?? d.sites[0];

const norm = (s: string) => s.trim().toUpperCase();
/** Remote ID cross-check (advisory): has the venue receiver heard this aircraft's declared serial? */
export function ridBroadcast(a: Aircraft, sightings: Sighting[]): { state: 'CONFIRMED' | 'NOT_SEEN' | 'NOT_APPLICABLE' | 'NO_SERIAL'; seen?: Sighting } {
  if (a.ridMethod === 'FRIA') return { state: 'NOT_APPLICABLE' };
  if (!a.ridSerial?.trim()) return { state: 'NO_SERIAL' };
  const seen = sightings.filter(s => norm(s.serial) === norm(a.ridSerial!)).sort((x, y) => y.at - x.at)[0];
  return seen ? { state: 'CONFIRMED', seen } : { state: 'NOT_SEEN' };
}

// ---------------------------------------------------------------------------
// Pre-flight gates
// ---------------------------------------------------------------------------

export interface Gate { id: string; label: string; ok: boolean; detail: string; cite: string; advisory?: boolean }

function pilotGate(d: ComplianceData, today: Ymd, operatorName?: string): Gate {
  const p = pilotInCommand(d, operatorName);
  const due = recurrentDue(p?.trainedOn);
  const st = p ? pilotStatus(p, today) : 'MISSING';
  return {
    id: 'faa-pilot', cite: '107.12 · 107.65', ok: usable(st),
    label: p ? `${p.name}: remote pilot certificate, training current` : 'Remote pilot certificate on file',
    detail: !p ? 'No pilot on file' : !p.certNumber.trim() ? 'No certificate number' : !due ? 'No recurrent training date' : st === 'EXPIRED' ? `Recurrent training lapsed ${fmtYmd(due)}` : `Cert ${p.certNumber} · current to ${fmtYmd(due)}`,
  };
}

/**
 * The light show's gates. One pilot flying more than one aircraft needs a 107.35
 * waiver for at least the fleet on today's date; after sunset 107.29 needs
 * anti-collision lighting visible for 3 statute miles (a current pilot trained
 * after the 2021 night rule, so recency covers 107.29's training part); the
 * client's insurance must be in force.
 */
export function showGates(d: ComplianceData, o: { fleet: number; now: number; operatorName?: string; at?: { lat: number; lon: number } }): Gate[] {
  const today = todayYmd(o.now);
  const gates: Gate[] = [];
  if (o.fleet > 1) {
    const all = d.waivers.filter(w => w.section === '107.35');
    const good = all.find(w => waiverCovers(w, o.fleet, today));
    const inDate = all.filter(w => usable(statusOf(w.validTo, today, w.validFrom))).sort((a, b) => (b.maxAircraft ?? 0) - (a.maxAircraft ?? 0))[0];
    gates.push({
      id: 'faa-waiver', cite: '107.35 waiver', ok: !!good, label: `Waiver for ${o.fleet} aircraft, one pilot`,
      detail: good ? `${good.number} · up to ${good.maxAircraft} · to ${fmtYmd(good.validTo)}`
        : inDate ? `${inDate.number} covers ${inDate.maxAircraft ?? 0}; show has ${o.fleet}`
        : all.length ? 'No 107.35 waiver in date today' : 'No 107.35 waiver on file',
    });
  }
  const site = o.at ?? showSite(d);
  if (site) {
    const sun = isDark(o.now, site.lat, site.lon);
    // Clock time is the viewer's zone (the crew is at the site); the countdown reads right from anywhere.
    const hhmm = (t: number | null) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
    const until = (t: number | null) => { if (!t || t <= o.now) return ''; const m = Math.round((t - o.now) / 60_000); return ` · in ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`}`; };
    gates.push({
      id: 'faa-night', cite: '107.29', ok: !sun.dark || d.settings.showLighting,
      label: sun.dark ? 'Night: anti-collision lighting, 3 statute miles' : 'Daylight: no night lighting needed',
      detail: sun.dark ? (d.settings.showLighting ? `After sunset (${hhmm(sun.sunset)}) · lighting confirmed` : `After sunset (${hhmm(sun.sunset)}) · confirm lighting in Compliance`) : `Sunset ${hhmm(sun.sunset)}${until(sun.sunset)}`,
    });
  } else {
    gates.push({ id: 'faa-night', cite: '107.29', ok: false, label: 'Show site for the sunset time', detail: 'Add the show site in Compliance' });
  }
  const ins = d.insurance.filter(i => usable(statusOf(i.expires, today))).sort((a, b) => b.expires.localeCompare(a.expires))[0];
  gates.push({ id: 'faa-insurance', cite: 'client / venue', ok: !!ins, label: 'Liability insurance in force',
    detail: ins ? `${ins.policy} · to ${fmtYmd(ins.expires)}` : d.insurance.length ? 'Policy expired' : 'No policy on file' });
  gates.push(pilotGate(d, today, o.operatorName));
  return gates;
}

/** Authorization that covers today and the planned height. */
export function authorizationFor(d: ComplianceData, today: Ymd, altitudeFt: number): Authorization | undefined {
  return d.authorizations.find(a => usable(statusOf(a.validTo, today, a.validFrom)) && a.ceilingFt >= altitudeFt);
}

/** The survey's paperwork checks, added to its flight checklist (src/components/survey/useSurveyFlight.ts). */
export function surveyChecks(d: ComplianceData, o: { now: number; siteName: string; altitudeM: number; sysId?: number; operatorName?: string }): Gate[] {
  const today = todayYmd(o.now);
  const a = linkedAircraft(d, 'SURVEY', o.sysId);
  const reg = a ? registrationExpiry(a) : undefined;
  const regSt = a?.regNumber.trim() ? statusOf(reg, today) : 'MISSING';
  const site = siteNamed(d, o.siteName);
  const ft = Math.round(o.altitudeM * 3.28084);
  const auth = authorizationFor(d, today, ft);
  const anyAuth = d.authorizations.find(x => usable(statusOf(x.validTo, today, x.validFrom)));
  return [
    pilotGate(d, today, o.operatorName),
    { id: 'faa-reg', cite: 'Part 48', ok: usable(regSt), label: a ? `${a.name}: FAA registration in date` : 'Aircraft registration on file',
      detail: !a ? 'No aircraft record for this link (Compliance)' : regSt === 'MISSING' ? 'No registration number' : regSt === 'EXPIRED' ? `Expired ${fmtYmd(reg)}` : `${a.regNumber} · to ${fmtYmd(reg)}` },
    { id: 'faa-rid', cite: 'Part 89', ok: !!a && ridDeclared(a), label: 'Remote ID declared for this aircraft',
      detail: !a ? 'No aircraft record' : !a.ridMethod ? 'No Remote ID method' : a.ridMethod === 'FRIA' ? 'FRIA: only inside the recognized area' : a.ridSerial?.trim() ? `${a.ridMethod === 'MODULE' ? 'Module' : 'Standard'} · ${a.ridSerial}` : 'No broadcast serial' },
    site?.controlledAirspace
      ? { id: 'faa-airspace', cite: '107.41', ok: !!auth, label: `Controlled airspace: authorization to ${ft} ft`,
          detail: auth ? `${auth.kind === 'LAANC' ? 'LAANC' : 'DroneZone'} ${auth.reference} · ${auth.ceilingFt} ft` : anyAuth ? `${anyAuth.reference} allows ${anyAuth.ceilingFt} ft; plan is ${ft}` : 'No authorization in date' }
      : site
        ? { id: 'faa-airspace', cite: '107.41', ok: true, label: 'Airspace: site not controlled', detail: `${site.name} (as marked in Compliance)` }
        : { id: 'faa-airspace', cite: '107.41', ok: false, advisory: true, label: 'Check the airspace for this site', detail: 'B4UFLY, then mark the site in Compliance' },
  ];
}

// ---------------------------------------------------------------------------
// Flight record snapshot, import
// ---------------------------------------------------------------------------

const USE_OF = { LIGHT_SHOW: 'LIGHT_SHOW', SURVEY: 'SURVEY', SURVEILLANCE: 'SURVEILLANCE', DEFENSE: 'SURVEILLANCE' } as const;

/** The paperwork a session starts under, kept with its record (numbers only, never the files). */
export function snapshotFor(d: ComplianceData, vertical: keyof typeof USE_OF, now: number, operatorName?: string): ComplianceSnapshot {
  const today = todayYmd(now);
  const p = pilotInCommand(d, operatorName);
  const use = USE_OF[vertical];
  const craft = d.aircraft.filter(a => a.use === use);
  const w = d.waivers.filter(x => x.section === '107.35' && usable(statusOf(x.validTo, today, x.validFrom))).sort((a, b) => (b.maxAircraft ?? 0) - (a.maxAircraft ?? 0))[0];
  const auth = d.authorizations.find(x => usable(statusOf(x.validTo, today, x.validFrom)));
  const ins = d.insurance.find(x => usable(statusOf(x.expires, today)));
  return {
    ...(p ? { pilot: p.name, pilotCert: p.certNumber } : {}),
    aircraft: craft.map(a => ({ name: a.name, reg: a.regNumber })),
    ...(use === 'LIGHT_SHOW' && w ? { waiver: `${w.number} (107.35, up to ${w.maxAircraft})` } : {}),
    ...(use === 'SURVEY' && auth ? { authorization: `${auth.kind === 'LAANC' ? 'LAANC' : 'DroneZone'} ${auth.reference}` } : {}),
    ...(ins ? { insurance: `${ins.carrier} ${ins.policy}` } : {}),
  };
}

export const emptyData = (): ComplianceData => ({ v: 1, pilots: [], aircraft: [], waivers: [], authorizations: [], insurance: [], permits: [], sites: [], sightings: [], settings: { showLighting: false } });

/** Accepts an exported file (or stored copy) and keeps only well-formed records; throws on something that isn't one. */
export function normalize(raw: unknown): ComplianceData {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) throw new Error('Not a Drone Command compliance file (expected "v": 1)');
  const r = raw as Record<string, unknown>, out = emptyData();
  const list = <T>(k: string, ok: (x: Record<string, unknown>) => boolean) => (Array.isArray(r[k]) ? (r[k] as Record<string, unknown>[]).filter(x => x && typeof x === 'object' && typeof x.id === 'string' && ok(x)) as unknown as T[] : []);
  const str = (x: unknown) => typeof x === 'string';
  out.pilots = list<ComplianceData['pilots'][number]>('pilots', x => str(x.name) && str(x.certNumber));
  out.aircraft = list<Aircraft>('aircraft', x => str(x.name) && str(x.regNumber)).map(a => ({ ...a, model: a.model ?? '', serial: a.serial ?? '', use: a.use ?? 'ANY' }));
  out.waivers = list<Waiver>('waivers', x => str(x.number) && isYmd(x.validFrom) && isYmd(x.validTo));
  out.authorizations = list<Authorization>('authorizations', x => str(x.reference) && typeof x.ceilingFt === 'number' && isYmd(x.validFrom) && isYmd(x.validTo));
  out.insurance = list<ComplianceData['insurance'][number]>('insurance', x => str(x.carrier) && isYmd(x.expires));
  out.permits = list<ComplianceData['permits'][number]>('permits', x => str(x.venue) && isYmd(x.expires));
  out.sites = list<Site>('sites', x => str(x.name) && typeof x.lat === 'number' && typeof x.lon === 'number');
  out.sightings = Array.isArray(r.sightings) ? (r.sightings as Sighting[]).filter(s => s && str(s.serial) && typeof s.at === 'number') : [];
  const s = (r.settings ?? {}) as Record<string, unknown>;
  out.settings = { showLighting: s.showLighting === true, ...(str(s.picId) ? { picId: s.picId as string } : {}), ...(str(s.showSiteId) ? { showSiteId: s.showSiteId as string } : {}), ...(str(s.receiverUrl) ? { receiverUrl: s.receiverUrl as string } : {}) };
  return out;
}
