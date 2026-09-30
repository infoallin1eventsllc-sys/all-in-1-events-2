// Builds the two scroll sites as self-contained pages:
//   dist/site/meridian.html   Meridian Interface: scrolling builds the home
//   dist/site/residence.html  Linden House: a property-site template
// Each also gets a .artifact.html copy without the document wrapper, for publishing.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { HOME } from "../film/film.js";
import { compareMarkup } from "../site/compare.js";

// The before/after rooms (scripts/room-stills.mjs renders the stills).
const ROOMS = [["kitchen", "The island under three pendants."], ["living", "Glass to the garden, the fireplace wall, the sofa."], ["dining", "Six chairs, one long walnut table."], ["hall", "The stairs, and the panel on the wall."], ["primary", "Upstairs, facing north."], ["study", "Over the living room, opening onto the terrace."]]
  .map(([id, note]) => ({ id, name: HOME.rooms.find((r) => r.id === id).name, note }));
const still = (id, side) => { const f = `dist/site/stills/${id}-${side}.jpg`; if (!existsSync(f)) throw new Error(`${f} missing: run node scripts/room-stills.mjs first`); return `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`; };
const compareCSS = readFileSync("site/compare.css", "utf8");
const labels = { meridian: ["Before \u00b7 structure", "After \u00b7 furnished, lit"], residence: ["Structure", "Furnished"] };

mkdirSync("dist/site", { recursive: true });
for (const name of ["meridian", "residence"]) {
  const js = await build({ entryPoints: [`site/${name}/main.js`], bundle: true, format: "esm", minify: true, write: false, target: "es2020", define: { __VOICE__: "[]" } });
  const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = readFileSync(`site/${name}/index.html`, "utf8")
    .replace('<script type="module" src="main.js"></script>', () => `<script type="module">${code}</script>`)
    .replace("/*__COMPARE_CSS__*/", () => compareCSS)
    .replace("<!--__COMPARE__-->", () => compareMarkup({ rooms: ROOMS, stills: still, beforeLabel: labels[name][0], afterLabel: labels[name][1] }));
  writeFileSync(`dist/site/${name}.html`, html);
  const body = html.replace(/^[\s\S]*?<head>/, "").replace(/<\/head>\s*<body>/, "").replace(/<\/body>\s*<\/html>\s*$/, "").replace(/<meta [^>]*>\s*/g, "");
  writeFileSync(`dist/site/${name}.artifact.html`, body);
  console.log(`dist/site/${name}.html  ${Math.round(html.length / 1024)} KB`);
}
