import { notFound, redirect } from '@tanstack/react-router';

import { platformConfig } from '@/core/config/env.ts';
import { queryClient } from '@/core/http/queryClient.ts';
import { organizationDashboard } from '@/lib/routes/index.ts';
import { parseOrganizationSlugParam } from '@/lib/routes/params.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { mergeDeploymentFlags } from '@/shared/tenancy/deployment-mode.ts';
import { type MeContext, meContextQueryKey } from '@/shared/tenancy/me-context.ts';
import type { Organization } from '@/shared/tenancy/my-organizations.ts';
import { syncOrganizationFromRoute } from '@/shared/tenancy/organization-context.ts';
import {
  ensurePermissionsFor,
  findMembershipBySlug,
} from '@/shared/tenancy/organization-membership.ts';
import type { RootTarget } from '@/shared/tenancy/organization-resolver.ts';
import {
  resolveRootTarget,
  workspaceRedirectForPersonalDashboard,
  workspaceRedirectForTeamEntry,
} from '@/shared/tenancy/organization-resolver.ts';
import { ensureSessionContext } from '@/shared/tenancy/session-context.ts';
import { switchToOrganization } from '@/shared/tenancy/switch.ts';

function throwWorkspaceRedirect(target: RootTarget, redirectFrom?: string): never {
  if (target.to === '/onboarding') {
    // Carry the originally requested deep link through the wizard so finishing
    // onboarding can return the user there instead of dropping the destination.
    throw redirect({
      to: '/onboarding',
      search: redirectFrom ? { redirect: redirectFrom } : undefined,
    });
  }
  if (target.to === '/dashboard') throw redirect({ to: '/dashboard' });
  if (target.to === '/organization') throw redirect({ to: '/organization' });
  throw redirect({ to: target.to, params: target.params });
}

/**
 * Organization-scoped route guards — composable `beforeLoad` functions
 * (never wrapper components: those render before redirecting).
 *
 * Chain for `/organization/$organizationSlug/*` (GUARDS.OVERVIEW.md):
 *   requireAuth (core/rbac/guards) → requireOrganizationContext →
 *   requireActiveOrganization → requirePermission (core/rbac/guards, from the
 *   page manifest) → L6b module via `gatewayFromManifest(manifest).module`.
 *   Resource scope (does pat_x belong to org_y?) is NOT a guard — the route
 *   loader's fetch is the check, with API 404/403 mapped to NotFound/Unauthorized.
 *
 * These live in `app/` (not `core/`) because they compose `shared/tenancy`,
 * which the core kernel must not import. Frontend guards are UX only — the
 * backend re-checks everything.
 */

/**
 * Validate the `$organizationSlug` param, confirm membership, and sync the
 * derived store from the URL. Unknown organization or non-member → 404
 * (existence is never leaked to non-members). The human-readable slug resolves
 * to the canonical org here; everything downstream keys off the immutable id.
 */
export async function requireOrganizationContext(
  rawOrganizationSlug: string,
): Promise<Organization> {
  const slug = parseOrganizationSlugParam(rawOrganizationSlug);
  if (!slug) throw notFound();

  const organization = await findMembershipBySlug(slug);
  if (!organization) throw notFound();

  syncOrganizationFromRoute(organization.id, organization.slug, organization.status);
  // Switch-on-navigation: when the URL targets a different org than the cached
  // active one, switch the active-org context (me/context cache + access token)
  // so the switcher, dashboard, and RBAC all reflect the org in the URL.
  const activeId =
    queryClient.getQueryData<MeContext>(meContextQueryKey)?.activeOrganization?.id;
  if (activeId !== organization.id) {
    await switchToOrganization(organization.id);
  }
  await ensurePermissionsFor(organization.id);
  return organization;
}

/**
 * Block suspended / lapsed organizations. Runs on every org-scoped child
 * EXCEPT `suspended/` itself (the blocked state must render without
 * redirect-looping). Mock-mode organizations are always active.
 */
export function requireActiveOrganization(organizationSlug: string): void {
  const store = useOrganizationStore.getState();
  // Guard: requireOrganizationContext must have run first (it syncs slug+status
  // from the resolved org). Fail closed when status cannot be verified for the
  // URL org — never assume "active" during slug mismatch (FE-52).
  if (store.organizationSlug !== organizationSlug) {
    throw notFound();
  }
  const status = store.organizationStatus ?? 'active';
  if (status !== 'active') {
    throw redirect({
      to: '/organization/$organizationSlug/suspended',
      params: { organizationSlug },
    });
  }
}

