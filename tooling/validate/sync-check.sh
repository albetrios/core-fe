#!/usr/bin/env sh
# Deterministic docs↔code SYNC gate — the structural drift checks that a single
# commit can break, aggregated into one command. This is the CI-safe set (no
# network, no backend, no build): route-island structure, test-id and i18n
# contracts, theme catalog, the committed project-tree, and agent-os platform
# wiring. Each already runs as a discrete step in the PR lane (static-sync +
# agent-os-gate); this aggregate is for local use (`pnpm sync:check`) and for
# the weekly sync-drift canary, which runs it alongside the advisory
# `pnpm docs:staleness` scan.
#
#   pnpm sync:check          the CI-safe deterministic set
#   pnpm sync:check:local    + contracts:drift (needs the sibling core-be checkout)
#
# NOT included: the advisory `docs:staleness` semantic scan (allowed to have
# false positives → canary issue, never a hard gate).
set -e

cd "$(dirname "$0")/../.."

if [ -t 1 ] && [ -n "${TERM:-}" ] && command -v tput >/dev/null 2>&1; then
  RED=$(tput setaf 1); GREEN=$(tput setaf 2); BOLD=$(tput bold); RESET=$(tput sgr0)
else
  RED=""; GREEN=""; BOLD=""; RESET=""
fi
PASS="${GREEN}${BOLD}PASS${RESET}"
FAIL="${RED}${BOLD}FAIL${RESET}"

LOCAL=0
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=1 ;;
  esac
done

TOTAL_FAILS=0

run() {
  # run "<label>" <command...>
  label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  $PASS  $label"
  else
    echo "  $FAIL  $label"
    TOTAL_FAILS=$((TOTAL_FAILS + 1))
  fi
}

echo ""
echo "${BOLD}Sync check${RESET} — deterministic docs↔code drift"
echo "============================================="

run "route-island structure   (validate:structure)" pnpm validate:structure
run "test-id contracts         (validate:testids)"   pnpm validate:testids
run "i18n key contracts        (validate:i18n)"      pnpm validate:i18n
run "i18n locale parity        (validate:i18n-parity)" pnpm validate:i18n-parity
run "theme catalog docs        (validate:theme-catalog)" pnpm validate:theme-catalog
run "product identity          (validate:identity)"  pnpm validate:identity
run "project-tree docs         (tool:project-structure-tree:check)" pnpm tool:project-structure-tree:check
run "agent-os integrity        (agent-os:check)"     pnpm agent-os:check
run "agent-os trigger routing  (agent-os:triggers:strict)" pnpm agent-os:triggers:strict
run "agent-os platform wiring  (agent-os:generate:check)"  pnpm agent-os:generate:check

if [ "$LOCAL" = 1 ]; then
  run "API contract drift        (contracts:drift)"   pnpm contracts:drift
fi

echo ""
echo "============================================="
if [ "$TOTAL_FAILS" -eq 0 ]; then
  echo "${BOLD}${GREEN}Sync check passed.${RESET}"
  exit 0
else
  echo "${BOLD}${RED}$TOTAL_FAILS sync check(s) failed.${RESET}"
  echo "Run the failing command without redirect to see details (e.g. pnpm validate:structure)."
  exit 1
fi
