import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as api from '@/shared/api/mfa-api.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

const mfaQueryKey = ['auth', 'mfa'] as const;

/** Whether MFA is enabled for the signed-in account. */
export function useMfaStatus() {
  return useAppQuery({
    queryKey: mfaQueryKey,
    queryFn: api.getMfaStatus,
    // The security panel renders a RetryError for exactly this query.
    notifyOnError: false,
  });
}

/**
 * Begin enrollment (returns the secret + otpauth URI).
 *
 * On `useAppMutation` for its synchronous single-flight guard, not for the
 * toasts: `disabled={begin.isPending}` only lands after React re-renders, so a
 * double-click on "Set up" minted TWO enrollment secrets. The server keeps the
 * last one, the dialog shows whichever resolved first, and the code the user
 * types then never verifies. `notifyOnError: false` because the caller raises
 * its own setup-failed toast.
 */
export function useBeginMfaEnrollment() {
  return useAppMutation({
    mutationFn: () => api.beginMfaEnrollment(),
    notifyOnError: false,
  });
}

/** Confirm enrollment with a TOTP code; refreshes status on success. */
export function useConfirmMfaEnrollment() {
  return useAppMutation({
    mutationFn: (code: string) => api.confirmMfaEnrollment(code),
    invalidateKeys: [mfaQueryKey],
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.mfa.enableSuccess, {
      ns: ERRORS_NS,
    }),
  });
}

/** Disable MFA; refreshes status on success. */
export function useDisableMfa() {
  return useAppMutation({
    mutationFn: () => api.disableMfa(),
    invalidateKeys: [mfaQueryKey],
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.mfa.disableSuccess, {
      ns: ERRORS_NS,
    }),
  });
}
