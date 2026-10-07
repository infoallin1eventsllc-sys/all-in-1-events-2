// Encodes the merged film for the web (after npm run assemble:film):
//   dist/film/meridian-film-merged-share.mp4 / .webm   the full film, for the site and for sending
//   dist/film/meridian-film-hero.mp4 / .webm           the landing page's short cut: from HERO_FROM
//                                                     (the walls rising) to the end, with a fade in
// FFMPEG=/path/to/ffmpeg if it isn't on PATH.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// The short cut runs from the walls rising to the pull-back, and stops before the end card, so
// its words never sit under the page's own headline while it loops.
const FF = process.env.FFMPEG || "ffmpeg", IN = "dist/film/meridian-film-merged.mp4", HERO_FROM = 24.0;
if (!existsSync(IN)) throw new Error(`${IN} missing: run npm run assemble:film first`);
const run = (args) => execFileSync(FF, ["-v", "error", "-y", ...args], { stdio: "inherit" });
// The film's length, from the file itself; the end card is its last 6 s (assemble-film's "end" piece).
const probe = spawnSync(FF, ["-i", IN], { encoding: "utf8" }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
if (!probe) throw new Error(`${IN}: can't read its duration`);
const FULL = (+probe[1]) * 3600 + (+probe[2]) * 60 + (+probe[3]), HERO_TO = FULL - 6.3;
// Every file stays under 15 MB (the host's limit per file): the video bitrate is capped by length.
const cap = (seconds, audioK) => `${Math.floor((14.2 * 8192 / seconds) - audioK)}k`; // kbit/s of video for ~14.2 MB
const HERO = HERO_TO - HERO_FROM;
console.log(`film ${FULL.toFixed(1)}s, short cut ${HERO_FROM}-${HERO_TO.toFixed(1)}s`);
const mp4 = (kb) => ["-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-b:v", kb, "-maxrate", kb, "-bufsize", "2M", "-c:a", "aac", "-b:a", "128k"];
const webm = (kb) => ["-c:v", "libvpx-vp9", "-b:v", kb, "-maxrate", kb, "-row-mt", "1", "-deadline", "good", "-cpu-used", "3", "-c:a", "libopus", "-b:a", "96k"];
run(["-i", IN, ...mp4(cap(FULL, 128)), "dist/film/meridian-film-merged-share.mp4"]);
run(["-i", IN, ...webm(cap(FULL, 96)), "dist/film/meridian-film-merged-share.webm"]);
const cut = ["-ss", String(HERO_FROM), "-t", String(HERO), "-i", IN, "-vf", `fade=t=in:st=0:d=0.6,fade=t=out:st=${HERO - 0.8}:d=0.8`, "-af", `afade=t=in:st=0:d=0.6,afade=t=out:st=${HERO - 0.8}:d=0.8`];
run([...cut, ...mp4(cap(HERO, 128)), "dist/film/meridian-film-hero.mp4"]);
run([...cut, ...webm(cap(HERO, 96)), "dist/film/meridian-film-hero.webm"]);
console.log("film encodes ok");
