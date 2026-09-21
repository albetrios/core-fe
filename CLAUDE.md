# CLAUDE.md — Core Frontend Project Conventions

This document is the single source of truth for understanding and working in this codebase. Read it before making any changes.

## Quick Start

```bash
pnpm install
pnpm dev          # Vite dev server on port 5173
pnpm build        # Production build
pnpm type-check   # Type check (no emit, tsconfig.app.json)
pnpm lint         # ESLint
pnpm biome:check  # Biome lint lane (lint-only; Prettier owns formatting)
pnpm health       # Full project health check (all phases)
pnpm health:fix   # Auto-fix + full health check
pnpm sync:check   # Deterministic docs↔code drift (structure, testids, i18n, tree, agent-os, identity)
pnpm rebrand "<Product>"  # Rename the product (dry run; --apply to write) — see new-project.md
pnpm quality      # health + local SonarQube gate (Docker)
```

**Quality gates (mirrors core-be):** Biome is a second lint lane (`biome.json`; formatter
disabled — Prettier + `prettier-plugin-tailwindcss` own formatting). SonarQube runs locally in
Docker and is enforced by `.husky/pre-push` on deployed-surface changes (`pnpm sonar:scan`;
no per-gate bypass — a red gate must be fixed, not skipped) — see docs/reference/quality/sonarqube-local.md.
Coverage thresholds in `vitest.config.ts` are a **ratchet**: pinned just under measured
coverage, raised as coverage rises, never lowered; the same raise-never philosophy applies to
the **TSDoc budget** (`pnpm tsdoc:check`, `tooling/tsdoc-coverage/budget.json`) and to **patch
coverage** (changed lines ≥ 90% — PR CI runs `tooling/ci/check-patch-coverage.mjs`; local
mirror: `pnpm coverage:patch`). Vitest is split into
`unit` (colocated src suites), `security` (tests/security — token storage, redirect
safety, header tripwires), and `ci-policy` (tests/ci — workflow wiring, release-please
manifests, Dependabot flow invariants) projects. Markdown is linted
(`pnpm docs:lint`; emphasis style follows Prettier) in its own path-filtered workflow
(`pr-docs-lane.yml`, outside the quality gate). CI (`.github/workflows/pr-ci.yml`) runs
path-filtered parallel lanes — biome/eslint/prettier/tsc/vitest(+patch coverage)/security-tests/
knip/structure+tsdoc/agent-os-gate/build+size+SBOM/gitleaks/semgrep/Trivy-IaC/deps-audit/
dependency-review/actionlint —
behind the aggregate `Quality gate` required check (`Checks` is the second required
context; branch protection as code:
`.github/rulesets/`, `pnpm github:sync`; personal↔team review posture via
`pnpm github:tool:governance-mode` — see docs/reference/branch-governance.md). Playwright E2E is local-only (needs
core-be on `:3000` — CI never boots the backend). CodeQL, Stryker mutation tests, Lighthouse
budgets, cache cleanup, release-flow guards (environment-drift canary),
the sync-drift canary (weekly docs↔code drift → tracked issue),
and Dependabot CI triage + approval-gated auto-merge (low-risk `npm-non-major` group only)
run as scheduled/event workflows (enforced registry: docs/reference/scheduled-jobs.md).

**Merge policy — never merge on red (enforced, not just convention):** the `main` ruleset carries
**no `bypass_actors`**, so a PR with any failing or pending required check (`Quality gate`, `Checks`)
**cannot be merged by anyone — the repo owner included**. Never re-add `bypass_actors` to
`.github/rulesets/main.json`, and never merge with `--admin` or the merge API to skip a red gate: a
flaky-red required check is **re-run (or its branch updated) to green**, never bypassed. `strict up-to-date`
is off so a green PR merges cleanly with `gh pr merge --squash` (no bypass needed); `required_signatures`
is intentionally absent (branch commits are unsigned — the squash-merge commit GitHub creates on `main`
is signed regardless). The ruleset content is pinned by `tests/ci/rulesets.policy.test.ts`.

**Lockfile discipline:** a `package.json` dependency or `pnpm.overrides` change and its
`pnpm-lock.yaml` regeneration are **one atomic commit** — run `pnpm install` and stage both.
A desynced lockfile fails every frozen-install CI job (`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`) and
also reds any open release-please PR, so it must never reach main; the before-commit guard blocks
it locally via `pnpm run validate:lockfile` (see `agent-os/skills/platform-hygiene/SKILL.md`).

## Documentation

