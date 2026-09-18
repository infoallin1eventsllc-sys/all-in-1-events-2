"""Rebuild the reel's audio track without touching a frame of picture.

Why this exists: meridian-reel.mp4 was cut from screen recordings that no
longer exist, so the film cannot be re-composed. But changing what the
narrator SAYS only needs the audio rebuilt, and the video stream can be
copied byte for byte out of the finished renders. That is what this does,
for the master and both web copies at once.

It needs two files this repo does not carry (both are gitignored):

  audio/building-the-future.wav   Adobe Stock 1196747893 - re-download with
                                  asset_license_and_download_stock; the id is
                                  in reel-narration.json and re-licensing the
                                  same asset does not consume another licence.
  audio/vo-reel.mp3               the narration, ElevenLabs "Brian"
                                  (nPczCjzI2devNBz1zQrb), read from
                                  reel-narration.json's `lines`.

Two ways to supply the voice:

  ONE FILE   audio/vo-reel.mp3 holding all six lines. The script finds the
             pauses between them and places each line at its recorded start
             time, so the narration stays locked to the picture even though
             text-to-speech never returns the same lengths twice.
  SIX FILES  audio/vo-lines/1.mp3 .. 6.mp3, one per line. Used in preference
             when present - no splitting, nothing to detect, nothing to go
             wrong. Generate them this way if the split ever misreads.

Usage:  python3 rebuild-reel-audio.py
"""
import json, os, re, subprocess, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

FF = (os.environ.get('FFMPEG')
      or (open('.ffmpeg').read().strip() if os.path.exists('.ffmpeg') else None)
      or shutil.which('ffmpeg'))
if not FF:
    sys.exit('No ffmpeg. Put its path in .ffmpeg, set FFMPEG, or install it\n'
             '(pip install imageio-ffmpeg then\n'
             ' python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())" > .ffmpeg).')

SPEC   = json.load(open('reel-narration.json'))
LINES  = SPEC['lines']
TOTAL  = SPEC['total_seconds']
MUSIC  = SPEC['music']['file']

# Where the picture comes from and where it goes back. Video is COPIED in
# every one of these - this script re-encodes audio only.
WEB    = '../../../meridian-interface-website/public/video'
TARGETS = [
    ('renders/meridian-reel.mp4', 'renders/meridian-reel.mp4',  ['-c:a', 'aac',     '-b:a', '192k']),
    (f'{WEB}/meridian-reel.mp4',  f'{WEB}/meridian-reel.mp4',   ['-c:a', 'aac',     '-b:a', '100k']),
    (f'{WEB}/meridian-reel.webm', f'{WEB}/meridian-reel.webm',  ['-c:a', 'libopus', '-b:a', '96k']),
]


def run(args, capture=False):
    r = subprocess.run([FF, '-y', '-hide_banner', '-v', 'error' if not capture else 'info', *args],
                       capture_output=True, text=True)
    if r.returncode and not capture:
        sys.exit(f'ffmpeg failed:\n{r.stderr}')
    return r.stderr


def duration(path):
    out = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def split_on_pauses(src, want):
    """Cut a single narration file into `want` pieces at its pauses.

    Returns speech spans, not silence: a piece is what lies between two gaps.
    The threshold widens if the first pass finds the wrong number of pieces,
    because a quiet reading and a loud one do not pause at the same level.
    """
    for noise, gap in ((-38, 0.28), (-34, 0.28), (-42, 0.30), (-30, 0.22)):
        log = run(['-i', src, '-af', f'silencedetect=noise={noise}dB:d={gap}', '-f', 'null', '-'],
                  capture=True)
        starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
        ends   = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
        total  = duration(src)
        # Speech runs from 0 (or the first silence_end) to the next silence_start.
        marks, pos = [], 0.0 if not ends or (starts and starts[0] < ends[0]) else ends[0]
        if ends and starts and ends[0] < starts[0]:
            pos = ends[0]
        for i, st in enumerate(starts):
            if st <= pos + 0.05:
                continue
            marks.append((pos, st))
            pos = ends[i] if i < len(ends) else st
        if pos < total - 0.05:
            marks.append((pos, total))
        if len(marks) == want:
            print(f'  split at {noise}dB/{gap}s -> {want} lines')
            return marks
        print(f'  {noise}dB/{gap}s gave {len(marks)} pieces, not {want}')
    sys.exit(f'Could not split {src} into {want} lines. Generate them one per file\n'
             f'into audio/vo-lines/1.mp3 .. {want}.mp3 and run this again.')


