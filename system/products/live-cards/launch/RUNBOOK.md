# Live Cards: launch steps

Nothing here has been done. Each step says who does it. "Claude" steps still need Otis's go-ahead at the time.
Do them in this order; each one makes the next one safe to test.

## 1. The app's own address
1. Otis: choose the address (example used below: `cards.meridianinterface.com`).
2. Otis or Claude with approval: add that address to the Vercel project and add the DNS record Vercel shows. Free on the current plan.
3. Claude: in `public/live/config.js` set `appOrigin` and `site` to that address. Add these to `vercel.json` (replace the host if different):
   ```json
   "redirects": [
     { "source": "/", "has": [{ "type": "host", "value": "cards.meridianinterface.com" }], "destination": "/live-cards/", "permanent": false },
     { "source": "/((?!studio/|c/|live-cards/|live/|fonts/|brand/|favicon).*)", "has": [{ "type": "host", "value": "cards.meridianinterface.com" }], "destination": "https://meridianinterface.com/$1", "permanent": false },
     { "source": "/:app(studio|c)/:path*", "has": [{ "type": "host", "value": "meridianinterface.com" }], "destination": "https://cards.meridianinterface.com/:app/:path*", "permanent": false }
   ]
   ```
   The first two keep the new address to the app only. The third moves the app off the main address. The app also enforces this itself (`appOrigin`).
4. Rule to keep forever: if the address is ever detached from Vercel, delete its DNS record the same day.

## 2. Database
1. Claude, with Otis approving the Supabase prompt: run the attack test once more on the real database in a rolled-back transaction (`system/supabase/tests/0047_live_cards_attack_test.sql`). The last real run covered 55 checks; 7 were added since and have only run locally.
2. Claude, with approval: apply `system/supabase/migrations/0047_live_cards.sql`.
3. Claude: run the Supabase security advisor and fix anything it flags.

## 3. Sign-in (Supabase dashboard, Otis; Claude can guide click by click)
1. Authentication > Sign In / Providers > Email: on. "Confirm email": on. Email OTP length 6, expiry 600 seconds.
2. Authentication > Emails: paste `launch/sign-in-email.html` into both "Magic Link" and "Confirm signup". Subject: `Your Live Cards sign-in code: {{ .Token }}`.
3. Authentication > URL Configuration: Site URL = the app's address. Redirect URLs = that address only.
4. Authentication > Emails > SMTP: connect a real email sender (the built-in one sends only a few emails an hour). The sending domain needs SPF and DKIM records.
5. Authentication > Rate Limits: leave the defaults on.
6. Human check: create a free Cloudflare Turnstile widget for the app's address. Put the secret key in Supabase (Authentication > Attack Protection > Captcha, provider Turnstile) and the site key in `config.js` as `humanCheck`. Then, with Otis's agreement, add to the Live Cards policy in `vercel.json`: `https://challenges.cloudflare.com` in `script-src`, and change `frame-src 'none'` to `frame-src https://challenges.cloudflare.com`. The app test shows the check is blocked without that line and works with it.

## 4. Switch on, payments still off
1. Claude: `config.js`: paste the project's publishable key into `key`, set `enabled:true`, leave `billing:false`.
2. Claude with approval: deploy `lc-admin` only (Supabase dashboard or CLI on Otis's machine; never from the cloud sandbox).
3. Run meridian-prelaunch-qa and the three Live Cards tests in `tools/`, then merge.
4. Real-phone test, two phones: sign up, add a photo and a video, publish, edit and update, open the link on the other phone, report the card, see the report in the portal's Live Cards tab, take the card down, put it back, delete the account.
5. Deleting stored files and two uploads at the same instant can only be tested here. Do both.

## 5. Payments
1. Otis: decide what the paid plan includes and its price. Today the only built extra is hiding the "Made with" line; the database allows five cards on the paid plan but the Studio manages one.
2. Otis: decide the refund rule and add it to the terms.
3. Otis in Stripe, TEST mode first: create the product and price; turn on the customer portal (cancel at period end, update card); add a webhook endpoint pointing at the `lc-billing-webhook` function for `checkout.session.completed` and all `customer.subscription.*` events.
4. Secrets (Supabase Edge Function secrets, never in the website): `LC_STRIPE_PRICE_ID`, `LC_STRIPE_WEBHOOK_SECRET`, `LC_SITE_ORIGIN` (the app's address). `STRIPE_SECRET_KEY` is already there for invoices; the rehearsal needs it to be a TEST key or a separate project.
5. Deploy `lc-billing` and `lc-billing-webhook`. Set `billing:true`.
6. Rehearsal with Stripe test cards: pay, see the plan turn on within a minute, hide the Made-with line, cancel from the portal, failed card, refund, delete account while paying (must be refused).
7. Only then: live keys, live price, live webhook secret.

## 6. Store apps (optional, later)
Needs a Mac with Xcode, an Apple developer account and a Google Play account (both paid). See `mobile/README.md` in the website repo. Apple and Google have their own rules for selling digital upgrades inside an app; the simplest route is to sell plans on the website only.
