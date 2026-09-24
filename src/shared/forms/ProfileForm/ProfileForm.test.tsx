import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const { updateProfile, notifySuccess, notifyError } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

/** ProfileForm uses `useMutation` (QueryClient) but no router — wrap sync. */
function renderQ(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

vi.mock('@/shared/api/auth-api.ts', () => ({ authApi: { updateProfile } }));
vi.mock('@/shared/auth/token.ts', () => ({ getAccessToken: () => 'test-token' }));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

import { ProfileForm } from './ProfileForm.tsx';

describe('ProfileForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateProfile.mockResolvedValue(undefined);
    useAuthStore.getState().setUser({
      id: 'usr_1',
      email: 'jane@example.com',
      role: 'user',
      name: 'Jane',
    });
  });
  afterEach(() => useAuthStore.getState().clearAuth());

  it('renders only the backend-supported fields (name + job title)', () => {
    renderQ(<ProfileForm email="jane@example.com" defaultValues={{ name: 'Jane' }} />);
    expect(screen.getByTestId('profile-name')).toBeInTheDocument();
    expect(screen.getByTestId('profile-job-title')).toBeInTheDocument();
    expect(screen.getByTestId('profile-email')).toBeInTheDocument();
    // Removed — no backend column, so the form no longer pretends to store them.
    expect(screen.queryByTestId('profile-bio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-location')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-timezone')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderQ(
      <ProfileForm email="jane@example.com" defaultValues={{ name: 'Jane' }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  // Regression (F7): the confirm dialog must not open for invalid input — the
  // form validates first, so an over-length name shows its error immediately
  // instead of leaving the confirm open with a Save that silently fails.
  it('validates before opening the confirm dialog', async () => {
    const user = userEvent.setup();
    renderQ(<ProfileForm email="jane@example.com" defaultValues={{ name: 'Jane' }} />);

    await user.clear(screen.getByTestId('profile-name'));
    await user.type(screen.getByTestId('profile-name'), 'X'.repeat(81)); // > max 80

    await user.click(screen.getByTestId('profile-submit'));

    expect(await screen.findByText(/name is too long/i)).toBeInTheDocument();
    expect(screen.queryByTestId('profile-confirm-save')).not.toBeInTheDocument();
  });

  it('persists via the API and refreshes the app-shell name on confirmed save', async () => {
    const user = userEvent.setup();
    renderQ(<ProfileForm email="jane@example.com" defaultValues={{ name: 'Jane' }} />);

    await user.clear(screen.getByTestId('profile-name'));
    await user.type(screen.getByTestId('profile-name'), 'Jane Doe');
    await user.type(screen.getByTestId('profile-job-title'), 'Engineer');
    await user.click(screen.getByTestId('profile-submit')); // opens confirm
    await user.click(await screen.findByTestId('profile-confirm-save'));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        { name: 'Jane Doe', jobTitle: 'Engineer' },
        'test-token',
      ),
    );
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    // The header avatar/greeting source updates immediately.
    expect(useAuthStore.getState().user?.name).toBe('Jane Doe');
  });

  it('surfaces an error and does NOT fake success when the API fails', async () => {
    const user = userEvent.setup();
    updateProfile.mockRejectedValueOnce(new Error('Profile update failed (500)'));
    renderQ(<ProfileForm email="jane@example.com" defaultValues={{ name: 'Jane' }} />);

    await user.type(screen.getByTestId('profile-job-title'), 'Engineer');
    await user.click(screen.getByTestId('profile-submit'));
    await user.click(await screen.findByTestId('profile-confirm-save'));

    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(notifySuccess).not.toHaveBeenCalled();
    // Name in the store is unchanged (nothing persisted).
    expect(useAuthStore.getState().user?.name).toBe('Jane');
  });
});
