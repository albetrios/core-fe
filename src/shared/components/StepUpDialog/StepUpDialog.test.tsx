import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

const {
  listAuthMethods,
  stepUpWithPassword,
  stepUpWithEmailCode,
  stepUpWithTotp,
  sendCode,
  useMfaStatusMock,
} = vi.hoisted(() => ({
  listAuthMethods: vi.fn(),
  stepUpWithPassword: vi.fn(),
  stepUpWithEmailCode: vi.fn(),
  stepUpWithTotp: vi.fn(),
  sendCode: vi.fn(),
  useMfaStatusMock: vi.fn(),
}));
vi.mock('@/shared/api/step-up-api.ts', () => ({
  listAuthMethods,
  stepUpWithPassword,
  stepUpWithEmailCode,
  stepUpWithTotp,
  isStepUpRequiredError: vi.fn(),
}));
vi.mock('@/shared/api/auth-api.ts', () => ({
  authApi: { emailVerificationCodeSend: sendCode },
}));
vi.mock('@/shared/hooks/useMfa/index.ts', () => ({
  useMfaStatus: useMfaStatusMock,
}));

import { StepUpDialog } from './StepUpDialog.tsx';

function renderDialog(props: Partial<Parameters<typeof StepUpDialog>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onVerified = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <StepUpDialog open onOpenChange={vi.fn()} onVerified={onVerified} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, onVerified };
}

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({
    user: { id: 'usr_1', email: 'you@acme.test', role: 'user' } as never,
    isAuthenticated: true,
  });
  useMfaStatusMock.mockReturnValue({ data: false, isPending: false });
  listAuthMethods.mockResolvedValue([]);
  sendCode.mockResolvedValue({});
});

