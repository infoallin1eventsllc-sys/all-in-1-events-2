import React, { useEffect, useRef } from 'react';
import { getTerrain, TERRAIN_DEFENSE } from './terrain';
import {
  ASSET, ENGAGE_RING_PX, WARN_RING_PX, MAP_W, MAP_H, METERS_PER_PX,
  type Threat, type Sensor, type DisruptionState,
} from '../hooks/useDefenseSimulation';

interface Props {
  threats: Threat[];
  sensors: Sensor[];
  disruption: DisruptionState;
  selectedThreatId: string | null;
  onSelectThreat: (id: string | null) => void;
  showSensorCoverage: boolean;
  showTrails: boolean;
}

const LEVEL_COLOR: Record<Threat['level'], string> = {
  LOW: '#94a3b8', MEDIUM: '#fbbf24', HIGH: '#fb923c', CRITICAL: '#fb7185',
};

/** Tactical counter-UAS map: terrain, protected asset, sensor coverage, threat tracks and effector cones. */
export const DefenseMapCanvas: React.FC<Props> = ({ threats, sensors, disruption, selectedThreatId, onSelectThreat, showSensorCoverage, showTrails }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ threats, sensors, disruption, selectedThreatId, showSensorCoverage, showTrails });
  propsRef.current = { threats, sensors, disruption, selectedThreatId, showSensorCoverage, showTrails };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_W * dpr;
    canvas.height = MAP_H * dpr;
    const terrain = getTerrain(MAP_W, MAP_H, 7, TERRAIN_DEFENSE);

    let raf = 0;
    const draw = () => {
      const { threats, sensors, disruption, selectedThreatId, showSensorCoverage, showTrails } = propsRef.current;
      const now = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(terrain, 0, 0);

      // Sensor coverage
      if (showSensorCoverage) {
        for (const s of sensors) {
          const col = s.status === 'ONLINE' ? '56,189,248' : s.status === 'DEGRADED' ? '251,191,36' : '148,163,184';
          const alpha = s.status === 'OFFLINE' ? 0.15 : 0.5;
          ctx.beginPath();
          if (s.fovDeg >= 360) ctx.arc(s.x, s.y, s.rangePx, 0, Math.PI * 2);
          else {
            const a0 = ((s.bearingDeg - 90 - s.fovDeg / 2) * Math.PI) / 180;
            const a1 = ((s.bearingDeg - 90 + s.fovDeg / 2) * Math.PI) / 180;
            ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, s.rangePx, a0, a1); ctx.closePath();
          }
          ctx.fillStyle = `rgba(${col},${s.status === 'OFFLINE' ? 0.02 : 0.045})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${col},${alpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.setLineDash(s.status === 'ONLINE' ? [] : [4, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Sensor node
          ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${col},${alpha + 0.4})`; ctx.fill();
          ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = 'rgba(203,213,225,0.7)';
          ctx.fillText(s.id, s.x + 8, s.y - 6);
        }
      }

      // Protected asset + range rings
      const rings = [ENGAGE_RING_PX, WARN_RING_PX, WARN_RING_PX + 200];
      rings.forEach((r, i) => {
        ctx.beginPath(); ctx.arc(ASSET.x, ASSET.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = i === 0 ? 'rgba(251,113,133,0.45)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = i === 0 ? 1.2 : 1;
        ctx.setLineDash(i === 0 ? [] : [3, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = i === 0 ? 'rgba(251,113,133,0.8)' : 'rgba(148,163,184,0.6)';
        ctx.fillText(`${Math.round((r * METERS_PER_PX) / 10) * 10} m${i === 0 ? ' · ENGAGE' : ''}`, ASSET.x + r * 0.707 + 4, ASSET.y - r * 0.707 - 4);
      });
      // Asset marker
      ctx.beginPath(); ctx.arc(ASSET.x, ASSET.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56,189,248,0.25)'; ctx.fill();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ASSET.x - 14, ASSET.y); ctx.lineTo(ASSET.x + 14, ASSET.y); ctx.moveTo(ASSET.x, ASSET.y - 14); ctx.lineTo(ASSET.x, ASSET.y + 14);
      ctx.strokeStyle = 'rgba(125,211,252,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(224,242,254,0.9)';
      ctx.fillText(ASSET.name.toUpperCase(), ASSET.x + 14, ASSET.y + 22);

      // Sweep beam (our own emission)
      if (disruption.sweepActive) {
        const a = (now / 1400) % (Math.PI * 2);
        ctx.beginPath(); ctx.moveTo(ASSET.x, ASSET.y);
        ctx.arc(ASSET.x, ASSET.y, ENGAGE_RING_PX + 40, a - 0.5, a);
        ctx.closePath();
        const grad = ctx.createRadialGradient(ASSET.x, ASSET.y, 20, ASSET.x, ASSET.y, ENGAGE_RING_PX + 40);
        grad.addColorStop(0, 'rgba(251,113,133,0.35)');
        grad.addColorStop(1, 'rgba(251,113,133,0)');
        ctx.fillStyle = grad; ctx.fill();
      }
      // Pulse burst ring
      if (disruption.pulseUntilMs > Date.now()) {
        const t = 1 - (disruption.pulseUntilMs - Date.now()) / 1500;
        ctx.beginPath(); ctx.arc(ASSET.x, ASSET.y, 20 + t * ENGAGE_RING_PX, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251,113,133,${(1 - t) * 0.8})`; ctx.lineWidth = 3 * (1 - t) + 1; ctx.stroke();
      }

      // Threat tracks
      for (const t of threats) {
        const col = t.status === 'NEUTRALIZED' ? '#34d399' : t.status === 'LOST' ? '#64748b' : LEVEL_COLOR[t.level];
        const selected = t.id === selectedThreatId;

        if (showTrails && t.trail.length > 1) {
          ctx.beginPath();
          t.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
        }

        // Effector cone from the asset to a disrupting target
        if (t.status === 'DISRUPTING') {
          const ang = Math.atan2(t.y - ASSET.y, t.x - ASSET.x);
          const len = Math.hypot(t.x - ASSET.x, t.y - ASSET.y);
          ctx.beginPath(); ctx.moveTo(ASSET.x, ASSET.y);
          ctx.arc(ASSET.x, ASSET.y, len, ang - 0.12, ang + 0.12); ctx.closePath();
          ctx.fillStyle = 'rgba(251,113,133,0.13)'; ctx.fill();
          ctx.strokeStyle = 'rgba(251,113,133,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
          // progress arc around the target
          ctx.beginPath(); ctx.arc(t.x, t.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.disruptProgress);
          ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2; ctx.stroke();
        }

        // Bearing line from asset for active tracks
        if (t.status === 'TRACKING' || t.status === 'DISRUPTING') {
          ctx.beginPath(); ctx.moveTo(ASSET.x, ASSET.y); ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = `rgba(255,255,255,${selected ? 0.25 : 0.07})`; ctx.lineWidth = 1; ctx.stroke();
        }

        // Track glyph: rotated triangle for heading
        const hd = Math.atan2(t.vy, t.vx);
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(hd);
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-5, -4.5); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.restore();
        // Halo for critical/priority
        if (t.priority || (t.level === 'CRITICAL' && t.status !== 'NEUTRALIZED')) {
          const pulse = 10 + Math.sin(now / 250) * 2;
          ctx.beginPath(); ctx.arc(t.x, t.y, pulse, 0, Math.PI * 2);
          ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (selected) {
          ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1;
          const s = 14;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
            ctx.beginPath(); ctx.moveTo(t.x + sx * s, t.y + sy * (s - 6)); ctx.lineTo(t.x + sx * s, t.y + sy * s); ctx.lineTo(t.x + sx * (s - 6), t.y + sy * s); ctx.stroke();
          });
        }
        // Label: keep it on the board near the edges
        const flip = t.x > MAP_W - 150;
        const lx = flip ? t.x - 12 : t.x + 12;
        const ly = Math.max(t.x < 360 ? 72 : 24, Math.min(MAP_H - 24, t.y)); // clear of the posture strip
        ctx.textAlign = flip ? 'right' : 'left';
        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = 'rgba(248,250,252,0.92)';
        ctx.fillText(t.id, lx, ly - 8);
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = 'rgba(203,213,225,0.7)';
        const range = Math.hypot(t.x - ASSET.x, t.y - ASSET.y) * METERS_PER_PX;
        ctx.fillText(`${range.toFixed(0)} m · ${t.altitudeM.toFixed(0)} m AGL`, lx, ly + 4);
        ctx.fillStyle = col;
        ctx.fillText(t.status === 'DISRUPTING' ? `DISRUPTING ${(t.disruptProgress * 100).toFixed(0)}%` : t.status, lx, ly + 16);
        ctx.textAlign = 'left';
      }

      // Compass + scale
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.fillText('N', MAP_W - 30, 26);
      ctx.beginPath(); ctx.moveTo(MAP_W - 26, 34); ctx.lineTo(MAP_W - 26, 60); ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MAP_W - 30, 40); ctx.lineTo(MAP_W - 26, 32); ctx.lineTo(MAP_W - 22, 40); ctx.stroke();
      const scalePx = 500 / METERS_PER_PX;
      ctx.beginPath(); ctx.moveTo(24, MAP_H - 24); ctx.lineTo(24 + scalePx, MAP_H - 24); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(226,232,240,0.7)'; ctx.stroke();
      ctx.fillText('500 m', 24, MAP_H - 30);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    let best: Threat | null = null, bestD = 28;
    for (const t of propsRef.current.threats) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bestD) { best = t; bestD = d; }
    }
    onSelectThreat(best ? best.id : null);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full h-full block cursor-crosshair"
      style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
      aria-label="Counter-UAS tactical map"
      role="img"
    />
  );
};
