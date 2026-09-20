#!/usr/bin/env node
// The playlist and film wiring — the parts that fail silently or unsafely.
//
// Two classes of bug live here and neither shows up as a broken page:
//
//   1. A third-party player loading before anyone pressed play. Spotify,
//      Apple and YouTube profile the visitor the instant their iframe
//      appears, and this site has no consent banner. The page looks
//      identical either way, so only a request log catches it. This is the
//      check that regresses the day someone "simplifies" a facade into a
//      plain <iframe>.
//   2. A pasted link reaching an href or an iframe src unvalidated. Every
//      value in media-links.js is typed by hand into a config file and ends
//      up in an attribute, so the parsers are a security boundary, not a
//      convenience.
//
//   node scripts/media.mjs

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LINKS = path.join(ROOT, "420-friendly/assets/media-links.js");

const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) return;
  failures.push(detail ? `${name}\n      ${detail}` : name);
};

/* ---------- 1. parsers ----------
   Loaded with the real file's text so these run against what ships, not a
   copy. `spotify` is swapped for a test link where a configured service is
   needed — the committed value is empty until Otis pastes his own. */
function loadLinks(overrides = {}) {
  let src = fs.readFileSync(LINKS, "utf8");
  for (const [key, value] of Object.entries(overrides)) {
    const re = new RegExp(`(\\n  ${key}: )""`);
    if (!re.test(src)) throw new Error(`no empty '${key}' line to override`);
    src = src.replace(re, `$1${JSON.stringify(value)}`);
  }
  // `function` declarations land on the sandbox global, `const` ones do not,
  // so the config objects have to be handed over explicitly.
  src += "\n;globalThis.__config = { PLAYLIST_CONFIG, BRAND_FILM, VIDEO_REEL };";
  const ctx = { URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ...ctx, ...ctx.__config };
}

const m = loadLinks();
const ID = "37i9dQZF1DXcBWIGoYBM5M"; // 22 chars, the shape Spotify issues today

// Accept what a Share menu actually produces.
for (const [label, input] of [
  ["share link", `https://open.spotify.com/playlist/${ID}`],
  ["link with query", `https://open.spotify.com/playlist/${ID}?si=abc123`],
  ["embed link", `https://open.spotify.com/embed/playlist/${ID}`],
  ["app URI", `spotify:playlist:${ID}`],
  ["bare id", ID],
]) {
  const out = m.parseSpotify(input);
  check(`spotify accepts a ${label}`, !!out, `rejected: ${input}`);
  if (out) {
    check(`spotify ${label} → embed url`,
      out.embed === `https://open.spotify.com/embed/playlist/${ID}`, out.embed);
    check(`spotify ${label} → page url`,
      out.page === `https://open.spotify.com/playlist/${ID}`, out.page);
  }
}

// Reject everything else. A lookalike host is the one that matters: it is why
// the parsers rebuild the URL from captured pieces instead of passing input
// through after a check.
for (const bad of [
  "https://open.spotify.com.evil.tld/playlist/" + ID,
  "https://open.spotify.com@evil.tld/playlist/" + ID,
  "http://open.spotify.com/playlist/" + ID,          // plain http
  "javascript:alert(1)",
  `https://open.spotify.com/playlist/${ID}" onload="alert(1)`,
  "https://open.spotify.com/playlist/short",
  "",
]) {
  check("spotify rejects a hostile value", m.parseSpotify(bad) === null,
    `accepted: ${JSON.stringify(bad)} → ${JSON.stringify(m.parseSpotify(bad))}`);
}

// YouTube: the embed must be the nocookie host, which defers cookies until
// playback; the new-tab link must not be, because nocookie serves only embeds.
const yt = m.parseYouTubePlaylist("https://www.youtube.com/playlist?list=PLabc123def456");
check("youtube embed uses the nocookie host",
  !!yt && yt.embed.startsWith("https://www.youtube-nocookie.com/"), yt && yt.embed);
check("youtube tab link uses the real host",
  !!yt && yt.page === "https://www.youtube.com/playlist?list=PLabc123def456", yt && yt.page);

// Local paths: relative only, no traversal, no scheme.
for (const bad of ["/etc/passwd", "../../secret.mp4", "https://evil.tld/a.mp4", "javascript:x"]) {
  check("local path rejects an escape", m.parseLocalPath(bad) === null, `accepted: ${bad}`);
}
check("local path accepts the film",
  m.parseLocalPath("assets/video/420-motion-cut.mp4") === "assets/video/420-motion-cut.mp4");

