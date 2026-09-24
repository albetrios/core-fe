# core-fe skill triggers

The file→skill routing map the agent hooks consult (session-start,
prompt-skill-router, skill-reminder, stop-gate-reminder). Always consult
`agent-os/skills/fe-skill-registry/SKILL.md` FIRST, then run the listed skill(s) for
the files you change. This is advisory: skills elevate craft within the
guardrails (shadcn components, semantic tokens, configured fonts/brand).

## UI & craft stack (canonical)

Read in order; **project guardrails always win** over skill suggestions.

| Priority      | Skill                     | When                                                             |
| ------------- | ------------------------- | ---------------------------------------------------------------- |
| 1             | **shadcn**                | Any component, block, CLI, styling primitives                    |
| 2             | **frontend-design**       | Default craft for build/style/beautify                           |
| 3             | **web-design-guidelines** | A11y, forms, focus, UX audit                                     |
| Advisory      | **ui-ux-pro-max**         | Query UX/style/chart DB (`python3 …/search.py`) — hints only     |
| Explicit pass | **impeccable**            | User says redesign / audit / polish / “impeccable” on product UI |
| Motion impl   | **animejs**               | Implement animations (dashboard uses this today)                 |
| Motion bar    | **emil-design-eng**       | Decide if/when/how motion should exist                           |
| Motion review | **review-animations**     | Review animation diffs in PRs only                               |

**Do not use** (removed from repo): `high-end-visual-design`, `redesign-existing-projects`, `shadcn-ui-blocks`, `image-to-code`, `motion-framer`, `full-output-enforcement`.

## By intent (prompt-time)

| When the task is…                              | Run skill(s)                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| a new page / route                             | `fe-page-scaffolding` → `fe-route-island`                                   |
| adding a validate gate / enforced lint rule    | `fe-guard-authoring`                                                     |
| opening a PR / "ready for review"              | `fe-pre-pr-sweep`                                                        |
| user-facing copy / dates / numbers / money     | `fe-i18n-constants` → `fe-locale-formatting`                                |
| RTL / mirrored layout                          | `fe-rtl-logical-css`                                                     |
| codemod / sweep / bulk file edits              | `fe-safe-bulk-edits`                                                     |
| adding / renaming an agent-os skill or rule    | `fe-agent-os-authoring`                                                  |
| addressing a review report / PR threads        | `fe-review-response`                                                     |
| org-scoped route / guards / gateway / session  | `fe-routing-tenancy` (after `fe-route-island`)                              |
| backend resource CRUD (list + URL dialogs)     | `fe-route-island` → `fe-resource-crud` → `fe-routing-tenancy` (if org-scoped)  |
| form mutation + API errors                     | `composition-patterns` → `fe-http-forms-errors` → `fe-test-generation`      |
| env / platform config / knip / vite-env gates  | `fe-platform-hygiene` (env keys → `fe-env-schema-add` first)                |
| a component / UI / page styling (default)      | `shadcn` → `frontend-design` → `web-design-guidelines`                |
| redesign / audit / polish product UI           | `shadcn` → `impeccable` → `frontend-design` → `web-design-guidelines` |
| a form                                         | `composition-patterns` → `fe-test-generation`                            |
| a Query hook / data layer (`*.api.ts`, hooks/) | `react-best-practices` (fe-api-data-patterns rule)                       |
| styling / theme / tokens / Tailwind            | `frontend-design` (fe-tailwind-styling + fe-ui-sources rules)               |
| add animation with Anime.js                    | `animejs` → `emil-design-eng` (bar)                                   |
| tests / test ids / Playwright E2E              | `fe-test-generation` → `fe-e2e-testids` → `fe-playwright-e2e`                  |
| visual regression / snapshot / baseline update | `fe-visual-regression` (needs core-be up; local-only lane)               |
| an a11y / UX review                            | `web-design-guidelines` (+ `ui-ux-pro-max` for checklist hints)       |
| docs / README / overview                       | `fe-documentation-maintenance`                                           |
| extract constants / copy / locale namespace    | `fe-i18n-constants` → `fe-code-structure`                                   |
| PWA manifest / app icon / favicon              | `fe-pwa-manifest`                                                        |
| where does this code go?                       | `fe-code-structure` / `fe-component-promotion`                              |
| lint / quality cleanup                         | `fe-lint-guard` / `fe-code-smells-best-practices`                           |
| debug a bug / test failure (before any fix)    | `systematic-debugging` (root cause first; then the fixing skill)      |
| full project check                             | `fe-project-health-check` (`pnpm health`)                                |

## By file pattern (after an edit)

