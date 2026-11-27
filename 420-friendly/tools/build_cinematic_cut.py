#!/usr/bin/env python3
"""
Archive V.24 — cinematic cut.

Second pass at the launch video. The first (build_launch_preview.py) put the
same slow push-in on every shot, which is the move the Raylight craft guide
calls out by name: a camera that wobbles instead of deciding. Everything here
follows from fixing that.

What makes this one read as film rather than a slideshow:

  · Every shot gets a DIFFERENT, committed camera move — a pull-back reveal, a
    lateral track, a held frame with only the layers moving, an ambient drift,
    and one hard punch-in on the climax. No shot repeats its neighbour's move.
  · Real easing. ease-out-expo for arrivals, ease-in-expo for the punch, and
    linear ONLY for the long ambient drift, which is the one place it belongs.
  · Parallax. Ground and subject are separate layers moving at different rates,
    so a push has depth instead of being a flat zoom.
  · Rack focus. The crimson shot resolves from a soft ground to a sharp subject.
  · Motion blur on the fast moves, by averaging sub-frames across each frame's
    own slice of time.
  · Gate weave — a sub-pixel drift, low-pass filtered, so the frame breathes
    the way a film gate does.
  · One grade spine (teal shadows, warm highlights, mild S-curve) with per-shot
    intensity, rather than eight unrelated looks.
  · 2.39:1 letterbox inside a 16:9 container, so it plays anywhere.

Run from this directory:  python3 build_cinematic_cut.py
"""

from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np
from scipy import ndimage
import imageio_ffmpeg, subprocess, os, math, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
PICKS = os.path.join(ASSETS, "products", "picks")

FW, FH, FPS = 1280, 720, 24
OW, OH = 2048, 1152                      # oversize plate every move crops from
BAR = int(FH * (1 - (1 / 2.39) / (FH / FW)) / 2)   # 2.39:1 letterbox
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
GREY, GREEN = (205, 205, 205), (0, 230, 57)
OUT = os.path.join(ASSETS, "video", "420-cinematic-cut.mp4")

P = lambda n: Image.open(os.path.join(PICKS, f"{n}.png")).convert("RGB")

# The plate is oversize only to give the camera somewhere to move. At zoom 1.0
# the visible window is the centre FW×FH of it, and the letterbox takes another
# BAR off the top and bottom — so the real safe area is FW × (FH-2*BAR).
VX0, VY0 = (OW - FW) // 2, (OH - FH) // 2
BAND_TOP, BAND_MID = BAR, FH // 2
def at(fx, fy):
    """Frame coordinates -> plate coordinates."""
    return (VX0 + int(fx), VY0 + int(fy))

# ─────────────────────────────── easing ────────────────────────────────
def linear(t): return t
def ease_out_expo(t): return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)
def ease_in_expo(t): return 0.0 if t <= 0 else 2 ** (10 * (t - 1))
def ease_in_out(t): return 3 * t * t - 2 * t * t * t
def lerp(a, b, t): return a + (b - a) * t

# ───────────────────────────── layer building ──────────────────────────
def keyed_emblem():
    src = Image.open(os.path.join(ASSETS, "brand", "brand-3d-white.webp")).convert("RGB")
    a = np.asarray(src).astype(np.float32)
    lab, _ = ndimage.label(a.mean(axis=2) > 150)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1]); edge.discard(0)
    fg = ndimage.binary_erosion(~np.isin(lab, sorted(edge)), iterations=3)
    m = Image.fromarray(fg.astype(np.uint8) * 255, "L").filter(ImageFilter.GaussianBlur(0.8))
    e = src.copy(); e.putalpha(m)
    return e.crop(m.point(lambda v: 255 if v > 60 else 0).getbbox())

