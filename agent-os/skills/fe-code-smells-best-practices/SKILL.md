---
name: fe-code-smells-best-practices
description: When any code is added or changed, check the modified/live code only and fix code smells and best-practice violations. Ensures architecture, conventions, and consistency without full codebase scans.
---

# Code Smells and Best-Practice Fixes (Live Code Only)

This skill runs when **code is added or modified**. It focuses only on the **files that were changed** (live scope) and fixes code smells and best-practice violations so they never accumulate.

## When to Invoke

- **Auto-invoked:** After adding or changing any source file under `src/` (as part of the same implementation turn).
- **Explicit:** User asks to "fix code smells", "check best practices", "review my changes", or "clean up this code".

**Scope:** Apply checks and fixes only to the code that was **added or modified** in the current change set. Do not perform a full codebase audit unless the user explicitly asks.

## Checklist (Live Code Only)

For each **modified or new** file, verify and fix:

### 1. Architecture and dependencies

- **App must not import from pages.** If `src/app/` imports from `@/pages/`, move the used API or type to `src/shared/` or `src/core/` (an allowed layer) and have app import from there. Example: the route tree uses `resolveRootRedirect` from `@/shared/tenancy/organization-resolver.ts`, not a helper from a page.
- **Pages never import from other pages.** If a page imports from another page, promote shared code to `shared/` or `core/` and update imports.
- **Shared and core never import from pages.** Fix by moving the dependency to core or shared.

### 2. Import conventions

- **Spacing:** Use a single space after commas in import lists (e.g. `type Foo, barSchema` not `type Foo,barSchema`).
- **Extensions:** Use `.ts` / `.tsx` in `@/` imports (e.g. `@/core/http/fetch-client.ts`).
- **Type-only imports:** Use `import type { X }` when only types are imported.
- **API client:** Use `import { apiClient } from '@/core/http/fetch-client.ts'` for all API calls. Exception: auth service and auth API use raw fetch to avoid interceptor recursion.

### 3. Styling

- **No inline styles.** Use Tailwind utility classes or add a class in `src/index.css` (e.g. `.chart-tooltip`, `.skeleton-shimmer-bg`) and reference it with `className`. For third-party components that require style objects (e.g. Recharts tooltips), prefer a CSS class and `className` when the library supports it.

### 4. TypeScript

- **No `any`.** Use `unknown` and narrow with type guards, or use proper types (e.g. `typeof import('./service')['fn']` for dynamically imported functions in tests). Remove `eslint-disable @typescript-eslint/no-explicit-any` when fixing.

### 5. Test and data-testid consistency

- **Form error testid:** Use `data-testid="form-error"` for the form-level error message component (e.g. `FormError`), not form-specific names like `login-error`, so tests and conventions stay consistent across forms.
- **Page/form testids:** New pages and forms must include the standard `data-testid` attributes per `agent-os/rules/fe-testing-requirements.mdc` (e.g. `<name>-page`, `<name>-form`, `<form>-submit`).

### 6. Anti-patterns (fix when introduced in live code)

Per `agent-os/rules/fe-engineering-principles.mdc`, flag and fix when obvious in the change set:

- **Console noise:** Remove `console.log` / `console.debug` left from debugging.
- **Magic numbers:** Replace unexplained numeric literals with named constants.
- **Duplicated logic:** Extract shared helper or hook when the same block appears twice in the change.
- **Unnecessary context:** Do not add React context when props or colocated state suffice.
- **Unnecessary hooks:** Avoid new `useEffect` for data that belongs in TanStack Query or derived render state.
- **Premature memoization:** Remove `memo` / `useMemo` / `useCallback` added without a measured need.
- **Oversized additions:** If a single new file exceeds ~300 lines without clear structure, split into focused modules.

### 7. Optional (fix when obvious)

- **Nested ternaries:** Prefer helper or if/else (fe-lint-guard also covers this).
- **Unused variables / imports:** Remove or prefix with `_`.

## Implementation Steps

1. Identify the set of files that were **added or modified** in this change.
2. For each file, run through the checklist above.
3. Apply fixes in the same change set; do not ask for confirmation.
4. After fixes, run `pnpm lint` and `pnpm type-check` (or rely on fe-lint-guard) so the branch stays clean.

## Reference: Project Conventions

- **Dependency rule:** shared ← pages ← core; app is part of the shell and may use core/shared only.
- **File structure:** `agent-os/rules/fe-file-structure.mdc`, `agent-os/rules/fe-project-conventions.mdc`.
- **Testing (data-testid):** `agent-os/rules/fe-testing-requirements.mdc`.

## Relation to Other Skills

- **fe-lint-guard:** Runs after every implementation; fixes ESLint/TypeScript and common quality issues. Code-smells-best-practices focuses on **convention and architecture** (dependencies, inline styles, apiClient path, testid consistency) on live code only.
- **fe-auto-implement:** May chain this skill after implementing a requirement so new code is checked for smells before the turn ends.
- **fe-code-structure:** Defines where code lives; this skill enforces that app/pages/shared/core do not break dependency rules when code is added or changed.
