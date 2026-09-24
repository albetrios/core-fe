# `agent-os/agents/`

Agent definitions shared across Cursor and Claude Code via the `.cursor/agents/` and `.claude/agents/` symlinks.

## When to put a file here

- A **Cursor agent** definition (custom agent with tools/system prompt) that should also be available to Claude Code subagents.
- A **Claude Code subagent** definition (Markdown with frontmatter: `name`, `description`, optional `tools`) that should also be visible to Cursor.

Both tools read the same files via their respective symlinks — author once, both pick it up.

## File shape

```
agent-os/agents/fe-<agent-name>.md
```

```markdown
---
name: fe-<agent-name>
description: One-sentence description of when to invoke this agent. Used by the orchestrator to route tasks.
tools: # optional — defaults to all
  - Read
  - Grep
  - Bash
---

# <Agent Name>

System prompt and behavior guidance for the agent.

## When to invoke

...

## Tool budget / constraints

...
```

## Discovery

- **Cursor**: reads from `.cursor/agents/` (symlink → `agent-os/agents/`)
- **Claude Code**: reads from `.claude/agents/` (symlink → `agent-os/agents/`) — agents appear as `subagent_type` options for the `Agent` tool

## Adding a new agent

1. Drop the file here as `fe-<agent-name>.md`, with frontmatter `name: fe-<agent-name>`. Every agent this repo owns starts with `fe-`; `pnpm agent-os:check` enforces it.
2. Wire it into [`agent-os/rules/fe-skill-router.mdc`](../rules/fe-skill-router.mdc) if it's part of a task pipeline.
3. Add a row to [`agent-os/docs/agents-catalog.md`](../docs/agents-catalog.md) and bump its `## Catalog (N agents)` count — `pnpm agent-os:check` fails on a missing row or a stale count.
4. Both Cursor and Claude pick it up automatically — no per-tool duplication.

## Related

- Skills (instructions for tasks, not autonomous agents): [`agent-os/skills/`](../skills/)
- Rules (always-applied conventions): [`agent-os/rules/`](../rules/)
