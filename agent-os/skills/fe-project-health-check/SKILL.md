---
name: fe-project-health-check
description: Full project health audit after major code changes. Verifies docs, creates missing tests, fixes lint/type/format errors, ensures build and bundle size pass, and reports a summary. Use when the user asks to "check everything", "verify the project", or after large changes.
---

# Project Health Check — Full Audit

Use this skill when the user asks to **run a full project health check**, **verify everything works**, **check the project after major changes**, or when a major code change (e.g. 10+ files) has been made and the project needs a complete audit.

**CLI counterpart:** Anyone can run `pnpm health` (report only) or `pnpm health:fix` (auto-fix format + lint, then check) from the project root. The skill does everything the script does **plus** doc link verification, missing test detection/creation, and fixing issues.

---

## When to Invoke

- User says: "run health check", "check everything", "verify the project", "make sure everything works", "full project health check"
- After a major code change involving many files and the user wants a full audit
- Before release or when bringing the repo back to a clean state

---

## Prerequisites

- Read **fe-documentation-maintenance** (`agent-os/skills/fe-documentation-maintenance/SKILL.md`) for doc structure and cross-references
- Read **fe-lint-guard** (`agent-os/skills/fe-lint-guard/SKILL.md`) for fix patterns (ESLint, TypeScript)
- Read **fe-test-generation** (`agent-os/skills/fe-test-generation/SKILL.md`) for test templates and data-testid conventions
- Run all commands from the **project root**

---

## Phase 1 — Documentation Integrity

**Goal:** All internal doc links resolve; docs match code.

1. **Fix broken links**
   - In `CONTRIBUTING.md`: ensure links to requirement format and sample use `docs/getting-started/requirement-format.md` and `docs/getting-started/requirements/sample-requirement.md`.
   - In `README.md`, `CLAUDE.md`, `docs/README.md`: verify every internal link points to an existing file.

2. **Cross-check key docs**
   - **`docs/reference/routes-and-ui.md`**: List all routes from `src/app/routes/routeTree.tsx` and all `route.tsx` under `src/pages/`. Add missing routes, remove stale ones.
   - **`docs/reference/tools-and-usage.md`**: List every dependency in `package.json` (dependencies + devDependencies). Add missing packages, remove ones no longer installed.
   - **`tests/README.md`**: Ensure documented test commands match `package.json` scripts and the actual `tests/` directory layout.
   - **`docs/getting-started/setup-detailed.md`**: Ensure platform-specific setup steps reference scripts/commands that exist in `package.json` or `Makefile`.

3. **Skill file paths**
   - Under `agent-os/skills/`, ensure any file paths or command references in SKILL.md files point to files that exist.

**Acceptance:** No broken internal links; routes and tools docs match the codebase.

---

## Phase 2 — Missing Tests

**Goal:** Every non-exception source file has a colocated test file per project conventions.

**Exceptions (no test required):** `types.ts`, `contracts.ts`, `constants.ts`, `route.tsx`, `index.ts`, `branded.ts`, `vite-env.d.ts`, `main.tsx`, `sw.ts`, and all files under `src/shared/components/ui/` (shadcn primitives).

1. **Scan for gaps**
   - List all `.ts` and `.tsx` under `src/` (excluding exceptions above).
   - For each, check if a colocated `*.test.ts` or `*.test.tsx` exists.
   - Produce a list of files that **need** tests (priority: core services → shared hooks/layouts/components → page components/hooks → app layer → lib).

2. **Create missing tests**
   - Use **fe-test-generation** skill templates (component, form, page, store, service, utility, hook).
   - Use `renderWithProviders` from `@/tests/utils/renderWithProviders.tsx` for component tests.
   - Unit tests stub HTTP with `vi.mock()` + `vi.fn()` on `apiClient` or fetchers — no server.
   - Every component/form/page test MUST include: `expect(await axe(container)).toHaveNoViolations()`.
   - Use `data-testid` selectors; verify testids exist in the source component.
   - Use `import type` for type-only imports; include `.ts`/`.tsx` in imports; use `@/` alias.

3. **Verify**
   - Run `pnpm test` after adding tests; fix any failures.

**Acceptance:** Every non-exception source file has a colocated test; `pnpm test` passes.

---

## Phase 3 — Static Analysis

**Goal:** Zero errors from lint, type-check, and format.

