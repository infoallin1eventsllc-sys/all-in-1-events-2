# 420 Friendly — build notes

Static storefront preview for the 420 Friendly apparel brand. Lives alongside
the All in 1 Events site in this repo, under `420-friendly/`.

Branch: `claude/420-friendly-hoodie-page-yl8ho9` · PR #3
Deploy preview: https://deploy-preview-3--allin1-events.netlify.app/420-friendly/

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home: hero, category tiles, Just Dropped rail, Portal editorial split |
| `shop.html` | Product listing: category rail/pills, sort, `?cat=` deep links |
| `product.html` | Product detail via `?id=`: gallery, sticky buy rail, accordions, related |
| `cart.html` | Bag: line items, quantity, subtotal, free-shipping meter |
| `drops.html` | Drop calendar with live countdown |
| `media.html` | **Owner** — upload music/video; appears on the front page |
| `shipping.html` | Shipping policy |
| `returns.html` | Returns policy — the limited-drop rule lives here |
| `sizing.html` | Size guide (the product-page button now opens this) |
| `faq.html` | FAQ — the only new page with nothing unset |
| `contact.html` | Contact form, posts through the same `lead` function as Members |
| `privacy.html` | Privacy — written from what the code actually does |
| `terms.html` | Terms of sale |
| `playlist.html` | "The Sound" — music playlist (Spotify/Apple/YouTube) and video reel |
| `members.html` | Customer drop-list signup (public) |
| `portal.html` | **Owner** — hub linking transactions, photos and marketing |
| `favorites.html` | Saved pieces |
| `checkout.html` | Payment method selection, order summary, paid state |
| `owner.html` | **Owner** — transactions, invoices, CSV export |
| `photos.html` | **Owner** — photo upload, library, assign to products |

`/420-friendly-hoodie.html` at the repo root redirects to the hoodie's product
page, preserving the original URL.

## Assets

- `assets/media.js` — owner upload client (chunking, progress) and the
  front-page player.
- `assets/playlist.js` — playlist/reel config plus the embed-URL parsers.
  The only file to edit when adding a playlist link or a clip.
- `assets/app.js` — shared chrome (header, bottom nav, footer), cart, favorites,
  product cards, and the brand badge. All dynamic interpolation goes through
  `esc()`, matching this repo's XSS-safe convention.
- `assets/products.js` — the catalog. Eight products. Add `image` to a product
  and it replaces the typographic art tile automatically.
- `assets/styles.css` — hand-written styles (art tiles, ticker, toast, badges).
- `assets/tailwind.css` — **compiled output, do not edit by hand.**
- `assets/logo-lg.webp` — the emblem at 657x760 (~60KB), used only by the
  homepage hero, where it is large enough that its own lettering reads.
- `assets/logo.webp` — the 3D brand emblem, used in the header and footer. Cut
  from the light-environment Stitch render: the background is removed by flood
  filling inward from the image border, then a morphological close seals the
  thin notches where bright rim highlights touch the silhouette. 259x300 WebP
  with alpha (~21KB). `favicon.ico` and `apple-touch-icon.png` come from the
  same cutout, padded onto the page off-white to stay square.

## Naming: Portal vs Members

Two different audiences, previously both called "Portal", which made the nav
link land on the customer signup instead of the owner tools:

- **`portal.html` — the owner hub.** Passcode-gated. Tiles through to
  transactions/invoices, photos, and the marketing system. This is what the
  Portal nav item points at.
- **`members.html` — the customer drop list.** Public by design; it is how
  people join and how leads reach the CRM.

## A stacking trap worth remembering

`body > * { position: relative; z-index: 1 }` (added so content sits above the
generated background layers) gives `#site-header` its own stacking context,
which traps the header's inner `z-50` inside it. `<main>` is a later sibling at
the same z-index, so it paints over the header and **swallows every click on the
nav** — the links look perfectly normal and simply do nothing. `#site-header`
and `#site-bottom-nav` are pinned to `z-index: 50` to correct it.

When testing nav, assert that links are *clickable* (`elementFromPoint` returns
the link), not merely present in the DOM. A visibility check passes happily
while every link is dead.

## Owner portal & payments

`owner.html` and `photos.html` are owner tools, gated by a passcode (or Netlify
Identity, if that is set up instead — the data function accepts either).

The protection is server-side, not in the page. The pages are public shells with
no data in them; orders come from `netlify/functions/owner-orders.js`, which
Netlify only reaches with a verified Identity token and which checks for the
`owner` role. A client-side gate alone would protect nothing — the HTML is served
to anyone who asks. `assets/owner-data.js` therefore holds no orders at all,
only arithmetic and formatting.

