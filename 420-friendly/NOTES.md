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

## Where we left off (2026-08-25)

Branch `claude/420-friendly-hoodie-page-yl8ho9`, PR #3 — open, green, unmerged.
Everything below is built and verified; what remains is configuration only, and
all of it is Otis's to do because it involves his own accounts and keys.

### Waiting on Otis — one variable each, all in Netlify → Site settings →
### Environment variables, then redeploy (env vars only apply to a new build)

| Variable | Unlocks | Notes |
|---|---|---|
| `OWNER_PASSCODE` | The owner Portal | **Do this first** — nothing else is reachable without it. Long passphrase, not a PIN; the function refuses anything under 8 characters |
| `MERIDIAN_INTAKE_URL` | Website → CRM lead capture | The `intake` function URL. Until set, signups are kept locally and the form says so |
| `ANTHROPIC_API_KEY` | The events-site concierge | Until set it answers from scripted FAQ copy and admits it |
| `STRIPE_SECRET_KEY` + publishable key | Card / Apple Pay / Google Pay / Cash App | See PAYMENTS-SETUP.md; needs his own verified Stripe account |
| `paypalClientId` in `assets/payments.js` | PayPal + Venmo | Public value, safe in code |

### Still genuinely unbuilt

- **Real orders.** The Transactions page reads sample data; there is no payment
  provider connected, so no real sale exists. Real orders need a Stripe webhook
  and somewhere to store them.
- **Photos are per-browser.** IndexedDB only — they do not reach a server, a
  phone, or customers. Needs object storage to publish.
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
