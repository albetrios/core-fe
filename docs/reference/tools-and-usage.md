# Tools & Libraries — Usage Overview

Single reference table for every dependency: whether it's used and where.

| Package                            | Used? | Where / what for                                                                                                                                                                                         |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependencies**                   |       |                                                                                                                                                                                                          |
| `animejs`                          | Yes   | Anime.js v4 — JS motion: dashboard stat count-up (`useAnimeCountUp`) and onboarding step transitions (`useOnboardingStepMotion`).                                                                        |
| `@hookform/resolvers`              | Yes   | `zodResolver` in LoginForm, FormField tests; bridges react-hook-form and Zod.                                                                                                                            |
| `@sentry/react`                    | Yes   | Route wrapper (`wrapCreateBrowserRouterV7`), `reportError()` in errorHandler, Sentry.init in observability/sentry.                                                                                       |
| `@sentry/vite-plugin`              | Yes   | `vite.config.ts` — source map upload to Sentry in production builds.                                                                                                                                     |
| `@tanstack/react-query`            | Yes   | Server state: QueryClient, useQuery, useMutation; QueryProvider, queryClient; useDashboard, tests.                                                                                                       |
| `@tanstack/react-table`            | Yes   | DataTable, DataTablePagination, DataTableColumnHeader, DataTableToolbar (flexRender, Table types).                                                                                                       |
| `class-variance-authority`         | Yes   | `cva()` and `VariantProps` in button, badge (and other UI components that use variants).                                                                                                                 |
| `clsx`                             | Yes   | `lib/utils.ts` — `cn()` (with tailwind-merge) for conditional class names.                                                                                                                               |
| `cmdk`                             | Yes   | `shared/components/command-palette.tsx` — global Command palette (Cmd+K).                                                                                                                                |
| `fuse.js`                          | No    | In package.json; no import or usage in `src/`.                                                                                                                                                           |
| `input-otp`                        | No    | Removed; MFA route can be re-added with an OTP UI when needed.                                                                                                                                           |
| `lucide-react`                     | Yes   | Icons across app: button, command palette, layouts, forms, DataTable, RetryError, FullPageSpinner, etc.                                                                                                  |
| `posthog-js`                       | Yes   | `app/analytics/posthog.ts` init + `shared/analytics/capture.ts` events (idle + dynamic import). Feature-flag provider planned, not yet wired.                                                            |
| `radix-ui`                         | Yes   | UI primitives: AlertDialog, DropdownMenu, Dialog, Tooltip, Checkbox, Separator, Label, Button (Slot), Badge, Avatar.                                                                                     |
| `react`                            | Yes   | Core framework.                                                                                                                                                                                          |
| `react-dom`                        | Yes   | Core framework (createRoot in main.tsx).                                                                                                                                                                 |
| `react-error-boundary`             | Yes   | `App.tsx` — ErrorBoundary with FallbackComponent and onReset.                                                                                                                                            |
| `react-hook-form`                  | Yes   | LoginForm, FormField; useForm, FormProvider, Controller, etc.                                                                                                                                            |
| `react-i18next`                    | Yes   | Client UI copy — `useTranslation`, `Trans`; bootstrap in `lib/i18n/i18n.ts`, locales in `src/locales/en/`.                                                                                               |
| `i18next`                          | Yes   | Core i18n engine (pairs with react-i18next; aligned with core-be).                                                                                                                                       |
| `@tanstack/react-router`           | Yes   | Typed routes, `beforeLoad` guards, search params, lazy route modules (`route.tsx`).                                                                                                                      |
| `recharts`                         | Yes   | `shared/components/Dashboard/AnalyticsChart` — interactive area chart (AreaChart, XAxis, etc.). Dynamically reached via the lazy dashboard route; not manually chunked (see vite.config `manualChunks`). |
| `sonner`                           | Yes   | Deferred `shared/notify/notify-runtime.tsx` renderer; the root-mounted `AppToaster` and `notify` bridge provide immediate feedback and stable IDs.                                                       |
| `tailwind-merge`                   | Yes   | `lib/utils.ts` — `twMerge` inside `cn()` for Tailwind class merging.                                                                                                                                     |
| `tw-animate-css`                   | Yes   | `index.css` `@import` — activates `animate-in`/`animate-out` enter/exit utilities for shadcn overlays (dialog, dropdown, popover, tooltip, select). Pure CSS; no JS animation library.                   |
| `web-vitals`                       | Yes   | `core/observability/performance.ts` — onCLS, onINP, onLCP, onFCP, onTTFB reported to PostHog/Sentry.                                                                                                     |
| `zod`                              | Yes   | contracts (auth, dashboard), env schema, auth types; validation for API and forms.                                                                                                                       |
| `zustand`                          | Yes   | useAuthStore, useThemeStore (with persist), useUIStore, useOrganizationStore; create + getState.                                                                                                         |
| **DevDependencies**                |       |                                                                                                                                                                                                          |
| `@axe-core/playwright`             | Yes   | E2E accessibility scanning (e.g. accessibility.e2e.test.ts).                                                                                                                                             |
| `@commitlint/cli`                  | Yes   | Commit message lint (with config-conventional).                                                                                                                                                          |
| `@commitlint/config-conventional`  | Yes   | Commitlint rules.                                                                                                                                                                                        |
| `@eslint/js`                       | Yes   | ESLint base config.                                                                                                                                                                                      |
| `@biomejs/biome`                   | Yes   | Second linter lane (`biome:check` / `biome:fix`) — lint-only, formatter disabled (Prettier owns formatting because of `prettier-plugin-tailwindcss`). Config: `biome.json`.                              |
| `@playwright/test`                 | Yes   | E2E tests (auth, dashboard, navigation, visual, accessibility).                                                                                                                                          |
| `@size-limit/file`                 | Yes   | `size` / `size:check` scripts — bundle size limits.                                                                                                                                                      |
| `@tailwindcss/vite`                | Yes   | Vite integration for Tailwind v4.                                                                                                                                                                        |
| `@tanstack/react-query-devtools`   | Yes   | `QueryProvider` — ReactQueryDevtools in development.                                                                                                                                                     |
| `@testing-library/jest-dom`        | Yes   | Test matchers (e.g. toHaveNoViolations, DOM assertions).                                                                                                                                                 |
| `@testing-library/react`           | Yes   | render, screen, etc. in unit/integration tests.                                                                                                                                                          |
| `@testing-library/user-event`      | Yes   | User interaction simulation in tests.                                                                                                                                                                    |
| `@types/node`                      | Yes   | Node types for build/tooling.                                                                                                                                                                            |
| `@types/react`                     | Yes   | React type definitions.                                                                                                                                                                                  |
| `@types/react-dom`                 | Yes   | React DOM type definitions.                                                                                                                                                                              |
| `@vitejs/plugin-react`             | Yes   | Vite config — React fast refresh.                                                                                                                                                                        |
| `@vitest/coverage-v8`              | Yes   | Coverage (test:coverage, test:ci).                                                                                                                                                                       |
| `eslint`                           | Yes   | Linting.                                                                                                                                                                                                 |
| `eslint-plugin-jsx-a11y`           | Yes   | A11y rules in ESLint.                                                                                                                                                                                    |
| `eslint-plugin-react-hooks`        | Yes   | React hooks rules.                                                                                                                                                                                       |
| `eslint-plugin-react-refresh`      | Yes   | Vite/React refresh rules.                                                                                                                                                                                |
| `eslint-plugin-security`           | Yes   | Security-focused rules.                                                                                                                                                                                  |
| `eslint-plugin-simple-import-sort` | Yes   | Import sorting.                                                                                                                                                                                          |
| `eslint-plugin-sonarjs`            | Yes   | Code quality rules.                                                                                                                                                                                      |
| `eslint-plugin-unused-imports`     | Yes   | Unused import detection.                                                                                                                                                                                 |
| `globals`                          | Yes   | ESLint env globals.                                                                                                                                                                                      |
| `husky`                            | Yes   | Git hooks (prepare script).                                                                                                                                                                              |
| `jsdom`                            | Yes   | Vitest DOM environment.                                                                                                                                                                                  |
| `lint-staged`                      | Yes   | Pre-commit: biome check, eslint --fix, prettier on staged files.                                                                                                                                         |
| `markdownlint-cli2`                | Yes   | Markdown lint lane (`docs:lint*`); config `.markdownlint-cli2.jsonc` + `.markdownlint.json`.                                                                                                             |
| `prettier`                         | Yes   | Formatting (format, format:check).                                                                                                                                                                       |
| `prettier-plugin-tailwindcss`      | Yes   | Prettier Tailwind class sorting.                                                                                                                                                                         |
| `rollup-plugin-visualizer`         | Yes   | Build analyzer (build:analyze).                                                                                                                                                                          |
| `tailwindcss`                      | Yes   | Tailwind v4 (index.css, @theme).                                                                                                                                                                         |
| `typescript`                       | Yes   | type-check script, TS compilation.                                                                                                                                                                       |
| `typescript-eslint`                | Yes   | ESLint TypeScript rules.                                                                                                                                                                                 |
| `vite`                             | Yes   | Dev server and production build.                                                                                                                                                                         |
| `vite-plugin-pwa`                  | Yes   | PWA support (sw.ts, workbox).                                                                                                                                                                            |
| `vitest`                           | Yes   | Unit/integration test runner.                                                                                                                                                                            |
| `vitest-axe`                       | Yes   | a11y assertions (toHaveNoViolations) in tests.                                                                                                                                                           |
| `workbox-*`                        | Yes   | PWA (precaching, routing, strategies, expiration).                                                                                                                                                       |