Setup steps are in `PAYMENTS-SETUP.md`. Identity must be set to **invite only**,
and the account needs the `owner` role added explicitly.

- **Transactions/invoices** read `assets/owner-data.js`, which currently returns
  sample orders — checkout has no provider connected, so no real transaction
  exists. `fetchOrders()` is async precisely so swapping in a live provider
  needs no restructuring. `USING_SAMPLE_DATA` drives the warning banner.
- **Photos** live in IndexedDB via `assets/store.js`, not localStorage: a single
  camera image would blow localStorage's ~5MB string budget. Uploads are resized
  to 1600px and re-encoded as WebP before saving. Everything is per-browser —
  photos do not reach a server or any other device.
- **Assigning a photo to a product** makes it render on the storefront ahead of
  the catalog image. Because that read is async and rendering is not, pages
  route their first render through `whenPhotosReady()`, which falls straight
  through if the store is missing or fails — a storage error can never blank a
  page.
- **Payments** need two providers: Stripe for card/Apple Pay/Google Pay/Cash App,
  PayPal for PayPal/Venmo. The Stripe secret key belongs only in the Netlify
  function's environment. `netlify/functions/create-checkout-session.js` prices
  line items server-side from its own catalog and ignores any prices the browser
  sends, so a tampered cart cannot set its own total — which does mean prices
  live in two files until there is a real backend.

## Owner media uploads (`media.html`)

The owner uploads a music file or a video clip and it appears on the front
page. No links, no code, no second service to sign up for. This is the
self-hosted path; `playlist.html` is the streaming-embed path, and they are
independent — use either or both.

Storage is **Netlify Blobs** (`netlify/shared/media-store.js`). It ships with
the platform, so there is no extra account and no key to rotate. Legacy-style
handlers must call `connectLambda(event)` before `getStore`, or every read
fails at runtime rather than at deploy.

### Two platform limits shape the whole design

A Netlify function receives **~6 MB per request** and returns **~6 MB per
response**. Neither is configurable, and a 40 MB video violates both.

- **Upload** is chunked. `assets/media.js` slices the file, posts each slice
  base64-encoded (3 MB binary → ~4 MB encoded, safely under the ceiling), and
  `media.js` reassembles them: `init` → `chunk`×N → `finalize`. A dropped
  connection then costs one slice, not the whole upload, and the progress bar
  reflects real bytes.
- **Playback** uses HTTP Range. `media-file.js` answers 206 with an explicit
  `Content-Range`, always — even when no Range header was sent, because a
  browser opens a media element with `Range: bytes=0-` and follows the
  reported total. Replying 200 with a truncated body would look like a
  complete, corrupt file. A readable Range asking for bytes past the end gets
  **416**, not byte 0: answering 206 there produces corrupt playback or a
  request loop.

### Security decisions worth keeping

- **The MIME allowlist is a security control, not a convenience.** Files are
  served back from our own origin, so accepting `text/html` or any script type
  would let an upload execute as first-party JavaScript — stored XSS on our
  own domain. Responses pin the stored type and send `nosniff`.
- **Ids are generated, never derived from filenames.** A filename is
  attacker-controlled text; using it as a blob key invites traversal and
  collisions. The original name is only ever a display label, stripped of
  control characters, quotes, angle brackets and path separators.
- **`media-public.js` is a separate function from `media.js`** rather than one
  function branching on whether the caller is signed in. That branch is where
  "returned everything to everyone" bugs live. The public response is built
  field by field, so a field added to the stored record later is private until
  someone deliberately publishes it.
- **The index is the authority on visibility.** `media-file.js` checks it on
  every request, so hiding or deleting an item stops serving it even to
  someone who already has the id.

### Bandwidth

Self-hosted media is served through the function, and that counts against the
site's bandwidth. A 20 MB clip viewed 5,000 times is 100 GB. Caps are 20 MB
audio / 60 MB video, and playback responses are cached hard (`immutable`,
ids never change) so the function runs once per visitor rather than once per
seek. If the reel ever gets popular, move video to YouTube via
`playlist.html` — that is what the streaming path is for.

### Verified

