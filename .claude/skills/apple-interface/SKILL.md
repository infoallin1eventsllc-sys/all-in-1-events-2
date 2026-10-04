---
name: apple-interface
description: "Apple's interface craft, distilled to the rules that survive on the web — load it when building or reviewing an app-like surface that should feel considered rather than assembled: a client portal, a booking flow, a dashboard, a form, a settings panel, any screen someone operates rather than reads. It holds: the four states every interactive thing needs beyond the happy path (loading, empty, error, disabled) and what each must do; the feedback and wait thresholds; how to pick a navigation model instead of defaulting to a modal; frosted-glass rules that keep text readable and the reduced-transparency fallback that is legally and practically required; spring-based motion and the transform-and-opacity-only rule; the 8-point grid and hit-target floor; and the iOS Safari trap that silently breaks haptic feedback. Use it before building any screen with state, before reaching for a modal, before adding blur or glass, and when an interface works but feels cheap. Skip it for marketing pages and hero craft, which is cinematic-web, and for pure visual or print design."
---

# Apple interface craft

Distilled from the `apple-design-skills` community skills (s1gmamale1), read in
full on 12 Sep 2026, filtered to what is checkable and what actually applies to
Otis's work. The native-platform and Apple-backend modules were dropped: he
builds web surfaces on Supabase, not iOS apps on CloudKit.

Its own framing is worth keeping: **clarity, deference, depth.** Deference is
the one people skip — the interface gets out of the way of the content.

---

## The four states

The commonest gap between a working interface and a considered one. Every
surface that fetches, submits, or can be empty needs all four designed, not
just the happy path.

| State | What it must do |
|---|---|
| **Loading** | A skeleton in the shape of the content, holding the final footprint. Never block input. Spinner **only** past ~1 second — below that it flashes and reads as a bug |
| **Empty** | Always carries a forward path. An empty list that just says "No items" is a dead end |
| **Error** | Says what failed and offers the recovery. "Something went wrong" is not an error state |
| **Disabled** | Explains *why*. A greyed button with no reason is a puzzle |

**Optimistic UI** for actions that almost always succeed: show the result
immediately, reconcile after. That single choice is most of what makes an
interface feel instant.

## Feedback and waits

- **Under 100 ms** to any visible response on press. Past that the surface
  feels broken regardless of how fast the work completes.
- **Every action gets feedback.** A press state is not optional.
- **The iOS Safari trap:** the Web Vibration API does not work in iOS Safari.
  Never build feedback that depends on haptics on the web — it will silently
  do nothing for every iPhone user.

## Pick a navigation model, don't default to a modal

A modal is the reflex and usually the wrong one.

| Pattern | When |
|---|---|
| **Push** (new page/view) | Drilling into a hierarchy |
| **Sheet** (slides over, dismissable) | A self-contained sub-task |
| **Tabs** | Peer sections at the same level |
| **Split view** | Master/detail, wide screens only |

Back must be obvious and predictable, and **state must survive the return
trip**. A filtered list that resets when you come back from a detail page is
the single most common portal bug.

## Glass, and how to not ruin text with it

Glass is a **layer, not a paint**: it samples and blurs what is behind, then
tints. On the web that is `backdrop-filter: blur() saturate()` plus a
translucent fill plus a light top-edge highlight.

- **Never stack glass on glass.** It compounds into mud.
- **Never put low-contrast text over a busy translucent surface.** The
  background moves; the text has to hold at every scroll position.
- **`prefers-reduced-transparency` needs an opaque fallback.** Not a nicety —
  people turn it on because translucency makes text unreadable for them.
- Reserve glass for **chrome** (nav, toolbars, sheets), not content.

**Squircles are not `border-radius`.** Apple's icon shape is a G2
continuous-curvature curve. A rounded rectangle is a visible tell. Use
`clip-path`/SVG, or CSS `corner-shape: squircle` where supported (Chrome 139+),
with a `border-radius` fallback.

## Motion

- **Springs over fixed easing.** Parameterise as response + damping rather than
  reaching for `ease`. On the web, generate a `linear()` curve from the spring.
- **Animate `transform` and `opacity` only.** Anything else hits layout and
  drops frames. `will-change` sparingly, never blanket.
- **Pointer-reactive motion is desktop-only** (tilt, spotlight, cursor
  parallax). Touch users must lose nothing by not having a pointer.
- `prefers-reduced-motion` gets a **fade or an instant state**, not a slower
  version of the same animation.

## Layout and colour floors

- **8-point grid**, with 4-point half-steps for tight gaps.
- **44 × 44 minimum hit target.** Already the floor in `DESIGN-SYSTEM.md`.
- **Semantic tokens, never a raw hex** that cannot adapt to light, dark, or
  high-contrast. This is the same rule as `ENGINEERING.md` §3 — a hardcoded hex
  duplicating a token is a bug.
- **Dark mode is dimming, not inverting.** Elevated surfaces get *lighter*, not
  flipped. The All in 1 Events surface ramp (`#0c0e12` → `#37393e`) already
  does this correctly; do not "invert" a light design to make a dark one.

## Scroll is an input, not a canvas

- **Never scroll-jack.** No `preventDefault` on wheel, no fake scroll, no
  forced vertical snap. This is absolute.
- Scroll-driven motion **helps** marketing and onboarding surfaces and **hurts**
  utility ones. On a dashboard, a form, or a long list, keep scroll plain and
  fast.
- Gate every scroll-driven transform under `prefers-reduced-motion`.

## What was left out, and why

Recorded so nobody re-reads the source looking for it:

- **`apple-design-os`** — iOS, iPadOS, macOS, visionOS, watchOS component
  anatomy. Its own doc says it is not web-applicable.
- **`apple-design-backend`** — CloudKit, APNs, StoreKit, Sign in with Apple.
  Otis is on Supabase; `meridian-auth` governs.
- **Accessibility and one-accent rules** — real, but already covered by
  `awesome-design`, `taste` and the accessibility floor in `DESIGN-SYSTEM.md`.
  Duplicating them here would just make three files to keep in sync.
- **The marketing and hero material** went into `cinematic-web` instead, which
  is where page craft lives.

**On provenance.** The source is one person's community repo (18 stars at time
of reading), not an Apple or Anthropic publication. It labels its own claims
`[observed]` / `[documented]` / `[inferred]` / `[speculative]`, which is more
honest than most. What is above is the subset that is either checkable against
Apple's published guidelines or independently true of the web platform. Treat
anything further from it as a hypothesis, not a spec.
