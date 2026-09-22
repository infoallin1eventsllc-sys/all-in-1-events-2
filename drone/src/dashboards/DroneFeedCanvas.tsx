import React, { useEffect, useRef, useState } from 'react';
import { Circle, Maximize2, Crosshair as CrosshairIcon, Thermometer } from 'lucide-react';
import { fbm } from './terrain';
import type { PatrolDrone, SensorMode } from '../hooks/useSurveillanceSimulation';

/**
 * Synthetic gimbal video feed for a patrol airframe.
 *
 * Renders a perspective view of the ground from the drone's altitude, gimbal pitch
 * and heading, scrolling with its ground speed, with moving targets (people,
 * vehicles) on the ground plane. Sensor modes change the whole image:
 *   RGB_4K            daylight colour; at night it's near-black (you cannot see)
 *   THERMAL_WHITE_HOT ground cool grey, warm bodies white with heat trails
 *   THERMAL_IRONBOW   same radiometry, ironbow palette
 *   NIGHT_VISION      green phosphor with grain
 * The feed is what a real H.264/WebRTC stream from the payload would replace.
 */

interface Props {
  drone: PatrolDrone;
  isNight: boolean;
  /** Internal render width; the canvas scales to its container. */
  width?: number;
  /** Compact thumbnails skip the HUD and run fewer noise octaves. */
  compact?: boolean;
  onSetSensorMode?: (mode: SensorMode) => void;
  onSetZoom?: (zoom: number) => void;
  className?: string;
}

interface Target {
  id: string;
  kind: 'PERSON' | 'VEHICLE';
  fwd: number;     // metres ahead of the drone along heading
  lat: number;     // metres right of the drone
  vFwd: number; vLat: number;
  tempC: number;
  trail: { fwd: number; lat: number }[];
}

const MODE_LABEL: Record<SensorMode, string> = {
  RGB_4K: 'EO · RGB 4K', THERMAL_WHITE_HOT: 'IR · WHITE HOT', THERMAL_IRONBOW: 'IR · IRONBOW', NIGHT_VISION: 'LL · NIGHT VISION',
};

