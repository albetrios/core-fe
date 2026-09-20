#!/usr/bin/env sh
# Theme-axis compliance gate — prevents regressions after the 18-axis audit.
#
# Checks app code (excludes vendored shadcn ui/, tests, fixtures):
#   1. Hardcoded shadow-* on surfaces (elevation axis owns depth via data-elevation)
#   2. Hardcoded focus-visible:ring / focus:ring (data-focus owns focus via data-slot)
#   3. Direct lucide-react imports (must use @/shared/icons barrel)
#   4. bg-card / bg-popover class shells without data-slot on the same line
#   5. Off-scale corner radius — a bare `rounded`, or an arbitrary `rounded-[…]`
#      that is not a `var(--radius-*)`. Neither is driven by the Corner radius
#      axis, so the element stays round when the rest of the app goes square.
#      (Every NAMED step, `rounded-xs` … `rounded-4xl`, derives from --radius-lg
#      in index.css and is fine; `rounded-full` is a shape decision — tag the
#      element `data-slot="pill"` so the Sharp shape can square it.)
#
# Documented exceptions: tooling/validate/theme-axis-allowlist.txt
# Run from project root: pnpm validate:theme-axis

cd "$(dirname "$0")/../.."

ALLOWLIST="tooling/validate/theme-axis-allowlist.txt"
FAIL=0

# Drop lines matching any allowlist substring (path:fragment or bare fragment).
filter_allowlist() {
  if [ ! -f "$ALLOWLIST" ]; then
    cat
    return
  fi
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    skip=0
    while IFS= read -r allow; do
      case "$allow" in \#*|'') continue ;; esac
      case "$hit" in *"$allow"*) skip=1; break ;; esac
    done < "$ALLOWLIST"
    [ "$skip" -eq 0 ] && printf '%s\n' "$hit"
  done
}

report_hits() {
  label="$1"
  hits="$2"
  if [ -n "$hits" ]; then
    echo "Theme-axis violation ($label):"
    echo "$hits" | sed 's/^/  /'
    echo ""
    FAIL=1
  fi
}

BASE_EXCLUDES="grep -v '^src/shared/components/ui/' | grep -v '\.test\.' | grep -v '\.fixtures\.'"

scan() {
  label="$1"
  pattern="$2"
  # shellcheck disable=SC2016
  hits=$(eval "grep -rEn '$pattern' src --include='*.tsx' --include='*.ts' | $BASE_EXCLUDES | filter_allowlist" || true)
  report_hits "$label" "$hits"
}

scan "hardcoded shadow-* (use data-elevation + data-slot)" 'shadow-(sm|md|lg|xl|2xl)'
scan "hardcoded focus ring (use data-slot + data-focus)" 'focus-visible:ring|focus:ring'
scan "direct lucide-react import (use @/shared/icons)" "from 'lucide-react'"

# 5 — off-scale radius. Two shapes: a bare `rounded` class token, and an
# arbitrary `rounded-[…]` / `rounded-s-[…]` that is not a `var(--radius-*)`.
# Comment lines are skipped: prose says "rounded" too.
RADIUS_RAW=$(grep -rEn "(^|[\"'\` ])rounded([\"'\` ]|\$)|rounded(-[a-z]{1,2})?-\[" src \
  --include='*.tsx' --include='*.ts' \
  | grep -v '^src/shared/components/ui/' \
  | grep -v '\.test\.' \
  | grep -v '\.fixtures\.' \
  | grep -Ev ':[0-9]+:[[:space:]]*(//|\*|/\*|\{/\*)' \
  | grep -Ev 'rounded(-[a-z]{1,2})?-\[(calc\()?var\(--radius-' \
  | filter_allowlist || true)
report_hits "off-scale radius (use rounded-xs…4xl, or rounded-[var(--radius-*)])" "$RADIUS_RAW"

SLOT_RAW=$(grep -rEn 'className=.*\bbg-(card|popover)\b' src --include='*.tsx' \
  | grep -v '^src/shared/components/ui/' \
  | grep -v '\.test\.' \
  || true)

SLOT_HITS=""
if [ -n "$SLOT_RAW" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    file=${line%%:*}
    rest=${line#*:}
    linenum=${rest%%:*}
    start=$((linenum - 4))
    [ "$start" -lt 1 ] && start=1
    if sed -n "${start},${linenum}p" "$file" | grep -q 'data-slot='; then
      continue
    fi
    skip=0
    while IFS= read -r allow; do
      case "$allow" in \#*|'') continue ;; esac
      case "$line" in *"$allow"*) skip=1; break ;; esac
    done < "${ALLOWLIST:-/dev/null}"
    [ "$skip" -eq 0 ] && SLOT_HITS="${SLOT_HITS}${line}
"
  done <<EOF
$SLOT_RAW
EOF
fi
SLOT_HITS=$(printf '%s' "$SLOT_HITS" | sed '/^$/d')
report_hits "bg-card/bg-popover without data-slot (within 4 lines)" "$SLOT_HITS"

if [ "$FAIL" -ne 0 ]; then
  echo "Fix violations or add a documented exception to $ALLOWLIST"
  echo "Playbook: docs/reference/theme-axis-audit-playbook.md"
  exit 1
fi

echo "Theme axis OK — no compliance violations in app code."