`media.test.js` runs the functions against an in-memory Blobs stand-in: a 7 MB
file survives chunked upload byte-identical, walking every Range rebuilds it
exactly, seeks and suffix ranges return the right bytes, gaps are refused
rather than published, and hidden/deleted items stop serving. The browser
suite covers the gate, upload progress, rename/hide/delete, and the front-page
player. Neither can prove Blobs itself behaves on a real deploy — that needs
one upload on the preview to confirm.

## Store policy pages (`assets/policy.js`)

A storefront was missing every page a customer looks for before buying:
shipping, returns, sizing, FAQ, contact, privacy, terms. All seven now exist.

**Every value lives once, in `assets/policy.js`.** Shipping figures were
previously prose inside `product.html`; a customer reading one threshold on a
product page and a different one on the shipping page is how a chargeback
starts. Both now read from `POLICY`.

### Unset values are visible, not guessed

`POLICY` fields set to `null` render as a red **"NOT SET"** chip, and any page
containing one shows a **"THIS PAGE IS NOT FINISHED"** banner at the top. That
is deliberate: a wrong returns address or an invented company name on a live
storefront is worse than an obviously incomplete one — one is a gap, the other
is a false promise a customer can act on.

Still unset (all in `assets/policy.js`):

| Field | Why it matters |
|---|---|
| `legalName` | Terms are unenforceable without naming who the contract is with |
| `contactEmail` | Referenced by shipping, returns, sizing, privacy, contact |
| `returnsAddress` | Nobody can return anything |
| `jurisdiction` | Which state's law governs |
| `whoPaysReturn` | Decides whether the customer pays return postage |
| `SIZE_CHART.rows` | Real garment measurements — cannot be invented, a wrong one causes a return that is our fault |

### Written from fact, not template

`privacy.html` describes what this code actually does — localStorage for
cart/favourites (never sent), email to the Meridian CRM, cards straight to
Stripe/PayPal, and **Google Fonts receiving an IP address on every page**,
which most generated policies omit. It also states plainly that there is no
analytics or ad tracker, because there currently is not.

Shipping and returns copy was taken from what the product page already claimed,
so the store does not now contradict itself.

## The playlist page (`playlist.html`)

"The Sound" — the brand music playlist plus a video reel. Both are unconfigured
until Otis pastes links in, and both show a setup card explaining exactly what
to paste rather than rendering as broken.

**Everything editable lives in one block** at the top of `assets/playlist.js`:
`PLAYLIST_CONFIG` (three lines: `spotify`, `appleMusic`, `youtube`) and
`VIDEO_REEL`. Paste the ordinary Share link — the parsers accept share links,
`spotify:` URIs, `youtu.be` short links, watch links carrying a `list=`, and
bare ids. A service left as `""` gets no tab; if only one is filled in, the tab
strip hides itself. A link that cannot be parsed shows a visible warning rather
than silently vanishing.

### Players load on click, never on page load

Nothing is requested from Spotify, Apple or YouTube until a visitor presses
play. Each player is first drawn as a facade — our own card, a real `<button>`.
Two reasons, both of which matter:

- Those embeds set cookies and profile the visitor the instant they load. This
  site has no consent banner, so auto-loading them would be tracking people who
  never asked to listen.
- Three embeds is several megabytes for the majority who never press play.

The click is both the consent and the play button, so it costs nothing. **Do
not "simplify" this by putting the iframes straight into the markup.** There is
a test asserting zero third-party requests before the click.

### The parsers are a security boundary

Every configured value ends up in an iframe `src`. Each parser matches a strict
pattern and then *rebuilds* the URL from the captured pieces — input is never
passed through. That is what stops a mistyped or hostile value becoming a
`javascript:` URL or a lookalike host like `open.spotify.com.evil.tld`. If you
add a service, follow the same shape; do not relax a character class.

`frame-src` in `netlify.toml` had to be widened to `open.spotify.com`,
`embed.music.apple.com` and `www.youtube-nocookie.com`. YouTube uses the
**nocookie** host deliberately. No `img-src` change was needed because the
facades are drawn in CSS rather than fetching YouTube thumbnails — which also
means no third-party request sneaks in through an image.

## An icon-font trap (fixed, worth remembering)

Material Symbols render as **ligatures**: the markup contains the literal word
`shopping_cart`, and the font turns it into a glyph. Until that font loads, the
browser lays out the actual word — about 135px instead of 24px. That pushed the
header and the bottom bar sideways off a phone screen **on every page**, and
adding a fifth nav item made it obvious.

Fix is in `styles.css` on `.material-symbols-outlined`: `width: 1em; overflow:
hidden`. A Material Symbol is drawn 1em square, so this is exact — layout is
now identical before and after the font loads.

