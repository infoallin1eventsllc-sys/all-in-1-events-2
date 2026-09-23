import React from 'react';
import { DroneState, Task } from '../types';
import { X, Battery, Radio, Shield, Navigation, AlertTriangle, CheckCircle2, RotateCcw, Cpu } from 'lucide-react';

interface DroneDetailModalProps {
  drone: DroneState | null;
  assignedTask?: Task;
  onClose: () => void;
  onCommandRth: (droneId: string) => void;
  onCommandEmergencyLand: (droneId: string) => void;
}

export const DroneDetailModal: React.FC<DroneDetailModalProps> = ({
  drone,
  assignedTask,
  onClose,
  onCommandRth,
  onCommandEmergencyLand,
}) => {
  if (!drone) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="drone-detail-modal"
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300 max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-slate-100">{drone.callsign}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300">
                  {drone.id}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  drone.status === 'ON_TASK'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : drone.status === 'TRANSIT'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800'
                      : drone.status === 'RTH'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : drone.status === 'COMM_LOST'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-slate-800 text-slate-400'
                }`}>
                  {drone.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Onboard Autonomy: ROS 2 BehaviorTree Node Graph + PX4 v1.14</p>
            </div>
          </div>

          <button
            id="close-drone-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-slate-800/60">
          {/* 1. Real-Time Flight Kinematics & Position */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-sky-400" />
              <span>KINEMATICS &amp; 3D SPATIAL TELEMETRY</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono">ALTITUDE (MSL)</span>
                <div className="text-base font-bold font-mono text-sky-400 mt-0.5">{drone.z.toFixed(1)} m</div>
                <span className="text-[9px] text-slate-500">Corridor: Safe [15-60m]</span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono">GROUND SPEED</span>
                <div className="text-base font-bold font-mono text-slate-100 mt-0.5">{drone.speed.toFixed(1)} m/s</div>
                <span className="text-[9px] text-slate-500">Max: {drone.maxSpeed.toFixed(1)} m/s</span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono">HEADING</span>
                <div className="text-base font-bold font-mono text-slate-100 mt-0.5">{Math.round(drone.heading)}°</div>
                <span className="text-[9px] text-slate-500">Magnetic True North</span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono">COORDINATES</span>
                <div className="text-xs font-bold font-mono text-slate-200 mt-1">
                  [{drone.x.toFixed(1)}, {drone.y.toFixed(1)}]
                </div>
                <span className="text-[9px] text-slate-500">Local UTM Grid</span>
              </div>
            </div>
          </div>

          {/* 2. Edge Behavior Tree & Autonomy Agent State */}
          <div className="pt-4 space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <span>LOCAL AGENT AUTONOMY &amp; COLLISION AVOIDANCE</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Flight Mode:</span>
                  <span className="font-mono font-bold text-sky-400">{drone.flightMode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ORCA 3D Reflex:</span>
                  <span className={`font-mono font-bold ${drone.localAvoidanceActive ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                    {drone.localAvoidanceActive ? 'EVADING COLLISION' : 'CLEAR HORIZON'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Airspace Separation:</span>
                  <span className="font-mono text-slate-300">14.0m Safety Bubble</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Local Cycle Rate:</span>
                  <span className="font-mono text-slate-300">50 Hz Companion / 400 Hz PX4</span>
                </div>
              </div>

              {/* Sensor Fusion Health */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">RTK GNSS:</span>
                  <span className="font-mono text-emerald-400">{drone.sensorStatus.rtkGps}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">360° LiDAR:</span>
                  <span className="font-mono text-emerald-400">{drone.sensorStatus.lidar}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Dual VectorNav IMU:</span>
                  <span className="font-mono text-emerald-400">{drone.sensorStatus.imu}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Optical Flow / VIO:</span>
                  <span className="font-mono text-sky-400">{drone.sensorStatus.opticalFlow}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Dynamic Energy Budgeting & Battery Health */}
          <div className="pt-4 space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
              <span>DYNAMIC ENERGY BUDGETING &amp; RESERVE MARGIN</span>
            </h4>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Remaining Charge:</span>
                <span className="font-mono text-base font-bold text-emerald-400">{drone.battery.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    drone.battery > 40 ? 'bg-emerald-500' : drone.battery > 20 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${drone.battery}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                <div>Temp: <strong className="text-slate-200">{drone.temperatureC}°C</strong></div>
                <div>Dynamic RTH Floor: <strong className="text-amber-400">20.0%</strong></div>
                <div>Safe Egress Corridor: <strong className="text-emerald-400">ACTIVE</strong></div>
              </div>
            </div>
          </div>

          {/* 4. Communication & Ad-Hoc Mesh Status */}
          <div className="pt-4 space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>DUAL-TIER COMMUNICATION &amp; MESH RELAY</span>
            </h4>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Direct GCS Cellular/RF Uplink:</span>
                <span className={`font-mono font-bold ${drone.hasGcsUplink ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {drone.hasGcsUplink ? 'ONLINE (PRIMARY)' : 'DROPPED (RELAYING)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Signal Quality / Packet Loss:</span>
                <span className="font-mono text-slate-200">
                  {drone.commsQuality.toFixed(0)}% quality | {drone.packetLossRate.toFixed(1)}% loss
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">P2P Mesh Peers in Radio Range:</span>
                <span className="font-mono text-sky-400">
                  {drone.meshConnectedTo.length > 0 ? drone.meshConnectedTo.join(', ') : 'None (Direct link only)'}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Cryptographic Hardware Security & mTLS Identity */}
          <div className="pt-4 space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>CRYPTOGRAPHIC HARDWARE SECURITY &amp; DTLS 1.3</span>
            </h4>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Hardware HSM Element:</span>
                <span className="text-emerald-400 font-bold">{drone.security?.authenticatedHardwareUid || 'ATECC608B-1001'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">DTLS 1.3 Datalink State:</span>
                <span className="text-sky-300 font-bold">{drone.security?.dtlsSessionActive ? 'MUTUALLY AUTHENTICATED (1-RTT)' : 'PLAINTEXT'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Client Certificate Fingerprint:</span>
                <span className="text-slate-400 text-[10px]">{drone.security?.certFingerprint || 'SHA256:7B:4F:92:1A:CC'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Cipher &amp; Anti-Replay:</span>
                <span className="text-slate-300">TLS_AES_128_GCM &bull; Epoch: {drone.security?.antiReplayEpoch || 1}</span>
              </div>
            </div>
          </div>

          {/* 5. Assigned Task Details (if any) */}
          {assignedTask && (
            <div className="pt-4 space-y-2">
              <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>ACTIVE TASK: {assignedTask.title}</span>
              </h4>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Task Type &amp; Priority:</span>
                  <span className="font-mono text-slate-200">{assignedTask.type} ({assignedTask.priority})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Mission Progress:</span>
                  <span className="font-mono font-bold text-emerald-400">{Math.round(assignedTask.progress)}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${assignedTask.progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 font-mono">
            Ground Station Override Authority
          </div>
          <div className="flex items-center gap-2">
            <button
              id="cmd-force-rth"
              onClick={() => {
                onCommandRth(drone.id);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Command RTH</span>
            </button>

            <button
              id="cmd-emergency-touchdown"
              onClick={() => {
                onCommandEmergencyLand(drone.id);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold flex items-center gap-1.5 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Emergency Land</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
