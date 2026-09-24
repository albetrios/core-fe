# `src/shared/tenancy/` — Organization context, membership, resolution

First-class tenancy area (spec: `docs/reference/routing-and-tenancy.md` §6). Lives in
`shared/` — NOT `core/` — because it composes the Zustand store, organization APIs, and
storage; the core kernel stays app-state-free (same reasoning as `shared/auth/`).
"Tenancy" is the sanctioned infra-layer term; everything user-facing says **organization**.

**Companion tiers** (see [`docs/reference/documentation-tiers.md`](../../../docs/reference/documentation-tiers.md)):
[PATTERNS](./TENANCY.PATTERNS.md) — the idioms · [FLOWS](./TENANCY.FLOWS.md) — the
runtime sequences · [POLICIES](./TENANCY.POLICIES.md) — the invariants.

**The URL is the single source of truth for organization context.** Inside
`/organization/$organizationSlug/*` the route param is canonical; `useOrganizationStore` is a
derived cache synced FROM the route. The `/` resolver's redirect choice comes from
me/context (the active organization); a subdomain, when present, only seeds a boot-time
store fallback. localStorage plays no role in organization context.

## Files

| File                                     | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization-context.ts`                | `syncOrganizationFromRoute` (URL → store), `getActiveOrganizationId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `organization-membership.ts`             | `findMembershipBySlug` (cache-first; refetches once on a miss before answering "not a member"), `ensurePermissionsFor` — refetches permissions when the organization changes (a once-if-empty check would leak org A's permissions into org B), reading the cached `me/context` first and falling back to the network                                                                                                                                                                                                                                                               |
| `organization-resolver.ts`               | `resolveRootRedirect` for `/`: **not onboarded** (`!user.onboarding_completed`) → onboarding; else active org (validated) → dashboard, else picker                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `my-organizations.ts` (+ .test)          | `createOrganization()`, `updateOrganization()`, `deriveOrganizationSlug()` + schemas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `my-organization-summaries.ts` (+ .test) | The caller's organization list under ONE cache key, `myOrganizationsQueryKey`: `fetch`/`ensure`/`prefetch`/`useMyOrganizationSummaries` + `invalidateMyOrganizationSummaries`. The guard chain, switcher, dashboard, command palette, picker, Settings and onboarding all read it, so a create, rename or logo change refreshes every surface by invalidating it. Rows carry no `isActive`: the hook derives it from the org store on read. `hydrateSessionContext` sends the request alongside me/context, and `invalidateSessionContext` drops the list at every session boundary |
| `tenancy-service.ts` (+ .test)           | Subdomain fallback resolution (`resolveOrganizationFromSubdomain`) — boot-time default for the organization header                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Consumers

- `app/guards/route-guards.ts` — the `$organizationSlug` guard chain
- `app/routes/routeTree.tsx` — `/` resolver
- `core/rbac/guards.ts` — reads the derived store's permission set for `requirePermission`
- `OrganizationSwitcher`, `CreateOrganizationDialog`, onboarding — navigate to
  `/organization/$organizationSlug/dashboard` and let the guard sync everything
