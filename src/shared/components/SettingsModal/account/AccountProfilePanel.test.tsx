import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

import { AccountProfilePanel } from './AccountProfilePanel.tsx';

const { useMeContextMock, uploadMutate, removeMutate, notifyError } = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  uploadMutate: vi.fn(),
  removeMutate: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
}));
vi.mock('@/shared/hooks/useUserAvatar/index.ts', () => ({
  useUploadUserAvatar: () => ({ isPending: false, mutate: uploadMutate }),
  useRemoveUserAvatar: () => ({ isPending: false, mutate: removeMutate }),
}));
vi.mock('@/shared/notify/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, notify: { success: vi.fn(), error: notifyError } };
});

/** me/context with the given avatar URL (null = no avatar set). */
function meContext(avatarUrl: string | null) {
  return { data: { user: { avatarUrl } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMeContextMock.mockReturnValue(meContext(null));
});

function pickFile(file: File) {
  const input = screen.getByTestId('user-avatar-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

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

describe('AccountProfilePanel — avatar', () => {
  it('shows the initial when no avatar is set', () => {
    useAuthStore.getState().setUser({
      id: 'usr_avatar00000000000000x',
      email: 'ada@acme.test',
      role: 'user',
      name: 'Ada Lovelace',
    });

    renderQ(<AccountProfilePanel />);

    expect(screen.getByTestId('user-avatar-preview')).toHaveTextContent('A');
    // Nothing to remove yet, so the control is absent rather than disabled.
    expect(screen.queryByTestId('user-avatar-remove')).not.toBeInTheDocument();
  });

  // The URL is a short-lived SIGNED read URL, so it must come from the me-context query
  // rather than a value snapshotted into the auth store at sign-in.
  it('renders the signed URL from me-context, not the auth store', () => {
    useAuthStore.getState().setUser({
      id: 'usr_avatar00000000000000x',
      email: 'ada@acme.test',
      role: 'user',
      name: 'Ada Lovelace',
      avatarUrl: 'https://stale.test/from-store.png',
    });
    useMeContextMock.mockReturnValue(meContext('https://signed.test/fresh.png?sig=abc'));

    renderQ(<AccountProfilePanel />);

    const image = screen.getByTestId('user-avatar-preview').querySelector('img');
    expect(image).toHaveAttribute('src', 'https://signed.test/fresh.png?sig=abc');
  });

  it('offers Remove once an avatar exists', () => {
    useMeContextMock.mockReturnValue(meContext('https://signed.test/a.png'));
    renderQ(<AccountProfilePanel />);

    screen.getByTestId('user-avatar-remove').click();

    expect(removeMutate).toHaveBeenCalled();
  });

  it('uploads an accepted image', () => {
    renderQ(<AccountProfilePanel />);

    const file = new File(['bytes'], 'me.png', { type: 'image/png' });
    pickFile(file);

    expect(uploadMutate).toHaveBeenCalledWith(file);
  });

  // core-be rejects SVG outright. Catching it here saves a presign round trip to be told no.
  it('refuses an SVG before it reaches the API', () => {
    renderQ(<AccountProfilePanel />);

    pickFile(new File(['<svg/>'], 'me.svg', { type: 'image/svg+xml' }));

    expect(uploadMutate).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });

  it('refuses a file over the 2 MB ceiling', () => {
    renderQ(<AccountProfilePanel />);

    const tooBig = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(tooBig, 'size', { value: 3 * 1024 * 1024 });
    pickFile(tooBig);

    expect(uploadMutate).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });
});
