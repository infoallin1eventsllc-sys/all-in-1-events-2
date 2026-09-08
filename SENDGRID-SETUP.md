# Turning on email

**Status: not connected.** No email has ever left this system. A client books
and hears nothing. Everything below is built and tested — it is waiting on two
secrets that only Otis can set.

There is a checker for this. When you have done the steps, one call tells you
whether it worked, and if not, which of the three things is wrong. Skip to
**Check it** at the bottom.

---

## The part that catches people

An API key that works is not enough. SendGrid also has to be willing to send
**as your From address**, and that is a separate step nobody expects. Get the
key right and skip the sender, and every message is refused with a `403`. The
key tests fine. The code is correct. Nothing arrives.

That failure is why the checker exists.

---

## 1. SendGrid account

Sign up at **sendgrid.com**. The free tier is 100 emails a day, which is more
than a studio taking bookings will use.

Expect to be asked what you are sending and roughly how much. Answer honestly —
transactional email for a web design studio. Accounts sometimes get held for
review for a day or so.

## 2. Prove you own the From address

Two ways. **Pick the second one if you can.**

**Single Sender Verification** — quick, and fine to start.
Settings → Sender Authentication → Verify a Single Sender. Enter the address you
want mail to come from (`otis@meridianinterface.com`), fill in the form, then
click the link SendGrid emails to that address.
*Limitation: only that exact address can send, and mail from a free-mail address
lands in spam more often.*

**Domain Authentication** — better, and worth the extra twenty minutes.
Settings → Sender Authentication → Authenticate Your Domain. Enter
`meridianinterface.com`, and SendGrid gives you a handful of CNAME records to
add wherever the domain's DNS lives. Add them, click Verify.
*Why it is better: any address at the domain can send, and receiving mail servers
can see the mail is genuinely from you — which is most of the difference between
the inbox and the spam folder.*

## 3. Create the API key

Settings → API Keys → Create API Key.

- **Full Access** is simplest and is fine for a studio.
- If you prefer **Restricted Access**, you must tick **Mail Send**. A restricted
  key without it passes every check except sending, and only fails when a real
  client is waiting.

**Copy it immediately.** SendGrid shows it once. It starts with `SG.`

## 4. Put both secrets in Supabase

Supabase Dashboard → your project → Edge Functions → **Secrets**. Same page as
`ANTHROPIC_API_KEY`. Add two:

| Name | Value |
|---|---|
| `SENDGRID_API_KEY` | the `SG.…` string |
| `SENDGRID_FROM_EMAIL` | the address you verified in step 2 |

Optionally `SENDGRID_FROM_NAME` — what recipients see as the sender, e.g.
`Meridian Interface`.

**The Name column is the variable name, spelled exactly as above.** Not a
description, not your own label. This is the mistake that left four live
Anthropic keys sitting in that column as names; it costs an hour to find.

---

## Check it

Ask Claude to run the checker. It reports, without ever printing the key:

1. whether both secrets are set, and whether the key even looks like one;
2. whether SendGrid accepts the key, and whether it carries **Mail Send**;
3. whether your From address is a verified sender **or** at an authenticated
   domain — the step from the top of this page;
4. and, on request, it sends **one real email** to an address you name. That is
   the only test that proves the whole path.

Ask for the test send to your own inbox. Check the spam folder too — where it
lands the first time is worth knowing before a client finds out for you.

---

## What changes the moment it works

- **Booking acknowledgements go out immediately.** Someone who books at 11pm
  gets a reply straight away instead of silence until morning. Fixed template,
  no approval needed, and it promises nothing a human has to honour.
- **Follow-ups can be sent** from the Marketing tab, once you approve each one.
- **Invoices can reach clients.**

Marketing email stays blocked until a postal address is set — that is a separate
requirement and the reason is in `LAUNCH-READINESS.md` item 6. Booking
confirmations and invoices are transactional and are not affected.

---

## If something is wrong

The checker names the cause; these are the three it finds.

| What it says | What to do |
|---|---|
| `401` / key rejected | Wrong key, revoked, or from a different SendGrid account. Make a new one. |
| No **Mail Send** permission | Recreate the key with Full Access, or tick Mail Send. |
| From address not usable | Step 2. This is the `403` that looks like everything working. |

Failures are also recorded against each message in the Marketing tab, in plain
language rather than a bare status code.
