---
name: fe-code-structure
description: Canonical code placement rules. Use when implementing a feature, adding a route/component/API, or deciding where to put code. Always apply this structure and auto-generate tests without asking.
---

# Code Structure — Where to Put What

This skill is the workflow. The contract is [`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc) — read it first if naming or shape is ambiguous.

## Dependency rule (one-way, one documented exception)

```text
ui (shadcn)  →  may import other ui primitives, lib
lib          →  may import lib, core/types
core         →  may import lib, core/types (+ runtime trio: shared/auth, shared/errors, useAuthStore/useOrganizationStore)
shared       →  may import core, lib, types
pages        →  may import shared, core, lib, types
app          →  may import everything
```

The runtime-trio exception is the only one — rationale in
[`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc) (Import Rules);
enforced precisely in `eslint.config.mjs`.

**Never:**

- Page imports another page (`pages/A` ↛ `pages/B`)
- Shared imports from pages
- Core imports from pages, app, or any shared module outside the runtime trio
- UI primitives import anything internal except other ui primitives and `lib`

## Directory layout

```text
src/
├── app/                          Application shell
│   ├── guards/                   ProtectedRoute, RBACGuard
│   ├── providers/                AppProviders, QueryProvider
│   ├── routes/                   routeTree.tsx, ErrorBoundary, NotFoundPage, UnauthorizedPage
│   └── analytics/, observability/   app bootstrap (PostHog, Sentry, web-vitals)
│
├── core/                         Framework-agnostic, app-state-free platform kernel
│   ├── http/, rbac/, config/, types/, version/
│   ├── data-provider/            CRUD abstraction (when adopted)
│   └── resources/                Resource registry (when adopted)
│   (auth runtime, errors, stores live in shared/ — see fe-file-structure.mdc)
│
├── pages/<page>/                 Route island — see fe-route-island skill
│   ├── <PAGE>.OVERVIEW.md
│   ├── <page>.route.tsx          lazy boundary
│   ├── <page>.manifest.ts            manifest
│   ├── <Page>Page.tsx            top-level UI (leaf) or <Page>Layout.tsx (layout)
│   ├── <page>.contracts.ts       Zod schemas
│   ├── <page>.api.ts             fetchers
│   ├── <page>.search.ts          URL search-param schema (optional)
│   ├── <page>.fixtures.ts        placeholder data (optional, REPLACE_WITH_API)
│   ├── store/use<X>Store/        rare — page-local Zustand
│   ├── components/<Name>/        folder-per-unit
│   ├── forms/<Name>Form/         folder-per-unit
│   ├── hooks/use<Name>/          folder-per-unit
│   ├── dialogs/<Name>Dialog/     folder-per-unit (resource pages)
│   ├── __tests__/integration/    cross-component flows
│   └── <child>/                  nested routes — direct children (recursive)
│
├── shared/                       Cross-page reusables
│   ├── api/                      cross-page API helpers (org domain, tenancy, my-orgs)
│   ├── auth/                     auth runtime: token, service, refresh-timer, idle-timeout
│   ├── errors/                   error handling (HttpError, errorHandler)
│   ├── components/
│   │   ├── ui/                   shadcn primitives — FLAT (exception)
│   │   └── <Name>/               folder-per-unit
│   ├── forms/<Name>/
│   ├── hooks/                    cross-page hooks + standard CRUD hooks
│   │   ├── use<X>/               custom hooks
│   │   └── useList/, useOne/, useCreate/, useUpdate/, useDelete/
│   ├── layouts/<Name>/           AuthLayout, AppLayout
│   └── store/use<X>Store/        global Zustand (useAuthStore, useOrganizationStore, useThemeStore, useUIStore, useOnboardingStore)
│
└── lib/                          Pure utilities (no side effects)
    ├── utils.ts                  cn()
    └── animations/, route-island/, csv.ts, csp-api-origin.ts

# Tests at project root
tests/
├── utils/                        renderWithProviders, e2e helpers, setup (@/tests/utils/...)
└── e2e/                          Playwright E2E
```

## Placement cheat sheet

| What you're adding                     | Where it goes                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| New URL / route                        | `src/pages/<name>/` — `<PAGE>.OVERVIEW.md`, `<name>.route.tsx`, `<name>.manifest.ts`, `<Name>Page.tsx`; register in `routeTree.tsx` |
| Page API functions                     | `src/pages/<name>/<name>.api.ts` (uses `apiClient`)                                                                                 |
| Page TanStack Query hooks              | `src/pages/<name>/hooks/use<Name>/` (folder + index.ts)                                                                             |
| Zod schemas / types for a page         | `src/pages/<name>/<name>.contracts.ts`                                                                                              |
| URL search params for a page           | `src/pages/<name>/<name>.search.ts` (used by `validateSearch` in the route)                                                         |
| Component used only on one page        | `src/pages/<name>/components/<Name>/`                                                                                               |
| Form used only on one page             | `src/pages/<name>/forms/<Name>Form/`                                                                                                |
| Page-local UI state (rare)             | `src/pages/<name>/store/use<X>Store/`                                                                                               |
| Component used on 2+ page groups       | `src/shared/components/<Name>/` (see fe-component-promotion)                                                                           |
| New shadcn-style UI primitive          | `src/shared/components/ui/<name>.tsx` (FLAT — shadcn convention)                                                                    |
| Reusable form field/error              | `src/shared/forms/<Name>/`                                                                                                          |
| Global UI state (theme, sidebar)       | `src/shared/store/use<X>Store/`                                                                                                     |
| Auth/HTTP/RBAC/tenant logic            | `src/core/<domain>/`                                                                                                                |
| Pure helper (no React, no API)         | `src/lib/`                                                                                                                          |
| Standard CRUD hook (resource-agnostic) | `src/shared/hooks/use{List,One,Create,Update,Delete}/`                                                                              |
| Resource manifest                      | `src/pages/<resource>/<resource>.resource.ts`                                                                                       |

