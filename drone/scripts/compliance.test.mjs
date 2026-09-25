// Compliance: Part 107 date maths, the sunset that decides "night", and the gates that hold a show or a survey.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const R = await loadModule('../src/compliance/rules.ts');
const S = await loadModule('../src/compliance/sun.ts');
const { sampleData } = await loadModule('../src/compliance/sample.ts');

// --- status: good through the expiry day, "expiring" inside 30 days, not yet started before `from` ---------------
{
  const t = '2026-09-25';
  assert.equal(R.statusOf(undefined, t), 'MISSING');
  assert.equal(R.statusOf('', t), 'MISSING');
  assert.equal(R.statusOf('2026-09-24', t), 'EXPIRED', 'the day after expiry');
  assert.equal(R.statusOf('2026-09-25', t), 'EXPIRING', 'the last good day');
  assert.equal(R.statusOf('2026-10-25', t), 'EXPIRING', '30 days out');
  assert.equal(R.statusOf('2026-10-26', t), 'VALID', '31 days out');
  assert.equal(R.statusOf('2027-01-01', t, '2026-10-01'), 'PENDING', 'not started yet');
  assert.equal(R.statusOf('2027-01-01', t, '2026-09-25'), 'VALID', 'starts today');
  assert.equal(R.daysBetween('2026-02-27', '2026-03-01'), 2);
  assert.equal(R.daysBetween('2028-02-27', '2028-03-01'), 3, 'leap year');
}

// --- 107.65: 24 calendar months, through the end of the month ---------------------------------------------------
{
  assert.equal(R.recurrentDue('2025-03-15'), '2027-03-31');
  assert.equal(R.recurrentDue('2025-03-01'), '2027-03-31', 'any day of the month counts the same');
  assert.equal(R.recurrentDue('2024-12-31'), '2026-12-31');
  assert.equal(R.recurrentDue('2024-02-10'), '2026-02-28', 'February, non-leap');
  assert.equal(R.recurrentDue('2026-02-03'), '2028-02-29', 'February, leap');
  assert.equal(R.recurrentDue(undefined), undefined);
  const p = { id: 'p', name: 'A', certNumber: '123', trainedOn: '2024-09-01' };
  assert.equal(R.pilotStatus(p, '2026-09-25'), 'EXPIRING', 'due 30 Sep 2026');
  assert.equal(R.pilotStatus(p, '2026-09-30'), 'EXPIRING', 'still current on the last day');
  assert.equal(R.pilotStatus(p, '2026-10-01'), 'EXPIRED');
  assert.equal(R.pilotStatus({ ...p, certNumber: ' ' }, '2025-01-01'), 'MISSING', 'no certificate');
  assert.equal(R.pilotStatus({ ...p, trainedOn: undefined }, '2025-01-01'), 'MISSING', 'no training date');
}

// --- Part 48: three years from registration; the printed date wins ----------------------------------------------
{
  assert.equal(R.registrationExpiry({ regIssued: '2024-05-10' }), '2027-05-10');
  assert.equal(R.registrationExpiry({ regIssued: '2024-02-29' }), '2027-02-28', '29 Feb falls back');
  assert.equal(R.registrationExpiry({ regIssued: '2024-05-10', regExpires: '2027-05-09' }), '2027-05-09');
  assert.equal(R.registrationExpiry({}), undefined);
  const a = { id: 'a', name: 'X', model: '', serial: '', regNumber: 'FA12345678', regIssued: '2024-05-10', ridMethod: 'STANDARD', ridSerial: '1234A0123456789', use: 'ANY' };
  assert.equal(R.aircraftStatus(a, '2026-01-01'), 'VALID');
  assert.equal(R.aircraftStatus(a, '2027-05-11'), 'EXPIRED');
  assert.equal(R.aircraftStatus({ ...a, ridMethod: undefined }, '2026-01-01'), 'MISSING', 'Remote ID not declared');
  assert.equal(R.aircraftStatus({ ...a, ridSerial: '' }, '2026-01-01'), 'MISSING', 'standard Remote ID needs its serial');
  assert.equal(R.aircraftStatus({ ...a, ridMethod: 'FRIA', ridSerial: '' }, '2026-01-01'), 'VALID', 'FRIA broadcasts nothing');
  assert.equal(R.aircraftStatus({ ...a, regNumber: '' }, '2026-01-01'), 'MISSING');
}

