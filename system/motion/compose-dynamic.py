"""Dynamic cut: kinetic title -> swipe -> captioned footage with sliding
lower-thirds -> fade-to-black -> end card that builds itself; voice-over over
ducked, loudness-normalised music. Everything is ffmpeg; nothing leaves the box.

Usage: python3 compose-dynamic.py <raw-dir> <card-prefix> <layer-prefix> <out.mp4> [music] [voiceover]
"""
import json, os, subprocess, sys
FF = open('.ffmpeg').read().strip()
raw, pfx, lpfx, out = sys.argv[1:5]
music = sys.argv[5] if len(sys.argv) > 5 else None
vo    = sys.argv[6] if len(sys.argv) > 6 else None
FPS = 30
src = next(f'{raw}/{f}' for f in os.listdir(raw) if f.endswith('.webm'))
beats = json.load(open(f'{raw}/beats.json'))
BODY = beats['total']
# The recording starts before the script's clock (page load + settle), so the
# webm is longer than `total`; skip that lead-in so beat times line up and the
# un-zoomed loading frames never appear.
import re
probe = subprocess.run([FF,'-hide_banner','-i',src], capture_output=True, text=True).stderr
h,m,sec = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe).groups()
LEAD = max(0.0, int(h)*3600+int(m)*60+float(sec) - BODY - 0.4)
TITLE, END = 2.8, 3.6
X1, X2 = 0.45, 0.6                         # transition lengths
def run(args): subprocess.run([FF, '-y', '-v', 'error', *args], check=True)
def ease(st, d):                            # 1 -> 0 cubic ease-out, starts at st, lasts d
    return f'pow(1-min(max(t-{st},0)/{d},1),3)'

# ---- A. title: layers slide/rise in, rule draws, slow push-in --------------
L = lambda n: f'assets/layers/{lpfx}-{n}.png'
ins = ['-loop','1','-t',str(TITLE),'-i','assets/layers/paper.png']
for n in ('kicker','head0','head1','rule','sub'): ins += ['-loop','1','-t',str(TITLE),'-i',L(n)]
fc = (f"[0:v]fps={FPS},format=yuva420p[b];"
      f"[1:v]format=yuva420p,fade=in:st=0.05:d=0.35:alpha=1[k];[b][k]overlay=x='-420*{ease(0.05,0.5)}':y=0[b1];"
      f"[2:v]format=yuva420p,fade=in:st=0.30:d=0.4:alpha=1[h0];[b1][h0]overlay=x=0:y='70*{ease(0.30,0.6)}'[b2];"
      f"[3:v]format=yuva420p,fade=in:st=0.50:d=0.4:alpha=1[h1];[b2][h1]overlay=x=0:y='70*{ease(0.50,0.6)}'[b3];"
      f"[4:v]format=yuva420p[r];[b3][r]overlay=x=0:y=0:enable='gte(t,0.95)'[b4];"
      # a paper-coloured strip that slides right uncovers the rule left-to-right
      f"color=c=#F5F4EF:s=140x24:r={FPS}:d={TITLE}[strip];[b4][strip]overlay=x='104+136*(1-{ease(0.95,0.45)})':y=1058:enable='between(t,0.95,1.45)'[b5];"
      f"[5:v]format=yuva420p,fade=in:st=1.25:d=0.45:alpha=1[s];[b5][s]overlay=x=0:y='40*{ease(1.25,0.6)}'[b6];"
      f"[b6]zoompan=z='1+0.05*on/{int(TITLE*FPS)}':d=1:s=1080x1920:fps={FPS},format=yuv420p[v]")
run([*ins,'-filter_complex',fc,'-map','[v]','-t',str(TITLE),'-c:v','libx264','-preset','slow','-crf','19','-r',str(FPS),'seg-a.mp4'])

