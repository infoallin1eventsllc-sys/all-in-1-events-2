# Erase the AI-drawn logos: fill each box from its four edges (Coons patch),
# so the smooth dark background carries straight through.
import sys
import numpy as np
from PIL import Image, ImageFilter
def fill(a, x0, y0, x1, y1, b=3):
    top = a[y0-b:y0].mean(0)[x0:x1]; bot = a[y1:y1+b].mean(0)[x0:x1]
    lef = a[:, x0-b:x0].mean(1)[y0:y1]; rig = a[:, x1:x1+b].mean(1)[y0:y1]
    h, w = y1-y0, x1-x0
    v = (np.arange(h)+.5)[:, None, None]/h; u = (np.arange(w)+.5)[None, :, None]/w
    vert = (1-v)*top[None] + v*bot[None]
    horz = (1-u)*lef[:, None] + u*rig[:, None]
    corners = ((1-u)*(1-v)*a[y0-1, x0-1] + u*(1-v)*a[y0-1, x1] + (1-u)*v*a[y1, x0-1] + u*v*a[y1, x1])
    patch = vert + horz - corners
    patch += np.random.default_rng(1).normal(0, 0.8, patch.shape)
    a[y0:y1, x0:x1] = np.clip(patch, 0, 255)
jobs = {'22': [(764, 26, 1236, 112), (1316, 362, 1341, 394)], '23': [(40, 30, 150, 132)]}
for n, boxes in jobs.items():
    a = np.asarray(Image.open(f'src{n}.png').convert('RGB')).astype(float)
    for bx in boxes: fill(a, *bx)
    Image.fromarray(a.astype('uint8')).save(f'clean{n}.png')
    Image.fromarray(a.astype('uint8')).crop((0, 0, 2000, 420)).save(f'clean{n}-top.png')