| File pattern                                                                                   | Skill(s)                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `**/*.route.tsx` · `**/*.manifest.ts`                                                          | `fe-route-island`                                                                                          |
| `src/app/routes/routeTree.tsx` · `src/app/guards/**` · `src/shared/tenancy/**`                 | `fe-routing-tenancy`                                                                                       |
| `**/*.resource.ts` · `**/*ListPage.tsx` · `**/dialogs/**`                                      | `fe-resource-crud`                                                                                         |
| `**/forms/**/*` · mutation hooks touching `apiClient`                                          | `fe-http-forms-errors`, `composition-patterns`                                                             |
| `src/core/config/env-schema.ts` · `platform-config.ts` · `build-env.ts` · `knip.jsonc`         | `fe-platform-hygiene`, `fe-env-schema-add` (if env key changed)                                               |
| `.github/rulesets/**` · `.github/environments/**` · `tooling/setup/github/governance-mode.mjs` | `fe-platform-hygiene` (governance mode — use `github:tool:governance-mode`, never hand-edit review fields) |
| `src/pages/**/`                                                                                | `fe-page-scaffolding`, `fe-route-island`                                                                      |
| `**/*.contracts.ts`                                                                            | `fe-code-structure`                                                                                        |
| `**/*.constants.ts` · new user-facing copy / locale namespace                                  | `fe-i18n-constants`, `fe-code-structure`                                                                      |
| `**/*.api.ts` · `**/hooks/use*/**`                                                             | `react-best-practices`                                                                                  |
| `**/components/ui/*`                                                                           | `shadcn`                                                                                                |
| `**/components/**/*.tsx` · `**/forms/**/*`                                                     | `shadcn`, `composition-patterns`, `frontend-design`, `fe-test-generation`                                  |
| `src/shared/components/**/*.tsx` (promoted from a page)                                        | `fe-component-promotion`, `composition-patterns`                                                           |
| `src/index.css` · `**/*.css`                                                                   | `frontend-design`, `fe-theme-axis-audit` (if axis work)                                                    |
| `**/*.test.ts` · `**/*.test.tsx`                                                               | `fe-test-generation`                                                                                       |
| `tests/e2e/visual.e2e.test.ts` · `tests/e2e/*-snapshots/**`                                    | `fe-visual-regression`                                                                                     |
| `tests/e2e/**`                                                                                 | `fe-playwright-e2e`, `fe-e2e-testids`                                                                         |
| `.env.example`                                                                                 | `fe-platform-hygiene`, `fe-env-schema-add`, `fe-documentation-maintenance`                                       |
| `package.json` · `pnpm-lock.yaml` · `pnpm.overrides`                                           | `fe-dependency-management`                                                                                 |
| `tooling/validate/**` · `eslint.config.mjs` restrictions · `pr-ci.yml` static-sync steps       | `fe-guard-authoring` (probe both directions; wire into CI, not just health-check)                          |
| `agent-os/skills/**` · `agent-os/rules/**`                                                     | `fe-agent-os-authoring` (eight surfaces; regenerate the tree last)                                         |
| `src/locales/**` · `*.constants.ts` copy keys                                                  | `fe-i18n-constants` → `fe-locale-formatting` (if dates/numbers)                                               |
| `src/lib/i18n/format.ts` · `useLocaleFormat/` · any date/number/money render                   | `fe-locale-formatting`                                                                                     |
| `useLocaleStore/` · `public/locale-init.js` · `BUILD_I18N_MODE`                                | `fe-locale-preferences`                                                                                    |
| any component styling (RTL correctness)                                                        | `fe-rtl-logical-css`                                                                                       |
| `vite.config.ts` · `tooling/ci/run-size-limit.mjs` · size budget                               | `fe-bundle-performance`                                                                                    |
| `src/core/config/app-manifest.ts` · `public/manifest.webmanifest` · `app-icon.svg`             | `fe-pwa-manifest`                                                                                          |
| `docs/**/*.md` · `**/*.OVERVIEW.md`                                                            | `fe-documentation-maintenance`                                                                             |
| `useAnimeCountUp.ts` · animation hooks                                                         | `animejs`, `emil-design-eng`                                                                            |

## Gates (definition of done)

`pnpm health` (full check) — or individually: `pnpm type-check` · `pnpm lint` ·
`pnpm biome:check` · `pnpm format:check` · `pnpm validate:tokens` ·
`pnpm validate:structure` · `pnpm validate:testids` · `pnpm validate:theme-axis` ·
`pnpm validate:vite-env` · `pnpm validate:client-env --production` · `pnpm knip` ·
`pnpm test` · `pnpm docs:lint`. Pre-push runs the
local SonarQube gate on deployed-surface changes.
