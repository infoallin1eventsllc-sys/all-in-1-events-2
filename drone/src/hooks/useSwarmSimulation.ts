import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  DroneState, 
  Task, 
  AlertEvent, 
  FleetMetrics, 
  NetworkTopology, 
  TaskType, 
  TaskPriority,
  SecurityProtocolStatus,
  DatabaseEngineType,
  DatabaseMetrics,
  GazeboSITLConfig 
} from '../types';

export interface GroundStationTower {
  id: string;
  name: string;
  x: number;
  y: number;
  rangeMeters: number;
  active: boolean;
}

export const GROUND_STATIONS: GroundStationTower[] = [
  { id: 'GCS-NORTH', name: 'Alpha Tower (North Sector)', x: 250, y: 120, rangeMeters: 280, active: true },
  { id: 'GCS-SOUTH', name: 'Bravo Tower (South Sector)', x: 650, y: 550, rangeMeters: 300, active: true },
  { id: 'GCS-BASE', name: 'Command HQ (Central Hub)', x: 450, y: 350, rangeMeters: 340, active: true },
];

export const CHARGING_HUBS = [
  { id: 'PAD-ALPHA', name: 'Alpha Pad', x: 120, y: 120 },
  { id: 'PAD-BRAVO', name: 'Bravo Pad', x: 800, y: 120 },
  { id: 'PAD-CHARLIE', name: 'Charlie Pad', x: 120, y: 580 },
  { id: 'PAD-DELTA', name: 'Delta Pad', x: 800, y: 580 },
];

const MISSION_TYPES: TaskType[] = [
  'SURVEILLANCE',
  'INSPECTION',
  'PACKAGE_DELIVERY',
  'SEARCH_RESCUE',
  'PERIMETER_PATROL'
];

