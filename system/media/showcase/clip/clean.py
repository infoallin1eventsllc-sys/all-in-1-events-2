"""Erase the glowing threads, their pulses and anchor dots from the clip's frames.

Threads are long, thin, near-horizontal lights strung between the panes; dots and
pulses are compact round lights. Rims are thin lights too, but they run along each
pane's outline: the side edges are vertical (left alone by the orientation test), and
the top and bottom edges and rounded corners of every pane are kept out by a band.
The floor grid is fainter than any thread and sits below them; the fourth pane on the
far right is beyond where any thread goes. Each erased pixel is rebuilt from the
pixels directly above and below it: threads run sideways, so this restores the smooth
background, and any vertical rim edge, exactly.

  python clean.py <hf dir> [frames...]      writes clean/NNN.png (and mask/NNN.png)
"""
import cv2, numpy as np, json, sys, os
D = sys.argv[1]; FR = [int(x) for x in sys.argv[2:]] or list(range(1, 194))
TR = json.load(open(f'{D}/track2.json'))
DOTS = json.load(open(f'{D}/dots.json'))   # the anchor dots, tracked by dots.py
os.makedirs(f'{D}/clean', exist_ok=True); os.makedirs(f'{D}/mask', exist_ok=True)
DISK = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))

def thread_mask(im, i):
    V = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)[..., 2].astype(np.float32)
    top = V - cv2.morphologyEx(V, cv2.MORPH_OPEN, DISK(25))           # thin lights over their surroundings
    # orientation of the light at each pixel (structure tensor of the smoothed top-hat)
    t = cv2.GaussianBlur(top, (0, 0), 1.5)
    gx, gy = cv2.Sobel(t, cv2.CV_32F, 1, 0), cv2.Sobel(t, cv2.CV_32F, 0, 1)
    jxx, jyy, jxy = [cv2.GaussianBlur(a, (0, 0), 3) for a in (gx * gx, gy * gy, gx * gy)]
    ang = 0.5 * np.arctan2(2 * jxy, jxx - jyy)                        # gradient direction; a line runs across it
    horizontal_line = np.abs(np.cos(ang)) < np.sin(np.radians(35))     # gradient near vertical = line near horizontal
    lines = (top > 18) & horizontal_line
    # keep only long pieces (threads), not specks
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(lines.astype(np.uint8), DISK(3)))
    keep = np.zeros(n, bool); keep[1:] = np.maximum(st[1:, 2], st[1:, 3]) > 40
    lines = keep[lab] & lines
    # compact round lights: anchor dots and pulses
    topw = V - cv2.morphologyEx(V, cv2.MORPH_OPEN, DISK(41))
    n, lab, st, _ = cv2.connectedComponentsWithStats((topw > 45).astype(np.uint8))
    blobs = np.zeros(V.shape, bool)
    for k in range(1, n):
        x, y, w, h, a = st[k]
        if 4 <= a <= 2500 and max(w, h) <= 2.2 * min(w, h) and a >= 0.4 * w * h: blobs |= lab == k
    # the tracked anchor dots too: where one sits on a pane's side it merges with the rim
    # in the blob test above and would be missed
    tracked = np.zeros(V.shape, np.uint8)
    for k in ('A', 'C'):
        for p in DOTS[k].get(str(min(i, 190)), []):
            if p and p[2] > 150: cv2.circle(tracked, (int(round(p[0])), int(round(p[1]))), 22, 1, -1)
    m = cv2.dilate(lines.astype(np.uint8), DISK(9)) | cv2.dilate(blobs.astype(np.uint8), DISK(31)) | tracked
    # never touch: the big pane's slanted top and bottom rims, the floor, the far right
    guard = np.zeros(V.shape, np.uint8)
    for k, grow in (('A', 1.0), ('B', 1.0), ('C', 1.0)):
        qk = np.array(TR[k][str(min(i, 190))]['q']); c = qk.mean(0)
        w = np.linalg.norm(qk[1] - qk[0]); h = np.linalg.norm(qk[3] - qk[0])
        band = int(np.clip(0.05 * min(w, h) + 8, 9, 22))          # rim thickness scales with the pane
        for a, b in ((qk[0], qk[1]), (qk[3], qk[2])):            # top and bottom edges (slanted in perspective)
            cv2.line(guard, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), 1, band)
        for p in qk:                                             # rounded corners
            cv2.circle(guard, tuple(np.round(p).astype(int)), int(band * 1.6), 1, -1)
    q = np.array(TR['C'][str(min(i, 190))]['q'])
    right = int(np.clip(max(q[1, 0], q[2, 0]) + 6, 0, 1920))
    m[:, right:] = 0
    m[guard > 0] = 0
    horizon = int(min(np.array(TR['B'][str(min(i, 190))]['q'])[:, 1].max(), 1080) + 25)
    m[horizon:] = 0
    return m.astype(bool)

