// The Meridian Interface website: website/index.html, site.css and site.js (the film as the landing page, then
// a screen for every room, the live panel, Haven, security, homes, builders, FAQ and the
// contact form) with every page and asset it links to, in dist/website/:
//   index.html                 the site
//   meridian-film.mp4, poster  the merged film (npm run assemble:film)
//   shots/<finish>-<screen>    the screen pictures (npm run build:catalog)
//   panel-<finish>.html        the live panel in each finish (npm run build:demo)
//   meridian.html              "Watch a home build itself" (npm run build:sites)
//   residence.html             Linden House, the sample listing
//   tour.html (+ film.html, library.html)   the guided tour (showroom/index.html)
// Deploy the folder as it is to any static host. The contact form posts to the CRM intake.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const OUT = "dist/website";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/shots`, { recursive: true });

const need = (f) => { if (!existsSync(f)) throw new Error(`${f} missing (run build:demo, build:film, assemble:film, build:sites, build:catalog)`); return f; };
const page = (f) => {
  let html = readFileSync(need(f), "utf8");
  if (!/name="viewport"/.test(html)) html = `<meta name="viewport" content="width=device-width, initial-scale=1">\n${html}`;
  if (!/^\s*<!doctype/i.test(html)) html = `<!doctype html>\n${html}`;
  return html;
};
// Replace exactly one known string, so a changed page fails the build instead of shipping a dead link.
const swap = (html, from, to, where) => {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`${where}: expected one "${from.slice(0, 60)}", found ${n}`);
  return html.replace(from, () => to);
};

for (const f of ["index.html", "site.css", "site.js"]) copyFileSync(need(`website/${f}`), `${OUT}/${f}`);
copyFileSync(need("dist/film/meridian-film-merged-share.mp4"), `${OUT}/meridian-film.mp4`);
copyFileSync(need("dist/film/meridian-film-merged-share.webm"), `${OUT}/meridian-film.webm`); // for browsers without H.264
copyFileSync(need("dist/film/meridian-film-hero.mp4"), `${OUT}/meridian-film-hero.mp4`); // the landing page's short cut
copyFileSync(need("dist/film/meridian-film-hero.webm"), `${OUT}/meridian-film-hero.webm`);
copyFileSync(need("docs/poster.jpg"), `${OUT}/poster.jpg`);
copyFileSync(need("film/refs/dusk.jpg"), `${OUT}/build.jpg`);
copyFileSync(need("dist/site/stills/living-after.jpg"), `${OUT}/linden.jpg`);
const shots = readdirSync(need("dist/catalog/shots")).filter((f) => f.endsWith(".jpg"));
if (shots.length !== 32) throw new Error(`expected 32 screen pictures, found ${shots.length}`);
for (const f of shots) copyFileSync(`dist/catalog/shots/${f}`, `${OUT}/shots/${f}`);

for (const finish of ["grounded", "futuristic", "vivid"]) writeFileSync(`${OUT}/panel-${finish}.html`, page(`dist/demo/haven-${finish}.html`));

// The walk-through, focused for the website: the build and the rooms before and after. Its
// Haven, safety and builders sections repeat the home page, so they give way to one way back.
{
  let html = page("dist/site/meridian.html");
  const from = html.indexOf('<section class="after" id="haven">'), to = html.indexOf("</main>");
  if (from < 0 || to < from) throw new Error("meridian.html: can't find the sections to trim");
  html = html.slice(0, from) + `<section class="after" id="next">
    <div class="wrap">
      <p class="eyebrow">Next</p>
      <h3>That&rsquo;s how every Meridian home begins.</h3>
      <p class="lede">The same plan becomes the hologram on Haven&rsquo;s wall panel. Choose a screen for each room, or see it in your own home.</p>
      <div class="cta"><a class="btn solid" href="index.html#screens">Choose a screen for every room</a><a class="btn" href="index.html#contact">Book a walkthrough</a></div>
    </div>
  </section>
` + html.slice(to);
  html = swap(html, '<nav aria-label="Sections"><a href="#compare">Rooms</a><a href="#haven">Haven</a><a href="#builders">For builders</a></nav>',
    '<nav aria-label="Sections"><a href="#compare">Rooms</a><a href="index.html">Back to the website</a></nav>', "meridian.html nav");
  html = swap(html, "<p>Keep scrolling to see what Haven does.</p>", "<p>Keep scrolling to see every room, before and after.</p>", "meridian.html last chapter");
  html = swap(html, '<nav aria-label="Footer"><a href="#compare">Rooms, before and after</a><a href="#haven">What Haven does</a><a href="#builders">For builders</a></nav>',
    '<nav aria-label="Footer"><a href="index.html">Meridian Interface</a><a href="index.html#screens">Screens</a><a href="index.html#contact">Book a walkthrough</a></nav>', "meridian.html footer");
  writeFileSync(`${OUT}/meridian.html`, html);
}
// Linden House: the footer's company name links home.
writeFileSync(`${OUT}/residence.html`, swap(page("dist/site/residence.html"),
  "<span>&copy; 2026 Meridian Interface</span>", '<span>&copy; 2026 <a href="index.html">Meridian Interface</a></span>', "residence.html"));
// The guided tour: its brand links home.
writeFileSync(`${OUT}/tour.html`, swap(page("showroom/index.html"),
  '<div class="brand">Meridian Interface<small>Haven, the home that looks out for you</small></div>',
  '<a class="brand" href="index.html" style="text-decoration:none">Meridian Interface<small>Back to the website</small></a>', "tour.html"));
writeFileSync(`${OUT}/film.html`, page("dist/film/meridian-film.html"));
writeFileSync(`${OUT}/library.html`, page("dist/catalog/haven-screen-library.html"));

// Every local link and asset the site's pages name must exist.
const files = new Set(readdirSync(OUT).concat(shots.map((f) => `shots/${f}`)));
const index = readFileSync(`${OUT}/index.html`, "utf8");
const refs = [...index.matchAll(/(?:href|src|poster)="([^"#:]+)(?:#[^"]*)?"/g)].map((m) => m[1]).filter((r) => !r.startsWith("//"));
const missing = refs.filter((r) => !files.has(r));
if (missing.length) throw new Error(`index.html links to missing files: ${[...new Set(missing)].join(", ")}`);
console.log(`${OUT}/: ${files.size} files`);
