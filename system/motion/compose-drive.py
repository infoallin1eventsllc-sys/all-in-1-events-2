"""'Drive' template: word-by-word title with a sweeping band, footage with
beat punches, spring-pop captions and feature chips, a progress bar, a corner
tag, flash + slide transitions, an end card that pops. Music optional.

Usage: python3 compose-drive.py <raw-dir> <set> <out.mp4> [music] [speed]
"""
import json, os, re, subprocess, sys
FF = open('.ffmpeg').read().strip(); FPS = 30; A = 'assets/drive'
raw, key, out = sys.argv[1:4]; music = sys.argv[4] if len(sys.argv) > 4 else None
SPEED = float(sys.argv[5]) if len(sys.argv) > 5 else 1.25
meta = json.load(open(f'{A}/meta.json'))[key]
def run(a): subprocess.run([FF,'-y','-v','error',*a], check=True)
def ease(st, d): return f'pow(1-min(max(t-{st},0)/{d},1),3)'
def dur(p):
    s = subprocess.run([FF,'-hide_banner','-i',p], capture_output=True, text=True).stderr
    h,m,sec = re.search(r'Duration: (\d+):(\d+):([\d.]+)', s).groups(); return int(h)*3600+int(m)*60+float(sec)
src = next(f'{raw}/{f}' for f in os.listdir(raw) if f.endswith('.webm')); beats = json.load(open(f'{raw}/beats.json'))
LEAD = max(0.0, dur(src) - beats['total'] - 0.4); BODY = beats['total']/SPEED
TITLE, END = 2.4, 3.4

# ---- title: words fly up one by one, band sweeps in, sub settles ------------
ins = ['-loop','1','-t',str(TITLE),'-i','assets/layers/paper.png','-loop','1','-t',str(TITLE),'-i',f'{A}/{key}-kicker.png']
fc = [f"[0:v]fps={FPS},format=yuva420p[b0]", f"[1:v]format=yuva420p,fade=in:st=0.05:d=0.3:alpha=1[k]", f"[b0][k]overlay=x='-420*{ease(0.05,0.45)}':y=0[b1]"]
n = 2; chain = '[b1]'
for w in range(meta['words']):
    st = 0.28 + w*0.09; ins += ['-loop','1','-t',str(TITLE),'-i',f'{A}/{key}-w{w}.png']
    fc.append(f"[{n}:v]format=yuva420p,fade=in:st={st:.2f}:d=0.22:alpha=1[w{w}]"); fc.append(f"{chain}[w{w}]overlay=x=0:y='90*{ease(f'{st:.2f}',0.45)}'[bw{w}]"); chain=f'[bw{w}]'; n+=1
ins += ['-loop','1','-t',str(TITLE),'-i',f'{A}/{key}-band.png','-loop','1','-t',str(TITLE),'-i',f'{A}/{key}-sub.png']
fc.append(f"[{n}:v]format=yuva420p[band]"); fc.append(f"{chain}[band]overlay=x='-1080*{ease(0.95,0.4)}':y=0:enable='gte(t,0.95)'[bb]")
fc.append(f"[{n+1}:v]format=yuva420p,fade=in:st=1.2:d=0.4:alpha=1[s]"); fc.append(f"[bb][s]overlay=x=0:y='40*{ease(1.2,0.5)}'[bs]")
fc.append(f"[bs]zoompan=z='1+0.06*on/{int(TITLE*FPS)}':d=1:s=1080x1920:fps={FPS},format=yuv420p[v]")
run([*ins,'-filter_complex',';'.join(fc),'-map','[v]','-t',str(TITLE),'-c:v','libx264','-preset','slow','-crf','19','-r',str(FPS),'d-title.mp4'])

# ---- body ------------------------------------------------------------------
bt = [(b['label'], b['start']/SPEED, b['end']/SPEED) for b in beats['beats']]
bumps = '+'.join(f"max(0,1-abs(on-{int(s*FPS)})/8)" for _,s,_ in bt)
ins = ['-ss',f'{LEAD:.3f}','-t',str(beats['total']),'-i',src,
       '-loop','1','-t',str(BODY),'-i',f'{A}/progress.png','-loop','1','-t',str(BODY),'-i',f'{A}/tag.png']
fc = [f"[0:v]setpts=PTS/{SPEED},scale=1080:1920:flags=lanczos,fps={FPS},zoompan=z='1+0.045*({bumps})':d=1:s=1080x1920:fps={FPS},format=yuva420p[base]",
      f"[1:v]format=yuva420p[bar]", f"[base][bar]overlay=x='-1080+1080*t/{BODY:.2f}':y=0[b1]",
      f"[2:v]format=yuva420p[tag]", f"[b1][tag]overlay=x=0:y='-90*{ease(0.2,0.5)}'[b2]"]
