---
name: client-site-scaffold
description: "Start a new client site the house way, in one pass — the no-build HTML + Tailwind-CDN page, tokens in the inline tailwind.config, a serverless proxy stub, .env.example, headers config, and the client-owned-keys handoff note. Invoke it (/client-site-scaffold <client-name>) when a client build begins; it assembles what meridian-engineering, meridian-auth and DESIGN-SYSTEM.md otherwise make you reassemble from three places."
disable-model-invocation: true
---

# Scaffold a client site

You are creating the starting skeleton for a new client site named
`$ARGUMENTS` (or ask for the name if empty). Build it in a **new directory**
named after the client, never inside this repo.

Read first, then build — these three are the source of the pattern:
`.claude/skills/meridian-engineering/SKILL.md`,
`.claude/skills/meridian-auth/SKILL.md`, `DESIGN-SYSTEM.md`.

## Files to create

```
<client>/
├── index.html            no-build: Tailwind CDN pinned, inline tailwind.config with tokens
├── css/styles.css        empty except a header comment — exists so nothing dangles
├── js/app.js             textContent-only rendering; no innerHTML
├── netlify/functions/chat.js   proxy stub: reads key from process.env, validates body, returns 501 until wired
├── netlify.toml          security headers copied from this repo's; functions.directory set
├── .env.example          ANTHROPIC_API_KEY= with placeholder; nothing real
├── .gitignore            .env, node_modules
├── CLAUDE.md             three lines: stack, the no-key rule, the client-keys rule
└── README.md             the handoff note below
```

## Rules the scaffold must embody

- **Tokens, not hexes**: put the client's palette in `tailwind.config` under
  `theme.extend.colors` with semantic names. If the palette isn't known yet,
  use `[CLIENT PRIMARY]`-style placeholders in comments, never invented colors.
- **No key in the browser**: `js/app.js` calls `/.netlify/functions/chat`,
  never a third-party API.
- **Client-owned keys**: the README's handoff section states that the client
  creates their own Anthropic/Stripe/etc. accounts and supplies the keys;
  Otis's keys are never deployed. Link the `client-handoff-api-keys` skill's
  reasoning in one sentence.
- **Pin every CDN**: no `@latest`.
- **Every referenced path exists**: run the `broken-reference-auditor` agent
  on the result before declaring done.

Finish by printing the tree and the one thing still needed from the client
(palette, copy, or keys) — as a question, not a guess.
