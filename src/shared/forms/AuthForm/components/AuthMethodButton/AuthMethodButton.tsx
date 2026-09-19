import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/shared/components/ui/button.tsx';
import {
  type AuthContinuePending,
  authMethodIsDisabled,
  authMethodIsLoading,
} from '@/shared/forms/AuthForm/auth-form-pending.ts';

type ButtonVariant = ComponentProps<typeof Button>['variant'];

type AuthMethodButtonProps = {
  /** Which continue action this button represents (OAuth provider, passkey, email step). */
  target: AuthContinuePending;
  /** The single continue action currently in flight across the whole form (or `null`). */
  pending: AuthContinuePending | null;
  /** Stable label — never swapped while loading; the spinner conveys progress. */
  label: ReactNode;
  /** Leading icon; hidden while the spinner shows so there is never a double icon. */
  icon?: ReactNode;
  /** Required for E2E + a11y selectors. */
  testId: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  className?: string;
  /**
   * Whether this method needs a Turnstile captcha token. When `true`, the button is
   * disabled until a token mints — without a spinner, because no request of its own
   * is in flight. Pair it with `CaptchaGateNotice` so the wait is explained.
   */
  captchaGated?: boolean;
  /** Live captcha readiness — only consulted when `captchaGated`. */
  turnstileReady?: boolean;
  /** Method-specific disable conditions (e.g. invalid form, cooldown, code length). */
  extraDisabled?: boolean;
};

/**
 * The single source of truth for how an auth method button behaves while the
 * form has an action in flight. Every method (OAuth, passkey, email send/verify)
 * renders through this so they stay identical:
 *
 * - **Stable label** — the text never changes; the spinner is the only progress cue.
 * - **One spinner at a time** — only the clicked method spins; the rest are
 *   disabled without a spinner.
 * - **A spinner means a request** — waiting on a captcha token is not this
 *   method loading, so it disables without spinning. `CaptchaGateNotice` explains
 *   the wait in words and offers a retry when the mint stalls.
 *
 * See `docs/reference/unified-auth-flows.md` → "Method button states".
 */
export function AuthMethodButton({
  target,
  pending,
  label,
  icon,
  testId,
  onClick,
  type = 'button',
  variant = 'outline',
  className = 'w-full',
  captchaGated = false,
  turnstileReady = true,
  extraDisabled = false,
}: AuthMethodButtonProps) {
  const loading = authMethodIsLoading(pending, target);
  const captchaBlocking = captchaGated && !turnstileReady;
  // Spin ONLY for this method's own request. A captcha mint used to spin here too,
  // which read as "your click is being processed" when nothing was in flight: after
  // send-code consumed the single-use token, "Verify and continue" sat spinning and
  // greyed out, and typing the code did not clear it (LOGIN-4). The gate still
  // disables the button — it genuinely cannot post without a token — but the reason
  // is now surfaced as text by CaptchaGateNotice instead of a fake progress spinner.
  const spinning = loading;
  const disabled =
    extraDisabled || captchaBlocking || authMethodIsDisabled(pending, target);

  return (
    <Button
      type={type}
      variant={variant}
      className={className}
      disabled={disabled}
      isLoading={spinning}
      onClick={onClick}
      data-testid={testId}
    >
      {spinning ? null : icon}
      {label}
    </Button>
  );
}
