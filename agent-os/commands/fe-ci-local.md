---
description: Run the local PR gate (pnpm health) and summarize failures with fixes
argument-hint: (no arguments)
allowed-tools: Bash(pnpm health*), Bash(pnpm lint*), Bash(pnpm type-check*), Bash(pnpm validate*), Bash(pnpm test*), Bash(pnpm build*)
---

Run the local PR gate. core-fe has no `pnpm ci:local` — use **`pnpm health`**
(`tooling/validate/health-check.sh`), which mirrors the main pre-merge checks:
format, lint, biome, docs lint, type-check, tests, build, bundle size, env
example, public assets, TSDoc budget, and route-island structure.

If you need a lighter pass first, run `/fe-validate` (lint + type-check +
validate:structure + validate:tokens), then `pnpm health` for the full gate.

**PR CI lanes** (`.github/workflows/pr-ci.yml`) — the aggregate **`quality-gate`**
required check rolls up:

| Lane                  | Local equivalent                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biome                 | `pnpm biome:check`                                                                                                                                   |
| ESLint                | `pnpm lint`                                                                                                                                          |
| Knip                  | `pnpm knip`                                                                                                                                          |
| Prettier              | `pnpm format:check`                                                                                                                                  |
| TypeScript            | `pnpm type-check`                                                                                                                                    |
| Static sync           | `pnpm validate:structure`, `pnpm validate:env-example`, `pnpm validate:public`, `pnpm validate:tokens`, TSDoc budget, `pnpm agent-os:generate:check` |
| Unit + patch coverage | `pnpm test:unit`, `pnpm coverage:patch` (on changed lines)                                                                                           |
| Security tests        | `pnpm test:security`                                                                                                                                 |
| Build verify          | `pnpm build`, `pnpm build:check`, `pnpm size`, `pnpm sbom:generate`                                                                                  |
| Security audit        | `pnpm deps:audit`, `pnpm deps:audit:prod`                                                                                                            |
| E2E                   | Playwright via reusable workflow (when e2e paths change)                                                                                             |
| agent-os wiring       | `pnpm agent-os:check`, `pnpm agent-os:triggers:strict`, `pnpm agent-os:generate:check`                                                               |

For each failing step:

- Name the step and the root cause.
- Apply the minimal in-scope fix (run the matching skill from
  `agent-os/skills/fe-skill-registry/SKILL.md` if one applies — e.g. **fe-lint-guard**,
  **fe-code-structure**, **fe-test-generation**).
- Re-run.

Summarize what passed and anything still failing that needs a human decision.
