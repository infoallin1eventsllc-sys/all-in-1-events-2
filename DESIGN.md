# Secrets of Cint — Design System ("Maison" edition)

**Mode:** Persuade / Experience: a luxury product site where the mood sells the candle.
**Brief:** Elegant, soft, black & white. The tone is quiet luxury, like a fragrance house rather than a web store.
**Avoid:** stark #000/#fff blocks, chunky pill buttons, drop shadows on everything, icon tiles, pulsing "live" dots, and loud badges.
**Photos:** client's real product photos, used exactly as supplied (no retouching).

## Palette — soft monochrome
| Token | Value | Use |
|---|---|---|
| `--cream` | `#faf8f5` | Page (warm ivory) |
| `--cream-soft` | `#fffefc` | Raised surfaces (porcelain) |
| `--cream-warm` | `#f2efea` | Alt bands, image mats (stone) |
| `--line` / `--line-strong` | `#e8e4dd` / `#d6d1c8` | Hairlines |
| `--ink` / `--sage` | `#1f1d1a` | Headlines, buttons, footer (soft charcoal) |
| `--ink-soft` | `#4f4b45` | Body text |
| `--ink-muted` | `#645f59` | Labels, captions (5.5:1 on stone, the darkest surface it sits on) |
| `--on-sage` | `#f7f4ef` | Ivory text on charcoal |

(Legacy token names `--sage*` are kept so nothing else had to change; they now hold charcoal.)

## Type
- **Display:** Cormorant Garamond **300** for headlines (hero 50–94px, sections 38–64px) with tight tracking (−0.01em). Italic 300 for quotes, scent notes and reviews.
- **Text:** Jost **300** at 16.5px with 1.8 line-height.
- **Labels:** Jost 400 at 10.5–11px (never smaller), uppercase, tracked 0.22–0.38em. Section eyebrows carry a 28px hairline.

## Shape, space, depth
- Arches: `260px 260px 3px 3px` (hero, spotlight, story) and `160px` (product cards). Everything else is near-square (2–4px radius).
- Section padding is 84–156px; product grid gaps are 56px by 32px; incomplete rows are centered.
- Hairlines do the separating work. Shadows are soft and used only on the hero, spotlight and story images and their floating captions.
- Page frame: a 12px ivory border (passe-partout) with a 1px inner hairline.

## Components
- **Buttons:** solid charcoal, or an outline that fills on hover. Text is 11px tracked uppercase. No lift and no shadow.
- **Filters:** text tabs with an underline for the active tab.
- **Product cards:** no box; arch image (nothing laid over it), small label, serif name, italic notes, price with an optional hairline tag ("Best Seller" / "New Arrival") beside it, and an underlined "Add to Cart" link.
- **Reviews:** open columns divided by hairlines, with the quote in italic serif.
- **Newsletter:** stone band with an underline-only email field.
- **Footer:** the one dark charcoal anchor on the page.

## Motion
1.4s reveal fades (18px rise), a 70s ribbon marquee, and 1.6–2.4s image zooms (≤4.5%). All of it respects `prefers-reduced-motion`.

