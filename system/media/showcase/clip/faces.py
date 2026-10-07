"""Find each pane's true width/height: the focal length that keeps the ratio steady
while the camera turns. Writes faces.json for composite.py."""
import cv2, numpy as np, json, sys
D = sys.argv[1]
GOOD = {'A': (1, 129), 'B': (1, 193), 'C': (25, 193)}
tr = {k: {int(i): np.array(v['q']) for i, v in t.items() if GOOD[k][0] <= int(i) <= GOOD[k][1]} for k, t in json.load(open(f'{D}/track2.json')).items()}
C0 = np.array([960, 540.])
def ratio(q, f):
    K = np.array([[f, 0, C0[0]], [0, f, C0[1]], [0, 0, 1]])
    H = cv2.getPerspectiveTransform(np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]), q.astype(np.float32)).astype(np.float64)
    B = np.linalg.inv(K) @ H
    return np.linalg.norm(B[:, 0]) / np.linalg.norm(B[:, 1])
best = None
for f in np.geomspace(800, 12000, 120):
    rs = {k: [ratio(q, f) for i, q in t.items() if i % 4 == 0 and (q[:, 0].max() < 1915)] for k, t in tr.items()}
    spread = sum(np.std(np.log(v)) for v in rs.values())
    if best is None or spread < best[0]: best = (spread, f, {k: float(np.median(v)) for k, v in rs.items()})
print(best)
f, R = best[1], best[2]
H0 = {'A': 1000, 'B': 1400, 'C': 900}       # working height of each face in pixels
out = {k: {'w': round(H0[k] * R[k]), 'h': H0[k], 'r': 0.0} for k in R}
out['_f'] = f
json.dump(out, open(f'{D}/faces.json', 'w'), indent=1); print(out)
