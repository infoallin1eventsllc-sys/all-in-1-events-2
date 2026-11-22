#!/bin/bash
# frame-to-frame change scan, freeze scan, black scan on the finished video
cd /tmp/claude-0/-home-user-all-in-1-events-2/e8357c7a-b22d-585d-b3aa-25c863adbe9e/scratchpad/tour
ffmpeg -hide_banner -i master.mp4 -vf "scale=480:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=ydif.txt" -an -f null - 2>/dev/null
ffmpeg -hide_banner -i master.mp4 -vf "blackdetect=d=0.05:pix_th=0.06" -an -f null - 2>&1 | grep -o "black_start:[0-9.]* black_end:[0-9.]*"
ffmpeg -hide_banner -i master.mp4 -vf "freezedetect=n=0.0008:d=0.5" -an -f null - 2>&1 | grep -o "freeze_[a-z]*: [0-9.]*" | paste - - - 
