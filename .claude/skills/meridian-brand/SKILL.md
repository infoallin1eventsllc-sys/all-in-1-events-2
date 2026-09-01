---
name: meridian-brand
description: The Meridian Interface logo, colours, type and lockup rules, with ready-to-use PNG/SVG files and drop-in code. Use whenever something carries the Meridian Interface name — invoices, letterhead, client letters, proposals, discovery and intake forms, social cards, favicons, avatars, decks, email signatures, the website header, or any generated image — so the brand comes out identical every time instead of being re-guessed.
---

# Meridian Interface — brand

> **The mark in `assets/logo/` is NOT the real logo. Otis confirmed this on
> 2026-09-01.** It was rendered from `MeridianLogoMark` in the website repo,
> which turned out to be a placeholder that shipped in the site's first commit —
> not his artwork. The real mark is narrower, more angular, and has a visible
> vertical stem; these files are a wide, symmetric, rounded M.
>
> **Do not put these files in front of a client.** Not on an invoice, a letter,
> a proposal, a social card, or a deck. Everything else here — the tokens, the
> type, the lockup ratios, the code, the renderer — was read from the live site
> and stands. Only the artwork is wrong.
>
> To fix: drop the real logo in as `assets/logo/meridian-mark.svg` (and its
> on-dark counterpart), re-run `assets/code/render-logo.mjs`, check
> `proof-sheet.png`, and delete this notice.
>
> Known surfaces currently carrying the wrong mark: the website header, footer
> and modals (`MeridianLogo.tsx`), the footer studio plate (`BuiltBy.tsx`), and
> the Project Intake artifact's letterhead.

Everything here derives from one source: the `MeridianLogoMark` paths that ship
in the live website's header (`src/components/MeridianLogo.tsx`). The colours
were read out of the site's own source, not chosen. Nothing in this folder is an
interpretation of the brand — it is the brand, exported.

**Never redraw the mark.** If a size or format is missing, re-run the renderer
(below). Hand-drawing a "close enough" M is how a brand quietly drifts.

## The mark

A folded ribbon that reads as an **M**: two outer legs, two inner folds that
arch over and dive to the centre, and a vertical meridian line through the
middle. The overlap has a real drop shadow, which is what makes it read as
folded rather than flat.

## Files

### `assets/logo/` — finished art

| File | Size | Use it for |
|---|---|---|
| `meridian-lockup-light.png` | 1923×576 | Mark + wordmark on **light** backgrounds. Letterhead, invoices, proposals, light decks. |
| `meridian-lockup-dark.png` | 1923×576 | The same lockup on **dark** backgrounds. Dark decks, navy email headers, social cards. |
| `meridian-mark.png` | 384×384 | Mark alone, transparent, drawn for light backgrounds. Favicons, inline bullets, watermarks. |
| `meridian-mark-tile.png` | 576×576 | Mark on a rounded navy tile. **Profile pictures and app icons** — anywhere the background is out of your control. |
| `meridian-mark.svg` | vector | The mark for print, signage, vinyl, or any size above ~1000px. |
| `meridian-mark-on-dark.svg` | vector | Same, drawn for dark backgrounds. |
| `proof-sheet.png` | — | Every variant on its intended background at real sizes. Look here before shipping. |

All four PNGs have a genuine alpha channel, so they drop onto any background
without a white box. The two lockups are the same pixel dimensions, so swapping
one for the other never reflows a layout.

### `assets/code/` — for anything being built

- **`MeridianLogo.tsx`** — the React component, with `iconOnly`, `lightText`,
  `size` and `singleLine` props. Use this in any React surface; it beats an
  image because it stays sharp and costs no network request.
- **`logo-snippet.html`** / **`logo-snippet-dark.html`** — the same lockup as
  plain HTML with inline SVG, one file per background. For static pages and
  anything without a build step. Use the file that matches the background.
- **`brand-tokens.css`** — CSS custom properties plus a `.meridian-lockup` class
  that scales the whole lockup off one number (`--m`, the mark height).
- **`brand-tokens.json`** — the same values as data, for generators, edge
  functions, and anything that composes images server-side.
- **`render-logo.mjs`** — regenerates every PNG and SVG above from the paths.
- **`qa-sheet.mjs`** — rebuilds `proof-sheet.png`.

### One gotcha worth knowing