---

## Quality gates — Biome + SonarQube (local)

Two quality layers sit on top of ESLint/Prettier, mirroring core-be:

- **Biome** (`pnpm biome:check` / `pnpm biome:fix`) — a second, fast lint lane (`biome.json`).
  Lint-only: the formatter is disabled because Prettier owns formatting via
  `prettier-plugin-tailwindcss` (Biome cannot sort Tailwind classes the same way). Runs in
  lint-staged, `pnpm health` (phase 3), the pre-push hook, and its own CI lane.
- **SonarQube** (`pnpm sonar:scan`) — local Docker server + scanner enforced as a pre-push gate;
  blocks the push on any unresolved issue/hotspot in deployed-surface code. Full guide:
  [quality/sonarqube-local.md](quality/sonarqube-local.md). Orchestrator: `pnpm quality`
  (= `pnpm health` + Sonar gate).

Further gates, all mirroring core-be:

- **Markdownlint** (`pnpm docs:lint`, `docs:lint:fix`, `docs:lint:changed`) — `.markdownlint-cli2.jsonc`
  owns globs/ignores; rule set in `.markdownlint.json` (emphasis = underscore to match Prettier,
  which formats markdown in lint-staged). Runs in pre-push (changed files) and the Docs lint CI lane.
- **Patch coverage** (`pnpm coverage:patch`) — `tooling/ci/check-patch-coverage.mjs` measures the
  coverage of _changed executable lines_ against `coverage/coverage-final.json`; the CI unit lane
  enforces ≥ 80% on PRs. Complements the global ratchet: the ratchet stops regressions, this stops
  under-tested new code.
