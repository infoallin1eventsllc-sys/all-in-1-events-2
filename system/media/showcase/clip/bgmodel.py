"""Per-frame model of what is printed on one pane's glass, seen face-on.

The car Higgsfield put on the big pane drifts against the glass over the clip, so a
single picture of it cannot be subtracted cleanly. For every source frame, take the
median of the face (rectified) over the frames around it: the car follows its drift,
while threads and pulses, which slide across the glass, drop out. Writes
bg/<pane>-<frame>.png.     python bgmodel.py <hf dir> <pane> [half window]
"""
import cv2, numpy as np, json, sys
D, K = sys.argv[1], sys.argv[2]; WIN = int(sys.argv[3]) if len(sys.argv) > 3 else 12
S0, S1 = 1, 190
TR = json.load(open(f'{D}/track2.json')); F = json.load(open(f'{D}/faces.json'))
w, h = F[K]['w'], F[K]['h']
rect, valid = {}, {}
for i in range(S0, S1 + 1):
    q = np.float32(TR[K][str(i)]['q'])
    H = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [w, 0], [w, h], [0, h]]))
    im = cv2.imread(f'{D}/full/{i:03d}.png')
    rect[i] = cv2.warpPerspective(im, H, (w, h), flags=cv2.INTER_LINEAR)
    valid[i] = cv2.warpPerspective(np.full(im.shape[:2], 255, np.uint8), H, (w, h)) > 250
for i in range(S0, S1 + 1):
    js = list(range(max(S0, i - WIN), min(S1, i + WIN) + 1, 2))
    st = np.stack([rect[j] for j in js]).astype(np.float32)
    ok = np.stack([valid[j] for j in js])[..., None]
    st[~np.broadcast_to(ok, st.shape)] = np.nan
    with np.errstate(all='ignore'):
        med = np.nanmedian(st, axis=0)
    med = np.where(np.isnan(med), rect[i], med)
    cv2.imwrite(f'{D}/bg/{K}-{i:03d}.png', med.astype(np.uint8))
print(K, 'done')
