/**
 * URL search-param schema for /login (consumed by routeTree's `validateSearch`).
 * `redirect` = post-login return path, set by requireAuth (validated in
 * LoginForm). Optional return type keeps `search` optional for plain links.
 */
import { type LoginErrorCode, toLoginErrorCode } from '@/shared/auth/login-search.ts';

export interface LoginSearch {
  redirect?: string;
  /** Why the user was sent back here, when they did not arrive by choice. */
  error?: LoginErrorCode;
}

export function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  return {
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    error: toLoginErrorCode(search.error),
  };
}
