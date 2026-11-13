"""The film's ground and its two edge fades, 880x1080.
ground.png: the hero's flat navy (6,13,29 = HERO_GROUND #060d1d in the website's
HeroLaptopFilm.tsx) with a soft blue pool of light that is fully faded before
the frame edges, lightly dithered against banding.
gvL.png / gvS.png: the same ground with an alpha ramp, laid OVER the composite so
the picture fades to the ground itself. L is a thin constant edge; S is the wide
one shown only during the close-ups, where footage fills the frame."""
import numpy as np
from PIL import Image
W, H = 880, 1080
base = np.array([6, 13, 29], np.float32); glow = np.array([34, 82, 160], np.float32)
y, x = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.sqrt(((x - W / 2) / (W * 0.47)) ** 2 + ((y - H * 0.515) / (H * 0.45)) ** 2)
a = np.clip(1 - r, 0, 1); a = a * a * (3 - 2 * a); a = 0.34 * a ** 1.25
img = base[None, None, :] * (1 - a[..., None]) + glow[None, None, :] * a[..., None]
img += np.random.default_rng(7).normal(0, 0.55, img.shape)
g = np.clip(np.round(img), 0, 255).astype(np.uint8)
Image.fromarray(g).save('ground.png')
def ramp(n, a, b):
    v = np.zeros(n, np.float32); i = np.arange(n, dtype=np.float32)
    if a: v = np.maximum(v, np.clip(1 - i / a, 0, 1))
    if b: v = np.maximum(v, np.clip(1 - (n - 1 - i) / b, 0, 1))
    return v * v * (3 - 2 * v)
def fade(l, r, tb, name):
    ax = np.ones(W, np.float32); ax[32:32 + 816] = ramp(816, l, r)   # the film sits at x=32
    al = np.maximum(ax[None, :], ramp(H, tb, tb)[:, None])
    Image.fromarray(np.dstack([g, (al * 255).round().astype(np.uint8)]), 'RGBA').save(name)
fade(250, 230, 220, 'gvS.png'); fade(22, 22, 22, 'gvL.png')