def ground_from(src, blur=54, dark=0.90):
    """Backdrop derived from the shot's own background, so a feathered paste
    of the same shot on top of it has no visible seam."""
    sw, sh = src.size
    k = max(OW / sw, OH / sh) * 1.25
    g = src.resize((int(sw * k), int(sh * k)), Image.LANCZOS)
    gx, gy = g.size
    g = g.crop(((gx - OW) // 2, (gy - OH) // 2, (gx - OW) // 2 + OW, (gy - OH) // 2 + OH))
    g = g.filter(ImageFilter.GaussianBlur(blur))
    return Image.fromarray((np.asarray(g).astype(np.float32) * dark).clip(0, 255).astype(np.uint8))

def subject_layer(items):
    """items: (name, size, (x, y)) on a transparent OW×OH plate."""
    lay = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    for name, size, pos in items:
        s = P(name).resize(size, Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.5, 100, 3))
        f = max(28, int(min(size) * 0.13))
        m = Image.new("L", size, 0)
        ImageDraw.Draw(m).rectangle((f, f, size[0] - f, size[1] - f), fill=255)
        s.putalpha(m.filter(ImageFilter.GaussianBlur(f * 0.55)))
        lay.alpha_composite(s, pos)
    return lay

def emblem_layer(EM, width, cy=None):
    lay = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    h = int(EM.height * width / EM.width)
    e = EM.resize((width, h), Image.LANCZOS)
    x, y = (OW - width) // 2, (cy if cy is not None else (OH - h) // 2)
    glow = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    sil = Image.new("RGBA", (width, h), GREEN + (0,))
    sil.putalpha(e.split()[3].point(lambda v: int(v * 0.55)))
    glow.alpha_composite(sil, (x, y))
    lay = Image.alpha_composite(lay, glow.filter(ImageFilter.GaussianBlur(34)))
    lay.alpha_composite(e, (x, y))
    return lay

# ──────────────────────────────── grade ────────────────────────────────
def grade(img, warm=1.0, teal=1.0, sat=1.08, lift=1.0, bloom=0.0):
    a = np.asarray(img).astype(np.float32) * lift
    lum = np.clip(a.mean(axis=2) / 255.0, 0, 1)
    hi, sh = lum ** 1.7, (1.0 - lum) ** 2.6
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    r = r + 26 * warm * hi;  g = g + 10 * warm * hi;  b = b - 19 * warm * hi
    g = g + 7 * teal * sh;   b = b + 19 * teal * sh
    a = np.clip(np.stack([r, g, b], 2), 0, 255)
    a = 255.0 * np.clip(0.5 - 0.5 * np.cos(np.pi * np.clip(a / 255.0, 0, 1)), 0, 1) ** 0.94   # gentle S-curve
    m = a.mean(axis=2, keepdims=True)
    a = np.clip(m + (a - m) * sat, 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    if bloom > 0.01:                       # highlight swell for the climax
        hl = Image.fromarray(np.clip((a - 168) * 3.2, 0, 255).astype(np.uint8))
        hl = hl.filter(ImageFilter.GaussianBlur(26))
        out = Image.fromarray(np.clip(a + np.asarray(hl).astype(np.float32) * bloom, 0, 255).astype(np.uint8))
    return out

def finish(img, seed, weave=(0.0, 0.0)):
    a = np.asarray(img).astype(np.float32)
    if abs(weave[0]) > 0.01 or abs(weave[1]) > 0.01:
        a = ndimage.shift(a, (weave[1], weave[0], 0), order=1, mode="nearest")
    yy, xx = np.mgrid[0:FH, 0:FW]
    r = np.sqrt(((xx - FW / 2) / (FW / 2)) ** 2 + ((yy - FH / 2) / (FH / 2)) ** 2)
    a *= np.clip(1.04 - 0.54 * r, 0.14, 1.04)[..., None]
    a += np.random.default_rng(seed).normal(0, 2.9, (FH, FW, 1))
    a[:BAR] = 0; a[FH - BAR:] = 0                       # letterbox
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

# ──────────────────────────── camera sampling ──────────────────────────
def sample(shot, t):
    """Crop ground and subject at their own zoom/offset, composite, grade."""
    cam = shot["move"](t)
    zs, zg = cam["z"], cam["z"] * cam.get("par", 0.965)   # ground trails -> depth
    dx, dy = cam.get("dx", 0.0), cam.get("dy", 0.0)

    def crop(layer, z, ox, oy):
        cw, ch = min(OW, int(FW / z)), min(OH, int(FH / z))
        cx = int((OW - cw) / 2 + ox * (OW - cw) / 2)
        cy = int((OH - ch) / 2 + oy * (OH - ch) / 2)
        cx = max(0, min(OW - cw, cx)); cy = max(0, min(OH - ch, cy))
        return layer.crop((cx, cy, cx + cw, cy + ch)).resize((FW, FH), Image.BILINEAR)

    focus = cam.get("focus", 1.0)
    g = crop(shot["ground_s"] if focus > 0.97 else shot["ground_b"], zg, dx * 0.45, dy * 0.45)
    frame = g.convert("RGBA")
    if shot.get("subject") is not None:
        s_layer = shot["subject"] if focus > 0.5 else shot["subject_b"]
        s = crop(s_layer, zs, dx, dy)
        if 0.5 < focus < 0.97:
            s = Image.blend(crop(shot["subject_b"], zs, dx, dy), s, (focus - 0.5) / 0.47)
        frame = Image.alpha_composite(frame, s)
    return grade(frame.convert("RGB"), **shot["grade"], bloom=cam.get("bloom", 0.0))

def render_shot(shot, n, mblur=False):
    out = []
    for k in range(n):
        t = k / max(n - 1, 1)
        if mblur:
            dt = 0.5 / max(n - 1, 1)
            samples = [np.asarray(sample(shot, max(0.0, min(1.0, t + o))), dtype=np.float32)
                       for o in (-dt, 0.0, dt)]
            img = Image.fromarray((sum(samples) / 3).astype(np.uint8))
        else:
            img = sample(shot, t)
        out.append(img)
    return out

# ──────────────────────────────── captions ─────────────────────────────
def caption_frame(text, alpha, size=22, track=7, y=None, color=GREY):
    lay = Image.new("RGB", (FW, FH), (0, 0, 0))
    d = ImageDraw.Draw(lay); f = ImageFont.truetype(FONT, size)
    w = sum(d.textlength(c, font=f) for c in text) + track * (len(text) - 1)
    x = (FW - w) / 2; yy = y if y is not None else FH - BAR - 46
    for c in text:
        d.text((x, yy), c, font=f, fill=color); x += d.textlength(c, font=f) + track
    return np.asarray(lay).astype(np.float32) * alpha

def cap_alpha(k, n, xf):
    a, b = 10, 24
    hb = n - xf; ha = hb - 12
    if k < a: return 0.0
    if k < b: return (k - a) / (b - a)
    if k < ha: return 1.0
    if k < hb: return max(0.0, 1 - (k - ha) / (hb - ha))
    return 0.0

# ═══════════════════════════════ the cut ═══════════════════════════════
def build():
    EM = keyed_emblem()
    shots = []

    # 1 · COLD OPEN — pull-back reveal off the emblem. Starts tight, decides, lands.
    g = ground_from(P("H11"), blur=76, dark=0.62)
    shots.append(dict(
        name="cold-open", dur=3.4, caption=None, mblur=True,
        ground_s=g, ground_b=g.filter(ImageFilter.GaussianBlur(9)),
        subject=emblem_layer(EM, 370), subject_b=None,
        grade=dict(warm=0.4, teal=1.0, sat=1.05, lift=1.0),
        move=lambda t: dict(z=lerp(1.85, 1.0, ease_out_expo(min(t / 0.34, 1))), par=0.90),
    ))

    # 2 · HAZE SNAPBACK — the one place linear belongs: a long ambient drift.
    hz = Image.open(os.path.join(ASSETS, "products", "haze-snapback.webp")).convert("RGB")
    gh = ground_from(hz, blur=50, dark=0.90)
    hero = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    hs = int(OH * 0.98)
    him = hz.resize((hs, hs), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.5, 100, 3))
    hm = Image.new("L", (hs, hs), 0)
    ImageDraw.Draw(hm).rectangle((44, 44, hs - 44, hs - 44), fill=255)
    him.putalpha(hm.filter(ImageFilter.GaussianBlur(26)))
    hero.alpha_composite(him, ((OW - hs) // 2, (OH - hs) // 2))
    shots.append(dict(
        name="haze", dur=4.2, caption="ARCHIVE  V.24", mblur=False,
        ground_s=gh, ground_b=gh.filter(ImageFilter.GaussianBlur(9)),
        subject=hero, subject_b=hero.filter(ImageFilter.GaussianBlur(7)),
        grade=dict(warm=0.9, teal=0.8, sat=1.10, lift=1.02),
        move=lambda t: dict(z=lerp(1.04, 1.10, linear(t)), dx=lerp(-0.10, 0.10, linear(t)), par=0.95),
    ))

    # 3 · GREY SET — lateral track at constant zoom. A different job from a push.
    HERO, MATE = 470, 400          # both fit inside the 2.39 band with margin
    def pair(a, b, ga):
        return dict(
            ground_s=ground_from(P(ga), blur=54, dark=0.90),
            subject=subject_layer([
                (a, (HERO, HERO), at(90, BAND_MID - HERO // 2)),
                (b, (MATE, MATE), at(660, BAND_MID - MATE // 2)),
            ]))
    gs = pair("H10", "P10", "H10")
    shots.append(dict(
        name="grey", dur=3.4, caption="HEATHER  GREY  SET", mblur=True,
        ground_s=gs["ground_s"], ground_b=gs["ground_s"].filter(ImageFilter.GaussianBlur(9)),
        subject=gs["subject"], subject_b=gs["subject"].filter(ImageFilter.GaussianBlur(7)),
        grade=dict(warm=1.0, teal=0.7, sat=1.10, lift=1.03),
        move=lambda t: dict(z=1.03, dx=lerp(-0.22, 0.22, ease_in_out(t)), par=0.90),
    ))

    # 4 · WHITE SET — camera held. Craft rule: a static frame beats a timid push.
    ws = pair("P4", "H8", "H8")
    ws["subject"] = subject_layer([
        ("P4", (MATE, MATE), at(150, BAND_MID - MATE // 2)),
        ("H8", (HERO, HERO), at(700, BAND_MID - HERO // 2)),
    ])
    shots.append(dict(
        name="white", dur=3.2, caption="CLEAN  WHITE  SET", mblur=False,
        ground_s=ws["ground_s"], ground_b=ws["ground_s"].filter(ImageFilter.GaussianBlur(9)),
        subject=ws["subject"], subject_b=ws["subject"].filter(ImageFilter.GaussianBlur(7)),
        grade=dict(warm=0.8, teal=0.9, sat=1.06, lift=1.05),
        move=lambda t: dict(z=1.0, par=1.0),
    ))

    # 5 · CRIMSON FAMILY — drift plus a rack focus: soft ground resolves to sharp product.
    cg = ground_from(P("H5"), blur=56, dark=0.90)
    cs = subject_layer([
        ("H5", (430, 430), at(40, 145)),
        ("P5", (370, 370), at(500, 175)),
        ("C3", (200, 200), at(900, 150)),
        ("C5", (200, 200), at(900, 370)),
    ])
    shots.append(dict(
        name="crimson", dur=3.9, caption="CRIMSON  FAMILY", mblur=False,
        ground_s=cg, ground_b=cg.filter(ImageFilter.GaussianBlur(10)),
        subject=cs, subject_b=cs.filter(ImageFilter.GaussianBlur(11)),
        grade=dict(warm=1.0, teal=0.9, sat=1.12, lift=1.02),
        move=lambda t: dict(z=lerp(1.0, 1.05, linear(t)), dy=lerp(0.05, -0.04, linear(t)),
                            focus=lerp(0.52, 1.0, ease_out_expo(min(t / 0.45, 1))), par=0.94),
    ))

    # 6 · BLACK SET — held, then a late decisive push onto the chest print.
    bs = pair("H11", "P11", "H11")
    shots.append(dict(
        name="black", dur=3.6, caption="MIDNIGHT  BLACK  SET", mblur=True,
        ground_s=bs["ground_s"], ground_b=bs["ground_s"].filter(ImageFilter.GaussianBlur(9)),
        subject=bs["subject"], subject_b=bs["subject"].filter(ImageFilter.GaussianBlur(7)),
        grade=dict(warm=0.6, teal=1.1, sat=1.06, lift=1.06),
        move=lambda t: dict(
            z=1.0 if t < 0.55 else lerp(1.0, 1.28, ease_in_expo((t - 0.55) / 0.45)),
            dx=0.0 if t < 0.55 else lerp(0.0, -0.22, ease_in_expo((t - 0.55) / 0.45)), par=0.88),
    ))

    # 7 · SIGNATURE — the climax. Committed punch-in, motion blur, bloom swell.
    sg = ground_from(P("H7"), blur=52, dark=0.88)
    sl = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    hs2 = int(OH * 0.95)
    s7 = P("H7").resize((hs2, hs2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.6, 110, 3))
    m7 = Image.new("L", (hs2, hs2), 0)
    ImageDraw.Draw(m7).rectangle((46, 46, hs2 - 46, hs2 - 46), fill=255)
    s7.putalpha(m7.filter(ImageFilter.GaussianBlur(28)))
    sl.alpha_composite(s7, ((OW - hs2) // 2, (OH - hs2) // 2))
    shots.append(dict(
        name="signature", dur=4.0, caption="THE  SIGNATURE", mblur=True,
        ground_s=sg, ground_b=sg.filter(ImageFilter.GaussianBlur(10)),
        subject=sl, subject_b=sl.filter(ImageFilter.GaussianBlur(8)),
        grade=dict(warm=0.7, teal=0.9, sat=1.12, lift=1.04),
        move=lambda t: dict(
            z=lerp(1.0, 1.06, linear(min(t / 0.5, 1))) if t < 0.5
              else lerp(1.06, 1.80, ease_in_expo((t - 0.5) / 0.5)),
            dy=0.0 if t < 0.5 else lerp(0.0, 0.26, ease_in_expo((t - 0.5) / 0.5)),
            bloom=0.0 if t < 0.62 else (t - 0.62) / 0.38 * 0.5, par=0.86),
    ))

    # 8 · END CARD — the mark settles in and holds.
    eg = ground_from(P("H11"), blur=80, dark=0.58)
    shots.append(dict(
        name="end", dur=3.2, caption=None, mblur=False,
        ground_s=eg, ground_b=eg,
        subject=emblem_layer(EM, 400), subject_b=None,
        grade=dict(warm=0.4, teal=1.0, sat=1.06, lift=1.0),
        move=lambda t: dict(z=lerp(0.94, 1.0, ease_out_expo(min(t / 0.5, 1))), par=0.92),
    ))
    return shots

# ──────────────────────────────── render ───────────────────────────────
def main():
    shots = build()
    XF = int(FPS * 0.42)
    rng = np.random.default_rng(4)
    total = sum(int(s["dur"] * FPS) for s in shots)
    weave = ndimage.gaussian_filter1d(rng.normal(0, 1, (total + 64, 2)), 9, axis=0) * 0.85

    tmp = os.path.join(HERE, "_cinematic_raw.mp4")
    w = imageio_ffmpeg.write_frames(tmp, (FW, FH), fps=FPS, quality=7, macro_block_size=8)
    w.send(None)

    idx, tail = 0, []
    for si, shot in enumerate(shots):
        n = int(shot["dur"] * FPS)
        print(f"  {shot['name']:<10} {n:>3} frames", flush=True)
        frames = render_shot(shot, n, mblur=shot["mblur"])
        out = []
        for k, f in enumerate(frames):
            if shot["caption"]:
                a = cap_alpha(k, n, XF)
                if a > 0.01:
                    f = Image.fromarray(np.clip(
                        np.asarray(f).astype(np.float32) + caption_frame(shot["caption"], a),
                        0, 255).astype(np.uint8))
            out.append(finish(f, 1000 + idx + k, tuple(weave[idx + k])))
        idx += n

        if tail:
            for j in range(XF):
                a = tail[j] if j < len(tail) else tail[-1]
                w.send(np.asarray(Image.blend(a, out[j], (j + 1) / XF)))
            out = out[XF:]
        body = out[:-XF] if si < len(shots) - 1 else out
        for f in body:
            w.send(np.asarray(f))
        tail = out[-XF:] if si < len(shots) - 1 else []
    w.close()

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", tmp,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "23",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], check=True)
    os.remove(tmp)
    print(f"\n{OUT}  ({os.path.getsize(OUT)/1e6:.1f} MB)")

if __name__ == "__main__":
    main()