/**
 * The mirror of {@link requireActiveOrganization}, and the ONLY guard on
 * `suspended/`: send an organization that is not suspended back to its
 * dashboard.
 *
 * `suspended/` sits outside `requireOrgStatus` so a blocked organization can
 * render its blocked state without redirect-looping. That left the route with
 * no status guard in EITHER direction, so typing the URL told the owner of a
 * demonstrably active organization that it was suspended — the dashboard one
 * click away still showed it as Active. A screen that contradicts the rest of
 * the app is worse than a missing screen.
 *
 * The two guards partition the status space, so no organization can satisfy
 * both and the pair cannot loop: active goes to `dashboard` (where
 * `requireOrgStatus` passes it), anything else goes to `suspended` (where this
 * passes it). The unknown-status default matches its twin — `active` — so a
 * status that never resolved lands on the dashboard rather than on a blocked
 * screen it cannot justify.
 */
export function requireSuspendedOrganization(organizationSlug: string): void {
  const store = useOrganizationStore.getState();
  // Same fail-closed slug check as its twin: without a synced context the
  // status belongs to some other organization (FE-52).
  if (store.organizationSlug !== organizationSlug) {
    throw notFound();
  }
  const status = store.organizationStatus ?? 'active';
  if (status === 'active') {
    throw redirect(organizationDashboard(organizationSlug));
  }
}

/**
 * Effective deployment flags for the guards — env overrides win over the store's
 * (possibly still-default) flags, mirroring `useDeploymentFlags` and the
 * `me-context` parse. Lets the early (pre-network) deployment gate restrict an
 * env-configured personal-only / team-only deployment instead of passing on the
 * permissive `DEFAULT_DEPLOYMENT_FLAGS` before `me/context` hydrates the store.
 */
function effectiveDeploymentFlags() {
  return mergeDeploymentFlags(
    useOrganizationStore.getState().deploymentFlags,
    platformConfig.deploymentOverrides,
  );
}

/** Personal-only deployments have no team slug space — redirect to root dashboard. */
export function requireTeamOrganizationsDeployment(): void {
  if (!effectiveDeploymentFlags().teamOrganizations) {
    throw redirect({ to: '/dashboard' });
  }
}

/** Team-only deployments use slug URLs — root personal dashboard is not a product surface. */
export function requirePersonalOrganizationsDeployment(): void {
  if (!effectiveDeploymentFlags().personalOrganizations) {
    throw redirect({ to: '/' });
  }
}

/**
 * Block `/onboarding` unless the user just signed up via unified auth (`/login`), or when
 * the session already has a provisioned workspace — symmetric to workspace guards.
 */
export async function requireOnboardingWorkspace(): Promise<void> {
  const ctx = await ensureSessionContext();
  // Bind the persisted wizard to the signed-in user BEFORE the page renders. A
  // store left behind by a DIFFERENT user on this browser is wiped here, so its
  // data can never reach the DOM — doing it from an effect painted the previous
  // user's name and workspace for a frame first (ONB-4). `claimForUser` is a
  // no-op once the store already belongs to this user.
  useOnboardingStore.getState().claimForUser(ctx.user.id);
  const target = resolveRootTarget(ctx);
  if (target.to !== '/onboarding') throwWorkspaceRedirect(target);
}

/**
 * Block `/dashboard` when `me/context` says the user still belongs on onboarding
 * or a team slug dashboard (same rule as `/` resolver). `redirectFrom` (the
 * guarded location) rides along on the onboarding redirect so the wizard can
 * return the user to it.
 */
export async function requireProvisionedPersonalDashboard(options?: {
  redirectFrom?: string;
}): Promise<void> {
  const ctx = await ensureSessionContext();
  const redirectTarget = workspaceRedirectForPersonalDashboard(ctx);
  if (redirectTarget) throwWorkspaceRedirect(redirectTarget, options?.redirectFrom);
}

/**
 * Block team slug space when there is no provisioned workspace yet, or when the
 * active org is personal-only (dual-URL sends those users to `/dashboard`).
 * `redirectFrom` (the guarded location) rides along on the onboarding redirect
 * so the wizard can return the user to the deep link they asked for.
 */
export async function requireProvisionedTeamWorkspace(options?: {
  organizationPicker?: boolean;
  redirectFrom?: string;
}): Promise<void> {
  const ctx = await ensureSessionContext();
  const redirectTarget = workspaceRedirectForTeamEntry(ctx, options);
  if (redirectTarget) throwWorkspaceRedirect(redirectTarget, options?.redirectFrom);
}
