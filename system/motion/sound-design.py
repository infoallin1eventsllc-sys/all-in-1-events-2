"""Sound design for the Clipkit reel, timed to its snaps: synthesised UI
clicks/chimes, noise risers, a bass swell and a synth hit, over the licensed
synth bed (looped) and the licensed whoosh on scene changes. Output is the
finished 24 s stereo mix to mux under the rendered picture."""
import subprocess, os
FF = open('.ffmpeg').read().strip(); T = 24.0
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
# --- cue sheet (seconds) — mirrors the composition's element times ----------
cues = []
cues += [('click', t, 0.55) for t in (0.2, 0.9, 1.4, 1.9, 2.1, 2.3, 2.6, 2.7, 2.8, 2.9)]
cues += [('riser', 2.6, 0.7), ('chime', 3.6, 0.9), ('click', 3.75, 0.5), ('click', 3.9, 0.5), ('click', 4.0, 0.5), ('chime', 4.3, 0.6)]
cues += [('whoosh', 5.25, 0.8), ('click', 5.8, 0.5), ('click', 5.92, 0.5), ('click', 6.04, 0.5), ('click', 6.16, 0.5)]
cues += [('click', t, 0.35) for t in (6.7, 6.88, 7.06, 7.24, 7.42)] + [('chime', 8.6, 0.8)]
cues += [('whoosh', 10.75, 0.8)] + [('click', 11.4 + 0.09*k, 0.5) for k in range(7)] + [('riser', 12.9, 0.55), ('chime', 13.8, 0.6), ('chime', 14.0, 0.9)]
cues += [('whoosh', 15.75, 0.8)] + [('click', 16.0 + 0.11*k, 0.5) for k in range(8)] + [('riser', 17.6, 0.6), ('chime', 18.5, 0.9), ('chime', 19.15, 0.6)]
cues += [('swell', 19.2, 1.0), ('hit', 20.4, 1.0), ('riser', 20.3, 0.5), ('chime', 21.0, 0.5), ('chime', 24.0 - 1.2, 0.5)]
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