# ---- B. footage with lower-thirds that rise in and settle -----------------
ins = ['-ss',f'{LEAD:.3f}','-t',str(BODY),'-i',src]; parts=[f"[0:v]scale=1080:1920:flags=lanczos,fps={FPS},format=yuva420p[base]"]; chain='[base]'; k=0
for i,b in enumerate(beats['beats']):
    p=f'{pfx}-{b["label"]}.png'
    if not os.path.exists(p): continue
    ins += ['-loop','1','-i',p]; k+=1; s,e=b['start'],b['end']
    parts.append(f"[{k}:v]format=yuva420p,fade=in:st={s:.2f}:d=0.35:alpha=1,fade=out:st={e-0.35:.2f}:d=0.35:alpha=1[c{k}]")
    parts.append(f"{chain}[c{k}]overlay=x=0:y='90*{ease(f'{s:.2f}',0.55)}':enable='between(t,{s:.2f},{e:.2f})'[b{k}]"); chain=f'[b{k}]'
parts.append(f"{chain}format=yuv420p[v]")
run([*ins,'-filter_complex',';'.join(parts),'-map','[v]','-t',str(BODY),'-c:v','libx264','-preset','slow','-crf','20','-r',str(FPS),'seg-b.mp4'])

# ---- C. end card builds: mark rises, wordmark resolves, tagline, url ------
ins=['-loop','1','-t',str(END),'-i','assets/layers/ink.png']
for n in ('end-mark','end-wordmark','end-tagline','end-url'): ins += ['-loop','1','-t',str(END),'-i',f'assets/layers/{n}.png']
fc=(f"[0:v]fps={FPS},format=yuva420p[b];"
    f"[1:v]format=yuva420p,fade=in:st=0.10:d=0.5:alpha=1[m];[b][m]overlay=x=0:y='60*{ease(0.10,0.7)}'[b1];"
    f"[2:v]format=yuva420p,fade=in:st=0.55:d=0.5:alpha=1[w];[b1][w]overlay=x=0:y='40*{ease(0.55,0.7)}'[b2];"
    f"[3:v]format=yuva420p,fade=in:st=1.00:d=0.45:alpha=1[tg];[b2][tg]overlay=x=0:y='30*{ease(1.00,0.6)}'[b3];"
    f"[4:v]format=yuva420p,fade=in:st=1.35:d=0.4:alpha=1[u];[b3][u]overlay=x=0:y='80*{ease(1.35,0.6)}'[b4];"
    f"[b4]zoompan=z='1+0.04*on/{int(END*FPS)}':d=1:s=1080x1920:fps={FPS},format=yuv420p[v]")
run([*ins,'-filter_complex',fc,'-map','[v]','-t',str(END),'-c:v','libx264','-preset','slow','-crf','19','-r',str(FPS),'seg-c.mp4'])

# ---- join with real transitions (swipe in, fade to black out) -------------
o1 = TITLE - X1; o2 = o1 + BODY - X2
run(['-i','seg-a.mp4','-i','seg-b.mp4','-i','seg-c.mp4','-filter_complex',
     f"[0:v][1:v]xfade=transition=slideleft:duration={X1}:offset={o1:.3f}[ab];"
     f"[ab][2:v]xfade=transition=fadeblack:duration={X2}:offset={o2:.3f},format=yuv420p[v]",
     '-map','[v]','-c:v','libx264','-preset','slow','-crf','20','-r',str(FPS),'silent.mp4'])
TOTAL = o2 + END

# ---- audio: voice-over over music that ducks under it ----------------------
if music:
    ins=['-i','silent.mp4','-i',music]; g=[f"[1:a]atrim=0:{TOTAL:.2f},afade=t=in:st=0:d=0.6,afade=t=out:st={TOTAL-1.8:.2f}:d=1.8,aformat=channel_layouts=stereo[m]"]
    if vo:
        vo_start = TITLE + 0.2
        ins += ['-i',vo]
        g.append(f"[2:a]adelay={int(vo_start*1000)}|{int(vo_start*1000)},aformat=channel_layouts=stereo,volume=1.6,apad=whole_dur={TOTAL:.2f},asplit=2[vx1][vx2]")
        g.append("[m][vx1]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500:makeup=1[md]")
        g.append("[md][vx2]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]")
        last='[mix]'
    else: last='[m]'
    g.append(f"{last}loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]")
    run([*ins,'-filter_complex',';'.join(g),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',out])
else:
    os.replace('silent.mp4', out)
print(f'wrote {out}  {TOTAL:.1f}s  (skipped {LEAD:.2f}s of lead-in)')
