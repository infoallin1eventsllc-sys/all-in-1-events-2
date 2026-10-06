"""The film's soundtrack: the guide's voice (ElevenLabs "River", film/guide-voice.mp3)
placed on its cues, over a quiet synthesized score and a few effects (the door
chime, the lock, the panel tap). Also writes the voice's loudness per frame, so
the guide glows with its own voice.

Usage: python3 film/audio.py <ffmpeg> <out-dir> [cues.json]
The optional cues file (written by scripts/assemble-film.mjs) moves every cue to a
different timeline: {"duration", "segments": [[a, b, at]...], "chords": [t...],
"level": [[t, v]...], "bells": [t...], "door": t, "lock": t, "tap": t|null,
"end": t, "swells": [[a, b]...], "voice_frames": [from, to]}.
"""
import json, subprocess, sys, wave
import numpy as np

FF, OUT = sys.argv[1], sys.argv[2]
CUES = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
SR, DUR, FPS = 44100, float(CUES.get("duration", 92.0)), 24
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)

raw = subprocess.run([FF, "-v", "error", "-i", "film/guide-voice.mp3", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
src = np.frombuffer(raw, dtype=np.float32)

# (start, end) in the take -> where it goes in the film
SEGMENTS = [tuple(x) for x in CUES.get("segments", [(0.0, 2.3, 51.0), (3.0, 8.4, 56.0), (8.5, 20.6, 63.2), (20.6, 25.87, 76.2)])]
voice = np.zeros(N, dtype=np.float64)
for a, b, at in SEGMENTS:
    seg = src[int(a * SR):int(b * SR)].astype(np.float64)
    f = int(0.012 * SR)
    seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
    i = int(at * SR)
    seg = seg[: max(0, N - i)]
    voice[i:i + len(seg)] += seg

def env(points):
    """Piecewise-linear envelope from (time, value) pairs."""
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)

# Score: slow chords, one per scene, crossfaded.
CHORDS = [
    (0, [146.83, 220.0, 329.63, 369.99]),   # D add9
    (13, [123.47, 185.0, 293.66, 440.0]),   # Bm7
    (24, [98.0, 146.83, 246.94, 369.99]),   # Gmaj7
    (33, [110.0, 164.81, 277.18, 329.63]),  # A
    (44, [146.83, 220.0, 293.66, 369.99]),  # D
    (63, [98.0, 146.83, 246.94, 329.63]),   # G6
    (76, [123.47, 185.0, 293.66, 369.99]),  # Bm
    (86, [146.83, 220.0, 329.63, 440.0]),   # D add9, resolve
]
if "chords" in CUES: CHORDS = [(tt, ch) for tt, (_, ch) in zip(CUES["chords"], CHORDS)]
music_l = np.zeros(N); music_r = np.zeros(N)
for idx, (start, freqs) in enumerate(CHORDS):
    end = CHORDS[idx + 1][0] if idx + 1 < len(CHORDS) else DUR
    w = np.clip((t - (start - 1.5)) / 1.5, 0, 1) * np.clip(((end + 1.5) - t) / 1.5, 0, 1)
    for k, f in enumerate(freqs):
        amp = 0.05 / (1 + k * 0.35)
        lfo = 1 + 0.15 * np.sin(2 * np.pi * (0.07 + k * 0.03) * t + k)
        music_l += w * amp * lfo * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t))
        music_r += w * amp * lfo * (np.sin(2 * np.pi * f * 1.002 * t + 0.4) + 0.3 * np.sin(2 * np.pi * f * 1.997 * t))
level = env([tuple(x) for x in CUES.get("level", [(0, 0), (4, 0.7), (13, 0.8), (24, 1.0), (33, 0.8), (44, 0.75), (50, 0.6), (82, 0.7), (86.5, 1.15), (89, 1.0), (92, 0)])])
# Duck the score under the voice.
v_env = np.convolve(np.abs(voice), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
duck = 1 - 0.55 * np.clip(v_env / (v_env.max() + 1e-9) * 4, 0, 1)
music_l *= level * duck; music_r *= level * duck

def bell(at, f, dur=2.2, amp=0.18):
    out = np.zeros(N); i = int(at * SR); n = min(int(dur * SR), N - i)
    tt = np.arange(n) / SR
    out[i:i + n] = amp * np.exp(-tt * 3.2) * (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) + 0.15 * np.sin(2 * np.pi * f * 5.4 * tt))
    return out

def swell(a, b, amp=0.12):
    """Filtered noise rising then falling between a and b (a 'whoosh')."""
    noise = rng.standard_normal(N)
    k = int(0.004 * SR); noise = np.convolve(noise, np.ones(k) / k, mode="same")
    e = np.clip((t - a) / ((b - a) * 0.7), 0, 1) ** 2 * np.clip((b - t) / ((b - a) * 0.3), 0, 1)
    return amp * noise * e

def click(at, amp=0.25):
    out = np.zeros(N); i = int(at * SR); n = int(0.018 * SR)
    out[i:i + n] = amp * rng.standard_normal(n) * np.exp(-np.arange(n) / (0.004 * SR))
    return out

fx = np.zeros(N)
for at in CUES.get("bells", (5.4, 13.4, 24.4, 33.4, 44.4)):
    fx += bell(at, 1318.5, 2.5, 0.05)
for a, b in CUES.get("swells", [(22.4, 26.2), (42.6, 45.0), (79.2, 82.0)]):
    fx += swell(a, b, 0.09)
door = CUES.get("door", 50.55)
fx += bell(door, 659.25, 2.4, 0.16) + bell(door + 0.2, 987.77, 2.4, 0.14) + bell(door + 0.45, 1318.5, 2.0, 0.08)   # door chime
fx += click(CUES.get("lock", 51.25), 0.3)                                                                            # lock
tap = CUES.get("tap", 81.9)
if tap is not None: fx += click(tap, 0.18) + bell(tap + 0.02, 1760.0, 1.2, 0.06)                                     # the panel tap
sub = np.zeros(N); i = int(CUES.get("end", 86.2) * SR); n = int(3.5 * SR); tt = np.arange(n) / SR
sub[i:i + n] = 0.28 * np.exp(-tt * 1.4) * np.sin(2 * np.pi * 55 * tt)
fx += sub + bell(CUES.get("end", 86.2) + 0.1, 880.0, 3.5, 0.07)

L = music_l + fx + voice * 0.95
R = music_r + fx + voice * 0.95
peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak / 0.89; R /= peak / 0.89
with wave.open(f"{OUT}/film-audio.wav", "wb") as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((np.stack([L, R], axis=1) * 32767).astype(np.int16).tobytes())

# The voice's loudness per frame from 51 s, 0..1.
frames = []
vf0, vf1 = CUES.get("voice_frames", (51, 82))
for k in range(int((vf1 - vf0) * FPS)):
    a = int((vf0 + k / FPS) * SR); b = a + SR // FPS
    frames.append(float(np.sqrt(np.mean(voice[a:b] ** 2))))
m = max(frames) or 1
json.dump([round(min(1.0, f / m * 1.3), 2) for f in frames], open(f"{OUT}/voice-env.json", "w"))
print("audio ok", round(DUR, 1), "s")
