# Drone Command — design system

Mode: **Operate**, with a client watching. State must be legible at a glance; restraint over impact.
Users: an operator flying, and a customer or venue client looking over their shoulder.
Voice: calm, precise, premium. Anti-references: the "hacker console" (neon on black, glass on glass, monospace uppercase everywhere, ten panels per screen).

## Layout (every vertical)

1. **App bar** — brand, three vertical tabs, theme toggle, Engineering. Nothing else.
2. **Headline** — title, one status chip, one line of context, four numbers, at most three actions.
3. **Stage** (left, ~⅔) — the hero: camera / map / 3D. Secondary view as a picture-in-picture with swap. Telemetry lives *on* the imagery (HUD), not in cards beside it.
4. **Action bar** — one card under the hero holding every command for the selected thing. One `primary`, one `danger`, the rest ghost.
5. **Inspector rail** (right, 336px, sticky) — one card, tabbed. Only one tab's content is visible.

Nothing else on the page. Logs go in an *Activity* tab; labs and deep tools go behind ghost buttons inside a tab.

## Tokens (`src/index.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | #f4f5f7 | #0c0f14 | page |
| `surface` / `surface-2` | #fff / #f7f8fa | #141820 / #1a1f29 | cards, segmented controls |
| `line` / `line-2` | #e5e8ee / #d3d8e1 | #262c38 / #333b49 | hairlines |
| `ink` / `ink-2` / `ink-3` | #111827 / #4b5563 / #8a94a6 | #eef1f6 / #aab3c2 / #6f7a8c | text: primary / secondary / muted |
| `accent` | per vertical | per vertical | active state, the one primary action, chart line |
| `ok` / `warn` / `bad` | 700-weight greens/ambers/reds | 400-weight | status only, always with a dot or label |
| `imagery` | #0b0f14 | same | behind video, maps, 3D — always dark |

Vertical accents: light show `#5b5bd6`, defense `#c2410c`, surveillance `#0f766e` (set via `data-accent` on the dashboard root; dark variants in the same file). Status colours are never reused for series or decoration.

## Type

Inter for all text. Numbers use `.num` (tabular). Mono is reserved for the HUD *on* imagery.
Headline 22/600 · section 13/600 · body 13 · label 11 muted · stat 18–28/600. Sentence case everywhere; no letter-spaced uppercase outside the HUD.

## Components (`src/dashboards/ui.tsx`)

`Headline` · `Card` · `Section` · `Divider` · `Tabs` · `Segmented` · `Stat` · `Row` · `Chip` · `Dot` · `Meter` · `Sparkline` · `ToolButton` (ghost / active / primary / danger) · `IconButton` · `Toggle` · `Activity`.

## Rules

- No glassmorphism, no blur, no decorative shadows, no cards inside cards.
- Imagery is dark in both themes; chrome follows the theme.
- One accent per screen. Status colours carry a dot or word, never colour alone.
- Every number has a unit or a label next to it.
- A control that acts on the selected thing lives in the action bar; a control that changes what you're looking at lives on the imagery.
- Phone width: rail stacks below the stage; PiP hides; HUD thins.

## Layering technical depth

A client and an engineer read the same system differently, so depth is layered
rather than split into two products:

1. **Plain sentence first.** "Two aircraft cannot occupy the same space."
2. **The real term underneath, muted.** "4D corridor deconfliction and ORCA
   avoidance at 50 Hz · layer 03" — an engineer still recognises it; a client
   can skip it.
3. **The full tooling one click further in**, clearly labelled for engineers,
   keeping its own dense chrome.

Never delete the depth to make something readable, and never lead with it.
See `src/dashboards/PlatformView.tsx`.

## Operator accessibility

An operator works at night, for hours, sometimes one-handed. Non-negotiable:

- Every action reachable by keyboard; single-key shortcuts for the destinations
  (`1` `2` `3`, `r`, `h`, `Esc`, `?`).
- A visible focus ring (`:focus-visible`, accent, 2px) — never `outline: none`.
- `prefers-reduced-motion` disables the pulses and transitions.
- Status is never colour alone: a dot, a word, or both.
- Anything meant to leave the building has a print stylesheet.
- A view that throws is isolated by an error boundary, never a white screen.