describe('StepUpDialog', () => {
  it('passwordless-no-MFA: auto-sends the email code and verifies with it', async () => {
    stepUpWithEmailCode.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onVerified } = renderDialog();

    // Email factor resolved → the code is sent to the signed-in address once.
    await waitFor(() => expect(sendCode).toHaveBeenCalledWith('you@acme.test'));
    expect(screen.getByTestId('step-up-sent-to')).toHaveTextContent('you@acme.test');

    await user.type(screen.getByTestId('step-up-code'), 'A1B2C3');
    await user.click(screen.getByTestId('step-up-submit'));

    await waitFor(() => expect(stepUpWithEmailCode).toHaveBeenCalledWith('A1B2C3'));
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('password account: asks for the password and verifies with it', async () => {
    listAuthMethods.mockResolvedValue([{ id: 'am_1', methodType: 'PASSWORD' }]);
    stepUpWithPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onVerified } = renderDialog();

    const field = await screen.findByTestId('step-up-password');
    await user.type(field, 'hunter2');
    await user.click(screen.getByTestId('step-up-submit'));

    await waitFor(() => expect(stepUpWithPassword).toHaveBeenCalledWith('hunter2'));
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('MFA account: verifies a TOTP code via /auth/me/mfa/verify', async () => {
    useMfaStatusMock.mockReturnValue({ data: true, isPending: false });
    stepUpWithTotp.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onVerified } = renderDialog();

    await user.type(await screen.findByTestId('step-up-code'), '123456');
    await user.click(screen.getByTestId('step-up-submit'));

    await waitFor(() => expect(stepUpWithTotp).toHaveBeenCalledWith('123456'));
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('never offers the email code for destructive actions (allowEmailCode=false)', async () => {
    renderDialog({ allowEmailCode: false });
    expect(await screen.findByTestId('step-up-password')).toBeInTheDocument();
    await waitFor(() => expect(listAuthMethods).toHaveBeenCalled());
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('shows an inline error and keeps the dialog open when verification fails', async () => {
    stepUpWithEmailCode.mockRejectedValue(new Error('401'));
    const user = userEvent.setup();
    const { onVerified } = renderDialog();

    await waitFor(() => expect(sendCode).toHaveBeenCalled());
    await user.type(screen.getByTestId('step-up-code'), 'BADCD1');
    await user.click(screen.getByTestId('step-up-submit'));

    expect(await screen.findByTestId('step-up-error')).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  // ── SET-9: no factor is chosen until BOTH reads have answered ─────────────

  it('sends no email while the MFA status is still loading', async () => {
    // Regression: `data ?? false` read as "no second factor", so an MFA user
    // was pushed down the email branch — a verification email they should never
    // have received — and the field then swapped to TOTP under their cursor.
    useMfaStatusMock.mockReturnValue({ data: undefined, isPending: true });
    renderDialog();

    expect(await screen.findByTestId('step-up-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('step-up-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-up-password')).not.toBeInTheDocument();
    expect(sendCode).not.toHaveBeenCalled();
    expect(screen.getByTestId('step-up-submit')).toBeDisabled();
  });

  it('goes straight to the TOTP field once the MFA status lands', async () => {
    useMfaStatusMock.mockReturnValue({ data: true, isPending: false });
    renderDialog();

    expect(await screen.findByTestId('step-up-code')).toBeInTheDocument();
    // The email branch was never entered, so no code was sent.
    expect(sendCode).not.toHaveBeenCalled();
    expect(screen.queryByTestId('step-up-loading')).not.toBeInTheDocument();
  });

  // ── SET-9 (completed): one gesture, one write, and a busy button ─────────

  it('verifies once when the submit is double-pressed', async () => {
    // `disabled={submitting}` only lands a render later, so a fast second press
    // (or Enter held for a beat) fires a SECOND step-up attempt against a
    // rate-limited endpoint. The guard is a ref, so it flips inside the first.
    useMfaStatusMock.mockReturnValue({ data: true, isPending: false });
    let release: (() => void) | undefined;
    stepUpWithTotp.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const user = userEvent.setup();
    renderDialog();

    const input = await screen.findByTestId('step-up-code');
    await user.type(input, '123456');
    const submit = screen.getByTestId('step-up-submit');

    // Both dispatched in ONE act(), before React can re-render the disable.
    act(() => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(stepUpWithTotp).toHaveBeenCalledTimes(1);
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit.querySelector('.animate-spin')).not.toBeNull();

    await act(async () => release?.());
    expect(stepUpWithTotp).toHaveBeenCalledTimes(1);
  });

  it('sends one email when resend is double-clicked', async () => {
    // The same rule on the other write this dialog can start — and this one
    // lands in the user's inbox (SET-9).
    let release: ((value: unknown) => void) | undefined;
    sendCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderDialog();

    const resend = await screen.findByTestId('step-up-resend');
    // The auto-send already fired once for this open.
    expect(sendCode).toHaveBeenCalledTimes(1);

    act(() => {
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Still the auto-send only: a send was already in flight.
    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('step-up-resend')).toHaveAttribute('aria-busy', 'true');

    await act(async () => release?.({}));
  });

  it('says the send failed, not that the code was wrong', async () => {
    // Regression: a failed SEND surfaced "That didn't match. Please try again."
    // — an answer about a code the user has not typed yet.
    sendCode.mockRejectedValue(new Error('smtp down'));
    renderDialog();

    const error = await screen.findByTestId('step-up-error');
    expect(error).toHaveTextContent(/couldn't send/i);
    expect(error).not.toHaveTextContent(/match/i);
  });

  // ── SET-25: a failed SEND does not claim the code was wrong ──────────────

  it('shows the send failure with a resend action, and no "we emailed you" line', async () => {
    // Regression: the send-failure path reused the "that didn't match" copy, and
    // the "We emailed a 6-character code to …" line sat right under it — two
    // statements that cannot both be true.
    sendCode.mockRejectedValue(new Error('smtp down'));
    renderDialog();

    const error = await screen.findByTestId('step-up-error');
    expect(error).toHaveTextContent(/couldn't send/i);
    expect(screen.queryByTestId('step-up-sent-to')).not.toBeInTheDocument();
    // …and the way out is right there.
    expect(screen.getByTestId('step-up-resend')).toBeEnabled();
  });

  it('shows the "we emailed you" line once a send succeeds', async () => {
    renderDialog();

    expect(await screen.findByTestId('step-up-sent-to')).toBeInTheDocument();
  });

  // ── SET-25 (follow-up): the failure uses the house error surface ─────────

  it('shows the failure on the shared error card, not as a bare sentence', async () => {
    // A red line of text under the field reads as a hint. The sign-in form's
    // FormError — tinted card, icon, role="alert" — reads as the thing that
    // went wrong, and it is the surface users already know from that screen.
    sendCode.mockRejectedValue(new Error('smtp down'));
    renderDialog();

    const error = await screen.findByTestId('step-up-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveClass('bg-destructive/10');
    expect(error.querySelector('svg')).not.toBeNull();
  });
});