- **Engineering principles (Cursor):** `agent-os/rules/engineering-principles.mdc`
- **Index by use case:** docs/README.md
- **Derive a NEW product from this repo:** docs/getting-started/new-project.md — fork path, `pnpm rebrand` (a **total** rename, prose included; `core-be` and `CHANGELOG.md` excluded), `previousNames` guard, upstream sync
- **Local setup:** docs/getting-started/setup.md
- **Requirement intake (format, types, skills, rules):** docs/getting-started/requirement-intake.md — template: docs/getting-started/requirement-format.md, example: docs/getting-started/requirements/sample-requirement.md
- **Deploy / CI-CD:** docs/deployment/cicd-and-netlify.md, docs/deployment/deployment-and-pre-launch.md; **release + versioning:** docs/process/release-versioning.md
- **Path to production (gate):** docs/deployment/path-to-production.md
- **Netlify CLI setup:** docs/deployment/netlify-cli-setup.md
- **Credentials / env:** docs/integrations/credentials-and-env.md; **env runbook:** docs/deployment/runbooks/environment-variables.md; Sentry: docs/integrations/sentry-sourcemaps.md
- **Cursor ↔ backend API (MCP):** agent-os/docs/cursor-backend-mcp.md
- **Git workflow:** docs/process/trunk-based-workflow.md
- **Routing & tenancy (implemented spec):** docs/reference/routing-and-tenancy.md
- **SonarQube local quality gate:** docs/reference/quality/sonarqube-local.md
- **Reference:** docs/reference/tools-and-usage.md, docs/reference/routes-and-ui.md, docs/reference/frontend-platform.md (platform kernel), docs/reference/pwa-manifest-and-app-icon.md (PWA install surface), docs/reference/local-production-perf.md (build + preview perf), docs/reference/cross-browser-support.md (Chrome/Firefox/Safari), docs/reference/design.md (design language), docs/reference/theming.md, docs/reference/theme-axis-audit-playbook.md (axis audit procedure), docs/reference/dependency-upgrades.md, docs/reference/internationalization.md, docs/reference/scheduled-jobs.md (scheduled + periodic jobs registry)

## Architecture Overview

```text
Layer          Purpose                                                    Files (approx)
─────────────  ─────────────────────────────────────────────────────────  ──────────────
src/app/       Application shell: routes, guards, providers, error        ~20
               boundaries, analytics + observability bootstrap
src/core/      HTTP, RBAC, config, data-provider, resources,             ~35
               version, types — pure framework-agnostic platform
src/pages/     Route islands (feature code) — custom + resource shapes    ~50
src/shared/    shadcn UI (flat), components/forms/hooks/layouts          ~380
               (folder-per-unit), global Zustand store, standard CRUD,
               cross-page api helpers, auth + tenancy runtime, errors,
               icons, analytics, billing, notifications/notify, theme
src/lib/       Pure utilities (cn, animations, route-island helpers)      ~45
tests/         E2E (Playwright), shared test utils                         ~75

agent-os/      Agents, skills, rules, hooks, MCP, platforms, docs           ~50+
               (.cursor/, .claude/, .codex/ symlink into this)
```

```text
tests/              # At project root: utils, e2e, security, ci, performance (see tests/README.md)
src/
├── app/            # Application shell: route tree, guards, providers, error boundaries
├── core/           # Framework-agnostic services: HTTP, RBAC, config, data-provider, resources, version
├── pages/          # Page-first feature directories (each = a frontend route)
├── shared/         # Cross-page reusables: components, forms, hooks, layouts, store
├── lib/            # Pure utilities: cn(), animations, helpers (no side effects)
├── App.tsx         # Root component
├── main.tsx        # Entry point
└── index.css       # Tailwind CSS v4 entry with @theme tokens
```

All Zustand stores live in **`src/shared/store/<X>Store/`** (folder-per-unit) — `useAuthStore`, `useOrganizationStore`, `useThemeStore`, `useUIStore`, `useOnboardingStore`, `useConsentStore`, `useLocaleStore`. Cross-page API helpers (auth-screen schemas + fetchers `auth-api.ts`/`auth-contracts.ts`, organization-domain schemas + fetchers) live in **`src/shared/api/`**. Organization/tenancy runtime (URL-driven context, membership, `/` resolver, my-organizations) lives in **`src/shared/tenancy/`** — the URL is the single source of truth for organization context. Auth infrastructure (token, refresh-timer, idle-timeout, login/logout service) lives in **`src/shared/auth/`**.

**Dependency rule (one-way, importer → importee):** `app → pages → shared → core → lib`; `shared/components/ui` is a leaf that imports only `lib` and other ui primitives, and `lib` may reach only `core/types`. Pages never import from other pages. One documented exception: the core kernel (`core/http`, `core/rbac`) may import the shared runtime trio — `shared/auth`, `shared/errors`, `useAuthStore`/`useOrganizationStore` (see `agent-os/rules/file-structure.mdc` → Import Rules; enforced in `eslint.config.mjs`).

## Route Marker Convention (`<page>.route.tsx`)

Every directory under `src/pages/` that corresponds to a frontend URL path **must** contain a **`<page>.route.tsx`** file (page-prefixed, lowercase-dotted). This file is the boundary between routes.

**The rule in five lines (read this first):**

