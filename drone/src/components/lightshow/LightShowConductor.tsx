import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  AlertOctagon, 
  ShieldCheck, 
  Sparkles} from 'lucide-react';
import { SHOW_FORMATIONS } from '../../data/lightShowFormations';
import { ShowConductorState } from '../../types/lightShowTypes';

interface LightShowConductorProps {
  conductorState: ShowConductorState;
  onTogglePlay: () => void;
  onRewind: () => void;
  onSeek: (seconds: number) => void;
  onSelectFormation: (index: number) => void;
  droneCount: number;
  onSetDroneCount: (count: number) => void;
  showTrajectories: boolean;
  onToggleTrajectories: () => void;
  showGeofence: boolean;
  onToggleGeofence: () => void;
  onEmergencyAbort: () => void;
  onArmShow: () => void;
}

export const LightShowConductor: React.FC<LightShowConductorProps> = ({
  conductorState,
  onTogglePlay,
  onRewind,
  onSeek,
  onSelectFormation,
  droneCount,
  onSetDroneCount,
  showTrajectories,
  onToggleTrajectories,
  showGeofence,
  onToggleGeofence,
  onEmergencyAbort,
  onArmShow,
}) => {
  // The show starts only once armed and resumes only from a hold; an abort is reset with Rewind.
  const canPlay = conductorState.status === 'ARMED' || conductorState.status === 'PAUSED' || conductorState.status === 'RUNNING';
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  return (
    <div 
      id="light-show-conductor-panel"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-5 text-xs text-slate-300 backdrop-blur-md shadow-xl"
    >
      {/* 1. Master Show Status & Armed Trigger Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            conductorState.status === 'RUNNING'
              ? 'bg-emerald-950/80 border-emerald-600 text-emerald-400 animate-pulse'
              : conductorState.status === 'ARMED'
              ? 'bg-amber-950/80 border-amber-600 text-amber-400'
              : conductorState.status === 'ABORTING' || conductorState.status === 'ABORTED'
              ? 'bg-rose-950/80 border-rose-600 text-rose-400'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 font-mono">
                SHOW CONDUCTOR MASTER TIMELINE
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                conductorState.status === 'RUNNING'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : conductorState.status === 'ARMED'
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : conductorState.status === 'ABORTING' || conductorState.status === 'ABORTED'
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {conductorState.status}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Synchronized GPS 1PPS Reference &bull; UDP Broadcast Timecode &bull; 0.8ms Max Fleet Skew
            </p>
          </div>
        </div>

        {/* Arming & Abort Actions */}
        <div className="flex items-center gap-2">
          {conductorState.status === 'PRE_FLIGHT' && (
            <button
              id="arm-show-btn"
              onClick={onArmShow}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>ARM SHOW SEQUENCE</span>
            </button>
          )}

          <button
            id="emergency-abort-btn"
            onClick={onEmergencyAbort}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all"
            title="Emergency Abort: All LEDs Extinguish & Land Straight Down"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>ALL LIGHTS OUT &amp; ABORT</span>
          </button>
        </div>
      </div>

      {/* 2. Timeline Scrubbing Bar & Timecode */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-sky-400 tracking-wider">
              {formatTime(conductorState.currentTimeSec)}
            </span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">
              {formatTime(conductorState.totalDurationSec)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">PTP Timecode Offset:</span>
            <span className="font-bold text-emerald-400">{conductorState.clockJitterMs} ms</span>
          </div>
        </div>

        {/* Progress Slider */}
        <div className="relative">
          <input
            type="range"
            min="0"
            max={conductorState.totalDurationSec}
            step="0.1"
            value={conductorState.currentTimeSec}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>
      </div>

      {/* 3. Transport Controls & Fleet Scale */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        {/* Playback Transport Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRewind}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
            title="Rewind to T=0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            disabled={!canPlay}
            title={canPlay ? undefined : conductorState.status === 'PRE_FLIGHT' ? 'Arm the show first' : 'Rewind to reset after an abort'}
            className={`px-5 py-2 rounded-xl font-mono font-bold flex items-center gap-2 shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              conductorState.status === 'RUNNING'
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
            }`}
          >
            {conductorState.status === 'RUNNING' ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>PAUSE TIMELINE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>START SHOW BROADCAST</span>
              </>
            )}
          </button>
        </div>

        {/* Fleet Scale Selector */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-slate-400 text-[11px]">FLEET SCALE:</span>
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {[100, 250, 500].map(count => (
              <button
                key={count}
                onClick={() => onSetDroneCount(count)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                  droneCount === count
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {count} UNITS
              </button>
            ))}
          </div>
        </div>

        {/* Visual Toggles */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={showTrajectories}
              onChange={onToggleTrajectories}
              className="rounded accent-sky-500"
            />
            <span>Transition Trajectories</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={showGeofence}
              onChange={onToggleGeofence}
              className="rounded accent-emerald-500"
            />
            <span>Geofence Cube</span>
          </label>
        </div>
      </div>

      {/* 4. Formation Cue Buttons (Interactive Sequencer) */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="font-bold text-slate-300 uppercase tracking-wider">
            PROGRAMMED FORMATION CUES ({SHOW_FORMATIONS.length}):
          </span>
          <span className="text-slate-500">Click any cue to initiate smooth LAPJV transition</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {SHOW_FORMATIONS.map((formation, idx) => {
            const isActive = conductorState.activeFormationIndex === idx;
            return (
              <button
                key={formation.id}
                onClick={() => onSelectFormation(idx)}
                className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-1 group ${
                  isActive
                    ? 'bg-sky-950/80 border-sky-500 text-sky-200 shadow-md shadow-sky-500/10'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-500 font-bold">CUE #{idx + 1}</span>
                  {isActive && <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>}
                </div>
                <span className="font-semibold text-xs text-slate-100 truncate">
                  {formation.name}
                </span>
                <span className="font-mono text-[10px] text-slate-400 truncate">
                  {formation.paletteName}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
