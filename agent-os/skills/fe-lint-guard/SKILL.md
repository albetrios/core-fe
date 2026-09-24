---
name: fe-lint-guard
description: Automatically fix lint, type-check, and code-quality issues after every implementation. Runs in the background without asking the user. Handles ESLint errors, TypeScript errors, nested ternaries, React purity, import ordering, and security warnings so the user only provides requirements and never sees lint failures.
---

# Lint Guard — Background Code Quality

This skill runs **automatically after every implementation**. The user never asks for it; the agent invokes it as part of completing any task that adds or changes source files.

## When to Invoke (Always — No User Input)

After completing **any** code change under `src/`, `plugins/`, or config files:

1. Run `pnpm type-check` mentally or via terminal — fix any TypeScript errors.
2. Run `pnpm lint` mentally or via terminal — fix any ESLint errors.
3. If tests were added/changed, run `pnpm test` to confirm no regressions.

Do **not** tell the user "I'll now run lint." Just do it silently as part of the implementation. If there are issues, fix them before responding. The user should never see lint or type-check failures in their terminal.

## What to Fix (Without Asking)

### ESLint errors (must be zero)

| Rule                                                     | How to fix                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sonarjs/no-nested-conditional`                          | Extract nested ternary to a variable, if/else, or a small helper function.                                                                                                        |
| `react-hooks/purity` / `react-hooks/set-state-in-effect` | Never call `Date.now()` or other impure functions during render; use state + effect. Never call `setState` synchronously in an effect body; use `queueMicrotask()` or a callback. |
| `react-refresh/only-export-components`                   | File should only export components, or add an eslint override for that file in `eslint.config.mjs` (e.g. analytics providers that export hooks).                                  |
| `@typescript-eslint/consistent-type-imports`             | Use `import type { ... }` for type-only imports.                                                                                                                                  |
| `sonarjs/void-use`                                       | Replace `void expr` with `expr.catch(() => {})` for fire-and-forget promises, or `.then(() => {})`.                                                                               |
| `sonarjs/no-hardcoded-passwords`                         | If it's a real credential: remove it. If it's a test fixture: add an eslint override for that file in `eslint.config.mjs`.                                                        |
| `sonarjs/pseudo-random`                                  | If non-security (e.g. build IDs): add eslint override for that file. If security-sensitive: use `crypto.getRandomValues()`.                                                       |
| `security/detect-non-literal-fs-filename`                | If the path is safe (e.g. `path.resolve(process.cwd(), 'dist')`) add eslint override for that file.                                                                               |
| `no-param-reassign`                                      | Use a new variable instead of mutating the parameter.                                                                                                                             |
| Import ordering                                          | `simple-import-sort/imports` auto-fixes with `--fix`; or manually reorder.                                                                                                        |
| Unused imports / vars                                    | Remove them; use `_` prefix for intentionally unused params.                                                                                                                      |

### ESLint warnings (acceptable but reduce when easy)

| Rule                               | Policy                                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| `sonarjs/todo-tag`                 | Leave as warnings; TODOs are tracked for later.                  |
| `max-lines-per-function` (200 max) | Split if easy; otherwise leave as warning.                       |
| `security/detect-object-injection` | Usually false positives on dynamic key access; leave as warning. |
| `security/detect-unsafe-regex`     | Review; if the regex is safe, leave as warning.                  |

### TypeScript errors

- Fix all `tsc --noEmit` errors immediately.
- Use `unknown` instead of `any`; narrow with type guards.
- Use `type` imports for type-only usage.
- Ensure strict mode compliance: `noUncheckedIndexedAccess`, `noUnusedLocals`.

## ESLint Config Reference

The ESLint config (`eslint.config.mjs`) has these override blocks. When adding new files that trigger known acceptable patterns, add overrides here instead of inline `eslint-disable` comments:

| Override            | Files                              | Rules relaxed                                                                        |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Test files          | `**/*.test.ts`, `**/*.test.tsx`    | `sonarjs/slow-regex`, `sonarjs/no-hardcoded-passwords`, `max-lines-per-function` off |
| Build plugins       | `plugins/**/*.ts`                  | `sonarjs/pseudo-random`, `security/detect-non-literal-fs-filename` off               |
| Analytics providers | `**/core/analytics/**/*.tsx`       | `react-refresh/only-export-components` off                                           |
| Route modules       | `**/pages/**/route.tsx`            | `only-export-components` allows loader/action/ErrorBoundary                          |
| shadcn/ui           | `**/shared/components/ui/**/*.tsx` | `only-export-components` off                                                         |

When a new pattern needs relaxing (e.g. a new provider that exports hooks), add a file-level override block to `eslint.config.mjs` rather than scattering inline `eslint-disable` comments.

## Common Patterns and Fixes

### Nested ternary (sonarjs/no-nested-conditional)

```tsx
// BAD — nested ternary
const label = isLoading ? 'Loading...' : hasError ? 'Error' : 'Done';

// GOOD — helper function
function getLabel(isLoading: boolean, hasError: boolean): string {
  if (isLoading) return 'Loading...';
  if (hasError) return 'Error';
  return 'Done';
}
const label = getLabel(isLoading, hasError);

// GOOD — if/else assignment
let label = 'Done';
if (isLoading) label = 'Loading...';
else if (hasError) label = 'Error';
```

### Impure function in render (react-hooks/purity)

```tsx
// BAD — Date.now() called during render
const now = Date.now();
const isExpired = expiry < now;

// GOOD — state + effect
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(id);
}, []);
const isExpired = expiry < now;
```

### setState in effect (react-hooks/set-state-in-effect)

```tsx
// BAD — synchronous setState in effect
useEffect(() => {
  if (ready) setLoading(false);
}, []);

// GOOD — defer with queueMicrotask
useEffect(() => {
  if (ready) queueMicrotask(() => setLoading(false));
}, []);
```

### Fire-and-forget import (sonarjs/void-use)

```tsx
// BAD
void import('./heavy-chunk.tsx');

// GOOD
import('./heavy-chunk.tsx').catch(() => {});
```

## Verification Commands

```bash
pnpm type-check   # Must pass (0 errors)
pnpm lint          # Must pass (0 errors; warnings OK)
pnpm build         # Must pass
pnpm test          # Must pass if tests were changed
```

## Integration with Other Skills

This skill is **not invoked by the user**. It is the agent's responsibility to run it after every implementation:

- **fe-code-structure** says: "tests created without user asking" — fe-lint-guard says: "lint/types fixed without user asking"
- **fe-agent-behavior** rule says: "ensure code passes type-check and lint" — fe-lint-guard provides the how
- **fe-page-scaffolding** creates files — fe-lint-guard ensures they pass lint before the user sees the result
- **fe-test-generation** creates tests — fe-lint-guard ensures the tests themselves pass lint

The user provides their requirement. Everything else (tests, routes, RBAC, docs, lint, types) happens in the background.
