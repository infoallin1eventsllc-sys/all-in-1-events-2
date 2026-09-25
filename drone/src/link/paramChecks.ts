import { FENCE_TYPE, type ParamValue } from './mavlink';

/**
 * Pre-flight checks read from the autopilot's parameters. Pure functions over what the link has read,
 * so they are unit-tested (scripts/mavlink.test.mjs) and shared by the link's pre-flight and the survey.
 *
 * A name missing from `Params` has not been asked for yet; null means it was asked and the aircraft did
 * not answer (or answered that it has no such parameter). Both say so instead of guessing a default.
 */
export type Params = Record<string, ParamValue | null>;
type Ap = 'ARDUPILOT' | 'PX4';

/**
 * What the pre-flight reads, in order. ArduCopter 4.7 moved RTL_ALT (cm) to RTL_ALT_M (m)
 * (ArduCopter/mode_rtl.cpp conversion table), so RTL_ALT is read only when RTL_ALT_M is not there.
 * FENCE_AUTOENABLE is Plane-only before Copter 4.6; FENCE_ALT_MAX_TP exists from 4.7.
 */
export const PREFLIGHT_PARAMS: Record<Ap, string[]> = {
  // The fence check's own first (the survey holds its upload until they answer), then ones older firmware lacks:
  // an autopilot without PARAM_ERROR stays silent about those, and each costs the full retry time.
  ARDUPILOT: ['FENCE_TYPE', 'FENCE_ENABLE', 'FENCE_RADIUS', 'FENCE_ALT_MAX', 'FENCE_ACTION', 'BATT_FS_LOW_ACT', 'RTL_ALT_M', 'RTL_ALT', 'FENCE_AUTOENABLE', 'FENCE_ALT_MAX_TP'],
  PX4: ['GF_ACTION', 'GF_MAX_HOR_DIST', 'GF_MAX_VER_DIST', 'RTL_RETURN_ALT', 'COM_LOW_BAT_ACT'],
};
/** Read `name` only when the key parameter did not answer. */
export const READ_UNLESS: Record<string, string> = { RTL_ALT: 'RTL_ALT_M' };
export const FENCE_PARAMS: Record<Ap, string[]> = {
  ARDUPILOT: ['FENCE_ENABLE', 'FENCE_TYPE', 'FENCE_RADIUS', 'FENCE_ALT_MAX', 'FENCE_AUTOENABLE', 'FENCE_ALT_MAX_TP'],
  PX4: ['GF_ACTION', 'GF_MAX_HOR_DIST', 'GF_MAX_VER_DIST'],
};

export interface ParamCheck { id: string; label: string; ok: boolean; detail: string; advisory: boolean }
export interface ParamFix { name: string; value: number }

const v = (p: Params, n: string) => p[n]?.value;
/** 'reading…' before an answer could have come, 'not read' after the aircraft stayed silent. */
const missing = (p: Params, ...names: string[]) => (names.some(n => !(n in p)) ? 'reading…' : 'not read');
const known = (p: Params, n: string) => p[n] != null;

/** RTL altitude above home in metres, or null when not read. */
export function rtlAltM(ap: Ap, p: Params): number | null {
  if (ap === 'PX4') return known(p, 'RTL_RETURN_ALT') ? v(p, 'RTL_RETURN_ALT')! : null;
  if (known(p, 'RTL_ALT_M')) return v(p, 'RTL_ALT_M')!;
  return known(p, 'RTL_ALT') ? v(p, 'RTL_ALT')! / 100 : null; // RTL_ALT is centimetres
}
const rtlName = (ap: Ap, p: Params) => (ap === 'PX4' ? 'RTL_RETURN_ALT' : known(p, 'RTL_ALT_M') || !known(p, 'RTL_ALT') ? 'RTL_ALT_M' : 'RTL_ALT');