- **TSDoc budget** (`pnpm tsdoc:check`, `:report`, `:refresh-budget`) — `tooling/tsdoc-coverage/check-coverage.mjs`
  counts public exports missing TSDoc against the locked budget in `tooling/tsdoc-coverage/budget.json`
  (raise-never, lower-and-refresh). Runs in `pnpm health` and the CI structure lane.
- **CodeQL** (`.github/workflows/codeql.yml`) — weekly + per-PR taint-tracking analysis scoped by
  `.github/codeql/codeql-config.yml` to the deployed surface; complements Semgrep.
- **PR governance** (`.github/workflows/pr-governance.yml`) — conventional PR title, size labels,
  path labels (`.github/labeler.yml` / `labels.yml`), and a committed-env-file guard. The
  Dependency review CI lane blocks high-severity/GPL-AGPL dependency changes.
- **Branch protection as code** (`.github/rulesets/main.json`, `pnpm github:sync`) — `main`
  requires only the aggregate `Quality gate` + governance `Checks`; adding a CI lane never touches
  branch protection.
- **SBOM** (`pnpm sbom:generate`) — CycloneDX inventory via cdxgen (reads `pnpm-lock.yaml`);
  uploaded as a CI artifact from the build lane.
- **Design tokens** (`pnpm validate:tokens`) — app code styles only through semantic tokens
  (`background`, `success`, `brand`, `overlay`, …); raw Tailwind palette classes are forbidden
  outside vendored `components/ui/`. This single gate is what keeps "a theme = a CSS file of
  token values" true. Status/brand/overlay tokens live in `src/index.css`.
