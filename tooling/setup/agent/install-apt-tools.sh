#!/usr/bin/env bash
# Install the distro-packaged CLI prerequisites for cloud-agent sessions.
#
# These are the entries from tooling/dev/setup-prerequisites-mac-tools.manifest
# that Homebrew installs on a developer's Mac and that apt provides on the Linux
# cloud image. Keep the two lists in step — see this directory's README.
#
#   - jq            JSON in shell/CI scripts + the session-start hook's MCP count
#   - ripgrep       fast search used by the code-review report tooling
#   - shellcheck    shell lint — parity with the CI shellcheck/actionlint lanes
#   - librsvg2-bin  rsvg-convert — regenerate PWA icon PNGs from public/app-icon.svg
#   - xz-utils      required to unpack the Node tarball (install-node.sh)
#
# (The list above is indented with a leading dash so ShellCheck does not read
# the `shellcheck` line as a directive.)
#
# Usage:  bash tooling/setup/agent/install-apt-tools.sh
# Env:    AGENT_APT_PACKAGES — override the package list (space-separated)
#
# BEST-EFFORT: a missing package or a blocked apt mirror is logged, never fatal.
# Exits non-zero only when nothing at all could be installed AND something was
# missing, so bootstrap.sh can report it accurately.
set -uo pipefail
LOG_TAG="install-apt-tools"
# shellcheck source=tooling/setup/agent/lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# package:binary — the binary is what we probe for, since package and command
# names differ (librsvg2-bin ships rsvg-convert, ripgrep ships rg).
readonly DEFAULT_PACKAGES="jq:jq ripgrep:rg shellcheck:shellcheck librsvg2-bin:rsvg-convert xz-utils:xz"

missing=""
present=""
for entry in ${AGENT_APT_PACKAGES:-${DEFAULT_PACKAGES}}; do
  pkg="${entry%%:*}"
  bin="${entry##*:}"
  if have "${bin}"; then
    present="${present} ${bin}"
  else
    missing="${missing} ${pkg}"
  fi
done

[ -n "${present}" ] && log "already present:${present}"

if [ -z "${missing}" ]; then
  log "all distro prerequisites present — nothing to do."
  exit 0
fi

log "installing:${missing}"
if ! can_apt; then
  log "apt unavailable (need root/sudo + apt-get) — skipping:${missing}"
  exit 1
fi

# One transaction; apt_install updates the index at most once.
# shellcheck disable=SC2086
apt_install ${missing} || log "batch install reported an error — checking what landed anyway."

still_missing=""
for entry in ${AGENT_APT_PACKAGES:-${DEFAULT_PACKAGES}}; do
  bin="${entry##*:}"
  have "${bin}" || still_missing="${still_missing} ${bin}"
done

if [ -n "${still_missing}" ]; then
  log "still missing after install:${still_missing} (is the apt mirror allowed by the network policy?)"
  exit 1
fi

log "done — all distro prerequisites present."