// Copter's FENCE_ACTION / BATT_FS_LOW_ACT values (libraries/AC_Fence/AC_Fence.cpp, AP_BattMonitor_Params.cpp);
// PX4's GF_ACTION (navigator/geofence_params.yaml) and COM_LOW_BAT_ACT (commander/commander_params.yaml).
const AP_FENCE_ACT: Record<number, string> = { 0: 'report only', 1: 'RTL or land', 2: 'land', 3: 'SmartRTL, RTL or land', 4: 'brake or land', 5: 'SmartRTL or land' };
const AP_BATT_ACT: Record<number, string> = { 0: 'warn only', 1: 'land', 2: 'RTL', 3: 'SmartRTL or RTL', 4: 'SmartRTL or land', 5: 'terminate', 6: 'landing sequence or RTL', 7: 'brake or land' };
const PX4_FENCE_ACT: Record<number, string> = { 0: 'none', 1: 'warning', 2: 'hold', 3: 'return', 4: 'terminate', 5: 'land' };
const PX4_BATT_ACT: Record<number, string> = { 0: 'warning', 2: 'land', 3: 'return, land when emergency', 4: 'return, terminate when emergency' };
const AP_RETURNS = [1, 2, 3, 4, 5], AP_BATT_RETURNS = [1, 2, 3, 4, 6, 7], PX4_FENCE_RETURNS = [3, 5], PX4_BATT_RETURNS = [2, 3];

/** The link's parameter pre-flight: all amber advisories, the crew decides. */
export function paramPreflight(ap: Ap, p: Params): ParamCheck[] {
  const out: ParamCheck[] = [];
  const act = (id: string, label: string, name: string, names: Record<number, string>, good: number[]) => {
    const x = v(p, name);
    out.push({ id, label, ok: x !== undefined && good.includes(x), advisory: true,
      detail: x === undefined ? `${name} ${missing(p, name)}` : `${name} ${x}: ${names[x] ?? 'unknown'}` });
  };
  if (ap === 'PX4') {
    act('batt-fs', 'Battery failsafe returns or lands', 'COM_LOW_BAT_ACT', PX4_BATT_ACT, PX4_BATT_RETURNS);
    act('fence-act', 'Geofence action returns or lands', 'GF_ACTION', PX4_FENCE_ACT, PX4_FENCE_RETURNS);
  } else {
    act('batt-fs', 'Battery failsafe returns or lands', 'BATT_FS_LOW_ACT', AP_BATT_ACT, AP_BATT_RETURNS);
    act('fence-act', 'Geofence action returns or lands', 'FENCE_ACTION', AP_FENCE_ACT, AP_RETURNS);
  }
  const rtl = rtlAltM(ap, p), rn = rtlName(ap, p);
  // ArduCopter RTL_ALT 0 returns at the current height; either way, above 120 m the return itself is above the legal ceiling.
  out.push({ id: 'rtl-alt', label: 'Return altitude within 120 m', ok: rtl !== null && rtl <= 120, advisory: true,
    detail: rtl === null ? `${rn} ${ap === 'PX4' ? missing(p, rn) : missing(p, 'RTL_ALT_M', 'RTL_ALT')}` : rtl === 0 && ap !== 'PX4' ? `${rn} 0: returns at its current height` : `${rn} ${+rtl.toFixed(1)} m` });
  return out;
}

/** The survey's return-altitude advisory: an RTL from low (after takeoff, on a resume) should climb to at least the survey height, which clears the site. */
export function rtlVsPlan(ap: Ap, p: Params, planAltM: number): ParamCheck {
  const rtl = rtlAltM(ap, p), rn = rtlName(ap, p);
  return { id: 'rtl-plan', label: 'Return altitude at or above the survey height', advisory: true,
    ok: rtl !== null && (rtl >= planAltM - 0.5 || (rtl === 0 && ap !== 'PX4')),
    detail: rtl === null ? `${rn} ${missing(p, rn)}` : `return ${+rtl.toFixed(1)} m · survey ${planAltM} m` };
}

