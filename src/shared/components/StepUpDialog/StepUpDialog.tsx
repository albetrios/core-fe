import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/shared/api/auth-api.ts';
import {
  listAuthMethods,
  stepUpWithEmailCode,
  stepUpWithPassword,
  stepUpWithTotp,
} from '@/shared/api/step-up-api.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { TotpCodeInput } from '@/shared/components/TotpCodeInput/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useMfaStatus } from '@/shared/hooks/useMfa/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

type StepUpFactor = 'password' | 'totp' | 'email';

export interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the step-up window opens — re-run the gated action here. */
  onVerified: () => void;
  /**
   * Whether the bootstrap email-code factor may be offered. Destructive
   * mutations (revoke/delete) need a STRONG window core-be only grants for
   * password/TOTP — pass `false` there so the dialog never offers a factor the
   * backend would reject.
   */
  allowEmailCode?: boolean;
}

/**
 * Which factor to ask for: MFA accounts must verify TOTP (core-be rejects
 * their password/email step-up); password accounts re-enter their password;
 * passwordless-no-MFA accounts use the bootstrap email code where allowed.
 */
function resolveFactor(
  mfaEnabled: boolean,
  hasPassword: boolean,
  allowEmailCode: boolean,
): StepUpFactor {
  if (mfaEnabled) return 'totp';
  if (hasPassword) return 'password';
  return allowEmailCode ? 'email' : 'password';
}