// --- 107.35 waiver: the section, the count and the date all have to cover the show ------------------------------
{
  const w = { id: 'w', section: '107.35', number: 'W', maxAircraft: 100, validFrom: '2026-01-01', validTo: '2027-12-31' };
  assert.ok(R.waiverCovers(w, 100, '2026-09-25'));
  assert.ok(!R.waiverCovers(w, 101, '2026-09-25'), 'one aircraft too many');
  assert.ok(!R.waiverCovers(w, 50, '2025-12-31'), 'before it starts');
  assert.ok(R.waiverCovers(w, 50, '2027-12-31'), 'on its last day');
  assert.ok(!R.waiverCovers(w, 50, '2028-01-01'), 'after it ends');
  assert.ok(!R.waiverCovers({ ...w, section: '107.29' }, 50, '2026-09-25'), 'a night waiver is not a multiple-aircraft waiver');
  assert.ok(!R.waiverCovers({ ...w, maxAircraft: undefined }, 2, '2026-09-25'), 'no count, no cover');
}

// --- sunrise / sunset against reference ephemeris (astral), within 5 minutes ------------------------------------
{
  const near = (got, iso, what) => assert.ok(Math.abs(got - Date.parse(iso)) <= 5 * 60_000, `${what}: ${new Date(got).toISOString()} vs ${iso}`);
  const cases = [
    ['Long Beach, 4 Jul', '2026-07-04', 33.7701, -118.1937, '2026-07-04T12:47:29Z', '2026-07-05T03:06:55Z'],
    ['Long Beach, 21 Dec', '2026-12-21', 33.7701, -118.1937, '2026-12-21T14:54:00Z', '2026-12-22T00:48:01Z'],
    ['London, equinox', '2026-03-20', 51.5074, -0.1278, '2026-03-20T06:03:39Z', '2026-03-20T18:13:14Z'],
    ['Sydney, 15 Jan', '2026-01-15', -33.8688, 151.2093, '2026-01-14T18:59:44Z', '2026-01-15T09:08:46Z'],
    ['New York, 25 Sep', '2026-09-25', 40.7128, -74.006, '2026-09-25T10:46:50Z', '2026-09-25T22:47:47Z'],
  ];
  for (const [what, d, lat, lon, rise, set] of cases) {
    const t = S.sunTimes(d, lat, lon);
    near(t.sunrise, rise, `${what} sunrise`); near(t.sunset, set, `${what} sunset`);
  }
  assert.equal(S.sunTimes('2026-06-21', 69.65, 18.96).polar, 'DAY', 'Tromsø midsummer: no sunset');
  assert.equal(S.sunTimes('2026-12-21', 69.65, 18.96).polar, 'NIGHT', 'Tromsø midwinter: no sunrise');
  // Dark: after sunset or before sunrise, on the local day.
  assert.equal(S.isDark(Date.parse('2026-07-04T19:00:00Z'), 33.7701, -118.1937).dark, false, 'noon in Long Beach');
  assert.equal(S.isDark(Date.parse('2026-07-05T03:00:00Z'), 33.7701, -118.1937).dark, false, '8:00 pm, sunset 8:07');
  assert.equal(S.isDark(Date.parse('2026-07-05T03:15:00Z'), 33.7701, -118.1937).dark, true, '8:15 pm');
  assert.equal(S.isDark(Date.parse('2026-07-05T12:30:00Z'), 33.7701, -118.1937).dark, true, '5:30 am, before sunrise');
  assert.equal(S.isDark(Date.parse('2026-07-05T13:00:00Z'), 33.7701, -118.1937).dark, false, '6:00 am');
  assert.equal(S.isDark(Date.parse('2026-01-15T10:00:00Z'), -33.8688, 151.2093).dark, true, '9 pm in Sydney');
}

