import React from 'react';
import { NetworkTopology } from '../types';
import { Play, Pause, FastForward, RotateCcw, AlertOctagon, BatteryWarning, WifiOff, Compass, Shield, Radio, Sparkles, Lock, Database, Laptop } from 'lucide-react';
import { GroundStationTower } from '../hooks/useSwarmSimulation';

interface FleetControlsProps {
  droneCount: number;
  onSetFleetScale: (count: number) => void;
  topology: NetworkTopology;
  onSetTopology: (top: NetworkTopology) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  simulationSpeed: number;
  onSetSpeed: (speed: number) => void;
  towers: GroundStationTower[];
  onDispatchPreset: (preset: 'SEARCH_GRID' | 'PERIMETER_SWEEP' | 'CARGO_TRANSIT' | 'SURVEILLANCE_FORMATION') => void;
  onInjectCommsSever: (towerId: string) => void;
  onInjectLowBattery: () => void;
  onInjectMalfunction: () => void;
  onInjectGpsSpoofing: () => void;
  onOpenSecurityModal?: () => void;
  onOpenDatabaseModal?: () => void;
  onOpenSITLModal?: () => void;
  isDTLSEnforced?: boolean;
  isSITLActive?: boolean;
  databaseEngine?: string;
}

export const FleetControls: React.FC<FleetControlsProps> = ({
  droneCount,
  onSetFleetScale,
  topology,
  onSetTopology,
  isPlaying,
  onTogglePlay,
  simulationSpeed,
  onSetSpeed,
  towers,
  onDispatchPreset,
  onInjectCommsSever,
  onInjectLowBattery,
  onInjectMalfunction,
  onInjectGpsSpoofing,
  onOpenSecurityModal,
  onOpenDatabaseModal,
  onOpenSITLModal,
  isDTLSEnforced = true,
  isSITLActive = false,
  databaseEngine = 'TimescaleDB',
}) => {
  return (
    <div id="fleet-controls-card" className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-xs text-slate-300 backdrop-blur shadow-xl">
      {/* 1. Subsystem Architecture Explorers (Security, Database, SITL) */}
      <div className="flex flex-col gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-200 tracking-wide text-xs">SUBSYSTEM ARCHITECTURE LABS:</span>
          <span className="text-[10px] font-mono text-sky-400">RFC &bull; ISO &bull; STANAG</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Security Modal Button */}
          <button
            id="open-security-modal-btn"
            onClick={onOpenSecurityModal}
            className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/80 hover:bg-emerald-950/20 text-left transition-all group"
          >
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-[11px]">
              <Lock className="w-3.5 h-3.5" />
              <span>DTLS 1.3</span>
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-slate-300">
              {isDTLSEnforced ? 'mTLS Enforced' : 'Plaintext Mode'}
            </div>
          </button>

          {/* Database Modal Button */}
          <button
            id="open-database-modal-btn"
            onClick={onOpenDatabaseModal}
            className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/80 hover:bg-sky-950/20 text-left transition-all group"
          >
            <div className="flex items-center gap-1.5 text-sky-400 font-bold font-mono text-[11px]">
              <Database className="w-3.5 h-3.5" />
              <span>STORAGE</span>
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-slate-300 truncate">
              {databaseEngine === 'TIMESCALE_POSTGRES' ? 'TimescaleDB' : databaseEngine === 'SCYLLADB_CASSANDRA' ? 'ScyllaDB' : 'InfluxDB v3'}
            </div>
          </button>

          {/* SITL Modal Button */}
          <button
            id="open-sitl-modal-btn"
            onClick={onOpenSITLModal}
            className={`p-2 rounded-lg border text-left transition-all group ${
              isSITLActive 
                ? 'bg-purple-950/60 border-purple-600/80 text-purple-200' 
                : 'bg-slate-950 border-slate-800 hover:border-purple-500/80 hover:bg-purple-950/20 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-1.5 text-purple-400 font-bold font-mono text-[11px]">
              <Laptop className="w-3.5 h-3.5" />
              <span>SITL SIM</span>
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-slate-300">
              {isSITLActive ? 'Gazebo DART' : 'Real Telemetry'}
            </div>
          </button>
        </div>
      </div>
      {/* 1. Fleet Scale & Simulation Engine Rate */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 tracking-wide">FLEET SCALE:</span>
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            {[100, 250, 500].map(count => (
              <button
                key={count}
                id={`scale-btn-${count}`}
                onClick={() => onSetFleetScale(count)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                  droneCount === count
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {count} UNITS
              </button>
            ))}
          </div>
        </div>

        {/* Engine Playback & Speed */}
        <div className="flex items-center gap-2">
          <button
            id="simulation-toggle-play"
            onClick={onTogglePlay}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
              isPlaying
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'Pause' : 'Resume'}</span>
          </button>

          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            {[1, 2, 4].map(spd => (
              <button
                key={spd}
                id={`sim-speed-${spd}x`}
                onClick={() => onSetSpeed(spd)}
                className={`px-2 py-1 rounded font-mono text-[11px] font-bold ${
                  simulationSpeed === spd
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            id="reboot-fleet-button"
            onClick={() => onSetFleetScale(droneCount)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Reset & Re-initialize Fleet to Home Pads"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Communication Topology Switcher */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-slate-400">
          <span className="font-semibold text-slate-200">COMMUNICATION TOPOLOGY:</span>
          <span className="font-mono text-[11px] text-sky-400">Low-Latency Pub/Sub (Zenoh / UDP)</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            id="topology-hybrid"
            onClick={() => onSetTopology('HYBRID_MESH')}
            className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
              topology === 'HYBRID_MESH'
                ? 'bg-sky-950/60 border-sky-500/80 text-sky-200 shadow-md shadow-sky-500/10'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-100">
              <Radio className="w-3.5 h-3.5 text-sky-400" />
              <span>Hybrid 5G + 802.11s Mesh</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">Cellular primary + peer relay when signal drops. Recommended.</p>
          </button>

          <button
            id="topology-hub-spoke"
            onClick={() => onSetTopology('HUB_SPOKE_CELLULAR')}
            className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
              topology === 'HUB_SPOKE_CELLULAR'
                ? 'bg-sky-950/60 border-sky-500/80 text-sky-200 shadow-md shadow-sky-500/10'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-100">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hub &amp; Spoke Direct</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">Direct GCS link only. Vulnerable to RF blindspots.</p>
          </button>

          <button
            id="topology-peer-mesh"
            onClick={() => onSetTopology('PEER_MESH_ONLY')}
            className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
              topology === 'PEER_MESH_ONLY'
                ? 'bg-sky-950/60 border-sky-500/80 text-sky-200 shadow-md shadow-sky-500/10'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-100">
              <Radio className="w-3.5 h-3.5 text-teal-400" />
              <span>Pure P2P Swarm Mesh</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">Multi-hop ad-hoc relay. Zero central cellular reliance.</p>
          </button>
        </div>
      </div>

      {/* 3. Task Allocation & Mission Dispatch */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-slate-400">
          <span className="font-semibold text-slate-200">DISPATCH SWARM MISSIONS:</span>
          <span className="font-mono text-[11px] text-emerald-400">Distributed Market Auction (CNP)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            id="dispatch-search-grid"
            onClick={() => onDispatchPreset('SEARCH_GRID')}
            className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 text-left transition-colors flex items-center gap-2 group"
          >
            <Compass className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <div>
              <div className="font-medium text-slate-200 text-xs">Search &amp; Rescue</div>
              <div className="text-[10px] text-slate-500">8 parallel grid lanes</div>
            </div>
          </button>

          <button
            id="dispatch-perimeter-patrol"
            onClick={() => onDispatchPreset('PERIMETER_SWEEP')}
            className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-sky-500/50 hover:bg-sky-950/20 text-left transition-colors flex items-center gap-2 group"
          >
            <Shield className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
            <div>
              <div className="font-medium text-slate-200 text-xs">Perimeter Patrol</div>
              <div className="text-[10px] text-slate-500">Geofence ring coverage</div>
            </div>
          </button>

          <button
            id="dispatch-cargo-transit"
            onClick={() => onDispatchPreset('CARGO_TRANSIT')}
            className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 text-left transition-colors flex items-center gap-2 group"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
            <div>
              <div className="font-medium text-slate-200 text-xs">Logistics Air Corridors</div>
              <div className="text-[10px] text-slate-500">6 parcel delivery vectors</div>
            </div>
          </button>

          <button
            id="dispatch-hex-constellation"
            onClick={() => onDispatchPreset('SURVEILLANCE_FORMATION')}
            className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 hover:bg-amber-950/20 text-left transition-colors flex items-center gap-2 group"
          >
            <Radio className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <div>
              <div className="font-medium text-slate-200 text-xs">Sensor Constellation</div>
              <div className="text-[10px] text-slate-500">Hexagonal radar ring</div>
            </div>
          </button>
        </div>
      </div>

      {/* 4. Failure Injection & Resiliency Testbed */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-slate-400">
          <span className="font-semibold text-rose-300 flex items-center gap-1">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            <span>FAILURE INJECTION &amp; RESILIENCY TESTBED:</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">Auto-Mitigation Verification</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Sever Alpha Tower */}
          <button
            id="inject-comms-drop"
            onClick={() => onInjectCommsSever('GCS-NORTH')}
            className="p-2 rounded-lg bg-slate-950/80 border border-rose-900/40 hover:border-rose-500 hover:bg-rose-950/20 text-left transition-colors flex items-center gap-2"
          >
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div className="font-medium text-rose-200 text-xs">
                {towers.find(t => t.id === 'GCS-NORTH')?.active ? 'Sever North Tower' : 'Restore North Tower'}
              </div>
              <div className="text-[10px] text-slate-400">Tests P2P Mesh Fallback</div>
            </div>
          </button>

          {/* Force Low Battery */}
          <button
            id="inject-low-battery"
            onClick={onInjectLowBattery}
            className="p-2 rounded-lg bg-slate-950/80 border border-amber-900/40 hover:border-amber-500 hover:bg-amber-950/20 text-left transition-colors flex items-center gap-2"
          >
            <BatteryWarning className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="font-medium text-amber-200 text-xs">Force Low Battery</div>
              <div className="text-[10px] text-slate-400">Auto RTH &amp; Task Handoff</div>
            </div>
          </button>

          {/* Propulsion Fault */}
          <button
            id="inject-propulsion-fault"
            onClick={onInjectMalfunction}
            className="p-2 rounded-lg bg-slate-950/80 border border-rose-900/40 hover:border-rose-500 hover:bg-rose-950/20 text-left transition-colors flex items-center gap-2"
          >
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div className="font-medium text-rose-200 text-xs">Motor Anomaly</div>
              <div className="text-[10px] text-slate-400">Controlled Descent Hold</div>
            </div>
          </button>

          {/* GPS Spoofing */}
          <button
            id="inject-gps-spoof"
            onClick={onInjectGpsSpoofing}
            className="p-2 rounded-lg bg-slate-950/80 border border-purple-900/40 hover:border-purple-500 hover:bg-purple-950/20 text-left transition-colors flex items-center gap-2"
          >
            <Compass className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <div className="font-medium text-purple-200 text-xs">Jam GPS / RTK</div>
              <div className="text-[10px] text-slate-400">Switches to Optical Flow</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