Two related fixes went in at the same time:
- Bottom-bar items were `w-1/4`, correct for four items but wrong for five.
  They are now `flex-1 basis-0 min-w-0` — the `min-w-0` matters, because
  without it flex honours min-content and refuses to divide evenly.
- The footer brand lockup is a `nowrap` word beside an emblem and never fit a
  half-width mobile column; it is now `col-span-2 md:col-span-1`.

Test the phone viewport for `document.body.scrollWidth > window.innerWidth`,
not just that things look right at desktop width.

## Building CSS

Tailwind is compiled to a static stylesheet, not loaded from the CDN:

```
npm run build:420
```

Run this after adding any new Tailwind class. Classes that only appear inside
JavaScript strings still get picked up (`tailwind.config.js` scans
`assets/*.js`), but a class that is *constructed* at runtime will not — those
belong in the config's `safelist`. Forgetting to rebuild has already caused one
bug: new height classes were missing, so the logo rendered at zero height.

## State of things

Working:
- Cart and favorites persist in `localStorage`, survive navigation, badge counts
  update across every page.
- Category filter, sort, deep links, 404 state for unknown product ids.
- Verified in headless Chromium: all pages load clean, cart math round-trips.

Not wired up (deliberate, and labeled as such in the UI):
- **Checkout** — needs Stripe, Shopify, or similar.
- **Portal signups** — stored in the browser only; needs a mailing-list provider.
- **Product photography** — only the Vibrant Series Hoodie has a real photo. The
  other seven render typographic art tiles as placeholders.

## Theme

The site runs a light "pearl" theme. The page background is generated in CSS,
not shipped as an image: three layered radial gradients (warm cream one side,
cool mint-grey the other) plus a fine grain from an inline SVG turbulence,
each on its own fixed pseudo-element. `background-attachment: fixed` is
deliberately avoided — it repaints badly on mobile Safari — and the layers carry
`pointer-events: none` so they never swallow clicks.

Colour rules that matter when extending it:

- Body copy is `on-surface` / `on-surface-variant`; `outline` is the lightest
  tone that still clears WCAG AA on the pearl background — do not lighten it.
- Product art tiles stay dark on purpose: they stand in for product photography
  and read as images against the light page. Their decorative words carry
  `aria-hidden="true"`, so screen readers and contrast tooling skip them.
- There is a contrast sweep in the scratch tooling; every text node on all seven
  pages passes AA. Re-run it after any palette change.

## Marketing system (CRM) connection

The Portal signup feeds the Meridian marketing system rather than dying in
localStorage: `assets/crm.js` posts to `/.netlify/functions/lead`, which
forwards to the `intake` edge function. The contact lands in the CRM, an
activity is logged, and a follow-up is queued for the agent to draft.

Set `MERIDIAN_INTAKE_URL` in the Netlify environment to switch it on. Until
then the form keeps the address locally and says so — it never claims a signup
reached the CRM when it did not.

## Where we left off (2026-08-29)

Branch `claude/420-friendly-hoodie-page-yl8ho9`, PR #3 — open, unmerged, 28
commits ahead of `main`.

**`main` has none of this.** Every 420 Friendly file lives on the branch only,
so if Netlify builds production from `main`, the storefront and the Portal are
not on the live site at all. Merging PR #3 is what puts them there. That is
the single biggest thing outstanding and it is Otis's call.

### Added 2026-08-29

- **`playlist.html` ("The Sound")** — Spotify / Apple Music / YouTube tabs plus
  a video reel. Players load only on click; nothing third-party is requested
  before that. Configured by pasting share links into `assets/playlist.js`.
- **`media.html`** — the owner uploads music and video files directly and they
  play on the front page. Netlify Blobs, chunked upload, Range playback. This
  is the answer to "the client should not have to edit code".
- **Passcode fixes** — stray whitespace no longer rejects a correct passcode,
  and the not-configured error now names the deploy context, because a variable
  scoped to Production only is invisible to deploy previews.
- **A mobile layout bug fixed site-wide** — Material Symbols render as
  ligatures, so before the icon font loaded the browser laid out the literal
  word `shopping_cart` at ~135px and pushed every page sideways off a phone.

### Added 2026-08-31

- **`LOCAL-DEV.md`** — Otis now runs the site on his own Mac with `npm start`
  (`netlify dev`), which serves the pages *and* the functions. Written for
  someone new to Node projects. `.env.example` documents the variables.
