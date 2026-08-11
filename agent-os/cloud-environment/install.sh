#!/usr/bin/env bash
# Cached cloud-agent install for core-fe — idempotent; safe to run on every VM
# boot/update. Installs the Node toolchain + JS deps + the default MCP pair, and
# scaffolds a dev env file. It does NOT install Playwright browsers or start any
# service — those are on-demand (see agent-os/cloud-environment/agents-cloud.md),
# so a browser-download or backend failure never marks the environment as failed.
#
# Usage (Cursor environment.json install field or dashboard Setup script):
#   bash agent-os/cloud-environment/install.sh
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repository_root}"

log() { printf 'cloud-install: %s\n' "$*" >&2; }

# Node — pin the major from .nvmrc (24). Do NOT probe for a version manager:
# the cloud image ships Node 20/21/22 and no working one (`fnm` absent, the `nvm`
# shell function reports N/A with no ~/.nvm tree), so a probe silently falls
# through to Node 22 and the `engine-strict` install below hard-fails. Install
# the pinned Node deterministically instead.
#
# `cut -d. -f1` is load-bearing: .nvmrc pins `24.19`, and stripping the dot
# (`tr -dc '0-9'`) would yield major `2419` and look for /opt/node2419. Same
# parse as agent-os/hooks/session-start.sh, deliberately.
node_major="$(tr -dc '0-9.' <.nvmrc 2>/dev/null | cut -d. -f1 || true)"
node_major="${node_major:-24}"
bash agent-os/cloud-environment/install-node.sh || log "install-node failed — falling back to session Node"

# install-node.sh runs in a child process and so cannot change THIS shell's PATH.
# Activate the pinned Node here so `corepack`/`pnpm` below run on it, and persist
# it for the session via $CLAUDE_ENV_FILE when the harness provides one (the
# SessionStart hook does the same switch for interactive sessions, but does not
# run when this script is the environment's Setup script).
current_major="$(node -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
current_major="${current_major:-0}"
if [ "${current_major}" -lt "${node_major}" ] 2>/dev/null; then
  for candidate in \
    "${NODE_INSTALL_PREFIX:-/opt}/node${node_major}/bin" \
    /opt/node"${node_major}"*/bin \
    "${HOME}/.nvm/versions/node/v${node_major}"*/bin; do
    [ -x "${candidate}/node" ] || continue
    export PATH="${candidate}:${PATH}"
    if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
      printf 'export PATH=%s:$PATH\n' "${candidate}" >>"${CLAUDE_ENV_FILE}"
    fi
    log "switched to Node $(node -v) at ${candidate} (was v${current_major}.x)"
    break
  done
fi

node -v >/dev/null 2>&1 || log "Node not available — pnpm install will fail"
if [ "$(node -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)" -lt "${node_major}" ] 2>/dev/null; then
  log "WARNING: Node $(node -v) < required v${node_major} (.nvmrc) — engine-strict will reject pnpm install"
fi

# pnpm via corepack (packageManager pin in package.json).
corepack enable 2>/dev/null || log "corepack enable failed — ensure pnpm is on PATH"

log "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

# Default MCP pair (codegraph + headroom) → .mcp.json, same as local pnpm setup:local.
# Both binaries are devDependencies, so they resolve after install. Best-effort.
log "scaffold MCP default pair (.mcp.json)"
pnpm mcp:setup:default || log "mcp:setup:default failed — run it manually if MCP tools are missing"

# Scaffold .env.local for later `pnpm dev` (schema defaults; no secrets committed).
# --only-env is REQUIRED here: a bare `pnpm setup:local` runs through to phase
# 5/5 and spawns a long-lived `pnpm dev`, which would hang this Setup script
# (it is cached and must terminate). --only-env writes .env.local and exits.
log "scaffold .env.local"
pnpm setup:local --only-env || log "setup:local skipped — .env.local may already exist"

log "done — lint / type-check / unit tests / pnpm agent-os:check run cold."
log "     Playwright e2e needs browsers (pnpm exec playwright install --with-deps chromium)"
log "     and core-be on :3000 — see agent-os/cloud-environment/agents-cloud.md."
log "     The chrome-devtools MCP reuses that same Playwright Chromium (pnpm mcp:setup chrome-devtools)."
