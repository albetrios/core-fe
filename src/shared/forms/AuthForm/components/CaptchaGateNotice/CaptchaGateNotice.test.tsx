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

  // The routine mint is silent: it used to narrate "Finishing the security
  // check…" on every visit, putting the screen's plumbing in front of the user
  // before they had done anything. Only a FAILED mint gets to speak.
  it('stays silent while a token is minting', () => {
    const { container } = render(<CaptchaGateNotice gate={gate()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('auth-captcha-stalled')).not.toBeInTheDocument();
  });

  it('offers a retry once the mint has stalled', async () => {
    const user = userEvent.setup();
    const retry = vi.fn(() => true);
    render(<CaptchaGateNotice gate={gate({ stalled: true, retry })} />);

    const alert = screen.getByTestId('auth-captcha-stalled');
    expect(alert).toHaveAttribute('role', 'alert');

    await user.click(screen.getByTestId('auth-captcha-retry'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations when it speaks', async () => {
    const { container } = render(<CaptchaGateNotice gate={gate({ stalled: true })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