def trim(src, dst):
    """Strip the silence a generator pads onto both ends of a clip.

    This is not cosmetic. Six lines of padded audio ran about a second longer
    than the film, so the lines collided with each other; trimmed, they fit.
    Placement depends on a clip starting exactly when the speech does.
    """
    sil = ('silenceremove=start_periods=1:start_duration=0:'
           'start_threshold=-45dB:detection=peak')
    run(['-i', src, '-af', f'{sil},areverse,{sil},areverse', dst])
    return dst


def find_line(i):
    """audio/vo-lines/1.mp3 or .wav - whatever the generator handed back."""
    for ext in ('mp3', 'wav', 'm4a', 'ogg'):
        p = f'audio/vo-lines/{i}.{ext}'
        if os.path.exists(p):
            return p
    return None


# ---- gather the voice, one file per line ----------------------------------
per_line = [find_line(i + 1) for i in range(len(LINES))]
if all(per_line):
    print(f'Using {len(per_line)} per-line files from audio/vo-lines/')
    os.makedirs('audio/.trimmed', exist_ok=True)
    pieces = []
    for i, src in enumerate(per_line):
        raw = duration(src)
        cut = trim(src, f'audio/.trimmed/{i + 1}.wav')
        print(f'  {i + 1}. {os.path.basename(src)}  {raw:.2f}s -> {duration(cut):.2f}s trimmed')
        pieces.append((cut, None, None))
else:
    missing = [str(i + 1) for i, p in enumerate(per_line) if not p]
    if any(per_line):
        sys.exit(f'audio/vo-lines/ is missing line(s): {", ".join(missing)}.\n'
                 'Supply all six, or one audio/vo-reel.mp3 with all six in it.')
    src = 'audio/vo-reel.mp3'
    if not os.path.exists(src):
        sys.exit(f'Need {src} (all six lines) or audio/vo-lines/1..{len(LINES)}.mp3.\n'
                 'The script to read is in reel-narration.json.')
    print(f'Splitting {src} into {len(LINES)} lines')
    pieces = [(src, a, b) for a, b in split_on_pauses(src, len(LINES))]

if not os.path.exists(MUSIC):
    sys.exit(f'Need {MUSIC} - Adobe Stock {SPEC["music"]["asset_id"]}. See reel-narration.json.')

# ---- check each line fits before its neighbour starts ---------------------
inputs, parts, labels = [], [], []
for i, ((path, a, b), line) in enumerate(zip(pieces, LINES)):
    trim = ['-ss', f'{a:.3f}', '-to', f'{b:.3f}'] if a is not None else []
    length = (b - a) if a is not None else duration(path)
    nxt = LINES[i + 1]['start'] if i + 1 < len(LINES) else TOTAL
    over = line['start'] + length - nxt
    flag = f'  OVERRUNS the next line by {over:.2f}s' if over > 0 else ''
    print(f'  {i + 1}. {line["start"]:6.2f}s  {length:4.2f}s{flag}  {line["text"][:52]}')
    if over > 0:
        print('     Shorten the wording, or re-generate that line.')
    inputs += [*trim, '-i', path]
    k = i + 1                                    # input 0 is the video
    d = int(round(line['start'] * 1000))
    parts.append(f'[{k}:a]adelay={d}|{d},aformat=channel_layouts=stereo[l{k}]')
    labels.append(f'[l{k}]')

MUSIC_IN = len(LINES) + 1
parts.append(f'{"".join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0[vo]')
# Same chain the reel was mixed with (compose-reel.py): the voice ducks the
# music under it rather than fighting it, then the whole thing is levelled.
parts.append(f'[vo]volume=1.6,apad=whole_dur={TOTAL:.3f},asplit=2[vx1][vx2]')
parts.append(f'[{MUSIC_IN}:a]atrim=0:{TOTAL:.2f},afade=t=in:st=0:d=0.6,'
             f'afade=t=out:st={TOTAL - 1.8:.2f}:d=1.8,aformat=channel_layouts=stereo[m]')
parts.append('[m][vx1]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500:makeup=1[md]')
parts.append('[md][vx2]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]')
parts.append('[mix]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]')
graph = ';'.join(parts)

# ---- write each target, copying its own video stream ----------------------
for src_v, dst, acodec in TARGETS:
    if not os.path.exists(src_v):
        print(f'  skipped (missing): {src_v}')
        continue
    tmp = dst + '.tmp' + os.path.splitext(dst)[1]
    run(['-i', src_v, *inputs, '-i', MUSIC, '-filter_complex', graph,
         '-map', '0:v', '-map', '[a]', '-c:v', 'copy', *acodec, '-shortest', tmp])
    os.replace(tmp, dst)
    print(f'  wrote {dst}  ({duration(dst):.2f}s)')

print('\nDone. Video untouched, audio rebuilt. Play one before you ship it.')
