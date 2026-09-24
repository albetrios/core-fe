import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import {
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from '@/shared/api/organization-logo-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';
import { myOrganizationsQueryKey } from '@/shared/tenancy/my-organization-summaries.ts';

/**
 * Both server queries a logo is rendered from — the organization list (switcher,
 * dashboard, General panel) and me/context — invalidated together so neither
 * keeps the old one.
 */
const LOGO_DEPENDENT_KEYS = [myOrganizationsQueryKey, meContextQueryKey];

/**
 * Upload a new organization logo through the real storage flow.
 *
 * @remarks
 * The logo used to ride on `PATCH /tenancy/organization` as a `logoUrl` data URL, which the
 * client then dropped — an empty request went out, a success toast fired, and nothing changed.
 * It now goes through `uploadOrganizationLogo`: presign, storage write, confirm, then attach.
 * A failure at any step leaves the previous logo in place, so there is nothing to roll back.
 */
export function useUploadOrganizationLogo() {
  const organizationId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (file: File) => {
      if (!organizationId) throw new Error('No active organization');
      return uploadOrganizationLogo({ file, organizationId });
    },
    invalidateKeys: LOGO_DEPENDENT_KEYS,
    successMessage: i18n.t(ERRORS_KEYS.frontend.organization.logoUpdated, {
      ns: ERRORS_NS,
    }),
  });
}

/** Clear the organization logo (`DELETE /tenancy/organization/logo`). */
export function useRemoveOrganizationLogo() {
  return useAppMutation({
    mutationFn: removeOrganizationLogo,
    invalidateKeys: LOGO_DEPENDENT_KEYS,
    successMessage: i18n.t(ERRORS_KEYS.frontend.organization.logoRemoved, {
      ns: ERRORS_NS,
    }),
  });
}
