# Frontend platform — cross-cutting runtime

How the SPA bootstraps session context, gates routes, handles errors, and
coordinates optional modules. Complements
[`routing-and-tenancy.md`](./routing-and-tenancy.md) and
[`security-model.md`](./security-model.md).

---

## Boot order

```text
main.tsx
  1. resolveOrganizationFromSubdomain()     — seed org store from hostname (sync)
  2. bootstrapResources()                   — register resource manifests (L7)
  3. React mount (App → RouterProvider)
  4. startAuthBootstrap()                   — silent refresh + hydrateSessionContext
  5. initObservabilityWhenIdle()            — Sentry + consented analytics
  6. startVersionCheck()                    — new-deployment reload (prod)
  7. subscribeToAuthBroadcast()               — cross-tab logout
```

**Session context** (`shared/tenancy/session-context.ts`):

| API                             | When                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `hydrateSessionContext()`       | Fetch `me/context`, seed React Query + derived org store  |
| `invalidateSessionContext()`    | Drop cached context (logout side-effects, forced refresh) |
| `invalidateMembershipContext()` | Session + per-org permission cache reset                  |

Auth bootstrap (`shared/auth/service.ts`) calls `hydrateSessionContext()` after
token refresh. Workspace guards and `/` resolver share the same helper.

Logout and a newer login invalidate the auth generation and session-context
generation before publishing new state. Delayed refresh results must not restore
tokens or users; invalidated context reads reject with `AbortError` before seeding
the query cache, deriving organization state, or returning stale context to a guard.
`hydrateSessionContext(isCurrent?)` also accepts an owner-readiness predicate for
auth hydration. Single-flight cleanup is identity-checked so an older request
cannot clear the promise belonging to a newer session.

These checks protect pending work, not context already delivered to a caller.
Callers doing further asynchronous work must recheck their session before committing
side effects. Keep regression tests for delayed responses, queued refresh locks,
logout, and a newer successful login; do not substitute browser `fixme` or silent
skips for verification.

---

## Configuration

Platform behavior is driven by validated env → `platformConfig` (not runtime config
APIs from core-be).

```text
src/core/config/env-schema.ts     — Zod schema + envSchemaKeys (script-safe)
src/core/config/env.config.ts     — getClientEnv(), window.__CONFIG__ overrides
src/core/config/platform-config.ts — PlatformConfig (auth, modules, deployment)
src/core/config/auth-methods.ts   — AuthMethods + enabledOAuthProviders()
src/lib/i18n/build-env.ts         — allowlisted Vite build injections (buildId, i18n mode)
```

| Concern                 | Env / API                                                                         | Notes                                     |
| ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| Auth surface (login UI) | `VITE_AUTH_*`                                                                     | Env-only. No `GET /auth/oauth/providers`. |
| Feature modules (L6b)   | `VITE_DISABLED_MODULES`                                                           | Comma-separated keys on manifest `module` |
| Org deployment mode     | `me/context` + optional `VITE_PERSONAL_ORGANIZATIONS` / `VITE_TEAM_ORGANIZATIONS` | Env override when set                     |
| Session / active org    | `GET /auth/me/context`                                                            | Not env                                   |
| Post-deploy overrides   | `window.__CONFIG__` in `public/config.js`                                         | Keys without `VITE_` prefix               |
| Build metadata          | `VITE_APP_BUILD_ID`, `VITE_APP_VERSION`, `VITE_I18N_BUILD_*` (Vite plugins)       | Read via `build-env.ts` only              |

**Tooling:** `pnpm tool:sync-env-example` keeps `.env.example` in sync with the schema.
**Validators:** `pnpm validate:vite-env` (no env/mode sniffing — `import.meta.env.VITE_*`/`DEV`/`PROD`/`MODE` outside the allowlist, or `.environment`/`.MODE ===` compares),
`pnpm validate:client-env --env <development|production>` (per-environment required + forbidden + strict `allowed` value sets).
**Operators:** [environment-variables runbook](../deployment/runbooks/environment-variables.md).
**Adding keys:** `agent-os/skills/env-schema-add/SKILL.md`.  
**Platform read paths & validators:** `agent-os/skills/platform-hygiene/SKILL.md`.

---

## Security gateway (L1 → L6b)

Composable gates live in `core/security/gateway.ts`:

```ts
gatewayFromManifest(manifest) // manifest.permission + manifest.module + manifest.onDeny
gatewayFromPolicy({ permission, module, onDeny })
gateway(requireSession, requirePermissionGate(...), requireModuleGate(...))
```

