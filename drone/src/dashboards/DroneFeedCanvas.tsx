import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Maximize2, Crosshair as CrosshairIcon, Thermometer } from 'lucide-react';
import { feedEngine, FEED_W, FEED_H, THUMB_W, THUMB_H, type Lock, type World } from './feed/engine';

/** The rendered worlds: HUD badge, caption and a plain description. */
const WORLD_LABEL: Partial<Record<World, { badge: string; caption: string; title: string }>> = {
  SF: { badge: '3D · SF TOUR', caption: 'San Francisco, California · aerial tour, rendered live', title: 'the rendered San Francisco aerial tour' },
  SF_FLY: { badge: '3D · SF FPV', caption: 'San Francisco, California · FPV fly-through, rendered live', title: 'the rendered San Francisco fly-through' },
  LA_FLY: { badge: '3D · LA FPV', caption: 'Los Angeles, California · FPV fly-through, rendered live', title: 'the rendered Los Angeles fly-through' },
  NY_FLY: { badge: '3D · NYC FPV', caption: 'New York, New York · FPV fly-through, rendered live', title: 'the rendered New York fly-through' },
};
import { playlist, sources, loadGenerated, type Clip, type Place, type Source } from './feed/footage';
import { loadPlates } from './feed/plates';
import type { PatrolDrone, SensorMode } from '../hooks/useSurveillanceSimulation';

/**
 * Gimbal video from a patrol aircraft with the HUD over it. Three pictures can
 * sit under the HUD:
 *   footage      recorded drone flights over real cities and mountains (default)
 *   simulation   a 3D city (buildings, traffic, people) seen from the aircraft's
 *                altitude, heading, gimbal pitch and zoom; also the fallback when
 *                footage can't load
 *   videoStream  a real MediaStream from a capture device or the aircraft's WebRTC
 * Sensor modes change the whole image: EO colour; white-hot and ironbow thermal;
 * green image-intensified night vision. On footage the sensor stage runs in WebGL
 * when the file is served from this site, and as CSS filters when it streams from
 * Pexels (a cross-origin video can't be read by WebGL).
 */

interface Props {
  drone: PatrolDrone;
  isNight: boolean;
  /** Thumbnails skip the HUD and render at lower resolution and rate. */
  compact?: boolean;
  /** Real footage of this place; null or undefined shows the 3D simulation. */
  footage?: Place | null;
  /** Which 3D world when no footage plays: the venue's city, or the San Francisco dusk take (the default for San Francisco footage that can't load). */
  world?: World;
  onSetSensorMode?: (mode: SensorMode) => void;
  onSetZoom?: (zoom: number) => void;
  className?: string;
  /** A real MediaStream (capture device or WebRTC) replaces the synthetic renderer; the HUD stays. */
  videoStream?: MediaStream | null;
  videoLabel?: string;
}

const MODE_LABEL: Record<SensorMode, string> = {
  RGB_4K: 'EO · RGB 4K', THERMAL_WHITE_HOT: 'IR · WHITE HOT', THERMAL_IRONBOW: 'IR · IRONBOW', NIGHT_VISION: 'LL · NIGHT VISION',
};

