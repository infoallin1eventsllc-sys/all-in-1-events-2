import { useState, useEffect, useRef, useCallback } from 'react';
import { LightShowDrone, ShowConductorState, Vector3D } from '../types/lightShowTypes';
import { SHOW_FORMATIONS, CUE_STARTS, SHOW_TOTAL_SECONDS, Spacer, formationPoints, cueAt } from '../data/lightShowFormations';
import { padXY } from '../lightshow/pads';

const PUBLISH_MS = 100;     // React sees the fleet at 10 Hz; the canvas reads `live` every frame
const MAX_SPEED = 11.0;     // m/s, the preview's top speed
const DESCENT_MPS = 2.5;    // abort: straight down, lights out
type Status = ShowConductorState['status'];

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

  // The loop owns these; React gets a copy every PUBLISH_MS. Status changes go through setStatus so the loop sees them at once.
  const live = useRef<LightShowDrone[]>([]);
  const statusRef = useRef<Status>('PRE_FLIGHT');
  const clock = useRef({ t: 0, cue: 0 });
  const spacer = useRef(new Spacer());
  const dirty = useRef(false);

  const publish = useCallback(() => {
    dirty.current = false;
    setDrones(live.current);
    const { t, cue } = clock.current;
    setConductorState(prev => (prev.currentTimeSec === t && prev.activeFormationIndex === cue && prev.status === statusRef.current ? prev : { ...prev, currentTimeSec: t, activeFormationIndex: cue, status: statusRef.current }));
  }, []);
  const setStatus = useCallback((s: Status) => { statusRef.current = s; publish(); }, [publish]);
  const commit = useCallback((next: LightShowDrone[]) => { live.current = next; publish(); }, [publish]);

  // Initialize fleet on launch pads (the show's one launch grid, shared with the export and fleet health)
  const initializeFleet = useCallback((count: number) => {
    const targetPoints = SHOW_FORMATIONS[0].generatePoints(count);
    const newDrones: LightShowDrone[] = [];
    for (let i = 0; i < count; i++) {
      const pad = padXY(i, count);
      const homePos: Vector3D = { x: -pad.x, y: 0, z: pad.y };   // show frame → sim: audience's right is -x, away from them is +z

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
    spacer.current.reset();
    commit(newDrones);
  }, [airborne, commit]);

  useEffect(() => {
    initializeFleet(droneCount);
  }, [droneCount, initializeFleet]);

  // Set active formation: the show clock jumps to that cue, and the tick loop
  // then keeps every target moving with the formation's own animation.
  const selectFormation = useCallback((formationIndex: number) => {
    if (statusRef.current === 'ABORTING' || statusRef.current === 'ABORTED') return;   // nothing takes off again during an abort
    const targetPoints = SHOW_FORMATIONS[formationIndex].generatePoints(live.current.length, 0);
    const onGround = statusRef.current === 'PRE_FLIGHT' || statusRef.current === 'ARMED';
    clock.current = { t: CUE_STARTS[formationIndex] ?? 0, cue: formationIndex };   // cue and clock always agree
    spacer.current.reset();
    commit(live.current.map((d, i) => ({ ...d, targetPosition: { ...targetPoints[i].pos }, targetColor: { ...targetPoints[i].color }, status: onGround ? d.status : 'TRANSITIONING' })));
  }, [commit]);

  // Arm Show Sequence (from pre-flight only)
  const armShow = useCallback(() => {
    if (statusRef.current !== 'PRE_FLIGHT') return;
    live.current = live.current.map(d => ({ ...d, status: 'ARMED' }));
    setStatus('ARMED');
  }, [setStatus]);

  // Emergency Abort: all LEDs extinguish immediately and every aircraft descends straight down, the clock stopped.
  const emergencyAbort = useCallback(() => {
    if (statusRef.current === 'ABORTED') return;
    live.current = live.current.map(d => ({
      ...d,
      status: d.position.y <= 0.05 ? 'LANDED' : 'EMERGENCY_ABORT',
      targetPosition: { x: d.position.x, y: 0, z: d.position.z }, // Land straight down
      color: { r: 0, g: 0, b: 0, w: 0 }, // Lights OUT immediately
      targetColor: { r: 0, g: 0, b: 0, w: 0 },
    }));
    setStatus('ABORTING');
  }, [setStatus]);

  // Transport controls: the show only runs once armed, and only resumes from a hold.
  const togglePlay = useCallback(() => {
    const s = statusRef.current;
    if (s === 'RUNNING') setStatus('PAUSED');
    else if (s === 'ARMED' || s === 'PAUSED') setStatus('RUNNING');
  }, [setStatus]);

  const rewind = useCallback(() => {
    clock.current = { t: 0, cue: 0 };
    statusRef.current = 'PRE_FLIGHT';
    initializeFleet(droneCount);
  }, [droneCount, initializeFleet]);

  const seek = useCallback((timeSec: number) => {
    if (statusRef.current === 'ABORTING' || statusRef.current === 'ABORTED') return;
    const t = Math.max(0, Math.min(SHOW_TOTAL_SECONDS, timeSec)), cue = cueAt(t);
    if (cue !== clock.current.cue) spacer.current.reset();
    clock.current = { t, cue };
    publish();
  }, [publish]);

  // Simulation tick loop (every animation frame); React is updated at PUBLISH_MS.
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now(), lastPublish = 0;

    const loop = (currentTime: number) => {
      const deltaSec = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      const status = statusRef.current, aborting = status === 'ABORTING';

      if (status === 'RUNNING' || aborting) {
        let pts: ReturnType<typeof formationPoints> = [];
        if (!aborting) {
          // Advance the show clock; cues follow it, so the show plays itself.
          // At the end the show starts again from the first cue, so a demo never stalls.
          const c = clock.current, wrapped = c.t + deltaSec >= SHOW_TOTAL_SECONDS;
          const t = wrapped ? 0 : c.t + deltaSec, cue = cueAt(t);
          if (cue !== c.cue) spacer.current.reset();
          clock.current = { t, cue };
          const n = live.current.length;
          pts = n ? formationPoints(SHOW_FORMATIONS[cue], n, t - (CUE_STARTS[cue] ?? 0), spacer.current, deltaSec) : [];
        }

        // Every target moves with the formation's animation; aircraft ease after
        // their targets (a critically damped chase, capped at a real airspeed), so
        // the fleet flows rather than snaps. Aborting aircraft descend straight down.
        const k = 1 - Math.exp(-deltaSec * 2.4);
        let airborneLeft = 0;
        live.current = live.current.map((d0, i) => {
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

          if (d.status === 'EMERGENCY_ABORT') {
            nextY = Math.max(0, nextY - DESCENT_MPS * deltaSec);
            if (nextY <= 0.05) { nextY = 0; nextStatus = 'LANDED'; } else airborneLeft++;
          } else if (d.status === 'LANDED') {
            // on the ground: stays put
          } else if (dist > 0.05) {
            const moveDist = Math.min(dist * k, MAX_SPEED * deltaSec);
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

          // Velocity from the move just made; deviation as an RTK-held aircraft tracks its slot:
          // a few centimetres, more when it is flying fast or on a gusty edge of the envelope.
          const inv = deltaSec > 0 ? 1 / deltaSec : 0;
          const velocity = { x: (nextX - d.position.x) * inv, y: (nextY - d.position.y) * inv, z: (nextZ - d.position.z) * inv };
          const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
          const onGround = nextStatus === 'LANDED' || nextY <= 0.05;
          const devTarget = onGround ? 0.01 : 0.03 + 0.018 * speed + 0.04 * (0.5 + 0.5 * Math.sin(currentTime / 1700 + i * 1.37));
          const deviationMeters = d.deviationMeters + (devTarget - d.deviationMeters) * Math.min(1, deltaSec * 2);

          return {
            ...d,
            position: { x: nextX, y: nextY, z: nextZ },
            velocity,
            deviationMeters,
            color: { r: nextR, g: nextG, b: nextB, w: nextW },
            status: nextStatus,
          };
        });
        dirty.current = true;
        // Everyone down: the abort is over. Rewind resets from here.
        if (aborting && airborneLeft === 0) { statusRef.current = 'ABORTED'; lastPublish = 0; }
      }

      if (dirty.current && currentTime - lastPublish >= PUBLISH_MS) { lastPublish = currentTime; publish(); }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [publish]);

  return {
    droneCount,
    setDroneCount,
    drones,
    /** The fleet as of this animation frame, for the 3D stage (React state lags by up to PUBLISH_MS). */
    liveDrones: live,
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
