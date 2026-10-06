// Cuts the merged film: the hologram design-and-build from our engine, then
// the generated clips (film/clips/*.mp4, see film/clips.md), with the guide's
// voice, the score, captions and the end card.
//   dist/film/meridian-film-merged.mp4   1280x720, 24 fps
// Needs dist/film/meridian-film.mp4 (npm run render:film) and the six clips.
// FFMPEG=/path/to/ffmpeg if it isn't on PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const FF = process.env.FFMPEG || "ffmpeg";
const OUT = "dist/film", TMP = `${OUT}/cut`;
mkdirSync(TMP, { recursive: true });
// The engine pieces: a full render (npm run render:film), or the two partial renders
// FROM=0 TO=44 OUT=dist/film/engine-head.mp4 and FROM=86 TO=92 OUT=dist/film/engine-end.mp4.
const FULL = `${OUT}/meridian-film.mp4`, HEAD = `${OUT}/engine-head.mp4`, END = `${OUT}/engine-end.mp4`;
const partial = existsSync(HEAD) && existsSync(END);
if (!partial && !existsSync(FULL)) throw new Error(`${FULL} missing: run npm run render:film first`);
const clip = (n) => { const f = `film/clips/${n}.mp4`; if (!existsSync(f)) throw new Error(`${f} missing (see film/clips.md)`); return f; };
const XF = 0.6; // crossfade between pieces

// The pieces, in order. speed > 1 slows a clip down (setpts).
const PIECES = [
  { id: "engine", src: partial ? HEAD : FULL, ss: 0, t: 44.0 },
  { id: "C", src: clip("C-becomes-real"), ss: 0, t: 10.0 },
  { id: "D", src: clip("D-welcome"), ss: 0, t: 10.0 },
  { id: "E", src: clip("E-walkthrough"), ss: 0, t: 10.0 },
  { id: "F", src: clip("F-panel"), ss: 0, t: 10.0, speed: 1.25 },
  { id: "tail", src: clip("B-real"), ss: 7.0, t: 3.04 },
  { id: "end", src: partial ? END : FULL, ss: partial ? 0 : 86.0, t: 6.0 },
];
// Normalize each piece: same size, rate and pixel format, no audio.
for (const p of PIECES) {
  p.len = p.t * (p.speed || 1);
  p.file = `${TMP}/${p.id}.mp4`;
  const vf = `${p.speed ? `setpts=${p.speed}*PTS,` : ""}scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`;
  execFileSync(FF, ["-v", "error", "-y", "-ss", String(p.ss), "-t", String(p.t), "-i", p.src, "-an", "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "16", p.file], { stdio: "inherit" });
}
// Where each piece starts on the final timeline (crossfades overlap by XF).
let at = 0;
for (const p of PIECES) { p.start = at; at += p.len - XF; }
const DUR = at + XF;
const S = Object.fromEntries(PIECES.map((p) => [p.id, p.start]));
console.log("timeline:", PIECES.map((p) => `${p.id}@${p.start.toFixed(1)}`).join(" "), `total ${DUR.toFixed(1)}s`);

// The soundtrack on this timeline.
const cues = {
  duration: DUR,
  segments: [[0.0, 2.3, S.D + 5.3], [3.0, 8.4, S.E + 0.8], [8.5, 20.6, S.F + 0.3], [20.6, 25.87, S.tail - 0.2]],
  chords: [0, 13, 24, 33, S.C, S.E, S.F, S.end],
  level: [[0, 0], [4, 0.7], [13, 0.8], [24, 1.0], [33, 0.8], [S.C, 0.9], [S.D, 0.6], [S.tail, 0.7], [S.end + 0.5, 1.15], [S.end + 3, 1.0], [DUR, 0]],
  bells: [5.4, 13.4, 24.4, 33.4, S.C + 0.4],
  swells: [[22.4, 26.2], [S.C - 0.6, S.C + 3.2], [S.tail - 1.2, S.tail + 1.6]],
  door: S.D + 4.6, lock: S.D + 5.4, tap: null, end: S.end + 0.2,
  voice_frames: [S.D, S.end],
};
writeFileSync(`${TMP}/cues.json`, JSON.stringify(cues, null, 1));
execFileSync("python3", ["film/audio.py", FF, TMP, `${TMP}/cues.json`], { stdio: "inherit" });

// Captions for the guide's words (SRT, burned in).
const LINES = [
  [S.D + 5.2, S.D + 6.4, "Welcome home."], [S.D + 6.7, S.D + 7.7, "Come on in."],
  [S.E + 0.9, S.E + 3.2, "I was here from the first line of the sketch."], [S.E + 3.4, S.E + 6.2, "I know every wall, every window, every pipe."],
  [S.F + 0.4, S.F + 1.7, "This is where we’ll talk."], [S.F + 2.0, S.F + 5.9, "I watch the doors, the water, the heat and the air, day and night."],
  [S.F + 6.3, S.F + 8.7, "If something’s wrong, I’ll tell you right away."], [S.F + 9.0, S.F + 12.3, "And I’ll never unlock a door or open the garage unless you say so."],
  [S.tail - 0.1, S.tail + 1.5, "You’re not just living in a house."], [S.tail + 1.6, S.tail + 3.9, "You’re living with something that looks out for you."], [S.tail + 4.1, S.tail + 5.2, "Welcome home."],
];
const ts = (x) => { const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60), ms = Math.round((x % 1) * 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`; };
writeFileSync(`${TMP}/captions.srt`, LINES.map(([a, b, text], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`).join("\n"));

// Crossfade the pieces, burn the captions, add the soundtrack.
const inputs = PIECES.flatMap((p) => ["-i", p.file]);
let chain = "", prev = "[0:v]";
for (let i = 1; i < PIECES.length; i++) {
  const off = (PIECES[i].start).toFixed(3), out = i === PIECES.length - 1 ? "[xf]" : `[v${i}]`;
  chain += `${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off}${out};`;
  prev = out;
}
chain += `[xf]subtitles=${TMP}/captions.srt:force_style='FontName=DejaVu Sans,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,Outline=1,Shadow=0,MarginV=36'[v]`;
execFileSync(FF, ["-v", "error", "-y", ...inputs, "-i", `${TMP}/film-audio.wav`, "-filter_complex", chain, "-map", "[v]", "-map", `${PIECES.length}:a`,
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", "-shortest", `${OUT}/meridian-film-merged.mp4`], { stdio: "inherit" });
console.log(`${OUT}/meridian-film-merged.mp4  ${DUR.toFixed(1)}s`);
