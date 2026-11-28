#!/usr/bin/env bash
# On-screen text from a video: sample frames, OCR each, print what changes.
#
# Runs on Composio's cloud machine after tiktok_read.py saved /tmp/video.mp4
# (paste this file in with a heredoc; the box has no ffmpeg and no libGL, so
# ffmpeg comes from the imageio-ffmpeg wheel and OpenCV must be the headless
# build or the OCR import fails on libGL.so.1).
#
#   bash /tmp/frames_ocr.sh [/tmp/video.mp4] [fps]
#
# Frames land in /tmp/frames/f_NNN.png. To look at one from the main
# sandbox: shrink it to 200px wide JPEG (about 8 KB), base64 it, write that
# text into a scratchpad file, decode there, and Read the JPEG.
set -euo pipefail
VIDEO="${1:-/tmp/video.mp4}"
FPS="${2:-1.5}"

pip install -q imageio-ffmpeg rapidocr-onnxruntime pillow >/dev/null 2>&1 || true
pip uninstall -y -q opencv-python >/dev/null 2>&1 || true
pip install -q --force-reinstall --no-deps opencv-python-headless >/dev/null 2>&1 || true

FFMPEG="$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
rm -rf /tmp/frames && mkdir -p /tmp/frames
"$FFMPEG" -loglevel error -i "$VIDEO" -vf "fps=$FPS" /tmp/frames/f_%03d.png
echo "frames: $(ls /tmp/frames | wc -l) at $FPS/s"

FPS="$FPS" python3 - <<'EOF' 2>&1 | grep -v -i warn
import glob, os
from rapidocr_onnxruntime import RapidOCR
fps = float(os.environ["FPS"])
ocr = RapidOCR()
prev = None
for f in sorted(glob.glob("/tmp/frames/f_*.png")):
    res, _ = ocr(f)
    words = [r[1] for r in (res or []) if float(r[2]) > 0.6]
    line = " | ".join(words)
    if line != prev:
        n = int(f[-7:-4])
        print(f"{(n - 1) / fps:5.1f}s", line[:300])
    prev = line
EOF
