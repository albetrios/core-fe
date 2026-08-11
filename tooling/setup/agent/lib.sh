#!/usr/bin/env bash
# Shared helpers for the cloud-agent installers in this directory.
#
# Sourced, never executed:
#   . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#
# Every installer here is BEST-EFFORT by contract: a cloud image may block the
# download host, ship the tool already, or run without apt. None of that should
# abort a session bring-up, so helpers return non-zero instead of exiting and
# bootstrap.sh decides what is fatal. The hard gates live in bootstrap.sh.

# Guard against double-sourcing (bootstrap sources this, and so does each
# installer it calls when run standalone).
[ -n "${AGENT_SETUP_LIB_LOADED:-}" ] && return 0
AGENT_SETUP_LIB_LOADED=1

# Repo root, resolved from this file's location (tooling/setup/agent/lib.sh).
AGENT_SETUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${AGENT_SETUP_DIR}/../../.." && pwd)"
export AGENT_SETUP_DIR REPO_ROOT

# Log tag defaults to the calling script's name; override by setting LOG_TAG.
_tag() { printf '%s' "${LOG_TAG:-$(basename "${0:-agent-setup}" .sh)}"; }
log() { printf '%s: %s\n' "$(_tag)" "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# Detect the machine architecture in the naming each upstream uses.
# $1 = flavour: "node" (x64/arm64) | "go" (amd64/arm64)
arch_for() {
  case "$(uname -m)" in
    x86_64 | amd64) [ "${1:-go}" = "node" ] && echo "x64" || echo "amd64" ;;
    aarch64 | arm64) echo "arm64" ;;
    *) return 1 ;;
  esac
}

# True when this shell can install OS packages (root or usable sudo, plus apt).
can_apt() {
  have apt-get || return 1
  [ "$(id -u)" = "0" ] || have sudo || return 1
  return 0
}

# Run a command as root when we are not already root.
as_root() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo "$@"; fi
}

# apt-get install, updating the index at most once per bootstrap run.
# Quiet and non-interactive: a Setup script has no TTY to answer prompts.
_APT_UPDATED=""
apt_install() {
  can_apt || {
    log "apt unavailable (need root/sudo + apt-get) — skipping: $*"
    return 1
  }
  export DEBIAN_FRONTEND=noninteractive
  if [ -z "${_APT_UPDATED}" ]; then
    as_root apt-get update -qq >/dev/null 2>&1 || log "apt-get update failed — continuing with the cached index"
    _APT_UPDATED=1
  fi
  as_root apt-get install -y -qq --no-install-recommends "$@" >/dev/null 2>&1
}

# Download a URL to a path. Fails (non-zero) rather than leaving a partial file.
fetch() {
  local url="$1" out="$2"
  if have curl; then
    curl -fsSL --max-time "${FETCH_TIMEOUT:-300}" "${url}" -o "${out}"
  elif have wget; then
    wget -q -T "${FETCH_TIMEOUT:-300}" -O "${out}" "${url}"
  else
    log "neither curl nor wget is available — cannot download ${url}"
    return 1
  fi
}

# Resolve the latest release tag of a GitHub repo (e.g. "v8.30.0"), or fail.
# Kept dependency-free (no jq) so it works on a bare image.
#
# Two independent paths, because allowlists routinely permit one host and not
# the other: the REST API on api.github.com, then the /releases/latest redirect
# on github.com (which lands on .../releases/tag/<tag>). Callers can bypass both
# by pinning a version, which is what a locked-down environment should do.
github_latest_tag() {
  local repo="$1" body tag final

  body="$(
    if have curl; then
      curl -fsSL --max-time 30 "https://api.github.com/repos/${repo}/releases/latest" 2>/dev/null
    else
      wget -qO- "https://api.github.com/repos/${repo}/releases/latest" 2>/dev/null
    fi
  )" || body=""
  if [ -n "${body}" ]; then
    tag="$(
      printf '%s' "${body}" |
        grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' |
        head -n 1 |
        sed -E 's/.*"([^"]*)"$/\1/'
    )"
    if [ -n "${tag}" ]; then
      printf '%s' "${tag}"
      return 0
    fi
  fi

  have curl || return 1
  final="$(curl -fsSL --max-time 30 -o /dev/null -w '%{url_effective}' \
    "https://github.com/${repo}/releases/latest" 2>/dev/null)" || return 1
  case "${final}" in
    */releases/tag/*)
      tag="${final##*/releases/tag/}"
      # Reject anything that is not version-shaped, so a login/interstitial
      # redirect cannot become a bogus download URL.
      case "${tag}" in
        v[0-9]*.[0-9]* | [0-9]*.[0-9]*)
          printf '%s' "${tag}"
          return 0
          ;;
      esac
      ;;
  esac
  return 1
}

# Where user-scope binaries go. /usr/local/bin when writable (the cloud-image
# case: we are root), otherwise ~/.local/bin, which bootstrap puts on PATH.
bin_dir() {
  if [ -w /usr/local/bin ] 2>/dev/null || [ "$(id -u)" = "0" ]; then
    mkdir -p /usr/local/bin 2>/dev/null && printf '/usr/local/bin'
  else
    mkdir -p "${HOME}/.local/bin" 2>/dev/null && printf '%s/.local/bin' "${HOME}"
  fi
}

# Append a PATH entry to $CLAUDE_ENV_FILE so the AGENT SESSION inherits it.
# Claude Code on the web sources that file after the Setup script exits; Cursor
# and local runs simply have no such file and this is a no-op. Idempotent.
persist_path() {
  local dir="$1"
  [ -n "${CLAUDE_ENV_FILE:-}" ] || return 0
  [ -d "${dir}" ] || return 0
  grep -qsF "export PATH=${dir}:" "${CLAUDE_ENV_FILE}" 2>/dev/null && return 0
  # SC2016: the literal `$PATH` is intentional — it must expand when the agent
  # session sources this file, not now.
  # shellcheck disable=SC2016
  printf 'export PATH=%s:$PATH\n' "${dir}" >>"${CLAUDE_ENV_FILE}"
}
