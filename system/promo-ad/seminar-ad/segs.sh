# Stage segments from the three 5.17 s MiniMax clips (c1 wide speaking, c2 close pointing, c3 wide applause).
set -e
V="-c:v libx264 -preset fast -crf 14 -pix_fmt yuv420p -r 30 -an"
SC="scale=1080:1920:flags=lanczos"
ffmpeg -v error -y -i c1.mp4 -vf "setpts=PTS*1.1903,fps=30,$SC,trim=duration=6.15" $V seg1.mp4
ffmpeg -v error -y -i c2.mp4 -vf "setpts=PTS*1.2097,fps=30,$SC,trim=duration=6.25" $V seg2.mp4
ffmpeg -v error -y -ss 0.3 -i c1.mp4 -vf "hflip,crop=1152:2048:288:200,fps=30,$SC,trim=duration=4.65" $V seg3.mp4
ffmpeg -v error -y -i c2.mp4 -vf "setpts=PTS*1.1516,fps=30,$SC,trim=duration=5.95" $V seg4.mp4
ffmpeg -v error -y -ss 0.2 -i c3.mp4 -vf "fps=30,$SC,trim=duration=4.3" $V seg5.mp4
ffmpeg -v error -y -ss 1.2 -i c1.mp4 -vf "crop=900:1600:200:250,fps=30,$SC,trim=duration=2.7" $V seg6.mp4
ffmpeg -v error -y -i seg5.mp4 -i seg6.mp4 -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" -map "[v]" $V seg56.mp4
ffmpeg -v error -y -f lavfi -i "color=c=black:s=1080x1920:r=30:d=5.4" $V seg8.mp4
