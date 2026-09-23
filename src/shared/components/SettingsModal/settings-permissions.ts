import type { AccessContext, OrganizationPermission } from '@/core/rbac/policies.ts';
import { hasPermission } from '@/core/rbac/policies.ts';

import { isSettingsModuleEnabled } from './settings-modules.ts';
import type {
  OrganizationSettingsSection,
  SettingsSectionRef,
} from './settings-sections.ts';

/**
 * Permission gating for settings sections. Route guards never see hash state,
 * so the modal enforces RBAC itself — reusing `core/rbac` policies, never
 * forking them. Account sections need only a signed-in user.
 */
const ORGANIZATION_SECTION_PERMISSION: Record<
  OrganizationSettingsSection,
  OrganizationPermission
> = {
  general: 'organization:read',
  members: 'membership:read',
  roles: 'role:read',
  // API keys are the always-available part of Integrations; webhooks gate themselves
  // separately inside the panel on `webhook:read`, and each write is gated on the code
  // core-be actually enforces for it (`api-key:manage` / `webhook:manage`). This section
  // gate stays on `api-key:read` because the codes travel separately — holding one is not
  // holding the other. (The section is TEAM-only: `sectionsForOrgType` returns nothing for
  // a personal workspace, and the resolver refuses organization scope there.)
  integrations: 'api-key:read',
};

export function canViewSettingsSection(
  ref: SettingsSectionRef,
  ctx: AccessContext,
): boolean {
  if (!isSettingsModuleEnabled(ref)) return false;

  if (ref.scope === 'account') {
    if (ref.section === 'billing') {
      return hasPermission(ctx, 'organization:read');
    }
    return true;
  }
  return hasPermission(
    ctx,
    ORGANIZATION_SECTION_PERMISSION[ref.section as OrganizationSettingsSection],
  );
}
