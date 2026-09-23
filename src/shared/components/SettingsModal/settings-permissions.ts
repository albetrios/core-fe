import type { AccessContext, OrganizationPermission } from '@/core/rbac/policies.ts';
import { hasPermission } from '@/core/rbac/policies.ts';

import { isSettingsModuleEnabled } from './settings-modules.ts';
import type {
  AccountSettingsSection,
  OrganizationSettingsSection,
  SettingsSectionRef,
} from './settings-sections.ts';

/**
 * Permission gating for settings sections. Route guards never see hash state,
 * so the modal enforces RBAC itself — reusing `core/rbac` policies, never
 * forking them. Every organization section is gated; most account sections are
 * not, and the two that are say so in {@link ACCOUNT_SECTION_PERMISSION}.
 */
const ORGANIZATION_SECTION_PERMISSION: Record<
  OrganizationSettingsSection,
  OrganizationPermission
> = {
  general: 'organization:read',
  members: 'membership:read',
  roles: 'role:read',
};

/**
 * Account sections that still need a permission. Anything absent here needs only a
 * signed-in user.
 *
 * @remarks
 * Both entries are account sections that read organization-scoped data, which is why
 * they carry an organization permission despite the scope. `integrations` is gated on
 * `api-key:read` rather than a webhook code because API keys are its always-available
 * half — webhooks gate themselves separately inside the panel on `webhook:read`, and
 * each write is gated on the code core-be enforces for it (`api-key:manage` /
 * `webhook:manage`). The codes travel separately: holding one is not holding the other.
 */
const ACCOUNT_SECTION_PERMISSION: Partial<
  Record<AccountSettingsSection, OrganizationPermission>
> = {
  billing: 'organization:read',
  integrations: 'api-key:read',
};

export function canViewSettingsSection(
  ref: SettingsSectionRef,
  ctx: AccessContext,
): boolean {
  if (!isSettingsModuleEnabled(ref)) return false;

  if (ref.scope === 'account') {
    const required = ACCOUNT_SECTION_PERMISSION[ref.section as AccountSettingsSection];
    return required === undefined || hasPermission(ctx, required);
  }
  return hasPermission(
    ctx,
    ORGANIZATION_SECTION_PERMISSION[ref.section as OrganizationSettingsSection],
  );
}
