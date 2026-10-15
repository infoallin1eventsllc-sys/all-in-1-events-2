#!/usr/bin/env bash
# PreToolUse guard. Two jobs:
#  1. Refuse Edit/Write/Read on real .env files (the .example is fine).
#  2. Refuse `git commit` when the STAGED diff contains a key-shaped secret.
# Patterns deliberately require key-length bodies so doc mentions of "sk-ant-"
# and the legitimate `grant ... to service_role` in migrations never trip it.
set -u
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

case "$tool" in
  Edit|Write|Read|MultiEdit)
    f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    base=$(basename "$f")
    if [[ "$base" == .env || "$base" == .env.* ]] && [[ "$base" != *.example ]]; then
      deny "Blocked: $f is a real env file. Secrets live in platform env vars / Supabase secrets, never in files Claude edits. Edit .env.example instead."
    fi
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
    if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+commit'; then
      pat='sk-ant-[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|AC[0-9a-f]{32}|eyJ[A-Za-z0-9_-]{40,}\.eyJ|SUPABASE_SERVICE_ROLE_KEY=[^[:space:]"'"'"']{20,}'
      hit=$(git diff --cached -U0 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' | grep -oE "$pat" | head -1)
      if [[ -n "$hit" ]]; then
        deny "Blocked: staged diff contains a key-shaped secret (${hit:0:14}…). Unstage it, rotate the key, then commit. See meridian-auth."
      fi
    fi
    ;;
esac
exit 0
