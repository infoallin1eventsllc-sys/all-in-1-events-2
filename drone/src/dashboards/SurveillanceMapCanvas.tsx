import React, { useEffect, useRef } from 'react';
import { getTerrain, TERRAIN_SURVEILLANCE } from './terrain';
import {
  SITE, WAYPOINTS, MAP_W, MAP_H, METERS_PER_PX,
  type PatrolDrone, type Detection,
} from '../hooks/useSurveillanceSimulation';

interface Props {
  drones: PatrolDrone[];
  detections: Detection[];
  selectedDroneId: string;
  onSelectDrone: (id: string) => void;
  onSelectWaypoint: (index: number) => void;
}

const ACCENT = '#34d399';       // fleet / route
const WAYPOINT = '#fb923c';     // next waypoint (orange, as in the reference)

/** Patrol map: terrain, site, waypoint loop, airframes with sensor footprint, and detections. */
export const SurveillanceMapCanvas: React.FC<Props> = ({ drones, detections, selectedDroneId, onSelectDrone, onSelectWaypoint }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ drones, detections, selectedDroneId });
  propsRef.current = { drones, detections, selectedDroneId };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_W * dpr;
    canvas.height = MAP_H * dpr;
    const terrain = getTerrain(MAP_W, MAP_H, 21, TERRAIN_SURVEILLANCE);
    const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

    let raf = 0;
    const draw = () => {
      const { drones, detections, selectedDroneId } = propsRef.current;
      const now = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(terrain, 0, 0);

      // Site footprint
      ctx.beginPath(); ctx.arc(SITE.x, SITE.y, 110, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52,211,153,0.05)'; ctx.fill();
      ctx.strokeStyle = 'rgba(52,211,153,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.rect(SITE.x - 26, SITE.y - 18, 52, 36);
      ctx.fillStyle = 'rgba(148,163,184,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(203,213,225,0.5)'; ctx.stroke();
      ctx.font = `600 10px ${mono}`; ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.fillText(SITE.name.toUpperCase(), SITE.x - 26, SITE.y + 32);
      ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.fillText('HOME · GCS', SITE.x - 26, SITE.y + 44);

      // Patrol route
      ctx.beginPath();
      WAYPOINTS.forEach((w, i) => (i === 0 ? ctx.moveTo(w.x, w.y) : ctx.lineTo(w.x, w.y)));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(52,211,153,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -(now / 40) % 14; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;

      const selected = drones.find(d => d.id === selectedDroneId);
      WAYPOINTS.forEach((w, i) => {
        const isNext = selected && selected.targetWpIndex === i;
        const col = isNext ? WAYPOINT : ACCENT;
        // pin
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x, w.y - 22); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(w.x, w.y - 26, isNext ? 6 : 4.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
        ctx.beginPath(); ctx.ellipse(w.x, w.y, 9, 4, 0, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
        if (isNext) {
          const p = 12 + Math.sin(now / 300) * 3;
          ctx.beginPath(); ctx.ellipse(w.x, w.y, p * 1.6, p * 0.7, 0, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
        }
        // label chip
        const label = `${w.id}  ${w.label}`;
        ctx.font = `600 10px ${mono}`;
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(2,6,23,0.75)';
        ctx.beginPath(); ctx.roundRect(w.x + 10, w.y - 36, tw, 16, 4); ctx.fill();
        ctx.fillStyle = isNext ? '#fed7aa' : 'rgba(226,232,240,0.9)';
        ctx.fillText(label, w.x + 16, w.y - 24);
        ctx.font = `10px ${mono}`; ctx.fillStyle = 'rgba(148,163,184,0.7)';
        ctx.fillText(`${w.altM} m AGL · hold ${w.holdSec}s`, w.x + 16, w.y - 8);
      });

      // Detections
      for (const det of detections) {
        const age = (Date.now() - det.firstSeenMs) / 1000;
        const col = det.acknowledged ? 'rgba(148,163,184,' : det.kind === 'PERSON' ? 'rgba(251,191,36,' : det.kind === 'HEAT_SIGNATURE' ? 'rgba(251,113,133,' : 'rgba(56,189,248,';
        if (!det.acknowledged) {
          const r = 10 + ((now / 20 + age * 5) % 24);
          ctx.beginPath(); ctx.arc(det.x, det.y, r, 0, Math.PI * 2); ctx.strokeStyle = `${col}${0.8 - r / 40})`; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.beginPath(); ctx.rect(det.x - 5, det.y - 5, 10, 10); ctx.strokeStyle = `${col}0.9)`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = `600 10px ${mono}`; ctx.fillStyle = `${col}0.95)`;
        ctx.fillText(`${det.id} ${det.kind.replace('_', ' ')}`, det.x + 10, det.y + 4);
      }

      // Airframes
      for (const d of drones) {
        const sel = d.id === selectedDroneId;
        const offline = d.status === 'OFFLINE';
        const col = offline ? '#64748b' : d.status === 'RTH' ? '#fbbf24' : ACCENT;

        if (!offline) {
          // Sensor footprint: cone in heading direction sized by altitude and gimbal.
          const hd = ((d.headingDeg - 90) * Math.PI) / 180;
          const reach = 40 + d.altM * 0.9 + Math.abs(d.gimbalPitchDeg) * 0.5;
          const spread = 0.35 / Math.max(1, d.zoom * 0.6);
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.arc(d.x, d.y, reach, hd - spread, hd + spread); ctx.closePath();
          const g = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, reach);
          const tint = d.sensorMode === 'THERMAL_WHITE_HOT' || d.sensorMode === 'THERMAL_IRONBOW' ? '251,113,133' : d.sensorMode === 'NIGHT_VISION' ? '163,230,53' : '52,211,153';
          g.addColorStop(0, `rgba(${tint},${sel ? 0.28 : 0.14})`); g.addColorStop(1, `rgba(${tint},0)`);
          ctx.fillStyle = g; ctx.fill();
          if (d.tasks.illumination) {
            ctx.beginPath(); ctx.arc(d.x + Math.cos(hd) * reach * 0.6, d.y + Math.sin(hd) * reach * 0.6, reach * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(254,240,138,0.16)'; ctx.fill();
          }
          if (d.tasks.thermalScan || d.tasks.survivorDetect) {
            const r = (now / 12) % 60;
            ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${tint},${0.5 - r / 120})`; ctx.lineWidth = 1; ctx.stroke();
          }
          // Altitude tether (drop line) like the reference's vertical dotted line
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - d.altM * 0.6);
          ctx.strokeStyle = 'rgba(226,232,240,0.35)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
          // Ground shadow
          ctx.beginPath(); ctx.ellipse(d.x, d.y, 8, 3.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
        }

        // Quad glyph at altitude
        const gy = offline ? d.y : d.y - d.altM * 0.6;
        ctx.save(); ctx.translate(d.x, gy); ctx.rotate((d.headingDeg * Math.PI) / 180);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(-7, 7); ctx.lineTo(7, -7); ctx.stroke();
        [[-7, -7], [7, -7], [7, 7], [-7, 7]].forEach(([ax, ay]) => { ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); });
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(3, -5); ctx.lineTo(-3, -5); ctx.closePath(); ctx.fillStyle = '#f8fafc'; ctx.fill();
        ctx.restore();

        if (sel) {
          const s = 16;
          ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
            ctx.beginPath(); ctx.moveTo(d.x + sx * s, gy + sy * (s - 6)); ctx.lineTo(d.x + sx * s, gy + sy * s); ctx.lineTo(d.x + sx * (s - 6), gy + sy * s); ctx.stroke();
          });
        }
        ctx.font = `600 10px ${mono}`; ctx.fillStyle = 'rgba(248,250,252,0.92)';
        ctx.fillText(d.id, d.x + 14, gy - 6);
        ctx.font = `10px ${mono}`; ctx.fillStyle = col;
        ctx.fillText(offline ? 'OFFLINE' : `${d.altM.toFixed(0)} m · ${(d.groundSpeedMps * 3.6).toFixed(0)} km/h`, d.x + 14, gy + 6);
      }

      // Scale + north
      ctx.font = `10px ${mono}`; ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.fillText('N', MAP_W - 30, 26);
      ctx.beginPath(); ctx.moveTo(MAP_W - 26, 34); ctx.lineTo(MAP_W - 26, 60); ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MAP_W - 30, 40); ctx.lineTo(MAP_W - 26, 32); ctx.lineTo(MAP_W - 22, 40); ctx.stroke();
      const scalePx = 250 / METERS_PER_PX;
      ctx.beginPath(); ctx.moveTo(24, MAP_H - 24); ctx.lineTo(24 + scalePx, MAP_H - 24); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(226,232,240,0.7)'; ctx.stroke();
      ctx.fillText('250 m', 24, MAP_H - 30);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    let bestD = 26, bestDrone: PatrolDrone | null = null;
    for (const d of propsRef.current.drones) {
      const gy = d.status === 'OFFLINE' ? d.y : d.y - d.altM * 0.6;
      const dist = Math.min(Math.hypot(d.x - x, d.y - y), Math.hypot(d.x - x, gy - y));
      if (dist < bestD) { bestD = dist; bestDrone = d; }
    }
    if (bestDrone) { onSelectDrone(bestDrone.id); return; }
    let wpBest = 30, wpIdx = -1;
    WAYPOINTS.forEach((w, i) => { const dist = Math.hypot(w.x - x, w.y - 20 - y); if (dist < wpBest) { wpBest = dist; wpIdx = i; } });
    if (wpIdx >= 0) onSelectWaypoint(wpIdx);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full h-full block cursor-crosshair"
      style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
      aria-label="Patrol mission map"
      role="img"
    />
  );
};
