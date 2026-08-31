/**
 * Reasons `/login` may be entered with something to explain.
 *
 * Lives in `shared` because both sides need it and they sit on opposite ends of
 * the dependency rule: the `/login` route (pages) validates the param, and
 * `AuthForm` (shared) renders it. A CODE, never a message — the failure it
 * describes originates at an OAuth provider redirect, so putting its text in the
 * URL would render attacker-influenced prose in our own error banner and could
 * not be translated. Each code maps to a local, translated string.
 */
export const LOGIN_ERROR_CODES = ['oauth_failed'] as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

/** Narrow an unknown search value to a known code, or drop it. */
export function toLoginErrorCode(value: unknown): LoginErrorCode | undefined {
  return typeof value === 'string' &&
    (LOGIN_ERROR_CODES as readonly string[]).includes(value)
    ? (value as LoginErrorCode)
    : undefined;
}
