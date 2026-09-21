import { useMemo } from 'react';

import { ORGANIZATION } from '@/core/config/constants.ts';
import { visibleSettingsNavGroups } from '@/shared/components/SettingsModal/settings-nav-visibility.ts';
import type {
  SettingsNavItem,
  SettingsSectionRef,
} from '@/shared/components/SettingsModal/settings-sections.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/**
 * The settings destinations this user can open right now — permissions, org
 * type and deployment flags already applied, flattened out of their groups.
 *
 * @remarks
 * Anything that OFFERS a settings destination has to agree with what the
 * Settings nav will actually show, or it promises a screen the user cannot
 * reach: the dashboard's "Invite members" suggestion pointed at a section that
 * does not exist on a personal workspace, and opened an empty palette. One
 * derivation, so an offer and its destination cannot drift apart.
 *
 * Note this is deliberately permissive while `me/context` is still resolving —
 * `visibleSettingsNavGroups` keeps every section when the org type is unknown,
 * because for a SUGGESTION a missing row is worse than an extra one. A surface
 * that must not flip its own answer (the Settings modal) stages this itself
 * behind `useAccessResolved`.
 */
export function useVisibleSettingsSections(): readonly SettingsNavItem[] {
  const { data: meContext } = useMeContext();
  const deploymentFlags = useDeploymentFlags();
  const organizationId = useOrganizationStore((s) => s.organizationId);
  const permissions = useOrganizationStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);
  const orgType = meContext?.activeOrganization?.type;
  const role = user?.role ?? 'user';
  const teamOrganizations = deploymentFlags.teamOrganizations;
  return useMemo(
    () =>
      visibleSettingsNavGroups({
        hasOrganizationContext:
          !!organizationId && organizationId !== ORGANIZATION.LOCALHOST_FALLBACK,
        orgType,
        teamOrganizations,
        role,
        permissions,
      }).flatMap((group) => group.items),
    [organizationId, orgType, permissions, role, teamOrganizations],
  );
}

/** Whether `sections` contains a given destination (see {@link useVisibleSettingsSections}). */
export function includesSettingsSection(
  sections: readonly SettingsNavItem[],
  ref: SettingsSectionRef,
): boolean {
  return sections.some(
    (item) => item.scope === ref.scope && item.section === ref.section,
  );
}
