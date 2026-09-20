#!/usr/bin/env sh
# Theme-axis compliance gate — prevents regressions after the 18-axis audit.
#
# Checks app code (excludes vendored shadcn ui/, tests, fixtures):
#   1. Hardcoded shadow-* on surfaces (elevation axis owns depth via data-elevation)
#   2. Hardcoded focus-visible:ring / focus:ring (data-focus owns focus via data-slot)
#   3. Direct lucide-react imports (must use @/shared/icons barrel)
#   4. bg-card / bg-popover class shells with no data-slot within 4 lines above
#   5. Off-scale corner radius — a bare `rounded`, or an arbitrary `rounded-[…]`
#      that is not a `var(--radius-*)`. Neither is driven by the Corner radius
#      axis, so the element stays round when the rest of the app goes square.
#      (Every NAMED step, `rounded-xs` … `rounded-4xl`, derives from --radius-lg
#      in index.css and is fine; `rounded-full` is a shape decision — see 6.)
#   6. `rounded-full` the Sharp shape cannot reach — round-by-design is a SHAPE
#      decision, so the element needs a slot the `[data-shape='sharp']` list in
#      index.css squares: its own `data-slot=` (usually "pill"), or a primitive
#      that brings one (<Button>, <Badge>, <Avatar>, <Skeleton>). Indicators are
#      exempt — status dots ≤ 10px, blurred glows, the ping halo, and
#      pseudo-element markers (squared in index.css through their nav item).
#   7. Fixed-size spacing — a padding / margin / gap written as `p-[24px]` or
#      `gap-[0.5rem]`. Every scale step (`p-6`) is `calc(var(--spacing) * n)` and
#      the Density axis sets `--spacing`; a literal looks identical on the default
#      look and then ignores the setting. `[var(--…)]` and `[calc(…)]` are fine.
#
# Documented exceptions: tooling/validate/theme-axis-allowlist.txt
# Run from project root: pnpm validate:theme-axis
#
# THEME_AXIS_ROOT — scan a different tree (it must contain `src/`). For
# `theme-axis.test.mjs` only: a gate nobody has watched fail is a green
# checkmark, and the fixtures that make it fail must not live in the real `src/`.
# The allowlist always comes from beside this script, so a fixture tree is held
# to the same exceptions as the real one.

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ALLOWLIST="$SCRIPT_DIR/theme-axis-allowlist.txt"

cd "${THEME_AXIS_ROOT:-$SCRIPT_DIR/../..}" || exit 2
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
# `.` for the quote, never a literal `'`: `scan` builds its grep inside an `eval`
# that single-quotes the pattern, so a quote in here closed that string early and
# the pattern became `from lucide-react` — which matches nothing. This check was
# dead from the day it was written (ESLint's no-restricted-imports carried the
# rule alone); `theme-axis.test.mjs` is what noticed.
scan "direct lucide-react import (use @/shared/icons)" "from .lucide-react."

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

# Keep the hits that have NO line matching $3 within the $2 lines above them
# (the hit's own line included), then apply the allowlist.
#
# Proximity, not parsing: this catches the forgotten tag, not a determined
# bypass — a sibling's slot inside the window vouches for its neighbor too.
without_nearby() {
  raw="$1"
  window="$2"
  vouch="$3"
  [ -z "$raw" ] && return 0
  printf '%s\n' "$raw" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    file=${line%%:*}
    rest=${line#*:}
    linenum=${rest%%:*}
    start=$((linenum - window))
    [ "$start" -lt 1 ] && start=1
    if sed -n "${start},${linenum}p" "$file" | grep -Eq "$vouch"; then
      continue
    fi
    printf '%s\n' "$line"
  done | filter_allowlist
}

SLOT_RAW=$(grep -rEn 'className=.*\bbg-(card|popover)\b' src --include='*.tsx' \
  | grep -v '^src/shared/components/ui/' \
  | grep -v '\.test\.' \
  || true)
report_hits "bg-card/bg-popover without data-slot (within 4 lines)" \
  "$(without_nearby "$SLOT_RAW" 4 'data-slot=')"

# 6 — `rounded-full` with nothing for the Sharp shape to grab. Dropped before the
# look-back, because they are indicators and not surfaces: comment lines, blurred
# glows, the ping halo, pseudo-element markers, and dots of at most 10px
# (`size-2.5`, `h-2 w-2`). Prettier's Tailwind plugin fixes the class order, so
# `h-N w-N` is the only spelling a dot can have.
PILL_RAW=$(grep -rEn 'rounded-full' src --include='*.tsx' --include='*.ts' \
  | grep -v '^src/shared/components/ui/' \
  | grep -v '\.test\.' \
  | grep -v '\.fixtures\.' \
  | grep -Ev ':[0-9]+:[[:space:]]*(//|\*|/\*|\{/\*)' \
  | grep -Ev 'blur-|animate-ping|(before|after):rounded-full' \
  | grep -Ev "(^|[\"'\` ])(size-(1|1\.5|2|2\.5)|h-(1|1\.5|2|2\.5) w-(1|1\.5|2|2\.5))([^0-9.]|\$)" \
  || true)
report_hits "rounded-full the Sharp shape cannot square (add data-slot=\"pill\")" \
  "$(without_nearby "$PILL_RAW" 5 'data-slot=|<(Button|Badge|Avatar|AvatarFallback|Skeleton|SkeletonShimmer)([[:space:]/>]|$)')"

# 7 — spacing that ignores the Density axis. Only the spacing utilities, and
# only a bare number + unit: sizes (`h-[640px]`), offsets (`top-[20%]`) and
# anything built on a variable are not this check's business.
SPACING_RAW=$(grep -rEn "(^|[\"'\` :])-?(p|px|py|ps|pe|pt|pb|m|mx|my|ms|me|mt|mb|gap|gap-x|gap-y|space-x|space-y)-\[[0-9.]+(px|rem|em)\]" src \
  --include='*.tsx' --include='*.ts' \
  | grep -v '^src/shared/components/ui/' \
  | grep -v '\.test\.' \
  | grep -v '\.fixtures\.' \
  | grep -Ev ':[0-9]+:[[:space:]]*(//|\*|/\*|\{/\*)' \
  | filter_allowlist || true)
report_hits "fixed-size spacing ignores the Density axis (use a scale step: p-6, gap-2)" "$SPACING_RAW"

if [ "$FAIL" -ne 0 ]; then
  echo "Fix violations or add a documented exception to $ALLOWLIST"
  echo "Playbook: docs/reference/theme-axis-audit-playbook.md"
  exit 1
fi

echo "Theme axis OK — no compliance violations in app code."
