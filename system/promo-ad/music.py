"""Original score for the Meridian Interface promo (21 s), synthesised from scratch.

Timed to the ad's cuts (ad.html): products start 3.4 s, montage 12.6 s, proof
15.0 s, end card 17.4 s. 120 BPM in A minor: Am - F - C - G.
"""
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 44100
DUR = 21.0
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
P0, M0, R0, E0 = 3.4, 12.6, 15.0, 17.4

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

# groove: products, montage and proof
t = P0
bar = 0
while t < E0 - 0.01:
    root, chord = CHORDS[bar % 4]
    for b in range(4):
        bt = t + b * BEAT
        if bt >= E0:
            break
        add(kick(), bt, 0.95)
        add(hat(), bt + BEAT / 2, 0.22, 0.3)
        if b % 2 == 1 and bt >= R0 - 0.01:
            add(clap(), bt, 0.55)
        for k in range(2):
            add(bass(root - 12, BEAT / 2 - 0.02), bt + k * BEAT / 2, 0.42)
        # arpeggio, 8ths, after the first bar
        if bar >= 1 or b >= 2:
            for k in range(2):
                add(pluck(chord[(b * 2 + k) % 3] + 12), bt + k * BEAT / 2, 0.16, -0.3 + 0.6 * k)
    add(pad([n + 12 for n in chord], min(BAR, E0 - t), 1800), t, 0.14)
    t += BAR
    bar += 1

# montage lift and the end card
add(riser(0.9), M0 - 0.9, 0.2)
add(riser(1.1), E0 - 1.1, 0.3)
add(impact(), E0, 0.85)
end_len = DUR - E0
add(pad([57, 60, 64, 69], end_len, 2200), E0, 0.32)
add(bass(45, end_len - 0.3), E0, 0.35)
for k in range(int(end_len / (BEAT / 2))):
    add(pluck([69, 72, 76, 79][k % 4] + (12 if k % 8 >= 4 else 0)), E0 + 0.4 + k * BEAT / 2, 0.1 * (1 - k / 16), -0.4 + 0.8 * (k % 2))

# master: fade out the last 1.2 s, soft-clip, normalise to -1 dBFS
fade = np.clip((DUR - t_all) / 1.2, 0, 1)
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
