"""Track the clip's anchor dots (the lights where threads meet the big pane and the tablet
pane) in the image, frame by frame. Each starts from a frame where it is clearly lit, is
carried along by its pane's motion, and snaps to the brightest compact light nearby.
Writes dots.json: {pane: {frame: [[x, y, strength], ...]}}.   python dots.py <hf dir>"""
import cv2, numpy as np, json, sys
D = sys.argv[1]; S0, S1 = 1, 190
TR = json.load(open(f'{D}/track2.json')); F = json.load(open(f'{D}/faces.json'))
def V(i): return cv2.GaussianBlur(cv2.cvtColor(cv2.imread(f'{D}/full/{i:03d}.png'), cv2.COLOR_BGR2HSV)[..., 2].astype(np.float32), (0, 0), 2)
def to_img(k, i, pts):
    w, h = F[k]['w'], F[k]['h']
    H = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(TR[k][str(i)]['q']))
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)
START = {'C': (159, [(961, 210), (705, 496), (410, 648)]), 'A': (60, [(251, 198), (190, 643), (219, 899)])}
out = {}
for k, (r, face_pts) in START.items():
    res = {i: [None] * len(face_pts) for i in range(S0, S1 + 1)}
    v = V(r); p0 = to_img(k, r, face_pts)
    for d, (x, y) in enumerate(p0):                     # settle on the actual light at the start frame
        x0, y0 = int(x) - 25, int(y) - 25; sub = v[y0:y0 + 50, x0:x0 + 50]; yy, xx = np.unravel_index(np.argmax(sub), sub.shape)
        res[r][d] = [float(x0 + xx), float(y0 + yy), float(sub.max())]
    for step in (1, -1):
        prev = r; i = r + step
        while S0 <= i <= S1:
            v = V(i)
            qa, qb = np.float32(TR[k][str(prev)]['q']), np.float32(TR[k][str(i)]['q'])
            Hm = cv2.getPerspectiveTransform(qa, qb)          # how the pane moved between the two frames
            for d in range(len(face_pts)):
                p = res[prev][d]
                if p is None: continue
                x, y = cv2.perspectiveTransform(np.float32([[p[:2]]]), Hm).ravel()
                R = 12; x0, y0 = int(round(x)) - R, int(round(y)) - R
                if x0 < 0 or y0 < 0 or x0 + 2 * R >= 1920 or y0 + 2 * R >= 1080: res[i][d] = [float(x), float(y), 0.0]; continue
                sub = v[y0:y0 + 2 * R, x0:x0 + 2 * R]; yy, xx = np.unravel_index(np.argmax(sub), sub.shape)
                if sub.max() > 170: res[i][d] = [float(x0 + xx), float(y0 + yy), float(sub.max())]
                else: res[i][d] = [float(x), float(y), float(sub.max())]   # dim or hidden: carried by the pane
            prev = i; i += step
    out[k] = {str(i): res[i] for i in res}
    strong = sum(1 for i in res for p in res[i] if p and p[2] > 170)
    print(k, f'{strong}/{len(face_pts) * len(res)} dot positions locked on a light')
json.dump(out, open(f'{D}/dots.json', 'w'))