- **Full site audit**: 392 controls across 13 pages, zero dead buttons, zero
  links to a missing page, 25 user flows clicked for real and all passing.
- **Sign-in errors now name the HTTP status** — only 404 was recognised as "no
  function here", so 501/405/502 gave a message that said nothing.

**Netlify Blobs is now proven.** Running against a real `netlify dev`, a 5 MB
file survived chunked upload, public listing and Range playback byte-identical.
That was the one thing the earlier in-memory tests could not establish.

**Known real issue, not yet fixed:** the only product photo is hotlinked from
`lh3.googleusercontent.com/aida/...` — a temporary Google-generated image URL
that will eventually expire and leave a broken image on the storefront. The
other 7 products render typographic placeholder tiles. Needs a real image file
committed to the repo, or uploaded via the Photos page.

**Local-machine gotcha worth remembering** (cost most of a session): while
`npm start` is running, that terminal cannot accept commands — pasted text goes
into the server as keystrokes and silently does nothing. Use `Cmd+T` for a
second tab. Also, his `~/all-in-1-events-2` was an old clone sitting on a
different branch with local edits, so every `git checkout` aborted and the site
404'd; `git stash -u` cleared it.

### Waiting on Otis — one variable each, all in Netlify → Site settings →
### Environment variables, then redeploy (env vars only apply to a new build)

| Variable | Unlocks | Notes |
|---|---|---|
| `OWNER_PASSCODE` | The owner Portal (scope it to **all** deploy contexts, or previews cannot be tested) | **Do this first** — nothing else is reachable without it. Long passphrase, not a PIN; the function refuses anything under 8 characters |
| `MERIDIAN_INTAKE_URL` | Website → CRM lead capture | The `intake` function URL. Until set, signups are kept locally and the form says so |
| `ANTHROPIC_API_KEY` | The events-site concierge | Until set it answers from scripted FAQ copy and admits it |
| `STRIPE_SECRET_KEY` + publishable key | Card / Apple Pay / Google Pay / Cash App | See PAYMENTS-SETUP.md; needs his own verified Stripe account |
| `paypalClientId` in `assets/payments.js` | PayPal + Venmo | Public value, safe in code |

### Still genuinely unbuilt

- **Real orders.** The Transactions page reads sample data; there is no payment
  provider connected, so no real sale exists. Real orders need a Stripe webhook
  and somewhere to store them.
- **Photos are still per-browser.** IndexedDB only — they do not reach a
  server, a phone, or customers. `media.html` now solves exactly this shape of
  problem for audio and video using Netlify Blobs, so porting `photos.html`
  onto `media-store.js` is the obvious next step; images need size limits and
  a thumbnail path, but the storage and auth work is already done.
- **Product photography.** Only the hoodie has a real image; the rest render
  typographic tiles. Uploading via the Portal and assigning to a product
  replaces them on the shop.
- **Stock, tax, confirmation emails** — none of these exist yet.

### Two traps this codebase has already sprung once each

- **Rebuild CSS after any Tailwind class change** (`npm run build:420`). A class
  that isn't in the compiled sheet silently does nothing — it cost a
  zero-height logo and a hero image blown up to natural size.
- **Test that nav links are *clickable*, not just present.** A stacking-context
  bug left every header link dead while looking perfectly normal, and passed
  every visibility check for days.
- **Check `document.body.scrollWidth` at 390px, on every page.** The icon-font
  ligature bug made every page overflow sideways on a phone and went unnoticed
  because it looks fine the moment the font loads.

## Open decisions

1. ~~The logo is a reproduction.~~ **Resolved** — the 3D emblem is in place,
   background removed, with matching favicons.
2. ~~Header legibility.~~ **Resolved** — the header is now 80px, the emblem 64px,
   and it is paired with a real Montserrat wordmark. The emblem carries the name
   internally too, but that lettering is unreadable below roughly 100px, so the
   wordmark is what actually names the brand on screen.

   Two traps worth remembering here. The `.hero-emblem` float animation owns the
   `transform` property, so a Tailwind translate on the same element is silently
   overwritten — position a wrapper instead. And the hero's readability wash must
   sit *under* the emblem in DOM order, or it drains the mark to a ghost.
3. ~~Gold vs green.~~ **Resolved by the light theme** — CTAs are now charcoal
   (`#1d2320`) on pearl, matching the emblem; green (`#12752f`) carries status
   and accents; gold survives only as a deepened highlight (`#8a6a05`).

Front page layout is settled — Otis likes it. Leave it alone unless asked.
