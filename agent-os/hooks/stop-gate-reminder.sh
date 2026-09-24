#!/usr/bin/env bash
# Claude Code Stop hook for core-fe.
#
# At end of turn, look at the uncommitted working-tree changes and surface the
# SPECIFIC gate(s) those files imply — reusing the same file→skill map as
# [`skill-reminder.sh`](skill-reminder.sh) and
# [`agent-os/docs/skill-triggers.md`](../docs/skill-triggers.md). When nothing
# relevant changed (or the tree is clean), it falls back to the generic checks.
#
# Plain stdout, NON-blocking (never returns decision:block, so it cannot loop the
# turn). Fails OPEN: any error exits 0.
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" 2>/dev/null || exit 0

# Uncommitted (staged + unstaged + untracked) paths, status prefix stripped.
changed="$(git status --porcelain 2>/dev/null | sed 's/^...//')" || changed=""

REMINDERS=()
match() { printf '%s\n' "$changed" | grep -Eq "$1"; }

match '\.(tsx?)$' && \
  REMINDERS+=("source changed → pnpm tsc + pnpm lint (and a colocated *.test.tsx for new components/hooks)")
match '\.route\.tsx$|\.manifest\.ts$' && \
  REMINDERS+=("routes changed → pnpm validate:structure + sync routeTree & docs/reference/routes-and-ui.md (fe-route-island)")
match '\.css$|index\.css$' && \
  REMINDERS+=("styles changed → pnpm validate:tokens (semantic tokens only)")
match '\.test\.(tsx?)$|tests/e2e/' && \
  REMINDERS+=("tests changed → pnpm test (unit) / pnpm exec playwright test (e2e); coverage ratchet (fe-test-generation)")
match '\.env\.example$' && \
  REMINDERS+=("env changed → keep VITE_ vars documented; secrets stay out of source (fe-documentation-maintenance)")
match '\.md$|/docs/' && \
  REMINDERS+=("docs changed → pnpm docs:lint")

echo ""
if [[ "${#REMINDERS[@]}" -gt 0 ]]; then
  echo "📋 Before you finish — gates implied by your uncommitted changes:"
  for r in "${REMINDERS[@]}"; do
    echo "  • $r"
  done
  echo "  Then: pnpm health (all phases). Full map: agent-os/docs/skill-triggers.md"
else
  echo "📋 Done. Quick check: pnpm health (tsc + lint + biome + format + tokens + structure + tests + docs)."
  echo "   Skill map: agent-os/docs/skill-triggers.md"
fi
exit 0
