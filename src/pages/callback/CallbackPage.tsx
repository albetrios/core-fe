import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { OAUTH_PROVIDER_SLUG_PATTERN } from '@/lib/routes/params.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi, MfaRequiredError } from '@/shared/api/auth-api.ts';
import { skipAutoGoogleSignIn } from '@/shared/auth/auto-google-sign-in.ts';
import { stashMfaHandoff } from '@/shared/auth/mfa-handoff.ts';
import { popReturnTo } from '@/shared/auth/redirect-safety.ts';
import { establishSession, silentRefresh } from '@/shared/auth/service.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { notify } from '@/shared/notify/index.ts';

import { CALLBACK_TEST_IDS } from './callback.constants.ts';

/**
 * `state` is core-be's own mint — 32 random bytes hex-encoded by
 * `createOAuthState` — so anything but 64 lowercase hex chars is not ours.
 */
const OAUTH_STATE_PATTERN = /^[0-9a-f]{64}$/;

/** Provider authorization codes: visible ASCII, bounded to the callback DTO limit. */
const OAUTH_CODE_PATTERN = /^[!-~]{1,2048}$/;

/**
 * Validate the three provider/user-supplied inputs before any of them selects a
 * code path. Pure and module-level: it is the same decision every render, and
 * keeping it out of the effect leaves that body about one thing.
 *
 * The server remains the real gate either way — single-use CSRF state,
 * browser-nonce binding and PKCE all verify before a session is minted.
 */
function readCallbackParams(rawProvider: unknown): {
  code: string | null;
  state: string | null;
  provider: string | null;
} {
  // Read from window.location, not router state: these come straight from the
  // provider's full-page redirect, before any SPA navigation.
  const params = new URLSearchParams(window.location.search);
  const rawCode = params.get('code');
  const rawState = params.get('state');
  return {
    code: rawCode !== null && OAUTH_CODE_PATTERN.test(rawCode) ? rawCode : null,
    state: rawState !== null && OAUTH_STATE_PATTERN.test(rawState) ? rawState : null,
    provider:
      typeof rawProvider === 'string' && OAUTH_PROVIDER_SLUG_PATTERN.test(rawProvider)
        ? rawProvider
        : null,
  };
}

/**
 * Provider-specific OAuth landing page (`/callback/$provider`, e.g.
 * `/callback/google`). Each provider registers its own URL, so the path itself
 * names the provider that is returning — the route guard has already validated
 * the slug. The page forwards `code`+`state` to core-be's callback route, which
 * consumes the CSRF state, exchanges the code, and sets the refresh-session
 * cookie on that XHR response. Without `code`+`state` (direct visit, provider
 * denial) it falls back to `silentRefresh()` so an already-signed-in visitor
 * still lands in the app.
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const { provider: rawProvider } = useParams({ strict: false });
  const started = useRef(false);
  /**
   * Whether this page is still the one on screen. Deliberately re-armed at the
   * TOP of every effect run, before the `started` bail: StrictMode's
   * mount → cleanup → mount would otherwise leave it false from the first run's
   * cleanup while the second run bails early, and the exchange already in
   * flight would resolve into a page that thinks it is gone.
   */
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    if (!started.current) {
      started.current = true;
      void runCallback();
    }

    async function runCallback() {
      const { code, state, provider } = readCallbackParams(rawProvider);

      const finishSignIn = () => {
        // The user may have left while the exchange was in flight (a back
        // gesture is enough). The session is established either way — that part
        // is not ours to undo — but yanking them off the page they just opened,
        // and logging a completion for a screen nobody is looking at, is (CB-2).
        if (!aliveRef.current) return;
        captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthCompleted);
        captureAnalyticsEvent(ANALYTICS_EVENTS.sessionStarted, { method: 'oauth' });
        const returnTo = popReturnTo();
        void navigate({ to: returnTo ?? '/', replace: true });
      };
      /**
       * The ONLY exit for a failed sign-in, so it is the one place that has to
       * say so. This used to be a bare redirect out of an empty catch: the user
       * watched a spinner, landed back on a plain login form with no toast, no
       * banner and no hint that Google/GitHub had failed — and retried the same
       * broken flow. Nothing was recorded either, so the funnel showed only the
       * two success events and the drop-off was invisible (CB-1).
       */
      const failToLogin = (error: unknown) => {
        if (!aliveRef.current) return;
        skipAutoGoogleSignIn();
        captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthFailed, {
          provider: provider ?? 'unknown',
        });
        notify.error(mapFrontendError(error));
        // A code, not a message: this text would otherwise come from a provider
        // redirect. /login maps it to its own translated banner copy.
        void navigate({ to: '/login', search: { error: 'oauth_failed' }, replace: true });
      };

      if (code && state && provider) {
        try {
          const { accessToken } = await authApi.oauthCallback(provider, { code, state });
          await establishSession(accessToken);
        } catch (error) {
          if (error instanceof MfaRequiredError) {
            // Stash regardless — the hand-off token is worth keeping even if we
            // no longer own the screen — but only navigate if we still do.
            stashMfaHandoff(error.mfaSessionToken, popReturnTo() ?? '/');
            if (!aliveRef.current) return;
            void navigate({ to: '/mfa', replace: true });
            return;
          }
          failToLogin(error);
          return;
        }
        finishSignIn();
        return;
      }

      try {
        await silentRefresh();
      } catch (error) {
        failToLogin(error);
        return;
      }
      finishSignIn();
    }

    return () => {
      aliveRef.current = false;
    };
  }, [navigate, rawProvider]);

  return (
    <div data-testid={CALLBACK_TEST_IDS.page}>
      <FullPageSpinner />
    </div>
  );
}
