import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { translateFormMessage } from '@/lib/i18n/translate-form-message.ts';
import { authApi } from '@/shared/api/auth-api.ts';
import { type MfaVerifyInput, mfaVerifySchema } from '@/shared/api/auth-contracts.ts';
import { clearMfaHandoff, readMfaHandoff } from '@/shared/auth/mfa-handoff.ts';
import { safeRedirect } from '@/shared/auth/redirect-safety.ts';
import { establishSession } from '@/shared/auth/service.ts';
import { TotpCodeInput } from '@/shared/components/TotpCodeInput/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';

import {
  AUTH_KEYS,
  AUTH_MFA_RECOVERY_MAX_LENGTH,
  AUTH_NS,
  MFA_TEST_IDS,
} from '../../mfa.constants.ts';

type LocationState = { mfaToken?: string; redirect?: string };

/** Duration of the wrong-code shake; matches the `animate-otp-shake` keyframes. */
const OTP_SHAKE_MS = 450;

export function MfaForm() {
  const { t } = useTranslation(AUTH_NS);
  const [apiError, setApiError] = useState<string | null>(null);
  const [otpShake, setOtpShake] = useState(false);
  const otpShakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otpShakeFrameRef = useRef<number | null>(null);
  /**
   * Synchronous single-flight latch (house rule 1). `isSubmitting` only flips on
   * the next render, so a double-click — or a second `onComplete` from the code
   * boxes — slips through in the frame before it lands. The MFA session token is
   * SINGLE USE: the second request spends a token core-be has already burned, so
   * a duplicate does not just waste a round trip, it fails the login outright.
   */
  const verifyingRef = useRef(false);
  /**
   * Replay-safe shake, owned so it can be restarted and released. A bare
   * `setTimeout` held no id: a second wrong code inside the window re-set an
   * already-true flag (no class change, so no replay), the first timer then
   * cleared the shake mid-way through the second attempt, and leaving the
   * screen fired `setOtpShake` on an unmounted component. Same defect as the
   * email panel's (LOGIN-8) — this is its second site.
   *
   * The frame that re-adds the class is owned as well as the timer. Releasing
   * only the timer left a gap: leave while the frame was still pending and it ran
   * afterwards, starting a timer nobody owned — in tests it fired after jsdom was
   * torn down, failing the run with `window is not defined`.
   */
  const startOtpShake = () => {
    if (otpShakeFrameRef.current !== null) cancelAnimationFrame(otpShakeFrameRef.current);
    if (otpShakeTimerRef.current) clearTimeout(otpShakeTimerRef.current);
    setOtpShake(false);
    // Next frame, so the class is genuinely removed and re-added.
    otpShakeFrameRef.current = requestAnimationFrame(() => {
      otpShakeFrameRef.current = null;
      setOtpShake(true);
      otpShakeTimerRef.current = setTimeout(() => {
        otpShakeTimerRef.current = null;
        setOtpShake(false);
      }, OTP_SHAKE_MS);
    });
  };

  useEffect(
    () => () => {
      if (otpShakeFrameRef.current !== null) {
        cancelAnimationFrame(otpShakeFrameRef.current);
        otpShakeFrameRef.current = null;
      }
      if (otpShakeTimerRef.current) {
        clearTimeout(otpShakeTimerRef.current);
        otpShakeTimerRef.current = null;
      }
    },
    [],
  );
  /**
   * Stays true from a successful verify until this component unmounts. Awaiting
   * `navigate()` is not enough on its own — React can paint between the verify
   * resolving and the route swapping, which is what flipped "Verifying..." back
   * to an armed "Verify" and invited the duplicate submit.
   */
  const [handedOff, setHandedOff] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | undefined;
  const handoff = readMfaHandoff();
  const mfaToken = state?.mfaToken ?? handoff.mfaSessionToken;
  const redirectTarget = state?.redirect ?? handoff.redirect;

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MfaVerifyInput>({
    resolver: zodResolver(mfaVerifySchema),
    defaultValues: { code: '', useRecoveryCode: false },
  });
  // `useWatch`, not `watch()`: the React Compiler cannot memoize around the value
  // `watch()` returns, so it skipped this whole component.
  const useRecovery = useWatch({ control, name: 'useRecoveryCode' }) ?? false;
  /** Verify in flight, or verified and on its way out. Nothing here stays live. */
  const pending = isSubmitting || handedOff;

  const onSubmit = async (data: MfaVerifyInput) => {
    // The latch, not `disabled`, is what guarantees one gesture spends one token.
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    setApiError(null);
    if (!mfaToken) {
      verifyingRef.current = false;
      setApiError(t(AUTH_KEYS.mfa.errors.sessionExpired));
      return;
    }
    try {
      const { accessToken } = await authApi.mfaVerify(data, mfaToken);
      // Verified. The token is spent and the route is about to change: hold the
      // pending state (latch NOT released) so the form cannot be re-armed.
      setHandedOff(true);
      clearMfaHandoff();
      await establishSession(accessToken);
      await navigate({ to: safeRedirect(redirectTarget) ?? '/', replace: true });
    } catch (err) {
      // Only a failure re-arms the form — the user needs a fresh code either way.
      verifyingRef.current = false;
      setHandedOff(false);
      if (!useRecovery) {
        setValue('code', '');
        startOtpShake();
      }
      setApiError(mapFrontendError(err));
    }
  };

  if (!mfaToken) {
    return (
      <div className="flex flex-col gap-6" data-testid={MFA_TEST_IDS.form}>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(AUTH_KEYS.mfa.sessionExpiredHeading)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(AUTH_KEYS.mfa.sessionExpiredSubheading)}
          </p>
        </div>
        <Button asChild className="w-full">
          <Link to="/login">{t(AUTH_KEYS.common.signIn)}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid={MFA_TEST_IDS.form}>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t(AUTH_KEYS.mfa.heading)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {useRecovery
            ? t(AUTH_KEYS.mfa.recoveryHint)
            : t(AUTH_KEYS.mfa.authenticatorHint)}
        </p>
      </div>

      <form
        // Bound at submit time, not during render: `onSubmit` reads refs, and
        // handing a ref-reading callback to `handleSubmit()` during render is what
        // react-hooks/refs forbids. (Hidden while `watch()` made the compiler skip
        // this component.)
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        <div className="flex flex-col gap-4">
          <FormError message={apiError} data-testid={MFA_TEST_IDS.formError} />

          <div className="flex flex-col gap-2">
            {useRecovery ? (
              <>
                <Label htmlFor="mfa-code">{t(AUTH_KEYS.mfa.recoveryCodeLabel)}</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder={t(AUTH_KEYS.mfa.recoveryPlaceholder)}
                  maxLength={AUTH_MFA_RECOVERY_MAX_LENGTH}
                  disabled={pending}
                  aria-invalid={!!errors.code}
                  aria-describedby={errors.code ? 'mfa-code-error' : undefined}
                  data-testid={MFA_TEST_IDS.code}
                  {...register('code')}
                />
              </>
            ) : (
              <>
                <Label htmlFor="mfa-code">{t(AUTH_KEYS.mfa.codeLabel)}</Label>
                <Controller
                  name="code"
                  control={control}
                  render={({ field }) => (
                    <TotpCodeInput
                      id="mfa-code"
                      value={field.value}
                      onChange={field.onChange}
                      onComplete={() => {
                        // Belt to `disabled`'s braces: a paste that lands in the
                        // same frame as the first submit never reaches the API.
                        if (verifyingRef.current) return;
                        handleSubmit(onSubmit)().catch(() => {
                          /* onSubmit maps its own errors to form state */
                        });
                      }}
                      disabled={pending}
                      invalid={!!errors.code || !!apiError}
                      shake={otpShake}
                      testId={MFA_TEST_IDS.code}
                      aria-label={t(AUTH_KEYS.mfa.codeLabel)}
                    />
                  )}
                />
              </>
            )}
            {errors.code ? (
              <p id="mfa-code-error" className="text-destructive text-xs" role="alert">
                {translateFormMessage(errors.code.message)}
              </p>
            ) : null}
          </div>

          <div>
            {/* `isLoading`, not just `disabled`: the shared Button renders the
                spinner, sets `disabled` AND `aria-busy` from the one prop. A
                label that only changes to "Verifying..." reads as a dead button
                on a slow connection — nothing on it is moving. */}
            <Button
              type="submit"
              className="w-full"
              isLoading={pending}
              data-testid={MFA_TEST_IDS.submit}
            >
              {pending ? t(AUTH_KEYS.mfa.verifying) : t(AUTH_KEYS.mfa.submit)}
            </Button>
          </div>

          <div className="text-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={pending}
              onClick={() => {
                setValue('useRecoveryCode', !useRecovery);
                setValue('code', '', { shouldValidate: false });
                setApiError(null);
              }}
              data-testid={MFA_TEST_IDS.toggleRecovery}
            >
              {useRecovery
                ? t(AUTH_KEYS.mfa.useAuthenticator)
                : t(AUTH_KEYS.mfa.useRecovery)}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
