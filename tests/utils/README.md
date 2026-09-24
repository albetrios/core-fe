# Test Utilities

## renderWithProviders

Renders a component with TanStack Query and TanStack Router (memory history).

```tsx
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

test('renders component', () => {
  const { getByText } = renderWithProviders(<MyComponent />);
  expect(getByText('Hello')).toBeInTheDocument();
});
```

### Options

- `initialEntries?: string[]` — initial route entries (default: `['/']`)
- `queryClient?: QueryClient` — custom client (default: fresh, no retries)

### Isolating HTTP in unit tests

Stub `apiClient` or module dependencies with `vi.mock()` and `vi.fn()` at the top of the test file — unit tests never start a server.

```tsx
const getMock = vi.fn();
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: getMock, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
```

## E2E helpers

### `e2e-hybrid.ts` (hybrid selectors)

Playwright specs use **`data-testid` for actions** and **`getByRole` / `getByLabel` for a11y guards**. See `agent-os/skills/fe-playwright-e2e/SKILL.md`.

### `e2e-faker.ts`

Faker-backed disposable data for Playwright/API E2E (emails stay on `@acme.test` for mail_outbox).

| Helper                        | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `uniqueE2eEmail(label?)`      | Unique mailbox (`label.user.123@acme.test`) |
| `e2eDisplayName()`            | Onboarding / profile full name              |
| `e2eOrganizationName()`       | Workspace / org display name                |
| `e2eOrganizationSlug(label?)` | URL-safe org slug                           |
| `e2eTeamOrgProfile(opts?)`    | `{ name, slug }` pair for team org creation |
| `e2eRoleName()`               | Custom RBAC role name for tenancy API E2E   |

### `e2e-auth.ts`

Requires **core-be** on `:3000` — Vite proxies `/api` in dev.

| Helper                                     | Purpose                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `createSessionViaEmailCode(api)`           | API helper — send-code + login; needs `DATABASE_URL` (reads code from `auth.mail_outbox`) |
| `authenticateViaEmailCode(page)`           | Browser/API helper — same flow via Playwright request (needs `DATABASE_URL`)              |
| `authenticateViaSignup(page)`              | Alias of `authenticateViaEmailCode` (legacy signup route removed)                         |
| `completeOnboardingWizard(page)`           | Walk onboarding when `needsOnboarding`                                                    |
| `registerNewUserAndGoToDashboard(page)`    | UI email-code login + onboarding when needed → dashboard                                  |
| `loginViaEmailCodeUI(page)`                | Email-code login via `/login` UI only (needs `DATABASE_URL`)                              |
| `authenticateViaEmailCodeAndLand(page)`    | API session + `/` resolver hydrate (needs `DATABASE_URL`)                                 |
| `createTeamOrgViaSwitcher(page)`           | Create team org via org switcher dialog                                                   |
| `selectOrganizationInSwitcher(page, slug)` | Switch active org in the header switcher                                                  |

### `e2e-tenancy.ts`

| Helper                               | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `createTeamOrganization(api, token)` | Create TEAM org (+ optional token switch) |
| `bearerHeaders(token, withIdem?)`    | Authorization header for API E2E          |

### `global-setup.ts`

Playwright runs `tests/e2e/global-setup.ts` before any spec — probes `GET http://localhost:3000/readyz` and fails if core-be is not running.

### `axe-for-dialog.ts` (unit dialog a11y)

Radix dialogs portal outside the render container — use `axeForDialog` instead of `axe(container)`:

```ts
import { axeForDialog } from '@/tests/utils/axe-for-dialog.ts';
```

## Test fixtures (`tests/fixtures/`)

Static shapes for unit tests only — never imported from `src/`.

```tsx
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/tests/fixtures/notification-fixtures.ts';
```
