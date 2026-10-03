import type { ComplianceData, ComplianceSnapshot } from './types';
import { addDays, addYears, snapshotFor, todayYmd } from './rules';

/**
 * Sample paperwork for the demo, matching its sample flights (src/demo/seed.ts):
 * the Harbour Lights Festival in Long Beach, the show fleet, MAP-1 and T-80M.
 * Every number carries DEMO so it can never be mistaken for, or collide with, a
 * real certificate. Dates are relative to the day it is loaded, so the demo
 * opens "ready to fly" with one renewal coming due.
 */

export function sampleData(now = Date.now()): ComplianceData {
  const t = todayYmd(now);
  const day = 86_400_000;
  return {
    v: 1,
    pilots: [{ id: 'sample-pilot', name: 'Jordan Ellis', certNumber: 'DEMO-4417023', certIssued: addDays(t, -3 * 365), trainedOn: addDays(t, -240), sample: true }],
    aircraft: [
      { id: 'sample-ls', name: 'LS-001', model: 'Show quad, RGBW light head', serial: 'SQ-DEMO-0001', regNumber: 'FADEMO0101', regIssued: addDays(t, -300), ridMethod: 'STANDARD', ridSerial: '9Z9ZADEMO000101', use: 'LIGHT_SHOW', overPeople: 'NONE', notes: 'Lead airframe of the show fleet. A real fleet keeps one record per airframe.', sample: true },
      { id: 'sample-map', name: 'MAP-1', model: 'Mapping quad, 4/3 CMOS camera', serial: 'MQ-DEMO-0042', regNumber: 'FADEMO0102', regIssued: addDays(t, -500), ridMethod: 'STANDARD', ridSerial: '9Z9ZADEMO000102', use: 'SURVEY', mavSysId: 1, overPeople: 'NONE', sample: true },
      { id: 'sample-patrol', name: 'T-80M', model: 'Thermal patrol quad', serial: 'TQ-DEMO-0080', regNumber: 'FADEMO0103', regIssued: addDays(addYears(t, -3), 19), regExpires: addDays(t, 19), ridMethod: 'MODULE', ridSerial: '9Z9Z8DEMO0801', use: 'SURVEILLANCE', overPeople: 'NONE', notes: 'Older airframe: Remote ID through an add-on broadcast module.', sample: true },
    ],
    waivers: [{
      id: 'sample-waiver', section: '107.35', number: '107W-DEMO-0042', maxAircraft: 100, validFrom: addDays(t, -90), validTo: addDays(addYears(t, 2), -90),
      conditions: 'Sample conditions: show area secured and cleared of people; a visual observer at each corner; anti-collision lighting at night; no higher than 400 ft AGL; show plan on file with the FAA before each event.',
      sample: true,
    }],
    authorizations: [{ id: 'sample-auth', kind: 'LAANC', reference: 'DEMO-7Q2K', location: 'Festival grounds, Long Beach (Class D)', ceilingFt: 200, validFrom: addDays(t, -1), validTo: addDays(t, 30), sample: true }],
    insurance: [{ id: 'sample-ins', carrier: 'Sample Aviation Underwriters', policy: 'DEMO-UAV-88120', liabilityUsd: 5_000_000, expires: addDays(t, 150), sample: true }],
    permits: [{ id: 'sample-permit', venue: 'Harbour Lights Festival', issuer: 'City special events office', reference: 'DEMO-SE-2231', validFrom: addDays(t, -14), expires: addDays(t, 45), sample: true }],
    sites: [{ id: 'sample-site', name: 'Festival grounds', lat: 33.7701, lon: -118.1937, controlledAirspace: true, sample: true }],
    sightings: [
      { serial: '9Z9ZADEMO000101', at: now - 1 * day - 2 * 3_600_000, rssi: -71, sample: true },
      { serial: '9Z9ZADEMO000102', at: now - 1 * day - 3 * 3_600_000, rssi: -64, sample: true },
    ],
    settings: { picId: 'sample-pilot', showSiteId: 'sample-site', showLighting: true },
  };
}

/** The snapshot the sample flights carry, so the demo's printed report shows it. */
export const sampleSnapshot = (vertical: 'LIGHT_SHOW' | 'SURVEY' | 'SURVEILLANCE', now = Date.now()): ComplianceSnapshot => snapshotFor(sampleData(now), vertical, now);
