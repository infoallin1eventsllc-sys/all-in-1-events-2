"""Three-product reel: kinetic title -> phone app -> two dashboards framed as
panels on a brand background -> end card. Each product segment is a window of
its recording, gently sped up, with captions placed from the recorded beats.
Voice-over over ducked music."""
import json, os, re, subprocess
FF = open('.ffmpeg').read().strip(); FPS = 30
def run(a): subprocess.run([FF,'-y','-v','error',*a], check=True)
def ease(st, d): return f'pow(1-min(max(t-{st},0)/{d},1),3)'
def dur(path):
    p = subprocess.run([FF,'-hidebanner' if False else '-hide_banner','-i',path], capture_output=True, text=True).stderr
    h,m,s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', p).groups(); return int(h)*3600+int(m)*60+float(s)
def raw(d):
    src = next(f'{d}/{f}' for f in os.listdir(d) if f.endswith('.webm')); b = json.load(open(f'{d}/beats.json'))
    return src, b, max(0.0, dur(src) - b['total'] - 0.4)

TITLE, END, X = 2.8, 4.2, 0.5
# (dir, caption prefix, start offset into the recording, window seconds, speed, framing)
# Big Boy Subs starts at the menu so the window reaches the merch screen the
# narration mentions; the hero is implied by the title card.
SEGS = [('raw-bbs2', 'assets/reel-bbs', 8.5, 11.6, 1.3, 'phone'),
        ('raw-fin',  'assets/fin',      0.0, 11.9, 1.4, 'panel'),
        ('raw-stack','assets/stack',    0.0, 12.75,1.5, 'panel')]

# ---- title -----------------------------------------------------------------
L = lambda n: f'assets/layers/reel-{n}.png'
ins = ['-loop','1','-t',str(TITLE),'-i','assets/layers/paper.png']
for n in ('kicker','head0','head1','rule','sub'): ins += ['-loop','1','-t',str(TITLE),'-i',L(n)]
fc = (f"[0:v]fps={FPS},format=yuva420p[b];"
      f"[1:v]format=yuva420p,fade=in:st=0.05:d=0.35:alpha=1[k];[b][k]overlay=x='-420*{ease(0.05,0.5)}':y=0[b1];"
      f"[2:v]format=yuva420p,fade=in:st=0.30:d=0.4:alpha=1[h0];[b1][h0]overlay=x=0:y='70*{ease(0.30,0.6)}'[b2];"
      f"[3:v]format=yuva420p,fade=in:st=0.50:d=0.4:alpha=1[h1];[b2][h1]overlay=x=0:y='70*{ease(0.50,0.6)}'[b3];"
      f"[4:v]format=yuva420p[r];[b3][r]overlay=x=0:y=0:enable='gte(t,0.95)'[b4];"
      f"color=c=#F5F4EF:s=140x24:r={FPS}:d={TITLE}[strip];[b4][strip]overlay=x='104+136*(1-{ease(0.95,0.45)})':y=1038:enable='between(t,0.95,1.45)'[b5];"
      f"[5:v]format=yuva420p,fade=in:st=1.25:d=0.45:alpha=1[s];[b5][s]overlay=x=0:y='40*{ease(1.25,0.6)}'[b6];"
      f"[b6]zoompan=z='1+0.05*on/{int(TITLE*FPS)}':d=1:s=1080x1920:fps={FPS},format=yuv420p[v]")
run([*ins,'-filter_complex',fc,'-map','[v]','-t',str(TITLE),'-c:v','libx264','-preset','slow','-crf','19','-r',str(FPS),'r-title.mp4'])

