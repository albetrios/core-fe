#!/usr/bin/env bash
# Install the GitHub CLI (`gh`) for cloud-agent sessions.
#
# Why: `pnpm github:sync`, the ruleset tooling, and the PR/CI helpers in
# agent-os/commands all shell out to `gh`. Cloud images do not ship it, and the
# session-start hook reports "gh absent" when it is missing.
#
# Installs from the official cli/cli GitHub release tarball rather than apt: the
# apt route needs a third-party keyring + sources.list entry (two more things to
# fail on a locked-down image) and ships an older build.
#
# Usage:  bash tooling/setup/agent/install-gh.sh
# Env:    GH_VERSION (default: latest release) — e.g. 2.63.2, no leading "v"
#
# BEST-EFFORT: exits non-zero on failure; bootstrap.sh logs and carries on.
set -uo pipefail
LOG_TAG="install-gh"
# shellcheck source=tooling/setup/agent/lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if have gh; then
  log "already installed: $(gh --version 2>/dev/null | head -1) — nothing to do."
  exit 0
fi

arch="$(arch_for go)" || {
  log "unsupported architecture '$(uname -m)'."
  exit 1
}

version="${GH_VERSION:-}"
if [ -z "${version}" ]; then
  tag="$(github_latest_tag cli/cli || true)"
  version="${tag#v}"
fi
if [ -z "${version}" ]; then
  log "could not resolve the latest gh release (api.github.com unreachable?) — set GH_VERSION to pin one."
  exit 1
fi

tarball="gh_${version}_linux_${arch}.tar.gz"
url="https://github.com/cli/cli/releases/download/v${version}/${tarball}"
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
tar -xzf "${tmp}/${tarball}" -C "${tmp}" || {
  log "extract failed."
  exit 1
}

# The tarball unpacks to gh_<version>_linux_<arch>/bin/gh.
src="${tmp}/gh_${version}_linux_${arch}/bin/gh"
[ -x "${src}" ] || {
  log "unexpected tarball layout — no bin/gh inside ${tarball}."
  exit 1
}
install -m 0755 "${src}" "${target}/gh" || {
  log "could not install to ${target}."
  exit 1
}
persist_path "${target}"

log "installed $("${target}/gh" --version 2>/dev/null | head -1) at ${target}/gh"
