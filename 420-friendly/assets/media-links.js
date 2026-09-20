/* 420 FRIENDLY — every music and video link the site uses, in one place.
 *
 * This file is loaded by three pages, so a link pasted here is live
 * everywhere at once:
 *
 *   playlist.html   "The Sound" — the full players, tabbed by service
 *   product.html    the film, plus a listen button beside each garment
 *   shop.html       a listen button above the grid
 *
 * Paste the ordinary share link. Not an ID, not the embed code — the link
 * the Share menu gives you. A line left as "" is simply switched off, and
 * nothing appears for it anywhere.
 */

/* ============================================================================
 * EDIT THIS BLOCK — and nothing else in this file.
 * ==========================================================================*/

const PLAYLIST_CONFIG = {
  // Spotify: open the playlist → ⋯ → Share → Copy link to playlist
  // Looks like: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  // The playlist must be PUBLIC or visitors will see an empty player.
  spotify: "",

  // Apple Music: open the playlist → ⋯ → Share → Copy Link
  // Looks like: https://music.apple.com/us/playlist/the-sound/pl.u-abc123
  appleMusic: "",

  // YouTube: open the playlist page → Share → Copy
  // Looks like: https://www.youtube.com/playlist?list=PLabc123
  youtube: ""
};

/* The film that plays on every product page. It is a file on our own server,
 * so opening a product page costs the visitor nothing until they press play,
 * and no outside company is told they were looking.
 *
 * `poster` is the still shown before playback — also local, for the same
 * reason. To swap the film, change `file` and make a new still from it:
 *   ffmpeg -ss 3 -i <the film> -frames:v 1 -vf scale=1280:-2 <the still>.jpg
 */
const BRAND_FILM = {
  file: "assets/video/420-motion-cut.mp4",
  poster: "assets/video/420-motion-cut.jpg",
  title: "ARCHIVE V.24",
  caption: "The full collection in motion — 34 seconds."
};

/* The video reel on playlist.html. Each entry needs a `title` and exactly ONE
 * source:
 *
 *   youtube: "https://youtu.be/XXXXXXXXXXX"   — a link or the 11-character id
 *   file:    "assets/video/teaser.mp4"        — a file committed to the repo
 *
 * `caption` is optional. `poster` is optional, used only with `file`, and
 * should be a local image path.
 */
const VIDEO_REEL = [
  { title: "Archive V.24 — The Film", caption: "The full collection in motion",
    file: "assets/video/420-motion-cut.mp4", poster: "assets/video/420-motion-cut.jpg" },
  { title: "Archive V.24 — The Ad", caption: "Eighteen seconds. Hoodies from $135.",
    file: "assets/video/420-ad-16x9.mp4", poster: "assets/video/420-ad-16x9.jpg" }
  // { title: "450gsm", caption: "Why the fleece weighs what it weighs",
  //   file: "assets/video/fleece.mp4", poster: "assets/video/fleece.jpg" }
];

/* ============================================================================
 * Below here is machinery. You should not need to touch it.
 * ==========================================================================*/

/* Every value pasted above ends up in an iframe `src` or a link `href`. These
 * parsers are the only thing standing between a mistyped or hostile string and
 * that attribute, so each one rebuilds the URL from matched pieces rather than
 * passing input through. A value that does not match exactly is rejected,
 * never patched up. That is what makes `javascript:` schemes and lookalike
 * hosts such as open.spotify.com.evil.tld structurally impossible rather than
 * merely filtered.
 *
 * Each returns { embed, page } or null:
 *
 *   embed — the in-page player, used by playlist.html
 *   page  — the service's own page, opened in a NEW TAB from the shop
 *
 * The second one exists because an iframe is destroyed the moment the browser
 * leaves the page. On a site of separate pages, an embedded player stops dead
 * when a customer clicks from one garment to the next. A new tab is its own
 * document and keeps playing while they shop.
 */

