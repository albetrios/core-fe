# `pages/callback` — OAuth callback

Route: `/callback/$provider` (e.g. `/callback/google`, `/callback/github`).
Provider-specific redirect target for OAuth and future third-party sign-in —
each provider registers its own URL, so the path itself names the provider that
is returning; one island still serves every provider, so adding one never
touches this page. Outside the `auth-shell` route: it renders a bare spinner,
not the split-screen auth chrome.

## Files

| File                   | Responsibility                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callback.route.tsx`   | Route marker — exports `Component` rendering `CallbackPage`.                                                                                                                                                                                                                                                                                                        |
| `callback.manifest.ts` | Page manifest — `kind: 'leaf'`, path `/callback/$provider`, no permission required.                                                                                                                                                                                                                                                                                 |
| `callback.search.ts`   | Search schema — optional `code`/`state` (provider redirect) and `error` (provider denial).                                                                                                                                                                                                                                                                          |
| `CallbackPage.tsx`     | Forwards `code`+`state` to `authApi.oauthCallback` for the provider named by the `$provider` param (validated by `parseOAuthProviderParam` in the route guard), then `establishSession()`; `MfaRequiredError` hands off to `/mfa`. Without `code`+`state`, falls back to `silentRefresh()`. On failure routes back to `/login`. Owns `data-testid="callback-page"`. |

## Backend contract

The provider redirects the browser here with `code`+`state`. The page forwards
both to core-be's `GET /auth/oauth/:provider/callback` (an XHR that carries the
`oauth_nonce` cookie set at start), and the backend consumes the CSRF state,
exchanges the code, sets the refresh-session cookie on that response, and
returns the access token (or the MFA-required branch). Register
`https://<app-origin>/callback/<provider>` (e.g. `…/callback/google`) as the
redirect URI when configuring each provider on the backend
(`OAUTH_<PROVIDER>_REDIRECT_URI`) and in the provider's console.
