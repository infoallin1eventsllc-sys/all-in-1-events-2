import { recordDb, type FlightEvent, type FlightSample, type FlightSession } from '../record/db';
import { sampleHistory, sampleService } from '../analytics/sample';
import { frameOf, type FlightHealth, type Finding } from '../diagnostics/health';
import type { ServiceRecord } from '../analytics/aggregate';
import { stamp } from '../record/chain';
import { sampleSnapshot } from '../compliance/sample';

/**
 * Demo content, so every page has something worth looking at the first time a
 * visitor opens the portfolio demo: three recorded flights with real paths,
 * three months of fleet history, and eight health reports that tell a story
 * (motor 3 on SIM-1 is working a little harder every flight).
 *
 * Everything is marked `sample: true`, labelled as sample data on screen, and
 * removed with one click. Real records are never touched. Deterministic, so
 * every visitor sees the same demo.
 */

export const DEMO_KEY = 'drone-command-demo-v1';
const HOME = { lat: 33.7701, lon: -118.1937 };
const M_LAT = 111_320, M_LON = 111_320 * Math.cos((HOME.lat * Math.PI) / 180);
const ll = (x: number, y: number) => ({ lat: HOME.lat - y / M_LAT, lon: HOME.lon + x / M_LON }); // x east, y south (screen)

function rng(seed: number) { let s = seed; return () => ((s = (s * 48271) % 2147483647) / 2147483647); }

/** Is demo seeding on for this build? Off for an operator install (VITE_DEMO=off). */
export const demoEnabled = () => (import.meta.env?.VITE_DEMO ?? 'on') !== 'off';

type Rec = { session: FlightSession; samples: Omit<FlightSample, 'sessionId'>[]; events: Omit<FlightEvent, 'sessionId'>[] };

function surveyFlight(t0: number): Rec {
  const r = rng(11);
  const samples: Rec['samples'] = [], events: Rec['events'] = [];
  const lines = 13, spacing = 25.3, x0 = -150, x1 = 150, y0 = -140, alt = 60, v = 10;
  let t = t0, batt = 98, x = 0, y = 0;
  const ev = (dt: number, severity: FlightEvent['severity'], kind: string, text: string) => events.push({ t: t0 + dt * 1000, severity, kind, text, aircraft: 'MAP-1' });
  ev(0, 'INFO', 'SYSTEM', 'Recording started · Survey · Festival grounds · simulation link');
  ev(4, 'SUCCESS', 'PREFLIGHT', 'Pre-flight gates all pass');
  ev(8, 'INFO', 'COMMAND', 'Survey uploaded: 13 lines, 395 photos planned, 60 m, 1.6 cm/px');
  const push = (alt2: number, spd: number) => { const p = ll(x, y); samples.push({ t, aircraft: 'MAP-1', lat: p.lat, lon: p.lon, altM: alt2, speedMps: spd, headingDeg: 90, batteryPct: Math.round(batt), extra: { phase: 'CAPTURING' } }); };
  // takeoff
  for (let s = 0; s < 20; s++) { t += 1000; push(Math.min(alt, s * 3.2), 0.5); }
  const leg = (tx: number, ty: number, speed: number, capture: boolean) => {
    const d = Math.hypot(tx - x, ty - y), n = Math.max(1, Math.round(d / speed));
    for (let i = 1; i <= n; i++) { x += (tx - x) / (n - i + 1); y += (ty - y) / (n - i + 1); t += 1000; batt -= 0.045 + r() * 0.01; push(alt + (r() - 0.5) * 0.6, capture ? speed : speed * 1.3); }
  };
  leg(x0, y0, v * 1.3, false);
  for (let i = 0; i < lines; i++) {
    const yy = y0 + i * spacing;
    leg(i % 2 ? x0 : x1, yy, v, true);
    ev((t - t0) / 1000, 'INFO', 'SURVEY', `Line ${i + 1} of ${lines} captured`);
    if (i === 6) ev((t - t0) / 1000, 'WARNING', 'ALERT', 'Gust to 9 m/s: 3 photos blurred on line 7, queued for re-fly');
    if (i < lines - 1) leg(i % 2 ? x0 : x1, yy + spacing, v, false);
  }
  leg(0, 0, v * 1.3, false);
  for (let s = 0; s < 22; s++) { t += 1000; push(Math.max(0, alt - s * 2.8), 0.4); }
  ev((t - t0) / 1000, 'SUCCESS', 'SURVEY', 'Capture complete: 392 photos accepted, 100% photographed, 0 weak patches');
  ev((t - t0) / 1000 + 2, 'INFO', 'SYSTEM', 'Recording stopped');
  return { session: { id: `sample-survey-${t0.toString(36)}`, vertical: 'SURVEY', title: 'Survey · Festival grounds', source: 'SIMULATION', startedAt: t0, endedAt: t + 2000, aircraft: ['MAP-1'], sampleCount: samples.length, eventCount: events.length, note: 'Harbour Lights Festival, pre-build map', sample: true, compliance: sampleSnapshot('SURVEY', t0) }, samples, events };
}

