import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { queryClient } from '@/core/http/queryClient.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { translateFormMessage } from '@/lib/i18n/translate-form-message.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi, MfaRequiredError } from '@/shared/api/auth-api.ts';
import {
  AUTH_EMAIL_VERIFICATION_CODE_LENGTH,
  AUTH_KEYS,
  AUTH_NS,
} from '@/shared/auth/auth-shell.constants.ts';
import { useTurnstileReady } from '@/shared/auth/captcha/useTurnstileReady/index.ts';
import { stashMfaHandoff } from '@/shared/auth/mfa-handoff.ts';
import { isSafeRedirectPath } from '@/shared/auth/redirect-safety.ts';
import { establishSession } from '@/shared/auth/service.ts';
import { TotpCodeInput } from '@/shared/components/TotpCodeInput/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useCooldownClock } from '@/shared/hooks/useCooldownClock/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { type MeContext, meContextQueryKey } from '@/shared/tenancy/me-context.ts';
import { resolveRootTarget } from '@/shared/tenancy/organization-resolver.ts';

import {
  AUTH_EMAIL_VERIFICATION_CODE_RESEND_COOLDOWN_MS,
  AUTH_FORM_TEST_IDS,
} from './auth-form.constants.ts';
import {
  type AuthContinuePending,
  authEmailPanelIsBlocked,
  authMethodIsLoading,
} from './auth-form-pending.ts';
import { AuthMethodButton } from './components/AuthMethodButton/index.ts';

function formatResendCooldown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const inlineLinkClassName =
  'text-foreground h-auto p-0 text-sm font-normal underline underline-offset-4 hover:text-foreground/80 disabled:pointer-events-none disabled:opacity-50';

const emailOnlySchema = z.object({
  email: z
    .string()
    .min(1, 'validation.emailRequired')
    .pipe(z.email('validation.invalidEmail')),
});

type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

function getRedirectPath(location: {
  search?: unknown;
  state?: unknown;
}): string | undefined {
  const search = location.search as { redirect?: string } | undefined;
  if (
    search?.redirect &&
    typeof search.redirect === 'string' &&
    isSafeRedirectPath(search.redirect)
  ) {
    return search.redirect;
  }
  const state = location.state as { from?: { pathname?: string } } | undefined;
  if (
    state?.from?.pathname &&
    typeof state.from.pathname === 'string' &&
    isSafeRedirectPath(state.from.pathname)
  ) {
    return state.from.pathname;
  }
  return undefined;
}

/**
 * Send the just-authenticated user straight to their resolved destination.
 *
 * We deliberately do NOT navigate to `/` and let the index resolver decide: the
 * `/` resolver re-runs `hydrateSessionContext()` (a redundant me/context fetch —
 * `establishSession` populated it moments ago) and then throws a second redirect,
 * and `/login` stays mounted for that whole round-trip — the "flash of login"
 * after entering the code. `resolveRootTarget` is the exact decision the resolver
 * makes, run here on the context we already hold. A fresh signup still routes to
 * onboarding before any saved `redirect`.
 */
function navigateAfterEmailLogin(
  navigate: ReturnType<typeof useNavigate>,
  location: ReturnType<typeof useLocation>,
): void {
  const ctx = queryClient.getQueryData<MeContext>(meContextQueryKey);
  const rootTarget = ctx ? resolveRootTarget(ctx) : ({ to: '/' } as const);
  if (rootTarget.to === '/onboarding') {
    // Forward the saved deep link through the wizard instead of dropping it —
    // finishing onboarding returns the user to the page they signed in for.
    const savedRedirect = getRedirectPath(location);
    void navigate({
      to: '/onboarding',
      search: savedRedirect ? { redirect: savedRedirect } : undefined,
      replace: true,
    });
    return;
  }
  const redirectPath = getRedirectPath(location);
  if (redirectPath) {
    void navigate({ to: redirectPath, replace: true });
    return;
  }
  if (rootTarget.to === '/organization/$organizationSlug/dashboard') {
    void navigate({ to: rootTarget.to, params: rootTarget.params, replace: true });
    return;
  }
  void navigate({ to: rootTarget.to, replace: true });
}

type AuthEmailPanelProps = {
  pending?: AuthContinuePending | null;
  onPendingChange?: (pending: AuthContinuePending | null) => void;
  onInteract?: () => void;
  onStepChange?: (step: 'email' | 'verify', email?: string) => void;
};

