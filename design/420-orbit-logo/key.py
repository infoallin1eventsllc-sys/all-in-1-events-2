import numpy as np, sys, glob, os
from PIL import Image
from scipy import ndimage as ndi
def bg_model(img, mask, sigma=45):
    out = np.empty_like(img)
    w = ndi.gaussian_filter(mask.astype(np.float32), sigma) + 1e-6
    for c in range(3): out[..., c] = ndi.gaussian_filter(img[..., c]*mask, sigma)/w
    return out
def key(path, out):
    img = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    H, W, _ = img.shape
    mask = np.zeros((H, W), bool); r = 28
    mask[:r] = mask[-r:] = True; mask[:, :r] = mask[:, -r:] = True
    for T in (38, 26, 18, 14):
        bg = bg_model(img, mask)
        diff = np.abs(img - bg).max(-1)
        fg = diff > T
        mask = ~ndi.binary_dilation(fg, iterations=6)
        if mask.sum() < 2000: mask[:r] = True
    bg = bg_model(img, mask); diff = np.abs(img - bg).max(-1)
    fg = diff > 12
    fg = ndi.binary_closing(fg, structure=np.ones((3, 3)), iterations=4)
    fg = ndi.binary_fill_holes(fg)
    fg = ndi.binary_opening(fg, iterations=2)
    fg = ndi.median_filter(fg.astype(np.uint8), size=7).astype(bool)
    lab, n = ndi.label(fg)
    if n > 1:
        sizes = ndi.sum(fg, lab, range(1, n+1)); fg = lab == (1 + int(np.argmax(sizes)))
    fg = ndi.binary_fill_holes(fg)
    core = ndi.binary_erosion(fg, iterations=3)
    outer = ndi.binary_dilation(fg, iterations=3)
    soft = np.clip((diff - 6)/26.0, 0, 1)
    alpha = np.where(core, 1.0, np.where(outer, np.maximum(soft, ndi.gaussian_filter(fg.astype(np.float32), 1.2)*0.0), 0.0))
    alpha = np.minimum(alpha, ndi.gaussian_filter(outer.astype(np.float32), 1.0)*1.0 + core)
    alpha = np.clip(ndi.gaussian_filter(alpha.astype(np.float32), 0.6), 0, 1)
    a = np.maximum(alpha, 1e-3)[..., None]
    col = np.clip((img - (1 - a)*bg)/a, 0, 255)
    col = np.where(alpha[..., None] > 0.02, col, img)
    rgba = np.dstack([col, alpha*255]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(out)
    ys, xs = np.nonzero(alpha > 0.5)
    return (xs.min(), xs.max(), ys.min(), ys.max(), int(fg.sum())) if len(xs) else None
if __name__ == '__main__':
    for f in sys.argv[1:]:
        print(os.path.basename(f), key(f, 'cut/' + os.path.basename(f)))
