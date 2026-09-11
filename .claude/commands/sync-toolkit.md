---
description: Sync .claude/skills into plugin/meridian-toolkit/skills, reporting what changed. Source of truth is .claude/skills.
allowed-tools: Bash(rm -rf plugin/meridian-toolkit/skills/*), Bash(cp *), Bash(git diff *), Bash(ls *), Read
---

Sync the cross-project skills from `.claude/skills/` (source of truth) into
`plugin/meridian-toolkit/skills/` so the installable plugin never drifts.

Rules:
- Only these skills are cross-project and belong in the plugin:
  `meridian-stack`, `meridian-engineering`, `meridian-auth`, `taste`,
  `awesome-design`, `img2threejs`, `client-site-scaffold`, `council`,
  `restraint`, `cinematic-web`.
- `meridian-marketing` and `meridian-deploy` are THIS repo's operations and
  stay out of the plugin on purpose. Do not copy them.
- Copy is one-way: repo → plugin. Never write back into `.claude/skills/`.

Steps:
1. For each skill in the list: `rm -rf plugin/meridian-toolkit/skills/<name> && cp -r .claude/skills/<name> plugin/meridian-toolkit/skills/<name>`
   (plain cp — rsync is not guaranteed on every machine this runs on).
2. Run `git diff --stat plugin/meridian-toolkit/` and report exactly which
   files changed, or `Plugin already in sync.` if nothing did.
3. If anything changed, remind me to bump `version` in
   `plugin/meridian-toolkit/.claude-plugin/plugin.json` before pushing —
   do not bump it yourself.

$ARGUMENTS
