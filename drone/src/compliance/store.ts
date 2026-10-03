import type { ComplianceData, ComplianceSnapshot } from './types';
import { emptyData, normalize, snapshotFor } from './rules';
import { sampleData } from './sample';

/**
 * Where the compliance records live: one small JSON document in localStorage
 * (a few kilobytes, read synchronously by the pre-flight gates), with waiver PDFs
 * beside it in IndexedDB (files.ts). No React here, so the recorder can snapshot
 * it; views use useCompliance.ts.
 *
 * A first-time visitor to the demo gets the sample records once, like the sample
 * flights; an operator install (VITE_DEMO=off) starts empty.
 */

const KEY = 'a1-compliance-v1';
const DEMO_KEY = 'a1-compliance-demo';
const demoEnabled = () => (import.meta.env?.VITE_DEMO ?? 'on') !== 'off';

function load(): ComplianceData {
  if (typeof localStorage === 'undefined') return emptyData();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* corrupt or blocked: start clean rather than break the gates */ }
  try {
    if (demoEnabled() && !localStorage.getItem(DEMO_KEY)) { localStorage.setItem(DEMO_KEY, String(Date.now())); const d = sampleData(); persist(d); return d; }
  } catch { /* private mode */ }
  return emptyData();
}
function persist(d: ComplianceData) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: kept for this visit */ } }

let data: ComplianceData | null = null;
const listeners = new Set<() => void>();
const get = () => (data ??= load());

export const compliance = {
  get,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  /** Replace the document (always a new object, so React sees the change). */
  set(next: ComplianceData | ((d: ComplianceData) => ComplianceData)) {
    data = typeof next === 'function' ? next(get()) : next;
    persist(data);
    listeners.forEach(l => l());
  },
  hasSample: () => { const d = get(); return [d.pilots, d.aircraft, d.waivers, d.authorizations, d.insurance, d.permits, d.sites, d.sightings].some(l => (l as { sample?: boolean }[]).some(x => x.sample)); },
  /** Remove the demo's records, leaving the operator's own. */
  clearSample() {
    compliance.set(d => {
      const keep = <T extends { sample?: boolean }>(l: T[]) => l.filter(x => !x.sample);
      const s = { ...d.settings };
      if (s.picId?.startsWith('sample-')) delete s.picId;
      if (s.showSiteId?.startsWith('sample-')) delete s.showSiteId;
      return { ...d, pilots: keep(d.pilots), aircraft: keep(d.aircraft), waivers: keep(d.waivers), authorizations: keep(d.authorizations), insurance: keep(d.insurance), permits: keep(d.permits), sites: keep(d.sites), sightings: keep(d.sightings), settings: { ...s, showLighting: false } };   // the demo's lighting confirmation is not the crew's
    });
  },
  loadSample() {
    const s = sampleData();
    compliance.set(d => ({
      ...d,
      pilots: [...d.pilots.filter(x => !x.sample), ...s.pilots], aircraft: [...d.aircraft.filter(x => !x.sample), ...s.aircraft],
      waivers: [...d.waivers.filter(x => !x.sample), ...s.waivers], authorizations: [...d.authorizations.filter(x => !x.sample), ...s.authorizations],
      insurance: [...d.insurance.filter(x => !x.sample), ...s.insurance], permits: [...d.permits.filter(x => !x.sample), ...s.permits],
      sites: [...d.sites.filter(x => !x.sample), ...s.sites], sightings: [...d.sightings.filter(x => !x.sample), ...s.sightings],
      settings: { ...s.settings, ...d.settings, showLighting: true, picId: d.settings.picId ?? s.settings.picId, showSiteId: d.settings.showSiteId ?? s.settings.showSiteId },
    }));
  },
  exportJson: () => JSON.stringify({ ...get(), exportedAt: new Date().toISOString() }, null, 2),
  /** Replaces everything with the file's records; throws with a readable reason if it isn't one. */
  importJson(text: string) { compliance.set(normalize(JSON.parse(text))); },
};

/** What a new flight record keeps (src/record/recorder.ts). Never throws: recording must start regardless. */
export function currentSnapshot(vertical: Parameters<typeof snapshotFor>[1], operatorName?: string): ComplianceSnapshot | undefined {
  try { const s = snapshotFor(get(), vertical, Date.now(), operatorName); return s.pilot || s.aircraft.length ? s : undefined; } catch { return undefined; }
}
