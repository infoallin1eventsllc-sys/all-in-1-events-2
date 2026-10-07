"""Crop the original frames around a tracked corner, anchored on the track. If the track
is right the aluminium rim sits at the same place in every crop; any drift or shiver of
the track shows as the rim moving. Also prints the rim's offset per frame, measured."""
import cv2, numpy as np, json, sys
D, TRK, K, C, F0, F1, OUT = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
tr = json.load(open(TRK)); R = 28; tiles = []; offs = []
for i in range(F0, F1 + 1):
    q = np.array(tr[K][str(i)]['q']); x, y = q[C]
    im = cv2.imread(f'{D}/full/{i:03d}.png')
    M = np.float32([[1, 0, R - x], [0, 1, R - y]])          # sub-pixel shift: corner lands at (R, R)
    c = cv2.warpAffine(im, M, (2 * R, 2 * R), flags=cv2.INTER_CUBIC)
    g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).astype(float)
    # rim position: brightness-weighted centroid of the bright rim pixels in the crop
    w = np.clip(g - 110, 0, None); ys, xs = np.mgrid[0:2 * R, 0:2 * R]
    offs.append((float((w * xs).sum() / max(w.sum(), 1)), float((w * ys).sum() / max(w.sum(), 1))))
    t = cv2.resize(c, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)
    cv2.drawMarker(t, (4 * R, 4 * R), (0, 0, 255), cv2.MARKER_CROSS, 20, 1); cv2.putText(t, str(i), (3, 14), 0, .45, (0, 255, 255), 1)
    tiles.append(t)
rows = [np.hstack(tiles[j:j + 10]) for j in range(0, len(tiles) - len(tiles) % 10, 10)]
cv2.imwrite(OUT, np.vstack(rows))
o = np.array(offs); d = np.linalg.norm(np.diff(o, axis=0), axis=1)
print(K, C, f'frames {F0}-{F1}: rim moves against the track  median {np.median(d):.2f}px  95th {np.percentile(d, 95):.2f}px  max {d.max():.2f}px; total drift {np.linalg.norm(o[-1] - o[0]):.1f}px')