/** Sensor looks for cross-origin footage, where WebGL can't read the frames. */
const CSS_LOOK: Record<SensorMode, string> = {
  RGB_4K: 'contrast(1.04) saturate(1.05)',
  THERMAL_WHITE_HOT: 'grayscale(1) contrast(1.75) brightness(1.12)',
  THERMAL_IRONBOW: 'grayscale(1) sepia(1) saturate(6) hue-rotate(-28deg) contrast(1.7) brightness(0.95)',
  NIGHT_VISION: 'grayscale(1) sepia(1) saturate(4.5) hue-rotate(62deg) brightness(1.35) contrast(1.4)',
};
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const DroneFeedCanvas: React.FC<Props> = ({ drone, isNight, compact = false, footage = null, world, onSetSensorMode, onSetZoom, className = '', videoStream = null, videoLabel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = videoStream; }, [videoStream]);
  const live = useRef({ drone, night: isNight });
  live.current = { drone, night: isNight };
  const [rec, setRec] = useState(true);
  const [lock, setLock] = useState<Lock | null>(null);
  const [clock, setClock] = useState('');
  const [noGl, setNoGl] = useState(false);
  const width = compact ? THUMB_W : FEED_W, height = compact ? THUMB_H : FEED_H;

  // AI aerial plates, when installed, take over the San Francisco feed from streamed footage.
  const [plates, setPlates] = useState(false);
  useEffect(() => { let on = true; loadPlates().then(ok => { if (on) setPlates(ok); }); return () => { on = false; }; }, []);
  const usePlates = plates && footage === 'SAN_FRANCISCO' && !videoStream;

  // --- Footage playlist: one clip after another; each clip's file from the best source that plays ---
  const [generated, setGenerated] = useState<Clip[]>([]);
  useEffect(() => { let on = true; loadGenerated().then(g => { if (on) setGenerated(g); }); return () => { on = false; }; }, []);
  const clips = useMemo(() => (footage && !usePlates ? playlist(footage, isNight, generated) : []), [footage, isNight, usePlates, generated]);
  const [clipIdx, setClipIdx] = useState(0);
  const [srcs, setSrcs] = useState<Source[] | null>(null);
  const [srcIdx, setSrcIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);       // every clip refused to play: show the simulation instead
  const misses = useRef(0);
  const clip = clips.length ? clips[clipIdx % clips.length] : null;
  useEffect(() => { setClipIdx(0); setFailed(false); misses.current = 0; }, [footage, isNight]);
  useEffect(() => {
    let on = true;
    setSrcs(null); setSrcIdx(0); setPlaying(false);
    if (clip) sources(clip, compact).then(list => { if (on) setSrcs(list); });
    return () => { on = false; };
  }, [clip, compact]);
  const src = srcs?.[srcIdx] ?? null;
  const useFootage = !!clip && !failed && !videoStream;
  // A city's recorded footage falls back to its rendered FPV fly-through; anywhere else, to the 3D venue city.
  const simWorld: World = world ?? (footage === 'SAN_FRANCISCO' ? 'SF_FLY' : footage === 'LOS_ANGELES' ? 'LA_FLY' : footage === 'NEW_YORK' ? 'NY_FLY' : 'CITY');
  const rendered = WORLD_LABEL[simWorld];
  const glVideo = useFootage && !!src?.sameOrigin;   // same-origin: WebGL reads the frames, full sensor stage
  const nextSource = () => {
    if (srcs && srcIdx + 1 < srcs.length) { setSrcIdx(srcIdx + 1); return; }
    misses.current++;
    if (misses.current >= clips.length) setFailed(true); else setClipIdx(i => i + 1);
  };
  // Watchdog: a request that hangs (blocked, no reply) never raises an error, so give each source 10 s to start.
  useEffect(() => {
    if (!useFootage || !src || playing) return;
    const id = setTimeout(() => { if (!clipRef.current || clipRef.current.readyState < 3) nextSource(); }, 10000);
    return () => clearTimeout(id);
  }, [useFootage, src, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || videoStream || (useFootage && !glVideo)) return;
    const engine = feedEngine();
    if (!engine) { setNoGl(true); return; }
    const off = engine.add({
      canvas, compact, world: simWorld,
      get: () => live.current,
      video: glVideo ? clipRef.current ?? undefined : undefined,
      onLock: compact ? undefined : next => setLock(prev => {
        if (!next || !prev) return next;
        return prev.id === next.id && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && Math.abs(prev.w - next.w) < 0.5 ? prev : next;
      }),
    });
    return () => { off(); setLock(null); };
  }, [compact, videoStream, useFootage, glVideo, src, simWorld]);

  useEffect(() => {
    if (compact) return;
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [compact]);

  const offline = drone.status === 'OFFLINE';
  const thermal = drone.sensorMode.startsWith('THERMAL');

  return (
    <div data-feed className={`relative bg-black overflow-hidden select-none ${className}`} style={{ aspectRatio: '16 / 9' }}>
      {videoStream && <video ref={videoRef} autoPlay muted playsInline className="w-full h-full block object-cover bg-black" aria-label={`Live video from ${drone.id}`} />}
      {useFootage && src && (
        <video key={src.url} ref={clipRef} src={src.url} autoPlay muted playsInline preload="auto" loop={clips.length === 1}
          // React sets `muted` after the browser's autoplay check, so start the (muted) clip ourselves once it can play.
          onCanPlay={e => { const v = e.currentTarget; v.muted = true; if (v.paused) v.play().catch(() => { /* the watchdog moves on */ }); }}
          onPlaying={() => { setPlaying(true); misses.current = 0; }} onError={nextSource} onStalled={() => { /* keep waiting; the browser retries */ }}
          onEnded={() => setClipIdx(i => i + 1)}
          className={`w-full h-full block object-cover bg-black ${glVideo ? 'hidden' : ''}`}
          style={glVideo ? undefined : { filter: offline ? 'brightness(0)' : CSS_LOOK[drone.sensorMode] }}
          aria-label={`Recorded flight: ${clip?.title}`} />
      )}
      {useFootage && !glVideo && !offline && drone.sensorMode !== 'RGB_4K' && (
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: drone.sensorMode === 'NIGHT_VISION' ? 0.28 : 0.16, mixBlendMode: 'overlay' }} />
      )}
      {useFootage && !glVideo && !playing && !offline && (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-slate-400 bg-black/60">{compact ? 'Loading footage…' : `Loading footage · ${clip?.title}`}</div>
      )}
      {(!useFootage || glVideo) && !videoStream && <canvas ref={canvasRef} width={width} height={height} className="w-full h-full block" aria-label={`Live feed from ${drone.id}`} role="img" />}
      {noGl && !videoStream && !useFootage && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">Simulated video needs WebGL</div>
      )}

      {compact ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent font-mono text-[9px] text-slate-200">
          <span className="font-bold">{drone.id}</span>
          <span className={offline ? 'text-slate-500' : thermal ? 'text-rose-300' : 'text-emerald-300'}>{offline ? 'NO LINK' : MODE_LABEL[drone.sensorMode].split(' · ')[1]}</span>
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none font-mono text-[10px] text-slate-100">
          {/* Corner brackets */}
          {[['top-3 left-3', 'border-t border-l'], ['top-3 right-3', 'border-t border-r'], ['bottom-3 left-3', 'border-b border-l'], ['bottom-3 right-3', 'border-b border-r']].map(([pos, b]) => (
            <span key={pos} className={`absolute ${pos} w-4 h-4 ${b} border-white/50`} />
          ))}

          {/* Top strip */}
          <div className="absolute top-3 left-8 right-8 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-black/60 font-bold">{drone.id}</span>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-black/60 text-slate-300">{drone.model}</span>
              <span className={`px-1.5 py-0.5 rounded bg-black/60 font-bold ${videoStream ? 'text-sky-300' : thermal ? 'text-rose-300' : drone.sensorMode === 'NIGHT_VISION' ? 'text-lime-300' : 'text-emerald-300'}`}>{videoStream ? (videoLabel ?? 'LIVE VIDEO') : MODE_LABEL[drone.sensorMode]}</span>
              <span className="px-1.5 py-0.5 rounded bg-black/60 text-amber-300">{drone.zoom.toFixed(1)}×</span>
              {footage && failed && !videoStream && <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-black/60 text-slate-400" title={`The recorded footage could not be loaded; showing ${rendered ? rendered.title : 'the 3D simulation'}`}>{rendered ? rendered.badge : '3D SIM'}</span>}
            </div>
            <div className="flex items-center gap-2">
              {!offline && <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE · {drone.rttMs} ms</span>}
              <button onClick={() => setRec(r => !r)} className={`pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 ${rec ? 'text-rose-300' : 'text-slate-400'}`}>
                <Circle className={`w-2.5 h-2.5 ${rec ? 'fill-rose-500 text-rose-500 animate-pulse' : ''}`} />{rec ? 'REC' : 'DVR'}
              </button>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-black/60 tabular-nums">{clock}</span>
            </div>
          </div>

          {/* Reticle */}
          {!offline && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-10 h-10 border border-white/40 rounded-full" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/80" />
              <span className="absolute left-1/2 -top-3 -translate-x-1/2 w-px h-2 bg-white/50" /><span className="absolute left-1/2 -bottom-3 -translate-x-1/2 w-px h-2 bg-white/50" />
              <span className="absolute top-1/2 -left-3 -translate-y-1/2 h-px w-2 bg-white/50" /><span className="absolute top-1/2 -right-3 -translate-y-1/2 h-px w-2 bg-white/50" />
            </div>
          )}

          {/* Target lock */}
          {lock && !offline && !videoStream && (
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${((lock.x + lock.w / 2) / width) * 100}%`, top: `${((lock.y + lock.h / 2) / height) * 100}%`, width: `max(22px, ${((lock.w + 8) / width) * 100}%)`, height: `max(22px, ${((lock.h + 8) / height) * 100}%)` }}>
              <div className={`w-full h-full border ${drone.tasks.autoTrack ? 'border-orange-400' : 'border-white/70'}`} />
              <div className={`absolute left-full top-0 ml-1.5 whitespace-nowrap px-1.5 py-0.5 rounded bg-black/70 ${drone.tasks.autoTrack ? 'text-orange-200' : 'text-slate-100'}`}>
                <div className="font-bold">{lock.id} · {lock.kind}{drone.tasks.autoTrack ? ' · TRACKING' : ''}</div>
                {thermal && <div className="flex items-center gap-1 text-rose-200"><Thermometer className="w-2.5 h-2.5" />{lock.tempC.toFixed(1)} °C · MOVING</div>}
              </div>
            </div>
          )}

          {/* Bottom strip */}
          <div className="absolute bottom-3 left-8 right-8 flex items-end justify-between">
            <div className="hidden sm:flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-black/60">ALT <b className="text-slate-50">{drone.altM.toFixed(0)}</b> m</span>
              <span className="px-1.5 py-0.5 rounded bg-black/60">HDG <b className="text-slate-50">{String(Math.round(drone.headingDeg)).padStart(3, '0')}°</b></span>
              <span className="px-1.5 py-0.5 rounded bg-black/60">GMB <b className="text-slate-50">{drone.gimbalPitchDeg}°</b></span>
              <span className="px-1.5 py-0.5 rounded bg-black/60">SPD <b className="text-slate-50">{(drone.groundSpeedMps * 3.6).toFixed(0)}</b> km/h</span>
            </div>
            <div className="pointer-events-auto flex items-center gap-1">
              {!videoStream && (['RGB_4K', 'THERMAL_WHITE_HOT', 'THERMAL_IRONBOW', 'NIGHT_VISION'] as SensorMode[]).map(m => (
                <button key={m} onClick={() => onSetSensorMode?.(m)} disabled={offline} aria-pressed={drone.sensorMode === m}
                  className={`px-1.5 py-0.5 rounded bg-black/60 border ${drone.sensorMode === m ? 'border-white/60 text-white' : 'border-transparent text-slate-400 hover:text-slate-100'} disabled:opacity-40`}>
                  {m === 'RGB_4K' ? 'EO' : m === 'THERMAL_WHITE_HOT' ? 'IR·WH' : m === 'THERMAL_IRONBOW' ? 'IR·IB' : 'NV'}
                </button>
              ))}
              <span className="w-px h-3 bg-white/20 mx-0.5" />
              <button onClick={() => onSetZoom?.(Math.max(1, drone.zoom - 1))} disabled={offline} className="px-1.5 py-0.5 rounded bg-black/60 text-slate-300 disabled:opacity-40">−</button>
              <button onClick={() => onSetZoom?.(Math.min(10, drone.zoom + 1))} disabled={offline} className="px-1.5 py-0.5 rounded bg-black/60 text-slate-300 disabled:opacity-40">+</button>
              <button onClick={e => (e.currentTarget.closest('[data-feed]') as HTMLElement | null)?.requestFullscreen?.()} className="px-1.5 py-0.5 rounded bg-black/60 text-slate-300" title="Fullscreen"><Maximize2 className="w-3 h-3" /></button>
            </div>
          </div>

          {offline && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40">
              <span className="text-sm font-bold tracking-widest text-slate-300">NO VIDEO LINK</span>
              <span className="text-slate-500">{drone.id} is on the pad</span>
            </div>
          )}
          {useFootage && clip && !offline && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-slate-300/70">{clip.file ? `AI-generated drone footage · ${clip.title} · ${clip.ai}` : `Recorded flight · ${clip.title} · ${clip.by} · Pexels`}</div>
          )}
          {!useFootage && !videoStream && !offline && rendered && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-slate-300/70">{simWorld === 'SF' && plates ? 'San Francisco, California · aerial tour · AI-generated imagery' : rendered.caption}</div>
          )}
          {!offline && !videoStream && !useFootage && isNight && !thermal && drone.sensorMode !== 'NIGHT_VISION' && (
            <div className="absolute left-1/2 top-12 -translate-x-1/2 px-2 py-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 flex items-center gap-1.5">
              <CrosshairIcon className="w-3 h-3" /><span className="hidden sm:inline">NIGHT · EO IMAGE UNUSABLE — </span>SWITCH TO IR
            </div>
          )}
        </div>
      )}
    </div>
  );
};
