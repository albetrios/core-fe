import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';

import { uploadFile } from './uploads-api.ts';

const ORG_API = `${API_BASE_PATH}/tenancy/organization`;

/**
 * Replace the active organization's logo.
 *
 * @remarks
 * Two steps, because core-be separates storage from attachment: the bytes go through the
 * uploads flow (presign → storage → confirm), then `PUT /tenancy/organization/logo` binds the
 * resulting key to the organization. The key must be the **final** one confirm promoted, not
 * the `pending/` path the presigned URL points at, and the route re-checks that it lives under
 * `organization-logos/<this org>/` before accepting it.
 *
 * This replaces a `PATCH /tenancy/organization` carrying a `logoUrl` data URL, which the
 * client dropped on the floor: the request went out with an empty body, the mutation reported
 * success, and the logo never changed.
 *
 * Lives here rather than in `organization-api.ts` because that module is reachable from the
 * entry chunk (`shared/tenancy/organization-membership.ts` resolves the active organization on
 * boot). Importing the uploads client from there dragged its ~0.7 kB onto the first-paint
 * graph and tipped the size budget; only the lazy settings tree needs it.
 *
 * @param input - The chosen file and the organization it belongs to.
 *
 * @example
 * await uploadOrganizationLogo({ file, organizationId: 'org_acme' });
 */
export async function uploadOrganizationLogo(input: {
  file: File;
  organizationId: string;
}): Promise<void> {
  const { key } = await uploadFile({
    file: input.file,
    purpose: 'organization-logo',
    organizationId: input.organizationId,
  });
  await apiClient.put<unknown>(`${ORG_API}/logo`, { key });
}

/** Clear the active organization's logo (204, no body). */
export async function removeOrganizationLogo(): Promise<void> {
  await apiClient.delete<unknown>(`${ORG_API}/logo`);
}