## Hero: "A new life candle experience" film
- The hero background is flat #000, the same black as the film, so the two read as one surface.
- The hero plays the 15-second black-and-white Clipkit film (match strike → Exotic Peach → Brewed Elixir → Inferno Dreams → wordmark and tagline) with its piano score. Source project: `marketing/film/`.
- Files: `assets/video/hero-film.mp4` (H.264/AAC, 720×1280, for Safari and everything else), `assets/video/hero-film.webm` (VP9/Opus, smaller) and `assets/video/hero-film-poster.jpg` (shown while loading and for reduced motion).
- Layout: copy on the left in ivory; the film on the right, flat and unframed (no arch, no hairline) so the full frame of the film shows. On tablets and phones the film drops below the buttons.
- Browsers only autoplay silent video, so it starts muted and loops. The **Sound on** button (`assets/js/hero-film.js`) unmutes it and restarts from the match strike so the music plays from the top. It pauses when scrolled away and doesn't autoplay for visitors who turn off motion.
- To swap the film: export a new MP4 from the Clipkit editor and replace the three files above (keep the names).
- **Higgsfield cut (live since 2026-10-07):** the hero now plays the version shot with Higgsfield (Seedance 2.5) from the real product photos: a slow-motion match strike, Exotic Peach, Brewed Elixir (its wicks ignite), Inferno Dreams dimming to black, then the logo card. Same 15 s, same licensed soundtrack; MP4 0.98 MB, WebM 0.87 MB, well inside the 1.5 MB budget.
- **Flow pass (awesome-design, taste, apple-interface, cinematic-web), 2026-10-07.** The raw AI shots read as a grey box pasted on black and jumped in brightness from shot to shot. Fixes: (1) *Grade*: one tonal family across the three product shots, labels kept bright. (2) *The film has no edge*: every frame falls off to pure black at its borders, and the CSS mask feathers the video again (`mask-image`, two intersected linear gradients) so no renderer can draw a box; the corner radius is gone. (3) *Joins are 0.8 s dips through black*, so each scent arrives out of the dark the way the logo does. (4) *The copy follows the film*: the "In the film" line lights and underlines the scent on screen and steps the others back to 62% ivory (still 7:1 on black); times live on the links as `data-from`/`data-to`; off under reduced motion. This is the one memorable move (taste); state reads at a glance without a hover (awesome-design 10). (5) *Sound button* centred under the film on its symmetric falloff, still 44 px with its press state (apple-interface). (6) *Poster* is the Brewed Elixir frame with both wicks lit, shown for reduced motion and blocked autoplay. (7) Alt text describes this cut honestly. Shipping test: squint, grayscale, 375 px and stranger all pass. Master and shot list in `marketing/film/README.md`; `marketing/film/higgsfield/finish.sh` re-encodes the site files from the master. The Clipkit cut remains available from its frames.
- Skill pass (from `.claude/skills` on `main`): **cinematic-web**: the film is a composed sequence from real product cutouts (tier 3 on its ranking, no generated imagery), served under the 1.5 MB looping-video budget (MP4 1.16 MB, WebM 1.19 MB, 60 KB poster), WebM first, muted, pure #000 behind it; depth via a damped scroll drift on the film capped at 18 px (transform only, desktop, off under reduced motion); one orchestrated reveal (film settles, copy rises as one block, scent line last). **apple-interface**: Sound button at a 44 px hit target with a press state and an opaque `prefers-reduced-transparency` fallback. **taste**: display h1 tracks -0.03em, hairlines at 8% on dark, button hover is a 2 px lift. **awesome-design**: passes squint, grayscale (the hero is monochrome), phone (375 px) and stranger (one loud headline, one primary button that says what it does).
- Impeccable passes applied to the hero (Persuade mode): **typeset**: balanced h1 wrapping, lead at 46ch with pretty wrapping. **animate**: the badge, headline, lead and buttons reveal in a 0.12s stagger (`data-delay`), the film fades up from black on first play, the whole thing holds still under `prefers-reduced-motion`. **layout**: the hero fills the first screen below the header on desktop (`min-height: calc(100svh - 126px)`), the film at `min(72vh, 720px)`. **delight**: the three scents from the film sit under the buttons as serif links that deep-link to their cards (`#p-<id>`, with `scroll-margin-top`). **audit**: no gradient, no shadow, no frame, no scroll cue; focus rings are ivory on the black so keyboard users can see them.


## Site-wide skill pass (cinematic-web, apple-interface, taste, awesome-design)
- **Honesty.** Product cards show price only; the star ratings and review counts were invented and are gone until real reviews exist. The review section is labelled as sample reviews, with name and city rendered as dashed `.slot` placeholders (`[Customer name]`, `[City, state]`) and no star row; a real review (any name not in brackets) renders normally with "Customer review". Footer links only point to sections that exist; Wholesale, Candle Care, Shipping & Returns and FAQ return when those pages do. Social icons keep their slots until the URLs arrive.
- **Density over tiles.** The story section's four icon tiles became a hairline spec list (`.specs`: Wax, Fragrance, Vessel, House). Same facts, no decoration.
- **Icons.** Stroke SVG only. The 🔒 emoji on Owner Login is a 12px lock glyph now.
- **Motion.** Section reveals are 0.9s / 14px (down from 1.4s / 18px) so the hero's orchestrated move is the page's one event.
- **Hit targets.** Filter chips, card "Add to Cart" links and Owner Login are all 44px tall without changing their look.
- **Copy.** Newsletter blurb is one concrete sentence; the dingbat after the thank-you line is gone; the reviews subhead no longer claims "coast to coast".


