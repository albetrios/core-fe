#!/usr/bin/env bash
# Install gitleaks (secret scanner) for cloud-agent sessions.
#
# Why: `.husky/pre-commit` runs a staged-secret scan and CI has a gitleaks lane.
# Without the binary the pre-commit hook prints "gitleaks not installed.
# Skipping secret scan." — the commit still succeeds, so a secret can reach a
# branch and only get caught later by CI. Installing it locally makes the agent
# session enforce the same gate a developer's machine does.
#
# Usage:  bash tooling/setup/agent/install-gitleaks.sh
# Env:    GITLEAKS_VERSION (default: latest release) — e.g. 8.30.0, no "v"
#
# BEST-EFFORT: exits non-zero on failure; bootstrap.sh logs and carries on.
set -uo pipefail
LOG_TAG="install-gitleaks"
# shellcheck source=tooling/setup/agent/lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if have gitleaks; then
  log "already installed: $(gitleaks version 2>/dev/null) — nothing to do."
  exit 0
fi

arch="$(arch_for go)" || {
  log "unsupported architecture '$(uname -m)'."
  exit 1
}

version="${GITLEAKS_VERSION:-}"
if [ -z "${version}" ]; then
  tag="$(github_latest_tag gitleaks/gitleaks || true)"
  version="${tag#v}"
fi
if [ -z "${version}" ]; then
  log "could not resolve the latest gitleaks release — set GITLEAKS_VERSION to pin one."
  exit 1
fi

# Release assets use x64/arm64 (not amd64) from 8.19 onward.
asset_arch="${arch}"
[ "${asset_arch}" = "amd64" ] && asset_arch="x64"

tarball="gitleaks_${version}_linux_${asset_arch}.tar.gz"
url="https://github.com/gitleaks/gitleaks/releases/download/v${version}/${tarball}"
target="$(bin_dir)" || {
  log "no writable bin directory."
  exit 1
}

log "downloading ${url}"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

fetch "${url}" "${tmp}/${tarball}" || {
  log "download failed — is github.com allowed by the network policy?"
  exit 1
}
tar -xzf "${tmp}/${tarball}" -C "${tmp}" gitleaks 2>/dev/null || tar -xzf "${tmp}/${tarball}" -C "${tmp}" || {
  log "extract failed."
  exit 1
}
[ -x "${tmp}/gitleaks" ] || {
  log "unexpected tarball layout — no gitleaks binary inside ${tarball}."
  exit 1
}

install -m 0755 "${tmp}/gitleaks" "${target}/gitleaks" || {
  log "could not install to ${target}."
  exit 1
}
persist_path "${target}"

log "installed gitleaks $("${target}/gitleaks" version 2>/dev/null) at ${target}/gitleaks"
