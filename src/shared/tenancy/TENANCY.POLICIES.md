# `src/shared/tenancy/` — Policies

Invariants that must hold. Breaking one is a security or cross-tenant correctness
bug, not a style nit. Companion tiers: [OVERVIEW](./TENANCY.OVERVIEW.md) ·
[PATTERNS](./TENANCY.PATTERNS.md) · [FLOWS](./TENANCY.FLOWS.md).

## The URL param is the only authority for active org

**Must:** inside `/organization/$organizationSlug/*`, derive active org from the
route param; sync the store _from_ it. Never treat the store (or subdomain) as the
authority in-app.
**Because:** two writers race — a stale store value serves org A's data under org
B's URL.
**Enforced by:** `organization-context.ts` (`syncOrganizationFromRoute`) + the
`$organizationSlug` guard chain in `app/guards/`.

## Only the latest-initiated switch may apply its token

**Must:** every switch takes a `switchGeneration` number; a response whose
generation is no longer current is dropped without touching the token or context.
**Because:** overlapping switches (rapid nav, double-click) resolve out of order;
the last _response_ must not win over the last _intent_, or the global token ends
up on org A while the URL says org B → org-B queries fetch with org A's token.
**Enforced by:** `switch.ts` (`liveSwitch` generation guard) + `switch.test.ts`.

## Permissions must be refetched when the active org changes

**Must:** resolve permissions per active org, not once-if-empty.
**Because:** a lazy cache leaks org A's permission set into org B, silently
widening access in the UI.
**Enforced by:** `organization-membership.ts` (`ensurePermissionsFor`).

## `switchToPersonal` gates on `personalOrganizationId`, not the flag

**Must:** only POST `/auth/switch-to-personal` when `me/context` carries a
`personalOrganizationId`.
**Because:** the personal org is provisioned best-effort server-side; a
flag-on-but-org-missing user is reachable, and gating on the flag guarantees a 404.
**Enforced by:** `switch.ts` (cached-context guard) + the deployment-mode tests.

## Org-scoped cache keys must carry the org id

**Must:** every org-scoped query key includes the active org id.
**Because:** structural isolation — two tenants must never share a cache entry, so
a switch needs no purge and cannot serve stale cross-tenant data.
**Enforced by:** the key convention in the org-scoped hooks (see
[PATTERNS](./TENANCY.PATTERNS.md)).

## Tenancy composes app state, so it lives in `shared/`, not `core/`

**Must:** keep tenancy in `src/shared/tenancy/` (it composes the Zustand store,
org APIs, storage). The `core/` kernel stays app-state-free.
**Because:** the one-way dependency rule — `core` must not depend on `shared`
runtime; only the documented kernel exception applies.
**Enforced by:** the import-boundary rules in `eslint.config.mjs` /
`agent-os/rules/fe-file-structure.mdc`.
