import type { MeContext, OrganizationStatusValue } from '@/shared/tenancy/me-context.ts';

/**
 * Props every dashboard arrangement variant receives — the session context plus
 * the derived flags/hero fields, computed once in `DashboardContent` so the
 * variants stay pure compositions.
 */
export interface DashboardViewProps {
  ctx: MeContext;
  /** Active organization is a TEAM org (roster/billing surfaces). */
  isTeam: boolean;
  /** Deployment hides multi-org/team chrome (`personal-only`). */
  personalOnly: boolean;
  /** Resolved `DashboardHero` fields (name + workspace fallbacks applied). */
  hero: {
    firstName: string;
    orgName: string;
    orgType: 'TEAM' | 'PERSONAL';
    orgStatus?: OrganizationStatusValue;
  };
}

/**
 * Whether the member roster may render — a TEAM surface gated on the active
 * org's type, not the deployment mode: in a hybrid install a personal
 * workspace is still `personalOnly === false` but has no roster to show.
 */
export function canReadRoster(ctx: MeContext, isTeam: boolean): boolean {
  return isTeam && ctx.myPermissions.includes('membership:read');
}
