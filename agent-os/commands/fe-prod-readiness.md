---
description: Run the read-only production-readiness pipeline and aggregate one report
argument-hint: (no arguments — sweeps the current branch before release/deploy)
allowed-tools: Bash(git diff*), Bash(pnpm*)
---

Run the **`prod-readiness`** pipeline defined in
[`agent-os/agents/pipelines.json`](../agents/pipelines.json) as read-only agents
before a release/deploy, then aggregate one report. The pipeline (not this
prose) is the source of truth for the step list and handoffs — read it and run
each `steps[]` agent in order:

1. **fe-dependency-auditor** — `pnpm deps:audit` (+ `deps:audit:prod`), lockfile
   sync, license and bundle-impact of any new dependency; prioritized fix plan.
2. **fe-bundle-size-reviewer** — `pnpm build` + `pnpm size` against the size-limit
   budgets; code-splitting regressions and heavy first-paint static imports.
3. **fe-perf-auditor** — Chrome DevTools trace of the production preview
   (`pnpm build` + `pnpm preview`): LCP/CLS/TBT insights plus a throttled
   re-run; skips gracefully to static checks when the chrome-devtools MCP is
   unavailable.
4. **fe-production-hardening-reviewer** — client-security sweep against
   `docs/reference/security-model.md`: CSP header/meta parity, token-in-memory
   discipline, single refresh path, cross-tab logout, env allowlist.

Each finding names the procedural skill that fixes it (agent finds, skill
fixes), per the pipeline's `handoff` map:
`fe-dependency-auditor → fe-dependency-management`,
`fe-bundle-size-reviewer → fe-bundle-performance`,
`fe-perf-auditor → fe-bundle-performance`,
`fe-production-hardening-reviewer → fe-code-quality-security`. Produce a single
report grouped as satisfied items, blocking gaps, then optional improvements.
This is review-only: do not edit files.
