/** Header the core-be Turnstile pre-handler reads (`CR-6`). */
export const CAPTCHA_TOKEN_HEADER = 'X-Captcha-Token';

/** Placeholder token from the dev captcha checkbox widget when Turnstile is disabled. */
export const DEV_CAPTCHA_TOKEN = 'dev-captcha-token';

/**
 * How long a click may wait for an escalated challenge to be completed.
 *
 * Budgeted for a HUMAN, not for the network: once Cloudflare decides this visitor
 * must tick a checkbox, the wait is however long it takes them to notice it, read
 * it and click. A short budget here would abandon the action while the user is
 * still working on the very challenge it asked for — which is what the previous
 * 6s timer did, and why a healthy widget reported itself as failed.
 */
export const CAPTCHA_CHALLENGE_WAIT_MS = 120_000;

/**
 * Dummy token accepted by Cloudflare siteverify when paired with the always-pass test secret.
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** Default bypass header name — must match core-be `CAPTCHA_BYPASS_HEADER` in local/test. */
export const DEFAULT_CAPTCHA_BYPASS_HEADER = 'X-Captcha-Bypass';