/** flight_sw_version → true on ArduPilot 4.6+, which honours DO_FENCE_ENABLE's fence-type mask (see encodeFenceEnable). */
export const fenceMaskHonoured = (swVersion: number) => { const maj = swVersion >>> 24, min = (swVersion >> 16) & 0xff; return maj > 4 || (maj === 4 && min >= 6); };

export interface FenceNeed {
  /** Farthest point of the uploaded fence from the autopilot's home, metres (a circle round home must contain it). */
  reachM: number;
  /** Highest the flight goes above home, with margin, metres. */
  altM: number;
  /** The dashboard will upload a polygon and enable it (the survey's geofence toggle). */
  polygon: boolean;
  swVersion: number;
  /** Home AMSL, for ArduPilot FENCE_ALT_MAX_TP 0 (above sea level). */
  homeAmslM?: number;
}
export interface FenceCheck extends ParamCheck { fixes: ParamFix[] }

const up10 = (m: number) => Math.ceil(m / 10) * 10;

/**
 * Would a fence the autopilot will enforce stop the survey part way? Red when the parameters say so, and
 * while they are still being read (an upload should not race the answer); reads the aircraft never
 * answered are amber, with the numbers the crew should check by hand.
 * `fixes` is the smallest change that clears it: the limit raised to what the flight needs, or on
 * ArduPilot the circle dropped from FENCE_TYPE when no radius in range would do.
 */
