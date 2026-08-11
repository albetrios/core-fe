#!/usr/bin/env bash
# Deterministic pinned-Node install for cloud agent images (core-fe).
#
# WHY THIS DOES NOT PROBE FOR A VERSION MANAGER
# ---------------------------------------------
# The previous approach was `command -v fnm` then `command -v nvm`, falling back
# to "the session Node". On the cloud images that fallback is the only branch
# that ever runs, and it is not good enough:
#
#   * fnm is not installed at all.
#   * nvm is a *shell function*, not a binary — `command -v nvm` reports it as
#     N/A from a non-interactive script, and there is no ~/.nvm tree behind it,
#     so even sourcing it would install nothing.
#   * The images boot on Node 22, but package.json sets engines.node ">=24.15"
#     with engine-strict=true, so `pnpm install --frozen-lockfile` HARD-FAILS:
#       "Expected version: >=24.15, Got: v22.22.2"
#     — leaving the session with no node_modules at all.
#
# So instead of asking the image what it has, we install exactly what .nvmrc
# pins: resolve the pin to a concrete x.y.z against the official release index,
# download the tarball, verify its SHA-256 against SHASUMS256.txt BEFORE
# unpacking, and lay it down at /opt/node<major> — the same layout
# agent-os/hooks/session-start.sh already searches.
#
# PARSING TRAP — .nvmrc holds a MAJOR.MINOR ("24.19"), not a bare major.
# `tr -dc '0-9'` would collapse it to "2419" and send the /opt/node<major>
# lookup to a path that can never exist. Keep the dot and cut the first field:
#   tr -dc '0-9.' | cut -d. -f1        (identical to session-start.sh)
#
# This script only *installs*; it cannot change its caller's PATH (it is a child
# process). install.sh activates the result afterwards.
#
# Usage:
#   bash agent-os/cloud-environment/install-node.sh
#   NODE_INSTALL_PREFIX=/somewhere bash agent-os/cloud-environment/install-node.sh
set -euo pipefail

readonly FALLBACK_VERSION="24.19.0"
readonly INSTALL_PREFIX="${NODE_INSTALL_PREFIX:-/opt}"
readonly DIST_BASE="https://nodejs.org/dist"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repository_root}"

log() { printf 'install-node: %s\n' "$*" >&2; }

# --- The pin from .nvmrc (KEEP the dot: "24.19", not "2419") -----------------
pin="$(tr -dc '0-9.' <.nvmrc 2>/dev/null || true)"
pin="${pin:-24}"
major="${pin%%.*}"
target_dir="${INSTALL_PREFIX}/node${major}"

# --- Resolve the pin to an exact x.y.z from the official release index -------
# index.tab is sorted newest-first, so the first row matching the pin exactly
# ("v24.19") or as a prefix ("v24.19.") is the newest patch for that pin.
version=""
if index_tab="$(curl -fsSL --retry 3 --max-time 60 "${DIST_BASE}/index.tab" 2>/dev/null)"; then
  version="$(printf '%s\n' "${index_tab}" |
    awk -v pin="${pin}" 'NR > 1 && ($1 == "v" pin || index($1, "v" pin ".") == 1) { print substr($1, 2); exit }')"
fi
if [ -z "${version}" ]; then
  log "could not resolve '${pin}' from ${DIST_BASE}/index.tab — falling back to ${FALLBACK_VERSION}"
  version="${FALLBACK_VERSION}"
fi

# A resolved version from a different major would install to the wrong prefix
# and silently defeat the pin — refuse rather than guess.
resolved_major="${version%%.*}"
if [ "${resolved_major}" != "${major}" ]; then
  log "resolved v${version} does not match the .nvmrc major (${major}) — refusing to install"
  exit 1
fi

# --- Idempotent: already the requested version? ------------------------------
if [ -x "${target_dir}/bin/node" ] &&
  [ "$("${target_dir}/bin/node" -v 2>/dev/null)" = "v${version}" ]; then
  log "v${version} already installed at ${target_dir} — nothing to do"
  exit 0
fi

# --- Architecture ------------------------------------------------------------
machine="$(uname -m)"
case "${machine}" in
  x86_64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *)
    log "unsupported architecture '${machine}' — cannot install Node"
    exit 1
    ;;
esac

# --- Download + verify BEFORE unpacking --------------------------------------
tarball="node-v${version}-linux-${arch}.tar.xz"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

log "downloading ${tarball}"
curl -fsSL --retry 3 --max-time 300 -o "${temporary_directory}/${tarball}" \
  "${DIST_BASE}/v${version}/${tarball}"
curl -fsSL --retry 3 --max-time 60 -o "${temporary_directory}/SHASUMS256.txt" \
  "${DIST_BASE}/v${version}/SHASUMS256.txt"

log "verifying sha256"
(
  cd "${temporary_directory}"
  awk -v file="${tarball}" '$2 == file' SHASUMS256.txt | sha256sum -c -
)

# --- Unpack ------------------------------------------------------------------
log "installing to ${target_dir}"
mkdir -p "${target_dir}"
tar -xJf "${temporary_directory}/${tarball}" -C "${target_dir}" --strip-components=1

log "installed $("${target_dir}/bin/node" -v) at ${target_dir}"
