"""Put the Meridian Interface landing page on the monolith screen of Otis's clip.

Same clip and screen tracking as composite.py, but instead of the mark forming,
the website pops up on the glass when the voice starts ("we put the future in
your hands") and stays there. The hand is gone: the screen is rebuilt from a
clean frame first.

    python composite-page.py <frames_dir> <quads.json> <page> <out_dir>

page  either one PNG (the page sits still) or a directory of numbered PNGs
      (the page moves: frame k of the sequence shows k frames after the pop-up;
      the last one holds). Pages are 640x960, captured by build-page.sh.
"""
import os
import sys

import cv2
import numpy as np

FPS = 24
TW, TH = 640, 960
CLEAN = 36
HOLD = 30
FLASH = 9
POP = 1.9                    # the voice starts here; the page pops up with it

frames_dir, quads_path, page_path, out_dir = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)
import json
quads = {int(k): np.float32(v) for k, v in json.load(open(quads_path))["smooth"].items()}
src = np.float32([[0, 0], [TW, 0], [TW, TH], [0, TH]])
n_clip = len([f for f in os.listdir(frames_dir) if f.endswith(".png")])


def H(i):
    return cv2.getPerspectiveTransform(src, quads[i])


def frame(i):
    return cv2.imread(f"{frames_dir}/{i:04d}.png").astype(np.float32) / 255


def ease(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def seg(t, a, b):
    return float(np.clip((t - a) / (b - a), 0, 1))


def load_page(p):
    im = cv2.imread(p).astype(np.float32) / 255
    if im.shape[:2] != (TH, TW):
        im = cv2.resize(im, (TW, TH), interpolation=cv2.INTER_AREA)
    return im


if os.path.isdir(page_path):
    seq = sorted(f for f in os.listdir(page_path) if f.endswith(".png"))
    pages = [load_page(os.path.join(page_path, f)) for f in seq]
else:
    pages = [load_page(page_path)]


def page_at(k):
    return pages[min(max(k, 0), len(pages) - 1)]


# clean glass from the frame before the hand, exposure-matched per frame
bg_clean = cv2.warpPerspective(frame(CLEAN), np.linalg.inv(H(CLEAN)), (TW, TH), flags=cv2.INTER_CUBIC)
bg_clean = cv2.GaussianBlur(bg_clean, (0, 0), 3)
marg = np.zeros((TH, TW), bool)
marg[int(TH * .72):int(TH * .95), int(TW * .03):int(TW * .07)] = True
marg[int(TH * .72):int(TH * .95), int(TW * .93):int(TW * .97)] = True
ref = bg_clean[marg].mean(0)
inset = np.zeros((TH, TW), np.float32)
ix, iy = int(TW * .018), int(TH * .012)
inset[iy:TH - iy, ix:TW - ix] = 1
inset = cv2.GaussianBlur(inset, (0, 0), 3)
# a faint sheen so the page reads as a lit panel behind glass, not a sticker
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)
sheen = np.exp(-(((xx - TW * 0.3) / (TW * 0.45)) ** 2 + ((yy - TH * 0.12) / (TH * 0.5)) ** 2)) * 0.07
grain_rng = np.random.default_rng(3)


def screen_layer(t, bg, k):
    out = bg.copy()
    a = ease(seg(t, POP, POP + 0.4))
    if a <= 0:
        return out
    page = page_at(k)
    # pop: scale up from 94% around the centre while fading in
    s = 0.94 + 0.06 * a
    M = np.float32([[s, 0, (1 - s) * TW / 2], [0, s, (1 - s) * TH / 2]])
    pg = cv2.warpAffine(page, M, (TW, TH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0.04, 0.06, 0.1))
    pg = pg * 0.97 + sheen[..., None]
    out = out * (1 - a) + pg * a
    # a flash of light as it switches on
    fl = np.sin(np.pi * seg(t, POP, POP + 0.5)) * 0.35
    out += fl * np.float32([1.0, 0.9, 0.75])
    return out


def comp(i, t):
    f = frame(i)
    if i not in quads:
        return f
    h = H(i)
    tex = cv2.warpPerspective(f, np.linalg.inv(h), (TW, TH), flags=cv2.INTER_LINEAR)
    gain = np.clip(tex[marg].mean(0) / np.maximum(ref, 1e-3), 0.6, 1.6)
    bg = bg_clean * gain + grain_rng.normal(0, 0.006, bg_clean.shape).astype(np.float32)
    k = int(round((t - POP) * FPS))
    layer = screen_layer(t, bg, k)
    W, Hh = f.shape[1], f.shape[0]
    lw = cv2.warpPerspective(layer, h, (W, Hh), flags=cv2.INTER_LINEAR)
    mw = cv2.warpPerspective(inset, h, (W, Hh), flags=cv2.INTER_LINEAR)[..., None]
    out = f * (1 - mw) + lw * mw
    # the lit page throws a little light onto the room around the screen
    a = ease(seg(t, POP, POP + 0.6))
    if a > 0:
        glow = cv2.GaussianBlur(lw * mw, (0, 0), 40) * 0.25 * a
        out += glow
    return out


for i in range(1, n_clip + 1):
    out = comp(i, (i - 1) / FPS)
    cv2.imwrite(f"{out_dir}/{i:04d}.png", np.clip(out * 255, 0, 255).astype(np.uint8))

last = n_clip
cx, cy = quads[last].mean(0)
for k in range(1, HOLD + 1):
    t = (last - 1 + k) / FPS
    img = comp(last, t)
    z = 1 + 0.06 * ease(k / HOLD)
    Hh, W = img.shape[:2]
    A = np.float32([[z, 0, (1 - z) * cx], [0, z, (1 - z) * (cy * 0.5 + Hh * 0.25)]])
    img = cv2.warpAffine(img, A, (W, Hh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    fl = seg(k, HOLD - FLASH, HOLD)
    if fl > 0:
        glow = cv2.GaussianBlur(img, (0, 0), 30)
        img = img + glow * fl * 1.5
        img = img * (1 - fl ** 2 * 0.85) + np.float32([1, .97, .92]) * fl ** 2 * 0.85
    cv2.imwrite(f"{out_dir}/{last + k:04d}.png", np.clip(img * 255, 0, 255).astype(np.uint8))
print("frames", last + HOLD, "page frames", len(pages))
