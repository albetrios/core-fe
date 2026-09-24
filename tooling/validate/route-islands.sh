#!/usr/bin/env sh
# Route-island structure validation (agent-accuracy guard).
#   1. Every island under src/pages (dir containing <page>.route.tsx) has its
#      page-prefixed manifest, <PAGE>.OVERVIEW.md, and top-level <Page>Page/Layout UI.
#   2. Every path-like backtick reference in an island <PAGE>.OVERVIEW.md resolves on
#      disk — overview files are the entry docs AI agents read first; a stale
#      reference misleads them more than a missing one.
# Contract: agent-os/rules/fe-file-structure.mdc
# Run from project root: pnpm run validate:structure

cd "$(dirname "$0")/../.."

FAIL=0

fail() {
  echo "  FAIL  $1"
  FAIL=$((FAIL + 1))
}

# ── 1. Island shape ──
for route in $(find src/pages -name '*.route.tsx' | sort); do
  dir=$(dirname "$route")
  file=$(basename "$route")
  prefix=${file%.route.tsx}

  dirbase=$(basename "$dir")
  case "$dirbase" in
    components|hooks|forms|dialogs|store|shared|__tests__|sub-pages)
      fail "$dir: reserved unit-folder name '$dirbase' used as a route folder" ;;
  esac
  # $param folders derive their prefix mechanically: strip the `$`, camelCase →
  # kebab-case ($organizationId → organization-id). routing-and-tenancy.md §3.
  case "$dirbase" in
    \$*) expected=$(printf '%s' "${dirbase#?}" | sed 's/\([A-Z]\)/-\1/g' | tr '[:upper:]' '[:lower:]') ;;
    *) expected="$dirbase" ;;
  esac
  [ "$expected" = "$prefix" ] ||
    fail "$route: route marker prefix '$prefix' does not match directory '$dirbase' (expected '$expected')"
  [ -f "$dir/$prefix.manifest.ts" ] ||
    fail "$dir: missing manifest $prefix.manifest.ts"
  ov="$(printf '%s' "$prefix" | tr 'a-z-' 'A-Z_').OVERVIEW.md"
  [ -f "$dir/$ov" ] ||
    fail "$dir: missing $ov"
  if ! ls "$dir"/*Page.tsx >/dev/null 2>&1 && ! ls "$dir"/*Layout.tsx >/dev/null 2>&1; then
    fail "$dir: missing top-level <Page>Page.tsx or <Page>Layout.tsx"
  fi
  # Strict test rule: the island's top-level UI component ships a colocated test.
  for ui in "$dir"/*Page.tsx "$dir"/*Layout.tsx; do
    [ -f "$ui" ] || continue
    case "$ui" in *.test.tsx) continue ;; esac
    [ -f "${ui%.tsx}.test.tsx" ] ||
      fail "$ui: missing sibling $(basename "${ui%.tsx}").test.tsx (strict test rule)"
  done
done

# ── 2. Overview references resolve ──
# A backtick token is checked when it looks like a concrete path: an @/ alias,
# a directory reference ending in /, or a file with a known source extension.
# Tokens containing placeholder/code characters are skipped.
# Negative claims ("this island has no sub-pages") must be phrased without
# backtick paths — the validator treats every backtick path as "should exist".
for ov in $(find src/pages -name '*.OVERVIEW.md' | sort); do
  dir=$(dirname "$ov")
  while IFS= read -r tok; do
    [ -n "$tok" ] || continue
    case "$tok" in
      *' '*|*'<'*|*'>'*|*'*'*|*'('*|*')'*|*'{'*|*'}'*|*'|'*|*'?'*|*'='*|*'"'*|*"'"*) continue ;;
    esac
    case "$tok" in
      @/*)
        cand="src/${tok#@/}"
        cand=${cand%/}
        [ -e "$cand" ] ||
          fail "$ov: reference \`$tok\` does not resolve ($cand missing)"
        ;;
      */)
        t=${tok%/}
        [ -d "$dir/$t" ] || [ -d "$t" ] || [ -d "src/$t" ] ||
          fail "$ov: directory reference \`$tok\` not found (island-relative, root, or src/)"
        ;;
      *.ts|*.tsx|*.md|*.css|*.json|*.mjs|*.cjs)
        [ -f "$dir/$tok" ] || [ -f "$tok" ] || [ -f "src/$tok" ] ||
          fail "$ov: file reference \`$tok\` not found (island-relative, root, or src/)"
        ;;
    esac
  done <<EOF
$(grep -o '`[^`]*`' "$ov" | tr -d '`')
EOF
done

# ── 3. Shared folder-per-unit: no flat unit files ──
# Every component/form/hook in shared/ lives in its own folder (source + test
# + index.ts). Documented flat exceptions: shared/components/ui (shadcn) and
# the SettingsModal panel groups (cohesive flat groups).
for f in $(find src/shared/components src/shared/hooks src/shared/forms -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort); do
  fail "$f: flat unit file — folder-per-unit required (fe-file-structure.mdc)"
done

# ── 4. Unit folders expose an index.ts barrel ──
for d in src/shared/components/*/ src/shared/hooks/*/ src/shared/forms/*/ src/shared/store/*/ src/shared/layouts/*/; do
  [ -d "$d" ] || continue
  case "$(basename "$d")" in
    ui) continue ;;
  esac
  [ -f "${d}index.ts" ] ||
    fail "$d: missing index.ts barrel (folder-per-unit)"
done

# ── 5. Strict test colocation: every unit folder ships a test ──
# Components, forms, hooks, dialogs, and stores are folder-per-unit; the unit
# is incomplete without its colocated *.test.* (fe-file-structure.mdc).
for unit in $(find src/pages src/shared -type d 2>/dev/null | sort); do
  case "$(basename "$(dirname "$unit")")" in
    components|forms|hooks|dialogs|store) : ;;
    *) continue ;;
  esac
  case "$(basename "$unit")" in
    ui) continue ;;  # flat group — covered per-file below
  esac
  ls "$unit"/*.test.* >/dev/null 2>&1 ||
    fail "$unit: unit folder missing colocated *.test.* (strict test rule)"
done

# Flat component group (SettingsModal tree): every component file ships a
# sibling test.
for f in $(find src/shared/components/SettingsModal -name '*.tsx' ! -name '*.test.tsx' 2>/dev/null | sort); do
  [ -f "${f%.tsx}.test.tsx" ] ||
    fail "$f: missing sibling $(basename "${f%.tsx}").test.tsx (strict test rule)"
done

# ── 6. Duplicate island prefixes (notice, not failure) ──
# The same URL segment may repeat at different depths (e.g. two appointments/
# islands) and is disambiguated by path; avoidable parent/child collisions are
# designed out by the $param strip rule — docs/reference/routing-and-tenancy.md.
DUPES=$(find src/pages -name '*.route.tsx' -exec basename {} .route.tsx \; | sort | uniq -d)
[ -n "$DUPES" ] && echo "  NOTE  duplicate island prefixes (path-disambiguated):$(printf ' %s' $DUPES)"

ISLANDS=$(find src/pages -name '*.route.tsx' | wc -l | tr -d ' ')
if [ "$FAIL" -eq 0 ]; then
  echo "Route-island structure OK ($ISLANDS islands, all overview references resolve)"
  exit 0
else
  echo "$FAIL structure violation(s) across $ISLANDS islands. Contract: agent-os/rules/fe-file-structure.mdc"
  exit 1
fi
