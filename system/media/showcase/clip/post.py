"""Clean the raw track: keep the frames where alignment held, extend each pane smoothly
past them, and steady the corners. Writes track2.json (corners + how much of each screen shows)."""
import numpy as np, json, sys
D = sys.argv[1]; N = 193
raw = {k: {int(i): np.array(v) for i, v in t.items()} for k, t in json.load(open(f'{D}/track.json')).items()}
GOOD = {'A': (1, 129), 'B': (1, 193), 'C': (25, 193)}
def series(k):
    a, b = GOOD[k]; f = np.arange(a, b + 1); X = np.array([raw[k][i].ravel() for i in f]); return f, X
def extend(f, X, at, fitwin):
    sel = (f >= fitwin[0]) & (f <= fitwin[1])
    out = []
    for c in range(8):
        p = np.polyfit(f[sel], X[sel, c], 2); out.append(np.polyval(p, at))
    return np.array(out).T
def smooth(X, w=7):
    # local quadratic fit over a sliding window (Savitzky-Golay), ends handled by shrinking
    n = len(X); Y = X.copy()
    for i in range(n):
        lo, hi = max(0, i - w // 2), min(n, i + w // 2 + 1)
        t = np.arange(lo, hi) - i
        for c in range(X.shape[1]):
            Y[i, c] = np.polyval(np.polyfit(t, X[lo:hi, c], min(2, hi - lo - 1)), 0)
    return Y
res = {}
for k in 'ABC':
    f, X = series(k); X = smooth(X)
    allf = np.arange(1, N + 1); full = np.zeros((N, 8))
    full[f - 1] = X
    if k == 'C':
        pre = np.arange(1, f[0]); full[pre - 1] = extend(f, X, pre, (f[0], f[0] + 40))
    if k == 'A':
        post = np.arange(f[-1] + 1, N + 1); full[post - 1] = extend(f, X, post, (f[-1] - 25, f[-1]))
    q = full.reshape(N, 4, 2)
    # how much of the screen shows: fades as the face turns edge-on (narrower than ~3% of its height)
    wpx = np.minimum(np.linalg.norm(q[:, 1] - q[:, 0], axis=1), np.linalg.norm(q[:, 2] - q[:, 3], axis=1))
    hpx = np.linalg.norm(q[:, 3] - q[:, 0], axis=1)
    vis = np.clip((wpx / hpx - 0.03) / 0.05, 0, 1)
    if k == 'A': vis[GOOD['A'][1]:] = np.minimum(vis[GOOD['A'][1]:], np.clip(1 - (np.arange(GOOD['A'][1], N) - GOOD['A'][1]) / 6, 0, 1))
    res[k] = {str(i): {'q': q[i - 1].tolist(), 'v': float(vis[i - 1])} for i in allf}
    print(k, 'width/height at 1, 60, 120, 130, 193:', [round(float(wpx[i] / hpx[i]), 3) for i in (0, 59, 119, 129, 192)])
json.dump(res, open(f'{D}/track2.json', 'w'))
