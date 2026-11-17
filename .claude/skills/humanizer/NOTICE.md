# humanizer, vendored

`SKILL.md` is a verbatim copy of [blader/humanizer](https://github.com/blader/humanizer)
v4.0.0 (commit b48c832, 10 Nov 2026), MIT, copyright Siqi Chen. `LICENSE` is
the upstream file. Read in full before it came in: one instruction file, no
scripts, no network calls, and its own guard against text that tries to give
it orders. Added 17 Nov 2026 to close the one gap found in the "21 viral
Claude plugins" check (see `meridian-stack`).

## What it is for here

Client emails, lead follow-ups, proposals, posts and captions: anything a
person outside the studio will read. `taste` catches design slop; this
catches prose tells (not-X-but-Y, one-line closers, forced triads, dashes
everywhere, "delve", sales language). Run it on a draft before it goes to the
approval queue, or ask for it by name: "humanize this".

## House rules that override the upstream text

- **Never add a fact.** Upstream v4.0 says to add "a specific detail you know
  to be true" where text is generic. For client-facing copy that is a risk.
  Keep the fact set exactly as it is; a visible `[SLOT]` beats an invented
  detail (`taste` #7, `awesome-design` #8).
- **Otis's copy rules still win** (`taste` #9): concrete, short, controls say
  what happens. Where the two agree, which is nearly everywhere, nothing
  changes.
- Repo documentation, skills and code comments are not the target. They are
  written for the agent and the owner, and they use dashes and lists on
  purpose.

## Updating

Fetch the raw `SKILL.md` and `LICENSE` from the default branch, read the
diff, replace both files, update the version and commit here, then
`/sync-toolkit` and bump the plugin version. Do not edit `SKILL.md` in place;
put any house change in this file so the next update is a clean copy.
