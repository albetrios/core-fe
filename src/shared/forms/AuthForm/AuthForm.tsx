import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { enabledOAuthProviders } from '@/core/config/auth-methods.ts';
import { warmSignedInShell } from '@/lib/signed-in-shell-warmup.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi } from '@/shared/api/auth-api.ts';
import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import {
  shouldAttemptAutoGoogleSignIn,
  skipAutoGoogleSignIn,
} from '@/shared/auth/auto-google-sign-in.ts';
import { CaptchaSlot } from '@/shared/auth/captcha/CaptchaSlot.tsx';
import { useCaptchaIntent } from '@/shared/auth/captcha/useCaptchaIntent/index.ts';
import { useTurnstileReady } from '@/shared/auth/captcha/useTurnstileReady/index.ts';
import type { LoginErrorCode } from '@/shared/auth/login-search.ts';
import {
  isPasskeySignInAvailable,
  signInWithPasskey,
} from '@/shared/auth/passkey-sign-in.ts';
import { isSafeExternalHttpsUrl, stashReturnTo } from '@/shared/auth/redirect-safety.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useAuthMethods } from '@/shared/hooks/useAuthMethods/index.ts';
import { notify } from '@/shared/notify/index.ts';

import {
  AUTH_FORM_TEST_IDS,
  oauthChallengeKey,
  sortOAuthProviders,
} from './auth-form.constants.ts';
import type { AuthContinuePending } from './auth-form-pending.ts';
import { AuthEmailPanel } from './AuthEmailPanel.tsx';
import { AuthAutoGooglePending } from './components/AuthAutoGooglePending/index.ts';
import { AuthMethodDivider } from './components/AuthMethodDivider/index.ts';
import { AuthSocialMethods } from './components/AuthSocialMethods/index.ts';
import { AuthWelcomeHeader } from './components/AuthWelcomeHeader/index.ts';

/** Brief pause so users can cancel auto Google and use email instead. */
const AUTO_GOOGLE_DELAY_MS = 800;

/** How long to wait for the OAuth redirect before handing the form back. */
const OAUTH_REDIRECT_WATCHDOG_MS = 8000;

/** Clear a pending timeout held in a ref, if there is one, and release the ref. */
function clearTimerRef(ref: { current: ReturnType<typeof setTimeout> | null }): void {
  if (ref.current === null) return;
  clearTimeout(ref.current);
  ref.current = null;
}

/**
 * Whether this render should kick off the Google handoff. Pure and module-level
 * so the decision reads as one named thing at both call sites (the lazy state
 * initialiser and the effect) instead of a repeated clause chain.
 */
function shouldAutoStartGoogle(args: {
  autoGoogleEnabled: boolean;
  googleEnabled: boolean;
  alreadyStarted: boolean;
  busy: boolean;
  captchaReady: boolean;
}): boolean {
  if (!(args.autoGoogleEnabled && args.googleEnabled)) return false;
  if (args.alreadyStarted || args.busy || !args.captchaReady) return false;
  return shouldAttemptAutoGoogleSignIn();
}

/**
 * E2E contract for the method buttons. Deliberately owned by the form rather
 * than the presentational child: `AuthForm` is the unit the test-id gate and the
 * Playwright specs address, so the ids it exposes are part of its own surface.
 */
function providerTestId(provider: string): string {
  if (provider === 'google') return AUTH_FORM_TEST_IDS.continueGoogle;
  if (provider === 'github') return AUTH_FORM_TEST_IDS.continueGithub;
  if (provider === 'apple') return AUTH_FORM_TEST_IDS.continueApple;
  return AUTH_FORM_TEST_IDS.continueProvider(provider);
}

