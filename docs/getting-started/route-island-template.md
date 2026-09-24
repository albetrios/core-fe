# Route island template

Copy for **`pages/<page-name>/`** or any nested **`pages/.../<child-segment>/`**. Rules: [route-island-structure.md](../reference/route-island-structure.md).

## Tree

```text
src/pages/<page>/                          ← folder = URL segment
│
│══ MANDATORY — every page, validator-enforced ════════════════════════════
├── <PAGE>.OVERVIEW.md                     entry doc: purpose, files, test ids
├── <page>.route.tsx                       lazy boundary — `Component` only; RBAC in routeTree
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

## `<page>.manifest.ts`

```ts
import type { PageManifest } from '@/lib/routes/page-manifest.ts';

export const manifest = {
  segment: '<page-name>',
  path: '/<path>',
  title: '<Page title>', // document title: "<Page title> · Core"
  testId: '<page-name>-page',
  permission: 'resource:read', // or null
  kind: 'leaf', // or 'layout' + children: ['<sub-a>']
  children: [],
} as const satisfies PageManifest;
```

## `route.tsx`

```tsx
import { ExamplePage } from './ExamplePage.tsx';

/** Lazy boundary — access control is registered in routeTree `beforeLoad`. */
export function Component() {
  return <ExamplePage />;
}
```

Register `gatewayFromManifest(manifest)` (and org guards when applicable) on the
route in `src/app/routes/routeTree.tsx` — see `agent-os/skills/fe-routing-tenancy/SKILL.md`.

## `components/ExamplePage.tsx`

```tsx
import { manifest } from '../page.ts';

export function ExamplePage() {
  return (
    <div className="space-y-6" data-testid={page.testId}>
      <h1 className="text-2xl font-bold tracking-tight">Title</h1>
    </div>
  );
}
```

## `__tests__/unit/page.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';

import { ExamplePage } from '../../components/ExamplePage.tsx';

describe('ExamplePage', () => {
  it('renders', () => {
    render(<ExamplePage />);
    expect(screen.getByTestId('example-page')).toBeInTheDocument();
  });

  it('has no a11y violations', async () => {
    const { container } = render(<ExamplePage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

## `routeTree.tsx`

```ts
lazy: () => import('@/pages/<page-name>/route.tsx'),
// child: lazy: () => import('@/pages/<page-name>/<child>/<child>.route.tsx'),
```
