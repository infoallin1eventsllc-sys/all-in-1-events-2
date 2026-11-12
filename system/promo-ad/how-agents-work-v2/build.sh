#!/bin/bash
# Assembles "How AI agents work" (second cut) in the looks and shapes asked for. No paid generation.
#   ./build.sh <work_dir> <python-with-numpy-scipy> "<looks>" "<shapes>"
#   e.g. ./build.sh /tmp/w python3 "day signal emerald stage" "9x16"       previews of every look
#        ./build.sh /tmp/w python3 "signal" "9x16 4x5 1x1 16x9"            one look, all four shapes
# The ending is Otis's logo light-up on navy, cleaned (../end-card), with the text layer end.html.
set -e
cd "$(dirname "$0")"
W=$1; PY=${2:-python3}; LOOKS=${3:-day}; FMTS=${4:-9x16}; N=meridian-how-agents-work
LOGO=../end-card/meridian-logo-ending-clean-9x16.mp4
MAIN=23.4; END=6.0; XF=0.4
mkdir -p "$W" out
[ -f "$W/music.wav" ] || $PY music.py "$W/music.wav"
[ -d "$W/f-end" ] || node render.mjs end "$W/f-end"
for l in $LOOKS; do for f in $FMTS; do [ -d "$W/f-$l-$f" ] || node render.mjs $f "$W/f-$l-$f" $l & done; done; wait

# end card, 1080x1920: the clean logo ending (navy alone for 0.4 s, logo fades in, lights,
# settles; see ../end-card/build_clean_ending.py) with the text layer over it. Silent.
ffmpeg -v error -y -i $LOGO -framerate 30 -i "$W/f-end/%04d.png" -filter_complex \
  "[0:v]fps=30[l];[l][1:v]overlay=0:0:shortest=1,trim=duration=$END,format=yuv420p" \
  -an -c:v libx264 -crf 14 -pix_fmt yuv420p "$W/end.mp4"

ENC="-c:v libx264 -profile:v high -level 4.1 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -g 60 -movflags +faststart"
OFF=$(awk "BEGIN{print $MAIN-$XF}")
declare -A ENDF=(
  [9x16]="split[a][b];[a]crop=1080:1800:0:120[t];[b]crop=1080:2:0:1918,scale=1080:120[u];[t][u]vstack"
  [4x5]="crop=1080:1350:0:221"
  [1x1]="crop=1080:1080:0:360"
  [16x9]="crop=1080:1080:0:360,split=3[m][l][r];[l]crop=4:1080:0:0,scale=420:1080,gblur=sigma=10[L];[r]crop=4:1080:1076:0,scale=420:1080,gblur=sigma=10[R];[L][m][R]hstack=3"
)
declare -A NAME=([9x16]=9x16-reels-tiktok-shorts [4x5]=4x5-instagram-facebook-feed [1x1]=1x1-square [16x9]=16x9-youtube-linkedin-x-web)
# audio: the score alone (the old clip's own sound is not used), brought to -14 LUFS with one
# fixed gain so nothing pumps. No limiter: ffmpeg's alimiter threw a full-scale spike on one
# kick here. The score peaks about 3 dB under full scale after the gain; the check below
# stops the build if the encoded track ever gets near clipping.
I=$(ffmpeg -hide_banner -i "$W/music.wav" -af ebur128 -f null - 2>&1 | awk '/I:/{v=$2} END{print v}')
ffmpeg -v error -y -i "$W/music.wav" -af "volume=$(awk "BEGIN{print -14-($I)}")dB,aresample=48000" -c:a aac -b:a 256k "$W/audio.m4a"
PK=$(ffmpeg -hide_banner -i "$W/audio.m4a" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')
echo "audio: integrated $I LUFS before gain, encoded peak $PK dBFS"
awk "BEGIN{exit !($PK < -1.0)}" || { echo "audio peak too hot ($PK dBFS): stop"; exit 1; }
for l in $LOOKS; do for f in $FMTS; do
  o="out/$N-$l-${NAME[$f]}.mp4"
  ffmpeg -v error -y -framerate 30 -i "$W/f-$l-$f/%04d.jpg" -i "$W/end.mp4" -i "$W/audio.m4a" -filter_complex \
    "[0:v]format=yuv420p,setsar=1[v0];[1:v]fps=30,${ENDF[$f]},format=yuv420p,setsar=1[v1];[v0][v1]xfade=transition=wiperight:duration=$XF:offset=$OFF[v]" \
    -map "[v]" -map 2:a $ENC -c:a copy -shortest "$o"
  echo "$l $f $(ffprobe -v error -show_entries stream=width,height -of csv=p=0 -select_streams v $o) $(ffprobe -v error -show_entries format=duration -of csv=p=0 $o)"
done; done
