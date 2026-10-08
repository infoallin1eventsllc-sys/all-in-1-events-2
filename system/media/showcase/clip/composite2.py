"""The homepage hero: Otis's Higgsfield clip with real, scrolling screens in its glass.

  python composite2.py <hf dir> <shots dir> <out dir> [output frame numbers...]

Nothing in the clip is redrawn. Every pixel outside the three glass faces is the
clip's own (between source frames, optical flow blends its two neighbours), and the
clip's threads and pulses are laid back over the screens.

Timeline (T output frames, 24 fps, loops seamlessly):
  camera   source frames 1..190 forward then back, easing to a stop at each end
           instead of bouncing (cosine ramps of RAMP frames, full speed between),
           at an even speed: the two frames the generated clip drops are blended back
  phone    six products, one after another, each scrolling gently and dissolving
           into the next
  tablet   four dashboards, the same way, timed into the part of the loop where
           that pane faces the camera
  website  the homepage, scrolling slowly down and back once per loop
"""
import cv2, numpy as np, json, sys, os
D, SHOTS, OUT = sys.argv[1:4]
ONLY = {int(x) for x in sys.argv[4:]}
F = json.load(open(f'{D}/faces.json'))
TR = json.load(open(f'{D}/track2.json'))
SS = 2                                     # screens are drawn supersampled, then area-averaged

# ---- timeline -------------------------------------------------------------------
S0, S1, RAMP = 1, 190, 48                  # 2 s to glide to a stop and away again                  # 191-193 stutter in the source; left out
# The generated clip drops a frame in two places: the camera moves two frames' worth
# between these source frames (measured with optical flow against its steady speed).
# Each source frame gets its true moment, and the missing frame is blended back in.
SKIP = {68: 2, 128: 2}
TT = {S0: 0.0}
for i in range(S0, S1): TT[i + 1] = TT[i] + SKIP.get(i, 1)
L = TT[S1]; HALF = L + RAMP; T = int(2 * HALF)   # 478 frames = 19.9 s
START = int(round(TT[149] + RAMP / 2))           # output frame 0 = source frame 149: the poster
def dist(u):
    """True frames travelled after u output frames of one half (speed eases 0 -> 1 -> 0)."""
    R = RAMP
    if u <= R: return u / 2 - R / (2 * np.pi) * np.sin(np.pi * u / R)
    if u <= HALF - R: return R / 2 + (u - R)
    return L - dist(HALF - u)
def source_pos(n):
    c = (n + START) % T
    tau = dist(c) if c <= HALF else dist(T - c)
    for a in range(S0, S1):
        if TT[a] <= tau < TT[a + 1]: return a + (tau - TT[a]) / (TT[a + 1] - TT[a])
    return float(S1)

# ---- frames of the clip, including in-between ones -------------------------------
_frames, _flows = {}, {}
def frame(i):
    if i not in _frames:
        if len(_frames) > 8: _frames.pop(next(iter(_frames)))
        _frames[i] = cv2.imread(f'{D}/full/{i:03d}.png').astype(np.float32)
    return _frames[i]
DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
def flow(a):
    if a not in _flows:
        if len(_flows) > 4: _flows.pop(next(iter(_flows)))
        g0 = cv2.cvtColor(frame(a).astype(np.uint8), cv2.COLOR_BGR2GRAY); g1 = cv2.cvtColor(frame(a + 1).astype(np.uint8), cv2.COLOR_BGR2GRAY)
        _flows[a] = DIS.calc(g0, g1, None)
    return _flows[a]