# ---- product segments ------------------------------------------------------
seg_files, seg_len = [], []
for n,(d,pfx,start,win,speed,framing) in enumerate(SEGS):
    src,b,lead = raw(d); length = win/speed
    ins = ['-ss',f'{lead+start:.3f}','-t',str(win),'-i',src]
    if framing == 'phone':
        parts=[f"[0:v]setpts=PTS/{speed},scale=1080:1920:flags=lanczos,fps={FPS},format=yuva420p[base]"]
    else:
        ins += ['-loop','1','-t',str(length),'-i','assets/layers/panel-bg.png']
        parts=[f"[0:v]setpts=PTS/{speed},scale=1080:1512:flags=lanczos,fps={FPS}[p];"
               f"[1:v]fps={FPS},format=yuva420p[bg];[bg][p]overlay=x=0:y=150[base]"]
    chain='[base]'; k=1 if framing=='phone' else 2
    for i,bt in enumerate(b['beats']):
        p=f'{pfx}-{bt["label"]}.png'
        bs, be = bt['start']-start, bt['end']-start
        if not os.path.exists(p) or be <= 0.6 or bs/speed >= length-0.8: continue
        s,e = max(bs,0.15)/speed, min(be/speed, length-0.05)
        ins += ['-loop','1','-t',str(length),'-i',p]
        parts.append(f"[{k}:v]format=yuva420p,fade=in:st={s:.2f}:d=0.35:alpha=1,fade=out:st={e-0.35:.2f}:d=0.35:alpha=1[c{k}]")
        parts.append(f"{chain}[c{k}]overlay=x=0:y='70*{ease(f'{s:.2f}',0.55)}':enable='between(t,{s:.2f},{e:.2f})'[b{k}]"); chain=f'[b{k}]'; k+=1
    push = f",zoompan=z='1+0.035*on/{int(length*FPS)}':d=1:s=1080x1920:fps={FPS}" if framing=='panel' else ''
    parts.append(f"{chain}format=yuv420p{push},format=yuv420p[v]")
    out=f'r-seg{n}.mp4'; run([*ins,'-filter_complex',';'.join(parts),'-map','[v]','-t',f'{length:.3f}','-c:v','libx264','-preset','slow','-crf','20','-r',str(FPS),out])
    seg_files.append(out); seg_len.append(length)

# ---- end card --------------------------------------------------------------
ins=['-loop','1','-t',str(END),'-i','assets/layers/ink.png']
for n in ('end-mark','end-wordmark','end-tagline','end-url'): ins += ['-loop','1','-t',str(END),'-i',f'assets/layers/{n}.png']
fc=(f"[0:v]fps={FPS},format=yuva420p[b];"
    f"[1:v]format=yuva420p,fade=in:st=0.10:d=0.5:alpha=1[m];[b][m]overlay=x=0:y='60*{ease(0.10,0.7)}'[b1];"
    f"[2:v]format=yuva420p,fade=in:st=0.55:d=0.5:alpha=1[w];[b1][w]overlay=x=0:y='40*{ease(0.55,0.7)}'[b2];"
    f"[3:v]format=yuva420p,fade=in:st=1.00:d=0.45:alpha=1[tg];[b2][tg]overlay=x=0:y='30*{ease(1.00,0.6)}'[b3];"
    f"[4:v]format=yuva420p,fade=in:st=1.35:d=0.4:alpha=1[u];[b3][u]overlay=x=0:y='80*{ease(1.35,0.6)}'[b4];"
    f"[b4]zoompan=z='1+0.04*on/{int(END*FPS)}':d=1:s=1080x1920:fps={FPS},format=yuv420p[v]")
run([*ins,'-filter_complex',fc,'-map','[v]','-t',str(END),'-c:v','libx264','-preset','slow','-crf','19','-r',str(FPS),'r-end.mp4'])

# ---- join ------------------------------------------------------------------
files=['r-title.mp4',*seg_files,'r-end.mp4']; lens=[TITLE,*seg_len,END]
trans=['slideleft','slideup','slideleft','fadeblack']
ins=[]; [ins.extend(['-i',f]) for f in files]
fc=[]; prev='[0:v]'; off=0.0
for i in range(1,len(files)):
    off += lens[i-1] - X; lab=f'[x{i}]' if i<len(files)-1 else '[v]'
    fc.append(f"{prev}[{i}:v]xfade=transition={trans[i-1]}:duration={X}:offset={off:.3f}{',format=yuv420p' if lab=='[v]' else ''}{lab}"); prev=lab
TOTAL = off + END
run([*ins,'-filter_complex',';'.join(fc),'-map','[v]','-c:v','libx264','-preset','slow','-crf','20','-r',str(FPS),'r-silent.mp4'])

# ---- audio -----------------------------------------------------------------
music, vo, out = 'audio/building-the-future.wav', 'audio/vo-brian-reel.mp3', 'meridian-reel.mp4'
vs = TITLE + 0.1
g=[f"[1:a]atrim=0:{TOTAL:.2f},afade=t=in:st=0:d=0.6,afade=t=out:st={TOTAL-1.8:.2f}:d=1.8,aformat=channel_layouts=stereo[m]",
   f"[2:a]adelay={int(vs*1000)}|{int(vs*1000)},aformat=channel_layouts=stereo,volume=1.6,apad=whole_dur={TOTAL:.2f},asplit=2[vx1][vx2]",
   "[m][vx1]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500:makeup=1[md]",
   "[md][vx2]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]",
   "[mix]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]"]
run(['-i','r-silent.mp4','-i',music,'-i',vo,'-filter_complex',';'.join(g),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',out])
print(f'wrote {out}  {TOTAL:.1f}s  segments={["%.1f"%l for l in lens]}')
