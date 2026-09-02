import { AppError } from '@/shared/errors/AppError.ts';
import { FRONTEND_ERROR_CODES } from '@/shared/errors/frontend-error-codes.ts';

/**
 * Whether first-factor passkey sign-in can actually complete.
 *
 * **The backend is not the blocker.** core-be exposes the ceremony as
 * `POST /api/v1/auth/webauthn/authenticate/options` and
 * `.../authenticate/verify` (auth.routes.ts) — documented there as the public
 * passwordless login pair. The FE simply never implemented the client half:
 * `passkeys-api.ts` only wires `/auth/me/webauthn/*`, which is credential
 * *management* for an already-signed-in user (Settings → Security).
 *
 * So this is a missing feature, not a missing service. Until the ceremony is
 * written, one exported predicate lets `/login` hide the method rather than
 * offer a button that prompts for a fingerprint and then fails (LOGIN-7).
 * Flip this to a real capability check when the client lands.
 */
export function isPasskeySignInAvailable(): boolean {
  return false;
}

function assertPasskeySupported(): void {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    /*
     * Args are (message, statusCode, code). These were previously passed in the
     * wrong order, so the thrown `code` was the human sentence and never matched
     * CODE_TO_AUTH_KEY — an unsupported browser fell through to the generic
     * message instead of its own.
     *
     * The message is the CODE, not an English sentence, matching the four other
     * AppError sites. `resolveKnownFrontendError` resolves by `code` first and
     * this code IS mapped, so the message was already shadowed for display — an
     * English string here could only ever drift from the locale copy it can
     * never replace. `statusCode` is what separates this from the not-yet-wired
     * case below, and it is what the tests assert on.
     */
    throw new AppError(
      FRONTEND_ERROR_CODES.AUTH_PASSKEY_UNAVAILABLE,
      400,
      FRONTEND_ERROR_CODES.AUTH_PASSKEY_UNAVAILABLE,
    );
  }
}

/**
 * First-factor passkey sign-in on `/login`.
 *
 * Live: requires core-be `/auth/webauthn/login/*` (not yet wired from the FE).
 */
export async function signInWithPasskey(): Promise<void> {
  assertPasskeySupported();

  // Checked BEFORE `navigator.credentials.get()`. Prompting first and throwing
  // afterwards meant the user completed a fingerprint / Face ID challenge and
  // was then told the passkey was "cancelled" — the product's own gap reported
  // as the user's action (LOGIN-7). If it cannot complete, never prompt.
  if (!isPasskeySignInAvailable()) {
    // 501, not 400: the same code as an unsupported browser, but the gap is
    // ours rather than the user's — the status is what tells them apart.
    throw new AppError(
      FRONTEND_ERROR_CODES.AUTH_PASSKEY_UNAVAILABLE,
      501,
      FRONTEND_ERROR_CODES.AUTH_PASSKEY_UNAVAILABLE,
    );
  }

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      timeout: 120_000,
      userVerification: 'preferred',
      rpId: window.location.hostname || 'localhost',
    },
  });

  // Only reachable once the flow is live: a null credential here really is the
  // user dismissing the OS prompt, so this is the one honest "cancelled".
  if (!credential) {
    throw new AppError(
      FRONTEND_ERROR_CODES.AUTH_PASSKEY_CANCELLED,
      400,
      FRONTEND_ERROR_CODES.AUTH_PASSKEY_CANCELLED,
    );
  }
}
