import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * Same-origin path guard for post-auth redirects (the `?redirect=` / `returnTo`
 * target). Shared by every auth flow (login, MFA, …) — pages can't import from
 * each other, so this lives in `shared/auth`. The security suite
 * (tests/security/redirect-safety.security.test.ts) imports it directly.
 *
 * Rejects absolute URLs, protocol-relative paths (`//`), scheme smuggling
 * (`://`), backslashes (browsers normalize `/\` to `//`), and embedded control
 * characters / whitespace (browsers strip these, so `/<TAB>/evil.com` can
 * collapse into a protocol-relative open redirect).
 */

/** True if any char is a C0 control / space (≤ 0x20) or DEL (0x7F). */
function hasControlOrWhitespace(path: string): boolean {
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isSafeRedirectPath(path: string): boolean {
  if (hasControlOrWhitespace(path)) return false;
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('://') &&
    !path.includes('\\')
  );
}

/** Narrow an unknown value to a safe same-origin redirect path, else `undefined`. */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === 'string' && isSafeRedirectPath(value) ? value : undefined;
}

/**
 * Validate an absolute external URL before a full-page navigation to it — e.g.
 * the OAuth provider authorize URL returned by the backend. Requires a parseable
 * `https:` URL with a host, blocking `javascript:` / `data:` schemes, relative
 * and protocol-relative smuggling. Defense-in-depth: the backend is the OAuth
 * broker, but the client should never `assign()` an unvalidated URL.
 */
export function isSafeExternalHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const RETURN_TO_KEY = `${PRODUCT_NAMESPACE}-auth:return-to`;

/**
 * Persist a `returnTo` across an OAuth provider round-trip (full-page redirect
 * loses router state). This is a same-origin **path**, never a token, so
 * sessionStorage is appropriate. Stores only if safe; clears otherwise.
 */
export function stashReturnTo(value: unknown): void {
  const safe = safeRedirect(value);
  try {
    if (safe) sessionStorage.setItem(RETURN_TO_KEY, safe);
    else sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // sessionStorage unavailable (private mode / SSR) — returnTo is best-effort.
  }
}

/** Read **and clear** the stashed `returnTo`; returns a safe path or `undefined`. */
export function popReturnTo(): string | undefined {
  try {
    const value = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return safeRedirect(value);
  } catch {
    return undefined;
  }
}
