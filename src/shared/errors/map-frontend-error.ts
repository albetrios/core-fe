import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { isLikelyI18nKey } from '@/lib/i18n/translate-form-message.ts';
import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';

import { AppError } from './AppError.ts';
import { FRONTEND_ERROR_CODES } from './frontend-error-codes.ts';
import { isHttpError } from './HttpError.ts';

function tErrors(key: string): string {
  return i18n.t(key, { ns: ERRORS_NS });
}

function tAuth(key: string): string {
  return i18n.t(key, { ns: AUTH_NS });
}

const BE_ERROR_DETAIL_TO_AUTH_KEY: Record<string, string> = {
  'errors:invalidOrExpiredVerificationCode':
    AUTH_KEYS.login.errors.invalidVerificationCode,
};

const CODE_TO_AUTH_KEY: Record<string, string> = {
  [FRONTEND_ERROR_CODES.AUTH_INVALID_CREDENTIALS]:
    AUTH_KEYS.login.errors.invalidCredentials,
  invalid_credentials: AUTH_KEYS.login.errors.invalidCredentials,
  [FRONTEND_ERROR_CODES.AUTH_MFA_UNSUPPORTED]: AUTH_KEYS.apiErrors.mfaUnsupported,
  [FRONTEND_ERROR_CODES.AUTH_OAUTH_NO_REDIRECT]: AUTH_KEYS.apiErrors.oauthNoRedirect,
  [FRONTEND_ERROR_CODES.AUTH_PASSKEY_CANCELLED]: AUTH_KEYS.apiErrors.passkeyCancelled,
  [FRONTEND_ERROR_CODES.AUTH_PASSKEY_UNAVAILABLE]: AUTH_KEYS.auth.errors.passkeyBackend,
  [FRONTEND_ERROR_CODES.INVITE_INVALID_OR_EXPIRED]:
    AUTH_KEYS.acceptInvite.errors.invalidOrExpired,
  [FRONTEND_ERROR_CODES.MEMBER_ROLE_REQUIRED]:
    ERRORS_KEYS.frontend.organization.roleRequired,
};

function translateKey(key: string): string {
  if (key.startsWith('frontend.')) {
    return tErrors(key);
  }
  return tAuth(key);
}

function resolveByCode(code: string): string | undefined {
  const authKey = CODE_TO_AUTH_KEY[code];
  return authKey ? translateKey(authKey) : undefined;
}

function resolveOAuthNoRedirect(message: string): string | undefined {
  const match = /^Could not start (.+) sign-in \(no redirect URL\)\.$/.exec(message);
  if (!match?.[1]) return undefined;
  return i18n.t(AUTH_KEYS.apiErrors.oauthNoRedirect, {
    ns: AUTH_NS,
    provider: match[1],
  });
}

function resolveI18nKeyMessage(message: string): string | undefined {
  if (!isLikelyI18nKey(message)) return undefined;
  if (i18n.exists(message, { ns: AUTH_NS })) {
    return tAuth(message);
  }
  if (i18n.exists(message, { ns: ERRORS_NS })) {
    return tErrors(message);
  }
  return undefined;
}

function resolveBeErrorDetail(message: string): string | undefined {
  const authKey = BE_ERROR_DETAIL_TO_AUTH_KEY[message];
  return authKey ? translateKey(authKey) : undefined;
}

function resolveErrorMessage(message: string): string | undefined {
  return (
    resolveBeErrorDetail(message) ??
    resolveOAuthNoRedirect(message) ??
    resolveI18nKeyMessage(message)
  );
}

function resolveHttpReason(error: unknown): string | undefined {
  if (!isHttpError(error)) return undefined;
  const body = error.data as
    { error?: { reason?: string; detail?: string } } | null | undefined;
  const reason = body?.error?.reason;
  if (typeof reason === 'string') {
    const fromReason = resolveByCode(reason);
    if (fromReason) return fromReason;
  }
  const detail = body?.error?.detail;
  return typeof detail === 'string' ? resolveBeErrorDetail(detail) : undefined;
}

/**
 * Map a known frontend / auth error code or recognized error message to a localized
 * string. Returns `undefined` when the error should fall through to HTTP handling.
 */
export function resolveKnownFrontendError(error: unknown): string | undefined {
  if (error instanceof AppError) {
    const fromCode = resolveByCode(error.code);
    if (fromCode) return fromCode;
    if (error.message) {
      return resolveErrorMessage(error.message);
    }
  }

  if (isHttpError(error)) {
    const fromReason = resolveHttpReason(error);
    if (fromReason) return fromReason;
    return undefined;
  }

  if (error instanceof Error) {
    return resolveErrorMessage(error.message);
  }

  return undefined;
}

/** User-facing message for inline forms and toasts — prefers locale over raw English. */
export function mapFrontendError(
  error: unknown,
  fallbackKey = ERRORS_KEYS.api.fallback,
): string {
  const known = resolveKnownFrontendError(error);
  if (known) return known;

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return tErrors(fallbackKey);
}
