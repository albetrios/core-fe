/** Header the core-be Turnstile pre-handler reads (`CR-6`). */
export const CAPTCHA_TOKEN_HEADER = 'X-Captcha-Token';

/** Placeholder token from the dev captcha checkbox widget when Turnstile is disabled. */
export const DEV_CAPTCHA_TOKEN = 'dev-captcha-token';

/**
 * How long a captcha-gated action may sit blocked before the UI calls it stalled.
 *
 * A mint normally lands in a few hundred ms, so this is long enough never to flash
 * during the routine re-mint after a token is consumed, and short enough that a
 * widget which never calls back does not strand the user silently.
 */
export const CAPTCHA_REMINT_STALL_MS = 6_000;

/**
 * Dummy token accepted by Cloudflare siteverify when paired with the always-pass test secret.
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** Default bypass header name — must match core-be `CAPTCHA_BYPASS_HEADER` in local/test. */
export const DEFAULT_CAPTCHA_BYPASS_HEADER = 'X-Captcha-Bypass';
