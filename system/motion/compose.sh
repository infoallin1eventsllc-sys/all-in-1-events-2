#!/usr/bin/env bash
# Cut one social clip: title card -> captioned product footage -> Meridian end card.
#
# Captions are placed from the beat timings the capture recorded (beats.json),
# not at guessed offsets — a caption describing the merch screen has to land
# while the merch screen is actually on screen.
#
# Usage: ./compose.sh <raw-dir> <card-prefix> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")"
FF=$(cat .ffmpeg)
RAW=$1; PFX=$2; OUT=$3

SRC=$(ls "$RAW"/*.webm | head -1)
BEATS="$RAW/beats.json"
[ -f "$BEATS" ] || { echo "no $BEATS — re-run capture.mjs"; exit 1; }
TITLE_SEC=2.6; END_SEC=3.0
BODY=$(python3 -c "import json;print(json.load(open('$BEATS'))['total'])")

# Build the caption half of the filtergraph from the recorded beats.
read -r FILTER NCAP < <(python3 - "$BEATS" "$PFX" <<'PY'
import json, sys, os
beats = json.load(open(sys.argv[1]))['beats']; pfx = sys.argv[2]
FADE = 0.4
parts, chain, n = [], '[base]', 0
for i, b in enumerate(beats):
    p = f'{pfx}-{b["label"]}.png'
    if not os.path.exists(p):            # a beat with no card is just held footage
        continue
    s, e = b['start'], b['end']
    parts.append(f'[{i+1}:v]format=yuva420p,'
                 f'fade=in:st={s:.2f}:d={FADE}:alpha=1,'
                 f'fade=out:st={e-FADE:.2f}:d={FADE}:alpha=1[c{i}]')
    parts.append(f'{chain}[c{i}]overlay=0:0:enable=\'between(t,{s:.2f},{e:.2f})\'[b{i}]')
    chain = f'[b{i}]'; n += 1
graph = ('[0:v]scale=1080:1920:flags=lanczos,fps=30,format=yuva420p[base];' + ';'.join(parts)
         + f';{chain}format=yuv420p[v]')
print(graph, n)
PY
)
# inputs: the footage, then one -loop image per captioned beat, in beat order
INPUTS=()
while read -r P; do INPUTS+=(-loop 1 -i "$P"); done < <(python3 -c "
import json,sys,os
for b in json.load(open('$BEATS'))['beats']:
    p=f'$PFX-{b[\"label\"]}.png'
    print(p if os.path.exists(p) else '')" | grep .)

$FF -y -v error -loop 1 -i "${PFX}-title.png" -t $TITLE_SEC \
  -vf "zoompan=z='min(zoom+0.0006,1.06)':d=$(python3 -c "print(int($TITLE_SEC*30))"):s=1080x1920:fps=30,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -r 30 seg-title.mp4

$FF -y -v error -t "$BODY" -i "$SRC" "${INPUTS[@]}" \
  -filter_complex "$FILTER" -map "[v]" -t "$BODY" \
  -c:v libx264 -preset slow -crf 20 -r 30 seg-body.mp4

$FF -y -v error -loop 1 -i assets/end.png -t $END_SEC \
  -vf "fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 20 -r 30 seg-end.mp4

printf "file 'seg-title.mp4'\nfile 'seg-body.mp4'\nfile 'seg-end.mp4'\n" > list.txt
$FF -y -v error -f concat -safe 0 -i list.txt -c copy "$OUT"
echo "wrote $OUT  ($NCAP captions over ${BODY}s of footage)"
