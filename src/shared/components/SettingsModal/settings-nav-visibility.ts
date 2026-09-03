import type { AccessContext } from '@/core/rbac/policies.ts';
import type { OrganizationType } from '@/shared/tenancy/me-context.ts';

import { canViewSettingsSection } from './settings-permissions.ts';
import type {
  OrganizationSettingsSection,
  SettingsNavGroup,
  SettingsSectionRef,
} from './settings-sections.ts';
import {
  DEFAULT_SETTINGS,
  sectionsForOrgType,
  SETTINGS_NAV,
} from './settings-sections.ts';

export interface SettingsNavVisibilityContext {
  hasOrganizationContext: boolean;
  orgType: OrganizationType | undefined;
  teamOrganizations: boolean;
  role: AccessContext['role'];
  permissions: AccessContext['permissions'];
}

/** Nav groups the signed-in user can see right now (permissions + org type + deployment). */
export function visibleSettingsNavGroups(
  ctx: SettingsNavVisibilityContext,
): readonly SettingsNavGroup[] {
  const access = { role: ctx.role, permissions: ctx.permissions };

  // An unknown org type allows every section on purpose — for the command
  // palette, where a missing row is worse than an extra one. The settings modal
  // must NOT call this in that state: it renders `SettingsNavSkeleton` until
  // `me/context` resolves, because a rail that deletes half of itself a beat
  // after it paints is worse than a rail that arrives a beat late (SET-15).
  const allowedForOrgType = (section: OrganizationSettingsSection) =>
    !ctx.orgType || sectionsForOrgType(ctx.orgType).includes(section);

  return SETTINGS_NAV.map((group) => {
    if (group.scope === 'organization') {
      if (!ctx.teamOrganizations) {
        return { ...group, items: [] };
      }
      return {
        ...group,
        items: group.items.filter(
          (item) =>
            ctx.hasOrganizationContext &&
            canViewSettingsSection(item, access) &&
            allowedForOrgType(item.section as OrganizationSettingsSection),
        ),
      };
    }
    return {
      ...group,
      items: group.items.filter((item) => canViewSettingsSection(item, access)),
    };
  }).filter((group) => group.items.length > 0);
}

/** First openable section in the nav — used when a deep link cannot be honored. */
export function firstVisibleSettingsSection(
  groups: readonly SettingsNavGroup[],
): SettingsSectionRef {
  for (const group of groups) {
    const item = group.items[0];
    if (item) return { scope: item.scope, section: item.section };
  }
  return DEFAULT_SETTINGS;
}
