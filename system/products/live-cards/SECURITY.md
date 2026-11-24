# Live Cards: security

Written 24 Nov 2026. The service is switched off. Nothing here is applied to the database, deployed, or merged to the live site.
Rule for this product: the browser is never trusted. Every protection that matters is enforced on the server, where a client cannot reach it.

## What was tested, and how
| Test | Where | Result |
|---|---|---|
| Database rules under attack (53 checks) | Run on the real database inside a transaction that was thrown away. Verified afterwards: no lc_ tables, functions, rules, storage folder or test accounts remain. | 53 pass |
| The app under its browser policy (36 checks) | Real pages in a browser with the exact headers from `vercel.json`, against a stand-in service that enforces the same rules. | 36 pass |
| Payment functions under attack (31 checks) | Both functions run for real against a stand-in database and a stand-in Stripe. | 31 pass |

The tests are kept so they can be re-run before launch:
`system/supabase/tests/0047_live_cards_attack_test.sql`, `system/supabase/tests/lc_billing_test.mjs`, and `tools/live-cards-security-test.cjs` in the website repo.

Two real mistakes were found by these tests and fixed: a link check the database refused to run, and a missing "Update my live card" button (after publishing there was no way to publish an edit).

## Ways in, and what stops each one
| Way someone could attack | What stops it | Proven by |
|---|---|---|
| Collect every client's phone and email in bulk | Nobody can list cards. The public can only open one card at a time by its exact link name. | Database test |
| Edit, delete or read another client's card | Row rules: an account sees and changes only its own rows. | Database test |
| Give yourself the paid plan, unblock your card, or claim someone else's card | Plan, blocked and owner cannot be written by the app at all. Only the owner's tools and the signed payment webhook can. | Database test |
| Put a harmful link on a card (`javascript:`, `data:`) | The server rebuilds every card field by field. Only http and https links survive. The card page checks again before showing anything. | Database test, app test |
| Put code in a name or company field | Everything is shown as plain text, never as page code. The browser policy also blocks inline code, so even a mistake here would not run. | App test |
| Use a card to load pictures or video from an outside server (tracking, offensive swaps) | A card's picture or video must be a file that same account uploaded. The browser policy only allows pictures and video from this site and the Live Cards file store. | Database test, app test |
| Upload a web page, a script or an SVG | Uploads accept JPG pictures and MP4, MOV, WebM video only, with generated file names, in the account's own folder, 25 MB each, 8 files an account. Files cannot be renamed or replaced. | Database test |
| Fill the storage or the reports list | 8 files an account; old files are removed after each publish. Reports are limited to 5 an hour per card and 200 an hour in total, and cannot be read by the public. | Database test, app test |
| Take a reserved or misleading link name (admin, support, meridian) | Reserved names are refused. A name in use cannot be taken. | Database test |
| Steal sign-in tokens with injected code | Strict policy on the app's pages only: scripts from this site only, no inline code, no eval, no outside connections except the service, cannot be framed. | App test |
| Fake a "payment succeeded" message | The webhook checks Stripe's signature on the exact bytes received, refuses anything older than five minutes, and records each message id once. | Payment test |
| Replay an old genuine message, or rely on messages arriving out of order | Duplicates are ignored. The plan is never copied from the message: the current state is read from Stripe directly. | Payment test |
| Change the price, the account or the return address in the browser | The browser sends one word. Price, account and return addresses are set on the server. | Payment test |
| Read card numbers from the app | Card numbers are typed on Stripe's own page. They never touch the app, the site or the database. | By design |
| Reach the payment function from another website | Only the Meridian site is allowed to call it from a browser, and the caller must be signed in. | Payment test |

## Not closed yet (each needs a decision or a setting at launch)
1. **Give the app its own address.** Today the app would live on meridianinterface.com beside the demo pages and the analytics script. Browsers treat one address as one trust zone, so a flaw in any page there could reach the app's sign-in tokens. A separate address such as cards.meridianinterface.com removes that. It costs nothing extra on the current plan. Recommended before launch.
2. **Human check on sign-up.** Without it a robot can ask the service to email sign-in codes to strangers. Cloudflare Turnstile is free; it needs an account, a key, and one added line in the browser policy for the Studio page only. The app already passes the check token through.
3. **Sign-in email settings.** Real email sender with SPF and DKIM, 6-digit code, ten-minute expiry, and the service's send limits left on.
4. **File type is declared by the browser.** A file could be mislabelled. It is served from the file store's address as a picture or video, not from the site, so it cannot act as a page on the site. Remove bad files from the dashboard when blocking a card.
5. **Moderation.** Reports land in `lc_reports`; blocking is `lc_cards.blocked = true`. There is no owner screen yet, and no routine for checking reports. A card can still carry a normal-looking link to a bad site, as any website can.
6. **Looking up cards is not rate limited.** Card names can be guessed one at a time. A card only holds what its owner chose to make public, so the exposure is small, but it is not zero.
7. **Run the service's own security advisor** right after the database part is applied, and fix anything it flags before switching on.
8. **Payments need a test-mode rehearsal** with Stripe test cards before live keys go in: pay, cancel, failed card, refund.
9. **Owner accounts are the master keys** (database, payments, hosting, code, domain). Unique passwords and two-step sign-in on each.
10. **Terms and privacy pages are drafts.** They should be reviewed before personal data and payments are taken.
11. **Store apps.** The wrapper is not built or tested, and Apple and Google have their own rules for selling digital upgrades inside an app.
12. **Never tested live:** real sign-in emails, real uploads, real phones, real Stripe. The stand-ins mirror the rules; they are not the real services.
13. **An outside review.** Before real money moves, an independent security review is worth considering. That is a cost, so it is Otis's call.

## Launch order for the security parts
Own address, then database, then advisor check, then email and human check, then real-phone tests with the service on and payments off, then Stripe in test mode, then live keys.
