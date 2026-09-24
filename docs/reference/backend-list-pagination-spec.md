# Backend list pagination + server-side query — change spec

A cross-repo spec for **core-be** changes the frontend needs to stop loading
whole org-scoped lists into the browser. Drafted from core-fe; **no core-be code
is changed here** — implement in core-be on a clean branch, then land the small
frontend follow-ups noted under each item.

> **Status (2026-09-24):** members, roles and API keys are done on the frontend.
> `listMembers` / `listRoles` / `listApiKeys` now fetch one server-side page at a
> time through `shared/api/fetch-list-page.ts`, and Settings → Members sends its
> search `q` and sort to the server and loads more on demand. Billing invoices
> still read every page through `fetch-all-pages`. The shared members table this
> spec first targeted was removed as dead code; nothing rendered it.

## Why

When this spec was drafted, the frontend fetched **every** row of org-scoped
lists and paginated, sorted, and filtered in the browser:

- `shared/api/organization-api.ts` `listMembers` / `listRoles` / `listApiKeys`
  and `shared/api/billing-api.ts` `listBillingInvoices` followed the cursor with
  `shared/api/fetch-all-pages.ts` (up to 50 pages × 100 rows) and handed the full
  set to a table that sorted/filtered client-side via
  `shared/hooks/useDataTableUrlState`.
- This is fine for small orgs but is O(n) round-trips + full-list render + memory
  for large ones. For **invoices** it is worse: core-be caps the list at 24 with
  **no cursor exposed**, so a customer with >24 invoices silently cannot see the
  rest.

The frontend is already shaped for the fix: `useDataTableUrlState` keeps
`q` / `role` / `sort` / `page` / `size` in the URL, and `fetch-all-pages` already
reads `meta.pagination.{has_more,next}`. The missing half is server-side.

## Current core-be state (verified)

| Endpoint                                                                    | Cursor pagination                                                                                                                | Server sort    | Server filter / search |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------- |
| `GET /tenancy/organization/memberships` (`membership.repository.ts`)        | ✅ keyset `after`/`limit`, `orderBy(asc(created_at), asc(id))`                                                                   | ❌ fixed order | ❌ none                |
| `GET …/roles` (`member-role.repository.ts`)                                 | ✅ keyset, `orderBy(asc(name), asc(id))`                                                                                         | ❌ fixed order | ❌ none                |
| `GET …/api-keys`                                                            | ✅ keyset                                                                                                                        | ❌             | ❌                     |
| `GET /billing/invoices` (`subscription.controller.ts` → `stripe.client.ts`) | ❌ returns a bare array via `successResponse`; `listStripeInvoices` hardcodes `limit: 24` and drops Stripe's `has_more` + cursor | ❌             | ❌                     |

Conventions to reuse (do not invent new ones):

- `src/shared/utils/http/response.util.ts` → `paginatedResponse(data, request_id, { per_page, next, has_more, estimated_total? })`.
- Keyset cursor helpers already used by `member-role.repository.ts` /
  `membership.repository.ts`: `parseListCursor(after)` +
  `buildAscendingTextIdCursorCondition(...)`, `limit(limit + 1)` →
  `has_more = rows.length > limit` → `slice(0, limit)` → `next_cursor`.
- Cursor query DTOs live in `*.dto.ts` (`after: z.string().max(512).optional()`,
  `limit: z.coerce.number().int().min(1).max(100).default(25)`), `.strict()`.

---

## Item 1 — expose a cursor for invoices (smaller, self-contained)

**Goal:** `GET /billing/invoices` returns a page + `meta.pagination`, following
Stripe's native cursor, so the frontend can fetch all invoices (or window them).

**core-be changes**

1. `src/infrastructure/payment/stripe.client.ts` — `listStripeInvoices(customerId, opts)`:
   - accept `{ limit?, startingAfter?, requestId? }`; pass `limit` (default 25,
     clamp ≤ 100) and `starting_after: startingAfter` to `stripe.invoices.list`.
   - return `{ data: page.data, hasMore: page.has_more }` (Stripe sets
     `has_more`); the next cursor is the **last invoice id** in `data`.