/** The input block for the active factor (password / TOTP / email code). */
function StepUpFactorFields({
  factor,
  password,
  onPasswordChange,
  code,
  onCodeChange,
  showPasswordHint,
  email,
  codeSent,
  isSending,
  onResend,
}: {
  factor: StepUpFactor;
  password: string;
  onPasswordChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  showPasswordHint: boolean;
  email: string;
  codeSent: boolean;
  /** A send is in flight — the link must not fire a second email. */
  isSending: boolean;
  onResend: () => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const keys = SETTINGS_KEYS.security.stepUp;

  if (factor === 'password') {
    return (
      <div className="space-y-2">
        <Label htmlFor="step-up-password">{t(keys.passwordLabel)}</Label>
        <Input
          id="step-up-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          data-testid="step-up-password"
        />
        {showPasswordHint ? (
          <p className="text-muted-foreground text-xs">{t(keys.passwordRequired)}</p>
        ) : null}
      </div>
    );
  }

  if (factor === 'totp') {
    return (
      <div className="space-y-2">
        <Label htmlFor="step-up-code">{t(keys.totpLabel)}</Label>
        <TotpCodeInput
          id="step-up-code"
          value={code}
          onChange={onCodeChange}
          testId="step-up-code"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="step-up-code">{t(keys.emailCodeLabel)}</Label>
      <TotpCodeInput
        id="step-up-code"
        value={code}
        onChange={onCodeChange}
        charset="alphanumeric"
        testId="step-up-code"
      />
      {codeSent ? (
        // Only once a send has actually SUCCEEDED: this line used to appear
        // beside "we couldn't send the code", which cannot both be true.
        <p className="text-muted-foreground text-xs" data-testid="step-up-sent-to">
          {t(keys.emailCodeSent, { email })}
        </p>
      ) : null}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        isLoading={isSending}
        onClick={onResend}
        data-testid="step-up-resend"
      >
        {codeSent ? t(keys.resent) : t(keys.resend)}
      </Button>
    </div>
  );
}

/**
 * Re-authentication dialog for core-be's "recent step-up" gate on sensitive
 * credential mutations (MFA enrollment, passkey registration, revokes). Picks
 * the right factor for the account, verifies it, then hands control back via
 * `onVerified` so the caller retries the original action.
 */
export function StepUpDialog({
  open,
  onOpenChange,
  onVerified,
  allowEmailCode = true,
}: StepUpDialogProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const keys = SETTINGS_KEYS.security.stepUp;
  const email = useAuthStore((s) => s.user?.email) ?? '';
  // The WHOLE query: `?? false` reads as "this account has no second factor",
  // which sends an MFA user down the email-code branch — an unnecessary
  // verification email — before the real answer arrives and the field swaps to
  // the TOTP input under their cursor (SET-9).
  const mfaStatus = useMfaStatus();
  const mfaEnabled = mfaStatus.data ?? false;
  const methods = useAppQuery({
    queryKey: ['auth', 'auth-methods'],
    queryFn: listAuthMethods,
    enabled: open,
    staleTime: 60_000,
  });

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sentForOpen = useRef(false);
  /**
   * Synchronous twins of `submitting` / `isSending`. Both buttons are disabled
   * from state, which only lands a render later — a double-press (or Enter held
   * for a beat) fires the handler twice before that. One is a second step-up
   * attempt against a rate-limited endpoint; the other is a second email
   * (SET-9). See agent-os/rules/fe-resilient-interactions.mdc section 1.
   */
  const submittingRef = useRef(false);
  const sendingRef = useRef(false);

  const hasPassword = (methods.data ?? []).some((m) => m.methodType === 'PASSWORD');
  /** Both reads answered — until then the factor is a guess, not a decision. */
  const factorResolved = !(mfaStatus.isPending || methods.isPending);
  const factor = resolveFactor(mfaEnabled, hasPassword, allowEmailCode);
  const passwordlessDeadEnd = factor === 'password' && !hasPassword && factorResolved;

  const sendEmailCode = useCallback(() => {
    if (!email || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    authApi
      .emailVerificationCodeSend(email)
      .then(() => setCodeSent(true))
      // A send that fails is not a code that did not match: say what happened.
      .catch(() => setError(t(keys.sendFailed)))
      .finally(() => {
        sendingRef.current = false;
        setIsSending(false);
      });
  }, [email, keys.sendFailed, t]);

  // Auto-send the email code once per open of the email factor. State setters
  // only run inside the request's async continuation, never synchronously.
  useEffect(() => {
    if (!open) {
      sentForOpen.current = false;
      return;
    }
    // Gated on BOTH reads: sending on a half-known account is the email the
    // user should never have received.
    if (factor === 'email' && !sentForOpen.current && factorResolved) {
      sentForOpen.current = true;
      sendEmailCode();
    }
  }, [open, factor, factorResolved, sendEmailCode]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassword('');
      setCode('');
      setError(null);
      setCodeSent(false);
    }
    onOpenChange(next);
  }

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      if (factor === 'password') await stepUpWithPassword(password);
      else if (factor === 'totp') await stepUpWithTotp(code);
      else await stepUpWithEmailCode(code);
      handleOpenChange(false);
      onVerified();
    } catch {
      setError(t(keys.invalid));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const submitDisabled =
    submitting ||
    !factorResolved ||
    (factor === 'password' ? password.length === 0 : code.length < 6);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="step-up-dialog">
        <DialogHeader>
          <DialogTitle>{t(keys.title)}</DialogTitle>
          <DialogDescription>{t(keys.description)}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {factorResolved ? (
            <StepUpFactorFields
              factor={factor}
              password={password}
              onPasswordChange={setPassword}
              code={code}
              onCodeChange={setCode}
              showPasswordHint={passwordlessDeadEnd}
              email={email}
              codeSent={codeSent}
              isSending={isSending}
              onResend={sendEmailCode}
            />
          ) : (
            <div className="space-y-2" data-testid="step-up-loading">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {/*
            The house error surface (icon + tinted card, `role="alert"`), the
            same one the sign-in form uses — a bare red sentence read as a hint
            under the field rather than as the thing that went wrong (SET-25).
          */}
          <FormError message={error} data-testid="step-up-error" />

          <DialogFooter>
            <Button
              type="submit"
              isLoading={submitting}
              disabled={submitDisabled}
              data-testid="step-up-submit"
            >
              {submitting ? t(keys.verifying) : t(keys.verify)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
