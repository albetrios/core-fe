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

## Browser history

A sign-in must not leave entries of ours behind the landing page, so Back from
a fresh sign-in leaves the app instead of walking back through the flow:

- `AuthForm` hands off to the provider with `window.location.replace`, not
  `assign` — the `/login` entry becomes the provider's navigation.
- This page moves on with `navigate({ …, replace: true })`, and the `/`
  resolver's redirect replaces too (TanStack Router follows every `beforeLoad`
  redirect with `replace: true`).

When the provider completes on HTTP redirects — a returning user with one
signed-in account — the whole sign-in collapses into the landing entry. A
provider page the user actually clicks through (an account chooser, a
first-time consent) is the provider's own entry; no page code can remove
another origin's history entry. core-be keeps that page rare by not forcing a
prompt: it sends neither `prompt=consent` nor `access_type=offline`.

Everything after the landing pushes, so Back moves between organizations as
usual — including after creating one.