- **Test ID contracts** (`pnpm validate:testids`) — page `manifest.testId`, form roots/submit
  (or primary CTA), and shell surfaces (`app-layout`, `auth-layout`, `settings-modal`) must carry
  `data-testid`; not every DOM node. See `docs/reference/e2e-testids-inventory.md`.
- **Preload graph** (`pnpm build:check`, after `pnpm build`) — deferred chunks
  (sentry/posthog/cmdk/rhf/charts) must never re-enter `dist/index.html`'s modulepreload list;
  one static import anywhere in the entry graph silently drags them onto the first-paint path.
- **Icon barrel** (`@/shared/icons`) — every app icon import flows through one file (eslint
  `no-restricted-imports`), so swapping the icon library is a one-file change.
- **Contract drift** (`pnpm contracts:drift`) — every backend endpoint this app references
  (API_ENDPOINTS + `apiClient` calls) must exist in core-be's committed route catalog
  (`../core-be/docs/routes.txt`); intentional fe-ahead endpoints live in
  `tooling/ci/contract-drift-allowlist.json` with reasons, and stale entries fail the gate.
  Local-only (needs the sibling checkout); runs in pre-push.
- **Knip** (`pnpm knip`, `knip.jsonc`) — dead-code gate: unused files, exports, types,
  dependencies, and binaries. Validator-mandated unit barrels are entries (a unit's barrel is its
  public API); the only suppressions are declared in `knip.jsonc` with reasons. Runs in
  `pnpm health` and its own CI lane.
- **Mutation testing** (`stryker.config.json`) — scheduled weekly over the pure runtime logic
  (rbac, auth, tenancy, route helpers); report artifact in the Actions run.
- **Lighthouse budgets** (`.lighthouserc.cjs`) — scheduled weekly against the built app
  (perf ≥ 0.9 warn, a11y = 1.0 error, best-practices ≥ 0.95 warn). Locally:
  `pnpm build && pnpm preview --port 5173 --strictPort` then `npx @lhci/cli autorun`
  — see **`docs/reference/local-production-perf.md`** (never Lighthouse on `pnpm dev`).
- **Bundle size** (`pnpm size`) — gzip limits on `dist/` via `tooling/ci/run-size-limit.mjs`.

---

## Agent skills — shadcn (single canonical skill)

The official **shadcn skill** is vendored at **`agent-os/skills/shadcn/`** (installed via `pnpm dlx skills add shadcn/ui`; the equivalent `npx skills add https://github.com/shadcn/ui --skill shadcn` resolves to the same `skills.sh/shadcn/ui` source and installs the identical files to the same path).

- **One skill for everything shadcn:** _how_ to add/fix/style/compose (CLI + Critical Rules in `SKILL.md` + `rules/`) **and** _where_ a block comes from (its "Project rules — core-fe" section folds in the 20 allowed sources + selection workflow). The former shadcn-component-selection skill was merged into `agent-os/skills/shadcn/` and removed.
- **Use the project runner:** `pnpm dlx shadcn@latest <info|search|docs|view|add> …`.
- **Always-applied policy:** `agent-os/rules/ui-sources.mdc`. **Router:** `agent-os/rules/skill-router.mdc` (rule 13).
- **Updating:** re-running `skills add` overwrites `agent-os/skills/shadcn/`; the local "Project rules — core-fe" block at the end of its `SKILL.md` must be re-appended (the same policy is preserved in `ui-sources.mdc`, which is always applied).