1. **`src/pages/` mirrors the URL tree 1:1.** `/login` → `pages/login/`; `/organization/acme/dashboard` → `pages/organization/$organizationSlug/dashboard/`. Children nest **directly** (no `sub-pages/` bucket); dynamic segments are `$param` folders — except a **param-only leaf**, which owns the param in its route path instead of a `$param/` folder (`accept-invite/` owns `/accept-invite/$invitationId` flat because the parent segment has no page of its own). Exceptions: `/` is a pure resolver route (redirect only, no island); app-shell routes with no feature island — `/unauthorized`, the `$` 404 splat (`UnauthorizedPage`/`NotFoundPage`), and the personal-mode `/dashboard` shell (deployment-mode split, reuses the org dashboard island) — live in `src/app/routes/`, not `src/pages/`.
2. **Every page folder maintains the same 4 files** — `<page>.route.tsx`, `<page>.manifest.ts`, `<Page>Page.tsx` (or `Layout`), `<PAGE>.OVERVIEW.md` — plus 2 registrations: `routeTree.tsx` and `docs/reference/routes-and-ui.md`. In `$param` folders the prefix derives mechanically: strip `$`, kebab-case (`$organizationSlug/` → `organization-slug.route.tsx`, `ORGANIZATION_SLUG.OVERVIEW.md`).
3. **Page shells live in `shared/layouts/`** — AuthLayout via the pathless `auth-shell` route; AppLayout via the `pages/organization/$organizationSlug/` layout island (the org guard boundary). No grouping directories under `pages/`.
4. **Code used by 2+ page islands lives in `shared/`** (e.g. `shared/api/auth-api.ts`, `shared/tenancy/`).
5. **Settings is a global hash modal, not a route space** — `#settings/<scope>/<section>` opens `shared/components/SettingsModal/` over any page (see `agent-os/rules/file-structure.mdc` → Settings hash modal). Full spec: `docs/reference/routing-and-tenancy.md`.

**Source of truth for what is live today:** [`src/app/routes/routeTree.tsx`](src/app/routes/routeTree.tsx) and [`docs/reference/routes-and-ui.md`](docs/reference/routes-and-ui.md). The tree below mixes **implemented** routes with **common examples** (same shapes as new features).

```text
src/pages/
├── login/                           ← /login (AuthLayout via pathless auth-shell)
│   ├── login.route.tsx
│   ├── login.manifest.ts                ← manifest
│   ├── LoginPage.tsx                ← top-level UI
│   ├── LOGIN.OVERVIEW.md
│   └── forms/LoginForm/             (folder-per-unit)
├── mfa/                             ← /mfa (AuthLayout via auth-shell)
├── callback/
│   └── callback.route.tsx           ← /callback (one URL for every OAuth provider)
├── onboarding/   accept-invite/
└── organization/
    ├── organization.route.tsx       ← /organization (picker)
    ├── organization.manifest.ts
    ├── OrganizationPickerPage.tsx
    └── $organizationSlug/             ← /organization/acme — org guard boundary
        ├── organization-slug.route.tsx     ($param folder → strip-$ kebab prefix)
        ├── organization-slug.manifest.ts       kind: 'layout', children: [dashboard, suspended]
        ├── OrganizationLayout.tsx        mounts shared AppLayout
        ├── ORGANIZATION_SLUG.OVERVIEW.md
        ├── dashboard/               ← …/dashboard — full island (api, contracts, hooks/, components/)
        ├── suspended/               ← …/suspended — status-guard target
        └── patients/                ← (example) future islands nest directly: patients/$patientId/…
```

### Page Directory Shape (route island)

Every route uses a **route island** ([`agent-os/skills/route-island/SKILL.md`](agent-os/skills/route-island/SKILL.md), [`docs/reference/route-island-structure.md`](docs/reference/route-island-structure.md)). Layout parents nest children **directly** as `<segment>/` (or `$param/`). **`<page>.manifest.ts`** is the layout + leaf manifest; top-level UI is `<Page>Page.tsx` / `<Page>Layout.tsx` at island root; tests are colocated next to source (sub-units use folder-per-unit).

```text
src/pages/<page>/                          ← folder = URL segment
│
│══ MANDATORY — every page, validator-enforced ════════════════════════════
├── <PAGE>.OVERVIEW.md                     entry doc: purpose, files, test ids
├── <page>.route.tsx                       lazy boundary — `Component` only; RBAC in routeTree `beforeLoad`
├── <page>.manifest.ts                     manifest — path, title, testId, permission, kind, children
├── <Page>Page.tsx | <Page>Layout.tsx      top-level UI (Layout + <Outlet/> when kind:'layout')
│
│══ OPTIONAL — the page's OWN data layer ══════════════════════════════════
├── <page>.contracts.ts                    Zod schemas + types for THIS page's API shapes
├── <page>.api.ts                          fetchers → shared apiClient   (PRIVATE to this page,
│                                          even from its children — sharing goes via shared/)
├── <page>.fixtures.ts                     optional placeholder data (REPLACE_WITH_API)
├── <page>.search.ts                       URL search-param schema (validateSearch)
├── <page>.constants.ts                    page-scoped constants
├── <page>.resource.ts                     resource manifest (resource pages only)
│
│══ OPTIONAL — units (each: <X>.tsx + <X>.test.tsx + index.ts) ════════════
├── components/<Widget>/                   page-only widgets
├── forms/<Name>Form/                      page-only forms
├── hooks/use<X>/                          page-only Query hooks (wrap <page>.api.ts)
├── dialogs/<Name>Dialog/                  URL-driven dialogs (resource pages)
├── store/use<X>Store/                     RARE page-local Zustand
├── __tests__/integration/                 this page's cross-component flows
│
│══ OPTIONAL — FAMILY-SHARED (kind:'layout' only) ═════════════════════════
├── shared/                                used by THIS page + its children — never other families
│   ├── components/<X>/  hooks/use<X>/     same unit shapes as root shared
│   └── <name>-contracts.ts · <name>-api.ts   family-scoped plain modules
│
│══ OPTIONAL — children (kind:'layout' only; disk mirrors URL) ════════════
└── <child>/  ·  $param/                   full recursive copy of this exact anatomy
                                           (`shared` & unit names are reserved — can't be routes)
```

