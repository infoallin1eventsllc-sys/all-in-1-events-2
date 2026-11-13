"""Soundtrack for the hero laptop film.  python3 score.py [out.wav]

One 4-bar phrase, exactly the film's length (467 frames at 30 fps = 15.567 s),
in A minor: Am(add9) | Fmaj7 | C  G | Esus4 -> Am.  It starts from silence and
ends in silence, so the loop seam is a breath, not a cut (a looping <video>
is not gapless, so the seam has to be quiet anyway).

Film beats it follows: opens 1.0-2.8 s, whip into the close-ups 4.3-4.8 s,
labels near 5.1 / 6.8 / 8.8 / 9.7 s, pulls back and closes 11.1-12.6 s, at rest
from 13.2 s.  The resolution to A minor lands on beat 14 (12.65 s), as it closes.

No limiter anywhere (one caused a clipped spike on an earlier film): the level
is set afterwards by one fixed gain, and the build checks the encoded peak.
Needs numpy and scipy.
"""
import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

sr = 48000; N = 747200; L = N / sr; beat = L / 16; t = np.arange(N) / sr
rng = np.random.default_rng(11)


def ss(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)
def lp(x, fc, order=2): return sosfilt(butter(order, fc, fs=sr, output='sos'), x)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, btype='high', fs=sr, output='sos'), x)


def place(buf, sig, t0, pan=0.0, gain=1.0):
    i = int(round(t0 * sr))
    if i >= N: return
    sig = sig[:N - i]; l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(sig)] += sig * l * gain; buf[1, i:i + len(sig)] += sig * r * gain


A1, E2, F2, C2, G2, A2 = 55.0, 82.41, 87.31, 65.41, 98.0, 110.0
NOTE = {'E3': 164.81, 'F3': 174.61, 'G3': 196.0, 'A3': 220.0, 'B3': 246.94, 'C4': 261.63, 'D4': 293.66, 'E4': 329.63,
        'F4': 349.23, 'G4': 392.0, 'A4': 440.0, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33, 'E5': 659.26, 'G5': 783.99,
        'A5': 880.0, 'C6': 1046.5, 'D6': 1174.66, 'E6': 1318.51}
dry = np.zeros((2, N)); wet = np.zeros((2, N))

# --- pad: additive, band-limited, slow in and slow out, chords overlap ---------
def pad_note(f, dur, det):
    tt = np.arange(int(dur * sr)) / sr; x = np.zeros_like(tt)
    for k in range(1, 40):
        fk = f * k * det
        if fk > 3200: break
        x += np.sin(2 * np.pi * fk * tt + rng.uniform(0, 6.28)) / k / (1 + (fk / 2300) ** 2)
    return x

chords = [(0.0, 4.0, ['A3', 'E4', 'B4', 'C5']), (4.0, 8.0, ['F3', 'C4', 'E4', 'A4']), (8.0, 10.0, ['G3', 'C4', 'E4', 'G4']),
          (10.0, 12.0, ['G3', 'B3', 'D4', 'G4']), (12.0, 13.0, ['E3', 'A3', 'B3', 'E4']), (13.0, 16.0, ['A3', 'E4', 'B4', 'C5'])]
for b0, b1, notes in chords:
    t0 = max(0.0, b0 * beat - 0.35); dur = (b1 * beat + 1.5) - t0
    tt = np.arange(int(dur * sr)) / sr
    env = ss(tt / 1.0) * ss((dur - tt) / 1.7)
    for nm in notes:
        for pan, det in ((-0.6, 1.0018), (0.6, 0.9982)):
            place(dry, pad_note(NOTE[nm], dur, det) * env, t0, pan, 0.046)
dry *= 0.82 + 0.18 * np.cos(2 * np.pi * (t / (2 * beat)) + np.pi)   # the pad breathes every two beats

# --- bass: sine with a little second harmonic so small speakers hear it ---------
def bass(f, dur):
    tt = np.arange(int(dur * sr)) / sr
    return (np.sin(2 * np.pi * f * tt) + 0.32 * np.sin(4 * np.pi * f * tt) + 0.10 * np.sin(6 * np.pi * f * tt)) * ss(tt / 0.09) * ss((dur - tt) / 0.6)