export function fenceParamCheck(ap: Ap, p: Params, need: FenceNeed): FenceCheck {
  const reach = up10(need.reachM), alt = up10(need.altM);
  if (ap === 'PX4') {
    const label = 'Autopilot fence limits clear the survey';
    if (!known(p, 'GF_ACTION') || !known(p, 'GF_MAX_HOR_DIST') || !known(p, 'GF_MAX_VER_DIST')) {
      const m = missing(p, 'GF_ACTION', 'GF_MAX_HOR_DIST', 'GF_MAX_VER_DIST');
      return { id: 'fence-params', label, ok: false, advisory: m !== 'reading…', fixes: [], detail: `${m}: needs GF_MAX_HOR_DIST 0 or ≥ ${reach} m, GF_MAX_VER_DIST 0 or ≥ ${alt} m` };
    }
    // navigator/geofence.cpp: each limit applies when > 0, and GF_ACTION 0 does nothing about any breach.
    if (v(p, 'GF_ACTION') === 0) return { id: 'fence-params', label, ok: true, advisory: false, fixes: [], detail: 'GF_ACTION 0: no fence action' };
    const h = v(p, 'GF_MAX_HOR_DIST')!, z = v(p, 'GF_MAX_VER_DIST')!;
    const fixes: ParamFix[] = [], bad: string[] = [];
    if (h > 0 && h < reach) { fixes.push({ name: 'GF_MAX_HOR_DIST', value: reach }); bad.push(`GF_MAX_HOR_DIST ${h} m < ${reach} m`); }
    if (z > 0 && z < alt) { fixes.push({ name: 'GF_MAX_VER_DIST', value: alt }); bad.push(`GF_MAX_VER_DIST ${z} m < ${alt} m`); }
    return { id: 'fence-params', label, ok: !fixes.length, advisory: false, fixes,
      detail: bad.length ? bad.join(' · ') : `horizontal ${h ? `${h} m` : 'off'}, vertical ${z ? `${z} m` : 'off'}` };
  }

  const label = 'Autopilot fence limits clear the survey';
  const hint = `needs FENCE_RADIUS ≥ ${reach} m, FENCE_ALT_MAX ≥ ${alt} m, or those types off`;
  if (!known(p, 'FENCE_TYPE')) return { id: 'fence-params', label, ok: false, advisory: 'FENCE_TYPE' in p, fixes: [], detail: `FENCE_TYPE ${missing(p, 'FENCE_TYPE')}: ${hint}` };
  const T = v(p, 'FENCE_TYPE')!;
  // Which types will be enforced (libraries/AC_Fence/AC_Fence.cpp): FENCE_ENABLE 1 enables every configured type at boot,
  // FENCE_AUTOENABLE enables them at takeoff or arming, and the dashboard's enable asks for the polygon only, which 4.5
  // and earlier ignore by enabling them all. FENCE_ENABLE not read counts as on: better a check too many than a breach.
  const byParam = !known(p, 'FENCE_ENABLE') || v(p, 'FENCE_ENABLE') === 1 || (v(p, 'FENCE_AUTOENABLE') ?? 0) > 0;
  const on = byParam || (need.polygon && !fenceMaskHonoured(need.swVersion));
  const fixes: ParamFix[] = [], bad: string[] = [], notes: string[] = [];
  let type = T, unread = false, pending = !('FENCE_ENABLE' in p);
  if (on && T & FENCE_TYPE.CIRCLE) {
    if (!known(p, 'FENCE_RADIUS')) { unread = true; pending ||= !('FENCE_RADIUS' in p); }
    else if (v(p, 'FENCE_RADIUS')! < reach) {
      bad.push(`circle ${v(p, 'FENCE_RADIUS')} m < ${reach} m`);
      if (reach <= 10000) fixes.push({ name: 'FENCE_RADIUS', value: reach }); else type &= ~FENCE_TYPE.CIRCLE; // FENCE_RADIUS range 30–10000
    }
  }
  if (on && T & FENCE_TYPE.ALT_MAX) {
    // FENCE_ALT_MAX_TP (4.7+): 1 above home (default), 0 above sea level; origin and terrain are taken as above home.
    const amsl = v(p, 'FENCE_ALT_MAX_TP') === 0 && need.homeAmslM !== undefined;
    const needAlt = amsl ? up10(need.homeAmslM! + need.altM) : alt;
    if (!known(p, 'FENCE_ALT_MAX')) { unread = true; pending ||= !('FENCE_ALT_MAX' in p); }
    else if (v(p, 'FENCE_ALT_MAX')! < needAlt) {
      bad.push(`max altitude ${v(p, 'FENCE_ALT_MAX')} m${amsl ? ' AMSL' : ''} < ${needAlt} m`);
      if (needAlt <= 1000) fixes.push({ name: 'FENCE_ALT_MAX', value: needAlt }); else type &= ~FENCE_TYPE.ALT_MAX; // range 10–1000
    }
  }
  // No polygon type: the uploaded fence is stored but never enforced, and a 4.6+ enable of it is refused.
  if (need.polygon && !(T & FENCE_TYPE.POLYGON)) { type |= FENCE_TYPE.POLYGON; notes.push('polygon not in FENCE_TYPE'); }
  if (type !== T) fixes.push({ name: 'FENCE_TYPE', value: type });
  if (bad.length) return { id: 'fence-params', label, ok: false, advisory: false, fixes, detail: [...bad, ...notes].join(' · ') };
  if (pending) return { id: 'fence-params', label, ok: false, advisory: false, fixes: [], detail: `reading FENCE_ENABLE, FENCE_RADIUS, FENCE_ALT_MAX…` };
  if (unread) return { id: 'fence-params', label, ok: false, advisory: true, fixes, detail: `FENCE_RADIUS or FENCE_ALT_MAX ${missing(p, 'FENCE_RADIUS', 'FENCE_ALT_MAX')}: ${hint}` };
  const limits = [T & FENCE_TYPE.CIRCLE && `FENCE_RADIUS ${v(p, 'FENCE_RADIUS')} m`, T & FENCE_TYPE.ALT_MAX && `FENCE_ALT_MAX ${v(p, 'FENCE_ALT_MAX')} m`].filter(Boolean).join(', ');
  return { id: 'fence-params', label, ok: !notes.length, advisory: true, fixes,
    detail: notes.length ? notes.join(' · ') : !on ? 'circle and altitude fences stay off' : limits ? `${limits}: clear` : 'polygon only' };
}
