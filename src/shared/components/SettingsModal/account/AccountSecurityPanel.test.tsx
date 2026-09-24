import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const {
  useMfaStatusMock,
  beginMutateAsync,
  confirmMutateAsync,
  disableMutateAsync,
  usePasskeysMock,
  registerMutateAsync,
  removePasskeyMutate,
  passkeysCardCrashes,
} = vi.hoisted(() => ({
  useMfaStatusMock: vi.fn(),
  beginMutateAsync: vi.fn(),
  confirmMutateAsync: vi.fn(),
  disableMutateAsync: vi.fn(),
  usePasskeysMock: vi.fn(),
  registerMutateAsync: vi.fn(),
  removePasskeyMutate: vi.fn(),
  /** Per-test switch: make the passkeys CARD throw (nothing else does). */
  passkeysCardCrashes: { value: false },
}));
vi.mock('@/shared/hooks/useMfa/index.ts', () => ({
  useMfaStatus: useMfaStatusMock,
  useBeginMfaEnrollment: () => ({ mutateAsync: beginMutateAsync, isPending: false }),
  useConfirmMfaEnrollment: () => ({ mutateAsync: confirmMutateAsync, isPending: false }),
  useDisableMfa: () => ({ mutateAsync: disableMutateAsync, isPending: false }),
}));
vi.mock('@/shared/hooks/usePasskeys/index.ts', async () => {
  const { useState } = await import('react');
  return {
    usePasskeys: usePasskeysMock,
    useRegisterPasskey: () => ({ mutateAsync: registerMutateAsync, isPending: false }),
    useRemovePasskey: () => {
      // Only the passkeys card calls this hook, so it is the one throw that
      // starts INSIDE that card and nowhere else.
      if (passkeysCardCrashes.value) throw new Error('passkeys card exploded');
      // One instance per ROW now, each with its own pending flag — a frozen
      // `isPending: false` could not tell the two rows apart (SET-24).
      const [isPending, setIsPending] = useState(false);
      return {
        isPending,
        mutateAsync: async (id: string) => {
          setIsPending(true);
          try {
            await removePasskeyMutate(id);
          } finally {
            setIsPending(false);
          }
        },
      };
    },
  };
});
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

import { AccountSecurityPanel } from './AccountSecurityPanel.tsx';

/**
 * Query results shaped the way the panel now reads them. The old mocks returned
 * `{ data }` alone — which is exactly how SET-3 hid: `data ?? false` looks
 * identical whether the answer is "off", "still loading" or "the read failed".
 */
const refetchMfa = vi.fn();
const refetchPasskeys = vi.fn();
const querySuccess = (data: unknown) => ({
  data,
  isSuccess: true,
  isPending: false,
  isError: false,
  isFetching: false,
});
const queryPending = () => ({
  data: undefined,
  isSuccess: false,
  isPending: true,
  isError: false,
  isFetching: true,
});
const queryFailed = (refetch: () => void) => ({
  data: undefined,
  isSuccess: false,
  isPending: false,
  isError: true,
  isFetching: false,
  refetch,
});

beforeEach(() => {
  vi.resetAllMocks();
  useMfaStatusMock.mockReturnValue({ ...querySuccess(false), refetch: refetchMfa });
  beginMutateAsync.mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUri: 'otpauth://totp/Core:you?secret=JBSWY3DPEHPK3PXP&issuer=Core',
  });
  confirmMutateAsync.mockResolvedValue({ recoveryCodes: ['AAAA-1111', 'BBBB-2222'] });
  disableMutateAsync.mockResolvedValue(undefined);
  usePasskeysMock.mockReturnValue({
    ...querySuccess(undefined),
    refetch: refetchPasskeys,
    data: [
      {
        id: 'pk_1',
        name: 'MacBook Touch ID',
        createdAt: '2026-02-10T10:00:00.000Z',
        lastUsedAt: null,
      },
    ],
  });
  registerMutateAsync.mockResolvedValue({ id: 'pk_2', name: 'YubiKey' });
  removePasskeyMutate.mockResolvedValue(undefined);
  passkeysCardCrashes.value = false;
});

