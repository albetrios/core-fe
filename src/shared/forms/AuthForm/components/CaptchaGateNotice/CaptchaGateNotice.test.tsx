import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { CaptchaGateState } from '@/shared/auth/captcha/useCaptchaGate/index.ts';

import { CaptchaGateNotice } from './CaptchaGateNotice.tsx';

const gate = (over: Partial<CaptchaGateState> = {}): CaptchaGateState => ({
  ready: false,
  stalled: false,
  retry: vi.fn(() => true),
  ...over,
});

describe('CaptchaGateNotice', () => {
  it('renders nothing once the gate is ready', () => {
    const { container } = render(<CaptchaGateNotice gate={gate({ ready: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  // LOGIN-4: the wait used to be drawn as a spinner on the method button, which
  // claimed the user's click was being processed while nothing was in flight.
  it('explains the wait in words while a token is minting', () => {
    render(<CaptchaGateNotice gate={gate()} />);
    expect(screen.getByTestId('auth-captcha-preparing')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-captcha-stalled')).not.toBeInTheDocument();
  });

  it('offers a retry once the mint has stalled', async () => {
    const user = userEvent.setup();
    const retry = vi.fn(() => true);
    render(<CaptchaGateNotice gate={gate({ stalled: true, retry })} />);

    const alert = screen.getByTestId('auth-captcha-stalled');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('auth-captcha-preparing')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('auth-captcha-retry'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations in either state', async () => {
    const a = render(<CaptchaGateNotice gate={gate()} />);
    expect(await axe(a.container)).toHaveNoViolations();
    a.unmount();
    const b = render(<CaptchaGateNotice gate={gate({ stalled: true })} />);
    expect(await axe(b.container)).toHaveNoViolations();
  });
});