chain='[b2]'; n=3
def seq(path, frames, st, en, tag):
    """A pop sequence at st (0.6 s) then its static frame held until en."""
    global n, chain
    ins.extend(['-framerate',str(FPS),'-start_number','0','-i',f'{path}_%03d.png','-loop','1','-t',str(BODY),'-i',f'{path}.png'])
    L = frames/FPS
    fc.append(f"[{n}:v]format=yuva420p,setpts=PTS+{st:.3f}/TB[{tag}s]"); fc.append(f"{chain}[{tag}s]overlay=x=0:y=0:eof_action=pass:enable='between(t,{st:.3f},{st+L-0.01:.3f})'[{tag}a]")
    fc.append(f"[{n+1}:v]format=yuva420p,fade=out:st={en-0.25:.2f}:d=0.25:alpha=1[{tag}h]"); fc.append(f"[{tag}a][{tag}h]overlay=x=0:y=0:enable='between(t,{st+L-0.01:.3f},{en:.3f})'[{tag}b]")
    chain=f'[{tag}b]'; n+=2
for i,(label,s,e) in enumerate(bt):
    seq(f'{A}/{key}-{label}-cap', 18, s, e, f'c{i}')
    for k in range(meta['chips'][i]): seq(f'{A}/{key}-{label}-chip{k}', 14, s+0.28+0.14*k, e, f'c{i}k{k}')
fc.append(f"{chain}format=yuv420p[v]")
run([*ins,'-filter_complex',';'.join(fc),'-map','[v]','-t',f'{BODY:.3f}','-c:v','libx264','-preset','slow','-crf','20','-r',str(FPS),'d-body.mp4'])

# ---- end card: mark pops, wordmark resolves, url pops ---------------------
ins=['-loop','1','-t',str(END),'-i','assets/layers/ink.png',
     '-framerate',str(FPS),'-start_number','0','-i',f'{A}/end-mark_%03d.png','-loop','1','-t',str(END),'-i',f'{A}/end-mark.png',
     '-loop','1','-t',str(END),'-i','assets/layers/end-wordmark.png','-loop','1','-t',str(END),'-i','assets/layers/end-tagline.png',
     '-framerate',str(FPS),'-start_number','0','-i',f'{A}/end-url_%03d.png','-loop','1','-t',str(END),'-i',f'{A}/end-url.png']
fc=(f"[0:v]fps={FPS},format=yuva420p[b];"
    f"[1:v]format=yuva420p,setpts=PTS+0.1/TB[ms];[b][ms]overlay=x=0:y=0:eof_action=pass:enable='between(t,0.1,0.82)'[b1];"
    f"[2:v]format=yuva420p[mh];[b1][mh]overlay=x=0:y=0:enable='gte(t,0.82)'[b2];"
    f"[3:v]format=yuva420p,fade=in:st=0.6:d=0.45:alpha=1[w];[b2][w]overlay=x=0:y='40*{ease(0.6,0.6)}'[b3];"
    f"[4:v]format=yuva420p,fade=in:st=1.0:d=0.4:alpha=1[tg];[b3][tg]overlay=x=0:y='30*{ease(1.0,0.5)}'[b4];"
    f"[5:v]format=yuva420p,setpts=PTS+1.35/TB[us];[b4][us]overlay=x=0:y=0:eof_action=pass:enable='between(t,1.35,1.87)'[b5];"
    f"[6:v]format=yuva420p[uh];[b5][uh]overlay=x=0:y=0:enable='gte(t,1.87)'[b6];"
    f"[b6]zoompan=z='1+0.04*on/{int(END*FPS)}':d=1:s=1080x1920:fps={FPS},format=yuv420p[v]")
run([*ins,'-filter_complex',fc,'-map','[v]','-t',str(END),'-c:v','libx264','-preset','slow','-crf','19','-r',str(FPS),'d-end.mp4'])

# ---- join: flash into the footage, slide up into the end card ---------------
X1, X2 = 0.35, 0.5; o1 = TITLE - X1; o2 = o1 + BODY - X2; TOTAL = o2 + END
run(['-i','d-title.mp4','-i','d-body.mp4','-i','d-end.mp4','-filter_complex',
     f"[0:v][1:v]xfade=transition=fadewhite:duration={X1}:offset={o1:.3f}[ab];[ab][2:v]xfade=transition=slideup:duration={X2}:offset={o2:.3f},format=yuv420p[v]",
     '-map','[v]','-c:v','libx264','-preset','slow','-crf','20','-r',str(FPS),'d-silent.mp4'])
if music:
    run(['-i','d-silent.mp4','-i',music,'-filter_complex',
         f"[1:a]atrim=0:{TOTAL:.2f},afade=t=in:st=0:d=0.4,afade=t=out:st={TOTAL-1.5:.2f}:d=1.5,loudnorm=I=-15:TP=-1.2:LRA=9,aresample=48000[a]",
         '-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',out])
else: os.replace('d-silent.mp4', out)
print(f'wrote {out}  {TOTAL:.1f}s  (body {BODY:.1f}s at {SPEED}x, lead {LEAD:.2f}s)')
