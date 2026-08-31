import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/shared/api/auth-api.ts';
import { CaptchaSlot } from '@/shared/auth/captcha/CaptchaSlot.tsx';
import { useTurnstileReady } from '@/shared/auth/captcha/useTurnstileReady/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { Mail } from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { notify } from '@/shared/notify/index.ts';

/**
 * App-shell banner shown when the signed-in user's email is not yet verified.
 * Sends a fresh sign-in code via `POST /auth/email/send-code` (public, same flow as `/login`).
 * Renders nothing once verified — or while the session context is still loading.
 */
export function EmailVerificationBanner() {
  const { t } = useTranslation(LAYOUT_NS);
  const { data } = useMeContext();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const turnstileReady = useTurnstileReady();

  if (!data || data.user.isEmailVerified) return null;

  const keys = LAYOUT_KEYS.app.emailVerify;
  const email = data.user.email;

  function resendButtonLabel(): string {
    if (sent) return t(keys.sent);
    if (sending) return t(keys.sending);
    return t(keys.resend);
  }

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      await authApi.emailVerificationCodeSend(email);
      setSent(true);
      notify.success(t(keys.notifySuccess));
    } catch (err) {
      notify.error(mapFrontendError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <output
      data-testid="email-verify-banner"
      className="bg-muted/60 flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-sm sm:px-6"
    >
      <Mail className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-foreground">{t(keys.message)}</span>
      <Button
        variant="outline"
        size="sm"
        className="ms-auto h-7"
        disabled={sending || sent || !turnstileReady}
        isLoading={sending || !turnstileReady}
        onClick={resend}
        data-testid="email-verify-resend"
      >
        {resendButtonLabel()}
      </Button>

      {/* Resend is captcha-gated: when Turnstile escalates, the challenge renders on a
          full row beneath the banner line rather than floating elsewhere. */}
      <CaptchaSlot className="basis-full" testId="email-verify-captcha-slot" />
    </output>
  );
}
