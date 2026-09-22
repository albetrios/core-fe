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
  // API-key management is the always-available part of Integrations; webhooks are
  // gated separately inside the panel on `webhook:read`. Gating the whole section
  // on `webhook:read` hid the API-key management the user IS entitled to via
  // `api-key:read`, and hid it from everyone: core-be seeded that code into its
  // permission catalog and granted it to no role at all. core-be now grants it to
  // a TEAM organization's Owner (core-be#1180), so the panel's webhook section can
  // render — but this gate stays on `api-key:read`, because the two codes travel
  // separately and holding one is not holding the other.
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
