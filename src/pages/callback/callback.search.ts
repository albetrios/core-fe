/**
 * URL search-param schema for /callback (consumed by routeTree's `validateSearch`).
 * `code` + `state` arrive on the OAuth provider's redirect back to the SPA and
 * are forwarded to core-be's callback route by CallbackPage; `error` is the
 * provider's denial code (e.g. `access_denied`). All optional — a visit without
 * them falls back to the silent-refresh path.
 */
export interface CallbackSearch {
  code?: string;
  state?: string;
  error?: string;
}

export function validateCallbackSearch(search: Record<string, unknown>): CallbackSearch {
  return {
    code: typeof search.code === 'string' ? search.code : undefined,
    state: typeof search.state === 'string' ? search.state : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  };
}
