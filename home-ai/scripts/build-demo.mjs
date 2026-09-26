// Builds the browser-only Haven demos: one self-contained page per look.
//   npm run build:demo  ->  dist/demo/haven-futuristic.html, haven-grounded.html
// Each page inlines the CSS and the bundled app, so it can be hosted anywhere
// (or published as a shareable link) without the home server.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "dist/demo");
fs.mkdirSync(out, { recursive: true });

const shims = path.join(root, "web/demo/shims.js");
const result = await build({
  entryPoints: [path.join(root, "web/demo/entry.js")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "import.meta.url": JSON.stringify("https://haven.demo/") },
  write: false,
  alias: { "node:events": shims, "node:fs": shims, "node:path": shims, fs: shims, path: shims },
  plugins: [{
    // The Claude agent needs a server-side API key; the demo never loads it.
    name: "no-claude-in-browser",
    setup(b) {
      b.onResolve({ filter: /claude\.js$/ }, () => ({ path: "claude-disabled", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export async function createClaudeAgent() { throw new Error('Claude is not available in the demo.'); }" }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync(path.join(root, "web/styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const body = html.split("<!--haven:body-->")[1].split("<!--/haven:body-->")[0];

const looks = {
  futuristic: { title: "Haven Futuristic Demo" },
  grounded: { title: "Haven Grounded Demo" },
};
for (const [look, { title }] of Object.entries(looks)) {
  const page = `<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
<script>
(function () {
  var look = "${look}";
  try { look = localStorage.getItem("haven.look") || look; } catch (e) {}
  document.documentElement.setAttribute("data-look", look);
})();
</script>
${body}
<script>
${js}
</script>
`;
  fs.writeFileSync(path.join(out, `haven-${look}.html`), page);
  console.log(`dist/demo/haven-${look}.html  ${(page.length / 1024).toFixed(0)} KB`);
}