Protected routes in `routeTree.tsx` call `gatewayFromManifest` where the island
declares RBAC/module policy (e.g. dashboard). Org-scoped tenancy gates
(`resolveActiveOrg`, `requireOrgStatus`, …) run **before** or **after** per route
needs — see [`GUARDS.OVERVIEW.md`](../../src/app/guards/GUARDS.OVERVIEW.md).

`requireFeature(moduleKey)` in `core/security/gates/require-module.ts` is a
synchronous helper for ad-hoc loaders. Routes with a manifest should use
`gatewayFromManifest` (L6b via `manifest.module`) instead — disabled modules
resolve to `notFound()` (404).

---

## Module key catalog (L6b)

Deployment env `VITE_DISABLED_MODULES` (comma-separated) disables feature
surfaces. Manifest `module` keys must match this catalog:

| Key            | Surfaces (today / planned)                                               |
| -------------- | ------------------------------------------------------------------------ |
| `billing`      | Dashboard reference manifest; settings billing panel; subscription hooks |
| `members`      | Members resource registry reference; settings members panel              |
| `integrations` | Settings integrations panel (planned)                                    |

UI should hide nav/settings entries via `isModuleEnabled()` when a module is
off — routes still 404 via the gateway if linked directly.

---

## HTTP errors

| Concern             | Location                                                              |
| ------------------- | --------------------------------------------------------------------- |
| User-facing message | `shared/errors/errorHandler.ts` → `mapApiError`                       |
| 422 → form fields   | `lib/forms/map-validation-errors.ts` → RHF `setError`                 |
| 429 rate limit      | `shared/errors/rate-limit.ts` + `RateLimitNotice` component           |
| Global toast        | `notifyError()` / `notify.ts` via query/mutation `meta.notifyOnError` |

**Custom toasts:** application code calls `notify.ts`, which assigns or preserves
a stable ID before publishing immediate feedback and handing it to the deferred
`notify-runtime.tsx` adapter. Keep that ID across replacement, dismissal, and
renderer handoff. Never forward an undefined ID to Sonner's `toast.custom()`;
the bridge, not Sonner, owns ID generation for this path. The renderer adapter
and real-Sonner integration tests protect dismissal and replacement behavior.

**422 mapping:** pass mutation errors through `mapValidationErrors(error, setError)`
before falling back to `notifyError`.

---

## Offline stance

The app is **online-first**. There is no offline mutation queue or service-worker
write path for API calls.

- `OfflineIndicator` (`shared/components/OfflineIndicator/`) shows a dismissible
  banner when `navigator.onLine` is false.
- TanStack Query retries skip 401 (auth interceptor owns refresh); other failures
  surface via `QueryBoundary` / `RetryError` on read paths.
- Users should not lose in-progress **local** drafts: onboarding uses
  `useUnsavedChangesGuard` + persisted `useOnboardingStore`; settings panels
  register dirty state via `SettingsDirtyProvider`.

Do not silently drop failed writes — show error + retry affordance.

---

## New-deployment reload

Production only (`startVersionCheck()` in `main.tsx`):

- Polls `/version.json` every **5 min** while visible + on tab refocus
  (`src/core/version/check.ts`); hidden tabs pause polling.
- First poll ~**2s** after bootstrap (`VERSION_CHECK_INITIAL_DELAY_MS`).
- When `buildId` differs from `VITE_APP_BUILD_ID`, shows a **persistent info toast**
  (“Update available” + **Refresh now**) via `app/version/show-update-available-toast.ts`,
  and **pre-warms** the new build’s service worker (`registration.update()`) so it is
  already `waiting` by reload time.
- **Dismiss (×)** snoozes re-notification for **15 minutes** per buildId
  (`version-update-snooze.ts`); idle / hidden-tab reload still applies as backstop.
- Reload is **deferred** until safe: not mid-edit; **immediately when the tab is
  hidden**; otherwise after ~60s idle.
- A **stale lazy chunk** is the second trigger, and it does not wait for the poll:
  a tab open across a deploy still `import()`s the old content-hashed files, which
  now 404 (`netlify.toml` answers a missing `/assets/*` with a real 404 instead of
  rewriting it to `index.html`). `vite:preloadError` →
  `src/core/version/stale-chunk-recovery.ts` → the same `reloadOntoLatestBuild()`,
  once per `buildId` under its own marker key, never over a focused field.
- The reload is **handed through the service worker** (`reloadOntoLatestBuild()`:
  `SKIP_WAITING` → `controllerchange` → reload, 10s deadline fallback) so it lands on
  the NEW precached shell — a bare `location.reload()` under the old controlling
  worker would re-serve the old one. `src/sw.ts` activation is message-driven, never
  an unconditional `skipWaiting()`. Both error boundaries reuse the same helper.
- User can tap **Refresh now** anytime — same reload path as the automatic one.
- At most one reload per advertised `buildId` (sessionStorage loop guard).

