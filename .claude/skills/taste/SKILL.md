---
name: taste
description: "Otis's aesthetic defaults — the taste calls that make work look like his, distilled from real decisions on his shipped designs. Apply it whenever creating or judging anything visual for him or his clients: mockups, sites, artifacts, decks, posters, dashboards, social graphics. It settles the recurring judgment calls — density, accent discipline, metadata voice, hover behavior, icon style, placeholder honesty, copy tone — so new work lands in his taste on the first pass instead of after three rounds of notes. Load it alongside meridian-stack (which holds the brand tokens) at the start of any design task; it governs even when no brand system applies. Skip it for pure code, data, and documents with no visual surface."
---

# Otis's taste

Distilled from decisions he actually made, not preferences he described.
`meridian-stack` holds the tokens for his two brands; `impeccable` holds his
working vocabulary for directing changes. This skill is the judgment layer —
what "good" looks like to him when a call has to be made.

## The center of gravity: engineered density

Given options, Otis picks the **dense, information-forward direction** — the
21st.dev idiom — over airy minimalism or decorative maximalism. What that
means in practice:

- Content earns space; whitespace is structure, not padding. Tight rows,
  real data, working filters.
- Chrome is quiet so content can be loud: hairline dividers at low contrast
  (7% white on dark, warm `#E7E5DD`-class lines on light), never heavy
  borders or boxed-in everything.
- A command-palette sensibility: search fields with ⌘K hints, mono counts on
  tabs, list-first layouts. The UI should feel operated, not toured.

## Ten standing calls

1. **One accent works per view.** On the dark brand orchid leads and cyan
   supports; on ivory, steel leads. A second accent appears only with a job
   (state, category), never for variety.
2. **Mono is the data voice.** Timestamps, counts, labels, meta:
   `ui-monospace`, 9–11px, +0.12–0.18em, uppercase. Body text never does
   this job; mono never carries prose.
3. **Type pairs are Sora + a humanist sans.** Display gets tighter and
   heavier as it gets bigger (88px at -0.035em is right; 88px at default
   tracking is wrong). For brand-less work, still avoid the AI-default faces
   (Inter-by-reflex, Space Grotesk, Fraunces) — Inter is fine only where a
   system already uses it.
4. **Hover is a lift, not a spectacle.** 2–3px translateY plus a border or
   shadow shift, 150–350ms, house easing `cubic-bezier(.2,.7,.2,1)`. Cards
   never scale; images inside them may, slowly and ≤1.05.
5. **Selection is border + ring, never a fill change.** Loading is a
   skeleton holding the exact final footprint, never a spinner.
6. **Icons are stroke SVG** on a 16/20/24 grid, 1.2–1.7 stroke, colored by
   token. Emoji and dingbats are never icons. Emoji in content only if a
   brand explicitly uses them (his don't).
7. **Missing facts render as visible slots** — dashed-underline `[RATE]`,
   `[EVENT DATE]` — never as invented numbers, testimonials, or dates.
   A fabricated stat is a worse look than an honest placeholder.
8. **Buttons and chips are pills on the dark brand** (radius full, letter-
   spaced 600 labels); cards are 8–12px radius everywhere. No `rounded-lg`
   sprayed uniformly on everything.
9. **Copy is concrete and short.** Headlines under six words; body names
   real things (DMX, load-in, guest count) instead of vibes ("elevate your
   experience" is banned except as the one earned brand line). Controls say
   what happens: "Approve", "Send inquiry".
10. **Structure encodes truth.** Numbered markers only for real sequences;
    stat rows only for stats that matter; no data-slop tiles added to fill a
    grid. Empty space is solved with layout, not invented content.

## The slop list (instant rejections)

Reject on sight, including in generated drafts of your own:

- Purple-to-blue gradient heroes on white; aggressive gradient backgrounds
  anywhere they aren't the brand.
- Emoji as section markers or icons.
- Cards with a colored left-border accent stripe.
- Uniform `rounded-lg` + drop shadow on every element.
- Centered-everything layouts with three competing CTAs.
- Lorem ipsum, "Welcome to our website", interchangeable marketing filler.
- Fake device chrome: painted iOS status bars, fake keyboards.
- A palette invented from scratch when a governing system exists.

## When no brand governs

Client work with no design system yet: commit to one deliberate direction
before building — never split the difference into beige neutrality. Choose
toned neutrals (whites and blacks with a hue bias toward the accent, chroma
≤0.02 for whites), 0–2 accents defined in oklch sharing chroma and lightness,
and one memorable move (a type treatment, a layout break, a texture) with
everything else kept quiet. Present 2–4 genuinely different directions and
let the client pick; five shades of one idea is not a choice.

## Floors that never move

Body ≥16px screen, ≥12pt print. Hit targets ≥44px on touch. Focus states
visible. `prefers-reduced-motion` respected. Color-carried meaning always
duplicated in text. Check phone width before calling anything done.
