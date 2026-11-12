#!/bin/bash
# Assembles "How AI agents work" (second cut) in the looks and shapes asked for. No paid generation.
#   ./build.sh <work_dir> <python-with-numpy-scipy> "<looks>" "<shapes>"
#   e.g. ./build.sh /tmp/w python3 "day signal emerald stage" "9x16"       previews of every look
#        ./build.sh /tmp/w python3 "signal" "9x16 4x5 1x1 16x9"            one look, all four shapes
# The ending is Otis's logo light-up on navy (../end-card), unchanged, with the text layer end.html.
set -e
cd "$(dirname "$0")"
W=$1; PY=${2:-python3}; LOOKS=${3:-day}; FMTS=${4:-9x16}; N=meridian-how-agents-work
LOGO=../end-card/meridian-logo-lightup-9x16.mp4
MAIN=23.4; END=4.4; XF=0.4
mkdir -p "$W" out
[ -f "$W/music.wav" ] || $PY music.py "$W/music.wav"
[ -d "$W/f-end" ] || node render.mjs end "$W/f-end"
for l in $LOOKS; do for f in $FMTS; do [ -d "$W/f-$l-$f" ] || node render.mjs $f "$W/f-$l-$f" $l & done; done; wait

# end card, 1080x1920: the light-up, then its settled state (logo from the reference's last
# frame, where the glow has fully faded; clean navy below it), then the text layer on top
ffmpeg -v error -y -ss 3.5 -i ../end-card/reference-agent-crm-ending-9x16.mp4 -frames:v 1 "$W/ref-last.png"
ffmpeg -v error -y -sseof -0.08 -i $LOGO -frames:v 1 -update 1 "$W/hold.png"
ffmpeg -v error -y -i "$W/ref-last.png" -i "$W/hold.png" -filter_complex "[0]crop=1080:920:0:0[a];[1]crop=1080:1000:0:920[b];[a][b]vstack" "$W/settled.png"
ffmpeg -v error -y -i $LOGO -loop 1 -framerate 30 -t 3.45 -i "$W/settled.png" -framerate 30 -i "$W/f-end/%04d.png" -filter_complex \
  "[0:v]fps=30,trim=duration=1.55,setpts=PTS-STARTPTS,format=yuv420p[l];[1:v]format=yuv420p[s];[l][s]xfade=transition=fade:duration=0.6:offset=0.95[b];[b][2:v]overlay=0:0:shortest=1,trim=duration=$END,format=yuv420p" \
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
ffmpeg -v error -y -i "$W/music.wav" -i $LOGO -filter_complex \
  "[1:a]adelay=$(awk "BEGIN{print int(($MAIN-$XF)*1000)}"):all=1,volume=0.9[s];[0:a][s]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000" \
  -c:a aac -b:a 192k "$W/audio.m4a"
for l in $LOOKS; do for f in $FMTS; do
  o="out/$N-$l-${NAME[$f]}.mp4"
  ffmpeg -v error -y -framerate 30 -i "$W/f-$l-$f/%04d.jpg" -i "$W/end.mp4" -i "$W/audio.m4a" -filter_complex \
    "[0:v]format=yuv420p,setsar=1[v0];[1:v]fps=30,${ENDF[$f]},format=yuv420p,setsar=1[v1];[v0][v1]xfade=transition=wiperight:duration=$XF:offset=$OFF[v]" \
    -map "[v]" -map 2:a $ENC -c:a copy -shortest "$o"
  echo "$l $f $(ffprobe -v error -show_entries stream=width,height -of csv=p=0 -select_streams v $o) $(ffprobe -v error -show_entries format=duration -of csv=p=0 $o)"
done; done