function patrolFlight(t0: number): Rec {
  const r = rng(23);
  const samples: Rec['samples'] = [], events: Rec['events'] = [];
  const loop = [[0, 0], [260, -120], [420, 40], [300, 260], [60, 220]];
  const craft = [{ id: 'T-80M', off: 0 }, { id: 'T-70M', off: 2.5 }];
  const ev = (dt: number, severity: FlightEvent['severity'], kind: string, text: string, aircraft?: string) => events.push({ t: t0 + dt * 1000, severity, kind, text, aircraft });
  ev(0, 'INFO', 'SYSTEM', 'Recording started · Patrol · Venue compound · simulation link');
  ev(6, 'INFO', 'COMMAND', 'Patrol uploaded: 5-point loop, 64 m, night protocol on');
  ev(9, 'INFO', 'PAYLOAD', 'Camera to thermal (white hot) for night protocol', 'T-80M');
  const dur = 25 * 60;
  let perim = 0; for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; perim += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  for (const c of craft) {
    let batt = 99;
    for (let s = 0; s < dur; s += 2) {
      const t = t0 + s * 1000;
      const alt = s < 20 ? s * 3.2 : s > dur - 25 ? Math.max(0, (dur - s) * 2.6) : 64 + Math.sin(s / 40) * 1.5;
      let dist = ((s * 12.8) / perim + c.off / loop.length) % 1 * perim, x = 0, y = 0, hdg = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (dist <= d) { x = a[0] + ((b[0] - a[0]) * dist) / d; y = a[1] + ((b[1] - a[1]) * dist) / d; hdg = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI; break; }
        dist -= d;
      }
      const f = Math.min(1, s / 20) * Math.min(1, (dur - s) / 25);
      const p = ll(x * f, y * f);
      batt -= 0.052 + r() * 0.01;
      samples.push({ t, aircraft: c.id, lat: p.lat, lon: p.lon, altM: alt, speedMps: s < 20 || s > dur - 25 ? 0.5 : 12.8, headingDeg: (hdg + 360) % 360, batteryPct: Math.round(batt), extra: { sensor: 'IR' } });
    }
  }
  ev(412, 'WARNING', 'DETECTION', 'Person at the east fence line, 36.1 °C, moving: tracked', 'T-80M');
  ev(420, 'INFO', 'COMMAND', 'Security team 2 dispatched to the east fence', 'T-80M');
  ev(611, 'SUCCESS', 'DETECTION', 'Contact resolved: staff member on break, cleared by security', 'T-80M');
  ev(903, 'WARNING', 'DETECTION', 'Vehicle stopped in the service lane, engine warm', 'T-70M');
  ev(960, 'SUCCESS', 'DETECTION', 'Vehicle identified as a caterer delivery, cleared', 'T-70M');
  ev(1210, 'WARNING', 'HEALTH', 'Motor 3 working 9% harder than average: inspect after landing', 'T-70M');
  ev(dur, 'INFO', 'SYSTEM', 'Recording stopped');
  return { session: { id: `sample-patrol-${t0.toString(36)}`, vertical: 'SURVEILLANCE', title: 'Patrol · Venue compound', source: 'SIMULATION', startedAt: t0, endedAt: t0 + dur * 1000, aircraft: craft.map(c => c.id), sampleCount: samples.length, eventCount: events.length, note: 'Overnight security, Harbour Lights Festival', sample: true, compliance: sampleSnapshot('SURVEILLANCE', t0) }, samples, events };
}