### `<page>.route.tsx` Contract

```tsx
// Every <page>.route.tsx must export Component (required).
// Optional exports: ErrorBoundary (only if wired in routeTree — rare).
// Do NOT export loader() for RBAC — routeTree beforeLoad + gatewayFromManifest
// are the single enforcement point (lazyRouteComponent loads Component only).

import { DashboardPage } from './DashboardPage.tsx';

export function Component() {
  return <DashboardPage />;
}
```

Protected routes register access in `routeTree.tsx`:

```tsx
beforeLoad: async ({ location, params, preload }) => {
  if (preload) return;
  await gatewayFromManifest(dashboardManifest)(toGateContext(location, params));
},
```

### Dialog vs Full Page Decision

- **Full page**: a new directory with `<page>.route.tsx`.
- **URL-driven dialog** (Create/Edit on resource pages): a direct child `<segment>/<segment>.route.tsx` that renders `null`; the parent list page reads URL and opens the matching dialog.
- **Action dialog** (no URL needed, e.g., delete confirm): inline `AlertDialog`, no `route.tsx`.
- Rule: Everything between two `<page>.route.tsx` files belongs to the parent.

### CRUD URL convention (resource pages)

| Action | URL                     | Renders              |
| ------ | ----------------------- | -------------------- |
| List   | `/<resource>`           | Page                 |
| Create | `/<resource>/create`    | Dialog over list     |
| Show   | `/<resource>/[id]`      | Page or dialog       |
| Edit   | `/<resource>/[id]/edit` | Dialog over list     |
| Delete | (no URL)                | Inline `AlertDialog` |

## Shared Layer

```text
src/shared/
├── components/
│   ├── ui/                          # shadcn/ui primitives — FLAT (button.tsx, card.tsx, ...)
│   └── <Name>/                      # cross-page components — folder-per-unit
├── forms/<Name>/                    # cross-page forms — folder-per-unit
├── hooks/
│   ├── use<X>/                      # cross-page custom hooks — folder-per-unit
│   └── useList/, useOne/, useCreate/, useUpdate/, useDelete/   # standard CRUD hooks
├── layouts/<Name>/                  # AuthLayout, AppLayout, PublicLayout, LayoutVariantFallback
├── api/                             # cross-page API helpers (auth, organization, billing, mfa,
│                                    #   passkeys, sessions, webhooks, notifications) — plain modules
├── auth/                            # auth runtime (token, refresh-timer, idle-timeout, service, captcha)
├── tenancy/                         # URL-driven org context, membership, resolver, deployment-mode
├── icons/                           # icon registry (import from @/shared/icons, never lucide-react)
├── analytics/  billing/  notifications/  notify/  theme/  errors/   # cross-page feature areas
└── store/                           # global Zustand
    ├── useAuthStore/
    ├── useOrganizationStore/
    ├── useThemeStore/
    ├── useUIStore/
    ├── useOnboardingStore/
    ├── useConsentStore/
    └── useLocaleStore/
```

### Promotion ladder

Everything starts colocated with its page and climbs exactly one rung per force:

```text
ONE page                            → inside that page
page + its OWN nested children      → pages/<parent>/shared/   (family-shared)
DIFFERENT families, or any
src/shared component needs it       → src/shared/              (root shared)
platform-level                      → src/core/ or src/lib/
```

Family-shared is importable by the parent island and its descendants only — never by sibling families. Full rules: `agent-os/rules/file-structure.mdc` → Promotion ladder.

## Import Conventions

- Use the `@/` path alias for all cross-layer imports from `src/`; **within a page island use relative imports** (eslint forbids `@/pages/**` even from the same island).
- **Always** include `.ts`/`.tsx` extensions in import paths.
- Use `type` imports for type-only imports: `import type { User } from './types.ts'`
- **Icons:** import from `@/shared/icons/index.ts` — never `lucide-react` directly (eslint-enforced; vendored `components/ui/` is exempt). One-file icon-library swap.
- **Heavy deferred modules** (`@sentry/react`, `posthog-js`, the SettingsModal/CommandPalette trees) are **dynamic-import only** — a single static import drags their chunk onto the first-paint preload path (`pnpm build:check` tripwires this).
- **`routeTree.tsx` IS the entry chunk.** A surface the root route mounts exports **only its lazy shell** from its barrel (`SettingsModalLazy`, `AppearanceDialogLazy`, `ConsentBannerLazy`), and an entry-resident module never imports a large constants table for a few keys — declare them locally and pin them with a drift test. Attribution method + the other levers: `agent-os/skills/bundle-performance/SKILL.md`.

```tsx
// Good
import { Button } from '@/shared/components/ui/button.tsx';
import type { User } from './contracts.ts';

// Bad
import { Button } from '@/shared/components/ui/button';
import { User } from './contracts';
```

## TypeScript

- Strict mode: `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`
- Define data shapes as **Zod schemas** in `contracts.ts`; infer TS types from them.
- Never use `any` — use `unknown` and narrow with type guards.

## State Management

