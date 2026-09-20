import type { APIResponse } from '@playwright/test';

/**
 * What this helper needs from a response. Playwright's `APIResponse` satisfies
 * it; so does a plain object, which is how the unit test drives it without
 * loading Playwright's runner inside Vitest.
 */
type JsonResponse = Pick<APIResponse, 'json'>;

/**
 * The code core-be echoes on `send-code` when it runs in its local/TEST mode
 * (`debug_verification_code` — the same field the sign-in form prefills from), or
 * `null` on a backend that does not echo.
 *
 * Prefer it to `mail_outbox`: the echo is the code that was just issued, in the
 * response already in hand, so there is no second system to poll and no window in
 * which the outbox row is "not there yet". The outbox stays as the fallback.
 *
 * Dependency-free on purpose (a type-only import): every spec's sign-in goes
 * through this, so it has a unit test — `tests/ci/e2e-echoed-code.policy.test.ts`.
 */
export async function echoedVerificationCode(
  response: JsonResponse,
): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as {
    data?: { debug_verification_code?: unknown };
  } | null;
  const code = body?.data?.debug_verification_code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}
