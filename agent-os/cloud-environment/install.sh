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

# Node — the images boot on a Node older than engines.node (">=24.15"), and with
# engine-strict=true `pnpm install --frozen-lockfile` hard-fails on it. Probing
# for fnm/nvm does not help (neither exists on these images), so install the
# .nvmrc pin outright — see install-node.sh for the full reasoning.
#
# NOTE: .nvmrc is MAJOR.MINOR ("24.19"). `tr -dc '0-9'` would yield "2419" and
# point /opt/node<major> at a path that can never exist — keep the dot and cut
# the first field, exactly as agent-os/hooks/session-start.sh does.
node_major="24"
if [ -f .nvmrc ]; then
  parsed="$(tr -dc '0-9.' <.nvmrc | cut -d. -f1)"
  [ -n "${parsed}" ] && node_major="${parsed}"
fi

bash agent-os/cloud-environment/install-node.sh ||
  log "install-node failed — falling back to session Node"

# Activate it on PATH. install-node.sh runs as a child process and cannot change
# this shell's PATH, so the caller has to do it here.
current_major="$(node -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
[ -z "${current_major}" ] && current_major="0"
if [ "${current_major}" -lt "${node_major}" ] 2>/dev/null; then
  for candidate in \
    "${NODE_INSTALL_PREFIX:-/opt}/node${node_major}/bin" \
    /opt/node"${node_major}"*/bin \
    "${HOME}/.nvm/versions/node/v${node_major}"*/bin; do
    [ -x "${candidate}/node" ] || continue
    candidate_major="$("${candidate}/node" -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
    [ -n "${candidate_major}" ] || continue
    [ "${candidate_major}" -lt "${node_major}" ] 2>/dev/null && continue
    export PATH="${candidate}:${PATH}"
    # Persist for the rest of the session when the platform offers an env file.
    [ -n "${CLAUDE_ENV_FILE:-}" ] && printf 'export PATH=%s:$PATH\n' "${candidate}" >>"${CLAUDE_ENV_FILE}"
    current_major="${candidate_major}"
    log "switched to Node $(node -v) at ${candidate}"
    break
  done
fi
if [ "${current_major}" -lt "${node_major}" ] 2>/dev/null; then
  log "WARNING: active Node is $(node -v 2>/dev/null || echo none), below the required major ${node_major} —"
  log "         pnpm install will fail the engines gate (engines.node >=24.15, engine-strict=true)."
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
# --only-env is REQUIRED here: the full `pnpm setup:local` runs to phase 5/5 and
# spawns `pnpm dev`, a long-lived server that would hang this Setup script (which
# must terminate). --only-env returns right after writing the env file.
log "scaffold .env.local"
pnpm setup:local --only-env || log "setup:local skipped — .env.local may already exist"

log "done — lint / type-check / unit tests / pnpm agent-os:check run cold."
log "     Playwright e2e needs browsers (pnpm exec playwright install --with-deps chromium)"
log "     and core-be on :3000 — see agent-os/cloud-environment/agents-cloud.md."
log "     The chrome-devtools MCP reuses that same Playwright Chromium (pnpm mcp:setup chrome-devtools)."
