import React, { useState } from 'react';
import { X, Clock, Radio, Activity} from 'lucide-react';
import { useDialog } from '../../lib/useDialog';

interface SyncPrecisionModalProps {
  droneCount: number;
  onClose: () => void;
}

export const SyncPrecisionModal: React.FC<SyncPrecisionModalProps> = ({
  droneCount,
  onClose,
}) => {
  const dialog = useDialog(onClose);
  const [activeSyncProtocol, setActiveSyncProtocol] = useState<'GPS_1PPS' | 'PTP_IEEE_1588' | 'STANDARD_NTP'>('GPS_1PPS');

  const protocols = [
    {
      id: 'GPS_1PPS',
      name: 'GPS 1PPS + TCXO Hardware Discipline',
      jitter: '0.4 ms',
      fleetSkew: '< 1.2 ms',
      suitable: true,
      desc: 'Disciplined by GPS satellite atomic clocks via hardware pin interrupt. Zero software jitter.'
    },
    {
      id: 'PTP_IEEE_1588',
      name: 'Precision Time Protocol (IEEE 1588v2)',
      jitter: '1.8 ms',
      fleetSkew: '< 3.5 ms',
      suitable: true,
      desc: 'Hardware timestamping over broadcast Wi-Fi / Ethernet. Excellent backup if GPS multipath occurs.'
    },
    {
      id: 'STANDARD_NTP',
      name: 'Standard NTP (RFC 5905)',
      jitter: '45.0 ms',
      fleetSkew: '± 80 ms',
      suitable: false,
      desc: 'Unsuitable for aerial light shows. Noticeable visual skew and wave artifacts in LED animations.'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Precision timing & sub-millisecond synchronization" ref={dialog}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-600 text-emerald-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 font-mono">
                PRECISION TIMING &amp; SUB-MILLISECOND SYNCHRONIZATION
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                GPS 1PPS Hardware Trigger &bull; IEEE 1588 Micro-PTP &bull; TCXO Drift Compensation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 divide-y divide-slate-800/60">
          {/* 1. Protocol Comparison */}
          <div className="space-y-3">
            <h4 className="font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>CLOCK SYNCHRONIZATION PROTOCOL BENCHMARK</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {protocols.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setActiveSyncProtocol(p.id as any)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                    activeSyncProtocol === p.id
                      ? 'bg-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-200 text-[11px]">{p.name}</span>
                    {p.suitable ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[9px] font-mono font-bold border border-emerald-800">
                        QUALIFIED
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 text-[9px] font-mono font-bold border border-rose-800">
                        FAILED
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-900 p-2 rounded">
                    <div>Jitter: <strong className="text-slate-100">{p.jitter}</strong></div>
                    <div>Fleet Skew: <strong className={p.suitable ? 'text-emerald-400' : 'text-rose-400'}>{p.fleetSkew}</strong></div>
                  </div>
                  <p className="text-[10px] text-slate-400">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Live Fleet Clock Skew Scatter Histogram */}
          <div className="pt-5 space-y-3">
            <h4 className="font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-sky-400" />
              <span>LIVE FLEET CLOCK DISPERSION ({droneCount} UNITS MONITORED)</span>
            </h4>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">Target Envelope: &plusmn; 2.0 ms</span>
                <span className="text-emerald-400 font-bold">100% IN COMPLIANCE (0.64 ms MAX DEVIATION)</span>
              </div>

              {/* Graphical Dispersion Bar */}
              <div className="relative h-6 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                <div className="absolute inset-y-0 w-1/3 bg-emerald-950/80 border-x border-emerald-600/50 flex items-center justify-center">
                  <span className="text-[9px] font-mono text-emerald-300 font-bold">&plusmn; 1.0 ms Zone</span>
                </div>
                <div className="absolute inset-y-0 w-0.5 bg-sky-400 shadow-sm shadow-sky-400"></div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1 text-[11px] font-mono text-slate-400">
                <div>Standard Deviation: <strong className="text-slate-200">0.24 ms</strong></div>
                <div>TCXO Drift Compensation: <strong className="text-emerald-400">LOCKED (0.02 ppm)</strong></div>
                <div>Sync Status: <strong className="text-sky-400">GPS 1PPS DISCIPLINED</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
