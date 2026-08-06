---
name: test-generation
description: Generate colocated Vitest and Testing Library tests for new source files under src/. Auto-invoked when components, hooks, stores, or services are created — never ask the user first.
---

# Test Generation Skill

Automatically generate colocated test files for new source files in the project.

## Triggers

Use this skill when:

- A new component, hook, store, service, or utility file is created
- The user asks to "add tests", "write tests", "test coverage"
- The testing-requirements rule or code-structure skill invokes it (auto — no user confirmation needed)

**Do not ask** "Should I add tests?" — when any of the above apply, generate the test file as part of the implementation.

## Prerequisites

- Read `agent-os/rules/testing-requirements.mdc` for the naming/location conventions
- Vitest + React Testing Library + vitest-axe are installed
- Test utilities are in `tests/utils/` (import as `@/tests/utils/...`)
- Global test setup in `tests/utils/setup.ts` (includes `vitest-axe/extend-expect` and `window.matchMedia` mock)

## Steps

### 1. Determine Test Type

| Source Location                                     | Test Type        | Template                                                                         |
| --------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `src/shared/components/**/*.tsx`                    | Component test   | [Component Template](#component-template)                                        |
| `src/shared/forms/**/*.tsx`                         | Form test        | [Form Template](#form-template)                                                  |
| `src/shared/layouts/**/*.tsx`                       | Layout test      | [Component Template](#component-template)                                        |
| `src/pages/**/components/<X>/<X>.tsx`               | Component test   | `<X>.test.tsx` beside source — [Component Template](#component-template)         |
| `src/pages/**/forms/<X>Form/<X>Form.tsx`            | Form test        | `<X>Form.test.tsx` beside source — [Form Template](#form-template)               |
| `src/pages/**/<Page>Page.tsx` or `<Page>Layout.tsx` | Page/layout test | `<Page>Page.test.tsx` beside it at island root — [Page Template](#page-template) |
| `src/shared/store/**/*.ts`                          | Store test       | [Store Template](#store-template)                                                |
| `src/core/**/*.ts`                                  | Service test     | [Service Template](#service-template)                                            |
| `src/lib/**/*.ts`                                   | Utility test     | [Utility Template](#utility-template)                                            |
| `src/pages/**/hooks/use<X>/use<X>.ts`               | Hook test        | `use<X>.test.ts` beside source — [Hook Template](#hook-template)                 |

### 2. Create Test File

- **Colocated beside source everywhere** — `src/pages/**` islands, `shared/`, `core/`, `lib/`, `stores/` all put `<Name>.test.{ts,tsx}` in the same folder as `<Name>`. (A page's cross-component _integration_ flows may additionally live in `pages/<page>/__tests__/integration/`.)
- **E2E** (`tests/e2e/`, Playwright): `<name>.e2e.test.ts` (UI) or `<name>-api.e2e.test.ts` (HTTP contracts). Never `.spec.ts`.

See `agent-os/skills/route-island/SKILL.md` and `docs/reference/route-island-structure.md`.

### 3. Templates

#### Component Template

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, it, expect, vi } from 'vitest';
import { ComponentName } from './ComponentName.tsx';

describe('ComponentName', () => {
  it('renders without crashing', () => {
    render(<ComponentName />);
    expect(screen.getByTestId('component-name')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ComponentName />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ComponentName onAction={onAction} />);

    await user.click(screen.getByTestId('action-button'));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
```

**Key rules for component tests:**

- ALWAYS include an axe accessibility assertion
- Use `data-testid` selectors for test stability (not class names)
- Use `userEvent` (not `fireEvent`) for interactions
- Wrap with providers if needed: `renderWithProviders` from `@/tests/utils/renderWithProviders.tsx`
- Test loading, error, and empty states when applicable
- Test ARIA attributes (`role`, `aria-label`, `aria-live`) for accessible components

#### Form Template

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, it, expect, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { FormName } from './FormName.tsx';

describe('FormName', () => {
  // renderWithProviders wires the TanStack Router + Query providers, so forms
  // that navigate (useNavigate) render without a manual router wrapper.
  const renderForm = () => renderWithProviders(<FormName />);

  it('renders all form fields', () => {
    renderForm();
    expect(screen.getByTestId('form-name-email')).toBeInTheDocument();
    expect(screen.getByTestId('form-name-password')).toBeInTheDocument();
    expect(screen.getByTestId('form-name-submit')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows validation errors on empty submit', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId('form-name-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeInTheDocument();
    });
  });

  it('submits with valid data', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByTestId('form-name-email'), 'test@example.com');
    await user.type(screen.getByTestId('form-name-password'), 'validPass123');
    await user.click(screen.getByTestId('form-name-submit'));

    // Assert API call or navigation
  });
});
```

#### Page Template

```tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';
import { PageName } from './PageNamePage.tsx';

// Stub API module
vi.mock('./api.ts', () => ({
  pageNameApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

describe('PageNamePage', () => {
  it('renders the page heading', async () => {
    renderWithProviders(<PageName />);
    expect(screen.getByTestId('page-name-page')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<PageName />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

#### Store Template

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStoreName } from './useStoreName.ts';

describe('useStoreName', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useStoreName.setState(useStoreName.getInitialState());
  });

  it('has correct initial state', () => {
    const state = useStoreName.getState();
    expect(state.someField).toBe(initialValue);
  });

  it('updates state via actions', () => {
    useStoreName.getState().someAction(newValue);
    expect(useStoreName.getState().someField).toBe(newValue);
  });

  it('handles edge cases', () => {
    // Test with invalid inputs, boundary values
    useStoreName.getState().someAction(undefined);
    expect(useStoreName.getState().someField).toBe(fallback);
  });
});
```

#### Service Template

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { someFunction } from './someModule.ts';

// Mock external dependencies if needed
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('someFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles the happy path', () => {
    const result = someFunction(validInput);
    expect(result).toBe(expected);
  });

  it('handles error conditions', () => {
    expect(() => someFunction(invalidInput)).toThrow();
  });

  it('handles edge cases', () => {
    // Null inputs, empty strings, boundary values
    expect(someFunction('')).toBe(fallback);
  });
});
```

#### Utility Template

```ts
import { describe, it, expect } from 'vitest';
import { utilityFn } from './utilityModule.ts';

describe('utilityFn', () => {
  it('returns expected output for valid input', () => {
    expect(utilityFn('input')).toBe('expected');
  });

  it('handles empty input', () => {
    expect(utilityFn('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(utilityFn(undefined)).toBe(fallback);
  });

  // For cn() utility specifically:
  // it('merges class names correctly', () => {
  //   expect(cn('foo', 'bar')).toBe('foo bar');
  //   expect(cn('p-4', 'p-2')).toBe('p-2'); // tailwind-merge deduplication
  // });
});
```

#### Hook Template

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHookName } from './useHookName.ts';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useHookName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useHookName(), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('fetches data successfully', async () => {
    const { result } = renderHook(() => useHookName(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });

  it('handles fetch errors', async () => {
    // Stub API to fail
    const { result } = renderHook(() => useHookName(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### 4. data-testid Convention

**Route islands:** hooks/components/forms tests live in those directories; page test at island root. See `agent-os/skills/route-island/SKILL.md`.

**Full rules, E2E workflow, and route inventory:** read `agent-os/skills/e2e-testids/SKILL.md` and `docs/reference/e2e-testids-inventory.md`.

All interactive and key elements MUST have `data-testid` attributes:

| Element        | Pattern           | Example                        |
| -------------- | ----------------- | ------------------------------ |
| Page container | `<name>-page`     | `data-testid="dashboard-page"` |
| Form           | `<name>-form`     | `data-testid="login-form"`     |
| Form input     | `<form>-<field>`  | `data-testid="login-email"`    |
| Submit button  | `<form>-submit`   | `data-testid="login-submit"`   |
| Error message  | `<form>-error`    | `data-testid="login-error"`    |
| Card/stat      | `<name>-card`     | `data-testid="stats-card"`     |
| Table          | `<name>-table`    | `data-testid="users-table"`    |
| Dialog         | `<name>-dialog`   | `data-testid="create-dialog"`  |
| Action button  | `<name>-<action>` | `data-testid="user-delete"`    |

### 5. Verify

After generating the test file:

1. Run `pnpm vitest run <test-file-path>` to verify it passes
2. Check that `toHaveNoViolations()` is present in ALL component/form/page tests
3. Verify `data-testid` selectors match the actual component implementation

### 6. Coverage Expectations

| Test Type       | Minimum Coverage                                                                   |
| --------------- | ---------------------------------------------------------------------------------- |
| Component tests | render, accessibility (axe), key interactions, error states, loading states        |
| Form tests      | render fields, accessibility, validation errors, valid submission, disabled states |
| Page tests      | render with mocked data, accessibility, navigation                                 |
| Store tests     | initial state, all actions, derived state, reset                                   |
| Service tests   | happy path, error handling, edge cases, mock dependencies                          |
| Hook tests      | loading/success/error states, refetch behavior                                     |

### 7. E2E Test Considerations

Before writing E2E specs:

1. Ensure testids exist — invoke **e2e-testids** skill; match `docs/reference/e2e-testids-inventory.md`
2. Run **`pnpm validate:testids`** after adding pages/forms/shell surfaces
3. Follow **playwright-e2e** skill — hybrid selectors via `tests/utils/e2e-hybrid.ts`

**Hybrid pattern** (`agent-os/skills/playwright-e2e/SKILL.md`):

```ts
import { expect, test } from '@playwright/test';

import { clickTestId, expectLoginFormReady } from '@/tests/utils/e2e-hybrid.ts';

test.describe('Feature Name', () => {
  test('completes the user flow', async ({ page }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);
    await clickTestId(page, 'login-submit');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });
});
```

- **Actions** (`click`, `fill`, navigation): `getByTestId` / `clickTestId` / `fillTestId`
- **Visibility / a11y guards**: `getByRole`, `getByLabel` alongside testids
- **Dialog unit tests**: `axeForDialog` from `@/tests/utils/axe-for-dialog.ts` (not raw `axe(container)` on portaled dialogs)

Always include axe checks via `@axe-core/playwright` in `accessibility.e2e.test.ts` (and feature specs when auditing a11y).

Full test matrix: `docs/reference/testing.md`.

---

## Review-caught rules

**Do not pin per-test timeouts below the suite floor.** `vitest.config.ts` owns
`testTimeout`. Per-test pins written when the default was lower silently become
*reductions* when the floor rises — on core-fe, 19 pins of `15_000`/`20_000`
turned into reductions once the floor moved to `30_000`, causing the very flakes
they were added to prevent.

```bash
grep -rnE '\}, *[0-9_]+\);' src tests --include='*.test.ts*'   # audit against the config floor
```

Fix contention with the project-level `testTimeout` / `maxWorkers`, not scattered
magic numbers. If one test genuinely needs longer, pin it *above* the floor and
say why in a comment.

**Keep TSDoc adjacent to the declaration.** The coverage extractor
(`pnpm tsdoc:check`) associates a doc block with the *next* declaration. An
interleaved `// eslint-disable-next-line` detaches it and busts the budget while
the comment still looks present:

```ts
/** Summary. */
// eslint-disable-next-line react-refresh/only-export-components   ← detaches
export const preload = …
```

Declare with its TSDoc, then export separately inside a block disable:

```ts
/** Summary. */
const preload = …

/* eslint-disable react-refresh/only-export-components -- test-facing hook */
export { preload };
/* eslint-enable react-refresh/only-export-components */
```

**Prefer an exported preload helper over duplicated imports in tests.** When a
component memoizes lazy chunks, export a `preload*()` and call it in `beforeAll`
— re-importing the modules in the test creates a second promise and reintroduces
the Suspense race.
