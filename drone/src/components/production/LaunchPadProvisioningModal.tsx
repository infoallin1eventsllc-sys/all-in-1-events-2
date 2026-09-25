import React, { useState } from 'react';
import { 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Compass, 
  BatteryCharging, 
  Radio, 
  ShieldCheck, 
  X, 
  RefreshCw,
  Layers,
  Search
} from 'lucide-react';
import { useDialog } from '../../lib/useDialog';

interface PadDroneSlot {
  padId: string;
  gridRow: number;
  gridCol: number;
  coordsX: number;
  coordsZ: number;
  assignedDroneId: string | null;
  status: 'EMPTY' | 'SCANNED' | 'CHECKING' | 'QUALIFIED' | 'FAILED';
  batterySoc: number;
  cellResistanceMilliOhm: number;
  compassDeviationDeg: number;
  rtkSatCount: number;
  motorsOk: boolean;
  failReason?: string;
}

interface LaunchPadProvisioningModalProps {
  droneCount: number;
  onClose: () => void;
}

export const LaunchPadProvisioningModal: React.FC<LaunchPadProvisioningModalProps> = ({ droneCount, onClose }) => {
  const dialog = useDialog(onClose);
  const gridDim = Math.ceil(Math.sqrt(droneCount));
  const spacing = 3.5; // 3.5m spacing

  // Initialize pads
  const [pads, setPads] = useState<PadDroneSlot[]>(() => {
    const list: PadDroneSlot[] = [];
    for (let i = 0; i < droneCount; i++) {
      const col = i % gridDim;
      const row = Math.floor(i / gridDim);
      const x = Number(((col - gridDim / 2) * spacing).toFixed(1));
      const z = Number(((row - gridDim / 2) * spacing).toFixed(1));
      
      list.push({
        padId: `PAD-${String(i + 1).padStart(3, '0')}`,
        gridRow: row,
        gridCol: col,
        coordsX: x,
        coordsZ: z,
        assignedDroneId: `DRN-${String(i + 1).padStart(3, '0')}`,
        status: i === 7 ? 'FAILED' : 'QUALIFIED',
        batterySoc: i === 7 ? 84 : 96 + (i % 4),
        cellResistanceMilliOhm: i === 7 ? 24.5 : 8.2 + (i % 3) * 0.4,
        compassDeviationDeg: i === 7 ? 4.8 : 0.6 + (i % 3) * 0.2,
        rtkSatCount: i === 7 ? 14 : 26 + (i % 5),
        motorsOk: i !== 7,
        failReason: i === 7 ? 'Low SoC (84% < 92%) & High Cell Resistance' : undefined,
      });
    }
    return list;
  });

  const [selectedPad, setSelectedPad] = useState<PadDroneSlot | null>(pads[0]);
  const [isRunningFleetCheck, setIsRunningFleetCheck] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const qualifiedCount = pads.filter(p => p.status === 'QUALIFIED').length;
  const failedCount = pads.filter(p => p.status === 'FAILED').length;

  const runAutomatedFleetTest = () => {
    setIsRunningFleetCheck(true);
    setPads(prev => prev.map(p => ({ ...p, status: 'CHECKING' })));

    setTimeout(() => {
      setPads(prev => prev.map((p, i) => {
        const isFail = i === 7;
        return {
          ...p,
          status: isFail ? 'FAILED' : 'QUALIFIED',
          batterySoc: isFail ? 84 : 98,
          cellResistanceMilliOhm: isFail ? 24.5 : 7.9,
          compassDeviationDeg: isFail ? 4.8 : 0.5,
          rtkSatCount: isFail ? 14 : 28,
          motorsOk: !isFail,
          failReason: isFail ? 'Low SoC (84% < 92%) & High Cell Resistance' : undefined,
        };
      }));
      setIsRunningFleetCheck(false);
    }, 1500);
  };

  const filteredPads = pads.filter(p => 
    p.padId.toLowerCase().includes(searchFilter.toLowerCase()) || 
    (p.assignedDroneId && p.assignedDroneId.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Launch pad provisioning & pre-flight qualification gate" ref={dialog}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100 font-mono">
                  LAUNCH PAD PROVISIONING &amp; PRE-FLIGHT QUALIFICATION GATE
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 border border-indigo-800 text-indigo-300">
                  FAA / EASA FIELD STAGING
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Physical Airfield Staging &bull; QR/NFC Slot Binding &bull; Motor Spin &amp; Compass Qualification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close" className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top Status & Qualification Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-xs font-mono mb-1">Total Staging Pads</div>
              <div className="text-2xl font-bold font-mono text-slate-100">{pads.length} Units</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">{spacing}m Launch Pad Grid</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/40">
              <div className="text-emerald-400 text-xs font-mono mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Flight Qualified</span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-300">{qualifiedCount}</div>
              <div className="text-[11px] font-mono text-emerald-400/80 mt-1">Ready for Conductor Arming</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-red-900/40">
              <div className="text-red-400 text-xs font-mono mb-1 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                <span>Disqualified / Grounded</span>
              </div>
              <div className="text-2xl font-bold font-mono text-red-400">{failedCount}</div>
              <div className="text-[11px] font-mono text-red-400/80 mt-1">
                {failedCount > 0 ? 'Requires Battery / Compass QA' : 'Zero Disqualifications'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-center">
              <button
                onClick={runAutomatedFleetTest}
                disabled={isRunningFleetCheck}
                className="w-full py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningFleetCheck ? 'animate-spin' : ''}`} />
                <span>{isRunningFleetCheck ? 'Testing Fleet Motors & Compass...' : 'Run Automated Fleet QA'}</span>
              </button>
            </div>
          </div>

          {/* Grid Layout & Inspection Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Interactive Launch Pad Airfield Map */}
            <div className="lg:col-span-2 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <h4 className="text-xs font-bold font-mono text-slate-200">
                    AIRFIELD LAUNCH MATRIX (TOP-DOWN TOPOLOGY)
                  </h4>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search Pad or Drone ID..."
                    className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 w-44"
                  />
                </div>
              </div>

              {/* Grid of Launch Pads */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-[380px] overflow-y-auto p-2 bg-slate-900/60 rounded-xl border border-slate-800/60">
                {filteredPads.map((pad) => {
                  const isSelected = selectedPad?.padId === pad.padId;
                  let bgBorder = 'bg-slate-900 border-slate-700 hover:border-slate-500';
                  if (pad.status === 'QUALIFIED') bgBorder = 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300';
                  if (pad.status === 'FAILED') bgBorder = 'bg-red-950/60 border-red-700 text-red-300 animate-pulse';
                  if (pad.status === 'CHECKING') bgBorder = 'bg-sky-950/60 border-sky-600 text-sky-300';

                  return (
                    <button
                      key={pad.padId}
                      onClick={() => setSelectedPad(pad)}
                      className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all ${bgBorder} ${
                        isSelected ? 'ring-2 ring-sky-400 shadow-lg' : ''
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold">{pad.padId.replace('PAD-', '')}</span>
                      <span className="text-[9px] font-mono opacity-70">{pad.assignedDroneId?.replace('DRN-', 'D') || 'EMPTY'}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span>Qualified (Ready to Fly)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span>Disqualified (Hold)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                  <span>Testing</span>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Selected Pad & Drone Telemetry Gate */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold font-mono text-slate-200 border-b border-slate-800 pb-2">
                PAD INSPECTION: {selectedPad?.padId || 'None'}
              </h4>

              {selectedPad ? (
                <div className="space-y-4 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Assigned Airframe QR</span>
                    <span className="text-sm font-bold text-sky-400">{selectedPad.assignedDroneId}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Physical Coordinates (UTM Local)</span>
                    <span className="text-slate-200">X: {selectedPad.coordsX}m &bull; Z: {selectedPad.coordsZ}m</span>
                  </div>

                  {/* Pre-Flight Gate Checklist */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-slate-400 font-bold block text-[11px] uppercase">
                      Mandatory Airworthiness Gate
                    </span>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <BatteryCharging className="w-4 h-4 text-emerald-400" />
                        <span>Battery State of Charge</span>
                      </div>
                      <span className={`font-bold ${selectedPad.batterySoc >= 92 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedPad.batterySoc}% (Req &ge;92%)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-sky-400" />
                        <span>RTK Integer Satellites</span>
                      </div>
                      <span className={`font-bold ${selectedPad.rtkSatCount >= 18 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedPad.rtkSatCount} Satellites (Req &ge;18)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Compass className="w-4 h-4 text-amber-400" />
                        <span>Compass Deviation</span>
                      </div>
                      <span className={`font-bold ${selectedPad.compassDeviationDeg <= 1.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedPad.compassDeviationDeg}° (Req &le;1.5°)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-400" />
                        <span>Motor ESC Telemetry</span>
                      </div>
                      <span className={`font-bold ${selectedPad.motorsOk ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedPad.motorsOk ? '4x Pass' : 'ESC Error'}
                      </span>
                    </div>
                  </div>

                  {selectedPad.failReason && (
                    <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs">
                      <div className="font-bold mb-1 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        <span>Disqualification Reason:</span>
                      </div>
                      <div>{selectedPad.failReason}</div>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setPads(prev => prev.map(p => {
                          if (p.padId === selectedPad.padId) {
                            return {
                              ...p,
                              status: 'QUALIFIED',
                              batterySoc: 98,
                              cellResistanceMilliOhm: 7.8,
                              compassDeviationDeg: 0.4,
                              rtkSatCount: 26,
                              motorsOk: true,
                              failReason: undefined,
                            };
                          }
                          return p;
                        }));
                        setSelectedPad(prev => prev ? {
                          ...prev,
                          status: 'QUALIFIED',
                          batterySoc: 98,
                          compassDeviationDeg: 0.4,
                          rtkSatCount: 26,
                          motorsOk: true,
                          failReason: undefined,
                        } : null);
                      }}
                      className="w-full py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                    >
                      Override / Mark Qualified
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 text-xs font-mono text-center py-10">
                  Select a launch pad from the matrix to inspect.
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Airfield Staging Protocol v4.2 &bull; Pre-Bake eMMC Flash Synced</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
          >
            Close Provisioner
          </button>
        </div>

      </div>
    </div>
  );
};
