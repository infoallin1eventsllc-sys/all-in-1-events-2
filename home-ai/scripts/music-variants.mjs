// Remix the finished film with alternative music beds, without re-rendering the picture.
// Usage: FFMPEG=... node scripts/music-variants.mjs film/music/*.mp3
// For each bed: dist/film/variants/<name>.mp4 (same cues, voice, chime and captions as the film).
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
const FF = process.env.FFMPEG || "ffmpeg";
const OUT = "dist/film/variants", TMP = "dist/film/cut";
if (!existsSync(`${TMP}/cues.json`)) throw new Error("run npm run assemble:film first (dist/film/cut/cues.json)");
mkdirSync(OUT, { recursive: true });
const beds = process.argv.slice(2);
if (!beds.length) throw new Error("give one or more music files");
for (const bed of beds) {
  const name = basename(bed).replace(/\.[^.]+$/, "");
  execFileSync("python3", ["film/audio.py", FF, `${OUT}`, `${TMP}/cues.json`], { stdio: "inherit", env: { ...process.env, MUSIC: bed } });
  const file = `${OUT}/${name}.mp4`;
  // Picture from the finished film, audio from the new mix; capped bitrate so it stays under 15 MB.
  execFileSync(FF, ["-v", "error", "-y", "-i", "dist/film/meridian-film-merged.mp4", "-i", `${OUT}/film-audio.wav`, "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-b:v", "1200k", "-maxrate", "1300k", "-bufsize", "2600k", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k", "-shortest", file], { stdio: "inherit" });
  console.log(file, (statSync(file).size / 1048576).toFixed(1), "MB");
}
