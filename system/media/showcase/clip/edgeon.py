"""Pane A late in the move, when it turns almost edge-on and the image tracker loses it.
Seen edge-on it is two stripes: the glass face, a mid-grey strip, and to its right the
bright aluminium side. Read both off the column profile, and keep the tilt of the face's
top and bottom edges from the last well-tracked frame. Rewrites pane A in track2.json."""
import cv2, numpy as np, json, sys
D = sys.argv[1]; FIRST, LAST, N = 126, 193, 193
tr = json.load(open(f'{D}/track2.json'))
REF = FIRST - 1
def frame(i): return cv2.imread(f'{D}/full/{i:03d}.png')
def profile(im, q):
    """Return (face x0, rim x0, rim x1, blob top, blob bottom) around the predicted quad."""
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); V = hsv[..., 2].astype(int); S = hsv[..., 1]
    cx = int(q[:, 0].mean()); y0, y1 = int(q[:, 1].min()), int(q[:, 1].max())
    x0, x1 = max(cx - 90, 0), min(cx + 90, 1920)
    bright = ((V > 118) & (S < 90)).astype(np.uint8)
    win = bright[max(y0 - 50, 0):y1 + 50, x0:x1]
    n, lab, st, _ = cv2.connectedComponentsWithStats(win)
    k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); bx, by, bw, bh = st[k, :4]
    top, bot = by + max(y0 - 50, 0), by + bh + max(y0 - 50, 0)
    # column profile over the middle 60% of the blob's height
    ya, yb = int(top + 0.2 * (bot - top)), int(top + 0.8 * (bot - top))
    col = np.median(V[ya:yb, x0:x1], axis=0); sat = np.median(S[ya:yb, x0:x1], axis=0)
    # the aluminium side is the rightmost run of at least 6 bright, unsaturated columns;
    # the face is the darker strip just left of it, ending at the thin bright left edge
    peak = col.max(); ok = (col > 0.6 * peak) & (sat < 90)
    runs = []; j = 0
    while j < len(ok):
        if ok[j]:
            k = j
            while k < len(ok) and ok[k]: k += 1
            if k - j >= 6: runs.append((j, k))
            j = k
        else: j += 1
    r0, r1 = runs[-1]
    # the run can include the face when it is bright: the aluminium is the tail of the
    # run that stays within 10% of the run's brightest column
    top_lvl = col[r0:r1].max(); j = r1 - 1
    while j > r0 and col[j - 1] > 0.9 * top_lvl: j -= 1
    r0 = j; lvl = np.median(col[r0:r1])
    rx0, rx1 = r0 + x0, r1 + x0
    fx = r0 - 1
    while fx >= 0 and 0.45 * lvl < col[fx] < 0.92 * lvl: fx -= 1
    return fx + 1 + x0, rx0, rx1, top, bot
qref = np.array(tr['A'][str(REF)]['q'], float)
fx_r, rx0_r, rx1_r, top_r, bot_r = profile(frame(REF), qref)
# how the face corners sit relative to the measured blob at the reference frame
H_r = bot_r - top_r
rel = [((c[1] - top_r) / H_r) for c in qref]           # vertical position of each corner, as a share of blob height
# the tracked face sits a little inside the measured strip; keep the same share of the width
W_r = rx0_r - fx_r
ina, inb = (qref[0, 0] - fx_r) / W_r, (rx0_r - qref[1, 0]) / W_r
print('ref', REF, 'face', fx_r, 'rim', rx0_r, rx1_r, 'blob', top_r, bot_r, 'quad', qref.round(1).tolist())
out = {}
for i in range(FIRST, LAST + 1):
    q0 = np.array(tr['A'][str(i)]['q'], float)
    fx, rx0, rx1, top, bot = profile(frame(i), q0)
    H = bot - top
    w = rx0 - fx; L, R = fx + ina * w, rx0 - inb * w
    q = np.array([[L, top + rel[0] * H], [R, top + rel[1] * H], [R, top + rel[2] * H], [L, top + rel[3] * H]], float)
    out[i] = q; print(i, 'face', fx, 'rim', rx0, rx1, 'width', rx0 - fx, 'blob', top, bot)
# smooth the x positions a little (3-frame median) and write back
xs = np.array([[out[i][0, 0], out[i][1, 0]] for i in range(FIRST, LAST + 1)])
for c in range(2):
    v = xs[:, c].copy()
    for j in range(1, len(v) - 1): xs[j, c] = np.median(v[j - 1:j + 2])
for j, i in enumerate(range(FIRST, LAST + 1)):
    q = out[i]; q[[0, 3], 0] = xs[j, 0]; q[[1, 2], 0] = xs[j, 1]
    w = q[1, 0] - q[0, 0]
    tr['A'][str(i)] = {'q': q.tolist(), 'v': float(np.clip((w - 1.5) / 3, 0, 1))}
json.dump(tr, open(f'{D}/track2.json', 'w')); print('saved')
