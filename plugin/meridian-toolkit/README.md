# meridian-toolkit

The six skills built for Otis's projects, packaged as an installable Claude Code
plugin so they load in **every** project instead of only in this repo.

| Skill | What it carries |
|---|---|
| `meridian-stack` | What's enabled on the account, what's confirmed absent, and the exact tokens of both shipped design systems |
| `meridian-engineering` | Branch/commit discipline, no-build frontend stance, secrets rules, definition of done |
| `meridian-auth` | Back-end-only authorization: the two shipped patterns, anon-vs-service-role, RLS default-deny |
| `taste` | Otis's aesthetic defaults and slop list |
| `awesome-design` | Twelve craft principles plus the squint/grayscale/phone/stranger shipping test |
| `img2threejs` | Image or floor plan to an interactive 3D scene |
| `client-site-scaffold` | `/client-site-scaffold <name>` — a new client site the house way, in one pass |
| `council` | `/council <question>` — five seats argue independently, blind peer review, chairman synthesis |
| `restraint` | Five rungs before writing code, the over-builds this stack repeats, and the shortcut ledger |
| `cinematic-web` | What makes a landing page look expensive: hero media ranked, weight budget, the cheap techniques |

## Install

From a terminal on your own machine, once this branch is on GitHub:

```bash
claude plugin marketplace add infoallin1eventsllc-sys/all-in-1-events-2
claude plugin install meridian-toolkit@meridian
```

Or point at a local clone while iterating:

```bash
claude plugin marketplace add /path/to/all-in-1-events-2
claude plugin install meridian-toolkit@meridian
```

Verify with `claude plugin list`. Update after pushing changes with
`claude plugin marketplace update meridian && claude plugin update meridian-toolkit`.

## Why a plugin rather than saved skills

Saving each skill to the account works, but a plugin is **versioned and
reviewable**: the skills live in git, changes arrive through commits, and the
same install command gives any machine — or anyone you work with — the identical
set. Personal settings stay out of it.

## Editing

`plugin/meridian-toolkit/skills/` is the source of truth for the plugin.
`.claude/skills/` in this repo is the source of truth; `/sync-toolkit` copies
the cross-project ones here. When a skill changes, run `/sync-toolkit`, then bump `version` in
`.claude-plugin/plugin.json` and push.

Validate before pushing:

```bash
claude plugin validate plugin/meridian-toolkit
claude plugin validate .claude-plugin/marketplace.json
```
