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

  // A captcha the user never started must never take the control away from them:
  // disabled + `pointer-events: none` is a button they cannot press, cannot hover
  // for a reason, and cannot reach by keyboard. The wait now happens inside the
  // click instead (see useCaptchaIntent).
  it('is NOT disabled while a captcha token is still minting', () => {
    renderButton({});
    const btn = screen.getByTestId('btn-google');
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn.querySelector('.animate-spin')).toBeNull();
  });

  it('still spins for its own in-flight request', () => {
    renderButton({ pending: { method: 'oauth', provider: 'google' } });
    const btn = screen.getByTestId('btn-google');
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('does NOT spin an idle button once another method is pending', () => {
    // The pending method owns the spinner; every other button is disabled by the
    // in-flight guard (not by the captcha) and stays still.
    renderButton({ pending: github });
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
