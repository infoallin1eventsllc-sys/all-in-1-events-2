---
name: meridian-brand
description: The Meridian Interface logo, colours, type and lockup rules, with his real logo files and drop-in code. Use whenever something carries the Meridian Interface name — invoices, letterhead, client letters, proposals, discovery and intake forms, social cards, favicons, avatars, decks, email signatures, the website header, or any generated image — so the brand comes out identical every time instead of being re-guessed.
---

# Meridian Interface — brand

The artwork here is Otis's own, supplied by him. The colours and type were read
out of the live site's source, not chosen. Nothing in this folder is an
interpretation of the brand.

**Never redraw the mark.** Every file here traces back to
`meridian-lockup.png`, his transparent master; `meridian-mark.png` is a crop of
it, not a reconstruction. A hand-drawn "close enough" M is how a brand quietly
drifts — and it already happened once: this repo shipped an invented SVG M for
months and it reached a published client form before anyone compared it.

## The mark

Two ribbon strokes forming an **M** with flat, angled tops and rounded outer
corners, cut through the centre by a thin vertical line — the meridian. The left
stroke is cool blue-slate, the right a neutral grey, so the two halves read as
distinct planes.

## Format: raster only

There is **no vector master.** The largest file is 1024px. That is fine for
screens and ordinary print, and not enough for a sign, a vehicle wrap, or
embroidery. If any of those come up, the mark needs redrawing as a vector by
someone treating this artwork as the reference — a real job, not an export.

## Files

### `assets/logo/` — the artwork

| File | Size | Alpha | Use it for |
|---|---|---|---|
| `meridian-lockup.png` | 885×550 | yes | **The master.** Mark + wordmark, transparent. Letterhead, invoices, proposals, the footer plate — anywhere the ground is light. |
| `meridian-mark.png` | 342×333 | yes | The mark alone, cropped from the master. Use beside your own live text when you need the wordmark to be a colour the file cannot give you. Favicons, avatars, watermarks. |
| `meridian-logo-square.png` | 1024×1024 | **no** | The lockup on an off-white ground, square. Largest file available. |
| `meridian-icon-512.png` | 512×512 | **no** | The lockup letterboxed into a square on off-white. See the warning below. |
| `proof-sheet.png` | — | — | Every file on every ground it has to survive, at the sizes where logos fail. Look here before shipping. |

### Three things the proof sheet shows

**The wordmark is near-black, so the lockup dies on dark grounds.** Direct on
navy the mark survives and the words sink into the background. This is the most
likely way to ship something embarrassing. Two fixes: a light plate behind it,
or `meridian-mark.png` beside live text you control the colour of.

**The mark alone is fine on dark.** Its gradient is light enough to hold against
navy down to about 20px. Only the wordmark has the problem.

**`meridian-icon-512.png` is not an app icon.** It is the whole lockup squeezed
into a square, so at any real icon size the words turn to mush — and it has no
transparency, so it shows a pale box on a dark home screen. For an app icon or a
social avatar, put `meridian-mark.png` on a plate of your own instead.

### `assets/code/` — for anything being built

- **`MeridianLogo.tsx`** — the React component. Renders `meridian-mark.png`
  beside live text, so the wordmark can be dark on a light header and light on a
  dark footer. Props: `size`, `iconOnly`, `lightText`, `singleLine`.
- **`logo-snippet.html`** — the same thing in plain HTML, with the dark-ground
  variant beside it. For static pages and anything without a build step.
- **`brand-tokens.css`** / **`brand-tokens.json`** — colours, type and the
  lockup ratios, as CSS variables and as data.
- **`proof-sheet.mjs`** — rebuilds `proof-sheet.png` from the files in
  `assets/logo/`. Run it after changing any artwork, and then *look at it*.

### One divergence, on purpose

The website sets the wordmark as **live text in Hanken Grotesk, stacked**, next
to the mark. Otis's lockup file has it **in a plain grotesk, on one line**.
Those do not match, and the reason is contrast: his wordmark is baked in at
near-black and would vanish on the navy footer, while live text can be any
colour. Where the ground is light — the footer plate, letterhead, invoices — use
his lockup file and the question does not arise. Worth a decision at some point:
either accept the two treatments, or set the wordmark in his typeface
everywhere and always give it a light plate.

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

Read off the proof sheet, not assumed:

- **Full lockup: 26px tall minimum.** Below that the wordmark closes up. At 40px
  it is comfortable.
- **Mark alone: 20px minimum**, and prefer 32px. The meridian line is the first
  thing to disappear.

### Choosing a file

1. **Light ground you control** → `meridian-lockup.png`. This is the default and
   the most faithful thing you can ship.
2. **Dark ground you control** → the lockup on a light plate, or
   `meridian-mark.png` beside your own text.
3. **Ground you do not control** (a social avatar, someone's email client, a
   partner's deck) → `meridian-mark.png` on a plate of your own. This is the
   most common way to ship something broken: sending a transparent lockup
   somewhere that turns out to be dark.
4. **Signage, a wrap, embroidery, anything above ~1000px** → none of these.
   Commission a vector first; see *Format: raster only*.

## Never

- Never recolour the mark or add a stroke. The two-tone split — cool slate left,
  neutral grey right — is the design.
- Never stretch it. Scale both dimensions together.
- Never put the lockup file straight onto a dark background. The wordmark is
  near-black and disappears; the proof sheet shows exactly what that looks like.
- Never use `meridian-icon-512.png` as an app icon or avatar. It is the whole
  lockup in a square with no transparency.
- Never rebuild the mark from a screenshot, a trace, or from memory. Crop the
  master instead — that is all `meridian-mark.png` is.

## Regenerating the proof sheet

```bash
cd assets/code
ln -s /path/to/system/tools/node_modules node_modules   # needs playwright-core
node proof-sheet.mjs
```

After changing any file in `assets/logo/`, run it and **look at the result**.
Rendering is not verification. The invented mark this skill originally shipped
rendered perfectly; it was just the wrong logo.