2. `subscription.service.ts` — `listInvoices(orgId, { after?, limit? })`:
   - resolve `customerId`; when Stripe is unconfigured return
     `{ items: [], pagination: { per_page: limit, next: null, has_more: false } }`.
   - call the client with `startingAfter: after`; serialize via
     `BillingAccountSerializer.invoices`; build `next = hasMore ? items.at(-1)!.id : null`.
3. `subscription.controller.ts` — `listInvoices`: parse a cursor DTO from
   `request.query`; return `paginatedResponse(items, getRequestIdentifier(request), pagination)`.
4. `subscription.routes.ts` — add the `.strict()` cursor querystring schema to the
   `GET …/invoices` route (mirror the members/roles list routes).
5. `subscription.dto.ts` — `listInvoicesQuerySchema` = the standard cursor schema.

**Tests (core-be):** service returns `has_more: true` + a `next` id when Stripe
reports more; controller emits the `meta.pagination` envelope; unconfigured-Stripe
path returns the empty page. Existing invoice-mapping tests stay green.

**Frontend follow-up (core-fe, after BE ships):** route `listBillingInvoices`
through `fetchAllPages(`${BILLING_API}/invoices`, billingInvoiceWireSchema, 'billing-invoices')`
(it already tolerant-parses and follows `meta.pagination`). No UI change — the
invoices table just stops truncating at 24.

---

## Item 2 — server-side sort + filter for member-style lists (larger)

**Goal:** members / roles / api-keys accept `q` (search), `sort`, `order` so the
frontend can switch to **windowed** server-side paging instead of loading the
whole list to sort/filter in the browser.

**core-be changes (per list — start with members)**

1. `membership.dto.ts` list query schema — extend the existing cursor schema
   (keep `.strict()`):
   - `q: z.string().trim().min(1).max(120).optional()` — substring match on member
     display name + email.
   - `sort: z.enum(['name', 'role', 'joined_at']).default('joined_at')`.
   - `order: z.enum(['asc', 'desc']).default('asc')`.
2. `membership.repository.ts` — `listMembers`:
   - `q` → `WHERE (lower(user.name) LIKE %q% OR lower(user.email) LIKE %q%)`
     (parameterized; reuse the existing `and(... deleted_at IS NULL ...)`).
   - dynamic `ORDER BY <sortColumn> <order>, id <order>` (id as the stable
     tiebreaker, same direction as the sort).
   - **Keyset cursor must encode the sort key, not just the id.** With a
     non-id sort, `buildAscendingTextIdCursorCondition` is insufficient — the
     cursor has to carry `(sortValue, id)` and the WHERE becomes the standard
     keyset tuple comparison for the chosen direction. If that is too invasive
     for v1, fall back to **offset paging** for the sorted/filtered case
     (`page`/`size`) and keep keyset only for the default unsorted view — but
     document which one each list uses so the frontend matches.
3. Apply the same DTO + repo treatment to roles and api-keys once members lands.

**Tests (core-be):** `q` filters by name and by email; each `sort`×`order`
returns the expected order; pagination is stable across pages under a given
sort (no dupes/skips); `.strict()` still rejects unknown query params.

**Frontend follow-up (core-fe, after BE ships):**

- **Members: done, differently.** `useMembers` passes Settings → Members' search
  `q` and sort to `listMembers`, which fetches one keyset page at a time (no
  `fetch-all-pages`), and the panel loads more on demand instead of switching a
  TanStack table to `manualPagination`/`manualSorting`/`manualFiltering`. The
  shared members table this bullet targeted was removed as dead code.
- If a list uses offset paging server-side, surface `page`/`size`; if keyset,
  surface `next` only (no jump-to-page). Pick one per list and keep the table's
  controls consistent with it.

---

## Acceptance criteria

- Invoices: a customer with >24 invoices can page through all of them; the
  frontend follows `meta.pagination` with no UI change.
- Members (and then roles/api-keys): a large org no longer ships its entire
  member list to the browser; search + sort happen server-side; paging is stable.
- All new query params are validated and `.strict()`; existing list responses
  keep the `{ data, meta }` envelope.

> The cross-tenant scoping is unchanged — every one of these endpoints already
> scopes by the active org from the token's `org` claim; this spec only changes
> _how much_ of an already-scoped list is returned and in what order.
