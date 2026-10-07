"""Build each capture's pinned layer (<name>-pin.png, BGRA): the pixels that change
when the pinned elements are hidden, kept only inside those elements' rectangles."""
import cv2, numpy as np, json, glob, os, sys
D = sys.argv[1]
for j in sorted(glob.glob(f'{D}/*-pin.json')):
    name = os.path.basename(j)[:-9]; meta = json.load(open(j)); dpr = meta['dpr']
    w = cv2.imread(f'{D}/{name}-with.png'); wo = cv2.imread(f'{D}/{name}-without.png')
    diff = np.abs(w.astype(int) - wo.astype(int)).max(2)
    box = np.zeros(diff.shape, np.uint8)
    for l, t, r, b in meta['rects']:
        x0, y0, x1, y1 = [int(round(v * dpr)) for v in (l, t, r, b)]
        box[max(y0, 0):max(y1, 0), max(x0, 0):max(x1, 0)] = 1
    m = ((diff > 6).astype(np.uint8) & box)
    # solid bars: fill each rectangle's rows where most of the row changed
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    for k in range(1, n):
        x, y, ww, hh, area = st[k]
        if area > 0.6 * ww * hh: m[y:y + hh, x:x + ww] |= box[y:y + hh, x:x + ww]
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.6)
    out = np.dstack([w, (np.clip(a, 0, 1) * 255).astype(np.uint8)])
    cv2.imwrite(f'{D}/{name}-pin.png', out)
    print(name, 'pinned pixels %.1f%%' % (100 * m.mean()))