/**
 * Arms the OAuth redirect watchdog: if the page has not left within
 * {@link OAUTH_REDIRECT_WATCHDOG_MS}, `onNeverLeft` reports the failure.
 *
 * `replace` resolves nothing and throws nothing when the navigation never
 * happens — a popup/redirect blocker, an extension, or a deferred nav all
 * look identical to success from here. Without this the form stayed
 * disabled behind a spinner with no way back (LOGIN-10).
 *
 * The original comment claimed "if the page is really leaving, this timer
 * leaves with it". That is only true once the document is actually torn
 * down. A redirect that is merely SLOW is still in flight at 8s, so the
 * watchdog fired on a working sign-in: the user was shown "sign-in failed"
 * mid-navigation, and because it also releases `methodStartedRef`, a
 * second `oauthStart` could go out — two OAuth starts for one click.
 *
 * `pagehide` is the signal that the document is going away. It fires for
 * bfcache-eligible navigations where `unload` does not, and it fires for a
 * cross-origin redirect. Deliberately NOT `visibilitychange`: that fires
 * when the user merely switches tab, which would disarm a watchdog that
 * should still be armed. `beforeunload` is skipped too — it is throttled,
 * unreliable without user interaction, and adds nothing `pagehide` misses.
 */
function armRedirectWatchdog(args: {
  timerRef: { current: ReturnType<typeof setTimeout> | null };
  disarmRef: { current: (() => void) | null };
  onNeverLeft: () => void;
}): void {
  const disarmWatchdog = () => {
    clearTimerRef(args.timerRef);
    window.removeEventListener('pagehide', disarmWatchdog);
    args.disarmRef.current = null;
  };
  window.addEventListener('pagehide', disarmWatchdog);
  args.disarmRef.current = disarmWatchdog;
  args.timerRef.current = setTimeout(() => {
    // Not `disarmWatchdog()`: that clears the ref this callback is running
    // from. Drop the listener, then report — the navigation never happened.
    window.removeEventListener('pagehide', disarmWatchdog);
    args.disarmRef.current = null;
    args.timerRef.current = null;
    args.onNeverLeft();
  }, OAUTH_REDIRECT_WATCHDOG_MS);
}

/**
 * The method picker above the email flow: the inline error banner, the social and passkey
 * buttons, and the divider when an email panel follows.
 */
function AuthMethodPicker({
  formError,
  providers,
  showPasskey,
  showEmail,
  pending,
  challengeFor,
  onProvider,
  onPasskey,
}: {
  formError: string | null;
  providers: string[];
  showPasskey: boolean;
  showEmail: boolean;
  pending: AuthContinuePending | null;
  challengeFor: ReturnType<typeof useCaptchaIntent>['challengeFor'];
  onProvider: (provider: string) => void;
  onPasskey: () => void;
}) {
  const hasSocialMethods = providers.length > 0 || showPasskey;
  return (
    <>
      <FormError message={formError} data-testid={AUTH_FORM_TEST_IDS.methodErrorBanner} />
      {hasSocialMethods ? (
        <AuthSocialMethods
          providers={providers}
          showPasskey={showPasskey}
          pending={pending}
          challengeFor={challengeFor}
          providerChallengeKey={oauthChallengeKey}
          onProvider={onProvider}
          onPasskey={onPasskey}
          providerTestId={providerTestId}
          passkeyTestId={AUTH_FORM_TEST_IDS.continuePasskey}
        />
      ) : null}
      {hasSocialMethods && showEmail ? <AuthMethodDivider /> : null}
    </>
  );
}

/**
 * The email OTP flow — or, on an OAuth-only deployment, the form-level captcha slot in its place.
 */