// --- the light show's gates ------------------------------------------------------------------------------------
const noon = Date.parse('2026-07-04T19:00:00Z'), night = Date.parse('2026-07-05T05:00:00Z');
const at = { lat: 33.7701, lon: -118.1937 };
const byId = gs => Object.fromEntries(gs.map(g => [g.id, g]));
{
  const d = sampleData(noon);
  let g = R.showGates(d, { fleet: 100, now: noon, operatorName: 'Demo pilot', at });
  assert.deepEqual(g.map(x => x.id), ['faa-waiver', 'faa-night', 'faa-insurance', 'faa-pilot']);
  assert.ok(g.every(x => x.ok), `the demo's sample data passes: ${g.filter(x => !x.ok).map(x => x.detail)}`);
  assert.ok(g.every(x => x.cite), 'every gate cites its rule');

  g = byId(R.showGates(d, { fleet: 250, now: noon, at }));
  assert.ok(!g['faa-waiver'].ok, '250 aircraft on a 100-aircraft waiver');
  assert.match(g['faa-waiver'].detail, /covers 100; show has 250/);
  assert.ok(!('faa-waiver' in byId(R.showGates(d, { fleet: 1, now: noon, at }))), 'one aircraft needs no 107.35 waiver');

  // Night: lighting confirmed passes; unconfirmed holds the show.
  g = byId(R.showGates(d, { fleet: 100, now: night, at }));
  assert.ok(g['faa-night'].ok && /After sunset/.test(g['faa-night'].detail));
  g = byId(R.showGates({ ...d, settings: { ...d.settings, showLighting: false } }, { fleet: 100, now: night, at }));
  assert.ok(!g['faa-night'].ok, 'dark and no lighting confirmation');
  g = byId(R.showGates({ ...d, settings: { ...d.settings, showLighting: false } }, { fleet: 100, now: noon, at }));
  assert.ok(g['faa-night'].ok, 'daylight needs no confirmation');
  // Without a live position the show site on file is used.
  assert.ok(byId(R.showGates(d, { fleet: 100, now: night }))['faa-night'].detail.startsWith('After sunset'));
  assert.ok(!byId(R.showGates({ ...d, sites: [] }, { fleet: 100, now: night }))['faa-night'].ok, 'no site, no sunset time');

  g = byId(R.showGates({ ...d, insurance: [] }, { fleet: 100, now: noon, at }));
  assert.ok(!g['faa-insurance'].ok && /No policy/.test(g['faa-insurance'].detail));
  g = byId(R.showGates({ ...d, insurance: d.insurance.map(i => ({ ...i, expires: '2026-07-03' })) }, { fleet: 100, now: noon, at }));
  assert.ok(!g['faa-insurance'].ok, 'lapsed yesterday');
  g = byId(R.showGates({ ...d, pilots: d.pilots.map(p => ({ ...p, trainedOn: '2024-06-30' })) }, { fleet: 100, now: noon, at }));
  assert.ok(!g['faa-pilot'].ok && /lapsed/.test(g['faa-pilot'].detail), 'recurrent training ran out 30 Jun 2026');
  // The operator's own record wins over the default pilot in command.
  const two = { ...d, pilots: [...d.pilots, { id: 'p2', name: 'Sam Lee', certNumber: '999', trainedOn: '2020-01-01' }] };
  assert.ok(!byId(R.showGates(two, { fleet: 100, now: noon, operatorName: 'sam lee', at }))['faa-pilot'].ok);
  assert.ok(byId(R.showGates(two, { fleet: 100, now: noon, operatorName: 'Someone else', at }))['faa-pilot'].ok);
}

// --- the survey's checks ---------------------------------------------------------------------------------------
{
  const d = sampleData(noon);
  let c = byId(R.surveyChecks(d, { now: noon, siteName: 'Festival grounds', altitudeM: 60 }));
  assert.ok(Object.values(c).every(x => x.ok), 'sample: pilot, MAP-1 registered, Remote ID, LAANC to 200 ft');
  assert.match(c['faa-reg'].detail, /FADEMO0102/, 'the survey aircraft is MAP-1');
  c = byId(R.surveyChecks(d, { now: noon, siteName: 'Festival grounds', altitudeM: 70 }));
  assert.ok(!c['faa-airspace'].ok && /allows 200 ft; plan is 230/.test(c['faa-airspace'].detail), '70 m is above the 200 ft authorization');
  c = byId(R.surveyChecks(d, { now: noon, siteName: 'Riverside park', altitudeM: 60 }));
  assert.ok(!c['faa-airspace'].ok && c['faa-airspace'].advisory, 'an unknown site is the crew’s check, not a hold');
  c = byId(R.surveyChecks({ ...d, sites: d.sites.map(s => ({ ...s, controlledAirspace: false })) }, { now: noon, siteName: 'festival grounds', altitudeM: 110 }));
  assert.ok(c['faa-airspace'].ok, 'uncontrolled: no authorization needed');
  c = byId(R.surveyChecks(d, { now: noon, siteName: 'Festival grounds', altitudeM: 60, sysId: 7 }));
  assert.match(c['faa-reg'].detail, /FADEMO0102/, 'no aircraft with system ID 7: falls back to the survey aircraft');
  const linked = { ...d, aircraft: d.aircraft.map(a => (a.name === 'T-80M' ? { ...a, mavSysId: 7 } : a)) };
  c = byId(R.surveyChecks(linked, { now: noon, siteName: 'Festival grounds', altitudeM: 60, sysId: 7 }));
  assert.match(c['faa-reg'].detail, /FADEMO0103/, 'the connected autopilot picks its own record');
  c = byId(R.surveyChecks({ ...d, aircraft: d.aircraft.map(a => ({ ...a, ridMethod: undefined })) }, { now: noon, siteName: 'Festival grounds', altitudeM: 60 }));
  assert.ok(!c['faa-rid'].ok);
  c = byId(R.surveyChecks({ ...d, aircraft: [] }, { now: noon, siteName: 'Festival grounds', altitudeM: 60 }));
  assert.ok(!c['faa-reg'].ok && !c['faa-rid'].ok);
}

