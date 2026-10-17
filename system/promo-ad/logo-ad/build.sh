#!/usr/bin/env bash
# Builds the logo ad, wide (1920x1080) and story (1080x1920), from Otis's Higgsfield clip.
#   ./build.sh <clip.mp4> <work_dir> <python_with_cv2_numpy_scipy> [flat|3d]
# flat (default) uses the real mark, meridian-mark.png. 3d uses the 3D M cut from
# Otis's "custom studio" image (m3d/meridian-m-3d.png, made by m3d/cut.py) on the
# screen, the end card and the contact bar, with blue light.
# Needs ffmpeg, node with Playwright at /opt/node22, the website repo at
# /home/user/meridian-interface-website (fonts).
# Writes <work_dir>/meridian-logo-ad[-3d]-{wide,story}.mp4
set -euo pipefail
CLIP=$1; W=$2; PY=$3; STYLE=${4:-flat}
HERE=$(cd "$(dirname "$0")" && pwd)
if [ "$STYLE" = 3d ]; then MARK=$HERE/m3d/meridian-m-3d.png; NAME=meridian-logo-ad-3d
else MARK=$HERE/../../../.claude/skills/meridian-brand/assets/logo/meridian-mark.png; NAME=meridian-logo-ad; fi
mkdir -p "$W/frames" "$W/img"

# 1. the film: frames, screen tracking, the mark forming on the screen
ffmpeg -v error -y -i "$CLIP" "$W/frames/%04d.png"
"$PY" "$HERE/track.py" "$W"                       # -> $W/quads.json
"$PY" "$HERE/composite.py" "$W/frames" "$W/quads.json" "$MARK" "$W/comp" "$STYLE"

# 2. the scenes and the contact bar, from HTML
ln -sfn /home/user/meridian-interface-website/public/fonts "$W/fonts"
cp "$MARK" "$W/img/mark.png"; cp "$HERE/scenes.html" "$W/"
node "$HERE/render.mjs" "$W" wide 1920 1080
node "$HERE/render.mjs" "$W" story 1080 1920

# 3. the score
"$PY" "$HERE/music.py" "$W/music.wav"

# 4. assemble. The contact bar comes in at 0.6 s and stays through the flash; the
#    scenes carry the same bar, in the same place, until the end card.
BAR="format=rgba,fade=in:st=0.6:d=0.4:alpha=1"
enc() {  # name, film filter
  ffmpeg -v error -y -framerate 24 -i "$W/comp/%04d.png" -loop 1 -framerate 24 -t 6.3 -i "$W/foot-$1.png" \
    -framerate 24 -i "$W/frames-$1/%04d.jpg" -i "$W/music.wav" -filter_complex \
    "[0]$2,setsar=1[f];[1]$BAR[b];[f][b]overlay=shortest=1[fb];[fb][2]concat=n=2:v=1:a=0,format=yuv420p[v];[3]loudnorm=I=-14:TP=-1.5[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -r 24 -c:a aac -b:a 192k -movflags +faststart "$W/$NAME-$1.mp4"
}
enc wide "null"
# story: crop the centred monolith out of the wide film
enc story "crop=608:1080:656:0,scale=1080:1920:flags=lanczos"
ls -la "$W/$NAME"-*.mp4
