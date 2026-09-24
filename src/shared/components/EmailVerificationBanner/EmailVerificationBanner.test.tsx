import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmailVerificationBanner } from './EmailVerificationBanner.tsx';

const { useMeContextMock, sendCodeMock } = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  sendCodeMock: vi.fn(),
}));
vi.mock('@/shared/auth/captcha/useTurnstileReady/index.ts', () => ({
  useTurnstileReady: () => true,
}));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
}));
vi.mock('@/shared/api/auth-api.ts', () => ({
  authApi: { emailVerificationCodeSend: sendCodeMock },
}));

const ctx = (isEmailVerified: boolean, email = 'user@example.com') => ({
  data: { user: { isEmailVerified, email } },
});

afterEach(() => vi.resetAllMocks());

describe('EmailVerificationBanner', () => {
  it('renders nothing when the email is verified', () => {
    useMeContextMock.mockReturnValue(ctx(true));
    const { container } = render(<EmailVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the context is loading', () => {
    useMeContextMock.mockReturnValue({ data: undefined });
    const { container } = render(<EmailVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a resend control when unverified and sends a sign-in code', async () => {
    useMeContextMock.mockReturnValue(ctx(false, 'user@example.com'));
    sendCodeMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<EmailVerificationBanner />);
    expect(screen.getByTestId('email-verify-banner')).toBeInTheDocument();

    await user.click(screen.getByTestId('email-verify-resend'));
    await waitFor(() => expect(sendCodeMock).toHaveBeenCalledWith('user@example.com'));
  });

  it('reports a failed me/context rather than rendering nothing (X-1)', () => {
    // "No data" and "failed to load" looked identical here, so an unverified
    // user whose context call failed simply never saw the prompt. The failure
    // now toasts; the banner keeps its own shape rather than becoming an error
    // strip that pushes the page down.
    useMeContextMock.mockReturnValue(ctx(false));
    render(<EmailVerificationBanner />);
    expect(useMeContextMock).toHaveBeenCalledWith({ notifyOnError: true });
    expect(useMeContextMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ throwOnError: true }),
    );
  });

  it('never sends two codes for one double-click', async () => {
    // Both clicks land in the same frame — `disabled={sending}` has not
    // re-rendered yet, so only the synchronous ref can stop the second send.
    useMeContextMock.mockReturnValue(ctx(false, 'user@example.com'));
    sendCodeMock.mockResolvedValue(undefined);

    render(<EmailVerificationBanner />);
    const resend = screen.getByTestId('email-verify-resend');

    act(() => {
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => expect(sendCodeMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendCodeMock).toHaveBeenCalledTimes(1);
  });
});
