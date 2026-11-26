# Live Cards: security

Written 24 Nov 2026, updated 25 Nov. The service is switched off. Nothing here is applied to the database, deployed, or merged to the live site.
Rule for this product: the browser is never trusted. Every protection that matters is enforced on the server, where a client cannot reach it.

## What was tested, and how
| Test | Where | Result |
|---|---|---|
| Database rules under attack | Real database, inside a transaction that was thrown away (24 Nov): 55 checks, nothing left behind. Since then 18 checks were added (blocking, block list, paying accounts; on 25 Nov the headshot, link preview picture, address, hours, review and payment fields, and the 12 file limit) and all 75 run on a local stand-in database (two more on 26 Nov: the see-through logo slot, the card language and the info switch). | 75 pass locally; 55 of them also proven on the real database |
| Same-instant requests | Local database, many connections released at the same clock time. Before the locks: 22 cards on a 5-card plan, 24 files on an 8-file limit. After: exactly 1 card, 5 cards, 12 files (the limit since 25 Nov) and 5 reports. | 4 pass |
| The app under its browser policy | Real pages in a browser with the exact headers from `vercel.json`, against a stand-in service. | 36 pass |
| Link preview, headshot, buttons, activity, teams, Spanish | The real link page function run against hostile, broken and slow answers; then the same browser method for everything added on 25 and 26 Nov. | 132 pass |
| Plans, human check, own address | Same method. | 19 pass |
| Owner desk screen | Same method, desktop and phone. | 24 pass |
| Payment functions under attack | Both functions run for real against stand-ins for the database and Stripe. | 32 pass |
| Owner desk function under attack | Same method. | 28 pass |

The tests are kept so they can be re-run before launch:
`system/supabase/tests/` (the attack test, `local/run.sh`, `lc_billing_test.mjs`, `lc_admin_test.mjs`) and, in the website repo, `tools/live-cards-security-test.cjs`, `live-cards-plans-test.cjs` and `live-cards-owner-test.cjs`.

Mistakes found by these tests and fixed: a link check the database refused to run; no way to publish an edit after publishing; limits that two same-instant requests could slip past; a taken-down client could delete the card and publish a fresh one; a paying client could delete the account and keep being charged.

