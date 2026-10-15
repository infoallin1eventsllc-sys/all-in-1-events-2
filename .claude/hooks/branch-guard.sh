#!/usr/bin/env bash
# PreToolUse guard: never commit directly to the default branch.
# ENGINEERING.md rule #1, enforced instead of remembered.
set -u
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+commit' || exit 0
branch=$(git symbolic-ref --short -q HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  jq -cn --arg b "$branch" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("Blocked: you are on " + $b + ". Branch first (git switch -c <name>) — ENGINEERING.md §1.")}}'
fi
exit 0
