#!/usr/bin/env bash
# Verify the core-fe dev server actually serves the app shell.
#
# This is the frontend counterpart to core-be's /livez + /readyz probe. A
# frontend has no health endpoint, so the equivalent proof that "this session
# matches local" is: Vite boots, and GET / returns the HTML shell containing the
# React mount point and the module entry that Vite rewrites at request time.
#
# Checking for BOTH `id="root"` and the /src/main.tsx module script matters —
# a proxy error page or a plain 200 from something else on the port would pass a
# naive status-code check. Vite rewriting the entry is what proves it is Vite.
#
# Assumes a dev server is already starting (bootstrap.sh backgrounds `pnpm dev`
# before calling this). Polls until ready or the deadline passes.
#
# Usage:  bash tooling/setup/agent/healthcheck.sh
# Env:    HEALTHCHECK_URL      (default http://127.0.0.1:5173/)
#         HEALTHCHECK_TIMEOUT  seconds (default 90)
#         HEALTHCHECK_INTERVAL seconds between polls (default 2)
#
# Exit 0 = healthy. Non-zero = not healthy (caller decides what that means).
set -uo pipefail
LOG_TAG="healthcheck"
# shellcheck source=tooling/setup/agent/lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# vite.config.ts sets port 5173 with strictPort:false — Vite walks to the next
# free port if 5173 is taken, so allow the URL to be overridden.
url="${HEALTHCHECK_URL:-http://127.0.0.1:5173/}"
timeout="${HEALTHCHECK_TIMEOUT:-90}"
interval="${HEALTHCHECK_INTERVAL:-2}"

have curl || {
  log "curl is not available — cannot probe ${url}"
  exit 1
}

log "probing ${url} (timeout ${timeout}s)"

deadline=$((SECONDS + timeout))
last_status="no response"
attempt=0

while [ "${SECONDS}" -lt "${deadline}" ]; do
  attempt=$((attempt + 1))
  body="$(curl -fsS --max-time 5 "${url}" 2>/dev/null)" && {
    if printf '%s' "${body}" | grep -q 'id="root"' &&
      printf '%s' "${body}" | grep -q '/src/main.tsx'; then
      log "healthy after ${attempt} attempt(s) — app shell served at ${url}"
      exit 0
    fi
    last_status="200 but the response is not the core-fe app shell"
  }
  sleep "${interval}"
done

log "NOT healthy after ${timeout}s (${attempt} attempts) — last: ${last_status}"
log "hint: run \`pnpm dev\` manually and check the output; the port may differ (strictPort is false)."
exit 1