// The film and its still have to exist, or the product page shows a dead card.
for (const f of [m.BRAND_FILM.file, m.BRAND_FILM.poster]) {
  check(`the film's ${f.endsWith(".mp4") ? "video" : "still"} is committed`,
    fs.existsSync(path.join(ROOT, "420-friendly", f)), f);
}

// With a link configured, the shop offers it — and offers the page, not the embed.
const configured = loadLinks({ spotify: `https://open.spotify.com/playlist/${ID}` });
const first = configured.linkedServices()[0];
check("a configured playlist becomes the shop's listen link",
  !!first && first.page === `https://open.spotify.com/playlist/${ID}`, first && first.page);

/* ---------- 2. the browser ---------- */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

function browserExe() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().pop();
  const exe = dir && path.join(base, dir, "chrome-linux", "chrome");
  return exe && fs.existsSync(exe) ? exe : undefined;
}

// The hosts that must stay untouched until a visitor asks for them.
const PLAYERS = /spotify\.com|music\.apple\.com|youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com/i;

function firstProductId() {
  const src = fs.readFileSync(path.join(ROOT, "420-friendly/assets/products.js"), "utf8");
  return new Function(`${src}\nreturn CATALOG[0].id;`)();
}

await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ executablePath: browserExe() });
} catch {
  browser = await chromium.launch();
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const ROUTES = [
  ["/420-friendly/playlist.html", "the playlist page"],
  ["/420-friendly/shop.html", "the shop grid"],
  [`/420-friendly/product.html?id=${firstProductId()}`, "a product page"],
];

for (const [route, label] of ROUTES) {
  const page = await ctx.newPage();
  const players = [];
  const media = [];
  page.on("request", (r) => {
    const url = r.url();
    if (PLAYERS.test(url)) players.push(url);
    if (/\.mp4(\?|$)/i.test(url)) media.push(url);
  });
  await page.goto(origin + route, { waitUntil: "networkidle" });

  check(`${label} loads no player until asked`, players.length === 0, players[0]);
  check(`${label} downloads no video until asked`, media.length === 0, media[0]);
}

// The film: a facade that becomes a real <video> on click, playing our own
// file — and only then is the .mp4 fetched.
{
  const page = await ctx.newPage();
  const media = [];
  page.on("request", (r) => { if (/\.mp4(\?|$)/i.test(r.url())) media.push(r.url()); });
  await page.goto(`${origin}/420-friendly/product.html?id=${firstProductId()}`,
    { waitUntil: "networkidle" });

  const facade = page.locator("#item-media button.player-facade");
  check("the product page offers the film", await facade.count() === 1);

  if (await facade.count()) {
    await facade.click();
    await page.waitForSelector("#item-media video", { timeout: 5000 }).catch(() => {});
    const src = await page.locator("#item-media video").getAttribute("src").catch(() => null);
    check("clicking the film creates a video of our own file",
      src === "assets/video/420-motion-cut.mp4", String(src));
    await page.waitForTimeout(400);
    check("the film is only fetched on the click", media.length > 0);
  }

  // The listen link goes to a new tab, and without rel=noopener that tab
  // keeps a handle on this one and can navigate it away.
  const anchor = await page.evaluate(() => {
    const a = listenAnchor({
      page: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      label: "Spotify", icon: "graphic_eq",
    });
    return { href: a.href, target: a.target, rel: a.rel };
  });
  check("the listen link opens a new tab", anchor.target === "_blank", anchor.target);
  check("the listen link cannot reach back into this page",
    /\bnoopener\b/.test(anchor.rel), anchor.rel);
  check("the listen link points at the playlist page",
    anchor.href === "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", anchor.href);

  // Nothing is configured yet, so the shop must show nothing rather than an
  // empty frame or a stray heading.
  const shop = await ctx.newPage();
  await shop.goto(`${origin}/420-friendly/shop.html`, { waitUntil: "networkidle" });
  const barText = (await shop.locator("#shop-listen").innerText()).trim();
  check("an unlinked playlist leaves no empty box in the shop", barText === "",
    JSON.stringify(barText));
}

await browser.close();
server.close();

/* ---------- report ---------- */
if (!failures.length) {
  console.log("\n  players stay unloaded, parsers hold, the film is local\n");
  process.exit(0);
}
console.log(`\n  ${failures.length} problem${failures.length === 1 ? "" : "s"}\n`);
for (const f of failures) console.log(`    ${f}`);
console.log("");
process.exit(1);
