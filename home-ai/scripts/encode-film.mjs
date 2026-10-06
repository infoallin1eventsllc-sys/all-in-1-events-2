// Encodes the merged film for the web (after npm run assemble:film):
//   dist/film/meridian-film-merged-share.mp4 / .webm   the full film, for the site and for sending
//   dist/film/meridian-film-hero.mp4 / .webm           the landing page's short cut: from HERO_FROM
//                                                     (the walls rising) to the end, with a fade in
// FFMPEG=/path/to/ffmpeg if it isn't on PATH.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const FF = process.env.FFMPEG || "ffmpeg", IN = "dist/film/meridian-film-merged.mp4", HERO_FROM = 24.0;
if (!existsSync(IN)) throw new Error(`${IN} missing: run npm run assemble:film first`);
const run = (args) => execFileSync(FF, ["-v", "error", "-y", ...args], { stdio: "inherit" });
// Every file stays under 15 MB (the host's limit per file): the video bitrate is capped by length.
const cap = (seconds, audioK) => `${Math.floor((14.2 * 8192 / seconds) - audioK)}k`; // kbit/s of video for ~14.2 MB
const FULL = 92, HERO = FULL - HERO_FROM;
const mp4 = (kb) => ["-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-b:v", kb, "-maxrate", kb, "-bufsize", "2M", "-c:a", "aac", "-b:a", "128k"];
const webm = (kb) => ["-c:v", "libvpx-vp9", "-b:v", kb, "-maxrate", kb, "-row-mt", "1", "-deadline", "good", "-cpu-used", "3", "-c:a", "libopus", "-b:a", "96k"];
run(["-i", IN, ...mp4(cap(FULL, 128)), "dist/film/meridian-film-merged-share.mp4"]);
run(["-i", IN, ...webm(cap(FULL, 96)), "dist/film/meridian-film-merged-share.webm"]);
const cut = ["-ss", String(HERO_FROM), "-i", IN, "-vf", "fade=t=in:st=0:d=0.6", "-af", "afade=t=in:st=0:d=0.6"];
run([...cut, ...mp4(cap(HERO, 128)), "dist/film/meridian-film-hero.mp4"]);
run([...cut, ...webm(cap(HERO, 96)), "dist/film/meridian-film-hero.webm"]);
console.log("film encodes ok");
