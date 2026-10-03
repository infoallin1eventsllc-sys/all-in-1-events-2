import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { compliance } from './store';
import { receiver } from './remoteId';
import { showGates, surveyChecks, review, needsAttention, todayYmd, type Gate } from './rules';
import { useOperator } from '../operator/operator';

/** The compliance records, live: every screen sees an edit at once. */
export function useComplianceData() {
  return useSyncExternalStore(compliance.subscribe, compliance.get, compliance.get);
}

/** A clock that ticks once a minute: dates roll over and the sun sets while a screen stays open. */
export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

/** The light show's Part 107 gates for a fleet (at the live aircraft's position when there is one). */
export function useShowComplianceGates(fleet: number, at?: { lat: number; lon: number }): Gate[] {
  const d = useComplianceData(), now = useMinute(), op = useOperator();
  const lat = at?.lat, lon = at?.lon;
  return useMemo(() => showGates(d, { fleet, now, operatorName: op.name, at: lat != null && lon != null ? { lat, lon } : undefined }), [d, fleet, now, op.name, lat, lon]);
}

/** Base gates with the compliance gates after them, as one stable list. */
export function useWithShowCompliance<G extends { id: string; label: string; ok: boolean; detail: string }>(base: G[], fleet: number, at?: { lat: number; lon: number }): (G | Gate)[] {
  const faa = useShowComplianceGates(fleet, at);
  return useMemo(() => [...base, ...faa], [base, faa]);
}

/** The survey checklist's paperwork entries (the checklist shows one detail line, so the citation leads it). */
export function useSurveyComplianceChecks(siteName: string, altitudeM: number, sysId?: number): Gate[] {
  const d = useComplianceData(), now = useMinute(), op = useOperator();
  return useMemo(() => surveyChecks(d, { now, siteName, altitudeM, sysId, operatorName: op.name }).map(g => ({ ...g, detail: `${g.cite} · ${g.detail}` })), [d, now, siteName, altitudeM, sysId, op.name]);
}

/** How many records need attention today (the app bar's dot). */
export function useComplianceAttention(): number {
  const d = useComplianceData(), now = useMinute();
  return useMemo(() => needsAttention(review(d, todayYmd(now))).length, [d, now]);
}

export function useReceiver() {
  return useSyncExternalStore(receiver.subscribe, receiverSnap, receiverSnap);
}
let last = receiver.snapshot();
function receiverSnap() { const s = receiver.snapshot(); if (s.state !== last.state || s.error !== last.error) last = s; return last; }
