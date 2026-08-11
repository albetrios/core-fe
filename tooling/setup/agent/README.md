# `tooling/setup/agent/` — cloud-agent bring-up

One command makes a fresh cloud session behave like a local checkout:

```bash
bash tooling/setup/agent/bootstrap.sh
```

Harness-agnostic by design. It runs the same on **Claude Code** (web, CLI,
desktop), **Cursor** cloud agents, **Codex**, CI, or a plain shell. The only
harness hook is `$CLAUDE_ENV_FILE` — written when the variable exists so the
session inherits the pinned Node on `PATH`, and a no-op everywhere else.

This mirrors `core-be`'s `tooling/setup/agent/` layout so both repos are brought
up the same way. Where they differ, the difference is the stack: core-be needs
Docker, Postgres, Redis, migrations and seed; core-fe needs Playwright browsers
and a dev server that serves the app shell.

## Files

| File                    | Role                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| `bootstrap.sh`          | Orchestrator — runs all 10 steps, logs progress, enforces the hard gates  |
| `lib.sh`                | Shared helpers (logging, arch detection, apt, download, PATH persistence) |
| `install-node.sh`       | Pinned Node from `.nvmrc` into `/opt/node<major>`                         |
| `install-apt-tools.sh`  | `jq`, `ripgrep`, `shellcheck`, `librsvg2-bin`, `xz-utils`                 |
| `install-gh.sh`         | GitHub CLI from the official `cli/cli` release                            |
| `install-gitleaks.sh`   | Secret scanner used by `.husky/pre-commit` and the CI gitleaks lane       |
| `install-headroom.sh`   | `uv`/`uvx` — the prerequisite for the `headroom` MCP server               |
| `install-playwright.sh` | E2E browsers; detects a pre-installed set instead of re-downloading       |
| `healthcheck.sh`        | Probes the dev server for the real app shell                              |

Each `install-*.sh` runs standalone as well as under `bootstrap.sh`.

## Steps and which ones can fail

| #   | Step                                    | Gate        |
| --- | --------------------------------------- | ----------- |
| 1   | Node runtime (pinned major) + corepack  | **hard**¹   |
| 2–5 | Distro tools, `gh`, gitleaks, `uv`      | best-effort |
| 6   | `pnpm install --frozen-lockfile`        | **hard**    |
| 7   | `.env.local` (`setup:local --only-env`) | **hard**    |
| 8–9 | MCP default pair, Playwright browsers   | best-effort |
| 10  | Dev server serves the app shell         | **hard**²   |

¹ The install itself is best-effort — a session Node of the right major is fine.
Missing Node entirely is fatal.
² Skippable with `AGENT_SKIP_HEALTHCHECK=1`.

Best-effort steps log `•` and continue: a locked-down network should not cost
you a whole session over an optional linter.

## Environment variables

| Variable                     | Effect                                                    |
| ---------------------------- | --------------------------------------------------------- |
| `KEEP_APP=1`                 | Leave `pnpm dev` running after the healthcheck            |
| `AGENT_SKIP_HEALTHCHECK=1`   | Skip step 10; no dev server is started                    |
| `AGENT_SKIP_PLAYWRIGHT=1`    | Skip browser provisioning                                 |
| `AGENT_SKIP_MCP_WARM=1`      | Install `uv` but skip the headroom pre-warm               |
| `AGENT_PLAYWRIGHT_BROWSERS`  | Browsers to install (default `chromium`)                  |
| `AGENT_PLAYWRIGHT_WITH_DEPS` | Also install browser OS deps (needs root)                 |
| `NODE_INSTALL_PREFIX`        | Parent dir for `node<major>` (default `/opt`)             |
| `GH_VERSION`                 | Pin the `gh` release instead of resolving latest          |
| `GITLEAKS_VERSION`           | Pin the gitleaks release instead of resolving latest      |
| `HEALTHCHECK_URL`            | Override the probe URL (default `http://127.0.0.1:5173/`) |

## Network allowlist

Cloud environments restrict egress. Each host maps to one capability, and a
blocked host degrades exactly one step:

| Host                                             | Needed for              | If blocked                   |
| ------------------------------------------------ | ----------------------- | ---------------------------- |
| `nodejs.org`                                     | Pinned Node download    | **Bring-up fails** on step 6 |
| `registry.npmjs.org`                             | `pnpm install`          | **Bring-up fails** on step 6 |
| `github.com` / `api.github.com`                  | `gh`, gitleaks releases | Those tools are skipped      |
| Distro apt mirrors                               | Step 2 packages         | Those tools are skipped      |
| `astral.sh` / `pypi.org`                         | `uv` + headroom         | headroom MCP unavailable     |
| `playwright.azureedge.net`, `cdn.playwright.dev` | E2E browsers            | E2E unavailable              |

Only the first two are required. In the Claude Code web UI: set Network access
to **Custom**, add the hosts you want, and keep "Also include default list of
common package managers" checked.

## Prerequisite parity with macOS

`tooling/dev/setup-prerequisites-mac-tools.manifest` is the source of truth for
what a developer's **Mac** installs via Homebrew (`pnpm setup:local` →
`tooling/dev/setup-mac-tools.sh`). This directory is the **Linux/cloud**
counterpart of that same list.

They are separate lists on purpose — brew formulae and apt packages do not map
one-to-one, and the cloud image already ships some tools. But that means adding
a prerequisite requires touching both:

1. Add the line to `setup-prerequisites-mac-tools.manifest` (macOS), and
2. Add it to `install-apt-tools.sh` — or a dedicated `install-<tool>.sh` when it
   is not an apt package — and surface it as a step in `bootstrap.sh`.

Two deliberate divergences from the Mac list:

- **Docker / colima** is not installed here. On a Mac it backs the SonarQube
  pre-push gate; in a cloud session that gate is skipped and the daemon is
  usually unavailable anyway.
- **codegraph** needs no installer: `@colbymchenry/codegraph` is a
  devDependency, so `pnpm exec codegraph` works after step 6. On core-be it is a
  standalone CLI and does have one.

## Relationship to the other setup entry points

| Entry point                             | Audience                     | What it does                                        |
| --------------------------------------- | ---------------------------- | --------------------------------------------------- |
| `pnpm setup:local`                      | Developer on macOS/Linux     | 5 phases, ends by starting `pnpm dev`               |
| `tooling/setup/agent/bootstrap.sh`      | Cloud agent session          | This directory — terminates, never leaves a server  |
| `agent-os/cloud-environment/install.sh` | Environment **Setup script** | Thin wrapper that calls `bootstrap.sh`              |
| `agent-os/hooks/session-start.sh`       | Every interactive session    | Fast path — switches Node, installs deps if missing |

A cached **Setup script** must terminate, which is why `bootstrap.sh` passes
`--only-env` to `setup:local` and stops the dev server it started for the
healthcheck.