function showFlight(t0: number): Rec {
  const samples: Rec['samples'] = [], events: Rec['events'] = [];
  const ids = ['LS-001', 'LS-025', 'LS-050', 'LS-075', 'LS-100'];
  const dur = 14 * 60;
  const ev = (dt: number, severity: FlightEvent['severity'], kind: string, text: string) => events.push({ t: t0 + dt * 1000, severity, kind, text });
  ev(0, 'INFO', 'SYSTEM', 'Recording started · Show · 100 aircraft · simulation link');
  ev(30, 'SUCCESS', 'PREFLIGHT', 'Pre-flight gates all pass: 100/100 synchronised, wind 3.4 m/s, clock jitter 0.68 ms');
  ev(60, 'INFO', 'SHOW', 'Show armed → launching at T+0.0s');
  const cues = ['Celestial Orb', 'Ringed Planet Saturn', 'Spiral Galaxy', 'Avian Wing Sweep', 'Double Helix DNA', 'Meridian Star & Typography'];
  cues.forEach((c, i) => ev(120 + i * 105, 'INFO', 'SHOW', `Cue ${i + 1}: ${c}`));
  ev(420, 'WARNING', 'ALERT', 'LS-064 drifted 0.9 m from its slot, recovered in 2.1 s');
  ev(760, 'SUCCESS', 'SHOW', 'Show complete: 100 of 100 aircraft landed on their pads');
  ev(dur, 'INFO', 'SYSTEM', 'Recording stopped');
  ids.forEach((id, k) => {
    let batt = 100;
    const pad = { x: (k - 2) * 12, y: 30 };
    for (let s = 0; s < dur; s += 2) {
      const on = s >= 90 && s <= 760;
      const ph = (s - 90) / 105;
      const alt = !on ? 0 : s < 110 ? (s - 90) * 4 : s > 740 ? Math.max(0, (760 - s) * 4) : 80 + Math.sin(ph * Math.PI + k) * 18;
      const ang = ph * 1.4 + (k * Math.PI * 2) / ids.length;
      const rad = on ? 40 + 15 * Math.sin(ph * 2) : 0;
      // From the pad up to the formation over the show box (60 m north), then around it.
      const f = Math.min(1, alt / 60);
      const p = ll(pad.x * (1 - f) + Math.cos(ang) * rad * f, pad.y * (1 - f) + (-60 + Math.sin(ang) * rad * 0.6) * f);
      if (on) batt -= 0.11;
      samples.push({ t: t0 + s * 1000, aircraft: id, lat: p.lat, lon: p.lon, altM: alt, speedMps: on ? 3.5 : 0, headingDeg: (ang * 180) / Math.PI % 360, batteryPct: Math.round(batt), extra: { formation: cues[Math.max(0, Math.min(5, Math.floor(ph)))] } });
    }
  });
  return { session: { id: `sample-show-${t0.toString(36)}`, vertical: 'LIGHT_SHOW', title: 'Show · Harbour Lights finale', source: 'SIMULATION', startedAt: t0, endedAt: t0 + dur * 1000, aircraft: ids, sampleCount: samples.length, eventCount: events.length, note: '100 aircraft, 11 formations', sample: true, compliance: sampleSnapshot('LIGHT_SHOW', t0) }, samples, events };
}

