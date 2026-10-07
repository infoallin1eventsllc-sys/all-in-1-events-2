#!/bin/sh
# Build the Higgsfield hero-film master (v2: one grade, edges to black, dips through black).
#
# Run where the four Higgsfield shots can be downloaded (the Higgsfield sandbox, or any
# machine with normal internet). Needs ffmpeg and python3 with numpy + Pillow.
#   clip1.mp4  job ac6db511  the match strike (text-to-video)
#   clip2.mp4  job 51086d65  Exotic Peach   (start frame: start-peach.jpg)
#   clip3.mp4  job a64c70f4  Brewed Elixir  (start frame: start-elixir.jpg)
#   clip4.mp4  job 1b6f62a9  Inferno Dreams (start frame: start-inferno.jpg)
# Output: master2.mp4 (1080x1920, 24 fps, 15.0 s) with a preview soundtrack from the
# repo's SFX. The website files get the licensed mix instead, via finish.sh.
set -e
B=https://raw.githubusercontent.com/infoallin1eventsllc-sys/all-in-1-events-2/claude/client-promo-website-5ct9i8/marketing/film
[ -f logo.png ] || curl -sfL -o logo.png $B/cutouts/logo-on-black.png
for f in sfx-match-strike.mp3 sfx-match-strike-v2.mp3 sfx-glitter-shimmer.mp3; do [ -f $f ] || curl -sfL -o $f $B/$f; done

# 1) Edge mask: full strength over the product, falling smoothly to pure black at every border
python3 - <<'PY'
import numpy as np
from PIL import Image
W,H=1080,1920
y,x=np.mgrid[0:H,0:W].astype(float)
def ss(e0,e1,v):
    t=np.clip((v-e0)/(e1-e0),0,1); return t*t*(3-2*t)
r=np.sqrt(((x-W/2)/(0.60*W))**2+((y-H*0.47)/(0.56*H))**2)
radial=1-ss(0.58,1.02,r)
edge=ss(0,0.11,x/W)*ss(0,0.11,1-x/W)*ss(0,0.08,y/H)*ss(0,0.08,1-y/H)
Image.fromarray((radial*edge*255).round().astype(np.uint8),'L').save('mask.png')
PY

# 2) Per-shot grade into one tonal family; the labels keep their whites
G="format=gray,scale=1080:1920:flags=lanczos,setsar=1,fps=24"
ffmpeg -v error -y -ss 0.6 -t 3.4 -i clip1.mp4 -an -vf "$G,curves=all='0/0 0.5/0.47 1/0.97',format=yuv420p" -c:v libx264 -crf 12 g1.mp4
ffmpeg -v error -y -ss 0   -t 4.1 -i clip2.mp4 -an -vf "$G,curves=all='0/0 0.25/0.18 0.5/0.44 0.8/0.78 1/0.97',format=yuv420p" -c:v libx264 -crf 12 g2.mp4
ffmpeg -v error -y -ss 0.5 -t 4.1 -i clip3.mp4 -an -vf "$G,curves=all='0/0 0.25/0.13 0.5/0.36 0.8/0.74 1/0.97',format=yuv420p" -c:v libx264 -crf 12 g3.mp4
ffmpeg -v error -y -ss 0.9 -t 4.1 -i clip4.mp4 -an -vf "$G,curves=all='0/0 0.3/0.08 0.55/0.26 0.75/0.52 0.9/0.8 1/0.96',format=yuv420p" -c:v libx264 -crf 12 g4.mp4

# 3) Logo card: the mark fades in over black with a slow 3% grow, then fades out
ffmpeg -v error -y -f lavfi -i "color=c=black:s=1080x1920:r=24:d=2.5" -loop 1 -t 2.5 -i logo.png -filter_complex "[1:v]format=gray,scale=w='760+24*min(t/2.5\,1)':h=-1:eval=frame[lg];[0:v][lg]overlay=x=(W-w)/2:y=(H-h)/2-60:eval=frame,fade=t=in:st=0.35:d=0.9,fade=t=out:st=2.1:d=0.4,format=yuv420p[v]" -map "[v]" -r 24 -c:v libx264 -crf 12 logo.mp4

# 4) Join with 0.8 s dips through black on the cut points 3.0 / 6.3 / 9.6 / 12.9 s, then the edge mask over everything
ffmpeg -v error -y -i g1.mp4 -i g2.mp4 -i g3.mp4 -i g4.mp4 -i logo.mp4 -loop 1 -i mask.png -filter_complex "
[0:v][1:v]xfade=transition=fadeblack:duration=0.8:offset=2.6[a];
[a][2:v]xfade=transition=fadeblack:duration=0.8:offset=5.9[b];
[b][3:v]xfade=transition=fadeblack:duration=0.8:offset=9.2[c];
[c][4:v]xfade=transition=fadeblack:duration=0.8:offset=12.5,format=gray,trim=duration=15[film];
[5:v]format=gray,scale=1080:1920,trim=duration=15[m];
[film][m]blend=all_mode=multiply,format=yuv420p[v]" -map "[v]" -r 24 -t 15 -c:v libx264 -crf 12 -pix_fmt yuv420p silent.mp4

# 5) Preview soundtrack from the repo's SFX (the licensed bell tree is added by finish.sh)
ffmpeg -v error -y -i sfx-match-strike.mp3 -i sfx-match-strike-v2.mp3 -i sfx-glitter-shimmer.mp3 -filter_complex "[0:a]adelay=500|500,volume=0.45[s1];[1:a]adelay=450|450,volume=0.9[s2];[2:a]adelay=600|600,volume=0.85[s3];[s1][s2][s3]amix=inputs=3:normalize=0,apad,atrim=0:15,afade=t=out:st=13.6:d=1.4,aformat=sample_rates=48000:channel_layouts=stereo[a]" -map "[a]" -c:a pcm_s16le pmix.wav
ffmpeg -v error -y -i silent.mp4 -i pmix.wav -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart master2.mp4
ls -la master2.mp4
