import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as orgApi from '@/shared/api/organization-api.ts';
import type { ApiKey } from '@/shared/api/organization-contracts.ts';
import {
  type OrgListKeyParams,
  orgQueryKeys,
} from '@/shared/api/organization-query-keys.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import {
  type CursorListResult,
  useCursorList,
} from '@/shared/hooks/useCursorList/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** Server-side query params for the API-keys list (search + sort). */
export type ApiKeysListParams = OrgListKeyParams;

/**
 * API keys of the active organization — windowed list query + create/rename/revoke
 * mutations. Server state only — never mirrored into Zustand (file-structure.mdc).
 */
export function useApiKeys(params: ApiKeysListParams = {}): CursorListResult<ApiKey> {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useCursorList<ApiKey>({
    queryKey: orgQueryKeys.apiKeysList(orgId, params),
    queryFn: (after) => orgApi.listApiKeys({ ...params, after }),
    // The integrations panel renders an inline failure line for this query.
    notifyOnError: false,
    // No active org (mid org-switch, or before context resolves) → skip the
    // request instead of firing a `Forbidden` against an empty org scope.
    enabled: Boolean(orgId),
  });
}

/** Create an API key. The full secret is returned to the caller exactly once. */
export function useCreateApiKey() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: { name: string; scopes: string[]; expiresInDays: number | null }) =>
      orgApi.createApiKey(input),
    invalidateKeys: [orgQueryKeys.apiKeys(orgId)],
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.apiKeys.createSuccess, {
      ns: ERRORS_NS,
    }),
  });
}

/** Rename an API key — optimistically patches the renamed row. */
export function useRenameApiKey() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: { id: string; name: string }) => orgApi.renameApiKey(input),
    invalidateKeys: [orgQueryKeys.apiKeys(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.apiKeys(orgId),
      update: (rows: ApiKey[], input) =>
        rows.map((key) => (key.id === input.id ? { ...key, name: input.name } : key)),
    },
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.apiKeys.renameSuccess, {
      ns: ERRORS_NS,
    }),
  });
}

/** Revoke (delete) an API key — optimistically drops it from the list. */
export function useRevokeApiKey() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (keyId: string) => orgApi.revokeApiKey(keyId),
    invalidateKeys: [orgQueryKeys.apiKeys(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.apiKeys(orgId),
      update: (rows: ApiKey[], keyId) => rows.filter((key) => key.id !== keyId),
    },
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.apiKeys.revokeSuccess, {
      ns: ERRORS_NS,
    }),
  });
}
