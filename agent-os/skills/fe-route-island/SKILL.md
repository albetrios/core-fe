---
name: fe-route-island
description: Self-contained route folders with page-prefixed role files, folder-per-unit sub-units, direct child folders for nested routes, and URL-driven CRUD dialogs.
---

# Route Island

Every route lives under `src/pages/<page-name>/` with the **same tree** at every depth. `<page>.manifest.ts` is the single manifest for layout vs leaf (path, RBAC, testId, `children`). Sub-units (components, forms, hooks, dialogs, stores) follow **folder-per-unit + barrel**.

Canonical rule: [`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc) (this skill is the workflow; the rule is the contract).

Platform: `@/core/*`, `@/shared/*`, `@/lib/*`, `src/app/routes/routeTree.tsx` only.

## Canonical tree

```text
src/pages/<page>/                          ← folder = URL segment
│
│══ MANDATORY — every page, validator-enforced ════════════════════════════
├── <PAGE>.OVERVIEW.md                     entry doc: purpose, files, test ids
├── <page>.route.tsx                       lazy boundary — exports `Component` only; RBAC in routeTree
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

**No child route folders** when `kind: 'leaf'` and `children: []`.

## Naming summary (cheat sheet)

| Category                      | Style                                             | Example                                                            |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Role files (one per page)     | `<page>.<role>.<ext>` lowercase-dotted            | `dashboard.route.tsx`, `dashboard.manifest.ts`, `dashboard.api.ts` |
| Entry doc                     | UPPER_SNAKE, directory-prefixed                   | `<PAGE>.OVERVIEW.md`                                               |
| Top-level UI                  | PascalCase, page-prefixed                         | `DashboardPage.tsx`, `OrganizationLayout.tsx`                      |
| Sub-units                     | PascalCase, **no prefix** (path provides context) | `ActivityFeed/`, `LoginForm/`, `useDashboard/`                     |
| shadcn primitives (exception) | flat, lowercase                                   | `shared/components/ui/button.tsx`                                  |

## `<page>.manifest.ts` — the manifest

One file describes both leaf and layout islands:

```ts
import type { PageManifest } from '@/lib/routes/page-manifest.ts';

export const manifest = {
  segment: 'organizations',
  path: '/organizations',
  title: 'Organizations', // document title: "Organizations · Core" (routeTree wires manifestHead)
  testId: 'organizations-page',
  permission: null, // or 'organization:read' etc.
  kind: 'leaf', // 'leaf' | 'layout'
  children: [], // child URL segments when kind: 'layout' (disk: <segment>/ directly)
} as const satisfies PageManifest;
```

| `kind`   | Top-level UI file                      | Children                                        |
| -------- | -------------------------------------- | ----------------------------------------------- |
| `leaf`   | `<Page>Page.tsx`                       | none — `children: []`                           |
| `layout` | `<Page>Layout.tsx` (uses `<Outlet />`) | listed in `children`; disk: `<child>/` (direct) |

## `<page>.route.tsx` — the boundary

Thin React boundary — **`Component` only**. TanStack Router loads islands via
`lazyRouteComponent(..., 'Component')` in `routeTree.tsx`; island `loader()`
exports are **not wired** and must not be added for RBAC (false confidence).

**Access control lives in `routeTree.tsx` `beforeLoad`:**

- Org / workspace gates — `fe-routing-tenancy` skill (`requireAuth`, `resolveActiveOrg`, …)
- Permission + module (L5/L6b) — `gatewayFromManifest(manifest)` from the island manifest
- Guest auth pages — pathless shell `beforeLoad` (e.g. `redirectIfAuthenticated`)

```tsx
import { OrganizationsPage } from './OrganizationsPage.tsx';

export function Component() {
  return <OrganizationsPage />;
}
```

Register in `routeTree.tsx`:

```tsx
beforeLoad: async ({ location, params, preload }) => {
  if (preload) return;
  await gatewayFromManifest(organizationsManifest)(toGateContext(location, params));
},
```

## Folder-per-unit + barrel

Every component / form / hook / dialog / store lives in its own folder:

```
components/ActivityFeed/
├── ActivityFeed.tsx                   source
├── ActivityFeed.test.tsx              colocated unit test
└── index.ts                           export { ActivityFeed } from './ActivityFeed.tsx';
```

Imports stay clean: `import { ActivityFeed } from './components/ActivityFeed/index.ts'`.

**Exception:** shadcn primitives in `shared/components/ui/` stay flat (`button.tsx`, `card.tsx`).

## Resource pages — URL-driven CRUD

For pages that map to a backend resource (organizations, members, roles, etc.), add the resource specialization:

```text
pages/<resource>/
├── <resource>.route.tsx               parent — renders the list
├── <resource>.manifest.ts                 kind: 'layout', children: ['create', '$<resource>Id']
├── <resource>.resource.ts             resource manifest (endpoint, schema, permissions)
├── <Resource>ListPage.tsx             top-level UI — list view that mounts dialogs
├── components/<Name>/                 list widgets (Table, Filters, EmptyState)
├── forms/<Name>Form/                  reusable forms (used by dialogs)
├── dialogs/<Name>Dialog/              URL-driven action dialogs
├── create/                            → /<resource>/create
│   └── create.route.tsx               (renders null; list page reads URL + opens dialog)
└── $<resource>Id/                     → /<resource>/[id]   (show — full-name $param folder)
    └── edit/                          → /<resource>/[id]/edit  (renders null; list opens dialog)
```

CRUD UX mapping:

| Action | URL                     | Renders                      |
| ------ | ----------------------- | ---------------------------- |
| List   | `/<resource>`           | Page                         |
| Create | `/<resource>/create`    | Dialog over list             |
| Show   | `/<resource>/[id]`      | Page or dialog               |
| Edit   | `/<resource>/[id]/edit` | Dialog over list             |
| Delete | (no URL)                | Inline `AlertDialog` confirm |

Dialogs are **URL-driven** — the parent list page reads `useRouterState` to know which dialog (if any) to open.

## Tests

| Test type                                  | Location                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Unit (component, hook, form, store)        | Colocated `<Name>.test.{ts,tsx}` next to source                                                    |
| Cross-component integration in this island | `__tests__/integration/`                                                                           |
| Browser E2E (full app + API on `:3000`)    | `tests/e2e/<name>.e2e.test.ts` (Playwright) — document flows in island `<PAGE>.OVERVIEW.md`        |
| E2E (UI + API contracts)                   | `tests/e2e/<name>.e2e.test.ts` or `<name>-api.e2e.test.ts` (Playwright) — skips when :3000 is down |

**Strict test colocation (validator-enforced):** every component — including each island's `<Page>Page.tsx`/`<Page>Layout.tsx` and the flat-group files in the `SettingsModal` tree — and every hook ships a colocated `*.test.ts(x)`. `pnpm validate:structure` FAILS any unit folder, island top-level UI, or flat-group component without one. The only exemptions are the declarative role files below, barrels, and entry docs.

**No test required for (the only exemptions):** `<page>.route.tsx`, `<page>.manifest.ts`, `<page>.contracts.ts`, `<page>.search.ts`, `<page>.fixtures.ts`, `<page>.constants.ts`, `<PAGE>.OVERVIEW.md`, `index.ts` (barrel).

Vitest picks up `src/**/*.test.{ts,tsx}` AND `src/**/__tests__/**/*.test.{ts,tsx}` via the include glob.

## Index redirects (layout islands)

When `kind: 'layout'` with children, the index route redirects to the default child:

```ts
const indexRoute = createRoute({
  getParentRoute: () => parentRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/<parent>/<default-child>' });
  },
  component: () => null,
});
```

Established cases: `/settings` → `/settings/profile`, `/settings/organization` → `/settings/organization/general`.

## Import boundaries

| Allowed                                   | Forbidden                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Same island (`./components/`, `./hooks/`) | Other `pages/<feature>/`                                          |
| `@/core/*`, `@/shared/*`, `@/lib/*`       | Sibling child islands' `<page>.api.ts` (each child owns its data) |
| `@/tests/utils/*` from `__tests__/`       | Parent's `api.ts` from children (children fetch independently)    |

## AI workflow (every new island)

1. **Read** `<PAGE>.OVERVIEW.md` (or create it) + the parent's `<page>.manifest.ts` if nested.
2. **Create files** in order: `<PAGE>.OVERVIEW.md` → `<page>.manifest.ts` → `<page>.contracts.ts` → `<page>.api.ts` → `<Page>Page.tsx | <Page>Layout.tsx` → `<page>.route.tsx`.
3. **Add components/hooks/forms** under `components/<Name>/`, `hooks/use<Name>/`, `forms/<Name>Form/` — each a folder with `<Name>.{tsx,ts}` + `<Name>.test.{tsx,ts}` + `index.ts`.
4. **Register lazy route** in [`src/app/routes/routeTree.tsx`](../../../src/app/routes/routeTree.tsx): `lazyRouteComponent(() => import('@/pages/<name>/<name>.route.tsx'), 'Component')` + `head: manifestHead(<name>Manifest)` (document title from `manifest.title`) + `errorComponent: RouteErrorBoundary`.
5. **Update test-id inventory:** [`docs/reference/e2e-testids-inventory.md`](../../../docs/reference/e2e-testids-inventory.md).

## Related

- [`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc) — canonical contract
- [`agent-os/skills/fe-page-scaffolding/SKILL.md`](../fe-page-scaffolding/SKILL.md) — step-by-step new-page workflow
- [`agent-os/skills/fe-code-structure/SKILL.md`](../fe-code-structure/SKILL.md) — where each file goes
- [`agent-os/skills/fe-component-promotion/SKILL.md`](../fe-component-promotion/SKILL.md) — moving to shared
- [`agent-os/skills/fe-test-generation/SKILL.md`](../fe-test-generation/SKILL.md) — test conventions
- [`docs/reference/route-island-structure.md`](../../../docs/reference/route-island-structure.md) — reference