// Spotify ids are 22 base62 characters today; the range is loose in case that
// ever changes, but the character class is not.
function parseSpotify(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const m =
    v.match(/^https:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/([A-Za-z0-9]{16,32})(?:[/?#]|$)/) ||
    v.match(/^spotify:playlist:([A-Za-z0-9]{16,32})$/) ||
    v.match(/^([A-Za-z0-9]{16,32})$/);
  if (!m) return null;
  return {
    embed: "https://open.spotify.com/embed/playlist/" + m[1],
    page: "https://open.spotify.com/playlist/" + m[1]
  };
}

// Apple has no short id to extract — the embed is the same URL on a different
// host — so the whole path is matched and then rebuilt piece by piece.
function parseAppleMusic(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const m = v.match(
    /^https:\/\/(?:embed\.)?music\.apple\.com\/([a-z]{2})\/playlist\/([A-Za-z0-9._~%-]{1,120})\/((?:pl\.)?[A-Za-z0-9._~%-]{1,120})(?:[?#]|$)/
  );
  if (!m) return null;
  const path = m[1] + "/playlist/" + m[2] + "/" + m[3];
  return {
    embed: "https://embed.music.apple.com/" + path,
    page: "https://music.apple.com/" + path
  };
}

// youtube-nocookie.com for the embed: it holds off on cookies until the
// visitor actually plays something. The new-tab link has to be the real host,
// because nocookie serves embeds only.
function parseYouTubePlaylist(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let id = null;
  const q = v.match(/^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/[^?#]*\?(.*)$/);
  if (q) {
    const list = new URLSearchParams(q[1]).get("list");
    if (list) id = list;
  } else if (/^[A-Za-z0-9_-]{12,64}$/.test(v)) {
    id = v;
  }
  if (!id || !/^[A-Za-z0-9_-]{12,64}$/.test(id)) return null;
  return {
    embed: "https://www.youtube-nocookie.com/embed/videoseries?list=" + id,
    page: "https://www.youtube.com/playlist?list=" + id
  };
}

function parseYouTubeVideo(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let id = null;
  let m;
  if ((m = v.match(/^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#]|$)/))) id = m[1];
  else if ((m = v.match(/^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/watch\?(.*)$/))) {
    id = new URLSearchParams(m[1]).get("v");
  } else if ((m = v.match(/^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/))) {
    id = m[1];
  } else if (/^[A-Za-z0-9_-]{11}$/.test(v)) id = v;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    embed: "https://www.youtube-nocookie.com/embed/" + id + "?rel=0",
    page: "https://www.youtube.com/watch?v=" + id
  };
}

// Local media only: a relative path, no scheme, no parent traversal. Blocks
// `javascript:` and anything pointing off-site.
function parseLocalPath(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v)) return null;
  if (v.includes("..")) return null;
  return v;
}

/* The services, in the order they are offered. Shared so that playlist.html
 * and the shop agree on names, icons and priority without a second list to
 * keep in step.
 */
const MEDIA_SERVICES = [
  { key: "spotify", label: "Spotify", icon: "graphic_eq", parse: parseSpotify,
    height: 480, note: "Full tracks for anyone signed in to Spotify. 30-second previews for everyone else." },
  { key: "appleMusic", label: "Apple Music", icon: "album", parse: parseAppleMusic,
    height: 480, note: "Full tracks for Apple Music subscribers. Previews otherwise." },
  { key: "youtube", label: "YouTube", icon: "play_circle", parse: parseYouTubePlaylist,
    height: 480, note: "Plays for everyone, no sign-in needed." }
];

// Every service with a usable link, in offer order.
function linkedServices() {
  return MEDIA_SERVICES
    .map((s) => {
      const parsed = s.parse(PLAYLIST_CONFIG[s.key]);
      return parsed ? { ...s, src: parsed.embed, page: parsed.page } : null;
    })
    .filter(Boolean);
}

// Anything configured but unparseable is a typo worth surfacing rather than
// silently dropping — otherwise the tab just never shows up and nobody knows
// why. Reported on playlist.html only; see item-media.js for why the shop
// stays quiet about it.
function rejectedServices() {
  return MEDIA_SERVICES.filter((s) => {
    const raw = String(PLAYLIST_CONFIG[s.key] || "").trim();
    return raw && !s.parse(raw);
  });
}

/* The play symbol, drawn rather than borrowed from the icon font.
 *
 * Material Symbols render as ligatures: until the font arrives the browser
 * lays out the literal word "play_circle". styles.css clamps that to 1em so
 * it cannot shove a nav sideways, but a facade's symbol is 52px, and a
 * clipped "pla" across the middle of a poster is the first thing a visitor
 * on a slow connection sees. An inline SVG has no such state.
 */
function playGlyph(size) {
  const px = size || 52;
  return (
    '<svg viewBox="0 0 48 48" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false" ' +
    'class="play-glyph drop-shadow-lg">' +
    '<circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.9"/>' +
    '<path d="M19.5 15.2 34 24l-14.5 8.8Z" fill="currentColor"/>' +
    "</svg>"
  );
}
