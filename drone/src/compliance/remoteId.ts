import { compliance } from './store';

/**
 * The venue's Remote ID receiver (hardware/companion-pi/remoteid/receiver.py)
 * serves decoded Open Drone ID tracks over a WebSocket. Every Basic ID serial it
 * hears is kept as a sighting, so the Compliance screen can say whether each
 * aircraft's declared serial has actually been heard broadcasting. Advisory
 * only: a receiver out of range proves nothing either way.
 *
 * A page served over https can only reach a wss:// receiver (mixed content).
 */

export type ReceiverState = 'OFF' | 'CONNECTING' | 'ON' | 'ERROR';

let ws: WebSocket | null = null;
let state: ReceiverState = 'OFF';
let error = '';
let heard = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const setState = (s: ReceiverState, e = '') => { state = s; error = e; emit(); };

/** One sighting per serial, refreshed at most once a minute (the receiver repeats every advertisement). */
function sight(serial: string, rssi?: number) {
  const now = Date.now(), d = compliance.get();
  const prev = d.sightings.find(s => !s.sample && s.serial === serial);
  heard++;
  if (prev && now - prev.at < 60_000) return;
  compliance.set({ ...d, sightings: [...d.sightings.filter(s => s !== prev), { serial, at: now, ...(rssi != null ? { rssi } : {}) }].slice(-200) });
}

export const receiver = {
  snapshot: () => ({ state, error, heard }),
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  connect(url: string) {
    receiver.disconnect();
    if (!/^wss?:\/\//.test(url)) { setState('ERROR', 'Use a ws:// or wss:// address'); return; }
    if (location.protocol === 'https:' && url.startsWith('ws://')) { setState('ERROR', 'This page is https: the receiver needs wss://'); return; }
    compliance.set(d => ({ ...d, settings: { ...d.settings, receiverUrl: url } }));
    setState('CONNECTING');
    let sock: WebSocket;
    try { sock = new WebSocket(url); } catch (e) { setState('ERROR', e instanceof Error ? e.message : String(e)); return; }
    ws = sock;
    sock.onopen = () => { if (ws === sock) setState('ON'); };
    sock.onerror = () => { if (ws === sock) setState('ERROR', 'Receiver not reachable'); };
    sock.onclose = () => { if (ws === sock) { ws = null; if (state !== 'ERROR') setState('OFF'); } };
    sock.onmessage = ev => {
      try {
        const m = JSON.parse(String(ev.data)) as { event?: string; track?: { rssi?: number; basic_id?: { uas_id?: string } } };
        const id = m.event === 'track' ? m.track?.basic_id?.uas_id?.trim() : undefined;
        if (id) sight(id, m.track?.rssi);
      } catch { /* not a track */ }
    };
  },
  disconnect() { const s = ws; ws = null; s?.close(); if (state !== 'OFF') setState('OFF'); },
};
