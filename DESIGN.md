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
- **Higgsfield cut (2026-10-07):** a second version shot with Higgsfield (Seedance 2.5) from the real product photos: match strike, Exotic Peach, Brewed Elixir, Inferno Dreams, logo card, same 15 s and same soundtrack plan. The master sits in the agency's Higgsfield library; `marketing/film/higgsfield/finish.sh` turns it into the three site files once it is downloaded (the session's network policy blocks Higgsfield's download hosts). Details and shot list in `marketing/film/README.md`.
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
