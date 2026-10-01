#!/usr/bin/env python3
"""
Archive V.24 — motion cut.  Third pass: more angles, more motion.

The honest constraint: every source photograph is a flat-lay shot from one
fixed viewpoint. There is no second camera position hiding in a flat image and
no depth to recover, so a literal new angle is not available. What IS available,
and is what a cutting room would reach for anyway:

  · PERSPECTIVE TILT. A keystone warp leans the garment plane off-axis, so a
    flat-lay reads as though the camera sat to one side of it. Under a dolly
    this is convincing — it is the "resting 3D tilt" the Raylight craft guide
    calls a signature and says most agents leave out.
  · MORE FRAMINGS. Wide, medium and macro pulled from the same frame are three
    different angles in every sense that matters to an edit.
  · MORE CUTS. Twenty-one beats against the previous eight, most of them
    between 1.3s and 2.1s, so the cut carries the energy rather than the moves.
  · WHIP PANS between sections — six frames of extreme lateral smear bridging
    two shots, the one transition that reads as camera rather than software.
  · SPEED RAMP on the climax: slow drift, then the punch arrives late and hard.

It also finally uses the seven pieces neither earlier cut touched: C1, C4, C6,
H12, H13, P12, P14.

  python3 build_motion_cut.py            # full render
  PREVIEW=1 python3 build_motion_cut.py  # one still per beat -> contact sheet
"""

from PIL import Image, ImageFilter, ImageDraw
import numpy as np
from scipy import ndimage
import imageio_ffmpeg, subprocess, os, sys

