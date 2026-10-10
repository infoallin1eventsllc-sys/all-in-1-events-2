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
FRAMES = os.environ.get('FRAMES', 'clean')  # 'clean': the clip with its threads erased (clean.py); 'full': as generated

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
def phase(n):
    """How far the camera has travelled round the loop, in true source frames: 0..L on the
    way out, L..2L on the way back. Its speed is the camera's, so anything keyed to it
    slows, rests and resumes exactly with the camera."""
    c = (n + START) % T
    return dist(c) if c <= HALF else 2 * L - dist(T - c)
PERIOD = 2 * L
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
        _frames[i] = cv2.imread(f'{D}/{FRAMES}/{i:03d}.png').astype(np.float32)
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

# ---- a screen seated in its frame ---------------------------------------------------
_SEAT = {}
def seat(k, img):
    """Seat a page in its pane like a real display: a thin dark bezel inside the aluminium,
    the screen's edges falling off a touch into it, and a faint diagonal sheen of glass."""
    if k not in _SEAT:
        h, w = img.shape[:2]; short = min(w, h)
        bz = int(round(0.022 * short)); r = int(round(F[k]['r'] * w * 0.8))
        inner = np.zeros((h, w), np.uint8)
        cv2.rectangle(inner, (bz + r, bz), (w - 1 - bz - r, h - 1 - bz), 255, -1); cv2.rectangle(inner, (bz, bz + r), (w - 1 - bz, h - 1 - bz - r), 255, -1)
        for cx, cy in ((bz + r, bz + r), (w - 1 - bz - r, bz + r), (w - 1 - bz - r, h - 1 - bz - r), (bz + r, h - 1 - bz - r)):
            cv2.circle(inner, (cx, cy), r, 255, -1, cv2.LINE_AA)
        screen = cv2.GaussianBlur(inner.astype(np.float32) / 255, (0, 0), 0.8)[..., None]
        d = cv2.distanceTransform((inner > 127).astype(np.uint8), cv2.DIST_L2, 5)
        fall = (0.90 + 0.10 * np.clip(d / (0.06 * short), 0, 1))[..., None]          # edges 10% darker, over 6% of the width
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        sheen = np.clip(1 - (xx / w * 0.65 + yy / h * 0.35) / 0.55, 0, 1) ** 2 * 0.06 * 255   # top-left glass light
        _SEAT[k] = (screen, fall, sheen[..., None])
    screen, fall, sheen = _SEAT[k]
    bezel = np.float32([14, 9, 6])                                                    # near-black, a hint of the scene's navy
    return (img * fall + sheen) * screen + bezel * (1 - screen)

class Sequence:
    """Products one after another inside one face, all keyed to the camera's phase: each
    page scrolls as the camera moves (and rests when it rests); at the end of its turn
    the next product rises up from below it as one continuous scroll over SLIDE frames
    of camera travel. The turns are offset by half a slot, so the camera's two rests
    fall in the middle of a page, never on a change. span = (start, length) in phase."""
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
    def at(self, ph):
        local = (ph - self.start) % PERIOD
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

# tablet pane (A): the part of the loop where it faces the camera, in phase units
PH = np.array([phase(n) for n in range(T)])
vis = np.array([quad_at('A', source_pos(n))[1] for n in range(T)])
order = np.argsort(PH); ph_sorted, vis_sorted = PH[order], vis[order] >= 0.05
# longest cyclic run of visible phases
best, cur, s0 = (0, 0), 0, 0; n_ = len(ph_sorted)
for k in range(2 * n_):
    if vis_sorted[k % n_]:
        if cur == 0: s0 = k
        cur += 1
        if cur > best[1]: best = (s0 % n_, min(cur, n_))
    else: cur = 0
