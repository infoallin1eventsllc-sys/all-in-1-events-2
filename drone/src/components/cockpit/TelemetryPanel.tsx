import React from 'react';
import { TelemetryState, DatalinkQuality } from '../../types/droneCockpitTypes';
import { 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryCharging, 
  Navigation, 
  ShieldAlert, 
  Gauge, 
  Compass, 
  Activity, 
  MapPin, 
  Cpu, 
  Radio
} from 'lucide-react';

interface TelemetryPanelProps {
  telemetry: TelemetryState;
  onSimulateLinkQuality: (quality: DatalinkQuality) => void;
  onToggleFlightMode: (mode: TelemetryState['flightMode']) => void;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  telemetry,
  onSimulateLinkQuality,
  onToggleFlightMode,
}) => {
  const isLinkLost = telemetry.link.quality === 'LINK_LOST';
  const isDegraded = telemetry.link.quality === 'DEGRADED';

  // Battery bar color
  const getBatteryColor = (pct: number) => {
    if (pct < 20) return 'bg-rose-500 text-rose-300';
    if (pct < 40) return 'bg-amber-500 text-amber-300';
    return 'bg-emerald-500 text-emerald-300';
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 overflow-y-auto space-y-4 text-xs font-mono select-none">
      
      {/* 1. Header: Callsign & Armed Status */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isLinkLost ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`} />
          <div>
            <div className="text-sm font-bold tracking-wider text-slate-100 flex items-center gap-1.5">
              <span>{telemetry.callsign}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {telemetry.droneId}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">PX4 v1.14 Autopilot • MAVLink 2.0</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border ${
            telemetry.armed 
              ? 'bg-rose-950/60 border-rose-600 text-rose-300' 
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {telemetry.armed ? 'ARMED' : 'DISARMED'}
          </span>
        </div>
      </div>

      {/* 2. Datalink Quality & Protocol Diagnostic Selector */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5 font-sans font-semibold text-[11px]">
            {isLinkLost ? <WifiOff className="w-3.5 h-3.5 text-rose-400" /> : <Wifi className="w-3.5 h-3.5 text-sky-400" />}
            Datalink Health
          </span>
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
            telemetry.link.quality === 'EXCELLENT'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              : isDegraded
              ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
              : 'bg-rose-950/80 text-rose-300 border border-rose-800 animate-pulse'
          }`}>
            {telemetry.link.quality}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 text-[10px]">
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[9px]">RTT LATENCY</div>
            <div className={`font-bold text-sm ${telemetry.link.rttLatencyMs > 250 ? 'text-rose-400' : telemetry.link.rttLatencyMs > 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isLinkLost ? '--' : `${telemetry.link.rttLatencyMs} ms`}
            </div>
          </div>
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[9px]">PACKET LOSS</div>
            <div className={`font-bold text-sm ${telemetry.link.packetLossPct > 5 ? 'text-rose-400' : 'text-slate-200'}`}>
              {isLinkLost ? '100%' : `${telemetry.link.packetLossPct.toFixed(1)}%`}
            </div>
          </div>
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <div className="text-slate-500 text-[9px]">SIGNAL (RSSI)</div>
            <div className="font-bold text-sm text-sky-400">
              {isLinkLost ? '--' : `${telemetry.link.rssiDbm} dBm`}
            </div>
          </div>
        </div>

        {/* Link Quality Stress Simulation Buttons */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="text-[10px] text-slate-400 mb-1.5 flex items-center justify-between font-sans">
            <span>Simulate Datalink Conditions:</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => onSimulateLinkQuality('EXCELLENT')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                telemetry.link.quality === 'EXCELLENT'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Nominal
            </button>
            <button
              onClick={() => onSimulateLinkQuality('DEGRADED')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                telemetry.link.quality === 'DEGRADED'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Degraded
            </button>
            <button
              onClick={() => onSimulateLinkQuality('LINK_LOST')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                telemetry.link.quality === 'LINK_LOST'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Lost Link
            </button>
          </div>
        </div>
      </div>

      {/* 3. Flight Dynamics & Speed / Altitude Panel */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
        <div className="text-slate-400 flex items-center gap-1.5 font-sans font-semibold text-[11px]">
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          Flight Dynamics & Kinematics
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Ground Speed */}
          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-slate-500 text-[9px]">GROUND SPEED</div>
              <div className="text-base font-bold text-slate-100">
                {(telemetry.velocity.groundSpeedMs * 3.6).toFixed(1)} <span className="text-[10px] font-normal text-slate-400">km/h</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {telemetry.velocity.groundSpeedMs.toFixed(1)} m/s
              </div>
            </div>
            <Navigation className="w-5 h-5 text-amber-400 transform rotate-45" />
          </div>

          {/* Altitude AGL */}
          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-slate-500 text-[9px]">ALTITUDE (AGL)</div>
              <div className="text-base font-bold text-sky-400">
                {telemetry.gps.altitudeAglMeters.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">m</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                MSL: {telemetry.gps.altitudeMslMeters.toFixed(0)} m
              </div>
            </div>
            <Activity className="w-5 h-5 text-sky-400" />
          </div>
        </div>

        {/* Attitude Pitch / Roll / Yaw */}
        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 grid grid-cols-3 text-center">
          <div>
            <div className="text-slate-500 text-[9px]">PITCH</div>
            <div className="font-bold text-slate-200">{telemetry.attitude.pitch.toFixed(1)}°</div>
          </div>
          <div className="border-x border-slate-800">
            <div className="text-slate-500 text-[9px]">ROLL</div>
            <div className="font-bold text-slate-200">{telemetry.attitude.roll.toFixed(1)}°</div>
          </div>
          <div>
            <div className="text-slate-500 text-[9px]">HEADING</div>
            <div className="font-bold text-amber-300">{Math.round(telemetry.attitude.yaw)}°</div>
          </div>
        </div>
      </div>

      {/* 4. Power & Battery Subsystem */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5 font-sans font-semibold text-[11px]">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            6S LiPo Propulsion Battery
          </span>
          <span className="text-[11px] font-bold text-emerald-400">
            {telemetry.power.batteryPct}%
          </span>
        </div>

        {/* Battery Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${getBatteryColor(telemetry.power.batteryPct)}`}
            style={{ width: `${Math.max(5, telemetry.power.batteryPct)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center pt-1">
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
            <span className="text-slate-500 text-[9px]">VOLTAGE</span>
            <div className="font-bold text-slate-200">{telemetry.power.voltageVolts.toFixed(1)} V</div>
          </div>
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
            <span className="text-slate-500 text-[9px]">CURRENT</span>
            <div className="font-bold text-slate-200">{telemetry.power.currentAmps.toFixed(1)} A</div>
          </div>
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
            <span className="text-slate-500 text-[9px]">REMAINING</span>
            <div className="font-bold text-emerald-300">~{telemetry.power.estimatedFlightTimeMin} min</div>
          </div>
        </div>

        {/* 6S LiPo Individual Cell Voltages */}
        <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
          <div className="text-[9px] text-slate-400 mb-1 flex items-center justify-between font-sans">
            <span>6S Cell Balance (Δ 6mV)</span>
            <span className="text-emerald-400 font-mono">NOMINAL</span>
          </div>
          <div className="grid grid-cols-6 gap-1 text-center font-mono text-[9px]">
            {[1, 2, 3, 4, 5, 6].map((cell) => {
              const cellVolt = (telemetry.power.voltageVolts / 6) + (cell % 2 === 0 ? 0.003 : -0.003);
              return (
                <div key={cell} className="bg-slate-950/80 p-1 rounded border border-slate-800">
                  <div className="text-slate-500 text-[8px]">C{cell}</div>
                  <div className="text-slate-300 font-semibold">{cellVolt.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Navigation & GNSS RTK Status */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5 font-sans font-semibold text-[11px]">
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            GNSS Positioning &amp; Home Return
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950 border border-emerald-700 text-emerald-300 font-bold">
            {telemetry.gps.fixType}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
            <div className="text-slate-500 text-[9px]">COORDINATES</div>
            <div className="font-mono text-[10px] text-slate-300">
              {telemetry.gps.lat.toFixed(6)}° N<br />
              {telemetry.gps.lng.toFixed(6)}° W
            </div>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
            <div className="text-slate-500 text-[9px]">HOME DISTANCE</div>
            <div className="font-bold text-sm text-sky-300">
              284 m
            </div>
            <div className="text-[9px] text-slate-400">BEARING: 328° NW</div>
          </div>
        </div>
      </div>

      {/* 6. Active Flight Mode Commands & Emergency Termination */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-sans font-semibold text-[11px]">
            Command Flight Mode
          </span>
          <span className="text-[9px] font-mono text-slate-500">PX4 NAV_STATE</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['POS_HOLD', 'ALT_HOLD', 'MISSION_AUTO', 'RTH_FAILSAFE', 'EMERGENCY_LAND'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onToggleFlightMode(mode)}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                telemetry.flightMode === mode
                  ? mode === 'EMERGENCY_LAND' 
                    ? 'bg-amber-600 text-white shadow-md' 
                    : 'bg-sky-600 text-white shadow-md'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              {mode.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Guarded Emergency Motor Cut / FTS Disarm Button */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-sans">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              Flight Termination System (FTS)
            </span>
          </div>
          <button
            onClick={() => onToggleFlightMode('EMERGENCY_LAND')}
            className="w-full mt-1.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-300 text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-colors shadow"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>INSTANT MOTOR CUT / FAILSAFE LAND</span>
          </button>
        </div>
      </div>

    </div>
  );
};
