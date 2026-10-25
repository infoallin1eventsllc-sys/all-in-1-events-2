---
name: dashboard-design
description: "How Otis's dashboards are built, on every project — load it whenever a dashboard, admin panel, analytics or reporting view, KPI screen, ops console or portal overview is being built, redesigned or reviewed. It holds: the default 'command center' look (near-black navy, off-white labels, one cyan accent, glow only on active state) with contrast-checked tokens, and how to carry it onto a brand that already has tokens; the anatomy every dashboard ships with; the behaviour that separates a working dashboard from a mockup (one filter state moving every number, CSV of exactly what is filtered, four states per panel, no dead controls, sample data labelled); the motion and optional-3D limits; the phone layout; and the done-check. Charts inside it go through the dataviz skill. Skip it for marketing pages and heroes (cinematic-web) and for a lone chart with no screen around it (dataviz alone)."
---

# Dashboard design

Start here for any dashboard, then load `taste` and `awesome-design` (they
win where this disagrees), `apple-interface` for states and navigation,
`dataviz` for every chart, and `meridian-stack` when the project is All in 1
Events or Meridian. Run `restraint` before adding a library.

## The look

**A brand with tokens governs.** All in 1 Events, Meridian, or a client with a
system: use its surfaces, type and lead accent (`meridian-stack/references/design-tokens.md`
for Otis's two). Never paint the navy-and-cyan below over a brand. A light
brand stays light. What carries across is the discipline: the quietest surface
is the workspace, one accent, glow only on the active thing, hairline grid.

**No brand: the command-center direction is the default.** A dark navy
workspace, off-white labels and one cyan accent that marks what is active.
Starting tokens, each checked for WCAG AA against all three surfaces:

```css
:root {
  --bg: #0A0F1C;        /* workspace */
  --panel: #111827;     /* cards, opaque */
  --raised: #182134;    /* hover, drawer, menus */
  --line: rgba(255,255,255,.07);  /* hairlines and grid */
  --text: #E6EAF2;      /* 13.3:1 or better */
  --text-soft: #A3ADBF; /* 7.1:1 or better */
  --text-faint: #8590A4;/* 5.0:1 or better: mono labels, axis ticks */
  --accent: #22D3EE;    /* the one accent: active, selected, focus */
  --ok: #34D399; --warn: #FBBF24; --bad: #F87171; /* signage, not accents */
}
```

- **Panels are opaque.** Translucency is for chrome only (sidebar, top bar,
  drawer), never behind a chart or a number, with an opaque fallback under
  `prefers-reduced-transparency`.
- **Glow is a state, not a mood.** Only the active nav item, the selected
  filter, the hovered data point and focus get it. No ambient glow, no
  gradient wash behind charts.
- **Type:** numbers in the display face with `font-variant-numeric:
  tabular-nums`, always with their unit. Labels, timestamps and counts in
  `ui-monospace`, small caps-spaced (taste #2). No Inter or Space Grotesk by
  reflex.
- **Geometry:** cards 8–12px radius, chips and filters as pills, 8-point
  spacing at dense settings. Hover lifts 2–3px; selection is border plus ring.
- **A 3D element is optional and decorative.** An orbital or globe scene can
  be the one memorable move, but no number may live only inside it. Lazy-load
  it, cap the pixel ratio, pause it when the tab is hidden, show a static image
  instead under reduced motion, and keep the dashboard fully usable with WebGL
  off. Default is no 3D until someone asks for it.

## Anatomy

A checklist, not a mandate: drop any part the data cannot fill.

| Part | Rule |
|---|---|
| Sidebar | Collapsible to icons on desktop; a labelled drawer on phones |
| Top bar | Date range, search with a ⌘K hint, notifications, settings |
| KPI row | 3–5 numbers that drive a decision. Label, value with unit, change against a named period ("vs previous 30 days") with an arrow and sign, not colour alone. No filler tiles |
| Trend | One time series for the headline metric; chart choice per `dataviz` |
| Breakdown | Share by category or channel |
| Table | Searchable, sortable, paginated or virtualised; the place every chart's numbers can be checked |
| Detail drawer | A row opens a side sheet, not a modal. Closing it returns to the same filters, sort and scroll position |

## Behaviour: what makes it work, not a mockup

1. **One filter state drives everything.** Date range, category and search
   update every KPI, chart, total and the table together. A KPI total equals
   the sum of the table rows under the same filter. Keep the filter state in
   the URL so reload, back and a shared link all land on the same view.
2. **Export what is on screen.** CSV contains exactly the filtered rows, with
   headers, in the visible column order, raw values (no thousands separators),
   ISO dates, and the date range in the filename.
3. **Four states on every panel** (`apple-interface`): a skeleton at the final
   footprint, an empty state with a way forward, an error naming what failed
   with a retry, a disabled control saying why.
4. **No dead controls.** The bell opens a real panel; settings change
   something visible. A control that cannot work yet is removed, not faked.
5. **Honest data.** Demo data carries a visible "Sample data" label, is seeded
   so it is identical on every load, and lives in one file so real data is a
   one-file swap. Never imply a live feed, real-time, a security guarantee or
   an AI forecast that does not exist. "Updated" shows the data's own
   timestamp, not the clock.
6. **Numbers read the same everywhere.** One precision per metric, compact
   form (12.4K) on cards with the exact value in the tooltip and table.
7. **Data comes from the back end.** No API key in the browser; reads go
   through an edge function or RLS-scoped queries (`meridian-auth`).

## Motion

Panels enter once, short and lightly staggered. Charts take about 250ms to
move to new values on a filter change. A KPI may count up once on first load,
with the final value in the DOM from the start for screen readers. Transform
and opacity only, house easing `cubic-bezier(.2,.7,.2,1)`. Under reduced
motion everything is instant. No scroll-driven motion on a dashboard.

## Phone, from 360px

Navigation moves into a drawer opened by a button that says "Menu". KPIs go
two-up, charts full width. Wide tables scroll inside their own region with
the first column sticky; the page itself never scrolls sideways. Touch
targets 44px.

## Accessibility

AA contrast for every label on every surface it sits on (the tokens above
pass). Each chart gets a one-sentence text summary and its numbers in a table.
Sortable headers are buttons with `aria-sort`. Focus is visible, the drawer
holds focus while open and returns it on close. Colour never carries meaning
alone.

## Weight and build

Follow the project's build stance; on the house no-build stack that means plain
HTML and JS with every CDN library pinned to a version. Under 2 MB on first
load before any optional 3D. Simple bars and lines can be hand-drawn SVG
rather than a chart library.

## Done check

Run the page and confirm every line before calling it finished:

- [ ] Change the date range: every KPI, chart, total and table count moves together, and KPI totals match the table.
- [ ] Reload and press back with filters set: the same view returns.
- [ ] Export under a filter: rows and headers match the screen.
- [ ] Force loading, empty and error on each panel.
- [ ] Click every control: none is decorative.
- [ ] 360px wide: no sideways page scroll, drawer works, table scrolls in place.
- [ ] Keyboard only: reach and sort the table, open and close the drawer.
- [ ] Reduced motion on: nothing animates. WebGL off (if there is 3D): nothing is lost.
- [ ] Console clean; "Sample data" visible if the data is not real.
- [ ] Squint, grayscale, phone, stranger (`awesome-design`).

## Where this came from

Started from the "Futuristic Dashboard" prompt in @liam.vibecodes' *10
Cinematic Website Prompts* (TikTok, PDF on tiiny.host), read 25 Oct 2026, and
rewritten into Otis's rules. Kept: the art direction, the anatomy, the
behaviour and the accessibility floor. Dropped: pasting into ChatGPT and
publishing to tiiny.host. Changed: translucent panels became chrome-only
(`apple-interface`), and the palette was contrast-checked, which lifted the
faint label grey to `#8590A4`.
