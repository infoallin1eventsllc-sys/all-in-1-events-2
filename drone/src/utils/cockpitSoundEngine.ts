/**
 * Web Audio API Sound Synthesizer for Tactical UAS GCS
 * Provides realistic radio mic chirp, roger beep, wailing siren alert, 
 * downlinked quadcopter rotor hum, and real WebRTC microphone analyser.
 */

class CockpitSoundEngine {
  private ctx: AudioContext | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private rotorNoiseNode: AudioNode | null = null;
  private rotorGain: GainNode | null = null;
  private realMicStream: MediaStream | null = null;
  private realMicAnalyser: AnalyserNode | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Radio Mic Key Click (when PTT button pressed)
   */
  public playRadioKeyBeep(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.04);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // AudioContext policy restriction
    }
  }

  /**
   * Radio Roger Beep (when PTT released)
   */
  public playRogerBeep(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1040, now);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // AudioContext policy restriction
    }
  }

  /**
   * Tactical PA Siren / Klaxon Alert
   */
  public startSiren(type: 'SIREN' | 'CLEAR_AREA'): void {
    this.stopSiren();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'SIREN') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(650, now);
        // Periodic frequency modulation
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(1.5, now); // 1.5 Hz wail cycle
        lfoGain.gain.setValueAtTime(350, now);   // 650 +/- 350 Hz (300 to 1000 Hz)
        lfo.connect(osc.frequency);
        lfo.start(now);
      } else {
        // Warning Horn / Klaxon pulse
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(3.0, now); // Pulsing horn
        lfoGain.gain.setValueAtTime(100, now);
        lfo.connect(osc.frequency);
        lfo.start(now);
      }

      gain.gain.setValueAtTime(0.08, now);
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      this.sirenOsc = osc;
      this.sirenGain = gain;
    } catch {
      // AudioContext error
    }
  }

  public stopSiren(): void {
    if (this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenOsc.disconnect();
      } catch {
        // Ignore
      }
      this.sirenOsc = null;
    }
    if (this.sirenGain) {
      try {
        this.sirenGain.disconnect();
      } catch {
        // Ignore
      }
      this.sirenGain = null;
    }
  }

  /**
   * Ambient Drone Rotor Hum (Downlink Audio)
   */
  public updateAmbientRotor(volumePercent: number, isMuted: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const targetGain = isMuted ? 0 : (volumePercent / 100) * 0.05;

    if (!this.rotorNoiseNode) {
      try {
        // Create subtle pink/brown noise for prop wash + 120Hz fundamental tone
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99 * b0 + white * 0.05;
          b1 = 0.95 * b1 + white * 0.1;
          b2 = 0.85 * b2 + white * 0.2;
          output[i] = (b0 + b1 + b2) * 0.2;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        // Bandpass filter to sound like ducted propellers
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(280, ctx.currentTime);
        filter.Q.setValueAtTime(2.0, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(targetGain, ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        whiteNoise.start();

        this.rotorNoiseNode = whiteNoise;
        this.rotorGain = gain;
      } catch {
        // Audio error
      }
    } else if (this.rotorGain) {
      this.rotorGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.1);
    }
  }

  /**
   * Optional Real Mic Ingest using getUserMedia
   */
  public async initRealMic(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = this.getContext();
      if (!ctx) return false;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      this.realMicStream = stream;
      this.realMicAnalyser = analyser;
      return true;
    } catch {
      return false;
    }
  }

  public getRealMicLevelDb(): number | null {
    if (!this.realMicAnalyser) return null;
    const data = new Uint8Array(this.realMicAnalyser.frequencyBinCount);
    this.realMicAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;
    if (avg < 2) return -60;
    // Map 0-255 to -60 to 0 dB
    const db = Math.round((avg / 255) * 60 - 60);
    return Math.max(-60, Math.min(0, db));
  }

  public stopRealMic(): void {
    if (this.realMicStream) {
      this.realMicStream.getTracks().forEach((t) => t.stop());
      this.realMicStream = null;
    }
    this.realMicAnalyser = null;
  }
}

export const cockpitAudio = new CockpitSoundEngine();
