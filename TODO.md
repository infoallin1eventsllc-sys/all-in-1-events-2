# To do — next session

Updated 2026-09-13. Branch `claude/420-friendly-hoodie-page-yl8ho9`, PR #3,
**unmerged**. Working tree clean, everything pushed.

---

## The one thing blocking everything

**PR #3 has never been merged.** `main` has none of it — not the storefront,
not the soundtrack, not the launch video, not the social plates, not the
recovered product photography. Every asset below lives only on this branch.

---

## Where the creative work stands

**Launch video — built, not exported.** 29.1s in the Raylight project
"420 FRIENDLY — Haze Snapback Launch": two opening shots Otis already liked,
then five product beats from his picks, then the end card. Cut sheet in
`420-friendly/assets/LAUNCH-VIDEO.md`.

The Raylight MCP exposes **no video export** — only stills and filmstrips,
which return to the agent rather than to disk. **Otis has to hit render in his
Raylight tab.** A watchable 20.5s stand-in is committed at
`420-friendly/assets/video/420-launch-preview.mp4`, rebuildable with
`420-friendly/tools/build_launch_preview.py`.

**Social plates — six, all from real product.** In `assets/social/`. Four
earlier versions using AI-generated models are parked in
`assets/_archive-generated/` — Otis ruled out generated imagery. Do not
publish those, and ask before deleting the folder.

**Product photography — 18 shots recovered** to `assets/products/picks/`:
H5 H7 H8 H10 H11 H12 H13, P4 P5 P10 P11 P12 P14, C1 C3 C4 C5 C6. These came
out of the blocked Supabase bucket via the vidIQ renderer trick documented in
`420-friendly/tools/README.md`. They are the source of truth now — no need to
repeat that recovery.

### Worth doing with what is now on disk

- **Prompt #3 deserves a redo.** It asks for folded apparel; it was built from
  the snapback because nothing folded was reachable at the time. **P12**
  (crimson, folded) and **H13** (black, folded) are now committed.
- One pick code read as **"hp"** and was never matched. Eleven of twelve
  resolved. Ask Otis what it was.

---

## Answered

- **Emerald Triangle is part of the 420 Friendly brand** — a sub-line still in
  development (confirmed 2026-09-13). H1, H3, H4 and their pants carry it. Keep
  them out of launch material until Otis says they are ready.
- **Generated imagery is out.** Only Otis's own product photography.

## Still open — Otis's calls

1. **Which prices are real.** Storefront says $266 for hoodie + pant; the
   lookbook says $380 for the two separately *and* $380 as a set. The set costs
   exactly what the pieces cost apart, so it is not a bundle discount.
2. **Video length** if the Raylight cut gets reworked.
3. **Merge PR #3.**
4. **Set `OWNER_PASSCODE`** in Netlify, scopes: All scopes.
5. Six `policy.js` values; a Stripe account (check their cannabis policy
   first); the Anthropic key into **Supabase** Edge Function secrets — not
   Netlify, not his Mac.

## Still open — engineering

- `420-friendly/preview.html` is **stale** — it still renders the old
  eight-product catalogue. Regenerate or delete it.
- Delete the temporary PICK boards from the Raylight timeline if any remain
  (they were removed on 2026-09-13, but re-check before any render).
- Stock tracking; retail order storage; rate-limit the chat endpoint.
- Port `photos.html`; recover `owner` / `analyze` / `cardspike`.
- Clear 15 junk drafts.
- Split the repo per-business after the merge, not before.

## Notes

- vidIQ credits: **8 left**, renewing 2026-10-06. Image generation is 22 each;
  `motion_graphics` is ~2.
- Never commit secret keys. Publishable keys (`pk_live_…`) and the PayPal
  client ID are public by design and fine in code.
