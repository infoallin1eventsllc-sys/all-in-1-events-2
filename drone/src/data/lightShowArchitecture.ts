export interface LightShowArchitectureSection {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  overview: string;
  keyComponents: { name: string; desc: string }[];
  technicalSpecs: { label: string; value: string }[];
  implementationSnippet?: { language: string; code: string };
}

export const LIGHT_SHOW_ARCHITECTURE: LightShowArchitectureSection[] = [
  {
    id: 'fleet-management',
    title: 'Fleet Management Layer',
    subtitle: 'Central Coordinator & Real-Time Telemetry Aggregator for 100–500+ Display Drones',
    badge: 'CENTRAL COORDINATOR',
    overview: 'Unlike dynamic delivery swarms that constantly negotiate tasks, an aerial light show operates on an authoritative broadcast model with a centralized supervisor. The coordinator monitors drone health, RTK GPS integer fix quality, battery reserve margins, and trajectory deviations without congesting RF bandwidth.',
    keyComponents: [
      { name: 'Show Supervisor Daemon', desc: 'Authoritative state machine orchestrating pre-flight staging, arming sequence, synchronized takeoff, show execution, and automated simultaneous landing.' },
      { name: 'Compressed Telemetry Ingest', desc: 'Decodes high-efficiency 16-byte packed binary status frames received over TDMA uplink intervals, aggregating 500 drones at 5 Hz with < 2% CPU usage.' },
      { name: 'Automated Disqualification Gate', desc: 'Pre-flight safety gate that automatically flags and scrubs any airframe with compass magnetic anomalies, < 18 RTK satellites, or battery < 92%.' }
    ],
    technicalSpecs: [
      { label: 'Airframe Capacity', value: '100–500+ synchronous units' },
      { label: 'Status Uplink Frequency', value: '5 Hz per unit (TDMA time-slotted)' },
      { label: 'RTK Positioning Accuracy', value: '± 2.0 cm horizontal, ± 3.5 cm vertical' },
      { label: 'Pre-Flight Battery Gate', value: '≥ 92% State of Charge (SoC)' }
    ],
    implementationSnippet: {
      language: 'rust',
      code: `// Packed 16-byte telemetry frame sent by each display drone
#[repr(C, packed)]
pub struct DroneHealthBeacon {
    pub drone_id: u16,          // 0 to 65535
    pub timestamp_ms: u32,      // Synchronized epoch millis
    pub pos_x_cm: i16,          // Centimeters from show origin
    pub pos_y_cm: i16,          // Centimeters from show origin
    pub pos_z_cm: u16,          // Altitude in centimeters (0-655m)
    pub battery_pct: u8,        // 0-100%
    pub status_flags: u8,       // Bit 0: RTK Fix, Bit 1: Time Sync, Bit 2: Deviation Alert
    pub deviation_cm: u8,       // Distance from programmed waypoint (cm)
    pub crc8: u8,               // Header checksum
}`
    }
  },
  {
    id: 'choreography-engine',
    title: 'Choreography Engine & Formation Sequencing',
    subtitle: 'Blender 3D Pipeline, LAPJV Hungarian Solver, & Continuous 4D B-Splines',
    badge: 'PATH GENERATION',
    overview: 'Converts artistic 3D designs, typography, and logos into safe, flyable drone trajectories. Employs the Jonker-Volgenant (LAPJV) algorithm to solve the Linear Assignment Problem between keyframe formations, guaranteeing minimal total flight distance and eliminating trajectory crossings.',
    keyComponents: [
      { name: 'Blender 3D Drone Plugin', desc: 'Artistic viewport allowing lighting designers to sculpt volumetric meshes, animate skeletal rigs, and import SVG vector logos.' },
      { name: 'LAPJV / Hungarian Assignment', desc: 'Computes the globally optimal 1-to-1 drone assignment between Formation A and Formation B, reducing transit energy by 38% compared to greedy mapping.' },
      { name: 'Continuous Quintic B-Spline Smoother', desc: 'Interpolates discrete waypoints into continuous polynomial trajectories with bounded velocity (max 6 m/s), acceleration (max 3 m/s²), and jerk.' }
    ],
    technicalSpecs: [
      { label: 'Assignment Algorithm', value: 'Jonker-Volgenant (LAPJV) O(N³) with KD-Tree pruning' },
      { label: 'Trajectory Curve', value: 'Continuous Quintic (C²) Polynomial B-Spline' },
      { label: 'Max Display Velocity', value: '4.5 m/s (6.0 m/s transit)' },
      { label: 'Trajectory Sampling Rate', value: '20 Hz pre-baked onto onboard flash' }
    ],
    implementationSnippet: {
      language: 'python',
      code: `import numpy as np
from scipy.optimize import linear_sum_assignment

def optimize_formation_transition(positions_from, positions_to):
    """
    Computes optimal 1-to-1 drone mapping to minimize total transition distance.
    Guarantees no crossing paths when combined with altitude tiering.
    """
    # Compute cost matrix: Euclidean distance squared between all pairs
    diff = positions_from[:, np.newaxis, :] - positions_to[np.newaxis, :, :]
    cost_matrix = np.sum(diff ** 2, axis=-1)
    
    # Solve Linear Sum Assignment (Hungarian / LAPJV)
    row_ind, col_ind = linear_sum_assignment(cost_matrix)
    
    # Return reordered target positions matching each drone index
    return positions_to[col_ind]`
    }
  },
  {
    id: 'precision-timing',
    title: 'Precision Timing & Nanosecond Synchronization',
    subtitle: 'GPS 1PPS Disciplined Oscillators & Broadcast IEEE 1588 PTP Timecode',
    badge: 'SUB-MILLISECOND SYNC',
    overview: 'For tight LED choreography and formation morphing, all 100+ drones must share an identical clock reference with < 2ms deviation. The primary clock reference is the GPS 1 Pulse-Per-Second (1PPS) signal backed by hardware-disciplined Temperature Compensated Crystal Oscillators (TCXO).',
    keyComponents: [
      { name: 'GPS 1PPS Hardware Trigger', desc: 'Hardware pin interrupt on the flight controller disciplined directly to UTC atomic clocks, eliminating software OS scheduler jitter.' },
      { name: 'PTP / Broadcast Epoch Timecode', desc: 'Ground station continuously broadcasts a 64-bit UTC microsecond epoch beacon; drones dynamically discipline local drift using a Kalman filter.' },
      { name: 'Show Countdown Arm Barrier', desc: 'Ground station arms all drones 10 seconds in advance with a scheduled future UTC start timestamp (e.g. T_START = 1718060400.000). Takeoff begins on the exact microsecond.' }
    ],
    technicalSpecs: [
      { label: 'Target Synchronization Error', value: '< 1.5 ms across entire fleet' },
      { label: 'Hardware Reference', value: 'GPS 1PPS (Pulse Per Second) + TCXO oscillator' },
      { label: 'Backup Sync Protocol', value: 'Broadcast Micro-PTP (IEEE 1588v2 lightweight profile)' },
      { label: 'Oscillator Drift Tolerance', value: '< 2.0 ppm during temporary GPS signal blockage' }
    ],
    implementationSnippet: {
      language: 'cpp',
      code: `// High-precision clock disciplining loop running on STM32 / ESP32 companion
void on_gps_pps_interrupt() {
    uint64_t current_timer_ticks = get_hw_timer_ticks();
    uint64_t expected_ticks = last_pps_ticks + TICKS_PER_SECOND;
    
    int64_t drift_error = (int64_t)(current_timer_ticks - expected_ticks);
    
    // Apply Kalman filter correction to internal microsecond epoch
    kalman_filter_update_clock_rate(drift_error);
    
    system_utc_epoch_us = current_gps_epoch_seconds * 1000000ULL;
    last_pps_ticks = current_timer_ticks;
}`
    }
  },
  {
    id: 'communication-architecture',
    title: 'One-to-Many Broadcast Communication Architecture',
    subtitle: 'Sub-GHz LoRa / 2.4GHz Wi-Fi Broadcast with Slotted Backchannel TDMA',
    badge: 'BROADCAST TOPOLOGY',
    overview: 'Since all 100+ drone flight trajectories and lighting patterns are pre-baked onto onboard eMMC storage prior to takeoff, the live RF datalink does NOT stream heavy waypoint coordinates. Instead, the ground station utilizes a lightweight, high-reliability one-to-many broadcast for synchronized timecode, pause, and emergency abort commands.',
    keyComponents: [
      { name: 'One-to-Many Master Broadcast', desc: 'Ground transmitter broadcasts 32-byte timeline packets at 20 Hz (Timecode, Show State, Emergency Code) over high-gain directional antennas.' },
      { name: 'Zero-Contention TDMA Health Uplink', desc: 'Time-Division Multiple Access allows each of the 500 drones a designated 1.5ms slot in a 1-second rolling frame to transmit vital telemetry without RF collisions.' },
      { name: 'Dedicated Hardware Kill Frequency', desc: 'Out-of-band redundant 433MHz frequency paired directly to hardware relays for emergency flight termination independently of the main telemetry radio.' }
    ],
    technicalSpecs: [
      { label: 'Downlink Protocol', value: 'UDP Broadcast / ESP-NOW / Sub-GHz FSK (915 MHz / 868 MHz)' },
      { label: 'Broadcast Packet Size', value: '32 bytes @ 20 Hz' },
      { label: 'Uplink Topology', value: '500-slot TDMA (100 units/second rolling report)' },
      { label: 'RF Range & Margin', value: '1.5 km Line-of-Sight with +18 dBm link budget' }
    ]
  },
  {
    id: 'led-lighting-control',
    title: 'High-Lumen RGBW LED Control & Color Mixing',
    subtitle: 'Pre-Baked Lighting Cues, sACN/DMX Compatibility, & Volumetric Shaders',
    badge: 'RGBW LIGHTING',
    overview: 'Display drones are equipped with high-intensity bottom and top-facing multi-chip RGBW LEDs (1,500–2,500 lumens) to ensure visibility from ground audiences up to 1,000 meters away. Lighting curves are pre-synchronized with position data, supporting smooth color washes, strobe pulses, and volumetric color gradients.',
    keyComponents: [
      { name: '16-Bit PWM with Gamma Correction', desc: 'Hardware LED driver with 16-bit PWM dimming and logarithmic gamma (γ = 2.4) compensation to produce rich cinematic fades without banding.' },
      { name: 'sACN / Art-Net Integration', desc: 'Allows lighting directors to control the drone swarm directly from industry-standard GrandMA3 or ChamSys lighting consoles as a 3D pixel grid.' },
      { name: 'Volumetric Color Shaders', desc: 'Calculates per-drone RGB values dynamically based on 3D spatial field equations (e.g. radial color gradients or rotating rainbow planes).' }
    ],
    technicalSpecs: [
      { label: 'Luminous Flux Output', value: '1,800 Lumens per drone (CREE / Lumileds RGBW)' },
      { label: 'PWM Refresh Rate', value: '25 kHz (Flicker-free for 4K video recording)' },
      { label: 'Color Mixing Space', value: 'RGBW (Red, Green, Blue, 4000K Natural White)' },
      { label: 'Lighting Track Update Rate', value: '30 Hz pre-calculated timeline stream' }
    ]
  },
  {
    id: 'collision-avoidance-safety',
    title: 'Pre-Flight Deconfliction & Dual Geofence Safety',
    subtitle: '4D Spatio-Temporal Sphere Verification & Automated "Lights-Out" Abort',
    badge: 'SAFETY & GEOFENCING',
    overview: 'Real-time obstacle avoidance sensors (like LiDAR or ultrasonic) are disabled during synchronized shows because drones fly in close proximity (< 3.0m). Safety relies on mathematical 4D trajectory deconfliction during choreography, dual virtual containment geofences, and automated fail-safe reflexes.',
    keyComponents: [
      { name: 'Pre-Flight 4D Sphere Sweeper', desc: 'Simulates the entire flight with millisecond resolution, verifying that the bounding sphere (radius = 2.5m) around any drone never touches another.' },
      { name: 'Dual Geofence Containment', desc: 'Inner Geofence Shell (Warning & Immediate Return-to-Home) + Outer Geofence Shell (Hard Motor Kill over designated fall zone).' },
      { name: 'Automated "Lights-Out" Emergency Land', desc: 'If a drone deviates > 1.2m from its programmed waypoint or loses RTK lock, it instantly extinguishes its LEDs and descends straight down.' }
    ],
    technicalSpecs: [
      { label: 'Minimum Separation Distance', value: '2.5 meters (spherical safety volume)' },
      { label: 'Max Permissible Waypoint Drift', value: '1.2 meters before automatic fail-safe abort' },
      { label: 'Geofence Reaction Time', value: '< 50 ms to initiate motor power-down' },
      { label: 'Redundant Terminate Command', value: 'Out-of-band broadcast with dual-operator confirmation' }
    ]
  },
  {
    id: 'show-playback-conductor',
    title: 'Show Playback "Conductor" Engine',
    subtitle: 'Central Show Controller, Master Timeline Sync, & Drift Surveillance',
    badge: 'SHOW CONDUCTOR',
    overview: 'The Show Conductor is the ground control software interface responsible for pre-flight synchronization, launching the show timeline, broadcasting sync timecodes, and monitoring fleet compliance in real time.',
    keyComponents: [
      { name: 'Countdown & Synchronized Start', desc: 'Sends an armed start packet containing the exact future timestamp. Drones spool up motors and lift off simultaneously without network latency skew.' },
      { name: 'Pause & Hold Protocol', desc: 'Allows the conductor to freeze show animation mid-air if airspace infringement is detected; drones transition to stationary GPS position hold.' },
      { name: 'Live Drift Surveillance', desc: 'Continuously renders a real-time scatter plot of each drone position versus its programmed reference trajectory, highlighting any drifting units.' }
    ],
    technicalSpecs: [
      { label: 'Conductor Broadcast Rate', value: '20 Hz timecode beacon' },
      { label: 'Timeline Resolution', value: '1 ms microsecond counter' },
      { label: 'Emergency Abort Latency', value: '< 20 ms broadcast propagation' },
      { label: 'Formation Transition Time', value: '4 to 8 seconds typical' }
    ]
  },
  {
    id: 'tech-stack-recommendation',
    title: 'Recommended Technology Stack',
    subtitle: 'End-to-End Flight Control, Choreography, Ground Station, & 3D Web Dashboard',
    badge: 'TECH STACK',
    overview: 'A production drone light show architecture spans embedded avionics, high-performance trajectory math, low-latency radio broadcast, and 3D visualization.',
    keyComponents: [
      { name: 'Flight Controller & Autopilot', desc: 'Custom PX4 Autopilot v1.14 / ArduPilot on STM32H7 with dual u-blox ZED-F9P RTK GNSS and high-precision compass.' },
      { name: 'Onboard Companion Computer', desc: 'Espressif ESP32-S3 or Raspberry Pi CM4 handling high-speed LED PWM, eMMC trajectory storage, and broadcast timecode parsing.' },
      { name: 'Choreography & Trajectory Math', desc: 'Blender 4.x with Python 3.11, SciPy (linear_sum_assignment), NumPy, and custom B-spline trajectory deconfliction exporters.' },
      { name: 'Ground Show Conductor', desc: 'Rust / C++ for deterministic, zero-jitter UDP/Sub-GHz radio broadcasting with sub-millisecond timer resolution.' },
      { name: 'Real-Time Monitoring Dashboard', desc: 'React 19 + TypeScript + WebGL / Three.js for 3D real-time volumetric fleet visualization and deviation alerting.' }
    ],
    technicalSpecs: [
      { label: 'Avionics RTOS', value: 'NuttX (PX4) + FreeRTOS (Companion ESP32)' },
      { label: 'Choreography Tooling', value: 'Blender + Python + SciPy LAPJV Solver' },
      { label: 'Broadcast Radio Transceiver', value: 'Semtech SX1262 / SX1280 (2.4 GHz LoRa / FSK)' },
      { label: '3D Telemetry Dashboard', value: 'Three.js / WebGL / React + Vite' }
    ]
  }
];
