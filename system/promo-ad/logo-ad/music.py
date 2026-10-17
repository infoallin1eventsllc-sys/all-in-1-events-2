"""Original score for the Meridian logo ad (27.3 s), synthesised from scratch.

Timed to build.sh: the mark forms on the monolith 1.55-3.3 s, cut to the
close-up 3.67 s, glint 4.15 s, flash to the scenes 6.29 s. Scenes: checks at
+3.0, +6.2, +9.4, the answer at +12.6, end card at +15.4 (relative to 6.29).
Synth voices are the ones from ../music.py. 120 BPM in D minor: Dm - Bb - F - C.
"""
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 44100
FILM = 151 / 24
VOICE = len(sys.argv) > 2 and sys.argv[2] == "voice"   # the clip's own voice over the film, end card straight after
DUR = FILM + (6.0 if VOICE else 21.0)
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
C1, C2, C3, A0, E0 = (FILM + x for x in (3.0, 6.2, 9.4, 12.6, 15.4))
if VOICE:
    E0 = FILM

t_all = np.arange(N) / SR
mix_l = np.zeros(N)
mix_r = np.zeros(N)
rng = np.random.default_rng(7)


def note_hz(n):  # midi number -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    mix_l[i:i + len(sig)] += sig * (1 - max(0, pan))
    mix_r[i:i + len(sig)] += sig * (1 + min(0, pan))


def env(n, a=0.005, d=0.2, s=0.0, r=0.05, length=None):
    length = length or n / SR
    t = np.arange(n) / SR
    e = np.where(t < a, t / a, 1.0)
    dec = np.exp(-(t - a) / max(d, 1e-4))
    e = np.where(t >= a, s + (1 - s) * dec, e)
    rel = np.clip((length - t) / r, 0, 1)
    return e * rel


def lowpass(x, cutoff):
    # one-pole low-pass: y[i] = (1 - a) x[i] + a y[i-1]
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) + 0.25 * np.sin(ph * 2) * np.exp(-t * 30)


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    x = rng.standard_normal(n)
    x = x - lowpass(x, 7000)
    return x * env(n, 0.001, 0.12 if open_ else 0.025)


def clap():
    n = int(0.25 * SR)
    x = rng.standard_normal(n)
    x = lowpass(x - lowpass(x, 900), 6000)
    e = np.zeros(n)
    for o in (0, 0.011, 0.022):
        i = int(o * SR)
        e[i:] += np.exp(-np.arange(n - i) / SR / (0.012 if o < 0.02 else 0.09))
    return x * e * 0.6


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        ph = (t * freq * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / 3


def bass(midi, length):
    n = int(length * SR)
    x = saw(note_hz(midi), n) + 0.6 * np.sin(2 * np.pi * note_hz(midi - 12) * np.arange(n) / SR)
    return lowpass(x, 420) * env(n, 0.005, 0.25, 0.55, 0.04, length)


def pluck(midi, length=0.24):
    n = int(length * SR)
    x = saw(note_hz(midi), n, 0.004)
    return lowpass(x, 2600) * env(n, 0.002, 0.11, 0.0, 0.03, length)


def pad(midis, length, cutoff=1400):
    n = int(length * SR)
    x = sum(saw(note_hz(m), n, 0.006) for m in midis) / len(midis)
    a = min(0.6, length / 3)
    return lowpass(x, cutoff) * env(n, a, 10, 1.0, min(0.8, length / 3), length)


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep the filter up across the riser, block by block
    blk = 2048
    for i in range(0, n, blk):
        c = 300 + 7000 * (i / n) ** 2
        out[i:i + blk] = lowpass(x[i:i + blk] - lowpass(x[i:i + blk], 200), c)
    return out * (t / length) ** 2


def impact():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-t * 12)) * t) * np.exp(-t * 2.6)
    noise = rng.standard_normal(n)
    crash = (noise - lowpass(noise, 3000)) * np.exp(-t * 3.2) * 0.35
    return boom + crash


def chime(midi, length=1.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = note_hz(midi)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * d) for m, a, d in ((1, 1, 2.2), (2.01, .45, 3.5), (3.98, .2, 6), (5.4, .08, 9)))
    return x * np.clip(t / 0.003, 0, 1)


