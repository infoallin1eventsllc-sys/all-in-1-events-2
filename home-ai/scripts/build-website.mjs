// The Meridian Interface website: website/index.html, site.css and site.js (the film as the landing page, then
// a screen for every room, the live panel, Haven, security, homes, builders, FAQ and the
// contact form) with every page and asset it links to, in dist/website/:
//   index.html                 the site
//   img/                       the security package pictures (website/img)
//   build.jpg, linden.jpg      the Homes cards, captured from meridian.html and residence.html
//   meridian-film.mp4, poster  the merged film (npm run assemble:film)
//   shots/<finish>-<screen>    the screen pictures (npm run build:catalog)
//   panel-<finish>.html        the live panel in each finish (npm run build:demo)
//   meridian.html              "Watch a home build itself" (npm run build:sites)
//   residence.html             Linden House, the sample listing
//   tour.html (+ film.html, library.html)   the guided tour (showroom/index.html)
// Deploy the folder as it is to any static host. The contact form posts to the CRM intake.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const OUT = "dist/website";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/shots`, { recursive: true });

const need = (f) => { if (!existsSync(f)) throw new Error(`${f} missing (run build:demo, build:film, assemble:film, build:sites, build:catalog)`); return f; };
// Every page served on its own gets a doctype, a language, a viewport and the site's icon
// (without one, browsers ask the host for /favicon.ico and log a 404).
const ICON = readFileSync(need("website/index.html"), "utf8").match(/<link rel="icon"[^>]*>/)[0];
const page = (f) => {
  let html = readFileSync(need(f), "utf8");
  if (!/rel="icon"/.test(html)) html = `${ICON}\n${html}`;
  if (!/name="viewport"/.test(html)) html = `<meta name="viewport" content="width=device-width, initial-scale=1">\n${html}`;
  if (!/<html[\s>]/i.test(html)) html = `<html lang="en">\n${html}`;
  if (!/^\s*<!doctype/i.test(html)) html = `<!doctype html>\n${html}`;
  return html;
};
// Replace exactly one known string, so a changed page fails the build instead of shipping a dead link.
const swap = (html, from, to, where) => {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`${where}: expected one "${from.slice(0, 60)}", found ${n}`);
  return html.replace(from, () => to);
};

for (const f of ["site.css", "site.js"]) copyFileSync(need(`website/${f}`), `${OUT}/${f}`);
// The page, with the film's captions filled in (the guide's words; the film itself carries no words on
// its picture, and some hosts won't serve a .vtt file).
writeFileSync(`${OUT}/index.html`, swap(readFileSync(need("website/index.html"), "utf8"), '<script type="text/vtt" id="film-captions"></script>',
  `<script type="text/vtt" id="film-captions">\n${readFileSync(need("dist/film/meridian-film-captions.vtt"), "utf8").trim()}\n</script>`, "index.html captions"));
// The security package's pictures: the package and camera pictures, the house map, and each
// piece on a white studio sweep for "Every piece, up close".
mkdirSync(`${OUT}/img`, { recursive: true });
const imgs = readdirSync(need("website/img")).filter((f) => f.endsWith(".webp"));
for (const f of imgs) copyFileSync(`website/img/${f}`, `${OUT}/img/${f}`);
copyFileSync(need("dist/film/meridian-film-merged-share.mp4"), `${OUT}/meridian-film.mp4`);
copyFileSync(need("dist/film/meridian-film-merged-share.webm"), `${OUT}/meridian-film.webm`); // for browsers without H.264
copyFileSync(need("dist/film/meridian-film-hero.mp4"), `${OUT}/meridian-film-hero.mp4`); // the landing page's short cut
copyFileSync(need("dist/film/meridian-film-hero.webm"), `${OUT}/meridian-film-hero.webm`);
copyFileSync(need("docs/poster.jpg"), `${OUT}/poster.jpg`);
// Haven's voices, to play in "Choose Haven's voice" (Lily is Haven speaking; the others are each voice's own sample).
mkdirSync(`${OUT}/voices`, { recursive: true });
for (const v of ["lily", "sia", "richard", "charlotte"]) copyFileSync(need(`docs/voice/haven-voice-${v}.mp3`), `${OUT}/voices/${v}.mp3`);
const shots = readdirSync(need("dist/catalog/shots")).filter((f) => f.endsWith(".jpg"));
if (shots.length !== 32) throw new Error(`expected 32 screen pictures, found ${shots.length}`);
for (const f of shots) copyFileSync(`dist/catalog/shots/${f}`, `${OUT}/shots/${f}`);

for (const finish of ["grounded", "futuristic", "vivid"]) writeFileSync(`${OUT}/panel-${finish}.html`, page(`dist/demo/haven-${finish}.html`));