| Scope                                        | Library                   | Location                                                          |
| -------------------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| Server state                                 | TanStack Query            | `pages/<page>/hooks/use<X>/` or `shared/hooks/use{List,One,...}/` |
| Global client state                          | Zustand                   | `src/shared/store/use<X>Store/`                                   |
| Cross-page API helpers (org domain, tenancy) | Plain modules             | `src/shared/api/`                                                 |
| Page-local UI state                          | Zustand                   | `src/pages/<page>/store/use<X>Store/` (rare)                      |
| Component-local                              | `useState` / `useReducer` | Inline; extract reducer to `<Component>.reducer.ts` when complex  |
| Form state                                   | react-hook-form + Zod     | Inside the form component                                         |
| URL state                                    | TanStack Router           | `<page>.search.ts` (validateSearch schema)                        |

**Never** store API data in Zustand — TanStack Query owns server state. Page-local stores are an escape hatch (try `useState` → `useReducer` → URL search params first). Reducers live next to their component; no `reducers/` directory.

## Component Patterns

- **shadcn skill (single source of truth):** for all shadcn/ui work — adding, fixing, styling, composing, CLI, **and choosing which component to use** — follow **`agent-os/skills/shadcn/SKILL.md`** (installed via `pnpm dlx skills add shadcn/ui`). It contains the CLI workflow, Critical Rules, and the project's allowed-sources/selection policy (the former `shadcn-component-selection` skill is merged into it). Add components with `pnpm dlx shadcn@latest add …`; the always-applied rule is `agent-os/rules/ui-sources.mdc`.
- Functional components only (no class components).
- shadcn/ui components use **plain functions** (not `React.forwardRef`) — React 19 forwards refs automatically — with `data-slot` attributes. Two deliberate exceptions keep `React.forwardRef`: `input.tsx` and `textarea.tsx` (for react-hook-form `register()`).
- shadcn/ui imports from `radix-ui` monorepo (not individual `@radix-ui/react-*` packages).
- Compose styles with `cn()` from `@/lib/utils.ts` (clsx + tailwind-merge).
- Use `cva` (class-variance-authority) for variant-based component APIs.
- All interactive elements must have proper ARIA attributes.

## Styling

- **Tailwind CSS v4** with CSS-first config in `src/index.css`.
- Design tokens via `@theme` directive (OKLCH color space).
- Dark mode via `.dark` class — managed by `useThemeStore`.
- Never use inline styles — use Tailwind utility classes.
- **Corner radius + shape follow the theme, everywhere.** Use a **named** radius step (`rounded-xs` … `rounded-4xl` — all derive from the Corner radius axis); a bare `rounded` or `rounded-[3px]` follows nothing and fails `pnpm validate:theme-axis`. `rounded-full` on a surface (chip, count badge, icon disc, track) carries `data-slot="pill"` so the **Sharp** shape can square it; status dots and blurred glows stay round. Never an unconditional `rounded-none`.
- **Screen tiers:** Tailwind's scale plus `3xl` (1920px) and `4xl` (2560px) from `index.css` — layouts keep growing on big monitors. The sidebar is a **drawer below `lg`** (invisible when closed); the bottom tab bar lives below `md` and anything else pinned to the bottom rides above it via `--floating-bottom-offset`. Full rules: `docs/reference/design.md` → Screen tiers.
- **Semantic tokens only** in app code — `bg-background`, `text-success`, `bg-brand`, `bg-overlay/50`, never raw palette classes (`bg-emerald-400`, `text-white`); enforced by `pnpm validate:tokens` (vendored `components/ui/` exempt). A future theme is then just a CSS file of token values.
- shadcn/ui components live in `src/shared/components/ui/`.
- **Aesthetic quality:** when building/styling/beautifying UI, apply **`agent-os/skills/frontend-design/SKILL.md`** (typography hierarchy, intentional theme, high-impact motion, composition, memorable details) — but **within** the guardrails: shadcn components, neutral semantic tokens (no raw colors), configured fonts/brand, and `web-design-guidelines` for a11y. It elevates craft; it does not override the component library, tokens, or brand.
- **Design intelligence (advisory):** query **`agent-os/skills/ui-ux-pro-max/`** for styles, palettes, font pairings, UX/stack/chart guidance (`python3 agent-os/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <…> [--stack shadcn]`). Advisory only — never overrides neutral tokens, configured fonts/brand, or shadcn choices.

## HTTP / API

- Use `apiClient` from `@/core/http/fetch-client.ts` for all API calls.
- Exception: the auth service uses raw `fetch` (`authFetch`) to avoid interceptor recursion.
- The fetch client is the reactive auth layer: Bearer attach, single-flight 401 refresh
  (concurrent 401s share ONE refresh) + one replay — a second 401 after a fresh token
  means the session is dead → `forceLogout()`. Writes auto-carry an `X-Idempotency-Key`
  (minted once per logical request, reused across retries/replay). Organization context:
  the **app URL** drives the active org — guards sync it via `/auth/switch-to-organization`,
  which re-mints the access token with a signed `org` claim. API requests carry **no**
  org header (`X-Organization-ID` does not exist) and no org id path segment; the backend
  scopes from the token claim.

## Environment Variables