function AuthEmailSection({
  showEmail,
  pending,
  onPendingChange,
  onInteract,
  onStepChange,
}: {
  showEmail: boolean;
  pending: AuthContinuePending | null;
  onPendingChange: (pending: AuthContinuePending | null) => void;
  onInteract: () => void;
  onStepChange: (step: 'email' | 'verify', email?: string) => void;
}) {
  const { t } = useTranslation(AUTH_NS);
  return (
    <>
      {showEmail ? (
        <div className="animate-fade-in-up">
          {/*
            The email OTP flow and the social methods are independent ways into
            the same account, so they fail independently too. The page-level
            boundary in LoginPage catches a throw anywhere in this form, but it
            takes the WHOLE form down with it — a crash in the code input would
            remove the working Google and GitHub buttons as well. Contained
            here, the user keeps every method that still works.
          */}
          <SectionErrorBoundary
            title={t(AUTH_KEYS.common.email)}
            testId={AUTH_FORM_TEST_IDS.emailPanelError}
          >
            <AuthEmailPanel
              pending={pending}
              onPendingChange={onPendingChange}
              onInteract={onInteract}
              onStepChange={onStepChange}
            />
          </SectionErrorBoundary>
        </div>
      ) : null}

      {/* The email panel owns the captcha slot (between its last field and the submit
          button — the conventional captcha position). This form-level slot exists only for
          OAuth-only deployments, where no email panel mounts but the provider buttons are
          still captcha-gated. Never render both: the registry is last-mounted-wins and the
          challenge must sit in the email flow whenever it exists. */}
      {showEmail ? null : <CaptchaSlot testId={AUTH_FORM_TEST_IDS.captchaSlot} />}
    </>
  );
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
  // Only the AUTO-Google start still needs readiness up front: it fires without a
  // click, so there is no gesture to carry the wait and no button to anchor a
  // challenge to. Every clicked method resolves its own captcha in the handler.
  const turnstileReady = useTurnstileReady();
  const { challengeFor, ensureToken } = useCaptchaIntent();
  // GitHub OAuth is not provisioned for this deployment yet, so its button is
  // hidden here instead of deleted: the icon, test id, provider order and the
  // shared /callback route all stay wired up. Delete the `.filter(...)` line to
  // bring the button back. The permanent switch is the env flag that feeds
  // `enabledOAuthProviders` — flip that instead once credentials exist, and drop
  // this filter.
  const visibleProviders = sortOAuthProviders(
    enabledOAuthProviders(authMethods.oauth),
  ).filter((provider) => provider !== 'github');
  const [emailFlowStep, setEmailFlowStep] = useState<'email' | 'verify'>('email');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [pending, setPending] = useState<AuthContinuePending | null>(null);
  // Lazy initialiser, deliberately NOT `false`. Whether this screen is going to
  // auto-start Google is knowable at first render, so it must be decided here.
  // Seeding it `false` and raising it in the effect below made the method picker
  // the first thing committed, so the whole form rendered and was then replaced
  // by the spinner — a visible swap for as long as the captcha gate holds the
  // effect back (LOGIN-1). `turnstileReady` is intentionally NOT part of this:
  // it gates *starting* OAuth, not whether we intend to.
  const [autoGooglePending, setAutoGooglePending] = useState(() =>
    shouldAutoStartGoogle({
      autoGoogleEnabled: authMethods.oauthAutoGoogle,
      googleEnabled: authMethods.oauth.google,
      // Intent only: nothing has started, nothing is busy, and the captcha gate
      // decides when to *start*, not whether we mean to.
      alreadyStarted: false,
      busy: false,
      captchaReady: true,
    }),
  );
  // Inline error surface for the OAuth / passkey methods — the reliable one.
  // A toast fired from these async catches can be dropped by sonner (created
  // into history but never made active), leaving a failed sign-in with NO
  // feedback; the banner does not depend on that timing.
  // Seeded from the URL, so a redirect back here can explain itself. /callback
  // sends `?error=oauth_failed` when the OAuth exchange fails; without it the
  // user landed on a plain form with no idea Google/GitHub had failed and simply
  // retried the same broken flow (CB-1). A lazy initialiser, for the same reason
  // as autoGooglePending: it belongs to the first paint, not to an effect.
  const [formError, setFormError] = useState<string | null>(() =>
    (location.search as { error?: LoginErrorCode }).error === 'oauth_failed'
      ? t(AUTH_KEYS.auth.errors.oauthFailed)
      : null,
  );
  const autoGoogleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGoogleStartedRef = useRef(false);
  // Synchronous single-flight guard for the method buttons. `pending` is React
  // state, so it is only true on the NEXT render — for the frame after the first
  // click the handler is still reachable and a double-click or an impatient
  // second tap fires it again. This ref flips in the same tick, so the second
  // gesture cannot start a second oauthStart / passkey request (house rule:
  // agent-os/rules/fe-resilient-interactions.mdc §1). `pending` stays as the
  // visible affordance; this is the correctness net under it.
  const methodStartedRef = useRef(false);

  const redirectWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Disarms the redirect watchdog AND removes its `pagehide` listener.
   *
   * Held in a ref so unmount can run it: the listener is registered on `window`,
   * so clearing only the timer would leak it for the life of the page.
   */
  const redirectWatchdogDisarmRef = useRef<(() => void) | null>(null);

  /**
   * Take the single-flight slot for a method button. Returns false when a start
   * is already in flight, so both handlers reduce to one guarded entry point.
   */
  const claimMethodStart = (): boolean => {
    if (pending !== null || methodStartedRef.current) return false;
    methodStartedRef.current = true;
    return true;
  };

  // Surface a failure on BOTH the reliable inline banner and the toast.
  const surfaceError = (err: unknown) => {
    const message = mapFrontendError(err);
    setFormError(message);
    notify.error(message);
  };

  const startOAuth = async (provider: string, options?: { auto?: boolean }) => {
    if (!claimMethodStart()) return;
    if (options?.auto) {
      // The auto-Google screen stays up until the redirect lands. Routing this
      // through cancelAutoGoogle() dropped `autoGooglePending` back to false and
      // put the (now fully disabled) method picker on screen for the length of
      // the oauthStart round trip — the third flash in LOGIN-1. Still mark the
      // attempt as spent so returning to /login does not auto-start again.
      clearAutoGoogleTimer();
      skipAutoGoogleSignIn();
    } else {
      cancelAutoGoogle();
    }
    setPending({ method: 'oauth', provider });
    /*
     * Same commitment as submitting an email, and a wider window: `oauthStart`
     * below is a full round trip before the redirect, and chunks fetched now
     * survive the trip to the provider in the HTTP cache — so the callback lands
     * on a warm shell instead of starting the download after the code exchange.
     */
    warmSignedInShell();
    stashReturnTo((location.search as { redirect?: unknown }).redirect);
    try {
      /*
       * The captcha is resolved here, inside the click, rather than by leaving
       * this button disabled until a token exists. An auto-start has no click to
       * absorb and no button to anchor a challenge to, so it keeps its own
       * `captchaReady` precondition below and never reaches this branch without
       * a token.
       */
      if (!(options?.auto || (await ensureToken(oauthChallengeKey(provider))))) {
        setPending(null);
        return;
      }
      captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthStarted, { provider });
      const url = await authApi.oauthStart(provider);
      // Defense-in-depth: never navigate to an unvalidated backend-supplied URL.
      if (!isSafeExternalHttpsUrl(url)) {
        throw new Error('Unsafe OAuth redirect URL');
      }
      /*
       * REPLACE, not assign. `assign` pushed a history entry, leaving /login
       * behind the provider's pages; once sign-in completed, the callback and
       * the `/` resolver both replace themselves, so /login was the only entry
       * of ours still sitting under the dashboard — Back from a fresh sign-in
       * walked into it. Replacing hands this entry to the provider instead, and
       * when the provider completes on HTTP redirects (a returning user, one
       * signed-in account) the whole sign-in leaves no entry at all. A provider
       * page the user actually clicks through — an account chooser, a first
       * consent — is the provider's own entry, and no page code can remove it.
       */
      window.location.replace(url);
      armRedirectWatchdog({
        timerRef: redirectWatchdogRef,
        disarmRef: redirectWatchdogDisarmRef,
        onNeverLeft: () => {
          methodStartedRef.current = false;
          setAutoGooglePending(false);
          setPending(null);
          setFormError(t(AUTH_KEYS.auth.errors.oauthFailed));
        },
      });
    } catch (err) {
      skipAutoGoogleSignIn();
      setAutoGooglePending(false);
      setPending(null);
      methodStartedRef.current = false;
      surfaceError(err);
    }
  };

  const clearAutoGoogleTimer = () => clearTimerRef(autoGoogleTimerRef);

  /**
   * Stop the auto-Google handoff. Deliberately does NOT touch `formError`:
   * this runs on plain interaction (focusing the email field), and clearing the
   * banner there wiped "Google sign-in failed" the instant the user moved to
   * try another method — before they had read why (LOGIN-9).
   */
  const dismissAutoGoogle = () => {
    clearAutoGoogleTimer();
    skipAutoGoogleSignIn();
    setAutoGooglePending(false);
  };

  /**
   * Dismiss AND clear the banner. Only for an explicit new attempt — picking a
   * provider, or "use email instead" — where the previous failure is genuinely
   * stale because the user has chosen to move on.
   */
  const cancelAutoGoogle = () => {
    dismissAutoGoogle();
    setFormError(null);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-start fires at most once (autoGoogleStartedRef guard); startOAuth is render-local and its identity must not retrigger the timer
  useEffect(() => {
    const canAutoStartGoogle = shouldAutoStartGoogle({
      autoGoogleEnabled: authMethods.oauthAutoGoogle,
      googleEnabled: authMethods.oauth.google,
      alreadyStarted: autoGoogleStartedRef.current,
      busy: Boolean(pending),
      captchaReady: turnstileReady,
    });
    if (!canAutoStartGoogle) return;

    autoGoogleStartedRef.current = true;
    // No setAutoGooglePending(true) here: the initialiser above already decided
    // it from the same inputs, and the only path that lowers it (cancelAutoGoogle)
    // also sets the skip flag, which fails `shouldAttemptAutoGoogleSignIn()` above.

    autoGoogleTimerRef.current = setTimeout(() => {
      autoGoogleTimerRef.current = null;
      void startOAuth('google', { auto: true });
    }, AUTO_GOOGLE_DELAY_MS);

    // The guard and the timer are owned together, so they are released together.
    // If this run is torn down before the timer fires — a `pending` or
    // `turnstileReady` change, or StrictMode's double-invoke on mount — the timer
    // dies with it, so the guard has to come off too. Holding it left every later
    // run bailing at `!autoGoogleStartedRef.current` while `autoGooglePending`
    // stayed true: the spinner sat there forever and OAuth never started
    // (LOGIN-3). Once the timer HAS fired it nulls itself first, so the guard
    // stays held from then on and the sign-in can never start twice.
    return () => {
      if (!autoGoogleTimerRef.current) return;
      clearTimeout(autoGoogleTimerRef.current);
      autoGoogleTimerRef.current = null;
      autoGoogleStartedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startOAuth is render-local; adding it re-arms the timer every render (LOGIN-3)
  }, [authMethods.oauthAutoGoogle, authMethods.oauth.google, pending, turnstileReady]);

  // The redirect watchdog is the one timer that can outlive this component:
  // it is armed just before the page is expected to leave, so if the form
  // unmounts for any other reason it has to be released here.
  useEffect(
    () => () => {
      // Runs the disarm, not just the timer clear — otherwise the `pagehide`
      // listener outlives the component.
      redirectWatchdogDisarmRef.current?.();
      clearTimerRef(redirectWatchdogRef);
    },
    [],
  );

  const handlePasskey = async () => {
    if (!claimMethodStart()) return;
    cancelAutoGoogle();
    setPending({ method: 'passkey' });
    try {
      await signInWithPasskey();
      void navigate({ to: '/', replace: true });
    } catch (err) {
      surfaceError(err);
    } finally {
      methodStartedRef.current = false;
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

  // Gated on the runtime predicate too: offering the button while the WebAuthn
  // endpoints are unwired meant a fingerprint prompt followed by a failure
  // (LOGIN-7). Hidden until it can actually sign someone in.
  const showPasskey = authMethods.passkey && isPasskeySignInAvailable();
  const showEmail = authMethods.email;

  const hasSocialMethods = visibleProviders.length > 0 || showPasskey;
  const isEmailVerify = emailFlowStep === 'verify';

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
        <AuthAutoGooglePending onSkip={cancelAutoGoogle} />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${isEmailVerify ? 'gap-5' : 'gap-7'}`}
      data-testid={AUTH_FORM_TEST_IDS.form}
      data-email-verify={isEmailVerify ? '' : undefined}
    >
      <AuthWelcomeHeader
        variant={isEmailVerify ? 'emailVerify' : 'welcome'}
        email={isEmailVerify ? verifyEmail : undefined}
      />

      {isEmailVerify ? null : (
        <AuthMethodPicker
          formError={formError}
          providers={visibleProviders}
          showPasskey={showPasskey}
          showEmail={showEmail}
          pending={pending}
          challengeFor={challengeFor}
          onProvider={(provider) => void startOAuth(provider)}
          onPasskey={() => void handlePasskey()}
        />
      )}

      <AuthEmailSection
        showEmail={showEmail}
        pending={pending}
        onPendingChange={setPending}
        onInteract={dismissAutoGoogle}
        onStepChange={handleEmailStepChange}
      />
    </div>
  );
}
