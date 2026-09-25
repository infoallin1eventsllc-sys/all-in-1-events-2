import React, { useRef, useEffect, useState } from 'react';
import { TelemetryState, AudioStreamState } from '../../types/droneCockpitTypes';
import { ArtificialHorizon } from './ArtificialHorizon';
import { 
  Maximize2, 
  Minimize2, 
  Crosshair, 
  Radio, 
  VideoOff, 
  RotateCcw
} from 'lucide-react';

interface VideoStreamHUDProps {
  telemetry: TelemetryState;
  audioState: AudioStreamState;
  onSetCameraMode: (mode: TelemetryState['payload']['cameraSensorMode']) => void;
  onSetZoom: (zoom: number) => void;
  onGimbalMove?: (pitchDelta: number, yawDelta: number) => void;
}

export const VideoStreamHUD: React.FC<VideoStreamHUDProps> = ({
  telemetry,
  audioState,
  onSetCameraMode,
  onSetZoom,
  onGimbalMove,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasSimRef = useRef<HTMLCanvasElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showHUDOverlay, setShowHUDOverlay] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recSeconds, setRecSeconds] = useState<number>(142);
  const [isDraggingGimbal, setIsDraggingGimbal] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const isLinkLost = telemetry.link.quality === 'LINK_LOST';
  const isDegraded = telemetry.link.quality === 'DEGRADED';

  // Recording counter effect
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setRecSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const formatRecTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Gimbal Drag interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDraggingGimbal(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingGimbal || !onGimbalMove) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      onGimbalMove(dy * -0.15, dx * 0.15);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingGimbal(false);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.error(err));
      setIsFullscreen(false);
    }
  };

  // Canvas-based Simulated Aerial Camera Feed (with synthetic horizon, terrain landscape, thermal color mapping)
  useEffect(() => {
    const canvas = canvasSimRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let frameCount = 0;

    const render = () => {
      frameCount++;
      const w = canvas.width;
      const h = canvas.height;

      // If Link is Lost, render static TV snow noise
      if (isLinkLost) {
        const imgData = ctx.createImageData(w, h);
        const buffer = new Uint32Array(imgData.data.buffer);
        for (let i = 0; i < buffer.length; i++) {
          const gray = Math.floor(Math.random() * 80) + 15;
          buffer[i] = (255 << 24) | (gray << 16) | (gray << 8) | gray;
        }
        ctx.putImageData(imgData, 0, 0);

        // Flash glitch bar
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fillRect(0, (frameCount * 8) % h, w, 20);
        return;
      }

      // Base synthetic aerial landscape
      const pitchOffset = (telemetry.attitude.pitch / 90) * (h / 3);
      const rollRad = (telemetry.attitude.roll * Math.PI) / 180;

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rollRad);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, -h, 0, pitchOffset);
      if (telemetry.payload.cameraSensorMode === 'THERMAL_WHITE_HOT') {
        skyGrad.addColorStop(0, '#111827');
        skyGrad.addColorStop(1, '#374151');
      } else if (telemetry.payload.cameraSensorMode === 'THERMAL_IRONBOW') {
        skyGrad.addColorStop(0, '#0a0a23');
        skyGrad.addColorStop(1, '#4b0082');
      } else if (telemetry.payload.cameraSensorMode === 'NIGHT_VISION') {
        skyGrad.addColorStop(0, '#022c22');
        skyGrad.addColorStop(1, '#065f46');
      } else {
        skyGrad.addColorStop(0, '#0f172a');
        skyGrad.addColorStop(1, '#1e293b');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(-w, -h, w * 2, h + pitchOffset);

      // Ground gradient
      const groundGrad = ctx.createLinearGradient(0, pitchOffset, 0, h);
      if (telemetry.payload.cameraSensorMode === 'THERMAL_WHITE_HOT') {
        groundGrad.addColorStop(0, '#4b5563');
        groundGrad.addColorStop(1, '#9ca3af');
      } else if (telemetry.payload.cameraSensorMode === 'THERMAL_IRONBOW') {
        groundGrad.addColorStop(0, '#8b0000');
        groundGrad.addColorStop(0.5, '#ff4500');
        groundGrad.addColorStop(1, '#ffd700');
      } else if (telemetry.payload.cameraSensorMode === 'NIGHT_VISION') {
        groundGrad.addColorStop(0, '#064e3b');
        groundGrad.addColorStop(1, '#10b981');
      } else {
        groundGrad.addColorStop(0, '#14532d');
        groundGrad.addColorStop(1, '#052e16');
      }
      ctx.fillStyle = groundGrad;
      ctx.fillRect(-w, pitchOffset, w * 2, h * 2);

      // Perspective grid lines on ground
      ctx.strokeStyle = telemetry.payload.cameraSensorMode === 'NIGHT_VISION' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let x = -w; x <= w; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, pitchOffset);
        ctx.lineTo(x * 2.5, h);
        ctx.stroke();
      }

      // Simulated thermal hot targets / buildings
      const targets = [
        { x: -140, y: pitchOffset + 40, label: 'TGT-ALPHA (HOT: 38.4°C)' },
        { x: 180, y: pitchOffset + 75, label: 'VEHICLE-02 (HEAT SIG: HIGH)' },
      ];

      targets.forEach(tgt => {
        ctx.fillStyle = telemetry.payload.cameraSensorMode.includes('THERMAL') ? '#ffffff' : '#f59e0b';
        ctx.fillRect(tgt.x, tgt.y, 24, 16);
        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(tgt.x - 4, tgt.y - 4, 32, 24);
      });

      ctx.restore();

      // Degraded quality artifacts (JPEG / blockiness macroblocking)
      if (isDegraded) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
        ctx.fillRect(0, 0, w, h);
        if (frameCount % 12 === 0) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(0, (frameCount * 15) % h, w, 12);
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [telemetry, isLinkLost, isDegraded]);

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center select-none ${
        isDraggingGimbal ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      title="Click and drag to steer the 3-axis EO/IR gimbal camera"
    >
      {/* 1. Underlying Video / Canvas Render Stage */}
      <canvas
        ref={canvasSimRef}
        width={960}
        height={540}
        className="w-full h-full object-cover"
      />

      {/* 2. Lost Link Warning Overlay */}
      {isLinkLost && (
        <div className="absolute inset-0 bg-red-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30 animate-pulse">
          <div className="p-4 rounded-full bg-rose-600/30 border border-rose-500 mb-3">
            <VideoOff className="w-12 h-12 text-rose-400" />
          </div>
          <h2 className="text-xl font-bold font-mono tracking-widest text-rose-200">
            VIDEO &amp; TELEMETRY LINK SEVERED
          </h2>
          <p className="text-xs font-mono text-rose-300/80 mt-1 max-w-md">
            No RTP/SRTP frames received for &gt;1,500ms. Failsafe activated: PX4 autonomous Return-to-Home engaged.
          </p>
          <div className="mt-4 px-3 py-1 rounded bg-rose-900/60 border border-rose-700 text-xs font-mono text-rose-100">
            AUTO-RECONNECTING VIA WEBRTC ICE RESTART...
          </div>
        </div>
      )}

      {/* 3. Primary HUD Overlay Graphics */}
      {showHUDOverlay && !isLinkLost && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10 font-mono text-xs text-sky-400">
          
          {/* Top Bar: Heading Compass Ribbon, Camera Meta, DVR REC & WebRTC status */}
          <div className="flex items-start justify-between w-full">
            
            {/* Camera Optical Mode, Zoom & DVR REC Toggle */}
            <div className="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-sky-900/60">
              <span className="text-[10px] font-bold tracking-wider text-slate-300">
                SENSOR:
              </span>
              <span className="text-[10px] font-bold text-sky-300">
                {telemetry.payload.cameraSensorMode.replace('_', ' ')}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-amber-400 font-bold border border-sky-800">
                {telemetry.payload.cameraZoom.toFixed(1)}X
              </span>

              {/* Real-time DVR Recording Status */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRecording(!isRecording);
                }}
                className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1.5 transition-colors ${
                  isRecording 
                    ? 'bg-rose-950 border-rose-600 text-rose-300 animate-pulse' 
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle GCS DVR Video Recording"
              >
                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-rose-500' : 'bg-slate-500'}`} />
                <span>{isRecording ? `REC ${formatRecTime(recSeconds)}` : 'DVR REC'}</span>
              </button>
            </div>

            {/* Heading Compass Tape (Centered) */}
            <div className="flex flex-col items-center">
              <div className="bg-black/60 backdrop-blur-md px-4 py-1 rounded-xl border border-sky-900/60 flex items-center gap-3">
                <span className="text-[10px] text-slate-400">HDG</span>
                <span className="text-sm font-bold text-amber-300">
                  {Math.round(telemetry.attitude.yaw).toString().padStart(3, '0')}°
                </span>
                <span className="text-[10px] font-bold text-sky-400">
                  {telemetry.attitude.yaw >= 315 || telemetry.attitude.yaw < 45 ? 'N' : telemetry.attitude.yaw < 135 ? 'E' : telemetry.attitude.yaw < 225 ? 'S' : 'W'}
                </span>
              </div>
              <div className="w-1 h-2 bg-amber-400 mt-0.5" />
            </div>

            {/* Live WebRTC Ingest FPS & Latency */}
            <div className="bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-sky-900/60 flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-bold">LIVE WebRTC</span>
              </div>
              <span className="text-slate-500">|</span>
              <span className="text-[10px] text-slate-300">60 FPS</span>
              <span className="text-slate-500">|</span>
              <span className="text-[10px] text-sky-400">{telemetry.link.rttLatencyMs} ms</span>
            </div>
          </div>

          {/* Center: Artificial Horizon, Crosshairs & LRF Distance */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 relative">
              <ArtificialHorizon telemetry={telemetry} />
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/75 px-2.5 py-0.5 rounded border border-sky-500/40 text-[9px] text-sky-300 font-mono whitespace-nowrap">
                LRF: 84.6m | GIMBAL: {telemetry.payload.gimbalPitchDeg.toFixed(0)}°P / {telemetry.payload.gimbalYawDeg.toFixed(0)}°Y
              </div>
            </div>
          </div>

          {/* Left Vertical Airspeed Tape & Right Altitude Tape */}
          <div className="flex justify-between items-center w-full px-2">
            {/* Speed Tape (Left) */}
            <div className="bg-black/60 backdrop-blur-md p-2 rounded-xl border border-sky-900/60 text-center w-20">
              <div className="text-[9px] text-slate-400">SPD (km/h)</div>
              <div className="text-lg font-bold text-slate-100">
                {(telemetry.velocity.groundSpeedMs * 3.6).toFixed(0)}
              </div>
              <div className="text-[9px] text-sky-400">
                {telemetry.velocity.groundSpeedMs.toFixed(1)} m/s
              </div>
            </div>

            {/* Altitude Tape (Right) */}
            <div className="bg-black/60 backdrop-blur-md p-2 rounded-xl border border-sky-900/60 text-center w-20">
              <div className="text-[9px] text-slate-400">ALT (AGL)</div>
              <div className="text-lg font-bold text-amber-300">
                {telemetry.gps.altitudeAglMeters.toFixed(1)}m
              </div>
              <div className="text-[9px] text-slate-400">
                MSL: {telemetry.gps.altitudeMslMeters.toFixed(0)}m
              </div>
            </div>
          </div>

          {/* Bottom Bar: Quick Camera Controls, Zoom Sliders, & Audio Uplink Pill */}
          <div className="flex items-center justify-between w-full pt-2">
            
            {/* Camera sensor switchers */}
            <div className="pointer-events-auto flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-slate-800">
              {(['RGB_4K', 'THERMAL_WHITE_HOT', 'THERMAL_IRONBOW', 'NIGHT_VISION'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onSetCameraMode(mode)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                    telemetry.payload.cameraSensorMode === mode
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {mode === 'RGB_4K' ? 'RGB' : mode === 'THERMAL_WHITE_HOT' ? 'White-Hot' : mode === 'THERMAL_IRONBOW' ? 'Ironbow' : 'Night'}
                </button>
              ))}
            </div>

            {/* Zoom Steppers & Gimbal Center */}
            <div className="pointer-events-auto flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-xl border border-slate-800 text-[10px]">
              <span className="text-slate-400 mr-0.5">ZOOM:</span>
              {[1.0, 2.0, 4.0, 8.0].map((z) => (
                <button
                  key={z}
                  onClick={() => onSetZoom(z)}
                  className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                    Math.abs(telemetry.payload.cameraZoom - z) < 0.1
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {z}x
                </button>
              ))}
              {onGimbalMove && (
                <button
                  onClick={() => {
                    onGimbalMove(-telemetry.payload.gimbalPitchDeg - 15, -telemetry.payload.gimbalYawDeg);
                  }}
                  className="ml-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center gap-0.5"
                  title="Center Gimbal Orientation"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>CTR</span>
                </button>
              )}
            </div>

            {/* PA Active Banner if operator is broadcasting */}
            {(audioState.uplinkPttActive || audioState.uplinkOpenMic) && (
              <div className="bg-rose-600/90 text-white px-3 py-1 rounded-xl font-bold flex items-center gap-2 animate-bounce border border-rose-400 shadow-lg">
                <Radio className="w-3.5 h-3.5 animate-spin" />
                <span>DRONE PA SPEAKER LIVE</span>
              </div>
            )}

            {/* Viewport Toggles: Fullscreen & HUD toggle */}
            <div className="pointer-events-auto flex items-center gap-1.5 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setShowHUDOverlay(!showHUDOverlay)}
                className={`p-1.5 rounded transition-colors ${showHUDOverlay ? 'text-sky-400 bg-sky-950/60' : 'text-slate-500'}`}
                title="Toggle HUD Crosshair & Flight Tapes"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
