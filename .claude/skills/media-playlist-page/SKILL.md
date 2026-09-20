---
name: media-playlist-page
description: >-
  Build a music and/or video playlist page into a website — Spotify, Apple
  Music, YouTube embeds, or self-hosted video — using a click-to-load facade
  so no third-party player loads until a visitor presses play. Use this
  whenever someone wants to add a playlist, a soundtrack, "the vibe", a radio
  page, a video reel, a lookbook, a highlight gallery, or any embedded
  music/video player to a site, even if they don't use the word "playlist" and
  even if they only name one service. Also use it when adding a single Spotify
  or YouTube embed to an existing page, when a page's embeds need to be made
  privacy-safe or CSP-compliant, or when embed links pasted by a non-technical
  owner need to be parsed and validated.
---

# Playlist and video-reel pages

A playlist page looks trivial — paste an iframe, done. The reason it isn't:
the person maintaining it pastes links from a Share menu rather than writing
code, the embed hosts track visitors the moment they load, and every pasted
value ends up inside an iframe `src`. Those three facts drive everything here.

## The shape that works

Two files, and one of them is the only file the site owner ever opens.

```
assets/playlist.js   config block at the top, machinery below
playlist.html        markup + mount points
```

Put an editable block at the very top of the JS, fenced by a comment saying
this is the only part to edit. Everything else goes below it. The owner should
never scroll past their own config.

```js
const PLAYLIST_CONFIG = {
  spotify: "",      // Share → Copy link to playlist
  appleMusic: "",   // Share → Copy Link
  youtube: ""       // Share → Copy
};

const VIDEO_REEL = [
  // { title: "...", caption: "...", youtube: "https://youtu.be/XXXXXXXXXXX" }
  // { title: "...", file: "assets/video/clip.mp4", poster: "assets/video/clip.jpg" }
];
```

Accept whatever the Share menu produces — share links, `spotify:` URIs,
`youtu.be` short links, watch links carrying `&list=`, bare ids. Do not ask
for "the playlist ID". Someone pasting from their phone has a URL, and telling
them to extract an ID from it is where this pattern usually fails in practice.

## Load players on click, never on page load

Draw your own card first — a real `<button>`, styled like a finished player —
and create the iframe only when it is clicked.

Two reasons, and it is worth stating both in a code comment so nobody
"simplifies" it away later:

- **Privacy.** Spotify, Apple and YouTube set cookies and profile the visitor
  the instant the iframe loads. On a site with no consent banner, auto-loading
  them tracks people who never asked to listen. Under GDPR that is a real
  exposure, not a stylistic preference.
- **Weight.** Three embeds is several megabytes for the majority of visitors
  who never press play.

The click is both the consent and the play button, so the pattern costs
nothing in usability — the user was going to press play anyway.

Two things that quietly break this: fetching YouTube thumbnails
(`i.ytimg.com`) for the facade art, which is a third-party request on load
wearing a disguise; and using `youtube.com` instead of
**`youtube-nocookie.com`**, which defers cookies until playback.

Draw facade art in CSS, or use a local poster image.

## Parsers are the security boundary

Every configured value lands in an iframe `src`. Match a strict pattern, then
**rebuild the URL from the captured pieces** — never pass input through, even
after checking it.

```js
function parseSpotify(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const m =
    v.match(/^https:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/([A-Za-z0-9]{16,32})(?:[/?#]|$)/) ||
    v.match(/^spotify:playlist:([A-Za-z0-9]{16,32})$/) ||
    v.match(/^([A-Za-z0-9]{16,32})$/);
  if (!m) return null;
  return "https://open.spotify.com/embed/playlist/" + m[1];   // rebuilt, not echoed
}
```

Rebuilding is what makes `javascript:` schemes and lookalike hosts like
`open.spotify.com.evil.tld` structurally impossible rather than merely
filtered. Anchor every pattern with `^...$` or an explicit terminator — a
regex without an anchor after the host is exactly how a lookalike domain slips
through.

