from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np, imageio_ffmpeg, subprocess, os
from scipy import ndimage
exec(open('compositing.py').read())   # P, ground, feathered, grade, vignette, haze, grain, EM

FW, FH, FPS = 1280, 720, 24
OW, OH = int(FW*1.14), int(FH*1.14)          # oversized plate for the push-in
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
GREEN, GREY = (0,230,57), (200,200,200)

def cap(img, text, y=None, size=26, color=GREY, track=6):
    d = ImageDraw.Draw(img); f = ImageFont.truetype(FONT, size)
    letters = list(text); w = sum(d.textlength(c, font=f) for c in letters) + track*(len(letters)-1)
    x = (img.width - w)/2; yy = y if y is not None else OH - 86
    for c in letters:
        d.text((x, yy), c, font=f, fill=color); x += d.textlength(c, font=f) + track
    return img

def plate(bg_src, items, caption=None, ccolor=GREY):
    """items: list of (name, (w,h), (x,y))"""
    c = ground(P(bg_src), OW, OH, blur=54, dark=0.60).convert('RGBA')
    for n, size, pos in items:
        t = feathered(P(n), size, 40); c.paste(t, pos, t)
    return c.convert('RGB')

def emblem_plate(text_below=None):
    c = Image.new('RGB', (OW, OH), (9,10,11))
    g = ground(P('H11'), OW, OH, blur=70, dark=0.42); c.paste(g,(0,0))
    w = 520; h = int(EM.height*w/EM.width)
    return stamp(c, EM, w, (OH-h)//2 - 20, lift=1.12, gpx=40, ga=0.45)

def hero(name, scale=0.94):
    c = ground(P(name), OW, OH, blur=56, dark=0.58).convert('RGBA')
    s = int(OH*scale); t = feathered(P(name), (s,s), 48)
    c.paste(t, ((OW-s)//2, (OH-s)//2), t)
    return c.convert('RGB')

def snapback_hero():
    src = Image.open('/home/user/all-in-1-events-2/420-friendly/assets/products/haze-snapback.webp').convert('RGB')
    c = ground(src, OW, OH, blur=50, dark=0.62).convert('RGBA')
    s = int(OH*1.0)
    im = src.resize((s,s), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.4,95,3))
    m = Image.new('L',(s,s),0); ImageDraw.Draw(m).rectangle((44,44,s-44,s-44), fill=255)
    im.putalpha(m.filter(ImageFilter.GaussianBlur(26)))
    c.paste(im, ((OW-s)//2, (OH-s)//2), im)
    return c.convert('RGB')

# ---- the cut -------------------------------------------------------------
H2 = (OH*0.78); S = int(H2)
SHOTS = [
  (snapback_hero(), 2.6, None),
  (emblem_plate(), 2.4, "ARCHIVE V.24"),
  (plate('H10', [('H10',(S,S),(int(OW*0.06),int(OH*0.11))),
                 ('P10',(int(S*0.86),)*2,(int(OW*0.52),int(OH*0.17)))],
         ), 3.0, "HEATHER GREY SET"),
  (plate('H8',  [('P4',(int(S*0.86),)*2,(int(OW*0.07),int(OH*0.17))),
                 ('H8',(S,S),(int(OW*0.46),int(OH*0.11)))],
         ), 3.0, "CLEAN WHITE SET"),
  (plate('H5',  [('H5',(int(S*0.82),)*2,(int(OW*0.03),int(OH*0.14))),
                 ('P5',(int(S*0.70),)*2,(int(OW*0.33),int(OH*0.20))),
                 ('C3',(int(S*0.44),)*2,(int(OW*0.64),int(OH*0.10))),
                 ('C5',(int(S*0.44),)*2,(int(OW*0.64),int(OH*0.46)))],
         ), 3.5, "CRIMSON FAMILY"),
  (plate('H11', [('H11',(S,S),(int(OW*0.06),int(OH*0.11))),
                 ('P11',(int(S*0.86),)*2,(int(OW*0.52),int(OH*0.17)))],
         ), 3.0, "MIDNIGHT BLACK SET"),
  (hero('H7', 0.98), 3.4, "THE SIGNATURE"),
  (emblem_plate(), 2.6, None),
]
GRADES = [dict(amber=.9,green=.3), dict(purple=.5,teal=.4), dict(amber=.8,green=.5),
          dict(amber=.7,teal=.4), dict(amber=.9,teal=.5), dict(purple=.6,teal=.4),
          dict(amber=.6,green=.6), dict(purple=.5,teal=.4)]
SHOTS = [(grain(vignette(grade(im, sat=1.10, **g), 0.46), 2.6, i), d, t)
         for i,((im,d,t),g) in enumerate(zip(SHOTS, GRADES))]

def window(im, p):
    """push-in: crop from full oversize down to frame size as p goes 0->1"""
    z = 1.14 - 0.14*p
    w, h = int(FW*z), int(FH*z)
    x, y = (OW-w)//2, (OH-h)//2
    return im.crop((x, y, x+w, y+h)).resize((FW, FH), Image.LANCZOS)

XF = int(FPS*0.45)

def draw_caption(frame, text, alpha):
    if not text or alpha <= 0.01: return frame
    lay = Image.new('RGB', (FW, FH), (0,0,0))
    cap(lay, text, y=FH-64, size=23, color=GREY, track=7)
    a = np.asarray(lay).astype(np.float32)*alpha
    b = np.asarray(frame).astype(np.float32)
    return Image.fromarray(np.clip(b + a, 0, 255).astype(np.uint8))

def cap_alpha(k, n):
    lo_a, lo_b = 10, 22                 # fade in
    hi_b = n - XF; hi_a = hi_b - 10     # fully gone before the dissolve
    if k < lo_a: return 0.0
    if k < lo_b: return (k-lo_a)/(lo_b-lo_a)
    if k < hi_a: return 1.0
    if k < hi_b: return max(0.0, 1 - (k-hi_a)/(hi_b-hi_a))
    return 0.0
out = imageio_ffmpeg.write_frames('420-launch-preview.mp4', (FW,FH), fps=FPS,
                                 quality=7, macro_block_size=8)
out.send(None)
prev_tail = []
for idx,(im,dur,text) in enumerate(SHOTS):
    n = int(dur*FPS)
    frames = [draw_caption(window(im, k/max(n-1,1)), text, cap_alpha(k, n)) for k in range(n)]
    if prev_tail:
        for j in range(XF):
            a = prev_tail[j] if j < len(prev_tail) else prev_tail[-1]
            out.send(np.asarray(Image.blend(a, frames[j], (j+1)/XF)))
        frames = frames[XF:]
    for f in frames[:-XF] if idx < len(SHOTS)-1 else frames:
        out.send(np.asarray(f))
    prev_tail = frames[-XF:] if idx < len(SHOTS)-1 else []
out.close()
print("rendered", os.path.getsize('420-launch-preview.mp4'), "bytes")
