#!/usr/bin/env python3
"""The consumer ad — 18 seconds, built to be scrolled past and not scrolled past.

    python3 tools/build_ad_cut.py              # both formats
    python3 tools/build_ad_cut.py --vertical   # 9:16 only
    python3 tools/build_ad_cut.py --preview    # contact sheet, no encode

HOW THIS DIFFERS FROM THE LOOKBOOK FILM
---------------------------------------
420-motion-cut.mp4 is a lookbook: it unfolds, it has room, it assumes someone
chose to watch it. An ad is interrupting someone. So:

- **9:16 first.** A consumer product ad in 2026 is watched in Reels, TikTok
  and Stories, held upright. The 16:9 render exists for the website; the
  vertical one is the ad.
- **The hook lands in under a second.** No slow build — the mark hits, the
  line hits, and by 2.6s the first garment is on screen. Most of the audience
  decides inside that window.
- **A reason, not just a look.** One beat is given to the actual spec —
  450GSM, loopwheel — because "nice hoodie" does not sell a $148 hoodie and a
  number does.
- **Price is stated.** "From $135" pre-qualifies the click. An ad that hides
  the price buys traffic that was never going to spend.
- **It ends on an instruction.** The lookbook ends on a logo; an ad ends on
  what to do next.

Every frame comes from Otis's own product photography in ../assets/products/
picks/. Nothing here is generated imagery.

Geometry and the grade are borrowed from build_cinematic_cut by rebinding its
module globals — the helpers read FW/FH/OW/OH at call time, so setting them
retargets the whole toolchain to a new aspect ratio without a second copy of
the compositing code.
"""

import argparse
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage
import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_cinematic_cut as bc

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
FONT = bc.FONT
GREY, GREEN, WHITE = (205, 205, 205), (0, 230, 57), (242, 242, 238)

FORMATS = {
    # name          W     H    plate scale
    "vertical": (1080, 1920, 1.55),
    "wide":     (1280,  720, 1.60),
}


def configure(fmt):
    """Point the borrowed toolchain at this aspect ratio.

    bc's helpers resolve FW/FH/OW/OH/VX0/VY0 from their module globals on every
    call, so rebinding them here is enough — no shadow copy of ground_from,
    subject_layer, sample, render_shot or grade.
    """
    w, h, k = FORMATS[fmt]
    bc.FW, bc.FH = w, h
    bc.OW, bc.OH = int(w * k) // 2 * 2, int(h * k) // 2 * 2
    bc.BAR = 0                       # an ad fills the frame; no letterbox
    bc.VX0, bc.VY0 = (bc.OW - bc.FW) // 2, (bc.OH - bc.FH) // 2
    bc.BAND_TOP, bc.BAND_MID = 0, bc.FH // 2
    return w, h


# ───────────────────────────────── type ────────────────────────────────
def _fit(draw, text, font, track):
    return sum(draw.textlength(c, font=font) for c in text) + track * (len(text) - 1)


def type_layer(lines, alpha):
    """lines: (text, size, y, colour, tracking) in frame coordinates.

    Returned as a float array to be *added* to the frame, so type sits on the
    image like light rather than punching a hole in it. Centred horizontally;
    the ad is watched on a phone where centre is the only reliable axis.
    """
    lay = Image.new("RGB", (bc.FW, bc.FH), (0, 0, 0))
    d = ImageDraw.Draw(lay)
    for text, size, y, colour, track in lines:
        f = ImageFont.truetype(FONT, size)
        x = (bc.FW - _fit(d, text, f, track)) / 2
        for c in text:
            d.text((x, y), c, font=f, fill=colour)
            x += d.textlength(c, font=f) + track
    return np.asarray(lay).astype(np.float32) * alpha


