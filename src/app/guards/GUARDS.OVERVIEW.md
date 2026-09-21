# `src/app/guards/` — Layered route access checks

Composable **`beforeLoad` functions** (never wrapper components — those render before
redirecting). Spec: `docs/reference/routing-and-tenancy.md` §5. Frontend guards are UX
only; the backend/RLS re-checks everything. UI-level checks use `PermissionGuard` /
`useRBAC` in `src/shared/`.

Platform overview: [`docs/reference/frontend-platform.md`](../../../docs/reference/frontend-platform.md).

## Guard chain for `/organization/$organizationSlug/*`

| #   | Guard                                           | Lives in                   | Failure                                                                                                                                          |
| --- | ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `requireAuth`                                   | `core/rbac/guards.ts`      | redirect `/login`                                                                                                                                |
| 2   | `requireProvisionedWorkspace`                   | `route-guards.ts`          | not onboarded → `/onboarding`; personal active org → `/dashboard`; no team workspace → `/organization` picker                                    |
| 3   | `requireOrganizationContext($organizationSlug)` | `route-guards.ts`          | malformed param / unknown org / non-member → **404** (existence never leaked)                                                                    |
| 4   | `requireActiveOrganization`                     | `route-guards.ts`          | slug not synced for URL → **404** (fail closed); suspended → `…/suspended` (which runs the INVERSE guard, not this one, so neither can loop)     |
| 5   | `gatewayFromManifest(manifest)`                 | `core/security/gateway.ts` | L1 session + L5 `manifest.permission` + L6b `manifest.module` → `/unauthorized` or `notFound` per `onDeny`                                       |
| 6   | Resource scope                                  | route **loader** fetch     | NOT a guard: the API returns the resource scoped to the organization; 404/403 map to the NotFound/Unauthorized islands. One fetch, no waterfall. |

`requireFeature(moduleKey)` in `core/security/gates/require-module.ts` is a synchronous
helper for ad-hoc loaders; routes with a manifest should use step 5 instead.

Dashboard (`…/dashboard`) runs `gatewayFromManifest(dashboardManifest)` then
`requireOrgStatus` in `routeTree.tsx`.

## Guard chain for `/dashboard` (personal)

| #   | Guard                                    | Lives in                   | Failure                                                                                       |
| --- | ---------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `requireAuth`                            | `core/rbac/guards.ts`      | redirect `/login`                                                                             |
| 2   | `requirePersonalDeployment`              | `route-guards.ts`          | team-only deployment → `/`                                                                    |
| 3   | `requireProvisionedPersonalDashboard`    | `route-guards.ts`          | not onboarded → `/onboarding`; team active org → that slug's dashboard (same as `/` resolver) |
| 4   | `gatewayFromManifest(dashboardManifest)` | `core/security/gateway.ts` | permission + module gates (same manifest as team dashboard)                                   |

Both workspace guards delegate to `resolveRootTarget` in `shared/tenancy/organization-resolver.ts` — one rule for all deployments, which gates onboarding on `user.onboarding_completed` before any active-org routing. Session reads use the cache-first `ensureSessionContext` in `shared/tenancy/session-context.ts`.

## Guard chain for `/onboarding`

| #   | Guard                        | Lives in              | Failure                                                                                                              |
| --- | ---------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | `requireAuth`                | `core/rbac/guards.ts` | redirect `/login`                                                                                                    |
| 2   | `requireOnboardingWorkspace` | `route-guards.ts`     | already onboarded (`onboarding_completed`) → `/dashboard` or team slug dashboard (same as `/` resolver; no re-entry) |

`requireOnboardingWorkspace` is the one guard in these chains that **writes**. Before it
resolves a target it calls `useOnboardingStore.getState().claimForUser(ctx.user.id)`,
binding the localStorage-persisted wizard to the signed-in user and **wiping it first**
when it belongs to a different (or unknown) one. It runs here rather than in a page
effect precisely so a previous user's name and workspace can never reach the DOM for a
frame (ONB-4); it is a no-op once the store already belongs to this user.

`requireOrganizationContext` also **syncs the derived `useOrganizationStore` from the URL**
(the param is canonical — routing-and-tenancy.md §4) and refetches per-organization
permissions when the organization changes (`shared/tenancy/organization-membership.ts`).

## Guard chain for `/accept-invite/$invitationId`

| #   | Guard                        | Lives in              | Failure                                                                                    |
| --- | ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `parseInvitationIdParam`     | `routeTree.tsx`       | malformed invitation id → **404**                                                          |
| 2   | `requireAuth(location.href)` | `core/rbac/guards.ts` | no session → `/login`, carrying this page (invite `?token=` included) as `redirect` search |

Reached from an emailed link, so the visitor usually is **not** signed in yet — that is
the common path here, not the edge case. The session check lives in `beforeLoad` rather
than a page effect so the "Joining…" card does not paint and then vanish (INV-4), and
`requireAuth` awaits the auth bootstrap first, so a cold load of the link does not bounce
an already-signed-in user.

## Sanctioned exceptions

- **Bespoke-guard routes (no `gatewayFromManifest`):** `/onboarding` (`requireAuth` +
  `requireOnboardingWorkspace`), the `/organization` picker (`requireAuth` +
  `requireProvisionedWorkspace`), and `/accept-invite/$invitationId` (param parse +
  `requireAuth`). All three manifests declare `permission: null` — their access rule is
  session + workspace state, or for accept-invite the single-use invitation token plus the
  session's email, not a permission, so the gateway would be a no-op.
- **Suspended leaf:** `…/suspended` runs `gatewayFromManifest(manifest)` and then
  `requireSuspendedOrgStatus` — the **inverse** of `requireOrgStatus`, not that guard.
  It intentionally skips `requireOrgStatus` (the blocked state must render for a
  suspended organization without redirect-looping into itself) but is NOT unguarded:
  an organization that is not suspended is sent back to its dashboard. The two guards
  partition the status space, so no organization satisfies both and the pair cannot
  loop. Before the inverse existed, "outside `requireOrgStatus`" meant unguarded in
  both directions, and typing the URL told the owner of a demonstrably active
  organization that it was suspended.

## Files

| File                      | Purpose                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `route-guards.ts`         | Org + workspace guards composing `shared/tenancy` (`requireOrganizationContext`, `requireProvisioned*Dashboard`, …) |
| `org-gates.ts`            | Thin `Gate` wrappers for the org route space (used with `gateway()`)                                                |
| `RBACGuard.tsx` (+ .test) | In-page permission gating component (rendering-level, not route-level)                                              |

Auth + permission primitives stay in `core/rbac/guards.ts` (`requireAuth`,
`requirePermission`); the **security gateway** (`gatewayFromManifest`, `gatewayFromPolicy`)
lives in `core/security/gateway.ts`. Route registration applies the chain in
`src/app/routes/routeTree.tsx` `beforeLoad` hooks.

Adversarial matrix: `tests/security/route-access-matrix.security.test.ts`,
`tests/security/settings-access-matrix.security.test.ts`.
