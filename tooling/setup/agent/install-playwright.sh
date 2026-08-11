#!/usr/bin/env bash
# Ensure Playwright browsers are available for the E2E lane in a cloud session.
#
# This is core-fe's counterpart to core-be's Docker step: the heavy, optional,
# frontend-specific dependency that a session may or may not need.
#
# Two things matter on cloud images:
#
#  1. Chromium is often PRE-INSTALLED (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers,
#     with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 so npm postinstall never refetches
#     it). Re-running `playwright install` there is a pointless ~150 MB download,
#     so this script detects an existing browser and exits early.
#  2. Downloading browsers must never fail the bring-up. E2E additionally needs
#     core-be on :3000, which cloud sessions do not have, so the suite is
#     opt-in anyway (tests/e2e/global-setup.ts fails fast when it is down).
#
# Usage:  bash tooling/setup/agent/install-playwright.sh
# Env:    AGENT_PLAYWRIGHT_BROWSERS  (default "chromium"; e.g. "chromium firefox webkit"
#                                     for playwright.integration-cross-browser.config.ts)
#         AGENT_PLAYWRIGHT_WITH_DEPS=1  also install OS deps (needs root; apt)
#         AGENT_SKIP_PLAYWRIGHT=1       skip entirely
#
# BEST-EFFORT: exits non-zero on failure; bootstrap.sh logs and carries on.
set -uo pipefail
LOG_TAG="install-playwright"
# shellcheck source=tooling/setup/agent/lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

cd "${REPO_ROOT}" || exit 1

if [ "${AGENT_SKIP_PLAYWRIGHT:-0}" = "1" ]; then
  log "AGENT_SKIP_PLAYWRIGHT=1 — skipping."
  exit 0
fi

if [ ! -d node_modules/@playwright ]; then
  log "@playwright/test is not installed yet — run pnpm install first."
  exit 1
fi

browsers="${AGENT_PLAYWRIGHT_BROWSERS:-chromium}"

# Already provisioned? The image exports PLAYWRIGHT_BROWSERS_PATH and unpacks
# revision-suffixed dirs (chromium-1194, firefox-1489, …) beside plain names.
browsers_path="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"
missing=""
for b in ${browsers}; do
  # shellcheck disable=SC2144  # intentional glob test: any revision dir counts
  if [ -d "${browsers_path}/${b}" ] || [ -d "${browsers_path}/${b}"-* ]; then
    continue
  fi
  missing="${missing} ${b}"
done

if [ -z "${missing}" ]; then
  log "browsers already present in ${browsers_path}:${browsers:+ ${browsers}} — nothing to download."
  exit 0
fi

log "installing:${missing} (into ${browsers_path})"

# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD only guards npm postinstall; an explicit
# `playwright install` still downloads, which is what we want here.
deps_flag=""
if [ "${AGENT_PLAYWRIGHT_WITH_DEPS:-0}" = "1" ]; then
  if [ "$(id -u)" = "0" ] || have sudo; then
    deps_flag="--with-deps"
  else
    log "AGENT_PLAYWRIGHT_WITH_DEPS=1 but no root/sudo — installing browsers without OS deps."
  fi
fi

# shellcheck disable=SC2086
if pnpm exec playwright install ${deps_flag} ${missing} >&2; then
  log "browsers installed:${missing}"
else
  log "browser install failed — E2E will not run (needs playwright.azureedge.net / cdn.playwright.dev)."
  exit 1
fi
