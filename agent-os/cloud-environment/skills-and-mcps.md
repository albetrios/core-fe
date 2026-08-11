# Cloud sessions — skills, MCPs, and subagents (core-fe)

What a remote/cloud session uses. Local human setup stays in
[docs/getting-started/setup.md](../../docs/getting-started/setup.md); on-demand
stack notes are in [`agents-cloud.md`](agents-cloud.md).

## MCP servers

`install.sh` installs the **default pair** and scaffolds
[`.mcp.json`](../../.mcp.json) via `pnpm mcp:setup:default`:

| Server      | Command                           | Notes                               |
| ----------- | --------------------------------- | ----------------------------------- |
| `codegraph` | `pnpm exec codegraph serve --mcp` | Code intelligence (devDependency)   |
| `headroom`  | `pnpm exec headroom mcp serve`    | Context compression (devDependency) |

On-demand servers (`chrome-devtools`, `context7`, `core-be-api`, `semgrep`,
`shadcn`, `sonarqube`, `tailwindcss`): `pnpm mcp:setup <name>`. `chrome-devtools`
reuses the Playwright Chromium (install once with
`pnpm exec playwright install --with-deps chromium`; the launcher
`tooling/dev/chrome-devtools-mcp.mjs` runs it headless and errors with that hint
if the browser is missing). Full template:
[`.mcp.example.json`](../../.mcp.example.json), mirrored at
[`agent-os/mcp/mcp.example.json`](../mcp/mcp.example.json) (drift-tested by
`tests/ci/mcp-config.policy.test.ts`).

## Skills

The full project skill catalog (49 skills, grouped in
[`agent-os/skills/groups.json`](../skills/groups.json)) starts at the
[skill registry](../skills/skill-registry/SKILL.md). Chains that sequence them
live in [`agent-os/skills/chains.json`](../skills/chains.json). Routing by file
pattern: [`agent-os/docs/skill-triggers.md`](../docs/skill-triggers.md).

## Subagents

Read-only reviewer agents (Cursor + Claude, via the `.cursor/agents/` and
`.claude/agents/` symlinks) are catalogued in
[`agent-os/docs/agents-catalog.md`](../docs/agents-catalog.md); review pipelines
(`pre-merge-review`, `prod-readiness`) are declared in
[`agent-os/agents/pipelines.json`](../agents/pipelines.json). All are read-only —
they investigate and report; the parent applies fixes.