// The walk-through, focused for the website: the build itself. Its
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
  html = swap(html, '<nav aria-label="Sections"><a href="#haven">Haven</a><a href="#builders">For builders</a></nav>',
    '<nav aria-label="Sections"><a href="index.html" aria-label="Back to the website"><span class="wide">Back to the website</span><span class="narrow">&larr; Website</span></a></nav>', "meridian.html nav");
  html = swap(html, "<p>Keep scrolling to see what Haven does.</p>", "<p>That is the whole build. Below, where it leads.</p>", "meridian.html last chapter");
  html = swap(html, '<nav aria-label="Footer"><a href="#haven">What Haven does</a><a href="#builders">For builders</a></nav>',
    '<nav aria-label="Footer"><a href="index.html">Meridian Interface</a><a href="index.html#screens">Screens</a><a href="index.html#contact">Book a walkthrough</a></nav>', "meridian.html footer");
  writeFileSync(`${OUT}/meridian.html`, html);
}
// Linden House: the footer's company name links home, and its booking form reaches Meridian.
{
  let html = swap(page("dist/site/residence.html"),
    "<span>&copy; 2026 Meridian Interface</span>", '<span>&copy; 2026 <a href="index.html">Meridian Interface</a></span>', "residence.html footer");
  // A way back to the website in the header, on every screen size.
  html = swap(html, '<div class="lead"><a class="mark" href="#top">Linden House</a></div>',
    '<div class="lead"><a class="back" href="index.html">Meridian Interface</a><a class="mark" href="#top">Linden House</a></div>', "residence.html header");
  const intake = readFileSync("website/site.js", "utf8").match(/const INTAKE = "([^"]+)"/)[1];
  html = html.replace(/<html lang="en"/, () => `<html lang="en" data-intake="${intake}"`);
  if (!html.includes("data-intake=")) throw new Error("residence.html: no <html lang=\"en\"> to carry the intake");
  writeFileSync(`${OUT}/residence.html`, html);
}
// The guided tour: its brand links home, and inside the website its "Website" tab is the
// walk-through, trimmed to the build (no "what Haven does" further down).
{
  let html = swap(page("showroom/index.html"),
    '<div class="brand">Meridian Interface<small>Haven, the home that looks out for you</small></div>',
    '<a class="brand" href="index.html">Meridian Interface<small>Back to the website</small></a>', "tour.html brand");
  html = swap(html, '<button role="tab" data-tab="site" aria-selected="false">Website</button>', '<button role="tab" data-tab="site" aria-selected="false">Walk-through</button>', "tour.html tab");
  html = swap(html, 'site: "Scrolling builds the home, chapter by chapter, then what Haven does.",', 'site: "Scrolling builds the home, chapter by chapter.",', "tour.html note");
  html = swap(html, '{ tab: "site", title: "The website", text: "Scrolling builds the home, chapter by chapter. Further down, what Haven does."',
    '{ tab: "site", title: "The walk-through", text: "Scrolling builds the home, chapter by chapter, from the first line of the plan to the lights coming on."', "tour.html step");
  html = swap(html, "then the website and a property site.", "then the walk-through and a property site.", "tour.html welcome");
  writeFileSync(`${OUT}/tour.html`, html);
}
writeFileSync(`${OUT}/film.html`, page("dist/film/meridian-film.html"));
writeFileSync(`${OUT}/library.html`, page("dist/catalog/haven-screen-library.html"));

// The Homes cards: one frame of each page they open, so the two pictures say what's behind them.
{
  const executablePath = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const shoot = async (file, out, prepare) => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await p.goto(pathToFileURL(`${OUT}/${file}`).href);
    await p.waitForFunction(() => { const l = document.querySelector("#loading"); return !l || l.hidden; }, null, { timeout: 60000 });
    await prepare(p);
    writeFileSync(`${OUT}/${out}`, await p.screenshot({ type: "jpeg", quality: 85 }));
    await p.close();
  };
  // The walk-through as the plan is being drawn in light.
  await shoot("meridian.html", "build.jpg", async (p) => { await p.evaluate(() => scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.08))); await p.waitForTimeout(3000); });
  // Linden House as it opens: the house under its name and its numbers.
  await shoot("residence.html", "linden.jpg", async (p) => { await p.waitForTimeout(3000); });
  await browser.close();
}

// Every local link and asset the site's pages name must exist.
const files = new Set(readdirSync(OUT).concat(shots.map((f) => `shots/${f}`), imgs.map((f) => `img/${f}`), readdirSync(`${OUT}/voices`).map((f) => `voices/${f}`)));
const index = readFileSync(`${OUT}/index.html`, "utf8");
const refs = [...index.matchAll(/(?:href|src|poster)="([^"#:]+)(?:#[^"]*)?"/g)].map((m) => m[1]).filter((r) => !r.startsWith("//"));
const missing = refs.filter((r) => !files.has(r));
if (missing.length) throw new Error(`index.html links to missing files: ${[...new Set(missing)].join(", ")}`);
const pieces = [...readFileSync(`${OUT}/site.js`, "utf8").matchAll(/\{ id: "([a-z-]+)", label:/g)].map((m) => `img/p-${m[1]}.webp`);
if (pieces.length < 9 || pieces.some((f) => !files.has(f))) throw new Error(`site.js names missing package pictures: ${pieces.filter((f) => !files.has(f)).join(", ") || "(none found)"}`);
console.log(`${OUT}/: ${files.size} files`);
