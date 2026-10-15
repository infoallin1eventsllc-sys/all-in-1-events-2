---
name: restraint
description: "The ladder to climb before writing code — load it whenever a request would add a file, a dependency, an abstraction, or a new pattern, so what ships is the smallest thing that actually works instead of the most complete thing imaginable. It holds: the five questions that kill unnecessary work (does this need to exist, does the platform already do it, does this repo already do it, can it be a smaller edit, can it wait); the specific over-builds this stack keeps producing — bundlers on no-build pages, config layers for one value, abstractions with a single caller, defensive branches for states that cannot occur, tests that test the framework; and how to record a deliberate shortcut instead of silently taking it. Use it before starting any build or refactor, before any 'let's add X', before introducing a dependency or a new file, and when a diff feels larger than the problem it solves. Skip it for investigation, reading, prose, and one-line fixes where there is nothing to over-build."
---

# Restraint

The strongest move in engineering is the same as in design: deletion. This
skill is the gate that runs *before* code gets written, not the cleanup after.

It exists because the default failure mode of an AI session is enthusiasm —
producing a framework where a function was asked for, and calling the extra
work thoroughness.

---

## The ladder

Climb every rung, in order. Stop at the first one that answers the request.
Say out loud which rung you stopped on.

**1. Does this need to exist at all?**
What breaks if nothing is built? If the honest answer is "a hypothetical
future user is mildly inconvenienced," the work is not justified yet. Name
the concrete thing that is broken today.

**2. Does the platform already do it?**
Before a library: CSS has grid, container queries, `:has()`, scroll-driven
animation, `<dialog>`, and `popover`. JS has `fetch`, `structuredClone`,
`Intl`, `URLSearchParams`, `AbortController`, and `crypto.randomUUID()`.
Postgres has views, generated columns, RLS, and full-text search. A
dependency is a thing that breaks in two years while the platform does not.

**3. Does this repo already do it?**
Grep before writing. A near-duplicate helper, a card recipe already in
`DESIGN-SYSTEM.md`, a pattern already in `design/21st-density/` — reuse beats
rewrite even when the existing version is 80% right. Extend the 80%.

**4. Can it be a smaller edit?**
Can a new file be a new function in an existing file? Can a new function be
three lines inline at the one call site? Can a new option be a hardcoded
value until a second caller exists? Prefer the edit that leaves the least
new surface behind.

**5. Can it wait?**
Ship the thing that is needed now, and write the deferral down (see the
ledger below). Work deferred on purpose and recorded is discipline. Work
deferred by accident and forgotten is debt.

---

## The over-builds this stack keeps producing

Each of these has actually happened here. Recognize them by shape.

| Shape | What it looks like | Instead |
|---|---|---|
| **Build step creep** | Adding Vite, a bundler, or a package step to a plain HTML page | This stack is deliberately no-build (`ENGINEERING.md` §3). Tailwind CDN and vanilla JS, pinned |
| **Config for one value** | A `config.js`, an options object, an env var read in one place | Hardcode it. Add the config layer when the second value appears |
| **Single-caller abstraction** | A helper, wrapper, or base class used exactly once | Inline it. Abstraction is earned by the third repetition, not the first |
| **Impossible-state defense** | `if (!x) return` for an `x` the only caller always provides | Let it throw. A fabricated fallback hides the real bug |
| **Framework testing** | Asserting that Tailwind applies a class, that `fetch` fetches | Test the logic you wrote, at its boundary |
| **Speculative parameters** | `function send(to, opts = {retry: 3, timeout: …, dryRun: false})` when one call site passes nothing | Two arguments. Add the third when something needs it |
| **Premature extraction** | Splitting a 120-line file into five modules "for organization" | One file is fine until it is genuinely hard to navigate |
| **Section padding** | Filler stats, decorative icons, a fourth feature card to balance a grid | `DESIGN-PRINCIPLES.md` §7 — if a section feels empty that is composition, not content shortage |

---

## What this is not

Restraint is not an excuse to under-deliver, and it never overrides the
definition of done in `ENGINEERING.md` §7.

- **Scope asked for is scope delivered.** Doing three of five requested
  things and calling it minimalism is failure, not restraint. The ladder
  prunes work *nobody asked for*, never work that was requested.
- **Security, accessibility, and error paths are not extras.** Input
  validation at the function boundary, `textContent` over `innerHTML`, focus
  states, reduced-motion, and a failure path for every external call are
  baseline. Cutting them is not "smaller," it is broken.
- **Honest placeholders stay.** A visible `[SLOT]` is smaller *and* more
  correct than an invented number.
- **"It already works" outranks "it is elegant."** Do not refactor working
  code that was not part of the request.

---

## The shortcut ledger

When rung 5 says "later," write it down in the same commit. One line, in the
file it affects or in `SESSION.md`:

```
DEFERRED: <what was not built> — <why it is safe to wait> — <what will force it>
```

Example:
```
DEFERRED: rate limiting on the inquiry function — no public traffic until
launch — required before the domain goes live (PRE-LAUNCH-CHECKLIST.md)
```

A deferral with no forcing condition is not a deferral. It is a hole.

---

## Reporting

When this skill changes what gets built, say so in one line rather than
silently building less:

> Built the inline version, not a helper module — one call site, rung 4.

That sentence is the whole point. It tells Otis a choice was made on purpose,
and gives him the handle to say "no, I want the module."
