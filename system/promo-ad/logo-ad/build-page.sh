#!/usr/bin/env bash
# The "landing page" cut of Otis's clip: the hand is replaced by the Meridian
# Interface landing page popping up on the monolith screen as the clip's own
# voice says "we put the future in your hands", then the end card.
#   ./build-page.sh <clip.mp4> <work_dir> <python_with_cv2_numpy_scipy>
# Needs the website served at http://localhost:4799 (npx vite preview --port 4799
# in meridian-interface-website, after npm run build), ffmpeg, node + Playwright.
# Writes <work_dir>/meridian-page-ad-{still,moving}-{wide,reels}.mp4
set -euo pipefail
CLIP=$1; W=$2; PY=$3
HERE=$(cd "$(dirname "$0")" && pwd)
MARK=$HERE/../../../.claude/skills/meridian-brand/assets/logo/meridian-mark.png
mkdir -p "$W/frames" "$W/img" "$W/page/scroll"

# 1. the clip's frames and the screen tracking
ffmpeg -v error -y -i "$CLIP" "$W/frames/%04d.png"
"$PY" "$HERE/track.py" "$W"

# 2. the landing page, 640x960 (phone layout at 1.5x): one still, and 140 frames
#    of a visitor's scroll (hero held for 22 frames, then an eased 1500px scroll)
node -e "
const pw=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await pw.chromium.launch();
 const p=await b.newPage({viewport:{width:427,height:640},deviceScaleFactor:1.5});
 await p.route(u=>!u.href.startsWith('http://localhost'), r=>r.abort());
 await p.goto('http://localhost:4799/',{waitUntil:'load'}); await p.waitForTimeout(2500);
 await p.screenshot({path:'$W/page/still.png'});
 const N=140, HOLD=22, DIST=1500;
 for (let i=0;i<N;i++){
   const u=Math.max(0,(i-HOLD)/(N-HOLD)); const e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
   await p.evaluate(y=>window.scrollTo(0,y), Math.round(e*DIST)); await p.waitForTimeout(40);
   await p.screenshot({path:'$W/page/scroll/'+String(i).padStart(4,'0')+'.png'});
 }
 await b.close()})()"

# 3. the page on the screen, still and moving
"$PY" "$HERE/composite-page.py" "$W/frames" "$W/quads.json" "$W/page/still.png" "$W/comp-still"
"$PY" "$HERE/composite-page.py" "$W/frames" "$W/quads.json" "$W/page/scroll" "$W/comp-move"

# 4. the end card and the contact bar
ln -sfn /home/user/meridian-interface-website/public/fonts "$W/fonts"
cp "$MARK" "$W/img/mark.png"; cp "$HERE/scenes.html" "$W/"
node "$HERE/render.mjs" "$W" wide 1920 1080 mode=end
node "$HERE/render.mjs" "$W" reels 1080 1920 mode=end

# 5. the bed under the voice, and the end-card music
"$PY" "$HERE/music.py" "$W/music.wav" voice

# 6. assemble. Audio: the clip's own sound (the voice) lifted a little, the music
#    ducked to 30% while the voice speaks (1.6-5.6 s), the end card at full.
BAR="format=rgba,fade=in:st=0.6:d=0.4:alpha=1"
DUCK="volume='1-0.7*min(1,max(0,(t-1.6)/0.3))*min(1,max(0,(5.6-t)/0.4))':eval=frame"
enc() {  # variant(still|moving) name(wide|reels) film-filter
  local comp=comp-move; [ "$1" = still ] && comp=comp-still
  ffmpeg -v error -y -framerate 24 -i "$W/$comp/%04d.png" -loop 1 -framerate 24 -t 6.3 -i "$W/foot-$2.png" \
    -framerate 24 -i "$W/frames-$2/%04d.jpg" -i "$W/music.wav" -i "$CLIP" -filter_complex \
    "[0]$3,setsar=1[f];[1]$BAR[b];[f][b]overlay=shortest=1[fb];[fb][2]concat=n=2:v=1:a=0,format=yuv420p[v];
     [4:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.6,apad=whole_dur=12.3[voice];
     [3:a]$DUCK[mus];[voice][mus]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -profile:v high -level 4.1 -g 48 -r 24 \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
    "$W/meridian-page-ad-$1-$2.mp4"
}
for v in still moving; do
  enc $v wide "null"
  enc $v reels "crop=608:1080:656:0,scale=1080:1920:flags=lanczos"
done
ls -la "$W"/meridian-page-ad-*.mp4
