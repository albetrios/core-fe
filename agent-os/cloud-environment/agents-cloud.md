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

1. [`install-node.sh`](install-node.sh) installs the pinned Node: it resolves the
   `.nvmrc` pin to an exact `x.y.z` against the official release index,
   downloads the tarball, verifies its SHA-256 against `SHASUMS256.txt` **before**
   unpacking, and lays it down at `/opt/node24` — the same layout
   [`agent-os/hooks/session-start.sh`](../hooks/session-start.sh) searches.
   `install.sh` then puts it on `PATH` and persists that via `$CLAUDE_ENV_FILE`
   so the rest of the session inherits it.

   It deliberately does **not** probe for a version manager. On these images fnm
   is absent and nvm is a shell function with no `~/.nvm` tree behind it, so both
   probes fall through to the image's Node 22 — and `engines.node` is `>=24.15`
   with `engine-strict=true`, so `pnpm install --frozen-lockfile` then hard-fails
   ("Expected version: >=24.15, Got: v22.22.2") and the session ends up with no
   `node_modules` at all.

2. `corepack enable` + `pnpm install --frozen-lockfile`.
3. `pnpm mcp:setup:default` — writes the default MCP pair (codegraph + headroom)
   to `.mcp.json`.
4. `pnpm setup:local --only-env` — scaffolds `.env.local` (schema defaults; no
   secrets). The flag is **required**: without it the script runs to phase 5/5 and
   spawns `pnpm dev`, a long-lived server that hangs a Setup script which must
   terminate.

> **`.nvmrc` pins `major.minor` (`24.19`), not a bare major — keep the dot.**
> `tr -dc '0-9'` collapses it to `2419`, which sends any `/opt/node<major>`
> lookup to a path that can never exist. Both `install.sh` and
> `session-start.sh` parse it as `tr -dc '0-9.' | cut -d. -f1`.

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

- `nodejs.org` — **required**: `install-node.sh` fetches the release index
  (`/dist/index.tab`), the tarball, and `SHASUMS256.txt` from this one host.
- `registry.npmjs.org` — `pnpm install`.
- `playwright.azureedge.net` (and `cdn.playwright.dev`) — only when installing
  Playwright browsers on demand.
