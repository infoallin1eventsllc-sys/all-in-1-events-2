# Stitch lookbooks — what came from where

Otis builds lookbooks in Stitch and pastes their HTML into the chat. That HTML
carries every product image as an `lh3.googleusercontent.com/aida/…` URL, and
those URLs **expire**. Each paste is therefore time-sensitive: the images have to
be pulled into permanent storage before the link dies.

This container's network policy blocks that host, but Raylight's server does not,
so `upload_media {url}` is what actually rescues them. They now live in the
Raylight project's asset library:

    420 FRIENDLY — Haze Snapback Launch
    https://www.raylight.app/editor/e00560e1-b9dc-4879-8f88-964a0d81ad1c

---

## Lookbook 1 — "ARCHIVE // V.24", 16 individual pieces

Pasted 2026-09-13. This is what `assets/products.js` was rebuilt from, and what
the storefront now sells.

Four hoodies ($135–148), four bottoms ($115–118), two tees ($58), three
snapbacks ($48), two bucket hats ($52), one beanie ($44).

## Lookbook 2 — "Archive Showcase", 6 paired tracksuit SETS

Pasted 2026-09-13, shortly after. A **different commercial structure**: hoodie
and sweatpants sold together as a set at **$380–395**, not as separate items.

| Set | Colourway | Price |
|---|---|---|
| 01 | Crimson Red / Collegiate 420 | $380 |
| 02 | Heather Grey / Hybrid Botanical | $380 |
| 03 | Matte Black / Emerald Triangle Map | $395 |
| 04 | Matte Black / Indica Sleeve | $380 |
| 05 | Crisp White / Hybrid Emblem | $380 |
| 06 | Deep Navy / Sativa Suite | $380 |

Seven of its twelve images were new and are saved as `S1a`…`S5a` in the Raylight
library. The other five are the same files already in lookbook 1 — Stitch reused
them across both documents.

**Not yet on the storefront, deliberately.** Selling the same garments both
individually and as sets is a real pricing decision, not a merge: two $138-ish
pieces bought separately come to roughly $253, while the set is $380. Those
numbers have to be reconciled before either goes live, and that is Otis's call.

## Lookbook 3 — "Archive Showcase" expanded, 10 sets + 4 separates

Pasted 2026-09-13, straight after lookbook 2. Supersedes it: the same six sets
plus four more, and it adds **per-item prices inside the set** — $195 hoodie,
$185 sweatpants, $380 the pair.

| Set | | Set | |
|---|---|---|---|
| 01 | Crimson Red / Collegiate 420 | 06 | Deep Navy / Sativa Suite |
| 02 | Heather Grey / Botanical Hybrid | 07 | Matte Black / Refined 420 Monogram |
| 03 | Matte Black / Emerald Triangle Map | 08 | Collegiate Grey / Athletic 420 |
| 04 | Matte Black / Indica Arm & Outseam | 09 | **Believe In Cannabis / Tactical** |
| 05 | Crisp White / Hybrid Emblem | 10 | Emerald Triangle / Red Edition |

Plus four separates sold individually at the same $195 / $185.

**Set 09 is worth noting:** the hoodie reads *Believe in Cannabis* and the
sweatpants *In Cannabis We Trust* — the two lines already on the homepage hero.
The garment and the website say the same thing, which nothing else in the range
does.

Sixteen more images saved (`S1b v2`…`SEP4`). Four of them arrived on a different
Stitch host, `aida-public/AB6AXu…`, and came back **512×279 rather than square** —
they are wider crops of the same garments, so the square originals are the ones
to use.

### The arithmetic now has three answers

| Route | Hoodie + pant |
|---|---|
| Storefront today (lookbook 1) | $148 + $118 = **$266** |
| Lookbook 3, bought separately | $195 + $185 = **$380** |
| Lookbook 3, bought as a set | **$380** |

The set is priced identically to buying both pieces, so it is not a bundle
discount — and both are well above what the site currently charges for the same
garments. The storefront has not been changed to match, deliberately: which of
these is real is Otis's decision, not a merge conflict to resolve.

---

## Full-size versions

Everything rescued this way is **512×512** — what Stitch embeds in the HTML, not
what it exports. Fine for video, soft for a product page. The one image that came
through a zip, `assets/products/haze-snapback.webp`, is 1024 and visibly better.

To upgrade: export full size from Stitch, drop the files in Google Drive, and
they can be committed to `assets/products/` and served from our own origin
instead of Raylight's.