Two **deploy** environments — **development** and **production** — each configured in its
own gitignored file, plus a **`local`** developer environment (`.env.local`, the default —
mirroring core-be's `NODE_ENV=local`). **One `.env.<environment>` file per environment.**
`.env.example` is the **only committed** file. Deploys inject env from **GitHub
Environments** (never from files). No shared `.env`, no `.env.staging`. `pnpm setup:local`
scaffolds `.env.local`; `pnpm dev` loads it.

The **environment identity is an env variable, not the Vite mode**: `VITE_APP_ENV` is exactly
`local | development | production` — three environments, no `test` (an out-of-enum value fails
loudly at load in `env.config.ts`), and the **default is `local`** — mirroring core-be's
`NODE_ENV=local` so both repos share one env vocabulary. It is decoupled from Vite's `mode`
because **Vite 8 forbids a mode literally named `local`**; Vite's mode is a mechanism detail
(dev → `development`, build → `production`, Vitest → its default `test` mode). `local` is not a
deploy target (`DeployEnvironment` stays `development | production`, while `AppEnvironment` adds
`local` for its load-time contract). A **test run is not its own environment** — it reports
`local` and is marked by the **`VITE_TEST_MODE`** env variable (injected by `plugins/test-env.ts`,
read via `platformConfig.testMode`), the single home for any test-only behavior. Vite loads
`.env.local` in every mode, so the Vitest runner's `envDir` is pointed at an empty dir
(`tooling/test/empty-env/`) to keep the suite hermetic.

```text
.env.example         # Reference for all env vars — the ONLY committed file
.env.local           # Local dev file (gitignored, NODE_ENV=local — the default): flags + secrets
.env.development     # `development` deploy-env file (gitignored): dev-tooling ON
.env.production      # `production` deploy-env file (gitignored): dev-tooling OFF (prod-safe)
```

- `VITE_` prefix = bundled into the client (public). No prefix = build-time only.
- Secrets go in GitHub Environments (deploy) or the gitignored `.env.local` (local) —
  never committed. A guardrail blocks agent edits to `.env*` (apply them yourself).
- **Behavior is env-driven, never mode-sniffed.** No `import.meta.env.DEV/PROD/MODE`
  **and no `platformConfig.environment === '<name>'`** branching in app code — named
  schema flags drive it: `VITE_DEBUG_LOGGING`, `VITE_DEVTOOLS`, `VITE_E2E_HOOKS`,
  `VITE_VERSION_CHECK`, `VITE_CAPTCHA_DISABLED` → read via `platformConfig`. `environment`
  is only ever a reported value (Sentry/PostHog tag). The three allowlisted raw readers
  (`tooling/validate/vite-env-reads.mjs`) are the config bootstrap (`env.config.ts`),
  `src/lib/i18n/build-env.ts`, and `src/core/version/check.ts` (only the Vite builtin
  `BASE_URL` — a build constant, not a mode sniff).
- **One behavior = one env variable.** Each behavior is owned by **exactly one** key, and
  `platformConfig` reads that key **1:1** — no umbrella, alias, or `VITE_DEVTOOLS || <other>`
  derived-from-another-flag logic. Never add a second variable that also drives a behavior
  another key already owns: two keys for one thing means ambiguous precedence (one value
  silently ignored) and two sources of truth. To move several flags together for a context
  (the test runner, a given deploy), set **each one's own key** at the **env layer** —
  `plugins/test-env.ts`, `.env.<environment>`, GitHub Environments — never by combining them
  in code. Conditions live in env; code stays 1:1.
- **Strict allowed values per environment.** `envProfiles.<env>.allowed` in `env-schema.ts`
  declares the permitted value set per key; `pnpm validate:client-env` **hard-fails** on
  a value out of range (e.g. production requires the diagnostics flags off, version-check on).
- **Per-environment defaults.** `envProfiles.<env>.defaults` in `env-schema.ts` is the single
  source of truth for each environment's starting values (local + development: dev-tooling on;
  production: safe). `pnpm setup:local` writes `envProfiles.local.defaults` into `.env.local`
  (via `injectEnvDefaults`); every default must be ⊆ that key's `allowed` (test-enforced). NOT
  applied by the runtime — defaults reach the app through the env layer, never a mode branch.
- **Tests are hermetic by construction:** the Vitest `envDir` points at an empty dir
  (`tooling/test/empty-env/`), so the runner (in `local` mode) loads no env files — not even
  `.env.local`, which Vite otherwise loads in every mode — and the suite runs on schema
  defaults on every machine and on CI. Genuine test-runner env needs are injected by plugins,
  not app code or a manual pin: `plugins/i18n-build.ts` (multi-locale) and `plugins/test-env.ts`
  (`VITE_TEST_MODE` on, captcha off).
- **Where to get credentials and optional env:** docs/integrations/credentials-and-env.md

## Auth & Security

- Access token stored in memory only (module closure in `shared/auth/token.ts`).
- Refresh token is an HttpOnly cookie (set by backend).
- Never store tokens in localStorage or sessionStorage.
- **One refresh path:** `refreshAccessToken()` in `shared/auth/service.ts` is the ONLY code
  allowed to call `/auth/refresh` — a module-level single-flight dedupes concurrent callers
  (proactive timer, 401 interceptor) and a `navigator.locks` Web Lock (`core-auth:refresh`)
  serializes tabs. Never add a second refresh call: the backend rotates refresh sessions
  with reuse-detection, so parallel refreshes kill the session.
