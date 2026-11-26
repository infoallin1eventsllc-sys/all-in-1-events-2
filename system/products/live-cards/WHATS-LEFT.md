# Live Cards: what is left

Written 25 Nov 2026; updated the same day after the headshot, extra buttons and link preview were added. Everything that needed neither Otis nor money is built and tested. The service is still off; nothing is applied, deployed or merged.
Step-by-step instructions for each item are in `launch/RUNBOOK.md`.

## Front end: all of this is finished before any back-end work (Otis, 26 Nov 2026)
Done: headshot, link preview, more buttons (directions, hours, review, pay), the "say it once" clarity pass.
Built and tested 26 Nov 2026:
1. [x] Move the photo inside its circle.
2. [x] Logos with a see-through background.
3. [x] Starting points by trade.
4. [x] Downloads: print QR code, lock-screen picture, email signature; tap card (NFC) set-up where the phone supports it.
5. [x] "Send me your info": the form on the card and the list in the Studio (goes live with the back end).
6. [x] Views and taps report screen (shows real numbers once the back end is on).
7. [x] Team cards screens.
8. [x] Spanish, covering every screen above, the card, the terms and the privacy page.
The front end is complete when Otis has looked at the review page and has no changes. Not yet seen on a real phone: writing a tap card, the lock-screen picture as a real lock screen, and the email signature pasted into a real email app.
Cannot have a front end yet: Apple and Google Wallet (needs Apple's paid developer account and a signing server before any button can work).

## A. Decisions only Otis can make (no cost)
1. The app's own address. Recommended: cards.meridianinterface.com. Free.
2. What the paid plan includes, and its price. Today the only built extra is hiding the "Made with Meridian Live Cards" line.
3. The refund rule for paid plans.
4. Whether clients must be 18 or over.
5. Read and approve the terms and privacy drafts, in English and in Spanish (the Spanish is a translation of the English drafts; a Spanish-speaking reader should check it). Both gained a sentence on 25 Nov: privacy now lists address, hours, payment names and the link preview picture; terms say payments made from a card's pay buttons are between the visitor and the card's owner. A lawyer's look is worth it before taking money (that part costs).
6. Whether a public card may be found by search engines. Today cards ask search engines not to list them.
7. Whether the motorcycle video may be used publicly (the bike looks like a known brand's).
8. When to launch at all.

## Back end the new front end is waiting for (nothing here is started)
1. Activity: `lc_hit`, `lc_send_info`, `lc_card_stats` and the `lc_leads` table, with rate limits. Shapes and rules are in the website repo, `docs/LIVE-CARDS.md`. Then set `activity:true`.
2. Teams: a higher file limit for the paid plan (today 12 files is exactly five cards with nothing to spare).
3. The database test is now 75 checks; 55 were proven on the real database, the other 20 only on the local copy.

## B. Approvals Claude needs from Otis (a tap each, no cost)
1. One more Supabase approval pop-up, to re-run the 75-check attack test on the real database (throw-away run).
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
6. Link preview on real apps: text a published card's link in iMessage and WhatsApp, and run it through Facebook's Sharing Debugger. The name and picture should show.
7. Save to contacts on a real iPhone and a real Android phone: the contact should arrive with the photo and the address.
8. The Cash App, Venmo and Zelle buttons with a real account of Otis's (opening the app is enough; no payment needed).

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
7. Moving the headshot inside its circle (today the middle of the photo is used, a little higher on a tall photo).
8. Logos with a see-through background. Uploads are saved as JPG, so a see-through logo gets a solid box behind it. Fixing it means allowing PNG files in the store.
9. "Share your info back" (a visitor leaves their name and number for the owner), ready-made starting points by trade, downloads (print QR, email signature), team cards, Apple and Google Wallet, Spanish. All were offered on 25 Nov; Otis chose the headshot, link preview and extra buttons first.