/** Eight flights on SIM-1 where motor 3 works a little harder each time, and a parts log. */
function healthHistory(now: number): { reports: FlightHealth[]; parts: ServiceRecord[] } {
  const r = rng(5);
  const frame = frameOf(2);
  const reports: FlightHealth[] = [];
  const devs = [0.8, 1.6, 2.9, 3.8, 5.1, 6.4, 7.6, 9.2];
  devs.forEach((d3, i) => {
    const start = now - (devs.length - i) * 3.2 * 86_400_000 - 5 * 3_600_000;
    const air = Math.round(1200 + r() * 900);
    const others = [-(d3 / 3) + (r() - 0.5), -(d3 / 3) + (r() - 0.5)];
    const dev = [others[0], others[1], d3, -(d3 / 3) + (r() - 0.5)];
    const findings: Finding[] = d3 >= 8 ? [{
      id: 'motor-3', level: 'WATCH', system: 'PROPULSION', part: 'prop-3', motor: 3, title: 'Motor 3 or its propeller',
      detail: `Motor 3 works ${d3.toFixed(1)}% harder than the others to hold the aircraft level. Spin it by hand: roughness or grinding means the motor; a chip, crack or bend means the propeller.`,
      action: 'INSPECT', actionText: 'Inspect prop and motor 3',
    }] : [];
    if (i === 3) findings.push({ id: 'cell-spread', level: 'WATCH', system: 'BATTERY', part: 'battery', title: 'Battery cells are out of balance', detail: '112 mV between the highest and lowest cell (keep under 100). Balance-charge it; if the gap comes back, retire the pack.', action: 'INSPECT', actionText: 'Balance-charge' });
    const overall = findings.length ? 'WATCH' : 'OK';
    reports.push({
      aircraft: 'SIM-1', source: 'SIMULATION', startedAt: start, endedAt: start + air * 1000 + 60_000, airborneS: air, overall,
      verdict: overall === 'OK' ? 'Fit to fly' : findings.length === 1 ? `Fly with care: ${findings[0].title.charAt(0).toLowerCase()}${findings[0].title.slice(1)}` : `Fly with care: ${findings.length} things to watch`,
      frame, findings,
      motors: dev.map((d, k) => ({ n: k + 1, meanOutputPct: Math.round((48 * (1 + d / 100)) * 10) / 10, deviationPct: Math.round(d * 10) / 10, maxTempC: Math.round(44 + r() * 3 + (k === 2 ? d3 * 0.4 : 0)), rpmRatio: Math.round((1 + (k === 2 ? d3 / 250 : -0.004)) * 1000) / 1000, currentRatio: Math.round((1 + (k === 2 ? d3 / 90 : -0.01)) * 1000) / 1000 })),
      vibeMax: { x: 13 + r() * 3, y: 12 + r() * 3, z: 17 + r() * 4 + d3 * 0.6 }, clipDelta: 0,
      minCellV: 3.62 - i * 0.004, maxCellSpreadV: i === 3 ? 0.112 : 0.012 + r() * 0.01, maxBatteryTempC: 36 + r() * 5,
      events: [], sample: true,
    });
  });
  const parts: ServiceRecord[] = [
    { aircraft: 'SIM-1', t: now - 40 * 86_400_000, note: 'Full set of propellers replaced (new season)', part: 'props', sample: true },
    { aircraft: 'SIM-1', t: now - 33 * 86_400_000, note: 'Arms and frame checked: clamps re-torqued', part: 'frame', sample: true },
    { aircraft: 'SIM-1', t: now - 30 * 86_400_000, note: 'Firmware updated to ArduCopter 4.5.7', part: 'firmware', sample: true },
  ];
  return { reports, parts };
}

/** Seed once per browser, only where nothing real exists yet. Returns true if it seeded. */
export async function seedDemo(force = false): Promise<boolean> {
  if (!recordDb.available() || !demoEnabled()) return false;
  try { if (!force && localStorage.getItem(DEMO_KEY)) return false; } catch { /* private mode: seed anyway */ }
  const now = Date.now();
  try {
    const [rollups, sessions, health] = await Promise.all([recordDb.listRollups(), recordDb.listSessions(), recordDb.listHealth()]);
    const real = rollups.some(x => !x.sample) || sessions.some(s => !s.sample && s.sampleCount > 30) || health.some(h => !h.sample);
    if (real && !force) { try { localStorage.setItem(DEMO_KEY, 'skipped'); } catch { /* ignore */ } return false; }
    if (!rollups.some(x => x.sample)) {
      await recordDb.putRollups(sampleHistory(now));
      for (const s of sampleService(now)) await recordDb.addService(s);
    }
    if (!sessions.some(s => s.sample)) {
      const day = 86_400_000;
      for (const rec of [surveyFlight(now - 1 * day - 3 * 3_600_000), patrolFlight(now - 2 * day - 7 * 3_600_000), showFlight(now - 3 * day - 9 * 3_600_000)]) {
        const events: FlightEvent[] = rec.events.sort((a, b) => a.t - b.t).map(x => ({ ...x, sessionId: rec.session.id, ...(x.kind === 'SYSTEM' ? {} : { operator: 'Demo pilot · pilot in command' }) }));
        rec.session.chainHead = await stamp(events);
        await recordDb.putSession(rec.session);
        await recordDb.addSamples(rec.samples.map(x => ({ ...x, sessionId: rec.session.id })));
        await recordDb.addEvents(events);
      }
    }
    if (!health.some(h => h.sample)) {
      const { reports, parts } = healthHistory(now);
      for (const h of reports) await recordDb.addHealth(h);
      for (const p of parts) await recordDb.addService(p);
    }
    try { localStorage.setItem(DEMO_KEY, String(now)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('demo-seeded'));
    return true;
  } catch { return false; }
}
