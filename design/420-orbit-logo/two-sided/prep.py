import numpy as np, cv2, json
from PIL import Image
from scipy import ndimage as ndi
rgb = np.asarray(Image.open('full150.png').convert('RGB')).astype(np.float32)
a = np.asarray(Image.open('../higgs-orbit/cut/0150.png'))[..., 3]
a = cv2.resize(a, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
mask = a > 128
mask = ndi.binary_erosion(mask, iterations=5)                      # drop the soft glow / dark fringe
mask = ndi.binary_opening(mask, iterations=3)
lab, n = ndi.label(mask); sizes = ndi.sum(mask, lab, range(1, n+1)); mask = lab == (1 + int(np.argmax(sizes)))
mask = ndi.binary_fill_holes(mask)
ys, xs = np.nonzero(mask); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
cx, cy = (x0 + x1)/2, (y0 + y1)/2
half = int(max(x1 - x0, y1 - y0)/2 + 40)                            # square canvas centred on the logo
def crop(arr, fill=0):
    out = np.full((2*half, 2*half) + arr.shape[2:], fill, arr.dtype)
    sx0, sy0 = int(round(cx)) - half, int(round(cy)) - half
    ax0, ay0 = max(0, sx0), max(0, sy0); ax1, ay1 = min(arr.shape[1], sx0 + 2*half), min(arr.shape[0], sy0 + 2*half)
    out[ay0 - sy0:ay1 - sy0, ax0 - sx0:ax1 - sx0] = arr[ay0:ay1, ax0:ax1]; return out
m = crop(mask); c = crop(rgb)
# bleed the logo's edge colours outward so texture filtering never samples the old background
idx = ndi.distance_transform_edt(~m, return_distances=False, return_indices=True)
c = c[idx[0], idx[1]]
Image.fromarray(c.astype(np.uint8)).resize((1536, 1536), Image.LANCZOS).save('face.jpg', quality=93)
def contour(mk, eps):
    cs, _ = cv2.findContours(mk.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cnt = max(cs, key=cv2.contourArea)
    cnt = cv2.approxPolyDP(cnt, eps, True)[:, 0, :].astype(np.float64)
    # to world units: canvas spans [-1,1] in both axes, y up
    return [[round((x - half)/half, 5), round(-(y - half)/half, 5)] for x, y in cnt]
S = contour(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.5) > 0.5, 0.5)
core = ndi.binary_dilation(m | m[:, ::-1], iterations=7)
core = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 6) > 0.5
C = contour(core, 0.6)
sym = (m ^ m[:, ::-1]).sum()/m.sum()
json.dump({'shape': S, 'core': C, 'logoH': (y1 - y0)/half, 'logoW': (x1 - x0)/half}, open('shape.json', 'w'))
print('points', len(S), len(C), 'canvas', 2*half, 'asymmetry', round(float(sym), 3))
Image.fromarray((np.dstack([c, m[..., None]*255])).astype(np.uint8)).resize((640, 640)).save('face-check.png')
