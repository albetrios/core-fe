#!/usr/bin/env bash
# Claude Code PostToolUseFailure hook (Bash) for core-fe.
#
# When a known core-fe gate fails, inject a concise hint with the fix command +
# owning skill — turning a raw non-zero exit into a fix path. Scoped to gates
# only: an ordinary failed command (a grep with no match, a test mid-TDD)
# produces no output, so this never nags.
#
# Adds context via hookSpecificOutput.additionalContext (PostToolUseFailure
# cannot block — the command already ran). Fails OPEN.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
[[ -z "$COMMAND" ]] && exit 0

lower=$(printf '%s' "$COMMAND" | tr '[:upper:]' '[:lower:]')
HINTS=()

case "$lower" in *validate:tokens*)
  HINTS+=("raw color token → use semantic tokens (bg-background/text-success/bg-brand), never raw palette; vendored components/ui/ is exempt (frontend-design)") ;;
esac
case "$lower" in *validate:structure*)
  HINTS+=("route-island structure → every page needs <page>.route.tsx + .manifest.ts + <Page>Page.tsx + OVERVIEW.md, and every component/hook a colocated *.test.ts(x) (fe-route-island / fe-test-generation)") ;;
esac
case "$lower" in *docs:lint*)
  HINTS+=("markdown lint → fix MD0xx (ordered-list prefixes, fenced-code language); emphasis style follows Prettier (fe-documentation-maintenance)") ;;
esac
case "$lower" in *tsdoc*)
  HINTS+=("TSDoc budget → add a summary to new exports; budget tooling/tsdoc-coverage/budget.json is a raise-only ratchet") ;;
esac
# tsc / typecheck
if printf '%s' "$lower" | grep -Eq 'pnpm tsc|tsc -b|tsc --noemit|type-check|typecheck'; then
  HINTS+=("type errors → pnpm tsc for the full list; never use any (use unknown + narrow)")
fi
# eslint / biome lint
if printf '%s' "$lower" | grep -Eq '\blint\b|biome[: ]check|eslint'; then
  HINTS+=("lint → pnpm lint:fix for autofixable; warnings via fe-lint-guard / fe-code-smells-best-practices")
fi
# prettier / format
if printf '%s' "$lower" | grep -Eq 'format|prettier'; then
  HINTS+=("formatting → pnpm format (Prettier + prettier-plugin-tailwindcss owns formatting)")
fi
# vitest / tests / coverage
if printf '%s' "$lower" | grep -Eq 'vitest|pnpm test|coverage'; then
  HINTS+=("tests → fix the failing spec; coverage is a raise-only ratchet (vitest.config.ts) — add tests, don't lower it (fe-test-generation)")
fi
# playwright e2e
if printf '%s' "$lower" | grep -Eq 'playwright| e2e'; then
  HINTS+=("e2e → check the trace; visual baselines update with --update-snapshots after an intentional UI change (fe-e2e-testids)")
fi
# full health gate
if printf '%s' "$lower" | grep -Eq 'pnpm health'; then
  HINTS+=("health = all phases — run the failing phase alone (tsc / lint / test / validate:*) for detail; pnpm health:fix auto-fixes (fe-project-health-check)")
fi

[[ "${#HINTS[@]}" -eq 0 ]] && exit 0

context="⚡ core-fe gate failed — likely fix:"
for hint in "${HINTS[@]}"; do
  context="${context}"$'\n'"  • ${hint}"
done
context="${context}"$'\n'"Skill map: agent-os/docs/skill-triggers.md"

jq -cn --arg c "$context" \
  '{hookSpecificOutput:{hookEventName:"PostToolUseFailure",additionalContext:$c}}'
exit 0
