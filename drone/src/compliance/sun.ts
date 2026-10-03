/**
 * Sunrise and sunset from a date and a position: the NOAA solar calculator's
 * equations (Meeus, low precision), good to about a minute between the polar
 * circles. Zenith 90.833°: the sun's upper edge on the horizon, with refraction.
 *
 * 107.29 needs anti-collision lighting from sunset (civil twilight) until
 * sunrise, so "is it dark?" here means "is it after sunset or before sunrise".
 */

const D = Math.PI / 180;
const MIN = 60_000, DAY = 86_400_000;

/** Declination (deg) and equation of time (min) at a Julian day. */
function solar(jd: number) {
  const T = (jd - 2451545) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * D) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * D) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * D) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * D);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega * D);
  const decl = Math.asin(Math.sin(eps * D) * Math.sin(lambda * D)) / D;
  const y = Math.tan((eps / 2) * D) ** 2;
  const eqt = 4 / D * (y * Math.sin(2 * L0 * D) - 2 * e * Math.sin(M * D) + 4 * e * y * Math.sin(M * D) * Math.cos(2 * L0 * D)
    - 0.5 * y * y * Math.sin(4 * L0 * D) - 1.25 * e * e * Math.sin(2 * M * D));
  return { decl, eqt };
}

/** Hour angle (deg) of sunrise/sunset, or which way it fails: the sun never sets (DAY) or never rises (NIGHT). */
function hourAngle(lat: number, decl: number): number | 'DAY' | 'NIGHT' {
  const c = Math.cos(90.833 * D) / (Math.cos(lat * D) * Math.cos(decl * D)) - Math.tan(lat * D) * Math.tan(decl * D);
  return c > 1 ? 'NIGHT' : c < -1 ? 'DAY' : Math.acos(c) / D;
}

export interface SunTimes { sunrise: number | null; sunset: number | null; polar?: 'DAY' | 'NIGHT' }

/**
 * Sunrise and sunset (UTC ms) for a calendar date where it is that date in local
 * solar time. Each event is solved twice: once at solar noon, then again at the
 * event itself, since the sun moves in the hours between.
 */
export function sunTimes(ymd: string, lat: number, lon: number): SunTimes {
  const [y, m, d] = ymd.split('-').map(Number);
  const day0 = Date.UTC(y, m - 1, d);
  const jdAt = (ms: number) => ms / DAY + 2440587.5;
  const at = (guess: number, sign: -1 | 1): number | 'DAY' | 'NIGHT' => {
    const { decl, eqt } = solar(jdAt(guess));
    const ha = hourAngle(lat, decl);
    return typeof ha === 'number' ? day0 + (720 - 4 * lon - eqt + sign * 4 * ha) * MIN : ha;
  };
  const noon = day0 + (720 - 4 * lon) * MIN;
  const r0 = at(noon, -1), s0 = at(noon, 1);
  if (typeof r0 !== 'number' || typeof s0 !== 'number') return { sunrise: null, sunset: null, polar: typeof r0 === 'number' ? (s0 as 'DAY' | 'NIGHT') : r0 };
  const r1 = at(r0, -1), s1 = at(s0, 1);
  return { sunrise: typeof r1 === 'number' ? r1 : r0, sunset: typeof s1 === 'number' ? s1 : s0 };
}

/** The local solar calendar date at an instant and longitude (no time zone database needed). */
export function solarDate(now: number, lon: number): string {
  return new Date(now + (lon / 15) * 3_600_000).toISOString().slice(0, 10);
}

/** After sunset or before sunrise at this place and instant. */
export function isDark(now: number, lat: number, lon: number): { dark: boolean; sunrise: number | null; sunset: number | null } {
  const t = sunTimes(solarDate(now, lon), lat, lon);
  if (t.polar) return { dark: t.polar === 'NIGHT', sunrise: null, sunset: null };
  return { dark: now < t.sunrise! || now >= t.sunset!, sunrise: t.sunrise, sunset: t.sunset };
}
