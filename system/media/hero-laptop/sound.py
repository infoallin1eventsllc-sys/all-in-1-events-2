"""The hero film's sound: the ad's own Higgsfield audio, cleaned and fitted.

    python3 sound.py <stretched.wav> <out.wav>

<stretched.wav> is the ad's audio already slowed to the film's speed with
    ffmpeg -i raw_audio.wav -af "rubberband=tempo=0.719424:channels=together:pitchq=quality:transients=smooth:window=long:smoothing=on" -ar 48000 stretched.wav
(channels=together matters: stretched apart, the stereo phase flips and the low
end cancels in mono).

Otis chose this sound over a composed score, then asked for it "clear and crisp",
with "anything that's popping and clacking" cleared up, flowing as "one
continuous motion". What was wrong, measured in the original:
  - it slams in at 0.78 s with two sample-level pops;
  - a cluster of sharp 4-12 ms clacks at 7.0-7.4 s (and smaller ones near 4.5 s);
  - it stops at 10.1 s, which left 2.5 s of dead air around the loop seam.
What this does, and nothing more:
  1. takes out inaudible rumble under 30 Hz;
  2. smooths the treble only where it spikes far above its own surroundings
     (the clacks), leaving the steady texture alone;
  3. lets the sound swell in over half a second instead of slamming, with a soft
     lead-in built from the sound itself played backwards through a room;
  4. lets the end ring out in that same room, so the phrase glides to silence
     just before the loop restarts (a looping <video> is not gapless, so the
     seam itself has to be quiet);
  5. a 1.5 dB lift above 6 kHz for clarity.
No limiter. The level is set afterwards by one fixed gain.
Needs numpy, scipy, soundfile.
"""
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfiltfilt

SR = 48000; N = 747200          # 467 frames at 30 fps
src, dst = sys.argv[1], sys.argv[2]
x, sr = sf.read(src); assert sr == SR
t_full = np.arange(N) / SR
def ss(u): u = np.clip(u, 0, 1); return u * u * (3 - 2 * u)
def filt(sig, fc, kind, order=4): return sosfiltfilt(butter(order, fc, btype=kind, fs=SR, output='sos'), sig, axis=0)

# The stretcher leaves a glitch on its very last samples (14.04 s): stop before it.
END = int(13.90 * SR); x = x[:END].copy(); n = len(x); t = np.arange(n) / SR

# 1. rumble
x = filt(x, 30, 'high', 2)

# 2. clacks: the band above 2.5 kHz, held to within 5 dB of its own +-120 ms median
lo = filt(x, 2500, 'low'); hi = x - lo
fr = int(0.002 * SR); m = hi.mean(1)
e = np.sqrt(np.convolve(m ** 2, np.ones(fr) / fr, 'same')) + 1e-9
step = int(0.004 * SR); es = e[::step]
med = np.array([np.median(es[max(0, i - 30):i + 31]) for i in range(len(es))])
med = np.interp(np.arange(n), np.arange(len(es)) * step, med)
g = np.minimum(1.0, (med * 10 ** (5 / 20)) / e)
w = int(0.006 * SR)                                  # look a little ahead and behind, then round the corners
g = np.array([g[max(0, i - w):i + w + 1].min() for i in range(0, n, 16)]); g = np.interp(np.arange(n), np.arange(len(g)) * 16, g)
k = np.hanning(int(0.008 * SR)); g = np.convolve(g, k / k.sum(), 'same')
ducked = float((g < 0.7).mean() * n / SR)
x = lo + hi * g[:, None]

# 3. the way in: a half-second swell where it used to slam
ONSET = 1.02
x *= ss((t - (ONSET - 0.10)) / 0.60)[:, None]

# the room, used for the lead-in and the ring-out
rng = np.random.default_rng(5)
def room(tau, length):
    L = int(length * SR); tt = np.arange(L) / SR
    h = np.stack([rng.standard_normal(L) * np.exp(-tt / tau) * ss(tt / 0.015) for _ in range(2)], 1)
    h = filt(filt(h, 160, 'high', 2), 6000, 'low', 2); return h / np.sqrt((h ** 2).sum(0, keepdims=True))
ir = room(0.36, 2.6)            # short, for the lead-in
ir_long = room(0.95, 4.5)       # long, for the ring-out

out = np.zeros((N, 2)); out[:n] = x
bed = np.sqrt((x[int(2 * SR):int(6 * SR)] ** 2).mean())

# lead-in: the first second and a half of the sound, backwards through the room
a, b = int(ONSET * SR), int((ONSET + 1.6) * SR)
pre = np.stack([fftconvolve(x[a:b, c][::-1], ir[:, c])[::-1] for c in range(2)], 1)
p1 = int((ONSET + 0.55) * SR); p0 = p1 - len(pre) + (b - a)      # its build-up arrives as the swell does
seg0 = max(0, -p0); pre = pre[seg0:]; p0 = max(0, p0); pre = pre[:int((ONSET + 0.9) * SR) - p0]
tp = (np.arange(len(pre)) + p0) / SR
pre *= (ss((tp - 0.08) / 0.75) * (1 - ss((tp - (ONSET + 0.15)) / 0.7)))[:, None]
pre *= (bed * 10 ** (-6 / 20)) / (np.sqrt((pre[int(-0.9 * SR):int(-0.5 * SR)] ** 2).mean()) + 1e-9)
out[p0:p0 + len(pre)] += pre

# ring-out: the last two seconds in the same room, fading up as the dry sound fades down
a = int(10.4 * SR)
tail = np.stack([fftconvolve(x[a:, c], ir_long[:, c]) for c in range(2)], 1)
tail *= (bed * 10 ** (-4 / 20)) / (np.sqrt((tail[int(2.2 * SR):int(2.8 * SR)] ** 2).mean()) + 1e-9)
tail *= ss((np.arange(len(tail)) / SR - 0.6) / 1.7)[:, None]
m_end = min(N, a + len(tail)); out[a:m_end] += tail[:m_end - a]

# 5. clarity
out = out + 0.19 * filt(out, 6000, 'high', 2)

# one closing fade, even in decibels, silent before the loop restarts; a short guard at the very start
u = np.clip((t_full - 13.0) / (15.36 - 13.0), 0, 1)
out *= (10 ** (-(u ** 1.4) * 24 / 20) * (1 - ss((t_full - 15.24) / 0.12)) * ss(t_full / 0.05))[:, None]
out[int(15.38 * SR):] = 0
sf.write(dst, out, SR, subtype='PCM_24')

mono = out.mean(1); hop = int(0.5 * SR)
print('treble held back for %.2f s in total' % ducked)
hop4 = int(0.25 * SR); print('last 4 s per 0.25 s:', ' '.join('%.0f' % (20 * np.log10(np.sqrt((mono[i:i + hop4] ** 2).mean()) + 1e-9)) for i in range(N - 16 * hop4, N - hop4 + 1, hop4)))
print('rms per 0.5 s:', ' '.join('%.0f' % (20 * np.log10(np.sqrt((mono[i:i + hop] ** 2).mean()) + 1e-9)) for i in range(0, N - hop + 1, hop)))
print('peak %.3f   first 50 ms %.6f   last 150 ms %.6f   L-R correlation %.2f' % (np.abs(out).max(), np.abs(out[:2400]).max(), np.abs(out[-7200:]).max(), np.corrcoef(out[:, 0], out[:, 1])[0, 1]))
