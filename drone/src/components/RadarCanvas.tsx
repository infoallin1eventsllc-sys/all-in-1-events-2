import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DroneState, Task, NetworkTopology } from '../types';
import { GroundStationTower, CHARGING_HUBS } from '../hooks/useSwarmSimulation';
import { Layers, Radio, Eye, Crosshair, Plus, ShieldAlert } from 'lucide-react';

interface RadarCanvasProps {
  drones: DroneState[];
  tasks: Task[];
  towers: GroundStationTower[];
  topology: NetworkTopology;
  selectedDroneId: string | null;
  onSelectDrone: (droneId: string | null) => void;
  onSpawnTaskAtCoord: (x: number, y: number) => void;
}

export const RadarCanvas: React.FC<RadarCanvasProps> = ({
  drones,
  tasks,
  towers,
  selectedDroneId,
  onSelectDrone,
  onSpawnTaskAtCoord,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Layer Visibility Toggles
  const [showMeshLinks, setShowMeshLinks] = useState<boolean>(true);
  const [showGcsCoverage, setShowGcsCoverage] = useState<boolean>(true);
  const [showFlightCorridors, setShowFlightCorridors] = useState<boolean>(true);
  const [showSafetyBubbles, setShowSafetyBubbles] = useState<boolean>(true);
  const [showAltitudeHeatmap] = useState<boolean>(false);
  const [clickToSpawnMode, setClickToSpawnMode] = useState<boolean>(false);

  // Mouse hover state for coordinate crosshairs
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    const width = 920;
    const height = 700;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 1. Dark Tactical Background & Grid
    ctx.fillStyle = '#090d16'; // Deep aerospace obsidian
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Sector Dividers
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sector Labels
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.fillText('SECTOR 01 [NORTH-WEST]', 16, 24);
    ctx.fillText('SECTOR 02 [NORTH-EAST]', width / 2 + 16, 24);
    ctx.fillText('SECTOR 03 [SOUTH-WEST]', 16, height / 2 + 24);
    ctx.fillText('SECTOR 04 [SOUTH-EAST]', width / 2 + 16, height / 2 + 24);

    // 2. Ground Station Towers & RF Coverage Cones
    if (showGcsCoverage) {
      towers.forEach(tower => {
        // Range radius circle
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, tower.rangeMeters, 0, Math.PI * 2);
        if (tower.active) {
          ctx.fillStyle = 'rgba(14, 165, 233, 0.04)';
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)';
        } else {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        }
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tower Icon Marker
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = tower.active ? '#0284c7' : '#ef4444';
        ctx.fill();

        // Ring pulse
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = tower.active ? 'rgba(56, 189, 248, 0.5)' : 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = tower.active ? '#38bdf8' : '#f87171';
        ctx.fillText(tower.name, tower.x - 40, tower.y + 24);
        ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = tower.active ? '#94a3b8' : '#fca5a5';
        ctx.fillText(tower.active ? 'CELLULAR / RF UPLINK [OK]' : 'UPLINK SEVERED [OFFLINE]', tower.x - 40, tower.y + 34);
      });
    }

    // 3. Charging Base Pads
    CHARGING_HUBS.forEach(hub => {
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.fill();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.fillText(hub.name, hub.x - 22, hub.y - 12);
      ctx.font = '8px ui-sans-serif, system-ui';
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('4x FAST-PADS', hub.x - 24, hub.y + 18);
    });

    // 4. Draw Mesh Links Between Drones
    if (showMeshLinks) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      const droneMap = new Map(drones.map(d => [d.id, d]));

      drones.forEach(d => {
        if (d.meshConnectedTo.length > 0) {
          d.meshConnectedTo.forEach(neighborId => {
            const neighbor = droneMap.get(neighborId);
            if (neighbor && neighbor.id > d.id) { // Avoid duplicate lines
              ctx.beginPath();
              ctx.moveTo(d.x, d.y);
              ctx.lineTo(neighbor.x, neighbor.y);
              ctx.stroke();
            }
          });
        }
      });
    }

    // 5. Draw Flight Corridors & Waypoint Vectors
    if (showFlightCorridors) {
      drones.forEach(d => {
        if (d.status === 'TRANSIT' || d.status === 'ON_TASK' || d.status === 'RTH') {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.targetX, d.targetY);

          if (d.status === 'RTH') {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.setLineDash([3, 3]);
          } else {
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
            ctx.setLineDash([4, 4]);
          }
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }

    // 6. Draw Mission Tasks / Waypoints
    tasks.forEach(task => {
      if (task.status === 'COMPLETED') return;

      const isPending = task.status === 'PENDING_AUCTION';
      const isCritical = task.priority === 'CRITICAL';

      // Pulse circle
      ctx.beginPath();
      ctx.arc(task.x, task.y, isCritical ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isCritical 
        ? 'rgba(239, 68, 68, 0.2)' 
        : isPending 
          ? 'rgba(234, 179, 8, 0.2)' 
          : 'rgba(16, 185, 129, 0.2)';
      ctx.fill();

      // Core Target Icon
      ctx.beginPath();
      ctx.arc(task.x, task.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = isCritical ? '#ef4444' : isPending ? '#eab308' : '#10b981';
      ctx.fill();

      // Progress Arc for active tasks
      if (task.status === 'IN_PROGRESS' && task.progress > 0) {
        ctx.beginPath();
        ctx.arc(task.x, task.y, 12, -Math.PI / 2, -Math.PI / 2 + (task.progress / 100) * Math.PI * 2);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.fillStyle = isCritical ? '#fca5a5' : isPending ? '#fef08a' : '#a7f3d0';
      ctx.fillText(task.title.slice(0, 24), task.x + 14, task.y + 3);

      ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(
        isPending ? `[AUCTIONING ${task.priority}]` : `[${Math.round(task.progress)}% COMPLETED]`,
        task.x + 14,
        task.y + 13
      );
    });

    // 7. Draw Drones (100–500 units)
    drones.forEach(drone => {
      const isSelected = drone.id === selectedDroneId;
      const isAirborne = drone.status !== 'IDLE' && drone.status !== 'CHARGING';

      // Altitude heatmap glow or safety bubble
      if (showSafetyBubbles && drone.localAvoidanceActive) {
        // ORCA Collision Avoidance Active ring!
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Draw avoidance evasion vector
        if (drone.avoidanceVector) {
          ctx.beginPath();
          ctx.moveTo(drone.x, drone.y);
          ctx.lineTo(drone.x + drone.avoidanceVector.dx * 1.5, drone.y + drone.avoidanceVector.dy * 1.5);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Altitude color gradient if enabled
      let droneColor = '#38bdf8'; // Default Cyan
      if (drone.status === 'ON_TASK') droneColor = '#34d399'; // Emerald
      else if (drone.status === 'RTH') droneColor = '#fbbf24'; // Amber
      else if (drone.status === 'COMM_LOST') droneColor = '#c084fc'; // Purple Dead Reckoning
      else if (drone.status === 'EMERGENCY_LAND') droneColor = '#f87171'; // Red
      else if (drone.status === 'CHARGING') droneColor = '#10b981'; // Green
      else if (drone.status === 'IDLE') droneColor = '#64748b'; // Slate

      if (showAltitudeHeatmap && isAirborne) {
        // Altitude range 10m - 70m
        const altNorm = Math.min(1, Math.max(0, (drone.z - 10) / 60));
        droneColor = `hsl(${220 - altNorm * 180}, 85%, 60%)`;
      }

      ctx.save();
      ctx.translate(drone.x, drone.y);

      // Rotate canvas by heading
      const rad = (drone.heading * Math.PI) / 180;
      ctx.rotate(rad);

      // Drone Chevron Body
      ctx.beginPath();
      ctx.moveTo(7, 0); // Nose tip
      ctx.lineTo(-5, -5); // Left wing
      ctx.lineTo(-2, 0); // Inner notch
      ctx.lineTo(-5, 5); // Right wing
      ctx.closePath();

      ctx.fillStyle = droneColor;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(15, 23, 42, 0.8)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Velocity trail
      if (drone.speed > 0.5) {
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-5 - Math.min(16, drone.speed * 2), 0);
        ctx.strokeStyle = droneColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      // Selection Halo
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Detailed On-Screen Tag for Selected Unit
        ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${drone.callsign} [${drone.status}]`, drone.x + 18, drone.y - 12);
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`ALT: ${drone.z.toFixed(0)}m | SPD: ${drone.speed.toFixed(1)}m/s | BAT: ${drone.battery.toFixed(0)}%`, drone.x + 18, drone.y);
      }
    });

    // 8. Crosshair overlay if hovering in spawn mode
    if (clickToSpawnMode && mousePos) {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height);
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(width, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#eab308';
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`CLICK TO SPAWN TASK [${Math.round(mousePos.x)}, ${Math.round(mousePos.y)}]`, mousePos.x + 12, mousePos.y - 10);
    }

  }, [
    drones,
    tasks,
    towers,
    selectedDroneId,
    showMeshLinks,
    showGcsCoverage,
    showFlightCorridors,
    showSafetyBubbles,
    showAltitudeHeatmap,
    clickToSpawnMode,
    mousePos
  ]);

  // Handle Canvas Click (Select Drone or Spawn Task)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = 920 / rect.width;
    const scaleY = 700 / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    if (clickToSpawnMode) {
      onSpawnTaskAtCoord(clickX, clickY);
      setClickToSpawnMode(false);
      return;
    }

    // Check if clicked near a drone (hit test within 18px)
    let closestDrone: DroneState | null = null;
    let closestDist = 20;

    drones.forEach(d => {
      const dx = d.x - clickX;
      const dy = d.y - clickY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestDrone = d;
      }
    });

    if (closestDrone) {
      onSelectDrone((closestDrone as DroneState).id);
    } else {
      onSelectDrone(null);
    }
  }, [clickToSpawnMode, drones, onSelectDrone, onSpawnTaskAtCoord]);

  // Track mouse coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 920 / rect.width;
    const scaleY = 700 / rect.height;
    setMousePos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    });
  };

  return (
    <div id="radar-canvas-container" ref={containerRef} className="relative w-full rounded-xl bg-slate-950 border border-slate-800/80 overflow-hidden shadow-2xl flex flex-col">
      {/* Top Tactical Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-300 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono font-semibold tracking-wider text-slate-100 uppercase">AIRSPACE RADAR</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="font-mono text-slate-400">UNITS: <strong className="text-sky-400">{drones.length}</strong></span>
          <span className="text-slate-500">|</span>
          <span className="font-mono text-slate-400">ACTIVE MISSIONS: <strong className="text-emerald-400">{tasks.filter(t => t.status === 'IN_PROGRESS').length}</strong></span>
        </div>

        {/* Tactical Layer Toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            id="toggle-mesh-links"
            onClick={() => setShowMeshLinks(!showMeshLinks)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 border ${
              showMeshLinks 
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Ad-Hoc 802.11s P2P Mesh Connectivity Overlay"
          >
            <Radio className="w-3 h-3" />
            <span>Mesh Links</span>
          </button>

          <button
            id="toggle-gcs-coverage"
            onClick={() => setShowGcsCoverage(!showGcsCoverage)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 border ${
              showGcsCoverage 
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Ground Station Towers RF coverage"
          >
            <Layers className="w-3 h-3" />
            <span>GCS Towers</span>
          </button>

          <button
            id="toggle-corridors"
            onClick={() => setShowFlightCorridors(!showFlightCorridors)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 border ${
              showFlightCorridors 
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Trajectory Lines to Destination"
          >
            <Eye className="w-3 h-3" />
            <span>Corridors</span>
          </button>

          <button
            id="toggle-orca-bubbles"
            onClick={() => setShowSafetyBubbles(!showSafetyBubbles)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 border ${
              showSafetyBubbles 
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Highlight Real-time ORCA Collision Avoidance Overrides"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>ORCA Evasion</span>
          </button>

          <button
            id="toggle-spawn-mode"
            onClick={() => setClickToSpawnMode(!clickToSpawnMode)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1 border ${
              clickToSpawnMode 
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 animate-pulse' 
                : 'bg-slate-800/70 text-amber-300 border-amber-500/40 hover:bg-amber-500/10'
            }`}
            title="Click anywhere on the radar map to drop a new waypoint and trigger Market Auction"
          >
            <Plus className="w-3 h-3" />
            <span>{clickToSpawnMode ? 'Targeting Active' : 'Click to Task'}</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[92/70] max-h-[640px] bg-slate-950 overflow-hidden cursor-crosshair">
        <canvas
          id="airspace-radar-canvas"
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMousePos(null)}
          className="w-full h-full object-contain block"
        />

        {/* Legend Overlay at bottom left */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[11px] text-slate-300 shadow-lg pointer-events-none flex flex-wrap gap-x-4 gap-y-1.5 max-w-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-sky-400 rounded-sm"></span>
            <span>Transit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm"></span>
            <span>On Mission</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-amber-400 rounded-sm"></span>
            <span>RTH / Low Bat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm"></span>
            <span>ORCA Evasion</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-purple-400 rounded-sm"></span>
            <span>Dead Reckoning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-slate-500 rounded-sm"></span>
            <span>On Pad / Charge</span>
          </div>
        </div>

        {/* Instruction Badge when spawn mode active */}
        {clickToSpawnMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-mono font-bold text-xs px-4 py-1.5 rounded-full shadow-xl flex items-center gap-2 pointer-events-none animate-bounce">
            <Crosshair className="w-4 h-4" />
            <span>CLICK ANYWHERE ON AIRSPACE TO DISPATCH TASK & TRIGGER MARKET AUCTION</span>
          </div>
        )}
      </div>
    </div>
  );
};