for b0, b1, f in [(1, 4, A2), (4, 8, F2), (8, 10, C2 * 2), (10, 12, G2), (12, 13, E2), (13, 15.2, A1 * 2)]:
    place(dry, bass(f, (b1 - b0) * beat + 0.25), b0 * beat, 0, 0.080)
place(dry, bass(A1, 2.4) * np.exp(-np.arange(int(2.4 * sr)) / sr / 1.1), 13 * beat, 0, 0.10)   # the landing

# --- pulse: a soft heartbeat through the close-ups, always on the beat grid -----
def kick():
    tt = np.arange(int(0.26 * sr)) / sr; f = 46 + 60 * np.exp(-tt / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-tt / 0.085) * ss(tt / 0.003)

def tick(fc=7000, d=0.03):
    x = hp(rng.standard_normal(int(0.09 * sr)), fc); tt = np.arange(len(x)) / sr
    return x * np.exp(-tt / d) * ss(tt / 0.001)

for b in range(4, 13):
    place(dry, kick(), b * beat, 0, 0.17 * ss((b - 3) / 2.0))
for b in range(4, 12):
    place(dry, tick(), (b + 0.5) * beat, 0.25, 0.055)
    for q in (0.25, 0.75): place(dry, tick(9000, 0.015), (b + q) * beat, -0.3, 0.024)

# --- plucks: rise as it opens, weave through the middle, step down as it closes --
def pluck(f, tau=0.38):
    tt = np.arange(int(1.6 * sr)) / sr
    return (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt)) * np.exp(-tt / tau) * ss(tt / 0.005) * ss((1.6 - tt) / 0.3)

seq = [(1 + i * 0.5, nm, 0.55 + 0.07 * i) for i, nm in enumerate(['A3', 'C4', 'E4', 'A4', 'B4', 'C5', 'E5'])]
for b0, pat in [(4, ['F4', 'A4', 'C5', 'E5', 'C5', 'A4', 'F4', 'A4']), (8, ['E4', 'G4', 'C5', 'E5']), (10, ['D4', 'G4', 'B4', 'D5'])]:
    seq += [(b0 + i * 0.5, nm, 0.85) for i, nm in enumerate(pat)]
seq += [(12, 'E5', 0.8), (12.5, 'B4', 0.7), (13, 'A4', 0.9), (13, 'E5', 0.45)]
for i, (b, nm, g) in enumerate(seq):
    pan = 0.45 if i % 2 else -0.45
    place(dry, pluck(NOTE[nm]), b * beat, pan, 0.17 * g)
    place(wet, pluck(NOTE[nm]), b * beat, pan, 0.17 * g)
    for r, fb in ((1, 0.34), (2, 0.14)):                      # dotted-eighth echoes, swapping sides
        if b + 0.75 * r < 13.6: place(wet, pluck(NOTE[nm]), (b + 0.75 * r) * beat, -pan if r % 2 else pan, 0.17 * g * fb)

# --- bells where the labels appear (on the sixteenth-note grid) -------------------
def bell(f):
    tt = np.arange(int(2.2 * sr)) / sr
    return (np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.8) + 0.35 * np.sin(2 * np.pi * 2.76 * f * tt) * np.exp(-tt / 0.18)
            + 0.15 * np.sin(2 * np.pi * 5.4 * f * tt) * np.exp(-tt / 0.06)) * ss(tt / 0.004) * ss((2.2 - tt) / 0.4)

for b, nm, pan in [(5.25, 'A5', -0.3), (7.0, 'C6', 0.3), (9.0, 'G5', -0.2), (10.0, 'D6', 0.3), (13.0, 'E6', 0.0)]:
    place(dry, bell(NOTE[nm]), b * beat, pan, 0.075); place(wet, bell(NOTE[nm]), b * beat, pan, 0.095)

