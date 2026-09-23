import React, { useState } from 'react';
import { 
  X, 
  Laptop, 
  Wind, 
  Copy,
  Check
} from 'lucide-react';
import { GazeboSITLConfig } from '../types';

interface GazeboSITLModalProps {
  onClose: () => void;
  sitlConfig: GazeboSITLConfig;
  onUpdateConfig: (config: GazeboSITLConfig) => void;
  onToggleSITL: () => void;
  droneCount: number;
}

export const GazeboSITLModal: React.FC<GazeboSITLModalProps> = ({
  onClose,
  sitlConfig,
  onUpdateConfig,
  onToggleSITL,
  droneCount,
}) => {
  const [activeTab, setActiveTab] = useState<'CONTROLS' | 'ARCHITECTURE' | 'ROS2_BRIDGE'>('CONTROLS');
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="gazebo-sitl-modal"
        className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300 max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              sitlConfig.active 
                ? 'bg-purple-950/80 border-purple-700 text-purple-400' 
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">Gazebo &amp; PX4 SITL Multi-Vehicle Simulation Engine</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  sitlConfig.active 
                    ? 'bg-purple-950 text-purple-300 border-purple-800' 
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {sitlConfig.active ? 'SITL DIGITAL TWIN ACTIVE' : 'LIVE TELEMETRY MODE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Rigorous multi-agent pre-flight testing: ODE physics, ROS 2 bridges, sensor fault injection, &amp; wind turbulence
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {[
              { id: 'CONTROLS', label: 'Simulation Environment Controls' },
              { id: 'ARCHITECTURE', label: 'Cluster Orchestration Architecture' },
              { id: 'ROS2_BRIDGE', label: 'ROS 2 / Micro-XRCE Bridge' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                  activeTab === tab.id
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div>
            <button
              onClick={onToggleSITL}
              className={`px-3 py-1.5 rounded-lg font-mono text-[11px] font-bold border transition-colors ${
                sitlConfig.active
                  ? 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              {sitlConfig.active ? 'Disconnect SITL' : 'Connect Gazebo SITL'}
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: CONTROLS */}
          {activeTab === 'CONTROLS' && (
            <div className="space-y-6">
              {/* Active Status Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400">SIMULATED AIRFRAME INSTANCES</span>
                  <div className="text-lg font-bold font-mono text-purple-400">
                    {droneCount} Iris Quadrotors
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Headless Gazebo Harmonic</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400">LOCKSTEP PHYSICS SYNC</span>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {sitlConfig.lockstepSyncLagMs} ms lag
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Real-time factor: {sitlConfig.realtimeFactor}x</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400">MICRO-XRCE-DDS BRIDGE</span>
                  <div className="text-lg font-bold font-mono text-sky-400">
                    {sitlConfig.ros2BridgeConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Topic rate: 250 Hz physics</div>
                </div>
              </div>

              {/* Environmental Controls */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="font-bold text-slate-100 text-xs uppercase tracking-wider text-purple-400 flex items-center gap-2">
                  <Wind className="w-4 h-4" />
                  <span>Atmospheric &amp; Aerodynamic Turbulence Simulation</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Wind Speed */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-300">Dryden Wind Turbulence Speed:</span>
                      <strong className="text-purple-300">{sitlConfig.windSpeedMps.toFixed(1)} m/s</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="15"
                      step="0.5"
                      value={sitlConfig.windSpeedMps}
                      onChange={(e) => onUpdateConfig({ ...sitlConfig, windSpeedMps: parseFloat(e.target.value) })}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Calm (0 m/s)</span>
                      <span>Moderate (7 m/s)</span>
                      <span>Severe Gusts (15 m/s)</span>
                    </div>
                  </div>

                  {/* Wind Heading */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-300">Wind Direction Vector:</span>
                      <strong className="text-purple-300">{sitlConfig.windHeadingDeg}&deg; (SW)</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={sitlConfig.windHeadingDeg}
                      onChange={(e) => onUpdateConfig({ ...sitlConfig, windHeadingDeg: parseInt(e.target.value) })}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>0&deg; North</span>
                      <span>90&deg; East</span>
                      <span>180&deg; South</span>
                      <span>270&deg; West</span>
                    </div>
                  </div>
                </div>

                {/* Physics Options */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={sitlConfig.sensorNoiseEnabled}
                        onChange={(e) => onUpdateConfig({ ...sitlConfig, sensorNoiseEnabled: e.target.checked })}
                        className="rounded accent-purple-500"
                      />
                      <span>Inject Sensor Gaussian IMU Noise &amp; GNSS Multipath Error</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs font-mono">Physics Engine:</span>
                    <select
                      value={sitlConfig.physicsEngine}
                      onChange={(e) => onUpdateConfig({ ...sitlConfig, physicsEngine: e.target.value as any })}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200"
                    >
                      <option value="DART">DART (Featherstone Multibody)</option>
                      <option value="ODE">ODE (Open Dynamics Engine)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ARCHITECTURE */}
          {activeTab === 'ARCHITECTURE' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-xs">Multi-Vehicle Cloud Cluster SITL Topology</h4>
                  <p className="text-[11px] text-slate-400">Headless containerized PX4 swarm execution running lockstep physics</p>
                </div>
                <button
                  onClick={() => handleCopy(`apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: gazebo-px4-swarm-cluster
spec:
  replicas: 10 # 10 pods x 10 drones = 100 units
  template:
    spec:
      containers:
      - name: px4-sitl
        image: aero/px4-gazebo-harmonic:v1.14`)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied Yaml' : 'Copy K8s Manifest'}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-[11px] text-slate-300 leading-relaxed">
                <div className="text-purple-400 font-bold uppercase">100–500 Swarm SITL Scaling Pipeline:</div>
                <ol className="list-decimal list-inside space-y-2 text-slate-400">
                  <li>
                    <strong className="text-slate-200">Headless Containerization:</strong> Gazebo is run without an OGRE GUI renderer (<code className="text-sky-300">gz sim -s -r</code>) on multi-core cloud instances (e.g. AWS c6i.16xlarge or on-prem AMD EPYC servers), conserving 85% CPU/GPU overhead.
                  </li>
                  <li>
                    <strong className="text-slate-200">Lockstep Physics Synchronization:</strong> To prevent simulator clock drift across 100 drones, PX4 and Gazebo synchronize via lockstep time barriers. Time only steps forward once all 100 PX4 flight controller threads have consumed their sensor packets.
                  </li>
                  <li>
                    <strong className="text-slate-200">Virtual Zenoh/Micro-XRCE Router:</strong> Each simulated drone communicates over virtual network bridges identical to the real physical drone hardware, testing the exact same Go/Rust Fleet Coordinator and React Tactical Radar code.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 3: ROS2_BRIDGE */}
          {activeTab === 'ROS2_BRIDGE' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-100 text-xs">Simulated ROS 2 Sensor &amp; Actuator Topic Registry</h4>
                <p className="text-[11px] text-slate-400">Standardized ROS 2 DDS topics bridged between Gazebo physics and the edge autonomy agent</p>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 font-mono text-[10px] text-slate-400 uppercase">
                      <th className="p-2.5">Topic Name</th>
                      <th className="p-2.5">Message Type</th>
                      <th className="p-2.5">Publish Rate</th>
                      <th className="p-2.5">Simulated Physics Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 font-mono text-slate-300">
                    <tr>
                      <td className="p-2.5 text-purple-400">/world/model/drn_N/odometry</td>
                      <td className="p-2.5 text-slate-400">nav_msgs/msg/Odometry</td>
                      <td className="p-2.5">100 Hz</td>
                      <td className="p-2.5 text-slate-400">DART 3D rigid-body kinematics</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-purple-400">/drn_N/sensor/imu/data</td>
                      <td className="p-2.5 text-slate-400">sensor_msgs/msg/Imu</td>
                      <td className="p-2.5">250 Hz</td>
                      <td className="p-2.5 text-slate-400">6-DOF Accelerometer &amp; Gyro with Gaussian noise</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-purple-400">/drn_N/sensor/lidar/scan</td>
                      <td className="p-2.5 text-slate-400">sensor_msgs/msg/LaserScan</td>
                      <td className="p-2.5">20 Hz</td>
                      <td className="p-2.5 text-slate-400">360&deg; raycast collision distance</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-purple-400">/drn_N/fmu/in/trajectory_setpoint</td>
                      <td className="p-2.5 text-slate-400">px4_msgs/msg/TrajectorySetpoint</td>
                      <td className="p-2.5">50 Hz</td>
                      <td className="p-2.5 text-emerald-400">Autonomous ORCA Local Planner Command</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
