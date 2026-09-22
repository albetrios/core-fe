import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

import { AccountProfilePanel } from './AccountProfilePanel.tsx';

/** The panel renders ProfileForm, which uses `useMutation` (QueryClient). */
function renderQ(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AccountProfilePanel', () => {
  afterEach(() => {
    useAuthStore.setState({ user: undefined });
  });

  it('renders the panel', () => {
    renderQ(<AccountProfilePanel />);
    expect(screen.getByTestId('settings-section-profile')).toBeInTheDocument();
  });

  // Regression: the Job title was hardcoded to '' here, so a saved job title never
  // reloaded (write succeeded, read always blank). It must initialize from the user.
  it('initializes Name and Job title from the saved profile', () => {
    useAuthStore.getState().setUser({
      id: 'usr_regression0123456789x',
      email: 'ada@acme.test',
      role: 'user',
      name: 'Ada Lovelace',
      jobTitle: 'Principal Engineer',
    });

    renderQ(<AccountProfilePanel />);

    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Principal Engineer')).toBeInTheDocument();
  });

  // ── SET-18: a profile that arrives after the panel did ───────────────────

  const LATE_USER = {
    id: 'usr_late00000000000000x',
    email: 'ada@acme.test',
    role: 'user' as const,
    name: 'Ada Lovelace',
    jobTitle: 'Head of Engineering',
  };

  it('fills in when the profile lands after mount', async () => {
    // Regression: the panel snapshotted the user into useState and RHF read
    // defaultValues once, so a session write that arrived a beat later (a
    // proactive refresh re-reads me/context) left an empty form at 0% forever.
    useAuthStore.getState().setUser({
      id: LATE_USER.id,
      email: LATE_USER.email,
      role: 'user',
    });
    renderQ(<AccountProfilePanel />);

    expect(screen.getByTestId('profile-name')).toHaveValue('');
    expect(screen.getByText(/0% complete/i)).toBeInTheDocument();

    act(() => useAuthStore.getState().setUser(LATE_USER));

    await waitFor(() =>
      expect(screen.getByTestId('profile-name')).toHaveValue('Ada Lovelace'),
    );
    expect(screen.getByTestId('profile-job-title')).toHaveValue('Head of Engineering');
    expect(screen.getByText(/100% complete/i)).toBeInTheDocument();
  });

  // ── The Email field (QA-6: reported disabled AND empty) ──────────────────

  it('shows the signed-in address in the disabled Email field', async () => {
    // Email is not editable here — core-be owns it — so the field is disabled.
    // Disabled must not mean blank: a greyed-out box with nothing in it reads as
    // "we lost your address", which is what QA-6 reported seeing.
    useAuthStore.getState().setUser(LATE_USER);

    renderQ(<AccountProfilePanel />);

    const email = screen.getByTestId('profile-email');
    expect(email).toHaveValue('ada@acme.test');
    expect(email).toBeDisabled();
  });

  it('fills the Email in when the session lands after mount', async () => {
    // Same rule as the name/job-title fields above: the panel can mount before
    // the session write, and the address must appear when it arrives rather
    // than being snapshotted as empty.
    useAuthStore.setState({ user: null, isAuthenticated: true, isLoading: false });
    renderQ(<AccountProfilePanel />);

    expect(screen.getByTestId('profile-email')).toHaveValue('');

    act(() => useAuthStore.getState().setUser(LATE_USER));

    await waitFor(() =>
      expect(screen.getByTestId('profile-email')).toHaveValue('ada@acme.test'),
    );
  });

  it('never overwrites what the user has already typed', async () => {
    // The other half of the same rule: a late store write fills an UNTOUCHED
    // form and leaves a touched one alone.
    const user = userEvent.setup();
    useAuthStore.getState().setUser({
      id: LATE_USER.id,
      email: LATE_USER.email,
      role: 'user',
    });
    renderQ(<AccountProfilePanel />);

    await user.type(screen.getByTestId('profile-name'), 'Grace Hopper');
    act(() => useAuthStore.getState().setUser(LATE_USER));

    // A beat later the store says "Ada Lovelace"; the field still says Grace.
    await waitFor(() => expect(screen.getByTestId('profile-job-title')).toHaveValue(''));
    expect(screen.getByTestId('profile-name')).toHaveValue('Grace Hopper');
  });
});
