"""Put the real Meridian mark on the monolith screen of Otis's Higgsfield clip.

The clip's screen showed a glowing hand. This replaces the screen's contents,
frame by frame, with clean dark glass and the mark forming out of light:
particles drift in, an outline traces up the shape, the real artwork fills in
behind it, then it glows. The artwork is meridian-mark.png itself; the light
effects are derived from its alpha, so the mark is never redrawn.

    python composite.py <frames_dir> <quads.json> <mark.png> <out_dir> [flat|3d]

frames_dir  the clip as 0001.png ... (ffmpeg -i clip.mp4 frames/%04d.png)
quads.json  {"smooth": {"35": [[x,y] tl, tr, br, bl], ...}} from track.py
out_dir     receives 0001.png ... plus HOLD extra frames that keep pushing in
            on the last frame and flash to light for the cut to the text scenes
flat|3d     flat (default): meridian-mark.png, lifted a little, cool white light.
            3d: the rendered 3D M from Otis's "custom studio" image
            (m3d/meridian-m-3d.png), already lit, so no lift, and blue light
            to match that image.
"""
import json
import os
import sys

import cv2
import numpy as np

FPS = 24
TW, TH = 640, 960            # screen texture (portrait glass, ~2:3 like the monolith)
CLEAN = 36                   # first frame of shot 2, before the hand appears
HOLD = 30                    # frames added after the clip (1.25 s)
FLASH = 9                    # last frames of the hold flash to light

frames_dir, quads_path, mark_path, out_dir = sys.argv[1:5]
STYLE = sys.argv[5] if len(sys.argv) > 5 else "flat"
os.makedirs(out_dir, exist_ok=True)
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


