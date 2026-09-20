# Tests — Overview

**Unit/component** tests are **colocated** under `src/` (`*.test.ts(x)`). **E2E** and **security** live here.

**Full matrix:** [docs/reference/testing.md](../docs/reference/testing.md)

## Layout

| Path                       | Purpose                                                                                                                                                                                                                          | Tool                | Command                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| **`tests/utils/`**         | Helpers: `renderWithProviders`, `e2e-hybrid`, `e2e-auth`, `axe-for-dialog`                                                                                                                                                       | Vitest / Playwright | (imported by tests)       |
| **`tests/fixtures/`**      | Test-only fixture data (never imported by `src/`)                                                                                                                                                                                | —                   | —                         |
| **`tests/factories/`**     | Test data factories (never imported by `src/`)                                                                                                                                                                                   | —                   | (imported by tests)       |
| **`tests/e2e/`**           | Browser + API E2E (one suite)                                                                                                                                                                                                    | Playwright          | `pnpm test:e2e`           |
| **`tests/cross-browser/`** | Cross-browser E2E (Chromium / Firefox / WebKit)                                                                                                                                                                                  | Playwright          | `pnpm test:cross-browser` |
| **`tests/ci/`**            | CI-flow policy invariants (workflow wiring, release-please manifests, Dependabot rules) — plus the guards that have no other home: ESLint restrictions linted against the real config, and the E2E harness's sign-in-code helper | Vitest              | `pnpm test:ci-policy`     |
| **`tests/security/`**      | Security tripwires                                                                                                                                                                                                               | Vitest              | `pnpm test:security`      |
| **`tests/performance/`**   | Optional Lighthouse / bundle-size checks                                                                                                                                                                                         | Lighthouse          | (manual)                  |

## Two test layers

| Layer            | Pattern                   | Server needed?                                                 |
| ---------------- | ------------------------- | -------------------------------------------------------------- |
| Unit / component | `src/**/*.test.tsx`       | No — `vi.mock()`                                               |
| E2E              | `tests/e2e/*.e2e.test.ts` | **core-be** on `:3000` (required — global-setup fails if down) |

**Running E2E locally:** follow `docs/reference/testing.md` → E2E → **"Local run — required env & steps"**. Required env lives in each repo's **`.env.local`** (never a plain `.env`): core-be needs `RATE_LIMIT_RELAXED_CAPS=true` + `DATABASE_TLS_ENFORCED=false` + `DATABASE_RLS_SAFETY_ENFORCED=false`; core-fe needs `VITE_DEV_API_URL=http://localhost:3000`.

## Commands

| Command                                   | What it runs                                      |
| ----------------------------------------- | ------------------------------------------------- |
| `pnpm test`                               | Vitest all projects — unit + security + ci-policy |
| `pnpm test:unit`                          | Colocated unit suites only                        |
| `pnpm test:security`                      | Security tripwires                                |
| `pnpm test:e2e`                           | All Playwright E2E specs                          |
| `pnpm test:e2e:integration`               | Routes integration + org switching                |
| `pnpm test:e2e:integration:cross-browser` | Live integration on Chromium, Firefox, WebKit     |
| `pnpm test:visual`                        | Visual regression only                            |
| `pnpm validate:testids`                   | Page/form/shell `data-testid` gate                |
| `pnpm validate:structure`                 | Route-island + test colocation gate               |

E2E artifacts: **`test-results/`** — `pnpm test:e2e:report` to open the HTML report.

## E2E hybrid selectors

- **`page.getByTestId(...)`** — clicks, fills, navigation
- **`getByRole` / `getByLabel`** — visibility and a11y guards

See **`agent-os/skills/playwright-e2e/SKILL.md`** and **`tests/utils/e2e-hybrid.ts`**.
