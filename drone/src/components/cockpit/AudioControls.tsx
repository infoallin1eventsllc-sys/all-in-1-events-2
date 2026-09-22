import React, { useState, useEffect, useRef } from 'react';
import { AudioStreamState } from '../../types/droneCockpitTypes';
import { cockpitAudio } from '../../utils/cockpitSoundEngine';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Radio, 
  Megaphone, 
  AlertTriangle, 
  Sliders, 
  Disc3,
  Flame,
  BellRing,
  Sparkles
} from 'lucide-react';

interface AudioControlsProps {
  audioState: AudioStreamState;
  onTogglePtt: (active: boolean) => void;
  onToggleOpenMic: () => void;
  onSetGain: (gain: number) => void;
  onToggleDownlinkMute: () => void;
  onSetDownlinkVolume: (vol: number) => void;
  onTriggerSiren: (siren: string | null) => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  audioState,
  onTogglePtt,
  onToggleOpenMic,
  onSetGain,
  onToggleDownlinkMute,
  onSetDownlinkVolume,
  onTriggerSiren,
}) => {
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [usingRealMic, setUsingRealMic] = useState<boolean>(false);

  // Sync ambient rotor noise with downlink state
  useEffect(() => {
    cockpitAudio.updateAmbientRotor(audioState.downlinkVolume, audioState.downlinkMuted);
  }, [audioState.downlinkVolume, audioState.downlinkMuted]);

  // Sync siren oscillator
  useEffect(() => {
    if (audioState.activeSiren) {
      cockpitAudio.startSiren(audioState.activeSiren as 'SIREN' | 'CLEAR_AREA');
    } else {
      cockpitAudio.stopSiren();
    }
  }, [audioState.activeSiren]);

  const handlePttDown = () => {
    cockpitAudio.playRadioKeyBeep();
    onTogglePtt(true);
  };

  const handlePttUp = () => {
    cockpitAudio.playRogerBeep();
    onTogglePtt(false);
  };

  const handleToggleRealMic = async () => {
    if (!usingRealMic) {
      const ok = await cockpitAudio.initRealMic();
      if (ok) setUsingRealMic(true);
    } else {
      cockpitAudio.stopRealMic();
      setUsingRealMic(false);
    }
  };

  // Keyboard shortcut: Spacebar for Push-to-Talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is typing in an input, ignore
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space' && !e.repeat && !audioState.uplinkOpenMic) {
        e.preventDefault();
        setIsSpacePressed(true);
        handlePttDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !audioState.uplinkOpenMic) {
        e.preventDefault();
        setIsSpacePressed(false);
        handlePttUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [audioState.uplinkOpenMic]);

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-mono text-xs">
      
      {/* 1. Downlink Audio (Drone Microphone -> Operator Headphones) */}
      <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex-1">
        <button
          onClick={onToggleDownlinkMute}
          className={`p-2.5 rounded-lg border transition-colors ${
            audioState.downlinkMuted 
              ? 'bg-rose-950/60 border-rose-800 text-rose-400' 
              : 'bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700'
          }`}
          title={audioState.downlinkMuted ? 'Unmute Drone Mic' : 'Mute Drone Mic'}
        >
          {audioState.downlinkMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-sans">
            <span className="text-slate-400 flex items-center gap-1.5 font-semibold">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Onboard Mic (Downlink)
            </span>
            <span className="text-slate-500 font-mono text-[10px]">
              {audioState.downlinkMuted ? 'MUTED' : `${audioState.downlinkVolume}%`}
            </span>
          </div>

          {/* Volume slider & spectrum mini meter */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              value={audioState.downlinkMuted ? 0 : audioState.downlinkVolume}
              onChange={(e) => onSetDownlinkVolume(Number(e.target.value))}
              className="w-24 accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            
            {/* Live 12-band ambient audio frequency spectrum */}
            <div className="flex items-end gap-0.5 h-4 flex-1">
              {audioState.audioSpectrum.map((level, i) => (
                <div
                  key={i}
                  className={`w-full rounded-t transition-all duration-75 ${
                    audioState.downlinkMuted
                      ? 'bg-slate-800 h-0.5'
                      : level > 75
                      ? 'bg-rose-500'
                      : level > 40
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                  style={{ height: audioState.downlinkMuted ? '2px' : `${Math.max(3, (level / 100) * 16)}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Uplink Audio (Operator Mic -> Drone PA Loudspeaker) */}
      <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex-[1.4]">
        
        {/* Huge Push-To-Talk Button */}
        <button
          onMouseDown={handlePttDown}
          onMouseUp={handlePttUp}
          onTouchStart={handlePttDown}
          onTouchEnd={handlePttUp}
          className={`px-5 py-3 rounded-xl font-sans font-bold flex items-center gap-2.5 transition-all shadow-lg active:scale-95 select-none ${
            audioState.uplinkPttActive || audioState.uplinkOpenMic
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 ring-4 ring-rose-500/30 animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
          }`}
        >
          {audioState.uplinkPttActive || audioState.uplinkOpenMic ? (
            <Mic className="w-5 h-5 text-white animate-bounce" />
          ) : (
            <MicOff className="w-5 h-5 text-emerald-100" />
          )}
          <div className="text-left">
            <div className="text-xs uppercase tracking-wider">
              {audioState.uplinkPttActive || audioState.uplinkOpenMic ? 'LIVE BROADCASTING' : 'PUSH TO TALK'}
            </div>
            <div className="text-[9px] font-mono text-white/80">
              {audioState.uplinkOpenMic ? 'OPEN MIC ACTIVE' : 'Hold Spacebar or Click'}
            </div>
          </div>
        </button>

        {/* Mic Level & Open Mic Toggle */}
        <div className="flex-1 space-y-1.5 pl-2">
          <div className="flex items-center justify-between text-[11px] font-sans">
            <span className="text-slate-400 flex items-center gap-1.5 font-semibold">
              <Megaphone className="w-3.5 h-3.5 text-amber-400" />
              Loudspeaker Uplink (105 dB)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleToggleRealMic}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors flex items-center gap-1 ${
                  usingRealMic
                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300 shadow'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Test with your computer's real physical microphone"
              >
                <Mic className="w-2.5 h-2.5" />
                <span>{usingRealMic ? 'HW Mic: ON' : 'HW Mic: OFF'}</span>
              </button>
              <button
                onClick={onToggleOpenMic}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                  audioState.uplinkOpenMic 
                    ? 'bg-rose-950 border-rose-700 text-rose-300' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {audioState.uplinkOpenMic ? 'OPEN: ON' : 'OPEN: OFF'}
              </button>
            </div>
          </div>

          {/* VU Meter for operator voice input */}
          <div className="flex items-center gap-2">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
              <div 
                className={`h-full transition-all duration-75 ${
                  audioState.uplinkPttActive || audioState.uplinkOpenMic 
                    ? audioState.uplinkLevelDb > -6 ? 'bg-rose-500' : audioState.uplinkLevelDb > -18 ? 'bg-amber-400' : 'bg-emerald-400' 
                    : 'bg-slate-700'
                }`}
                style={{ 
                  width: audioState.uplinkPttActive || audioState.uplinkOpenMic 
                    ? `${Math.min(100, Math.max(8, ((audioState.uplinkLevelDb + 60) / 60) * 100))}%` 
                    : '4%' 
                }}
              />
            </div>
            <span className="text-[9px] text-slate-500 w-10 text-right">
              {audioState.uplinkPttActive || audioState.uplinkOpenMic ? `${audioState.uplinkLevelDb} dB` : '-INF'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Canned Tactical PA Siren & Megaphone Presets */}
      <div className="flex items-center gap-1.5 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
        <span className="text-[10px] text-slate-500 font-sans font-semibold mr-1 flex items-center gap-1">
          <BellRing className="w-3.5 h-3.5 text-amber-400" />
          PA Alert:
        </span>
        <button
          onClick={() => onTriggerSiren(audioState.activeSiren === 'SIREN' ? null : 'SIREN')}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors flex items-center gap-1 ${
            audioState.activeSiren === 'SIREN'
              ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-md'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          <span>Wail Siren</span>
        </button>
        <button
          onClick={() => onTriggerSiren(audioState.activeSiren === 'CLEAR_AREA' ? null : 'CLEAR_AREA')}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors flex items-center gap-1 ${
            audioState.activeSiren === 'CLEAR_AREA'
              ? 'bg-amber-600 border-amber-500 text-white animate-pulse shadow-md'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Megaphone className="w-3 h-3 text-amber-400" />
          <span>"Clear Area"</span>
        </button>
      </div>

    </div>
  );
};
