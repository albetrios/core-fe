import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';

export { AUTH_NS };

export const CALLBACK_TEST_IDS = {
  page: 'callback-page',
} as const;

export const CALLBACK_MANIFEST = {
  titleKey: AUTH_KEYS.manifest.callback,
  testId: CALLBACK_TEST_IDS.page,
} as const;
