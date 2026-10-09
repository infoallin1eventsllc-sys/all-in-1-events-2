"""Video 2 as a hero backdrop: the settled light square (source frames 79-121, after the
clip's last hard cut), graded into the site's navy, played at half speed forward then
back with eased turnarounds, as a seamless loop. In-between frames are blended from
their neighbours by optical flow.     python v2loop.py <v2 dir>"""
import cv2, numpy as np, sys, os
D = sys.argv[1]; S0, S1 = 79, 121; SPEED, RAMP = 0.5, 24
LUT = np.load(f'{D}/grade_lut.npy')
L = S1 - S0; HALF = int(round(L / SPEED + RAMP)); T = 2 * HALF
def dist(u):
    R = RAMP
    if u <= R: return SPEED * (u / 2 - R / (2 * np.pi) * np.sin(np.pi * u / R))
    if u <= HALF - R: return SPEED * (R / 2 + (u - R))
    return L - dist(HALF - u)
fr = {i: cv2.imread(f'{D}/full/{i:03d}.png').astype(np.float32) for i in range(S0, S1 + 1)}
DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM); flows = {}
YY, XX = np.mgrid[0:1080, 0:1920].astype(np.float32)
def at(s):
    a = int(np.floor(s)); t = np.float32(s - a)
    if t < 1e-3 or a >= S1: return fr[min(a, S1)]
    if a not in flows:
        flows[a] = DIS.calc(cv2.cvtColor(fr[a].astype(np.uint8), cv2.COLOR_BGR2GRAY), cv2.cvtColor(fr[a + 1].astype(np.uint8), cv2.COLOR_BGR2GRAY), None)
    f = flows[a]
    ia = cv2.remap(fr[a], XX - t * f[..., 0], YY - t * f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    ib = cv2.remap(fr[a + 1], XX + (1 - t) * f[..., 0], YY + (1 - t) * f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return ia * (1 - t) + ib * t
os.makedirs(f'{D}/out', exist_ok=True)
for n in range(T):
    s = S0 + (dist(n) if n <= HALF else dist(T - n))
    im = np.clip(at(s), 0, 255).astype(np.uint8)
    g = np.stack([LUT[c][im[..., c]] for c in range(3)], -1)
    cv2.imwrite(f'{D}/out/{n:03d}.png', np.clip(g, 0, 255).astype(np.uint8))
print('frames', T, '=', round(T / 24, 2), 's')
