// The client showroom (showroom/index.html) with every built page beside it:
//   dist/showroom/index.html          the app shell
//   panel-<finish>.html               the demos (npm run build:demo)
//   film.html, meridian.mp4           the film page and the merged cut
//   meridian.html, residence.html     the sites (npm run build:sites)
//   library.html                      the catalog (npm run build:catalog)
// Publish dist/showroom/index.html with the other files as its `files`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "dist/showroom";
mkdirSync(OUT, { recursive: true });
const FILES = {
  "index.html": "showroom/index.html",
  "panel-grounded.html": "dist/demo/haven-grounded.html",
  "panel-futuristic.html": "dist/demo/haven-futuristic.html",
  "panel-vivid.html": "dist/demo/haven-vivid.html",
  "film.html": "dist/film/meridian-film.html",
  "meridian-film.mp4": "dist/film/meridian-film-merged-share.mp4",
  "poster.jpg": "docs/poster.jpg",
  "meridian.html": "dist/site/meridian.html",
  "residence.html": "dist/site/residence.html",
  "library.html": "dist/catalog/haven-screen-library.html",
};
const missing = Object.values(FILES).filter((f) => !existsSync(f));
if (missing.length) throw new Error(`missing: ${missing.join(", ")} (run build:demo, build:film, assemble:film, build:sites, build:catalog)`);
for (const [to, from] of Object.entries(FILES)) {
  if (!to.endsWith(".html")) { copyFileSync(from, `${OUT}/${to}`); continue; }
  // The demo and catalog builds write a bare <html>; served as their own pages they need a doctype.
  let html = readFileSync(from, "utf8");
  if (!/name="viewport"/.test(html)) html = `<meta name="viewport" content="width=device-width, initial-scale=1">\n${html}`;
  if (!/^\s*<!doctype/i.test(html)) html = `<!doctype html>\n${html}`;
  writeFileSync(`${OUT}/${to}`, html);
}
console.log(`${OUT}/: ${Object.keys(FILES).length} files`);
