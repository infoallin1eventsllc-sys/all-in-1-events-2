"""Assets for the 'drive' template: more motion, more graphics.

Anything that pops (spring overshoot) is rendered as a short PNG sequence with
PIL, because ffmpeg cannot scale an overlay per frame with alpha intact; the
sequence is overlaid for its 0.6 s, then the static frame holds.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, os, sys, json
import cards
from cards import W, H, PAPER, INK, SLATE, STEEL, SOFT, B, R

OUT = 'assets/drive'; os.makedirs(OUT, exist_ok=True)
def layer(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))
def spring(t):                      # 0..1 -> overshoot to ~1.08 then settle
    return 1 - math.exp(-6*t) * math.cos(9*t) * (1 - t) if t < 1 else 1.0
def pop_sequence(img, name, frames=18, anchor=None):
    """Scale img about its content centre from 0.72 -> overshoot -> 1, alpha 0->1."""
    bbox = img.getbbox(); cx = (bbox[0]+bbox[2])//2 if anchor is None else anchor[0]; cy = (bbox[1]+bbox[3])//2 if anchor is None else anchor[1]
    for i in range(frames):
        t = i/(frames-1); s = 0.72 + 0.28*spring(t); a = min(1.0, t*2.2)
        f = layer(); sc = img.resize((max(1,int(W*s)), max(1,int(H*s))), Image.LANCZOS)
        f.paste(sc, (int(cx - cx*s), int(cy - cy*s)), sc)
        if a < 1:
            al = f.split()[3].point(lambda v: int(v*a)); f.putalpha(al)
        f.save(f'{OUT}/{name}_{i:03d}.png')
    img.save(f'{OUT}/{name}.png')

# ---- caption: headline + sub in an ink card, plus feature chips above ------
def caption(title, sub, chips, name):
    im = layer(); d = ImageDraw.Draw(im); f, fs = B(60), R(34)
    lines = cards.wrap(d, title, f, W - 260); bh = 56 + len(lines)*74 + (54 if sub else 0)
    top = H - bh - 300
    d.rounded_rectangle([70, top, W-70, top+bh], 26, fill=(35, 38, 43, 240))
    d.rounded_rectangle([70, top, 82, top+bh], 6, fill=STEEL)             # accent edge
    y = top + 28
    for ln in lines: d.text((116, y), ln, font=f, fill='#FFFFFF'); y += 74
    if sub: d.text((116, y+2), sub, font=fs, fill='#9FB2C9')
    pop_sequence(im, f'{name}-cap')
    # chips: each its own sequence so they can stagger
    x = 70; cy = top - 74
    for k, c in enumerate(chips):
        ch = layer(); dc = ImageDraw.Draw(ch); w = dc.textlength(c, font=B(30)) + 52
        dc.rounded_rectangle([x, cy, x+w, cy+58], 29, fill=(79, 109, 140, 235))
        dc.text((x+26, cy+12), c, font=B(30), fill='#FFFFFF')
        pop_sequence(ch, f'{name}-chip{k}', frames=14); x += w + 14

# ---- title words (fly in one by one) ----------------------------------------
def title_words(kicker, words_lines, sub, name):
    x0, y = 110, 700
    im = layer(); ImageDraw.Draw(im).text((x0, y), kicker.upper(), font=B(38), fill=STEEL); im.save(f'{OUT}/{name}-kicker.png')
    y += 96; n = 0; d0 = ImageDraw.Draw(layer())
    for ln in words_lines:
        x = x0
        for wd in ln.split():
            im = layer(); ImageDraw.Draw(im).text((x, y), wd, font=B(104), fill=INK); im.save(f'{OUT}/{name}-w{n}.png'); n += 1
            x += d0.textlength(wd + ' ', font=B(104))
        y += 118
    band = layer(); ImageDraw.Draw(band).rectangle([0, y+18, W, y+34], fill=STEEL); band.save(f'{OUT}/{name}-band.png')
    im = layer(); ImageDraw.Draw(im).text((x0, y+70), sub, font=R(40), fill=SOFT); im.save(f'{OUT}/{name}-sub.png')
    return n

# ---- chrome: progress bar, corner tag ---------------------------------------
bar = layer(); ImageDraw.Draw(bar).rectangle([0, 0, W, 10], fill=STEEL); bar.save(f'{OUT}/progress.png')
tag = layer(); d = ImageDraw.Draw(tag); t = 'MERIDIAN INTERFACE  ·  PRODUCT DEMO'; w = d.textlength(t, font=B(24)) + 44
d.rounded_rectangle([40, 40, 40+w, 92], 26, fill=(35, 38, 43, 225)); d.text((62, 53), t, font=B(24), fill='#E2E8F0'); tag.save(f'{OUT}/tag.png')

# ---- end card pops -----------------------------------------------------------
mark = Image.open('meridian-mark.png').convert('RGBA'); mark.thumbnail((250, 250), Image.LANCZOS)
im = layer(); im.paste(mark, ((W-mark.width)//2, 620), mark); pop_sequence(im, 'end-mark', frames=22)
url = Image.open('assets/layers/end-url.png').convert('RGBA'); pop_sequence(url, 'end-url', frames=16)

SETS = {
 'bbs': dict(title=('Restaurant ordering', ['Your menu,', 'taking orders.'], 'Big Boy Subs — Monterey, California'),
             caps=[('Ordering that works on a phone', 'Pickup times, live kitchen wait', ['Pickup', 'Delivery', 'Loyalty']),
                   ('Every sub, built their way', 'Options, sizes, running total', ['Customize', 'Sizes', 'Add to bag']),
                   ('Merch that sells itself', 'Storefront, checkout, fulfilment', ['Tees', 'Hoodies', 'Checkout'])]),
 'ms':  dict(title=('Retail storefront', ['A shop that sells', 'while you sleep.'], 'MODERN_STREET — apparel'),
             caps=[('A storefront, not a catalogue', 'Lookbook, collections, stock', ['Lookbook', 'Collections', 'Stock']),
                   ('Browsing that feels designed', 'Filters, sizes, availability', ['Filters', 'Sizes', 'Availability']),
                   ('Product pages that convert', 'Gallery, options, add to bag', ['Gallery', 'Options', 'Bag'])]),
}
meta = {}
for k, s in SETS.items():
    kicker, lines, sub = s['title']; n = title_words(kicker, lines, sub, k)
    for i, (t, st, chips) in enumerate(s['caps']): caption(t, st, chips, f'{k}-lt{i}')
    meta[k] = {'words': n, 'chips': [len(c[2]) for c in s['caps']]}
json.dump(meta, open(f'{OUT}/meta.json', 'w')); print('drive assets:', meta, len(os.listdir(OUT)), 'files')
