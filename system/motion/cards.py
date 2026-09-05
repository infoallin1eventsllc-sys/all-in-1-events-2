"""Brand cards and lower-thirds for a social clip, drawn at 1080x1920.

Colours and type match system/supabase/functions/_shared/video.ts, so a clip
cut here and one rendered by the marketing system look like the same studio.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1080, 1920
PAPER, INK, SLATE, STEEL, SOFT = '#F5F4EF', '#23262B', '#3E4C63', '#4F6D8C', '#5B626C'
B = lambda s: ImageFont.truetype('UI-700.ttf', s)
R = lambda s: ImageFont.truetype('UI-400.ttf', s)


def wrap(d, text, font, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines


def title_card(kicker, headline, sub, path):
    im = Image.new('RGB', (W, H), PAPER); d = ImageDraw.Draw(im)
    x, y = 110, 720
    d.text((x, y), kicker.upper(), font=B(38), fill=STEEL)
    y += 96
    for ln in wrap(d, headline, B(104), W - 220):
        d.text((x, y), ln, font=B(104), fill=INK); y += 118
    y += 26
    d.rounded_rectangle([x, y, x + 120, y + 10], 5, fill=SLATE)
    y += 64
    for ln in wrap(d, sub, R(40), W - 240):
        d.text((x, y), ln, font=R(40), fill=SOFT); y += 54
    im.save(path)


def end_card(path):
    im = Image.new('RGB', (W, H), INK); d = ImageDraw.Draw(im)
    lock = Image.open('meridian-mark.png').convert('RGBA')
    lock.thumbnail((250, 250), Image.LANCZOS)
    im.paste(lock, ((W - lock.width) // 2, 620), lock)
    y = 940
    for ln, f, c in (('MERIDIAN', B(72), '#FFFFFF'), ('INTERFACE', R(40), '#CBD5E1')):
        w = d.textlength(ln, font=f, features=None)
        # letterspacing, drawn per character
        track = 18 if ln == 'MERIDIAN' else 14
        total = sum(d.textlength(ch, font=f) for ch in ln) + track * (len(ln) - 1)
        cx = (W - total) / 2
        for ch in ln:
            d.text((cx, y), ch, font=f, fill=c); cx += d.textlength(ch, font=f) + track
        y += 100
    y += 40
    for ln in ('Websites · Apps · Marketing Systems', 'Houston, Texas'):
        w = d.textlength(ln, font=R(38))
        d.text(((W - w) / 2, y), ln, font=R(38), fill='#94A3B8'); y += 56
    y += 60
    cta = 'meridianinterface.com'
    f = B(46); w = d.textlength(cta, font=f)
    d.rounded_rectangle([(W - w) / 2 - 46, y - 22, (W + w) / 2 + 46, y + 78], 20, fill=STEEL)
    d.text(((W - w) / 2, y + 8), cta, font=f, fill='#FFFFFF')
    im.save(path)


def lower_third(text, sub, path):
    """Transparent caption strip that sits over the footage."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f, fs = B(62), R(36)
    lines = wrap(d, text, f, W - 260)
    bh = 60 + len(lines) * 76 + (58 if sub else 0)
    top = H - bh - 300
    d.rounded_rectangle([70, top, W - 70, top + bh], 28, fill=(35, 38, 43, 236))
    y = top + 30
    for ln in lines:
        d.text((110, y), ln, font=f, fill='#FFFFFF'); y += 76
    if sub:
        d.text((110, y + 2), sub, font=fs, fill='#9FB2C9')
    im.save(path)
