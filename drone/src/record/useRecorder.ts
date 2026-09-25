import { useEffect, useRef, useState } from 'react';
import { recorder } from './recorder';
import type { FlightSession, LinkSource, Vertical } from './db';

/**
 * Runs a recording for as long as a dashboard is mounted.
 *
 * The dashboard supplies a `collect` callback that returns the rows to sample;
 * it is called once a second from a ref, so the caller can close over live state
 * without restarting the session on every render.
 */
export function useRecorder(
  vertical: Vertical,
  title: string,
  source: LinkSource,
  collect: () => Parameters<typeof recorder.sample>[0][],
) {
  const [session, setSession] = useState<FlightSession | null>(null);
  const collectRef = useRef(collect);
  collectRef.current = collect;

  useEffect(() => recorder.subscribe(setSession), []);

  useEffect(() => {
    let stopped = false;
    void recorder.start(vertical, title, source);
    const t = setInterval(() => {
      if (stopped) return;
      try { for (const row of collectRef.current()) recorder.sample(row); } catch { /* never break the dashboard */ }
    }, 1000);
    return () => { stopped = true; clearInterval(t); void recorder.stop(); };
    // Title/source changes are recorded as events, not new sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical]);

  // Follow the link without restarting the recording.
  useEffect(() => { recorder.setSource(source); }, [source]);

  return session;
}

/**
 * Mirror a dashboard's own event list into the flight record.
 * Dashboards already log what matters; this copies each entry once, by id.
 */
export function useRecordedEvents(
  events: { id: string; severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS'; text: string }[],
  kind: string,
  aircraftOf?: (e: { id: string }) => string | undefined,
) {
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    // The lists are newest-first; replay oldest-first so the record reads forwards.
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      recorder.event(kind, e.severity, e.text, aircraftOf?.(e));
    }
    if (seen.current.size > 2000) seen.current = new Set(events.map(e => e.id));
  }, [events, kind, aircraftOf]);
}

/** Log an event, de-duplicated against the last one so a re-render can't spam the log. */
export function useEventRecorder() {
  const last = useRef('');
  return (kind: string, severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS', text: string, aircraft?: string) => {
    const key = `${kind}|${text}|${aircraft ?? ''}`;
    if (key === last.current) return;
    last.current = key;
    recorder.event(kind, severity, text, aircraft);
  };
}
