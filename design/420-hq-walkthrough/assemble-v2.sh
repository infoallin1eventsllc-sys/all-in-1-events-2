#!/bin/bash
# V2 film: gA (frames 0-2699) + gC (frames 2700-5789) + logo card, with the approved soundtrack
set -euo pipefail
cd /tmp/claude-0/-home-user-all-in-1-events-2/e8357c7a-b22d-585d-b3aa-25c863adbe9e/scratchpad/tour
mkdir -p ../final-v2
ffmpeg -y -loglevel error -loop 1 -framerate 30 -t 5 -i card.png -i gA.mp4 -i gC.mp4 -i ../music/mix.m4a -filter_complex \
 "[0:v]format=yuv420p,fade=t=in:st=0.15:d=0.8,fade=t=out:st=3.8:d=1.1,setsar=1[card];[1:v]trim=end_frame=2700,setpts=PTS-STARTPTS,setsar=1[a];[2:v]setpts=PTS-STARTPTS,setsar=1[c];[a][c]concat=n=2:v=1:a=0,fade=t=out:st=192.55:d=0.42[t];[t][card]concat=n=2:v=1:a=0,split[v1][v2]" \
 -map "[v1]" -map 3:a -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 30 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a aac -b:a 256k -shortest -movflags +faststart ../final-v2/420-Friendly-HQ-Walkthrough-master.mp4 \
 -map "[v2]" -map 3:a -c:v libx264 -preset slow -crf 21 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -r 30 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a aac -b:a 192k -shortest -movflags +faststart ../final-v2/420-Friendly-HQ-Walkthrough.mp4
