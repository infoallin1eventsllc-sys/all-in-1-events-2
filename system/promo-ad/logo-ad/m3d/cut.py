"""Cut the 3D M out of Otis's "custom studio" image (source-custom-studio.webp).

The M is silvery, the ground is saturated blue, so saturation seeds a GrabCut.
Only the M is kept: no grid, no light beam, no tagline. Writes an RGBA PNG
trimmed to the M.   python cut.py source.webp out.png
"""
import sys

import cv2
import numpy as np

src, out = sys.argv[1:3]
im = cv2.imread(src)
y0, y1, x0, x1 = 150, 700, 680, 1320          # the M in the 2000x1131 source
c = im[y0:y1, x0:x1].copy()
h = cv2.cvtColor(c, cv2.COLOR_BGR2HSV)
S, V = h[..., 1], h[..., 2]
m190 = ((S < 190) & (V > 60)).astype(np.uint8)
m215 = ((S < 215) & (V > 60)).astype(np.uint8)
gc = np.full(m190.shape, cv2.GC_PR_BGD, np.uint8)
gc[m215 > 0] = cv2.GC_PR_FGD
gc[cv2.erode(m190, np.ones((11, 11), np.uint8)) > 0] = cv2.GC_FGD
gc[S > 232] = cv2.GC_BGD
gc[:40, :] = cv2.GC_BGD                         # the light beam above the bar
bg, fg = np.zeros((1, 65)), np.zeros((1, 65))
cv2.grabCut(c, gc, None, bg, fg, 6, cv2.GC_INIT_WITH_MASK)
m = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
m = ((lab == 1 + np.argmax(st[1:, 4])) * 255).astype(np.uint8)
ff = m.copy()
cv2.floodFill(ff, None, (0, 0), 255)
m = m | cv2.bitwise_not(ff)                     # fill any pinholes
a = cv2.GaussianBlur(m, (0, 0), 0.8)
ys, xs = np.nonzero(a > 8)
rgba = np.dstack([c, a])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
cv2.imwrite(out, rgba)
print(out, rgba.shape)
