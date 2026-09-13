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

## Locking the owner pages

Two ways in. Both are checked **on the server** — that is the whole point.

A passcode compared in the browser protects nothing: the page and its script
are served to anyone, so the comparison can be read and skipped. Here the
passcode is checked by `netlify/functions/owner-auth.js`, which returns a signed
token; `owner-orders.js` refuses to return any data without one. The pages
themselves are public shells containing no customer data.

### Option A — passcode (simplest, set this)

1. Netlify → **Site settings → Environment variables** → add `OWNER_PASSCODE`.
2. Use a **long passphrase**, not a PIN. Four or five random words is ideal.
3. Redeploy.

That's it. The portal will ask for the passcode and remember it for 12 hours,
per browser tab.

#### Make it work on deploy previews too

Netlify environment variables carry a **scope** — the deploy contexts they
apply to. A variable scoped to Production only is invisible to deploy
previews, so the preview reports the passcode as unset even though the
dashboard clearly shows it. That is the usual reason the portal cannot be
tested before merging.

When adding `OWNER_PASSCODE`, choose **"Same value for all deploy contexts"**.
If it already exists, open it and confirm Deploy previews and Branch deploys
are included, then trigger a redeploy — existing previews do not pick up an
env var change on their own.

The sign-in error names the context it is running in ("context
\"deploy-preview\", branch \"...\""), so if it is still refused you can see
immediately which deploy is missing the value.

Use the same passcode everywhere, or a different one per context — Netlify
supports both. What must **not** happen is a passcode committed to the repo as
a "preview default": the preview URL is public and guessable, so that would be
a backdoor into the portal with the secret published alongside it.

Two properties worth knowing:

- **Changing `OWNER_PASSCODE` instantly signs everyone out.** The signing key is
  derived from the passcode, so old tokens stop verifying. That is your
  revocation button if it ever gets shared.
- **Length is the protection.** Netlify functions are stateless, so there is
  nowhere to keep a lockout counter between attempts. A fixed delay is applied
  to every wrong guess, but a short passcode is still brute-forceable — the
  function refuses to run with one under 8 characters.

### Option B — Netlify Identity (per-person accounts)

Better when more than one person needs access, or you want to revoke one person
without changing everyone's passcode. It also gives you a named account in the
audit trail instead of a shared secret.

## Netlify Identity setup

The owner pages are now gated, but understand **where** the protection is.

Hiding a page in JavaScript protects nothing: the file is still served to anyone
who requests it, and disabling JS or reading source walks straight past the
check. So the pages themselves are public shells that contain no data. The order
data lives in `netlify/functions/owner-orders.js`, which Netlify runs only after
verifying an Identity token, and which then checks the account's role. Without a
valid token it returns 401 and there is nothing to leak.

That is why `assets/owner-data.js` no longer holds any orders — a public file
holding real customer names and emails would be a leak by construction.

1. Netlify dashboard → **Identity** → **Enable Identity**.
2. **Identity → Registration**: set to **Invite only**. Leaving it open lets
   anyone create an account.
3. **Identity → Invite users**: invite your own email. Accept the invite and set
   a password.
4. Give that account the role. **Identity → click the user → Edit roles** → add
   `owner` → save.
5. Sign out and back in on the site — roles are baked into the token when it is
   issued, so an existing session will not pick up a newly added role.

If you sign in without the role, the portal says so explicitly and names the
role it wants, rather than failing silently.

To use a different role name, set `OWNER_ROLE` in the Netlify environment.

### What is and is not protected

- **Orders, invoices, customer names and emails** — protected server-side. This
  is the part that matters.
- **The page layout and scripts** — public. They contain no customer data.
- **Photos** — stored in your own browser's IndexedDB. There is no server copy,
  so there is nothing for anyone else to reach. The sign-in on that page is for
  consistency, not protection. Once photos move to real object storage, that
  storage needs its own access rules.

### Two-factor

Netlify Identity does not do 2FA. If the portal will hold real customer records,
consider putting a provider that does (Auth0, Clerk, or similar) in front
instead — the function-level check stays the same shape, only the token issuer
changes.
