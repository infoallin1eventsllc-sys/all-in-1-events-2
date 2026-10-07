"""Track the three glass panes of the Higgsfield clip.
Writes track.json: for every frame, each pane's face corners (TL, TR, BR, BL) in pixels."""
import cv2, numpy as np, json, sys
D = sys.argv[1]                      # folder with full/NNN.png
N = 193
def frame(i): return cv2.imread(f'{D}/full/{i:03d}.png')

def rim_mask(im, v=110, s=90):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    return ((hsv[..., 2] > v) & (hsv[..., 1] < s)).astype(np.uint8) * 255

def line_corners(contour):
    """Fit a line to each of the four sides of a rounded quad contour and intersect them."""
    pts = contour.reshape(-1, 2).astype(np.float32)
    hull = cv2.convexHull(pts)
    peri = cv2.arcLength(hull, True)
    for eps in np.linspace(0.01, 0.1, 40):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4: break
    ap = ap.reshape(4, 2)
    # order TL, TR, BR, BL
    c = ap.mean(0); ang = np.arctan2(ap[:, 1] - c[1], ap[:, 0] - c[0]); ap = ap[np.argsort(ang)]
    # argsort by angle from -pi: TL(-135), TR(-45), BR(45), BL(135)
    lines = []
    for k in range(4):
        a, b = ap[k], ap[(k + 1) % 4]
        L = np.linalg.norm(b - a); d = (b - a) / L; n = np.array([-d[1], d[0]])
        rel = pts - a; t = rel @ d; dist = np.abs(rel @ n)
        sel = pts[(t > 0.2 * L) & (t < 0.8 * L) & (dist < max(8, 0.15 * L))]
        vx, vy, x0, y0 = cv2.fitLine(sel, cv2.DIST_HUBER, 0, .01, .01).ravel()
        # refit on the points that really lie on that side
        nn = np.array([-vy, vx]); r2 = np.abs((pts - [x0, y0]) @ nn); t2 = (pts - a) @ d
        sel = pts[(r2 < 2.5) & (t2 > 0.1 * L) & (t2 < 0.9 * L)]
        vx, vy, x0, y0 = cv2.fitLine(sel, cv2.DIST_HUBER, 0, .01, .01).ravel()
        lines.append((np.array([x0, y0]), np.array([vx, vy])))
    out = []
    for k in range(4):
        (p1, d1), (p2, d2) = lines[(k - 1) % 4], lines[k]
        A = np.array([d1, -d2]).T; t = np.linalg.solve(A, p2 - p1); out.append(p1 + t[0] * d1)
    return np.array(out, np.float32)

def detect(i):
    im = frame(i); m = cv2.morphologyEx(rim_mask(im), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, h = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    holes = sorted([c for k, c in enumerate(cs) if h[0][k][3] >= 0 and cv2.contourArea(c) > 5000], key=lambda c: cv2.boundingRect(c)[0])
    return [line_corners(c) for c in holes]

REF = {'A': 60, 'B': 60, 'C': 193}
a, b = detect(60)
corners = {'A': a, 'B': b,
           'C': np.array([[1203, 353], [1712, 160], [1715, 928], [1205, 805]], np.float32)}
print({k: v.round(1).tolist() for k, v in corners.items()})

def gray(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    return cv2.GaussianBlur(cv2.resize(g, (960, 540), interpolation=cv2.INTER_AREA), (0, 0), 1.2)
G = [None] + [gray(frame(i)) for i in range(1, N + 1)]
S = np.diag([0.5, 0.5, 1]).astype(np.float64); Si = np.linalg.inv(S)

def silhouette(quad_half, shape=(540, 960), grow=1.12):
    quad_half = np.asarray(quad_half, np.float64)
    c = quad_half.mean(0); q = (quad_half - c) * grow + c
    m = np.zeros(shape, np.uint8); cv2.fillConvexPoly(m, q.astype(np.int32), 255); return m

crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5)
def T(x, y): return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], np.float64)
def box(q, pad=30):
    x0, y0 = np.floor(q.min(0)) - pad; x1, y1 = np.ceil(q.max(0)) + pad
    x0, y0 = int(max(0, x0)), int(max(0, y0)); x1, y1 = int(min(960, x1)), int(min(540, y1))
    return x0, y0, x1, y1
def ecc_crop(gt, qt, gi, qi_guess, Hinit):
    """Align the pane at qt in image gt to image gi. Hinit maps gt coords to gi coords."""
    bt = box(qt); bi = box(qi_guess, 45)
    tpl = np.ascontiguousarray(gt[bt[1]:bt[3], bt[0]:bt[2]]); img = np.ascontiguousarray(gi[bi[1]:bi[3], bi[0]:bi[2]])
    m = silhouette(qi_guess - [bi[0], bi[1]], img.shape)   # OpenCV 5: the mask marks the target image
    W0 = np.linalg.inv(T(bi[0], bi[1])) @ Hinit @ T(bt[0], bt[1]); W0 /= W0[2, 2]
    try:
        cc, W = cv2.findTransformECC(tpl, img, W0.astype(np.float32), cv2.MOTION_HOMOGRAPHY, crit, m, 5)
    except cv2.error:
        return 0.0, Hinit
    H = T(bi[0], bi[1]) @ W.astype(np.float64) @ np.linalg.inv(T(bt[0], bt[1]))
    return cc, H / H[2, 2]
def P(H, q): return cv2.perspectiveTransform(q.reshape(-1, 1, 2).astype(np.float64), H).reshape(-1, 2)

track = {k: {} for k in corners}
for k, q in corners.items():
    r = REF[k]; track[k][r] = q.astype(np.float64)
    qref = P(S, corners[k])
    for step in (1, -1):
        Hcum = np.eye(3); prev = r; i = r + step; Hstep = np.eye(3)
        while 1 <= i <= N:
            qprev = P(S, track[k][prev])
            cc, W = ecc_crop(G[prev], qprev, G[i], P(Hstep, qprev), Hstep)
            Hstep = W; Hcum = W @ Hcum
            cc2 = 0
            if i % 3 == 0:   # pull back onto the reference so small errors cannot pile up
                cc2, W2 = ecc_crop(G[r], qref, G[i], P(Hcum, qref), Hcum)
                if cc2 > 0.85: Hcum = W2
            track[k][i] = P(Si, P(Hcum, qref))
            print(k, i, round(float(cc), 3), round(float(cc2), 3), flush=True)
            prev = i; i += step
json.dump({k: {str(i): v.tolist() for i, v in t.items()} for k, t in track.items()}, open(f'{D}/track.json', 'w'))
print('saved')
