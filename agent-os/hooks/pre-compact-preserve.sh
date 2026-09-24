#!/usr/bin/env bash
# Claude Code PreCompact hook for core-fe.
#
# Before the conversation is compacted, emit a small, high-signal "resume card"
# so the essentials survive: current branch + uncommitted-change count, and a
# pointer to the agent-os skill-routing map + definition-of-done. Keeps a long
# unattended session from losing the thread across auto-compaction.
#
# Output: PreCompact additionalContext envelope (jq); plain stdout fallback.
# Fail-open: any error exits 0 and never blocks compaction.
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" 2>/dev/null || exit 0

branch="$(git branch --show-current 2>/dev/null || echo '?')"
changed_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

card="$(
  echo "RESUME CARD (preserve across compaction)"
  echo "- Branch: ${branch} · uncommitted files: ${changed_count}"
  echo "- agent-os: consult agent-os/skills/fe-skill-registry/SKILL.md + agent-os/docs/skill-triggers.md FIRST for any file you change."
  echo "- Definition of done: pnpm health green (tsc + lint + biome + format + validate:tokens + validate:structure + tests + docs)."
)"

if command -v jq >/dev/null 2>&1; then
  jq -cn --arg c "$card" '{hookSpecificOutput:{hookEventName:"PreCompact",additionalContext:$c}}'
else
  printf '%s\n' "$card"
fi
exit 0
