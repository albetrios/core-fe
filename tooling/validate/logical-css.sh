#!/usr/bin/env sh
# Logical CSS direction contract.
#
# App code must use logical properties (ms/me/ps/pe/start/end/text-start/…) so
# RTL (Arabic, forced RTL) mirrors correctly. Physical ml/mr/pl/pr/left/right
# utilities outside vendored ui/ are a regression.
#
# Exempt: vendored shadcn (src/shared/components/ui), tests, fixtures.
# Centering idioms left-1/2 + right-1/2 are allowed (symmetric).
#
# Run from project root: pnpm validate:logical

cd "$(dirname "$0")/../.."

# The `-?(left|right)-[0-9]` alternative deliberately relies on the outer
# separator group alone. An inner `(^|[^a-z-])` would demand a SECOND separator
# character and silently match nothing — the bug that let `left-3`, `left-0`,
# and `-right-8` survive this gate.
VIOLATIONS=$(grep -rEn \
  '(^|["'\''[:space:]:!])((-?m[lr]|-?p[lr])-|border-[lr]\b|rounded-[lr]\b|text-(left|right)\b|-?(left|right)-[0-9]|before:(left|right)-|after:(left|right)-)' \
  src \
  --include='*.ts' --include='*.tsx' \
  | grep -v '^src/shared/components/ui/' \
  | grep -v '\.test\.' \
  | grep -v '\.fixtures\.ts' \
  | grep -v 'left-1/2' \
  | grep -v 'right-1/2' \
  | grep -v 'pl-PL' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Logical CSS contract violation(s) — physical direction utilities in app code:"
  echo "$VIOLATIONS" | sed 's/^/  /'
  echo ""
  echo "Use logical properties: ms/me, ps/pe, start/end, text-start/text-end,"
  echo "border-s/border-e, rounded-s/rounded-e. See docs/reference/internationalization.md."
  exit 1
fi

echo "Logical CSS OK — no physical direction utilities outside vendored ui/."
