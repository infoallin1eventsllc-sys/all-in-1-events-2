# Social formats from one build. Needs base.mp4, reel.mp4, mix2.wav (final.sh) and panel.html/render.mjs.
# The square crop cuts the full-frame reel's own captions, so 28.6-31.7 s is shown whole on a blurred fill.
# 1) scene layer once at 1080x1920  2) text layer per format  3) crop/fit + overlay per format.
set -e
D=$(pwd)
[ -z "$SKIP_SCENE" ] && FMT= MODE=scene OUT=fs node render.mjs "$D"
for f in 9x16 4x5 1x1 16x9; do FMT=$f MODE=text OUT=ft_$f node render.mjs "$D"; done
[ -z "$SKIP_SCENE" ] && ffmpeg -v error -y -i base.mp4 -ss 2.0 -i reel.mp4 -framerate 30 -i fs/%04d.png -filter_complex "\
[1:v]fps=30,setpts=PTS-STARTPTS+22.0/TB,split=2[ra][rb];\
[ra]scale=273:485,format=yuva420p,fade=t=in:st=22.25:d=0.3:alpha=1[r5];\
[rb]scale=433:770,format=yuva420p,fade=t=out:st=28.6:d=0.4:alpha=1[r6];\
[0:v][r5]overlay=100:280:enable='between(t,22.25,26.3)':eof_action=pass[b1];\
[b1][r6]overlay=90:150:enable='between(t,26.3,29.0)':eof_action=pass[b2];\
[b2][2:v]overlay=0:0:eof_action=pass,format=yuv420p[v]" -map "[v]" -t 37 -c:v libx264 -preset fast -crf 12 -pix_fmt yuv420p -r 30 scene.mp4
ENC="-c:v libx264 -preset slow -crf 17 -profile:v high -level 4.1 -g 60 -r 30 -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t 37"
N=${NAME:-ad}
ffmpeg -v error -y -i scene.mp4 -framerate 30 -i ft_9x16/%04d.png -i mix2.wav -filter_complex "[0:v][1:v]overlay=0:0,format=yuv420p[v]" -map "[v]" -map 2:a $ENC ${N}-9x16-reels-tiktok-shorts.mp4
ffmpeg -v error -y -i scene.mp4 -framerate 30 -i ft_4x5/%04d.png -i mix2.wav -filter_complex "[0:v]crop=1080:1350:0:${Y45:-130}[s];[s][1:v]overlay=0:0,format=yuv420p[v]" -map "[v]" -map 2:a $ENC ${N}-4x5-instagram-facebook-feed.mp4
ffmpeg -v error -y -i scene.mp4 -framerate 30 -i ft_1x1/%04d.png -i mix2.wav -filter_complex "[0:v]split=3[c][a][b];[c]crop=1080:1080:0:${Y11:-140}[cr];\
[a]scale=1080:-2,crop=1080:1080,boxblur=40:3,eq=brightness=-0.18:saturation=0.8[bg];[b]scale=-2:1080[fg];\
[bg][fg]overlay=(W-w)/2:0,format=yuva420p,fade=t=in:st=28.6:d=0.4:alpha=1[fit];\
[cr][fit]overlay=0:0:enable='between(t,28.6,31.7)'[s];[s][1:v]overlay=0:0,format=yuv420p[v]" -map "[v]" -map 2:a $ENC ${N}-1x1-square.mp4
ffmpeg -v error -y -i scene.mp4 -framerate 30 -i ft_16x9/%04d.png -i mix2.wav -filter_complex "\
[0:v]split[a][b];[a]scale=1920:-2,crop=1920:1080,boxblur=40:3,eq=brightness=-0.18:saturation=0.8[bg];\
[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0[s];[s][1:v]overlay=0:0,format=yuv420p[v]" -map "[v]" -map 2:a $ENC ${N}-16x9-youtube-linkedin-x-web.mp4
ls -la ${N}-*.mp4
