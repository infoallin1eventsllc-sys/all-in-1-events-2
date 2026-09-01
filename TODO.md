# To do — next session

Written 2026-09-01. Branch `claude/420-friendly-hoodie-page-yl8ho9`, PR #3,
37 commits ahead of `main`, everything pushed.

Ordered by what actually unblocks the next thing, not by size.

---

## The one that blocks everything else

### 1. Merge PR #3

`main` has none of this. Not the storefront, not the Portal, not the policy
pages. **If Netlify builds production from `main`, none of the work is on the
live site.**

Every other item below is either invisible or untestable until this happens.
It is Otis's call, which is why it has not been done.

---

## Only Otis can do these

They need his accounts, his decisions, or his files. Nothing here is a coding
task.

### 2. Six policy values → `420-friendly/assets/policy.js`

Five pages currently show a **"THIS PAGE IS NOT FINISHED"** banner. It clears
as these are filled in.

| Value | Why it matters |
|---|---|
| `contactEmail` | **Most urgent.** Referenced on five pages. A customer with a problem currently has no way to reach anyone. |
| `returnsAddress` | Nobody can send anything back. |
| `legalName` | Terms are unenforceable without naming who the contract is with. |
| `jurisdiction` | Which state's law governs. |
| `whoPaysReturn` | `"customer"` or `"us"` — changes the returns copy. |
| `SIZE_CHART.rows` | Measure one piece per run: chest pit-to-pit, length collar-to-hem, sleeve shoulder-to-cuff. **A guessed measurement causes a return, and that return is our fault.** |

### 3. Product photography

**7 of 8 products have no image**, and the 8th is hotlinked from a temporary
Google URL (`lh3.googleusercontent.com/aida/…`) that will expire and leave a
broken image on a live storefront.

Nobody buys a $120 hoodie from a typographic placeholder. Phone photos on a
plain background beat what is there now. Send them and they get committed
properly so nothing can expire.

### 4. `OWNER_PASSCODE` in Netlify

Site settings → Environment variables. **Scope it to all deploy contexts**, or
deploy previews cannot be tested. Long passphrase, not a PIN — the function
refuses anything under 8 characters, and being stateless it cannot hold a
lockout counter.

### 5. Stripe account

Needs business verification, which can take a day or two — worth starting
before it is needed. Then `STRIPE_SECRET_KEY` in Netlify and the publishable
key in `assets/payments.js`.

**Check the cannabis policy first.** 420 Friendly is apparel, which should be
fine, but cannabis-themed branding gets payment accounts reviewed. Better a
straight answer before there are orders in the account than after.

### 6. Anthropic key → **Supabase**, not Netlify

For the marketing system. Dashboard → Edge Functions → Secrets. Until it is
set, every draft is placeholder text and the Brand Brain has no effect —
the mock ignores the prompt entirely.

Set a **spend limit** in the Anthropic console the same day. The chat endpoint
is public by necessity, and has no rate limit yet (see #10).

---

## Claude can do these

### 7. Stock tracking — highest value of anything here

"Small runs, no restocks" breaks the moment two people buy the last hoodie and
one gets refunded. This damages the brand promise rather than merely being
missing, which is why it outranks the rest.

Needs somewhere to hold stock counts and a decrement on successful payment.

### 8. Retail order storage

The Portal reads **sample orders** — Marcus Webb, Dana Ruiz and the rest are
invented. Real orders need a retail Stripe webhook writing to an orders table.

**Note:** `pay-webhook` is excellent but **invoice-shaped** — it bills Meridian
web clients via `owner_invoices`. Retail is a separate path
(`netlify/functions/create-checkout-session.js`). Do not confuse them; the
pattern is reusable, the schema is not.

### 9. Recover three more uncommitted functions

`owner`, `analyze`, `cardspike` are deployed with **no source in the repo**,
and `analyze` is on a cron schedule — actively running code nobody can read or
fix. Same condition that let a redeploy silently strip the run-auth gate.

One `mcp__Supabase__get_edge_function` each, then commit.

### 10. Rate-limit the chat endpoint

Public by necessity, so anyone who finds it can spend Otis's Anthropic budget.
Message/history caps exist; a rate limit does not. Pair with the spend limit
in #6.

### 11. Clear 15 junk drafts + stop the duplication

All placeholder text, mostly the same post generated daily since Aug 24
because the mock is deterministic and only `follow_up_lead` has a dedupe key.
Was offered, never confirmed — deletion is irreversible.

### 12. Port `photos.html` to server storage

Product photos currently live in **one browser's IndexedDB** — they never reach
a server, a phone, or a customer. `media.html` already solves this shape of
problem with Netlify Blobs; the storage and auth work is done, images just need
size limits and a thumbnail path.

---

## Known and accepted, not bugs

- **Playlist** is unconfigured by design — paste a Spotify/Apple/YouTube share
  link into `assets/playlist.js`. Snapchat is marked `manual` because no
  organic posting API exists.
- **Marketing drafts are mock** until the Anthropic key is set.
- **Join the list** stores locally until `MERIDIAN_INTAKE_URL` is set.

## Two traps that have each cost a session

1. **Run `npm run build:420` from the repo root after any Tailwind class
   change.** An uncompiled class does nothing, silently.
2. **A terminal running `npm start` cannot accept commands.** Pasted text goes
   into the server and vanishes. `Cmd+T` for a second tab.
