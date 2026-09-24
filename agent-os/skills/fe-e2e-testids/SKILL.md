---
name: fe-e2e-testids
description: Add and maintain data-testid attributes for Playwright E2E and stable selectors. Use when scaffolding UI, preparing E2E specs, auditing test hooks, or when the user asks for test ids on elements.
---

# E2E Test IDs (`data-testid`)

Single source of truth for **Playwright-ready selectors** in core-fe. Use **`data-testid`** (not HTML `id`) on every element you expect to target in E2E or component tests.

## Triggers

- User asks for "test ids", "e2e selectors", "data-testid", or "ids for playwright"
- New page, form, dialog, table, or nav item is added
- Before writing or extending `tests/e2e/*.e2e.test.ts`
- Page scaffolding or fe-auto-implement completes UI work

## Rules

1. **Attribute:** `data-testid="kebab-case"` only — never rely on CSS classes, copy text, or DOM order in E2E.
2. **Scope:** Page root, forms, inputs, buttons, links, tabs, tables, dialogs, error/empty/loading states, and primary nav items.
3. **Stability:** IDs describe **role + context**, not visual copy (`login-submit` not `sign-in-button`).
4. **Forms:** Prefer `<form>-<field>` for inputs and `<form>-submit` for submit. API errors: `<form>-error` (login uses `login-error` for historical E2E).
5. **Do not** add testids to shadcn primitives in `shared/components/ui/` unless wrapping in a page-specific component.
6. **Inventory:** After adding or renaming testids on a route, update `docs/reference/e2e-testids-inventory.md`.

## CI gate

`pnpm validate:testids` enforces **test contracts** (not every DOM node):

| Check          | Rule                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Page manifests | `manifest.testId` must appear on a `data-testid` in the island or its delegated shell (e.g. `Dashboard` → `dashboard-page`) |
| Forms          | `src/pages/**/forms/*Form.tsx` and `src/shared/forms/*Form.tsx` need `*-form` + primary action (`*-submit`, `*-sign-in`, …) |
| Shell          | `app-layout`, `auth-layout`, `settings-modal` roots                                                                         |

Allowlist: `tooling/validate/test-ids-allowlist.txt`. Runs in `pnpm health` after `validate:theme-axis`.

The Forms check reads the raw `data-testid` attribute **and** the `testId` prop that shared inputs/
buttons forward to `data-testid` (e.g. `AuthMethodButton testId={…}`). So a form whose action lives
in a shared component still satisfies the contract — keep passing the id, don't inline a duplicate.

## Naming patterns

| Element              | Pattern                                 | Example                         |
| -------------------- | --------------------------------------- | ------------------------------- |
| Page container       | `<route>-page`                          | `dashboard-page`                |
| Page heading         | `<route>-heading` or `<route>-greeting` | `dashboard-greeting`            |
| Layout shell         | `<layout>-layout`                       | `auth-layout`, `app-layout`     |
| Form wrapper         | `<form>-form`                           | `login-form`                    |
| Form field           | `<form>-<field>`                        | `login-email`                   |
| Submit               | `<form>-submit`                         | `auth-email-submit`             |
| API / server error   | `<form>-error`                          | `login-error`, `form-error`     |
| Field validation     | `<form>-<field>-error`                  | `login-email-error`             |
| Link (auth switch)   | `<context>-link-<action>`               | `login-link-sign-up`            |
| Nav (sidebar/mobile) | `nav-<slug>`                            | `nav-dashboard`, `nav-settings` |
| Tab                  | `<section>-tab-<slug>`                  | `team-tab-members`              |
| Card / widget        | `<name>-card` or `<name>-section`       | `team-section`                  |
| Stat                 | `stat-card-<slug>`                      | `stat-card-users`               |
| Dialog               | `<name>-dialog`                         | `create-org-dialog`             |
| Table                | `<name>-table`                          | `members-table`                 |
| Loading              | `<context>-loading`                     | `accept-invite-loading`         |

**Slug rule:** lowercase, hyphens only; derive from route path (`/organization/members` → `organization-members` when needed).

## Workflow

### Adding testids to new UI

1. Add `data-testid` on the **outermost** testable node (page `div`, form `div`, `Card`, `Button`, `Link`, `Input`).
2. Mirror names in colocated unit tests (`screen.getByTestId(...)`).
3. Append the route section in `docs/reference/e2e-testids-inventory.md`.
4. Write Playwright spec using `page.getByTestId('...')`.

### Playwright usage (hybrid)

**Read `agent-os/skills/fe-playwright-e2e/SKILL.md` first.** Actions use testid; visibility also asserts roles/labels via `tests/utils/e2e-hybrid.ts`.

```ts
import {
  clickTestId,
  expectLoginFormReady,
  fillTestId,
} from '@/tests/utils/e2e-hybrid.ts';

await page.goto('/login');
await expectLoginFormReady(page); // testid + getByLabel/getByRole
await fillTestId(page, 'login-email', 'user@example.com');
await clickTestId(page, 'login-submit');
```

Use `getByRole` / `getByLabel` for **a11y guards** on labeled controls; use `getByTestId` for **all interactions**.

### Checklist (every new page)

- [ ] `<name>-page` on root
- [ ] Primary heading or greeting testid
- [ ] All form fields + submit + error states
- [ ] Primary CTAs and nav links used in flows
- [ ] Tabs, tables, dialogs referenced in acceptance criteria
- [ ] Inventory doc updated
- [ ] E2E spec stub in `tests/e2e/` (optional until flow is ready)

## Related

| Resource                     | Path                                        |
| ---------------------------- | ------------------------------------------- |
| Test ID inventory (by route) | `docs/reference/e2e-testids-inventory.md`   |
| Unit test + testid rules     | `agent-os/rules/fe-testing-requirements.mdc`   |
| Page scaffold defaults       | `agent-os/skills/fe-page-scaffolding/SKILL.md` |
| E2E specs                    | `tests/e2e/`                                |
| E2E auth helper              | `tests/utils/e2e-auth.ts`                   |

## Auto-invocation

- **fe-page-scaffolding** and **fe-auto-implement** must apply this skill for all interactive UI.
- **fe-test-generation** cross-references naming here; form templates must match live testids.
- When user says "add e2e later", still add testids in the same PR as the UI.
