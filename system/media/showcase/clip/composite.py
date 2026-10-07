"""Put the real screens inside the Higgsfield clip's glass panes. Nothing else changes:
every pixel outside the three glass faces is the original frame, and the threads, dots
and sheen that cross the faces are laid back over the screens.

  python composite.py <hf dir> <shots dir> <out dir> [output frame numbers to preview...]
Output runs the clip forward then back (ping-pong) so it loops without a jump."""
import cv2, numpy as np, json, sys, os
D, SHOTS, OUT = sys.argv[1:4]
ONLY = {int(x) for x in sys.argv[4:]}
N = 193
TR = json.load(open(f'{D}/track2.json'))
F = json.load(open(f'{D}/faces.json'))
ORDER = ['drone', 'carepulse', 'frameshop', 'bigboy', 'fogcity', 'finsight', 'crm', 'planner', 'analytics', 'modernstreet']

def cover(img, w, h):
    """Fill w x h with the top of the screenshot, no stretching."""
    ih, iw = img.shape[:2]; s = max(w / iw, h / ih)
    r = cv2.resize(img, (int(np.ceil(iw * s)), int(np.ceil(ih * s))), interpolation=cv2.INTER_AREA)
    x = (r.shape[1] - w) // 2
    return r[:h, x:x + w]
def rounded(w, h, rad, grow=0.0):
    """Rounded-rectangle mask, optionally grown outward (for a pane's whole silhouette)."""
    g = int(round(grow * w)); W, H = w + 2 * g, h + 2 * g; r = int(rad + g)
    m = np.zeros((H, W), np.uint8)
    cv2.rectangle(m, (r, 0), (W - 1 - r, H - 1), 255, -1); cv2.rectangle(m, (0, r), (W - 1, H - 1 - r), 255, -1)
    for cx, cy in [(r, r), (W - 1 - r, r), (W - 1 - r, H - 1 - r), (r, H - 1 - r)]: cv2.circle(m, (cx, cy), r, 255, -1, cv2.LINE_AA)
    return m, g

SZ = {k: (F[k]['w'], F[k]['h']) for k in 'ABC'}
tabs = {n: cover(cv2.imread(f'{SHOTS}/tablet-{n}.png'), *SZ['A']) for n in ORDER}
phones = {n: cover(cv2.imread(f'{SHOTS}/phone-{n}.png'), *SZ['B']) for n in ORDER}
site = cover(cv2.imread(f'{SHOTS}/site.png'), *SZ['C'])
FACE = {k: rounded(*SZ[k], F[k]['r'] * SZ[k][0])[0] for k in 'ABC'}
# keep the screen a hair inside the rim, so the aluminium edge is never painted over
FACE = {k: cv2.erode(m, np.ones((2 * int(F['_inset'] * SZ[k][0]) + 1,) * 2, np.uint8)) for k, m in FACE.items()}
SIL = {k: rounded(*SZ[k], F[k]['r'] * SZ[k][0], F['_rim']) for k in 'ABC'}

# What the clip printed on each pane's glass (car, app icons), seen face-on, as fine
# detail only. It is subtracted before the threads are laid back on, so the car's edges
# do not ghost over the website. The threads themselves are far brighter and are kept.
PRINTED = {}
for k in 'ABC':
    st = cv2.imread(f'{D}/still-{k}.png').astype(np.float32)
    d = np.clip(st - cv2.GaussianBlur(st, (0, 0), 6), 0, None)
    bright = cv2.dilate((d.max(2) > 70).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0   # threads, dots
    d[bright] = 0
    PRINTED[k] = d

seq = list(range(1, N + 1)) + list(range(N - 1, 1, -1))   # 384 frames
T = len(seq); SLOT = T / 20; CUT = 5                        # 0.8 s a product, 5-frame cut
def screen(pics, n, offset):
    s = n / SLOT; i = int(s); f = n - i * SLOT
    cur = pics[ORDER[(i + offset) % 10]]
    if f < SLOT - CUT: return cur
    nxt = pics[ORDER[(i + 1 + offset) % 10]]; m = (f - (SLOT - CUT)) / CUT; m = m * m * (3 - 2 * m)
    h, w = nxt.shape[:2]; z = 1.04 - 0.04 * m   # the next one pushes in as it fades up
    nz = cv2.warpAffine(nxt, cv2.getRotationMatrix2D((w / 2, h / 2), 0, z), (w, h), borderMode=cv2.BORDER_REPLICATE)
    return cv2.addWeighted(cur, 1 - m, nz, m, 0)

os.makedirs(OUT, exist_ok=True)
for n, i in enumerate(seq):
    if ONLY and n not in ONLY: continue
    orig = cv2.imread(f'{D}/full/{i:03d}.png').astype(np.float32)
    Hh, Ww = orig.shape[:2]
    pics = {'A': screen(tabs, n, 0), 'B': screen(phones, n, 5), 'C': site}
    face, sil = {}, {}
    for k in 'ABC':
        t = TR[k][str(i)]; w, h = SZ[k]
        H = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(t['q']))
        face[k] = (cv2.warpPerspective(pics[k], H, (Ww, Hh)).astype(np.float32),
                   cv2.warpPerspective(FACE[k], H, (Ww, Hh)).astype(np.float32) / 255 * t['v'],
                   cv2.warpPerspective(PRINTED[k], H, (Ww, Hh)).astype(np.float32))
        m, g = SIL[k]; Hs = H @ np.array([[1, 0, -g], [0, 1, -g], [0, 0, 1]], np.float64)
        sil[k] = cv2.warpPerspective(m, Hs, (Ww, Hh)).astype(np.float32) / 255
    # a nearer pane always stays in front of a farther pane's screen: its face, plus the
    # pixels of its aluminium rim actually lit in this frame (not a guessed border)
    hsv = cv2.cvtColor(orig.astype(np.uint8), cv2.COLOR_BGR2HSV)
    rim = cv2.dilate(((hsv[..., 2] > 110) & (hsv[..., 1] < 90)).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    for k in 'AB':
        sil[k] = np.maximum(face[k][1] > 0.01, sil[k] * rim).astype(np.float32)
        sil[k] = cv2.GaussianBlur(sil[k], (0, 0), 0.8)
    face['C'] = (face['C'][0], face['C'][1] * (1 - sil['B']) * (1 - sil['A']), face['C'][2])
    face['B'] = (face['B'][0], face['B'][1] * (1 - sil['A']), face['B'][2])
    out = orig.copy(); cov = np.zeros((Hh, Ww), np.float32); printed = np.zeros_like(orig)
    for k in 'CBA':
        img, m, pr = face[k]; m3 = m[..., None]
        out = out * (1 - m3) + img * m3; cov = np.maximum(cov, m); printed = printed * (1 - m3) + pr * m3
    c3 = cov[..., None]
    # the original glass shows through a little, and everything bright that crosses it
    # (threads, their dots, the sheen) is laid back on top
    hl = np.clip(orig - cv2.GaussianBlur(orig, (0, 0), 6) - 2.2 * printed, 0, None)
    out = out * (1 - c3 * F['_glass']) + orig * c3 * F['_glass'] + hl * c3 * F['_lines']
    cv2.imwrite(f'{OUT}/{n:03d}.png', np.clip(out, 0, 255).astype(np.uint8))