## Debug pass (structure, layering, accessibility) — 2026-10-05
Automated checks run in a real browser at 1440 and 375 (and 320 for the header), re-run after fixes until clean:
- **Structure:** valid tag balance, no duplicate ids, every image has alt, every icon-only button has an aria-label, one `main`/`header`/`footer`. Footer headings were h5 after h2 (skipped levels) and are h3 now, same look.
- **Overflow:** the page scrolled sideways on phones (header content was wider than a 375px screen because the brand could not shrink). The brand now shrinks, the header gaps tighten under 620px, the subtitle hides, and the name steps down at 360px. `scrollWidth == clientWidth` at 375 and 320.
- **No-JS:** the hero video's fade-in hid it permanently when JavaScript was off (the reveal depended on a `.no-js` class nothing set). The hide-then-reveal is now gated on the `.js` class `head.js` adds, so without JS the video is simply visible.
- **Hit targets:** cart and menu buttons 42→44px, wishlist hearts 34→44px, social icons 38→44px. Every control measures ≥44px on both viewports.
- **Contrast:** the "In the film" label on black was below AA (ivory at 45%); now 62%.
- **Dead CSS removed:** the old photo-hero rules (`.hero-grid`, `.hero-media`, `.hero-frame`, `.hero-tag`, `.hero-emblem`, `.hero-trust`, `.rating-float`, `.scent-pills`, `.pill`) and a duplicate `.owner-login` rule. Stylesheet 586→~545 lines; no selector is defined twice outside media queries.
- **Layering:** z-index inventory is now just `.mobile-nav` (99) and the portal overlay (120); the hero uses `isolation: isolate` with no z-index games.
- **Behaviour exercised:** filter chips, add-to-cart + toast + badge, Sound on/off (mute state verified), newsletter submit, scent deep links scroll to their cards, 13 products and 4 reviews render. Console: no page errors (the only failed request is Google Fonts, blocked by the sandbox, not the site).


## Clarity QC (every word legible, everything in its place) — 2026-10-05
A script measured every visible text node in a real browser at 1440 and 375: computed size, contrast of the rendered colour against the surface actually behind it (opacity chains and translucent layers included), clipping and off-screen position. Then full-page screenshots were read section by section at both widths.
- **Contrast.** The muted label grey (`--ink-muted`) was `#75706a`, which reads 3.6:1 on ivory and 3.5:1 on stone, below the 4.5:1 reading floor. It is `#645f59` now: 5.9:1 on ivory, 5.5:1 on stone, 6.3:1 on porcelain. That one token carried every eyebrow, filter chip, card category, scent-note key, spec label, review caption, newsletter note and the burn-time caption, so all of them pass in one change. The footer's bottom line went from ivory at 50% to 60%.
- **Size floor.** Nothing tracked-uppercase sits below 10.5px any more (was 9–10px): announcement bar, header subtitle, cart count, hero scent label, Sound button, badges, card categories, Add to Cart, pop-up code, scent-note keys, burn-time caption, spec labels, review captions, newsletter note, footer headings, portal buttons. Label scale in the type section is now 10.5–11px.
- **Badges off the photographs.** "Best Seller" sat on top of the lettering printed in the Harlem Smock artwork; a top corner clipped against the arch. Badges are now a hairline tag beside the price, in the card text, so no photo is ever covered and the tag can never be covered. Product names stay level across a row.
- **Reviews.** Sample reviews showed a stray dot in the avatar circle; the circle is an empty dashed slot now, matching the dashed name and city slots. The renderer no longer draws a hard-coded five-star row for a real review (a rating that was never collected is an invented one).
- **Phone fit.** The hero badge broke onto two lines between its two hairlines at 375px; it keeps one line and one hairline there, and just the words at 320px. Card categories tighten their tracking so "Signature Candle" fits a two-column card on one line. The footer's bottom line stacks (copyright, tagline, Owner Login) instead of wrapping around a stray separator dot.
- **Dead rules removed:** `.card .rate`, `.card .rate .s`, `.review .stars`, `.card-badges`, the duplicate 8px header-subtitle rule, and the unused `starStr()` helper.
- **Re-verified:** contrast audit clean at both widths; filters, cart, sound, newsletter and deep links still pass; `scrollWidth == clientWidth` at 375 and 320; all controls ≥44px.


