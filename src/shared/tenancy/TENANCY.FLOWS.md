# `src/shared/tenancy/` — Flows

The runtime sequences that span several tenancy modules. Companion tiers:
[OVERVIEW](./TENANCY.OVERVIEW.md) · [PATTERNS](./TENANCY.PATTERNS.md) ·
[POLICIES](./TENANCY.POLICIES.md).

## `/` root resolution

Where a bare `/` lands, decided from the JWT-backed session context.

1. `resolveRootRedirect()` → `ensureSessionContext()` (cache-first read of
   `me/context`: onboarding flag + deployment flags + active org; refetches only
   on a cold boot).
2. `resolveRootTarget(ctx)`:
   - **Onboarding first, every mode:** `needsOnboarding(ctx)` (i.e.
     `!user.onboarding_completed`) → `/onboarding`. This is checked _before_ any
     active-org routing, so a personal deployment's auto-provisioned org does not
     short-circuit a fresh user past the wizard.
   - Then by `(deploymentMode, activeOrg)`:
     - `personal-only`: active PERSONAL → `/dashboard`; none → `/dashboard`.
     - `team-only`: active TEAM with slug → `/organization/$slug/dashboard`; else
       `/organization` (picker).
     - `both`: PERSONAL active → `/dashboard`; TEAM active → `/organization/$slug/dashboard`.
3. Resolver returns the redirect (`organizationDashboard(slug)` for team targets).

Entry point: `organization-resolver.ts` · Ends at: a redirect target, never an island.

## Organization switch

Re-mints the global access token and re-points every derived surface at the new org.

1. `switchToOrganization(orgId)` → `liveSwitch('/auth/switch-to-organization', …)`.
2. `liveSwitch` bumps `switchGeneration`, POSTs, and **discards** the response if a
   newer switch superseded it in flight (stale generation → return `undefined`).
3. On the winning switch: `setAccessToken` + `scheduleTokenRefresh` +
   `applyActiveOrg` (updates `me/context` cache: active org, permissions, role).
4. `deriveOrgContext(result)` syncs the store, which also moves the organization
   list's `isActive` (derived from the store on read, never cached); an analytics
   `organizationSwitched` event fires.

Entry points: `switch.ts` (`switchToOrganization` / `switchToPersonal`) ·
Guard: monotonic `switchGeneration` · Ends at: new token + derived context.

## Switch to personal (404-safe)

1. `switchToPersonal()` reads cached `me/context`; if `personalOrganizationId` is
   falsy → return `undefined` (no request — the switch would 404).
2. Otherwise `liveSwitch('/auth/switch-to-personal', {})` → same token + context
   application as an org switch.

Entry point: `switch.ts` · Guard: `personalOrganizationId` present.