a0 = ph_sorted[best[0]]; a1 = ph_sorted[(best[0] + best[1] - 1) % n_]
A_SPAN = (float(a0), float((a1 - a0) % PERIOD))
B_SLOT = PERIOD / 6
B_SPAN = (B_SLOT / 2, PERIOD)                      # the camera rests at phase 0 and L: mid-page, never on a change
PHONE = Sequence('phone', ['bigboy', 'fogcity', 'frameshop', 'modernstreet', 'carepulse', 'drone'], 'B', B_SPAN)
TABLET = Sequence('tablet', ['finsight', 'crm', 'analytics', 'planner'], 'A', A_SPAN)
SITE = load_page('site', SZ['C'][0])
# The fourth pane, far right, coplanar with the big one (its edges stay fixed in the big
# pane's plane to 2 px over every frame it shows in). Measured by paneD.json: left edge
# and the top rim / bottom edge as straight lines in the source frame. It carries the
# Meridian lockup on the brand's ink, seated like the others. Only its left part is ever
# on screen, so the mark sits at the left of the face.
PD = json.load(open(f'{D}/paneD.json'))
LOGO = cv2.imread(f'{D}/logo-d.png')
def paneD(s):
    """Quad of the fourth pane's face in the frame at source position s, or None."""
    if s < PD['first'] - 8: return None
    top = np.polyval(PD['top'], s) + 10; bot = np.polyval(PD['bottom'], s) - 4          # inside its own rim
    hh = bot - top; ww = hh * PD['aspect']; x0 = PD['left']
    rect = np.float32([[x0, top], [x0 + ww, top], [x0 + ww, bot], [x0, bot]])
    qc, _ = quad_at('C', s); w, h = SZ['C']
    Hc = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), qc)
    return cv2.perspectiveTransform(rect.reshape(-1, 1, 2), Hc).reshape(-1, 2)
def site_at(ph):
    w, h = SZ['C']; page, pin = SITE
    rng = max(page.shape[0] - h * SS, 0)
    return view(page, pin, w, h, 0.9 * rng * (1 - np.cos(2 * np.pi * ph / PERIOD)) / 2)

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
            g = 17 if k == 'C' else 9          # the big pane's car needs the wider margin
            im = cv2.dilate(im, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g)))
            size = (SZ[k][0] * SS, SZ[k][1] * SS)
            _bg[key] = cv2.resize(im, size).astype(np.float32)
        return _bg[key]
    return load(a) if t < 1e-3 else load(a) * (1 - t) + load(b) * t