## Route marker rule

A directory under `src/pages/` is a **frontend route** only if it contains `<page>.route.tsx`.

- Required export: `Component`
- Optional exports: `loader`, `action`, `ErrorBoundary`
- Layout children nest DIRECTLY as `<child>/` with the full island shape, recursively (`$param/` for dynamic segments)
- Dialogs that don't need a URL stay inside the parent page (no `<sub>.route.tsx` for them)
- Dialogs that need URL state (Create/Edit) get a direct child `<segment>/<segment>.route.tsx` that renders `null` — the list page reads URL to open the dialog

## State management

| Scope               | Library                   | Location                                                          |
| ------------------- | ------------------------- | ----------------------------------------------------------------- |
| Server state        | TanStack Query            | `pages/<page>/hooks/use<X>/` or `shared/hooks/use{List,One,...}/` |
| Global client state | Zustand                   | `src/shared/store/use<X>Store/`                                   |
| Feature-owned state | Zustand                   | `src/core/<feature>/store.ts`                                     |
| Page-local UI state | Zustand                   | `src/pages/<page>/store/use<X>Store/` (rare)                      |
| Component-local     | `useState` / `useReducer` | Inline; extract reducer to `<Component>.reducer.ts` when complex  |
| Form state          | react-hook-form + Zod     | Inside the form component                                         |
| URL state           | TanStack Router           | `<page>.search.ts` (validateSearch schema)                        |

**Rules:**

1. Server state never goes in Zustand — TanStack Query owns it
2. Page-local stores are an escape hatch — try `useState` → `useReducer` → URL search params first
3. Reducers live next to their component; no `reducers/` directory

## Automatic tests (no user input)

When implementing any requirement that adds or changes source files:

1. **Always** create the corresponding test file beside the source
2. **Do not** wait for the user to ask — generate tests as part of the implementation
3. Component tests must include `vitest-axe` (`toHaveNoViolations()`)
4. Use `data-testid` for stable selectors (`<page>-page`, `<page>-submit`, etc.)
5. Cross-component island flows go in `pages/<page>/__tests__/integration/`

**Exceptions (no test file):** `<page>.route.tsx`, `<page>.manifest.ts`, `<page>.contracts.ts`, `<PAGE>.OVERVIEW.md`, `index.ts` (barrel).

## Implementation checklist (every requirement)

- [ ] Code lives in the correct layer
- [ ] Imports respect the dependency rule
- [ ] New page island has `<PAGE>.OVERVIEW.md` + role files + `<Page>Page.tsx` + tests; route registered in `routeTree.tsx`
- [ ] API calls go through `apiClient` (`@/core/http/fetch-client.ts`); types from Zod in `<page>.contracts.ts`
- [ ] New components/hooks/forms are folder-per-unit (`<Name>/` + `.tsx` + `.test.tsx` + `index.ts`)
- [ ] Tests created without user asking
- [ ] `pnpm type-check` and `pnpm lint` and tests all clean

## Documentation updates (without asking)

When you add a new route, change project structure, or add a new convention:

- Update **CLAUDE.md** if architecture or naming conventions change
- Update **README.md** if "Adding a New Page" or scripts are affected
- Update `docs/reference/e2e-testids-inventory.md` for new test ids
- Do not ask "Should I update the docs?" — update them as part of the same change set

## Related

- [`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc) — canonical contract
- [`agent-os/skills/fe-route-island/SKILL.md`](../fe-route-island/SKILL.md) — island shape
- [`agent-os/skills/fe-page-scaffolding/SKILL.md`](../fe-page-scaffolding/SKILL.md) — new-page workflow
- [`agent-os/skills/fe-test-generation/SKILL.md`](../fe-test-generation/SKILL.md) — test conventions
- [`agent-os/skills/fe-component-promotion/SKILL.md`](../fe-component-promotion/SKILL.md) — page → shared

## Reference

- Route tree: [`src/app/routes/routeTree.tsx`](../../../src/app/routes/routeTree.tsx)
- RBAC: [`src/core/rbac/policies.ts`](../../../src/core/rbac/policies.ts)
- HTTP: [`src/core/http/fetch-client.ts`](../../../src/core/http/fetch-client.ts)
- Path alias: `@/` → `src/` (always use `@/` in imports; always include `.ts`/`.tsx` extensions)