// --- the headline, Remote ID, snapshot and import --------------------------------------------------------------
{
  const d = sampleData(noon), today = R.todayYmd(noon);
  const items = R.review(d, today);
  assert.equal(R.needsAttention(items).length, 0, 'sample: ready to fly');
  assert.deepEqual(R.renewalsDue(items).map(i => i.label), ['T-80M'], 'one renewal coming due (the LAANC window just ends)');
  const empty = R.emptyData();
  assert.deepEqual(R.needsAttention(R.review(empty, today)).map(i => i.kind), ['pilot', 'aircraft', 'insurance']);
  // A LAANC window that closed is history, not a problem; a lapsed registration is.
  const old = { ...d, authorizations: d.authorizations.map(a => ({ ...a, validTo: '2020-01-01', validFrom: '2020-01-01' })) };
  assert.equal(R.needsAttention(R.review(old, today)).length, 0);
  assert.equal(R.needsAttention(R.review(old, R.addDays(today, 20))).length, 1, 'T-80M registration lapsed');

  const [ls, map, patrol] = d.aircraft;
  assert.equal(R.ridBroadcast(ls, d.sightings).state, 'CONFIRMED');
  assert.equal(R.ridBroadcast({ ...ls, ridSerial: ls.ridSerial.toLowerCase() + ' ' }, d.sightings).state, 'CONFIRMED', 'serials compare case- and space-blind');
  assert.equal(R.ridBroadcast(patrol, d.sightings).state, 'NOT_SEEN');
  assert.equal(R.ridBroadcast({ ...map, ridMethod: 'FRIA' }, d.sightings).state, 'NOT_APPLICABLE');

  const snap = R.snapshotFor(d, 'LIGHT_SHOW', noon);
  assert.equal(snap.pilotCert, 'DEMO-4417023');
  assert.deepEqual(snap.aircraft, [{ name: 'LS-001', reg: 'FADEMO0101' }]);
  assert.match(snap.waiver, /107W-DEMO-0042/);
  assert.match(R.snapshotFor(d, 'SURVEY', noon).authorization, /DEMO-7Q2K/);
  assert.equal(R.snapshotFor(d, 'SURVEY', noon).waiver, undefined, 'a survey does not fly on the show waiver');

  const round = R.normalize(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(round, d, 'export → import keeps every record');
  assert.throws(() => R.normalize({ pilots: [] }), /compliance file/);
  assert.throws(() => R.normalize(null));
  const junk = R.normalize({ v: 1, pilots: [{ id: 'x', name: 'A', certNumber: '1' }, { name: 'no id' }, 7], waivers: [{ id: 'w', number: 'W', validFrom: 'soon', validTo: '2027-01-01' }], settings: { showLighting: 'yes' } });
  assert.equal(junk.pilots.length, 1, 'malformed pilots dropped');
  assert.equal(junk.waivers.length, 0, 'a waiver without real dates is dropped');
  assert.equal(junk.settings.showLighting, false, 'only a real true confirms lighting');
  assert.deepEqual(junk.aircraft, []);
}

console.log('compliance: all tests passed');