## Deep diagnostic (structure, behaviour, accessibility, deploy) — 2026-10-10
Every state of the one page was tested in a real browser at 1440 and 375 (fit also checked at 1024, 768 and 320), served with the exact security headers the site deploys with. Tools: the html-validate standards checker, the axe-core accessibility engine (page, open menu, PIN dialog and photo panel, both widths), and scripted runs of every feature. Final state: validator clean except the intended muted autoplay; axe clean in all seven states; zero CSP violations, zero failed requests, zero script errors.

**Bugs found and fixed**
- **Menu (phones).** Escape did nothing; focus stayed behind the sheet; closed links were reachable by Tab. The sheet is now a modal dialog: `inert` when closed, focus moves to Close on open, Tab stays inside, Escape and Close return focus to the menu button, `aria-expanded` on the button; it closes itself if the window grows past the desktop breakpoint.
- **Wishlist.** A heart was lost whenever the filter changed (state lived in the re-rendered DOM). State now lives in data; hearts expose `aria-pressed`.
- **Filters.** Claimed `role="tablist"` with no tabs (axe critical). Now a labelled group of toggle buttons with `aria-pressed`.
- **Cart.** The count was invisible to screen readers; the button now reads "Cart, 2 items". Card buttons read "Add to Cart: Harlem Smock" (visible words first, so voice control still works).
- **Toasts.** `left: 50%` capped their width at half the screen, so phone toasts wrapped into a narrow two-line pill; and at `z-index: 101` they rendered *under* the portal's backdrop (120). Now `width: max-content` and `z-index: 130`.
- **Owner portal.** PIN box and panel are real dialogs (`role="dialog"`, `aria-modal`, labelled), focus stays inside, Escape and Close return focus to Owner Login; wrong PIN marks the field invalid and is announced. The photo upload was `display: none` and unreachable by keyboard; it is now visually hidden but focusable with a visible focus ring. Every panel control is 44 px. On phones the photo cards ran off the right edge (`1fr` grid minimum); fixed with `minmax(0, 1fr)` and a stacked card. Emoji (lock, camera) replaced by a stroke SVG lock and plain text.
- **Photo storage.** A phone photo (3–8 MB) stored as a data URL overflows the ~5 MB the browser allows, so it vanished on reload with no warning. Uploads are scaled to 1600 px (JPEG 0.86) before storing: a worst-case 12 MB, 4000×3000 test photo stores at about 1 MB and survives a reload. If storage still refuses, the toast says so.
- **Deploy caching.** `/assets/*` was cached for a year without revalidation, but assets keep their names when they change (the film, CSS/JS, photos replaced via the portal ZIP), so returning visitors would have kept stale files. Now `max-age=0, must-revalidate` (ETag 304s). CSP also gains `object-src 'none'`.
- **Structure.** Review titles skipped from h2 to h4 (now h3). The video used `aria-label`, which video does not support; it is now described by a screen-reader `figcaption`. Social icons were links to `#` (scrolled to the top); they are visible dashed slots, labelled "link coming soon", until the URLs arrive. Two navigation landmarks shared a name (the mobile one is now "Mobile"); the announcement bar is a labelled region. Buttons declare `type`; raw `&` escaped; the phone number cannot break mid-number. Inline styles in the menu and footer moved into the stylesheet. Invented ratings and review counts were deleted from the product data (they were no longer shown, but should not exist).
- **Newsletter.** An invalid address now sets `aria-invalid` (cleared on typing); the success toast lost its dingbat.

**Polish (taste, awesome-design, apple-interface)**
- Add to Cart buttons sit level across every row (pinned to the card bottom), whatever the note length or badge.
- All four filters fit on one line down to 320 px (tighter tracking on phones; 10.5 px, the label floor, at 320).
- Phones: the shipping bar is two clean lines instead of a wrap with a dangling bullet; Join the List is full width under the field like the hero buttons; Owner Login aligns with the lines above it.
- README rewritten to describe the site as it is (it still described an older olive-and-gold version with eight scents and live ratings).
