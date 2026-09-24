---
name: fe-component-promotion
description: Move page-local components to shared or family-shared layers when a second consumer appears. Use when promoting code up the promotion ladder or when a component is imported from two page islands.
---

# Component Promotion Skill

Move a component from a page-specific location to the shared layer when it's needed by multiple page groups.

## Triggers

Use this skill when the user asks to:

- "Move component to shared"
- "Promote component"
- "Make component reusable"
- "This component is used in multiple pages"
- "Extract to shared"

## Prerequisites

Read the file structure rule at `agent-os/rules/fe-file-structure.mdc` to understand the promotion rules.

## Promotion Rules

A component should be promoted to `shared/` when:

1. It is used by **2+ different page groups** (e.g., `pages/users/` and `pages/organizations/`)
2. It contains **no page-specific business logic**
3. It is a **presentational component** (takes props, renders UI)

Do NOT promote when:

- Only one page uses it (even if it seems generic)
- It contains page-specific business logic or API calls
- It's a form that uses page-specific contracts/schemas

## Steps

### 1. Identify the Component

- Determine current location: `src/pages/<source-page>/components/<Component>.tsx`
- Determine target location in shared:
  - UI primitive → `src/shared/components/ui/<component>.tsx`
  - Business component → `src/shared/components/<Component>/` (folder-per-unit: `<Component>.tsx` + `<Component>.test.tsx` + `index.ts`)
  - Form component → `src/shared/forms/<Component>.tsx`
  - Hook → `src/shared/hooks/<hook>.ts`

### 2. Move the File

```bash
mkdir -p src/shared/components/<Component>
mv src/pages/<source>/components/<Component>/<Component>.tsx src/shared/components/<Component>/<Component>.tsx
```

### 3. Move the Test File

Always move the colocated test file alongside the component:

```bash
mv src/pages/<source>/components/<Component>/<Component>.test.tsx src/shared/components/<Component>/<Component>.test.tsx
mv src/pages/<source>/components/<Component>/index.ts src/shared/components/<Component>/index.ts
```

If no test file exists, generate one using the fe-test-generation skill. Do not ask the user — create the test as part of the promotion.

### 4. Update Internal Imports

In the moved file, update any relative imports to use `@/` absolute paths:

```tsx
// Before (relative to old location)
import { someHelper } from '../utils.ts';

// After (absolute)
import { someHelper } from '@/pages/<source>/utils.ts';
// OR if the dependency should also be in shared:
import { someHelper } from '@/shared/utils.ts';
```

If the component imports page-specific types (like from `contracts.ts`), make those types generic or accept them as props instead.

### 5. Update All Consumers

Search for all files importing the component from the old path:

```
Grep for: from '@/pages/<source>/components/<Component>'
```

Update each import to the new shared path:

```tsx
// Before
import { StatusBadge } from '@/pages/users/components/StatusBadge.tsx';

// After
import { StatusBadge } from '@/shared/components/StatusBadge/index.ts';
```

### 6. Update Test Imports

In the moved test file, update all import paths:

```tsx
// Before
import { StatusBadge } from './StatusBadge.tsx'; // This is fine (still relative)

// But if test imports page-specific test utils:
// import { mockData } from '../__fixtures__/mockData.ts';
// Change to absolute import
import { mockData } from '@/pages/<source>/__fixtures__/mockData.ts';
```

### 7. Add to New Consumer

Import the component in the second page that triggered the promotion:

```tsx
import { StatusBadge } from '@/shared/components/StatusBadge/index.ts';
```

### 8. Verify

- Run `tsc --noEmit -p tsconfig.app.json` — must pass clean
- Run `pnpm vitest run src/shared/components/<Component>/<Component>.test.tsx` — test must pass
- Check that no imports point to the old location
- Ensure the dev server works correctly

### 9. Checklist

- [ ] Component moved to appropriate `shared/` subdirectory
- [ ] Colocated test file moved alongside the component
- [ ] All internal imports updated to `@/` absolute paths
- [ ] All consumers updated to import from new location
- [ ] No page-specific business logic leaked into shared
- [ ] `data-testid` attributes preserved and consistent
- [ ] TypeScript passes clean
- [ ] Tests pass at new location
- [ ] Old file deleted (not duplicated)
