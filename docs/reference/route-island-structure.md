# Route island structure

Self-contained folders under `pages/<page-name>/` with page-prefixed role files, folder-per-unit sub-units, **direct child folders** for nested routes (the pages tree mirrors the URL tree), **`<page>.manifest.ts`** for the layout/leaf manifest, and colocated tests.

**Rule (contract):** [`agent-os/rules/fe-file-structure.mdc`](../../agent-os/rules/fe-file-structure.mdc)
**Skill (workflow):** [`agent-os/skills/fe-route-island/SKILL.md`](../../agent-os/skills/fe-route-island/SKILL.md)
**Template:** [`docs/getting-started/route-island-template.md`](../getting-started/route-island-template.md)

---

## Canonical tree

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
├── <page>.fixtures.ts                     placeholder data (REPLACE_WITH_API, optional)
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

---

## Naming summary

| Category                      | Style                                  | Example                                                            |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Role files (single-per-page)  | `<page>.<role>.<ext>` lowercase-dotted | `dashboard.route.tsx`, `dashboard.manifest.ts`, `dashboard.api.ts` |
| Entry doc                     | UPPER_SNAKE, directory-prefixed        | `<PAGE>.OVERVIEW.md`                                               |
| Top-level UI                  | PascalCase, page-prefixed              | `DashboardPage.tsx`, `OrganizationLayout.tsx`                      |
| Sub-units                     | PascalCase, no prefix                  | `ActivityFeed/`, `LoginForm/`, `useDashboard/`                     |
| shadcn primitives (exception) | flat lowercase                         | `shared/components/ui/button.tsx`                                  |

---

## `<page>.manifest.ts` (layout + leaf manifest)

| Field        | Role                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| `segment`    | URL segment; equals the island's folder name                           |
| `path`       | Full URL                                                               |
| `testId`     | Root `data-testid` for the page container                              |
| `permission` | RBAC for `gatewayFromManifest` in routeTree; `null` if auth-gated only |
| `kind`       | `'layout'` (renders `<Outlet />` + has child folders) or `'leaf'`      |
| `children`   | Child URL segments — disk: `<segment>/` directly                       |

```ts
import type { PageManifest } from '@/lib/routes/page-manifest.ts';

export const manifest = {
  segment: 'organization',
  path: '/organization',
  title: 'Choose organization',
  testId: 'organization-page',
  permission: 'organization:read',
  kind: 'layout',
  children: ['general', 'members', 'invitations', 'roles', 'api-keys', 'billing'],
} as const satisfies PageManifest;
```

---

## Folder-per-unit + barrel

Every component/form/hook/dialog/store:

```text
<Name>/
├── <Name>.tsx                          source
├── <Name>.test.tsx                     colocated unit test
└── index.ts                            export { <Name> } from './<Name>.tsx';
```

Imports stay clean: `from '@/pages/dashboard/components/ActivityFeed'`.

**Exception:** shadcn primitives in `shared/components/ui/` stay flat.

---

## Resource pages — URL-driven CRUD

Resources (organizations, members, roles, etc.) add a CRUD specialization:

```text
pages/<resource>/
├── <resource>.route.tsx                 parent route — renders the list
├── <resource>.manifest.ts                   kind: 'layout', children: ['create', '$<resource>Id']
├── <resource>.resource.ts               resource manifest
├── <Resource>ListPage.tsx               top-level UI — mounts the dialogs
├── components/, forms/, hooks/          folder-per-unit
├── dialogs/                             URL-driven action dialogs (folder-per-unit)
│   ├── Create<Resource>Dialog/
│   ├── Edit<Resource>Dialog/
│   └── Delete<Resource>Dialog/          optional — usually inline AlertDialog
├── create/create.route.tsx              → /<resource>/create   (renders null; list opens dialog)
└── $<resource>Id/                       → /<resource>/[id]     (show — strip-$ kebab role files)
    └── edit/edit.route.tsx              → /<resource>/[id]/edit  (renders null; list opens dialog)
```

URL ↔ action mapping:

| Action | URL                     | Renders              |
| ------ | ----------------------- | -------------------- |
| List   | `/<resource>`           | Page                 |
| Create | `/<resource>/create`    | Dialog over list     |
| Show   | `/<resource>/[id]`      | Page or dialog       |
| Edit   | `/<resource>/[id]/edit` | Dialog over list     |
| Delete | (no URL)                | Inline `AlertDialog` |

---

## Index redirects (layout islands)

When `kind: 'layout'` with children, the index route (`/`) redirects to the default child via `beforeLoad`:

```ts
const indexRoute = createRoute({
  getParentRoute: () => parentRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/parent/default-child' });
  },
  component: () => null,
});
```

Established case:

- `/` → the active organization's dashboard (from me/context), else the `/organization` picker, else `/onboarding` — the root resolver (`resolveRootRedirect` in `src/shared/tenancy/organization-resolver.ts`, wired as the index route's `beforeLoad` in `src/app/routes/routeTree.tsx`)

(Settings is not a route space — it is the global `#settings/<scope>/<section>` hash modal.)

---

## Tests

| Test type                                  | Location                                        |
| ------------------------------------------ | ----------------------------------------------- |
| Unit (component, hook, form, store)        | Colocated `<Name>.test.{ts,tsx}` next to source |
| Cross-component integration in this island | `__tests__/integration/`                        |
| Browser E2E (full app, cross-page)         | Project `tests/e2e/` (Playwright)               |

**Strict test colocation (validator-enforced):** every component — including each island's `<Page>Page.tsx`/`<Page>Layout.tsx` and the flat-group files in the `SettingsModal` tree — and every hook ships a colocated `*.test.ts(x)`. `pnpm validate:structure` FAILS any unit folder, island top-level UI, or flat-group component without one. The only exemptions are the declarative role files below, barrels, and entry docs.

**No test required for (the only exemptions):** `<page>.route.tsx`, `<page>.manifest.ts`, `<page>.contracts.ts`, `<page>.search.ts`, `<page>.fixtures.ts`, `<page>.constants.ts`, `<PAGE>.OVERVIEW.md`, `index.ts` (barrel).

Vitest globs cover both `src/**/*.test.{ts,tsx}` and `src/**/__tests__/**/*.test.{ts,tsx}`.

---

## Examples

| Island                   | Path                                                  | Notes                                        |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------- |
| Organization hub         | `src/pages/organization/`                             | Layout — picker + `$organizationSlug/` child |
| Dashboard child          | `src/pages/organization/$organizationSlug/dashboard/` | Leaf under the org layout                    |
| Organizations (resource) | `src/pages/organization/`                             | Resource — list + URL-driven dialogs         |

---

## Imports

- **Allowed:** same island, `@/core/*`, `@/shared/*`, `@/lib/*`, `@/tests/utils/*` (from tests)
- **Forbidden:** other page islands, sibling sub-page `<page>.api.ts`, parent's `<page>.api.ts` from children (children fetch independently)
