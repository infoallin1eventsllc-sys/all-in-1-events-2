# Extend a generated clip's music under the quiet ending by repeating one beat.
# Wheatpaste Wall: beats every ~1.35 s (hits at 1.922, 3.282, 4.64, 7.36, 8.70 s).
# Cuts sit 30 ms before a hit, in the quiet gap, so the joins do not click.
# Song = clip[0:8.67] + bar[7.33:8.67] x K + clip[8.67:] (keeps the clip's own last hit and fade).
import numpy as np, wave, sys
raw, out, K = sys.argv[1], sys.argv[2], int(sys.argv[3])   # raw: s16le stereo 48 kHz
sr=48000; x=np.frombuffer(open(raw,'rb').read(),dtype=np.int16).astype(np.float32).reshape(-1,2)/32768
S=lambda t:int(round(t*sr)); a,b=S(7.33),S(8.67); F=int(.008*sr)
def join(p,q):
    r=np.linspace(0,1,F)[:,None]
    return np.concatenate([p[:-F], p[-F:]*np.cos(r*np.pi/2)+q[:F]*np.sin(r*np.pi/2), q[F:]])
y=x[:b]
for _ in range(K): y=join(y,x[a:b])
y=join(y,x[b:])
with wave.open(out,'wb') as w: w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((np.clip(y,-1,1)*32767).astype(np.int16).tobytes())
