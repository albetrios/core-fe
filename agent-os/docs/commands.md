# agent-os/commands — cross-platform custom commands

Reusable, project-scoped slash commands shared by all three AI tools. This
directory is the **single source of truth**; each tool reads it through a symlink
(the same pattern as `agent-os/agents` and `agent-os/skills`).

## How each tool picks them up

| Tool            | Path                | Wiring                                       | Invoke                                |
| --------------- | ------------------- | -------------------------------------------- | ------------------------------------- |
| **Claude Code** | `.claude/commands/` | symlink → `../agent-os/commands` (committed) | `/fe-validate`, `/fe-build-requirement ...` |
| **Cursor**      | `.cursor/commands/` | symlink → `../agent-os/commands` (committed) | type `/` in chat (Cursor ≥ 1.6)       |
| **Codex**       | `~/.codex/prompts/` | user-global — see setup below                | `/<name>` in the TUI                  |

> Cursor ignores the YAML frontmatter and uses the markdown body as the prompt;
> Claude Code and Codex read `description` / `argument-hint` and expand
> `$ARGUMENTS`.

### Codex setup (one-time, per machine)

Codex loads prompts from `~/.codex/prompts/*.md` (user-global, not committable).
To use these with Codex, symlink each file into your prompts dir:

```bash
mkdir -p ~/.codex/prompts
for f in "$PWD"/agent-os/commands/*.md; do ln -sf "$f" ~/.codex/prompts/; done
```

## Commands

Granular procedures live in **skills** (invoked by name); these commands are **workflows** that orchestrate them. Names are collision-checked against skills (`pnpm agent-os:check`).

**Core gates**

| Command        | Purpose                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/fe-validate`    | Run `pnpm lint`, `pnpm type-check`, `pnpm validate:structure`, `pnpm validate:tokens`, `pnpm validate:testids`, `pnpm validate:theme-axis`; fix introduced issues. |
| `/fe-ci-local`    | Run `pnpm health` (local PR gate) and map failures to `.github/workflows/pr-ci.yml` lanes.                                                                         |
| `/fe-routes-sync` | Re-sync `routeTree.tsx`, RBAC, and `docs/reference/routes-and-ui.md` after route changes.                                                                          |

**Autonomous build**

| Command              | Purpose                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/fe-build-requirement` | Draft FE requirement → full production-ready slice (route island → tests → lint → docs) + reports bundle. Orchestrates **fe-auto-implement**. |

**Review**

| Command             | Purpose                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/fe-pre-merge-review` | Read-only pipeline (steps from `agent-os/agents/pipelines.json`: verifier → fe-docs-auditor); one aggregated report.                |
| `/fe-prod-readiness`   | Read-only production-readiness sweep (fe-dependency-auditor → fe-bundle-size-reviewer → fe-perf-auditor → fe-production-hardening-reviewer). |

**PR lifecycle**

| Command            | Purpose                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/fe-open-pr [title]` | Push the branch + open a PR to **`main`** (explicit PR opt-in).                                                                                                                       |
| `/fe-watch-pr <n>`    | Triage CI + review comments until both required contexts — **`Quality gate`** + **`Checks`** — are green.                                                                             |
| `/fe-merge-pr <n>`    | Squash-merge once CI is green.                                                                                                                                                        |
| `/fe-ship [title]`    | Full flow: open-pr → watch-pr → merge-pr.                                                                                                                                             |
| _Release_          | Trunk-based (single `main`): merge the standing release-please **Release PR** to ship → tag + prod deploy. See [trunk-based-workflow.md](../../docs/process/trunk-based-workflow.md). |

**Maintenance**

| Command          | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `/fe-agent-os-sync` | Regenerate platform adapters + run agent-os gates; fix drift. |

**Backend-only (stub)**

| Command            | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `/fe-worker-complete` | Stub — points to core-be; no worker runtime in core-fe. |

## Not imported from core-be

These core-be commands are **backend-specific** and intentionally omitted:

| core-be command    | Reason                         |
| ------------------ | ------------------------------ |
| `/new-domain`      | Drizzle domain scaffold — N/A  |
| `/schema-complete` | Schema → migration → RLS chain |
| `/route-complete`  | OpenAPI route catalog chain    |

## Related: SessionStart + guardrails

The session-start and guardrail follow-up is implemented — see
[`agent-os/hooks/README.md`](../hooks/README.md):

- **SessionStart** (`agent-os/hooks/session-start.sh`) — verifies Node/deps, installs if needed, prints the skill-trigger map.
- **Guardrails** — block destructive shell + secret writes; warn on protected paths
  and cross-layer imports. Claude: `PreToolUse`; Cursor: `beforeShellExecution`
  - advisory rules; Codex: AGENTS.md policy + sandbox/approvals.

## Related docs

- Requirement format: [`docs/getting-started/requirement-format.md`](../../docs/getting-started/requirement-format.md)
- Auto-implement pipeline: [`agent-os/skills/fe-auto-implement/SKILL.md`](../skills/fe-auto-implement/SKILL.md)
- Route islands: [`agent-os/skills/fe-route-island/SKILL.md`](../skills/fe-route-island/SKILL.md)
- PR CI lanes: [`.github/workflows/pr-ci.yml`](../../.github/workflows/pr-ci.yml)
- Deploy / release: [`docs/deployment/cicd-and-netlify.md`](../../docs/deployment/cicd-and-netlify.md)