There is deliberately **no light/dark toggle class** on the HTML lockup, and it
is not an oversight. An SVG gradient inside a `display:none` element is a dead
paint server: put both marks in one snippet and hide one, and the *visible* mark
on the next lockup down the page silently renders as nothing. It was built that
way first and caught in review. Two files with one mark each cannot fail that
way.

Mixing both snippets on one page is safe — their gradient ids differ (`_l` vs
`_d`) — and so is repeating the same lockup at different sizes. In React, use
`MeridianLogo.tsx`, which generates unique ids per instance with `useId()`.

## Colour

| Token | Hex | Where it belongs |
|---|---|---|
| Ink | `#0f172a` | The wordmark, headings, the darkest surface. This is the brand colour — it appears 61 times in the site's source. |
| Body | `#191c1f` | Body copy. |
| Surface | `#f7f9fd` | Page background. |
| Accent | `#2563eb` | Links and primary buttons. Sparingly, and **never inside the mark**. |
| Muted | `#475569` | The INTERFACE line on light backgrounds. |
| Muted (dark) | `#cbd5e1` | The INTERFACE line on dark backgrounds. Not pure white — that flattens the hierarchy. |
| Hairline | `#e2e8f0` | Borders and rules. |

The mark itself is a slate ramp from `#f8fafc` to `#1a202c`. Those are shading,
not brand colours; don't pull them out for anything else.

## Type

- **Display — Hanken Grotesk, weight 800.** The MERIDIAN wordmark and all
  headings. Tracking `0.2em` on the wordmark.
- **Body — Inter, weight 400–700.** The INTERFACE line and all copy. Tracking
  `0.28em` on the INTERFACE line.

Both are self-hosted in the website repo at `public/fonts/*.woff2`. There is no
runtime dependency on a font CDN, and there should not be one.

## Lockup rules

Everything scales off the **mark height**. Set that one number and the rest
follows — this is why the logo survives from a 16px favicon to a trade-show
banner without being redrawn.

| Relationship | Ratio |
|---|---|
| Gap between mark and text | 0.389 × mark |
| MERIDIAN cap height | 0.5 × mark |
| INTERFACE cap height | 0.306 × mark |
| Space above INTERFACE | 0.111 × mark |
| Clear space on all sides | 0.25 × mark |

**Clear space is not decoration.** Nothing — no rule, photo edge, page margin or
other logo — enters that box.

### Minimum sizes

Checked against the proof sheet, not assumed:

- **Full lockup: 28px tall minimum.** Below that INTERFACE closes up and stops
  being a word.
- **Mark alone: 24px minimum**, and prefer 32px. At 16px the ribbon folds start
  to merge and it reads as a smudge.
- Under 24px, use the **tile** instead — the solid background holds the shape
  together where the strokes cannot.

### Choosing a variant

1. Light background you control → `lockup-light`.
2. Dark background you control → `lockup-dark`.
3. Background you do **not** control (a social avatar, someone's email client, a
   partner's deck) → `mark-tile`. This is the single most common mistake:
   shipping the transparent mark somewhere that turns out to be dark, or
   magenta, and having it vanish.
4. Print, signage, or anything above ~1000px → the **SVG**, never the PNG.

## Never

- Never recolour the mark, add a stroke, or flatten out the drop shadow — the
  shadow is what makes the fold legible.
- Never stretch it. Scale both dimensions together.
- Never set the wordmark in a substitute font. If Hanken Grotesk is not
  available, use the PNG lockup rather than a fallback face.
- Never place the transparent mark on a busy photograph. Use the tile.
- Never rebuild the mark from a screenshot or a raster trace. Re-run the
  renderer instead.

## Regenerating

```bash
cd assets/code
ln -s /path/to/system/tools/node_modules node_modules   # needs playwright-core
node render-logo.mjs /path/to/meridian-interface-website
```

It reads the woff2 files straight out of the website repo, so the wordmark is
rendered in the real face rather than a lookalike, and it screenshots at a
device scale of 3 with `omitBackground` for true alpha. Screenshots are clipped
to a rounded box on purpose: flex layout shrink-wraps to a fractional width, and
an app icon that comes out 387×384 instead of 384×384 gets rejected by the
stores.

If the mark ever changes in `MeridianLogo.tsx`, copy the new file into
`assets/code/`, mirror the path changes into `render-logo.mjs`, re-run it, and
**look at `proof-sheet.png`** before committing. Rendering is not verification.
