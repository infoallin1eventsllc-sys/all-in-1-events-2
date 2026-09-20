# To do — next session

Updated 2026-09-19. Branch `claude/420-friendly-hoodie-page-yl8ho9`, PR #3,
**unmerged**. Working tree clean, everything pushed.

---

## The one thing blocking everything

**PR #3 has never been merged.** `main` has none of it — not the storefront,
not the launch videos, not the social plates, not the recovered product
photography, not the test suite. Everything below lives only on this branch.

---

## Two things that need Otis, not code

**The Raylight edit has to be exported by hand from the Raylight tab.** The
connector exposes no video export, only stills and filmstrips, and those
return to the agent rather than to disk. The project is now 62.1s (20 shots)
and on 19 Sep every image layer was reworked to float in and out instead of
hard-cutting — see `420-friendly/assets/LAUNCH-VIDEO.md` for the cut sheet
and the four Raylight traps that caused the "popping". Otis has not yet said
whether the new float reads right on his screen, and has not decided on the
~45s clean cut (drop the old middle five shots, move the old end card to the
end).

**Higgsfield appeared as a connector but is unusable.** Free plan, **2.5
credits**. It does image-to-video, which is the one tool here that could
animate the *real* garment photographs with real camera motion instead of
inventing clothes — so it fits the no-generated-imagery rule exactly. Otis was
asked whether Higgsfield is the "updated design features" he meant; **he has
not answered.** Ask before spending anything.

---

## Where the work stands

**Two launch videos, both from real product photography.** In
`420-friendly/assets/video/`:

- `420-cinematic-cut.mp4` — 25.8s, the current pass. Every shot gets a
  different committed camera move, plus parallax, motion blur, rack focus,
  gate weave, one grade spine and a 2.39:1 letterbox.
- `420-launch-preview.mp4` — 20.5s, the first cut. **Keep it.** Otis likes it.

Rebuild either from `420-friendly/tools/`. That README carries the three layout
traps that cost a full re-render each: only the centre of the oversize plate is
visible, a darkened ground under an undarkened tile reads as a rectangle, and
the emblem must be sized against the letterboxed band.

**Six social plates**, all real product, in `assets/social/`. Four earlier
versions using AI-generated models are parked in `assets/_archive-generated/` —
do not publish, and ask before deleting.

**18 real product shots** at `assets/products/picks/`: H5 H7 H8 H10 H11 H12 H13,
P4 P5 P10 P11 P12 P14, C1 C3 C4 C5 C6. Recovered out of the blocked Supabase
bucket via the vidIQ renderer trick in `420-friendly/tools/README.md`. Source of
truth — no need to repeat that.

**A test suite.** `npm test` — about 25s.
- `scripts/check-refs.mjs` — internal links, meta-refresh targets, product ids
  against the catalogue, external hosts against the CSP, and both compiled
  Tailwind builds.
- `scripts/smoke.mjs` — 24 pages in Chromium at 1280px and 390px.
- `.github/workflows/checks.yml` runs both on every PR, once PR #3 merges.

**What the suite does not cover**, written up in `scripts/README.md`: the 8
Netlify Functions including `create-checkout-session`, Stripe and PayPal past
page render, all of Meridian, and `owner-auth`. A green run means the storefront
is not visibly broken. It does not mean a checkout succeeds.

### Worth doing next

- **Function tests for `create-checkout-session` and `owner-auth`** — the two
  places where a failure costs money or exposes data. The largest remaining gap.
- **Prompt #3 deserves a redo.** It asks for folded apparel and was built from
  the snapback because nothing folded was reachable then. **P12** (crimson,
  folded) and **H13** (black, folded) are now committed.
- One pick code read as **"hp"** and was never matched. Eleven of twelve
  resolved. Ask Otis what it was.

---

## Answered

- **Emerald Triangle is part of the 420 Friendly brand** — a sub-line still in
  development. H1, H3, H4 and their pants carry it. Keep out of launch material
  until Otis says they are ready.
- **No AI-generated imagery.** Only Otis's own product photography.

## Still open — Otis's calls

1. **Which prices are real.** Storefront says $266 for hoodie + pant; the
   lookbook says $380 for the two separately *and* $380 as a set. The set costs
   exactly what the pieces cost apart, so it is not a bundle discount.
2. **Merge PR #3.**
3. ~~**Set `OWNER_PASSCODE`**~~ — done 20 Sep on the `allin1-events` site, all
   scopes, same value in every deploy context. If the portal ever reports it
   missing again, the cause is almost always one of the two settings named in
   the function's own error message, or a preview that was never rebuilt.
4. Six `policy.js` values; a Stripe account (check their cannabis policy
   first); the Anthropic key into **Supabase** Edge Function secrets — not
   Netlify, not his Mac.

## Still open — engineering

- `420-friendly/preview.html` is **stale** — still the old eight-product
  catalogue. Regenerate or delete. It is deliberately excluded from the smoke
  run, so the suite will not flag it.
- `vercel.json` points at a `vercel/api/` directory that does not exist, next to
  a live `netlify.toml`. Delete it or fill it in.
- No linter. The fake `lint` script was removed rather than replaced.
- Stock tracking; retail order storage; rate-limit the chat endpoint.
- Port `photos.html`; recover `owner` / `analyze` / `cardspike`.
- Clear 15 junk drafts.
- Split the repo per-business **after** the merge. Run `npm test` before and
  after — the split is a mass file move, which is exactly when relative paths,
  the two Tailwind config paths and the CSP host list break quietly.

## Notes

- vidIQ credits: **8**, renewing 2026-10-06. Image generation 22 each,
  `motion_graphics` about 2.
- Higgsfield: **2.5** credits, free plan.
- Never commit secret keys. Publishable keys (`pk_live_…`) and the PayPal client
  ID are public by design and fine in code. A scan on 15 Sep found no secrets
  committed and `.gitignore` correct.
