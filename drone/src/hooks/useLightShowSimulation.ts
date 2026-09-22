import { useState, useEffect, useRef, useCallback } from 'react';
import { LightShowDrone, ShowConductorState, Vector3D, ColorRGBW } from '../types/lightShowTypes';
import { SHOW_FORMATIONS } from '../data/lightShowFormations';

export function useLightShowSimulation(initialDroneCount = 100) {
  const [droneCount, setDroneCount] = useState<number>(initialDroneCount);
  const [drones, setDrones] = useState<LightShowDrone[]>([]);
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);

  const [conductorState, setConductorState] = useState<ShowConductorState>({
    status: 'PRE_FLIGHT',
    currentTimeSec: 0,
    totalDurationSec: 180, // 3-minute show
    activeFormationIndex: 0,
    syncClockSource: 'GPS_1PPS',
    clockJitterMs: 0.68,
    broadcastPacketLossPct: 0.02,
    allDronesSynced: true,
    minSeparationObservedMeters: 3.2,
  });

  const [showTrajectories, setShowTrajectories] = useState<boolean>(true);
  const [showGeofence, setShowGeofence] = useState<boolean>(true);

  const isRunningRef = useRef<boolean>(false);
  const conductorStateRef = useRef<ShowConductorState>(conductorState);
  const dronesRef = useRef<LightShowDrone[]>([]);

  useEffect(() => {
    conductorStateRef.current = conductorState;
    isRunningRef.current = conductorState.status === 'RUNNING';
  }, [conductorState]);

  useEffect(() => {
    dronesRef.current = drones;
  }, [drones]);

  // Initialize fleet on launch pads
  const initializeFleet = useCallback((count: number) => {
    const formation0 = SHOW_FORMATIONS[0];
    const targetPoints = formation0.generatePoints(count);
    const newDrones: LightShowDrone[] = [];
    const gridCols = Math.ceil(Math.sqrt(count));
    const spacing = 3.5; // 3.5m launch pad grid spacing

    for (let i = 0; i < count; i++) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const homeX = (col - gridCols / 2) * spacing;
      const homeZ = (row - gridCols / 2) * spacing;
      const homePos: Vector3D = { x: homeX, y: 0, z: homeZ };

      newDrones.push({
        id: `DRN-${String(i + 1).padStart(3, '0')}`,
        droneIndex: i,
        position: { ...homePos },
        targetPosition: { ...targetPoints[i].pos },
        homePosition: { ...homePos },
        velocity: { x: 0, y: 0, z: 0 },
        color: { ...targetPoints[i].color },
        targetColor: { ...targetPoints[i].color },
        battery: 97 - (i % 8) * 0.5,
        gpsSatellites: 22 + (i % 4),
        syncOffsetMs: 0.4 + (Math.random() - 0.5) * 0.4,
        status: 'LAUNCH_PAD',
        deviationMeters: 0.02,
        hasCommsSync: true,
      });
    }

    setDrones(newDrones);
    dronesRef.current = newDrones;
  }, []);

  useEffect(() => {
    initializeFleet(droneCount);
  }, [droneCount, initializeFleet]);

  // Set active formation and calculate smooth transitions
  const selectFormation = useCallback((formationIndex: number) => {
    const formation = SHOW_FORMATIONS[formationIndex];
    const targetPoints = formation.generatePoints(dronesRef.current.length);

    setDrones(prev => prev.map((d, i) => {
      const pt = targetPoints[i];
      return {
        ...d,
        targetPosition: { ...pt.pos },
        targetColor: { ...pt.color },
        status: 'TRANSITIONING',
      };
    }));

    setConductorState(prev => ({
      ...prev,
      activeFormationIndex: formationIndex,
    }));
  }, []);

  // Arm Show Sequence
  const armShow = useCallback(() => {
    setConductorState(prev => ({ ...prev, status: 'ARMED' }));
    setDrones(prev => prev.map(d => ({ ...d, status: 'ARMED' })));
  }, []);

  // Emergency Abort: All LEDs extinguish immediately and drones descend straight down
  const emergencyAbort = useCallback(() => {
    setConductorState(prev => ({ ...prev, status: 'ABORTING' }));
    setDrones(prev => prev.map(d => ({
      ...d,
      status: 'EMERGENCY_ABORT',
      targetPosition: { x: d.position.x, y: 0, z: d.position.z }, // Land straight down
      color: { r: 0, g: 0, b: 0, w: 0 }, // Lights OUT immediately
      targetColor: { r: 0, g: 0, b: 0, w: 0 },
    })));
  }, []);

  // Transport controls
  const togglePlay = useCallback(() => {
    setConductorState(prev => {
      const nextStatus = prev.status === 'RUNNING' ? 'PAUSED' : 'RUNNING';
      return { ...prev, status: nextStatus };
    });
  }, []);

  const rewind = useCallback(() => {
    setConductorState(prev => ({
      ...prev,
      currentTimeSec: 0,
      status: 'PRE_FLIGHT',
      activeFormationIndex: 0,
    }));
    initializeFleet(droneCount);
  }, [droneCount, initializeFleet]);

  const seek = useCallback((timeSec: number) => {
    setConductorState(prev => ({ ...prev, currentTimeSec: timeSec }));
  }, []);

  // Simulation Tick Loop (60 FPS)
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const deltaSec = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      if (isRunningRef.current) {
        // Advance show timeline
        setConductorState(prev => {
          const nextTime = prev.currentTimeSec + deltaSec;
          if (nextTime >= prev.totalDurationSec) {
            return { ...prev, currentTimeSec: prev.totalDurationSec, status: 'SHOW_COMPLETE' };
          }
          return { ...prev, currentTimeSec: nextTime };
        });

        // Move drones toward target position and interpolate RGBW colors
        setDrones(prevDrones => {
          const maxSpeed = 5.0; // 5.0 m/s
          return prevDrones.map(d => {
            const dx = d.targetPosition.x - d.position.x;
            const dy = d.targetPosition.y - d.position.y;
            const dz = d.targetPosition.z - d.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            let nextX = d.position.x;
            let nextY = d.position.y;
            let nextZ = d.position.z;
            let nextStatus = d.status;

            if (dist > 0.05) {
              const moveDist = Math.min(dist, maxSpeed * deltaSec);
              nextX += (dx / dist) * moveDist;
              nextY += (dy / dist) * moveDist;
              nextZ += (dz / dist) * moveDist;
              nextStatus = 'TRANSITIONING';
            } else {
              nextStatus = 'IN_FORMATION';
            }

            // Smooth color interpolation
            const colorSpeed = 4.0 * deltaSec;
            const nextR = Math.round(d.color.r + (d.targetColor.r - d.color.r) * colorSpeed);
            const nextG = Math.round(d.color.g + (d.targetColor.g - d.color.g) * colorSpeed);
            const nextB = Math.round(d.color.b + (d.targetColor.b - d.color.b) * colorSpeed);
            const nextW = Math.round(d.color.w + (d.targetColor.w - d.color.w) * colorSpeed);

            return {
              ...d,
              position: { x: nextX, y: nextY, z: nextZ },
              color: { r: nextR, g: nextG, b: nextB, w: nextW },
              status: nextStatus,
            };
          });
        });
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return {
    droneCount,
    setDroneCount,
    drones,
    selectedDroneId,
    setSelectedDroneId,
    conductorState,
    togglePlay,
    rewind,
    seek,
    selectFormation,
    armShow,
    emergencyAbort,
    showTrajectories,
    setShowTrajectories,
    showGeofence,
    setShowGeofence,
  };
}
