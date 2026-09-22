import React, { useEffect, useRef } from 'react';
import { TelemetryState } from '../../types/droneCockpitTypes';

interface ArtificialHorizonProps {
  telemetry: TelemetryState;
  showGrid?: boolean;
}

export const ArtificialHorizon: React.FC<ArtificialHorizonProps> = ({
  telemetry,
  showGrid = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    const pitch = telemetry.attitude.pitch; // degrees (-90 to +90)
    const roll = telemetry.attitude.roll;   // degrees (-180 to +180)
    const rollRad = (roll * Math.PI) / 180;
    const pixelsPerDegree = height / 50;

    // 1. Draw Rotating Sky & Ground Horizon
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-rollRad);

    const pitchOffset = pitch * pixelsPerDegree;

    // Horizon line
    ctx.beginPath();
    ctx.moveTo(-width, pitchOffset);
    ctx.lineTo(width, pitchOffset);
    ctx.strokeStyle = '#38bdf8'; // Sky cyan
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Pitch ladder rungs (+/- 10, 20, 30 deg)
    const pitchSteps = [-30, -20, -10, 10, 20, 30];
    ctx.lineWidth = 1.5;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    pitchSteps.forEach((deg) => {
      const y = pitchOffset - deg * pixelsPerDegree;
      const rungWidth = Math.abs(deg) % 20 === 0 ? 60 : 36;

      ctx.beginPath();
      if (deg > 0) {
        // Sky rungs: solid lines with downward pips
        ctx.strokeStyle = '#38bdf8';
        ctx.moveTo(-rungWidth / 2, y);
        ctx.lineTo(rungWidth / 2, y);
        ctx.moveTo(-rungWidth / 2, y);
        ctx.lineTo(-rungWidth / 2, y + 5);
        ctx.moveTo(rungWidth / 2, y);
        ctx.lineTo(rungWidth / 2, y + 5);
      } else {
        // Ground rungs: dashed lines with upward pips
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([4, 4]);
        ctx.moveTo(-rungWidth / 2, y);
        ctx.lineTo(rungWidth / 2, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-rungWidth / 2, y);
        ctx.lineTo(-rungWidth / 2, y - 5);
        ctx.moveTo(rungWidth / 2, y);
        ctx.lineTo(rungWidth / 2, y - 5);
      }
      ctx.stroke();

      // Degree label
      ctx.fillText(`${Math.abs(deg)}°`, rungWidth / 2 + 18, y);
      ctx.fillText(`${Math.abs(deg)}°`, -rungWidth / 2 - 18, y);
    });

    ctx.restore();

    // 2. Aircraft Fixed Center Reticle (Boresight)
    ctx.save();
    ctx.translate(cx, cy);

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15'; // Amber gold
    ctx.fill();

    // Wings
    ctx.beginPath();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    // Left wing
    ctx.moveTo(-45, 0);
    ctx.lineTo(-15, 0);
    ctx.lineTo(-15, 6);
    // Right wing
    ctx.moveTo(15, 0);
    ctx.lineTo(45, 0);
    ctx.lineTo(15, 6);
    ctx.stroke();

    ctx.restore();

    // 3. Roll Arc Indicator on Top Rim
    ctx.save();
    ctx.translate(cx, cy);

    const arcRadius = Math.min(width, height) * 0.42;
    ctx.beginPath();
    ctx.arc(0, 0, arcRadius, (Math.PI * 1.25), (Math.PI * 1.75));
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Roll angle tick marks (-45, -30, -20, -10, 0, 10, 20, 30, 45)
    const rollTicks = [-45, -30, -20, -10, 0, 10, 20, 30, 45];
    rollTicks.forEach(tick => {
      const angle = (tick - 90) * (Math.PI / 180);
      const x1 = Math.cos(angle) * arcRadius;
      const y1 = Math.sin(angle) * arcRadius;
      const x2 = Math.cos(angle) * (arcRadius + (tick % 30 === 0 ? 10 : 5));
      const y2 = Math.sin(angle) * (arcRadius + (tick % 30 === 0 ? 10 : 5));

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = tick === 0 ? '#facc15' : 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = tick === 0 ? 2 : 1;
      ctx.stroke();
    });

    // Roll needle pointer (inverting roll angle)
    const needleAngle = (-roll - 90) * (Math.PI / 180);
    const nx = Math.cos(needleAngle) * (arcRadius - 2);
    const ny = Math.sin(needleAngle) * (arcRadius - 2);

    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx - Math.sin(needleAngle) * 6, ny + Math.cos(needleAngle) * 6);
    ctx.lineTo(nx + Math.sin(needleAngle) * 6, ny - Math.cos(needleAngle) * 6);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();

    ctx.restore();

  }, [telemetry]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={320}
      className="w-full h-full pointer-events-none"
    />
  );
};
