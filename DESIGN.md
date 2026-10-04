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
| `--ink-muted` | `#75706a` | Labels, captions |
| `--on-sage` | `#f7f4ef` | Ivory text on charcoal |

(Legacy token names `--sage*` are kept so nothing else had to change; they now hold charcoal.)

## Type
- **Display:** Cormorant Garamond **300** for headlines (hero 50–94px, sections 38–64px) with tight tracking (−0.01em). Italic 300 for quotes, scent notes and reviews.
- **Text:** Jost **300** at 16.5px with 1.8 line-height.
- **Labels:** Jost 400 at 9.5–11px, uppercase, tracked 0.26–0.38em. Section eyebrows carry a 28px hairline.

## Shape, space, depth
- Arches: `260px 260px 3px 3px` (hero, spotlight, story) and `160px` (product cards). Everything else is near-square (2–4px radius).
- Section padding is 84–156px; product grid gaps are 56px by 32px; incomplete rows are centered.
- Hairlines do the separating work. Shadows are soft and used only on the hero, spotlight and story images and their floating captions.
- Page frame: a 12px ivory border (passe-partout) with a 1px inner hairline.

## Components
- **Buttons:** solid charcoal, or an outline that fills on hover. Text is 11px tracked uppercase. No lift and no shadow.
- **Filters:** text tabs with an underline for the active tab.
- **Product cards:** no box; arch image, small label, serif name, italic notes, and an underlined "Add to Cart" link.
- **Reviews:** open columns divided by hairlines, with the quote in italic serif.
- **Newsletter:** stone band with an underline-only email field.
- **Footer:** the one dark charcoal anchor on the page.

## Motion
1.4s reveal fades (18px rise), a 70s ribbon marquee, and 1.6–2.4s image zooms (≤4.5%). All of it respects `prefers-reduced-motion`.
