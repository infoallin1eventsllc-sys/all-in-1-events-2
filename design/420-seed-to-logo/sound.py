import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile
SR = 48000; DUR = 12.5; N = int(SR*DUR)
rng = np.random.default_rng(420)
dry = np.zeros((N, 2)); wet = np.zeros((N, 2))

def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def tt(d): return np.arange(int(d*SR))/SR
def add(sig, at, gain=1.0, pan=0.0, send=0.3):
    i = int(at*SR); sig = sig[:max(0, N-i)]
    if len(sig) == 0: return
    l, r = np.cos((pan+1)*np.pi/4), np.sin((pan+1)*np.pi/4)
    st = np.stack([sig*l, sig*r], 1)*gain*1.41
    dry[i:i+len(sig)] += st; wet[i:i+len(sig)] += st*send
def note(n): return 440*2**((n-69)/12)  # midi
def bell(f, d=2.5, amp=1.0):
    t = tt(d)
    s = sum(a*np.sin(2*np.pi*f*m*t)*np.exp(-t*k) for m, a, k in [(1, 1, 2.2), (2.76, .45, 4.5), (5.4, .25, 8), (8.93, .12, 12)])
    return s*amp*np.minimum(1, t/0.002)
def saw_stack(f, d, bright, env, detune=0.0):
    t = tt(d); s = np.zeros_like(t)
    for n in range(1, int(min(24, 9000/f))+1):
        s += (1/n)*np.exp(-n/bright)*np.sin(2*np.pi*f*(1+detune)*n*t + n*1.3)
    return s*env

# --- ground cracks open (0.6) ---
t = tt(1.4)
rumble = lp(rng.standard_normal(len(t)), 110, 4)*np.sin(np.pi*np.clip(t/1.0, 0, 1))**1.5*6 + np.sin(2*np.pi*41*t)*np.sin(np.pi*np.clip(t/1.0, 0, 1))*0.5
add(rumble, 0.55, 0.55, 0, 0.2)
at = 0.6
for k in range(9):
    b = bp(rng.standard_normal(int(0.012*SR)), 1200, 5200)*np.exp(-tt(0.012)/0.003)
    add(b, at, 0.5*(1-k/12), rng.uniform(-.4, .4), 0.25); at += rng.uniform(0.015, 0.05)
for k in range(22):   # falling soil
    b = bp(rng.standard_normal(int(0.006*SR)), 2000, 6500)*np.exp(-tt(0.006)/0.0015)
    add(b, rng.uniform(0.85, 1.55), rng.uniform(.08, .22), rng.uniform(-.7, .7), 0.2)

# --- seed falls (whoosh), glints, lands ---
t = tt(0.75); w = bp(rng.standard_normal(len(t)), 400, 2600)*(t/0.75)**2.2*np.minimum(1, (0.75-t)/0.006)
add(w, 1.65, 0.28, 0, 0.3)
add(bell(note(93), 2.0), 2.0, 0.11, 0.3, 0.6)          # A6 glint
for at, g in [(2.4, .6), (2.53, .22), (2.6, .08)]:
    t = tt(0.12); f = 170*np.exp(-t*7)+70
    s = np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t/0.035) + bp(rng.standard_normal(len(t)), 1500, 5000)*np.exp(-t/0.004)*0.5
    add(s, at, g, 0, 0.15)

