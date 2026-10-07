"""What is printed on each pane's glass (the car, the app icons): the median of the
pane's own face over the clip, seen face-on. Whatever moves across the glass instead
(the threads, their pulses) is what the compositor keeps. Writes still-<pane>.png."""
import cv2, numpy as np, json, sys
D = sys.argv[1]; N = 193
TR = json.load(open(f'{D}/track2.json')); F = json.load(open(f'{D}/faces.json'))
for k in 'ABC':
    w, h = F[k]['w'], F[k]['h']; stack = []
    for i in range(1, N + 1, 3):
        t = TR[k][str(i)]
        if t['v'] < 0.5: continue
        H = cv2.getPerspectiveTransform(np.float32(t['q']), np.float32([[0, 0], [w, 0], [w, h], [0, h]]))
        im = cv2.imread(f'{D}/full/{i:03d}.png')
        r = cv2.warpPerspective(im, H, (w, h)).astype(np.float16)
        ok = cv2.warpPerspective(np.full(im.shape[:2], 255, np.uint8), H, (w, h)) > 250
        r[~ok] = np.nan; stack.append(r)
    med = np.nanmedian(np.stack(stack).astype(np.float32), axis=0)
    med = np.nan_to_num(med, nan=0)
    cv2.imwrite(f'{D}/still-{k}.png', med.astype(np.uint8)); print(k, len(stack), 'frames')
