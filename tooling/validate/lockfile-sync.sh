#!/usr/bin/env sh
# Lockfile ↔ package.json sync gate.
#
# A change to package.json dependencies or `pnpm.overrides` that does NOT
# regenerate pnpm-lock.yaml produces ERR_PNPM_LOCKFILE_CONFIG_MISMATCH and fails
# EVERY frozen-install CI job — including release-please PRs, whose branch
# inherits the mismatch and goes all-red until it is regenerated.
#
# `pnpm install --frozen-lockfile` is exactly what CI runs: it errors immediately
# on any lockfile/config mismatch (before network work), so we run it locally.
#
# See agent-os/skills/fe-before-commit-guard/SKILL.md and
# agent-os/skills/fe-platform-hygiene/SKILL.md.
set -e

cd "$(dirname "$0")/../.."

output=$(pnpm install --frozen-lockfile --prefer-offline --ignore-scripts 2>&1) && {
  echo "[validate-lockfile] OK: pnpm-lock.yaml is in sync with package.json."
  exit 0
}

# A too-old Node aborts the install BEFORE pnpm compares anything, so an engine
# problem arrives wearing a lockfile problem's clothes. On Node 24.13 this gate
# used to report a desync that did not exist, and the "regenerate the lockfile"
# advice below would have been actively wrong. Name the real cause instead.
if printf '%s' "$output" | grep -q 'ERR_PNPM_UNSUPPORTED_ENGINE'; then
  echo "[validate-lockfile] ERROR: Node $(node -v) is too old for this dependency tree."
  echo "  The lockfile is FINE — pnpm aborted before it could compare anything."
  echo "  Fix: switch to the pinned toolchain, then re-run:  nvm use"
  echo "  (.nvmrc pins the minor because 24.15 is the real floor, not 24.)"
  echo ""
  echo "  pnpm error:"
  printf '%s\n' "$output" | sed 's/^/    /'
  exit 1
fi

echo "[validate-lockfile] ERROR: pnpm-lock.yaml is out of sync with package.json."
echo "  A dependency or pnpm.overrides changed without regenerating the lockfile."
echo "  Fix: run 'pnpm install', then commit package.json AND pnpm-lock.yaml together."
echo "  A desynced lockfile breaks every frozen-install CI job and must never reach main."
echo ""
echo "  pnpm error:"
printf '%s\n' "$output" | sed 's/^/    /'
exit 1
