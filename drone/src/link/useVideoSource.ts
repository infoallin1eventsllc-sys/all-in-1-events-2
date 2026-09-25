import { useCallback, useEffect, useState } from 'react';
import type { Place } from '../dashboards/feed/footage';

/**
 * Real video for the feed panel.
 *
 *   FOOTAGE  recorded drone flights over real cities (default; src/dashboards/feed/footage.ts)
 *   SIM      the synthetic 3D city renderer
 *   CAPTURE  a camera or an HDMI capture stick on this machine, via getUserMedia —
 *            works with any aircraft that has an HDMI/USB video out, DJI included
 *   WEBRTC   the companion computer's aiortc streamer (hardware/companion-pi/video):
 *            POST an SDP offer to <url>/offer, get the answer, receive one video track.
 *            A streamer started with --token takes it in the URL: http://<pi>:8080/?token=…
 */
export type VideoSource =
  | { kind: 'FOOTAGE'; place: Place }
  | { kind: 'SIM'; world?: 'CITY' | 'SF' | 'SF_FLY' | 'LA_FLY' | 'NY_FLY' }
  | { kind: 'CAPTURE'; deviceId?: string }
  | { kind: 'WEBRTC'; url: string };

export type VideoStatus = 'IDLE' | 'CONNECTING' | 'LIVE' | 'ERROR';

const STUN = { urls: 'stun:stun.l.google.com:19302' };
export const TURN_KEY = 'a1-turn';
export interface TurnConfig { url: string; username: string; credential: string }
/**
 * STUN finds a direct path on Wi-Fi. Over LTE both ends usually sit behind carrier
 * NAT, and only a TURN relay gets the video through (coturn, or a hosted service).
 * The same server goes on the aircraft side: stream.py --ice turn:… --turn-user …
 */
function iceServers(): RTCIceServer[] {
  try {
    const t = JSON.parse(localStorage.getItem(TURN_KEY) || 'null') as TurnConfig | null;
    if (t?.url) return [STUN, { urls: t.url, username: t.username, credential: t.credential }];
  } catch { /* none */ }
  return [STUN];
}

export function useVideoSource(source: VideoSource) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<VideoStatus>('IDLE');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    } catch { setDevices([]); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let local: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;  // this run's own; a cancelled run must not close the next run's connection

    const stop = () => {
      local?.getTracks().forEach(t => t.stop());
      pc?.close(); pc = null;
    };

    (async () => {
      setError('');
      if (source.kind === 'SIM' || source.kind === 'FOOTAGE') { setStream(null); setStatus('IDLE'); return; }
      setStatus('CONNECTING');
      try {
        if (source.kind === 'CAPTURE') {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture is not available in this browser.');
          local = await navigator.mediaDevices.getUserMedia({
            video: source.deviceId ? { deviceId: { exact: source.deviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          });
          if (cancelled) { stop(); return; }
          setStream(local); setStatus('LIVE');
          refreshDevices(); // labels become available after permission
        } else {
          const conn = pc = new RTCPeerConnection({ iceServers: iceServers() });
          conn.addTransceiver('video', { direction: 'recvonly' });
          conn.ontrack = e => { if (!cancelled) { setStream(e.streams[0] ?? new MediaStream([e.track])); setStatus('LIVE'); } };
          conn.onconnectionstatechange = () => {
            if (conn.connectionState === 'failed' || conn.connectionState === 'disconnected') { setStatus('ERROR'); setError('Video link dropped'); }
          };
          const offer = await conn.createOffer();
          await conn.setLocalDescription(offer);
          // Wait for ICE gathering (bounded) so the offer carries candidates; aiortc answers once.
          await new Promise<void>(res => {
            if (conn.iceGatheringState === 'complete') return res();
            const t = setTimeout(res, 1500);
            conn.onicegatheringstatechange = () => { if (conn.iceGatheringState === 'complete') { clearTimeout(t); res(); } };
          });
          // ?token=… on the entered URL goes to /offer the same way (stream.py --token).
          const u = new URL(source.url, location.href), token = u.searchParams.get('token');
          const base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
          const r = await fetch(`${base}/offer${token ? `?token=${encodeURIComponent(token)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: conn.localDescription!.sdp, type: conn.localDescription!.type }) });
          if (!r.ok) throw new Error(r.status === 401 ? 'Streamer refused the token (add ?token=… to the URL)' : r.status === 503 ? 'Streamer is at its viewer limit' : `Streamer answered ${r.status}`);
          const answer = await r.json();
          if (cancelled) { stop(); return; }
          await conn.setRemoteDescription(answer);
        }
      } catch (e) {
        if (cancelled) return;
        setStatus('ERROR');
        const msg = e instanceof Error ? e.message : String(e);
        setError(/Failed to fetch/i.test(msg) ? `Could not reach ${source.kind === 'WEBRTC' ? source.url.split('?')[0] : 'camera'} — is the streamer running, and HTTPS if this page is HTTPS?` : msg);
        setStream(null);
      }
    })();

    return () => { cancelled = true; stop(); setStream(null); };
  }, [source, refreshDevices]);

  return { stream, status, error, devices, refreshDevices };
}
