import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * Persist the OAuth provider name across the provider round-trip. The SPA's
 * `/callback` page is provider-agnostic (one registered redirect URI serves
 * every provider), so the provider that STARTED the flow is stashed here and
 * popped on return to address core-be's `GET /auth/oauth/:provider/callback`.
 *
 * sessionStorage (not a module closure) because the round-trip is a full-page
 * redirect — in-memory state does not survive it. The value is a provider slug,
 * never a credential, so storage is appropriate (same reasoning as
 * `stashReturnTo` in `redirect-safety.ts`). sessionStorage is per-tab, so
 * sign-in attempts in parallel tabs keep their own provider.
 */

const OAUTH_PROVIDER_KEY = `${PRODUCT_NAMESPACE}-auth:oauth-provider`;

/** Provider slugs are lowercase kebab (`google`, `github`); anything else is dropped. */
const PROVIDER_SLUG_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** Narrow an unknown value to a well-formed provider slug, else `undefined`. */
export function safeOAuthProvider(value: unknown): string | undefined {
  return typeof value === 'string' && PROVIDER_SLUG_PATTERN.test(value)
    ? value
    : undefined;
}

/** Stash the provider about to start an OAuth round-trip. Stores only if well-formed; clears otherwise. */
export function stashOAuthProvider(value: unknown): void {
  const safe = safeOAuthProvider(value);
  try {
    if (safe) sessionStorage.setItem(OAUTH_PROVIDER_KEY, safe);
    else sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
  } catch {
    // sessionStorage unavailable (private mode) — /callback falls back to silentRefresh.
  }
}

/** Read **and clear** the stashed provider; returns a well-formed slug or `undefined`. */
export function popOAuthProvider(): string | undefined {
  try {
    const value = sessionStorage.getItem(OAUTH_PROVIDER_KEY);
    sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
    return safeOAuthProvider(value);
  } catch {
    return undefined;
  }
}