## Ways in, and what stops each one
| Way someone could attack | What stops it | Proven by |
|---|---|---|
| Collect every client's phone and email in bulk | Nobody can list cards. The public can only open one card at a time by its exact link name. | Database test |
| Edit, delete or read another client's card | Row rules: an account sees and changes only its own rows. | Database test |
| Give yourself the paid plan, unblock your card, or claim someone else's card | Plan, blocked and owner cannot be written by the app at all. Only the owner's tools and the signed payment webhook can. | Database test |
| Put a harmful link on a card (`javascript:`, `data:`) | The server rebuilds every card field by field. Only http and https links survive. The card page checks again before showing anything. | Database test, app test |
| Put code in a name or company field | Everything is shown as plain text, never as page code. The browser policy also blocks inline code, so even a mistake here would not run. | App test |
| Use a card to load pictures or video from an outside server (tracking, offensive swaps) | A card's picture or video must be a file that same account uploaded. The browser policy only allows pictures and video from this site and the Live Cards file store. | Database test, app test |
| Upload a web page, a script or an SVG | Uploads accept JPG pictures and MP4, MOV, WebM video only, with generated file names, in the account's own folder, 25 MB each, 12 files an account. Each file belongs to one slot (background, logo, headshot, link preview picture) and is refused in any other; only a background may be a video. Files cannot be renamed or replaced. | Database test |
| Fill the storage or the reports list | 12 files an account; old files are removed after each publish. Reports are limited to 5 an hour per card and 200 an hour in total, and cannot be read by the public. | Database test, app test |
| Use a card's link preview to run code, or to show a picture from somewhere else | The link page function writes every card value as escaped text. The picture must be that account's own link preview file in the file store; anything else is replaced by the standard picture. The page's security headers are the same as before. | Link preview test |
| Use the link page function to reach other servers, or to break card links | It contacts one address only (the service named in the site's own settings, which must be a supabase.co address), asks one fixed public question, and never uses an address from the link. Odd link names are answered without asking anything. It holds no secret and cannot write. If the service is off, slow or broken it gives up within two seconds and serves the plain card page. | Link preview test |
| Put a harmful link or code behind a pay or review button | Payment names may only be letters, numbers, dash and underscore, and are placed into fixed cash.app and venmo.com addresses. A Zelle entry must be an email or phone number and is only shown and copied as text. A review link must be http or https. Checked on the card and again by the server. | Database test, link preview test |
| Put code into the owner's Studio through the "Send me your info" form | The form accepts a name, one phone number or email, and a note. On the card and in the Studio's list everything is written as text; only a real phone number or email becomes a link. The database rules for storing it are still to be written and must clean and rate limit it the same way. | Link preview test (front end); database part not built |
| Get taken down, then delete the card or the account and start again | Taking a card down blocks the whole account: no saving, publishing, uploading or buying a plan. If that account deletes itself, its email goes on a block list. | Database test, payment test |
| Use the owner's moderation desk without being the owner | Every request needs the owner's portal session (passcode, plus the code when two-step is on). A client sign-in is refused. Every change is logged. | Owner desk test |
| Sign in on the wrong address so the sign-in can be stolen there | When the app has its own address, it refuses to run anywhere else and removes any sign-in kept there. | Plans test |
| Take a reserved or misleading link name (admin, support, meridian) | Reserved names are refused. A name in use cannot be taken. | Database test |
| Steal sign-in tokens with injected code | Strict policy on the app's pages only: scripts from this site only, no inline code, no eval, no outside connections except the service, cannot be framed. | App test |
| Fake a "payment succeeded" message | The webhook checks Stripe's signature on the exact bytes received, refuses anything older than five minutes, and records each message id once. | Payment test |
| Replay an old genuine message, or rely on messages arriving out of order | Duplicates are ignored. The plan is never copied from the message: the current state is read from Stripe directly. | Payment test |
| Change the price, the account or the return address in the browser | The browser sends one word. Price, account and return addresses are set on the server. | Payment test |
| Read card numbers from the app | Card numbers are typed on Stripe's own page. They never touch the app, the site or the database. | By design |
| Reach the payment function from another website | Only the Meridian site is allowed to call it from a browser, and the caller must be signed in. | Payment test |

## The "20 ways someone hacks your app" list (checked 24 Nov 2026)
Otis sent a short video listing 20 common attacks. The list is sound: every item is a real, documented kind of attack. Each one was checked against Live Cards and, where it applies, the live site.
| # | Attack | Status here | How it was checked |
|---|---|---|---|
| 1 | Next.js header bypass | Does not apply | The site and Live Cards do not use Next.js (checked the code and the built site). |
| 2 | Exposed .git folder | Closed | meridianinterface.com/.git/config and /.env both answer "not found". The build holds no hidden files. |
| 3 | Public storage buckets | Closed by design | The Live Cards store is public because card pictures are public; it accepts only pictures and video, in the owner's folder, with generated names. Existing public stores (site images, social cards, social videos) hold only things meant to be public. |
| 4 | Price sent from the browser | Closed | Payment test: the browser's price, account and return address are ignored. |
| 5 | Stolen-password logins | Does not apply to Live Cards | There are no passwords. Sign-in is a one-time code sent to the email. |
| 6 | Open database | Closed | The database's own security advisor reports no open tables. Every table has row rules on; no table can be read by a visitor. |
| 7 | Polyfill.io and similar outside scripts | Closed | No such script anywhere in the built site. Live Cards pages load scripts from this site only, enforced by the browser policy. |
| 8 | Text-message cost attack | Does not apply to Live Cards | No text messages are sent. The email version of this attack is open item 2 below (human check). |
| 9 | Prompt injection | Does not apply to Live Cards | The product has no AI in it. |
| 10 | Weak sign-in token secret | Closed | The service generates and holds the secret. Nothing here invents its own. |
| 11 | Two requests at the same instant | Closed in the rules, live test still owed | Found a real gap from this item: two saves sent together could slip past the one-card limit, the file limit or the report limit. Locks added to all three. A true same-instant test needs the service on. |
| 12 | Account set up in your name before you arrive | Closed | An account only exists after a code sent to that email is entered. Recheck if Apple or Google sign-in is ever added. |
| 13 | Abandoned subdomain taken over | Not a risk yet | Becomes relevant when the app gets its own address: never leave a DNS record pointing at a host that is no longer attached. |
| 14 | Making the server fetch an address the attacker chose | Closed | The payment functions only ever contact Stripe (payment test). The link page function only contacts the service named in the site's own settings, never an address taken from the link (link preview test). |
| 15 | Dot-dot file path tricks | Closed | Database test and app test. |
| 16 | Poisoned password-reset links | Does not apply | No passwords and no reset links. At launch, set the sign-in service's site address and allowed return addresses to the app's address only. |
| 17 | Source maps exposing the code | Closed | No source maps in the built site. The app's code holds no secrets either way. |
| 18 | Invisible framing to trick a tap | Closed | The live site and the app pages refuse to be framed (seen in the live headers; app test). |
| 19 | Open redirect | Closed | The app never sends a visitor to an address taken from the link. Payment return addresses are fixed; the payment page address must be Stripe's. |
| 20 | Finding out who has an account | Closed for sign-in | Asking for a code gives the same answer whether or not the email has an account. A card's link name being taken is visible, which is the nature of a public card. |

Items 5, 8, 9 and 14 also matter to the rest of the system (owner portal, marketing system, booking form). Those were built and hardened earlier and were only spot-checked in this pass, not re-audited.

## Not closed yet
Everything that could be closed without Otis and without cost is closed. What remains needs a decision, an approval, an account of his, the service switched on, or money. The full list is `WHATS-LEFT.md`; the steps are `launch/RUNBOOK.md`. The security-relevant ones:
1. **The app's own address** is built as a switch (`appOrigin`) but needs the address chosen and its DNS record.
2. **The human check** is built and tested but needs a free Cloudflare key and one agreed line in the browser policy.
3. **Sign-in email settings** and a real sender. The email template is written.
4. **The real-database re-run** of the 18 newer checks needs one approval.
5. **File type is declared by the browser.** A mislabelled file is served from the file store as a picture or video, not from the site. The owner desk can remove an account's files.
6. **Looking up cards is not rate limited.** A card only holds what its owner made public. Building this properly needs the service on.
7. **Never tested live:** real sign-in emails, real uploads, real phones, real Stripe.
8. **Owner accounts are the master keys** (database, payments, hosting, code, domain). Unique passwords and two-step sign-in on each.
9. **A dishonest owner can list their own payment name** on a card that pretends to be another business. The code cannot tell; this is what Report, take-down and the block list are for. The terms forbid it.
10. **The link page function has not run on Vercel with the service on.** It is tested here against stand-ins. On the first preview with the service on: open a card link, view the page source, and check the link in iMessage, WhatsApp and Facebook's Sharing Debugger.
11. **Terms and privacy are drafts**, and an outside security review before real money moves is worth considering. Both can cost.

## Launch order for the security parts
Own address, then database, then advisor check, then email and human check, then real-phone tests with the service on and payments off, then Stripe in test mode, then live keys.
