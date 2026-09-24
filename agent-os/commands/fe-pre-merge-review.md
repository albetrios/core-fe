---
description: Run the read-only pre-merge review pipeline and aggregate one report
argument-hint: (no arguments — reviews the current diff)
allowed-tools: Bash(git diff*), Bash(pnpm*)
---

Run the **`pre-merge-review`** pipeline defined in
[`agent-os/agents/pipelines.json`](../agents/pipelines.json) as read-only
agents over the current diff, then aggregate one report. The pipeline (not this
prose) is the source of truth for the step list and handoffs — read it and run
each `steps[]` agent in order:

1. **fe-verifier** — run `/fe-validate` + relevant tests (`pnpm test`; add
   `pnpm test:security` if auth/CSP/token code changed); confirm the change
   actually works, not just that it compiles.
2. **fe-docs-auditor** — audit touched docs for index completeness, naming,
   Mermaid, and cross-links.

Each finding names the procedural skill that fixes it (agent finds, skill
fixes), per the pipeline's `handoff` map: `verifier → fe-test-generation`,
`fe-docs-auditor → fe-documentation-maintenance`. Skill lenses that are not agents
(`fe-code-smells-best-practices`, `web-design-guidelines`, `fe-lint-guard`) still
apply via their own file-pattern routing in `agent-os/docs/skill-triggers.md`. Produce a
single prioritized report — blocking gaps first, then optional improvements.
This is review-only: do not edit files.
