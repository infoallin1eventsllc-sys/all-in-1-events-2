#!/usr/bin/env bash
# Builds the homepage hero laptop film from the Agent Dashboard ad.
#   ./build.sh <ad.mp4>
# <ad.mp4> is the 9:16 ad BEFORE its logo ending, with the "CALENDAR" label fix
# (1440x2560, 24 fps, 243 frames; "fixed.mp4" in system/promo-ad/agent-dashboard-ad).
# Needs ffmpeg and python3 with Pillow and numpy. About five minutes. No credits.
set -euo pipefail
AD=$(realpath "$1"); HERE=$(cd "$(dirname "$0")" && pwd); cd "$(mktemp -d)"; mkdir tail
CM="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"

# 1. The part of the frame the laptop uses, at hero size (816x1080).
ffmpeg -v error -y -i "$AD" -vf "crop=1440:1908:0:326,scale=816:1080:flags=lanczos" -an -c:v libx264 -crf 10 -preset fast -pix_fmt yuv420p ad_s.mp4
# 2. About three-quarter speed, 30 fps, with motion-interpolated in-between frames (419 frames).
ffmpeg -v error -y -i ad_s.mp4 -vf "setpts=1.39*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=fdiff:scd_threshold=9" -an -c:v libx264 -crf 10 -preset fast -pix_fmt yuv420p ad_slow.mp4
# 3. Close the loop: 48 frames easing the last frame back onto the first.
ffmpeg -v error -y -i ad_slow.mp4 -vf "select='eq(n\,0)'" -vsync 0 -frames:v 1 f0.png
ffmpeg -v error -y -i ad_slow.mp4 -vf "select='eq(n\,418)'" -vsync 0 -frames:v 1 fL.png
python3 "$HERE/loop_tail.py"
ffmpeg -v error -y -i ad_slow.mp4 -framerate 30 -i tail/t%03d.png -filter_complex "[0:v]fps=30,format=yuv420p,setsar=1[a];[1:v]format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1:a=0[o]" -map "[o]" -an -c:v libx264 -crf 10 -preset fast ad_loop.mp4
# 4. Key the black stage out onto the navy ground. threshold=0.0627 is video black
#    (16/255): with threshold=0 the stage keeps 13% opacity and the film shows as a
#    darker box on the page.
python3 "$HERE/ground.py"
ffmpeg -v error -y -i ad_loop.mp4 -loop 1 -framerate 30 -i gvL.png -loop 1 -framerate 30 -i gvS.png -loop 1 -framerate 30 -i ground.png -filter_complex "
[0:v]pad=880:1080:32:0:black,lumakey=threshold=0.0627:tolerance=0.036:softness=0.13[ad];
[3:v][ad]overlay=0:0:shortest=1:format=auto[c0];
[c0][1:v]overlay=0:0:shortest=1:format=auto[c1];
[2:v]format=rgba,fade=t=in:st=4.15:d=0.55:alpha=1,fade=t=out:st=11.15:d=0.55:alpha=1[vs];
[c1][vs]overlay=0:0:shortest=1:format=auto,format=yuv420p[out]" -map "[out]" -an -c:v libx264 -crf 12 -preset fast $CM clip-master.mp4
# 5. The sound: the ad's own Higgsfield audio, stretched to the slowed film with the
#    pitch kept, a short fade on the very end, padded to the loop's length, and set
#    to -16 LUFS by one fixed gain (no limiter). atempo, not rubberband: rubberband's
#    default independent channels flipped the stereo phase on this bass-heavy bed.
ffmpeg -v error -y -i "$AD" -vn -ac 2 -ar 48000 raw_audio.wav
ffmpeg -v error -y -i raw_audio.wav -af "atempo=0.719424,afade=t=out:st=13.84:d=0.22,apad=whole_dur=15.566667,atrim=0:15.566667,volume=-3.4dB" -ar 48000 score.wav
AUD='-af atrim=0:15.5'
# 6. The six files the website uses.
ffmpeg -v error -y -i clip-master.mp4 -i score.wav -map 0:v -map 1:a -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p $CM $AUD -c:a aac -b:a 128k -movflags +faststart hero-laptop.mp4
ffmpeg -v error -y -i clip-master.mp4 -i score.wav -map 0:v -map 1:a -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -cpu-used 3 -g 150 $CM $AUD -c:a libopus -b:a 96k hero-laptop.webm
ffmpeg -v error -y -i clip-master.mp4 -i score.wav -map 0:v -map 1:a -vf "scale=660:810:flags=lanczos" -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p $CM $AUD -c:a aac -b:a 128k -movflags +faststart hero-laptop-sm.mp4
ffmpeg -v error -y -i clip-master.mp4 -i score.wav -map 0:v -map 1:a -vf "scale=660:810:flags=lanczos" -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -cpu-used 3 -g 150 $CM $AUD -c:a libopus -b:a 96k hero-laptop-sm.webm
ffmpeg -v error -y -i clip-master.mp4 -frames:v 1 -c:v libwebp -quality 84 laptop-poster.webp
ffmpeg -v error -y -i clip-master.mp4 -frames:v 1 -vf "scale=660:810:flags=lanczos" -c:v libwebp -quality 82 laptop-poster-sm.webp
for f in hero-laptop.mp4 hero-laptop.webm; do ffmpeg -hide_banner -nostats -i $f -af ebur128=peak=true -f null - 2>&1 | grep -E '^ +(I|Peak):' | tail -2; done   # expect about -16 LUFS, peak under -1 dBFS
echo "Built in $(pwd):"; ls -la hero-laptop* laptop-poster*
echo "Copy the four videos to the website's public/video/ and the two posters to public/images/hero/."