def tick():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 60)


# --- film: the room, the mark forming -----------------------------------------
add(pad([38, 45, 50, 53], FILM + 0.3, 600), 0.0, 0.42)
if not VOICE:
    add(pad([62, 69], 3.0, 1600), 1.4, 0.10)
    # particles: a shimmer of glassy notes that speeds up as they converge
    notes = [74, 77, 81, 84, 86, 89]
    k = 0
    tt = 1.55
    while tt < 3.25:
        add(chime(notes[k % 6] + (12 if k % 5 == 4 else 0), 0.9), tt, 0.07 + 0.05 * (tt - 1.55), -0.6 + 1.2 * ((k * 7) % 11) / 10)
        tt += 0.16 - 0.08 * (tt - 1.55) / 1.7
        k += 1
    add(riser(1.8), 1.5, 0.22)
    # formed: a bell chord, then the cut to the close-up
    for m, p in ((62, -.3), (69, .3), (74, 0), (81, 0)):
        add(chime(m, 3.0), 3.3, 0.22, p)
    add(impact(), 3.67, 0.45)
    add(pad([50, 57, 62, 65], FILM - 3.67, 1300), 3.67, 0.2)
    add(chime(93, 1.2), 4.2, 0.12, 0.4)          # the glint
add(riser(1.4), FILM - 1.4, 0.32)
add(impact(), FILM, 0.85)

if not VOICE:
    # --- scenes: a light groove under the checks -------------------------------------
    CHORDS = [(50, [50, 53, 57]), (46, [46, 50, 53]), (53, [53, 57, 60]), (48, [48, 52, 55])]  # Dm Bb F C
    BAR = BEAT * 4
    t = FILM
    bar = 0
    while t < E0 - 0.01:
        root, chord = CHORDS[bar % 4]
        for b in range(4):
            bt = t + b * BEAT
            if bt >= E0 - 0.01:
                break
            if bt >= C1 - 0.01:
                add(kick(), bt, 0.85)
                if b % 2 == 1:
                    add(clap(), bt, 0.4)
            add(hat(), bt + BEAT / 2, 0.2, 0.3)
            for kk in range(2):
                add(bass(root - 12, BEAT / 2 - 0.02), bt + kk * BEAT / 2, 0.38)
                add(pluck(chord[(b * 2 + kk) % 3] + 12), bt + kk * BEAT / 2, 0.13, -0.3 + 0.6 * kk)
        add(pad([n + 12 for n in chord], min(BAR, E0 - t), 1800), t, 0.12)
        t += BAR
        bar += 1
    for c in (C1, C2, C3):
        add(tick(), c + 0.2, 0.25)
    add(chime(81, 1.0), C1 + 1.35, 0.14)          # "ready"
    add(chime(84, 1.0), C2 + 1.0, 0.14)           # the tap
    add(chime(86, 1.0), C3 + 1.45, 0.14)          # results
    for i in range(3):                             # the three ticks
        add(chime([74, 78, 81][i], 1.2), A0 + 0.7 + i * 0.3, 0.2)
    add(riser(1.1), E0 - 1.1, 0.28)
    add(impact(), E0, 0.8)
end_len = DUR - E0
add(pad([50, 57, 62, 65, 69], end_len, 2200), E0, 0.3)
add(bass(38, end_len - 0.3), E0, 0.32)
for kk in range(int(end_len / (BEAT / 2))):
    add(pluck([74, 77, 81, 84][kk % 4] + (12 if kk % 8 >= 4 else 0)), E0 + 0.4 + kk * BEAT / 2, 0.09 * max(0, 1 - kk / 18), -0.4 + 0.8 * (kk % 2))

# master: fade out the last 1.5 s, soft-clip, normalise to -1 dBFS
fade = np.clip((DUR - t_all) / 1.5, 0, 1)
L = np.tanh(mix_l * fade * 0.9)
R = np.tanh(mix_r * fade * 0.9)
peak = max(np.abs(L).max(), np.abs(R).max())
g = 10 ** (-1 / 20) / peak
st = np.stack([L * g, R * g], axis=1)
pcm = (st * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1], f"{DUR:.2f}s")
