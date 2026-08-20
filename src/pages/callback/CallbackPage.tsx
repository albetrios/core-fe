import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi, MfaRequiredError } from '@/shared/api/auth-api.ts';
import { skipAutoGoogleSignIn } from '@/shared/auth/auto-google-sign-in.ts';
import { stashMfaHandoff } from '@/shared/auth/mfa-handoff.ts';
import { popOauthProvider } from '@/shared/auth/oauth-provider-handoff.ts';
import { popReturnTo, stashReturnTo } from '@/shared/auth/redirect-safety.ts';
import { establishSession, silentRefresh } from '@/shared/auth/service.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';

import { CALLBACK_TEST_IDS } from './callback.constants.ts';

/** Reads the provider's `code` / `state` off the current URL (they are appended by the IdP). */
function readAuthorizationGrant(): { code: string; state: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  return code && state ? { code, state } : null;
}

/**
 * RFC 6749 §4.1.2.1 — the provider returns `error` *instead of* `code` when the user
 * declines consent. Must be read before {@link stripAuthorizationGrantFromUrl}.
 */
function readOauthError(): string | null {
  return new URLSearchParams(window.location.search).get('error');
}

/**
 * Drop the provider's params from the address bar before anything can observe them.
 * `code` is a single-use credential and telemetry boots in this same window, so this
 * runs synchronously — before the first `await` — and cannot be raced by the two
 * network round-trips the exchange needs. `telemetry-scrub.ts` filters the same params
 * as defence in depth for whatever is captured before this point.
 */
function stripAuthorizationGrantFromUrl(): void {
  window.history.replaceState(window.history.state, '', window.location.pathname);
}

/**
 * Landing page for the OAuth return leg.
 *
 * The identity provider redirects the browser **here** — the API is JSON-only and
 * issues no redirects (see the open-redirect guards in core-be). So this page owns
 * the second half of the exchange: it hands `code` / `state` to the API, which
 * validates them against its httpOnly nonce cookie, sets the session cookie, and
 * returns an access token.
 *
 * Falls back to a plain {@link silentRefresh} when no grant is present, which keeps
 * any other flow that lands on `/callback` with an already-established session
 * working exactly as before.
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const grant = readAuthorizationGrant();
      const oauthError = readOauthError();
      stripAuthorizationGrantFromUrl();
      const provider = popOauthProvider();
      const returnTo = popReturnTo();

      // The user declined at the provider (or the provider refused). There is nothing to
      // redeem and no session to pick up, so do not fall through to silentRefresh() —
      // that would report a generic failure indistinguishable from a real one.
      // `error_description` is provider-controlled text and is deliberately not surfaced.
      if (oauthError) {
        skipAutoGoogleSignIn();
        if (returnTo) stashReturnTo(returnTo);
        void navigate({ to: '/login', replace: true });
        return;
      }

      try {
        if (grant && provider) {
          const { accessToken } = await authApi.oauthCallback(
            provider,
            grant.code,
            grant.state,
          );
          await establishSession(accessToken);
        } else {
          // No grant to redeem (or an unknown provider): the session may already
          // exist from an earlier leg, so try to pick it up rather than failing.
          await silentRefresh();
        }
        captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthCompleted);
        captureAnalyticsEvent(ANALYTICS_EVENTS.sessionStarted, { method: 'oauth' });
      } catch (err) {
        if (err instanceof MfaRequiredError) {
          // A SPA navigation, so the in-memory MFA hand-off survives it.
          stashMfaHandoff(err.mfaSessionToken, returnTo ?? '/');
          void navigate({ to: '/mfa', replace: true });
          return;
        }
        skipAutoGoogleSignIn();
        // returnTo is popped before the try because the MFA branch needs it. It is a
        // navigation target already validated by isSafeRedirectPath, not a grant —
        // nothing about replay prevention requires discarding it here.
        if (returnTo) stashReturnTo(returnTo);
        void navigate({ to: '/login', replace: true });
        return;
      }
      void navigate({ to: returnTo ?? '/', replace: true });
    })();
  }, [navigate]);

  return (
    <div data-testid={CALLBACK_TEST_IDS.page}>
      <FullPageSpinner />
    </div>
  );
}
