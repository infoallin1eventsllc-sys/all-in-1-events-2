export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type FlightMode = 
  | 'MANUAL_STAB' 
  | 'ALT_HOLD' 
  | 'POS_HOLD' 
  | 'MISSION_AUTO' 
  | 'RTH_FAILSAFE' 
  | 'EMERGENCY_LAND';

export type DatalinkQuality = 'EXCELLENT' | 'DEGRADED' | 'LINK_LOST';

export interface TelemetryState {
  timestampMs: number;
  droneId: string;
  callsign: string;
  flightMode: FlightMode;
  armed: boolean;
  gps: {
    lat: number;
    lng: number;
    altitudeAglMeters: number; // Above Ground Level
    altitudeMslMeters: number; // Mean Sea Level
    satellites: number;
    hdop: number;
    fixType: '3D_FIX' | 'RTK_FLOAT' | 'RTK_FIXED' | 'NO_FIX';
  };
  attitude: {
    roll: number;    // degrees (-180 to 180)
    pitch: number;   // degrees (-90 to 90)
    yaw: number;     // heading 0-360 degrees
  };
  velocity: {
    groundSpeedMs: number; // m/s
    airSpeedMs: number;
    climbRateMs: number;   // vertical speed m/s
  };
  power: {
    batteryPct: number;
    voltageVolts: number;
    currentAmps: number;
    temperatureC: number;
    estimatedFlightTimeMin: number;
  };
  link: {
    quality: DatalinkQuality;
    rssiDbm: number;
    snrDb: number;
    rttLatencyMs: number;
    packetLossPct: number;
    downlinkBitrateKbps: number;
    uplinkBitrateKbps: number;
  };
  payload: {
    gimbalPitchDeg: number;
    gimbalYawDeg: number;
    cameraZoom: number; // 1x to 10x
    cameraSensorMode: 'RGB_4K' | 'THERMAL_WHITE_HOT' | 'THERMAL_IRONBOW' | 'NIGHT_VISION';
    loudspeakerActive: boolean;
    loudspeakerDbLevel: number;
  };
}

export interface AudioStreamState {
  downlinkMicActive: boolean;
  downlinkVolume: number; // 0 to 100
  downlinkMuted: boolean;
  audioSpectrum: number[]; // 16 frequency bands for VU visualizer
  
  uplinkPttActive: boolean;
  uplinkOpenMic: boolean;
  uplinkInputGain: number; // 0 to 100
  uplinkMicDetected: boolean;
  uplinkLevelDb: number; // -60 to 0 dB
  activeSiren: string | null;
}
