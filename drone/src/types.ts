export type DroneStatus = 
  | 'IDLE' 
  | 'TRANSIT' 
  | 'ON_TASK' 
  | 'AVOIDING' 
  | 'RTH' 
  | 'CHARGING' 
  | 'COMM_LOST' 
  | 'EMERGENCY_LAND';

export type FlightMode = 
  | 'AUTO_MISSION' 
  | 'COLLISION_OVERRIDE' 
  | 'FAILSAFE_RTH' 
  | 'DEAD_RECKONING' 
  | 'MANUAL_HOLD';

export type TaskType = 
  | 'SEARCH_RESCUE' 
  | 'INSPECTION' 
  | 'SURVEILLANCE' 
  | 'PACKAGE_DELIVERY' 
  | 'PERIMETER_PATROL';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskStatus = 'PENDING_AUCTION' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  x: number;
  y: number;
  z: number;
  assignedDroneId?: string;
  progress: number;
  status: TaskStatus;
  createdAt: number;
  estimatedDurationSec: number;
}

export interface SensorStatus {
  rtkGps: 'RTK_FIX' | 'GPS_3D' | 'DEGRADED' | 'LOST';
  lidar: 'HEALTHY' | 'OBSTACLE_DETECTED' | 'DEGRADED';
  imu: 'CALIBRATED' | 'HIGH_VIBRATION' | 'DRIFT';
  opticalFlow: 'LOCKED' | 'SEARCHING' | 'DISABLED';
}

export interface DroneSecurityState {
  dtlsSessionActive: boolean;
  certFingerprint: string;
  cipherSuite: string;
  antiReplayEpoch: number;
  authenticatedHardwareUid: string;
}

export interface DroneState {
  id: string;
  callsign: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  battery: number;
  maxSpeed: number;
  speed: number;
  heading: number;
  status: DroneStatus;
  flightMode: FlightMode;
  assignedTaskId?: string;
  commsQuality: number; // 0 - 100
  meshConnectedTo: string[];
  hasGcsUplink: boolean;
  localAvoidanceActive: boolean;
  avoidanceVector?: { dx: number; dy: number };
  sensorStatus: SensorStatus;
  temperatureC: number;
  packetLossRate: number;
  lastHeartbeatMs: number;
  security: DroneSecurityState;
}

export interface AlertEvent {
  id: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  droneId?: string;
  title: string;
  description: string;
  actionTaken: string;
}

export interface FleetMetrics {
  totalDrones: number;
  airborneCount: number;
  onTaskCount: number;
  rthCount: number;
  chargingCount: number;
  degradedCount: number;
  avgBattery: number;
  throughputMsgsPerSec: number;
  p99LatencyMs: number;
  conflictsResolvedCount: number;
  meshLinksActive: number;
  networkPacketLossPercent: number;
  tasksCompleted: number;
}

export type NetworkTopology = 'HYBRID_MESH' | 'HUB_SPOKE_CELLULAR' | 'PEER_MESH_ONLY';

export type DatabaseEngineType = 'TIMESCALE_POSTGRES' | 'SCYLLADB_CASSANDRA' | 'INFLUXDB_V3';

export interface DatabaseMetrics {
  engine: DatabaseEngineType;
  writeRatePerSec: number;
  queryLatencyP95Ms: number;
  storageCompactionRatio: string;
  activePartitions: number;
  totalRecordsLogged: number;
}

export type SimulationMode = 'LIVE_REALTIME' | 'GAZEBO_SITL_SIMULATION';

export interface GazeboSITLConfig {
  active: boolean;
  physicsEngine: 'ODE' | 'DART';
  realtimeFactor: number;
  windSpeedMps: number;
  windHeadingDeg: number;
  sensorNoiseEnabled: boolean;
  ros2BridgeConnected: boolean;
  lockstepSyncLagMs: number;
}

export interface SecurityProtocolStatus {
  encryptionEnabled: boolean;
  protocol: 'DTLS_1_3' | 'TLS_1_3' | 'UNENCRYPTED_PLAINTEXT';
  cipherSuite: string;
  mTLSCertificateValid: boolean;
  antiReplayActive: boolean;
  mitmAttemptsBlocked: number;
  rogueDronesRejected: number;
  replayAttacksNeutralized: number;
}

export interface ArchitectureLayer {
  id: string;
  number: string;
  name: string;
  tagline: string;
  iconName: string;
  overview: string;
  scalingSolution: string;
  keyProtocolsOrAlgorithms: string[];
  dataFlowDescription: string;
  technicalDeepDive: {
    title: string;
    description: string;
    codeOrConfig: string;
    language: string;
  }[];
  tradeOffAnalysis: {
    approach: string;
    pros: string[];
    cons: string[];
    verdict: string;
  }[];
}
