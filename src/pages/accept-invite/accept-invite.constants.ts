import {
  ACCEPT_INVITE_REDIRECT_MS,
  AUTH_KEYS,
  AUTH_NS,
} from '@/shared/auth/auth-shell.constants.ts';

export { ACCEPT_INVITE_REDIRECT_MS, AUTH_KEYS, AUTH_NS };

export const ACCEPT_INVITE_TEST_IDS = {
  page: 'accept-invite-page',
  loading: 'accept-invite-loading',
  success: 'accept-invite-success',
  error: 'accept-invite-error',
  login: 'accept-invite-login',
  retry: 'accept-invite-retry',
  cardError: 'accept-invite-card-error',
} as const;

export const ACCEPT_INVITE_MANIFEST = {
  titleKey: AUTH_KEYS.manifest.acceptInvite,
  testId: ACCEPT_INVITE_TEST_IDS.page,
} as const;
