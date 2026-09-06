"""Render the title and end card as separate RGBA layers so each can move on
its own: the kicker slides in, the headline rises word-group by word-group,
the rule draws itself, the mark scales in and the wordmark resolves after it.
Same palette and type as cards.py."""
from PIL import Image, ImageDraw
import cards
from cards import W, H, PAPER, INK, SLATE, STEEL, SOFT, B, R

def layer(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))
def save(im, name): im.save(f'assets/layers/{name}.png')

import os; os.makedirs('assets/layers', exist_ok=True)

# ---- title layers (Big Boy Subs) ----
kicker, head, sub = 'Restaurant ordering', ['Your menu,', 'taking orders.'], 'Big Boy Subs — Monterey, California'
x, y0 = 110, 720
im = layer(); ImageDraw.Draw(im).text((x, y0), kicker.upper(), font=B(38), fill=STEEL); save(im, 'bbs-kicker')
y = y0 + 96
for i, ln in enumerate(head):
    im = layer(); ImageDraw.Draw(im).text((x, y), ln, font=B(104), fill=INK); save(im, f'bbs-head{i}'); y += 118
y += 26
im = layer(); ImageDraw.Draw(im).rounded_rectangle([x, y, x + 120, y + 10], 5, fill=SLATE); save(im, 'bbs-rule')
y += 64
im = layer(); ImageDraw.Draw(im).text((x, y), sub, font=R(40), fill=SOFT); save(im, 'bbs-sub')
Image.new('RGB', (W, H), PAPER).save('assets/layers/paper.png')

# ---- end card layers ----
Image.new('RGB', (W, H), INK).save('assets/layers/ink.png')
mark = Image.open('meridian-mark.png').convert('RGBA'); mark.thumbnail((250, 250), Image.LANCZOS)
im = layer(); im.paste(mark, ((W - mark.width) // 2, 620), mark); save(im, 'end-mark')
im = layer(); d = ImageDraw.Draw(im); y = 940
for ln, f, c in (('MERIDIAN', B(72), '#FFFFFF'), ('INTERFACE', R(40), '#CBD5E1')):
    track = 18 if ln == 'MERIDIAN' else 14
    total = sum(d.textlength(ch, font=f) for ch in ln) + track * (len(ln) - 1); cx = (W - total) / 2
    for ch in ln: d.text((cx, y), ch, font=f, fill=c); cx += d.textlength(ch, font=f) + track
    y += 100
save(im, 'end-wordmark')
im = layer(); d = ImageDraw.Draw(im); y = 1180
for ln in ('Websites · Apps · Marketing Systems', 'Houston, Texas'):
    w = d.textlength(ln, font=R(38)); d.text(((W - w) / 2, y), ln, font=R(38), fill='#94A3B8'); y += 56
save(im, 'end-tagline')
im = layer(); d = ImageDraw.Draw(im)
bw, bh = 620, 108; bx, by = (W - bw) // 2, 1380
d.rounded_rectangle([bx, by, bx + bw, by + bh], 26, fill=STEEL)
t = 'meridianinterface.com'; w = d.textlength(t, font=B(46)); d.text(((W - w) / 2, by + 26), t, font=B(46), fill='#FFFFFF')
save(im, 'end-url')
print('layers written')