1. Run `pnpm lint` — fix all ESLint errors (use `pnpm lint:fix` first, then fix remaining manually).
2. Run `pnpm type-check` — fix all TypeScript errors (strict mode; no `any`; use `unknown` and type guards).
3. Run `pnpm format:check` — fix formatting (run `pnpm format` then re-check).

Use **fe-lint-guard** skill for common fix patterns: nested ternaries, React purity, import order, type imports, unused imports, etc.

**Acceptance:** `pnpm lint` = 0 errors, `pnpm type-check` = 0 errors, `pnpm format:check` = 0 issues.

---

## Phase 4 — Build

**Goal:** Production build succeeds; bundle within limits.

1. Run `pnpm build` — must complete with exit code 0. Fix any build errors or warnings.
2. Run `pnpm size` — verify bundle stays within limits (see `.size-limit.json`: JS and CSS gzipped limits).
3. If over limits: optimize (lazy imports, tree-shaking, chunk splitting) until within budget.

**Acceptance:** `pnpm build` exits 0 with no warnings; `pnpm size` passes.

---

## Phase 5 — Tests

**Goal:** All tests pass; coverage meets thresholds.

1. Run `pnpm test` — all unit/integration tests must pass.
2. Run `pnpm test:coverage` — verify coverage meets 80% for branches, functions, lines, statements (see `vitest.config.ts`).
3. If any metric is below 80%, add or strengthen tests in the lowest-coverage files until thresholds are met.

**Acceptance:** `pnpm test` = 0 failures; `pnpm test:coverage` = all thresholds ≥ 80%.

---

## Phase 6 — Validation Scripts

**Goal:** Env and public-asset validation pass.

1. Run `pnpm validate:env-example` — `.env.example` must document all schema keys (`pnpm tool:sync-env-example`).
2. Run `pnpm validate:public` — required public assets (manifest, robots.txt, etc.) must exist.

Fix any failures (add missing vars to `.env.example`, add missing assets to `public/`).

**Acceptance:** Both commands exit 0.

---

## Phase 7 — Summary

Output a summary table for the user:

| Check                       | Status      | Notes                                       |
| --------------------------- | ----------- | ------------------------------------------- |
| Doc links valid             | PASS / FAIL |                                             |
| Missing tests created       | X of Y      |                                             |
| `pnpm lint`                 | PASS / FAIL |                                             |
| `pnpm type-check`           | PASS / FAIL |                                             |
| `pnpm format:check`         | PASS / FAIL |                                             |
| `pnpm build`                | PASS / FAIL |                                             |
| `pnpm size`                 | PASS / FAIL | JS: X kB, CSS: X kB                         |
| `pnpm test`                 | PASS / FAIL | X tests, Y suites                           |
| `pnpm test:coverage`        | PASS / FAIL | branches / functions / lines / statements % |
| `pnpm validate:env-example` | PASS / FAIL |                                             |
| `pnpm validate:public`      | PASS / FAIL |                                             |

If **any** check fails, fix it and re-run until all pass. Do not report "done" until every row is PASS.

---

## Rules

- Complete all phases in order. Do not skip phases.
- Do not ask the user for confirmation between phases — fix issues and continue.
- When in doubt, follow **fe-lint-guard** for code fixes and **fe-test-generation** for test structure.
- The **CLI** (`pnpm health`) does not create tests or fix docs; it only runs the same commands and reports. The **skill** is the full audit that also fixes.

---

## Related Skills

| Skill                          | When used in health check                              |
| ------------------------------ | ------------------------------------------------------ |
| **fe-documentation-maintenance**  | Phase 1 — doc structure, cross-references              |
| **fe-lint-guard**                 | Phase 3 — ESLint/TypeScript fix patterns               |
| **fe-test-generation**            | Phase 2 — test templates, data-testid, axe             |
| **fe-code-smells-best-practices** | Optional — apply to any files you modify in Phases 2–4 |

---

## Quick Reference: Commands Run

```bash
pnpm format:check          # Phase 3
pnpm lint                  # Phase 3
pnpm type-check            # Phase 3
pnpm test                  # Phase 5
pnpm test:coverage         # Phase 5
pnpm build                 # Phase 4
pnpm size                  # Phase 4
pnpm validate:env-example  # Phase 6
pnpm validate:public       # Phase 6
pnpm validate             # lint + type-check + test (subset)
pnpm health               # CLI: run all checks (script)
pnpm health:fix           # CLI: fix format + lint, then run all checks
```
