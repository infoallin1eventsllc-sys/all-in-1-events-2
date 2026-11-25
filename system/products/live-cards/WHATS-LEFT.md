# Live Cards: what is left

Written 25 Nov 2026. Everything that needed neither Otis nor money is built and tested. The service is still off; nothing is applied, deployed or merged.
Step-by-step instructions for each item are in `launch/RUNBOOK.md`.

## A. Decisions only Otis can make (no cost)
1. The app's own address. Recommended: cards.meridianinterface.com. Free.
2. What the paid plan includes, and its price. Today the only built extra is hiding the "Made with Meridian Live Cards" line.
3. The refund rule for paid plans.
4. Whether clients must be 18 or over.
5. Read and approve the terms and privacy drafts. A lawyer's look is worth it before taking money (that part costs).
6. Whether a public card may be found by search engines. Today cards ask search engines not to list them.
7. Whether the motorcycle video may be used publicly (the bike looks like a known brand's).
8. When to launch at all.

## B. Approvals Claude needs from Otis (a tap each, no cost)
1. One more Supabase approval pop-up, to re-run the 62-check attack test on the real database (throw-away run).
2. Applying the database part for real.
3. Deploying the three functions (owner desk, checkout, payment webhook).
4. Adding the human-check line to the Live Cards browser policy.
5. Merging the branch to the live site.

## C. Things only Otis can set up (free)
1. DNS record for the app's address.
2. Supabase sign-in settings and the email template (ready to paste).
3. A real email sender with SPF and DKIM on the domain. Free tiers exist; check the sender's limits.
4. A free Cloudflare account for the human check.
5. Stripe: product, price, customer portal, webhook, in test mode first.
6. Strong unique passwords and two-step sign-in on the owner accounts: database, payments, hosting, code, domain.

## D. Tests that need the service switched on
1. Real phones: sign up, upload, publish, update, report, take down, restore, delete.
2. Real sign-in emails arriving, and not landing in spam.
3. Deleting stored files, and two uploads at the same instant, on the real file store.
4. Stripe rehearsal with test cards: pay, cancel, failed card, refund.
5. How smooth the Ocean background is on real phones.

## E. Things that cost money (Otis decides)
1. Apple developer account and Google Play account, if the store apps are wanted.
2. A lawyer's review of terms and privacy.
3. An outside security review before real money moves.
4. Higgsfield credits for the Cinematic backgrounds (quoted earlier; nothing spent).

## F. Not built, by choice (say the word and it gets built; no cost)
1. Managing more than one card in the Studio (the paid plan allows five).
2. Sign-in with Apple or Google.
3. Trimming a video inside the app.
4. Visit counts for a card.
5. Slowing down someone who guesses card links one by one. Needs the service on to build properly.
6. An email to Otis when a new report arrives (today the portal's Live Cards tab shows them).
