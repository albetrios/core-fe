#!/usr/bin/env bash
# Claude Code PostToolUse hook (Edit | Write) for core-fe.
# Reads the edited file path from the tool JSON and prints relevant skill
# reminders based on file-pattern matching. Plain stdout, never blocks.

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" \
  2>/dev/null || echo "")

[[ -z "$FILE" ]] && exit 0

REMINDERS=()

[[ "$FILE" == *".route.tsx" || "$FILE" == *".manifest.ts" ]] && \
  REMINDERS+=("route island → fe-route-island (path, RBAC permission, head; register in routeTree + docs/reference/routes-and-ui.md)")

[[ "$FILE" == *".contracts.ts" ]] && \
  REMINDERS+=("contracts → Zod schema + inferred type; never hand-write the TS type (fe-api-data-patterns)")

[[ "$FILE" == *".api.ts" || "$FILE" == */hooks/use*/*.ts? ]] && \
  REMINDERS+=("data layer → react-best-practices (TanStack Query owns server state; mock + live branch)")

case "$FILE" in
  */components/ui/*) REMINDERS+=("vendored shadcn primitive → shadcn (add/compose via CLI; don't hand-edit)") ;;
  */components/*.tsx | */forms/*.tsx) REMINDERS+=("component/form → composition-patterns + frontend-design + fe-test-generation (colocate a *.test.tsx)") ;;
esac

[[ "$FILE" == *"index.css" || "$FILE" == *.css ]] && \
  REMINDERS+=("styles → semantic tokens only (bg-background/text-success/bg-brand); pnpm validate:tokens (frontend-design)")

[[ "$FILE" == *".test.tsx" || "$FILE" == *".test.ts" ]] && \
  REMINDERS+=("tests → fe-test-generation; E2E flows → fe-e2e-testids (tests/e2e/*.e2e.test.ts)")

[[ "$FILE" == *".env.example" ]] && \
  REMINDERS+=("env → fe-documentation-maintenance (VITE_ = public/bundled; secrets via environment, never committed)")

if [[ "${#REMINDERS[@]}" -gt 0 ]]; then
  echo ""
  echo "⚡ Skill reminders for $(basename "$FILE"):"
  for r in "${REMINDERS[@]}"; do
    echo "  • $r"
  done
  echo "  Full map: agent-os/docs/skill-triggers.md"
fi

exit 0
