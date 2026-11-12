"""Builds the clean logo ending from Otis's logo light-up.

The raw cut (meridian-logo-lightup-9x16.mp4) comes from the end of his Agent CRM ad: its first
six frames still carry the fading pool footage, the logo is already lighting up on frame one,
and its audio is the tail of that ad's soundtrack. Dropped into another video that reads as a
glitch. This script keeps his logo and its light exactly, and cleans everything around them:

  0.00-0.40  the navy alone (a clean plate: the logo painted out of the settled frame), so a
             wipe or fade has somewhere calm to land
  0.40-0.60  the logo fades in (plate -> frame 6, where the old footage is gone)
  0.60-1.33  his light-up, frames 7-28, laid over the plate through a soft mask
  1.33-1.93  settles to the fully faded logo (the reference ending's last frame)
  1.93-end   hold. No audio: each video scores its own ending.

  python build_clean_ending.py <work_dir> [seconds=5.4]   (needs numpy, opencv-python-headless)
Writes meridian-logo-ending-clean-9x16.mp4 and meridian-ending-plate-9x16.png next to this file.
"""
import subprocess, sys, os
import cv2, numpy as np

here = os.path.dirname(os.path.abspath(__file__))
work = sys.argv[1]; total = float(sys.argv[2]) if len(sys.argv) > 2 else 5.4
FPS = 30
os.makedirs(f"{work}/endframes", exist_ok=True)

cap = cv2.VideoCapture(f"{here}/meridian-logo-lightup-9x16.mp4"); fr = []
while True:
    ok, f = cap.read()
    if not ok: break
    fr.append(f.astype(np.float32))
hold = fr[-1]
ref = cv2.VideoCapture(f"{here}/reference-agent-crm-ending-9x16.mp4"); ref.set(cv2.CAP_PROP_POS_MSEC, 3500)
settled = ref.read()[1].astype(np.float32)

# clean plate: paint the logo out of the hold frame by running each column straight through
# the logo band (the ground only varies slowly down the frame), then soften the patch
Y0, Y1 = 380, 900
plate = hold.copy()
top = hold[Y0 - 24:Y0].mean(0); bot = hold[Y1:Y1 + 24].mean(0)
w = np.linspace(0, 1, Y1 - Y0)[:, None, None]
patch = cv2.GaussianBlur(top[None] * (1 - w) + bot[None] * w, (0, 0), 14)
ym = np.zeros((1920, 1), np.float32); ym[Y0:Y1] = 1
ym = cv2.GaussianBlur(np.repeat(ym, 1080, 1), (0, 0), 10)[..., None]
band = plate.copy(); band[Y0:Y1] = patch
plate = plate * (1 - ym) + band * ym
plate = cv2.GaussianBlur(plate, (0, 0), 3)          # also takes the video noise off the ground
cv2.imwrite(f"{here}/meridian-ending-plate-9x16.png", plate.clip(0, 255).astype(np.uint8))

# soft mask around the logo and its light: everything outside it is the plate, always
yy, xx = np.mgrid[0:1920, 0:1080].astype(np.float32)
r = np.sqrt(((xx - 540) / 500) ** 2 + ((yy - 640) / 360) ** 2)
mask = np.clip((1.0 - r) / 0.28, 0, 1); mask = (mask * mask * (3 - 2 * mask))[..., None]
over = lambda f: plate * (1 - mask) + f * mask
ease = lambda p: p * p * (3 - 2 * p)

K0, K1 = 6, 28
logo0, logo1, logoS = over(fr[K0]), over(fr[K1]), over(np.concatenate([settled[:920], hold[920:]]))
n = int(round(total * FPS))
for i in range(n):
    t = i / FPS
    if t < 0.40: f = plate
    elif t < 0.60: p = ease((t - 0.40) / 0.20); f = plate * (1 - p) + logo0 * p
    elif t < 0.60 + (K1 - K0) / FPS: f = over(fr[K0 + 1 + min(K1 - K0 - 1, int(round((t - 0.60) * FPS)))])
    elif t < 1.93: p = ease(min(1, (t - (0.60 + (K1 - K0) / FPS)) / 0.60)); f = logo1 * (1 - p) + logoS * p
    else: f = logoS
    cv2.imwrite(f"{work}/endframes/{i + 1:04d}.png", f.clip(0, 255).astype(np.uint8))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", f"{work}/endframes/%04d.png", "-c:v", "libx264",
                "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                f"{here}/meridian-logo-ending-clean-9x16.mp4"], check=True)
print("wrote meridian-logo-ending-clean-9x16.mp4", n, "frames")
