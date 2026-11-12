"""Original score for "How AI agents work" (29.0 s), synthesised from scratch (no licensed music).

Same instruments as ../music.py, re-timed: step 1 at 3.1 s, claps from "You approve" at 12.2 s,
lift into marketing at 16.3 s, wind-down from 19.1 s, landing on A minor at 23.1 s as the film wipes to the end card. 120 BPM in A minor: Am - F - C - G.
"""
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 44100
DUR = 29.0
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
P0, M0, R0, E0 = 3.1, 16.3, 12.2, 23.1

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


# chord progression, one chord per bar (2 s)
CHORDS = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # Am F C G
BAR = BEAT * 4

# intro: low pad and a riser into the first product
add(pad([45, 52, 57, 60], P0 + 0.2, 700), 0.0, 0.35)
add(riser(P0 - 0.3), 0.3, 0.32)
add(impact(), P0, 0.9)

# groove, then a wind-down that never stops dead. The band thins out over the last two bars
# of the film (F, then G), the harmony lands on A minor as the wipe crosses (TON), and the
# melody keeps going under the logo, slower and quieter, until it comes to rest on A.
TON = E0                      # the tonic lands here, on a bar line (P0 + 10 bars)
W0 = TON - 2 * BAR            # wind-down starts
OUT = {int(round((W0 - P0) / BAR)): (53, [53, 57, 60]), int(round((W0 - P0) / BAR)) + 1: (55, [55, 59, 62])}


def swell(midis, length, attack, release, cutoff=1700):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(saw(note_hz(k), n, 0.006) for k in midis) / len(midis)
    e = np.clip(t / attack, 0, 1) ** 1.5 * np.clip((length - t) / release, 0, 1) ** 1.5
    return lowpass(x, cutoff) * e


def bell(midi, length=3.2):
    n = int(length * SR); t = np.arange(n) / SR; f = note_hz(midi)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.01 * f * t) * np.exp(-t * 3)) * np.exp(-t * 1.4) * np.clip(t / 0.012, 0, 1)


t = P0
bar = 0
while t < TON - 0.01:
    root, chord = OUT.get(bar, CHORDS[bar % 4])
    wind = 0 if t < W0 - 0.01 else (1 if t < W0 + BAR - 0.01 else 2)     # 0 full, 1 easing, 2 nearly out
    for b in range(4):
        bt = t + b * BEAT
        if wind == 0 or wind == 1 or b % 2 == 0:
            add(kick(), bt, (0.95, 0.8, 0.55 - 0.1 * b / 2)[wind])
        add(hat(), bt + BEAT / 2, (0.22, 0.15, 0.09 - 0.02 * b)[wind], 0.3)
        if b % 2 == 1 and bt >= R0 - 0.01 and wind < 2:
            add(clap(), bt, (0.55, 0.32)[wind])
        if wind < 2:
            for k in range(2):
                add(bass(root - 12, BEAT / 2 - 0.02), bt + k * BEAT / 2, (0.42, 0.34)[wind])
        else:
            add(bass(root - 12, BEAT - 0.02), bt, 0.27 - 0.03 * b)                # quarter notes, softer each beat
        if bar >= 1 or b >= 2:
            for k in range(2):
                add(pluck(chord[(b * 2 + k) % 3] + 12), bt + k * BEAT / 2, 0.16, -0.3 + 0.6 * k)
    if wind == 0:
        add(pad([n + 12 for n in chord], BAR, 1800), t, 0.14)
    else:                                                                         # pads overlap, so the harmony cross-fades
        add(swell([n + 12 for n in chord], BAR + 1.4, 0.5, 1.6, 1800), t, (0.0, 0.18, 0.2)[wind])
    t += BAR
    bar += 1

# lift into marketing
add(riser(0.9), M0 - 0.9, 0.2)

# the landing: A minor, held. It swells in under the last bar instead of starting on the cut.
out_len = DUR - (TON - 1.2)
add(swell([45, 57, 60, 64, 71], out_len, 1.6, 0.4, 1700), TON - 1.2, 0.36)   # held to the end; the master fade shapes the exit
add(swell([69, 72, 76], out_len - 1.0, 2.4, 0.4, 2400), TON - 0.2, 0.10)
add(kick(), TON, 0.4)
b_end = bass(45, 4.6); add(b_end * np.linspace(1, 0, len(b_end)) ** 1.5, TON, 0.26)
# the melody keeps moving: eighths for one more bar, getting quieter, then quarters down to A
AM = [69, 72, 76]
for k in range(8):
    add(pluck(AM[k % 3], 0.3), TON + k * BEAT / 2, 0.15 - 0.011 * k, -0.3 + 0.6 * (k % 2))
for k, note in enumerate([76, 72, 69, 64]):
    add(pluck(note, 0.5), TON + BAR + k * BEAT, 0.07 - 0.012 * k, -0.2 + 0.4 * (k % 2))
add(bell(81), TON + 0.63, 0.10, -0.25)       # as the logo lights
add(bell(88), TON + 0.88, 0.06, 0.25)
add(bell(84), TON + BAR, 0.05, 0.0)          # as the words arrive
add(bell(69), TON + 2 * BAR, 0.07, 0.0)      # home

# a soft room on the whole mix, opening up through the wind-down, so every hit rings into the
# next and the last notes trail off instead of stopping
from scipy.signal import fftconvolve
ir_n = int(2.6 * SR); ir_t = np.arange(ir_n) / SR
wet_env = np.clip((t_all - (W0 - 1.0)) / (TON - W0 + 1.0), 0, 1) * 0.5 + 0.06
for ch, mix in ((0, mix_l), (1, mix_r)):
    ir = lowpass(np.random.default_rng(11 + ch).standard_normal(ir_n), 3200) * np.exp(-ir_t * 2.6)
    ir /= np.sqrt((ir ** 2).sum())
    mix += fftconvolve(mix, ir)[:N] * wet_env * 0.5

# master: a long raised-cosine fade to silence, done 0.3 s before the end; soft-clip; -1 dBFS
F0, F1 = TON + 2.6, DUR - 0.25
fade = 0.5 + 0.5 * np.cos(np.pi * np.clip((t_all - F0) / (F1 - F0), 0, 1))
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
print("wrote", sys.argv[1], f"{DUR}s")
