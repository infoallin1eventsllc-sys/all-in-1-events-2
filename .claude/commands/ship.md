---
description: Run the ENGINEERING.md definition-of-done gate in order, then commit and push. Stops at the first failure.
allowed-tools: Bash(git *), Bash(bash *), Bash(grep *), Bash(test *), Read, Task
---

Run the shipping gate from `ENGINEERING.md` §7, in this order, and STOP at
the first failure — report it and do nothing further:

1. **Branch** — `git rev-parse --abbrev-ref HEAD` must not be `main`.
2. **Secrets** — stage everything intended, then scan the staged diff:
   `git diff --cached -U0 | grep -E '^\+' | grep -E 'sk-ant-[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{20,}|AC[0-9a-f]{32}|eyJ[A-Za-z0-9_-]{40,}\.eyJ'`
   must print nothing.
3. **Dangling references** — delegate to the `broken-reference-auditor` agent.
   Any finding in a file this diff touches is a stop.
4. **Session memory** — if `system/` changed, `system/SESSION.md` must be in
   the diff too (the meridian-marketing rule). If it isn't, stop and say so.
5. **Docs** — if behavior or setup changed, confirm the relevant doc
   (README, ENGINEERING.md, DESIGN-SYSTEM.md, a skill) is in the diff, or say
   explicitly that none needed updating.

If all five pass: write a commit message that records WHY (not what — the
diff shows what), commit, and `git push -u origin <branch>`. Then print the
short SHA and the branch.

Commit message subject/body: $ARGUMENTS
