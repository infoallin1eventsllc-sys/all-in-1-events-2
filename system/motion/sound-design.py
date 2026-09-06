"""Sound design for the Clipkit reel, timed to its snaps: synthesised UI
clicks/chimes, noise risers, a bass swell and a synth hit, over the licensed
synth bed (looped) and the licensed whoosh on scene changes. Output is the
finished 24 s stereo mix to mux under the rendered picture."""
import subprocess, os
FF = open('.ffmpeg').read().strip()
os.makedirs('sfx', exist_ok=True)
def run(a): subprocess.run([FF,'-y','-v','error',*a], check=True)
# --- one-shots ---------------------------------------------------------------
run(['-f','lavfi','-i','sine=f=1900:d=0.06','-f','lavfi','-i','anoisesrc=c=white:d=0.03:a=0.5',
     '-filter_complex','[0:a]afade=t=out:st=0:d=0.06[s];[1:a]afade=t=out:st=0:d=0.03,highpass=f=3000[n];[s][n]amix=inputs=2:normalize=0,volume=0.9[a]','-map','[a]','sfx/click.wav'])
run(['-f','lavfi','-i','sine=f=880:d=0.35','-f','lavfi','-i','sine=f=1320:d=0.35',
     '-filter_complex','[0:a]afade=t=out:st=0.02:d=0.33[a0];[1:a]afade=t=out:st=0.0:d=0.25,volume=0.5[a1];[a0][a1]amix=inputs=2:normalize=0,volume=0.8[a]','-map','[a]','sfx/chime.wav'])
run(['-f','lavfi','-i','anoisesrc=c=pink:d=1.0:a=0.9',
     '-filter_complex',"[0:a]afade=t=in:st=0:d=0.9,bandpass=f=1400:w=1200,volume=0.9[a]",'-map','[a]','sfx/riser.wav'])
run(['-f','lavfi','-i','sine=f=55:d=1.3','-f','lavfi','-i','sine=f=110:d=1.3',
     '-filter_complex','[0:a]afade=t=in:st=0:d=1.1,afade=t=out:st=1.1:d=0.2[a0];[1:a]afade=t=in:st=0:d=1.1,afade=t=out:st=1.1:d=0.2,volume=0.35[a1];[a0][a1]amix=inputs=2:normalize=0,volume=1.6[a]','-map','[a]','sfx/swell.wav'])
run(['-f','lavfi','-i','sine=f=220:d=1.6','-f','lavfi','-i','sine=f=330:d=1.6','-f','lavfi','-i','sine=f=440:d=1.6','-f','lavfi','-i','sine=f=1760:d=1.6','-f','lavfi','-i','anoisesrc=c=white:d=0.05:a=0.6',
     '-filter_complex','[0:a][1:a][2:a]amix=inputs=3:normalize=0,afade=t=out:st=0.1:d=1.5[ch];[3:a]afade=t=out:st=0:d=0.5,volume=0.35[pg];[4:a]afade=t=out:st=0:d=0.05,highpass=f=2000[tr];[ch][pg][tr]amix=inputs=3:normalize=0,volume=1.1[a]','-map','[a]','sfx/hit.wav'])
# --- cue sheet (seconds) — mirrors the composition's element times (v2, 47 s) --
T = 47.0
cues = []
cues += [('click', 0.2, 0.5), ('click', 0.5, 0.4)] + [('chime', t, 0.35) for t in (1.2, 1.7, 2.3, 2.8)] + [('click', 3.5 + 0.15*k, 0.4) for k in range(4)]
cues += [('click', t, 0.55) for t in (5.3, 6.0, 6.6, 7.1, 7.35, 7.6)] + [('click', 7.7 + 0.12*k, 0.35) for k in range(4)]
cues += [('riser', 7.6, 0.7), ('chime', 8.6, 0.9)] + [('click', t, 0.45) for t in (8.75, 8.9, 9.0, 9.12, 9.24)] + [('chime', 9.6, 0.6)]
cues += [('whoosh', 11.0, 0.8), ('click', 11.4, 0.4), ('chime', 11.7, 0.35), ('chime', 12.0, 0.35)] + [('click', 12.6 + 0.14*k, 0.25) for k in range(5)] + [('chime', 13.2, 0.6)] + [('click', 13.9 + 0.16*k, 0.4) for k in range(4)]
cues += [('whoosh', 16.6, 0.8), ('click', 17.2, 0.4)] + [('click', 17.6 + 0.14*k, 0.45) for k in range(6)] + [('riser', 18.9, 0.5), ('click', 19.8, 0.7), ('chime', 20.1, 0.9)]
cues += [('whoosh', 22.2, 0.8)] + [('click', 22.9 + 0.15*k, 0.45) for k in range(4)] + [('click', 23.4 + 0.15*k, 0.25) for k in range(4)] + [('click', 24.15 + 0.2*k, 0.35) for k in range(5)] + [('click', 24.6 + 0.1*k, 0.25) for k in range(8)] + [('chime', 26.4, 0.8)]
cues += [('whoosh', 28.0, 0.8), ('chime', 28.7, 0.5)] + [('click', 28.9 + 0.07*k, 0.25) for k in range(7)] + [('click', 29.1 + 0.15*k, 0.45) for k in range(3)] + [('click', 30.5 + 0.1*k, 0.4) for k in range(7)] + [('riser', 31.8, 0.55), ('chime', 32.8, 0.5), ('chime', 33.0, 0.9)]
cues += [('whoosh', 33.8, 0.8)] + [('chime', t, 0.35) for t in (34.5, 34.8, 35.1)] + [('click', 35.2 + 0.32*k, 0.6) for k in range(5)] + [('riser', 37.4, 0.6), ('chime', 38.7, 0.8)]
cues += [('whoosh', 39.4, 0.8)] + [('click', 39.6 + 0.12*k, 0.5) for k in range(8)] + [('riser', 41.6, 0.6), ('chime', 42.2, 0.9), ('chime', 43.0, 0.6)]
cues += [('swell', 42.9, 1.0), ('riser', 43.9, 0.5), ('hit', 44.0, 1.0), ('chime', 44.6, 0.5), ('chime', 45.4, 0.4)]
ins = ['-stream_loop','-1','-i','audio/modern-electronic-loop-2.wav']
parts = [f"[0:a]atrim=0:{T},afade=t=in:st=0:d=0.3,afade=t=out:st={T-1.6}:d=1.6,volume=0.85[bed]"]
labels = ['[bed]']
for k,(kind,t,vol) in enumerate(cues):
    src = 'audio/whoosh.wav' if kind == 'whoosh' else f'sfx/{kind}.wav'
    ins += ['-i', src]; ms = int(t*1000)
    parts.append(f"[{k+1}:a]aformat=channel_layouts=stereo,adelay={ms}|{ms},volume={vol}[c{k}]"); labels.append(f'[c{k}]')
parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:normalize=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.0:LRA=8,aresample=48000[a]")
run([*ins,'-filter_complex',';'.join(parts),'-map','[a]','-t',str(T),'-c:a','pcm_s16le','reel-sound-design.wav'])
print('wrote reel-sound-design.wav with', len(cues), 'cues')
