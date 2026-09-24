---
name: fe-routing-tenancy
description: Org-scoped routing, guard chains, security gateway, session context, settings hash modal, and root resolver for core-fe. Use when adding routes under organization/$organizationSlug, editing routeTree guards, gatewayFromManifest, or session hydrate/invalidate.
---

# Routing & tenancy (core-fe)

Use this skill whenever you touch **organization-scoped URLs**, **route guard chains**,
**security gateway** wiring, **session context**, or the **settings hash modal**.

**Folder scaffolding** stays in **`fe-route-island`** — this skill covers **tenancy + access**
after the island exists.

**Canonical spec:** `docs/reference/routing-and-tenancy.md`  
**Guard chains:** `src/app/guards/GUARDS.OVERVIEW.md`  
**Platform boot + gateway:** `docs/reference/frontend-platform.md`

---

## Vocabulary (non-negotiable)

| Use                                     | Never (user-facing)                       |
| --------------------------------------- | ----------------------------------------- |
| `organization`, `$organizationSlug`     | `org`, `tenant`, `workspace` in URLs/copy |
| `shared/tenancy/` as infra module name  | —                                         |
| Public IDs: `org_8fK2x` (random suffix) | Sequential IDs in URLs                    |

Organization context travels in the **URL path** — there is no `X-Organization-ID` header.

---

## When to invoke

- New route under `pages/organization/$organizationSlug/` or root `/dashboard`
- Editing `src/app/routes/routeTree.tsx` `beforeLoad` / loader guards
- Adding `permission`, `module`, or `onDeny` on a protected manifest
- Session boot, logout, org switch (`hydrateSessionContext`, `invalidateSessionContext`)
- Settings deep links (`#settings/<scope>/<section>`)
- `/` resolver or org picker behavior

---

## Checklist — new org-scoped route

1. **Scaffold island** — `fe-route-island` → 4 mandatory files + `docs/reference/routes-and-ui.md`.
2. **Manifest policy** — set `permission`, optional `module` (L6b key from catalog), optional `onDeny` (`unauthorized` vs `notFound`).
3. **Register in `routeTree.tsx`** — lazy child under `$organizationSlug` layout (or personal `/dashboard` chain).
4. **Tenancy guards (team org)** — in order where applicable:
   - `requireAuth`
   - `requireProvisionedWorkspace`
   - `requireOrganizationContext($organizationSlug)` — syncs store from URL; unknown org → **404**
   - `requireActiveOrganization` — suspended → `…/suspended`
   - `gatewayFromManifest(manifest)` — session + permission + disabled module
5. **Personal dashboard** — use personal guard chain from `GUARDS.OVERVIEW.md` (not the slug chain).
6. **Do not** call `requireFeature()` when manifest has `module` — prefer `gatewayFromManifest`.
7. **Resource fetch** — scope in API path; 404/403 from API maps to islands — not a separate guard waterfall.
8. **Tests** — extend `tests/security/route-access-matrix.security.test.ts` when access policy changes.
9. **Docs** — update `routes-and-ui.md` + island `<PAGE>.OVERVIEW.md`.

---

## Security gateway (L1 → L6b)

```ts
import { gatewayFromManifest } from '@/core/security/gateway.ts';

// routeTree beforeLoad:
await gatewayFromManifest(manifest)(toGateContext(location, params));
```

| Layer         | Source                                       | Denial                                     |
| ------------- | -------------------------------------------- | ------------------------------------------ |
| L1 session    | `requireSession` (always in gateway)         | login redirect via auth                    |
| L5 permission | `manifest.permission`                        | `/unauthorized` or `notFound` per `onDeny` |
| L6b module    | `manifest.module` vs `VITE_DISABLED_MODULES` | `notFound()` (404)                         |

Module keys must match `docs/reference/frontend-platform.md` catalog (`billing`, `members`, …).

---

## Session context

| API                             | When                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| `hydrateSessionContext()`    | After token refresh / boot — seeds React Query + derived org store  |
| `ensureSessionContext()`     | Guards and the `/` resolver — cached context, fetched once if absent |
| `invalidateSessionContext()` | Logout, forced refresh                                              |

Switching organization goes through `switchToOrganization()` (`shared/tenancy/switch.ts`), which
re-mints the token and updates the `me/context` and organization-list caches **in place** with
`setQueryData`. It deliberately purges **nothing**: every organization-scoped query key carries the
active organization id, so two tenants can never share a cache entry, and switching back to a
recently-visited organization is served instantly. Do not re-add a `removeQueries` purge.

Auth bootstrap (`shared/auth/service.ts`) calls `hydrateSessionContext()` after refresh.
Guards and `/` resolver share the same helper — do not fork a second `me/context` path.

---

## Settings hash modal (not a route)

- URL: `#settings/<scope>/<section>` — scopes `account` \| `organization`
- Mounted once on root route; invalid hash → `#settings/account/profile`
- RBAC inside modal (`settings-permissions.ts`) — never fork `core/rbac`
- Hash changes invisible to pageview analytics — emit explicit PostHog event
- Open state in URL hash — **not** `useUIStore`

---

## Root `/` resolver

Pure redirect route — no island UI. `resolveRootTarget` checks **onboarding first**:
`!user.onboarding_completed` → `/onboarding` (every deployment mode — even personal,
whose org is auto-provisioned; only the wizard steps differ). Once onboarded:
active org dashboard → `/organization` picker. Personal org uses root `/dashboard`;
team org uses `/organization/$organizationSlug/dashboard`. Onboarding finish stamps the
flag via `POST /users/me/onboarding/complete` before the resolver re-runs.

---

## Anti-patterns

- Query-param or session-only organization context
- `/o/`, `/org/`, `/app/` URL prefixes
- Ad-hoc `requirePermission` in loader when manifest already declares policy — use gateway
- Second detail URL for the same resource (canonical-URL rule)
- Page importing another page's island

---

## Verify

```bash
pnpm type-check
pnpm test -- --run src/app/guards/ src/core/security/ tests/security/route-access-matrix.security.test.ts
pnpm validate:testids   # when pages/forms touched
```

---

## Related

- Skill: `fe-route-island`, `fe-page-scaffolding`, `fe-resource-crud` (org-scoped resources)
- Rule: `agent-os/rules/fe-routing-tenancy-sync.mdc`
- Rule: `agent-os/rules/fe-file-structure.mdc` (settings hash, `$param` naming)
