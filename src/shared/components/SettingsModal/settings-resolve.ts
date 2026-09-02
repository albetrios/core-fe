import type { AccessContext } from '@/core/rbac/policies.ts';
import type { OrganizationType } from '@/shared/tenancy/me-context.ts';

import { canViewSettingsSection } from './settings-permissions.ts';
import type {
  OrganizationSettingsSection,
  SettingsSectionRef,
} from './settings-sections.ts';
import { sectionsForOrgType } from './settings-sections.ts';

export interface SettingsResolveContext {
  hasOrganizationContext: boolean;
  orgType: OrganizationType | undefined;
  /** When false (personal-only deployment), organization settings never open. */
  teamOrganizations: boolean;
  role: AccessContext['role'];
  permissions: AccessContext['permissions'];
}

/** Whether the signed-in user may open this settings location right now. */
export function isSettingsSectionAvailable(
  ref: SettingsSectionRef,
  ctx: SettingsResolveContext,
): boolean {
  if (!canViewSettingsSection(ref, { role: ctx.role, permissions: ctx.permissions })) {
    return false;
  }

  if (ref.scope !== 'organization') return true;

  if (!ctx.teamOrganizations) return false;

  if (!ctx.hasOrganizationContext) return false;

  if (ctx.orgType === 'PERSONAL') return false;

  if (ctx.orgType === 'TEAM') {
    return sectionsForOrgType('TEAM').includes(
      ref.section as OrganizationSettingsSection,
    );
  }

  // Org type still loading — keep the hash until me/context resolves (team
  // deployments). The caller must not RENDER on this answer: SettingsModal
  // holds a skeleton until the context is in, so a deep link never opens the
  // members panel and then swaps it for a fallback section (SET-15).
  return true;
}

/**
 * Map a parsed settings hash to an openable section. Stale, mistyped, or
 * unavailable deep links fall back to `fallback` (typically the first visible
 * nav item).
 */
export function resolveSettingsSection(
  ref: SettingsSectionRef,
  ctx: SettingsResolveContext,
  fallback: SettingsSectionRef,
): SettingsSectionRef {
  return isSettingsSectionAvailable(ref, ctx) ? ref : fallback;
}
