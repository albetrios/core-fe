import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import type { Passkey } from '@/shared/api/passkey-contracts.ts';
import {
  listPasskeys,
  registerPasskey,
  removePasskey,
} from '@/shared/api/passkeys-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

/** TanStack Query key for the account's passkeys. */
export const passkeysQueryKey = ['account', 'passkeys'] as const;

/** Registered passkeys for the account (FE-32). */
export function usePasskeys() {
  return useAppQuery({
    queryKey: passkeysQueryKey,
    queryFn: listPasskeys,
    // The security panel renders a RetryError for exactly this query.
    notifyOnError: false,
  });
}

/** Register a new passkey, then refresh the list. */
export function useRegisterPasskey() {
  return useAppMutation({
    mutationFn: (name: string) => registerPasskey(name),
    invalidateKeys: [passkeysQueryKey],
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.passkeys.addSuccess, {
      ns: ERRORS_NS,
    }),
  });
}

/** Revoke a passkey, then refresh the list. */
export function useRemovePasskey() {
  return useAppMutation({
    mutationFn: (id: string) => removePasskey(id),
    invalidateKeys: [passkeysQueryKey],
    optimistic: {
      queryKey: passkeysQueryKey,
      update: (previous: Passkey[] | undefined, id) =>
        previous?.filter((passkey) => passkey.id !== id),
    },
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.passkeys.removeSuccess, {
      ns: ERRORS_NS,
    }),
  });
}
