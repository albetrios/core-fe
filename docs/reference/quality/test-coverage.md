# Test coverage (core-fe)

How coverage is measured, gated, and ratcheted in this repo. For the **full test
matrix** see [`docs/reference/testing.md`](../testing.md); for layout and naming
rules see [`tests/README.md`](../../../tests/README.md) and
[`agent-os/rules/testing-requirements.mdc`](../../../agent-os/rules/testing-requirements.mdc).

## Runners

| Tool       | Scope                                                         |
| ---------- | ------------------------------------------------------------- |
| Vitest     | Unit/component — colocated `src/**/*.test.{ts,tsx}`           |
| Playwright | E2E — `tests/e2e/*.e2e.test.ts` (requires core-be on `:3000`) |
| Stryker    | Mutation testing (CI-only, scheduled)                         |

Vitest runs two projects: **`unit`** (colocated `src` suites) and **`security`**
(`tests/security` — token storage, redirect safety, header tripwires). Coverage is collected by the `unit` project; the Vite config's React
Compiler is deliberately **off** under coverage so it measures source branches,
not synthetic memo-cache checks.

## Commands

```bash
pnpm test              # vitest run (all projects)
pnpm test:unit         # unit project only
pnpm test:security     # security project only
pnpm test:coverage          # run with coverage report
pnpm coverage:patch    # changed-lines coverage gate (PR CI)
```

## Global thresholds (ratchet)

Defined in `vitest.config.ts`. Pinned ~1% **under** measured coverage so CI fails
on regression, never on ambition. **Raise as coverage rises; never lower.**

| Metric     | Threshold |
| ---------- | --------- |
| Branches   | 59%       |
| Functions  | 61%       |
| Lines      | 66%       |
| Statements | 66%       |

## Patch coverage

PR CI also enforces **patch coverage** — changed lines must be ≥ 90%
(`tooling/ci/check-patch-coverage.mjs`, run as `pnpm coverage:patch`). This keeps
new/edited code well-covered even while the global ratchet rises gradually. The
`json-summary` reporter feeds the CI job-summary coverage table.

## Strict colocation

`pnpm validate:structure` fails any unit folder, island top-level UI
(`<Page>Page.tsx`/`<Page>Layout.tsx`), or flat-group component that lacks a
colocated `*.test.*`. Exemptions: route/manifest/contracts/search/fixtures/
constants role files, barrels, and `OVERVIEW` docs.

## Test ID and theme validators

| Gate                                    | Command                    |
| --------------------------------------- | -------------------------- |
| Page/form/shell `data-testid` contracts | `pnpm validate:testids`    |
| Theme preset axis compliance            | `pnpm validate:theme-axis` |

Both run in `pnpm health` and PR CI (`static-sync` job).

## E2E (Playwright)

Requires **core-be** on `:3000` — verified in `tests/e2e/global-setup.ts` before any spec runs. Hybrid selectors: **`agent-os/skills/playwright-e2e/SKILL.md`**, helpers in
`tests/utils/e2e-hybrid.ts`. Inventory: `docs/reference/e2e-testids-inventory.md`.

## Accessibility in tests

Component tests include `vitest-axe` assertions (`toHaveNoViolations()`); E2E uses
`@axe-core/playwright`. See the [test-generation skill](../../../agent-os/skills/test-generation/SKILL.md).

## Related

- Local quality gate (SonarQube): [sonarqube-local.md](sonarqube-local.md)
- Full health gate: `pnpm health` (`tooling/validate/health-check.sh`)
- TSDoc budget ratchet: `tooling/tsdoc-coverage/budget.json` (`pnpm tsdoc:check`)

## Troubleshooting Stuck Unit Coverage

If PR CI appears stuck in **Run unit tests with coverage** (`pnpm test:ci`), do
not bypass the hook or push with `--no-verify`. Reproduce locally with the exact
coverage command first, then isolate with Vitest sharding:

```bash
pnpm exec vitest run --project unit --shard 1/4 --reporter dot
pnpm exec vitest run --project unit --shard 2/4 --reporter dot
pnpm exec vitest run --project unit --shard 3/4 --reporter dot
pnpm exec vitest run --project unit --shard 4/4 --reporter dot
```

When a shard passes assertions but the process never exits, split that shard's
file list until one test file is left. A common failure shape is a shell test
exercising another component's already-covered lazy/Suspense boundary and
leaving async work alive. Keep shell tests scoped to their own behavior by
mocking the nested boundary, and verify the nested boundary in its own test
file.

For store mutations that trigger React renders, wrap direct Zustand `setState()`
calls in `act()` and reset global store flags in `afterEach()`.

For TanStack Query v5, avoid deprecated `queryClient.fetchQuery(...)` in touched
code; local Sonar pre-push flags it. Use `queryClient.query({ ...options })`
for imperative reads that should fetch through the query cache.
