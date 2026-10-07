"""Lock each pane's face to its own aluminium rim, frame by frame.

For every frame, start from a predicted quad (last frame's quad moved by the previous
step's motion), then for each of the four sides sample the middle of the side, search
outward along the normal for the rim's inner edge (the strongest brightening step from
glass to aluminium), robustly fit a line through those points and intersect the four
lines. A side with too little support (off screen, occluded, edge-on) keeps its
predicted line. Nothing accumulates, so there is no drift and no sawtooth.

  python rimlock.py <hf dir> <in track> <out track>
"""
import cv2, numpy as np, json, sys
D, TIN, TOUT = sys.argv[1:4]
N = 193
tr = json.load(open(TIN))

def gray(i):
    g = cv2.cvtColor(cv2.imread(f'{D}/full/{i:03d}.png'), cv2.COLOR_BGR2GRAY).astype(np.float32)
    return cv2.GaussianBlur(g, (0, 0), 0.8)

def side_points(g, a, b, inward, search=14, n=60):
    """Points on the rim's inner edge along side a->b. inward = unit normal pointing into the face."""
    pts, wts = [], []
    L = np.linalg.norm(b - a)
    for s in np.linspace(0.15, 0.85, n):
        p = a + (b - a) * s
        ts = np.arange(-search, search + 0.5, 0.5)            # negative = into the face, positive = outward
        xy = p[None, :] - inward[None, :] * ts[:, None]
        if (xy[:, 0] < 1).any() or (xy[:, 0] > 1918).any() or (xy[:, 1] < 1).any() or (xy[:, 1] > 1078).any():
            continue
        prof = cv2.remap(g, xy[:, 0:1].astype(np.float32), xy[:, 1:2].astype(np.float32), cv2.INTER_LINEAR).ravel()
        grad = np.gradient(prof)                               # brightening going outward
        k = int(np.argmax(grad))
        if grad[k] < 6 or prof[min(k + 4, len(prof) - 1)] < 70:   # weak step or not reaching rim brightness
            continue
        # sub-sample peak
        if 0 < k < len(grad) - 1:
            y0, y1, y2 = grad[k - 1], grad[k], grad[k + 1]; den = y0 - 2 * y1 + y2
            off = 0.5 * (y0 - y2) / den if abs(den) > 1e-6 else 0
        else:
            off = 0
        t = ts[k] + off * 0.5
        pts.append(p - inward * t); wts.append(grad[k])
    return np.array(pts), np.array(wts)

def fit_line(pts):
    """RANSAC then least squares; returns (point, direction) or None."""
    if len(pts) < 12: return None
    best = None
    rng = np.random.default_rng(0)
    for _ in range(80):
        i, j = rng.choice(len(pts), 2, replace=False)
        d = pts[j] - pts[i]; nd = np.linalg.norm(d)
        if nd < 5: continue
        d /= nd; nrm = np.array([-d[1], d[0]])
        r = np.abs((pts - pts[i]) @ nrm); inl = r < 0.9
        if best is None or inl.sum() > best.sum(): best = inl
    if best is None or best.sum() < max(12, 0.45 * len(pts)): return None
    P = pts[best]; c = P.mean(0); u, s, vt = np.linalg.svd(P - c)
    return c, vt[0]

def intersect(l1, l2):
    (p1, d1), (p2, d2) = l1, l2
    A = np.array([d1, -d2]).T
    if abs(np.linalg.det(A)) < 1e-6: return None
    t = np.linalg.solve(A, p2 - p1); return p1 + t[0] * d1

def refine(g, q):
    c = q.mean(0); lines, ok = [], []
    for s in range(4):
        a, b = q[s], q[(s + 1) % 4]
        d = (b - a) / np.linalg.norm(b - a); nrm = np.array([-d[1], d[0]])
        if np.dot(c - (a + b) / 2, nrm) < 0: nrm = -nrm         # point into the face
        pts, w = side_points(g, a, b, nrm)
        ln = fit_line(pts) if len(pts) else None
        if ln is None: ln = ((a + b) / 2, d); ok.append(False)
        else: ok.append(True)
        lines.append(ln)
    out = []
    for s in range(4):
        p = intersect(lines[(s - 1) % 4], lines[s]); out.append(q[s] if p is None else p)
    return np.array(out), ok

RANGE = {'A': (1, 125), 'B': (1, 193), 'C': (1, 193)}
REF = {'A': 60, 'B': 60, 'C': 193}
out = {k: dict(tr[k]) for k in tr}
stats = {}
for k in 'ABC':
    a, b = RANGE[k]; r = REF[k]
    g = gray(r); q0 = np.array(tr[k][str(r)]['q'], float)
    for _ in range(3): q0, ok = refine(g, q0)                 # settle the reference on its rim
    res = {r: q0}; sides = {r: ok}
    for step in (1, -1):
        prev, prevprev = r, None; i = r + step
        while a <= i <= b:
            # prediction: the raw track's motion from the previous frame, applied to the locked quad
            raw_prev = np.array(tr[k][str(prev)]['q'], float); raw_i = np.array(tr[k][str(i)]['q'], float)
            H = cv2.getPerspectiveTransform(raw_prev.astype(np.float32), raw_i.astype(np.float32))
            pred = cv2.perspectiveTransform(res[prev].reshape(-1, 1, 2), H).reshape(-1, 2)
            qi, ok = refine(gray(i), pred); qi, ok2 = refine(gray(i), qi) if sum(ok) >= 2 else (qi, ok)
            res[i] = qi; sides[i] = ok2
            prev = i; i += step
    locked = sum(sum(v) for v in sides.values()); total = 4 * len(sides)
    stats[k] = f'{locked}/{total} sides locked to the rim'
    for i, qv in res.items(): out[k][str(i)] = {'q': qv.tolist(), 'v': tr[k][str(i)]['v'], 'sides': [bool(x) for x in sides[i]]}
json.dump(out, open(TOUT, 'w')); print(stats)