export function useSwarmSimulation(initialDroneCount: number = 100) {
  const [droneCount, setDroneCount] = useState<number>(initialDroneCount);
  const [topology, setTopology] = useState<NetworkTopology>('HYBRID_MESH');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  
  // Real-time states
  const [drones, setDrones] = useState<DroneState[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [towers, setTowers] = useState<GroundStationTower[]>(GROUND_STATIONS);

  // Security Protocol State (DTLS 1.3 / mTLS / Hardware Crypto)
  const [securityStatus, setSecurityStatus] = useState<SecurityProtocolStatus>({
    encryptionEnabled: true,
    protocol: 'DTLS_1_3',
    cipherSuite: 'TLS_AES_128_GCM_SHA256',
    mTLSCertificateValid: true,
    antiReplayActive: true,
    mitmAttemptsBlocked: 14,
    rogueDronesRejected: 3,
    replayAttacksNeutralized: 8,
  });

  // Scalable Database Metrics State
  const [databaseEngine, setDatabaseEngine] = useState<DatabaseEngineType>('TIMESCALE_POSTGRES');
  const [databaseMetrics, setDatabaseMetrics] = useState<DatabaseMetrics>({
    engine: 'TIMESCALE_POSTGRES',
    writeRatePerSec: 10240,
    queryLatencyP95Ms: 1.2,
    storageCompactionRatio: '91.8% (Gorilla + Delta)',
    activePartitions: 32,
    totalRecordsLogged: 1489200
  });

  // Gazebo SITL Multi-Vehicle Simulation Configuration
  const [isSITLMode, setIsSITLMode] = useState<boolean>(false);
  const [sitlConfig, setSitlConfig] = useState<GazeboSITLConfig>({
    active: false,
    physicsEngine: 'ODE',
    realtimeFactor: 1.0,
    windSpeedMps: 4.5,
    windHeadingDeg: 245,
    sensorNoiseEnabled: true,
    ros2BridgeConnected: true,
    lockstepSyncLagMs: 2.1
  });
  
  // Internal mutable ref for high-frequency 60fps simulation
  const dronesRef = useRef<DroneState[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const towersRef = useRef<GroundStationTower[]>(towers);
  const topologyRef = useRef<NetworkTopology>(topology);
  const conflictsAvoidedRef = useRef<number>(0);
  const tasksCompletedRef = useRef<number>(42);
  const lastStatePushRef = useRef<number>(0);

  // Dynamic refs for SITL physics loop
  const isSITLModeRef = useRef<boolean>(false);
  const sitlConfigRef = useRef<GazeboSITLConfig>(sitlConfig);

  useEffect(() => {
    isSITLModeRef.current = isSITLMode;
    sitlConfigRef.current = sitlConfig;
  }, [isSITLMode, sitlConfig]);

  const addAlert = useCallback((severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS', title: string, description: string, actionTaken: string, droneId?: string) => {
    const newAlert: AlertEvent = {
      id: 'EVT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      timestamp: new Date().toLocaleTimeString(),
      severity,
      title,
      description,
      actionTaken,
      droneId,
    };
    setAlerts(prev => [newAlert, ...prev.slice(0, 49)]);
  }, []);

  const toggleEncryption = useCallback(() => {
    setSecurityStatus(prev => {
      const nextEnabled = !prev.encryptionEnabled;
      addAlert(
        nextEnabled ? 'SUCCESS' : 'WARNING',
        nextEnabled ? 'DTLS 1.3 Encryption Active' : 'Security Alert: Plaintext Datalink',
        nextEnabled 
          ? 'mTLS mutual verification enforced across all 500 nodes' 
          : 'Datalink encryption disabled - vulnerable to passive RF sniffers',
        nextEnabled ? 'Enforced AEAD AES-128-GCM' : 'Running in degraded test mode'
      );
      return {
        ...prev,
        encryptionEnabled: nextEnabled,
        protocol: nextEnabled ? 'DTLS_1_3' : 'UNENCRYPTED_PLAINTEXT'
      };
    });
  }, [addAlert]);

  const simulateMitmAttack = useCallback(() => {
    setSecurityStatus(prev => ({
      ...prev,
      mitmAttemptsBlocked: prev.mitmAttemptsBlocked + 1
    }));
    addAlert(
      'WARNING',
      'RF Packet Tamper Detected (MITM Attempt)',
      'Ground gateway detected corrupted AEAD authentication tag on Sector Alpha uplink',
      'Cryptographic signature mismatch: Malicious datagram dropped by kernel eBPF filter'
    );
  }, [addAlert]);

  const simulateRogueDroneAttack = useCallback(() => {
    setSecurityStatus(prev => ({
      ...prev,
      rogueDronesRejected: prev.rogueDronesRejected + 1
    }));
    addAlert(
      'CRITICAL',
      'Unauthorized Rogue Drone Rejected',
      'Unknown hardware UID attempted connection to telemetry cluster without Fleet Root CA signature',
      'mTLS Handshake terminated: Device blacklisted and reported to airspace security'
    );
  }, [addAlert]);

  const simulateReplayAttack = useCallback(() => {
    setSecurityStatus(prev => ({
      ...prev,
      replayAttacksNeutralized: prev.replayAttacksNeutralized + 1
    }));
    addAlert(
      'WARNING',
      'Command Replay Attack Neutralized',
      'Captured "DISARM" MAVLink command re-broadcasted with duplicate sequence ID',
      'Blocked by DTLS 1.3 Anti-Replay Sliding Window bitmap'
    );
  }, [addAlert]);

  const handleSetDatabaseEngine = useCallback((engine: DatabaseEngineType) => {
    setDatabaseEngine(engine);
    if (engine === 'TIMESCALE_POSTGRES') {
      setDatabaseMetrics({
        engine,
        writeRatePerSec: 10450,
        queryLatencyP95Ms: 1.2,
        storageCompactionRatio: '91.8% (Gorilla + PostGIS)',
        activePartitions: 32,
        totalRecordsLogged: 1489200
      });
    } else if (engine === 'SCYLLADB_CASSANDRA') {
      setDatabaseMetrics({
        engine,
        writeRatePerSec: 48200,
        queryLatencyP95Ms: 0.6,
        storageCompactionRatio: '84.2% (LSM / TWCS)',
        activePartitions: 128,
        totalRecordsLogged: 3290000
      });
    } else {
      setDatabaseMetrics({
        engine,
        writeRatePerSec: 18500,
        queryLatencyP95Ms: 1.8,
        storageCompactionRatio: '94.6% (Apache Arrow/Parquet)',
        activePartitions: 48,
        totalRecordsLogged: 2150000
      });
    }
  }, []);

  const toggleSITLMode = useCallback(() => {
    setIsSITLMode(prev => {
      const next = !prev;
      setSitlConfig(c => ({ ...c, active: next }));
      addAlert(
        'INFO',
        next ? 'Gazebo SITL Simulation Mode Connected' : 'Live Real-World Telemetry Re-engaged',
        next 
          ? 'Orchestrating 100+ PX4 SITL instances in headless Gazebo with DART physics & simulated sensor noise'
          : 'Connected to physical telemetry ingestion gateway',
        next ? 'Lockstep physics sync active' : 'Ground station live'
      );
      return next;
    });
  }, [addAlert]);

  useEffect(() => {
    topologyRef.current = topology;
  }, [topology]);

  // Initialize fleet of drones
  const initializeFleet = useCallback((count: number) => {
    const newDrones: DroneState[] = [];
    const calls: string[] = ['SWARM-A', 'SWARM-B', 'SWARM-C', 'SWARM-D'];

    for (let i = 0; i < count; i++) {
      const hub = CHARGING_HUBS[i % CHARGING_HUBS.length];
      const offsetX = (Math.random() - 0.5) * 80;
      const offsetY = (Math.random() - 0.5) * 80;
      const startX = hub.x + offsetX;
      const startY = hub.y + offsetY;
      const altitude = 15 + Math.random() * 45; // 15m to 60m

      newDrones.push({
        id: `DRN-${String(i + 1).padStart(3, '0')}`,
        callsign: `${calls[i % 4]}-${String(i + 1).padStart(3, '0')}`,
        x: startX,
        y: startY,
        z: altitude,
        vx: 0,
        vy: 0,
        vz: 0,
        targetX: startX,
        targetY: startY,
        targetZ: altitude,
        homeX: hub.x,
        homeY: hub.y,
        homeZ: 0,
        battery: 75 + Math.floor(Math.random() * 25),
        maxSpeed: 8 + Math.random() * 6,
        speed: 0,
        heading: Math.floor(Math.random() * 360),
        status: 'IDLE',
        flightMode: 'AUTO_MISSION',
        commsQuality: 98,
        meshConnectedTo: [],
        hasGcsUplink: true,
        localAvoidanceActive: false,
        sensorStatus: {
          rtkGps: 'RTK_FIX',
          lidar: 'HEALTHY',
          imu: 'CALIBRATED',
          opticalFlow: 'LOCKED'
        },
        temperatureC: 38 + Math.floor(Math.random() * 8),
        packetLossRate: 0.1,
        lastHeartbeatMs: Date.now(),
        security: {
          dtlsSessionActive: true,
          certFingerprint: `SHA256:${Math.random().toString(16).substring(2, 6).toUpperCase()}:${Math.random().toString(16).substring(2, 6).toUpperCase()}`,
          cipherSuite: 'TLS_AES_128_GCM_SHA256',
          antiReplayEpoch: 1,
          authenticatedHardwareUid: `ATECC608B-${(0x1000 + i).toString(16).toUpperCase()}`
        }
      });
    }

    dronesRef.current = newDrones;
    setDrones(newDrones);

    // Seed initial tasks
    const initialTasks: Task[] = [];
    const seedTaskTitles = [
      { title: 'Sector North Infrastructure LiDAR Scan', type: 'INSPECTION', priority: 'HIGH', x: 300, y: 180, z: 40 },
      { title: 'Forest Fire Perimeter Infrared Sweep', type: 'SURVEILLANCE', priority: 'CRITICAL', x: 550, y: 220, z: 50 },
      { title: 'Search & Rescue Grid Zulu', type: 'SEARCH_RESCUE', priority: 'CRITICAL', x: 380, y: 480, z: 35 },
      { title: 'Medical Supplies Rapid Delivery', type: 'PACKAGE_DELIVERY', priority: 'HIGH', x: 720, y: 320, z: 30 },
      { title: 'Border Fence Autonomous Perimeter Patrol', type: 'PERIMETER_PATROL', priority: 'MEDIUM', x: 680, y: 460, z: 45 },
      { title: 'Substation Transformer Thermal Imaging', type: 'INSPECTION', priority: 'MEDIUM', x: 200, y: 380, z: 25 },
      { title: 'Pipeline Corridor Orthophoto Survey', type: 'INSPECTION', priority: 'LOW', x: 480, y: 150, z: 60 },
      { title: 'Maritime Coastal Surveillance Sweep', type: 'SURVEILLANCE', priority: 'HIGH', x: 620, y: 180, z: 40 }
    ];

    seedTaskTitles.forEach((st, idx) => {
      initialTasks.push({
        id: `TSK-${String(idx + 1).padStart(3, '0')}`,
        title: st.title,
        type: st.type as TaskType,
        priority: st.priority as TaskPriority,
        x: st.x,
        y: st.y,
        z: st.z,
        progress: 0,
        status: 'PENDING_AUCTION',
        createdAt: Date.now() - idx * 30000,
        estimatedDurationSec: 45
      });
    });

    tasksRef.current = initialTasks;
    setTasks(initialTasks);

    addAlert('INFO', 'Fleet Initialized', `Successfully booted coordinator with ${count} autonomous units`, 'Spatial H3 partition active');
  }, [addAlert]);

  // Handle fleet count change
  const setFleetScale = useCallback((count: number) => {
    setDroneCount(count);
    initializeFleet(count);
  }, [initializeFleet]);

  // Initial mount
  useEffect(() => {
    initializeFleet(initialDroneCount);
  }, [initializeFleet, initialDroneCount]);

  // Market Auction Algorithm (Allocates pending tasks to optimal drones)
  const runMarketAuction = useCallback(() => {
    const currentTasks = tasksRef.current;
    const currentDrones = dronesRef.current;

    currentTasks.forEach(task => {
      if (task.status === 'PENDING_AUCTION') {
        // Find eligible drones (IDLE or TRANSIT, battery > 35)
        let bestBid = Infinity;
        let winningDroneId: string | null = null;

        currentDrones.forEach(drone => {
          if (drone.status === 'IDLE' || (drone.status === 'TRANSIT' && !drone.assignedTaskId)) {
            if (drone.battery > 35) {
              const dx = drone.x - task.x;
              const dy = drone.y - task.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              // Bid formula: Distance weight (0.4) + Battery penalty (0.4) + Status bias
              const bidScore = (dist * 0.4) + ((100 - drone.battery) * 2.0);

              if (bidScore < bestBid) {
                bestBid = bidScore;
                winningDroneId = drone.id;
              }
            }
          }
        });

        if (winningDroneId) {
          const winner = currentDrones.find(d => d.id === winningDroneId);
          if (winner) {
            winner.status = 'TRANSIT';
            winner.assignedTaskId = task.id;
            winner.targetX = task.x;
            winner.targetY = task.y;
            winner.targetZ = task.z;
            task.assignedDroneId = winner.id;
            task.status = 'IN_PROGRESS';

            addAlert(
              'SUCCESS',
              'Task Auction Won',
              `Task "${task.title}" awarded to ${winner.callsign} (bid score: ${bestBid.toFixed(1)})`,
              '4D Corridor Reserved',
              winner.id
            );
          }
        }
      }
    });
  }, [addAlert]);

  // Spawn a new mission task dynamically
  const spawnTask = useCallback((x: number, y: number, type?: TaskType, priority?: TaskPriority) => {
    const chosenType = type || MISSION_TYPES[Math.floor(Math.random() * MISSION_TYPES.length)];
    const chosenPriority = priority || (Math.random() > 0.6 ? 'HIGH' : 'MEDIUM');
    const taskCount = tasksRef.current.length + 1;

    const newTask: Task = {
      id: `TSK-${String(taskCount).padStart(3, '0')}`,
      title: `${chosenType.replace('_', ' ')} Vector #${taskCount}`,
      type: chosenType,
      priority: chosenPriority,
      x: Math.max(80, Math.min(840, x)),
      y: Math.max(80, Math.min(640, y)),
      z: 25 + Math.floor(Math.random() * 35),
      progress: 0,
      status: 'PENDING_AUCTION',
      createdAt: Date.now(),
      estimatedDurationSec: 30 + Math.floor(Math.random() * 30)
    };

    tasksRef.current = [newTask, ...tasksRef.current];
    setTasks([...tasksRef.current]);

    addAlert('INFO', 'New Mission Task Spawned', `Priority: ${chosenPriority} at [${Math.round(x)}, ${Math.round(y)}]`, 'Broadcasted to Market Auction Pool');
    runMarketAuction();
  }, [addAlert, runMarketAuction]);

  // Trigger preset missions
  const dispatchPresetMission = useCallback((missionPreset: 'SEARCH_GRID' | 'PERIMETER_SWEEP' | 'CARGO_TRANSIT' | 'SURVEILLANCE_FORMATION') => {
    const currentDrones = dronesRef.current;
    if (currentDrones.length === 0) return;

    if (missionPreset === 'SEARCH_GRID') {
      // Create 8 parallel search lanes
      for (let i = 0; i < 8; i++) {
        spawnTask(200 + i * 70, 250 + (i % 2) * 180, 'SEARCH_RESCUE', 'CRITICAL');
      }
      addAlert('INFO', 'Search & Rescue Grid Deployed', 'Dispatched 8 synchronized search lane tasks', 'Market auction executing');
    } else if (missionPreset === 'PERIMETER_SWEEP') {
      // Around edges
      const coords = [
        [150, 150], [450, 120], [750, 150],
        [780, 400], [750, 600], [450, 620],
        [150, 600], [120, 380]
      ];
      coords.forEach(([px, py]) => {
        spawnTask(px, py, 'PERIMETER_PATROL', 'HIGH');
      });
      addAlert('INFO', 'Perimeter Sweep Activated', '8 patrol points established along containment boundary', 'Distributed task auction initiated');
    } else if (missionPreset === 'CARGO_TRANSIT') {
      for (let i = 0; i < 6; i++) {
        spawnTask(180 + Math.random() * 550, 180 + Math.random() * 400, 'PACKAGE_DELIVERY', 'HIGH');
      }
      addAlert('INFO', 'Logistics Air Corridor Dispatched', 'Point-to-point delivery routes queued', 'Energy-optimal allocation assigned');
    } else if (missionPreset === 'SURVEILLANCE_FORMATION') {
      for (let i = 0; i < 6; i++) {
        spawnTask(350 + Math.cos(i * Math.PI / 3) * 180, 350 + Math.sin(i * Math.PI / 3) * 180, 'SURVEILLANCE', 'HIGH');
      }
      addAlert('INFO', 'Hexagonal Sensor Constellation', 'Surveillance ring coordinates distributed', 'Assigned via local proximity');
    }
  }, [spawnTask, addAlert]);

  // Failure Injection: Sever Comms in Sector
  const injectCommsSever = useCallback((towerId: string) => {
    setTowers(prev => prev.map(t => t.id === towerId ? { ...t, active: !t.active } : t));
    const isNowOff = towers.find(t => t.id === towerId)?.active;
    
    if (isNowOff) {
      addAlert('CRITICAL', 'RF Uplink Severed', `GCS Tower ${towerId} lost connection. Switching drones to P2P Mesh Relay!`, 'Ad-Hoc Mesh routing activated');
    } else {
      addAlert('SUCCESS', 'RF Uplink Restored', `GCS Tower ${towerId} reconnected to central coordinator.`, 'Telemetry links re-synchronized');
    }
  }, [towers, addAlert]);

  // Failure Injection: Force Low Battery on 5 active drones
  const injectLowBattery = useCallback(() => {
    let affectedCount = 0;
    const currentDrones = dronesRef.current;
    
    for (const drone of currentDrones) {
      if ((drone.status === 'TRANSIT' || drone.status === 'ON_TASK') && affectedCount < 4) {
        drone.battery = 14; // Below safe 20% margin
        affectedCount++;

        // Failsafe state machine trigger:
        drone.status = 'RTH';
        drone.flightMode = 'FAILSAFE_RTH';
        drone.targetX = drone.homeX;
        drone.targetY = drone.homeY;
        drone.targetZ = 20;

        // Auto task re-auction handoff!
        if (drone.assignedTaskId) {
          const task = tasksRef.current.find(t => t.id === drone.assignedTaskId);
          if (task) {
            task.status = 'PENDING_AUCTION';
            task.assignedDroneId = undefined;
            addAlert(
              'WARNING',
              'Dynamic RTH & Task Cascade Reassignment',
              `${drone.callsign} battery dropped to 14%. Mission "${task.title}" handed off to auction pool.`,
              'Returning to nearest charging pad',
              drone.id
            );
          }
          drone.assignedTaskId = undefined;
        }
      }
    }
    runMarketAuction();
  }, [addAlert, runMarketAuction]);

  // Failure Injection: Motor / Propeller Malfunction
  const injectMalfunction = useCallback(() => {
    const currentDrones = dronesRef.current;
    const candidate = currentDrones.find(d => d.status === 'TRANSIT' || d.status === 'ON_TASK');
    if (candidate) {
      candidate.status = 'EMERGENCY_LAND';
      candidate.flightMode = 'FAILSAFE_RTH';
      candidate.sensorStatus.imu = 'HIGH_VIBRATION';
      candidate.targetZ = 0;

      if (candidate.assignedTaskId) {
        const task = tasksRef.current.find(t => t.id === candidate.assignedTaskId);
        if (task) {
          task.status = 'PENDING_AUCTION';
          task.assignedDroneId = undefined;
        }
        candidate.assignedTaskId = undefined;
      }

      addAlert(
        'CRITICAL',
        'Propulsion Malfunction Detected',
        `${candidate.callsign} reported abnormal motor RPM variance. Ballistic descent initiated.`,
        'Controlled emergency touchdown within safe corridor',
        candidate.id
      );
      runMarketAuction();
    }
  }, [addAlert, runMarketAuction]);

  // Failure Injection: GPS Jamming / RTK Loss
  const injectGpsSpoofing = useCallback(() => {
    const currentDrones = dronesRef.current;
    const sample = currentDrones.slice(0, 10);
    sample.forEach(d => {
      d.sensorStatus.rtkGps = 'LOST';
      d.flightMode = 'DEAD_RECKONING';
    });
    addAlert(
      'WARNING',
      'GPS Degradation / Spoofing Detected',
      '10 units in Sector Alpha lost RTK lock. Transitioned to onboard Optical Flow & Visual Inertial Odometry.',
      'VIO & Dead Reckoning Active'
    );
  }, [addAlert]);

  // Main 60 FPS Swarm Simulation Engine Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTick = performance.now();

    const simulationLoop = (now: number) => {
      const dt = Math.min((now - lastTick) / 1000, 0.1) * simulationSpeed;
      lastTick = now;

      if (isPlaying) {
        const currentDrones = dronesRef.current;
        const currentTasks = tasksRef.current;
        const activeTowers = towersRef.current.filter(t => t.active);
        const currentTopology = topologyRef.current;

        // Periodic market auction check
        if (Math.random() < 0.05) {
          runMarketAuction();
        }

        // 1. Process Drone Kinematics, Collision Avoidance (ORCA/APF), and Battery
        for (let i = 0; i < currentDrones.length; i++) {
          const drone = currentDrones[i];

          // Comms & Mesh connectivity calculation
          let hasDirectUplink = false;
          let bestTowerDist = Infinity;

          if (currentTopology !== 'PEER_MESH_ONLY') {
            for (const tower of activeTowers) {
              const dx = drone.x - tower.x;
              const dy = drone.y - tower.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < tower.rangeMeters) {
                hasDirectUplink = true;
                bestTowerDist = Math.min(bestTowerDist, dist);
              }
            }
          }

          drone.hasGcsUplink = hasDirectUplink;

          // Find mesh neighbors (within 85 meters)
          const meshPeers: string[] = [];
          for (let j = 0; j < currentDrones.length; j++) {
            if (i !== j) {
              const other = currentDrones[j];
              const dx = drone.x - other.x;
              const dy = drone.y - other.y;
              const distSq = dx * dx + dy * dy;
              if (distSq < 85 * 85) {
                meshPeers.push(other.id);
              }
            }
          }
          drone.meshConnectedTo = meshPeers;

          // Calculate Comms Quality
          if (drone.hasGcsUplink) {
            drone.commsQuality = Math.min(100, Math.max(65, 100 - (bestTowerDist / 350) * 35));
            drone.packetLossRate = 0.05 + (bestTowerDist / 350) * 0.15;
          } else if (meshPeers.length > 0) {
            // Relayed through mesh
            drone.commsQuality = Math.min(85, 40 + meshPeers.length * 10);
            drone.packetLossRate = 0.8 + meshPeers.length * 0.1;
          } else {
            // Isolated
            drone.commsQuality = 0;
            drone.packetLossRate = 100;
            if (drone.status !== 'RTH' && drone.status !== 'EMERGENCY_LAND') {
              drone.status = 'COMM_LOST';
              drone.flightMode = 'DEAD_RECKONING';
            }
          }

          // Kinematic state machine
          if (drone.status === 'CHARGING') {
            drone.battery = Math.min(100, drone.battery + dt * 4.5); // Fast charging pad
            drone.vx = 0;
            drone.vy = 0;
            drone.speed = 0;
            if (drone.battery >= 98) {
              drone.status = 'IDLE';
              drone.flightMode = 'AUTO_MISSION';
            }
            continue;
          }

          if (drone.status === 'IDLE') {
            drone.vx = 0;
            drone.vy = 0;
            drone.speed = 0;
            // Battery drains slowly on pad
            drone.battery = Math.max(0, drone.battery - dt * 0.01);
            continue;
          }

          if (drone.status === 'EMERGENCY_LAND') {
            drone.vx *= 0.8;
            drone.vy *= 0.8;
            drone.z = Math.max(0, drone.z - dt * 6.0);
            drone.speed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
            drone.battery = Math.max(0, drone.battery - dt * 0.08);
            continue;
          }

          // Active flight: Transit, On_Task, Avoiding, RTH, Comm_Lost
          // Target attraction vector
          const targetDx = drone.targetX - drone.x;
          const targetDy = drone.targetY - drone.y;
          const distToTarget = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

          let desiredVx = 0;
          let desiredVy = 0;

          if (distToTarget > 3.0) {
            const desiredSpeed = Math.min(drone.maxSpeed, distToTarget * 0.8);
            desiredVx = (targetDx / distToTarget) * desiredSpeed;
            desiredVy = (targetDy / distToTarget) * desiredSpeed;
          } else {
            // Reached target waypoint
            if (drone.status === 'TRANSIT') {
              drone.status = 'ON_TASK';
            } else if (drone.status === 'ON_TASK') {
              // Task progress accumulation
              if (drone.assignedTaskId) {
                const currentTask = currentTasks.find(t => t.id === drone.assignedTaskId);
                if (currentTask) {
                  currentTask.progress = Math.min(100, currentTask.progress + dt * 15);
                  if (currentTask.progress >= 100) {
                    currentTask.status = 'COMPLETED';
                    tasksCompletedRef.current += 1;
                    addAlert(
                      'SUCCESS',
                      'Mission Objective Completed',
                      `Task "${currentTask.title}" finished by ${drone.callsign}`,
                      'Returning to base station pad',
                      drone.id
                    );
                    drone.status = 'RTH';
                    drone.targetX = drone.homeX;
                    drone.targetY = drone.homeY;
                    drone.assignedTaskId = undefined;
                  }
                }
              }
            } else if (drone.status === 'RTH') {
              // Touchdown on charging pad
              drone.status = 'CHARGING';
              drone.targetZ = 0;
              drone.z = 0;
            }
          }

          // 2. ORCA / Decentralized Velocity Obstacle Avoidance Loop
          let avoidanceDx = 0;
          let avoidanceDy = 0;
          let conflictDetected = false;
          const SAFETY_BUBBLE = 14.0; // 14m horizontal separation buffer

          for (let j = 0; j < currentDrones.length; j++) {
            if (i !== j) {
              const other = currentDrones[j];
              // Only check if altitudes are within 8 meters
              if (Math.abs(drone.z - other.z) < 8.0) {
                const relX = other.x - drone.x;
                const relY = other.y - drone.y;
                const distSq = relX * relX + relY * relY;

                if (distSq < SAFETY_BUBBLE * SAFETY_BUBBLE && distSq > 0.001) {
                  const dist = Math.sqrt(distSq);
                  conflictDetected = true;
                  conflictsAvoidedRef.current += 1;

                  // Reciprocal repulsive force (inverse distance squared)
                  const pushStrength = (SAFETY_BUBBLE - dist) / SAFETY_BUBBLE;
                  // Push perpendicular to collision line to prevent deadlocks
                  const perpX = -relY / dist;
                  const perpY = relX / dist;

                  avoidanceDx += (-relX / dist * 0.7 + perpX * 0.6) * pushStrength * 12.0;
                  avoidanceDy += (-relY / dist * 0.7 + perpY * 0.6) * pushStrength * 12.0;
                }
              }
            }
          }

          drone.localAvoidanceActive = conflictDetected;
          drone.avoidanceVector = conflictDetected ? { dx: avoidanceDx, dy: avoidanceDy } : undefined;

          // Blend desired cruise velocity with local ORCA evasion
          let finalVx = desiredVx + avoidanceDx;
          let finalVy = desiredVy + avoidanceDy;

          // Apply Gazebo SITL simulated wind vector if active
          if (isSITLModeRef.current) {
            const windRad = (sitlConfigRef.current.windHeadingDeg * Math.PI) / 180;
            const windVx = Math.cos(windRad) * sitlConfigRef.current.windSpeedMps * 0.12;
            const windVy = Math.sin(windRad) * sitlConfigRef.current.windSpeedMps * 0.12;
            finalVx += windVx;
            finalVy += windVy;
          }

          // Kinematic acceleration limits (max 4.0 m/s^2)
          const accel = 6.0;
          drone.vx += (finalVx - drone.vx) * Math.min(1.0, dt * accel);
          drone.vy += (finalVy - drone.vy) * Math.min(1.0, dt * accel);

          // Update position
          drone.x += drone.vx * dt;
          drone.y += drone.vy * dt;

          // Airspace boundary clamping
          drone.x = Math.max(30, Math.min(880, drone.x));
          drone.y = Math.max(30, Math.min(680, drone.y));

          // Speed & heading
          drone.speed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
          if (drone.speed > 0.3) {
            drone.heading = (Math.atan2(drone.vy, drone.vx) * 180 / Math.PI + 360) % 360;
          }

          // Realistic battery discharge curve: Base avionics + aerodynamic motor power
          const powerFactor = 0.04 + (drone.speed / drone.maxSpeed) * 0.09;
          drone.battery = Math.max(0, drone.battery - dt * powerFactor);

          // Automatic low-battery threshold check (Failsafe)
          if (drone.battery < 20 && drone.status !== 'RTH') {
            drone.status = 'RTH';
            drone.flightMode = 'FAILSAFE_RTH';
            drone.targetX = drone.homeX;
            drone.targetY = drone.homeY;
            drone.targetZ = 25;

            if (drone.assignedTaskId) {
              const currentTask = currentTasks.find(t => t.id === drone.assignedTaskId);
              if (currentTask) {
                currentTask.status = 'PENDING_AUCTION';
                currentTask.assignedDroneId = undefined;
              }
              drone.assignedTaskId = undefined;
            }

            addAlert(
              'WARNING',
              'Autonomous RTH Engaged (Low Energy Budget)',
              `${drone.callsign} reached 20% reserve floor. Navigating safe corridor to ${drone.homeX}, ${drone.homeY}`,
              'Automatic task cascade re-auction triggered',
              drone.id
            );
          }
        }

        // Throttle React state sync to ~20Hz for butter-smooth UI without React render congestion
        if (now - lastStatePushRef.current > 48) {
          lastStatePushRef.current = now;
          setDrones([...currentDrones]);
          setTasks([...currentTasks]);
        }
      }

      animationFrameId = requestAnimationFrame(simulationLoop);
    };

    animationFrameId = requestAnimationFrame(simulationLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, simulationSpeed, runMarketAuction, addAlert]);

  // Compute fleet telemetry metrics
  const activeDrones = drones.filter(d => d.status !== 'IDLE' && d.status !== 'CHARGING');
  const onTaskDrones = drones.filter(d => d.status === 'ON_TASK');
  const rthDrones = drones.filter(d => d.status === 'RTH');
  const chargingDrones = drones.filter(d => d.status === 'CHARGING');
  const degradedDrones = drones.filter(d => d.status === 'COMM_LOST' || d.status === 'EMERGENCY_LAND' || d.battery < 20);

  const avgBattery = drones.length > 0 
    ? Math.round(drones.reduce((acc, d) => acc + d.battery, 0) / drones.length) 
    : 0;

  const totalMeshLinks = drones.reduce((acc, d) => acc + d.meshConnectedTo.length, 0) / 2;

  const metrics: FleetMetrics = {
    totalDrones: drones.length,
    airborneCount: activeDrones.length,
    onTaskCount: onTaskDrones.length,
    rthCount: rthDrones.length,
    chargingCount: chargingDrones.length,
    degradedCount: degradedDrones.length,
    avgBattery,
    throughputMsgsPerSec: Math.round(drones.length * 20), // 20 Hz telemetry per unit
    p99LatencyMs: topology === 'HYBRID_MESH' ? 18 : topology === 'HUB_SPOKE_CELLULAR' ? 26 : 38,
    conflictsResolvedCount: conflictsAvoidedRef.current,
    meshLinksActive: Math.round(totalMeshLinks),
    networkPacketLossPercent: topology === 'HYBRID_MESH' ? 0.3 : topology === 'HUB_SPOKE_CELLULAR' ? 1.4 : 2.8,
    tasksCompleted: tasksCompletedRef.current,
  };

  return {
    drones,
    tasks,
    alerts,
    towers,
    metrics,
    topology,
    setTopology,
    droneCount,
    setFleetScale,
    isPlaying,
    setIsPlaying,
    simulationSpeed,
    setSimulationSpeed,
    selectedDroneId,
    setSelectedDroneId,
    spawnTask,
    dispatchPresetMission,
    injectCommsSever,
    injectLowBattery,
    injectMalfunction,
    injectGpsSpoofing,
    // Security layer
    securityStatus,
    toggleEncryption,
    simulateMitmAttack,
    simulateRogueDroneAttack,
    simulateReplayAttack,
    // Database layer
    databaseEngine,
    setDatabaseEngine: handleSetDatabaseEngine,
    databaseMetrics,
    // SITL simulation layer
    isSITLMode,
    sitlConfig,
    setSitlConfig,
    toggleSITLMode,
  };
}
