#!/usr/bin/env python3
"""Recolor a card background into a palette, and record its top colour.

    python3 recolor.py <background-name> <palette>      e.g. recolor.py houston-skyline gold
    python3 recolor.py --tops                           refresh tops.json for every file

Only the blue parts of the picture move (circular hue blend, so no banding where
the hue wraps through red); warm window lights and the like stay as they are.
The lime light lines take the palette's accent hue. Needs numpy + opencv-python.
"""
import sys, json, pathlib
import numpy as np, cv2
D = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'backgrounds'
P = {  # OpenCV hue 0-180; h=None keeps hue, 'grad' = indigo->magenta->orange top to bottom
    'purple': dict(h=138, s=1.0, v=0.95, ah=150), 'teal': dict(h=88, s=0.95, v=0.9, ah=22),
    'gold': dict(h=None, s=0.08, v='curve', ah=20), 'red': dict(h=176, s=0.95, v=0.85, ah=20),
    'sunset': dict(h='grad', s=1.0, v=1.0, ah=20),
}
def cmix(a, t, w):
    A = a * np.pi / 90; T = t * np.pi / 90
    return np.mod(np.arctan2((1 - w) * np.sin(A) + w * np.sin(T), (1 - w) * np.cos(A) + w * np.cos(T)) * 90 / np.pi, 180)
def recolor(img, name):
    p = P[name]; hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32); H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    lime = cv2.GaussianBlur(np.clip(1 - np.abs(H - 55) / 27, 0, 1) * np.clip((S - 30) / 70, 0, 1), (0, 0), 1.0)
    blue = np.clip(1 - np.abs(H - 112) / 30, 0, 1) * np.clip(S / 50, 0, 1) * (1 - lime)
    out = hsv.copy()
    if p['h'] == 'grad':
        rows = np.linspace(0, 1, H.shape[0])[:, None]
        out[..., 0] = cmix(H, np.broadcast_to(np.mod(130 + 60 * np.clip((rows - .15) / .7, 0, 1), 180), H.shape), blue)
    elif p['h'] is not None: out[..., 0] = cmix(H, np.full_like(H, p['h']), blue)
    out[..., 1] = S * (1 - blue) + S * p['s'] * blue
    out[..., 2] = V * (1 - blue) + (255 * (V / 255) ** 2.6 if p['v'] == 'curve' else V * p['v']) * blue
    out[..., 0] = cmix(out[..., 0], np.full_like(H, p['ah']), lime); out[..., 1] = np.maximum(out[..., 1], lime * 210)
    res = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    if name == 'gold': res = cv2.addWeighted(res, 1.0, np.full_like(res, (8, 10, 14)), 1.0, 0)
    return res
def tops():
    t = {}
    for f in sorted(D.glob('*.jpg')):
        b, g, r = cv2.imread(str(f))[:6].reshape(-1, 3).mean(0).astype(int); t[f.stem] = '#%02x%02x%02x' % (r, g, b)
    (D / 'tops.json').write_text(json.dumps(t, indent=1)); return t
if __name__ == '__main__':
    if sys.argv[1:] == ['--tops']: print(tops()); sys.exit()
    bg, pal = sys.argv[1], sys.argv[2]
    cv2.imwrite(str(D / f'{bg}-{pal}.jpg'), recolor(cv2.imread(str(D / f'{bg}.jpg')), pal), [cv2.IMWRITE_JPEG_QUALITY, 86])
    tops(); print('wrote', f'{bg}-{pal}.jpg')
