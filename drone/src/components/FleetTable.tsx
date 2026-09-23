import React, { useState } from 'react';
import { DroneState} from '../types';
import { Search, Filter, Battery, Radio, ExternalLink } from 'lucide-react';

interface FleetTableProps {
  drones: DroneState[];
  selectedDroneId: string | null;
  onSelectDrone: (id: string | null) => void;
}

export const FleetTable: React.FC<FleetTableProps> = ({ drones, selectedDroneId, onSelectDrone }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredDrones = drones.filter(d => {
    const matchesSearch = d.callsign.toLowerCase().includes(searchTerm.toLowerCase()) || d.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div id="fleet-telemetry-table" className="bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col text-xs text-slate-300 shadow-xl overflow-hidden backdrop-blur">
      {/* Header Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search callsign or ID (e.g. DRN-042)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {['ALL', 'TRANSIT', 'ON_TASK', 'RTH', 'CHARGING', 'COMM_LOST'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                statusFilter === status
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto max-h-[480px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
              <th className="p-2.5 pl-4">Callsign / ID</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5">Alt (Z)</th>
              <th className="p-2.5">Speed</th>
              <th className="p-2.5">Battery SOC</th>
              <th className="p-2.5">RF / Mesh</th>
              <th className="p-2.5">Sensor Fusion</th>
              <th className="p-2.5 pr-4 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-mono">
            {filteredDrones.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  No drone units found matching criteria.
                </td>
              </tr>
            ) : (
              filteredDrones.map(d => {
                const isSelected = d.id === selectedDroneId;
                return (
                  <tr 
                    key={d.id}
                    onClick={() => onSelectDrone(d.id)}
                    className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                      isSelected ? 'bg-sky-950/40 border-l-2 border-sky-400' : ''
                    }`}
                  >
                    <td className="p-2.5 pl-4">
                      <div className="font-bold text-slate-200 text-xs">{d.callsign}</div>
                      <div className="text-[10px] text-slate-500">{d.id}</div>
                    </td>

                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        d.status === 'ON_TASK'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : d.status === 'TRANSIT'
                            ? 'bg-sky-950 text-sky-300 border border-sky-800'
                            : d.status === 'RTH'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : d.status === 'COMM_LOST'
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : 'bg-slate-800 text-slate-400'
                      }`}>
                        {d.status}
                      </span>
                    </td>

                    <td className="p-2.5 text-slate-300">
                      {d.z.toFixed(0)}m
                    </td>

                    <td className="p-2.5 text-slate-300">
                      {d.speed.toFixed(1)} m/s
                    </td>

                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <Battery className={`w-3.5 h-3.5 ${d.battery > 40 ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span className={`font-bold ${d.battery > 40 ? 'text-slate-200' : 'text-amber-400'}`}>
                          {d.battery.toFixed(0)}%
                        </span>
                      </div>
                    </td>

                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Radio className={`w-3 h-3 ${d.hasGcsUplink ? 'text-sky-400' : 'text-amber-400'}`} />
                        <span className="text-[11px] text-slate-300">
                          {d.hasGcsUplink ? 'Uplink 5G' : `${d.meshConnectedTo.length} Mesh Peers`}
                        </span>
                      </div>
                    </td>

                    <td className="p-2.5">
                      <span className="text-[10px] text-emerald-400 font-sans">
                        {d.sensorStatus.rtkGps}
                      </span>
                    </td>

                    <td className="p-2.5 pr-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDrone(d.id);
                        }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300"
                        title="View Full Edge Agent Telemetry"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
