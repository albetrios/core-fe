#!/usr/bin/env bash
# Cached cloud-agent install for core-fe — idempotent; safe to run on every VM
# boot/update.
#
# This is a THIN WRAPPER. All bring-up logic lives in tooling/setup/agent/, which
# mirrors core-be's layout so both repos are provisioned the same way:
#
#   tooling/setup/agent/bootstrap.sh   orchestrator (10 steps)
#   tooling/setup/agent/install-*.sh   one prerequisite each
#
# Keeping the environment's Setup-script path stable while the logic lives under
# tooling/ means an environment configured with this path keeps working, and the
# same bring-up is runnable by hand or from any other agent harness.
#
# Usage (Cursor environment.json install field or dashboard Setup script):
#   bash agent-os/cloud-environment/install.sh
#
# Playwright browsers are provisioned best-effort and no service is left running
# — a browser-download failure or a missing backend never marks the environment
# as failed. See agent-os/cloud-environment/agents-cloud.md.
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repository_root}"

exec bash tooling/setup/agent/bootstrap.sh "$@"