export function AuthEmailPanel({
  pending = null,
  onPendingChange,
  onInteract,
  onStepChange,
}: AuthEmailPanelProps) {
  const { t } = useTranslation(AUTH_NS);
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeShake, setCodeShake] = useState(false);
  // Inline error surface — the reliable one. Toasts fired from this submit's
  // async catch can be dropped by sonner (created into history but never made
  // active), so a failed send/verify would otherwise give the user NO feedback.
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const resendCooldownNow = useCooldownClock(resendCooldownUntil);
  const turnstileReady = useTurnstileReady();
  const emailBlocked = authEmailPanelIsBlocked(pending);
  const emailSendLoading = authMethodIsLoading(pending, { method: 'email-send' });
  const emailVerifyLoading = authMethodIsLoading(pending, { method: 'email-verify' });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    onStepChange?.(step, step === 'verify' ? submittedEmail || undefined : undefined);
  }, [step, submittedEmail, onStepChange]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });

  // Surface a failure on BOTH the reliable inline banner and the toast.
  const surfaceError = (err: unknown) => {
    const message = mapFrontendError(err);
    setFormError(message);
    notify.error(message);
  };

  const sendCode = async (email: string) => {
    const value = email.trim();
    if (!value) return;
    if (
      step === 'verify' &&
      resendCooldownUntil !== null &&
      resendCooldownNow < resendCooldownUntil
    ) {
      return;
    }
    if (pending) return;
    setFormError(null);
    onPendingChange?.({ method: 'email-send' });
    try {
      const { debug_verification_code } = await authApi.emailVerificationCodeSend(value);
      captureAnalyticsEvent(ANALYTICS_EVENTS.authEmailCodeSent, { step: 'verify' });
      setSubmittedEmail(value);
      // Local/TEST_MODE convenience: core-be echoes the freshly issued code only when
      // its TEST_MODE is on (never in production), so its presence is the gate — prefill
      // the verify step when it's there, otherwise start empty for normal manual entry.
      setVerificationCode(debug_verification_code ?? '');
      setStep('verify');
      // eslint-disable-next-line react-hooks/purity -- runs in an event handler, not during render
      const cooldownUntil = Date.now() + AUTH_EMAIL_VERIFICATION_CODE_RESEND_COOLDOWN_MS;
      setResendCooldownUntil(cooldownUntil);
      notify.success(
        i18n.t(AUTH_KEYS.auth.email.toast.codeSent, { ns: AUTH_NS, email: value }),
      );
    } catch (err) {
      surfaceError(err);
    } finally {
      onPendingChange?.(null);
    }
  };

  const onEmailSubmit = async (data: EmailOnlyInput) => {
    await sendCode(data.email);
  };

  const verifyCode = async (verificationCodeOverride?: string) => {
    const email = submittedEmail.trim();
    const value = (verificationCodeOverride ?? verificationCode).trim();
    if (
      value.length !== AUTH_EMAIL_VERIFICATION_CODE_LENGTH ||
      emailVerifyLoading ||
      pending
    )
      return;
    setFormError(null);
    onPendingChange?.({ method: 'email-verify' });
    try {
      const { accessToken } = await authApi.emailLogin({
        email,
        code: value,
      });
      await establishSession(accessToken);
      captureAnalyticsEvent(ANALYTICS_EVENTS.authEmailCodeVerified);
      captureAnalyticsEvent(ANALYTICS_EVENTS.sessionStarted, { method: 'email_code' });
      navigateAfterEmailLogin(navigate, location);
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        const destination = getRedirectPath(location) ?? '/';
        stashMfaHandoff(err.mfaSessionToken, destination);
        void navigate({ to: '/mfa', replace: true });
        return;
      }
      setVerificationCode('');
      setCodeShake(true);
      window.setTimeout(() => setCodeShake(false), 450);
      surfaceError(err);
    } finally {
      onPendingChange?.(null);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setVerificationCode('');
    setResendCooldownUntil(null);
    setFormError(null);
  };

  const resendCooldownRemainingMs =
    resendCooldownUntil !== null
      ? Math.max(0, resendCooldownUntil - resendCooldownNow)
      : 0;
  const resendOnCooldown = resendCooldownRemainingMs > 0;

  if (step === 'email') {
    return (
      <div className="space-y-4" data-testid={AUTH_FORM_TEST_IDS.emailPanel}>
        <FormError
          message={formError}
          data-testid={AUTH_FORM_TEST_IDS.emailErrorBanner}
        />
        <form onSubmit={handleSubmit(onEmailSubmit)}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-email">{t(AUTH_KEYS.common.email)}</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder={t(AUTH_KEYS.common.emailPlaceholder)}
                autoComplete="email"
                aria-invalid={!!errors.email}
                disabled={emailBlocked || emailSendLoading}
                data-testid={AUTH_FORM_TEST_IDS.email}
                {...register('email')}
                onFocus={() => onInteract?.()}
              />
              {errors.email ? (
                <p
                  className="text-destructive text-xs"
                  role="alert"
                  data-testid={AUTH_FORM_TEST_IDS.emailError}
                >
                  {translateFormMessage(errors.email.message)}
                </p>
              ) : null}
            </div>

            <AuthMethodButton
              type="submit"
              variant="default"
              target={{ method: 'email-send' }}
              pending={pending}
              captchaGated
              turnstileReady={turnstileReady}
              label={t(AUTH_KEYS.auth.emailContinue)}
              extraDisabled={isSubmitting}
              testId={AUTH_FORM_TEST_IDS.emailSubmit}
            />
          </div>
        </form>
      </div>
    );
  }

  let resendHint: ReactNode;
  if (emailSendLoading) {
    resendHint = (
      <span className="text-foreground">{t(AUTH_KEYS.common.sendingEllipsis)}</span>
    );
  } else if (resendOnCooldown) {
    resendHint = (
      <>
        {t(AUTH_KEYS.auth.tryAgainPrefix)}{' '}
        <span
          aria-live="polite"
          className="text-foreground inline-block w-10 font-medium tabular-nums"
          data-testid="auth-email-resend-countdown"
        >
          {formatResendCooldown(resendCooldownRemainingMs)}
        </span>
      </>
    );
  } else {
    resendHint = (
      <Button
        type="button"
        variant="link"
        className={inlineLinkClassName}
        disabled={emailBlocked || emailSendLoading || resendOnCooldown || !turnstileReady}
        onClick={() => void sendCode(submittedEmail)}
        data-testid={AUTH_FORM_TEST_IDS.emailResend}
      >
        {t(AUTH_KEYS.auth.email.resendCode)}
      </Button>
    );
  }

  return (
    <div
      className="flex flex-col gap-5"
      data-testid={AUTH_FORM_TEST_IDS.emailVerifyPanel}
    >
      <FormError message={formError} data-testid={AUTH_FORM_TEST_IDS.emailErrorBanner} />
      <div className="space-y-2 pt-2 text-start">
        <Label htmlFor="auth-email-code">{t(AUTH_KEYS.auth.email.codeLabel)}</Label>
        <TotpCodeInput
          value={verificationCode}
          onChange={setVerificationCode}
          onComplete={(value) => {
            // Auto-submit must honour the SAME captcha gate as the verify button below.
            // Turnstile tokens are single-use: `send-code` consumed the previous one and the
            // widget re-mints asynchronously, so a fast typist completes the code before the
            // replacement token exists and the request posts with no `x-captcha-token` —
            // core-be then rejects it with `captchaRequired`. The button was already gated
            // (`captchaGated`); this path was not, which is why only auto-submit failed.
            if (!turnstileReady) return;
            void verifyCode(value);
          }}
          disabled={emailBlocked || emailVerifyLoading}
          shake={codeShake}
          charset="alphanumeric"
          testId={AUTH_FORM_TEST_IDS.emailCode}
          aria-label={t(AUTH_KEYS.auth.email.codeAria)}
          className="justify-start"
        />
      </div>

      <AuthMethodButton
        variant="default"
        target={{ method: 'email-verify' }}
        pending={pending}
        captchaGated
        turnstileReady={turnstileReady}
        label={t(AUTH_KEYS.auth.email.verifyAndContinue)}
        extraDisabled={
          verificationCode.trim().length !== AUTH_EMAIL_VERIFICATION_CODE_LENGTH
        }
        onClick={() => void verifyCode()}
        testId={AUTH_FORM_TEST_IDS.emailVerify}
      />

      <footer className="flex flex-col gap-2.5 text-center text-sm lg:text-start">
        <p className="text-muted-foreground text-pretty">
          {t(AUTH_KEYS.auth.email.resendHint)} {resendHint}
        </p>
        <p className="text-muted-foreground text-pretty">
          {t(AUTH_KEYS.auth.email.wrongEmailPrompt)}{' '}
          <Button
            type="button"
            variant="link"
            className={inlineLinkClassName}
            disabled={emailBlocked || emailSendLoading || emailVerifyLoading}
            onClick={changeEmail}
            data-testid={AUTH_FORM_TEST_IDS.emailChange}
          >
            {t(AUTH_KEYS.auth.email.changeEmailAddress)}
          </Button>
        </p>
      </footer>
    </div>
  );
}
