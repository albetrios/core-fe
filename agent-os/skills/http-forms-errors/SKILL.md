---
name: http-forms-errors
description: Form mutations, API error mapping, and read-path error UX in core-fe — mapValidationErrors + RHF, 429 RateLimitNotice, notifyError, QueryBoundary. Use when wiring forms to apiClient mutations or server-state panels.
---

# HTTP, forms & errors (core-fe)

Use this skill when connecting **react-hook-form + Zod** mutations to **`apiClient`**, or
when choosing how **read vs write** paths surface failures.

**Data fetching patterns:** `react-best-practices` + `agent-os/rules/api-data-patterns.mdc`  
**Resilience rules:** `agent-os/rules/resilient-interactions.mdc` — single-flight writes (§1), `useAppMutation` for every write (§20), all three query states (§8), four states with the shared components (§19), dialog exits held during a write (§26)  
**Platform overview:** `docs/reference/frontend-platform.md` (HTTP errors, QueryBoundary, offline stance)

---

## Decision tree

| Path                       | Pattern                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **Mutation (form submit)** | Client Zod → `apiClient` → map 422 to fields → toast for unmapped errors                |
| **429 on mutation**        | `RateLimitNotice` inline or above form — not a silent retry loop                        |
| **401**                    | Never catch in component — fetch client interceptor refreshes once then `forceLogout()` |
| **Read (panel/widget)**    | `QueryBoundary` at panel boundary — no inline `isLoading`/`isError` duplication         |
| **Offline**                | Online-first — show error + retry; no silent write queue                                |

---

## Checklist — form mutation

1. **Schema** — Zod in `<page>.contracts.ts`; `zodResolver` on the form.
2. **Submit handler** — TanStack Query `useMutation` or explicit `mutationFn` calling `<page>.api.ts` via `apiClient`.
3. **422 mapping** — in `onError`:

```tsx
import { mapValidationErrors } from '@/shared/errors/map-validation-errors.ts';
import { notifyError } from '@/shared/errors/errorHandler.ts';

onError: (error) => {
  if (mapValidationErrors(error, form.setError)) return;
  notifyError(error);
},
```

4. **Form root errors** — unmapped server message on `data-testid="form-error"` when appropriate.
5. **429** — if the form can hit rate limits (auth, invite, public endpoints):

```tsx
import { RateLimitNotice } from '@/shared/components/RateLimitNotice/index.ts';

<RateLimitNotice error={mutation.error} onDismiss={…} />
```

Helpers: `shared/errors/rate-limit.ts` (`isRateLimitError`, `getRateLimitRetryAfterSeconds`).

6. **Success** — invalidate query keys; close dialog or navigate per UX spec.
7. **Write feedback (pick one)** — route writes through `useAppMutation` and choose:
   - **Optimistic** for a safe in-place cache patch — a **removal** (filter by `id`)
     or **field update** (map by `id`) — via its `optimistic` config. Instant UI,
     auto-rollback on error.
   - **Non-optimistic** otherwise (especially **creates** — temp-id reconciliation
     is error-prone): show `mutation.isPending` (disabled button + spinner).
   - Never leave a write with no feedback. Policy + inventory:
     `docs/reference/data-mutations.md`.
8. **Idempotency** — fetch client attaches `X-Idempotency-Key` on writes automatically — do not disable.
9. **Tests** — colocated form test: 422 maps to field; 429 shows notice; axe clean.
   Optimistic paths also need patch-on-success + rollback-on-error.

---

## Checklist — read path (QueryBoundary)

1. Parent holds `useQuery` / hook; wrap render in `QueryBoundary`.
2. Pass typed `data` via render-prop to child — no duplicate skeleton/error branches.
3. Mutations stay **outside** the boundary.
4. Custom `loading=` / `errorMessage=` only when defaults are wrong for the layout.

Migrated reference panels: Settings org/account panels, dashboard widgets.

---

## Error mapping reference

| Status | Handler                                                            |
| ------ | ------------------------------------------------------------------ |
| 401    | Interceptor only                                                   |
| 422    | `mapValidationErrors` → RHF `setError`                             |
| 429    | `RateLimitNotice` + fetch-client retry policy for idempotent reads |
| Other  | `notifyError` / `mapApiError` via `errorHandler.ts`                |

`ValidationError` and `HttpError` 422 bodies support nested `error.fields` / `field_errors`.

**Branch on `error.reason`, don't map backend i18n keys on the FE.** core-be resolves its
error `detail` to human copy server-side and exposes a stable `error.reason` slug for
distinct 4xx causes (e.g. `disposable_email`). To branch on a specific cause, read
`apiErrorReason(error)` — do **not** grow a table that maps raw backend `errors:*` keys to
FE copy. If `detail` ever arrives as a raw `errors:*` key, that's a **backend** bug (an
unresolved key leak) — fix it in core-be's serializer, not with a per-key FE band-aid.

---

## Anti-patterns

- Catching 401 in components or mutations
- Toast-only for field-level validation when 422 body has field keys
- **Toast-only for a _critical_ error fired from an async event-handler `catch`** (login
  send/verify, OAuth/passkey start, any submit whose failure blocks the user) — a sonner
  toast created in that path can land in history yet never become active (it never paints,
  giving the user NO feedback). Critical failures MUST render an inline `role="alert"`
  surface (`FormError` banner) as the reliable channel; keep the toast as a secondary echo.
  Clear the banner when the user retries / edits. (See the AuthForm/AuthEmailPanel banners.)
- Inline `isLoading && <Skeleton>` + `isError && <p>` when `QueryBoundary` fits
- Raw `fetch` for domain APIs (use `apiClient`; auth paths excepted)
- Storing mutation errors only in Zustand
- Swapping a submit button's **label** to "…ing" while loading — keep the label stable and let the
  spinner carry progress (a label flicker reads as jank)
- A shared multi-action form (several buttons, one action at a time) re-deriving loading/disable per
  button — model it once and drive every button from the same "which action is pending" state

---

## Multi-action forms (one action in flight)

When a form offers several mutually-exclusive submit actions (e.g. the `/login` auth methods), keep a
single "which action is pending" value and drive every button from it — only the clicked one shows a
spinner; the rest disable **without** a spinner. `/login` codifies this in
[`AuthMethodButton`](../../../src/shared/forms/AuthForm/components/AuthMethodButton/AuthMethodButton.tsx)

- `auth-form-pending.ts`; copy that shape (stable label, icon→spinner, per-method captcha gate,
  `extraDisabled` for form/cooldown conditions). Adding an auth method is one more `<AuthMethodButton>`.
  Spec: `docs/reference/unified-auth-flows.md` → "Method button states"; rule:
  `agent-os/rules/component-patterns.mdc` → "Auth Method Buttons".

---

## Verify

```bash
pnpm type-check
pnpm test -- --run src/shared/forms/ src/shared/components/RateLimitNotice/ src/shared/errors/
```

---

## Related

- Skills: `composition-patterns`, `test-generation`, `resource-crud`
- Components: `QueryBoundary`, `RetryError`, `OfflineIndicator`
- Rules: `agent-os/rules/api-data-patterns.mdc`, `agent-os/rules/resilient-interactions.mdc`
