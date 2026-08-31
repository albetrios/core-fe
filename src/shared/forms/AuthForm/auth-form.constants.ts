import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';

export { AUTH_KEYS, AUTH_NS };

/** Unified auth entry — single screen for sign-in and sign-up. */
export const AUTH_FORM_TEST_IDS = {
  form: 'auth-form',
  continueGoogle: 'auth-continue-google',
  continueGithub: 'auth-continue-github',
  continueApple: 'auth-continue-apple',
  continuePasskey: 'auth-continue-passkey',
  methodDivider: 'auth-method-divider',
  socialMethods: 'auth-social-methods',
  methodErrorBanner: 'auth-method-error-banner',
  emailPanel: 'auth-email-panel',
  email: 'auth-email',
  emailError: 'auth-email-error',
  password: 'auth-password',
  passwordToggle: 'auth-password-toggle',
  passwordError: 'auth-password-error',
  emailSubmit: 'auth-email-submit',
  emailErrorBanner: 'auth-email-error-banner',
  emailVerifyPanel: 'auth-email-verify-panel',
  emailCode: 'auth-email-code',
  emailVerify: 'auth-email-verify',
  emailResend: 'auth-email-resend',
  emailChange: 'auth-email-change',
  autoGooglePending: 'auth-auto-google-pending',
  captchaPreparing: 'auth-captcha-preparing',
  captchaStalled: 'auth-captcha-stalled',
  captchaRetry: 'auth-captcha-retry',
  skipAutoGoogle: 'auth-skip-auto-google',
  /** Fallback selector for providers without a dedicated `continue*` id. */
  continueProvider: (provider: string) => `auth-continue-${provider}`,
} as const;

export const AUTH_FORM_COOLDOWN_BASE_MS = 1_000;
export const AUTH_FORM_COOLDOWN_MAX_MS = 30_000;

/** Minimum wait before another email verification code can be sent from the verify step. */
export const AUTH_EMAIL_VERIFICATION_CODE_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

/** Preferred OAuth button order on `/login` (unknown providers append after). */
export const AUTH_OAUTH_PROVIDER_ORDER = ['google', 'github', 'apple'] as const;

export function sortOAuthProviders(providers: string[]): string[] {
  const rank = new Map<string, number>(
    AUTH_OAUTH_PROVIDER_ORDER.map((id, index) => [id, index]),
  );
  return [...providers].sort((a, b) => {
    const ar = rank.get(a) ?? AUTH_OAUTH_PROVIDER_ORDER.length;
    const br = rank.get(b) ?? AUTH_OAUTH_PROVIDER_ORDER.length;
    return ar - br || a.localeCompare(b);
  });
}