describe('AccountSecurityPanel', () => {
  it('renders MFA status + setup + passkeys (sessions moved to their own panel)', () => {
    render(<AccountSecurityPanel />);
    expect(screen.getByTestId('settings-section-security')).toBeInTheDocument();
    expect(screen.getByTestId('security-overview')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-status')).toHaveTextContent('Disabled');
    expect(screen.getByTestId('mfa-setup')).toBeInTheDocument();
    expect(screen.getByTestId('add-passkey')).toBeInTheDocument();
    // the old duplicated sessions card is gone
    expect(screen.queryByTestId('session-s1')).not.toBeInTheDocument();
  });

  it('runs the enrollment flow: QR → code → recovery codes', async () => {
    const user = userEvent.setup();
    render(<AccountSecurityPanel />);
    await user.click(screen.getByTestId('mfa-setup'));
    expect(beginMutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('mfa-secret')).toHaveTextContent('JBSWY3DPEHPK3PXP');
    expect(await screen.findByTestId('mfa-qr')).toBeInTheDocument();
    await user.type(screen.getByTestId('mfa-code'), '123456');
    await waitFor(() => expect(confirmMutateAsync).toHaveBeenCalledWith('123456'));
    expect(await screen.findByTestId('mfa-recovery-codes')).toBeInTheDocument();
    await user.click(screen.getByTestId('recovery-codes-panel-ack'));
    await user.click(screen.getByTestId('mfa-done'));
  });

  it('shows Disable when enabled and confirms disabling', async () => {
    useMfaStatusMock.mockReturnValue({ ...querySuccess(true), refetch: refetchMfa });
    const user = userEvent.setup();
    render(<AccountSecurityPanel />);
    expect(screen.getByTestId('mfa-status')).toHaveTextContent('Enabled');
    await user.click(screen.getByTestId('mfa-disable'));
    await user.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(disableMutateAsync).toHaveBeenCalledTimes(1));
  });

  it('registers a passkey via the add dialog (FE-32)', async () => {
    const user = userEvent.setup();
    render(<AccountSecurityPanel />);
    await user.click(screen.getByTestId('add-passkey'));
    await user.type(await screen.findByTestId('passkey-name'), 'YubiKey');
    await user.click(screen.getByTestId('passkey-add-submit'));
    await waitFor(() => expect(registerMutateAsync).toHaveBeenCalledWith('YubiKey'));
  });

  it('revokes a passkey (FE-32)', async () => {
    const user = userEvent.setup();
    render(<AccountSecurityPanel />);
    await user.click(screen.getByTestId('passkey-remove'));
    await waitFor(() => expect(removePasskeyMutate).toHaveBeenCalledWith('pk_1'));
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<AccountSecurityPanel />);
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── SET-3: a security state is never asserted before it is known ───────────

  it('shows a skeleton, never "Disabled", while the 2FA status is loading', async () => {
    // Regression: `data ?? false` rendered the Disabled badge and a Set-up
    // button on first paint, then flipped to Enabled a moment later.
    useMfaStatusMock.mockReturnValue(queryPending());
    usePasskeysMock.mockReturnValue(queryPending());
    render(<AccountSecurityPanel />);

    expect(screen.getByTestId('mfa-status-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('mfa-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mfa-setup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mfa-disable')).not.toBeInTheDocument();
    // The score is a claim too — it must not be computed from the defaults.
    expect(screen.queryByTestId('security-overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('security-overview-loading')).toBeInTheDocument();
    expect(
      screen
        .getByTestId('security-overview-loading')
        .querySelector('[data-slot="card-title"]'),
    ).toHaveTextContent(/\S/);
  });

  it('reports a failed 2FA read as an error with a retry, not as "off"', async () => {
    const user = userEvent.setup();
    useMfaStatusMock.mockReturnValue(queryFailed(refetchMfa));
    render(<AccountSecurityPanel />);

    expect(screen.getByTestId('mfa-error')).toBeInTheDocument();
    // Never claim a security posture the app could not read.
    expect(screen.queryByTestId('mfa-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mfa-setup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-overview')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('retry-button'));
    expect(refetchMfa).toHaveBeenCalledTimes(1);
  });

  it('reports a failed passkeys read instead of an empty list', async () => {
    // "You have no passkeys" is a claim; a failed read is not evidence for it.
    usePasskeysMock.mockReturnValue(queryFailed(refetchPasskeys));
    render(<AccountSecurityPanel />);

    expect(screen.getByTestId('passkeys-error')).toBeInTheDocument();
    expect(screen.queryByTestId('passkeys-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('passkey-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-overview')).not.toBeInTheDocument();
  });

  it('shows the score only once both reads have landed', async () => {
    render(<AccountSecurityPanel />);
    expect(screen.getByTestId('security-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('security-overview-loading')).not.toBeInTheDocument();
  });

  // ── SET-24: the busy row is the row you pressed ──────────────────────────

  const NOW = '2026-02-10T10:00:00.000Z';

  it('spins only the passkey being removed', async () => {
    // Regression: `disabled={remove.isPending}` is one flag for the whole list,
    // so every row went grey and none of them said which one was going.
    let release: (() => void) | undefined;
    removePasskeyMutate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    // Two passkeys, so "only the pressed one" is observable.
    usePasskeysMock.mockReturnValue({
      ...querySuccess(undefined),
      refetch: refetchPasskeys,
      data: [
        { id: 'pk_1', name: 'MacBook Touch ID', createdAt: NOW, lastUsedAt: null },
        { id: 'pk_2', name: 'YubiKey 5C', createdAt: NOW, lastUsedAt: null },
      ],
    });
    const user = userEvent.setup();
    render(<AccountSecurityPanel />);

    const rows = await screen.findAllByTestId('passkey-remove');
    expect(rows).toHaveLength(2);
    await user.click(rows[0] as HTMLElement);

    const [first, second] = await screen.findAllByTestId('passkey-remove');
    expect(first).toHaveAttribute('aria-busy', 'true');
    expect(first?.querySelector('.animate-spin')).not.toBeNull();
    // The other row is untouched: removing one credential is not a reason to
    // take the rest of the list away (SET-24). Each row owns its own mutation,
    // so its own single-flight guard covers a double-click on ITS button.
    expect(second).toBeEnabled();
    expect(second).not.toHaveAttribute('aria-busy', 'true');
    expect(second?.querySelector('.animate-spin')).toBeNull();

    await act(async () => release?.());
  });

  it('contains a crash in the passkeys card to that card', async () => {
    // Two independent credential features share this panel: a throw in one must
    // leave the other usable.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    passkeysCardCrashes.value = true;
    render(<AccountSecurityPanel />);

    expect(await screen.findByTestId('passkeys-card-error')).toBeInTheDocument();
    // Two-factor management is untouched.
    expect(screen.getByTestId('settings-section-security')).toBeInTheDocument();
    expect(screen.queryByTestId('mfa-card-error')).not.toBeInTheDocument();
    passkeysCardCrashes.value = false;
    consoleError.mockRestore();
  });
});
