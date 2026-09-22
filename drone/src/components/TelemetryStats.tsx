import React from 'react';
import { FleetMetrics, NetworkTopology } from '../types';
import { Activity, Battery, Radio, ShieldCheck, Zap, AlertTriangle, Layers, Navigation } from 'lucide-react';

interface TelemetryStatsProps {
  metrics: FleetMetrics;
  topology: NetworkTopology;
}

export const TelemetryStats: React.FC<TelemetryStatsProps> = ({ metrics, topology }) => {
  return (
    <div id="telemetry-stats-bar" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 w-full">
      {/* 1. Fleet Scale */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>Fleet Units</span>
          <Layers className="w-3.5 h-3.5 text-sky-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-slate-100">{metrics.totalDrones}</span>
          <span className="text-[10px] text-sky-400 font-mono">({metrics.airborneCount} airborne)</span>
        </div>
        <div className="w-full bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
          <div 
            className="bg-sky-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${(metrics.airborneCount / metrics.totalDrones) * 100}%` }}
          />
        </div>
      </div>

      {/* 2. On Mission */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>Active Tasks</span>
          <Navigation className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-emerald-400">{metrics.onTaskCount}</span>
          <span className="text-[10px] text-slate-400 font-mono">({metrics.tasksCompleted} done)</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono truncate">Market Auction pool</span>
      </div>

      {/* 3. Average Battery */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>Avg Battery</span>
          <Battery className={`w-3.5 h-3.5 ${metrics.avgBattery > 40 ? 'text-emerald-400' : 'text-amber-400'}`} />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className={`text-xl font-bold font-mono ${metrics.avgBattery > 40 ? 'text-slate-100' : 'text-amber-400'}`}>
            {metrics.avgBattery}%
          </span>
          <span className="text-[10px] text-slate-400 font-mono">({metrics.chargingCount} pads)</span>
        </div>
        <div className="w-full bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${metrics.avgBattery > 40 ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${metrics.avgBattery}%` }}
          />
        </div>
      </div>

      {/* 4. Throughput (msgs/sec) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>Throughput</span>
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-cyan-300">{metrics.throughputMsgsPerSec.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 font-mono">msg/s</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">@ 20 Hz delta-sync</span>
      </div>

      {/* 5. P99 Latency */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>P99 Jitter</span>
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-indigo-300">{metrics.p99LatencyMs}</span>
          <span className="text-[10px] text-slate-400 font-mono">ms</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Zenoh / UDP stream</span>
      </div>

      {/* 6. ORCA Conflicts Avoided */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>ORCA Avoided</span>
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-teal-300">{metrics.conflictsResolvedCount}</span>
          <span className="text-[10px] text-emerald-400 font-mono">0 hits</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Decentralized 50Hz</span>
      </div>

      {/* 7. Active Mesh Links */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>P2P Mesh Links</span>
          <Radio className="w-3.5 h-3.5 text-sky-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-sky-300">{metrics.meshLinksActive}</span>
          <span className="text-[10px] text-slate-400 font-mono">relays</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{topology.replace('_', ' ')}</span>
      </div>

      {/* 8. Degraded / Failsafe */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>Failsafe / RTH</span>
          <AlertTriangle className={`w-3.5 h-3.5 ${metrics.degradedCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className={`text-xl font-bold font-mono ${metrics.degradedCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {metrics.degradedCount + metrics.rthCount}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">auto-safe</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Cascade re-auction</span>
      </div>
    </div>
  );
};
