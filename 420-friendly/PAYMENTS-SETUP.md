# Taking payments on 420 Friendly

The checkout UI is built and wired. It cannot take money until **you** create
payment accounts and add the keys. Nobody else's keys can be used for this —
the money has to land in your account, and the provider verifies your business
identity before it will let that happen.

## Which provider gives which method

The six methods you asked for need two providers. No single one covers them all.

| Method | Provider | Notes |
|---|---|---|
| Credit / debit card | Stripe | Visa, Mastercard, Amex, Discover |
| Apple Pay | Stripe | Not a separate integration — it's the card method shown through the device wallet. Appears automatically in Safari on Apple hardware over HTTPS |
| Google Pay | Stripe | Same: the card method through the wallet, on supporting browsers |
| Cash App Pay | Stripe | US only. Must be switched on in the Stripe dashboard |
| PayPal | PayPal | PayPal's own SDK |
| Venmo | PayPal | Venmo is PayPal-owned. US buyers, inside the PayPal checkout |

Availability varies by country and by account standing — confirm what your own
dashboards offer once the accounts exist.

## 1. Stripe — cards, Apple Pay, Google Pay, Cash App

1. Create an account at stripe.com and complete business verification.
2. Dashboard → **Settings → Payment methods**: enable Cash App Pay (and confirm
   Apple Pay and Google Pay are on — usually on by default).
3. Copy two keys from **Developers → API keys**:
   - **Publishable key** (`pk_live_…`) — safe in public code.
   - **Secret key** (`sk_live_…`) — must never be committed or put in any file
     under `420-friendly/`. Anyone holding it can issue refunds and read your
     customer list.
4. Put the publishable key in `420-friendly/assets/payments.js`:
   ```js
   stripePublishableKey: "pk_live_…",
   ```
5. Put the secret key in **Netlify → Site settings → Environment variables**:
   - `STRIPE_SECRET_KEY` = `sk_live_…`
   - `STRIPE_PAYMENT_METHODS` = `card,cashapp` (add methods as you enable them)
6. Install the Stripe package so the function can run:
   ```
   npm install stripe
   ```
7. Redeploy.

## 2. PayPal — PayPal and Venmo

1. Create a business account at paypal.com, then a REST app at
   developer.paypal.com → **Apps & Credentials**.
2. Copy the **Client ID** (public — safe in code).
3. In **Apps & Credentials**, enable Venmo for the app.
4. Put it in `420-friendly/assets/payments.js`:
   ```js
   paypalClientId: "…",
   ```

## Test before going live

Both providers have sandbox modes — use `pk_test_…` and a sandbox PayPal client
id first. Stripe's test card is `4242 4242 4242 4242` with any future expiry and
any CVC. Place a full order end to end before switching to live keys.

## Things that still need doing before real money moves

- **Prices are duplicated.** `netlify/functions/create-checkout-session.js`
  holds its own price list, deliberately: the browser is untrusted, and if the
  client sent prices a customer could edit them to $0. It means changing a price
  requires editing **both** that function and `assets/products.js`. Wire both to
  one source when there's a real backend.
- **Orders don't reach the owner portal.** The portal reads sample data. Real
  orders arrive via a Stripe webhook, which needs somewhere to store them.
- **Stock isn't tracked.** Nothing decrements on sale, so a limited drop can
  oversell.
- **Tax isn't handled.** Stripe Tax can do this; it must be enabled and
  configured for the states you have nexus in.
- **No order confirmation email** beyond the provider's own receipt.

## Security note on the owner pages

`owner.html` and `photos.html` carry `noindex` and aren't linked from the
customer navigation, but **they are not protected**. Anyone who knows or guesses
the URL can open them. That's acceptable while the data is samples; it is not
acceptable once real customer names, emails and order totals are behind them.

Before real data goes in, put real authentication in front of both — Netlify
Identity with role-based access, or move them behind a backend login. A
password typed into a static page is not protection: the check would run in the
browser, where anyone can read past it.
