"""Assets for the three-product reel: title layers, band captions for the
dashboard segments, the panel background with a baked shadow, and the
tech-stack still. Same palette/type as cards.py."""
from PIL import Image, ImageDraw, ImageFilter
import cards, os
from cards import W, H, PAPER, INK, SLATE, STEEL, SOFT, B, R
os.makedirs('assets/layers', exist_ok=True)
def layer(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))

# ---- title layers: reel-* -------------------------------------------------
x, y = 110, 700
im = layer(); ImageDraw.Draw(im).text((x, y), 'WHAT WE BUILD', font=B(38), fill=STEEL); im.save('assets/layers/reel-kicker.png')
y += 96
for i, ln in enumerate(['Apps. Dashboards.', 'AI systems.']):
    im = layer(); ImageDraw.Draw(im).text((x, y), ln, font=B(104), fill=INK); im.save(f'assets/layers/reel-head{i}.png'); y += 118
y += 26
im = layer(); ImageDraw.Draw(im).rounded_rectangle([x, y, x + 120, y + 10], 5, fill=SLATE); im.save('assets/layers/reel-rule.png')
y += 64
im = layer(); ImageDraw.Draw(im).text((x, y), 'Meridian Interface — Houston, Texas', font=R(40), fill=SOFT); im.save('assets/layers/reel-sub.png')

# ---- panel background: slate-to-ink gradient with a soft shadow under the panel
PANEL = (0, 150, 1080, 1662)          # 760x1064 recording scaled 1.42 -> 1080x1512
bg = Image.new('RGB', (W, H), INK); px = bg.load()
for yy in range(H):
    t = yy / H
    r = int(0x23 + (0x3E - 0x23) * (1 - t) * 0.55); g = int(0x26 + (0x4C - 0x26) * (1 - t) * 0.55); b = int(0x2B + (0x63 - 0x2B) * (1 - t) * 0.55)
    for xx in range(W): px[xx, yy] = (r, g, b)
sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rectangle([40, PANEL[1] + 26, W - 40, PANEL[3] + 26], fill=(0, 0, 0, 150))
sh = sh.filter(ImageFilter.GaussianBlur(28)); bg.paste(sh, (0, 0), sh)
bg.save('assets/layers/panel-bg.png')

# ---- band captions (text on the ink band under the panel) ------------------
def band(title, sub, name):
    im = layer(); d = ImageDraw.Draw(im); y = 1706
    d.rounded_rectangle([110, y + 8, 118, y + 56], 4, fill=STEEL)      # accent tick
    d.text((140, y), title, font=B(52), fill='#FFFFFF'); d.text((140, y + 68), sub, font=R(32), fill='#B8C4D6')
    im.save(f'assets/{name}.png')
band('Executive dashboards', 'Live revenue, forecasts, runway',   'fin-lt0')
band('Board-ready in one view', 'Real-time revenue, drill-down',  'fin-lt1')
band('Your AI tech stack',      'Five layers, planned for you',   'stack-lt0')
band('Build it layer by layer', 'Agents, tools, guardrails',      'stack-lt1')
cards.lower_third('Ordering apps', 'Menu, options, pickup times', 'assets/reel-bbs-lt0.png')
cards.lower_third('Every order, built their way', 'Options, sizes, add to bag', 'assets/reel-bbs-lt1.png')

# ---- the tech-stack still (1080x1350, social portrait) ----------------------
IW, IH = 1080, 1350
im = Image.new('RGB', (IW, IH), PAPER); d = ImageDraw.Draw(im)
d.text((80, 96), 'TECH STACK', font=B(34), fill=STEEL)
d.text((80, 150), 'The 5-layer agentic', font=B(84), fill=INK); d.text((80, 244), 'architecture.', font=B(84), fill=INK)
d.rounded_rectangle([80, 360, 200, 370], 5, fill=SLATE)
d.text((80, 396), 'Planned for your company, with guardrails built in.', font=R(34), fill=SOFT)
shot = Image.open('assets/stack-hero.png').convert('RGB'); shot = shot.resize((1400, int(shot.height * 1400 / shot.width)), Image.LANCZOS)
shot = shot.crop((0, 0, 1400, 760))
pw = 940; ph = int(760 * pw / 1400); shot = shot.resize((pw, ph), Image.LANCZOS)
sx, sy = (IW - pw) // 2, 500
sh = Image.new('RGBA', (IW, IH), (0, 0, 0, 0)); ImageDraw.Draw(sh).rectangle([sx + 6, sy + 22, sx + pw - 6, sy + ph + 22], fill=(35, 38, 43, 110))
sh = sh.filter(ImageFilter.GaussianBlur(22)); im.paste(sh, (0, 0), sh)
mask = Image.new('L', (pw, ph), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, ph], 18, fill=255)
im.paste(shot, (sx, sy), mask)
mark = Image.open('meridian-mark.png').convert('RGBA'); mark.thumbnail((56, 56), Image.LANCZOS)
im.paste(mark, (80, IH - 120), mark); d.text((150, IH - 116), 'MERIDIAN', font=B(30), fill=INK); d.text((150, IH - 80), 'meridianinterface.com', font=R(26), fill=SOFT)
im.save('tech-stack-promo.png'); print('assets + tech-stack-promo.png')
