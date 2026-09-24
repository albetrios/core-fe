export const AUTH_ROUTES = {
  LOGIN: '/login',
  MFA: '/mfa',
  UNAUTHORIZED: '/unauthorized',
} as const;

/** Base path for API; prepended to all API requests. In dev, Vite proxies /api to backend. */
export const API_BASE_PATH = '/api/v1';

/**
 * Backend endpoint paths, relative to `API_BASE_PATH`. Kept in lock step with
 * core-be's committed route catalog (`../core-be/docs/routes.txt`) — verified
 * by `pnpm contracts:drift` (tooling/ci/check-api-contract-drift.mjs).
 */
export const API_ENDPOINTS = {
  AUTH: {
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    LOGIN: '/auth/login',
    /** Current user profile lives in the users domain, not auth. */
    ME: '/users/me',
    /** Stamp onboarding as finished (idempotent) so post-login routing lands on the dashboard. */
    ONBOARDING_COMPLETE: '/users/me/onboarding/complete',
    /** Complete the login second factor: POST { mfa_session_token, code } → token. */
    MFA_LOGIN: '/auth/mfa/login',
    /** Redirect user here to start Google OAuth; backend redirects to Google then callback. */
    GOOGLE: '/auth/oauth/google',
    /** GET → which social providers are configured (e.g. ["google","github"]). */
    OAUTH_PROVIDERS: '/auth/oauth/providers',
    /** Passwordless sign-in: POST { email } → uniform 200 (auto-signup on unknown email). */
    EMAIL_CODE_SEND: '/auth/email/send-code',
    /** Passwordless sign-in: POST { email, code } → session (or MFA challenge). */
    EMAIL_CODE_LOGIN: '/auth/email/login',
  },
} as const;

export const HTTP = {
  TIMEOUT: 30_000,
  REFRESH_TIMEOUT: 5_000,
  MAX_RETRIES: 3,
  /** Max `Retry-After` (ms) the client will transparently wait: once on a 429 before
   * surfacing it to the user (RateLimitNotice), or as the floor of a 5xx backoff.
   * Longer waits are not auto-retried. */
  MAX_RETRY_AFTER_MS: 5_000,
  STALE_TIME: 1000 * 60 * 5, // 5 minutes
} as const;

/** Session-lifetime limits (absolute cap + watchdog cadence). */
export const SESSION = {
  /**
   * Absolute session lifetime, independent of activity. A session kept warm by
   * the proactive refresh would otherwise never expire client-side; after this
   * the user is forced to re-authenticate. UX/defense-in-depth — the backend's
   * refresh-session age remains the source of truth.
   */
  MAX_AGE_MS: 12 * 60 * 60 * 1000, // 12 hours
  /** How often the watchdog re-checks the absolute cap. */
  LIFETIME_CHECK_INTERVAL_MS: 60_000,
} as const;

// No HEADER entry: the backend scopes organization context from the signed `org`
// claim in the access token (re-minted by /auth/switch-to-organization) — there is
// no X-Organization-ID header and no org id in API paths.
export const ORGANIZATION = {
  LOCALHOST_FALLBACK: 'default',
} as const;