def scrim(frame, top=0.0, bottom=0.0):
    """Darken behind type. Contrast on a photograph is otherwise whatever
    happened to be in the shot, which is not a decision."""
    if top <= 0 and bottom <= 0:
        return frame
    a = np.asarray(frame).astype(np.float32)
    yy = np.linspace(0, 1, bc.FH)[:, None, None]
    m = np.ones((bc.FH, 1, 1), np.float32)
    if top > 0:
        m *= 1.0 - top * np.clip(1 - yy / 0.42, 0, 1) ** 1.5
    if bottom > 0:
        m *= 1.0 - bottom * np.clip((yy - 0.52) / 0.48, 0, 1) ** 1.5
    return Image.fromarray(np.clip(a * m, 0, 255).astype(np.uint8))


def hold(k, n, fade_in=7, fade_out=9):
    """Type envelope: up fast, out before the cut so nothing is mid-word."""
    if k < fade_in:
        return k / fade_in
    if k > n - fade_out:
        return max(0.0, (n - k) / fade_out)
    return 1.0


# ─────────────────────────────── the beats ─────────────────────────────
def build(vertical):
    """Seven beats, 18.0s. Timings are the ad's spine — hook by 2.6s, first
    garment immediately after, spec at the two-thirds mark, CTA last and
    longest because it is the only frame that has to be read."""
    EM = bc.keyed_emblem()
    W, H = bc.FW, bc.FH
    mid = H // 2
    shots = []

    # Sizes as a fraction of the short edge, so both formats stay in proportion.
    S = W if vertical else H
    HERO = int(S * (0.72 if vertical else 0.66))
    MATE = int(S * (0.56 if vertical else 0.56))
    TRIO = int(S * (0.32 if vertical else 0.30))

    def stack(a, b):
        """Hero and its mate: stacked on a phone, side by side on a screen."""
        if vertical:
            return [(a, (HERO, HERO), bc.at((W - HERO) // 2, int(H * 0.16))),
                    (b, (MATE, MATE), bc.at((W - MATE) // 2, int(H * 0.54)))]
        return [(a, (HERO, HERO), bc.at(int(W * 0.06), mid - HERO // 2)),
                (b, (MATE, MATE), bc.at(int(W * 0.52), mid - MATE // 2))]

    def row3(a, b, c):
        if vertical:
            return [(a, (TRIO, TRIO), bc.at((W - TRIO) // 2, int(H * 0.13))),
                    (b, (TRIO, TRIO), bc.at((W - TRIO) // 2, int(H * 0.36))),
                    (c, (TRIO, TRIO), bc.at((W - TRIO) // 2, int(H * 0.59)))]
        g = int(W * 0.03)
        x0 = (W - (TRIO * 3 + g * 2)) // 2
        return [(n, (TRIO, TRIO), bc.at(x0 + i * (TRIO + g), mid - TRIO // 2))
                for i, n in enumerate((a, b, c))]

    def beat(name, dur, ground_src, subject, move, grade, lines,
             mblur=False, gblur=54, gdark=0.90, sc=(0.0, 0.0)):
        g = bc.ground_from(bc.P(ground_src), blur=gblur, dark=gdark)
        return dict(name=name, dur=dur, mblur=mblur, lines=lines, scrim=sc,
                    ground_s=g, ground_b=g.filter(ImageFilter.GaussianBlur(9)),
                    subject=subject,
                    subject_b=subject.filter(ImageFilter.GaussianBlur(7)) if subject else None,
                    grade=grade, move=move)

    # Emblem width and the plate y of its top edge, per orientation. On a
    # phone it can own the middle; on a screen it must stay above the copy.
    EMW = int(S * (0.62 if vertical else 0.46))
    EMY = bc.VY0 + int(H * (0.25 if vertical else 0.07))

    big = int(S * 0.072)
    small = int(S * 0.030)
    tiny = int(S * 0.024)
    y_top = int(H * (0.10 if vertical else 0.11))
    y_low = int(H * (0.80 if vertical else 0.79))

    # 1 · HOOK — the mark arrives already moving and settles. No slow build:
    #     the first frame is not empty and the line is readable by 0.5s.
    g1 = bc.ground_from(bc.P("H11"), blur=76, dark=0.58)
    shots.append(dict(
        name="hook", dur=2.6, mblur=True, scrim=(0.0, 0.30),
        ground_s=g1, ground_b=g1.filter(ImageFilter.GaussianBlur(9)),
        subject=bc.emblem_layer(EM, EMW, cy=EMY),
        subject_b=None,
        grade=dict(warm=0.4, teal=1.0, sat=1.06, lift=1.0),
        move=lambda t: dict(z=bc.lerp(1.55, 1.0, bc.ease_out_expo(min(t / 0.30, 1))),
                            par=0.90, bloom=0.10 * (1 - min(t / 0.3, 1))),
        lines=[("NEW  COLLECTION", small, y_low, GREEN, 9),
               ("ARCHIVE  V.24", big, y_low + int(small * 1.9), WHITE, 5)],
    ))

    # 2-4 · THE SETS — three colourways, one each, cut hard. A lateral track
    #     rather than a push: the garment stays whole and legible.
    for nm, a, b, cap, gsrc, dx in (
        ("grey", "H10", "P10", "HEATHER  GREY  SET", "H10", (-0.16, 0.16)),
        ("crimson", "H5", "P5", "CRIMSON  FAMILY", "H5", (0.16, -0.16)),
        ("black", "H11", "P11", "MIDNIGHT  BLACK  SET", "H11", (-0.16, 0.16)),
    ):
        shots.append(beat(
            nm, 2.4, gsrc, bc.subject_layer(stack(a, b)),
            move=lambda t, d=dx: dict(z=1.03, dx=bc.lerp(d[0], d[1], bc.ease_in_out(t)), par=0.90),
            grade=dict(warm=1.0, teal=0.7, sat=1.10, lift=1.03),
            lines=[(cap, small, y_low, GREY, 8)],
            mblur=True, sc=(0.0, 0.34),
        ))

    # 5 · THE REASON — the only beat that argues rather than shows. A push in
    #     on the fabric while the number lands: "nice hoodie" does not sell a
    #     $148 hoodie, a spec does.
    shots.append(beat(
        "spec", 2.6, "H7",
        bc.subject_layer([("H7", (int(S * 1.05),) * 2,
                           bc.at((W - int(S * 1.05)) // 2, mid - int(S * 1.05) // 2))]),
        move=lambda t: dict(z=bc.lerp(1.0, 1.42, bc.ease_in_out(t)), par=0.93),
        grade=dict(warm=0.9, teal=0.8, sat=1.08, lift=1.02),
        lines=[("450GSM  LOOPWHEEL  FLEECE", small, y_top, GREEN, 9),
               ("3D  PUFF  EMBROIDERY", tiny, y_top + int(small * 1.8), GREY, 7)],
        mblur=True, gblur=60, gdark=0.80, sc=(0.42, 0.0),
    ))

    # 6 · HEADWEAR — the cheap way in. An ad needs a price the viewer can say
    #     yes to without deciding anything.
    shots.append(beat(
        "headwear", 2.0, "C6", bc.subject_layer(row3("C3", "C5", "C6")),
        move=lambda t: dict(z=bc.lerp(1.0, 1.05, bc.linear(t)), par=0.94),
        grade=dict(warm=1.0, teal=0.7, sat=1.10, lift=1.03),
        lines=[("HEADWEAR  FROM  $44", small, y_low, GREY, 8)],
        gblur=70, gdark=0.72, sc=(0.0, 0.34),
    ))

    # 7 · THE ASK — longest beat, because it is the one that has to be read.
    #     Price anchors the click; the last line says what to do.
    g7 = bc.ground_from(bc.P("H7"), blur=80, dark=0.42)
    shots.append(dict(
        name="cta", dur=3.6, mblur=False, scrim=(0.0, 0.42),
        ground_s=g7, ground_b=g7.filter(ImageFilter.GaussianBlur(9)),
        subject=bc.emblem_layer(EM, int(EMW * 0.9), cy=EMY),
        subject_b=None,
        grade=dict(warm=0.7, teal=0.9, sat=1.08, lift=1.02),
        move=lambda t: dict(z=bc.lerp(1.0, 1.05, bc.linear(t)), par=0.92,
                            bloom=0.16 * bc.ease_in_out(min(t / 0.5, 1))),
        lines=[("HOODIES  FROM  $135", small, y_low - int(small * 2.1), GREY, 8),
               ("SHOP  THE  ARCHIVE", big, y_low, WHITE, 6),
               ("420  FRIENDLY", tiny, y_low + int(big * 1.35), GREEN, 11)],
    ))
    return shots


# ──────────────────────────────── render ───────────────────────────────
def frames_for(shot, n):
    out = []
    raw = bc.render_shot(shot, n, mblur=shot["mblur"])
    for k, f in enumerate(raw):
        f = scrim(f, *shot["scrim"])
        a = hold(k, n)
        if shot["lines"] and a > 0.01:
            f = Image.fromarray(np.clip(
                np.asarray(f).astype(np.float32) + type_layer(shot["lines"], a),
                0, 255).astype(np.uint8))
        out.append(f)
    return out


def render(fmt, preview=False):
    w, h = configure(fmt)
    vertical = fmt == "vertical"
    shots = build(vertical)
    total_s = sum(s["dur"] for s in shots)
    print(f"\n{fmt}  {w}x{h}  {total_s:.1f}s")

    if preview:
        tiles = []
        for s in shots:
            n = int(s["dur"] * bc.FPS)
            tiles.append(frames_for(s, n)[n // 2])
        tw = 300 if vertical else 380
        th = int(tw * h / w)
        sheet = Image.new("RGB", (tw * len(tiles), th), (0, 0, 0))
        for i, t in enumerate(tiles):
            sheet.paste(t.resize((tw, th), Image.LANCZOS), (i * tw, 0))
        p = os.path.join(HERE, f"_ad_preview_{fmt}.jpg")
        sheet.save(p, quality=90)
        print(f"  {p}")
        return

    XF = int(bc.FPS * 0.20)          # tight crossfades: an ad cuts, it does not drift
    rng = np.random.default_rng(11)
    total = sum(int(s["dur"] * bc.FPS) for s in shots)
    weave = ndimage.gaussian_filter1d(rng.normal(0, 1, (total + 64, 2)), 9, axis=0) * 0.7

    tmp = os.path.join(HERE, f"_ad_raw_{fmt}.mp4")
    wr = imageio_ffmpeg.write_frames(tmp, (w, h), fps=bc.FPS, quality=8, macro_block_size=8)
    wr.send(None)

    idx, tail = 0, []
    for si, shot in enumerate(shots):
        n = int(shot["dur"] * bc.FPS)
        print(f"  {shot['name']:<9} {n:>3} frames", flush=True)
        out = [bc.finish(f, 2000 + idx + k, tuple(weave[idx + k]))
               for k, f in enumerate(frames_for(shot, n))]
        idx += n
        if tail:
            for j in range(XF):
                a = tail[j] if j < len(tail) else tail[-1]
                wr.send(np.asarray(Image.blend(a, out[j], (j + 1) / XF)))
            out = out[XF:]
        body = out[:-XF] if si < len(shots) - 1 else out
        for f in body:
            wr.send(np.asarray(f))
        tail = out[-XF:] if si < len(shots) - 1 else []
    wr.close()

    dst = os.path.join(ASSETS, "video", f"420-ad-{'9x16' if vertical else '16x9'}.mp4")
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", tmp,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "21",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], check=True)
    os.remove(tmp)

    still = dst.replace(".mp4", ".jpg")
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", "1.6", "-i", dst,
                    "-frames:v", "1", "-q:v", "4", still], check=True)
    print(f"  -> {os.path.relpath(dst, ASSETS)}  ({os.path.getsize(dst)/1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vertical", action="store_true", help="9:16 only")
    ap.add_argument("--wide", action="store_true", help="16:9 only")
    ap.add_argument("--preview", action="store_true", help="contact sheet, no encode")
    a = ap.parse_args()
    which = ["vertical"] if a.vertical else ["wide"] if a.wide else ["vertical", "wide"]
    for fmt in which:
        render(fmt, preview=a.preview)


if __name__ == "__main__":
    main()