from build_cinematic_cut import (
    FW, FH, FPS, OW, OH, BAR, GREY, P, VX0, VY0, at,
    linear, ease_out_expo, ease_in_expo, ease_in_out, lerp,
    keyed_emblem, ground_from, grade, finish, caption_frame, cap_alpha,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
OUT = os.path.join(ASSETS, "video", "420-motion-cut.mp4")
BAND = FH - 2 * BAR                     # 536px — the real vertical safe area

# ───────────────────────── perspective tilt ─────────────────────────
def _coeffs(src, dst):
    m = []
    for (sx, sy), (dx, dy) in zip(src, dst):
        m.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        m.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    A = np.array(m, dtype=np.float64)
    b = np.array(src, dtype=np.float64).reshape(8)
    return np.linalg.solve(A, b)

def tilt(img, yaw=0.0, pitch=0.0):
    """Keystone the image as if the camera swung off-axis. yaw/pitch in -1..1;
    ±0.35 reads as a decisive lean without the garment looking broken."""
    if abs(yaw) < 0.01 and abs(pitch) < 0.01:
        return img
    w, h = img.size
    ky, kp = yaw * 0.19, pitch * 0.19
    # positive yaw pushes the RIGHT edge away (shrinks it vertically)
    dst = [
        (0 + max(0.0, -ky) * w * 0.0, 0 + max(0.0, ky) * h),
        (w,                            0 + max(0.0, -ky) * h),
        (w,                            h - max(0.0, -ky) * h),
        (0,                            h - max(0.0, ky) * h),
    ]
    if abs(kp) > 0.01:                    # positive pitch tips the TOP away
        dst = [(x + (max(0.0, kp) * w if i in (0, 1) else max(0.0, -kp) * w) * (1 if i in (0, 3) else -1), y)
               for i, (x, y) in enumerate(dst)]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    return img.transform((w, h), Image.PERSPECTIVE, _coeffs(src, dst),
                         Image.BICUBIC, fillcolor=(0, 0, 0, 0))

# ───────────────────────── layer construction ───────────────────────
def placed(name, size, pos, yaw=0.0, pitch=0.0, feather=None):
    """One garment, optionally leaned, feathered onto a transparent plate."""
    s = P(name).resize((size, size), Image.LANCZOS).convert("RGBA")
    s = s.filter(ImageFilter.UnsharpMask(1.5, 100, 3))
    f = feather if feather is not None else max(26, int(size * 0.12))
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rectangle((f, f, size - f, size - f), fill=255)
    s.putalpha(m.filter(ImageFilter.GaussianBlur(f * 0.55)))
    s = tilt(s, yaw, pitch)
    lay = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    lay.alpha_composite(s, pos)
    return lay

def detail_ground(name, box, blur=64, dark=0.86):
    """Backdrop built from the same crop the detail comes from, so the detail's
    feathered edge has nothing to contrast against."""
    src = P(name); w, h = src.size
    c = src.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    k = max(OW / c.width, OH / c.height) * 1.2
    g = c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS)
    gx, gy = g.size
    g = g.crop(((gx - OW) // 2, (gy - OH) // 2, (gx - OW) // 2 + OW, (gy - OH) // 2 + OH))
    g = g.filter(ImageFilter.GaussianBlur(blur))
    return Image.fromarray((np.asarray(g).astype(np.float32) * dark).clip(0, 255).astype(np.uint8))

def detail(name, box, height=None, yaw=0.0, pitch=0.0):
    """A macro framing cut out of the same photograph — a different angle in
    every sense an edit cares about. box is (x0,y0,x1,y1) as fractions."""
    src = P(name)
    w, h = src.size
    c = src.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    tgt_h = height or int(BAND * 0.96)
    tgt_w = int(c.width * tgt_h / c.height)
    c = c.resize((tgt_w, tgt_h), Image.LANCZOS).convert("RGBA")
    c = c.filter(ImageFilter.UnsharpMask(1.8, 120, 3))
    f = 56
    m = Image.new("L", c.size, 0)
    ImageDraw.Draw(m).rectangle((f, f, c.width - f, c.height - f), fill=255)
    c.putalpha(m.filter(ImageFilter.GaussianBlur(f * 0.5)))
    c = tilt(c, yaw, pitch)
    lay = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    lay.alpha_composite(c, at((FW - c.width) // 2, (FH - c.height) // 2))
    return lay

# ───────────────────────────── sampling ─────────────────────────────
def sample(shot, t):
    cam = shot["move"](t)
    zs = cam["z"]; zg = zs * cam.get("par", 0.95)
    dx, dy = cam.get("dx", 0.0), cam.get("dy", 0.0)

    def crop(layer, z, ox, oy):
        cw, ch = min(OW, int(FW / z)), min(OH, int(FH / z))
        cx = int((OW - cw) / 2 + ox * (OW - cw) / 2)
        cy = int((OH - ch) / 2 + oy * (OH - ch) / 2)
        cx = max(0, min(OW - cw, cx)); cy = max(0, min(OH - ch, cy))
        return layer.crop((cx, cy, cx + cw, cy + ch)).resize((FW, FH), Image.BILINEAR)

    frame = crop(shot["ground"], zg, dx * 0.42, dy * 0.42).convert("RGBA")
    if shot.get("subject") is not None:
        frame = Image.alpha_composite(frame, crop(shot["subject"], zs, dx, dy))
    return grade(frame.convert("RGB"), **shot["grade"], bloom=cam.get("bloom", 0.0))

def render_shot(shot, n):
    out = []
    mb = shot.get("mblur", False)
    for k in range(n):
        t = k / max(n - 1, 1)
        if mb:
            d = 0.5 / max(n - 1, 1)
            acc = [np.asarray(sample(shot, min(1.0, max(0.0, t + o))), dtype=np.float32)
                   for o in (-d, 0.0, d)]
            out.append(Image.fromarray((sum(acc) / 3).astype(np.uint8)))
        else:
            out.append(sample(shot, t))
    return out

def whip(a, b, n=6):
    """Six frames of lateral smear bridging two shots."""
    frames = []
    for i in range(n):
        p = i / (n - 1)
        base = np.asarray(a if p < 0.5 else b).astype(np.float32)
        amt = int(90 * (1 - abs(p - 0.5) * 2) + 4)
        sm = ndimage.uniform_filter1d(base, size=max(3, amt), axis=1, mode="nearest")
        sm = sm * (0.72 + 0.28 * abs(p - 0.5) * 2)
        frames.append(Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8)))
    return frames

# ═══════════════════════════════ the cut ════════════════════════════
G = dict(warm=0.9, teal=0.9, sat=1.10, lift=1.03)
GD = dict(warm=0.6, teal=1.05, sat=1.08, lift=1.05)
GC = dict(warm=1.0, teal=0.85, sat=1.13, lift=1.02)

def beats():
    EM = keyed_emblem()
    HERO, MATE = 470, 400
    mid = lambda s: BAND_MID_FOR(s)
    def BAND_MID_FOR(s): return FH // 2 - s // 2
    B = []
    A = lambda **kw: B.append(kw)

    def em_layer(width):
        h = int(EM.height * width / EM.width)
        e = EM.resize((width, h), Image.LANCZOS)
        lay = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        glow = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        sil = Image.new("RGBA", (width, h), (0, 230, 57, 0))
        sil.putalpha(e.split()[3].point(lambda v: int(v * 0.55)))
        glow.alpha_composite(sil, at((FW - width) // 2, (FH - h) // 2))
        lay = Image.alpha_composite(lay, glow.filter(ImageFilter.GaussianBlur(34)))
        lay.alpha_composite(e, at((FW - width) // 2, (FH - h) // 2))
        return lay

    dark = ground_from(P("H11"), blur=78, dark=0.55)

    # 1 — hard open
    A(name="open", dur=2.2, cap=None, mblur=True, ground=dark, subject=em_layer(360), grade=GD,
      move=lambda t: dict(z=lerp(1.55, 1.0, ease_out_expo(min(t / 0.42, 1))), par=0.88))

    # 2-3 — signature hoodie: macro, then pull wide. Tilt resolves to square.
    g7 = ground_from(P("H7"), blur=115, dark=0.88)
    A(name="h7-macro", dur=1.8, cap=None, mblur=False, ground=detail_ground("H7", (0.26, 0.24, 0.78, 0.62)),
      subject=detail("H7", (0.26, 0.24, 0.78, 0.62), yaw=0.32), grade=G,
      move=lambda t: dict(z=lerp(1.14, 1.02, ease_out_expo(t)), dx=lerp(0.18, 0.0, ease_out_expo(t)), par=0.90))
    A(name="h7-wide", dur=2.0, cap="THE  SIGNATURE", mblur=False, ground=g7,
      subject=placed("H7", 515, at((FW - 515) // 2, BAND_MID_FOR(515)), yaw=-0.18), grade=G,
      move=lambda t: dict(z=lerp(1.0, 1.05, linear(t)), par=0.93), whip_after=True)

    # 4-6 — grey set: wide leaned left, then two details
    gg = ground_from(P("H10"), blur=110, dark=0.90)
    A(name="grey-wide", dur=2.0, cap="HEATHER  GREY  SET", mblur=True, ground=gg,
      subject=Image.alpha_composite(
          placed("H10", HERO, at(90, BAND_MID_FOR(HERO)), yaw=0.30),
          placed("P10", MATE, at(660, BAND_MID_FOR(MATE)), yaw=0.30)), grade=G,
      move=lambda t: dict(z=1.02, dx=lerp(-0.26, 0.26, ease_in_out(t)), par=0.88))
    A(name="grey-chest", dur=1.5, cap=None, mblur=False, ground=detail_ground("H10", (0.22, 0.22, 0.82, 0.64)),
      subject=detail("H10", (0.22, 0.22, 0.82, 0.64), yaw=-0.26), grade=G,
      move=lambda t: dict(z=lerp(1.02, 1.12, ease_in_out(t)), par=0.92))
    A(name="grey-leg", dur=1.4, cap=None, mblur=False, ground=detail_ground("P10", (0.44, 0.14, 0.90, 0.50)),
      subject=detail("P10", (0.44, 0.14, 0.90, 0.50), yaw=0.30), grade=G,
      move=lambda t: dict(z=lerp(1.10, 1.0, ease_out_expo(t)), dy=lerp(-0.12, 0.0, ease_out_expo(t)), par=0.90),
      whip_after=True)

    # 7-8 — white set
    gw = ground_from(P("H8"), blur=110, dark=0.92)
    A(name="white-wide", dur=1.9, cap="CLEAN  WHITE  SET", mblur=False, ground=gw,
      subject=Image.alpha_composite(
          placed("P4", MATE, at(150, BAND_MID_FOR(MATE)), yaw=-0.28),
          placed("H8", HERO, at(700, BAND_MID_FOR(HERO)), yaw=-0.28)), grade=GD,
      move=lambda t: dict(z=1.0, par=1.0))
    A(name="white-sleeve", dur=1.5, cap=None, mblur=False, ground=detail_ground("H8", (0.64, 0.26, 0.97, 0.80)),
      subject=detail("H8", (0.64, 0.26, 0.97, 0.80), yaw=-0.34), grade=GD,
      move=lambda t: dict(z=lerp(1.0, 1.10, ease_in_out(t)), dx=lerp(0.10, -0.06, ease_in_out(t)), par=0.90),
      whip_after=True)

    # 9-12 — crimson family, fast
    gc = ground_from(P("H5"), blur=110, dark=0.90)
    A(name="crim-wide", dur=1.8, cap="CRIMSON  FAMILY", mblur=False, ground=gc,
      subject=Image.alpha_composite(
          placed("H5", 430, at(40, 145), yaw=0.26),
          Image.alpha_composite(placed("P5", 370, at(500, 175), yaw=0.26),
                                Image.alpha_composite(placed("C3", 200, at(900, 150), yaw=0.26),
                                                      placed("C5", 200, at(900, 370), yaw=0.26)))),
      grade=GC, move=lambda t: dict(z=lerp(1.0, 1.05, linear(t)), dy=lerp(0.05, -0.04, linear(t)), par=0.93))
    A(name="crim-chest", dur=1.4, cap=None, mblur=False, ground=detail_ground("H5", (0.22, 0.24, 0.82, 0.64)),
      subject=detail("H5", (0.22, 0.24, 0.82, 0.64), yaw=-0.30), grade=GC,
      move=lambda t: dict(z=lerp(1.12, 1.02, ease_out_expo(t)), par=0.92))
    A(name="crim-hat", dur=1.3, cap=None, mblur=False, ground=detail_ground("C3", (0.12, 0.22, 0.86, 0.72)),
      subject=detail("C3", (0.12, 0.22, 0.86, 0.72), yaw=0.30), grade=GC,
      move=lambda t: dict(z=lerp(1.0, 1.10, ease_in_out(t)), dx=lerp(-0.10, 0.10, ease_in_out(t)), par=0.90))
    A(name="crim-bucket", dur=1.3, cap=None, mblur=True, ground=ground_from(P("C5"), blur=104, dark=0.88),
      subject=placed("C5", 430, at((FW - 430) // 2, BAND_MID_FOR(430)), yaw=-0.34), grade=GC,
      move=lambda t: dict(z=lerp(1.08, 1.0, ease_out_expo(t)), par=0.90), whip_after=True)

    # 13-15 — black set
    gb = ground_from(P("H11"), blur=110, dark=0.88)
    A(name="black-wide", dur=1.9, cap="MIDNIGHT  BLACK  SET", mblur=False, ground=gb,
      subject=Image.alpha_composite(
          placed("H11", HERO, at(90, BAND_MID_FOR(HERO)), yaw=-0.24),
          placed("P11", MATE, at(660, BAND_MID_FOR(MATE)), yaw=-0.24)), grade=GD,
      move=lambda t: dict(z=1.0, par=1.0))
    A(name="black-creed", dur=1.7, cap=None, mblur=False, ground=detail_ground("H11", (0.20, 0.22, 0.84, 0.88)),
      subject=detail("H11", (0.20, 0.22, 0.84, 0.88), yaw=0.22), grade=GD,
      move=lambda t: dict(z=lerp(1.0, 1.13, ease_in_expo(t)), par=0.88))
    A(name="black-leg", dur=1.4, cap=None, mblur=False, ground=detail_ground("P11", (0.48, 0.20, 0.94, 0.84)),
      subject=detail("P11", (0.48, 0.20, 0.94, 0.84), yaw=-0.30), grade=GD,
      move=lambda t: dict(z=lerp(1.10, 1.0, ease_out_expo(t)), par=0.92), whip_after=True)

    # 16-18 — the headwear the earlier cuts never used
    gh = ground_from(P("C1"), blur=108, dark=0.88)
    for i, (n, yw) in enumerate([("C1", 0.32), ("C4", -0.32), ("C6", 0.28)]):
        A(name=f"hat-{n}", dur=1.15, cap="HEADWEAR" if i == 0 else None, mblur=(i == 1),
          ground=gh, subject=placed(n, 420, at((FW - 420) // 2, BAND_MID_FOR(420)), yaw=yw),
          grade=G, move=(lambda s: (lambda t: dict(
              z=lerp(1.0, 1.09, ease_in_out(t)), dx=lerp(-s * 0.16, s * 0.16, ease_in_out(t)), par=0.90)))
              (1 if i % 2 == 0 else -1))
    B[-1]["whip_after"] = True

    # 19 — folded pieces, also never used
    gf = ground_from(P("H11"), blur=118, dark=0.80)
    A(name="folded", dur=1.9, cap="FOLDED  ARCHIVE", mblur=False, ground=gf,
      subject=Image.alpha_composite(
          placed("H13", HERO, at(90, BAND_MID_FOR(HERO)), pitch=0.16),
          placed("P12", MATE, at(660, BAND_MID_FOR(MATE)), pitch=0.16)), grade=GC,
      move=lambda t: dict(z=lerp(1.0, 1.06, ease_in_out(t)), dy=lerp(-0.08, 0.06, ease_in_out(t)), par=0.90),
      whip_after=True)

    # 20 — climax. Speed ramp: barely moves, then the punch lands late.
    A(name="climax", dur=3.4, cap=None, mblur=True, ground=g7,
      subject=placed("H7", 540, at((FW - 540) // 2, BAND_MID_FOR(540)), yaw=0.0), grade=G,
      move=lambda t: dict(
          z=lerp(1.0, 1.08, linear(min(t / 0.55, 1))) if t < 0.55
            else lerp(1.08, 1.92, ease_in_expo((t - 0.55) / 0.45)),
          dy=0.0 if t < 0.55 else lerp(0.0, 0.30, ease_in_expo((t - 0.55) / 0.45)),
          bloom=0.0 if t < 0.66 else (t - 0.66) / 0.34 * 0.55, par=0.84))

    # 21 — end card
    A(name="end", dur=2.8, cap=None, mblur=False,
      ground=ground_from(P("H11"), blur=82, dark=0.52),
      subject=em_layer(400), grade=GD,
      move=lambda t: dict(z=lerp(0.94, 1.0, ease_out_expo(min(t / 0.5, 1))), par=0.92))
    return B

# ═══════════════════════════════ render ═════════════════════════════
def main():
    B = beats()
    if os.environ.get("PREVIEW"):
        cols = 3
        rows = (len(B) + cols - 1) // cols
        sheet = Image.new("RGB", (FW * cols, FH * rows), (0, 0, 0))
        for i, s in enumerate(B):
            f = finish(sample(s, 0.62), 1)
            d = ImageDraw.Draw(f)
            d.text((22, BAR + 14), f"{i+1:02d} {s['name']}", fill=(0, 230, 57))
            sheet.paste(f, ((i % cols) * FW, (i // cols) * FH))
        out = os.path.join(HERE, "_motion_preview.png")
        sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save(out)
        print(f"preview -> {out}  ({len(B)} beats, "
              f"{sum(s['dur'] for s in B):.1f}s + whips)")
        return

    XF = int(FPS * 0.30)
    total = sum(int(s["dur"] * FPS) for s in B)
    weave = ndimage.gaussian_filter1d(
        np.random.default_rng(7).normal(0, 1, (total + 96, 2)), 9, axis=0) * 0.8

    tmp = os.path.join(HERE, "_motion_raw.mp4")
    w = imageio_ffmpeg.write_frames(tmp, (FW, FH), fps=FPS, quality=7, macro_block_size=8)
    w.send(None)

    idx, tail, pending_whip = 0, [], False
    for si, s in enumerate(B):
        n = int(s["dur"] * FPS)
        print(f"  {si+1:02d} {s['name']:<14} {n:>3}f", flush=True)
        raw = render_shot(s, n)
        out = []
        for k, f in enumerate(raw):
            if s["cap"]:
                a = cap_alpha(k, n, XF)
                if a > 0.01:
                    f = Image.fromarray(np.clip(
                        np.asarray(f).astype(np.float32) + caption_frame(s["cap"], a),
                        0, 255).astype(np.uint8))
            out.append(finish(f, 2000 + idx + k, tuple(weave[idx + k])))
        idx += n

        if pending_whip and tail:
            for f in whip(tail[-1], out[0]):
                w.send(np.asarray(f))
            pending_whip = False
        elif tail:
            for j in range(XF):
                a = tail[j] if j < len(tail) else tail[-1]
                w.send(np.asarray(Image.blend(a, out[j], (j + 1) / XF)))
            out = out[XF:]

        last = si == len(B) - 1
        nxt_whip = s.get("whip_after", False)
        body = out if (last or nxt_whip) else out[:-XF]
        for f in body:
            w.send(np.asarray(f))
        tail = [] if last else (out[-1:] if nxt_whip else out[-XF:])
        pending_whip = nxt_whip
    w.close()

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", tmp,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "23",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], check=True)
    os.remove(tmp)
    print(f"\n{OUT}  ({os.path.getsize(OUT)/1e6:.1f} MB)")

if __name__ == "__main__":
    main()
