import { useTranslation } from 'react-i18next';

import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import type { CaptchaGateState } from '@/shared/auth/captcha/useCaptchaGate/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { AUTH_FORM_TEST_IDS } from '@/shared/forms/AuthForm/auth-form.constants.ts';

interface CaptchaGateNoticeProps {
  /** Live gate state from `useCaptchaGate()`. */
  gate: CaptchaGateState;
}

/**
 * Explains, in words, why every captcha-gated button on this screen is disabled.
 *
 * Turnstile tokens are single-use, so each public auth POST consumes one and the
 * widget mints another in the background. That wait used to be drawn as a spinner
 * on the method button itself, which claimed the user's click was being processed
 * when nothing was in flight — after send-code, "Verify and continue" sat spinning
 * and greyed out and typing the code did not clear it (LOGIN-4).
 *
 * Renders nothing once a token exists, so the happy path is unchanged. If the mint
 * stalls past {@link CAPTCHA_REMINT_STALL_MS} it becomes an alert with a retry,
 * because a re-mint that never lands is otherwise a dead end.
 */
export function CaptchaGateNotice({ gate }: CaptchaGateNoticeProps) {
  const { t } = useTranslation(AUTH_NS);

  if (gate.ready) return null;

  if (!gate.stalled) {
    return (
      <p
        className="text-muted-foreground text-center text-xs lg:text-start"
        data-testid={AUTH_FORM_TEST_IDS.captchaPreparing}
      >
        {t(AUTH_KEYS.auth.captcha.preparing)}
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="text-muted-foreground flex flex-wrap items-center justify-center gap-1 text-center text-xs lg:justify-start lg:text-start"
      data-testid={AUTH_FORM_TEST_IDS.captchaStalled}
    >
      <span className="text-destructive">{t(AUTH_KEYS.auth.captcha.failed)}</span>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={() => gate.retry()}
        data-testid={AUTH_FORM_TEST_IDS.captchaRetry}
      >
        {t(AUTH_KEYS.auth.captcha.retry)}
      </Button>
    </div>
  );
}
