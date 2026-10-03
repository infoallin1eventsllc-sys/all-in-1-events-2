/**
 * Compliance records: the paperwork a US Part 107 operation flies on.
 *
 * Dates are calendar dates ('YYYY-MM-DD', the operator's local day), because
 * that is how the FAA and insurers write them: a certificate is good "through"
 * a day, not until a millisecond. Everything carries `sample` when it is demo
 * content, so it can be labelled and removed in one click (like src/demo/seed.ts).
 */

export type Ymd = string;

/** Which work an aircraft flies; a survey links to its SURVEY aircraft (or by MAVLink system ID). */
export type Use = 'ANY' | 'LIGHT_SHOW' | 'SURVEY' | 'SURVEILLANCE';

/** Part 89: how an aircraft meets Remote ID. */
export type RidMethod = 'STANDARD' | 'MODULE' | 'FRIA';

/** Part 107 subpart D category the aircraft is eligible for (record only; not checked). */
export type OverPeople = 'NONE' | '1' | '2' | '3' | '4';

export interface Pilot {
  id: string;
  name: string;
  /** Remote pilot certificate number (107.12). */
  certNumber: string;
  certIssued?: Ymd;
  /** Last initial knowledge test or recurrent training passed (107.65). */
  trainedOn?: Ymd;
  sample?: boolean;
}

export interface Aircraft {
  id: string;
  name: string;
  model: string;
  /** Manufacturer serial of the airframe. */
  serial: string;
  /** FAA registration number, marked on the aircraft (Part 48). */
  regNumber: string;
  regIssued?: Ymd;
  /** As printed on the certificate; if blank, three years from issue. */
  regExpires?: Ymd;
  ridMethod?: RidMethod;
  /** The serial number broadcast (ANSI/CTA-2063-A): the aircraft's for standard Remote ID, the module's for a module. */
  ridSerial?: string;
  use: Use;
  /** Matches a connected autopilot (its MAVLink system ID) to this record. */
  mavSysId?: number;
  overPeople?: OverPeople;
  notes?: string;
  sample?: boolean;
}

/** Waivable sections a show or survey crew commonly holds (107.205 lists them). */
export type WaiverSection = '107.35' | '107.31' | '107.29' | '107.39' | '107.51' | 'OTHER';

export interface Waiver {
  id: string;
  section: WaiverSection;
  /** Certificate of waiver number, as issued. */
  number: string;
  /** 107.35: the most aircraft one remote pilot may operate under it. */
  maxAircraft?: number;
  validFrom: Ymd;
  validTo: Ymd;
  conditions?: string;
  /** The certificate of waiver PDF, kept in IndexedDB (src/compliance/files.ts). */
  fileId?: string;
  fileName?: string;
  sample?: boolean;
}

export interface Authorization {
  id: string;
  /** LAANC (near real time) or FAADroneZone (further coordination). */
  kind: 'LAANC' | 'DRONEZONE';
  reference: string;
  location: string;
  ceilingFt: number;
  validFrom: Ymd;
  validTo: Ymd;
  sample?: boolean;
}

export interface Insurance {
  id: string;
  carrier: string;
  policy: string;
  liabilityUsd: number;
  expires: Ymd;
  sample?: boolean;
}

export interface Permit {
  id: string;
  venue: string;
  issuer: string;
  reference: string;
  validFrom?: Ymd;
  expires: Ymd;
  sample?: boolean;
}

/** A place flown: where a light show's sunset is computed and a survey's airspace flag lives. */
export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Class B, C, D or surface E: needs a 107.41 authorization. The crew sets it from B4UFLY or a sectional. */
  controlledAirspace: boolean;
  sample?: boolean;
}

/** A Remote ID broadcast heard by the venue receiver (hardware/companion-pi/remoteid). */
export interface Sighting { serial: string; at: number; rssi?: number; sample?: boolean }

export interface Settings {
  /** Pilot in command when the operator's name matches no pilot record. */
  picId?: string;
  /** Site the light show flies from. */
  showSiteId?: string;
  /** Crew confirmation: every show aircraft carries anti-collision lighting visible for 3 statute miles (107.29). */
  showLighting: boolean;
  /** Remote ID receiver WebSocket, e.g. ws://venue-pi.local:8765. */
  receiverUrl?: string;
}

export interface ComplianceData {
  v: 1;
  pilots: Pilot[];
  aircraft: Aircraft[];
  waivers: Waiver[];
  authorizations: Authorization[];
  insurance: Insurance[];
  permits: Permit[];
  sites: Site[];
  sightings: Sighting[];
  settings: Settings;
}

/** What a flight record keeps of the paperwork it flew under. */
export interface ComplianceSnapshot {
  pilot?: string;
  pilotCert?: string;
  aircraft: { name: string; reg: string }[];
  waiver?: string;
  authorization?: string;
  insurance?: string;
}
