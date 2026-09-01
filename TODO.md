# To do — next session

Updated 2026-09-01 (end of second session). Branch
`claude/420-friendly-hoodie-page-yl8ho9`, PR #3, unmerged, everything pushed.

Ordered by what actually unblocks the next thing, not by size.

---

## Start here tomorrow

**Otis has still not been able to see the site in a browser.** Three routes
were tried this session and all three stalled on his end. Before doing any
more building, get him looking at something. In order of least friction:

1. **The self-contained preview** — `420-friendly/preview.html`, also published
   as an Artifact he can open from the Claude app. One file, no server, no
   passcode, no network. Real catalogue, working bag, clickable.
2. **The deploy preview** — `deploy-preview-3--allin1-events.netlify.app/420-friendly/`
   Works today; only the Owner Portal is locked.
3. **Local `npm start`** — documented in `LOCAL-DEV.md`. Slowest path; two
   terminal traps already cost a session (see bottom of this file).

If he still cannot see it, the problem is not the code — stop and diagnose his
browser/network before writing anything.

---

## The one that blocks everything else

### 1. Merge PR #3

`main` has none of this. Not the storefront, not the Portal, not the policy
pages, not the preview. **If Netlify builds production from `main`, none of
the work is on the live site.**

It is Otis's call, which is why it has not been done.

---

## Only Otis can do these

### 2. `OWNER_PASSCODE` in Netlify

Site settings → Environment variables, on the **allin1-events** site.
**Scopes: All scopes** — a Production-only value is invisible to deploy
previews, which is exactly the failure he hit twice today.

Long passphrase, not a PIN: the function refuses anything under 8 characters,
and being stateless it cannot hold a lockout counter. Tell me once it is set
so I can push a commit and trigger the rebuild that picks it up.

Do not reuse `copper-lantern-drift-mailbox` — it was typed in chat and is
local-only.

### 3. Six policy values → `420-friendly/assets/policy.js`

Five pages show a **"THIS PAGE IS NOT FINISHED"** banner until these are set.

| Value | Why it matters |
|---|---|
| `contactEmail` | **Most urgent.** On five pages. A customer with a problem currently has no way to reach anyone. |
| `returnsAddress` | Nobody can send anything back. |
| `legalName` | Terms are unenforceable without naming who the contract is with. |
| `jurisdiction` | Which state's law governs. |
| `whoPaysReturn` | `"customer"` or `"us"` — changes the returns copy. |
| `SIZE_CHART.rows` | Measure one piece per run: chest pit-to-pit, length collar-to-hem, sleeve shoulder-to-cuff. **A guessed measurement causes a return, and that return is our fault.** |

### 4. Product photography

**7 of 8 products have no image**, and the 8th is hotlinked from a temporary
Google URL (`lh3.googleusercontent.com/aida/…`) that will expire and leave a
broken image on a live storefront.

Nobody buys a $120 hoodie from a typographic placeholder. Phone photos on a
plain background beat what is there now.

### 5. Stripe account

Business verification can take a day or two — worth starting early. Then
`STRIPE_SECRET_KEY` in Netlify and the publishable key in `assets/payments.js`.

**Check the cannabis policy first.** 420 Friendly is apparel, which should be
fine, but cannabis-themed branding gets payment accounts reviewed. Better a
straight answer before there are orders in the account than after.

### 6. Anthropic key → **Supabase**, not Netlify

Dashboard → Edge Functions → Secrets. Until it is set, every marketing draft is
placeholder text and the Brand Brain has no effect — the mock ignores the
prompt entirely. Set a **spend limit** the same day (see #12).

---

## Claude can do these

### 7. Split 420 Friendly into its own repo — agreed, not yet done

Mapped this session. The entanglement is small:

- 420 Friendly already **owns 6 of 8 functions**: `create-checkout-session`,
  `media`, `media-public`, `media-file`, `owner-auth`, `owner-orders`
- `lead` is the **only shared** function — copy it, it is one small file
- **One** cross-link: the portal points at `../marketing-system.html`
- `netlify.toml` and `package.json` — each repo gets its own

Deeper point: this repo holds **three businesses** — All in 1 Events at the
root, 420 Friendly in its folder, and Meridian's marketing platform in
`system/` (4.2 MB, the largest thing here). The repo is named after one,
hosts a second, and is mostly a third. That naming mismatch confused Otis
repeatedly today.

**Do this after PR #3 merges**, not before — moving 39 unmerged commits is
needlessly messy. `system/` → a Meridian repo later; lower urgency.

### 8. Stock tracking — highest build value of anything here

"Small runs, no restocks" breaks the moment two people buy the last hoodie and
one gets refunded. That damages the brand promise rather than merely being
missing, which is why it outranks the rest.

Needs somewhere to hold stock counts and a decrement on successful payment.

### 9. Retail order storage

The Portal reads **sample orders** — Marcus Webb, Dana Ruiz and the rest are
invented. Real orders need a retail Stripe webhook writing to an orders table.

**Note:** `pay-webhook` is excellent but **invoice-shaped** — it bills Meridian
web clients via `owner_invoices`. Retail is a separate path
(`netlify/functions/create-checkout-session.js`). The pattern is reusable, the
schema is not.

### 10. Recover three uncommitted functions

`owner`, `analyze`, `cardspike` are deployed with **no source in the repo**,
and `analyze` runs on a cron — live code nobody can read or fix. This is the
same condition that let a redeploy silently strip the run-auth gate earlier.

One `mcp__Supabase__get_edge_function` each, then commit.

### 11. Port `photos.html` to server storage

Product photos currently live in **one browser's IndexedDB** — they never reach
a server, a phone, or a customer. `media.html` already solves this shape of
problem with Netlify Blobs; storage and auth are done, images just need size
limits and a thumbnail path.

### 12. Rate-limit the chat endpoint

Public by necessity, so anyone who finds it can spend Otis's Anthropic budget.
Message and history caps exist; a rate limit does not. Pair with #6.

### 13. Clear 15 junk drafts + stop the duplication

All placeholder text, mostly the same post regenerated daily since Aug 24
because the mock is deterministic and only `follow_up_lead` has a dedupe key.
Offered, never confirmed — deletion is irreversible, so ask first.

---

## Known and accepted, not bugs

- **Playlist** is unconfigured by design — paste a Spotify/Apple/YouTube share
  link into `assets/playlist.js`. Snapchat is `manual` because no organic
  posting API exists.
- **Marketing drafts are mock** until the Anthropic key is set.
- **Join the list** stores locally until `MERIDIAN_INTAKE_URL` is set.
- **`preview.html` is a snapshot**, not a second storefront. If the catalogue,
  prices or shipping thresholds change, regenerate it or delete it — a stale
  preview showing wrong prices is worse than none.

## Three traps that have each cost a session

1. **Run `npm run build:420` from the repo root after any Tailwind class
   change.** An uncompiled class does nothing, silently.
2. **A terminal running `npm start` cannot accept commands.** Pasted text goes
   into the server and vanishes. `Cmd+T` for a second tab.
3. **Netlify env vars default to Production scope.** Deploy previews cannot see
   them. Always choose *All scopes*.
