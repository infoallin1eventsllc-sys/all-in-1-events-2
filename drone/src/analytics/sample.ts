import type { AircraftRollup, NotableEvent, SessionRollup } from './rollup';
import type { ServiceRecord } from './aggregate';
import type { LinkSource, Vertical } from '../record/db';

/**
 * Sample history: three months of plausible operations, so Analytics can be shown
 * before the fleet has flown. Every rollup is marked `sample: true`, the view says
 * so in a banner, and one click removes them. It never touches real records.
 *
 * Deterministic (seeded) so the same install always shows the same history.
 * It carries two things worth finding: T-60M's battery drains faster each week,
 * and the most-flown show drones are coming due for service.
 */

export function sampleHistory(now: number, days = 91): SessionRollup[] {
  let seed = 20260922;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const out: SessionRollup[] = [];
  const start = new Date(now); start.setHours(0, 0, 0, 0);

  const craft = (id: string, airborneS: number, speed: number, drain: number, extra: Partial<AircraftRollup> = {}): AircraftRollup => {
    const used = drain * (airborneS / 60);
    return { id, airborneS, distanceM: airborneS * speed * between(0.75, 0.9), maxAltM: between(55, 95), maxSpeedMps: speed * 1.2, batteryUsedPct: used, packs: Math.max(1, Math.ceil(used / 72)), minBatteryPct: Math.max(18, 100 - (used % 72) - 10), drainPctPerMin: drain, ...extra };
  };
  const session = (vertical: Vertical, title: string, source: LinkSource, t: number, durS: number, aircraft: AircraftRollup[], notable: NotableEvent[], highlights: Record<string, number>, info: number): SessionRollup => ({
    sessionId: `sample-${vertical.toLowerCase()}-${t.toString(36)}`, vertical, title, source, startedAt: t, endedAt: t + durS * 1000, durationS: durS,
    aircraft, notable, highlights,
    events: { total: info + notable.length, critical: notable.filter(n => n.severity === 'CRITICAL').length, warning: notable.filter(n => n.severity === 'WARNING').length, commands: Math.round(info / 3) },
    sample: true,
  });
  const warn = (t: number, text: string, aircraft?: string, kind = 'ALERT'): NotableEvent => ({ t, severity: 'WARNING', kind, text, ...(aircraft ? { aircraft } : {}) });
  const crit = (t: number, text: string, aircraft?: string, kind = 'ALERT'): NotableEvent => ({ t, severity: 'CRITICAL', kind, text, ...(aircraft ? { aircraft } : {}) });

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(start); day.setDate(day.getDate() - i);
    const dow = day.getDay(); // 0 Sun … 6 Sat
    const at = (h: number, m = 0) => day.getTime() + (h * 60 + m) * 60_000;
    const weekIndex = (days - 1 - i) / 7;

    // Light shows: Friday rehearsal in simulation, Saturday show; the odd Sunday booking.
    if (dow === 5 || dow === 6 || (dow === 0 && rnd() < 0.35)) {
      const rehearsal = dow === 5;
      const t = at(rehearsal ? 17 : 21, rehearsal ? 30 : 0);
      const durS = between(780, 1020);
      const n = 40;
      const aircraft = Array.from({ length: n }, (_, k) => craft(`DRN-${String(k + 1).padStart(3, '0')}`, durS * between(0.86, 0.94) * (k < 8 ? 1.12 : 1), 3.2, between(3.6, 4.1)));
      const notable: NotableEvent[] = [];
      if (rnd() < 0.5) notable.push(warn(t + 300_000, `DRN-0${10 + Math.floor(rnd() * 30)} deviation ${between(0.6, 1.1).toFixed(1)} m from its slot`, undefined, 'SHOW'));
      if (rnd() < 0.3) notable.push(warn(t + 60_000, `Wind ${between(7, 9).toFixed(1)} m/s at the launch pad`, undefined, 'SHOW'));
      if (!rehearsal && i === 9) notable.push(crit(t + 420_000, 'DRN-017 lost GPS — landed in place, show continued with 39', 'DRN-017', 'SHOW'));
      out.push(session('LIGHT_SHOW', rehearsal ? 'Rehearsal · 100 aircraft' : `Show · ${[100, 150, 200][Math.floor(rnd() * 3)]} aircraft`, rehearsal ? 'SIMULATION' : 'SERIAL', t, durS, aircraft, notable,
        { maxDeviationM: between(0.35, 0.9), avgSyncMs: between(0.4, 0.9) }, 12));
    }

    // Surveillance: overnight patrols on event nights and weekdays with a client booking.
    if (dow !== 1 && rnd() < 0.7) {
      const t = at(22, Math.floor(rnd() * 40));
      const durS = between(3, 5.5) * 3600;
      // T-60M's pack loses capacity week by week.
      const t60drain = 3.1 * (1 + 0.028 * weekIndex);
      const ids = ['T-80M', 'T-70M', 'T-60M'];
      const aircraft = ids.map(id => craft(id, durS * between(0.55, 0.7), 10.5, id === 'T-60M' ? t60drain : between(2.9, 3.3)));
      const notable: NotableEvent[] = [];
      const dets = Math.floor(between(1, 7));
      for (let k = 0; k < Math.min(2, dets); k++) notable.push(warn(t + between(0.2, 0.9) * durS * 1000, `${ids[k % 3]} detected person (${Math.floor(between(70, 94))}%)`, ids[k % 3], 'PATROL'));
      if (weekIndex > 3 && rnd() < 0.6) notable.push(warn(t + durS * 600, 'T-60M: battery 20% — RTH recommended', 'T-60M', 'PATROL'));
      if (i === 17) notable.push(crit(t + 3_600_000, 'T-70M link lost for 8 s — returned home on its own', 'T-70M', 'PATROL'));
      out.push(session('SURVEILLANCE', 'Patrol · Venue compound', 'SERIAL', t, durS, aircraft, notable, { detections: dets }, 30));
    }

    // Site surveys: two or three a week in daylight.
    if ((dow === 2 || dow === 4 || (dow === 3 && rnd() < 0.5)) && rnd() < 0.85) {
      const t = at(10 + Math.floor(rnd() * 5));
      const double = rnd() < 0.35;
      const durS = double ? between(1500, 1750) : between(780, 900);
      const photos = Math.round(double ? between(600, 680) : between(380, 410));
      const rejected = Math.round(photos * between(0.005, 0.03));
      const aircraft = [craft('MAP-1', durS * 0.93, 10, between(3.4, 3.8), { maxVibrationG: between(0.52, 0.8) })];
      const notable: NotableEvent[] = [];
      if (rnd() < 0.6) notable.push(warn(t + 200_000, `Gust to ${Math.floor(between(11, 14))} m/s — photos on this stretch may blur`, undefined, 'SURVEY'));
      if (double) notable.push(warn(t + durS * 700, 'Battery 27% — returning to swap, will resume from this point', undefined, 'SURVEY'));
      out.push(session('SURVEY', `Survey · ${['Festival grounds', 'Harbor pavilion', 'Stadium lot B', 'Riverside park'][Math.floor(rnd() * 4)]}`, 'BLUETOOTH', t, durS, aircraft, notable,
        { photos, rejected, coveredPct: between(99.4, 100) }, 20));
    }
  }
  return out.filter(r => r.startedAt <= now);
}

/** Services on record for the sample fleet, staggered so the table shows every state. */
export function sampleService(now: number): ServiceRecord[] {
  const ago = (d: number) => now - d * 86_400_000;
  return [
    { aircraft: 'MAP-1', t: ago(40), note: 'Props, motor bearings, gimbal calibration', sample: true },
    { aircraft: 'T-80M', t: ago(8), note: 'Props, arm bolts, compass calibration', sample: true },
    { aircraft: 'T-70M', t: ago(13), note: 'Motor 3 replaced after link-loss inspection', sample: true },
    { aircraft: 'T-60M', t: ago(26), note: 'Props, firmware update', sample: true },
    ...Array.from({ length: 40 }, (_, k) => ({ aircraft: `DRN-${String(k + 1).padStart(3, '0')}`, t: ago(k < 8 ? 70 : 34), note: 'Pre-season check: props, LEDs, battery balance', sample: true })),
  ];
}