- **Ending a session is a server-side act.** `logout({ reason })` revokes (`POST /auth/logout`) and THEN clears locally; it is the ONE way to end a live session — user menu, command palette, **the idle-timeout dialog (button and deadline) and the absolute session cap**. `forceLogout()` is **local only**: used alone on a live session it signs nobody out (the HttpOnly refresh cookie survives, `/login` silently refreshes, the guest guard bounces the user back in) — it is right only when the server session is already gone. A revoke that cannot reach the server (offline on wake) is finished at the next boot via a `core:logout-pending` flag; a deliberate end also suppresses auto-Google sign-in. Details: `src/shared/auth/AUTH.OVERVIEW.md`.
- **The idle timer** (`shared/auth/idle-timeout.ts`) is deaf to activity in its own tab while the warning is up (a press on the dialog's own button IS `document` activity), measures idle time on the wall clock (sleep/throttling cannot stretch it), and shares activity across tabs.
- `assetsInlineLimit: 0` in Vite config for CSP compliance.
- CSP ships as a build-generated **header** (`dist/_headers`, authoritative) plus an
  `index.html` meta fallback, both from `lib/csp-api-origin.ts`; set `VITE_CSP_REPORT_URI`
  to collect violations. Cross-tab logout (`shared/auth/auth-channel.ts`) kills every open
  tab when a session dies. Full model + accepted risks: **docs/reference/security-model.md**.

## Routing

- All routes are lazy loaded via `route.tsx` files.
- Route config lives in `src/app/routes/routeTree.tsx`.
- Protected routes use TanStack Router `beforeLoad` guards in `routeTree.tsx` — the `$organizationSlug` shell runs `requireAuth → requireTeamDeployment → requireProvisionedWorkspace → resolveActiveOrg` (context sync from the URL); leaf routes then run `gatewayFromManifest` (session → module → permission) followed by `requireOrgStatus`; see `src/app/guards/GUARDS.OVERVIEW.md`.
- RBAC enforcement in `routeTree.tsx` `beforeLoad` via `gatewayFromManifest(manifest)` (+ tenancy guards).
- **Pending policy has two phases, not a list of routes.** `BOOT_PENDING_POLICY` (pending component at once, **no** 500ms minimum) until the first navigation resolves — the pending component holds the HTML splash, so every cold URL is one continuous screen — then `IN_APP_PENDING_POLICY` (keep the current screen ≤ 3s, 500ms minimum). No route sets `pendingMs`/`pendingMinMs`. While `/auth/refresh` is in flight, `preloadBootRoutes()` warms the destination's chunks, steered by `hasSessionHint()` — a **hint that never authorizes**.
- **Settings lives in the hash, so two things follow.** (1) A same-route `navigate({ to: '.' })` must **state the hash** — the router resolves an omitted `hash` to none, which closes the modal (`hash: true` keeps it, `hash: ''` clears it on purpose; ESLint rejects neither). Stripe's return params are cleared through `stripeReturnCleanupNavigation()`. (2) The modal decides nothing — and canonicalizes nothing — until it has **both** answers: me/context _and_ the permission set (`useAccessResolved()`); an empty **unresolved** list is "not known yet", never "not allowed". Spec: `docs/reference/routing-and-tenancy.md` §7.
- Every manifest-backed route sets `head: manifestHead(manifest)` (`lib/routes/page-head.ts`) — app-shell routes without a manifest (`/unauthorized`, the `$` 404 splat) use inline `composePageTitle`; the document
  title comes from `manifest.title` as `` `<title> · <PRODUCT_NAME>` `` (`APP_TITLE = PRODUCT_NAME`); the root-mounted
  `RouteAnnouncer` announces it to screen readers on SPA navigations.

## New-deployment detection

- **Plugin** `plugins/version-json.ts`: at build time sets `VITE_APP_BUILD_ID` and writes/serves `version.json` (dev: middleware; prod: `dist/version.json`). `builtAt` is UTC (ISO 8601).
- **Runtime** `src/core/version/check.ts`: polls `/version.json` (every 5 min while visible + on tab refocus); if `buildId` differs from the app’s build, shows a persistent **“Update available”** toast with **Refresh now** (`app/version/show-update-available-toast.ts`) and **defers** `location.reload()` until it won’t lose work — never while a field is focused, immediately when the tab is hidden, otherwise once the user is idle (~60s) — at most **once per advertised buildId** (sessionStorage marker). The reload is **handed through the service worker** (pre-warmed `update()` at detection; `SKIP_WAITING` → `controllerchange` → reload, 10s deadline fallback) so it lands on the NEW precached shell — `src/sw.ts` activation is deliberately message-driven, never an unconditional `skipWaiting()`.
- **Stale chunks are the second path** `src/core/version/stale-chunk-recovery.ts`: a tab open across a deploy still `import()`s the old hashed chunks, and Vite raises `vite:preloadError`. That event is **not** a stale-chunk signal by itself — offline, a flaky CDN and the cosmetic prefetches (`initDeferredIconSets`, `preloadBootRoutes`) raise it too — so the handler first asks `version.json` whether a **different `buildId`** is advertised (`isNewBuildAdvertised()`), and only then runs the same `reloadOntoLatestBuild()`: once per `buildId`, under its OWN sessionStorage key, never over a focused field. It never calls `preventDefault()` — Vite's helper is `import().catch(dispatch)`, so suppressing the rethrow would make the import **resolve with `undefined`** and the caller report a misleading `TypeError`. `netlify.toml` also answers a missing `/assets/*` with a real **404** instead of the SPA `index.html` rewrite (whose 200 surfaces as a bogus MIME-type error), but recovery does not depend on it. Both reload paths share `reload-marker.ts` and `lib/editable-focus.ts`; `pnpm build:check` tripwires any source map anywhere under `dist/` (the SW's own Vite pass used to write `dist/sw.js.map`).