function ironbow(t: number): [number, number, number] {
  // black → purple → red → orange → yellow → white
  const stops: [number, [number, number, number]][] = [
    [0, [0, 0, 0]], [0.25, [70, 0, 110]], [0.5, [200, 20, 30]], [0.75, [255, 140, 0]], [0.9, [255, 235, 60]], [1, [255, 255, 255]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return [255, 255, 255];
}

function seedTargets(seed: number): Target[] {
  const r = (n: number) => { const x = Math.sin(seed * 999 + n * 77) * 10000; return x - Math.floor(x); };
  const list: Target[] = [];
  for (let i = 0; i < 4; i++) {
    const kind: Target['kind'] = i === 1 ? 'VEHICLE' : 'PERSON';
    list.push({
      id: `TGT-${i + 1}`, kind,
      fwd: 40 + r(i) * 90, lat: (r(i + 10) - 0.5) * 90,
      vFwd: (r(i + 20) - 0.5) * (kind === 'VEHICLE' ? 8 : 1.4), vLat: (r(i + 30) - 0.5) * (kind === 'VEHICLE' ? 8 : 1.4),
      tempC: kind === 'VEHICLE' ? 41 + r(i + 40) * 12 : 35.5 + r(i + 40) * 2,
      trail: [],
    });
  }
  return list;
}

export const DroneFeedCanvas: React.FC<Props> = ({ drone, isNight, width = 640, compact = false, onSetSensorMode, onSetZoom, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const droneRef = useRef(drone);
  droneRef.current = drone;
  const nightRef = useRef(isNight);
  nightRef.current = isNight;
  const targetsRef = useRef<Target[]>(seedTargets(drone.id.charCodeAt(2)));
  const [rec, setRec] = useState(true);
  const [lock, setLock] = useState<{ id: string; x: number; y: number; w: number; h: number; tempC: number; kind: string } | null>(null);
  const [clock, setClock] = useState('');
  const height = Math.round(width * 9 / 16);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Render at a reduced resolution and let the canvas upscale — it also reads as a compressed stream.
    const rw = compact ? 160 : 320, rh = Math.round(rw * 9 / 16);
    const off = document.createElement('canvas'); off.width = rw; off.height = rh;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(rw, rh);
    const px = img.data;
    const octaves = compact ? 2 : 3;
    let raf = 0, last = performance.now(), frame = 0;
    const world = { x: 0, y: 0 };

    const draw = (now: number) => {
      frame++;
      if (compact && frame % 2) { raf = requestAnimationFrame(draw); return; } // thumbnails at half rate
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const d = droneRef.current;
      const night = nightRef.current;
      const mode = d.sensorMode;
      const offline = d.status === 'OFFLINE';
      const thermal = mode === 'THERMAL_WHITE_HOT' || mode === 'THERMAL_IRONBOW';
      const nv = mode === 'NIGHT_VISION';

      // World scroll from ground speed along heading.
      const hd = ((d.headingDeg - 90) * Math.PI) / 180;
      world.x += Math.cos(hd) * d.groundSpeedMps * dt;
      world.y += Math.sin(hd) * d.groundSpeedMps * dt;

      // Camera model. Pitch is degrees below horizon; focal length grows with zoom.
      const pitchDown = Math.max(8, -d.gimbalPitchDeg) * Math.PI / 180;
      const focal = rw * 0.9 * d.zoom;
      const alt = Math.max(5, d.altM);
      const horizonY = rh * 0.5 - Math.tan(pitchDown) * focal; // may be above the frame at steep pitch
      const cosH = Math.cos(hd), sinH = Math.sin(hd);
      const scale = 0.035; // world metres → noise space

      if (offline) {
        // No link: snow.
        for (let i = 0; i < px.length; i += 4) { const g = 10 + Math.random() * 40; px[i] = g; px[i + 1] = g; px[i + 2] = g; px[i + 3] = 255; }
      } else {
        for (let y = 0; y < rh; y++) {
          const dy = y - rh * 0.5;
          const ang = pitchDown + Math.atan2(dy, focal); // angle below horizon of this row
          const row = y * rw * 4;
          if (ang <= 0.01) {
            // Sky
            const k = Math.max(0, Math.min(1, (y - Math.max(0, horizonY - rh * 0.6)) / Math.max(1, rh * 0.6)));
            let r = 0, g = 0, b = 0;
            if (thermal) { const v = 20 + k * 40; r = g = b = v; if (mode === 'THERMAL_IRONBOW') { [r, g, b] = ironbow(v / 255); } }
            else if (nv) { r = 5; g = 30 + k * 30; b = 12; }
            else if (night) { r = 4; g = 6; b = 12; }
            else { r = 90 + k * 60; g = 130 + k * 60; b = 170 + k * 50; }
            for (let x = 0; x < rw; x++) { const i = row + x * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }
            continue;
          }
          const dist = alt / Math.tan(ang);
          const fade = Math.min(1, 300 / dist); // atmospheric falloff with range
          for (let x = 0; x < rw; x++) {
            const lat = ((x - rw * 0.5) / focal) * dist;
            // World point: drone pos + forward*dist + right*lat
            const wx = world.x + cosH * dist - sinH * lat;
            const wy = world.y + sinH * dist + cosH * lat;
            const n = fbm(wx * scale, wy * scale, 3, octaves);          // 0..1 terrain/vegetation
            const road = Math.abs(((wy * 0.02 + Math.sin(wx * 0.01) * 0.8) % 1 + 1) % 1 - 0.5) < 0.05 ? 1 : 0;
            const i = row + x * 4;
            let r: number, g: number, b: number;
            if (thermal) {
              // Ground radiometry: vegetation cool, bare ground/roads warmer (retain heat at night).
              let v = 55 + n * 60 + road * 45;
              if (night) v -= 10;
              v = Math.max(20, Math.min(180, v)) * (0.85 + 0.15 * fade);
              if (mode === 'THERMAL_IRONBOW') [r, g, b] = ironbow(v / 255);
              else r = g = b = v;
            } else if (nv) {
              const v = (35 + n * 140 + road * 40) * (0.7 + 0.3 * fade);
              r = v * 0.25; g = v; b = v * 0.35;
              const grain = (Math.random() - 0.5) * 28; r += grain * 0.3; g += grain; b += grain * 0.3;
            } else if (night) {
              // Unaided RGB at night: nearly nothing. This is the point of night protocol.
              const v = (4 + n * 10 + road * 8);
              r = v * 0.8; g = v; b = v * 1.3;
              const grain = (Math.random() - 0.5) * 6; r += grain; g += grain; b += grain;
            } else {
              const veg = n;
              r = (70 + (1 - veg) * 90 + road * 60) * fade + (1 - fade) * 120;
              g = (90 + veg * 70 + road * 55) * fade + (1 - fade) * 140;
              b = (45 + veg * 20 + road * 55) * fade + (1 - fade) * 165;
            }
            px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
          }
        }
      }
      octx.putImageData(img, 0, 0);

      // --- Targets on the ground plane ------------------------------------
      let nearest: { t: Target; sx: number; sy: number; sw: number; sh: number } | null = null;
      if (!offline) {
        for (const t of targetsRef.current) {
          // Wander; the vehicle follows a loose road-like path, people drift.
          t.vFwd += (Math.random() - 0.5) * 0.2 * dt; t.vLat += (Math.random() - 0.5) * 0.2 * dt;
          const maxV = t.kind === 'VEHICLE' ? 9 : 1.6;
          const sp = Math.hypot(t.vFwd, t.vLat); if (sp > maxV) { t.vFwd *= maxV / sp; t.vLat *= maxV / sp; }
          // Targets are anchored to the ground, so the drone's own motion moves them in the frame.
          t.fwd += t.vFwd * dt - d.groundSpeedMps * dt; t.lat += t.vLat * dt;
          // Keep the scene populated: re-seed anything that leaves the sensor footprint.
          const maxFwd = alt / Math.tan(Math.max(0.05, pitchDown - Math.atan2(rh * 0.5, focal))) + 20;
          if (t.fwd < alt * 0.3 || t.fwd > Math.min(400, maxFwd) || Math.abs(t.lat) > t.fwd * 0.9 + 15) {
            t.fwd = 40 + Math.random() * Math.min(200, maxFwd - 40); t.lat = (Math.random() - 0.5) * t.fwd * 1.2; t.trail = [];
          }
          if (frame % 4 === 0) t.trail = [...t.trail.slice(-14), { fwd: t.fwd, lat: t.lat }];

          const project = (fwd: number, lat: number) => {
            const angT = Math.atan2(alt, fwd);
            const sy = rh * 0.5 + Math.tan(angT - pitchDown) * focal;
            const sx = rw * 0.5 + (lat / fwd) * focal;
            return { sx, sy, k: focal / fwd };
          };
          const p = project(t.fwd, t.lat);
          if (p.sy < -10 || p.sy > rh + 10 || p.sx < -20 || p.sx > rw + 20) continue;
          const sw = (t.kind === 'VEHICLE' ? 4.4 : 0.7) * p.k, sh = (t.kind === 'VEHICLE' ? 2.2 : 1.8) * p.k * Math.sin(pitchDown) + (t.kind === 'VEHICLE' ? 1.6 : 1.8) * p.k * Math.cos(pitchDown) * 0.6;

          if (thermal) {
            // Heat trail: cooling footprints / exhaust.
            t.trail.forEach((tp, i) => {
              const q = project(tp.fwd - (t.fwd - tp.fwd) * 0, tp.lat);
              const a = (i / t.trail.length) * 0.35;
              octx.fillStyle = mode === 'THERMAL_IRONBOW' ? `rgba(255,120,20,${a})` : `rgba(255,255,255,${a})`;
              octx.beginPath(); octx.ellipse(q.sx, q.sy, Math.max(0.6, sw * 0.35), Math.max(0.4, sw * 0.18), 0, 0, Math.PI * 2); octx.fill();
            });
            const gr = Math.max(2, Math.min(sw * (t.kind === 'VEHICLE' ? 0.9 : 1.8), rw * 0.06));
            const glow = octx.createRadialGradient(p.sx, p.sy - sh * 0.3, 0, p.sx, p.sy - sh * 0.3, gr);
            if (mode === 'THERMAL_IRONBOW') { glow.addColorStop(0, 'rgba(255,255,220,1)'); glow.addColorStop(0.5, 'rgba(255,170,30,0.8)'); glow.addColorStop(1, 'rgba(200,30,40,0)'); }
            else { glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.55, 'rgba(255,255,255,0.75)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); }
            octx.fillStyle = glow;
            octx.beginPath(); octx.ellipse(p.sx, p.sy - sh * 0.3, gr, Math.max(2, Math.min(sh * 1.4, gr * 0.7)), 0, 0, Math.PI * 2); octx.fill();
            octx.fillStyle = mode === 'THERMAL_IRONBOW' ? '#fffbe6' : '#ffffff';
          } else if (nv) {
            octx.fillStyle = 'rgba(200,255,200,0.75)';
          } else if (night) {
            octx.fillStyle = 'rgba(30,34,44,0.9)'; // a person in the dark: a slightly darker smudge
          } else {
            octx.fillStyle = t.kind === 'VEHICLE' ? '#1f2937' : '#111827';
          }
          if (t.kind === 'VEHICLE') octx.fillRect(p.sx - sw / 2, p.sy - sh, sw, sh);
          else { octx.beginPath(); octx.ellipse(p.sx, p.sy - sh / 2, Math.max(0.5, sw / 2), Math.max(0.8, sh / 2), 0, 0, Math.PI * 2); octx.fill(); }

          const dNear = Math.hypot(p.sx - rw / 2, p.sy - rh / 2);
          if (!nearest || dNear < Math.hypot(nearest.sx - rw / 2, nearest.sy - rh / 2)) nearest = { t, sx: p.sx, sy: p.sy, sw, sh };
        }
      }

      // Sensor character: NV grain bloom, thermal soft edges, mild vignette everywhere.
      if (nv && !offline && frame % 2 === 0) { octx.fillStyle = 'rgba(120,255,140,0.04)'; octx.fillRect(0, 0, rw, rh); }
      const vig = octx.createRadialGradient(rw / 2, rh / 2, rh * 0.5, rw / 2, rh / 2, rw * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.45)');
      octx.fillStyle = vig; octx.fillRect(0, 0, rw, rh);

      // Blit up.
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

      // Publish lock box for the HUD (auto-track follows the target nearest the reticle).
      if (!compact) {
        const sx = canvas.width / rw, sy = canvas.height / rh;
        if (nearest && (d.tasks.autoTrack || d.tasks.survivorDetect || thermal)) {
          const n = nearest;
          setLock(prev => {
            const next = { id: n.t.id, x: (n.sx - n.sw / 2 - 3) * sx, y: (n.sy - n.sh - 3) * sy, w: (n.sw + 6) * sx, h: (n.sh + 6) * sy, tempC: n.t.tempC, kind: n.t.kind };
            return prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && prev.id === next.id ? prev : next;
          });
        } else setLock(null);
        if (frame % 15 === 0) setClock(new Date().toLocaleTimeString([], { hour12: false }));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [compact]);

  const offline = drone.status === 'OFFLINE';
  const thermal = drone.sensorMode.startsWith('THERMAL');

  return (
    <div data-feed className={`relative bg-black overflow-hidden select-none ${className}`} style={{ aspectRatio: '16 / 9' }}>
      <canvas ref={canvasRef} width={width} height={height} className="w-full h-full block" aria-label={`Live feed from ${drone.id}`} role="img" />

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
              <span className={`px-1.5 py-0.5 rounded bg-black/60 font-bold ${thermal ? 'text-rose-300' : drone.sensorMode === 'NIGHT_VISION' ? 'text-lime-300' : 'text-emerald-300'}`}>{MODE_LABEL[drone.sensorMode]}</span>
              <span className="px-1.5 py-0.5 rounded bg-black/60 text-amber-300">{drone.zoom.toFixed(1)}×</span>
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
          {lock && !offline && (
            <div className="absolute" style={{ left: `${(lock.x / width) * 100}%`, top: `${(lock.y / height) * 100}%`, width: `${Math.max(4, (lock.w / width) * 100)}%`, height: `${Math.max(4, (lock.h / height) * 100)}%` }}>
              <div className={`w-full h-full min-w-[26px] min-h-[26px] border ${drone.tasks.autoTrack ? 'border-orange-400' : 'border-white/70'}`} />
              <div className={`absolute left-full top-0 ml-1.5 whitespace-nowrap px-1.5 py-0.5 rounded bg-black/70 ${drone.tasks.autoTrack ? 'text-orange-200' : 'text-slate-100'}`}>
                <div className="font-bold">{lock.id} · {lock.kind}{drone.tasks.autoTrack ? ' · TRACKING' : ''}</div>
                {thermal && <div className="flex items-center gap-1 text-rose-200"><Thermometer className="w-2.5 h-2.5" />{lock.tempC.toFixed(1)} °C · MOVING</div>}
              </div>
            </div>
          )}

          {/* Bottom strip */}
          <div className="absolute bottom-3 left-8 right-8 flex items-end justify-between">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-black/60">ALT <b className="text-slate-50">{drone.altM.toFixed(0)}</b> m</span>
              <span className="px-1.5 py-0.5 rounded bg-black/60">HDG <b className="text-slate-50">{String(Math.round(drone.headingDeg)).padStart(3, '0')}°</b></span>
              <span className="px-1.5 py-0.5 rounded bg-black/60">GMB <b className="text-slate-50">{drone.gimbalPitchDeg}°</b></span>
              <span className="px-1.5 py-0.5 rounded bg-black/60">SPD <b className="text-slate-50">{(drone.groundSpeedMps * 3.6).toFixed(0)}</b> km/h</span>
            </div>
            <div className="pointer-events-auto flex items-center gap-1">
              {(['RGB_4K', 'THERMAL_WHITE_HOT', 'THERMAL_IRONBOW', 'NIGHT_VISION'] as SensorMode[]).map(m => (
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
          {!offline && isNight && !thermal && drone.sensorMode !== 'NIGHT_VISION' && (
            <div className="absolute left-1/2 top-12 -translate-x-1/2 px-2 py-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 flex items-center gap-1.5">
              <CrosshairIcon className="w-3 h-3" /><span className="hidden sm:inline">NIGHT · EO IMAGE UNUSABLE — </span>SWITCH TO IR
            </div>
          )}
        </div>
      )}
    </div>
  );
};