# --- air: swept noise that moves with the camera -------------------------------------
def whoosh(dur, f0, f1, peak_at=0.65, bw=450):
    m = int(dur * sr); tt = np.arange(m) / sr; x = lp(rng.standard_normal(m), bw)
    fc = f0 * (f1 / f0) ** (tt / dur); car = np.cos(2 * np.pi * np.cumsum(fc) / sr)
    u = tt / dur; env = np.where(u < peak_at, ss(u / peak_at), ss((1 - u) / (1 - peak_at)))
    return x * car * env

for t0, dur, f0, f1, pk, g, pan in [(0.90, 1.15, 280, 3200, 0.7, 0.30, -0.2), (4.15, 0.80, 450, 4600, 0.6, 0.32, 0.2),
                                    (6.45, 0.40, 2400, 900, 0.4, 0.12, 0.3), (10.35, 0.40, 2400, 900, 0.4, 0.12, -0.3),
                                    (11.05, 1.60, 3400, 240, 0.35, 0.28, 0.0)]:
    w = whoosh(dur, f0, f1, pk); place(dry, w, t0, pan, g); place(wet, w, t0, -pan, g * 0.8)

# --- room: one soft reverb for everything melodic ---------------------------------------
m = int(2.2 * sr); tt = np.arange(m) / sr
ir = np.stack([lp(rng.standard_normal(m), 5200) * np.exp(-tt / 0.55) * ss(tt / 0.012) for _ in range(2)])
ir /= np.sqrt((ir ** 2).sum(1, keepdims=True))
send = wet + 0.45 * dry
rev = np.stack([fftconvolve(send[c], ir[c])[:N] for c in range(2)])
mix = dry + 0.30 * hp(rev, 180)

# --- the shape of the phrase ----------------------------------------------------------------
# Quiet while the laptop rests, up as it opens, full through the close-ups, then a
# decay that falls evenly in decibels (the way a room dies away), so the end glides
# out instead of dropping. One envelope only: two stacked fades made a chop before.
macro = 0.62 + 0.38 * ss((t - 3.6) / 1.3)
u = np.clip((t - 12.95) / (15.44 - 12.95), 0, 1)
tail = 10 ** (-(u ** 1.35) * 46 / 20) * (1 - ss((t - 15.30) / 0.14))
mix = hp(mix, 28) * ss(t / 0.04) * macro * tail
mix[:, int(15.46 * sr):] = 0
mix *= 0.5 / np.abs(mix).max()                       # placeholder level; the build sets loudness

out = (np.clip(mix.T, -1, 1) * 32767).astype(np.int16)
w = wave.open(sys.argv[1] if len(sys.argv) > 1 else 'score.wav', 'wb')
w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(out.tobytes()); w.close()

# --- what was made, in numbers (there is no way to listen in the build sandbox) --------------
mono = mix.mean(0)
def rms_db(hop_s, start=0):
    hop = int(hop_s * sr)
    return ' '.join('%.0f' % (20 * np.log10(np.sqrt((mono[i:i + hop] ** 2).mean()) + 1e-9)) for i in range(start, N - hop + 1, hop))
print('rms per 0.5 s:', rms_db(0.5))
print('last 3 s, per 0.25 s:', rms_db(0.25, N - 12 * int(0.25 * sr)))
sp = np.abs(np.fft.rfft(mono)) ** 2; fr = np.fft.rfftfreq(len(mono), 1 / sr); tot = sp.sum()
print('band share %:', ' '.join('%s %.0f' % (nm, 100 * sp[(fr >= lo) & (fr < hi)].sum() / tot)
                                 for nm, lo, hi in [('<120', 0, 120), ('120-500', 120, 500), ('500-2k', 500, 2000), ('2k-8k', 2000, 8000), ('>8k', 8000, 24000)]))
print('first 20 ms peak %.5f   last 100 ms peak %.5f   largest sample step %.4f'
      % (np.abs(mix[:, :960]).max(), np.abs(mix[:, -4800:]).max(), np.abs(np.diff(mix, axis=1)).max()))
