import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { AuthUser } from '@/shared/auth/types.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

const { deleteAccount, forceLogout, notifySuccess, notifyError } = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  forceLogout: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

/** AccountPanel uses `useMutation` (QueryClient) but no router — wrap sync. */
function renderQ(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

vi.mock('@/shared/api/auth-api.ts', () => ({ authApi: { deleteAccount } }));
vi.mock('@/shared/auth/token.ts', () => ({ getAccessToken: () => 'test-token' }));
vi.mock('@/shared/auth/service.ts', () => ({ forceLogout }));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import { AccountPanel } from './AccountPanel.tsx';

const USER = { id: 'usr_1', email: 'you@acme.test', role: 'user' } as AuthUser;

describe('AccountPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deleteAccount.mockResolvedValue(undefined);
    useAuthStore.setState({ user: USER });
  });
  afterEach(() => useAuthStore.getState().clearAuth());

  it('renders account info and danger zone from the auth store', () => {
    renderQ(<AccountPanel />);
    expect(screen.getByTestId('settings-section-account')).toBeInTheDocument();
    expect(screen.getByTestId('danger-zone')).toBeInTheDocument();
    expect(screen.getByTestId('account-delete')).toBeInTheDocument();
    expect(screen.getByText('you@acme.test')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderQ(<AccountPanel />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('deletes via DELETE /users/me and tears down the session on confirm', async () => {
    const user = userEvent.setup();
    renderQ(<AccountPanel />);

    await user.click(screen.getByTestId('account-delete'));
    await user.click(await screen.findByTestId('account-delete-confirm'));

    // Real API call — not a fake success toast.
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('test-token'));
    expect(forceLogout).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error and keeps the session when deletion fails', async () => {
    const user = userEvent.setup();
    deleteAccount.mockRejectedValueOnce(new Error('Account deletion failed (500)'));
    renderQ(<AccountPanel />);

    await user.click(screen.getByTestId('account-delete'));
    await user.click(await screen.findByTestId('account-delete-confirm'));

    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(forceLogout).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
