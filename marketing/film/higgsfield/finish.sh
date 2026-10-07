#!/bin/sh
# Finish the Higgsfield cut of the hero film for the website.
#
#   sh marketing/film/higgsfield/finish.sh <master.mp4> [mix.wav]
#
# <master.mp4>  the 15 s 1080x1920 master assembled in the Higgsfield sandbox
#               (in the Higgsfield library as "secrets-of-cint-hero-film-master").
#               It carries a preview soundtrack built from the repo's SFX.
# [mix.wav]     the agency's licensed soundtrack (match strikes + Fairy Dust bell
#               tree). Not in the repository. When given, it replaces the preview
#               audio; when omitted, the preview audio is kept.
#
# Writes assets/video/hero-film.mp4, hero-film.webm and hero-film-poster.jpg with
# the same encode settings and the 1.5 MB-per-format budget as the Clipkit cut.
set -e
MASTER=$1; MIX=$2
[ -f "$MASTER" ] || { echo "usage: finish.sh <master.mp4> [mix.wav]"; exit 1; }
FF=${FFMPEG:-ffmpeg}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); OUT=$ROOT/assets/video; mkdir -p "$OUT"
if [ -n "$MIX" ]; then AUD="-i $MIX"; MAP="-map 0:v:0 -map 1:a:0"; else AUD=""; MAP="-map 0:v:0 -map 0:a:0?"; fi
$FF -y -hide_banner -loglevel error -i "$MASTER" $AUD $MAP \
  -vf "scale=720:1280:flags=lanczos,format=yuv420p" -c:v libx264 -profile:v main -preset slow -crf 29 \
  -c:a aac -b:a 96k -shortest -movflags +faststart "$OUT/hero-film.mp4"
$FF -y -hide_banner -loglevel error -i "$MASTER" $AUD $MAP \
  -vf "scale=720:1280:flags=lanczos,format=yuv420p" -c:v libvpx-vp9 -b:v 0 -crf 43 -row-mt 1 \
  -c:a libopus -b:a 64k -shortest "$OUT/hero-film.webm"
# poster: the Inferno Dreams beat, just before the dissolve to the logo
$FF -y -hide_banner -loglevel error -ss 11.5 -i "$MASTER" -frames:v 1 -vf "scale=720:1280:flags=lanczos" -q:v 4 "$OUT/hero-film-poster.jpg"
ls -la "$OUT"
