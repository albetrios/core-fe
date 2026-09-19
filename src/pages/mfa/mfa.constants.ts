import {
  AUTH_KEYS,
  AUTH_MFA_RECOVERY_MAX_LENGTH,
  AUTH_MFA_TOTP_LENGTH,
  AUTH_NS,
} from '@/shared/auth/auth-shell.constants.ts';

export { AUTH_KEYS, AUTH_MFA_RECOVERY_MAX_LENGTH, AUTH_MFA_TOTP_LENGTH, AUTH_NS };

export const MFA_TEST_IDS = {
  page: 'mfa-page',
  form: 'mfa-form',
  formError: 'form-error',
  code: 'mfa-code',
  /** Fallback shown when the MFA form itself throws (section boundary). */
  boundaryError: 'mfa-form-boundary-error',
  submit: 'mfa-submit',
  toggleRecovery: 'mfa-toggle-recovery',
} as const;

export const MFA_MANIFEST = {
  titleKey: AUTH_KEYS.manifest.mfa,
  testId: MFA_TEST_IDS.page,
} as const;