YY, XX = np.mgrid[0:1080, 0:1920].astype(np.float32)
def clip_at(s):
    a = int(np.floor(s)); t = s - a
    if t < 1e-3 or a >= S1: return frame(min(a, S1))
    f = flow(a); t = np.float32(t)
    ia = cv2.remap(frame(a), XX - t * f[..., 0], YY - t * f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    ib = cv2.remap(frame(a + 1), XX + (1 - t) * f[..., 0], YY + (1 - t) * f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return ia * (1 - t) + ib * t
def quad_at(k, s):
    a = int(np.floor(s)); t = s - a; b = min(a + 1, S1)
    qa, qb = np.array(TR[k][str(a)]['q']), np.array(TR[k][str(b)]['q'])
    va, vb = TR[k][str(a)]['v'], TR[k][str(b)]['v']
    return (qa * (1 - t) + qb * t).astype(np.float32), va * (1 - t) + vb * t

# ---- screens ----------------------------------------------------------------------
SZ = {k: (F[k]['w'], F[k]['h']) for k in 'ABC'}
def load_page(name, w):
    """The page scaled to the face width, and its pinned layer split into a top part and
    a bottom part (so bars stay at the top and bottom of a face taller than the viewport)."""
    page = cv2.imread(f'{SHOTS}/{name}.png')
    sc = w * SS / page.shape[1]
    page = cv2.resize(page, (w * SS, int(round(page.shape[0] * sc))), interpolation=cv2.INTER_AREA)
    page = cv2.addWeighted(page, 1.35, cv2.GaussianBlur(page, (0, 0), 1.2), -0.35, 0)   # keeps small text crisp once shrunk
    pin = None
    if os.path.exists(f'{SHOTS}/{name}-pin.png'):
        p = cv2.imread(f'{SHOTS}/{name}-pin.png', cv2.IMREAD_UNCHANGED)
        p = cv2.resize(p, (w * SS, int(round(p.shape[0] * sc))), interpolation=cv2.INTER_AREA)
        pin = p
    return page, pin
def view(page, pin, w, h, off):
    """What the face shows with the page scrolled by off (pixels at SS scale)."""
    H = h * SS; off = int(np.clip(off, 0, max(page.shape[0] - H, 0)))
    v = page[off:off + H].astype(np.float32)
    if v.shape[0] < H: v = np.vstack([v, np.repeat(v[-1:], H - v.shape[0], 0)])
    if pin is not None:
        ph = pin.shape[0]; half = ph // 2
        for part, y in ((pin[:half], 0), (pin[half:], H - (ph - half))):
            a = part[..., 3:4].astype(np.float32) / 255; y0 = max(y, 0); part = part[y0 - y:]; a = a[y0 - y:]
            hh = min(part.shape[0], H - y0)
            v[y0:y0 + hh] = v[y0:y0 + hh] * (1 - a[:hh]) + part[:hh, :, :3] * a[:hh]
    return v
def smooth(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

class Sequence:
    """Products one after another inside one face. Each scrolls gently (it never stops,
    and eases at its ends); at the end of its turn the next product rises up from below
    it, as one continuous scroll, over SLIDE frames. No two pages are ever overlaid.
    span = (start, length) of the part of the loop the sequence plays in; outside it
    the last product holds where it is."""
    SLIDE = 20
    GAP = 6                                         # a thin line of the scene's navy between pages
    def __init__(self, kind, names, face, span):
        self.w, self.h = SZ[face]; self.items = [load_page(f'{kind}-{n}', self.w) for n in names]
        self.start, self.length = span; self.slot = self.length / len(names)
    def look(self, j, x):
        page, pin = self.items[j % len(self.items)]
        rng = max(page.shape[0] - self.h * SS, 0); travel = min(rng, 1.15 * self.h * SS)
        tau = np.clip((x + self.SLIDE / 2) / (self.slot + self.SLIDE), 0, 1)
        pos = 0.55 * tau + 0.45 * (1 - np.cos(np.pi * tau)) / 2          # steady flow, soft ends
        return view(page, pin, self.w, self.h, travel * pos)
    def at(self, n):
        local = (n - self.start) % T
        if local >= self.length: local = self.length - 1e-3            # hidden part of the loop: hold
        j = int(local // self.slot); x = local - j * self.slot
        H = self.h * SS; g = self.GAP * SS
        if x > self.slot - self.SLIDE / 2 and j + 1 < len(self.items):   a, b, m = j, j + 1, (x - (self.slot - self.SLIDE / 2)) / self.SLIDE
        elif x < self.SLIDE / 2 and j > 0:                               a, b, m = j - 1, j, (x + self.SLIDE / 2) / self.SLIDE
        else: return self.look(j, x)
        m = smooth(m); xa = x + (self.slot if b == j else 0); xb = x - (self.slot if a == j else 0)
        stack = np.vstack([self.look(a, xa), np.tile(np.float32([32, 18, 11]), (g, self.w * SS, 1)), self.look(b, xb)])
        y = int(round(m * (H + g)))
        return stack[y:y + H]

# tablet pane (A): the part of the loop where it faces the camera
vis = np.array([quad_at('A', source_pos(n))[1] for n in range(T)])
hid = vis < 0.05
# longest cyclic run of visible frames
best, cur, s0 = (0, 0), 0, 0
for n in range(2 * T):
    if not hid[n % T]:
        if cur == 0: s0 = n
        cur += 1
        if cur > best[1]: best = (s0 % T, min(cur, T))
    else: cur = 0
A_SPAN = best
B_SPAN = (0, T)
PHONE = Sequence('phone', ['bigboy', 'fogcity', 'frameshop', 'modernstreet', 'carepulse', 'drone'], 'B', B_SPAN)
TABLET = Sequence('tablet', ['finsight', 'crm', 'analytics', 'planner'], 'A', A_SPAN)
SITE = load_page('site', SZ['C'][0])
def site_at(n):
    w, h = SZ['C']; page, pin = SITE
    rng = max(page.shape[0] - h * SS, 0)
    return view(page, pin, w, h, 0.9 * rng * (1 - np.cos(2 * np.pi * n / T)) / 2)

# ---- faces ------------------------------------------------------------------------
def rounded(w, h, rad, grow=0.0):
    g = int(round(grow * w)); W, H = w + 2 * g, h + 2 * g; r = int(rad + g)
    m = np.zeros((H * SS, W * SS), np.uint8); r *= SS
    cv2.rectangle(m, (r, 0), (W * SS - 1 - r, H * SS - 1), 255, -1); cv2.rectangle(m, (0, r), (W * SS - 1, H * SS - 1 - r), 255, -1)
    for cx, cy in [(r, r), (W * SS - 1 - r, r), (W * SS - 1 - r, H * SS - 1 - r), (r, H * SS - 1 - r)]: cv2.circle(m, (cx, cy), r, 255, -1, cv2.LINE_AA)
    return m, g
FACE = {k: rounded(*SZ[k], 0.8 * F[k]['r'] * SZ[k][0], 0.004) for k in 'ABC'}      # a hair past the rim's inner edge...
CORE = {k: rounded(*SZ[k], F[k]['r'] * SZ[k][0], -0.03) for k in 'ABC'}           # ...cut back by the rim's own pixels in this band
SIL = {k: rounded(*SZ[k], F[k]['r'] * SZ[k][0], F['_rim']) for k in 'ABC'}
DOTS = json.load(open(f'{D}/dots.json'))   # anchor dots, tracked in the image by dots.py
DOT_R = {'A': 12, 'C': 18}
_bg = {}
def printed_at(k, s):
    """What is printed on pane k's glass at source position s, face-on (SS scale). The print is the per-frame model from bgmodel.py (it follows the
    car's drift; threads and pulses drop out of it), widened a little so 1-2 px of track
    error cannot leave an edge."""
    a = int(np.floor(s)); t = s - a; b = min(a + 1, S1)
    def load(i):
        key = (k, i)
        if key not in _bg:
            if len(_bg) > 12: _bg.pop(next(iter(_bg)))
            im = cv2.imread(f'{D}/bg/{k}-{i:03d}.png')
            im = cv2.dilate(im, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
            size = (SZ[k][0] * SS, SZ[k][1] * SS)
            _bg[key] = cv2.resize(im, size).astype(np.float32)
        return _bg[key]
    return load(a) if t < 1e-3 else load(a) * (1 - t) + load(b) * t
def dots_at(s):
    """Soft discs on the tracked anchor dots of the tablet and big panes, in the frame."""
    a = int(np.floor(s)); t = s - a; b = min(a + 1, S1); m = np.zeros((1080, 1920), np.float32)
    for k, r in DOT_R.items():
        for pa, pb in zip(DOTS[k][str(a)], DOTS[k][str(b)]):
            if pa is None or pb is None or max(pa[2], pb[2]) <= 170: continue
            x, y = pa[0] * (1 - t) + pb[0] * t, pa[1] * (1 - t) + pb[1] * t
            cv2.circle(m, (int(round(x)), int(round(y))), r, 1.0, -1, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (0, 0), 3)
def warp(img, H, g=0):
    """Draw a face-space image (SS scale, optionally grown by g) into the frame."""
    Hs = np.diag([SS, SS, 1.0]) @ H @ np.array([[1, 0, -g], [0, 1, -g], [0, 0, 1]], float) @ np.diag([1 / SS, 1 / SS, 1.0])
    big = cv2.warpPerspective(img, Hs, (1920 * SS, 1080 * SS), flags=cv2.INTER_LINEAR)
    return cv2.resize(big, (1920, 1080), interpolation=cv2.INTER_AREA)

os.makedirs(OUT, exist_ok=True)
for n in range(T):
    if ONLY and n not in ONLY: continue
    s = source_pos(n); orig = clip_at(s)
    hsv = cv2.cvtColor(np.clip(orig, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
    rimpx = ((hsv[..., 2] > 105) & (hsv[..., 1] < 95)).astype(np.uint8)
    rim_soft = cv2.GaussianBlur(cv2.dilate(rimpx, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 0.7)
    pics = {'A': TABLET.at(n), 'B': PHONE.at(n), 'C': site_at(n)}
    if os.environ.get('DIAG') == 'white':             # diagnostic: plain white screens show anything left of the glass print
        pics = {k: np.full_like(v, 245) for k, v in pics.items()}
    face, sil = {}, {}
    for k in 'ABC':
        q, v = quad_at(k, s); w, h = SZ[k]
        H = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), q).astype(np.float64)
        fm, g = FACE[k]; cm, gc = CORE[k]
        m = warp(fm.astype(np.float32) / 255, H, g); core = warp(cm.astype(np.float32) / 255, H, gc)
        m = m * (1 - (1 - core) * rim_soft) * v          # outside the core, the rim's own pixels stay rim
        face[k] = [warp(pics[k], H), m, warp(printed_at(k, s), H)]
        sm, gs = SIL[k]; sil[k] = warp(sm.astype(np.float32) / 255, H, gs)
    for k in 'AB':                                       # a nearer pane stays in front: its face and its lit rim
        sil[k] = np.maximum(face[k][1] > 0.01, sil[k] * rim_soft).astype(np.float32)
    face['C'][1] = face['C'][1] * (1 - sil['B']) * (1 - sil['A']); face['B'][1] = face['B'][1] * (1 - sil['A'])
    out = orig.copy(); cov = np.zeros((1080, 1920), np.float32); printed = np.zeros_like(orig)
    for k in 'CBA':
        img, m, pr = face[k]; m3 = m[..., None]
        out = out * (1 - m3) + img * m3; cov = np.maximum(cov, m); printed = printed * (1 - m3) + pr * m3
    dots = dots_at(s)
    c3 = cov[..., None]
    # Over the screens, only light that moves across the glass comes back: the clip's
    # threads, their pulses and anchor dots, pixel for pixel in their own colour. It is
    # found as what is brighter than the pane's printed picture, so nothing printed on
    # the glass (the car) can show through.
    lum = orig.max(2); plum = printed.max(2)
    moving = np.clip((lum - plum - 12) / 45.0, 0, 1)                 # threads and pulses: brighter than the print
    light = np.clip((lum - 90) / 40.0, 0, 1)                         # and only real light, never the car's shading
    a = (np.maximum(moving, dots) * light)[..., None] * c3 * F['_lines']   # anchor dots are fixed: kept by position
    out = out * (1 - a) + orig * a
    cv2.imwrite(f'{OUT}/{n:03d}.png', np.clip(out, 0, 255).astype(np.uint8))
if not ONLY: print('frames', T, 'tablet span', A_SPAN)
