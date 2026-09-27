// Builds the film page as one self-contained HTML file:
//   dist/film/meridian-film.html  (the film, its code and its soundtrack inlined)
// Needs ffmpeg (on PATH, or FFMPEG=/path/to/ffmpeg) and Python 3 with numpy.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FF = process.env.FFMPEG || "ffmpeg";
const OUT = "dist/film";
mkdirSync(OUT, { recursive: true });

execFileSync("python3", ["film/audio.py", FF, OUT], { stdio: "inherit" });
execFileSync(FF, ["-v", "error", "-y", "-i", `${OUT}/film-audio.wav`, "-c:a", "libmp3lame", "-b:a", "160k", `${OUT}/film-audio.mp3`], { stdio: "inherit" });

const voice = readFileSync(`${OUT}/voice-env.json`, "utf8");
const js = await build({
  entryPoints: ["film/main.js"], bundle: true, format: "esm", minify: true, write: false, target: "es2020",
  define: { __VOICE__: voice },
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const audio = readFileSync(`${OUT}/film-audio.mp3`).toString("base64");
const html = readFileSync("film/index.html", "utf8")
  .replace('<script type="module" src="main.js"></script>', () => `<script type="module">${code}</script>`)
  .replace('src="film-audio.mp3"', () => `src="data:audio/mpeg;base64,${audio}"`);
writeFileSync(`${OUT}/meridian-film.html`, html);
// The same page for publishing as an Artifact, which supplies its own document wrapper.
const body = html.replace(/^[\s\S]*?<head>/, "").replace(/<\/head>\s*<body>/, "").replace(/<\/body>\s*<\/html>\s*$/, "").replace(/<meta [^>]*>\s*/g, "");
writeFileSync(`${OUT}/meridian-film.artifact.html`, body);
console.log(`${OUT}/meridian-film.html  ${Math.round(html.length / 1024)} KB`);