## PWA manifest and icons

- **Source of truth:** `src/core/config/app-manifest.ts` → `public/manifest.webmanifest` (drift test: `app-manifest.test.ts`).
- **Icons:** `public/app-icon.svg` (Lucide Boxes on `#0a0a0a`); PNGs via `rsvg-convert`. Skill: `agent-os/skills/pwa-manifest/SKILL.md`.
- **Local perf audit:** `pnpm build && pnpm preview` — see `docs/reference/local-production-perf.md` (never Lighthouse on dev server).

## Testing

**Full matrix:** [docs/reference/testing.md](docs/reference/testing.md) · [tests/README.md](tests/README.md)

- **Global tests, helpers:** **`tests/`** at project root
  - **Helpers:** `tests/utils/` — `renderWithProviders`, `e2e-hybrid`, `e2e-auth`, `axe-for-dialog`; import as `@/tests/utils/...`
  - **Security:** `tests/security/` — Vitest security project (`*.security.test.ts`)
  - **Performance:** `tests/performance/` (optional) — Lighthouse, bundle-size
- **Colocated unit tests:** `src/**/*.test.{ts,tsx}` (+ `pages/**/__tests__/integration/` for cross-component flows)
- **E2E:** `tests/e2e/*.e2e.test.ts` (Playwright) — requires **core-be** on `:3000` (`global-setup.ts` fails if down). Never `.spec.ts`.
- **Hybrid E2E selectors:** `data-testid` for actions, `getByRole`/`getByLabel` for a11y guards — `agent-os/skills/playwright-e2e/SKILL.md`, `tests/utils/e2e-hybrid.ts`. A control mounted per breakpoint shares one test id, so reach it with `byTestId()` (visible + first); never `.catch()` an `isVisible()` / `isEnabled()` feature check (ESLint-enforced) — it can only hide a strict-mode violation and turn the spec into a silent skip. **Read the skipped count.**
- **Gates:** `pnpm validate:structure` (colocation), `pnpm validate:testids` (page/form/shell testids), `pnpm validate:theme-axis`, `pnpm coverage:patch` (PR changed-lines ≥ 90%)
- Unit/security: Vitest; E2E: Playwright (Chromium). Component tests require `vitest-axe`; portaled dialogs use `axeForDialog`.

**Dev API:** In development, Vite proxies `/api` to `VITE_DEV_API_URL` (default `http://localhost:3000`). The FE always uses `apiClient` / `authFetch` against **core-be**. Unit tests stub modules with `vi.mock()` — no HTTP server.

## Git branch naming

Working branches are `<type>/<short-description>`; `main` is the only long-lived branch. Enforced by [`.husky/pre-push`](.husky/pre-push) (rule: `agent-os/rules/git-branch-naming.mdc`, owner: **code-quality-security**).

**AI web sessions start on a throwaway name.** Claude Code web assigns `claude/<platform-slug>` (e.g. `claude/session-request-wx3euu`) before the container boots. The slug is generated platform-side and is **not configurable from this repo** — no file here changes it. Rename it to a meaningful name rather than shipping it.

**Name the branch before the first push.** The cloud git proxy accepts a push to _any_ branch name but **rejects every form of delete** (`git push --delete`, `git push :ref`, and `DELETE /git/refs/...` → 403, even for a ref that does not exist). A `claude/*` branch that has already been pushed therefore cannot be cleaned up from inside the session. Renaming first means the throwaway name never reaches the remote:

```sh
git branch -m docs/branch-naming-guidance      # rename in place, BEFORE any push
git push -u origin docs/branch-naming-guidance
```

Already pushed as `claude/*`? Leave it — it disappears when the PR squash-merges. Never open a second PR just to fix a branch name.

**Deriving the name** — `<type>` is the change's conventional-commit type (`feat`, `feature`, `fix`, `hotfix`, `chore`, `ci`, `docs`, `refactor`, `test`, `perf`, `build`, `style`, `revert`, matching the accepted-prefix regex in `.husky/pre-push`); `<short-description>` is kebab-case, 2–5 words, ≤ 40 chars, naming the change itself (never a ticket id or a date). Keep it aligned with the commit subject and PR title.

| Change                                | Branch                                |
| ------------------------------------- | ------------------------------------- |
| Fix British spelling in a doc         | `docs/american-spelling-organization` |
| Add the billing invoices route island | `feat/billing-invoice-route`          |
| Org guard drops the slug on refresh   | `fix/org-slug-guard-refresh`          |
| Bump Vite to 8.1                      | `chore/bump-vite-8-1`                 |
