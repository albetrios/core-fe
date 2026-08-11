#!/usr/bin/env bash
# Install the repo's pinned Node.js into /opt/node<major> for cloud-agent
# sessions (Claude Code on the web, Cursor cloud agents).
#
# Why this exists: the cloud image ships Node 20/21/22 (under /opt/nodeXX) and
# NO working version manager — `fnm` is absent and the `nvm` shell function is
# non-functional (`nvm ls` reports N/A, there is no ~/.nvm/versions tree).
# core-fe sets `engine-strict=true` with `engines.node >= 24.15`, so `pnpm
# install` HARD FAILS on the image default. Probing for a version manager
# silently falls back to Node 22 and the whole install aborts.
#
# This installs the pinned version into /opt/node<major> — the same layout the
# image uses and exactly where agent-os/hooks/session-start.sh looks — so the
# SessionStart hook switches PATH to it and runs `pnpm install` automatically.
# No repo files change; nothing depends on a version manager being present.
#
# Usage (called by bootstrap.sh; also runnable on its own):
#   bash tooling/setup/agent/install-node.sh
#
# Network: needs egress to nodejs.org, which is NOT in the default "Trusted"
# allowlist. Set Network access to "Custom", add `nodejs.org`, and keep
# "Also include default list of common package managers" checked.
#
# Env:
#   NODE_INSTALL_PREFIX (default /opt) — parent dir for node<major>
#
# Fails FAST (set -euo pipefail): a setup-time install error should surface, not
# leave a half-broken toolchain. Idempotent: re-running is a no-op once the
# pinned version is present (Setup scripts re-run on cache rebuilds).
set -euo pipefail

# Fallback only — used when .nvmrc is missing or the dist index is unreachable.
# Must satisfy engines.node in package.json.
readonly FALLBACK_VERSION="24.19.0"
readonly DIST_INDEX="https://nodejs.org/dist/index.json"
readonly INSTALL_PREFIX="${NODE_INSTALL_PREFIX:-/opt}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

log() { printf 'install-node: %s\n' "$*" >&2; }

# .nvmrc may pin a bare major (`24`), a major.minor (`24.19` — what this repo
# pins today), or an exact major.minor.patch. Only an exact version yields a
# tarball URL, so anything less specific is resolved against the dist index to
# the newest matching release. This is what keeps .nvmrc authoritative instead
# of decorative: hardcoding a version here would silently drift from the pin.
requested=""
if [ -f "${repository_root}/.nvmrc" ]; then
  requested="$(tr -dc '0-9.' <"${repository_root}/.nvmrc")"
fi
requested="${requested:-${FALLBACK_VERSION}}"

# Resolve `requested` to an exact x.y.z. The index is ordered newest-first, so
# the first match for the prefix is the newest release in that line.
resolve_version() {
  local prefix="$1" escaped
  escaped="${prefix//./\\.}"
  curl -fsSL --max-time 30 "${DIST_INDEX}" 2>/dev/null |
    grep -o "\"version\":\"v${escaped}\.[0-9.]*\"" |
    head -n 1 |
    tr -dc '0-9.'
}

case "${requested}" in
  *.*.*)
    version="${requested}"
    ;;
  *)
    log "resolving newest Node ${requested}.x from ${DIST_INDEX}"
    version="$(resolve_version "${requested}" || true)"
    if [ -z "${version}" ]; then
      log "WARNING: could not resolve ${requested}.x (nodejs.org unreachable?) — falling back to v${FALLBACK_VERSION}"
      version="${FALLBACK_VERSION}"
    fi
    ;;
esac
readonly version

major="${version%%.*}"
readonly major
readonly target_dir="${INSTALL_PREFIX}/node${major}"

# Idempotent: skip the download when the target already has this exact version.
if [ -x "${target_dir}/bin/node" ] && [ "$("${target_dir}/bin/node" -v 2>/dev/null)" = "v${version}" ]; then
  log "Node v${version} already present at ${target_dir} — nothing to do."
  exit 0
fi

case "$(uname -m)" in
  x86_64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *)
    log "unsupported architecture '$(uname -m)'."
    exit 1
    ;;
esac
readonly arch

readonly tarball="node-v${version}-linux-${arch}.tar.xz"
readonly url="https://nodejs.org/dist/v${version}/${tarball}"

if ! mkdir -p "${INSTALL_PREFIX}" 2>/dev/null || [ ! -w "${INSTALL_PREFIX}" ]; then
  log "cannot write to ${INSTALL_PREFIX} — run as root or set NODE_INSTALL_PREFIX to a writable dir."
  exit 1
fi

log "downloading ${url}"
# Stage inside INSTALL_PREFIX so the final swap is a same-filesystem rename.
staging_dir="$(mktemp -d "${INSTALL_PREFIX}/.node-install.XXXXXX")"
cleanup() { rm -rf "${staging_dir}"; }
trap cleanup EXIT

curl -fsSL --max-time 300 "${url}" -o "${staging_dir}/${tarball}"

mkdir -p "${staging_dir}/unpacked"
tar -xJf "${staging_dir}/${tarball}" -C "${staging_dir}/unpacked" --strip-components=1

# Replace atomically-ish rather than untarring over the old tree, so a version
# change never leaves stale files from the previous install behind.
rm -rf "${target_dir}"
mv "${staging_dir}/unpacked" "${target_dir}"

log "installed Node $("${target_dir}/bin/node" -v) at ${target_dir}"