Working parsers for all four services plus local file paths are in
`references/embed-parsers.js`. Copy them; don't rewrite from memory.

For self-hosted video, reject anything that isn't a relative path — no scheme,
no leading `/`, no `..`.

## Content-Security-Policy

Widening `frame-src` is required and is the whole change:

```
frame-src https://open.spotify.com https://embed.music.apple.com https://www.youtube-nocookie.com;
```

If you also need an `img-src` entry, that is a signal you are fetching remote
thumbnails — reconsider, because it reintroduces the tracking request the
facade exists to prevent.

## Unconfigured is a real state, not an error

The page ships before the owner has pasted anything, so that state is the
page's actual content for a while. Show a card naming the exact file and the
exact constant to edit. Never render an empty box, a spinner, or a console
warning nobody reads.

Equally: a link that is configured but unparseable must produce a **visible**
warning. Silently dropping the tab means the owner pastes a link, sees
nothing, and cannot tell whether the site is broken or they are.

## Multiple services

Tabs, with only the configured services appearing. One service configured
means no tab strip at all — a lone tab is noise.

Use real tab semantics: `role="tablist"`/`tab"`/`tabpanel`, `aria-selected`,
`aria-controls`, and roving `tabindex` so Tab enters the set once and arrow
keys move within it. Build panels once and keep them; switching away from a
playing player and back must not restart it.

## Layout traps that will bite

**Icon fonts that render as ligatures** (Material Symbols and similar): the
markup contains the literal word `shopping_cart`, and the font turns it into a
glyph. Until the font loads, the browser lays out the *word* — roughly 135px
instead of 24px. Adding one nav item for the playlist page is often what
finally pushes a nav bar off-screen. Fix at the source:

```css
.material-symbols-outlined { width: 1em; overflow: hidden; }
```

The glyphs are drawn 1em square, so this is exact — layout is identical before
and after the font loads.

**Flex items that won't divide evenly**: `flex: 1 1 0` still honours
`min-width: auto`, so items refuse to shrink below their content. Add
`min-w-0`. A nav bar hardcoded to `w-1/4` for four items also needs changing
when you add a fifth — search for fractional width classes before adding a nav
entry.

**Tailwind (or any JIT CSS)**: rebuild after adding classes. A class that only
exists in new markup is not in the compiled stylesheet, and the failure is
silent — the element renders unstyled at natural size.

## Verify these specifically

Ordinary "does it render" testing misses everything that matters here:

- **Zero third-party requests before the play click.** Record requests in a
  headless browser, assert the count is 0 on load, then assert it is non-zero
  after clicking. This is the one that regresses when someone later inlines
  the iframe.
- **The iframe `src` is exactly the rebuilt URL** for each service, and
  YouTube uses the nocookie host.
- **Hostile config values** — lookalike hosts, `javascript:`, quote break-out
  attempts, wrong-length ids — all return null.
- **Nav links are hit-testable, not merely visible.** Use `elementFromPoint`
  at each link's centre and confirm the link is the top element. Links can be
  perfectly visible and completely dead when a stacking context lets another
  element paint over them.
- **`document.body.scrollWidth <= window.innerWidth` at 390px** on every page,
  not just the new one. Exclude deliberate scroll containers (marquees,
  swipeable chip rows) rather than loosening the check.
- **Keyboard**: arrow keys move between tabs, facades are reachable and
  activate with Enter/Space (they will be, if they are real buttons).

Run these with the icon font blocked — that is the state a first-time visitor
on a slow connection actually gets, and it is where the ligature bug shows up.

## Contrast on facade art

Facades sit on dark gradients or poster stills while the rest of the site is
usually light, so inherited text colour will be unreadable. Give the dark
variant its own class that inverts the text, and put a scrim under text over
photographic posters — otherwise contrast depends on whatever was in the shot.