# --- ground closes ---
t = tt(0.65); sh = lp(rng.standard_normal(len(t)), 1100, 2)*np.repeat(rng.uniform(.2, 1, len(t)//480+1), 480)[:len(t)]*np.sin(np.pi*t/0.65)
add(sh*1.6, 2.5, 0.32, 0, 0.2)
t = tt(0.4); add(np.sin(2*np.pi*(55+30*np.exp(-t*12))*t)*np.exp(-t/0.11), 3.1, 0.55, 0, 0.1)

# --- water drops ---
for i, at in enumerate([3.5, 3.75, 3.95, 4.15, 4.35, 4.55]):
    f0 = rng.uniform(850, 1350); t = tt(0.16)
    f = f0*(1 + 1.1*np.clip(t/0.07, 0, 1))
    s = np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t/0.045)*np.minimum(1, t/0.001)
    s += hp(rng.standard_normal(len(t)), 3500)*np.exp(-t/0.006)*0.25
    add(s, at, 0.34, (-1)**i*0.25, 0.45)

# --- seed comes alive (4.7-5.6), shell cracks (4.95) ---
t = tt(1.4); env = np.sin(np.pi*t/1.4)**2
add(sum(np.sin(2*np.pi*note(n)*t)*(1+0.3*np.sin(2*np.pi*5.5*t)) for n in (86, 90, 93))*env*0.08, 4.6, 1, 0, 0.7)
t = tt(0.08); add(bp(rng.standard_normal(len(t)), 700, 3200)*np.exp(-t/0.01) + np.sin(2*np.pi*1150*t)*np.exp(-t/0.03)*0.4, 4.95, 0.35, 0, 0.3)
t = tt(0.25); add(lp(rng.standard_normal(len(t)), 900)*np.exp(-t/0.05)*2, 6.3, 0.25, 0, 0.2)   # breaks the surface

# --- the build: G -> Asus4 -> A, rising into the hit ---
chords = [(5.2, 7.3, [43, 50, 55, 59, 62]), (7.2, 8.3, [45, 52, 57, 62, 64]), (8.2, 9.42, [45, 52, 57, 61, 64])]
for a, b, notes in chords:
    d = b - a; t = tt(d)
    fade = np.minimum(1, np.minimum(t/0.25, (d-t)/0.12))
    glob = ((a + t) - 5.2)/(9.4 - 5.2)                      # 0..1 over the whole build
    amp = 0.05 + 0.5*glob**2.2
    for n in notes:
        for dt, pan in [(-0.004, -0.6), (0.004, 0.6)]:
            s = saw_stack(note(n), d, 3 + 9*glob[0] if False else 3 + 7*float(glob.mean()), fade*amp, dt)
            add(s, a, 0.055, pan, 0.55)
for (n, at) in [(71, 6.5), (74, 6.74), (79, 6.98), (81, 8.1), (85, 8.2), (88, 8.32), (93, 8.44)]:
    add(bell(note(n), 2.2), at, 0.12, rng.uniform(-.5, .5), 0.6)
t = tt(1.0); riser = hp(rng.standard_normal(len(t)), 2500)*(t/1.0)**3
riser += np.sin(2*np.pi*np.cumsum(220*2**(2.5*t))/SR)*(t/1.0)**2*0.35
add(riser*np.minimum(1, (1.0-t)/0.01), 8.4, 0.3, 0, 0.5)

# --- the moment: D major ---
H = 9.4; d = 3.1; t = tt(d)
add(np.sin(2*np.pi*np.cumsum(36.7+40*np.exp(-t*9))/SR)*np.exp(-t/1.1)*np.minimum(1, t/0.004), H, 0.85, 0, 0.05)
add(lp(rng.standard_normal(len(t)), 180, 2)*np.exp(-t/0.25)*3, H, 0.4, 0, 0.2)
env = np.minimum(1, t/0.012)*np.exp(-t/1.6)
for n in [38, 45, 50, 54, 57, 62, 66, 69, 74]:
    for dt, pan in [(-0.005, -0.7), (0.0, 0.0), (0.005, 0.7)]:
        bright = 4 + 14*np.exp(-t/0.5)
        f = note(n); s = np.zeros_like(t)
        for h in range(1, int(min(22, 9000/f))+1):
            s += (1/h)*np.exp(-h/bright)*np.sin(2*np.pi*f*(1+dt)*h*t + h)
        add(s*env, H, 0.032, pan, 0.6)
t2 = tt(3.1); pad = sum(np.sin(2*np.pi*note(n)*t2 + k) for k, n in enumerate([62, 66, 69, 74, 78]))
add(pad*np.minimum(1, t2/0.4)*np.exp(-t2/2.2)*0.06, H, 1, 0, 0.8)
add(hp(rng.standard_normal(len(t)), 3500, 2)*np.exp(-t/1.3)*np.minimum(1, t/0.003), H, 0.16, 0, 0.5)   # crash
for k in range(18):
    at = H + 0.05 + rng.exponential(0.55)
    if at > 12.0: continue
    add(bell(note(int(rng.choice([86, 88, 90, 93, 95, 98, 100]))), 1.8), at, 0.07*np.exp(-(at-H)/1.4), rng.uniform(-.8, .8), 0.7)

# --- mix ---
ir_t = tt(2.8)
ir = np.stack([lp(rng.standard_normal(len(ir_t)), 6000)*np.exp(-ir_t/0.75) for _ in range(2)], 1)
ir /= np.sqrt((ir**2).sum(0))
rev = np.stack([fftconvolve(wet[:, c], ir[:, c])[:N] for c in range(2)], 1)
mix = dry + rev*0.9
mix = hp(mix.T, 25).T
end = np.ones(N); fo = int(0.6*SR); end[-fo:] = np.linspace(1, 0, fo)**2
mix *= end[:, None]
mix = np.tanh(mix/np.abs(mix).max()*1.4)/np.tanh(1.4)*0.89
wavfile.write('sound.wav', SR, (mix*32767).astype(np.int16))
print('peak', np.abs(mix).max())
