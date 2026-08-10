import { SESSION } from '@/core/config/constants.ts';
import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * Absolute session-lifetime cap. The idle timeout logs out *inactive* users;
 * this logs out a session that has simply lived too long — one kept warm by
 * the proactive token refresh would otherwise never expire client-side.
 *
 * The start time is the moment of **interactive** authentication (login,
 * register, MFA, email verify, invite accept) — NOT a boot silent-refresh, so
 * a returning session keeps counting from its original sign-in. It is stored
 * in `localStorage` (a timestamp, never a token) so the clock survives a reload
 * and a trivial "refresh to reset" bypass. The backend's refresh-session age is
 * the real cap; this is UX/defense-in-depth.
 */

// Derived from `PRODUCT_NAMESPACE`, not hardcoded — a renamed product would
// otherwise leak the previous brand into localStorage. For this repo the
// namespace IS `core`, so the key string is unchanged and no live session is
// reset; a renamed product has no prior users to migrate.
const SESSION_STARTED_AT_KEY = `${PRODUCT_NAMESPACE}:session-started-at`;

/** Stamp the start of a freshly authenticated session (interactive auth only). */
export function markSessionStart(): void {
  try {
    localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
  } catch {
    /* storage unavailable (private mode) — the cap simply won't apply */
  }
}

/** Forget the session start (on logout). */
export function clearSessionStart(): void {
  try {
    localStorage.removeItem(SESSION_STARTED_AT_KEY);
  } catch {
    /* ignore */
  }
}

/** Age of the current session in ms, or `null` when no start is recorded. */
export function getSessionAge(): number | null {
  try {
    const raw = localStorage.getItem(SESSION_STARTED_AT_KEY);
    if (!raw) return null;
    const startedAt = Number.parseInt(raw, 10);
    if (!Number.isFinite(startedAt)) return null;
    return Date.now() - startedAt;
  } catch {
    return null;
  }
}

/** Has the session exceeded the absolute cap? */
export function isSessionExpired(maxAgeMs: number = SESSION.MAX_AGE_MS): boolean {
  const age = getSessionAge();
  return age !== null && age >= maxAgeMs;
}

/**
 * Start a watchdog that fires `onExpire` once the absolute cap is reached
 * (checked immediately, then on an interval). Returns a cleanup function.
 */
export function startSessionLifetimeWatch(
  onExpire: () => void,
  maxAgeMs: number = SESSION.MAX_AGE_MS,
  intervalMs: number = SESSION.LIFETIME_CHECK_INTERVAL_MS,
): () => void {
  if (isSessionExpired(maxAgeMs)) {
    onExpire();
    return () => {};
  }
  const timer = setInterval(() => {
    if (isSessionExpired(maxAgeMs)) {
      clearInterval(timer);
      onExpire();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