def fill_vertical(im, m):
    """Rebuild masked pixels column by column from the nearest unmasked pixels above and below."""
    out = im.astype(np.float32).copy(); H = im.shape[0]
    cols = np.where(m.any(0))[0]
    for x in cols:
        col = m[:, x]; y = 0
        while y < H:
            if col[y]:
                y0 = y
                while y < H and col[y]: y += 1
                a, b = y0 - 1, y
                if a < 0 and b >= H: continue
                if a < 0: out[y0:y, x] = out[b, x]
                elif b >= H: out[y0:y, x] = out[a, x]
                else:
                    w = (np.arange(y0, y) - a)[:, None] / (b - a)
                    out[y0:y, x] = out[a, x] * (1 - w) + out[b, x] * w
            else: y += 1
    # a touch of smoothing across the filled area only, so columns blend with their neighbours
    sm = cv2.GaussianBlur(out, (0, 0), 1.2)
    mm = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0)[..., None]
    return out * (1 - mm) + sm * mm

def clear_edge_on(im, i):
    """When the tablet pane turns edge-on it is a vertical strip of aluminium, and the dots
    where its threads attached sit on that strip. A tall vertical median over the strip
    removes them and leaves the strip itself as it was."""
    t = TR['A'][str(min(i, 190))]
    if t['v'] > 0.3: return im                                  # facing the camera: its screen covers the dots
    q = np.array(t['q']); x0 = int(max(q[:, 0].min() - 14, 0)); x1 = int(min(q[:, 0].max() + 14, 1920))
    y0 = int(max(q[:, 1].min() + 30, 0)); y1 = int(min(q[:, 1].max() - 30, 1080))
    if x1 - x0 < 4 or y1 - y0 < 60: return im
    reg = im[y0:y1, x0:x1].astype(np.float32); K = 41
    pad = np.pad(reg, ((K // 2, K // 2), (0, 0), (0, 0)), mode='edge')
    win = np.lib.stride_tricks.sliding_window_view(pad, K, axis=0)
    med = np.median(win, axis=-1)
    out = im.copy(); out[y0:y1, x0:x1] = np.clip(med, 0, 255).astype(np.uint8)
    return out

def clear_side_rims(im, i):
    """Where a thread met a pane it also lit a short stub on the aluminium side itself,
    which the thread mask leaves alone (the rim is bright, so the stub does not stand out).
    The side of a pane is uniform along its length: a median along the edge direction,
    over a band on each side edge, removes the stubs and leaves the rim as it was."""
    out = im.astype(np.float32).copy()
    for k in 'ABC':
        t = TR[k][str(min(i, 190))]; q = np.array(t['q'], float)
        w = np.linalg.norm(q[1] - q[0]); h = np.linalg.norm(q[3] - q[0]); band = int(np.clip(0.05 * min(w, h) + 14, 22, 30))
        sides = [(q[0], q[3]), (q[1], q[2])] if k != 'C' else [(q[0], q[3])]
        for a, b in sides:
            d = (b - a) / np.linalg.norm(b - a)                       # along the edge
            mask = np.zeros(im.shape[:2], np.uint8)
            cv2.line(mask, tuple(np.round(a + d * 12).astype(int)), tuple(np.round(b - d * 12).astype(int)), 1, band)
            ys, xs = np.where(mask > 0)
            if len(xs) == 0: continue
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            sub = im[y0:y1, x0:x1].astype(np.float32); H_, W_ = sub.shape[:2]
            yy, xx = np.mgrid[0:H_, 0:W_].astype(np.float32)
            K = 32; stack = []
            for j in range(-K, K + 1, 2):
                stack.append(cv2.remap(sub, xx + np.float32(j * d[0]), yy + np.float32(j * d[1]), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE))
            med = np.median(np.stack(stack), axis=0)
            mm = mask[y0:y1, x0:x1].astype(np.float32); mm = cv2.GaussianBlur(mm, (0, 0), 1.2)[..., None]
            out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - mm) + med * mm
    return np.clip(out, 0, 255).astype(np.uint8)

for i in FR:
    im = cv2.imread(f'{D}/full/{i:03d}.png'); m = thread_mask(im, i)
    cl = np.clip(fill_vertical(im, m), 0, 255).astype(np.uint8)
    cv2.imwrite(f'{D}/clean/{i:03d}.png', clear_side_rims(clear_edge_on(cl, i), i))
    cv2.imwrite(f'{D}/mask/{i:03d}.png', (m * 255).astype(np.uint8))
    print(i, 'erased %.2f%%' % (100 * m.mean()), flush=True)
