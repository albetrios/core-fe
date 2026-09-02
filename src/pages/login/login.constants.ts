import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';

export { AUTH_KEYS, AUTH_NS };

export const LOGIN_TEST_IDS = {
  page: 'login-page',
  /** Fallback shown when the auth form itself throws (section boundary). */
  formError: 'login-form-error',
} as const;

export const LOGIN_MANIFEST = {
  titleKey: AUTH_KEYS.manifest.login,
  testId: LOGIN_TEST_IDS.page,
} as const;
