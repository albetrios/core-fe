import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { enabledOAuthProviders } from '@/core/config/auth-methods.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi } from '@/shared/api/auth-api.ts';
import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import {
  shouldAttemptAutoGoogleSignIn,
  skipAutoGoogleSignIn,
} from '@/shared/auth/auto-google-sign-in.ts';
import { useTurnstileReady } from '@/shared/auth/captcha/useTurnstileReady/index.ts';
import { signInWithPasskey } from '@/shared/auth/passkey-sign-in.ts';
import { isSafeExternalHttpsUrl, stashReturnTo } from '@/shared/auth/redirect-safety.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useAuthMethods } from '@/shared/hooks/useAuthMethods/index.ts';
import { Fingerprint, Github } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';

import { AUTH_FORM_TEST_IDS, sortOAuthProviders } from './auth-form.constants.ts';
import type { AuthContinuePending } from './auth-form-pending.ts';
import { AuthEmailPanel } from './AuthEmailPanel.tsx';
import { AuthMethodButton } from './components/AuthMethodButton/index.ts';
import { AuthMethodDivider } from './components/AuthMethodDivider/index.ts';
import { AuthWelcomeHeader } from './components/AuthWelcomeHeader/index.ts';

/** Brief pause so users can cancel auto Google and use email instead. */
const AUTO_GOOGLE_DELAY_MS = 800;

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" data-icon="">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'google') return <GoogleMark />;
  if (provider === 'github') return <Github className="size-4" data-icon="" />;
  if (provider === 'apple') {
    return (
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" data-icon="">
        <path
          d="M17.05 20.28c-.98.95-2.05 1.88-3.71 1.88-1.56 0-2.05-.93-3.82-.93-1.77 0-2.32.9-3.81.98-1.53.08-2.7-1.45-3.71-2.4C1.79 15.25 1.04 10.94 3.03 7.86c1.2-2.05 3.34-3.35 5.68-3.38 1.56-.03 3.03 1.05 3.98 1.05.95 0 2.74-1.3 4.62-1.11.79.03 3.01.32 4.43 2.41-3.7 2.01-3.1 7.24.76 8.85-.63 1.62-1.45 3.23-2.45 4.6zM12.03 4.5c-.13-2.23 1.67-4.14 3.74-4.36.28 2.58-2.34 4.5-3.74 4.36z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return null;
}

function providerTestId(provider: string): string {
  if (provider === 'google') return AUTH_FORM_TEST_IDS.continueGoogle;
  if (provider === 'github') return AUTH_FORM_TEST_IDS.continueGithub;
  if (provider === 'apple') return AUTH_FORM_TEST_IDS.continueApple;
  return AUTH_FORM_TEST_IDS.continueProvider(provider);
}

/**
 * Unified sign-in / sign-up entry — social methods first, then email OTP.
 * Optional `VITE_AUTH_OAUTH_AUTO_GOOGLE=true` starts Google OAuth after a short delay.
 */
export function AuthForm() {
  const { t } = useTranslation(AUTH_NS);
  const authMethods = useAuthMethods();
  const navigate = useNavigate();
  const location = useLocation();
  const turnstileReady = useTurnstileReady();
  const visibleProviders = sortOAuthProviders(enabledOAuthProviders(authMethods.oauth));
  const [emailFlowStep, setEmailFlowStep] = useState<'email' | 'verify'>('email');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [pending, setPending] = useState<AuthContinuePending | null>(null);
  const [autoGooglePending, setAutoGooglePending] = useState(false);
  // Inline error surface for the OAuth / passkey methods — the reliable one.
  // A toast fired from these async catches can be dropped by sonner (created
  // into history but never made active), leaving a failed sign-in with NO
  // feedback; the banner does not depend on that timing.
  const [formError, setFormError] = useState<string | null>(null);
  const autoGoogleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGoogleStartedRef = useRef(false);

  // Surface a failure on BOTH the reliable inline banner and the toast.
  const surfaceError = (err: unknown) => {
    const message = mapFrontendError(err);
    setFormError(message);
    notify.error(message);
  };

  const startOAuth = async (provider: string) => {
    if (pending) return;
    cancelAutoGoogle();
    setPending({ method: 'oauth', provider });
    stashReturnTo((location.search as { redirect?: unknown }).redirect);
    try {
      captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthStarted, { provider });
      const url = await authApi.oauthStart(provider);
      // Defense-in-depth: never navigate to an unvalidated backend-supplied URL.
      if (!isSafeExternalHttpsUrl(url)) {
        throw new Error('Unsafe OAuth redirect URL');
      }
      window.location.assign(url);
    } catch (err) {
      skipAutoGoogleSignIn();
      setAutoGooglePending(false);
      setPending(null);
      surfaceError(err);
    }
  };

  const cancelAutoGoogle = () => {
    if (autoGoogleTimerRef.current) {
      clearTimeout(autoGoogleTimerRef.current);
      autoGoogleTimerRef.current = null;
    }
    skipAutoGoogleSignIn();
    setAutoGooglePending(false);
    setFormError(null);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-start fires at most once (autoGoogleStartedRef guard); startOAuth is render-local and its identity must not retrigger the timer
  useEffect(() => {
    const canAutoStartGoogle =
      authMethods.oauthAutoGoogle &&
      authMethods.oauth.google &&
      shouldAttemptAutoGoogleSignIn() &&
      !autoGoogleStartedRef.current &&
      !pending &&
      turnstileReady;
    if (!canAutoStartGoogle) return;

    autoGoogleStartedRef.current = true;
    setAutoGooglePending(true);

    autoGoogleTimerRef.current = setTimeout(() => {
      autoGoogleTimerRef.current = null;
      void startOAuth('google');
    }, AUTO_GOOGLE_DELAY_MS);

    return () => {
      if (autoGoogleTimerRef.current) {
        clearTimeout(autoGoogleTimerRef.current);
        autoGoogleTimerRef.current = null;
      }
    };
  }, [authMethods.oauthAutoGoogle, authMethods.oauth.google, pending, turnstileReady]);

  const handlePasskey = async () => {
    if (pending) return;
    cancelAutoGoogle();
    setPending({ method: 'passkey' });
    try {
      await signInWithPasskey();
      void navigate({ to: '/', replace: true });
    } catch (err) {
      surfaceError(err);
    } finally {
      setPending(null);
    }
  };

  const handleEmailStepChange = useCallback(
    (step: 'email' | 'verify', email?: string) => {
      setEmailFlowStep(step);
      setVerifyEmail(step === 'verify' ? (email ?? '') : '');
    },
    [],
  );

  const showPasskey = authMethods.passkey;
  const showEmail = authMethods.email;

  const hasSocialMethods = visibleProviders.length > 0 || showPasskey;
  const isEmailVerify = emailFlowStep === 'verify';
  const showMethodPicker = !isEmailVerify;
  const showDivider = showMethodPicker && hasSocialMethods && showEmail;

  const hasAnyMethod = hasSocialMethods || showEmail;

  if (!hasAnyMethod) {
    return (
      <div className="space-y-6" data-testid={AUTH_FORM_TEST_IDS.form}>
        <p className="text-muted-foreground text-center text-sm">
          {t(AUTH_KEYS.auth.unavailable)}
        </p>
      </div>
    );
  }

  if (autoGooglePending) {
    return (
      <div
        className="space-y-6"
        data-testid={AUTH_FORM_TEST_IDS.form}
        data-auto-google-pending=""
      >
        <div
          className="flex flex-col items-center gap-4 py-8"
          data-testid={AUTH_FORM_TEST_IDS.autoGooglePending}
        >
          <FullPageSpinner />
          <p className="text-muted-foreground text-center text-sm">
            {t(AUTH_KEYS.auth.autoGoogleSigningIn)}
          </p>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={cancelAutoGoogle}
            data-testid={AUTH_FORM_TEST_IDS.skipAutoGoogle}
          >
            {t(AUTH_KEYS.auth.useEmailInstead)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${isEmailVerify ? 'gap-5' : 'gap-7'}`}
      data-testid={AUTH_FORM_TEST_IDS.form}
      {...(isEmailVerify ? { 'data-email-verify': '' } : {})}
    >
      <AuthWelcomeHeader
        variant={isEmailVerify ? 'emailVerify' : 'welcome'}
        email={isEmailVerify ? verifyEmail : undefined}
      />

      {showMethodPicker ? (
        <FormError
          message={formError}
          data-testid={AUTH_FORM_TEST_IDS.methodErrorBanner}
        />
      ) : null}

      {showMethodPicker && hasSocialMethods ? (
        <div
          className="flex flex-col gap-3"
          data-testid={AUTH_FORM_TEST_IDS.socialMethods}
        >
          {visibleProviders.map((provider) => (
            <AuthMethodButton
              key={provider}
              target={{ method: 'oauth', provider }}
              pending={pending}
              captchaGated
              turnstileReady={turnstileReady}
              icon={<ProviderIcon provider={provider} />}
              label={t(AUTH_KEYS.auth.continueWithProvider, {
                provider: t(AUTH_KEYS.login.oauth.providerKey(provider)),
              })}
              onClick={() => void startOAuth(provider)}
              testId={providerTestId(provider)}
            />
          ))}

          {showPasskey ? (
            <AuthMethodButton
              target={{ method: 'passkey' }}
              pending={pending}
              icon={<Fingerprint className="size-4" data-icon="" />}
              label={t(AUTH_KEYS.auth.continueWithPasskey)}
              onClick={() => void handlePasskey()}
              testId={AUTH_FORM_TEST_IDS.continuePasskey}
            />
          ) : null}
        </div>
      ) : null}

      {showDivider ? <AuthMethodDivider /> : null}

      {showEmail ? (
        <div className="animate-fade-in-up">
          <AuthEmailPanel
            pending={pending}
            onPendingChange={setPending}
            onInteract={cancelAutoGoogle}
            onStepChange={handleEmailStepChange}
          />
        </div>
      ) : null}
    </div>
  );
}
