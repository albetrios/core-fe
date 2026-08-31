import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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

export function MfaForm() {
  const { t } = useTranslation(AUTH_NS);
  const [apiError, setApiError] = useState<string | null>(null);
  const [otpShake, setOtpShake] = useState(false);
  /**
   * Synchronous single-flight latch (house rule 1). `isSubmitting` only flips on
   * the next render, so a double-click — or a second `onComplete` from the code
   * boxes — slips through in the frame before it lands. The MFA session token is
   * SINGLE USE: the second request spends a token core-be has already burned, so
   * a duplicate does not just waste a round trip, it fails the login outright.
   */
  const verifyingRef = useRef(false);
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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MfaVerifyInput>({
    resolver: zodResolver(mfaVerifySchema),
    defaultValues: { code: '', useRecoveryCode: false },
  });
  const useRecovery = watch('useRecoveryCode') ?? false;
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
        setOtpShake(true);
        window.setTimeout(() => setOtpShake(false), 450);
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

      <form onSubmit={handleSubmit(onSubmit)}>
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
            <Button
              type="submit"
              className="w-full"
              disabled={pending}
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
