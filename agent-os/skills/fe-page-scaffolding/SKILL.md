---
name: fe-page-scaffolding
description: Scaffold a complete page directory following the route-island spec. Use when the user asks to create a new page, route, or feature page. Always generate tests; do not ask the user for them.
---

# Page Scaffolding

Scaffolds a complete route island with page-prefixed role files, folder-per-unit sub-units, and tests.

Contract: [`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc). Shape reference: [`agent-os/skills/fe-route-island/SKILL.md`](../fe-route-island/SKILL.md).

## Triggers

- "Create a new page"
- "Add a route for X"
- "Scaffold page"
- "Add [feature] page"

## Steps

### 1. Gather requirements (infer; do not ask)

From the user's request:

- **Page name** — lowercase kebab-case (e.g., "Settings page" → `settings`; "create org" → `create-organization`)
- **URL path** — default `/<name>`; verify with route tree if ambiguous
- **`kind`** — `leaf` (no children) or `layout` (has child routes)
- **Protected?** — yes for pages under `AppLayout`; no for auth pages
- **Permission** — e.g., `organization:read`; `null` if just auth-gated
- **Resource vs custom?** — resource page if it maps to a backend CRUD entity (organizations, members, etc.); custom otherwise

Only ask the user when genuinely ambiguous. Never ask "Do you want tests?" — tests are always generated (step 6).

### 2. Create directory tree

```bash
PAGE=<name>            # kebab-case
PASCAL=<Name>          # PascalCase
UPPER=$(printf '%s' "$PAGE" | tr 'a-z-' 'A-Z_')   # FORGOT_PASSWORD style

mkdir -p src/pages/$PAGE/{components,forms,hooks,__tests__/integration}
touch src/pages/$PAGE/${UPPER}.OVERVIEW.md
```

For a layout island, add `<child>/` directories per child — DIRECT children, each a full island (`$param/` folders for dynamic segments).

### 3. Create the role files

#### `src/pages/<name>/<name>.manifest.ts` — manifest

```ts
import type { PageManifest } from '@/lib/routes/page-manifest.ts';

export const manifest = {
  segment: '<name>',
  path: '/<name>',
  title: '<Human title>', // document title (routeTree wires manifestHead)
  testId: '<name>-page',
  permission: null, // or 'resource:action'
  kind: 'leaf', // 'leaf' | 'layout'
  children: [], // child URL segments when kind: 'layout' (disk: <segment>/ directly)
} as const satisfies PageManifest;
```

#### `src/pages/<name>/<name>.contracts.ts` — Zod schemas

```ts
import { z } from 'zod';

export const <entity>Schema = z.object({
  id: z.string(),
  createdAt: z.string(),
  // ...domain fields
});

export type <Entity> = z.infer<typeof <entity>Schema>;
```

#### `src/pages/<name>/<name>.api.ts` — fetchers

```ts
import { z } from 'zod';

import { apiClient } from '@/core/http/fetch-client.ts';

import { <entity>Schema, type <Entity> } from './<name>.contracts.ts';

export const <name>Api = {
  list: (): Promise<<Entity>[]> =>
    apiClient.get('/api/<name>').then((r) => z.array(<entity>Schema).parse(r.data)),
  getById: (id: string): Promise<<Entity>> =>
    apiClient.get(`/api/<name>/${id}`).then((r) => <entity>Schema.parse(r.data)),
  create: (data: Omit<<Entity>, 'id' | 'createdAt'>) =>
    apiClient.post<<Entity>>('/api/<name>', data).then((r) => r.data),
  update: (id: string, data: Partial<<Entity>>) =>
    apiClient.patch<<Entity>>(`/api/<name>/${id}`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/api/<name>/${id}`),
};
```

Always validate API responses with Zod `.parse()` for runtime safety.

#### `src/pages/<name>/hooks/use<Name>/use<Name>.ts` — TanStack Query

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { <name>Api } from '../../<name>.api.ts';

const KEYS = {
  all: ['<name>'] as const,
  list: () => [...KEYS.all, 'list'] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
};

export function use<Name>() {
  return useQuery({ queryKey: KEYS.list(), queryFn: <name>Api.list });
}
```

Then `src/pages/<name>/hooks/use<Name>/index.ts`:

```ts
export { use<Name> } from './use<Name>.ts';
```

#### `src/pages/<name>/<Name>Page.tsx` — top-level UI

```tsx
import { Button } from '@/shared/components/ui/button.tsx';

export function <Name>Page() {
  return (
    <div data-testid="<name>-page" className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          <Title>
        </h1>
        <p className="mt-1 text-muted-foreground">
          <Description>
        </p>
      </header>

      {/* Page content */}
    </div>
  );
}
```

**Always** add `data-testid="<name>-page"` to the container.

#### `src/pages/<name>/<name>.route.tsx` — lazy boundary

```tsx
import { <Name>Page } from './<Name>Page.tsx';

/** Component only — RBAC/module gates go in routeTree `beforeLoad` (see step 4). */
export function Component() {
  return <<Name>Page />;
}
```

#### `src/pages/<name>/<NAME>.OVERVIEW.md`

```markdown
# <Name> — Route island

- **URL:** /<name>
- **Permission:** <none | resource:action>
- **Kind:** leaf

## Files

| File                  | Role                |
| --------------------- | ------------------- |
| `<name>.manifest.ts`  | Manifest            |
| `<name>.route.tsx`    | Lazy boundary       |
| `<Name>Page.tsx`      | Top-level UI        |
| `<name>.contracts.ts` | Zod schemas         |
| `<name>.api.ts`       | Fetchers            |
| `hooks/use<Name>/`    | TanStack Query hook |

## Test IDs

`<name>-page`, `<name>-create`, `<name>-table`, … — see `docs/reference/e2e-testids-inventory.md`.
```

### 4. Register the route

Add to [`src/app/routes/routeTree.tsx`](../../../src/app/routes/routeTree.tsx):

```tsx
import { manifestHead } from '@/lib/routes/page-head.ts';
import { manifest as <name>Manifest } from '@/pages/<name>/<name>.manifest.ts';

// lazyRouteComponent (NOT React.lazy) so `defaultPreload: 'intent'` can
// prefetch the island chunk on hover/touch.
const <Name>Page = lazyRouteComponent(
  () => import('@/pages/<name>/<name>.route.tsx'),
  'Component',
);

const <name>Route = createRoute({
  getParentRoute: () => organizationShellRoute, // or rootRoute / authShellRoute
  path: '<name>',
  head: manifestHead(<name>Manifest), // document title from manifest.title
  beforeLoad: async ({ location, params, preload }) => {
    if (preload) return;
    await requireAuth(location.href); // when route is protected
    await gatewayFromManifest(<name>Manifest)(toGateContext(location, params));
  },
  component: <Name>Page,
  errorComponent: RouteErrorBoundary,
});

// ...add to routeTree.addChildren([...])
```

### 5. Sub-units (components, forms, hooks)

Each sub-unit is **folder-per-unit + barrel**:

```
components/<WidgetName>/
├── <WidgetName>.tsx
├── <WidgetName>.test.tsx
└── index.ts                       export { <WidgetName> } from './<WidgetName>.tsx';
```

Same pattern for `forms/<Name>Form/` and `hooks/use<Name>/`.

**Exception:** shadcn primitives in `shared/components/ui/` stay flat.

### 6. Generate tests (auto-invoked)

Beside every new source file:

| Source                      | Test                                              |
| --------------------------- | ------------------------------------------------- |
| `<Name>Page.tsx`            | `<Name>Page.test.tsx` (next to it at island root) |
| `components/<X>/<X>.tsx`    | `components/<X>/<X>.test.tsx`                     |
| `forms/<X>Form/<X>Form.tsx` | `forms/<X>Form/<X>Form.test.tsx`                  |
| `hooks/use<X>/use<X>.ts`    | `hooks/use<X>/use<X>.test.ts`                     |

Each test:

- Render/existence assertions
- `vitest-axe` (`toHaveNoViolations()`) on components
- Key interaction tests (forms, buttons)
- Uses `data-testid` for selectors
- Wraps with `renderWithProviders` from `@/tests/utils/renderWithProviders.tsx`

**No test file required for:** `<page>.route.tsx`, `<page>.manifest.ts`, `<page>.contracts.ts`, `<PAGE>.OVERVIEW.md`, `index.ts` (barrel).

### 7. Update test-id inventory

Edit [`docs/reference/e2e-testids-inventory.md`](../../../docs/reference/e2e-testids-inventory.md) with the new route's IDs.

### 8. Dialog vs full page (when there's a sub-path)

When the user mentions sub-paths under this page:

- **Quick action** (create, edit, confirm) → handle as a dialog. For resource pages, follow the URL-driven dialog pattern (direct children `create/`, `$<resource>Id/edit/`) — see fe-route-island skill.
- **Complex view** (detail page, settings) → full page; create a direct child `<segment>/` with its own `<segment>.route.tsx`.

### 9. Verify

```bash
pnpm type-check
pnpm exec eslint src/pages/<name>
pnpm exec vitest run src/pages/<name>
```

All three must pass before reporting complete.

## Resource page variant

For pages mapping to a backend resource (organizations, members, roles, invitations, api-keys), add:

- `<resource>.resource.ts` — resource manifest (endpoint, schema, permissions)
- `dialogs/Create<Resource>Dialog/`, `dialogs/Edit<Resource>Dialog/`
- `create/` + `$<resource>Id/edit/` — URL-driven dialog routes, direct children (each renders `null`; list page reads URL)
- Use shared CRUD hooks from `shared/hooks/use{List,One,Create,Update,Delete}/`

## Related

- [`agent-os/rules/fe-file-structure.mdc`](../../rules/fe-file-structure.mdc) — canonical contract
- [`agent-os/skills/fe-route-island/SKILL.md`](../fe-route-island/SKILL.md) — full shape spec
- [`agent-os/skills/fe-code-structure/SKILL.md`](../fe-code-structure/SKILL.md) — placement decisions
- [`agent-os/skills/fe-test-generation/SKILL.md`](../fe-test-generation/SKILL.md) — test templates
- [`agent-os/skills/fe-e2e-testids/SKILL.md`](../fe-e2e-testids/SKILL.md) — testid conventions
