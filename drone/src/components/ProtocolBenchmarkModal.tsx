import React, { useState } from 'react';
import { X, BarChart2, Zap} from 'lucide-react';

interface ProtocolBenchmarkModalProps {
  onClose: () => void;
  droneCount: number;
}

export const ProtocolBenchmarkModal: React.FC<ProtocolBenchmarkModalProps> = ({ onClose, droneCount }) => {
  const [selectedHz, setSelectedHz] = useState<number>(20);

  // Protocols data
  const protocols = [
    {
      name: 'Eclipse Zenoh (Recommended)',
      type: 'Zero-Overhead Pub/Sub/Query',
      headerBytes: 4,
      payloadBytes: 28,
      totalBytes: 32,
      meshSupport: 'Native Peer-to-Peer & Brokered',
      ramFootprintMb: 4.2,
      latencyMs: '1.2 ms',
      verdict: 'BEST FOR 100-500+ SWARMS: Smallest header, multi-hop routing, minimal jitter.',
      recommended: true,
    },
    {
      name: 'Micro-XRCE-DDS (eProsima)',
      type: 'Client-Agent RTPS / DDS',
      headerBytes: 12,
      payloadBytes: 32,
      totalBytes: 44,
      meshSupport: 'Agent-mediated',
      ramFootprintMb: 6.8,
      latencyMs: '2.4 ms',
      verdict: 'Standard for PX4 to ROS 2 on companion computer, but heavier across wide RF mesh.',
      recommended: false,
    },
    {
      name: 'MQTT v5 (EMQX Broker)',
      type: 'Central Broker Pub/Sub (TCP)',
      headerBytes: 28,
      payloadBytes: 84, // JSON or binary
      totalBytes: 112,
      meshSupport: 'Broker Only (Requires TCP route)',
      ramFootprintMb: 14.5,
      latencyMs: '18.5 ms',
      verdict: 'Good for GCS web dashboards, but breaks under mesh packet loss and multi-hop delay.',
      recommended: false,
    },
    {
      name: 'Standard ROS 2 CycloneDDS',
      type: 'Peer-to-Peer UDP Multicast',
      headerBytes: 64,
      payloadBytes: 48,
      totalBytes: 112,
      meshSupport: 'Poor (Multicast storm saturated)',
      ramFootprintMb: 45.0,
      latencyMs: '8.0 ms',
      verdict: 'NOT RECOMMENDED FOR SWARMS: Multicast discovery overwhelms wireless links at >30 robots.',
      recommended: false,
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="protocol-benchmark-modal"
        className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300 max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Swarm Protocol &amp; Bandwidth Scalability Benchmark</h3>
              <p className="text-[11px] text-slate-400">Quantitative comparison of pub/sub architectures under 100–500 unit load</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Rate Selector */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="font-semibold text-slate-200">Telemetry Publishing Rate:</span>
              <p className="text-[11px] text-slate-500">Calculates fleet bandwidth for current {droneCount} active drones</p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
              {[10, 20, 50].map(hz => (
                <button
                  key={hz}
                  onClick={() => setSelectedHz(hz)}
                  className={`px-2.5 py-1 rounded font-mono font-bold text-[11px] transition-colors ${
                    selectedHz === hz ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {hz} Hz
                </button>
              ))}
            </div>
          </div>

          {/* Scalability Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 font-mono text-[10px] text-slate-400 uppercase">
                  <th className="p-3">Protocol</th>
                  <th className="p-3">Packet Size</th>
                  <th className="p-3">Fleet Bandwidth ({droneCount} units @ {selectedHz}Hz)</th>
                  <th className="p-3">P2P Mesh Support</th>
                  <th className="p-3">RAM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {protocols.map((p, idx) => {
                  const bytesPerSec = droneCount * selectedHz * p.totalBytes;
                  const mbps = ((bytesPerSec * 8) / (1024 * 1024)).toFixed(2);

                  return (
                    <tr key={idx} className={p.recommended ? 'bg-sky-950/20' : 'bg-slate-950/40'}>
                      <td className="p-3">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          {p.name}
                          {p.recommended && (
                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-mono font-bold">
                              OPTIMAL
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">{p.type}</div>
                      </td>

                      <td className="p-3 font-mono text-slate-200">
                        {p.totalBytes} bytes
                        <span className="block text-[10px] text-slate-500">({p.headerBytes}B hdr + {p.payloadBytes}B pay)</span>
                      </td>

                      <td className="p-3 font-mono font-bold text-sky-400">
                        {mbps} Mbps
                      </td>

                      <td className="p-3 text-slate-300">
                        {p.meshSupport}
                      </td>

                      <td className="p-3 font-mono text-slate-400">
                        {p.ramFootprintMb} MB
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Architectural Takeaway */}
          <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-800/60 space-y-2">
            <h4 className="font-semibold text-sky-300 text-xs flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-sky-400" />
              <span>Architectural Consensus: Why Hybrid Zenoh / 802.11s Wins</span>
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Standard broker architectures (like plain MQTT) suffer catastrophic reconnection storms when wireless connectivity fluctuates in flight. 
              <strong> Eclipse Zenoh</strong> natively supports routing tokens and peer-to-peer ad-hoc discovery. If cellular drops, telemetry automatically hops across neighbouring drones over 802.11s mesh until reaching the nearest drone with active uplink, with only <strong>4 bytes</strong> of protocol header overhead.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
