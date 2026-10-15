#!/usr/bin/env python3
"""Lay a music track under the brand film.

    python3 tools/add_soundtrack.py ~/Downloads/track.wav
    python3 tools/add_soundtrack.py track.wav --start 18.5
    python3 tools/add_soundtrack.py track.wav --video assets/video/420-cinematic-cut.mp4

Writes the result beside the film with `-scored` on the end, so the silent
original is never overwritten and you can A/B them.

BEFORE YOU USE THIS, KNOW WHERE THE TRACK CAME FROM
---------------------------------------------------
A commercial song on a film hosted on our own site needs a sync licence.
Instagram and TikTok have blanket deals with the labels, which is why any
song works in a Reel — that licence covers their platform, not 420friendly.
Use music you own, or a production-music subscription (Epidemic Sound,
Artlist, Musicbed, Soundstripe) whose licence names web use. Keep the licence
receipt: it is the thing you produce if a claim ever arrives.

WHAT IT DOES TO THE AUDIO
-------------------------
- Trims the track to the film's exact length, from `--start` (most songs do
  not open on their best 34 seconds — pick a bar that does).
- Pads with silence rather than failing if the track runs short.
- Normalises loudness to -16 LUFS, the level streaming platforms target. A
  mastered song is far louder than that and would arrive as a wall of sound
  after a silent page.
- Fades in and out, so it neither starts abruptly nor cuts dead on the last
  frame.
- Copies the video stream untouched. No re-encode, no quality loss, and it
  finishes in about a second.
"""

import argparse
import os
import re
import subprocess
import sys

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # 420-friendly/
DEFAULT_VIDEO = "assets/video/420-motion-cut.mp4"


def probe_duration(path):
    """Seconds, read back from ffmpeg's own report."""
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", out)
    if not m:
        sys.exit(f"could not read a duration from {path}")
    h, mnt, s = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(s)


def has_audio(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    return bool(re.search(r"Stream #\d+:\d+.*: Audio:", out))


def main():
    p = argparse.ArgumentParser(description="Score the brand film.")
    p.add_argument("audio", help="the music file (wav, mp3, m4a, flac …)")
    p.add_argument("--video", default=DEFAULT_VIDEO,
                   help=f"the film to score (default: {DEFAULT_VIDEO})")
    p.add_argument("--out", default=None,
                   help="output path (default: the film with -scored appended)")
    p.add_argument("--start", type=float, default=0.0,
                   help="seconds into the track to begin (default: 0)")
    p.add_argument("--fade-in", type=float, default=1.0, help="seconds (default: 1)")
    p.add_argument("--fade-out", type=float, default=2.0, help="seconds (default: 2)")
    p.add_argument("--lufs", type=float, default=-16.0,
                   help="target loudness (default: -16, the streaming standard)")
    args = p.parse_args()

    video = args.video if os.path.isabs(args.video) else os.path.join(ROOT, args.video)
    audio = os.path.expanduser(args.audio)
    for f, what in ((video, "film"), (audio, "audio")):
        if not os.path.exists(f):
            sys.exit(f"no {what} at {f}")

    out = args.out or re.sub(r"\.mp4$", "-scored.mp4", video)
    if not os.path.isabs(out):
        out = os.path.join(ROOT, out)

    vdur = probe_duration(video)
    adur = probe_duration(audio)
    usable = adur - args.start
    if usable <= 0:
        sys.exit(f"--start {args.start}s is past the end of a {adur:.1f}s track")
    if usable < vdur:
        print(f"  note: {usable:.1f}s of track for {vdur:.1f}s of film — "
              f"padding the tail with silence")

    fade_out_at = max(0.0, vdur - args.fade_out)

    # apad before atrim: pad first so a short track still fills the film, then
    # cut everything to the frame. loudnorm runs last so the fades are not
    # re-levelled back up.
    chain = (
        f"apad,atrim=0:{vdur:.3f},asetpts=PTS-STARTPTS,"
        f"afade=t=in:st=0:d={args.fade_in},"
        f"afade=t=out:st={fade_out_at:.3f}:d={args.fade_out},"
        f"loudnorm=I={args.lufs}:TP=-1.5:LRA=11"
    )

    cmd = [
        FFMPEG, "-y",
        "-i", video,
        "-ss", f"{args.start}", "-i", audio,
        "-filter_complex", f"[1:a]{chain}[a]",
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        # The web player should start playing before the whole file arrives.
        "-movflags", "+faststart",
        "-shortest",
        out,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2500:], file=sys.stderr)
        sys.exit("ffmpeg failed")

    if not has_audio(out):
        sys.exit(f"{out} came out with no audio stream — something is wrong")

    size = os.path.getsize(out) / 1_000_000
    rel = os.path.relpath(out, ROOT)
    print(f"\n  {rel}  ({size:.1f} MB, {probe_duration(out):.1f}s)\n")
    print("  Listen to it. If it sits right, point the site at it by editing")
    print("  BRAND_FILM.file in assets/media-links.js, then run: npm test\n")


if __name__ == "__main__":
    main()
