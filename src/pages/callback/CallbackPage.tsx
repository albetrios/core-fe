import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi, MfaRequiredError } from '@/shared/api/auth-api.ts';
import { skipAutoGoogleSignIn } from '@/shared/auth/auto-google-sign-in.ts';
import { stashMfaHandoff } from '@/shared/auth/mfa-handoff.ts';
import { popReturnTo } from '@/shared/auth/redirect-safety.ts';
import { establishSession, silentRefresh } from '@/shared/auth/service.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';

import { CALLBACK_TEST_IDS } from './callback.constants.ts';

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
  const { provider } = useParams({ strict: false });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      // Read from window.location, not router state: the params come straight
      // from the provider's full-page redirect, before any SPA navigation.
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      const finishSignIn = () => {
        captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthCompleted);
        captureAnalyticsEvent(ANALYTICS_EVENTS.sessionStarted, { method: 'oauth' });
        const returnTo = popReturnTo();
        void navigate({ to: returnTo ?? '/', replace: true });
      };
      const failToLogin = () => {
        skipAutoGoogleSignIn();
        void navigate({ to: '/login', replace: true });
      };

      if (code && state && provider) {
        try {
          const { accessToken } = await authApi.oauthCallback(provider, { code, state });
          await establishSession(accessToken);
        } catch (error) {
          if (error instanceof MfaRequiredError) {
            stashMfaHandoff(error.mfaSessionToken, popReturnTo() ?? '/');
            void navigate({ to: '/mfa', replace: true });
            return;
          }
          failToLogin();
          return;
        }
        finishSignIn();
        return;
      }

      try {
        await silentRefresh();
      } catch {
        failToLogin();
        return;
      }
      finishSignIn();
    })();
  }, [navigate, provider]);

  return (
    <div data-testid={CALLBACK_TEST_IDS.page}>
      <FullPageSpinner />
    </div>
  );
}
