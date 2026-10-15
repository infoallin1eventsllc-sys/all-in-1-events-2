from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

P = lambda n: Image.open(f'product/{n}.png').convert('RGB')

def emblem():
    s = Image.open('/home/user/all-in-1-events-2/420-friendly/assets/brand/brand-3d-white.webp').convert('RGB')
    a = np.asarray(s).astype(np.float32)
    lab,_ = ndimage.label(a.mean(axis=2) > 150)
    b = set(lab[0,:])|set(lab[-1,:])|set(lab[:,0])|set(lab[:,-1]); b.discard(0)
    fg = ndimage.binary_erosion(~np.isin(lab, sorted(b)), iterations=3)
    am = Image.fromarray(fg.astype(np.uint8)*255,'L').filter(ImageFilter.GaussianBlur(0.8))
    e = s.copy(); e.putalpha(am)
    return e.crop(am.point(lambda v:255 if v>60 else 0).getbbox())
EM = emblem()

def ground(src, W, H, blur=48, dark=0.72):
    """Continuous backdrop derived from the shot's own background."""
    sw,sh = src.size; k = max(W/sw, H/sh)*1.35
    g = src.resize((int(sw*k), int(sh*k)), Image.LANCZOS)
    gx,gy = g.size
    g = g.crop(((gx-W)//2, (gy-H)//2, (gx-W)//2+W, (gy-H)//2+H))
    g = g.filter(ImageFilter.GaussianBlur(blur))
    return Image.fromarray((np.asarray(g).astype(np.float32)*dark).clip(0,255).astype(np.uint8))

def feathered(src, size, feather=46):
    s = src.resize(size, Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.4, 95, 3))
    m = Image.new('L', size, 0)
    m.paste(255, (feather, feather, size[0]-feather, size[1]-feather))
    s.putalpha(m.filter(ImageFilter.GaussianBlur(feather*0.55)))
    return s

def grade(im, amber=0.0, green=0.0, purple=0.0, teal=0.0, sat=1.0, lift=1.0):
    a = np.asarray(im).astype(np.float32)*lift
    lum = np.clip(a.mean(axis=2)/255.0, 0, 1)
    hi = lum**1.6; sh = (1.0-lum)**3.0
    r,g,b = a[...,0], a[...,1], a[...,2]
    r += amber*30*hi;  g += amber*13*hi;  b -= amber*22*hi
    g += green*16*sh;  b -= green*10*sh
    r += purple*16*sh; b += purple*30*sh
    g += teal*12*sh;   b += teal*20*sh
    a = np.clip(np.stack([r,g,b],2), 0, 255)
    m = a.mean(axis=2, keepdims=True)
    return Image.fromarray(np.clip(m + (a-m)*sat, 0, 255).astype(np.uint8))

def vignette(im, amt=0.55):
    W,H = im.size; yy,xx = np.mgrid[0:H,0:W]
    r = np.sqrt(((xx-W/2)/(W/2))**2 + ((yy-H/2)/(H/2))**2)
    a = np.asarray(im).astype(np.float32) * np.clip(1.06-amt*r, 0.18, 1.06)[...,None]
    return Image.fromarray(a.clip(0,255).astype(np.uint8))

def haze(im, strength=0.30, seed=5, tint=(150,110,220)):
    W,H = im.size
    n = np.random.default_rng(seed).normal(0,1,(H//8, W//8))
    n = ndimage.zoom(ndimage.gaussian_filter(n, 6), 8, order=1)[:H,:W]
    n = np.clip((n-n.min())/(n.max()-n.min()+1e-9), 0, 1)[...,None]
    a = np.asarray(im).astype(np.float32)
    return Image.fromarray(np.clip(a*(1-strength*n) + np.array(tint)*strength*n, 0, 255).astype(np.uint8))

def grain(im, amt, seed):
    a = np.asarray(im).astype(np.float32); H,W = a.shape[:2]
    return Image.fromarray(np.clip(a+np.random.default_rng(seed).normal(0,amt,(H,W,1)),0,255).astype(np.uint8))

def stamp(base, em, w, y, lift=1.0, glow=(0,230,57), gpx=26, ga=0.55):
    W,H = base.size; h = int(em.height*w/em.width)
    e = em.resize((w,h), Image.LANCZOS); x = (W-w)//2
    arr = np.asarray(e).astype(np.float32); rgb, al = np.clip(arr[...,:3]*lift,0,255), arr[...,3:]/255.0
    out = base.convert('RGBA')
    gl = Image.new('RGBA',(W,H),(0,0,0,0)); sil = Image.new('RGBA',(w,h), glow+(0,))
    sil.putalpha(Image.fromarray((al[...,0]*255*ga).astype(np.uint8),'L'))
    gl.paste(sil,(x,y),sil)
    out = Image.alpha_composite(out, gl.filter(ImageFilter.GaussianBlur(gpx)))
    bb = np.asarray(out.convert('RGB')).astype(np.float32)
    bb[y:y+h, x:x+w] = rgb*al + bb[y:y+h, x:x+w]*(1-al)
    return Image.fromarray(bb.clip(0,255).astype(np.uint8))
