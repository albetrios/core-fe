# agent-os evals (core-fe)

Two-tier integrity gates for the shared `agent-os/` bundle.

| Tier              | Script            | Gates CI?                             |
| ----------------- | ----------------- | ------------------------------------- |
| **1 — integrity** | `check.ts`        | Yes — `pnpm agent-os:check`           |
| **2 — routing**   | `trigger-eval.ts` | Yes — `pnpm agent-os:triggers:strict` |

Also run `pnpm agent-os:generate:check` after editing `hooks/hooks.json`.

## Tier 1 checks (`check.ts`)

Deterministic, zero-token structural invariants. Each fails the gate on drift:

- **Skill frontmatter & names** — every `skills/<x>/SKILL.md` has `name` + `description`.
- **Skill-registry ↔ disk** — `**Path:**` links resolve; every skill is catalogued (error); the `## Skill Inventory (N skills)` count matches disk.
- **Vendored skill hashes** — recompute the sha256 of every `skills-lock.json` entry; fail on mismatch.
- **Agent frontmatter / read-only** — `name`/`description`; a `readonly: true` agent must declare a `tools` allowlist that excludes every write tool.
- **Agent catalog ↔ disk** — the `## Catalog (N agents)` count matches disk and every agent file is catalogued.
- **Skill groups / chains** — `groups.json` places every skill in exactly one group; `chains.json` steps resolve to real skills.
- **Agent pipelines** — `pipelines.json` steps resolve to agents, handoffs to skills.
- **Command names unique** — no command collides with a skill or another command.
- **Backbone manifests** — `hooks.json` scripts exist; `targets.json` well-formed; referenced `src/…`/`agent-os/…` paths in docs/rules/skills exist.

`generate.ts` (`agent-os:generate:check`) additionally asserts hookEvent coverage between `targets.json` and `hooks.json` and that the derived `.claude/.cursor/.codex` configs are in sync.

```bash
pnpm agent-os:check              # Tier 1 gate
pnpm agent-os:check:report       # Tier 1 verbose
pnpm agent-os:triggers           # Tier 2 report
pnpm agent-os:triggers:strict    # Tier 2 gate
pnpm agent-os:generate:check     # Platform wiring drift
```

Sync workflow: `agent-os/commands/fe-agent-os-sync.md`.
