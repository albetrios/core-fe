import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuthContinuePending } from '@/shared/forms/AuthForm/auth-form-pending.ts';

import { AuthMethodButton } from './AuthMethodButton.tsx';

const google: AuthContinuePending = { method: 'oauth', provider: 'google' };
const github: AuthContinuePending = { method: 'oauth', provider: 'github' };

function renderButton(props: Partial<Parameters<typeof AuthMethodButton>[0]> = {}) {
  return render(
    <AuthMethodButton
      target={google}
      pending={null}
      label="Continue with Google"
      icon={<svg data-testid="provider-icon" />}
      testId="btn-google"
      {...props}
    />,
  );
}

describe('AuthMethodButton', () => {
  it('shows label + icon and is enabled when nothing is pending', () => {
    renderButton();
    const btn = screen.getByTestId('btn-google');
    expect(btn).toHaveTextContent('Continue with Google');
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByTestId('provider-icon')).toBeInTheDocument();
  });

  it('keeps the label and swaps icon → spinner while this method is in flight', () => {
    renderButton({ pending: google });
    const btn = screen.getByTestId('btn-google');
    expect(btn).toHaveTextContent('Continue with Google');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByTestId('provider-icon')).not.toBeInTheDocument();
  });

  it('disables without a spinner when another method is pending', () => {
    renderButton({ pending: github });
    const btn = screen.getByTestId('btn-google');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn.querySelector('.animate-spin')).toBeNull();
  });

  // LOGIN-4: waiting on a captcha token is not this method loading. It used to
  // spin here, which read as "your click is being processed" while nothing was in
  // flight — after send-code consumed the single-use token, "Verify and continue"
  // sat spinning and greyed out and typing the code did not clear it. The button
  // still disables (it genuinely cannot post without a token); CaptchaGateNotice
  // explains why in words.
  it('disables a captcha-gated button WITHOUT spinning while a token mints', () => {
    renderButton({ captchaGated: true, turnstileReady: false });
    const btn = screen.getByTestId('btn-google');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn.querySelector('.animate-spin')).toBeNull();
  });

  it('still spins for its own in-flight request', () => {
    renderButton({ pending: { method: 'oauth', provider: 'google' } });
    const btn = screen.getByTestId('btn-google');
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('does NOT spin a captcha-gated idle button once another method is pending', () => {
    // Single-use token consumed by the pending method → turnstileReady false —
    // but this idle button must stay disabled without a spinner.
    renderButton({ captchaGated: true, turnstileReady: false, pending: github });
    const btn = screen.getByTestId('btn-google');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn.querySelector('.animate-spin')).toBeNull();
  });

  it('honours extraDisabled (form/cooldown conditions)', () => {
    renderButton({ extraDisabled: true });
    expect(screen.getByTestId('btn-google')).toBeDisabled();
  });
});
