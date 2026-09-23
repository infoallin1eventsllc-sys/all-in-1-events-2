import { useState, useEffect, useRef, useCallback } from 'react';
import { LightShowDrone, ShowConductorState, Vector3D} from '../types/lightShowTypes';
import { SHOW_FORMATIONS, CUE_STARTS, SHOW_TOTAL_SECONDS } from '../data/lightShowFormations';

/** `airborne`: start with the fleet already in the first formation (the Overview hero), not on the pads. */
export function useLightShowSimulation(initialDroneCount = 100, airborne = false) {
  const [droneCount, setDroneCount] = useState<number>(initialDroneCount);
  const [drones, setDrones] = useState<LightShowDrone[]>([]);
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);

  const [conductorState, setConductorState] = useState<ShowConductorState>({
    status: 'PRE_FLIGHT',
    currentTimeSec: 0,
    totalDurationSec: SHOW_TOTAL_SECONDS,
    activeFormationIndex: 0,
    syncClockSource: 'GPS_1PPS',
    clockJitterMs: 0.68,
    broadcastPacketLossPct: 0.02,
    allDronesSynced: true,
    minSeparationObservedMeters: 3.2,
  });

  const [showTrajectories, setShowTrajectories] = useState<boolean>(false);
  const [showGeofence, setShowGeofence] = useState<boolean>(false);

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
        position: airborne ? { ...targetPoints[i].pos } : { ...homePos },
        targetPosition: { ...targetPoints[i].pos },
        homePosition: { ...homePos },
        velocity: { x: 0, y: 0, z: 0 },
        color: { ...targetPoints[i].color },
        targetColor: { ...targetPoints[i].color },
        battery: 97 - (i % 8) * 0.5,
        gpsSatellites: 22 + (i % 4),
        syncOffsetMs: 0.4 + (Math.random() - 0.5) * 0.4,
        status: airborne ? 'IN_FORMATION' : 'LAUNCH_PAD',
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

  // Set active formation: the show clock jumps to that cue, and the tick loop
  // then keeps every target moving with the formation's own animation.
  const selectFormation = useCallback((formationIndex: number) => {
    const formation = SHOW_FORMATIONS[formationIndex];
    const targetPoints = formation.generatePoints(dronesRef.current.length, 0);

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
      currentTimeSec: prev.status === 'PRE_FLIGHT' || prev.status === 'ARMED' ? prev.currentTimeSec : CUE_STARTS[formationIndex] ?? prev.currentTimeSec,
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
        // Advance the show clock; cues follow it, so the show plays itself.
        // At the end the show starts again from the first cue, so a demo never stalls.
        const cs = conductorStateRef.current;
        const wrapped = cs.currentTimeSec + deltaSec >= cs.totalDurationSec;
        const nextTime = wrapped ? 0 : cs.currentTimeSec + deltaSec;
        let cue = wrapped ? 0 : cs.activeFormationIndex;
        while (cue + 1 < SHOW_FORMATIONS.length && nextTime >= CUE_STARTS[cue + 1]) cue++;
        setConductorState(prev => ({ ...prev, currentTimeSec: nextTime, activeFormationIndex: cue }));

        // Every target moves with the formation's animation; aircraft ease after
        // their targets (a critically damped chase, capped at a real airspeed), so
        // the fleet flows rather than snaps.
        const tCue = nextTime - (CUE_STARTS[cue] ?? 0);
        const formation = SHOW_FORMATIONS[cue];
        const n = dronesRef.current.length;
        const pts = n ? formation.generatePoints(n, tCue) : [];
        setDrones(prevDrones => {
          const maxSpeed = 11.0;
          const k = 1 - Math.exp(-deltaSec * 2.4);
          return prevDrones.map((d0, i) => {
            const pt = pts[i];
            const d = pt && d0.status !== 'EMERGENCY_ABORT' && d0.status !== 'LANDED' ? { ...d0, targetPosition: pt.pos, targetColor: pt.color } : d0;
            const dx = d.targetPosition.x - d.position.x;
            const dy = d.targetPosition.y - d.position.y;
            const dz = d.targetPosition.z - d.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            let nextX = d.position.x;
            let nextY = d.position.y;
            let nextZ = d.position.z;
            let nextStatus = d.status;

            if (dist > 0.05) {
              const moveDist = Math.min(dist * k, maxSpeed * deltaSec);
              nextX += (dx / dist) * moveDist;
              nextY += (dy / dist) * moveDist;
              nextZ += (dz / dist) * moveDist;
              nextStatus = dist > 1.5 ? 'TRANSITIONING' : 'IN_FORMATION';
            } else {
              nextStatus = 'IN_FORMATION';
            }

            // Smooth color interpolation
            const colorSpeed = Math.min(1, 6.0 * deltaSec);
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
