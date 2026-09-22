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
 * - **A spinner means the user's own click is being worked on** — including the
 *   captcha wait that click now absorbs. A captcha is never a reason to disable:
 *   a button the user cannot press, for a check they did not start, is a dead end
 *   they cannot diagnose (and `pointer-events: none` denies them even a tooltip).
 *   The handler takes the click, waits for the token, and shows a challenge only
 *   if one is actually demanded.
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
  extraDisabled = false,
}: AuthMethodButtonProps) {
  const loading = authMethodIsLoading(pending, target);
  // Spin ONLY for this method's own work. The LOGIN-4 complaint was a spinner with
  // nothing in flight — a captcha minting in the background while the user sat idle.
  // That is still not a reason to spin, and it is no longer a reason to disable
  // either: the token wait now happens INSIDE a click, so whenever it runs the user
  // is genuinely waiting on something they started and `pending` covers it.
  const spinning = loading;
  const disabled = extraDisabled || authMethodIsDisabled(pending, target);

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