# --- the mark, placed on the glass --------------------------------------------
mark = cv2.imread(mark_path, cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
mw = int(TW * 0.50)          # half the glass: keeps the M inside the Reels side margins
mh = int(mark.shape[0] * mw / mark.shape[1])
mark = cv2.resize(mark, (mw, mh), interpolation=cv2.INTER_CUBIC)
mx, my = (TW - mw) // 2, int(TH * 0.44 - mh / 2)
M_rgb = np.zeros((TH, TW, 3), np.float32)
M_a = np.zeros((TH, TW), np.float32)
M_rgb[my:my + mh, mx:mx + mw] = mark[..., :3]
M_a[my:my + mh, mx:mx + mw] = mark[..., 3]
if STYLE == "flat":
    # lift the slate ramp a little so it reads as lit glass, not a sticker
    M_rgb = np.clip(M_rgb * 1.18 + 0.04, 0, 1)
edge = cv2.morphologyEx((M_a > 0.5).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
edge = cv2.GaussianBlur(edge, (0, 0), 0.8)
ys_m, xs_m = np.nonzero(M_a > 0.6)
m_top, m_bot = ys_m.min(), ys_m.max()

LIGHT = np.float32([1.0, 0.93, 0.80]) if STYLE == "flat" else np.float32([1.0, 0.80, 0.45])  # BGR
rng = np.random.default_rng(11)
NP = 1400
pick = rng.integers(0, len(xs_m), NP)
P_end = np.stack([xs_m[pick], ys_m[pick]], 1).astype(np.float32)
ang = rng.uniform(0, 2 * np.pi, NP)
rad = rng.uniform(0.35, 0.75, NP) * TW
P_start = np.stack([TW / 2 + np.cos(ang) * rad, TH * 0.44 + np.sin(ang) * rad * 1.2], 1).astype(np.float32)
P_t0 = rng.uniform(1.55, 2.45, NP)
P_dur = rng.uniform(0.75, 1.05, NP)
P_swirl = rng.uniform(0.5, 1.0, NP) * np.where(rng.random(NP) < 0.5, -1, 1)


def particles(t):
    """Additive light from particles converging onto the mark."""
    p = np.clip((t - P_t0) / P_dur, 0, 1)
    live = (t >= P_t0)
    e = p * p * (3 - 2 * p)
    # curved path: rotate the start offset around the end point as it closes in
    d = P_start - P_end
    th = (1 - e) * P_swirl * 1.6
    c, s = np.cos(th), np.sin(th)
    rot = np.stack([d[:, 0] * c - d[:, 1] * s, d[:, 0] * s + d[:, 1] * c], 1)
    pos = P_end + rot * (1 - e)[:, None]
    b = np.where(live, np.minimum(1, (t - P_t0) / 0.25), 0) * np.where(p >= 1, np.clip(1 - (t - P_t0 - P_dur) / 0.5, 0, 1), 1)
    img = np.zeros((TH, TW), np.float32)
    xi, yi = np.round(pos[:, 0]).astype(int), np.round(pos[:, 1]).astype(int)
    ok = (b > 0) & (xi >= 0) & (xi < TW) & (yi >= 0) & (yi < TH)
    np.add.at(img, (yi[ok], xi[ok]), b[ok])
    core = cv2.GaussianBlur(img, (0, 0), 1.1) * 9
    halo = cv2.GaussianBlur(img, (0, 0), 7) * 25
    return core + halo


def screen_layer(t, bg):
    """Glass + light + mark in texture space; returns BGR float."""
    out = bg.copy()
    # formation: outline sweeps up the shape, fill follows a beat behind
    so = seg(t, 2.35, 3.25)
    sf = seg(t, 2.6, 3.45)
    yy = np.arange(TH, dtype=np.float32)[:, None]
    line_o = m_bot - (m_bot - m_top + 40) * so      # leading edge, moving up
    line_f = m_bot - (m_bot - m_top + 40) * sf
    rev_o = np.clip((yy - line_o) / 18, 0, 1) * (so > 0)
    rev_f = np.clip((yy - line_f) / 30, 0, 1) * (sf > 0)
    band = np.exp(-((yy - line_f) / 14) ** 2) * (0 < sf < 1)

    formed = seg(t, 3.3, 3.7)
    breathe = 0.5 + 0.5 * np.sin((t - 3.7) * 2.4) if t > 3.7 else 0.0
    # ambient light the mark throws on the glass
    amb = 0.10 * ease(seg(t, 1.8, 3.4)) + 0.03 * breathe
    out += amb_map[..., None] * amb * LIGHT

    fill = M_a * rev_f
    out = out * (1 - fill[..., None]) + M_rgb * fill[..., None]
    # the scanline overexposes the fill as it passes
    out += (M_a * band)[..., None] * 0.9 * LIGHT
    # outline: bright as it is drawn, settling to a thin rim light
    o_int = 1.2 * (1 - 0.8 * formed) + 0.08 * breathe
    out += (edge * rev_o * o_int)[..., None] * LIGHT
    out += particles(t)[..., None] * 0.55 * LIGHT
    # bloom from the mark itself
    lum = (M_a * rev_f) * (0.3 + 0.2 * formed + 0.1 * breathe) + edge * rev_o * 0.4
    bloom = cv2.GaussianBlur(lum, (0, 0), 16) * 1.6 + cv2.GaussianBlur(lum, (0, 0), 5) * 0.5
    # halo around the mark, kept off its face so the real slate ramp still shows
    out += (bloom * (1 - 0.9 * fill))[..., None] * LIGHT * 0.5
    # one glint across the finished mark
    g = seg(t, 4.15, 4.85)
    if 0 < g < 1:
        xx = np.arange(TW, dtype=np.float32)[None, :]
        pos = -200 + g * (TW + 400)
        glint = np.exp(-(((xx + (yy - TH * 0.44) * 0.5) - pos) / 26) ** 2)
        out += (glint * M_a)[..., None] * 0.55 * LIGHT
    return out


yy0, xx0 = np.mgrid[0:TH, 0:TW].astype(np.float32)
amb_map = np.exp(-(((xx0 - TW / 2) / (TW * 0.42)) ** 2 + ((yy0 - TH * 0.44) / (TH * 0.34)) ** 2))

# clean glass, lifted from the frame before the hand appears
bg_clean = cv2.warpPerspective(frame(CLEAN), np.linalg.inv(H(CLEAN)), (TW, TH), flags=cv2.INTER_CUBIC)
bg_clean = cv2.GaussianBlur(bg_clean, (0, 0), 3)
# sample the margins (where the hand never reaches) to match each frame's exposure
marg = np.zeros((TH, TW), bool)
marg[int(TH * .72):int(TH * .95), int(TW * .03):int(TW * .07)] = True
marg[int(TH * .72):int(TH * .95), int(TW * .93):int(TW * .97)] = True
ref = bg_clean[marg].mean(0)

# composite mask: inset from the bezel so the screen's own edges stay
inset = np.zeros((TH, TW), np.float32)
ix, iy = int(TW * .018), int(TH * .012)
inset[iy:TH - iy, ix:TW - ix] = 1
inset = cv2.GaussianBlur(inset, (0, 0), 3)

grain_rng = np.random.default_rng(3)


def comp(i, t):
    f = frame(i)
    if i not in quads:
        return f
    h = H(i)
    tex = cv2.warpPerspective(f, np.linalg.inv(h), (TW, TH), flags=cv2.INTER_LINEAR)
    gain = np.clip(tex[marg].mean(0) / np.maximum(ref, 1e-3), 0.6, 1.6)
    bg = bg_clean * gain
    bg = bg + grain_rng.normal(0, 0.006, bg.shape).astype(np.float32)
    layer = screen_layer(t, bg)
    W, Hh = f.shape[1], f.shape[0]
    lw = cv2.warpPerspective(layer, h, (W, Hh), flags=cv2.INTER_LINEAR)
    mw_ = cv2.warpPerspective(inset, h, (W, Hh), flags=cv2.INTER_LINEAR)[..., None]
    return f * (1 - mw_) + lw * mw_


for i in range(1, n_clip + 1):
    out = comp(i, (i - 1) / FPS)
    cv2.imwrite(f"{out_dir}/{i:04d}.png", np.clip(out * 255, 0, 255).astype(np.uint8))

# hold: keep pushing in on the last frame while the mark breathes, then flash
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
print("frames", last + HOLD)
