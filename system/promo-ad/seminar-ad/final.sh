# Assemble the seminar ad: dissolve chain, reel in the on-screen phone, panel/caption frames, mix.
# Inputs in the working folder: seg*.mp4 (segs.sh), reel.mp4 (leads reel v7), nar.wav (narration),
# bed.m4a (music bed), frames/%04d.png (render.mjs). BED = bed gain in dB (used -15).
set -e
BED=${BED:--15}
ffmpeg -v error -y -ss 8.6 -i reel.mp4 -vf "fps=30,scale=1080:1920,trim=duration=3.4" -c:v libx264 -preset fast -crf 14 -pix_fmt yuv420p -r 30 -an seg7.mp4
# each cut carries 0.15 s of held tail so the xfade never runs out of frames
ffmpeg -v error -y -i seg1.mp4 -i seg2.mp4 -i seg3.mp4 -i seg4.mp4 -i seg56.mp4 -i seg7.mp4 -i seg8.mp4 -filter_complex "\
[0:v]tpad=stop_mode=clone:stop_duration=0.15[i0];[1:v]tpad=stop_mode=clone:stop_duration=0.15[i1];[2:v]tpad=stop_mode=clone:stop_duration=0.15[i2];\
[3:v]tpad=stop_mode=clone:stop_duration=0.15[i3];[4:v]tpad=stop_mode=clone:stop_duration=0.15[i4];[5:v]tpad=stop_mode=clone:stop_duration=0.15[i5];\
[i0][i1]xfade=transition=fade:duration=0.25:offset=5.9[x1];\
[x1][i2]xfade=transition=fade:duration=0.25:offset=11.9[x2];\
[x2][i3]xfade=transition=fade:duration=0.25:offset=16.3[x3];\
[x3][i4]xfade=transition=fade:duration=0.25:offset=22.0[x4];\
[x4][i5]xfade=transition=fade:duration=0.4:offset=28.6[x5];\
[x5][6:v]xfade=transition=fade:duration=0.4:offset=31.6[v]" -map "[v]" -c:v libx264 -preset fast -crf 14 -pix_fmt yuv420p -r 30 -an base.mp4
# narration split at 28.4 s with a 3.2 s pause for the full-frame reel moment
ffmpeg -v error -y -i nar.wav -i bed.m4a -filter_complex "\
[0:a]atrim=0:28.4,asetpts=N/SR/TB[n1];[0:a]atrim=28.4,asetpts=N/SR/TB,adelay=3200|3200[n2];\
[n1][n2]concat=n=2:v=0:a=1,aresample=48000,highpass=f=70,volume=2.5dB,apad=whole_dur=37[vo];\
[1:a]atrim=0:37,asetpts=N/SR/TB,aresample=48000,volume=${BED}dB,afade=t=out:st=35:d=2[bed];\
[vo][bed]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false[a]" -map "[a]" -ar 48000 -ac 2 -c:a pcm_s16le mix.wav
I=$(ffmpeg -i mix.wav -af ebur128 -f null - 2>&1 | grep "I:" | tail -1 | awk '{print $2}')
G=$(python3 -c "print(round(-16.4-($I),2))")
ffmpeg -v error -y -i mix.wav -af "volume=${G}dB" -c:a pcm_s16le mix2.wav
ffmpeg -v error -y -i base.mp4 -ss 2.0 -i reel.mp4 -framerate 30 -i frames/%04d.png -i mix2.wav -filter_complex "\
[1:v]fps=30,setpts=PTS-STARTPTS+22.0/TB,split=2[ra][rb];\
[ra]scale=273:485,format=yuva420p,fade=t=in:st=22.25:d=0.3:alpha=1[r5];\
[rb]scale=433:770,format=yuva420p,fade=t=out:st=28.6:d=0.4:alpha=1[r6];\
[0:v][r5]overlay=100:280:enable='between(t,22.25,26.3)':eof_action=pass[b1];\
[b1][r6]overlay=90:150:enable='between(t,26.3,29.0)':eof_action=pass[b2];\
[b2][2:v]overlay=0:0:eof_action=pass,format=yuv420p[v]" -map "[v]" -map 3:a -t 37 -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.1 -g 60 -r 30 -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a aac -b:a 192k -ar 48000 -movflags +faststart meridian-seminar-ad.mp4
