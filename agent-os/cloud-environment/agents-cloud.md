# Cloud agent instructions (core-fe)

Read this on **remote / cloud** sessions (Cursor Cloud Agents, Claude Code on
the web) before tasks that need a browser or a live backend.

Canonical config: [`agent-os/cloud-environment/`](./) (`install.sh`,
`environment.json`). **Skills, MCPs, subagents:**
[`skills-and-mcps.md`](skills-and-mcps.md).

core-fe is a Vite SPA — there is **no** Postgres, Redis, Docker, or worker to
bring up. The cached `install.sh` gives you everything the static and unit lanes
need; only end-to-end browser tests need extra bring-up.

## When to run bring-up

| Task needs                                                                        | Run bring-up?                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Lint, `type-check`, unit tests (`pnpm test`), `pnpm agent-os:check`, `pnpm build` | No — runs cold after `install.sh`                     |
| Playwright e2e (`pnpm test:e2e`)                                                  | Yes — install browsers **and** run core-be on `:3000` |
| `pnpm dev` preview against a real backend                                         | Yes — needs core-be on `:3000`                        |

Everything in the "No" row runs on schema defaults: in `test` mode Vite loads no
env files, so the suite is hermetic on a fresh checkout.

## What `install.sh` does (cached, idempotent)

1. [`install-node.sh`](./install-node.sh) — downloads the pinned Node (`.nvmrc`,
   major 24) into `/opt/node24`, then activates it on `PATH` and persists that
   for the session via `$CLAUDE_ENV_FILE`. It does **not** probe for a version
   manager: cloud images ship Node 20/21/22 and no working one (`fnm` absent,
   the `nvm` shell function reports `N/A` with no `~/.nvm` tree), so probing
   silently leaves Node 22 in place and step 2 then hard-fails on
   `engine-strict`. `.nvmrc` pins `24.19` (a major.minor), so the exact patch
   release is resolved from `nodejs.org/dist/index.json` at install time rather
   than hardcoded — that keeps the pin authoritative.
2. `corepack enable` + `pnpm install --frozen-lockfile`.
3. `pnpm mcp:setup:default` — writes the default MCP pair (codegraph + headroom)
   to `.mcp.json`.
4. `pnpm setup:local --only-env` — scaffolds `.env.local` (schema defaults; no
   secrets). The `--only-env` flag is required: a bare `pnpm setup:local` runs
   through to phase 5/5 and spawns a long-lived `pnpm dev`, which would hang
   this script.

It does **not** download Playwright browsers or start any service — a heavy
browser download or a missing backend must not fail the whole environment.

## On-demand: Playwright e2e

E2E is local/backend-coupled — CI never boots core-be, and neither does the
cached install. When a task needs it:

```bash
pnpm exec playwright install --with-deps chromium   # browsers + OS deps
# start core-be on :3000 in a sibling checkout, then:
pnpm test:e2e
```

`tests/e2e/global-setup.ts` fails fast if core-be is not reachable on `:3000`.

## MCP default pair

`install.sh` scaffolds `codegraph` and `headroom` into
[`.mcp.json`](../../.mcp.json) via `pnpm mcp:setup:default` (same as local
`pnpm setup:local`). If MCP tools are missing in a session, confirm the platform
MCP settings match [`.mcp.default.json`](../../.mcp.default.json) and start a
fresh session. On-demand servers: `pnpm mcp:setup <name>`.

## Network allowlist (cloud)

Minimum Custom allowlist entries beyond defaults:

- `nodejs.org` — **required**; `install-node.sh` resolves and downloads the Node
  tarball from `nodejs.org/dist`. It is not in the default Trusted list, so
  without it the install is blocked and every later step fails on the wrong
  Node major.
- `registry.npmjs.org` — `pnpm install`.
- `playwright.azureedge.net` (and `cdn.playwright.dev`) — only when installing
  Playwright browsers on demand.
