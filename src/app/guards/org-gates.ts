import type { Gate } from '@/core/security/gate.types.ts';

import {
  requireActiveOrganization,
  requireOrganizationContext,
  requirePersonalOrganizationsDeployment,
  requireProvisionedPersonalDashboard,
  requireProvisionedTeamWorkspace,
  requireTeamOrganizationsDeployment,
} from './route-guards.ts';

/**
 * These gates read the route params (the org slug) plus, for the workspace
 * gates, the guarded location (`redirectFrom`) so an onboarding redirect can
 * carry the original deep link.
 */
type OrgRouteCtx = { params: Record<string, string>; redirectFrom?: string };

/**
 * App-layer security gates for the org-scoped route space — thin `Gate`
 * wrappers over the existing org guards so the route tree can compose its chain
 * via the common `gateway()` (research/11 §3.7). They live in `app/` (not
 * `core/security/gates/`) because they reach into `shared/tenancy`, which the
 * core kernel must not import. Behavior is identical to calling the underlying
 * guards directly.
 */

/**
 * **L2/L4 — active-org context.** Validate the `$organizationSlug` param,
 * confirm membership, and sync the derived store + permissions (wraps
 * {@link requireOrganizationContext}).
 */
export const resolveActiveOrg: Gate<OrgRouteCtx> = async (ctx) => {
  await requireOrganizationContext(ctx.params.organizationSlug ?? '');
};

/**
 * **L4b — org status.** Block suspended / lapsed organizations (wraps
 * {@link requireActiveOrganization}); runs on org children except `suspended/`.
 */
export const requireOrgStatus = ((ctx) => {
  requireActiveOrganization(ctx.params.organizationSlug ?? '');
}) satisfies Gate<OrgRouteCtx>;

/** Block team slug routes when this deployment is personal-only. */
export const requireTeamDeployment = ((_ctx) => {
  requireTeamOrganizationsDeployment();
}) satisfies Gate<OrgRouteCtx>;

/** Block root personal dashboard when this deployment is team-only. */
export const requirePersonalDeployment = ((_ctx) => {
  requirePersonalOrganizationsDeployment();
}) satisfies Gate<unknown>;

/** `/dashboard` — session must have a personal active org (else onboarding / team URL). */
export const requirePersonalDashboardWorkspace: Gate<{ redirectFrom?: string }> = async (
  ctx,
) => {
  await requireProvisionedPersonalDashboard({ redirectFrom: ctx?.redirectFrom });
};

/** Team slug space — no active org → onboarding or picker; personal active org → `/dashboard`. */
export const requireProvisionedWorkspace: Gate<OrgRouteCtx> = async (ctx) => {
  await requireProvisionedTeamWorkspace({
    organizationPicker: !ctx.params.organizationSlug,
    redirectFrom: ctx.redirectFrom,
  });
};
