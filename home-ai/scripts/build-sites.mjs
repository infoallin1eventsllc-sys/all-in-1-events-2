// Builds the two scroll sites as self-contained pages:
//   dist/site/meridian.html   Meridian Interface: scrolling builds the home
//   dist/site/residence.html  Linden House: a property-site template
// Each also gets a .artifact.html copy without the document wrapper, for publishing.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";


mkdirSync("dist/site", { recursive: true });
for (const name of ["meridian", "residence"]) {
  const js = await build({ entryPoints: [`site/${name}/main.js`], bundle: true, format: "esm", minify: true, write: false, target: "es2020", define: { __VOICE__: "[]" } });
  const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = readFileSync(`site/${name}/index.html`, "utf8")
    .replace('<script type="module" src="main.js"></script>', () => `<script type="module">${code}</script>`)
  writeFileSync(`dist/site/${name}.html`, html);
  const body = html.replace(/^[\s\S]*?<head>/, "").replace(/<\/head>\s*<body>/, "").replace(/<\/body>\s*<\/html>\s*$/, "").replace(/<meta [^>]*>\s*/g, "");
  writeFileSync(`dist/site/${name}.artifact.html`, body);
  console.log(`dist/site/${name}.html  ${Math.round(html.length / 1024)} KB`);
}
