import React, { useState, useEffect } from 'react';
import { TelemetryState, AudioStreamState, DatalinkQuality } from '../../types/droneCockpitTypes';
import { VideoStreamHUD } from './VideoStreamHUD';
import { TelemetryPanel } from './TelemetryPanel';
import { AudioControls } from './AudioControls';
import { cockpitAudio } from '../../utils/cockpitSoundEngine';
import { 
  Radio, 
  ShieldCheck, 
  Wifi, 
  Layers, 
  Volume2, 
  Video, 
  Info, 
  AlertOctagon,
  Terminal,
  Cpu
} from 'lucide-react';

export const LiveDroneCockpitView: React.FC = () => {
  // 1. Live Telemetry State (simulating real-time 20Hz MAVLink stream from drone)
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    timestampMs: Date.now(),
    droneId: 'UAS-EAGLE-01',
    callsign: 'SENTINEL-ALPHA',
    flightMode: 'POS_HOLD',
    armed: true,
    gps: {
      lat: 37.774929,
      lng: -122.419416,
      altitudeAglMeters: 48.6,
      altitudeMslMeters: 62.1,
      satellites: 21,
      hdop: 0.72,
      fixType: 'RTK_FIXED',
    },
    attitude: {
      roll: 2.4,
      pitch: -3.8,
      yaw: 142.5,
    },
    velocity: {
      groundSpeedMs: 7.2,
      airSpeedMs: 7.8,
      climbRateMs: 0.1,
    },
    power: {
      batteryPct: 84,
      voltageVolts: 23.8,
      currentAmps: 18.4,
      temperatureC: 38.2,
      estimatedFlightTimeMin: 22,
    },
    link: {
      quality: 'EXCELLENT',
      rssiDbm: -58,
      snrDb: 28,
      rttLatencyMs: 64,
      packetLossPct: 0.1,
      downlinkBitrateKbps: 4200,
      uplinkBitrateKbps: 48,
    },
    payload: {
      gimbalPitchDeg: -15,
      gimbalYawDeg: 0,
      cameraZoom: 1,
      cameraSensorMode: 'RGB_4K',
      loudspeakerActive: false,
      loudspeakerDbLevel: 0,
    },
  });

  // 2. Audio Subsystem State (Downlink Ambient Mic & Uplink PA Speaker)
  const [audioState, setAudioState] = useState<AudioStreamState>({
    downlinkMicActive: true,
    downlinkVolume: 75,
    downlinkMuted: false,
    audioSpectrum: [20, 35, 55, 60, 45, 30, 25, 40, 65, 70, 50, 30, 20, 15, 25, 35],
    uplinkPttActive: false,
    uplinkOpenMic: false,
    uplinkInputGain: 85,
    uplinkMicDetected: true,
    uplinkLevelDb: -45,
    activeSiren: null,
  });

  const [showArchSpecs, setShowArchSpecs] = useState<boolean>(false);

  // Real-time loop simulating subtle attitude oscillations, flight mode kinematics, and audio spectrum
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry((prev) => {
        // If link is lost, keep last cached values without updating
        if (prev.link.quality === 'LINK_LOST') return prev;

        const time = Date.now() / 1000;
        let rollWobble = Math.sin(time * 1.8) * 3.5;
        let pitchWobble = Math.cos(time * 1.2) * 2.2 - 2.0;
        let yawHeading = (prev.attitude.yaw + 0.15) % 360;
        let currentAlt = prev.gps.altitudeAglMeters;
        let currentSpeed = prev.velocity.groundSpeedMs;
        let isArmed = prev.armed;

        // Kinematics based on Flight Mode
        if (prev.flightMode === 'EMERGENCY_LAND') {
          currentAlt = Math.max(0, currentAlt - 0.4);
          currentSpeed = Math.max(0, currentSpeed - 0.2);
          rollWobble *= 0.3;
          pitchWobble = 0;
          if (currentAlt === 0) {
            isArmed = false;
          }
        } else if (prev.flightMode === 'RTH_FAILSAFE') {
          // Autonomous return to home climb & cruise
          if (currentAlt < 60.0) {
            currentAlt = Math.min(60.0, currentAlt + 0.3);
          }
          currentSpeed = 12.0 + Math.sin(time) * 0.4;
          pitchWobble = -5.0; // Pitch nose-down for forward travel
          yawHeading = (prev.attitude.yaw + 0.5) % 360;
        } else {
          currentSpeed = 7.0 + Math.sin(time * 0.9) * 0.8;
        }

        return {
          ...prev,
          timestampMs: Date.now(),
          armed: isArmed,
          gps: {
            ...prev.gps,
            altitudeAglMeters: Number(currentAlt.toFixed(1)),
            altitudeMslMeters: Number((currentAlt + 13.5).toFixed(1)),
          },
          attitude: {
            roll: rollWobble,
            pitch: pitchWobble,
            yaw: yawHeading,
          },
          velocity: {
            ...prev.velocity,
            groundSpeedMs: Number(currentSpeed.toFixed(1)),
          },
          link: {
            ...prev.link,
            rttLatencyMs:
              prev.link.quality === 'DEGRADED'
                ? 210 + Math.floor(Math.random() * 80)
                : 55 + Math.floor(Math.random() * 15),
            packetLossPct:
              prev.link.quality === 'DEGRADED'
                ? 4.2 + Math.random() * 2.5
                : 0.1 + Math.random() * 0.2,
          },
        };
      });

      // Update simulated audio spectrum & operator VU meter
      setAudioState((prev) => {
        const isBroadcasting = prev.uplinkPttActive || prev.uplinkOpenMic;
        const realDb = cockpitAudio.getRealMicLevelDb();

        let dbLevel = -60;
        if (realDb !== null) {
          dbLevel = realDb;
        } else if (isBroadcasting) {
          dbLevel = -18 + Math.floor(Math.random() * 12);
        }

        return {
          ...prev,
          audioSpectrum: prev.audioSpectrum.map(() =>
            prev.downlinkMuted ? 0 : Math.floor(Math.random() * 70) + 15
          ),
          uplinkLevelDb: dbLevel,
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Handlers for Cockpit Actions
  const handleSimulateLinkQuality = (quality: DatalinkQuality) => {
    setTelemetry((prev) => ({
      ...prev,
      link: {
        ...prev.link,
        quality,
        rttLatencyMs: quality === 'LINK_LOST' ? 9999 : quality === 'DEGRADED' ? 240 : 60,
        packetLossPct: quality === 'LINK_LOST' ? 100 : quality === 'DEGRADED' ? 6.5 : 0.1,
      },
    }));
  };

  const handleToggleFlightMode = (mode: TelemetryState['flightMode']) => {
    setTelemetry((prev) => ({
      ...prev,
      flightMode: mode,
    }));
  };

  const handleSetCameraMode = (mode: TelemetryState['payload']['cameraSensorMode']) => {
    setTelemetry((prev) => ({
      ...prev,
      payload: { ...prev.payload, cameraSensorMode: mode },
    }));
  };

  const handleSetZoom = (zoom: number) => {
    setTelemetry((prev) => ({
      ...prev,
      payload: { ...prev.payload, cameraZoom: zoom },
    }));
  };

  const handleGimbalMove = (pitchDelta: number, yawDelta: number) => {
    setTelemetry((prev) => ({
      ...prev,
      payload: {
        ...prev.payload,
        gimbalPitchDeg: Math.max(-90, Math.min(20, prev.payload.gimbalPitchDeg + pitchDelta)),
        gimbalYawDeg: Math.max(-120, Math.min(120, prev.payload.gimbalYawDeg + yawDelta)),
      },
    }));
  };

  const handleTogglePtt = (active: boolean) => {
    setAudioState((prev) => ({ ...prev, uplinkPttActive: active }));
  };

  const handleToggleOpenMic = () => {
    setAudioState((prev) => ({ ...prev, uplinkOpenMic: !prev.uplinkOpenMic }));
  };

  const handleSetGain = (gain: number) => {
    setAudioState((prev) => ({ ...prev, uplinkInputGain: gain }));
  };

  const handleToggleDownlinkMute = () => {
    setAudioState((prev) => ({ ...prev, downlinkMuted: !prev.downlinkMuted }));
  };

  const handleSetDownlinkVolume = (vol: number) => {
    setAudioState((prev) => ({ ...prev, downlinkVolume: vol }));
  };

  const handleTriggerSiren = (siren: string | null) => {
    setAudioState((prev) => ({ ...prev, activeSiren: siren }));
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 font-sans">
      
      {/* 1. Header Banner & Quick Diagnostics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-100 font-mono tracking-tight">
                TACTICAL UAS GROUND CONTROL STATION
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                WebRTC H.264 + Opus
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Low-latency downlink video &amp; onboard mic, 20Hz MAVLink telemetry, and one-way uplink PA loudspeaker.
            </p>
          </div>
        </div>

        {/* Action Toggle: Protocol Architecture Specs Modal */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchSpecs(!showArchSpecs)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>{showArchSpecs ? 'Hide Protocol Specs' : 'Protocol Stack Specs'}</span>
          </button>
        </div>
      </div>

      {/* Architecture Specs Collapsible Card */}
      {showArchSpecs && (
        <div className="bg-slate-950/90 border border-sky-800/60 rounded-2xl p-4 text-xs font-mono text-slate-300 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="font-bold text-sky-400 flex items-center gap-2 font-sans">
              <Terminal className="w-4 h-4 text-sky-400" />
              Production Hardware &amp; GStreamer Pipeline Architecture
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
              Zero-Latency Configuration
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <div className="font-bold text-slate-200 text-[11px] text-amber-400">
                1. Airborne Video Pipeline (NVIDIA Jetson / Pi 5)
              </div>
              <pre className="text-[10px] bg-black/60 p-2 rounded text-emerald-400 overflow-x-auto">
{`gst-launch-1.0 -v \\
  v4l2src device=/dev/video0 ! \\
  video/x-raw,width=1920,height=1080,framerate=60/1 ! \\
  nvvidconv ! \\
  nvv4l2h264enc maxperf-enable=1 tune=zerolatency \\
    bitrate=4500000 idrinterval=60 ! \\
  rtph264pay config-interval=1 pt=96 ! \\
  webrtcbin name=sendrecv`}
              </pre>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <div className="font-bold text-slate-200 text-[11px] text-sky-400">
                2. Bi-Directional Audio &amp; Loudspeaker Output
              </div>
              <pre className="text-[10px] bg-black/60 p-2 rounded text-cyan-400 overflow-x-auto">
{`# Downlink Onboard Mic (Opus Mono 24kHz):
alsasrc device="hw:1,0" ! opusenc bitrate=32000 ! rtpopuspay

# Uplink Operator PA Speaker (Class-D 40W Amp):
webrtcbin ! rtpopusdepay ! opusdec ! \\
  audioconvert ! audioresample ! \\
  alsasink device="hw:0,0" sync=false`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Operator Cockpit: Video Stage (Left) & Telemetry Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left 2 Cols: Primary HUD Video Stage */}
        <div className="lg:col-span-2 flex flex-col space-y-3">
          <VideoStreamHUD
            telemetry={telemetry}
            audioState={audioState}
            onSetCameraMode={handleSetCameraMode}
            onSetZoom={handleSetZoom}
            onGimbalMove={handleGimbalMove}
          />

          {/* Audio Controls Bar (Directly below video feed) */}
          <AudioControls
            audioState={audioState}
            onTogglePtt={handleTogglePtt}
            onToggleOpenMic={handleToggleOpenMic}
            onSetGain={handleSetGain}
            onToggleDownlinkMute={handleToggleDownlinkMute}
            onSetDownlinkVolume={handleSetDownlinkVolume}
            onTriggerSiren={handleTriggerSiren}
          />
        </div>

        {/* Right 1 Col: Telemetry & Envelope Panel */}
        <div className="lg:col-span-1 h-full min-h-[500px]">
          <TelemetryPanel
            telemetry={telemetry}
            onSimulateLinkQuality={handleSimulateLinkQuality}
            onToggleFlightMode={handleToggleFlightMode}
          />
        </div>

      </div>

    </div>
  );
};