THREAD_FROM = {'A': +1, 'C': -1}     # the side each pane's threads arrive from: the tablet's leave to the right, the big pane's come from the left
def dots_at(s):
    """Soft discs on the tracked anchor dots of the tablet and big panes, and a mask that,
    within 100 px of each dot, allows only the dot and a 30-degree cone on the side its
    thread arrives from (the car's steering wheel touches the big pane's lower dot)."""
    a = int(np.floor(s)); t = s - a; b = min(a + 1, S1); m = np.zeros((1080, 1920), np.float32)
    allow = np.ones((1080, 1920), np.float32)
    for k, r in DOT_R.items():
        for pa, pb in zip(DOTS[k][str(a)], DOTS[k][str(b)]):
            if pa is None or pb is None or max(pa[2], pb[2]) <= 170: continue
            x, y = pa[0] * (1 - t) + pb[0] * t, pa[1] * (1 - t) + pb[1] * t
            cv2.circle(m, (int(round(x)), int(round(y))), r, 1.0, -1, cv2.LINE_AA)
            x0, y0, x1, y1 = int(max(x - 100, 0)), int(max(y - 100, 0)), int(min(x + 100, 1920)), int(min(y + 100, 1080))
            dx, dy = XX[y0:y1, x0:x1] - x, YY[y0:y1, x0:x1] - y
            near = dx * dx + dy * dy < 100 * 100
            cone = (dx * THREAD_FROM[k] > 0) & (np.abs(dy) < 0.58 * np.abs(dx))
            disc = dx * dx + dy * dy < (r + 4) ** 2
            allow[y0:y1, x0:x1] = np.where(near & ~(cone | disc), 0, allow[y0:y1, x0:x1])
    return cv2.GaussianBlur(m, (0, 0), 3), cv2.GaussianBlur(allow, (0, 0), 1.5)
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
    ph = phase(n)
    pics = {k: seat(k, v) for k, v in (('A', TABLET.at(ph)), ('B', PHONE.at(ph)), ('C', site_at(ph)))}
    qd = paneD(s)
    if qd is not None and qd[:, 0].min() < 1920:
        # the lockup at the fourth pane's size, seated, drawn before the three panes so they stay in front
        Lh, Lw = LOGO.shape[:2]; dw = int(round(np.linalg.norm(qd[1] - qd[0]))); dh = int(round(np.linalg.norm(qd[3] - qd[0])))
        if 'D' not in SZ: SZ['D'] = (dw, dh); F['D'] = {'r': 0.045}
        pic = cv2.resize(LOGO, (SZ['D'][0] * SS, SZ['D'][1] * SS), interpolation=cv2.INTER_AREA)
        pic = seat('D', pic.astype(np.float32))
        Hd = cv2.getPerspectiveTransform(np.float32([[0, 0], [SZ['D'][0], 0], [SZ['D'][0], SZ['D'][1]], [0, SZ['D'][1]]]), np.float32(qd)).astype(np.float64)
        if 'D' not in FACE:
            FACE['D'] = rounded(*SZ['D'], 0.8 * F['D']['r'] * SZ['D'][0], 0.004); CORE['D'] = rounded(*SZ['D'], F['D']['r'] * SZ['D'][0], -0.03)
        fm, g = FACE['D']; cm, gc = CORE['D']
        md = warp(fm.astype(np.float32) / 255, Hd, g); cd = warp(cm.astype(np.float32) / 255, Hd, gc)
        md = md * (1 - (1 - cd) * rim_soft)
        md3 = md[..., None]; orig = orig * (1 - md3) + warp(pic, Hd) * md3
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
    dots, allow = dots_at(s)
    c3 = cov[..., None]
    # Over the screens, only light that moves across the glass comes back: the clip's
    # threads, their pulses and anchor dots, pixel for pixel in their own colour. It is
    # found as what is brighter than the pane's printed picture, so nothing printed on
    # the glass (the car) can show through.
    lum = orig.max(2); plum = printed.max(2)
    moving = np.clip((lum - plum - 20) / 45.0, 0, 1)                 # threads and pulses: clearly brighter than the print
    light = np.clip((lum - 105) / 40.0, 0, 1)                        # and only real light, never the car's shading
    cand = np.maximum(moving, dots) * light
    # Threads are connected: each runs unbroken into an anchor dot, and a pulse is a very
    # bright compact light. Anything else that got this far (a fragment of the car's edge
    # left by a pixel of misregistration) touches neither, and is dropped.
    on = (cand > 0.15).astype(np.uint8)
    n_, lab, stt, _ = cv2.connectedComponentsWithStats(cv2.dilate(on, np.ones((3, 3), np.uint8)), connectivity=8)
    if n_ > 1:
        hits_dot = np.zeros(n_, bool); hits_dot[np.unique(lab[dots > 0.3])] = True
        peak = np.zeros(n_, np.float32); np.maximum.at(peak, lab.ravel(), lum.ravel())
        outside = np.zeros(n_, bool); outside[np.unique(lab[cov < 0.5])] = True   # threads come in from outside the glass
        keep = hits_dot | (peak > 215) | outside; keep[0] = False
        cand = cand * keep[lab]
    cand = cand * allow
    a = cand[..., None] * c3 * F['_lines']
    out = out * (1 - a) + orig * a
    cv2.imwrite(f'{OUT}/{n:03d}.png', np.clip(out, 0, 255).astype(np.uint8))
if not ONLY: print('frames', T, 'tablet span', A_SPAN)
