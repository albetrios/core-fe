# AGENTS.md

Secondary entry point for AI coding agents (Codex CLI, Claude Code, etc.). For the full project conventions, read **[CLAUDE.md](CLAUDE.md)** first — it is the single source of truth.

## Agent OS layout

All agent configuration lives under **`agent-os/`** — the single source of truth. Cursor, Claude Code, and Codex read it through symlinks in `.cursor/`, `.claude/`, and `.codex/`. Edit files in `agent-os/` only; never duplicate skills, rules, hooks, or MCP config in tool directories.

Personal / machine-local overrides stay in gitignored files beside the symlinks (e.g. `.claude/settings.local.json`, `agent-os/mcp/mcp.json`).

```text
agent-os/
├── agents/        # Agent definitions (Cursor agents, Claude subagents)
├── skills/        # Project + installed skills (SKILL.md per directory)
├── rules/         # Always-applied rules (Cursor glob auto-attach)
├── hooks/         # Hook scripts + hooks.json manifest (single source)
├── mcp/
│   ├── mcp.example.json   # Template — tracked (mirror of root .mcp.example.json)
│   ├── mcp.default.json   # Mirror of root .mcp.default.json (default pair + Codex TOML source)
│   └── mcp.json           # Machine-local live config — gitignored
├── platforms/     # Per-agent derived wiring (generated from hooks.json)
│   ├── targets.json       # Capability registry (Cursor / Claude / Codex)
│   ├── claude/            # settings.json (hooks + shared permissions), launch.json
│   ├── cursor/            # hooks.json
│   └── codex/             # hooks.json, config.toml
├── docs/          # Agent-facing docs
└── skills-lock.json       # Provenance for vendored skills
```

Regenerate derived platform files after editing `agent-os/hooks/hooks.json`:

```bash
pnpm agent-os:generate        # write
pnpm agent-os:generate:check  # drift gate (CI / pre-commit)
```

## Tool wiring

| Tool            | Entrypoint symlinks → `agent-os/`                                                                                   | Personal (gitignored)          |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Cursor**      | `.cursor/{agents,skills,rules,mcp.json,mcp.example.json}` → shared dirs; `.cursor/hooks.json` → `platforms/cursor/` | —                              |
| **Claude Code** | `.claude/{agents,skills,hooks}` → shared dirs; `.claude/settings.json`, `launch.json` → `platforms/claude/`         | `.claude/settings.local.json`  |
| **Codex**       | `.codex/{hooks.json,config.toml}` → `platforms/codex/`; reads `AGENTS.md` + skills via discovery                    | `~/.codex/config.toml` sandbox |
| **MCP (root)**  | `.mcp.json` → `agent-os/mcp/mcp.json`                                                                               | `agent-os/mcp/mcp.json`        |

There is intentionally **no** `.claude/rules` symlink — Claude Code follows `CLAUDE.md`; `.mdc` rules are Cursor's glob auto-attach (`.cursor/rules` → `agent-os/rules`).

## Where to start

- **Project conventions:** [CLAUDE.md](CLAUDE.md)
- **Agent-os naming:** items this repo owns start with `fe-`; see [CLAUDE.md → Agent-os naming](CLAUDE.md#agent-os-naming)
- **Skill router (what skill for what task):** [agent-os/rules/fe-skill-router.mdc](agent-os/rules/fe-skill-router.mdc)
- **Skill registry (catalog):** [agent-os/skills/fe-skill-registry/SKILL.md](agent-os/skills/fe-skill-registry/SKILL.md)
- **Engineering principles:** [agent-os/rules/fe-engineering-principles.mdc](agent-os/rules/fe-engineering-principles.mdc)
- **MCP setup:** [agent-os/docs/cursor-mcp-setup.md](agent-os/docs/cursor-mcp-setup.md)
- **Platform wiring:** [agent-os/docs/platform-access.md](agent-os/docs/platform-access.md)

## Cloud agent sessions

On **Cursor Cloud Agents** or **Claude Code on the web**, read
**[agent-os/cloud-environment/agents-cloud.md](agent-os/cloud-environment/agents-cloud.md)**
before browser/e2e or live-backend work. Cached install + Cursor `environment.json`
live in **[agent-os/cloud-environment/](agent-os/cloud-environment/)** (symlinked at
[`.cursor/environment.json`](.cursor/environment.json)). core-fe is a Vite SPA — lint,
type-check, unit tests, `pnpm agent-os:check`, and `pnpm build` run **cold** after
`install.sh`; only Playwright e2e needs browsers plus core-be on `:3000`. **MCPs, skills,
and subagents** for cloud sessions:
**[agent-os/cloud-environment/skills-and-mcps.md](agent-os/cloud-environment/skills-and-mcps.md)**.

## Adding a new agent skill or rule

1. Place the file directly in `agent-os/skills/<name>/SKILL.md` or `agent-os/rules/<name>.mdc`.
2. Wire it into [agent-os/rules/fe-skill-router.mdc](agent-os/rules/fe-skill-router.mdc) and [agent-os/skills/fe-skill-registry/SKILL.md](agent-os/skills/fe-skill-registry/SKILL.md).
3. All three tools (Cursor, Claude, Codex) pick it up automatically via their symlinks — no per-tool duplication.

## Adding a new AI coding agent

Add a row to [agent-os/platforms/targets.json](agent-os/platforms/targets.json), extend `agent-os/hooks/hooks.json` with compatible hook entries, add a recipe under `agent-os/platforms/<agent>/` if needed, and extend [tooling/agent-os/generate.ts](tooling/agent-os/generate.ts). Symlink the new tool's entrypoint directory into `agent-os/platforms/`.
