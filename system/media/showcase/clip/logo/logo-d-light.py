"""The fourth pane's screen: Otis's own lockup (meridian-lockup.png, the transparent
master of meridian-logo-square.png) on that file's off-white ground. Only the left
15-18% of this pane is ever on camera, and his wordmark is centred under the mark and
wider than it, so the two pieces (cropped from the master, never redrawn) are set
left-aligned: the mark where the old one sat, the wordmark beneath it at the master's
own spacing and scale.

  python logo-d-light.py <meridian-lockup.png> <out logo-d.png>
"""
import cv2, numpy as np, sys
src, out = sys.argv[1:3]
W, H, SC = 1672, 1170, 2                       # the face image (836x585 at 2x), drawn at 2x again
L = cv2.imread(src, cv2.IMREAD_UNCHANGED).astype(np.float32)
mark, words = L[47:380, 272:614], L[443:503, 47:838]   # the two ink bands of the 885x550 master
k = 260 / 333.0 * SC
def sz(im): return cv2.resize(im, (int(round(im.shape[1] * k)), int(round(im.shape[0] * k))), interpolation=cv2.INTER_AREA)
m, wd, gap = sz(mark), sz(words), int(round(63 * k))
canvas = np.tile(np.float32([243, 248, 247]), (H * SC, W * SC, 1))   # the square file's off-white (BGR)
y0 = (H * SC - (m.shape[0] + gap + wd.shape[0])) // 2; x0 = 44 * SC
def put(im, x, y):
    a = im[..., 3:4] / 255; r = canvas[y:y + im.shape[0], x:x + im.shape[1]]
    canvas[y:y + im.shape[0], x:x + im.shape[1]] = r * (1 - a) + im[..., :3] * a
put(m, x0, y0); put(wd, x0, y0 + m.shape[0] + gap)
cv2.imwrite(out, np.clip(cv2.resize(canvas, (W, H), interpolation=cv2.INTER_AREA), 0, 255).astype(np.uint8))
