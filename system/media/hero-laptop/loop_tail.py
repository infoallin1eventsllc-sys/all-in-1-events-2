"""The 48 frames that close the loop: the last frame of the slowed film eases
back to the size and place of the first frame, cross-fading into it over the
back half, with both pictures held at the same apparent size so nothing ghosts.
Reads f0.png and fL.png (816x1080, first and last frame), writes tail/t###.png.
The numbers are measured from the film: the laptop is 656 px wide in the first
frame and 716 px in the last, centred at (408, 557.5) and (408, 559)."""
from PIL import Image
W, H = 816, 1080
f0 = Image.open('f0.png').convert('RGB'); fL = Image.open('fL.png').convert('RGB')
N = 48; R = 656 / 716
c0 = (408.0, 557.5); cL = (408.0, 559.0)
def ss(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)
def zoomed(im, z, src_c, dst_c):
    a = 1 / z
    return im.transform((W, H), Image.AFFINE, (a, 0, src_c[0] - dst_c[0] * a, 0, a, src_c[1] - dst_c[1] * a), resample=Image.BICUBIC)
for i in range(N):
    t = (i + 1) / N; e = ss(t)
    z = 1 - (1 - R) * e
    dst = (408.0, cL[1] + (c0[1] - cL[1]) * e)
    a = zoomed(fL, z, cL, dst)
    w = ss((t - 0.45) / 0.55)
    if w > 0:
        a = Image.blend(a, zoomed(f0, z / R, c0, dst), w)
    a.save('tail/t%03d.png' % i)