See **`docs/reference/cross-browser-support.md`** and **`docs/reference/tools-and-usage.md`**.

---

## Observability (Sentry)

Production error monitoring is wired whenever **`VITE_SENTRY_DSN` is set**
(`.env.local` for local QA, Netlify/GitHub for deploys). **Not** consent-gated
(unlike PostHog). Sentry env: **`local`** in `pnpm dev`, **`production`** on deploy.

| Layer                      | Location                                       | Sentry product                 |
| -------------------------- | ---------------------------------------------- | ------------------------------ |
| Init (idle, post-splash)   | `app/observability/sentry.ts`                  | SDK bootstrap                  |
| React root boundary        | `App.tsx` → `reportReactError`                 | Issues + component stack       |
| Route boundary             | `app/routes/ErrorBoundary.tsx` → `reportError` | Issues                         |
| Query/mutation failures    | `core/http/queryClient.ts`                     | Issues + query/mutation extras |
| Router + fetch tracing     | TanStack + `httpClientIntegration`             | Performance                    |
| Session replay + profiling | prod integrations only                         | Replays, Profiles              |
| Web Vitals (poor only)     | `app/observability/performance.ts`             | Issues (warning)               |
| Source maps                | `vite.config.ts` + CI secrets                  | Releases                       |

Full data catalog, env vars, local verification, and Sentry project checklist:
**[`docs/integrations/sentry-frontend.md`](../integrations/sentry-frontend.md)**.
PostHog + web-vitals analytics remain consent-gated; Sentry is not. Full PostHog
event catalog: **[`docs/integrations/posthog-frontend.md`](../integrations/posthog-frontend.md)**.

---

Use `shared/components/QueryBoundary` for **server-state panels** (settings
sections, dashboard widgets) that depend on TanStack Query:

1. **Wrap the query at the panel boundary** — parent holds `useQuery` / hook;
   child render-prop receives typed `data`.
2. **Do not** duplicate loading/error branches inline (`isLoading` + `<Skeleton>` +
   `isError` + `<p role="alert">`) when `QueryBoundary` covers the same UX.
3. **Mutations** stay outside the boundary — use `notifyError` / form helpers on
   failure.
4. **Custom loading** — pass `loading=` only when the default skeleton is wrong
   for the layout.
5. **Error copy** — pass `errorMessage=` for domain-specific retry text; default
   uses `errors` namespace.

Migrated panels: `OrganizationMembersPanel`, `OrganizationRolesPanel`,
`AccountBillingPanel`, `OrganizationGeneralPanel`, dashboard widgets.

---

## Loading Contract

Settings, appearance, and search keep their ready shell and static controls
visible. Skeletons belong only to unavailable dynamic content and reserve the
space that content will occupy. Existing content stays visible during refetch;
unknown authentication or permission state must not expose actionable controls.

A section must have its translation namespace before its copy renders. Deferred
chunks need contained failure handling without replacing the surrounding app.
Notification loading must preserve message identity, updates, dismissal, Undo,
promise settlement, and visible error feedback.

These are acceptance requirements, not a claim that every surface already meets
them. Validate each changed workflow with delayed and failed requests on desktop
and mobile production builds, and record remaining gaps in the PR. Preserve the
bundle budgets and measure actual startup work, including eager dynamic imports.

For implementation guidance, see the
[resilient-interactions skill](../../agent-os/skills/resilient-interactions/SKILL.md)
and [bundle-performance skill](../../agent-os/skills/bundle-performance/SKILL.md).

## Resource registry (L7)

Reference bootstrap in `core/resources/bootstrap.ts` (called from `main.tsx`):

- `membersResource` — schema + CRUD permissions for future members island
- `listResources()` — nav/dev-tools consumer

Full resource pages register in `<resource>.resource.ts` and call
`registerResource` at bootstrap when the island ships.

---

## Related

- [`pwa-manifest-and-app-icon.md`](./pwa-manifest-and-app-icon.md) — install surface + icon sync
- [`local-production-perf.md`](./local-production-perf.md) — Lighthouse / bundle on production build
- [`route-island-structure.md`](./route-island-structure.md) — manifest `module` field
- [`internationalization.md`](./internationalization.md) — i18n CI (`pnpm validate:i18n`)
- [`../deployment/runbooks/environment-variables.md`](../deployment/runbooks/environment-variables.md) — env schema, auth switches, deploy overrides
- [`../deployment/runbooks/csp-trusted-types-production.md`](../deployment/runbooks/csp-trusted-types-production.md) — CSP / Trusted Types ops
- [`../integrations/credentials-and-env.md`](../integrations/credentials-and-env.md) — where to get credentials
