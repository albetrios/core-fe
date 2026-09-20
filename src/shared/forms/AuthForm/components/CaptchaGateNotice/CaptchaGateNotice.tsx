import { useTranslation } from 'react-i18next';

import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import type { CaptchaGateState } from '@/shared/auth/captcha/useCaptchaGate/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { AUTH_FORM_TEST_IDS } from '@/shared/forms/AuthForm/auth-form.constants.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';

interface CaptchaGateNoticeProps {
  /** Live gate state from `useCaptchaGate()`. */
  gate: CaptchaGateState;
}

/**
 * Surfaces a captcha mint that has **failed**, with a retry.
 *
 * Turnstile tokens are single-use, so each public auth POST consumes one and the
 * widget mints another in the background. The routine wait is deliberately
 * **silent**: narrating "finishing the security check" on every visit puts the
 * screen's own plumbing in front of the user before they have done anything, and
 * a mint that lands normally needs no commentary. That wait must not be drawn as
 * a spinner on the method button either — that claimed the user's click was being
 * processed when nothing was in flight (LOGIN-4).
 *
 * So this renders nothing while a token is minting, and nothing once one exists.
 * Only when the mint stalls past {@link CAPTCHA_REMINT_STALL_MS} does it become an
 * alert with a retry, because a re-mint that never lands is otherwise a dead end.
 */
export function CaptchaGateNotice({ gate }: CaptchaGateNoticeProps) {
  const { t } = useTranslation(AUTH_NS);

  // Silent until it actually goes wrong — see the note above.
  if (gate.ready || !gate.stalled) return null;

  // Rendered through FormError, the same banner the auth screen already uses for
  // API failures, so every error on this form reads as one thing: tinted card,
  // alert icon, one voice. As loose red text it looked like stray copy rather
  // than the form's own error surface.
  return (
    <FormError
      message={t(AUTH_KEYS.auth.captcha.failed)}
      data-testid={AUTH_FORM_TEST_IDS.captchaStalled}
      action={
        <Button
          type="button"
          variant="link"
          size="sm"
          className="text-destructive h-auto p-0 text-sm underline underline-offset-4"
          onClick={() => gate.retry()}
          data-testid={AUTH_FORM_TEST_IDS.captchaRetry}
        >
          {t(AUTH_KEYS.auth.captcha.retry)}
        </Button>
      }
    />
  );
}