## Agent skills — frontend-design

Design-thinking + aesthetic-quality skill vendored at **`agent-os/skills/frontend-design/`** (installed via `npx skills add https://github.com/anthropics/skills --skill frontend-design`).

- **Use for:** building/styling/beautifying UI — typography hierarchy, intentional color/theme, high-impact motion, spatial composition, depth, memorable details; avoid generic "AI slop".
- **Precedence:** apply _within_ project guardrails — shadcn components (`agent-os/skills/shadcn`), neutral semantic tokens in `src/index.css` (no raw colors / no purple-on-white), configured fonts/brand, and `web-design-guidelines` for a11y. It elevates craft, it does **not** override the component library, design tokens, or brand. Standalone artifacts may get more creative latitude.
- **Router:** `agent-os/rules/skill-router.mdc` (rule 14). **Registry:** `agent-os/skills/skill-registry/SKILL.md` (#4b).

## Agent skills — find-skills

Meta-skill for discovering/installing skills, vendored at **`agent-os/skills/find-skills/`** (installed via `npx skills add https://github.com/vercel-labs/skills --skill find-skills`).

- **Use for:** "is there a skill for X", discovering new capabilities, or any task not covered by `skill-router.mdc` / `skill-registry`.
- **Workflow:** check [skills.sh](https://skills.sh/) → `npx skills find <query>` → prefer reputable/high-install skills → present options → install into `agent-os/skills/` → **wire the new skill into router + registry + docs**.
- **Router:** `agent-os/rules/skill-router.mdc` (rule 15). **Registry:** `agent-os/skills/skill-registry/SKILL.md` (#14).

### Installed skills (tracked in `skills-lock.json`)

| Skill             | Source                                 | Use for                                                                                                                                                                                                                         |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shadcn`          | `shadcn/ui`                            | All shadcn/ui work (CLI, critical rules, component selection across 20 allowed sources)                                                                                                                                         |
| `frontend-design` | `anthropics/skills`                    | Distinctive, polished UI craft — within project tokens/brand/a11y guardrails                                                                                                                                                    |
| `ui-ux-pro-max`   | `nextlevelbuilder/ui-ux-pro-max-skill` | Advisory design-intelligence DB (styles, palettes, font pairings, UX/stack/chart guidelines); query via `python3 agent-os/skills/ui-ux-pro-max/scripts/search.py …`. Local-only scripts; does not override project tokens/brand |
| `find-skills`     | `vercel-labs/skills`                   | Discover/install new skills from the ecosystem                                                                                                                                                                                  |

Run `npx skills check` / `npx skills update` to update them; re-append the local "Project rules — core-fe" block to `shadcn/SKILL.md` after updating it.

> **`ui-ux-pro-max` safety:** the installer's Gen heuristic flags it "High Risk", but its bundled Python (`scripts/*.py`, `data/_sync_all.py`) is a local BM25 search + CSV/markdown generator — **no** network/subprocess/eval/exec (reviewed). Requires `python3`. Treat its output as advisory; `--persist` writes `design-system/` files only when explicitly requested.

---

## Public static assets (frontend)

All files in **`public/`** are served from the root of the built site. See **[public/README.md](../../public/README.md)** and **`docs/reference/pwa-manifest-and-app-icon.md`** for manifest/icon rules. Skill: **`agent-os/skills/pwa-manifest/SKILL.md`**.

| Asset                                    | Purpose                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **robots.txt**                           | Crawler rules (allow/disallow). Present in `public/`; update if you add a sitemap or restrict paths. |
| **manifest.webmanifest**                 | PWA manifest — must match `buildWebManifest()` in `src/core/config/app-manifest.ts` (drift test).    |
| **app-icon.svg**                         | Favicon + PWA SVG (Lucide Boxes on `#0a0a0a`). Regenerate PNGs with `rsvg-convert`.                  |
| **\_headers**                            | Security/response headers (e.g. Permissions-Policy). Applied by Netlify or static host.              |
| **config.js**                            | Runtime config placeholder (`window.__CONFIG__`); overwritten by host if needed.                     |
| **theme-init.js**                        | Prevents theme FOUC; applies `.dark` from localStorage before React.                                 |
| **offline.html**                         | PWA offline fallback.                                                                                |
| **pwa-192x192.png**, **pwa-512x512.png** | Generated from `app-icon.svg`; listed in manifest and VitePWA `includeAssets`.                       |

---

## External CLI tools (macOS)

Tools the repo needs beyond `pnpm install` — gitleaks, gh, jq, uv, ripgrep, shellcheck, `librsvg` (`rsvg-convert`), a headless Docker runtime, and Node itself — are installed/upgraded by **`pnpm setup:mac-tools`**: non-interactively via Homebrew, idempotent, macOS-only (a no-op elsewhere). `pnpm setup:local` runs it automatically on macOS (opt out with `--skip-mac-tools`; preview with `--check`). The list is the **single source of truth** in [`tooling/dev/setup-prerequisites-mac-tools.manifest`](../../tooling/dev/setup-prerequisites-mac-tools.manifest) — add or remove a `<method>|<spec>|<note>` line to change what's installed. See [setup.md → Prerequisites](../getting-started/setup.md#prerequisites).

---

## New-deployment detection

The app detects when a new build has been deployed and reloads the page so users don’t run stale cached code — at a moment that won’t interrupt their work (idle / hidden tab / refocus, never mid-edit).

- **Plugin:** `plugins/version-json.ts` — At build time generates a unique `buildId` and sets `import.meta.env.VITE_APP_BUILD_ID`. In dev it serves `/version.json` via middleware; in prod it writes `dist/version.json` with `buildId` and `builtAt` (UTC, ISO 8601).
- **Runtime:** `src/core/version/check.ts` — Fetches `/version.json` every 5 min while visible (`cache: 'no-store'`) and on tab refocus. If the response `buildId` differs from the app’s built-in `VITE_APP_BUILD_ID`, it calls **`onUpdateAvailable`** (wired in `main.tsx` to a persistent **“Update available — Refresh now”** info toast), pre-warms the new service worker in the background, and **defers** the reload until it’s safe — never while an input/textarea/select is focused, immediately when the tab is hidden (the reload is invisible), otherwise once the user has been idle ~60s. The reload itself goes through **`reloadOntoLatestBuild()`** (`SKIP_WAITING` → `controllerchange`), so it lands on the NEW precached shell instead of the old worker’s copy. A per-tab sessionStorage marker reloads at most once per advertised `buildId` (no reload-loop on a stale-served `index.html`).
- **Stale-chunk recovery:** `src/core/version/stale-chunk-recovery.ts` — the poll is not the only way a superseded deploy shows up. A tab open across a deploy still holds the OLD chunk graph, so its next `import()` requests a content-hashed file the CDN no longer has. `netlify.toml` answers a missing `/assets/*` with a real **404** (the SPA catch-all used to rewrite it to `index.html` with a 200, which surfaces as the opaque _“Expected a JavaScript-or-Wasm module script … MIME type of text/html”_), Vite dispatches **`vite:preloadError`**, and this module reloads through the same `reloadOntoLatestBuild()`. It stands down while a field is focused (the version poller reloads safely later) and, like the poller, acts at most once per `buildId` — its own sessionStorage key, so neither path spends the other's attempt. Standing down leaves Vite to throw, so the failure still reaches the error boundary and Sentry.

---

## Summary

- **Not used in source:** `fuse.js` — safe to remove if you don't plan to add fuzzy search.
- **Removed:** `input-otp` (component removed; MFA can be re-added when needed).

All other listed packages are used as indicated in the table.
