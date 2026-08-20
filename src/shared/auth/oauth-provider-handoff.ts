import { OAUTH_PROVIDER_IDS } from '@/core/config/env-resolvers.ts';
import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * Hand-off of the *provider id* across the full-page `/login` → identity provider →
 * `/callback` round trip.
 *
 * The identity provider redirects back to a single registered URI and appends only
 * its own `code` / `state` parameters — Google in particular forbids query strings
 * in an authorized redirect URI — so `/callback` cannot otherwise tell which
 * provider it is completing. The id is stashed before the outbound navigation and
 * read on return.
 *
 * `sessionStorage` (not a module closure) is required here precisely *because* the
 * value must survive a full page load, which is the same reason `redirect-safety.ts`
 * stores `returnTo` there. Unlike the MFA session token in `mfa-handoff.ts`, a
 * provider id is a public, non-sensitive constant ("google"), so persisting it
 * carries no clear-text-credential risk.
 */
const OAUTH_PROVIDER_KEY = `${PRODUCT_NAMESPACE}-auth:oauth-provider`;

/** Narrowing guard: only ids the app actually supports may reach a request URL. */
function isKnownProvider(value: string | null): value is string {
  return value !== null && (OAUTH_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Stash the provider id immediately before navigating out to the identity provider. */
export function stashOauthProvider(provider: string): void {
  try {
    if (isKnownProvider(provider)) sessionStorage.setItem(OAUTH_PROVIDER_KEY, provider);
    else sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
  } catch {
    // sessionStorage unavailable (private mode / SSR) — the callback falls back
    // to silentRefresh(), so this is best-effort rather than fatal.
  }
}

/**
 * Read **and clear** the stashed provider id.
 *
 * @returns A supported provider id, or `undefined` when nothing valid is stashed.
 */
export function popOauthProvider(): string | undefined {
  try {
    const value = sessionStorage.getItem(OAUTH_PROVIDER_KEY);
    sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
    return isKnownProvider(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
